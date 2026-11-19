import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  X,
  BookOpen,
  Maximize2,
  Menu,
  Sparkles,
  Languages,
  Loader2,
  Send
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
  const [readerTheme, setReaderTheme] = useState<'light' | 'sepia' | 'dark'>('light');
  const [progress, setProgress] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [aiError, setAiError] = useState('');
  const [aiQuestion, setAiQuestion] = useState('');
  const [currentCfi, setCurrentCfi] = useState<string>('');
  const [visibleText, setVisibleText] = useState('');
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

  useEffect(() => {
    if (!rendition) return;
    try { rendition.themes.select(readerTheme); } catch {}
  }, [rendition, readerTheme]);

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
        try {
          rend.themes.register('light', { body: { background: '#f5f1e8', color: '#1f2937', 'line-height': '1.85' } });
          rend.themes.register('sepia', { body: { background: '#efe4cc', color: '#3b2f1d', 'line-height': '1.85' } });
          rend.themes.register('dark', { body: { background: '#111827', color: '#e5e7eb', 'line-height': '1.85' } });
          rend.themes.select('light');
          rend.themes.fontSize('100%');
          if (isRtl && typeof (rend as any).direction === 'function') (rend as any).direction('rtl');
        } catch {}

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
            if (typeof cfi === 'string') setCurrentCfi(cfi);
            if (ownerId && typeof cfi === 'string' && cfi.startsWith('epubcfi(') && cfi.length <= 2048) {
              queueProgress(Math.round(pct * 100), cfi, book.id, ownerId);
            }
            try {
              const contents = rend.getContents?.() || [];
              const texts = contents.map((c: any) => (c?.document?.body?.innerText || c?.document?.body?.textContent || '') as string).filter(Boolean);
              setVisibleText(texts.join('\n').replace(/\s+/g, ' ').trim().slice(0, 5000));
            } catch {}
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

  const runEpubAi = async (action: 'explain' | 'translate' | 'ask') => {
    setAiOpen(true);
    setAiLoading(true);
    setAiError('');
    try {
      const contextText = visibleText || '';
      if (!contextText && action !== 'ask') {
        setAiError('当前视图文本尚未提取到，请翻页后重试或直接提问。');
        setAiLoading(false);
        return;
      }
      const endpoint = action === 'explain' ? '/api/library/ai/explain-page' : `/api/library-ai/${action}`;
      const ui = /^(en|ar)/i.test(book.language || '') ? (book.language as string).slice(0, 2).toLowerCase() : 'zh';
      const body: any = {
        bookId: book.id,
        title: book.title,
        bookTitle: book.title,
        author: book.author,
        chapterTitle: 'EPUB 当前视图',
        pageText: contextText,
        selectedText: contextText,
        surroundingContext: contextText,
        language: book.language,
        lang: ui,
        uiLanguage: ui,
        question: aiQuestion || undefined,
      };
      if (action === 'translate') body.targetLanguage = ui === 'ar' ? 'ar' : ui === 'en' ? 'en' : 'zh';
      if (action === 'ask') body.question = aiQuestion || (ui === 'en' ? 'Explain the visible content in context.' : ui === 'ar' ? 'اشرح المحتوى الظاهر في سياقه.' : '请结合当前可见内容进行说明。');
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
      const data = await res.json();
      if (data?.success) {
        setAiResult(data.explanation || data.content || '');
      } else {
        setAiError(data?.error || 'AI 暂时不可用。');
      }
    } catch (e: any) {
      setAiError(e?.message || '网络错误，请重试。');
    } finally {
      setAiLoading(false);
    }
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
            <select
              value={readerTheme}
              onChange={(e) => setReaderTheme(e.target.value as 'light' | 'sepia' | 'dark')}
              aria-label="阅读主题"
              className="h-11 rounded-xl border border-white/10 bg-white/5 px-2 text-xs text-slate-200 cursor-pointer"
            >
              <option value="light">浅色</option>
              <option value="sepia">护眼</option>
              <option value="dark">深色</option>
            </select>
            <button type="button" onClick={() => setShowToc(!showToc)} aria-label={showToc ? '关闭目录' : '打开目录'} aria-expanded={showToc} aria-controls="epub-reader-toc" className="min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-100 cursor-pointer transition">
              <Menu className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => setAiOpen(v => !v)} aria-label="AI 阅读助手" className={`min-h-11 min-w-11 flex items-center justify-center rounded-xl border cursor-pointer transition ${aiOpen ? 'bg-emerald-600/30 border-emerald-400/40 text-emerald-200' : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-100'}`}>
              <Sparkles className="w-4 h-4" />
            </button>
            <button type="button" onClick={toggleFullscreen} aria-label="切换全屏" className="min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-100 cursor-pointer transition">
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <aside aria-label="EPUB 阅读说明" className="border-b border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-[11px] leading-relaxed text-emerald-100/90">
        <strong className="mr-1">EPUB AI 辅助已启用（基于当前视图文本）。</strong>
        可对当前可见内容进行讲解/翻译/问答；由于 EPUB 定位与服务端可核验文本未完全关联，AI 结果会基于客户端提取的当前视图上下文，请结合原文核对，不将其视为逐字引文证明。
      </aside>
      {aiOpen && (
        <div className="border-b border-white/10 bg-[rgba(12,18,28,0.96)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <button type="button" onClick={() => runEpubAi('explain')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white"><Sparkles className="w-3.5 h-3.5"/>讲解当前页</button>
            <button type="button" onClick={() => runEpubAi('translate')} className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-200"><Languages className="w-3.5 h-3.5"/>翻译为中文</button>
            <div className="flex-1 min-w-[200px] flex items-center gap-1.5">
              <input value={aiQuestion} onChange={(e)=>setAiQuestion(e.target.value)} placeholder="针对当前可见内容提问…" className="h-9 flex-1 rounded-lg border border-white/10 bg-transparent px-3 text-xs text-slate-100 placeholder:text-slate-500" />
              <button type="button" onClick={() => runEpubAi('ask')} className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white"><Send className="w-3.5 h-3.5"/></button>
            </div>
          </div>
          <div className="max-h-44 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-relaxed text-slate-200 whitespace-pre-wrap">
            {aiLoading ? <div className="flex items-center gap-2 text-slate-400"><Loader2 className="w-4 h-4 animate-spin"/>AI 正在分析当前视图文本…</div> : aiError ? <div className="text-rose-300">{aiError}</div> : aiResult || <div className="text-slate-500">点击上方操作，基于当前 EPUB 可见内容进行讲解、翻译或问答（Gemini 优先）。</div>}
          </div>
        </div>
      )}

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

        <div className={`flex-1 flex items-center justify-center relative ${readerTheme === 'dark' ? 'bg-[#111827]' : readerTheme === 'sepia' ? 'bg-[#efe4cc]' : 'bg-[#f5f1e8]'}`} dir={isRtl ? 'rtl' : 'ltr'} lang={book.language || undefined}>
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
