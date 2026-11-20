import express from 'express';
import type { User } from '../../src/types/index.ts';
import type { AiTaskType, ApprovalStatus } from './types.ts';
import { oneAiDb } from './db.ts';
import { validateExternalAiBaseUrl } from './crypto.ts';
import { isOneAiAdmin, requireAdminMiddleware } from './quotaAndSecurity.ts';
import { autoActivateReadyEndpoints, probeAndVerifyEndpoint, runGlobalModelDiscovery } from './discovery.ts';
import { runObjectiveBenchmark } from './evaluator.ts';
import { oneAiRouter } from './router.ts';

export function createOneAiAdminRouter(resolveSessionUser: (req: express.Request) => User | undefined) {
  const router = express.Router();

  // Lightweight access check for frontend navbar/hub button visibility (never exposes secrets)
  router.get('/access', (req, res) => {
    const user = resolveSessionUser(req);
    res.json({
      success: true,
      authenticated: Boolean(user),
      isAdmin: isOneAiAdmin(user),
    });
  });

  // Strict RBAC gate for every operational route below
  router.use((req, res, next) => {
    const admin = requireAdminMiddleware(resolveSessionUser, req, res);
    if (!admin) return;
    (req as any).__oneAiAdmin = admin;
    next();
  });

  router.get('/overview', (_req, res) => {
    const metrics = oneAiDb.getOverviewMetrics();
    const providers = oneAiDb.listProviders();
    const policies = oneAiDb.listRoutingPolicies();
    const discoveryRuns = oneAiDb.listDiscoveryRuns(10);
    const recentLedger = oneAiDb.listRecentLedger(25);
    res.json({
      success: true,
      metrics,
      providers,
      policies,
      discoveryRuns,
      recentLedger,
    });
  });

  router.get('/providers', (_req, res) => {
    res.json({ success: true, providers: oneAiDb.listProviders() });
  });

  router.get('/providers-guide', (_req, res) => {
    const providers = oneAiDb.listProviders();
    const metaMap: Record<
      string,
      { envVars: string[]; signupUrl: string; freeTier: string; privacy: string; anonymousReady?: boolean }
    > = {
      kilo: {
        envVars: ['KILO_API_KEY (可选)'],
        signupUrl: 'https://kilo.ai/',
        freeTier: '共享免费池无需密钥即可试跑 (kilo-auto/free, baidu/ernie-5.5-flash-preview:free)',
        privacy: '共享免费池标记 may_train；高隐私任务默认隔离，仅在无私有 Key 时保底',
        anonymousReady: true,
      },
      gemini: {
        envVars: ['GEMINI_API_KEY'],
        signupUrl: 'https://aistudio.google.com/apikey',
        freeTier: 'AI Studio Free Tier + 实时语音 Live API / 多模态引擎',
        privacy: 'Paid Tier 零训练保留；Free Tier 遵循 Google API 条款',
      },
      groq: {
        envVars: ['GROQ_API_KEY'],
        signupUrl: 'https://console.groq.com/keys',
        freeTier: 'Developer Free Tier (~30 RPM / 1K RPD，超低延迟)',
        privacy: '支持 ZDR 零数据保留',
      },
      cerebras: {
        envVars: ['CEREBRAS_API_KEY'],
        signupUrl: 'https://cloud.cerebras.ai/',
        freeTier: '免费极速推理 Tier',
        privacy: '默认 ZDR（零数据保留）',
      },
      openrouter: {
        envVars: ['OPENROUTER_API_KEY'],
        signupUrl: 'https://openrouter.ai/keys',
        freeTier: ':free 聚合通道 (Llama 3.3 / Qwen / DeepSeek 等)',
        privacy: '支持 provider.zdr = true 硬过滤',
      },
      deepseek: {
        envVars: ['DEEPSEEK_API_KEY'],
        signupUrl: 'https://platform.deepseek.com/api_keys',
        freeTier: '新用户赠送额度 + 极低成本按量（已设每日/月预算锁）',
        privacy: '官方直连 API',
      },
      qwen: {
        envVars: ['DASHSCOPE_API_KEY', 'QWEN_API_KEY'],
        signupUrl: 'https://bailian.console.aliyun.com/',
        freeTier: '阿里云百炼新用户免费 Token 额度',
        privacy: '企业 API 不用于训练',
      },
      zhipu: {
        envVars: ['ZHIPU_API_KEY'],
        signupUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
        freeTier: 'glm-4-flash 官方长期免费（受 QPS 限制）',
        privacy: '官方标准隐私策略',
      },
      workers_ai: {
        envVars: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'],
        signupUrl: 'https://dash.cloudflare.com/',
        freeTier: '每日 10,000 Neurons 免费额度',
        privacy: '不用输入输出训练模型 (ZDR)',
      },
      huggingface: {
        envVars: ['HF_TOKEN', 'HUGGINGFACE_API_KEY'],
        signupUrl: 'https://huggingface.co/settings/tokens',
        freeTier: '开源推理免费月度额度',
        privacy: '依赖具体托管方',
      },
    };

    const guide = providers.map((p) => {
      const m = metaMap[p.id] || {
        envVars: [],
        signupUrl: '',
        freeTier: p.notes,
        privacy: p.zdrEnabledAccount ? 'ZDR' : 'Standard',
      };
      const readiness = p.hasApiKey
        ? 'configured_byok'
        : m.anonymousReady
          ? 'active_shared_free'
          : 'missing_key';
      return {
        id: p.id,
        name: p.name,
        billingMode: p.billingMode,
        status: p.status,
        hasApiKey: p.hasApiKey,
        apiKeyMask: p.apiKeyMask,
        readiness,
        freeTierSummary: m.freeTier,
        zdrNote: m.privacy,
        envVarNames: m.envVars,
        ...m,
      };
    });

    res.json({ success: true, guides: guide, guide });
  });

  router.post('/providers', async (req, res) => {
    const admin: User = (req as any).__oneAiAdmin;
    const {
      id,
      name,
      adapterType,
      baseUrl,
      apiKey,
      billingMode,
      allowPaidOverflow,
      dailyUsdCap,
      monthlyUsdCap,
      zdrEnabledAccount,
      status,
      notes,
      accountId,
    } = req.body || {};

    const cleanId = String(id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!cleanId) return res.status(400).json({ success: false, error: 'Provider ID is required' });

    if (baseUrl) {
      const check = validateExternalAiBaseUrl(String(baseUrl));
      if (!check.ok) return res.status(400).json({ success: false, error: check.error });
    }

    oneAiDb.upsertProviderConfig({
      id: cleanId,
      name: name ? String(name).trim() : undefined,
      adapterType,
      baseUrl: baseUrl ? String(baseUrl).trim() : undefined,
      apiKey: typeof apiKey === 'string' && apiKey.trim() !== '' ? apiKey.trim() : undefined,
      billingMode,
      allowPaidOverflow: typeof allowPaidOverflow === 'boolean' ? allowPaidOverflow : undefined,
      dailyUsdCap: dailyUsdCap !== undefined ? Number(dailyUsdCap) : undefined,
      monthlyUsdCap: monthlyUsdCap !== undefined ? Number(monthlyUsdCap) : undefined,
      zdrEnabledAccount: typeof zdrEnabledAccount === 'boolean' ? zdrEnabledAccount : undefined,
      status,
      notes: notes !== undefined ? String(notes) : undefined,
      accountId: accountId !== undefined ? String(accountId) : undefined,
    });

    oneAiDb.recordAdminAudit(admin.id, 'upsert_provider', cleanId, {
      updatedKey: Boolean(apiKey),
      billingMode,
      dailyUsdCap,
      monthlyUsdCap,
      status,
    });

    let activationSummary = null;
    if ((typeof apiKey === 'string' && apiKey.trim() !== '') || cleanId === 'kilo') {
      activationSummary = await autoActivateReadyEndpoints(cleanId, admin.id).catch(() => null);
    }

    res.json({ success: true, providers: oneAiDb.listProviders(), activation: activationSummary });
  });

  router.post('/auto-activate', async (req, res) => {
    const admin: User = (req as any).__oneAiAdmin;
    const providerId = req.body?.providerId ? String(req.body.providerId).trim().toLowerCase() : undefined;
    try {
      const summary = await autoActivateReadyEndpoints(providerId, admin.id);
      oneAiDb.recordAdminAudit(admin.id, 'auto_activate_endpoints', providerId || 'all_ready', {
        probed: summary.probed,
        activated: summary.activated,
        failed: summary.failed,
      });
      res.json({ success: true, ...summary });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Auto-activation failed' });
    }
  });

  router.get('/catalog', (req, res) => {
    const statusFilter = req.query.status ? (String(req.query.status) as ApprovalStatus) : undefined;
    const canonicalModels = oneAiDb.listCanonicalModels();
    const endpoints = oneAiDb.listEndpoints(statusFilter ? { approvalStatus: statusFilter } : undefined);
    const evaluations = oneAiDb.listEvaluations(60);
    res.json({
      success: true,
      canonicalModels,
      endpoints,
      evaluations,
    });
  });

  router.post('/catalog/discover', async (req, res) => {
    const admin: User = (req as any).__oneAiAdmin;
    try {
      const summary = await runGlobalModelDiscovery();
      oneAiDb.recordAdminAudit(admin.id, 'run_discovery', 'global_catalog', {
        totalFetched: summary.totalFetched,
        totalNew: summary.totalNew,
      });
      res.json({ success: true, ...summary });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Discovery failed' });
    }
  });

  router.post('/endpoints/:id/probe', async (req, res) => {
    const admin: User = (req as any).__oneAiAdmin;
    const result = await probeAndVerifyEndpoint(req.params.id, admin.id);
    oneAiDb.recordAdminAudit(admin.id, 'probe_endpoint', req.params.id, {
      ok: result.ok,
      ttftMs: result.ttftMs,
      error: result.error,
    });
    res.json({ success: result.ok, ...result });
  });

  router.post('/endpoints/:id/evaluate', async (req, res) => {
    const admin: User = (req as any).__oneAiAdmin;
    try {
      const evaluation = await runObjectiveBenchmark(req.params.id);
      oneAiDb.recordAdminAudit(admin.id, 'evaluate_endpoint', req.params.id, {
        overallScore: evaluation.overallScore,
        passedCases: evaluation.passedCases,
      });
      res.json({ success: true, evaluation });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err?.message || 'Evaluation failed' });
    }
  });

  router.post('/endpoints/:id/approval', (req, res) => {
    const admin: User = (req as any).__oneAiAdmin;
    const { status, enabled } = req.body || {};
    const valid: ApprovalStatus[] = ['discovered', 'verified', 'evaluated', 'approved', 'rejected', 'retired'];
    if (!valid.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid approval status' });
    }
    const existing = oneAiDb.getEndpoint(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Endpoint not found' });

    oneAiDb.updateEndpointApproval(
      req.params.id,
      status,
      admin.id,
      typeof enabled === 'boolean' ? enabled : status === 'approved'
    );
    oneAiDb.recordAdminAudit(admin.id, `endpoint_${status}`, req.params.id, { enabled });
    res.json({ success: true, endpoint: oneAiDb.getEndpoint(req.params.id) });
  });

  router.post('/endpoints/:id/reset-health', (req, res) => {
    const admin: User = (req as any).__oneAiAdmin;
    const existing = oneAiDb.getEndpoint(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Endpoint not found' });
    oneAiDb.recordEndpointTelemetry(req.params.id, { ok: true });
    oneAiDb.recordAdminAudit(admin.id, 'reset_endpoint_health', req.params.id, {});
    res.json({ success: true, endpoint: oneAiDb.getEndpoint(req.params.id) });
  });

  router.post('/endpoints/:id/merge-canonical', (req, res) => {
    const admin: User = (req as any).__oneAiAdmin;
    const targetCanonicalId = String(req.body?.canonicalId || '').trim();
    if (!targetCanonicalId) return res.status(400).json({ success: false, error: 'canonicalId is required' });
    oneAiDb.reassignEndpointCanonical(req.params.id, targetCanonicalId);
    oneAiDb.recordAdminAudit(admin.id, 'merge_canonical', req.params.id, { targetCanonicalId });
    res.json({ success: true, endpoint: oneAiDb.getEndpoint(req.params.id) });
  });

  router.get('/policies', (_req, res) => {
    res.json({ success: true, policies: oneAiDb.listRoutingPolicies() });
  });

  router.patch('/policies/:taskType', (req, res) => {
    const admin: User = (req as any).__oneAiAdmin;
    const taskType = String(req.params.taskType || '').toUpperCase() as AiTaskType;
    oneAiDb.updateRoutingPolicy(taskType, req.body || {});
    oneAiDb.recordAdminAudit(admin.id, 'update_policy', taskType, req.body || {});
    res.json({ success: true, policy: oneAiDb.getRoutingPolicy(taskType) });
  });

  router.post('/simulate-route', async (req, res) => {
    const admin: User = (req as any).__oneAiAdmin;
    const { prompt = 'Hello', mode = 'general', forceEndpointId } = req.body || {};
    const result = await oneAiRouter.executeUnifiedTurn({
      requestId: `sim_${Date.now()}`,
      userId: admin.id,
      subjectKey: `admin:${admin.id}`,
      userTier: 'admin',
      prompt: String(prompt),
      messages: [{ role: 'user', content: String(prompt) }],
      mode: String(mode),
      stream: false,
      forceEndpointIdForAdminTest: forceEndpointId ? String(forceEndpointId) : undefined,
    });
    oneAiDb.recordAdminAudit(admin.id, 'simulate_route', result.selectedEndpointId || 'none', {
      success: result.success,
      taskType: result.taskType,
      failoverCount: result.failoverCount,
    });
    res.json({ success: result.success, simulation: result });
  });

  router.get('/audit', (_req, res) => {
    res.json({
      success: true,
      ledger: oneAiDb.listRecentLedger(80),
      adminAudit: oneAiDb.listAdminAuditLogs(60),
    });
  });

  return router;
}
