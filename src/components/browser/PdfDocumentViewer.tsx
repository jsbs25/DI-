import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getDocument,
  GlobalWorkerOptions,
  Util,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Download,
  ExternalLink,
  Languages,
  List,
  Loader2,
  Minus,
  Moon,
  Plus,
  RotateCw,
  Rows3,
  Search,
  Send,
  Sparkles,
  StickyNote,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { Language } from '../../types/index.ts';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

type PdfThemeId = 'light' | 'paper' | 'dark';

const PDF_THEMES: Record<
  PdfThemeId,
  {
    label: string;
    shellBg: string;
    chromeBg: string;
    panelBg: string;
    ink: string;
    muted: string;
    border: string;
    canvasFilter?: string;
    isDark: boolean;
  }
> = {
  light: {
    label: '原始白',
    shellBg: '#F5F5F7',
    chromeBg: '#FFFFFF',
    panelBg: '#FFFFFF',
    ink: '#1D1D1F',
    muted: '#6E6E73',
    border: '#E5E5EA',
    isDark: false,
  },
  paper: {
    label: '护眼纸',
    shellBg: '#EFE7D6',
    chromeBg: '#F8F3E8',
    panelBg: '#FCF9F2',
    ink: '#2B241B',
    muted: '#736654',
    border: '#DDD0B8',
    canvasFilter: 'sepia(0.14) contrast(0.98)',
    isDark: false,
  },
  dark: {
    label: '夜间黑',
    shellBg: '#121215',
    chromeBg: '#1C1C1F',
    panelBg: '#18181C',
    ink: '#EBEBF0',
    muted: '#9A9AA0',
    border: '#2E2E34',
    isDark: true,
  },
};

interface OverlayTextSpan {
  id: string;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
}

export interface WordLookupEntry {
  word: string;
  reading: string;
  partOfSpeech: string;
  root: string;
  meaning: string;
  contextMeaning: string;
  example: string;
}

export interface PdfDocumentViewerProps {
  sourceUrl: string;
  title: string;
  lang: Language;
  /** Optional original external source URL (e.g. IslamHouse / Archive / Noor page). */
  originPageUrl?: string;
  /** Library book id for progress/reading-state persistence. */
  bookId?: string;
  /** Book content language (ar/zh/en) for AI context and RTL hints. */
  contentLanguage?: string;
  /** Optional chapter/section label for AI context. */
  chapterTitle?: string;
  /** Resume state from shelf. */
  initialState?: {
    page?: number;
    zoom?: number;
    theme?: PdfThemeId;
    viewMode?: 'single' | 'continuous';
    rotation?: number;
  };
  /** Callback to return to Bookshelf / Library. */
  onClose?: () => void;
}

function resolveProxyPdfUrl(rawUrl: string, title: string, download = false): string {
  if (!rawUrl) return rawUrl;
  if (rawUrl.startsWith('/api/library/pdf-stream')) {
    if (!download) return rawUrl;
    return rawUrl.includes('download=') ? rawUrl : `${rawUrl}&download=1`;
  }
  if (rawUrl.startsWith('/api/library/local-pdfs/') || rawUrl.startsWith('/') || rawUrl.startsWith('blob:')) {
    if (!download) return rawUrl;
    return rawUrl.includes('?') ? `${rawUrl}&download=1` : `${rawUrl}?download=1&filename=${encodeURIComponent(title)}`;
  }
  const params = new URLSearchParams({ url: rawUrl, filename: title.slice(0, 80) });
  if (download) params.set('download', '1');
  return `/api/library/pdf-stream?${params.toString()}`;
}

function cleanWordToken(raw: string): string {
  return raw
    .replace(/^[\s.,;:!?()[\]{}"'«»„“”‘’—–\-_/\\•·،؛؟。，、！？（）【】《》]+/, '')
    .replace(/[\s.,;:!?()[\]{}"'«»„“”‘’—–\-_/\\•·،؛؟。，、！？（）【】《》]+$/, '')
    .trim();
}

function splitTokensForClick(line: string): string[] {
  if (!line.trim()) return [];
  // Keep whitespace so layout matches closely, while splitting Arabic/Latin words cleanly
  return line.split(/(\s+)/);
}

function extractPageVocabulary(pageText: string): string[] {
  if (!pageText.trim()) return [];
  const matches = pageText.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]{2,}|[A-Za-z][A-Za-z'-]{2,}|[\u4e00-\u9fff]{2,4}/g) || [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of matches) {
    const cleaned = cleanWordToken(raw);
    if (!cleaned || cleaned.length < 2) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= 36) break;
  }
  return result;
}

interface ContinuousPdfPageProps {
  pdf: PDFDocumentProxy;
  pageNum: number;
  zoom: number;
  rotation: number;
  theme: typeof PDF_THEMES.light;
  isActive: boolean;
  isChinese: boolean;
  registerRef: (el: HTMLDivElement | null) => void;
  registerCanvas: (canvas: HTMLCanvasElement | null) => void;
  onActivate: () => void;
  onTextExtracted: (text: string, spans: OverlayTextSpan[]) => void;
  onLookupWord: (word: string, context?: string) => void;
}

const ContinuousPdfPage: React.FC<ContinuousPdfPageProps> = ({
  pdf, pageNum, zoom, rotation, theme, isActive, isChinese,
  registerRef, registerCanvas, onActivate, onTextExtracted, onLookupWord,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [spans, setSpans] = useState<OverlayTextSpan[]>([]);

  useEffect(() => {
    registerRef(containerRef.current);
    return () => registerRef(null);
  }, [registerRef, pageNum]);

  useEffect(() => {
    if (isActive) registerCanvas(canvasRef.current);
  }, [isActive, registerCanvas, dims.w, dims.h]);

  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    pdf.getPage(pageNum).then(async (page) => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssViewport = page.getViewport({ scale: zoom, rotation });
      const hiDpiViewport = page.getViewport({ scale: zoom * dpr, rotation });
      const cssW = Math.ceil(cssViewport.width);
      const cssH = Math.ceil(cssViewport.height);
      canvas.width = Math.ceil(hiDpiViewport.width);
      canvas.height = Math.ceil(hiDpiViewport.height);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      setDims({ w: cssW, h: cssH });
      renderTask = page.render({ canvas, canvasContext: ctx, viewport: hiDpiViewport });
      await renderTask.promise.catch(() => {});
      try {
        const textContent = await page.getTextContent();
        if (cancelled) return;
        const out: OverlayTextSpan[] = [];
        const parts: string[] = [];
        textContent.items.forEach((rawItem, idx) => {
          if (!('str' in rawItem)) return;
          const text = rawItem.str;
          if (!text || !text.trim()) return;
          parts.push(text);
          try {
            const tx = Util.transform(cssViewport.transform, rawItem.transform);
            const fontSize = Math.max(9, Math.min(64, Math.hypot(tx[2], tx[3]) || Math.hypot(tx[0], tx[1]) || 12));
            const left = tx[4];
            const top = tx[5] - fontSize * 0.88;
            const width = Math.max(10, (rawItem.width || 0) * cssViewport.scale);
            const height = fontSize * 1.18;
            if (Number.isFinite(left) && Number.isFinite(top)) {
              out.push({ id: `p${pageNum}_${idx}`, text, left, top, width, height, fontSize });
            }
          } catch {}
        });
        setSpans(out);
        if (isActive) onTextExtracted(parts.join(' ').replace(/\s+/g, ' ').trim(), out);
      } catch {
        if (isActive) onTextExtracted('', []);
      }
    }).catch(() => {});
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [pdf, pageNum, zoom, rotation, isActive, onTextExtracted]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      const e = entries[0];
      if (e && e.isIntersecting && e.intersectionRatio >= 0.45) onActivate();
    }, { threshold: [0.45, 0.6, 0.8] });
    obs.observe(el);
    return () => obs.disconnect();
  }, [onActivate]);

  return (
    <div ref={containerRef} data-pdf-page={pageNum} className="relative shrink-0">
      <div className="mb-1 text-center text-[10px]" style={{ color: isActive ? '#10B981' : 'inherit', opacity: isActive ? 1 : 0.5 }}>P.{pageNum}</div>
      <div className="relative mx-auto" style={dims.w > 0 ? { width: dims.w, height: dims.h } : undefined}>
        <canvas
          ref={canvasRef}
          aria-label={`PDF page ${pageNum}`}
          className={`block rounded-lg shadow-[0_14px_42px_rgba(0,0,0,0.22)] transition-all ${isActive ? 'ring-2 ring-emerald-500/40' : ''}`}
          style={theme.canvasFilter ? { filter: theme.canvasFilter } : undefined}
        />
        {isActive && spans.length > 0 && dims.w > 0 && (
          <div className="absolute inset-0 overflow-hidden rounded-lg" style={{ width: dims.w, height: dims.h }}>
            {spans.map((span) => {
              const tokens = splitTokensForClick(span.text);
              return (
                <div key={span.id} style={{ position: 'absolute', left: `${span.left}px`, top: `${span.top}px`, minWidth: `${span.width}px`, height: `${span.height}px`, fontSize: `${span.fontSize}px`, lineHeight: 1.05, whiteSpace: 'pre' }}>
                  {tokens.map((tok, i) => {
                    const clean = cleanWordToken(tok);
                    if (!clean) return <span key={i} className="text-transparent select-none">{tok}</span>;
                    return (
                      <button key={i} type="button" onClick={(e) => { e.stopPropagation(); void onLookupWord(clean, span.text); }} title={isChinese ? `点击让 AI 查询「${clean}」` : `Look up "${clean}"`} className="inline cursor-pointer rounded-[3px] text-transparent transition-colors hover:bg-emerald-400/28 focus:bg-emerald-400/32 focus:outline-none" style={{ fontSize: 'inherit', lineHeight: 'inherit', padding: 0, margin: 0, border: 'none' }}>{tok}</button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export const PdfDocumentViewer: React.FC<PdfDocumentViewerProps> = ({
  sourceUrl,
  title,
  lang,
  originPageUrl,
  bookId,
  contentLanguage,
  chapterTitle,
  initialState,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const continuousActiveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const continuousPageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(Math.max(1, Math.floor(initialState?.page || 1)));
  const [pageInput, setPageInput] = useState(String(Math.max(1, Math.floor(initialState?.page || 1))));
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(typeof initialState?.zoom === 'number' ? Math.max(0.65, Math.min(2.6, initialState.zoom)) : 1.2);
  const [themeId, setThemeId] = useState<PdfThemeId>(initialState?.theme || 'paper');
  const [viewMode, setViewMode] = useState<'single' | 'continuous'>(initialState?.viewMode || 'single');
  const [rotation, setRotation] = useState<number>(((Math.round((initialState?.rotation || 0) / 90) * 90) % 360 + 360) % 360);
  const [searchText, setSearchText] = useState('');
  const [matchingPages, setMatchingPages] = useState<number[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Interactive PDF text layer for tap-any-word lookup + page text extraction
  const [canvasDims, setCanvasDims] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [overlaySpans, setOverlaySpans] = useState<OverlayTextSpan[]>([]);
  const [currentPageText, setCurrentPageText] = useState('');
  const [wordBarOpen, setWordBarOpen] = useState(false);
  const [manualWordInput, setManualWordInput] = useState('');

  // AI Page Explanation Drawer
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiAction, setAiAction] = useState<'explain' | 'translate' | 'summarize' | 'ask' | 'ocr'>('explain');
  const [aiTargetLang, setAiTargetLang] = useState<'zh' | 'en' | 'ar'>('zh');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiExplanation, setAiExplanation] = useState('');
  const [aiExplainedPage, setAiExplainedPage] = useState<number | null>(null);
  const [aiError, setAiError] = useState('');
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiUsedVision, setAiUsedVision] = useState(false);
  const [aiProviderInfo, setAiProviderInfo] = useState<string>('');

  // Page bookmarks/notes (library annotations)
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  // Tap-Any-Word AI Dictionary Popover
  const [lookupWord, setLookupWord] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupEntry, setLookupEntry] = useState<WordLookupEntry | null>(null);
  const [lookupError, setLookupError] = useState('');

  const isChinese = lang === 'zh';
  const effectiveContentLang = contentLanguage || (title.match(/[\u0600-\u06FF]/) ? 'ar' : undefined);
  const streamUrl = resolveProxyPdfUrl(sourceUrl, title, false);
  const downloadUrl = resolveProxyPdfUrl(sourceUrl, title, true);
  const theme = PDF_THEMES[themeId];
  const isLastPage = pageCount > 0 && pageNumber >= pageCount;

  const pageWords = useMemo(() => extractPageVocabulary(currentPageText), [currentPageText]);

  useEffect(() => {
    setPageInput(String(pageNumber));
  }, [pageNumber]);

  // Load annotations for this book (bookmarks/notes per page)
  useEffect(() => {
    if (!bookId) { setAnnotations([]); return; }
    let cancelled = false;
    fetch(`/api/library/books/${encodeURIComponent(bookId)}/annotations`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => { if (!cancelled && data?.success && Array.isArray(data.annotations)) setAnnotations(data.annotations); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [bookId]);

  // Persist PDF reading state (page/zoom/theme/viewMode/rotation/progress) for resume
  useEffect(() => {
    if (!bookId || !pageCount) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const progress = Math.min(100, Math.max(0, Math.round((pageNumber / pageCount) * 100)));
      fetch(`/api/library/shelf/${encodeURIComponent(bookId)}/pdf-reading-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ progress, page: pageNumber, zoom, theme: themeId, viewMode, rotation }),
      }).catch(() => {});
    }, 700);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [bookId, pageNumber, pageCount, zoom, themeId, viewMode, rotation]);

  useEffect(() => {
    let cancelled = false;
    setDocumentProxy(null);
    setPageNumber(1);
    setPageInput('1');
    setPageCount(0);
    setMatchingPages([]);
    setOverlaySpans([]);
    setCurrentPageText('');
    setAiExplanation('');
    setAiExplainedPage(null);
    setLookupWord(null);
    setLookupEntry(null);
    setError('');
    setStatus(isChinese ? '正在载入 PDF 典籍…' : 'Loading PDF document…');

    const task = getDocument({
      url: streamUrl,
      withCredentials: false,
      cMapPacked: true,
    });

    task.promise
      .then((pdf) => {
        if (cancelled) return;
        setDocumentProxy(pdf);
        setPageCount(pdf.numPages);
        const initPage = Math.max(1, Math.min(pdf.numPages, Math.floor(initialState?.page || 1)));
        setPageNumber(initPage);
        setPageInput(String(initPage));
        setStatus('');
      })
      .catch((reason) => {
        if (cancelled) return;
        const msg = reason instanceof Error ? reason.message : String(reason);
        setError(
          isChinese
            ? `PDF 载入未完成：${msg}。您可以点击右上角「下载 PDF」直接下载到本地阅读。`
            : `Could not load PDF: ${msg}. You can still download the PDF directly.`
        );
        setStatus('');
      });

    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [streamUrl, isChinese]);

  useEffect(() => {
    if (!documentProxy) return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;

    documentProxy
      .getPage(pageNumber)
      .then(async (page) => {
        if (cancelled) return;
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cssViewport = page.getViewport({ scale: zoom, rotation });
        const hiDpiViewport = page.getViewport({ scale: zoom * dpr, rotation });

        const cssW = Math.ceil(cssViewport.width);
        const cssH = Math.ceil(cssViewport.height);
        canvas.width = Math.ceil(hiDpiViewport.width);
        canvas.height = Math.ceil(hiDpiViewport.height);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        setCanvasDims({ width: cssW, height: cssH });

        renderTask = page.render({ canvas, canvasContext: context, viewport: hiDpiViewport });
        const renderPromise = renderTask.promise.catch((reason) => {
          if (!cancelled && (reason as Error)?.name !== 'RenderingCancelledException') {
            setError(reason instanceof Error ? reason.message : String(reason));
          }
        });

        // Extract selectable/clickable text layer in parallel
        try {
          const textContent = await page.getTextContent();
          if (cancelled) return;

          const spans: OverlayTextSpan[] = [];
          const fullTextParts: string[] = [];

          textContent.items.forEach((rawItem, idx) => {
            if (!('str' in rawItem)) return;
            const text = rawItem.str;
            if (!text || !text.trim()) return;
            fullTextParts.push(text);

            try {
              const tx = Util.transform(cssViewport.transform, rawItem.transform);
              const fontSize = Math.max(9, Math.min(64, Math.hypot(tx[2], tx[3]) || Math.hypot(tx[0], tx[1]) || 12));
              const left = tx[4];
              const top = tx[5] - fontSize * 0.88;
              const width = Math.max(10, (rawItem.width || 0) * cssViewport.scale);
              const height = fontSize * 1.18;

              if (Number.isFinite(left) && Number.isFinite(top)) {
                spans.push({
                  id: `p${pageNumber}_${idx}`,
                  text,
                  left,
                  top,
                  width,
                  height,
                  fontSize,
                });
              }
            } catch {
              // Skip malformed PDF text matrix items
            }
          });

          setOverlaySpans(spans);
          setCurrentPageText(fullTextParts.join(' ').replace(/\s+/g, ' ').trim());
        } catch {
          if (!cancelled) {
            setOverlaySpans([]);
            setCurrentPageText('');
          }
        }

        await renderPromise;
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [documentProxy, pageNumber, zoom, rotation]);

  const scrollToPdfPage = useCallback((n: number) => {
    const el = continuousPageRefs.current[n];
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);

  // In continuous mode, keep active page in view when page changes via controls
  useEffect(() => {
    if (viewMode !== 'continuous') return;
    const t = setTimeout(() => scrollToPdfPage(pageNumber), 0);
    return () => clearTimeout(t);
  }, [viewMode, pageNumber, scrollToPdfPage]);

  // Keyboard navigation + Escape close
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        if (lookupWord) {
          setLookupWord(null);
        } else if (aiPanelOpen) {
          setAiPanelOpen(false);
        } else if (onClose) {
          onClose();
        }
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        setPageNumber((p) => Math.min(pageCount || 1, p + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setPageNumber((p) => Math.max(1, p - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pageCount, lookupWord, aiPanelOpen, onClose]);

  const handleJumpPage = (e: React.FormEvent) => {
    e.preventDefault();
    const target = Math.max(1, Math.min(pageCount || 1, Number.parseInt(pageInput, 10) || 1));
    setPageNumber(target);
    if (viewMode === 'continuous') setTimeout(() => scrollToPdfPage(target), 0);
  };

  const runLibraryAiAction = useCallback(
    async (action: 'explain' | 'translate' | 'summarize' | 'ask' | 'ocr', customQuestion?: string) => {
      setAiPanelOpen(true);
      setAiAction(action);
      setAiLoading(true);
      setAiError('');
      setAiProviderInfo('');
      const q = typeof customQuestion === 'string' ? customQuestion.trim() : '';
      let pageImageBase64: string | undefined;
      const ocrHint = /ocr|识别|识文|扫描/i.test(q || '');
      const needsVision = action === 'ocr' || ocrHint || currentPageText.trim().length < 40;
      const visionCanvas = viewMode === 'continuous' ? continuousActiveCanvasRef.current : canvasRef.current;
      if (needsVision && visionCanvas && visionCanvas.width > 0) {
        try { pageImageBase64 = visionCanvas.toDataURL('image/jpeg', 0.72); } catch {}
      }
      setAiUsedVision(Boolean(needsVision && pageImageBase64));

      const endpoint = action === 'explain' ? '/api/library/ai/explain-page' : `/api/library-ai/${action}`;
      try {
        const body: Record<string, unknown> = {
          bookId,
          title,
          bookTitle: title,
          chapterTitle,
          pageNumber,
          totalPages: pageCount,
          pageText: currentPageText,
          language: effectiveContentLang,
          lang: isChinese ? 'zh' : 'en',
          uiLanguage: isChinese ? 'zh' : 'en',
        };
        if (action === 'explain') {
          body.question = q || undefined;
          body.pageImageBase64 = pageImageBase64;
        } else if (action === 'translate') {
          body.selectedText = currentPageText || undefined;
          body.pageImageBase64 = pageImageBase64;
          body.targetLanguage = aiTargetLang;
          body.question = q || undefined;
        } else if (action === 'summarize') {
          body.selectedText = currentPageText || undefined;
          body.pageImageBase64 = pageImageBase64;
          body.question = q || undefined;
        } else if (action === 'ask') {
          body.question = q || aiQuestion || (isChinese ? '请结合当前页内容回答。' : 'Answer based on this page.');
          body.pageImageBase64 = pageImageBase64;
          body.surroundingContext = currentPageText;
        } else if (action === 'ocr') {
          body.pageImageBase64 = pageImageBase64;
          body.selectedText = currentPageText || undefined;
          body.question = q || (isChinese ? '请识别本页可见文字。' : 'Extract visible text from this page.');
        }
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data?.success) {
          let textOut = data.explanation || data.content || '';
          if (action === 'ocr') {
            const ocrText = data?.data?.text || (typeof data?.data === 'object' && data?.data && 'text' in data.data ? String((data.data as any).text || '') : '');
            const warn = Array.isArray(data?.data?.warnings) ? (data.data.warnings as any[]).join('；') : '';
            const conf = data?.data?.confidenceNote ? String(data.data.confidenceNote) : '';
            const guess = data?.data?.languageGuess ? String(data.data.languageGuess) : '';
            textOut = [
              isChinese ? `【OCR 识别结果 · 第 ${pageNumber} 页】` : `[OCR Result · Page ${pageNumber}]`,
              ocrText ? (isChinese ? `识别文本：\n${ocrText}` : `Extracted text:\n${ocrText}`) : '',
              guess ? (isChinese ? `语言判断：${guess}` : `Language: ${guess}`) : '',
              conf ? (isChinese ? `质量说明：${conf}` : `Confidence: ${conf}`) : '',
              warn ? (isChinese ? `注意：${warn}` : `Warnings: ${warn}`) : '',
              textOut && textOut !== ocrText ? (isChinese ? `\n补充说明：\n${textOut}` : `\nNotes:\n${textOut}`) : '',
            ].filter(Boolean).join('\n\n');
          } else if (!textOut && typeof data?.data?.text === 'string') {
            textOut = data.data.text;
          }
          setAiExplanation(textOut || (isChinese ? 'AI 已完成分析，但未返回可显示文本。' : 'No displayable text returned.'));
          setAiExplainedPage(pageNumber);
          const p = data.provider ? ` · ${data.provider}${data.model ? '/' + data.model : ''}` : '';
          setAiProviderInfo(p);
          if (q) setAiQuestion('');
        } else {
          setAiError(data?.error || (isChinese ? 'AI 处理失败，请稍后重试。' : 'AI request failed.'));
        }
      } catch {
        setAiError(isChinese ? '网络波动，请稍后重试。' : 'Network error, please retry.');
      } finally {
        setAiLoading(false);
      }
    },
    [aiQuestion, aiTargetLang, bookId, chapterTitle, currentPageText, effectiveContentLang, isChinese, pageCount, pageNumber, title]
  );

  const handleExplainCurrentPage = useCallback(
    async (customQuestion?: string) => runLibraryAiAction('explain', customQuestion),
    [runLibraryAiAction]
  );

  const handleLookupWord = useCallback(
    async (rawWord: string, contextSentence?: string) => {
      const cleaned = cleanWordToken(rawWord);
      if (!cleaned) return;
      setLookupWord(cleaned);
      setLookupLoading(true);
      setLookupError('');
      setLookupEntry(null);

      try {
        const res = await fetch('/api/library/ai/lookup-word', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            word: cleaned,
            selectedText: cleaned,
            contextSentence: (contextSentence || currentPageText).slice(0, 600),
            surroundingContext: (contextSentence || currentPageText).slice(0, 1200),
            bookTitle: title,
            title,
            bookId,
            chapterTitle,
            pageNumber,
            pageText: currentPageText.slice(0, 1500),
            language: effectiveContentLang,
            lang: isChinese ? 'zh' : 'en',
            uiLanguage: isChinese ? 'zh' : 'en',
          }),
        });
        const data = await res.json();
        if (data?.success && data.entry) {
          setLookupEntry(data.entry);
        } else {
          setLookupError(data?.error || (isChinese ? '暂时无法查出该词释义。' : 'Could not look up this word.'));
        }
      } catch {
        setLookupError(isChinese ? '网络波动，请稍后重试查词。' : 'Network error.');
      } finally {
        setLookupLoading(false);
      }
    },
    [bookId, chapterTitle, currentPageText, effectiveContentLang, isChinese, pageNumber, title]
  );

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const query = searchText.trim().toLocaleLowerCase();
    if (!documentProxy || !query) {
      setMatchingPages([]);
      setStatus(isChinese ? '请输入要查找的文字。' : 'Enter text to search for.');
      return;
    }

    setStatus(isChinese ? '正在检索全文…' : 'Searching document text…');
    const hits: number[] = [];
    const scanLimit = Math.min(documentProxy.numPages, 120);
    for (let pageIndex = 1; pageIndex <= scanLimit; pageIndex += 1) {
      const page = await documentProxy.getPage(pageIndex);
      const text = await page.getTextContent();
      const pageText = text.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .toLocaleLowerCase();
      if (pageText.includes(query)) hits.push(pageIndex);
    }

    setMatchingPages(hits);
    if (hits.length > 0) {
      setPageNumber(hits[0]);
      setStatus(isChinese ? `找到 ${hits.length} 页匹配内容` : `Found ${hits.length} matching pages`);
    } else {
      setStatus(
        isChinese
          ? '未在前 120 页检索到该文字（部分扫描古籍为图像页，可直接点「AI 讲解本页」识图精讲）。'
          : 'No matching text found in first 120 pages.'
      );
    }
  };

  const pageChapterId = useMemo(() => `pdf_page_${pageNumber}`, [pageNumber]);
  const pageBookmark = useMemo(
    () => annotations.find((a) => a.bookId === bookId && a.chapterId === pageChapterId && (a.kind === 'bookmark' || String(a.selectedText || '').startsWith('书签'))),
    [annotations, bookId, pageChapterId]
  );
  const pageNotes = useMemo(
    () => annotations.filter((a) => a.bookId === bookId && (a.chapterId === pageChapterId || a.pageIndex === pageNumber) && a.kind !== 'bookmark'),
    [annotations, bookId, pageChapterId, pageNumber]
  );

  const togglePageBookmark = useCallback(async () => {
    if (!bookId) return;
    if (pageBookmark) {
      try {
        await fetch(`/api/library/books/${encodeURIComponent(bookId)}/annotations/${encodeURIComponent(pageBookmark.id)}`, { method: 'DELETE', credentials: 'include' });
      } catch {}
      setAnnotations((prev) => prev.filter((a) => a.id !== pageBookmark.id));
      return;
    }
    try {
      const res = await fetch(`/api/library/books/${encodeURIComponent(bookId)}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          chapterId: pageChapterId,
          selectedText: isChinese ? `书签：第 ${pageNumber} 页` : `Bookmark: Page ${pageNumber}`,
          note: (currentPageText || '').slice(0, 80),
          kind: 'bookmark',
          pageIndex: pageNumber,
        }),
      });
      const data = await res.json();
      if (data?.success && data.annotation) setAnnotations((prev) => [data.annotation, ...prev]);
    } catch {}
  }, [bookId, currentPageText, isChinese, pageBookmark, pageChapterId, pageNumber]);

  const savePageNote = useCallback(async () => {
    if (!bookId || !noteDraft.trim()) return;
    try {
      const res = await fetch(`/api/library/books/${encodeURIComponent(bookId)}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          chapterId: pageChapterId,
          selectedText: (currentPageText || title).slice(0, 120),
          note: noteDraft.trim(),
          aiExplanation: aiExplanation || undefined,
          kind: 'note',
          pageIndex: pageNumber,
        }),
      });
      const data = await res.json();
      if (data?.success && data.annotation) {
        setAnnotations((prev) => [data.annotation, ...prev]);
        setNoteDraft('');
      }
    } catch {}
  }, [aiExplanation, bookId, currentPageText, isChinese, noteDraft, pageChapterId, pageNumber, title]);

  const deleteAnnotation = useCallback(async (id: string) => {
    if (!bookId) return;
    try { await fetch(`/api/library/books/${encodeURIComponent(bookId)}/annotations/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' }); } catch {}
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }, [bookId]);


  return (
    <section
      aria-label={isChinese ? 'ONE 智能 PDF 阅读器' : 'PDF Document Reader'}
      className="flex h-full w-full flex-col overflow-hidden transition-colors duration-200"
      style={{
        backgroundColor: theme.shellBg,
        color: theme.ink,
      }}
    >
      {/* Top Toolbar: Unmistakable Back Button + Book Title + Page Nav + AI Tutor + Word Lookup + Download */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5 sm:px-5"
        style={{ backgroundColor: theme.chromeBg, borderColor: theme.border }}
      >
        {/* Left: Back Button + Title + Page Controls */}
        <div className="flex min-w-0 items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition hover:opacity-85"
              style={{
                borderColor: theme.border,
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                color: theme.ink,
              }}
            >
              <ArrowLeft className="h-4 w-4" />
              <span>{isChinese ? '返回' : 'Back'}</span>
            </button>
          )}

          <div className="hidden min-w-0 max-w-[200px] lg:block xl:max-w-[280px]">
            <div className="truncate text-xs font-semibold" title={title}>
              {title}
            </div>
            <div className="truncate text-[10px]" style={{ color: theme.muted }}>
              {isChinese ? '点词自动 AI 查义 · 支持本页精讲' : 'Tap any word for AI dictionary'}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
              disabled={pageNumber <= 1}
              aria-label="上一页"
              className="inline-flex h-9 w-8 cursor-pointer items-center justify-center rounded-xl border transition disabled:opacity-35"
              style={{ borderColor: theme.border }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>

            <form onSubmit={handleJumpPage} className="flex items-center gap-1 text-xs font-medium">
              <input
                type="text"
                inputMode="numeric"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ''))}
                aria-label="页码"
                className="h-9 w-11 rounded-xl border bg-transparent text-center text-xs font-semibold tabular-nums focus:outline-none"
                style={{ borderColor: theme.border }}
              />
              <span className="text-[11px]" style={{ color: theme.muted }}>
                / {pageCount || '…'}
              </span>
            </form>

            <button
              type="button"
              onClick={() => setPageNumber((p) => Math.min(pageCount || 1, p + 1))}
              disabled={!pageCount || pageNumber >= pageCount}
              aria-label="下一页"
              className="inline-flex h-9 w-8 cursor-pointer items-center justify-center rounded-xl border transition disabled:opacity-35"
              style={{ borderColor: theme.border }}
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Center: AI Page Explain + Tap-Word Bar + Zoom + Paper Theme */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (aiPanelOpen && aiAction === 'explain' && aiExplainedPage === pageNumber && aiExplanation) {
                setAiPanelOpen(false);
              } else {
                void runLibraryAiAction('explain');
              }
            }}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{isChinese ? 'AI 讲解' : 'AI Explain'}</span>
          </button>
          <button
            type="button"
            onClick={() => void runLibraryAiAction('translate')}
            className="hidden h-9 cursor-pointer items-center gap-1 rounded-xl border px-2.5 text-xs font-medium transition hover:opacity-85 sm:inline-flex"
            style={{ borderColor: theme.border }}
          >
            <span>{isChinese ? '翻译' : 'Translate'}</span>
          </button>
          <button
            type="button"
            onClick={() => void runLibraryAiAction('summarize')}
            className="hidden h-9 cursor-pointer items-center gap-1 rounded-xl border px-2.5 text-xs font-medium transition hover:opacity-85 md:inline-flex"
            style={{ borderColor: theme.border }}
          >
            <span>{isChinese ? '总结' : 'Summary'}</span>
          </button>

          <button
            type="button"
            onClick={() => setWordBarOpen((v) => !v)}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition hover:opacity-85"
            style={{
              borderColor: wordBarOpen ? '#10B981' : theme.border,
              backgroundColor: wordBarOpen ? 'rgba(16,185,129,0.14)' : 'transparent',
              color: wordBarOpen ? (theme.isDark ? '#6EE7B7' : '#047857') : theme.ink,
            }}
          >
            <Languages className="h-3.5 w-3.5" />
            <span>{isChinese ? '点词查义' : 'Lookup Word'}</span>
          </button>
          {bookId && (
            <>
              <button
                type="button"
                onClick={() => void togglePageBookmark()}
                title={isChinese ? (pageBookmark ? '移除书签' : '添加本页书签') : (pageBookmark ? 'Remove bookmark' : 'Bookmark page')}
                className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-xl border px-2.5 text-xs font-medium transition hover:opacity-85"
                style={{ borderColor: pageBookmark ? '#F59E0B' : theme.border, color: pageBookmark ? '#D97706' : theme.ink, backgroundColor: pageBookmark ? 'rgba(245,158,11,0.12)' : 'transparent' }}
              >
                {pageBookmark ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{isChinese ? '书签' : 'Mark'}</span>
              </button>
              <button
                type="button"
                onClick={() => setAnnotationsOpen((v) => !v)}
                title={isChinese ? '笔记与书签' : 'Notes & bookmarks'}
                className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-xl border px-2.5 text-xs font-medium transition hover:opacity-85"
                style={{ borderColor: annotationsOpen ? '#10B981' : theme.border, color: annotationsOpen ? '#059669' : theme.ink, backgroundColor: annotationsOpen ? 'rgba(16,185,129,0.12)' : 'transparent' }}
              >
                <StickyNote className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{isChinese ? '笔记' : 'Notes'}</span>
              </button>
            </>
          )}

          <div
            className="hidden items-center rounded-xl border p-0.5 sm:inline-flex"
            style={{ borderColor: theme.border }}
          >
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.65, Number((z - 0.15).toFixed(2))))}
              aria-label="缩小"
              className="inline-flex h-8 w-7 cursor-pointer items-center justify-center rounded-lg hover:opacity-75"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="px-1.5 text-[11px] font-medium tabular-nums">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.4, Number((z + 0.15).toFixed(2))))}
              aria-label="放大"
              className="inline-flex h-8 w-7 cursor-pointer items-center justify-center rounded-lg hover:opacity-75"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div
            className="hidden items-center gap-0.5 rounded-xl border p-0.5 text-[11px] md:inline-flex"
            style={{ borderColor: theme.border }}
          >
            {(['light', 'paper', 'dark'] as PdfThemeId[]).map((tid) => (
              <button
                key={tid}
                type="button"
                onClick={() => setThemeId(tid)}
                className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2 font-medium transition"
                style={{
                  backgroundColor: themeId === tid ? (tid === 'dark' ? '#32323A' : '#1D1D1F') : 'transparent',
                  color: themeId === tid ? '#FFFFFF' : theme.muted,
                }}
              >
                {tid === 'dark' ? <Moon className="h-3 w-3" /> : tid === 'paper' ? <BookOpen className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
                <span>{PDF_THEMES[tid].label}</span>
              </button>
            ))}
          </div>

          <div className="hidden items-center gap-0.5 rounded-xl border p-0.5 md:inline-flex" style={{ borderColor: theme.border }}>
            <button
              type="button"
              onClick={() => setViewMode('single')}
              title={isChinese ? '单页' : 'Single page'}
              className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2 text-[11px] font-medium transition"
              style={{ backgroundColor: viewMode === 'single' ? (theme.isDark ? '#32323A' : '#1D1D1F') : 'transparent', color: viewMode === 'single' ? '#FFFFFF' : theme.muted }}
            >
              <BookOpen className="h-3 w-3" />
              <span>{isChinese ? '单页' : 'Single'}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('continuous')}
              title={isChinese ? '连续滚动' : 'Continuous scroll'}
              className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2 text-[11px] font-medium transition"
              style={{ backgroundColor: viewMode === 'continuous' ? (theme.isDark ? '#32323A' : '#1D1D1F') : 'transparent', color: viewMode === 'continuous' ? '#FFFFFF' : theme.muted }}
            >
              <Rows3 className="h-3 w-3" />
              <span>{isChinese ? '连续' : 'Continuous'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            title={isChinese ? '旋转页面' : 'Rotate page'}
            className="hidden h-9 cursor-pointer items-center gap-1 rounded-xl border px-2.5 text-xs font-medium transition hover:opacity-85 md:inline-flex"
            style={{ borderColor: theme.border }}
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span>{isChinese ? '旋转' : 'Rotate'}</span>
          </button>
        </div>

        {/* Right: In-Document Search + Download PDF */}
        <div className="flex items-center gap-1.5">
          <form onSubmit={handleSearch} className="hidden items-center sm:flex">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-50" />
              <input
                type="search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder={isChinese ? '搜书内词…' : 'Search PDF…'}
                className="h-9 w-32 rounded-xl border bg-transparent pl-8 pr-2 text-xs focus:outline-none xl:w-40"
                style={{ borderColor: theme.border }}
              />
            </div>
          </form>

          <a
            href={downloadUrl}
            download
            className="inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-xs font-medium transition hover:opacity-85"
            style={{ borderColor: theme.border, color: theme.ink }}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isChinese ? '保存本地' : 'Download'}</span>
          </a>

          {originPageUrl && (
            <a
              href={originPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-9 items-center gap-1 rounded-xl border px-2.5 text-xs font-medium transition hover:opacity-80 xl:inline-flex"
              style={{ borderColor: theme.border, color: theme.muted }}
              title="原始来源"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Collapsible Tap-Any-Word Strip + Manual Lookup Input (works even on scanned image PDFs) */}
      {wordBarOpen && (
        <div
          className="border-b px-4 py-2.5 text-xs"
          style={{ backgroundColor: theme.panelBg, borderColor: theme.border }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (manualWordInput.trim()) void handleLookupWord(manualWordInput.trim());
              }}
              className="flex items-center gap-1.5"
            >
              <input
                type="text"
                value={manualWordInput}
                onChange={(e) => setManualWordInput(e.target.value)}
                placeholder={isChinese ? '输入不会的阿语/英语词直接查…' : 'Type any word to look up…'}
                className="h-8 w-52 rounded-lg border bg-transparent px-2.5 text-xs focus:outline-none"
                style={{ borderColor: theme.border }}
              />
              <button
                type="submit"
                className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-500"
              >
                <span>{isChinese ? 'AI 查词' : 'Lookup'}</span>
              </button>
            </form>

            {pageWords.length > 0 ? (
              <div className="flex flex-1 flex-wrap items-center gap-1.5">
                <span className="text-[11px]" style={{ color: theme.muted }}>
                  {isChinese ? '本页词条（轻点即查）：' : 'Tap a word:'}
                </span>
                {pageWords.slice(0, 22).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => void handleLookupWord(w)}
                    className="cursor-pointer rounded-md border px-2 py-0.5 text-xs transition hover:border-emerald-500 hover:text-emerald-600"
                    style={{
                      borderColor: lookupWord === w ? '#10B981' : theme.border,
                      backgroundColor: lookupWord === w ? 'rgba(16,185,129,0.14)' : 'transparent',
                    }}
                  >
                    {w}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-[11px]" style={{ color: theme.muted }}>
                {isChinese
                  ? '本页为扫描图像页：可直接输入不会的词查义，或点「AI 讲解本页」识图精讲。'
                  : 'Scanned page: type any word above or use AI Explain Page.'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Status / Search Match Strip */}
      {(status || error || matchingPages.length > 0) && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs"
          style={{ borderColor: theme.border, backgroundColor: theme.chromeBg }}
        >
          <div>
            {error ? (
              <span className="font-medium text-rose-500">{error}</span>
            ) : (
              <span style={{ color: theme.muted }}>{status}</span>
            )}
          </div>
          {matchingPages.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {matchingPages.slice(0, 12).map((hitPage) => (
                <button
                  key={hitPage}
                  type="button"
                  onClick={() => setPageNumber(hitPage)}
                  className="cursor-pointer rounded-md border px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    borderColor: theme.border,
                    backgroundColor: hitPage === pageNumber ? '#10B981' : 'transparent',
                    color: hitPage === pageNumber ? '#FFFFFF' : theme.ink,
                  }}
                >
                  P.{hitPage}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Stage: PDF Canvas (+ Interactive Tap-Word Layer) + Optional Right-Side AI Tutor Panel */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Scrollable PDF Viewport */}
        <div ref={scrollContainerRef} className="flex min-h-0 flex-1 flex-col items-center overflow-auto p-4 sm:p-6">
          {viewMode === 'continuous' && documentProxy && pageCount > 0 ? (
            <div className="flex w-full max-w-full flex-col items-center gap-5">
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                <ContinuousPdfPage
                  key={n}
                  pdf={documentProxy}
                  pageNum={n}
                  zoom={zoom}
                  rotation={rotation}
                  theme={theme}
                  isActive={n === pageNumber}
                  isChinese={isChinese}
                  registerRef={(el) => { continuousPageRefs.current[n] = el; }}
                  registerCanvas={(canvas) => { if (n === pageNumber) continuousActiveCanvasRef.current = canvas; }}
                  onActivate={() => setPageNumber(n)}
                  onTextExtracted={(text, spans) => {
                    if (n === pageNumber) {
                      setCurrentPageText(text);
                      setOverlaySpans(spans);
                    }
                  }}
                  onLookupWord={handleLookupWord}
                />
              ))}
              {isLastPage && (
                <div className="mt-2 w-full max-w-xl rounded-2xl border p-5 text-center shadow-lg" style={{ backgroundColor: theme.panelBg, borderColor: theme.border }}>
                  <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
                  <div className="text-sm font-semibold">{isChinese ? `全书共 ${pageCount} 页已读完` : `Finished all ${pageCount} pages`}</div>
                  <p className="mt-1 text-xs" style={{ color: theme.muted }}>{isChinese ? `《${title}》阅读进度已到达尾页。` : `You have reached the end of "${title}".`}</p>
                  {onClose && <button type="button" onClick={onClose} className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500"><ArrowLeft className="h-4 w-4" /><span>{isChinese ? '读完 · 返回书架' : 'Done · Back to Library'}</span></button>}
                </div>
              )}
            </div>
          ) : (
            <>
              <div
                className="relative shrink-0"
                style={canvasDims.width > 0 ? { width: canvasDims.width, height: canvasDims.height } : undefined}
              >
                <canvas
                  ref={canvasRef}
                  aria-label={title}
                  className="mx-auto block rounded-lg shadow-[0_14px_42px_rgba(0,0,0,0.22)] transition-all"
                  style={theme.canvasFilter ? { filter: theme.canvasFilter } : undefined}
                />

                {/* Transparent Interactive Word Layer directly over PDF text */}
                {overlaySpans.length > 0 && canvasDims.width > 0 && (
                  <div
                    aria-label="可点击查词文本层"
                    className="absolute inset-0 overflow-hidden rounded-lg"
                    style={{ width: canvasDims.width, height: canvasDims.height }}
                  >
                    {overlaySpans.map((span) => {
                      const tokens = splitTokensForClick(span.text);
                      return (
                        <div
                          key={span.id}
                          style={{
                            position: 'absolute',
                            left: `${span.left}px`,
                            top: `${span.top}px`,
                            minWidth: `${span.width}px`,
                            height: `${span.height}px`,
                            fontSize: `${span.fontSize}px`,
                            lineHeight: 1.05,
                            whiteSpace: 'pre',
                          }}
                        >
                          {tokens.map((tok, i) => {
                            const clean = cleanWordToken(tok);
                            if (!clean) {
                              return (
                                <span key={i} className="text-transparent select-none">
                                  {tok}
                                </span>
                              );
                            }
                            return (
                              <button
                                key={i}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleLookupWord(clean, span.text);
                                }}
                                title={isChinese ? `点击让 AI 查询「${clean}」` : `Look up "${clean}"`}
                                className="inline cursor-pointer rounded-[3px] text-transparent transition-colors hover:bg-emerald-400/28 focus:bg-emerald-400/32 focus:outline-none"
                                style={{ fontSize: 'inherit', lineHeight: 'inherit', padding: 0, margin: 0, border: 'none' }}
                              >
                                {tok}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {isLastPage && (
                <div
                  className="mt-6 w-full max-w-xl rounded-2xl border p-5 text-center shadow-lg"
                  style={{ backgroundColor: theme.panelBg, borderColor: theme.border }}
                >
                  <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
                  <div className="text-sm font-semibold">
                    {isChinese ? `全书共 ${pageCount} 页已读完` : `Finished all ${pageCount} pages`}
                  </div>
                  <p className="mt-1 text-xs" style={{ color: theme.muted }}>
                    {isChinese ? `《${title}》阅读进度已到达尾页，你可以随时返回书架或重温本书。` : `You have reached the end of "${title}".`}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                    {onClose && (
                      <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        <span>{isChinese ? '读完 · 返回书架' : 'Done · Back to Library'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPageNumber(1)}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-4 py-2.5 text-xs font-medium transition hover:opacity-80"
                      style={{ borderColor: theme.border, color: theme.ink }}
                    >
                      <span>{isChinese ? '回到第 1 页' : 'Back to Page 1'}</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right-Side AI Page Tutor Drawer ("这一页怎么讲") */}
        {aiPanelOpen && (
          <aside
            className="absolute inset-y-0 right-0 z-30 flex w-[min(94vw,400px)] flex-col border-l shadow-2xl lg:static lg:w-[390px] lg:shadow-none"
            style={{ backgroundColor: theme.panelBg, borderColor: theme.border }}
          >
            <div
              className="flex items-center justify-between gap-2 border-b px-4 py-3"
              style={{ borderColor: theme.border }}
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-500" />
                <div>
                  <div className="text-xs font-semibold">
                    {isChinese ? `AI 阅读助手 · 第 ${pageNumber} 页` : `AI Reading Assistant · Page ${pageNumber}`}
                    <span className="ml-1 font-normal opacity-70">{aiProviderInfo}</span>
                  </div>
                  <div className="text-[10px]" style={{ color: theme.muted }}>
                    {aiUsedVision
                      ? (isChinese ? '已识读扫描页图像（视觉/OCR 辅助）' : 'Scanned page analyzed with vision/OCR aid')
                      : (isChinese ? '基于当前书籍与本页上下文作答，不脱离原文' : 'Grounded in current book/page context')}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setAiPanelOpen(false)}
                  aria-label={isChinese ? '关闭 AI 助手' : 'Close AI assistant'}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg opacity-70 hover:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="border-b px-4 py-2 flex flex-wrap gap-1.5" style={{ borderColor: theme.border }}>
              {([
                { id: 'explain' as const, zh: '讲解', en: 'Explain' },
                { id: 'translate' as const, zh: '翻译', en: 'Translate' },
                { id: 'summarize' as const, zh: '总结', en: 'Summary' },
                { id: 'ask' as const, zh: '问答', en: 'Ask' },
              ]).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => void runLibraryAiAction(a.id)}
                  className="cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-medium transition"
                  style={{ border: `1px solid ${aiAction === a.id ? '#10B981' : theme.border}`, color: aiAction === a.id ? '#059669' : theme.muted, backgroundColor: aiAction === a.id ? 'rgba(16,185,129,0.12)' : 'transparent' }}
                >
                  {isChinese ? a.zh : a.en}
                </button>
              ))}
              <button
                type="button"
                onClick={() => void runLibraryAiAction('ocr')}
                className="cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-medium transition"
                style={{ border: `1px solid ${aiAction === 'ocr' ? '#10B981' : theme.border}`, color: aiAction === 'ocr' ? '#059669' : theme.muted, backgroundColor: aiAction === 'ocr' ? 'rgba(16,185,129,0.12)' : 'transparent' }}
                title={isChinese ? '识别本页文字（扫描/OCR）' : 'OCR/extract text from this page'}
              >
                {isChinese ? '识文' : 'OCR'}
              </button>
              {aiAction === 'translate' && (
                <select
                  value={aiTargetLang}
                  onChange={(e) => setAiTargetLang(e.target.value as 'zh' | 'en' | 'ar')}
                  className="ml-auto h-7 rounded-lg border bg-transparent px-2 text-[11px]"
                  style={{ borderColor: theme.border, color: theme.ink }}
                >
                  <option value="zh">译为中文</option>
                  <option value="en">Translate to English</option>
                  <option value="ar">ترجمة إلى العربية</option>
                </select>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3.5 text-xs leading-relaxed">
              {aiLoading ? (
                <div className="flex flex-col items-center justify-center gap-2.5 py-12 text-center" style={{ color: theme.muted }}>
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                  <div>{isChinese ? `正在深度分析第 ${pageNumber} 页并整理讲解思路…` : 'Analyzing this page…'}</div>
                </div>
              ) : aiError ? (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-rose-500">
                  <div>{aiError}</div>
                  <button
                    type="button"
                    onClick={() => void runLibraryAiAction(aiAction)}
                    className="mt-2 cursor-pointer rounded-lg bg-rose-500 px-3 py-1 text-[11px] font-medium text-white"
                  >
                    {isChinese ? '重新分析' : 'Retry'}
                  </button>
                </div>
              ) : aiExplanation ? (
                <div className="space-y-3 whitespace-pre-wrap leading-7">{aiExplanation}</div>
              ) : (
                <div className="py-8 text-center" style={{ color: theme.muted }}>
                  {isChinese ? '点击下方按钮让 AI 分析当前页怎么讲。' : 'Click to analyze the current page.'}
                </div>
              )}
            </div>

            {/* Follow-up Question Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!aiLoading) void runLibraryAiAction(aiQuestion.trim() ? 'ask' : aiAction, aiQuestion);
              }}
              className="border-t p-3"
              style={{ borderColor: theme.border }}
            >
              <div className="mb-2 flex flex-wrap gap-1.5">
                {(isChinese
                  ? ['用大白话讲这一页', '怎么给初学者讲这段', '逐句翻译重点句']
                  : ['Explain simply', 'How to teach this?', 'Translate key lines']
                ).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={aiLoading}
                    onClick={() => void runLibraryAiAction(aiQuestion ? 'ask' : 'explain', preset)}
                    className="cursor-pointer rounded-lg border px-2 py-1 text-[11px] transition hover:border-emerald-500 disabled:opacity-40"
                    style={{ borderColor: theme.border, color: theme.muted }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  placeholder={isChinese ? '针对这一页继续追问 AI…' : 'Ask a follow-up question…'}
                  className="h-9 flex-1 rounded-xl border bg-transparent px-3 text-xs focus:outline-none"
                  style={{ borderColor: theme.border }}
                />
                <button
                  type="submit"
                  disabled={aiLoading}
                  aria-label="发送追问"
                  className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-emerald-600 text-white transition hover:bg-emerald-500 disabled:opacity-40"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </form>
          </aside>
        )}

        {/* Bookmarks & Notes Panel (library persistence) */}
        {annotationsOpen && bookId && (
          <aside className="absolute inset-y-0 left-0 z-30 flex w-[min(92vw,320px)] flex-col border-r shadow-2xl lg:static lg:w-[300px] lg:shadow-none" style={{ backgroundColor: theme.panelBg, borderColor: theme.border }}>
            <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: theme.border }}>
              <div className="flex items-center gap-1.5 text-xs font-semibold"><StickyNote className="h-3.5 w-3.5 text-emerald-500" /><span>{isChinese ? '笔记与书签' : 'Notes & Bookmarks'}</span></div>
              <button type="button" onClick={() => setAnnotationsOpen(false)} className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg opacity-70 hover:opacity-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="border-b p-3 space-y-2" style={{ borderColor: theme.border }}>
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder={isChinese ? `为第 ${pageNumber} 页添加笔记…` : `Add a note for page ${pageNumber}…`}
                className="h-20 w-full resize-none rounded-xl border bg-transparent p-2 text-xs focus:outline-none"
                style={{ borderColor: theme.border, color: theme.ink }}
              />
              <div className="flex gap-1.5">
                <button type="button" onClick={() => void togglePageBookmark()} className="inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-[11px]" style={{ borderColor: theme.border }}>
                  {pageBookmark ? <BookmarkCheck className="h-3 w-3 text-amber-500" /> : <Bookmark className="h-3 w-3" />} {pageBookmark ? (isChinese ? '已加书签' : 'Bookmarked') : (isChinese ? '加书签' : 'Bookmark')}
                </button>
                <button type="button" onClick={() => void savePageNote()} disabled={!noteDraft.trim()} className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-40">
                  {isChinese ? '保存笔记' : 'Save note'}
                </button>
              </div>
              <div className="text-[10px]" style={{ color: theme.muted }}>{isChinese ? `本页书签/笔记：${(pageBookmark ? 1 : 0) + pageNotes.length} 条` : `This page: ${(pageBookmark ? 1 : 0) + pageNotes.length}`}</div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {annotations.filter(a => a.bookId === bookId).length === 0 ? (
                <div className="p-3 text-center text-[11px]" style={{ color: theme.muted }}>{isChinese ? '暂无笔记或书签' : 'No notes or bookmarks yet'}</div>
              ) : (
                annotations.filter(a => a.bookId === bookId).map((a) => (
                  <div key={a.id} className="rounded-xl border p-2 text-[11px]" style={{ borderColor: theme.border }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{a.kind === 'bookmark' || String(a.selectedText||'').startsWith('书签') ? '🔖 ' : '📝 '}{a.selectedText || (isChinese ? '笔记' : 'Note')}</div>
                        {a.note && <div className="mt-0.5 whitespace-pre-wrap" style={{ color: theme.muted }}>{a.note}</div>}
                        {typeof a.pageIndex === 'number' && <button type="button" onClick={() => setPageNumber(a.pageIndex)} className="mt-1 cursor-pointer text-emerald-600 hover:underline">P.{a.pageIndex}</button>}
                      </div>
                      <button type="button" onClick={() => void deleteAnnotation(a.id)} className="shrink-0 cursor-pointer opacity-60 hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}

        {/* Floating Tap-Any-Word AI Dictionary Card */}
        {lookupWord && (
          <div
            role="dialog"
            aria-label="AI 查词卡"
            className="absolute bottom-4 left-4 right-4 z-40 mx-auto max-w-md rounded-2xl border p-4 shadow-2xl sm:left-6 sm:right-auto sm:mx-0 sm:w-[370px]"
            style={{ backgroundColor: theme.panelBg, borderColor: theme.border, color: theme.ink }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-bold">{lookupEntry?.word || lookupWord}</span>
                  {lookupEntry?.partOfSpeech && (
                    <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">
                      {lookupEntry.partOfSpeech}
                    </span>
                  )}
                </div>
                {lookupEntry?.reading && (
                  <div className="mt-0.5 text-xs font-medium" style={{ color: theme.muted }}>
                    {lookupEntry.reading}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setLookupWord(null)}
                aria-label="关闭查词卡"
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg opacity-65 hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2.5 text-xs leading-relaxed">
              {lookupLoading ? (
                <div className="flex items-center gap-2 py-3" style={{ color: theme.muted }}>
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                  <span>{isChinese ? `AI 正在查询「${lookupWord}」…` : `Looking up "${lookupWord}"…`}</span>
                </div>
              ) : lookupError ? (
                <div className="text-rose-500">{lookupError}</div>
              ) : lookupEntry ? (
                <div className="space-y-2">
                  <div>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {isChinese ? '释义：' : 'Meaning: '}
                    </span>
                    <span>{lookupEntry.meaning}</span>
                  </div>
                  {lookupEntry.root && (
                    <div className="text-[11px]" style={{ color: theme.muted }}>
                      <span className="font-semibold">{isChinese ? '词根 / 词源：' : 'Root: '}</span>
                      <span>{lookupEntry.root}</span>
                    </div>
                  )}
                  {lookupEntry.contextMeaning && (
                    <div
                      className="rounded-xl p-2 text-[11px]"
                      style={{
                        backgroundColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                      }}
                    >
                      <span className="font-semibold">{isChinese ? '本页语境：' : 'In context: '}</span>
                      <span>{lookupEntry.contextMeaning}</span>
                    </div>
                  )}
                  {lookupEntry.example && (
                    <div className="text-[11px] italic" style={{ color: theme.muted }}>
                      {isChinese ? '例句：' : 'Example: '}
                      {lookupEntry.example}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div
              className="mt-3 flex items-center justify-between border-t pt-2.5 text-[11px]"
              style={{ borderColor: theme.border }}
            >
              <span style={{ color: theme.muted }}>
                {isChinese ? '点页面任意单词即可继续查' : 'Tap any word on page'}
              </span>
              <button
                type="button"
                onClick={() => void runLibraryAiAction('explain', `请结合本页上下文讲解词语「${lookupWord}」在本书当前句子/段落中的具体含义（不要只给脱离上下文的词典释义），并说明词根/词性/用法（如可确认）。`)}
                className="inline-flex cursor-pointer items-center gap-1 font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
              >
                <Sparkles className="h-3 w-3" />
                <span>{isChinese ? '结合本页语境精讲' : 'Explain in context'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Apple Books Page Scrubber + Last-Page Return Action */}
      {pageCount >= 1 && (
        <div
          className="flex items-center gap-3 border-t px-4 py-2.5 text-xs sm:px-5"
          style={{ backgroundColor: theme.chromeBg, borderColor: theme.border }}
        >
          <span className="shrink-0 font-medium tabular-nums" style={{ color: theme.muted }}>
            {pageNumber} / {pageCount}
          </span>
          {pageCount > 1 ? (
            <input
              type="range"
              min={1}
              max={pageCount}
              value={pageNumber}
              onChange={(e) => setPageNumber(Number(e.target.value))}
              aria-label="页面进度滑块"
              className="h-1.5 flex-1 cursor-pointer accent-emerald-600"
            />
          ) : (
            <div className="flex-1" />
          )}
          <span className="shrink-0 tabular-nums" style={{ color: theme.muted }}>
            {Math.round((pageNumber / pageCount) * 100)}%
          </span>
          {isLastPage && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{isChinese ? '读完返回' : 'Finish & Back'}</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
};
