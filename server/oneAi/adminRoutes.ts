import express from 'express';
import type { User } from '../../src/types/index.ts';
import type { AiTaskType, ApprovalStatus } from './types.ts';
import { oneAiDb } from './db.ts';
import { validateExternalAiBaseUrl } from './crypto.ts';
import { isOneAiAdmin, requireAdminMiddleware } from './quotaAndSecurity.ts';
import { probeAndVerifyEndpoint, runGlobalModelDiscovery } from './discovery.ts';
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

  router.post('/providers', (req, res) => {
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

    res.json({ success: true, providers: oneAiDb.listProviders() });
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
