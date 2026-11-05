import type { DragEvent, MouseEvent, ReactNode } from 'react';
import { Globe, Plus, RotateCcw, X } from 'lucide-react';

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
  children
}: BrowserFrameProps) {
  return (
    <section
      aria-label="EARTH ONE 网页浏览器"
      className="flex min-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b1118] shadow-[0_24px_80px_rgba(0,0,0,0.38)] ring-1 ring-black/30"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] bg-[#101720] px-3 pt-2.5 sm:px-4">
        <div aria-hidden="true" className="hidden shrink-0 items-center gap-1.5 sm:flex">
          <span className="h-2.5 w-2.5 rounded-full bg-[#f16b64] shadow-[0_0_10px_rgba(241,107,100,0.28)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#e9b55d] shadow-[0_0_10px_rgba(233,181,93,0.2)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#5fb878] shadow-[0_0_10px_rgba(95,184,120,0.2)]" />
        </div>

        <div role="tablist" aria-label="浏览器标签" className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                className={`group flex min-w-[118px] max-w-[220px] shrink-0 items-center rounded-t-xl border border-b-0 px-2 py-2 transition-colors sm:min-w-[145px] sm:px-3 ${
                  selected
                    ? 'border-white/[0.09] bg-[#0b1118] text-slate-100'
                    : 'border-transparent bg-transparent text-slate-400 hover:bg-white/[0.035] hover:text-slate-200'
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
                  <Globe className={`h-3.5 w-3.5 shrink-0 ${selected ? 'text-cyan-300' : 'text-slate-500'}`} />
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
          className="mb-1 shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-white/[0.07] hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onNewTab}
          aria-label="新建标签"
          title="新建标签"
          className="mb-1 shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-white/[0.07] hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
        >
          <Plus className="h-4 w-4" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}
