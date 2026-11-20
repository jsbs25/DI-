import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist';
import {
  AlignJustify,
  AlignLeft,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  BookOpen,
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Languages,
  List,
  Loader2,
  MessageSquare,
  Minus,
  Plus,
  RotateCcw,
  ScanText,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { Language } from '../../types/index.ts';
import {
  DEFAULT_READER_PREFS,
  READER_BG_PRESETS,
  READER_FONT_FAMILIES,
  TEXT_COLOR_PRESETS,
  loadBookProgress,
  loadReaderPreferences,
  resolveColumnMaxWidth,
  resolveFontCss,
  resolveHorizontalPadding,
  resolveReaderPalette,
  saveBookProgress,
  saveReaderPreferences,
  type BookBookmarkItem,
  type ReaderBgPresetId,
  type ReaderPreferences,
} from '../../utils/readerPreferences.ts';
import {
  extractPdfToc,
  extractStructuredPdfPage,
  parseOcrMarkdownToBlocks,
  renderPdfPageToJpegDataUrl,
  type ExtractedEbookPage,
  type PdfTocItem,
} from '../../utils/pdfEbookExtractor.ts';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

export interface WordLookupEntry {
  word: string;
  lemma?: string;
  reading: string;
  ukPhonetic?: string;
  usPhonetic?: string;
  audioUrl?: string;
  ukAudioUrl?: string;
  usAudioUrl?: string;
  cefrLevel?: string;
  partOfSpeech: string;
  root: string;
  meaning: string;
  usage?: string;
  contextMeaning: string;
  example: string;
}

interface SavedVocabItem {
  id: string;
  word: string;
  lemma?: string;
  reading?: string;
  partOfSpeech?: string;
  root?: string;
  meaning: string;
  usage?: string;
  example?: string;
  bookTitle?: string;
}

export interface PdfDocumentViewerProps {
  sourceUrl: string;
  title: string;
  lang: Language;
  /** Optional original external source URL (e.g. IslamHouse / Archive / Noor page). */
  originPageUrl?: string;
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
    .replace(/^[\s.,;:!?()[\]{}"'«»„“”‘’—–\-_/\\•·،؛؟。，、！？（）【】《》﴿﴾]+/, '')
    .replace(/[\s.,;:!?()[\]{}"'«»„“”‘’—–\-_/\\•·،؛؟。，、！？（）【】《》﴿﴾]+$/, '')
    .trim();
}

function tokenizeInteractiveText(text: string): string[] {
  if (!text) return [];
  // Keep whitespace intact and preserve Arabic base letters + combining diacritics inside unbroken spans
  return text.split(/(\s+|[.,;:!?()[\]{}"'«»“”‘’—–،؛؟。，、！？（）【】《》﴿﴾]+)/).filter(Boolean);
}

/**
 * Renders a razor-sharp 2.5x HiDPI authentic PDF page directly blended onto the
 * classical book paper surface (using mix-blend-multiply on cream/sepia/light themes
 * and crisp inverted ivory ink on dark/midnight themes) so Arabic calligraphy is
 * 100% authentic with ZERO spelling or ligature errors.
 */
const InlineOriginalPdfPageCanvas: React.FC<{
  pdf: PDFDocumentProxy;
  pageNumber: number;
  isDarkTheme: boolean;
}> = ({ pdf, pageNumber, isDarkTheme }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendering, setRendering] = useState(true);
  const [renderFailed, setRenderFailed] = useState(false);
  const [retrySeq, setRetrySeq] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    setRendering(true);
    setRenderFailed(false);

    pdf
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled || !canvasRef.current) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const containerW = Math.max(320, Math.min(820, containerRef.current?.clientWidth || 640));
        const fitScale = Math.max(1.0, Math.min(2.2, containerW / Math.max(1, baseViewport.width)));
        const viewport = page.getViewport({ scale: fitScale });
        // Cap DPR to 2.0 so tall scanned pages stay well within iOS Safari's canvas pixel memory limit
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
        canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#FCF9F2';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;
        renderTask = page.render({ canvas, canvasContext: ctx, viewport, transform });
        return renderTask.promise.then(() => {
          if (!cancelled) setRendering(false);
        });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.name === 'RenderingCancelledException') return;
        setRenderFailed(true);
        setRendering(false);
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, pageNumber, retrySeq]);

  return (
    <div ref={containerRef} className="relative mx-auto w-full min-h-[260px] overflow-hidden rounded-lg">
      {rendering && (
        <div className="flex items-center justify-center py-20 text-xs opacity-65">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          <span>正在高清渲染第 {pageNumber} 页…</span>
        </div>
      )}
      {renderFailed && !rendering && (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-xs opacity-75">
          <span>第 {pageNumber} 页渲染受网络波动影响</span>
          <button
            type="button"
            onClick={() => setRetrySeq((s) => s + 1)}
            className="rounded-lg border px-3 py-1 text-[11px] font-medium cursor-pointer hover:opacity-80"
          >
            重新加载本页
          </button>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={rendering || renderFailed ? 'hidden' : 'block w-full h-auto rounded-md'}
        style={
          isDarkTheme
            ? {
                filter: 'invert(0.9) hue-rotate(180deg) contrast(1.06)',
              }
            : {
                filter: 'sepia(0.08) contrast(1.04)',
              }
        }
      />
    </div>
  );
};

export const PdfDocumentViewer: React.FC<PdfDocumentViewerProps> = ({
  sourceUrl,
  title,
  lang,
  originPageUrl,
  onClose,
}) => {
  const isZh = lang === 'zh';
  const streamUrl = resolveProxyPdfUrl(sourceUrl, title, false);
  const downloadUrl = resolveProxyPdfUrl(sourceUrl, title, true);
  const bookKey = useMemo(() => `pdf:${sourceUrl || title}`, [sourceUrl, title]);

  // Core PDF state
  const [pdfProxy, setPdfProxy] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [toc, setToc] = useState<PdfTocItem[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  // Reflowable Ebook vs Original Page View
  const [viewMode, setViewMode] = useState<'reflow' | 'original'>('reflow');
  const [extractedPages, setExtractedPages] = useState<Record<number, ExtractedEbookPage>>({});
  const [scrollWindowEnd, setScrollWindowEnd] = useState(3);
  const [ocrLoadingPage, setOcrLoadingPage] = useState<number | null>(null);

  // Original PDF canvas zoom & ref
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [originalZoom, setOriginalZoom] = useState(1.15);

  // Reader Typography Preferences (persisted)
  const [prefs, setPrefs] = useState<ReaderPreferences>(() => loadReaderPreferences());
  const palette = useMemo(() => resolveReaderPalette(prefs), [prefs]);
  const fontCss = useMemo(() => resolveFontCss(prefs.fontFamily), [prefs.fontFamily]);
  const colMaxWidth = useMemo(() => resolveColumnMaxWidth(prefs.widthMode), [prefs.widthMode]);
  const horizPad = useMemo(() => resolveHorizontalPadding(prefs.marginMode), [prefs.marginMode]);

  // Drawers & Lightweight Panels
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [aiTab, setAiTab] = useState<'explain' | 'qa' | 'summary' | 'vocab'>('explain');
  const [bookmarks, setBookmarks] = useState<BookBookmarkItem[]>([]);
  const [pageJumpInput, setPageJumpInput] = useState('1');

  // Inline Paragraph Translations (blockId -> translated string)
  const [inlineTranslations, setInlineTranslations] = useState<Record<string, { loading?: boolean; text?: string; error?: string }>>({});

  // Floating Text Selection Action Bar
  const [selectionAction, setSelectionAction] = useState<{ text: string; blockId?: string } | null>(null);

  // Tap-Any-Word AI Annotation Card
  const [wordCard, setWordCard] = useState<{
    word: string;
    context: string;
    loading: boolean;
    entry: WordLookupEntry | null;
    error: string;
    saved: boolean;
  } | null>(null);

  // AI Deep Explanation State
  const [deepExplainLoading, setDeepExplainLoading] = useState(false);
  const [deepExplainText, setDeepExplainText] = useState('');
  const [deepExplainTarget, setDeepExplainTarget] = useState('');
  const [deepExplainError, setDeepExplainError] = useState('');

  // Whole-Book AI Q&A State
  const [qaInput, setQaInput] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [qaHistory, setQaHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string; cited?: string[] }>>([]);
  const [wholeBookIndexedPages, setWholeBookIndexedPages] = useState(0);
  const wholeBookChunksRef = useRef<Array<{ pageNumber: number; label: string; text: string }>>([]);

  // AI Summary State
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryScope, setSummaryScope] = useState<'paragraph' | 'chapter' | 'book'>('chapter');
  const [summaryText, setSummaryText] = useState('');
  const [summaryError, setSummaryError] = useState('');

  // Personal Vocabulary Bank
  const [vocabItems, setVocabItems] = useState<SavedVocabItem[]>([]);
  const [vocabLoading, setVocabLoading] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  const updatePrefs = useCallback((patch: Partial<ReaderPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveReaderPreferences(next);
      return next;
    });
  }, []);

  // Load saved progress & bookmarks for this book
  useEffect(() => {
    const saved = loadBookProgress(bookKey);
    if (saved) {
      setPageNumber(Math.max(1, saved.pageNumber || 1));
      setScrollWindowEnd(Math.max(3, (saved.pageNumber || 1) + 2));
      setBookmarks(Array.isArray(saved.bookmarks) ? saved.bookmarks : []);
    } else {
      setPageNumber(1);
      setScrollWindowEnd(3);
      setBookmarks([]);
    }
  }, [bookKey]);

  // Persist reading progress whenever page or bookmarks change
  useEffect(() => {
    if (pageCount <= 0) return;
    setPageJumpInput(String(pageNumber));
    saveBookProgress({
      bookKey,
      title,
      sourceUrl,
      pageNumber,
      totalPages: pageCount,
      scrollRatio: pageNumber / Math.max(1, pageCount),
      progressPct: Math.min(100, Math.round((pageNumber / Math.max(1, pageCount)) * 100)),
      bookmarks,
      updatedAt: new Date().toISOString(),
    });
  }, [bookKey, title, sourceUrl, pageNumber, pageCount, bookmarks]);

  // Load PDF document via pdfjs-dist
  useEffect(() => {
    let cancelled = false;
    setPdfProxy(null);
    setPageCount(0);
    setToc([]);
    setExtractedPages({});
    setInlineTranslations({});
    setWordCard(null);
    setSelectionAction(null);
    setDeepExplainText('');
    setQaHistory([]);
    setSummaryText('');
    wholeBookChunksRef.current = [];
    setWholeBookIndexedPages(0);
    setError('');
    setStatus(isZh ? '正在解析电子书排版…' : 'Preparing reflowable ebook…');

    const task = getDocument({
      url: streamUrl,
      withCredentials: false,
      cMapUrl: '/pdfjs-assets/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/pdfjs-assets/standard_fonts/',
      wasmUrl: '/pdfjs-assets/wasm/',
      iccUrl: '/pdfjs-assets/iccs/',
      rangeChunkSize: 65536,
      disableAutoFetch: true,
      disableStream: false,
    });

    task.promise
      .then(async (pdf) => {
        if (cancelled) return;
        setPdfProxy(pdf);
        setPageCount(pdf.numPages);
        setStatus('');
        const outline = await extractPdfToc(pdf);
        if (!cancelled) setToc(outline);
      })
      .catch((reason) => {
        if (cancelled) return;
        const msg = reason instanceof Error ? reason.message : String(reason);
        setError(
          isZh
            ? `PDF 载入未完成：${msg}。你仍可点击右上角「下载原 PDF」保存到本地阅读。`
            : `Could not load PDF: ${msg}. You can still download the original PDF.`
        );
        setStatus('');
      });

    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [streamUrl, isZh]);

  // Extract structured reflowable content for active page(s)
  const ensurePageExtracted = useCallback(
    async (targetPage: number, autoOcr = false): Promise<ExtractedEbookPage | null> => {
      if (!pdfProxy || targetPage < 1 || targetPage > pdfProxy.numPages) return null;
      const existing = extractedPages[targetPage];
      if (existing && (!autoOcr || !existing.isLikelyScanned || existing.ocrApplied)) {
        return existing;
      }

      const extracted = existing || (await extractStructuredPdfPage(pdfProxy, targetPage));
      setExtractedPages((prev) => ({ ...prev, [targetPage]: extracted }));

      // Automatically adjust font choice if page is Arabic and user hasn't picked an Arabic font
      if (extracted.dir === 'rtl' && targetPage === pageNumber && !prefs.fontFamily.endsWith('_ar')) {
        // Keep user preference intact, CSS fallback handles Arabic seamlessly
      }

      // If scanned image page and autoOcr requested, run Vision OCR cleanly
      if (autoOcr && extracted.isLikelyScanned && !extracted.ocrApplied) {
        setOcrLoadingPage(targetPage);
        try {
          const jpeg = await renderPdfPageToJpegDataUrl(pdfProxy, targetPage, 1.45);
          const res = await fetch('/api/library/ai/ocr-page', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pageImageBase64: jpeg,
              pageNumber: targetPage,
              bookTitle: title,
              language: lang,
            }),
          });
          const data = await res.json();
          if (res.ok && data?.success && typeof data.text === 'string' && data.text.trim()) {
            const blocks = parseOcrMarkdownToBlocks(data.text, targetPage);
            const hasArabic = /[\u0600-\u06FF]/.test(data.text);
            const ocrPage: ExtractedEbookPage = {
              pageNumber: targetPage,
              dir: hasArabic ? 'rtl' : 'ltr',
              blocks,
              plainText: data.text.trim(),
              isLikelyScanned: false,
              ocrApplied: true,
            };
            setExtractedPages((prev) => ({ ...prev, [targetPage]: ocrPage }));
            return ocrPage;
          }
        } catch {
          // Graceful fallback: user can still switch to Original Page mode
        } finally {
          setOcrLoadingPage((cur) => (cur === targetPage ? null : cur));
        }
      }

      return extracted;
    },
    [pdfProxy, extractedPages, pageNumber, prefs.fontFamily, title, lang]
  );

  // Extract active window of pages whenever pdfProxy / pageNumber / layout changes
  useEffect(() => {
    if (!pdfProxy || viewMode !== 'reflow') return;
    let cancelled = false;

    const pagesToLoad: number[] = [];
    if (prefs.layoutMode === 'paged') {
      pagesToLoad.push(pageNumber);
      if (pageNumber + 1 <= pdfProxy.numPages) pagesToLoad.push(pageNumber + 1);
    } else {
      const start = Math.max(1, pageNumber);
      const end = Math.min(pdfProxy.numPages, Math.max(scrollWindowEnd, start + 2));
      for (let p = start; p <= end; p++) pagesToLoad.push(p);
    }

    (async () => {
      for (const p of pagesToLoad) {
        if (cancelled) break;
        const already = extractedPages[p];
        if (!already) {
          const res = await extractStructuredPdfPage(pdfProxy, p);
          if (cancelled) break;
          setExtractedPages((prev) => (prev[p] ? prev : { ...prev, [p]: res }));
          // Keep HD paper-blended original canvas immediate for garbled Arabic or scanned PDFs;
          // Vision OCR remains one-tap opt-in via "AI 识字可点查" so zero quota errors interrupt reading.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfProxy, pageNumber, scrollWindowEnd, prefs.layoutMode, viewMode]);

  // Auto-load next pages seamlessly as user scrolls down in continuous scroll mode
  useEffect(() => {
    if (viewMode !== 'reflow' || prefs.layoutMode !== 'scroll' || !pdfProxy || scrollWindowEnd >= pageCount) {
      return;
    }
    const sentinel = loadMoreSentinelRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel || !root || typeof IntersectionObserver === 'undefined') return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setScrollWindowEnd((prev) => Math.min(pageCount, prev + 3));
        }
      },
      { root, rootMargin: '500px 0px' }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [viewMode, prefs.layoutMode, pdfProxy, scrollWindowEnd, pageCount]);

  // Background whole-book text indexing for Whole-Book Context AI Q&A & Book Summary
  useEffect(() => {
    if (!pdfProxy || pageCount <= 0) return;
    let cancelled = false;

    (async () => {
      const maxIndexPages = Math.min(pageCount, 80);
      const step = pageCount > 80 ? Math.ceil(pageCount / 80) : 1;
      const chunks: Array<{ pageNumber: number; label: string; text: string }> = [];
      for (let p = 1; p <= pageCount && chunks.length < maxIndexPages; p += step) {
        if (cancelled) return;
        try {
          const page = await pdfProxy.getPage(p);
          const tc = await page.getTextContent();
          const text = (tc.items as any[])
            .map((it) => (typeof it?.str === 'string' ? it.str : ''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (text.length > 20) {
            chunks.push({ pageNumber: p, label: `第 ${p} 页`, text: text.slice(0, 2400) });
          }
        } catch {
          // skip unreadable page
        }
        if (chunks.length % 10 === 0 && !cancelled) {
          wholeBookChunksRef.current = [...chunks];
          setWholeBookIndexedPages(chunks.length);
        }
      }
      if (!cancelled) {
        wholeBookChunksRef.current = chunks;
        setWholeBookIndexedPages(chunks.length);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfProxy, pageCount]);

  // Render Original Page Canvas when in 'original' fallback view
  useEffect(() => {
    if (!pdfProxy || viewMode !== 'original') return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;

    pdfProxy
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled || !canvasRef.current) return;
        const viewport = page.getViewport({ scale: originalZoom });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;
        canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
        canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;
        renderTask = page.render({ canvas, canvasContext: ctx, viewport, transform });
        return renderTask.promise;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfProxy, viewMode, pageNumber, originalZoom]);

  // Load Personal Vocabulary Bank
  const fetchVocabulary = useCallback(async () => {
    setVocabLoading(true);
    try {
      const res = await fetch('/api/library/vocabulary');
      const data = await res.json();
      if (data?.success && Array.isArray(data.items)) {
        setVocabItems(data.items);
      }
    } catch {
      // ignore
    } finally {
      setVocabLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchVocabulary();
  }, [fetchVocabulary]);

  // Keyboard navigation in paged / original modes
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        if (prefs.layoutMode === 'paged' || viewMode === 'original') {
          setPageNumber((p) => Math.min(Math.max(1, pageCount), p + 1));
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (prefs.layoutMode === 'paged' || viewMode === 'original') {
          setPageNumber((p) => Math.max(1, p - 1));
        }
      } else if (e.key === 'Escape') {
        setWordCard(null);
        setSelectionAction(null);
        setSettingsOpen(false);
        setTocOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [prefs.layoutMode, viewMode, pageCount]);

  // Listen for text selection inside reflowable prose
  const handleProseMouseUp = useCallback(() => {
    const sel = window.getSelection();
    const txt = sel?.toString().trim() || '';
    if (txt.length >= 2 && txt.length <= 2800) {
      setSelectionAction({ text: txt });
    } else if (!txt) {
      setSelectionAction(null);
    }
  }, []);

  // Tap-any-word AI lookup
  const handleLookupWord = useCallback(
    async (rawWord: string, contextSentence: string) => {
      const cleaned = cleanWordToken(rawWord);
      if (!cleaned) return;
      setSelectionAction(null);
      setWordCard({
        word: cleaned,
        context: contextSentence.slice(0, 260),
        loading: true,
        entry: null,
        error: '',
        saved: vocabItems.some((v) => v.word.toLowerCase() === cleaned.toLowerCase()),
      });
      try {
        const res = await fetch('/api/library/ai/lookup-word', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            word: cleaned,
            contextSentence: contextSentence.slice(0, 300),
            bookTitle: title,
            lang,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.success || !data.entry) {
          throw new Error(data?.error || '查词失败');
        }
        setWordCard((prev) => (prev ? { ...prev, loading: false, entry: data.entry } : null));
      } catch (err: any) {
        setWordCard((prev) =>
          prev ? { ...prev, loading: false, error: err?.message || '查词暂不可用' } : null
        );
      }
    },
    [title, lang, vocabItems]
  );

  const handleSaveWordToVocab = useCallback(async () => {
    if (!wordCard?.entry) return;
    try {
      const res = await fetch('/api/library/vocabulary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: wordCard.entry.word,
          lemma: wordCard.entry.lemma,
          reading: wordCard.entry.reading,
          partOfSpeech: wordCard.entry.partOfSpeech,
          root: wordCard.entry.root,
          meaning: wordCard.entry.meaning,
          usage: wordCard.entry.usage,
          contextSentence: wordCard.context,
          example: wordCard.entry.example,
          bookId: bookKey,
          bookTitle: title,
        }),
      });
      const data = await res.json();
      if (data?.success && data.item) {
        setWordCard((prev) => (prev ? { ...prev, saved: true } : null));
        setVocabItems((prev) => [data.item, ...prev.filter((i) => i.id !== data.item.id)]);
      }
    } catch {
      // ignore
    }
  }, [wordCard, bookKey, title]);

  const handleDeleteVocab = useCallback(async (id: string) => {
    setVocabItems((prev) => prev.filter((v) => v.id !== id));
    try {
      await fetch(`/api/library/vocabulary/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {
      // ignore
    }
  }, []);

  // Inline Paragraph Translation
  const handleTranslateBlock = useCallback(
    async (blockId: string, text: string) => {
      setInlineTranslations((prev) => ({ ...prev, [blockId]: { loading: true } }));
      try {
        const res = await fetch('/api/library/ai/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, targetLang: lang === 'en' ? 'en' : 'zh', bookTitle: title }),
        });
        const data = await res.json();
        if (!res.ok || !data?.success) throw new Error(data?.error || '翻译失败');
        setInlineTranslations((prev) => ({ ...prev, [blockId]: { text: data.translation } }));
      } catch (err: any) {
        setInlineTranslations((prev) => ({ ...prev, [blockId]: { error: err?.message || '翻译暂不可用' } }));
      }
    },
    [lang, title]
  );

  // AI Deep Explanation (6-dimension mentor breakdown)
  const handleDeepExplain = useCallback(
    async (passageText?: string) => {
      const currentText = passageText?.trim() || extractedPages[pageNumber]?.plainText || '';
      if (!currentText) return;
      setSelectionAction(null);
      setAiDrawerOpen(true);
      setAiTab('explain');
      setDeepExplainTarget(currentText.slice(0, 140));
      setDeepExplainLoading(true);
      setDeepExplainError('');
      try {
        const res = await fetch('/api/library/ai/deep-explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: currentText.slice(0, 4800),
            bookTitle: title,
            chapterTitle: `第 ${pageNumber} 页`,
            lang,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.success) throw new Error(data?.error || 'AI 精讲失败');
        setDeepExplainText(data.explanation || '');
      } catch (err: any) {
        setDeepExplainError(err?.message || 'AI 精讲暂不可用');
      } finally {
        setDeepExplainLoading(false);
      }
    },
    [extractedPages, pageNumber, title, lang]
  );

  // Whole-Book AI Q&A
  const handleAskBookQa = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const q = qaInput.trim();
      if (!q || qaLoading) return;
      setQaInput('');
      setQaHistory((prev) => [...prev, { role: 'user', content: q }]);
      setQaLoading(true);
      try {
        const chunks =
          wholeBookChunksRef.current.length > 0
            ? wholeBookChunksRef.current
            : Object.values(extractedPages).map((ep) => ({
                label: `第 ${ep.pageNumber} 页`,
                text: ep.plainText,
              }));
        const res = await fetch('/api/library/ai/book-qa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: q,
            bookTitle: title,
            currentSectionText: extractedPages[pageNumber]?.plainText || '',
            fullBookChunks: chunks,
            history: qaHistory.slice(-6).map((m) => ({ role: m.role, content: m.content })),
            lang,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.success) throw new Error(data?.error || '问答暂不可用');
        setQaHistory((prev) => [
          ...prev,
          { role: 'assistant', content: data.answer || '', cited: data.citedSections || [] },
        ]);
      } catch (err: any) {
        setQaHistory((prev) => [
          ...prev,
          { role: 'assistant', content: err?.message || 'ONE AI 阅读问答暂时不可用，请稍后重试。' },
        ]);
      } finally {
        setQaLoading(false);
      }
    },
    [qaInput, qaLoading, extractedPages, pageNumber, title, qaHistory, lang]
  );

  // AI Summary (Paragraph / Chapter-Page / Full Book)
  const handleRunSummary = useCallback(
    async (scope: 'paragraph' | 'chapter' | 'book', customText?: string) => {
      setAiDrawerOpen(true);
      setAiTab('summary');
      setSummaryScope(scope);
      setSummaryLoading(true);
      setSummaryError('');
      setSummaryText('');
      try {
        let material = customText?.trim() || '';
        if (!material && scope === 'book') {
          const allChunks = wholeBookChunksRef.current;
          if (allChunks.length > 0) {
            // Sample evenly across the entire book for comprehensive whole-book summary
            const step = Math.max(1, Math.floor(allChunks.length / 10));
            material = allChunks
              .filter((_, i) => i % step === 0)
              .slice(0, 12)
              .map((c) => `【${c.label}】${c.text.slice(0, 1000)}`)
              .join('\n\n');
          } else {
            material = Object.values(extractedPages)
              .map((p) => `【第 ${p.pageNumber} 页】${p.plainText.slice(0, 1000)}`)
              .join('\n\n');
          }
        } else if (!material) {
          material = extractedPages[pageNumber]?.plainText || '';
        }

        if (!material.trim()) {
          throw new Error('当前页尚无提取文本，可先点击 OCR 识别后再总结。');
        }

        const res = await fetch('/api/library/ai/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scope,
            bookTitle: title,
            sectionTitle: scope === 'book' ? '全书' : `第 ${pageNumber} 页`,
            content: material,
            lang,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.success) throw new Error(data?.error || '总结失败');
        setSummaryText(data.summary || '');
      } catch (err: any) {
        setSummaryError(err?.message || 'AI 总结暂不可用');
      } finally {
        setSummaryLoading(false);
      }
    },
    [extractedPages, pageNumber, title, lang]
  );

  // Toggle Bookmark for current page
  const isCurrentPageBookmarked = bookmarks.some((b) => b.pageNumber === pageNumber);
  const toggleBookmark = useCallback(() => {
    setBookmarks((prev) => {
      if (prev.some((b) => b.pageNumber === pageNumber)) {
        return prev.filter((b) => b.pageNumber !== pageNumber);
      }
      const excerpt = (extractedPages[pageNumber]?.plainText || '').slice(0, 90);
      return [
        {
          id: `bm_${Date.now()}`,
          pageNumber,
          label: `第 ${pageNumber} 页`,
          excerpt,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ];
    });
  }, [pageNumber, extractedPages]);

  const jumpToPage = useCallback(
    (target: number) => {
      const clamped = Math.max(1, Math.min(Math.max(1, pageCount), target));
      setPageNumber(clamped);
      setScrollWindowEnd((prev) => Math.max(prev, clamped + 2));
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [pageCount]
  );

  const visiblePageNumbers = useMemo(() => {
    if (pageCount <= 0) return [];
    if (prefs.layoutMode === 'paged') return [pageNumber];
    const end = Math.min(pageCount, Math.max(scrollWindowEnd, pageNumber + 2));
    const list: number[] = [];
    for (let p = pageNumber; p <= end; p++) list.push(p);
    return list;
  }, [pageCount, pageNumber, scrollWindowEnd, prefs.layoutMode]);

  const progressPct = pageCount > 0 ? Math.min(100, Math.round((pageNumber / pageCount) * 100)) : 0;
  const isLastPage = pageCount > 0 && (prefs.layoutMode === 'paged' ? pageNumber >= pageCount : scrollWindowEnd >= pageCount);

  return (
    <div
      className="fixed inset-0 z-[75] flex flex-col overflow-hidden transition-colors duration-200"
      style={{ backgroundColor: palette.bg, color: palette.ink }}
      data-testid="pdf-ebook-reader"
    >
      {/* Minimal Apple Books-Grade Top Navigation Bar */}
      <header
        className="shrink-0 z-20 flex items-center justify-between gap-2 px-3 sm:px-5 h-13 border-b backdrop-blur-xl transition-colors"
        style={{
          backgroundColor: palette.isDark ? 'rgba(18,21,27,0.9)' : 'rgba(255,255,255,0.88)',
          borderColor: palette.border,
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition hover:opacity-75 cursor-pointer shrink-0"
              style={{ backgroundColor: palette.surface, color: palette.ink }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{isZh ? '返回' : 'Back'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setTocOpen((v) => !v);
              setSettingsOpen(false);
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition hover:opacity-75 cursor-pointer shrink-0"
            style={{ backgroundColor: tocOpen ? palette.surface : 'transparent' }}
            title={isZh ? '目录与书签' : 'Contents & Bookmarks'}
          >
            <List className="h-4 w-4" />
          </button>
          <div className="min-w-0 hidden sm:block pl-1">
            <h1 className="truncate text-[13px] font-semibold tracking-tight max-w-[34vw]">{title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Reflowable Ebook vs Original PDF Fallback Switch */}
          <div
            className="inline-flex items-center rounded-lg p-0.5 text-[11px] font-medium border"
            style={{ borderColor: palette.border, backgroundColor: palette.surface }}
          >
            <button
              type="button"
              onClick={() => setViewMode('reflow')}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 transition cursor-pointer"
              style={
                viewMode === 'reflow'
                  ? { backgroundColor: palette.isDark ? '#F4F1EA' : '#1C2621', color: palette.isDark ? '#111821' : '#FFFFFF' }
                  : { color: palette.muted }
              }
            >
              <BookOpen className="h-3 w-3" />
              <span className="hidden xs:inline">{isZh ? '电子书' : 'Ebook'}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('original')}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 transition cursor-pointer"
              style={
                viewMode === 'original'
                  ? { backgroundColor: palette.isDark ? '#F4F1EA' : '#1C2621', color: palette.isDark ? '#111821' : '#FFFFFF' }
                  : { color: palette.muted }
              }
            >
              <Eye className="h-3 w-3" />
              <span className="hidden xs:inline">{isZh ? '原版面' : 'Original'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={toggleBookmark}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition hover:opacity-75 cursor-pointer"
            title={isCurrentPageBookmarked ? '移除书签' : '添加书签'}
          >
            {isCurrentPageBookmarked ? (
              <BookmarkCheck className="h-4 w-4 text-[#247864] dark:text-[#52b798]" />
            ) : (
              <Bookmark className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setSettingsOpen((v) => !v);
              setTocOpen(false);
            }}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition hover:opacity-75 cursor-pointer"
            style={{ backgroundColor: settingsOpen ? palette.surface : 'transparent' }}
            title={isZh ? '排版与外观' : 'Reading Settings'}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{isZh ? '排版' : 'Aa'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAiDrawerOpen((v) => !v);
              setSettingsOpen(false);
            }}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition cursor-pointer"
            style={{
              backgroundColor: aiDrawerOpen ? '#247864' : palette.surface,
              color: aiDrawerOpen ? '#FFFFFF' : palette.ink,
            }}
            title={isZh ? 'ONE AI 伴读' : 'ONE AI Reading'}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">AI</span>
          </button>

          <a
            href={downloadUrl}
            download
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition hover:opacity-80"
            style={{ backgroundColor: palette.surface, color: palette.ink }}
            title={isZh ? '下载原始 PDF' : 'Download Original PDF'}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{isZh ? '原 PDF' : 'PDF'}</span>
          </a>
        </div>
      </header>

      {/* Main Content Stage (Reading Column + Lightweight Side Panels) */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {/* TOC & Bookmarks Slide-over (Left) */}
        {tocOpen && (
          <aside
            className="absolute inset-y-0 left-0 z-30 w-[min(86vw,310px)] border-r flex flex-col shadow-xl"
            style={{ backgroundColor: palette.bg, borderColor: palette.border }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: palette.border }}>
              <span className="text-xs font-semibold tracking-wide">{isZh ? '目录与书签' : 'Contents & Bookmarks'}</span>
              <button type="button" onClick={() => setTocOpen(false)} className="p-1 opacity-70 hover:opacity-100 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-5">
              {/* Fast Page Jump */}
              <div className="rounded-xl p-3 border" style={{ borderColor: palette.border, backgroundColor: palette.surface }}>
                <div className="text-[11px] font-medium mb-2" style={{ color: palette.muted }}>
                  {isZh ? `快速跳转（共 ${pageCount || 1} 页）` : `Jump to Page (1-${pageCount || 1})`}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = parseInt(pageJumpInput, 10);
                    if (Number.isFinite(n)) {
                      jumpToPage(n);
                      setTocOpen(false);
                    }
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, pageCount)}
                    value={pageJumpInput}
                    onChange={(e) => setPageJumpInput(e.target.value)}
                    className="w-20 rounded-lg border px-2.5 py-1 text-xs bg-transparent outline-none"
                    style={{ borderColor: palette.border }}
                  />
                  <button
                    type="submit"
                    className="rounded-lg px-3 py-1 text-xs font-medium bg-[#247864] text-white cursor-pointer"
                  >
                    {isZh ? '跳转' : 'Go'}
                  </button>
                </form>
              </div>

              {/* Bookmarks */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: palette.muted }}>
                  {isZh ? `书签 (${bookmarks.length})` : `Bookmarks (${bookmarks.length})`}
                </div>
                {bookmarks.length === 0 ? (
                  <p className="text-xs px-1" style={{ color: palette.muted }}>
                    {isZh ? '点击顶部书签图标即可收藏当前阅读位置。' : 'Tap the bookmark icon to save a page.'}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {bookmarks.map((bm) => (
                      <div
                        key={bm.id}
                        className="group flex items-start justify-between gap-2 rounded-xl px-2.5 py-2 border cursor-pointer transition hover:opacity-85"
                        style={{ borderColor: palette.border, backgroundColor: palette.surface }}
                        onClick={() => {
                          jumpToPage(bm.pageNumber);
                          setTocOpen(false);
                        }}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-medium">{bm.label}</div>
                          {bm.excerpt && (
                            <div className="text-[11px] line-clamp-2 mt-0.5" style={{ color: palette.muted }}>
                              {bm.excerpt}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBookmarks((prev) => prev.filter((item) => item.id !== bm.id));
                          }}
                          className="p-1 opacity-50 hover:opacity-100 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* PDF Outline / Chapters */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: palette.muted }}>
                  {isZh ? '章节目录' : 'Chapters'}
                </div>
                {toc.length === 0 ? (
                  <p className="text-xs px-1" style={{ color: palette.muted }}>
                    {isZh ? '本书未内置目录书签，可使用上方页码快速跳转。' : 'No embedded outline in this PDF.'}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {toc.map((item, idx) => (
                      <button
                        key={`${item.title}_${idx}`}
                        type="button"
                        onClick={() => {
                          jumpToPage(item.pageNumber);
                          setTocOpen(false);
                        }}
                        style={{ paddingLeft: `${8 + Math.min(item.level, 3) * 14}px` }}
                        className="flex w-full items-center justify-between gap-2 rounded-lg py-1.5 pr-2 text-left text-xs transition hover:opacity-75 cursor-pointer"
                      >
                        <span className="truncate">{item.title}</span>
                        <span className="text-[11px] tabular-nums shrink-0" style={{ color: palette.muted }}>
                          {item.pageNumber}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}

        {/* Custom Typography & Reading Settings Popover */}
        {settingsOpen && (
          <div
            className="absolute right-3 top-3 z-30 w-[min(92vw,340px)] max-h-[82vh] overflow-y-auto rounded-2xl border p-4 shadow-2xl space-y-4"
            style={{ backgroundColor: palette.bg, borderColor: palette.border, color: palette.ink }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">{isZh ? '阅读外观与排版' : 'Typography & Theme'}</span>
              <button
                type="button"
                onClick={() => {
                  saveReaderPreferences(DEFAULT_READER_PREFS);
                  setPrefs({ ...DEFAULT_READER_PREFS });
                }}
                className="inline-flex items-center gap-1 text-[11px] opacity-70 hover:opacity-100 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                <span>{isZh ? '恢复默认' : 'Reset'}</span>
              </button>
            </div>

            {/* Reading Mode: Continuous Scroll vs Page Flip */}
            <div>
              <div className="text-[11px] mb-1.5" style={{ color: palette.muted }}>{isZh ? '翻页方式' : 'Reading Flow'}</div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'scroll' as const, label: isZh ? '连续滚动阅读' : 'Continuous Scroll' },
                  { id: 'paged' as const, label: isZh ? '单页翻页阅读' : 'Page-by-Page' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updatePrefs({ layoutMode: opt.id })}
                    className="rounded-xl border py-1.5 text-xs font-medium transition cursor-pointer"
                    style={{
                      borderColor: prefs.layoutMode === opt.id ? '#247864' : palette.border,
                      backgroundColor: prefs.layoutMode === opt.id ? 'rgba(36,120,100,0.14)' : palette.surface,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1.5" style={{ color: palette.muted }}>
                <span>{isZh ? '字体大小' : 'Font Size'}</span>
                <span className="tabular-nums font-medium">{prefs.fontSize}px</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updatePrefs({ fontSize: Math.max(14, prefs.fontSize - 1) })}
                  className="inline-flex h-8 w-9 items-center justify-center rounded-lg border cursor-pointer"
                  style={{ borderColor: palette.border, backgroundColor: palette.surface }}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <input
                  type="range"
                  min={14}
                  max={34}
                  step={1}
                  value={prefs.fontSize}
                  onChange={(e) => updatePrefs({ fontSize: Number(e.target.value) })}
                  className="flex-1 accent-[#247864] cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => updatePrefs({ fontSize: Math.min(34, prefs.fontSize + 1) })}
                  className="inline-flex h-8 w-9 items-center justify-center rounded-lg border cursor-pointer"
                  style={{ borderColor: palette.border, backgroundColor: palette.surface }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Background Themes + Custom Color */}
            <div>
              <div className="text-[11px] mb-1.5" style={{ color: palette.muted }}>{isZh ? '阅读背景' : 'Background'}</div>
              <div className="grid grid-cols-5 gap-1.5">
                {(['white', 'warm', 'cream', 'night'] as Array<Exclude<ReaderBgPresetId, 'custom'>>).map((id) => {
                  const preset = READER_BG_PRESETS[id];
                  const active = prefs.bgPreset === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => updatePrefs({ bgPreset: id })}
                      className="flex flex-col items-center gap-1 rounded-xl border p-1.5 text-[10px] transition cursor-pointer"
                      style={{
                        borderColor: active ? '#247864' : palette.border,
                        backgroundColor: preset.bg,
                        color: preset.ink,
                      }}
                    >
                      <span className="font-medium truncate w-full text-center">{preset.label}</span>
                    </button>
                  );
                })}
                <label
                  className="flex flex-col items-center justify-center gap-0.5 rounded-xl border p-1.5 text-[10px] cursor-pointer"
                  style={{
                    borderColor: prefs.bgPreset === 'custom' ? '#247864' : palette.border,
                    backgroundColor: prefs.customBgColor,
                  }}
                >
                  <input
                    type="color"
                    value={prefs.customBgColor}
                    onChange={(e) => updatePrefs({ bgPreset: 'custom', customBgColor: e.target.value })}
                    className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
                  />
                  <span className="text-[9px] font-medium" style={{ color: palette.ink }}>{isZh ? '自定义' : 'Custom'}</span>
                </label>
              </div>
            </div>

            {/* Text Color + Custom Picker + Reset */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1.5" style={{ color: palette.muted }}>
                <span>{isZh ? '文字颜色' : 'Text Color'}</span>
                {prefs.textColor && (
                  <button
                    type="button"
                    onClick={() => updatePrefs({ textColor: '' })}
                    className="text-[10px] underline cursor-pointer"
                  >
                    {isZh ? '恢复默认' : 'Default'}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {TEXT_COLOR_PRESETS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => updatePrefs({ textColor: c.value })}
                    className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] cursor-pointer"
                    style={{
                      borderColor: prefs.textColor === c.value ? '#247864' : palette.border,
                      backgroundColor: palette.surface,
                    }}
                  >
                    {c.value && <span className="h-2.5 w-2.5 rounded-full border border-black/20" style={{ backgroundColor: c.value }} />}
                    <span>{c.label}</span>
                  </button>
                ))}
                <label className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] cursor-pointer" style={{ borderColor: palette.border }}>
                  <input
                    type="color"
                    value={prefs.textColor || palette.ink}
                    onChange={(e) => updatePrefs({ textColor: e.target.value })}
                    className="h-3.5 w-3.5 border-0 bg-transparent p-0 cursor-pointer"
                  />
                  <span>{isZh ? '自选' : 'Pick'}</span>
                </label>
              </div>
            </div>

            {/* Font Family (Chinese, Arabic, English) */}
            <div>
              <div className="text-[11px] mb-1.5" style={{ color: palette.muted }}>{isZh ? '阅读字体（中 / 阿 / 英）' : 'Font Family'}</div>
              <div className="grid grid-cols-2 gap-1.5">
                {READER_FONT_FAMILIES.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => updatePrefs({ fontFamily: f.id })}
                    className="flex items-center justify-between rounded-xl border px-2.5 py-1.5 text-left text-xs transition cursor-pointer"
                    style={{
                      fontFamily: f.css,
                      borderColor: prefs.fontFamily === f.id ? '#247864' : palette.border,
                      backgroundColor: prefs.fontFamily === f.id ? 'rgba(36,120,100,0.14)' : palette.surface,
                    }}
                  >
                    <span className="truncate">{f.label}</span>
                    <span className="text-[10px] opacity-60 shrink-0">{f.langTag}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Line Height & Paragraph Spacing */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1" style={{ color: palette.muted }}>
                  <span>{isZh ? '行间距' : 'Line Height'}</span>
                  <span className="tabular-nums">{prefs.lineHeight.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={1.4}
                  max={2.4}
                  step={0.05}
                  value={prefs.lineHeight}
                  onChange={(e) => updatePrefs({ lineHeight: Number(e.target.value) })}
                  className="w-full accent-[#247864] cursor-pointer"
                />
              </div>
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1" style={{ color: palette.muted }}>
                  <span>{isZh ? '段间距' : 'Paragraph'}</span>
                  <span className="tabular-nums">{prefs.paragraphSpacing.toFixed(1)}em</span>
                </div>
                <input
                  type="range"
                  min={0.6}
                  max={2.2}
                  step={0.1}
                  value={prefs.paragraphSpacing}
                  onChange={(e) => updatePrefs({ paragraphSpacing: Number(e.target.value) })}
                  className="w-full accent-[#247864] cursor-pointer"
                />
              </div>
            </div>

            {/* Margins, Column Width & Alignment */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="text-[10px] mb-1" style={{ color: palette.muted }}>{isZh ? '页边距' : 'Margins'}</div>
                <div className="flex flex-col gap-1">
                  {(['compact', 'standard', 'generous'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => updatePrefs({ marginMode: m })}
                      className="rounded-lg border py-1 text-[11px] cursor-pointer"
                      style={{
                        borderColor: prefs.marginMode === m ? '#247864' : palette.border,
                        backgroundColor: prefs.marginMode === m ? 'rgba(36,120,100,0.14)' : palette.surface,
                      }}
                    >
                      {m === 'compact' ? '紧凑' : m === 'generous' ? '宽松' : '标准'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] mb-1" style={{ color: palette.muted }}>{isZh ? '阅读宽度' : 'Width'}</div>
                <div className="flex flex-col gap-1">
                  {(['narrow', 'standard', 'wide'] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => updatePrefs({ widthMode: w })}
                      className="rounded-lg border py-1 text-[11px] cursor-pointer"
                      style={{
                        borderColor: prefs.widthMode === w ? '#247864' : palette.border,
                        backgroundColor: prefs.widthMode === w ? 'rgba(36,120,100,0.14)' : palette.surface,
                      }}
                    >
                      {w === 'narrow' ? '窄栏' : w === 'wide' ? '宽栏' : '适中'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] mb-1" style={{ color: palette.muted }}>{isZh ? '对齐' : 'Align'}</div>
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => updatePrefs({ align: 'left' })}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border py-1 text-[11px] cursor-pointer"
                    style={{
                      borderColor: prefs.align === 'left' ? '#247864' : palette.border,
                      backgroundColor: prefs.align === 'left' ? 'rgba(36,120,100,0.14)' : palette.surface,
                    }}
                  >
                    <AlignLeft className="h-3 w-3" />
                    <span>自然</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updatePrefs({ align: 'justify' })}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border py-1 text-[11px] cursor-pointer"
                    style={{
                      borderColor: prefs.align === 'justify' ? '#247864' : palette.border,
                      backgroundColor: prefs.align === 'justify' ? 'rgba(36,120,100,0.14)' : palette.surface,
                    }}
                  >
                    <AlignJustify className="h-3 w-3" />
                    <span>两端</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Primary Reading Canvas */}
        <div
          ref={scrollContainerRef}
          className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden scroll-smooth"
          onMouseUp={handleProseMouseUp}
          onTouchEnd={handleProseMouseUp}
        >
          {status && !error && (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-sm" style={{ color: palette.muted }}>
              <Loader2 className="h-6 w-6 animate-spin text-[#247864]" />
              <span>{status}</span>
            </div>
          )}

          {error && (
            <div className="mx-auto max-w-lg px-6 py-20 text-center space-y-4">
              <FileText className="mx-auto h-10 w-10 opacity-45" />
              <p className="text-sm leading-relaxed">{error}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <a
                  href={downloadUrl}
                  download
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#247864] px-4 py-2 text-xs font-medium text-white"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{isZh ? '下载原始 PDF' : 'Download PDF'}</span>
                </a>
                {originPageUrl && (
                  <a
                    href={originPageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-medium"
                    style={{ borderColor: palette.border }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>{isZh ? '源站查看' : 'Source'}</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* REFLOWABLE EBOOK MODE — Classical Open-Book Paper Sheet Layout */}
          {!error && pdfProxy && viewMode === 'reflow' && (
            <div className="mx-auto w-full px-3 sm:px-6 py-5 sm:py-8 pb-28">
              <article
                className="mx-auto w-full rounded-[14px] py-8 sm:py-11 transition-all"
                style={{
                  maxWidth: colMaxWidth,
                  paddingLeft: horizPad,
                  paddingRight: horizPad,
                  backgroundColor: palette.paper,
                  border: `1px solid ${palette.border}`,
                  boxShadow: palette.isDark
                    ? '0 22px 54px rgba(0,0,0,0.52), -4px 0 0 -1px #1d2330, 4px 0 0 -1px #1d2330'
                    : '0 18px 46px rgba(58,44,24,0.10), -5px 0 0 -1px #f6f0e3, -6px 0 0 -1px #d7ccb5, -10px 0 0 -2px #efe7d6, -11px 0 0 -2px #d2c5ab, 5px 0 0 -1px #f6f0e3, 6px 0 0 -1px #d7ccb5, 10px 0 0 -2px #efe7d6, 11px 0 0 -2px #d2c5ab',
                  fontFamily: fontCss,
                  fontSize: `${prefs.fontSize}px`,
                  lineHeight: prefs.lineHeight,
                  textAlign: prefs.align,
                  overflowWrap: 'break-word',
                  wordBreak: 'normal',
                }}
              >
                {/* Classical Book Title Masthead on Page 1 */}
                {pageNumber === 1 && (
                  <header className="mb-9 pb-5 border-b text-center" style={{ borderColor: palette.border }}>
                    <div className="text-[11px] tracking-[0.18em] mb-2" style={{ color: palette.muted }}>
                      EARTH ONE · {isZh ? '世界图书馆典籍版' : 'WORLD LIBRARY EDITION'}
                    </div>
                    <h1
                      className="font-semibold tracking-tight leading-snug"
                      style={{ fontSize: `${Math.min(34, prefs.fontSize * 1.42)}px` }}
                    >
                      {title}
                    </h1>
                    <p className="mt-2 text-[11px]" style={{ color: palette.muted }}>
                      {isZh
                        ? `共 ${pageCount} 页 · 轻点任意词查义 · 选中段落可翻译或 AI 精讲`
                        : `${pageCount} pages · Tap any word to look up · Select text to translate or explain`}
                    </p>
                  </header>
                )}

                {/* Render Reflowable Structured Pages */}
                {visiblePageNumbers.map((pNum) => {
                  const ep = extractedPages[pNum];
                  const isOcrBusy = ocrLoadingPage === pNum;
                  const isArabicPage = ep?.dir === 'rtl';
                  const userPickedArabicFont =
                    prefs.fontFamily === 'scheherazade_ar' ||
                    prefs.fontFamily === 'amiri_ar' ||
                    prefs.fontFamily === 'tajawal_ar';
                  const effectivePageFont =
                    isArabicPage && !userPickedArabicFont
                      ? '"Scheherazade New", "Amiri", "Noto Naskh Arabic", serif'
                      : fontCss;
                  const effectivePageLineHeight = isArabicPage
                    ? Math.max(prefs.lineHeight, 2.25)
                    : prefs.lineHeight;
                  const effectivePageFontSize = isArabicPage
                    ? Math.max(prefs.fontSize + 4, 22)
                    : prefs.fontSize;

                  const effectivePageTextAlign: React.CSSProperties['textAlign'] = isArabicPage
                    ? prefs.align === 'left'
                      ? 'right'
                      : 'justify'
                    : prefs.align;

                  return (
                    <section
                      key={pNum}
                      dir={ep?.dir || 'ltr'}
                      lang={isArabicPage ? 'ar' : undefined}
                      translate={isArabicPage ? 'no' : undefined}
                      className={`mb-12 last:mb-2 ${isArabicPage ? 'notranslate' : ''}`}
                      style={{
                        fontFamily: effectivePageFont,
                        lineHeight: effectivePageLineHeight,
                        fontSize: `${effectivePageFontSize}px`,
                        textAlign: effectivePageTextAlign,
                        wordSpacing: isArabicPage ? '0.05em' : undefined,
                        letterSpacing: isArabicPage ? '0' : undefined,
                        fontFeatureSettings: isArabicPage ? '"liga" 1, "calt" 1, "mark" 1, "mkmk" 1' : undefined,
                        unicodeBidi: isArabicPage ? 'plaintext' : undefined,
                      }}
                      onClick={() => {
                        if (prefs.layoutMode === 'scroll' && pageNumber !== pNum) {
                          setPageNumber(pNum);
                        }
                      }}
                    >
                      {/* Classical 3-part Sepia Running Header matching physical book spread */}
                      <div
                        dir="ltr"
                        className="grid grid-cols-3 items-center text-[11px] mb-6 pb-2 border-b select-none font-sans"
                        style={{ borderColor: palette.border, color: palette.muted }}
                      >
                        <span className="truncate text-left">{title}</span>
                        <span className="text-center font-mono text-[10.5px] opacity-85">
                          {pNum} / {pageCount}
                          {ep?.ocrApplied ? (isZh ? ' · OCR' : ' · OCR') : ''}
                        </span>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPageNumber(pNum);
                              void handleDeepExplain(ep?.plainText);
                            }}
                            className="hover:opacity-100 opacity-75 transition cursor-pointer"
                          >
                            {isZh ? '精讲' : 'Explain'}
                          </button>
                          <span className="opacity-45">·</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPageNumber(pNum);
                              void handleRunSummary('chapter', ep?.plainText);
                            }}
                            className="hover:opacity-100 opacity-75 transition cursor-pointer"
                          >
                            {isZh ? '总结' : 'Summary'}
                          </button>
                        </div>
                      </div>

                      {!ep ? (
                        <div className="flex items-center gap-2 py-8 text-xs font-sans" style={{ color: palette.muted }}>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>{isZh ? `正在排版第 ${pNum} 页…` : `Reflowing page ${pNum}…`}</span>
                        </div>
                      ) : ep.isLikelyScanned ? (
                      <div className="space-y-3 font-sans" dir="ltr">
                        <InlineOriginalPdfPageCanvas
                          pdf={pdfProxy}
                          pageNumber={pNum}
                          isDarkTheme={palette.isDark}
                        />
                        <div
                          className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t text-[11px]"
                          style={{ borderColor: palette.border, color: palette.muted }}
                        >
                          <span>
                            {isOcrBusy
                              ? isZh
                                ? '正在通过 ONE AI 视觉识别原页阿拉伯语文字…'
                                : 'Recognizing authentic text via Vision OCR…'
                              : isZh
                                ? '高清原版直呈 · 确保阿文零错字'
                                : 'HD authentic edition · zero glyph errors'}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={isOcrBusy}
                              onClick={() => void ensurePageExtracted(pNum, true)}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#247864] px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50 cursor-pointer"
                            >
                              {isOcrBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ScanText className="h-3 w-3" />}
                              <span>{isOcrBusy ? (isZh ? '识别中…' : 'Recognizing…') : isZh ? 'AI 识字可点查' : 'Vision OCR'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPageNumber(pNum);
                                setViewMode('original');
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium cursor-pointer"
                              style={{ borderColor: palette.border, color: palette.ink }}
                            >
                              <Eye className="h-3 w-3" />
                              <span>{isZh ? '自由缩放' : 'Zoom'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {ep.blocks.map((block) => {
                          const tr = inlineTranslations[block.id];
                          if (block.kind === 'h1') {
                            return (
                              <h2
                                key={block.id}
                                className="font-semibold tracking-tight leading-snug mt-7 mb-3"
                                style={{ fontSize: `${Math.min(34, prefs.fontSize * 1.32)}px` }}
                              >
                                {block.text}
                              </h2>
                            );
                          }
                          if (block.kind === 'h2') {
                            return (
                              <h3
                                key={block.id}
                                className="font-semibold leading-snug mt-6 mb-2.5"
                                style={{ fontSize: `${Math.min(30, prefs.fontSize * 1.16)}px` }}
                              >
                                {block.text}
                              </h3>
                            );
                          }
                          if (block.kind === 'table' && block.rows) {
                            return (
                              <div key={block.id} className="my-5 overflow-x-auto rounded-xl border" style={{ borderColor: palette.border }}>
                                <table className="w-full text-left border-collapse" style={{ fontSize: `${Math.max(13, prefs.fontSize * 0.84)}px` }}>
                                  <tbody>
                                    {block.rows.map((row, rIdx) => (
                                      <tr key={rIdx} className="border-b last:border-b-0" style={{ borderColor: palette.border }}>
                                        {row.map((cell, cIdx) => (
                                          <td key={cIdx} className="px-3 py-2 align-top">
                                            {cell}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            );
                          }
                          if (block.kind === 'footnote') {
                            return (
                              <p
                                key={block.id}
                                className="mt-4 pt-2 border-t leading-relaxed"
                                style={{
                                  borderColor: palette.border,
                                  color: palette.muted,
                                  fontSize: `${Math.max(12, prefs.fontSize * 0.8)}px`,
                                }}
                              >
                                {block.text}
                              </p>
                            );
                          }

                          // Standard reflowable paragraph with tap-any-word dictionary + subtle hover translate/explain
                          const tokens = tokenizeInteractiveText(block.text);
                          return (
                            <div
                              key={block.id}
                              className="group relative"
                              style={{ marginBottom: `${prefs.paragraphSpacing}em` }}
                            >
                              <p className="m-0">
                                {tokens.map((tok, tIdx) => {
                                  const cleaned = cleanWordToken(tok);
                                  if (!cleaned || /^\s+$/.test(tok)) {
                                    return <React.Fragment key={tIdx}>{tok}</React.Fragment>;
                                  }
                                  return (
                                    <span
                                      key={tIdx}
                                      onClick={(e) => {
                                        const sel = window.getSelection()?.toString().trim();
                                        if (sel && sel.length > 1) return;
                                        e.stopPropagation();
                                        void handleLookupWord(cleaned, block.text);
                                      }}
                                      className="cursor-pointer rounded-sm transition-colors hover:bg-[#247864]/15"
                                    >
                                      {tok}
                                    </span>
                                  );
                                })}
                              </p>

                              {/* Subtle per-paragraph inline actions on hover (desktop) */}
                              <div className="mt-1 flex items-center gap-3 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity text-[11px] select-none" style={{ color: palette.muted }}>
                                <button
                                  type="button"
                                  onClick={() => void handleTranslateBlock(block.id, block.text)}
                                  className="inline-flex items-center gap-1 hover:opacity-100 cursor-pointer"
                                >
                                  <Languages className="h-3 w-3" />
                                  <span>{isZh ? '译' : 'Translate'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeepExplain(block.text)}
                                  className="inline-flex items-center gap-1 hover:opacity-100 cursor-pointer"
                                >
                                  <Sparkles className="h-3 w-3" />
                                  <span>{isZh ? '精讲' : 'Explain'}</span>
                                </button>
                              </div>

                              {/* Inline Paragraph Translation Result */}
                              {tr && (
                                <div
                                  dir="auto"
                                  className="mt-2 rounded-xl border px-3.5 py-2.5 leading-relaxed"
                                  style={{
                                    borderColor: palette.border,
                                    backgroundColor: palette.surface,
                                    fontSize: `${Math.max(14, prefs.fontSize * 0.88)}px`,
                                    color: palette.muted,
                                  }}
                                >
                                  {tr.loading ? (
                                    <span className="inline-flex items-center gap-1.5 text-xs">
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      {isZh ? '正在翻译段落…' : 'Translating…'}
                                    </span>
                                  ) : tr.error ? (
                                    <span className="text-xs text-rose-500">{tr.error}</span>
                                  ) : (
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="whitespace-pre-wrap">{tr.text}</div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setInlineTranslations((prev) => {
                                            const copy = { ...prev };
                                            delete copy[block.id];
                                            return copy;
                                          })
                                        }
                                        className="p-0.5 opacity-60 hover:opacity-100 cursor-pointer shrink-0"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}

              {/* Continuous Scroll Auto-Load Sentinel + Manual Load Next Pages */}
              {prefs.layoutMode === 'scroll' && scrollWindowEnd < pageCount && (
                <div ref={loadMoreSentinelRef} className="pt-2 pb-6 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      const nextEnd = Math.min(pageCount, scrollWindowEnd + 4);
                      setScrollWindowEnd(nextEnd);
                    }}
                    className="inline-flex items-center gap-2 rounded-full border px-5 py-2 text-xs font-medium transition hover:opacity-80 cursor-pointer"
                    style={{ borderColor: palette.border, backgroundColor: palette.surface }}
                  >
                    <span>{isZh ? `继续加载下几页（剩余 ${pageCount - scrollWindowEnd} 页）` : `Load next pages (${pageCount - scrollWindowEnd} left)`}</span>
                  </button>
                </div>
              )}

              {/* End-of-Book Completion Card with Return Button */}
              {isLastPage && onClose && (
                <div
                  className="mt-10 rounded-2xl border p-6 text-center space-y-3"
                  style={{ borderColor: palette.border, backgroundColor: palette.surface }}
                >
                  <CheckCircle2 className="mx-auto h-7 w-7 text-[#247864] dark:text-[#52b798]" />
                  <div className="text-sm font-semibold">{isZh ? '已读至全书末尾' : 'Finished reading'}</div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void handleRunSummary('book')}
                      className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-medium cursor-pointer"
                      style={{ borderColor: palette.border }}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{isZh ? 'AI 生成全书总结' : 'Summarize Book'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#247864] px-4 py-2 text-xs font-medium text-white cursor-pointer"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>{isZh ? '读完 · 返回书架' : 'Return to Library'}</span>
                    </button>
                  </div>
                </div>
              )}
            </article>
            </div>
          )}

          {/* ORIGINAL PDF FALLBACK MODE (Complex layouts / tables / diagrams) */}
          {!error && pdfProxy && viewMode === 'original' && (
            <div className="flex flex-col items-center px-3 py-6 pb-24">
              <div className="mb-4 flex items-center gap-2 rounded-full border px-3 py-1 text-xs" style={{ borderColor: palette.border, backgroundColor: palette.surface }}>
                <button
                  type="button"
                  onClick={() => setOriginalZoom((z) => Math.max(0.6, Number((z - 0.15).toFixed(2))))}
                  className="p-1 cursor-pointer"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="tabular-nums w-11 text-center">{Math.round(originalZoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setOriginalZoom((z) => Math.min(2.4, Number((z + 0.15).toFixed(2))))}
                  className="p-1 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="max-w-full overflow-x-auto rounded-xl shadow-lg border" style={{ borderColor: palette.border }}>
                <canvas ref={canvasRef} className="block bg-white" />
              </div>
            </div>
          )}
        </div>

        {/* Floating Selection Action Bar (Translate / Deep Explain / Summarize / Lookup) */}
        {selectionAction && (
          <div
            className="fixed bottom-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 rounded-full border px-2 py-1.5 shadow-xl backdrop-blur-xl"
            style={{
              backgroundColor: palette.isDark ? 'rgba(24,30,39,0.96)' : 'rgba(255,255,255,0.96)',
              borderColor: palette.border,
            }}
          >
            <button
              type="button"
              onClick={() => {
                const txt = selectionAction.text;
                setSelectionAction(null);
                void handleLookupWord(txt.split(/\s+/)[0] || txt, txt);
              }}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>{isZh ? '查词' : 'Define'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const txt = selectionAction.text;
                setSelectionAction(null);
                void handleTranslateBlock(`sel_${pageNumber}`, txt);
                // Show translation neatly in AI explain tab too if selection wasn't bound to a single block
                setAiDrawerOpen(true);
                setAiTab('explain');
                setDeepExplainTarget(txt.slice(0, 120));
                setDeepExplainLoading(true);
                setDeepExplainError('');
                fetch('/api/library/ai/translate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ text: txt, targetLang: lang === 'en' ? 'en' : 'zh', bookTitle: title }),
                })
                  .then((r) => r.json())
                  .then((d) => setDeepExplainText(d?.translation || d?.error || ''))
                  .catch(() => setDeepExplainError('翻译暂不可用'))
                  .finally(() => setDeepExplainLoading(false));
              }}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            >
              <Languages className="h-3.5 w-3.5" />
              <span>{isZh ? '翻译' : 'Translate'}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleDeepExplain(selectionAction.text)}
              className="inline-flex items-center gap-1 rounded-full bg-[#247864] px-3 py-1 text-xs font-medium text-white cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{isZh ? 'AI 精讲' : 'Deep Explain'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const txt = selectionAction.text;
                setSelectionAction(null);
                void handleRunSummary('paragraph', txt);
              }}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            >
              <span>{isZh ? '总结' : 'Summarize'}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectionAction(null)}
              className="p-1 opacity-60 hover:opacity-100 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Lightweight Floating Word Annotation Card (Tap any word) */}
        {wordCard && (
          <div
            className="fixed bottom-16 right-4 z-40 w-[min(92vw,380px)] rounded-2xl border p-4 shadow-2xl"
            style={{ backgroundColor: palette.paper, borderColor: palette.border, color: palette.ink }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-semibold" dir="auto">{wordCard.entry?.word || wordCard.word}</span>
                  {wordCard.entry?.cefrLevel && (
                    <span className="rounded bg-[#247864]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#247864]">
                      {wordCard.entry.cefrLevel}
                    </span>
                  )}
                  {wordCard.entry?.partOfSpeech && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: palette.surface, color: palette.muted }}>
                      {wordCard.entry.partOfSpeech}
                    </span>
                  )}
                </div>
                {wordCard.entry?.reading && (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono" style={{ color: '#247864' }}>
                      {wordCard.entry.reading}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const url = wordCard.entry?.usAudioUrl || wordCard.entry?.ukAudioUrl || wordCard.entry?.audioUrl;
                        if (url) {
                          const a = new Audio(url);
                          void a.play().catch(() => {});
                          return;
                        }
                        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                          window.speechSynthesis.cancel();
                          const u = new SpeechSynthesisUtterance(wordCard.entry?.word || wordCard.word);
                          u.lang = /[\u0600-\u06FF]/.test(u.text) ? 'ar-SA' : 'en-US';
                          window.speechSynthesis.speak(u);
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium cursor-pointer transition hover:opacity-80"
                      style={{ backgroundColor: palette.surface, color: '#247864' }}
                      title={isZh ? '朗读单词发音' : 'Pronounce word'}
                    >
                      <Volume2 className="h-3 w-3" />
                      <span>{isZh ? '发音' : 'Listen'}</span>
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {wordCard.entry && (
                  <button
                    type="button"
                    onClick={() => void handleSaveWordToVocab()}
                    className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium cursor-pointer"
                    style={{
                      borderColor: wordCard.saved ? '#247864' : palette.border,
                      backgroundColor: wordCard.saved ? 'rgba(36,120,100,0.14)' : palette.surface,
                    }}
                  >
                    {wordCard.saved ? <Check className="h-3 w-3 text-[#247864]" /> : <Plus className="h-3 w-3" />}
                    <span>{wordCard.saved ? (isZh ? '已存生词' : 'Saved') : isZh ? '存生词本' : 'Save'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setWordCard(null)}
                  className="p-1 opacity-60 hover:opacity-100 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {wordCard.loading ? (
              <div className="flex items-center gap-2 py-4 text-xs" style={{ color: palette.muted }}>
                <Loader2 className="h-4 w-4 animate-spin text-[#247864]" />
                <span>{isZh ? '权威词典正在解析词义与音标…' : 'Looking up authoritative definition…'}</span>
              </div>
            ) : wordCard.error ? (
              <p className="mt-2 text-xs text-rose-500">{wordCard.error}</p>
            ) : wordCard.entry ? (
              <div className="mt-3 space-y-2 text-xs leading-relaxed">
                {wordCard.entry.lemma && wordCard.entry.lemma !== wordCard.entry.word && (
                  <div>
                    <span style={{ color: palette.muted }}>{isZh ? '原形：' : 'Lemma: '}</span>
                    <span className="font-medium" dir="auto">{wordCard.entry.lemma}</span>
                  </div>
                )}
                {wordCard.entry.root && (
                  <div>
                    <span style={{ color: palette.muted }}>{isZh ? '词根/词源：' : 'Root: '}</span>
                    <span dir="auto">{wordCard.entry.root}</span>
                  </div>
                )}
                <div className="text-[13px] font-medium leading-relaxed">{wordCard.entry.meaning}</div>
                {wordCard.entry.contextMeaning && (
                  <div className="rounded-xl p-2.5" style={{ backgroundColor: palette.surface }}>
                    <div className="text-[10px] font-semibold mb-0.5" style={{ color: palette.muted }}>{isZh ? '本句语境注解' : 'In-Context Note'}</div>
                    <div>{wordCard.entry.contextMeaning}</div>
                  </div>
                )}
                {wordCard.entry.usage && (
                  <div>
                    <span style={{ color: palette.muted }}>{isZh ? '高频搭配与用法：' : 'Usage: '}</span>
                    <span>{wordCard.entry.usage}</span>
                  </div>
                )}
                {wordCard.entry.example && (
                  <div className="pt-1.5 border-t text-[11px]" style={{ borderColor: palette.border, color: palette.muted }}>
                    {wordCard.entry.example}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Lightweight Non-Blocking ONE AI Reading Side Sheet */}
        {aiDrawerOpen && (
          <aside
            className="w-[min(92vw,370px)] shrink-0 border-l flex flex-col z-30 absolute inset-y-0 right-0 md:static shadow-2xl md:shadow-none"
            style={{ backgroundColor: palette.bg, borderColor: palette.border }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: palette.border }}>
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[#247864]" />
                <span className="text-xs font-semibold">ONE AI {isZh ? '伴读' : 'Reading'}</span>
              </div>
              <button type="button" onClick={() => setAiDrawerOpen(false)} className="p-1 opacity-70 hover:opacity-100 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 4 Focused Tabs: 精讲 / 全书问答 / 总结 / 生词本 */}
            <div className="grid grid-cols-4 border-b text-[11px] font-medium" style={{ borderColor: palette.border }}>
              {[
                { id: 'explain' as const, label: isZh ? 'AI 精讲' : 'Explain' },
                { id: 'qa' as const, label: isZh ? '全书问答' : 'Book Q&A' },
                { id: 'summary' as const, label: isZh ? 'AI 总结' : 'Summary' },
                { id: 'vocab' as const, label: isZh ? `生词 (${vocabItems.length})` : `Vocab (${vocabItems.length})` },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setAiTab(t.id)}
                  className="py-2.5 border-b-2 transition cursor-pointer"
                  style={{
                    borderBottomColor: aiTab === t.id ? '#247864' : 'transparent',
                    color: aiTab === t.id ? palette.ink : palette.muted,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab 1: AI Deep Explain */}
            {aiTab === 'explain' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs leading-relaxed">
                <div className="flex items-center justify-between gap-2">
                  <span style={{ color: palette.muted }}>
                    {deepExplainTarget ? `${isZh ? '当前分析：' : 'Passage: '}“${deepExplainTarget.slice(0, 28)}…”` : isZh ? `第 ${pageNumber} 页精讲` : `Page ${pageNumber}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleDeepExplain()}
                    disabled={deepExplainLoading}
                    className="rounded-lg bg-[#247864] px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    {deepExplainLoading ? (isZh ? '精讲中…' : 'Working…') : isZh ? '精讲本页' : 'Explain Page'}
                  </button>
                </div>
                {deepExplainLoading ? (
                  <div className="flex items-center gap-2 py-8" style={{ color: palette.muted }}>
                    <Loader2 className="h-4 w-4 animate-spin text-[#247864]" />
                    <span>{isZh ? '正在剖析背景、核心观点与句式难点…' : 'Analyzing passage…'}</span>
                  </div>
                ) : deepExplainError ? (
                  <p className="text-rose-500">{deepExplainError}</p>
                ) : deepExplainText ? (
                  <div className="whitespace-pre-wrap leading-7 text-[13px]">{deepExplainText}</div>
                ) : (
                  <div className="rounded-xl border p-4 text-center space-y-2" style={{ borderColor: palette.border, backgroundColor: palette.surface }}>
                    <p style={{ color: palette.muted }}>
                      {isZh
                        ? '选中任意段落点击「AI 精讲」，或点击上方「精讲本页」，立即获取背景、核心观点、重点词汇、句子结构与难点剖析。'
                        : 'Select any passage or click Explain Page for a structured deep breakdown.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Whole-Book Context AI Q&A */}
            {aiTab === 'qa' && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="px-4 py-2 text-[11px] border-b" style={{ borderColor: palette.border, color: palette.muted }}>
                  {isZh
                    ? `已关联全书 ${wholeBookIndexedPages || Object.keys(extractedPages).length} 页上下文，支持跨章节提问`
                    : `Indexed ${wholeBookIndexedPages || Object.keys(extractedPages).length} pages for whole-book Q&A`}
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
                  {qaHistory.length === 0 && (
                    <div className="space-y-2">
                      <p style={{ color: palette.muted }}>
                        {isZh ? '围绕整本书向 ONE AI 提问：' : 'Ask anything about the entire book:'}
                      </p>
                      {(isZh
                        ? ['这本书的核心思想是什么？', '作者在全书中反复强调了哪些观点？', '帮我梳理前几章的逻辑脉络']
                        : ['What is the central thesis of this book?', 'Summarize the key arguments across chapters']
                      ).map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setQaInput(q)}
                          className="block w-full text-left rounded-xl border px-3 py-2 text-xs transition hover:opacity-80 cursor-pointer"
                          style={{ borderColor: palette.border, backgroundColor: palette.surface }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                  {qaHistory.map((m, i) => (
                    <div
                      key={i}
                      className={`rounded-2xl px-3.5 py-2.5 leading-relaxed ${m.role === 'user' ? 'ml-6 bg-[#247864] text-white' : 'mr-2 border'}`}
                      style={m.role === 'assistant' ? { borderColor: palette.border, backgroundColor: palette.surface } : undefined}
                    >
                      <div className="whitespace-pre-wrap text-[13px]">{m.content}</div>
                      {m.cited && m.cited.length > 0 && (
                        <div className="mt-1.5 text-[10px] opacity-70">
                          {isZh ? '参考出处：' : 'Sources: '}{m.cited.join(' · ')}
                        </div>
                      )}
                    </div>
                  ))}
                  {qaLoading && (
                    <div className="flex items-center gap-2 text-xs" style={{ color: palette.muted }}>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#247864]" />
                      <span>{isZh ? '正在检索全书并作答…' : 'Searching whole book…'}</span>
                    </div>
                  )}
                </div>
                <form
                  onSubmit={(e) => void handleAskBookQa(e)}
                  className="p-3 border-t flex items-center gap-2"
                  style={{ borderColor: palette.border }}
                >
                  <input
                    value={qaInput}
                    onChange={(e) => setQaInput(e.target.value)}
                    placeholder={isZh ? '针对整本书提问…' : 'Ask about this book…'}
                    className="flex-1 rounded-xl border px-3 py-2 text-xs bg-transparent outline-none"
                    style={{ borderColor: palette.border }}
                  />
                  <button
                    type="submit"
                    disabled={qaLoading || !qaInput.trim()}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#247864] text-white disabled:opacity-40 cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </form>
              </div>
            )}

            {/* Tab 3: AI Summary (Paragraph / Chapter / Full Book) */}
            {aiTab === 'summary' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'paragraph' as const, label: isZh ? '当前段落' : 'Paragraph' },
                    { id: 'chapter' as const, label: isZh ? '本页/本章' : 'Chapter' },
                    { id: 'book' as const, label: isZh ? '整本书总结' : 'Full Book' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => void handleRunSummary(s.id)}
                      className="rounded-xl border py-2 text-[11px] font-medium transition cursor-pointer"
                      style={{
                        borderColor: summaryScope === s.id ? '#247864' : palette.border,
                        backgroundColor: summaryScope === s.id ? 'rgba(36,120,100,0.14)' : palette.surface,
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {summaryLoading ? (
                  <div className="flex items-center gap-2 py-8" style={{ color: palette.muted }}>
                    <Loader2 className="h-4 w-4 animate-spin text-[#247864]" />
                    <span>{isZh ? '正在提炼核心要点…' : 'Summarizing…'}</span>
                  </div>
                ) : summaryError ? (
                  <p className="text-rose-500">{summaryError}</p>
                ) : summaryText ? (
                  <div className="whitespace-pre-wrap leading-7 text-[13px]">{summaryText}</div>
                ) : (
                  <p style={{ color: palette.muted }}>
                    {isZh ? '点击上方按钮即可生成本页或整本书的精炼总结。' : 'Choose a scope above to generate a summary.'}
                  </p>
                )}
              </div>
            )}

            {/* Tab 4: Personal Vocabulary Book */}
            {aiTab === 'vocab' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5 text-xs">
                {vocabLoading ? (
                  <div className="flex items-center gap-2 py-6" style={{ color: palette.muted }}>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{isZh ? '正在加载生词本…' : 'Loading vocabulary…'}</span>
                  </div>
                ) : vocabItems.length === 0 ? (
                  <div className="rounded-xl border p-4 text-center" style={{ borderColor: palette.border, backgroundColor: palette.surface, color: palette.muted }}>
                    {isZh ? '阅读时轻点任意单词并点击「存生词本」，即可积累你的个人词汇库。' : 'Tap any word while reading to save it to your vocabulary bank.'}
                  </div>
                ) : (
                  vocabItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border p-3 space-y-1"
                      style={{ borderColor: palette.border, backgroundColor: palette.surface }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-sm font-semibold" dir="auto">{item.word}</span>
                          {item.reading && <span className="ml-2 font-mono text-[11px] text-[#247864]">{item.reading}</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteVocab(item.id)}
                          className="p-0.5 opacity-50 hover:opacity-100 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="text-xs leading-relaxed">{item.meaning}</div>
                      {item.bookTitle && (
                        <div className="text-[10px]" style={{ color: palette.muted }}>
                          《{item.bookTitle}》
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Subtle Bottom Progress & Page Navigation Bar */}
      <footer
        className="shrink-0 z-20 flex items-center justify-between gap-3 px-4 h-11 border-t text-xs select-none"
        style={{
          backgroundColor: palette.isDark ? 'rgba(18,21,27,0.92)' : 'rgba(255,255,255,0.9)',
          borderColor: palette.border,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <button
          type="button"
          disabled={pageNumber <= 1}
          onClick={() => jumpToPage(pageNumber - 1)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 transition disabled:opacity-35 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{isZh ? '上一页' : 'Prev'}</span>
        </button>

        <div className="flex flex-1 max-w-md items-center gap-3">
          <input
            type="range"
            min={1}
            max={Math.max(1, pageCount)}
            value={pageNumber}
            onChange={(e) => jumpToPage(Number(e.target.value))}
            className="flex-1 accent-[#247864] cursor-pointer"
          />
          <span className="tabular-nums text-[11px] shrink-0" style={{ color: palette.muted }}>
            {pageNumber} / {pageCount || 1} · {progressPct}%
          </span>
        </div>

        <button
          type="button"
          disabled={pageNumber >= pageCount}
          onClick={() => jumpToPage(pageNumber + 1)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 transition disabled:opacity-35 cursor-pointer"
        >
          <span className="hidden sm:inline">{isZh ? '下一页' : 'Next'}</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </footer>
    </div>
  );
};

export default PdfDocumentViewer;
