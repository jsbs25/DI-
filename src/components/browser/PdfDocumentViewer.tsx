import React, { useEffect, useRef, useState } from 'react';
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Download,
  ExternalLink,
  Minus,
  Moon,
  Plus,
  Search,
  Sun,
} from 'lucide-react';
import { Language } from '../../types/index.ts';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

type PdfThemeId = 'light' | 'paper' | 'dark';

const PDF_THEMES: Record<
  PdfThemeId,
  { label: string; shellBg: string; chromeBg: string; ink: string; muted: string; border: string; canvasFilter?: string }
> = {
  light: {
    label: '原始白',
    shellBg: '#F5F5F7',
    chromeBg: '#FFFFFF',
    ink: '#1D1D1F',
    muted: '#6E6E73',
    border: '#E5E5EA',
  },
  paper: {
    label: '护眼纸',
    shellBg: '#EFE7D6',
    chromeBg: '#F8F3E8',
    ink: '#2B241B',
    muted: '#736654',
    border: '#DDD0B8',
    canvasFilter: 'sepia(0.14) contrast(0.98)',
  },
  dark: {
    label: '夜间黑',
    shellBg: '#121215',
    chromeBg: '#1C1C1F',
    ink: '#EBEBF0',
    muted: '#9A9AA0',
    border: '#2E2E34',
  },
};

export interface PdfDocumentViewerProps {
  sourceUrl: string;
  title: string;
  lang: Language;
  /** Optional original external source URL (e.g. IslamHouse / Archive / Noor page). */
  originPageUrl?: string;
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

export const PdfDocumentViewer: React.FC<PdfDocumentViewerProps> = ({
  sourceUrl,
  title,
  lang,
  originPageUrl,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1.25);
  const [themeId, setThemeId] = useState<PdfThemeId>('paper');
  const [searchText, setSearchText] = useState('');
  const [matchingPages, setMatchingPages] = useState<number[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const isChinese = lang === 'zh';

  const streamUrl = resolveProxyPdfUrl(sourceUrl, title, false);
  const downloadUrl = resolveProxyPdfUrl(sourceUrl, title, true);
  const theme = PDF_THEMES[themeId];

  useEffect(() => {
    setPageInput(String(pageNumber));
  }, [pageNumber]);

  useEffect(() => {
    let cancelled = false;
    setDocumentProxy(null);
    setPageNumber(1);
    setPageInput('1');
    setPageCount(0);
    setMatchingPages([]);
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
      .then((page) => {
        if (cancelled) return;
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cssViewport = page.getViewport({ scale: zoom });
        const hiDpiViewport = page.getViewport({ scale: zoom * dpr });

        canvas.width = Math.ceil(hiDpiViewport.width);
        canvas.height = Math.ceil(hiDpiViewport.height);
        canvas.style.width = `${Math.ceil(cssViewport.width)}px`;
        canvas.style.height = `${Math.ceil(cssViewport.height)}px`;

        renderTask = page.render({ canvas, canvasContext: context, viewport: hiDpiViewport });
        return renderTask.promise.catch((reason) => {
          if (!cancelled && (reason as Error)?.name !== 'RenderingCancelledException') {
            setError(reason instanceof Error ? reason.message : String(reason));
          }
        });
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [documentProxy, pageNumber, zoom]);

  // Keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        setPageNumber((p) => Math.min(pageCount || 1, p + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setPageNumber((p) => Math.max(1, p - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pageCount]);

  const handleJumpPage = (e: React.FormEvent) => {
    e.preventDefault();
    const target = Math.max(1, Math.min(pageCount || 1, Number.parseInt(pageInput, 10) || 1));
    setPageNumber(target);
  };

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
          ? '未在前 120 页检索到该文字（部分古籍扫描版 PDF 为图像页）。'
          : 'No matching text found in first 120 pages.'
      );
    }
  };

  return (
    <section
      aria-label={isChinese ? 'Apple 风格 PDF 阅读器' : 'PDF Document Reader'}
      className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border shadow-2xl transition-colors duration-200"
      style={{
        backgroundColor: theme.shellBg,
        borderColor: theme.border,
        color: theme.ink,
      }}
    >
      {/* Apple Books-style top toolbar */}
      <div
        className="flex flex-wrap items-center justify-between gap-2.5 border-b px-3.5 py-2.5 sm:px-5"
        style={{ backgroundColor: theme.chromeBg, borderColor: theme.border }}
      >
        {/* Left: Page navigation & jump */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            aria-label="上一页"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border transition disabled:opacity-35"
            style={{ borderColor: theme.border }}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <form onSubmit={handleJumpPage} className="flex items-center gap-1 text-xs font-medium">
            <input
              type="text"
              inputMode="numeric"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ''))}
              aria-label="页码"
              className="h-9 w-12 rounded-xl border bg-transparent text-center text-xs font-semibold tabular-nums focus:outline-none"
              style={{ borderColor: theme.border }}
            />
            <span style={{ color: theme.muted }}>/ {pageCount || '…'}</span>
          </form>

          <button
            type="button"
            onClick={() => setPageNumber((p) => Math.min(pageCount || 1, p + 1))}
            disabled={!pageCount || pageNumber >= pageCount}
            aria-label="下一页"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border transition disabled:opacity-35"
            style={{ borderColor: theme.border }}
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* Center: Zoom & Paper Themes */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex items-center rounded-xl border p-0.5"
            style={{ borderColor: theme.border }}
          >
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.65, Number((z - 0.15).toFixed(2))))}
              aria-label="缩小"
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:opacity-75"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="px-2 text-xs font-medium tabular-nums">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.4, Number((z + 0.15).toFixed(2))))}
              aria-label="放大"
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:opacity-75"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div
            className="inline-flex items-center gap-1 rounded-xl border p-0.5 text-[11px]"
            style={{ borderColor: theme.border }}
          >
            {(['light', 'paper', 'dark'] as PdfThemeId[]).map((tid) => (
              <button
                key={tid}
                type="button"
                onClick={() => setThemeId(tid)}
                className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2.5 font-medium transition"
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
        </div>

        {/* Right: Search & Direct Download */}
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={handleSearch} className="flex items-center gap-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-50" />
              <input
                type="search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder={isChinese ? '搜文档内文字…' : 'Search PDF…'}
                className="h-9 w-36 rounded-xl border bg-transparent pl-8 pr-2.5 text-xs focus:outline-none sm:w-44"
                style={{ borderColor: theme.border }}
              />
            </div>
          </form>

          <a
            href={downloadUrl}
            download
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{isChinese ? '下载 PDF' : 'Download PDF'}</span>
          </a>

          {originPageUrl && (
            <a
              href={originPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-xs font-medium transition hover:opacity-80"
              style={{ borderColor: theme.border, color: theme.ink }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{isChinese ? '来源页' : 'Source'}</span>
            </a>
          )}
        </div>
      </div>

      {/* Status / Search match strip */}
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

      {/* PDF Canvas Viewport */}
      <div className="flex min-h-[55vh] flex-1 items-start justify-center overflow-auto p-4 sm:p-6">
        <div className="relative">
          <canvas
            ref={canvasRef}
            aria-label={title}
            className="mx-auto block rounded-lg shadow-[0_14px_42px_rgba(0,0,0,0.22)] transition-all"
            style={theme.canvasFilter ? { filter: theme.canvasFilter } : undefined}
          />
        </div>
      </div>

      {/* Bottom Apple Books page scrubber */}
      {pageCount > 1 && (
        <div
          className="flex items-center gap-3 border-t px-5 py-2.5 text-xs"
          style={{ backgroundColor: theme.chromeBg, borderColor: theme.border }}
        >
          <span className="shrink-0 font-medium tabular-nums" style={{ color: theme.muted }}>
            {pageNumber} / {pageCount}
          </span>
          <input
            type="range"
            min={1}
            max={pageCount}
            value={pageNumber}
            onChange={(e) => setPageNumber(Number(e.target.value))}
            aria-label="页面进度滑块"
            className="h-1.5 flex-1 cursor-pointer accent-emerald-600"
          />
          <span className="shrink-0 tabular-nums" style={{ color: theme.muted }}>
            {Math.round((pageNumber / pageCount) * 100)}%
          </span>
        </div>
      )}
    </section>
  );
};
