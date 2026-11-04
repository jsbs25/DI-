import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  X,
  BookOpen,
  Maximize2,
  Menu
} from 'lucide-react';
import { Book } from '../../types/index.ts';

interface EpubReaderProps {
  book: Book;
  onClose: () => void;
  initialCfi?: string;
  ownerId?: string;
  onProgress?: (progress: number, cfi: string, bookId: string, ownerId?: string) => void;
}

/**
 * EPUB reader built on epub.js. Loads the EPUB through the backend proxy
 * (same-origin) to avoid CORS, renders into a viewport with page turn,
 * table-of-contents, and fullscreen support.
 */
export const EpubReader: React.FC<EpubReaderProps> = ({ book, onClose, initialCfi, ownerId, onProgress }) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [bookInstance, setBookInstance] = useState<any>(null);
  const [rendition, setRendition] = useState<any>(null);
  const [toc, setToc] = useState<Array<{ href: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showToc, setShowToc] = useState(false);
  const [fontSize, setFontSize] = useState(100);
  const [progress, setProgress] = useState(0);
  const onProgressRef = useRef(onProgress);
  const pendingProgressRef = useRef<{ progress: number; cfi: string; bookId: string; ownerId?: string } | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  onProgressRef.current = onProgress;

  const flushProgress = () => {
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    progressTimerRef.current = null;
    const pending = pendingProgressRef.current;
    pendingProgressRef.current = null;
    if (pending) onProgressRef.current?.(pending.progress, pending.cfi, pending.bookId, pending.ownerId);
  };

  const queueProgress = (nextProgress: number, cfi: string, bookId: string, progressOwnerId?: string) => {
    pendingProgressRef.current = { progress: nextProgress, cfi, bookId, ownerId: progressOwnerId };
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    progressTimerRef.current = setTimeout(flushProgress, 600);
  };

  const closeReader = () => {
    flushProgress();
    onClose();
  };

  useEffect(() => {
    let cancelled = false;
    let activeRendition: any = null;

    const load = async () => {
      if (!book.epubUrl) {
        setError('此书没有 EPUB 资源。');
        setLoading(false);
        return;
      }

      try {
        // Dynamically import epub.js (ESM)
        const ePub = (await import('epubjs')).default;

        const proxyUrl = `/api/library/epub-proxy?url=${encodeURIComponent(book.epubUrl)}`;
        const bookObj = ePub(proxyUrl);
        const rend = bookObj.renderTo(viewerRef.current!, {
          width: '100%',
          height: '100%',
          spread: 'none',
          flow: 'paginated'
        });

        const loaded = await bookObj.ready;
        if (cancelled) return;

        const nav = await bookObj.loaded.navigation;
        const flatToc = flattenToc(nav.toc);

        setBookInstance(bookObj);
        setRendition(rend);
        setToc(flatToc);
        setLoading(false);
        activeRendition = rend;
        rend.on('relocated', (location: any) => {
          if (location.start && location.end) {
            const pct = location.start.percentage || 0;
            setProgress(Math.round(pct * 100));
            const cfi = location.start.cfi;
            if (ownerId && typeof cfi === 'string' && cfi.startsWith('epubcfi(') && cfi.length <= 2048) {
              queueProgress(Math.round(pct * 100), cfi, book.id, ownerId);
            }
          }
        });

        try {
          await rend.display(initialCfi || undefined);
        } catch {
          if (initialCfi) await rend.display();
          else throw new Error('Unable to open the EPUB location');
        }
      } catch (err: any) {
        if (!cancelled) {
          setError('EPUB 加载失败: ' + (err?.message || err));
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      flushProgress();
      try { activeRendition?.destroy?.(); } catch {}
      try { bookInstance?.destroy?.(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.epubUrl]);

  const flattenToc = (items: any[], depth = 0): Array<{ href: string; label: string }> => {
    const out: Array<{ href: string; label: string }> = [];
    for (const it of items || []) {
      out.push({ href: it.href, label: it.label.trim() || 'Untitled' });
      if (it.subitems && it.subitems.length > 0) {
        out.push(...flattenToc(it.subitems, depth + 1));
      }
    }
    return out;
  };

  const next = () => rendition?.next();
  const prev = () => rendition?.prev();
  const goTo = (href: string) => {
    rendition?.display(href);
    setShowToc(false);
  };
  const adjustFont = (delta: number) => {
    const nextSize = Math.max(70, Math.min(160, fontSize + delta));
    setFontSize(nextSize);
    rendition?.themes.fontSize(`${nextSize}%`);
  };
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#030712] flex flex-col">
      {/* Toolbar */}
      <header className="h-14 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 bg-[#02050f]">
        <div className="flex items-center space-x-3 min-w-0">
          <button onClick={closeReader} className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer">
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">返回</span>
          </button>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white line-clamp-1">{book.title}</h2>
            <span className="text-[11px] text-slate-400">EPUB · {book.author}</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button onClick={prev} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer" title="上一页">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[11px] text-slate-400 font-mono">{progress}%</span>
          <button onClick={next} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer" title="下一页">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => adjustFont(-10)} className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer">A-</button>
          <button onClick={() => adjustFont(10)} className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer">A+</button>
          <button onClick={() => setShowToc(!showToc)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer" title="目录">
            <Menu className="w-4 h-4" />
          </button>
          <button onClick={toggleFullscreen} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer" title="全屏">
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div role="status" className="border-b border-amber-900/50 bg-amber-950/40 px-4 py-2 text-[11px] leading-relaxed text-amber-200/90">
        EPUB 阅读与续读可用；AI 段落解读暂不支持。正文仅在浏览器阅读器中呈现，服务器尚不能核验选文与 CFI 章节定位，因此不会发送给 AI，也不会生成虚构页码或引用。
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {showToc && (
          <aside className="w-64 border-r border-slate-800 bg-[#060c20] p-4 overflow-y-auto shrink-0">
            <h3 className="text-xs font-semibold text-slate-400 mb-3">目录</h3>
            <div className="space-y-1">
              {toc.map((item, i) => (
                <button
                  key={i}
                  onClick={() => goTo(item.href)}
                  className="w-full text-left px-2 py-1.5 rounded text-xs text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer line-clamp-1"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </aside>
        )}

        <div className="flex-1 bg-[#f5f1e8] flex items-center justify-center relative">
          {loading && (
            <div className="text-slate-500 text-sm flex items-center space-x-2">
              <BookOpen className="w-5 h-5 animate-pulse" />
              <span>正在加载 EPUB...</span>
            </div>
          )}
          {error && (
            <div className="text-red-500 text-sm p-4 text-center">
              {error}
            </div>
          )}
          <div
            ref={viewerRef}
            className="w-full h-full"
            style={{ display: error ? 'none' : 'block' }}
          />
        </div>
      </div>
    </div>
  );
};
