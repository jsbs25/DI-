import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  FlaskConical,
  KeyRound,
  Layers,
  Play,
  RefreshCw,
  Shield,
  Sliders,
  X,
  XCircle,
} from 'lucide-react';

interface OneAiAdminConsoleProps {
  isZh: boolean;
  onClose: () => void;
}

type AdminTab = 'overview' | 'providers' | 'catalog' | 'policies' | 'audit';

export const OneAiAdminConsole: React.FC<OneAiAdminConsoleProps> = ({ isZh, onClose }) => {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBanner, setActionBanner] = useState<string | null>(null);

  const [metrics, setMetrics] = useState<any>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [canonicalModels, setCanonicalModels] = useState<any[]>([]);
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [discoveryRuns, setDiscoveryRuns] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [adminAudit, setAdminAudit] = useState<any[]>([]);
  const [providersGuide, setProvidersGuide] = useState<any[]>([]);

  const [catalogFilter, setCatalogFilter] = useState<string>('all');
  const [discovering, setDiscovering] = useState(false);
  const [busyEndpointId, setBusyEndpointId] = useState<string | null>(null);

  // Provider edit form
  const [editingProvider, setEditingProvider] = useState<any | null>(null);
  const [provKeyInput, setProvKeyInput] = useState('');
  const [provBillingMode, setProvBillingMode] = useState<'free_only' | 'capped_prepaid'>('free_only');
  const [provDailyCap, setProvDailyCap] = useState('0');
  const [provMonthlyCap, setProvMonthlyCap] = useState('0');
  const [provZdr, setProvZdr] = useState(false);
  const [provStatus, setProvStatus] = useState<'active' | 'paused'>('active');

  // Route simulator
  const [simPrompt, setSimPrompt] = useState('用 TypeScript 写一个二分查找并分析时间复杂度');
  const [simResult, setSimResult] = useState<any | null>(null);
  const [simRunning, setSimRunning] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ovRes, catRes, audRes, guideRes] = await Promise.all([
        fetch('/api/admin/ai/overview'),
        fetch('/api/admin/ai/catalog'),
        fetch('/api/admin/ai/audit'),
        fetch('/api/admin/ai/providers-guide'),
      ]);
      if (!ovRes.ok) {
        const d = await ovRes.json().catch(() => ({}));
        throw new Error(d?.error || `HTTP ${ovRes.status}`);
      }
      const ov = await ovRes.json();
      const cat = await catRes.json();
      const aud = await audRes.json();
      const gd = guideRes.ok ? await guideRes.json().catch(() => ({})) : {};
      setMetrics(ov.metrics || null);
      setProviders(Array.isArray(ov.providers) ? ov.providers : []);
      setPolicies(Array.isArray(ov.policies) ? ov.policies : []);
      setDiscoveryRuns(Array.isArray(ov.discoveryRuns) ? ov.discoveryRuns : []);
      setCanonicalModels(Array.isArray(cat.canonicalModels) ? cat.canonicalModels : []);
      setEndpoints(Array.isArray(cat.endpoints) ? cat.endpoints : []);
      setLedger(Array.isArray(aud.ledger) ? aud.ledger : []);
      setAdminAudit(Array.isArray(aud.adminAudit) ? aud.adminAudit : []);
      setProvidersGuide(Array.isArray(gd.guides) ? gd.guides : []);
    } catch (err: any) {
      setError(err?.message || '无法加载 ONE AI 管理数据');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const notify = (msg: string) => {
    setActionBanner(msg);
    setTimeout(() => setActionBanner(null), 4000);
  };

  const handleOpenEditProvider = (p: any) => {
    setEditingProvider(p);
    setProvKeyInput('');
    setProvBillingMode(p.billingMode || 'free_only');
    setProvDailyCap(String(p.dailyUsdCap ?? 0));
    setProvMonthlyCap(String(p.monthlyUsdCap ?? 0));
    setProvZdr(Boolean(p.zdrEnabledAccount));
    setProvStatus(p.status || 'active');
  };

  const handleSaveProvider = async () => {
    if (!editingProvider) return;
    try {
      const res = await fetch('/api/admin/ai/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingProvider.id,
          apiKey: provKeyInput.trim() || undefined,
          billingMode: provBillingMode,
          allowPaidOverflow: false,
          dailyUsdCap: Number(provDailyCap) || 0,
          monthlyUsdCap: Number(provMonthlyCap) || 0,
          zdrEnabledAccount: provZdr,
          status: provStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || '保存失败');
      setEditingProvider(null);
      notify(isZh ? `已加密更新 ${editingProvider.name} 配置与预算硬锁` : `Updated ${editingProvider.name}`);
      await loadAll();
    } catch (err: any) {
      notify(err?.message || '更新失败');
    }
  };

  const handleDiscoverNow = async () => {
    setDiscovering(true);
    try {
      const res = await fetch('/api/admin/ai/catalog/discover', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || '发现任务失败');
      notify(
        isZh
          ? `发现完成：扫描 ${data.totalFetched} 个模型，新增 ${data.totalNew} 个待验证接入渠道`
          : `Discovered ${data.totalFetched} models (${data.totalNew} new)`
      );
      await loadAll();
    } catch (err: any) {
      notify(err?.message || '发现失败');
    } finally {
      setDiscovering(false);
    }
  };

  const handleProbeEndpoint = async (endpointId: string) => {
    setBusyEndpointId(endpointId);
    try {
      const res = await fetch(`/api/admin/ai/endpoints/${encodeURIComponent(endpointId)}/probe`, { method: 'POST' });
      const data = await res.json();
      notify(
        data.ok
          ? `探针通过 (${data.ttftMs}ms): ${data.sampleOutput || 'READY'}`
          : `探针失败: ${data.error || '不可用'}`
      );
      await loadAll();
    } catch (err: any) {
      notify(err?.message || '探针异常');
    } finally {
      setBusyEndpointId(null);
    }
  };

  const handleEvaluateEndpoint = async (endpointId: string) => {
    setBusyEndpointId(endpointId);
    try {
      const res = await fetch(`/api/admin/ai/endpoints/${encodeURIComponent(endpointId)}/evaluate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || '评测失败');
      const ev = data.evaluation;
      notify(`黄金基准评测完成：总分 ${ev.overallScore}/100 (${ev.passedCases}/${ev.totalCases} 题通过，平均 ${ev.avgTtftMs}ms)`);
      await loadAll();
    } catch (err: any) {
      notify(err?.message || '评测异常');
    } finally {
      setBusyEndpointId(null);
    }
  };

  const handleApprovalChange = async (endpointId: string, status: 'approved' | 'rejected' | 'retired') => {
    setBusyEndpointId(endpointId);
    try {
      const res = await fetch(`/api/admin/ai/endpoints/${encodeURIComponent(endpointId)}/approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, enabled: status === 'approved' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || '操作失败');
      notify(`接入渠道状态已变更为: ${status}`);
      await loadAll();
    } catch (err: any) {
      notify(err?.message || '操作失败');
    } finally {
      setBusyEndpointId(null);
    }
  };

  const handleResetHealth = async (endpointId: string) => {
    setBusyEndpointId(endpointId);
    try {
      const res = await fetch(`/api/admin/ai/endpoints/${encodeURIComponent(endpointId)}/reset-health`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || '重置健康状态失败');
      notify('已手动清除冷却并恢复节点健康状态');
      await loadAll();
    } catch (err: any) {
      notify(err?.message || '重置失败');
    } finally {
      setBusyEndpointId(null);
    }
  };

  const handleUpdatePolicy = async (taskType: string, patch: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/admin/ai/policies/${encodeURIComponent(taskType)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        notify(`已更新任务 ${taskType} 路由策略`);
        await loadAll();
      }
    } catch {}
  };

  const handleRunSimulation = async () => {
    if (!simPrompt.trim()) return;
    setSimRunning(true);
    try {
      const res = await fetch('/api/admin/ai/simulate-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: simPrompt }),
      });
      const data = await res.json();
      setSimResult(data.simulation || data);
      await loadAll();
    } catch (err: any) {
      setSimResult({ success: false, errorMessage: err?.message });
    } finally {
      setSimRunning(false);
    }
  };

  const groupedCatalog = useMemo(() => {
    const filtered = endpoints.filter((ep) => catalogFilter === 'all' || ep.approvalStatus === catalogFilter);
    const byCanonical = new Map<string, any[]>();
    for (const ep of filtered) {
      if (!byCanonical.has(ep.canonicalId)) byCanonical.set(ep.canonicalId, []);
      byCanonical.get(ep.canonicalId)!.push(ep);
    }
    const canonMap = new Map(canonicalModels.map((c) => [c.canonicalId, c]));
    return Array.from(byCanonical.entries()).map(([canonicalId, eps]) => ({
      canonicalId,
      canonical: canonMap.get(canonicalId),
      endpoints: eps,
    }));
  }, [endpoints, canonicalModels, catalogFilter]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-md sm:p-6">
      <div className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#0b1322] text-slate-900 dark:text-slate-100 shadow-2xl">
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400">
              <Shield className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                {isZh ? 'ONE AI 全球智能调度管理控制台' : 'ONE AI Global Control Plane'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isZh
                  ? '管理员专用 · AES-256-GCM 密钥库 / 跨平台去重目录 / 11步准入与零意外扣费锁'
                  : 'Admin Only · Encrypted Vault / Canonical Catalog / Zero-Surprise Billing Lock'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadAll()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/15 px-3 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-white/5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              {isZh ? '刷新' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 dark:border-white/10 px-5 py-2 text-xs">
          {[
            { id: 'overview', label: isZh ? '运行概览与路由演练' : 'Overview', icon: Activity },
            { id: 'providers', label: isZh ? '服务商与预算锁' : 'Providers & Caps', icon: KeyRound },
            { id: 'catalog', label: isZh ? '全球模型发现与审批' : 'Discovery & Approval', icon: Layers },
            { id: 'policies', label: isZh ? '15类任务调度矩阵' : 'Task Policies (A-O)', icon: Sliders },
            { id: 'audit', label: isZh ? '账本与安全审计' : 'Ledger & Audit', icon: Database },
          ].map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id as AdminTab)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 font-medium transition ${
                  active
                    ? 'bg-sky-500/15 text-sky-500'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>

        {actionBanner && (
          <div className="border-b border-sky-500/20 bg-sky-500/10 px-5 py-2 text-xs text-sky-400">
            {actionBanner}
          </div>
        )}
        {error && (
          <div className="border-b border-rose-500/20 bg-rose-500/10 px-5 py-2 text-xs text-rose-400">
            {error}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'overview' && metrics && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  { label: isZh ? '今日调度请求' : 'Today Requests', val: metrics.todayRequests },
                  { label: isZh ? '今日成功数' : 'Today Success', val: metrics.todaySuccess },
                  { label: isZh ? '自动故障切换' : 'Failovers', val: metrics.todayFailovers },
                  { label: isZh ? '平均首字延迟' : 'Avg TTFT', val: `${metrics.avgTtftMs} ms` },
                  { label: isZh ? '今日估算花费' : 'Today Cost', val: `$${metrics.todayCostUsd}` },
                  {
                    label: isZh ? '已审批在线端点' : 'Approved / Total',
                    val: `${metrics.endpoints.approved} / ${metrics.endpoints.total}`,
                  },
                ].map((card, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] p-3.5">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{card.label}</div>
                    <div className="mt-1 font-mono text-lg font-semibold">{card.val}</div>
                  </div>
                ))}
              </div>

              {/* Route Simulator */}
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Play className="h-4 w-4 text-sky-400" />
                  {isZh ? '智能调度沙盒实测（实时检验任务分类、ZDR 隐私过滤与 Failover）' : 'Live Router Simulation'}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={simPrompt}
                    onChange={(e) => setSimPrompt(e.target.value)}
                    className="h-10 flex-1 rounded-xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#0f1829] px-3 text-sm outline-none"
                    placeholder={isZh ? '输入测试提示词...' : 'Enter test prompt...'}
                  />
                  <button
                    type="button"
                    disabled={simRunning}
                    onClick={() => void handleRunSimulation()}
                    className="h-10 rounded-xl bg-sky-600 px-4 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                  >
                    {simRunning ? (isZh ? '调度中...' : 'Running...') : (isZh ? '执行实时路由测试' : 'Run Route Test')}
                  </button>
                </div>
                {simResult && (
                  <div className="mt-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 p-3 font-mono text-xs">
                    <div>
                      status: {simResult.success ? 'SUCCESS' : 'FAILED'} | taskType: {simResult.taskType} | privacy: {simResult.privacyMode} | endpoint: {simResult.selectedEndpointId || 'none'} | failovers: {simResult.failoverCount} | ttft: {simResult.ttftMs}ms
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-slate-600 dark:text-slate-300">
                      {simResult.content || simResult.errorMessage}
                    </div>
                  </div>
                )}
              </div>

              {/* Discovery Runs */}
              <div>
                <h3 className="mb-2 text-sm font-medium">{isZh ? '最近全局发现拉取记录' : 'Recent Discovery Runs'}</h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-white/[0.04] text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Source</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Fetched</th>
                        <th className="px-3 py-2">New</th>
                        <th className="px-3 py-2">Finished</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                      {discoveryRuns.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-4 text-center text-slate-400">
                            {isZh ? '尚无手动/定时发现记录，可在“全球模型发现与审批”一键触发' : 'No discovery runs yet.'}
                          </td>
                        </tr>
                      ) : (
                        discoveryRuns.map((r) => (
                          <tr key={r.runId}>
                            <td className="px-3 py-2 font-mono">{r.sourceName}</td>
                            <td className="px-3 py-2">{r.status}</td>
                            <td className="px-3 py-2">{r.modelsFetched}</td>
                            <td className="px-3 py-2">{r.newEndpointsFound}</td>
                            <td className="px-3 py-2 text-slate-400">{new Date(r.finishedAt).toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === 'providers' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {providers.map((p) => (
                  <div key={p.id} className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{p.name}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${p.hasApiKey ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                            {p.hasApiKey ? p.apiKeyMask : isZh ? '未配密钥' : 'No Key'}
                          </span>
                          {p.zdrEnabledAccount && (
                            <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-400">ZDR</span>
                          )}
                        </div>
                        <div className="mt-1 font-mono text-[11px] text-slate-400">{p.baseUrl}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenEditProvider(p)}
                        className="rounded-lg border border-slate-200 dark:border-white/15 px-2.5 py-1 text-xs hover:bg-slate-200 dark:hover:bg-white/10"
                      >
                        {isZh ? '配置密钥与锁' : 'Configure'}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{p.notes}</p>
                    <div className="mt-3 flex flex-wrap gap-3 border-t border-slate-200 dark:border-white/10 pt-2 text-[11px] font-mono text-slate-400">
                      <span>mode: {p.billingMode}</span>
                      <span>day: ${p.currentDaySpendUsd.toFixed(4)} / ${p.dailyUsdCap}</span>
                      <span>month: ${p.currentMonthSpendUsd.toFixed(4)} / ${p.monthlyUsdCap}</span>
                      <span>status: {p.status}</span>
                    </div>
                  </div>
                ))}
              </div>

              {providersGuide.length > 0 && (
                <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">
                      {isZh ? '全球免费额度与 API 接入向导（仅管理员可见）' : 'Global Free-Tier & API Readiness Guide'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {isZh
                        ? 'Kilo 免密公共免费池已开箱可用；配置官方免费 Key 后将自动解锁 ZDR 零留存保护与高速多节点热备。'
                        : 'Kilo shared free pool works out-of-the-box; add official free BYOK keys for ZDR & multi-provider failover.'}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                    {providersGuide.map((g) => (
                      <div key={g.id} className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f1829] p-3 text-xs space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{g.name}</span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              g.readiness === 'configured_byok'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : g.readiness === 'active_shared_free'
                                ? 'bg-sky-500/15 text-sky-400'
                                : 'bg-amber-500/15 text-amber-400'
                            }`}
                          >
                            {g.readiness === 'configured_byok'
                              ? isZh ? '已配置密钥' : 'BYOK Ready'
                              : g.readiness === 'active_shared_free'
                              ? isZh ? '免密免费池在线' : 'Free Pool Active'
                              : isZh ? '待补充密钥' : 'Missing Key'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-300">{g.freeTierSummary}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{g.zdrNote}</div>
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[10px] font-mono text-slate-400">
                          <span>env: {Array.isArray(g.envVarNames) ? g.envVarNames.join(' / ') : ''}</span>
                          <a
                            href={g.signupUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-400 hover:underline font-sans"
                          >
                            {isZh ? '官方申请入口 ↗' : 'Console ↗'}
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {editingProvider && (
                <div className="rounded-xl border border-sky-500/40 bg-sky-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      {isZh ? `配置 ${editingProvider.name}（密钥将经 AES-256-GCM 加密存库）` : `Configure ${editingProvider.name}`}
                    </span>
                    <button onClick={() => setEditingProvider(null)} className="text-xs text-slate-400">关闭</button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="block space-y-1 text-xs">
                      <span className="text-slate-400">API Key（留空表示保留原密钥）</span>
                      <input
                        type="password"
                        value={provKeyInput}
                        onChange={(e) => setProvKeyInput(e.target.value)}
                        placeholder={editingProvider.apiKeyMask}
                        className="h-9 w-full rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-[#0f1829] px-2.5 text-xs"
                      />
                    </label>
                    <label className="block space-y-1 text-xs">
                      <span className="text-slate-400">计费模式（零意外扣费锁）</span>
                      <select
                        value={provBillingMode}
                        onChange={(e) => setProvBillingMode(e.target.value as any)}
                        className="h-9 w-full rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-[#0f1829] px-2 text-xs"
                      >
                        <option value="free_only">free_only（严禁付费调用）</option>
                        <option value="capped_prepaid">capped_prepaid（受预算硬上限保护）</option>
                      </select>
                    </label>
                    <label className="block space-y-1 text-xs">
                      <span className="text-slate-400">渠道状态</span>
                      <select
                        value={provStatus}
                        onChange={(e) => setProvStatus(e.target.value as any)}
                        className="h-9 w-full rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-[#0f1829] px-2 text-xs"
                      >
                        <option value="active">active（启用）</option>
                        <option value="paused">paused（暂停）</option>
                      </select>
                    </label>
                    <label className="block space-y-1 text-xs">
                      <span className="text-slate-400">每日预算硬上限 (USD)</span>
                      <input
                        type="number"
                        step="0.1"
                        value={provDailyCap}
                        onChange={(e) => setProvDailyCap(e.target.value)}
                        className="h-9 w-full rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-[#0f1829] px-2.5 text-xs"
                      />
                    </label>
                    <label className="block space-y-1 text-xs">
                      <span className="text-slate-400">每月预算硬上限 (USD)</span>
                      <input
                        type="number"
                        step="1"
                        value={provMonthlyCap}
                        onChange={(e) => setProvMonthlyCap(e.target.value)}
                        className="h-9 w-full rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-[#0f1829] px-2.5 text-xs"
                      />
                    </label>
                    <label className="flex items-center gap-2 pt-5 text-xs">
                      <input type="checkbox" checked={provZdr} onChange={(e) => setProvZdr(e.target.checked)} />
                      <span>已在该平台控制台开启 ZDR 零数据保留</span>
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSaveProvider()}
                    className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white hover:bg-sky-500"
                  >
                    保存加密配置
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'catalog' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {[
                    { id: 'all', label: '全部' },
                    { id: 'approved', label: '已批准上线' },
                    { id: 'discovered', label: '新发现待验证' },
                    { id: 'verified', label: '探针通过待审批' },
                    { id: 'evaluated', label: '已评测待审批' },
                    { id: 'rejected', label: '已拒绝' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setCatalogFilter(f.id)}
                      className={`rounded-lg px-2.5 py-1 ${catalogFilter === f.id ? 'bg-sky-600 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500'}`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={discovering}
                  onClick={() => void handleDiscoverNow()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${discovering ? 'animate-spin' : ''}`} />
                  {discovering ? '正在拉取 OpenRouter / Kilo / 直连目录...' : '立即执行全球模型发现'}
                </button>
              </div>

              <div className="space-y-3">
                {groupedCatalog.map((group) => (
                  <div key={group.canonicalId} className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] p-3.5">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Cpu className="h-4 w-4 text-sky-400" />
                        <span className="font-semibold text-sm">{group.canonical?.displayName || group.canonicalId}</span>
                        <span className="font-mono text-[11px] text-slate-400">{group.canonicalId}</span>
                        {group.canonical && (
                          <span className="rounded bg-slate-200 dark:bg-white/10 px-1.5 py-0.5 text-[10px]">
                            {Math.round(group.canonical.contextLength / 1024)}K ctx · {group.canonical.licenseType}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400">{group.endpoints.length} 个接入渠道</span>
                    </div>

                    <div className="space-y-2">
                      {group.endpoints.map((ep) => (
                        <div key={ep.endpointId} className="flex flex-col gap-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f1829] p-2.5 text-xs lg:flex-row lg:items-center lg:justify-between">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono font-semibold text-sky-400">[{ep.providerId}]</span>
                              <span className="font-mono">{ep.upstreamModelId}</span>
                              <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                                ep.approvalStatus === 'approved' ? 'bg-emerald-500/15 text-emerald-400' :
                                ep.approvalStatus === 'rejected' || ep.approvalStatus === 'retired' ? 'bg-rose-500/15 text-rose-400' :
                                'bg-amber-500/15 text-amber-400'
                              }`}>
                                {ep.approvalStatus}
                              </span>
                              <span className={`rounded px-1.5 py-0.5 text-[10px] ${ep.healthStatus === 'healthy' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                {ep.healthStatus}
                              </span>
                              {ep.isFreeTier && <span className="rounded bg-teal-500/15 px-1.5 py-0.5 text-[10px] text-teal-400">FREE</span>}
                              {ep.mayTrainOnPrompts && (
                                <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-400">
                                  <AlertTriangle className="h-3 w-3" /> mayTrain
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              TTFT: {ep.avgTtftMs}ms · Quality: {ep.qualityScore}/100 · Retention: {ep.dataRetentionPolicy} · ${ep.inputPricePer1m}/${ep.outputPricePer1m} per 1M
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              disabled={busyEndpointId === ep.endpointId}
                              onClick={() => void handleProbeEndpoint(ep.endpointId)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/15 px-2.5 py-1 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-50"
                            >
                              <Activity className="h-3 w-3" /> 探针
                            </button>
                            <button
                              type="button"
                              disabled={busyEndpointId === ep.endpointId}
                              onClick={() => void handleEvaluateEndpoint(ep.endpointId)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/15 px-2.5 py-1 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-50"
                            >
                              <FlaskConical className="h-3 w-3" /> 黄金评测
                            </button>
                            {ep.approvalStatus !== 'approved' && (
                              <button
                                type="button"
                                disabled={busyEndpointId === ep.endpointId}
                                onClick={() => void handleApprovalChange(ep.endpointId, 'approved')}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-white hover:bg-emerald-500 disabled:opacity-50"
                              >
                                <CheckCircle2 className="h-3 w-3" /> 批准上线
                              </button>
                            )}
                            {ep.healthStatus !== 'healthy' && (
                              <button
                                type="button"
                                disabled={busyEndpointId === ep.endpointId}
                                onClick={() => void handleResetHealth(ep.endpointId)}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-500 hover:bg-amber-500/20 disabled:opacity-50"
                              >
                                <RefreshCw className="h-3 w-3" /> 恢复健康
                              </button>
                            )}
                            {ep.approvalStatus === 'approved' && (
                              <button
                                type="button"
                                disabled={busyEndpointId === ep.endpointId}
                                onClick={() => void handleApprovalChange(ep.endpointId, 'retired')}
                                className="inline-flex items-center gap-1 rounded-lg bg-rose-600/80 px-2.5 py-1 text-white hover:bg-rose-500 disabled:opacity-50"
                              >
                                <XCircle className="h-3 w-3" /> 下线
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'policies' && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-white/[0.04] text-slate-500">
                  <tr>
                    <th className="px-3 py-2">任务类别</th>
                    <th className="px-3 py-2">质量权重</th>
                    <th className="px-3 py-2">成本权重</th>
                    <th className="px-3 py-2">延迟权重</th>
                    <th className="px-3 py-2">隐私要求</th>
                    <th className="px-3 py-2">允许付费节点</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                  {policies.map((pol) => (
                    <tr key={pol.taskType}>
                      <td className="px-3 py-2">
                        <span className="mr-2 rounded bg-sky-500/15 px-1.5 py-0.5 font-mono text-sky-400">{pol.taskType}</span>
                        <span>{pol.labelZh}</span>
                      </td>
                      <td className="px-3 py-2 font-mono">{pol.weightQuality}</td>
                      <td className="px-3 py-2 font-mono">{pol.weightCost}</td>
                      <td className="px-3 py-2 font-mono">{pol.weightLatency}</td>
                      <td className="px-3 py-2">
                        <select
                          value={pol.defaultPrivacyMode}
                          onChange={(e) => void handleUpdatePolicy(pol.taskType, { defaultPrivacyMode: e.target.value })}
                          className="rounded border border-slate-200 dark:border-white/15 bg-white dark:bg-[#0f1829] px-1.5 py-1 text-xs"
                        >
                          <option value="strict_zdr">strict_zdr</option>
                          <option value="no_training">no_training</option>
                          <option value="standard">standard</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={pol.allowPaidEndpoints}
                          onChange={(e) => void handleUpdatePolicy(pol.taskType, { allowPaidEndpoints: e.target.checked })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'audit' && (
            <div className="space-y-6">
              <div>
                <h3 className="mb-2 text-sm font-medium">最近路由账本 (ai_usage_ledger)</h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-white/[0.04] text-slate-500">
                      <tr>
                        <th className="px-3 py-2">时间</th>
                        <th className="px-3 py-2">用户/等级</th>
                        <th className="px-3 py-2">任务 / 隐私</th>
                        <th className="px-3 py-2">选中节点</th>
                        <th className="px-3 py-2">切换/TTFT</th>
                        <th className="px-3 py-2">Tokens / Cost</th>
                        <th className="px-3 py-2">状态</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-white/10 font-mono">
                      {ledger.map((row) => (
                        <tr key={row.requestId}>
                          <td className="px-3 py-2 text-slate-400">{new Date(row.createdAt).toLocaleTimeString()}</td>
                          <td className="px-3 py-2">{row.userId} ({row.userTier})</td>
                          <td className="px-3 py-2">{row.taskType} / {row.privacyMode}</td>
                          <td className="px-3 py-2">{row.selectedEndpointId || '-'}</td>
                          <td className="px-3 py-2">f={row.failoverCount} / {row.ttftMs}ms</td>
                          <td className="px-3 py-2">{row.inputTokens + row.outputTokens} / ${row.estimatedCostUsd}</td>
                          <td className="px-3 py-2">{row.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium">管理员安全操作审计 (ai_admin_audit_logs)</h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-white/[0.04] text-slate-500">
                      <tr>
                        <th className="px-3 py-2">时间</th>
                        <th className="px-3 py-2">管理员</th>
                        <th className="px-3 py-2">动作</th>
                        <th className="px-3 py-2">目标</th>
                        <th className="px-3 py-2">详情</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-white/10 font-mono">
                      {adminAudit.map((a) => (
                        <tr key={a.id}>
                          <td className="px-3 py-2 text-slate-400">{new Date(a.created_at).toLocaleString()}</td>
                          <td className="px-3 py-2">{a.admin_user_id}</td>
                          <td className="px-3 py-2">{a.action}</td>
                          <td className="px-3 py-2">{a.target}</td>
                          <td className="px-3 py-2 text-slate-400">{a.detail_json}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
