import React, { useState, useEffect } from 'react';
import {
  Layers,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  FileText,
  Check,
  X,
  ExternalLink,
  BookOpen,
  Terminal,
  Globe2,
  Sparkles,
  Search,
  Activity,
  Rss,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Language, CrawlerTask, CrawledPage } from '../../types/index.ts';

interface CrawlerDashboardProps {
  lang: Language;
}

interface DiscoveryResource {
  id: string;
  canonicalUrl: string;
  url: string;
  domain: string;
  name: string;
  description: string;
  resourceType: string;
  primaryPlanet: string;
  planets: string[];
  category: string;
  tags: string[];
  language: string;
  icon?: string;
  source: string;
  copyrightStatus: string;
  accessType: string;
  qualityScore: number;
  status: string;
  httpStatus: number;
  updatedAt: number;
}

interface DiscoveryStats {
  total: number;
  planetStats: Record<string, number>;
  sourcesCount: number;
}

const PLANET_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  all: { label: '全部星球', icon: '🌌', color: 'from-blue-600 to-indigo-600' },
  sun: { label: '太阳 · AI智能', icon: '☀️', color: 'from-amber-500 to-yellow-600' },
  earth: { label: '地球 · 人类生活', icon: '🌍', color: 'from-blue-600 to-cyan-600' },
  moon: { label: '月球 · 教育学习', icon: '🌙', color: 'from-slate-400 to-sky-500' },
  jupiter: { label: '木星 · 智能浏览', icon: '🪐', color: 'from-cyan-600 to-teal-600' },
  saturn: { label: '土星 · 影视影音', icon: '🪐', color: 'from-amber-600 to-orange-600' },
  mars: { label: '火星 · 软件游戏', icon: '🔴', color: 'from-orange-600 to-red-600' },
  neptune: { label: '海王星 · 世界图书馆', icon: '🔵', color: 'from-indigo-600 to-blue-700' },
  venus: { label: '金星 · 音乐艺术', icon: '💖', color: 'from-pink-500 to-rose-600' },
  mercury: { label: '水星 · 即时资讯', icon: '⚪', color: 'from-teal-600 to-emerald-600' },
  uranus: { label: '天王星 · 开源科研', icon: '🟣', color: 'from-violet-600 to-purple-600' }
};

export const CrawlerDashboard: React.FC<CrawlerDashboardProps> = ({ lang }) => {
  const [activeTab, setActiveTab] = useState<'discovery' | 'tasks' | 'pending' | 'sources' | 'logs'>('discovery');
  const [tasks, setTasks] = useState<CrawlerTask[]>([]);
  const [pages, setPages] = useState<CrawledPage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPage, setSelectedPage] = useState<CrawledPage | null>(null);

  // Discovery state
  const [discoveryStats, setDiscoveryStats] = useState<DiscoveryStats | null>(null);
  const [discoveryResources, setDiscoveryResources] = useState<DiscoveryResource[]>([]);
  const [selectedPlanetFilter, setSelectedPlanetFilter] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Manual Resource Modal
  const [isAddResourceModalOpen, setIsAddResourceModalOpen] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [addName, setAddName] = useState('');
  const [addPlanet, setAddPlanet] = useState<string>('jupiter');
  const [addCategory, setAddCategory] = useState('web_tool');
  const [addDescription, setAddDescription] = useState('');
  const [isSubmittingResource, setIsSubmittingResource] = useState(false);

  // Task form modal
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskDomain, setNewTaskDomain] = useState('');
  const [newTaskStartUrl, setNewTaskStartUrl] = useState('');
  const [newTaskMaxPages, setNewTaskMaxPages] = useState(25);

  const [logs, setLogs] = useState<string[]>([
    '[INIT] EARTH ONE Global Discovery Engine & Ingestion System Active.',
    '[SQLITE] Connected to server_data/discovery.db with WAL & FTS5 full-text indexing.',
    '[DEDUP] Canonical URL normalizer active (tracking params & fragment stripping).',
    '[OLLAMA] Local dual-engine architecture detected (Large model assigned to Crawler).',
    '[SYSTEM] Robots.txt protocol compliance enforced on all crawler workers.'
  ]);

  const [ollamaRoles, setOllamaRoles] = useState<{ running: boolean; crawlerModel: string | null; chatModel: string | null } | null>(null);
  const [isAiExtracting, setIsAiExtracting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [resTasks, resPages, resRoles, resStats, resResources] = await Promise.all([
        fetch('/api/crawler/tasks').catch(() => null),
        fetch('/api/crawler/pages').catch(() => null),
        fetch('/api/ai/ollama/roles').catch(() => null),
        fetch('/api/discovery/stats').catch(() => null),
        fetch('/api/discovery/resources?limit=50').catch(() => null)
      ]);

      if (resTasks) {
        const d = await resTasks.json();
        if (d.success) setTasks(d.tasks);
      }
      if (resPages) {
        const d = await resPages.json();
        if (d.success) setPages(d.pages);
      }
      if (resRoles) {
        const d = await resRoles.json();
        if (d.success) setOllamaRoles({ running: Boolean(d.running), crawlerModel: d.crawlerModel, chatModel: d.chatModel });
      }
      if (resStats) {
        const d = await resStats.json();
        if (d.success) setDiscoveryStats(d);
      }
      if (resResources) {
        const d = await resResources.json();
        if (d.success) setDiscoveryResources(d.items || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter discovery resources
  const filteredResources = discoveryResources.filter(r => {
    const matchPlanet = selectedPlanetFilter === 'all' || r.primaryPlanet === selectedPlanetFilter || r.planets?.includes(selectedPlanetFilter);
    const matchQuery = !searchFilter ||
      r.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      r.domain.toLowerCase().includes(searchFilter.toLowerCase()) ||
      r.description.toLowerCase().includes(searchFilter.toLowerCase()) ||
      r.tags?.some(t => t.toLowerCase().includes(searchFilter.toLowerCase()));
    return matchPlanet && matchQuery;
  });

  const handleManualAddResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUrl) return;
    setIsSubmittingResource(true);

    try {
      const res = await fetch('/api/discovery/resources/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: addUrl,
          name: addName || new URL(addUrl).hostname,
          description: addDescription,
          primaryPlanet: addPlanet,
          category: addCategory,
          resourceType: 'website'
        })
      });
      const data = await res.json();
      if (data.success) {
        setActionNotice(data.isNew ? `✅ 成功收录新资源「${data.resource.name}」！` : `ℹ️ 检测到已有相同网址，已自动去重合并更新！`);
        setIsAddResourceModalOpen(false);
        setAddUrl('');
        setAddName('');
        setAddDescription('');
        await loadData();
        setTimeout(() => setActionNotice(null), 4500);
      } else {
        setActionNotice(`❌ 添加失败: ${data.error}`);
      }
    } catch (err: any) {
      setActionNotice(`❌ 网络异常: ${err.message}`);
    } finally {
      setIsSubmittingResource(false);
    }
  };

  const handleTriggerHealthCheck = async () => {
    setActionNotice('🔍 正在对存量资源发起异步 HTTP 健康探针...');
    try {
      const res = await fetch('/api/discovery/tasks/run-health', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setActionNotice(`✅ 巡检完成: 已探测 ${data.checked} 个链接，发现 ${data.deadFound} 个失效链接已自动标记。`);
        await loadData();
      }
    } catch (err: any) {
      setActionNotice(`❌ 巡检失败: ${err.message}`);
    }
    setTimeout(() => setActionNotice(null), 5000);
  };

  const handleTriggerRssSync = async () => {
    setActionNotice('📡 正在同步全部已配置的 RSS/Atom 资讯源...');
    try {
      const res = await fetch('/api/discovery/tasks/run-rss', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setActionNotice(`✅ RSS 同步完成: 处理 ${data.sourcesProcessed} 个订阅源，新增 ${data.itemsCollected} 条新条目！`);
        await loadData();
      }
    } catch (err: any) {
      setActionNotice(`❌ RSS 同步异常: ${err.message}`);
    }
    setTimeout(() => setActionNotice(null), 5000);
  };

  const handleDeepExtract = async (page: CrawledPage) => {
    setIsAiExtracting(true);
    try {
      const res = await fetch('/api/crawler/ai-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: page.title, content: page.cleanContent, url: page.url })
      });
      const data = await res.json();
      if (data.success && data.extraction) {
        const updated = { ...page, aiSummary: data.extraction, aiModelUsed: data.modelUsed };
        setPages(prev => prev.map(p => p.id === page.id ? updated : p));
        setSelectedPage(updated);
        setLogs(prev => [`[AI EXTRACT] 深度爬虫知识抽取完成 · 模型: ${data.modelUsed} · 文章: “${page.title}”`, ...prev]);
      }
    } catch (e: any) {
      setLogs(prev => [`[ERROR] AI 抽取异常: ${e.message}`, ...prev]);
    } finally {
      setIsAiExtracting(false);
    }
  };

  const pendingPages = pages.filter(p => p.status === 'pending_review');

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-1 flex-col bg-[var(--color-one-bg)] p-4 text-[var(--color-one-text)] sm:p-8">
      {actionNotice && (
        <div className="fixed left-1/2 top-20 z-50 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-[var(--color-one-border-strong)] bg-[color:var(--color-one-bg-elevated)] px-5 py-3 text-xs font-medium text-white shadow-[var(--shadow-one-lg)] backdrop-blur-md">
          <Sparkles className="h-4 w-4 shrink-0 text-[var(--color-one-accent)]" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Header */}
      <div className="mx-auto mb-8 flex w-full max-w-7xl flex-col justify-between gap-4 border-b border-[var(--color-one-border)] pb-6 md:flex-row md:items-center">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--color-one-border-strong)] bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-[var(--color-one-text-muted)]">
            <Globe2 className="h-3.5 w-3.5 text-[var(--color-one-accent)]" />
            <span>ONE DISCOVERY · {lang === 'zh' ? '资源发现与采集' : 'Discovery & Ingestion'}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">全球资源发现与智能采集引擎</h1>
            <span className="rounded-full border border-[var(--color-one-border)] bg-white/[0.02] px-2.5 py-0.5 font-mono text-xs text-[var(--color-one-text-muted)]">FTS5 + SQLite</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[var(--color-one-text-muted)] sm:text-sm">多源合规采集 · 自动去重清洗 · 统一资源库 · 辅助能力以实际配置为准</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button onClick={handleTriggerHealthCheck} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-one-border)] bg-white/[0.02] px-3 py-2 text-xs font-medium text-[var(--color-one-text-muted)] transition hover:bg-white/[0.05] hover:text-white" title="对库内存量资源进行健康探活探测">
            <Activity className="h-3.5 w-3.5 text-emerald-300" /><span>健康巡检</span>
          </button>
          <button onClick={handleTriggerRssSync} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-one-border)] bg-white/[0.02] px-3 py-2 text-xs font-medium text-[var(--color-one-text-muted)] transition hover:bg-white/[0.05] hover:text-white" title="立即轮询活跃 RSS 订阅源">
            <Rss className="h-3.5 w-3.5 text-amber-300" /><span>同步 RSS</span>
          </button>
          <button onClick={loadData} disabled={isLoading} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-one-border)] bg-white/[0.02] px-3 py-2 text-xs font-medium text-[var(--color-one-text-muted)] transition hover:bg-white/[0.05] hover:text-white disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-[var(--color-one-accent)]' : ''}`} /><span>刷新</span>
          </button>
          <button onClick={() => setIsAddResourceModalOpen(true)} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-[var(--color-one-accent)] px-4 py-2 text-xs font-semibold text-[#071018] shadow-[var(--shadow-one-sm)] transition hover:brightness-110">
            <Plus className="h-4 w-4" /><span>录入新资源</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mx-auto mb-8 grid w-full max-w-7xl grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="rounded-[22px] border border-[var(--color-one-border)] bg-white/[0.03] p-4 shadow-[var(--shadow-one-sm)]">
          <span className="mb-1 block text-[11px] text-[var(--color-one-text-muted)]">统一资源总库</span>
          <span className="text-2xl font-semibold tabular-nums text-white">{discoveryStats?.total ?? discoveryResources.length}</span>
          <span className="ml-1 text-xs text-[var(--color-one-text-dim)]">条</span>
        </div>
        <div className="rounded-[22px] border border-[var(--color-one-border)] bg-white/[0.03] p-4 shadow-[var(--shadow-one-sm)]">
          <span className="mb-1 block text-[11px] text-[var(--color-one-text-muted)]">活跃数据源</span>
          <span className="text-2xl font-semibold tabular-nums text-white">{discoveryStats?.sourcesCount ?? 3}</span>
          <span className="ml-1 text-xs text-[var(--color-one-text-dim)]">个</span>
        </div>
        <div className="rounded-[22px] border border-[var(--color-one-border)] bg-white/[0.03] p-4 shadow-[var(--shadow-one-sm)]">
          <span className="mb-1 block text-[11px] text-[var(--color-one-text-muted)]">待审网页入库</span>
          <span className="text-2xl font-semibold tabular-nums text-amber-200">{pendingPages.length}</span>
          <span className="ml-1 text-xs text-[var(--color-one-text-dim)]">页</span>
        </div>
        <div className="flex items-center justify-between rounded-[22px] border border-[var(--color-one-border)] bg-white/[0.03] p-4 shadow-[var(--shadow-one-sm)]">
          <div>
            <span className="mb-1 block text-[11px] text-[var(--color-one-text-muted)]">去重与指纹</span>
            <span className="text-sm font-semibold text-emerald-200">Canonical SHA-256</span>
          </div>
          <ShieldCheck className="h-8 w-8 text-emerald-300/80" />
        </div>
      </div>

      {/* Tabs */}
      <div className="mx-auto mb-6 flex w-full max-w-7xl items-center gap-2 overflow-x-auto border-b border-[var(--color-one-border)] pb-2">
        {([
          { id: 'discovery', icon: Globe2, label: `全网资源库 (${discoveryResources.length})` },
          { id: 'tasks', icon: Layers, label: `采集任务 (${tasks.length})` },
          { id: 'pending', icon: FileText, label: `网页审核 (${pendingPages.length})` },
          { id: 'logs', icon: Terminal, label: '调度日志' },
        ] as const).map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`inline-flex min-h-10 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-medium transition ${active ? 'bg-[var(--color-one-accent)] text-[#071018]' : 'text-[var(--color-one-text-muted)] hover:bg-white/[0.05] hover:text-white'}`}>
              <Icon className="h-3.5 w-3.5" /><span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 4. Tab 0: Unified Discovery Resources View */}
      {activeTab === 'discovery' && (
        <div className="mx-auto w-full max-w-7xl space-y-6">
          {/* Planet filter chips */}
          <div className="scrollbar-none flex items-center gap-2 overflow-x-auto pb-2">
            {Object.entries(PLANET_LABELS).map(([pid, meta]) => {
              const count = pid === 'all'
                ? discoveryStats?.total ?? discoveryResources.length
                : discoveryStats?.planetStats?.[pid] ?? 0;
              const isSelected = selectedPlanetFilter === pid;

              return (
                <button
                  key={pid}
                  onClick={() => setSelectedPlanetFilter(pid)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer whitespace-nowrap border ${
                    isSelected
                      ? 'border-[rgba(78,161,255,0.35)] bg-[rgba(78,161,255,0.14)] text-white'
                      : 'border-[var(--color-one-border)] bg-white/[0.02] text-[var(--color-one-text-muted)] hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.05] hover:text-white'
                  }`}
                >
                  <span>{meta.icon}</span>
                  <span>{meta.label}</span>
                  <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-one-text-muted)]">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search bar inside discovery */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-one-text-dim)]" />
            <input
              type="text"
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              placeholder="在统一资源库中秒级检索（支持名称、域名、分类或标签）..."
              className="min-h-11 w-full rounded-xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.7)] py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-[var(--color-one-text-dim)] focus:border-[rgba(78,161,255,0.45)] focus:outline-none"
            />
          </div>

          {/* Resource cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredResources.map(res => (
              <div
                key={res.id}
                className="group flex flex-col justify-between rounded-[24px] border border-[var(--color-one-border)] bg-white/[0.03] p-5 shadow-[var(--shadow-one-sm)] transition hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.04]"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      {res.icon ? (
                        <img src={res.icon} alt="" className="w-5 h-5 rounded-md shrink-0 object-cover" />
                      ) : (
                        <Globe2 className="h-5 w-5 shrink-0 text-[var(--color-one-accent)]" />
                      )}
                      <h3 className="truncate text-sm font-semibold text-white transition-colors group-hover:text-[var(--color-one-accent-soft)]">
                        {res.name}
                      </h3>
                    </div>
                    <span className="shrink-0 rounded-full border border-[var(--color-one-border)] bg-white/[0.02] px-2 py-0.5 font-mono text-[10px] uppercase text-[var(--color-one-text-muted)]">
                      {res.primaryPlanet}
                    </span>
                  </div>

                  <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-[var(--color-one-text-muted)]">
                    {res.description || '暂无描述'}
                  </p>

                  <div className="flex items-center gap-1.5 flex-wrap mb-4">
                    <span className="rounded-md border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.55)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-one-text-muted)]">
                      {res.domain}
                    </span>
                    <span className="rounded-md border border-[rgba(78,161,255,0.25)] bg-[rgba(78,161,255,0.1)] px-2 py-0.5 text-[10px] text-[var(--color-one-accent-soft)]">
                      {res.category}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-md border ${
                      res.accessType === 'open' ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}>
                      {res.accessType === 'open' ? '完全开放' : res.accessType}
                    </span>
                    {res.status === 'dead' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-950/60 border border-rose-500/30 text-rose-300">
                        死链(404)
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-[var(--color-one-border)] pt-3">
                  <div className="font-mono text-[10px] text-[var(--color-one-text-dim)]">
                    质量分: <span className="font-semibold text-[var(--color-one-accent-soft)]">{res.qualityScore}</span>
                  </div>
                  <a
                    href={res.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-one-accent-soft)] hover:text-white"
                  >
                    <span>访问资源</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>

          {filteredResources.length === 0 && (
            <div className="rounded-[28px] border border-dashed border-[var(--color-one-border-strong)] bg-white/[0.02] py-16 text-center text-xs text-[var(--color-one-text-muted)]">
              该筛选条件下暂无资源，可点击右上角「录入新资源」或使用「同步 RSS」抓取。
            </div>
          )}
        </div>
      )}

      {/* 5. Tab 1: Tasks List */}
      {activeTab === 'tasks' && (
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tasks.map(task => (
            <div
              key={task.id}
              className="p-5 rounded-2xl border border-[var(--color-one-border)] bg-white/[0.03] hover:border-[var(--color-one-border-strong)] transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 pr-2">
                    <h3 className="font-semibold text-white text-sm line-clamp-1">{task.name}</h3>
                    <span className="text-[11px] text-cyan-400 font-mono">{task.targetDomain}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                      task.status === 'running'
                        ? 'bg-blue-950 text-blue-300 border border-blue-500 animate-pulse'
                        : task.status === 'completed'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-500'
                        : task.status === 'error'
                        ? 'bg-rose-950 text-rose-300 border border-rose-500'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {task.status}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-400 mb-4 rounded-xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.55)] p-3">
                  <div className="flex items-center justify-between">
                    <span>起始 URL:</span>
                    <span className="font-mono text-slate-300 truncate max-w-[160px]">{task.startUrl}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>最大抓取量:</span>
                    <span className="font-semibold text-slate-200">{task.maxPages} 页</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-[var(--color-one-border)] pt-3">
                <span className="font-mono text-[10px] text-[var(--color-one-text-dim)]">{task.lastRunAt || '就绪'}</span>
                <button
                  onClick={() => handleTriggerHealthCheck()}
                  className="px-3 py-1.5 rounded-xl bg-blue-600/20 text-cyan-300 hover:bg-blue-600 hover:text-white text-xs font-medium transition-all"
                >
                  运行任务
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 6. Tab 2: Pending Reviews */}
      {activeTab === 'pending' && (
        <div className="mx-auto w-full max-w-7xl">
          {pendingPages.length === 0 ? (
            <div className="text-center py-20 text-[var(--color-one-text-dim)] text-xs">暂无待审核页面</div>
          ) : (
            <div className="space-y-3">
              {pendingPages.map(page => (
                <div key={page.id} className="p-4 rounded-xl border border-[var(--color-one-border)] bg-white/[0.02] flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-white">{page.title}</h4>
                    <span className="text-xs text-slate-400 font-mono">{page.url}</span>
                  </div>
                  <button
                    onClick={() => handleDeepExtract(page)}
                    disabled={isAiExtracting}
                    className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold"
                  >
                    AI 深度抽取
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 7. Tab 3: System Logs */}
      {activeTab === 'logs' && (
        <div className="max-w-7xl mx-auto w-full bg-slate-950 p-5 rounded-2xl border border-slate-800 font-mono text-xs text-slate-300 space-y-2 max-h-[500px] overflow-y-auto">
          {logs.map((l, i) => (
            <div key={i} className="leading-relaxed">
              <span className="text-cyan-400 font-bold">&gt;</span> {l}
            </div>
          ))}
        </div>
      )}

      {/* Manual Resource Addition Modal */}
      {isAddResourceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg p-6 rounded-2xl border border-[var(--color-one-border)] bg-white/[0.02] shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Plus className="w-4 h-4 text-cyan-400" />
                <span>录入全球互联网资源</span>
              </h3>
              <button onClick={() => setIsAddResourceModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualAddResource} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">目标网址 (URL)</label>
                <input
                  type="url"
                  required
                  value={addUrl}
                  onChange={e => setAddUrl(e.target.value)}
                  placeholder="https://example.com/tool?ref=social"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
                <span className="text-[10px] text-[var(--color-one-text-dim)] mt-1 block">
                  系统将自动剥离 utm_* 等营销参数，生成全局唯一 Canonical 索引指纹。
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">资源名称 / 网站名</label>
                <input
                  type="text"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                  placeholder="例如: Linux Kernel Official"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">归属星球</label>
                  <select
                    value={addPlanet}
                    onChange={e => setAddPlanet(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="sun">☀️ 太阳 (AI与智能工具)</option>
                    <option value="earth">🌍 地球 (现实生活服务)</option>
                    <option value="moon">🌙 月球 (教育与语言学习)</option>
                    <option value="jupiter">🪐 木星 (全球互联网与浏览器)</option>
                    <option value="saturn">🪐 土星 (影视影音文化)</option>
                    <option value="mars">🔴 火星 (软件与游戏应用)</option>
                    <option value="neptune">🔵 海王星 (世界数字图书馆)</option>
                    <option value="venus">💖 金星 (艺术与音乐创作)</option>
                    <option value="mercury">⚪ 水星 (即时资讯与宏观数据)</option>
                    <option value="uranus">🟣 天王星 (开源项目与科研)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">细分分类</label>
                  <input
                    type="text"
                    value={addCategory}
                    onChange={e => setAddCategory(e.target.value)}
                    placeholder="如: open_source, ai_tool"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">简介 / 描述 (可选)</label>
                <textarea
                  value={addDescription}
                  onChange={e => setAddDescription(e.target.value)}
                  rows={2}
                  placeholder="简述该资源的特点与用途..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddResourceModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingResource}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/30 transition-all cursor-pointer"
                >
                  {isSubmittingResource ? '正在校验入库...' : '确认收录'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
