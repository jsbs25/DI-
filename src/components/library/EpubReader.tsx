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

function getSafeSourceUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch { /* Show no source link when the stored URL is malformed. */ }
  return null;
}

/**
 * EPUB reader built on epub.js. Loads the EPUB through the backend proxy
 * (same-origin) to avoid CORS, renders into a viewport with page turn,
 * table-of-contents, and fullscreen support.
 */
export const EpubReader: React.FC<EpubReaderProps> = ({ book, onClose, initialCfi, ownerId, onProgress }) => {
  const officialSourceUrl = getSafeSourceUrl(book.externalReadUrl) || getSafeSourceUrl(book.sourceUrl);
  const isRtl = /^(ar|he|fa|ur|ps|sd|yi|ug|dv|ku)\b/i.test(book.language || '');
  const viewerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
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
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeReader();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled])'));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
      window.requestAnimationFrame(() => {
        if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
      });
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let activeRendition: any = null;

    const load = async () => {
      if (!book.epubUrl) {
        setError('此书没有 EPUB 资源。');
        setLoading(false);
        return;
      }
      const supportedProvider =
        (book.connectorId === 'gutenberg' && book.source === 'Project Gutenberg') ||
        (book.connectorId === 'archive' && book.source === 'Internet Archive');
      const reusableRightsVerified = ['PUBLIC_DOMAIN', 'OPEN_LICENSE'].includes(book.rightsClassification || '') && !!book.rightsNote?.trim();
      if (!supportedProvider || !reusableRightsVerified) {
        setError('此 EPUB 的来源或可复用权利尚未核验，已禁止通过本地代理阅读。请改用官方来源页面。');
        setLoading(false);
        return;
      }

      try {
        // Dynamically import epub.js (ESM)
        const ePub = (await import('epubjs')).default;

        const proxyUrl = `/api/library/epub-proxy?bookId=${encodeURIComponent(book.id)}`;
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
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
      try { activeRendition?.destroy?.(); } catch {}
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
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="epub-reader-title" tabIndex={-1} className="fixed inset-0 z-50 bg-[var(--one-bg,#030712)] flex flex-col focus:outline-none text-[var(--one-text,#e8edf5)]">
      {/* Toolbar */}
      <header className="min-h-14 border-b border-white/10 px-3 sm:px-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 shrink-0 bg-[rgba(8,12,20,0.88)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2 w-full sm:w-auto min-w-0">
          <div className="flex items-center space-x-3 min-w-0">
            <button ref={closeButtonRef} type="button" onClick={closeReader} aria-label="关闭 EPUB 阅读器" className="min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-100 text-xs font-semibold cursor-pointer shrink-0 transition">
              <X className="w-4 h-4" />
              <span className="sr-only">返回</span>
            </button>
            <div className="min-w-0">
              <h2 id="epub-reader-title" className="text-sm font-bold text-white line-clamp-1">{book.title}</h2>
              <span className="text-[11px] text-slate-400">EPUB · {book.author}</span>
            </div>
          </div>
        </div>

        <div className="flex w-full sm:w-auto flex-col sm:flex-row sm:items-center gap-1.5">
          <div className="flex items-center justify-between sm:justify-start gap-1.5">
            <button type="button" onClick={prev} aria-label="上一页" className="min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-100 cursor-pointer transition">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span aria-label={`阅读进度 ${progress}%`} className="text-[11px] text-slate-300 font-mono px-1">{progress}%</span>
            <button type="button" onClick={next} aria-label="下一页" className="min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-100 cursor-pointer transition">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-1.5">
            <button type="button" onClick={() => adjustFont(-10)} aria-label="缩小字体" className="min-h-11 min-w-11 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs text-slate-200 cursor-pointer transition">A-</button>
            <button type="button" onClick={() => adjustFont(10)} aria-label="增大字体" className="min-h-11 min-w-11 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs text-slate-200 cursor-pointer transition">A+</button>
            <button type="button" onClick={() => setShowToc(!showToc)} aria-label={showToc ? '关闭目录' : '打开目录'} aria-expanded={showToc} aria-controls="epub-reader-toc" className="min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-100 cursor-pointer transition">
              <Menu className="w-4 h-4" />
            </button>
            <button type="button" onClick={toggleFullscreen} aria-label="切换全屏" className="min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-100 cursor-pointer transition">
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <aside aria-label="EPUB 阅读说明" className="border-b border-amber-400/20 bg-amber-500/10 px-4 py-2 text-[11px] leading-relaxed text-amber-100/90">
        <strong className="mr-1">EPUB AI 段落解读暂不可用。</strong>
        阅读与续读仍可使用；这本 EPUB 的具体文件版本、服务器章节正文和 CFI 定位尚未建立可核验关联，因此不会把选文或阅读位置发送给 AI。公版/开放许可标签或已保存的续读 CFI 都不能替代这项核验。若馆藏提供已核实的 TXT/正文版本，可改用该版本的段落解读。
      </aside>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {showToc && (
          <aside id="epub-reader-toc" aria-label="EPUB 目录" className="absolute inset-y-0 left-0 z-10 w-[min(80vw,16rem)] border-r border-white/10 bg-[rgba(8,12,20,0.97)] backdrop-blur-xl p-4 overflow-y-auto shrink-0 shadow-2xl md:relative md:inset-auto md:z-auto md:w-64 md:shadow-none">
            <h3 className="text-xs font-semibold text-slate-300 mb-3">目录</h3>
            <div className="space-y-1">
              {toc.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => goTo(item.href)}
                  className="w-full min-h-11 text-left px-3 py-2 rounded-xl text-xs text-slate-300 hover:bg-white/5 hover:text-white cursor-pointer line-clamp-1 transition"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </aside>
        )}

        <div className="flex-1 bg-[#f5f1e8] flex items-center justify-center relative" dir={isRtl ? 'rtl' : 'ltr'} lang={book.language || undefined}>
          {loading && (
              <div role="status" aria-live="polite" className="text-slate-600 text-sm flex items-center space-x-2">
              <BookOpen className="w-5 h-5 animate-pulse" />
              <span>正在加载 EPUB...</span>
            </div>
          )}
          {error && (
            <div role="alert" className="text-red-600 text-sm p-4 text-center max-w-md">
              {error}
              {officialSourceUrl && (
                <a href={officialSourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-10 items-center justify-center rounded-xl border border-red-400/30 bg-red-50 px-4 text-red-700 underline underline-offset-4">
                  前往官方来源页面
                </a>
              )}
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
