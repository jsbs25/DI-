import type {
  AiTaskType,
  CanonicalModelRecord,
  ErrorCategory,
  ModelEndpointRecord,
  NormalizedProviderError,
  PrivacyMode,
  ProviderRecord,
  RoutingPolicyRecord,
  UnifiedMessage,
  UnifiedToolSpec,
  UserTier,
} from './types.ts';
import { oneAiDb } from './db.ts';
import { classifyAiTask } from './classifier.ts';
import { estimateEndpointCostUsd, getProviderAdapter } from './providers.ts';
import { getTierPolicy } from './quotaAndSecurity.ts';

export interface RouteExecuteParams {
  requestId: string;
  idempotencyKey?: string;
  userId?: string | null;
  subjectKey: string;
  userTier: UserTier;
  prompt: string;
  messages: UnifiedMessage[];
  mode?: string;
  explicitPrivacyMode?: PrivacyMode;
  hasPrivateMemoryContext?: boolean;
  tools?: UnifiedToolSpec[];
  requiresStructuredOutput?: boolean;
  temperature?: number;
  maxTokens?: number;
  stream: boolean;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
  forceEndpointIdForAdminTest?: string;
}

export interface RouteExecuteResult {
  success: boolean;
  content: string;
  taskType: AiTaskType;
  privacyMode: PrivacyMode;
  selectedEndpointId: string | null;
  selectedCanonicalId: string | null;
  selectedProviderId: string | null;
  failoverCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  ttftMs: number;
  totalMs: number;
  errorCategory?: ErrorCategory;
  errorMessage?: string;
}

interface ScoredCandidate {
  endpoint: ModelEndpointRecord;
  canonical: CanonicalModelRecord;
  provider: ProviderRecord & { apiKey: string; accountId?: string };
  score: number;
}

const DEFAULT_COOLDOWN_MS_BY_ERR: Record<ErrorCategory, number> = {
  auth_invalid: 30 * 60 * 1000,
  quota_exhausted: 6 * 60 * 60 * 1000,
  rate_limited: 25 * 1000,
  model_deprecated: 24 * 60 * 60 * 1000,
  context_overflow: 0,
  content_filtered: 0,
  timeout: 45 * 1000,
  upstream_5xx: 60 * 1000,
  schema_invalid: 15 * 1000,
  network_error: 30 * 1000,
};

export class OneAiRouterEngine {
  public hasAnyUsableEngine(): boolean {
    const endpoints = oneAiDb.listEndpoints({ approvalStatus: 'approved' });
    const now = Date.now();
    for (const ep of endpoints) {
      if (!ep.enabled || ep.healthStatus === 'offline' || ep.cooldownUntil > now) continue;
      const prov = oneAiDb.getProviderWithCreds(ep.providerId);
      if (!prov || prov.status !== 'active') continue;
      if (!prov.hasApiKey && !(prov.id === 'kilo' && ep.isFreeTier)) continue;
      if (oneAiDb.isProviderWithinBudget(prov.id).ok) return true;
    }
    return false;
  }

  public selectCandidates(input: {
    taskType: AiTaskType;
    privacyMode: PrivacyMode;
    estimatedInputTokens: number;
    hasImages: boolean;
    requiresTools: boolean;
    requiresStructuredOutput: boolean;
    userTier: UserTier;
    forceEndpointId?: string;
  }): { policy: RoutingPolicyRecord; candidates: ScoredCandidate[] } {
    const policy = oneAiDb.getRoutingPolicy(input.taskType);
    const tierLimits = getTierPolicy(input.userTier);
    const allowPaid = tierLimits.allowPaid && policy.allowPaidEndpoints;
    const now = Date.now();

    const canonicalMap = new Map<string, CanonicalModelRecord>();
    for (const cm of oneAiDb.listCanonicalModels()) {
      canonicalMap.set(cm.canonicalId, cm);
    }

    const endpoints = oneAiDb.listEndpoints({ approvalStatus: 'approved' });
    const scored: ScoredCandidate[] = [];

    for (const ep of endpoints) {
      if (input.forceEndpointId && ep.endpointId !== input.forceEndpointId) continue;
      if (!ep.enabled || ep.healthStatus === 'offline') continue;
      if (ep.cooldownUntil > now && !input.forceEndpointId) continue;

      const canonical = canonicalMap.get(ep.canonicalId);
      if (!canonical) continue;

      const prov = oneAiDb.getProviderWithCreds(ep.providerId);
      if (!prov || prov.status !== 'active') continue;
      if (!prov.hasApiKey && !(prov.id === 'kilo' && ep.isFreeTier)) continue;

      // Zero-surprise budget cap lock
      const budgetCheck = oneAiDb.isProviderWithinBudget(prov.id);
      if (!budgetCheck.ok) continue;

      // Tier & billing filter
      const isPaidEndpoint =
        !ep.isFreeTier &&
        (ep.inputPricePer1m > 0 || ep.outputPricePer1m > 0) &&
        prov.billingMode !== 'free_only';
      if (isPaidEndpoint && !allowPaid && !input.forceEndpointId) continue;
      if (isPaidEndpoint && prov.billingMode === 'free_only' && !prov.allowPaidOverflow) continue;

      // Privacy Policy hard filter
      if (input.privacyMode === 'strict_zdr') {
        if (ep.mayTrainOnPrompts) continue;
        if (ep.dataRetentionPolicy !== 'zdr' && ep.dataRetentionPolicy !== 'no_training_30d_log') continue;
      } else if (input.privacyMode === 'no_training') {
        if (ep.mayTrainOnPrompts) continue;
      }

      // Context & Modality hard filters
      if (canonical.contextLength < Math.max(policy.minContextLength, input.estimatedInputTokens + 1024)) continue;
      if ((input.hasImages || policy.requiresVision) && !canonical.supportsImages) continue;
      if ((input.requiresTools || policy.requiresTools) && !canonical.supportsTools) continue;
      if ((input.requiresStructuredOutput || policy.requiresStructuredOutput) && !canonical.supportsStructuredOutput) continue;

      // Multi-dimensional dynamic scoring [0..100]
      const qualityScore = Math.min(100, Math.max(10, ep.qualityScore));
      const costPer1m = ep.isFreeTier ? 0 : ep.inputPricePer1m * 0.3 + ep.outputPricePer1m * 0.7;
      const costScore = ep.isFreeTier ? 100 : Math.max(5, 100 - Math.min(95, costPer1m * 10));
      const latencyScore = Math.max(5, 100 - Math.min(95, (ep.avgTtftMs / 3500) * 100));
      const healthScore =
        ep.healthStatus === 'healthy'
          ? Math.max(40, 100 - ep.consecutiveFailures * 15)
          : ep.healthStatus === 'degraded'
            ? 35
            : 20;

      const familyBonus = policy.preferredFamilies.includes(canonical.family) ? 8 : 0;
      const zdrBonus = input.privacyMode === 'strict_zdr' && ep.dataRetentionPolicy === 'zdr' ? 10 : 0;

      const totalScore =
        policy.weightQuality * qualityScore +
        policy.weightCost * costScore +
        policy.weightLatency * latencyScore +
        policy.weightHealth * healthScore +
        familyBonus +
        zdrBonus;

      scored.push({ endpoint: ep, canonical, provider: prov, score: totalScore });
    }

    scored.sort((a, b) => b.score - a.score);
    return { policy, candidates: scored.slice(0, 3) };
  }

  public async executeUnifiedTurn(params: RouteExecuteParams): Promise<RouteExecuteResult> {
    const startTotal = Date.now();
    const classification = classifyAiTask({
      prompt: params.prompt,
      messages: params.messages,
      mode: params.mode,
      explicitPrivacyMode: params.explicitPrivacyMode,
      requiresTools: Boolean(params.tools && params.tools.length > 0),
      requiresStructuredOutput: params.requiresStructuredOutput,
      userAuthenticated: Boolean(params.userId),
      hasPrivateMemoryContext: params.hasPrivateMemoryContext,
    });

    const { policy, candidates } = this.selectCandidates({
      taskType: classification.taskType,
      privacyMode: classification.privacyMode,
      estimatedInputTokens: classification.estimatedInputTokens,
      hasImages: classification.hasImages,
      requiresTools: classification.requiresTools,
      requiresStructuredOutput: classification.requiresStructuredOutput,
      userTier: params.userTier,
      forceEndpointId: params.forceEndpointIdForAdminTest,
    });

    const fallbackIds = candidates.map((c) => c.endpoint.endpointId);

    if (candidates.length === 0) {
      const totalMs = Date.now() - startTotal;
      oneAiDb.recordUsageLedger({
        requestId: params.requestId,
        idempotencyKey: params.idempotencyKey || null,
        userId: params.subjectKey,
        userTier: params.userTier,
        taskType: classification.taskType,
        privacyMode: classification.privacyMode,
        selectedEndpointId: null,
        fallbackChainJson: '[]',
        failoverCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        ttftMs: 0,
        totalMs,
        status: 'failed',
        errorCategory: 'quota_exhausted',
        createdAt: new Date().toISOString(),
      });
      return {
        success: false,
        content: '',
        taskType: classification.taskType,
        privacyMode: classification.privacyMode,
        selectedEndpointId: null,
        selectedCanonicalId: null,
        selectedProviderId: null,
        failoverCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        ttftMs: 0,
        totalMs,
        errorCategory: 'quota_exhausted',
        errorMessage: '暂无符合当前隐私与配额策略的已审批可用模型节点。',
      };
    }

    let failoverCount = 0;
    let lastError: NormalizedProviderError | null = null;

    for (let idx = 0; idx < candidates.length; idx++) {
      if (params.signal?.aborted) {
        const abortErr = new Error('Turn aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      const cand = candidates[idx];
      const adapter = getProviderAdapter(cand.provider.adapterType);
      const attemptStart = Date.now();
      let ttftMs = 0;
      let firstByteCommitted = false;
      let collectedText = '';
      let inputTokens = classification.estimatedInputTokens;
      let outputTokens = 0;
      let attemptError: NormalizedProviderError | null = null;

      try {
        for await (const chunk of adapter.invokeChat(
          {
            requestId: params.requestId,
            endpointId: cand.endpoint.endpointId,
            upstreamModelId: cand.endpoint.upstreamModelId,
            baseUrl: cand.provider.baseUrl,
            messages: params.messages,
            tools: params.tools,
            responseFormat: params.requiresStructuredOutput ? { type: 'json_object' } : undefined,
            temperature: params.temperature,
            maxTokens: params.maxTokens,
            stream: params.stream && Boolean(params.onDelta),
            privacyMode: classification.privacyMode,
            timeoutMs: 35_000,
            firstByteTimeoutMs: policy.maxFirstByteTimeoutMs,
            signal: params.signal,
          },
          { apiKey: cand.provider.apiKey, accountId: cand.provider.accountId }
        )) {
          if (chunk.type === 'delta' && chunk.textDelta) {
            if (!firstByteCommitted) {
              firstByteCommitted = true;
              ttftMs = Date.now() - attemptStart;
            }
            collectedText += chunk.textDelta;
            params.onDelta?.(chunk.textDelta);
          } else if (chunk.type === 'usage' && chunk.usage) {
            if (chunk.usage.inputTokens > 0) inputTokens = chunk.usage.inputTokens;
            if (chunk.usage.outputTokens > 0) outputTokens = chunk.usage.outputTokens;
          } else if (chunk.type === 'error' && chunk.error) {
            attemptError = chunk.error;
            break;
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || params.signal?.aborted) {
          throw err;
        }
        attemptError = {
          category: 'network_error',
          retryableBeforeFirstByte: !firstByteCommitted,
          rawMessage: String(err?.message || err),
        };
      }

      if (!attemptError && collectedText.trim()) {
        const finalOutTokens = outputTokens || Math.max(1, Math.ceil(collectedText.length / 2.6));
        const costUsd = estimateEndpointCostUsd(cand.endpoint, inputTokens, finalOutTokens);
        const totalMs = Date.now() - startTotal;
        const estTps = totalMs > ttftMs ? (finalOutTokens / ((totalMs - ttftMs) / 1000)) : cand.endpoint.avgTps;

        oneAiDb.recordEndpointTelemetry(cand.endpoint.endpointId, {
          ok: true,
          ttftMs: ttftMs || totalMs,
          tps: Number(Math.min(1200, Math.max(1, estTps)).toFixed(1)),
          toolSuccess: classification.requiresTools ? true : undefined,
        });
        oneAiDb.recordProviderSpend(cand.provider.id, costUsd);
        oneAiDb.recordUsageLedger({
          requestId: params.requestId,
          idempotencyKey: params.idempotencyKey || null,
          userId: params.subjectKey,
          userTier: params.userTier,
          taskType: classification.taskType,
          privacyMode: classification.privacyMode,
          selectedEndpointId: cand.endpoint.endpointId,
          fallbackChainJson: JSON.stringify(fallbackIds),
          failoverCount,
          inputTokens,
          outputTokens: finalOutTokens,
          estimatedCostUsd: costUsd,
          ttftMs: ttftMs || totalMs,
          totalMs,
          status: failoverCount > 0 ? 'degraded' : 'success',
          errorCategory: null,
          createdAt: new Date().toISOString(),
        });

        return {
          success: true,
          content: collectedText,
          taskType: classification.taskType,
          privacyMode: classification.privacyMode,
          selectedEndpointId: cand.endpoint.endpointId,
          selectedCanonicalId: cand.canonical.canonicalId,
          selectedProviderId: cand.provider.id,
          failoverCount,
          inputTokens,
          outputTokens: finalOutTokens,
          totalTokens: inputTokens + finalOutTokens,
          estimatedCostUsd: costUsd,
          ttftMs: ttftMs || totalMs,
          totalMs,
        };
      }

      // Handle failure & circuit-breaker cooldown
      lastError = attemptError || {
        category: 'upstream_5xx',
        retryableBeforeFirstByte: !firstByteCommitted,
        rawMessage: 'Empty completion output',
      };

      const cooldownMs =
        lastError.retryAfterMs || DEFAULT_COOLDOWN_MS_BY_ERR[lastError.category] || 30_000;

      oneAiDb.recordEndpointTelemetry(cand.endpoint.endpointId, {
        ok: false,
        errorCategory: lastError.category,
        errorMessage: lastError.rawMessage,
        cooldownMs,
        markOffline: lastError.category === 'model_deprecated',
      });

      // CRITICAL STREAMING SAFETY:
      // Once first byte has already streamed to client, NEVER silently stitch another model's words mid-reply.
      if (firstByteCommitted || !lastError.retryableBeforeFirstByte) {
        break;
      }

      failoverCount += 1;
    }

    const totalMs = Date.now() - startTotal;
    oneAiDb.recordUsageLedger({
      requestId: params.requestId,
      idempotencyKey: params.idempotencyKey || null,
      userId: params.subjectKey,
      userTier: params.userTier,
      taskType: classification.taskType,
      privacyMode: classification.privacyMode,
      selectedEndpointId: candidates[0]?.endpoint.endpointId || null,
      fallbackChainJson: JSON.stringify(fallbackIds),
      failoverCount,
      inputTokens: classification.estimatedInputTokens,
      outputTokens: 0,
      estimatedCostUsd: 0,
      ttftMs: 0,
      totalMs,
      status: 'failed',
      errorCategory: lastError?.category || 'upstream_5xx',
      createdAt: new Date().toISOString(),
    });

    return {
      success: false,
      content: '',
      taskType: classification.taskType,
      privacyMode: classification.privacyMode,
      selectedEndpointId: candidates[0]?.endpoint.endpointId || null,
      selectedCanonicalId: candidates[0]?.canonical.canonicalId || null,
      selectedProviderId: candidates[0]?.provider.id || null,
      failoverCount,
      inputTokens: classification.estimatedInputTokens,
      outputTokens: 0,
      totalTokens: classification.estimatedInputTokens,
      estimatedCostUsd: 0,
      ttftMs: 0,
      totalMs,
      errorCategory: lastError?.category || 'upstream_5xx',
      errorMessage: lastError?.rawMessage || 'All candidate AI endpoints failed.',
    };
  }
}

export const oneAiRouter = new OneAiRouterEngine();
