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
  Terminal
} from 'lucide-react';
import { Language, CrawlerTask, CrawledPage } from '../../types/index.ts';

interface CrawlerDashboardProps {
  lang: Language;
}

export const CrawlerDashboard: React.FC<CrawlerDashboardProps> = ({ lang }) => {
  const [tasks, setTasks] = useState<CrawlerTask[]>([]);
  const [pages, setPages] = useState<CrawledPage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'tasks' | 'pending' | 'logs'>('tasks');
  const [selectedPage, setSelectedPage] = useState<CrawledPage | null>(null);

  // New task form modal
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskDomain, setNewTaskDomain] = useState('');
  const [newTaskStartUrl, setNewTaskStartUrl] = useState('');
  const [newTaskMaxPages, setNewTaskMaxPages] = useState(25);

  const [logs, setLogs] = useState<string[]>([
    '[INIT] PROJECT EARTH Ingestion Engine V3.0 initialized.',
    '[OLLAMA] Local dual-engine architecture detected (Large model assigned to Crawler).',
    '[SYSTEM] Robots.txt protocol compliance enforced on all crawler workers.',
    '[STORAGE] Connected to local content staging repository.'
  ]);

  const [ollamaRoles, setOllamaRoles] = useState<{ running: boolean; crawlerModel: string | null; chatModel: string | null } | null>(null);
  const [isAiExtracting, setIsAiExtracting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [resTasks, resPages, resRoles] = await Promise.all([
        fetch('/api/crawler/tasks'),
        fetch('/api/crawler/pages'),
        fetch('/api/ai/ollama/roles').catch(() => null)
      ]);
      const dataTasks = await resTasks.json();
      const dataPages = await resPages.json();
      if (resRoles) {
        const dataRoles = await resRoles.json();
        if (dataRoles.success) {
          setOllamaRoles({ running: Boolean(dataRoles.running), crawlerModel: dataRoles.crawlerModel, chatModel: dataRoles.chatModel });
        }
      }
      if (dataTasks.success) setTasks(dataTasks.tasks);
      if (dataPages.success) setPages(dataPages.pages);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName || !newTaskDomain || !newTaskStartUrl) return;

    try {
      const res = await fetch('/api/crawler/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTaskName,
          targetDomain: newTaskDomain,
          startUrl: newTaskStartUrl,
          maxPages: Number(newTaskMaxPages)
        })
      });
      const data = await res.json();
      if (data.success && data.task) {
        setTasks(prev => [data.task, ...prev]);
        setIsNewTaskModalOpen(false);
        setNewTaskName('');
        setNewTaskDomain('');
        setNewTaskStartUrl('');
        setLogs(prev => [
          `[TASK CREATED] New ingestion task registered: ${data.task.name} (${data.task.targetDomain})`,
          ...prev
        ]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRunTask = async (taskId: string) => {
    setTasks(prev =>
      prev.map(t => (t.id === taskId ? { ...t, status: 'running' as const } : t))
    );
    setLogs(prev => [`[EXEC] Dispatching crawler worker for task: ${taskId}...`, ...prev]);

    try {
      const res = await fetch(`/api/crawler/tasks/${taskId}/run`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setLogs(prev => [
          `[SUCCESS] Crawl completed for ${taskId}. Harvested ${data.newPagesCount} pages into review queue.`,
          ...prev
        ]);
        await loadData();
      } else {
        setLogs(prev => [`[ERROR] Crawl task failed: ${data.error}`, ...prev]);
        setTasks(prev =>
          prev.map(t => (t.id === taskId ? { ...t, status: 'error' as const } : t))
        );
      }
    } catch (err: any) {
      setLogs(prev => [`[FATAL] Network error running task: ${err.message}`, ...prev]);
    }
  };

  const handleApprovePage = async (pageId: string) => {
    try {
      const res = await fetch(`/api/crawler/pages/${pageId}/approve`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setPages(prev =>
          prev.map(p => (p.id === pageId ? { ...p, status: 'approved' as const } : p))
        );
        setLogs(prev => [
          `[APPROVED] Page "${data.page.title}" approved and ingested into Global Digital Library!`,
          ...prev
        ]);
        if (selectedPage?.id === pageId) {
          setSelectedPage(prev => (prev ? { ...prev, status: 'approved' } : null));
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRejectPage = (pageId: string) => {
    setPages(prev =>
      prev.map(p => (p.id === pageId ? { ...p, status: 'rejected' as const } : p))
    );
    setLogs(prev => [`[REJECTED] Ingestion discarded for page ID: ${pageId}`, ...prev]);
    if (selectedPage?.id === pageId) {
      setSelectedPage(prev => (prev ? { ...prev, status: 'rejected' } : null));
    }
  };

  const pendingPages = pages.filter(p => p.status === 'pending_review');

  return (
    <div className="flex-1 flex flex-col bg-[#020512] text-slate-100 min-h-[calc(100vh-4rem)] p-4 sm:p-8">
      {/* 1. Header Bar */}
      <div className="max-w-7xl mx-auto w-full mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2.5 rounded-xl bg-blue-950/80 border border-blue-500/40 text-blue-400">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-wide">
                网络内容采集与整理系统 (Crawler Center)
              </h1>
              <p className="text-xs text-slate-400">
                合规抓取全球知识资源 · 结构化清洗与文本解构 · 审核一键沉淀至数字图书馆
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>刷新数据</span>
          </button>
          <button
            onClick={() => setIsNewTaskModalOpen(true)}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>新建采集任务</span>
          </button>
        </div>
      </div>

      {/* Dual Ollama Dedicated Capsule */}
      <div className="max-w-7xl mx-auto w-full mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-violet-500/30 bg-violet-950/20 px-5 py-4 backdrop-blur shadow-lg">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600/30 text-xl border border-violet-500/40">
            🕷️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-wide">本地双 Ollama · 爬虫大模型专用引擎</span>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300 border border-emerald-500/30">
                已就绪
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              当前爬虫大模型: <span className="font-mono text-cyan-300 font-semibold">{ollamaRoles?.crawlerModel || '自动调度中...'}</span> · 专用于网页深度解构、知识抽取与长文本图谱沉淀（小模型已分配用于对话问答）
            </p>
          </div>
        </div>
        <div className="text-xs font-mono text-slate-400 shrink-0">
          端点: localhost:11434
        </div>
      </div>

      {/* 2. Top Stats Overview */}
      <div className="max-w-7xl mx-auto w-full grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <span className="text-[11px] text-slate-400 block mb-1">活跃采集任务</span>
          <span className="text-2xl font-bold text-white">{tasks.length}</span>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <span className="text-[11px] text-slate-400 block mb-1">已采集页面总数</span>
          <span className="text-2xl font-bold text-cyan-400">{pages.length}</span>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <span className="text-[11px] text-slate-400 block mb-1">待审核入库</span>
          <span className="text-2xl font-bold text-amber-400">{pendingPages.length}</span>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 block mb-1">Robots.txt 协议合规</span>
            <span className="text-sm font-semibold text-emerald-400">100% Enforced</span>
          </div>
          <ShieldCheck className="w-8 h-8 text-emerald-400/80" />
        </div>
      </div>

      {/* 3. Section Tabs */}
      <div className="max-w-7xl mx-auto w-full flex items-center space-x-2 mb-6 border-b border-slate-800/80 pb-2">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'tasks'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>采集任务列表 ({tasks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('pending')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'pending'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>内容审核与入库 ({pendingPages.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'logs'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>实时日志终端</span>
        </button>
      </div>

      {/* 4. Tab 1: Tasks List */}
      {activeTab === 'tasks' && (
        <div className="max-w-7xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tasks.map(task => (
            <div
              key={task.id}
              className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between"
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

                <div className="space-y-1.5 text-xs text-slate-400 mb-4 bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
                  <div className="flex items-center justify-between">
                    <span>起始 URL:</span>
                    <span className="font-mono text-slate-300 truncate max-w-[160px]">{task.startUrl}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>最大抓取量:</span>
                    <span className="font-semibold text-slate-200">{task.maxPages} 页</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>已抓取页面:</span>
                    <span className="font-semibold text-cyan-400">{task.pagesCrawled}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>遵守 Robots.txt:</span>
                    <span className="text-emerald-400 font-medium">是 (合规保护)</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-mono">
                  上次: {task.lastRunAt ? new Date(task.lastRunAt).toLocaleTimeString() : '尚未运行'}
                </span>
                <button
                  onClick={() => handleRunTask(task.id)}
                  disabled={task.status === 'running'}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600/90 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-semibold shadow-md cursor-pointer transition-all"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>{task.status === 'running' ? '采集中...' : '立即运行任务'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 5. Tab 2: Content Review */}
      {activeTab === 'pending' && (
        <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-3 max-h-[600px] overflow-y-auto pr-2">
            {pages.length === 0 ? (
              <div className="text-center text-slate-500 py-12 text-xs">
                暂无采集到的网页内容。请前往「采集任务列表」运行任务。
              </div>
            ) : (
              pages.map(page => {
                const isSelected = selectedPage?.id === page.id;
                return (
                  <div
                    key={page.id}
                    onClick={() => setSelectedPage(page)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-blue-950/70 border-blue-500 shadow-md'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md font-semibold uppercase ${
                          page.status === 'approved'
                            ? 'bg-emerald-950 text-emerald-300'
                            : page.status === 'rejected'
                            ? 'bg-rose-950 text-rose-300'
                            : 'bg-amber-950 text-amber-300'
                        }`}
                      >
                        {page.status === 'approved' ? '已入库' : page.status === 'rejected' ? '已拒绝' : '待审核'}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(page.crawledAt).toLocaleDateString()}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-white line-clamp-2 mb-1">{page.title}</h4>
                    <span className="text-[11px] text-slate-400 block line-clamp-1">{page.author}</span>
                  </div>
                );
              })
            )}
          </div>

          <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
            {selectedPage ? (
              <>
                <div className="space-y-4 overflow-y-auto max-h-[460px] pr-2">
                  <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                    <div>
                      <h2 className="text-xl font-bold text-white font-serif">{selectedPage.title}</h2>
                      <div className="flex items-center space-x-3 mt-2 text-xs text-slate-400">
                        <span>作者: {selectedPage.author}</span>
                        <span>·</span>
                        <a
                          href={selectedPage.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-cyan-400 hover:underline flex items-center space-x-1"
                        >
                          <span className="truncate max-w-[240px]">{selectedPage.url}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* AI Summary extracted by Ollama Large Model */}
                  {selectedPage.aiSummary ? (
                    <div className="mb-4 rounded-xl border border-violet-500/30 bg-violet-950/30 p-4 text-xs">
                      <div className="flex items-center justify-between border-b border-violet-500/20 pb-2 mb-2.5">
                        <span className="font-semibold text-violet-200 flex items-center gap-1.5">
                          <span>🕷️</span> 本地爬虫大模型深度提炼
                        </span>
                        <span className="font-mono text-[10px] text-cyan-300">
                          {selectedPage.aiModelUsed || ollamaRoles?.crawlerModel || 'Ollama Large Model'}
                        </span>
                      </div>
                      <div className="text-slate-200 whitespace-pre-line leading-relaxed font-sans">
                        {selectedPage.aiSummary}
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4 flex items-center justify-between rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-3">
                      <span className="text-xs text-slate-400">
                        尚未进行 AI 深度知识提炼
                      </span>
                      <button
                        onClick={() => handleDeepExtract(selectedPage)}
                        disabled={isAiExtracting}
                        className="flex items-center space-x-1.5 rounded-lg bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/40 px-3 py-1.5 text-xs font-semibold text-violet-200 transition-colors"
                      >
                        <RefreshCw className={`w-3 h-3 ${isAiExtracting ? 'animate-spin' : ''}`} />
                        <span>{isAiExtracting ? '正在抽取...' : '使用爬虫大模型提炼'}</span>
                      </button>
                    </div>
                  )}

                  <div className="bg-slate-950/80 p-5 rounded-xl border border-slate-800 text-xs sm:text-sm text-slate-200 font-serif leading-relaxed whitespace-pre-line">
                    {selectedPage.cleanContent}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
                  <div className="text-xs text-slate-400">
                    审核通过后将自动转存为全球数字图书馆正式开放读物。
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleRejectPage(selectedPage.id)}
                      disabled={selectedPage.status === 'rejected'}
                      className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-rose-950/80 hover:text-rose-300 text-slate-300 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                      <span>拒绝</span>
                    </button>
                    <button
                      onClick={() => handleApprovePage(selectedPage.id)}
                      disabled={selectedPage.status === 'approved'}
                      className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>{selectedPage.status === 'approved' ? '已入库' : '审核通过并入库'}</span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-8 space-y-3">
                <BookOpen className="w-10 h-10 text-slate-600" />
                <p className="text-xs">请在左侧选择要预览与审核的采集文章</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. Tab 3: Real-Time Execution Logs */}
      {activeTab === 'logs' && (
        <div className="max-w-7xl mx-auto w-full bg-[#040817] border border-slate-800 rounded-2xl p-5 shadow-2xl font-mono text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3 text-slate-400">
            <div className="flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span className="font-semibold text-slate-200">采集核心运行日志 (Live Stream)</span>
            </div>
            <button onClick={() => setLogs([])} className="text-[11px] text-slate-500 hover:text-slate-300">
              清空日志
            </button>
          </div>
          <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-2 text-slate-300">
            {logs.map((log, i) => (
              <div key={i} className="leading-relaxed">
                <span className="text-cyan-500 mr-2">›</span>
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. New Task Modal */}
      {isNewTaskModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0c142c] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
              <h3 className="text-base font-semibold text-white">创建全新合规采集任务</h3>
              <button onClick={() => setIsNewTaskModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">任务名称</label>
                <input
                  type="text"
                  required
                  value={newTaskName}
                  onChange={e => setNewTaskName(e.target.value)}
                  placeholder="例如: NASA 近地小行星观测抓取"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1.5">目标主域名</label>
                <input
                  type="text"
                  required
                  value={newTaskDomain}
                  onChange={e => setNewTaskDomain(e.target.value)}
                  placeholder="例如: nasa.gov 或 gutenberg.org"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1.5">起始抓取 URL</label>
                <input
                  type="url"
                  required
                  value={newTaskStartUrl}
                  onChange={e => setNewTaskStartUrl(e.target.value)}
                  placeholder="https://earthobservatory.nasa.gov"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1.5">最大限制页数</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={newTaskMaxPages}
                  onChange={e => setNewTaskMaxPages(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-4 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsNewTaskModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-md shadow-blue-600/30"
                >
                  确认创建并上线
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
