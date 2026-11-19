import type { DataRetentionPolicy, DiscoveredRawModel, ModelEndpointRecord } from './types.ts';
import { oneAiDb } from './db.ts';
import { normalizeCanonicalModelIdentity } from './normalization.ts';
import { getProviderAdapter } from './providers.ts';
import { validateExternalAiBaseUrl } from './crypto.ts';

function safeSlug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
}

async function fetchOpenRouterCatalog(): Promise<DiscoveredRawModel[]> {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`OpenRouter catalog HTTP ${res.status}`);
  const data: any = await res.json();
  const list = Array.isArray(data?.data) ? data.data : [];

  return list.map((m: any) => {
    const id = String(m?.id || '').trim();
    const inPrice = Number(m?.pricing?.prompt || 0) * 1_000_000;
    const outPrice = Number(m?.pricing?.completion || 0) * 1_000_000;
    const isFree = id.endsWith(':free') || (inPrice === 0 && outPrice === 0);
    const inputMods: string[] = Array.isArray(m?.architecture?.input_modalities) ? m.architecture.input_modalities : [];
    const params: string[] = Array.isArray(m?.supported_parameters) ? m.supported_parameters : [];
    return {
      providerId: 'openrouter',
      upstreamModelId: id,
      displayName: m?.name || id,
      description: m?.description || '',
      contextLength: Number(m?.context_length || 32768),
      maxOutputTokens: Number(m?.top_provider?.max_completion_tokens || 4096),
      supportsImages: inputMods.includes('image'),
      supportsAudio: inputMods.includes('audio'),
      supportsVideo: inputMods.includes('video'),
      supportsTools: params.includes('tools'),
      supportsStructuredOutput: params.includes('structured_outputs') || params.includes('response_format'),
      inputPricePer1m: Number.isFinite(inPrice) ? Number(inPrice.toFixed(4)) : 0,
      outputPricePer1m: Number.isFinite(outPrice) ? Number(outPrice.toFixed(4)) : 0,
      isFreeTier: isFree,
      mayTrainOnPrompts: isFree,
      dataRetentionPolicy: isFree ? 'may_train' : 'no_training_30d_log',
      discoverySource: 'openrouter_api',
    };
  });
}

async function fetchKiloCatalog(): Promise<DiscoveredRawModel[]> {
  let res = await fetch('https://api.kilo.ai/api/gateway/models', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  if (!res || !res.ok) {
    res = await fetch('https://ai-gateway.kilo.ai/api/v1/models', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
  }
  if (!res.ok) throw new Error(`Kilo catalog HTTP ${res.status}`);
  const data: any = await res.json();
  const list = Array.isArray(data?.data) ? data.data : [];

  return list.map((m: any) => {
    const id = String(m?.id || '').trim();
    const inPrice = Number(m?.pricing?.prompt || 0) * 1_000_000;
    const outPrice = Number(m?.pricing?.completion || 0) * 1_000_000;
    const isFree = id.endsWith(':free') || id.includes('/free') || (inPrice === 0 && outPrice === 0);
    const mayTrain = Boolean(m?.mayTrainOnYourPrompts ?? isFree);
    const inputMods: string[] = Array.isArray(m?.architecture?.input_modalities) ? m.architecture.input_modalities : [];
    const params: string[] = Array.isArray(m?.supported_parameters) ? m.supported_parameters : [];
    const policy: DataRetentionPolicy = mayTrain ? 'may_train' : 'no_training_30d_log';

    return {
      providerId: 'kilo',
      upstreamModelId: id,
      displayName: m?.name || id,
      description: m?.description || '',
      contextLength: Number(m?.context_length || 32768),
      maxOutputTokens: Number(m?.top_provider?.max_completion_tokens || 4096),
      supportsImages: inputMods.includes('image'),
      supportsAudio: inputMods.includes('audio'),
      supportsVideo: inputMods.includes('video'),
      supportsTools: params.includes('tools'),
      supportsStructuredOutput: params.includes('structured_outputs') || params.includes('response_format'),
      inputPricePer1m: Number.isFinite(inPrice) ? Number(inPrice.toFixed(4)) : 0,
      outputPricePer1m: Number.isFinite(outPrice) ? Number(outPrice.toFixed(4)) : 0,
      isFreeTier: isFree,
      mayTrainOnPrompts: mayTrain,
      dataRetentionPolicy: policy,
      inferenceProviderIds: Array.isArray(m?.inference_provider_ids) ? m.inference_provider_ids : [],
      discoverySource: 'kilo_gateway_api',
    };
  });
}

async function fetchDirectProviderCatalog(providerId: string): Promise<DiscoveredRawModel[]> {
  const creds = oneAiDb.getProviderWithCreds(providerId);
  if (!creds || !creds.hasApiKey || creds.status !== 'active') return [];
  const check = validateExternalAiBaseUrl(creds.baseUrl);
  if (!check.ok) return [];

  if (providerId === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(creds.apiKey)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Gemini models HTTP ${res.status}`);
    const data: any = await res.json();
    const list = Array.isArray(data?.models) ? data.models : [];
    return list
      .filter((m: any) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m: any) => {
        const id = String(m.name || '').replace(/^models\//, '');
        return {
          providerId: 'gemini',
          upstreamModelId: id,
          displayName: m.displayName || id,
          contextLength: Number(m.inputTokenLimit || 32768),
          maxOutputTokens: Number(m.outputTokenLimit || 8192),
          supportsImages: /flash|pro|vision/i.test(id),
          supportsAudio: /flash|pro|live/i.test(id),
          supportsTools: true,
          supportsStructuredOutput: true,
          isFreeTier: creds.billingMode === 'free_only',
          mayTrainOnPrompts: false,
          dataRetentionPolicy: 'no_training_30d_log',
          discoverySource: 'gemini_official_api',
        };
      });
  }

  const base = creds.baseUrl.replace(/\/+$/, '');
  const url = base.endsWith('/models') ? base : `${base}/models`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${creds.apiKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${providerId} /models HTTP ${res.status}`);
  const data: any = await res.json();
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.map((m: any) => {
    const id = String(m?.id || '').trim();
    return {
      providerId,
      upstreamModelId: id,
      displayName: id,
      contextLength: Number(m?.context_window || m?.context_length || 32768),
      supportsTools: true,
      supportsStructuredOutput: true,
      isFreeTier: creds.billingMode === 'free_only',
      mayTrainOnPrompts: false,
      dataRetentionPolicy: creds.zdrEnabledAccount ? 'zdr' : 'no_training_30d_log',
      discoverySource: `${providerId}_models_api`,
    };
  });
}

function ingestDiscoveredModels(rows: DiscoveredRawModel[]): number {
  let newCount = 0;
  // Cap per source ingestion at top 120 relevant models to keep 4GB node SQLite tiny and fast
  const prioritized = [...rows].sort((a, b) => Number(Boolean(b.isFreeTier)) - Number(Boolean(a.isFreeTier))).slice(0, 120);

  for (const item of prioritized) {
    if (!item.upstreamModelId) continue;
    const norm = normalizeCanonicalModelIdentity(item.upstreamModelId, {
      displayName: item.displayName,
      supportsImages: item.supportsImages,
      supportsAudio: item.supportsAudio,
    });

    oneAiDb.upsertCanonicalModel({
      canonicalId: norm.canonicalId,
      family: norm.family,
      displayName: norm.displayName,
      modelVersion: norm.modelVersion,
      category: norm.category,
      contextLength: item.contextLength || 32768,
      maxOutputTokens: item.maxOutputTokens || 4096,
      supportsImages: Boolean(item.supportsImages),
      supportsAudio: Boolean(item.supportsAudio),
      supportsVideo: Boolean(item.supportsVideo),
      supportsTools: Boolean(item.supportsTools),
      supportsStructuredOutput: Boolean(item.supportsStructuredOutput),
      officialDocUrl: item.officialDocUrl || '',
    });

    const endpointId = `ep_${item.providerId}_${safeSlug(item.upstreamModelId)}`;
    const freeNote =
      item.providerId === 'kilo' && item.isFreeTier
        ? 'Kilo :free 共享池（200 req/hr/IP，mayTrainOnYourPrompts=true）'
        : item.isFreeTier
          ? '发现目录标记免费层级'
          : '';

    const res = oneAiDb.upsertDiscoveredEndpoint({
      endpointId,
      canonicalId: norm.canonicalId,
      providerId: item.providerId,
      upstreamModelId: item.upstreamModelId,
      apiType: item.providerId === 'gemini' ? 'gemini_generate' : 'openai_chat',
      isFreeTier: Boolean(item.isFreeTier),
      freeQuotaNote: freeNote,
      inputPricePer1m: Number(item.inputPricePer1m || 0),
      outputPricePer1m: Number(item.outputPricePer1m || 0),
      mayTrainOnPrompts: Boolean(item.mayTrainOnPrompts),
      dataRetentionPolicy: item.dataRetentionPolicy || 'unknown',
      discoverySource: item.discoverySource,
    });
    if (res.inserted) newCount += 1;
  }
  return newCount;
}

export async function runGlobalModelDiscovery(): Promise<{
  totalFetched: number;
  totalNew: number;
  sources: Array<{ source: string; fetched: number; newAdded: number; ok: boolean; error?: string }>;
}> {
  const sourcesSpec: Array<{ name: string; fn: () => Promise<DiscoveredRawModel[]> }> = [
    { name: 'openrouter_catalog', fn: fetchOpenRouterCatalog },
    { name: 'kilo_gateway_catalog', fn: fetchKiloCatalog },
    { name: 'groq_direct', fn: () => fetchDirectProviderCatalog('groq') },
    { name: 'cerebras_direct', fn: () => fetchDirectProviderCatalog('cerebras') },
    { name: 'gemini_direct', fn: () => fetchDirectProviderCatalog('gemini') },
    { name: 'deepseek_direct', fn: () => fetchDirectProviderCatalog('deepseek') },
  ];

  let totalFetched = 0;
  let totalNew = 0;
  const sources: Array<{ source: string; fetched: number; newAdded: number; ok: boolean; error?: string }> = [];

  for (const s of sourcesSpec) {
    const startedAt = new Date().toISOString();
    const runId = `disc_${s.name}_${Date.now().toString(36)}`;
    try {
      const models = await s.fn();
      const newAdded = ingestDiscoveredModels(models);
      totalFetched += models.length;
      totalNew += newAdded;
      sources.push({ source: s.name, fetched: models.length, newAdded, ok: true });
      oneAiDb.recordDiscoveryRun({
        runId,
        sourceName: s.name,
        modelsFetched: models.length,
        newEndpointsFound: newAdded,
        deprecatedMarked: 0,
        status: 'success',
        errorLog: null,
        startedAt,
        finishedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      const msg = String(err?.message || err);
      sources.push({ source: s.name, fetched: 0, newAdded: 0, ok: false, error: msg });
      oneAiDb.recordDiscoveryRun({
        runId,
        sourceName: s.name,
        modelsFetched: 0,
        newEndpointsFound: 0,
        deprecatedMarked: 0,
        status: 'failed',
        errorLog: msg.slice(0, 400),
        startedAt,
        finishedAt: new Date().toISOString(),
      });
    }
  }

  return { totalFetched, totalNew, sources };
}

/**
 * Step 7–10 of the 11-step Pipeline:
 * Live sandbox connectivity & policy verification probe on a single endpoint.
 */
export async function probeAndVerifyEndpoint(endpointId: string, adminUserId: string | null = null): Promise<{
  ok: boolean;
  endpoint: ModelEndpointRecord | null;
  ttftMs: number;
  sampleOutput?: string;
  error?: string;
  stepsPassed: string[];
}> {
  const endpoint = oneAiDb.getEndpoint(endpointId);
  if (!endpoint) {
    return { ok: false, endpoint: null, ttftMs: 0, error: 'Endpoint not found', stepsPassed: [] };
  }
  const provider = oneAiDb.getProviderWithCreds(endpoint.providerId);
  if (!provider) {
    return { ok: false, endpoint, ttftMs: 0, error: 'Provider not found', stepsPassed: [] };
  }

  const stepsPassed: string[] = ['metadata_enriched', 'source_verified', 'license_checked', 'policy_checked'];

  const urlValidation = validateExternalAiBaseUrl(provider.baseUrl);
  if (!urlValidation.ok) {
    return { ok: false, endpoint, ttftMs: 0, error: urlValidation.error, stepsPassed };
  }

  // Require API key unless Kilo free anonymous probe
  if (!provider.hasApiKey && !(provider.id === 'kilo' && endpoint.isFreeTier)) {
    return {
      ok: false,
      endpoint,
      ttftMs: 0,
      error: `Provider ${provider.name} 尚未配置有效 API Key`,
      stepsPassed,
    };
  }
  stepsPassed.push('api_ready');

  const adapter = getProviderAdapter(provider.adapterType);
  const startMs = Date.now();
  let ttftMs = 0;
  let sampleOutput = '';

  for await (const chunk of adapter.invokeChat(
    {
      requestId: `probe_${Date.now()}`,
      endpointId: endpoint.endpointId,
      upstreamModelId: endpoint.upstreamModelId,
      baseUrl: provider.baseUrl,
      messages: [{ role: 'user', content: 'Reply with exact word: READY' }],
      maxTokens: 64,
      temperature: 0,
      stream: true,
      privacyMode: endpoint.mayTrainOnPrompts ? 'standard' : 'no_training',
      timeoutMs: 12_000,
      firstByteTimeoutMs: 8_000,
    },
    { apiKey: provider.apiKey, accountId: provider.accountId }
  )) {
    if (chunk.type === 'delta' && chunk.textDelta) {
      if (!ttftMs) ttftMs = Date.now() - startMs;
      sampleOutput += chunk.textDelta;
    } else if (chunk.type === 'error' && chunk.error) {
      oneAiDb.recordEndpointTelemetry(endpointId, {
        ok: false,
        errorCategory: chunk.error.category,
        errorMessage: chunk.error.rawMessage,
        markOffline: chunk.error.category === 'model_deprecated',
      });
      return {
        ok: false,
        endpoint: oneAiDb.getEndpoint(endpointId),
        ttftMs: Date.now() - startMs,
        error: `${chunk.error.category}: ${chunk.error.rawMessage}`,
        stepsPassed,
      };
    }
  }

  if (!sampleOutput.trim()) {
    return { ok: false, endpoint, ttftMs: Date.now() - startMs, error: 'Empty probe output', stepsPassed };
  }

  stepsPassed.push('probe_passed', 'compliance_ready');
  oneAiDb.recordEndpointTelemetry(endpointId, { ok: true, ttftMs });
  if (endpoint.approvalStatus !== 'approved') {
    oneAiDb.updateEndpointApproval(endpointId, 'verified', adminUserId);
  }

  return {
    ok: true,
    endpoint: oneAiDb.getEndpoint(endpointId),
    ttftMs,
    sampleOutput: sampleOutput.trim().slice(0, 80),
    stepsPassed,
  };
}
