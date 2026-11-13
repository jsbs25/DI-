import type { DragEvent, MouseEvent, ReactNode } from 'react';
import { Globe, Plus, RotateCcw, X, Orbit } from 'lucide-react';

export function GoogleGIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}

export interface BrowserFrameTab {
  id: string;
  title: string;
  url: string;
}

interface BrowserFrameProps {
  tabs: BrowserFrameTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string, event: MouseEvent<HTMLButtonElement>) => void;
  onNewTab: () => void;
  canRestoreClosedTab: boolean;
  onRestoreClosedTab: () => void;
  onReorderTabs: (tabIds: string[]) => void;
  onBackToUniverse?: () => void;
  onBackToGlobe?: () => void;
  children: ReactNode;
}

/**
 * Accessible, project-adapted browser chrome based on the ChromeBrowser layout
 * from EnhancedJax/react-browser-components (MIT). The original is a visual
 * browser frame, not a web-rendering engine; EARTH ONE supplies its own content.
 */
export function BrowserFrame({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  canRestoreClosedTab,
  onRestoreClosedTab,
  onReorderTabs,
  onBackToUniverse,
  onBackToGlobe,
  children
}: BrowserFrameProps) {
  return (
    <section
      aria-label="ONE BROWSER — JUPITER"
      className="flex min-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,14,20,0.98),rgba(7,10,15,0.98))] shadow-[0_32px_100px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.03]"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-white/[0.02] px-3 pt-2 sm:gap-3 sm:px-4 backdrop-blur-xl">
        <div aria-hidden="true" className="hidden shrink-0 items-center gap-1.5 pl-0.5 sm:flex" title="ONE BROWSER">
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-300/50" />
        </div>

        <div role="tablist" aria-label="浏览器标签" className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(tab => {
            const selected = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                role="presentation"
                draggable
                data-browser-tab-id={tab.id}
                onDragStart={(event: DragEvent<HTMLDivElement>) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', tab.id);
                }}
                onDragOver={(event: DragEvent<HTMLDivElement>) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(event: DragEvent<HTMLDivElement>) => {
                  event.preventDefault();
                  const draggedId = event.dataTransfer.getData('text/plain');
                  const fromIndex = tabs.findIndex(item => item.id === draggedId);
                  const toIndex = tabs.findIndex(item => item.id === tab.id);
                  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
                  const reordered = [...tabs];
                  const [dragged] = reordered.splice(fromIndex, 1);
                  reordered.splice(toIndex, 0, dragged);
                  onReorderTabs(reordered.map(item => item.id));
                }}
                className={`group flex min-w-[120px] max-w-[240px] shrink-0 items-center rounded-t-2xl border border-b-0 px-2 py-2 transition-all duration-150 sm:min-w-[150px] sm:px-3 ${
                  selected
                    ? 'border-white/10 bg-[#0b1118] text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                    : 'border-transparent bg-transparent text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-label={`切换到${tab.title}`}
                  title={`${tab.title} · ${tab.url}`}
                  onClick={() => onSelectTab(tab.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                >
                  {tab.url.includes('google.com') || tab.title.toLowerCase().includes('google') ? (
                    <GoogleGIcon className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Globe className={`h-3.5 w-3.5 shrink-0 ${selected ? 'text-cyan-300' : 'text-slate-500'}`} />
                  )}
                  <span className="truncate">{tab.title}</span>
                </button>
                <button
                  type="button"
                  aria-label={`关闭${tab.title}标签`}
                  title="关闭标签"
                  disabled={tabs.length === 1}
                  onClick={event => onCloseTab(tab.id, event)}
                  className="ml-1 rounded-md p-1 text-slate-500 transition hover:bg-white/10 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 disabled:cursor-not-allowed disabled:opacity-30 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onRestoreClosedTab}
          disabled={!canRestoreClosedTab}
          aria-label="恢复最近关闭的标签页"
          aria-keyshortcuts="Control+Shift+T Meta+Shift+T"
          title="恢复最近关闭的标签页（Ctrl/Cmd+Shift+T）"
          className="mb-1.5 shrink-0 rounded-xl p-2 text-slate-400 transition hover:bg-white/[0.06] hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onNewTab}
          aria-label="新建标签"
          title="新建标签"
          className="mb-1.5 shrink-0 rounded-xl p-2 text-slate-400 transition hover:bg-white/[0.06] hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
        >
          <Plus className="h-4 w-4" />
        </button>

        {/* Quick Universe / Globe Navigation Hub */}
        {(onBackToUniverse || onBackToGlobe) && (
          <div className="mb-1 ml-auto flex items-center gap-1.5 shrink-0">
            {onBackToUniverse && (
              <button
                type="button"
                onClick={onBackToUniverse}
                aria-label="返回 3D 宇宙"
                title="返回 3D 宇宙深空"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] text-slate-300 hover:bg-cyan-400/10 hover:text-cyan-100 hover:border-cyan-400/20 text-[11px] font-medium transition cursor-pointer"
              >
                <Orbit className="h-3.5 w-3.5 text-cyan-400" />
                <span className="hidden sm:inline">🌌 返回宇宙</span>
              </button>
            )}
            {onBackToGlobe && (
              <button
                type="button"
                onClick={onBackToGlobe}
                aria-label="返回数字地球"
                title="返回人类数字地球"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] text-slate-300 hover:bg-cyan-400/10 hover:text-cyan-100 hover:border-cyan-400/20 text-[11px] font-medium transition cursor-pointer"
              >
                <Globe className="h-3.5 w-3.5 text-blue-400" />
                <span className="hidden sm:inline">🌍 人类地球</span>
              </button>
            )}
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}
