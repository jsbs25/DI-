import React, { useEffect, useRef, useState } from 'react';
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask
} from 'pdfjs-dist';
import { ArrowLeft, ArrowRight, ExternalLink, Minus, Plus, Search } from 'lucide-react';
import { Language } from '../../types/index.ts';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

interface PdfDocumentViewerProps {
  sourceUrl: string;
  title: string;
  lang: Language;
}

export const PdfDocumentViewer: React.FC<PdfDocumentViewerProps> = ({ sourceUrl, title, lang }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [searchText, setSearchText] = useState('');
  const [matchingPages, setMatchingPages] = useState<number[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isChinese = lang === 'zh';

  useEffect(() => {
    let cancelled = false;
    const task = getDocument({ url: sourceUrl, withCredentials: false });
    setDocumentProxy(null);
    setPageCount(0);
    setPageNumber(1);
    setError(null);
    setStatus(isChinese ? '正在从来源加载 PDF…' : 'Loading the PDF from its source…');

    task.promise.then(document => {
      if (cancelled) {
        const docWithDestroy = document as PDFDocumentProxy & { destroy?: () => Promise<void> };
        void (docWithDestroy.destroy ? docWithDestroy.destroy() : document.cleanup());
        return;
      }
      setDocumentProxy(document);
      setPageCount(document.numPages);
      setStatus('');
    }).catch(reason => {
      if (cancelled) return;
      setError(reason instanceof Error ? reason.message : String(reason));
      setStatus('');
    });

    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [sourceUrl, isChinese]);

  useEffect(() => {
    if (!documentProxy) return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;

    documentProxy.getPage(pageNumber).then(page => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      const viewport = page.getViewport({ scale: zoom });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      renderTask = page.render({ canvas, canvasContext: context, viewport });
      return renderTask.promise.catch(reason => {
        if (!cancelled && (reason as Error)?.name !== 'RenderingCancelledException') {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    }).catch(reason => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [documentProxy, pageNumber, zoom]);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const query = searchText.trim().toLocaleLowerCase();
    if (!documentProxy || !query) {
      setMatchingPages([]);
      setStatus(isChinese ? '请输入要查找的文字。' : 'Enter text to search for.');
      return;
    }

    setStatus(isChinese ? '正在搜索文档文字…' : 'Searching document text…');
    const matches: number[] = [];
    try {
      for (let page = 1; page <= documentProxy.numPages; page += 1) {
        const pageData = await documentProxy.getPage(page);
        const textContent = await pageData.getTextContent();
        const text = textContent.items
          .map(item => 'str' in item ? item.str : '')
          .join(' ')
          .toLocaleLowerCase();
        if (text.includes(query)) matches.push(page);
      }
    } catch (reason) {
      setMatchingPages([]);
      setStatus(isChinese ? `文档搜索失败：${reason instanceof Error ? reason.message : String(reason)}` : `Document search failed: ${reason instanceof Error ? reason.message : String(reason)}`);
      return;
    }
    setMatchingPages(matches);
    setMatchIndex(0);
    if (matches.length) {
      setPageNumber(matches[0]);
      setStatus(isChinese ? `在 ${matches.length} 页中找到匹配。` : `Found matches on ${matches.length} page(s).`);
    } else {
      setStatus(isChinese ? '未找到匹配文字。' : 'No matching text found.');
    }
  };

  const changeMatch = (direction: -1 | 1) => {
    if (!matchingPages.length) return;
    const nextIndex = (matchIndex + direction + matchingPages.length) % matchingPages.length;
    setMatchIndex(nextIndex);
    setPageNumber(matchingPages[nextIndex]);
  };

  return (
    <section aria-label={isChinese ? 'PDF 文档查看器' : 'PDF document viewer'} className="mx-auto w-full max-w-5xl">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-amber-200/80">JUPITER · PDF</p>
          <h1 className="mt-1 break-words text-lg font-semibold text-white sm:text-xl">{title}</h1>
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1.5 break-all text-xs text-cyan-200 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70">
            {isChinese ? '来源网站 / 下载（遵循来源权限）' : 'Source / download (subject to source permissions)'}
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        </div>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <button type="button" onClick={() => setPageNumber(page => Math.max(1, page - 1))} disabled={!documentProxy || pageNumber <= 1} aria-label={isChinese ? '上一页' : 'Previous page'} className="rounded-lg p-2 text-slate-200 hover:bg-white/[0.08] disabled:opacity-40">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="min-w-20 text-center text-xs text-slate-300" aria-live="polite">
          {isChinese ? `${pageNumber} / ${pageCount || '—'} 页` : `Page ${pageNumber} / ${pageCount || '—'}`}
        </span>
        <button type="button" onClick={() => setPageNumber(page => Math.min(pageCount, page + 1))} disabled={!documentProxy || pageNumber >= pageCount} aria-label={isChinese ? '下一页' : 'Next page'} className="rounded-lg p-2 text-slate-200 hover:bg-white/[0.08] disabled:opacity-40">
          <ArrowRight className="h-4 w-4" />
        </button>
        <span className="mx-1 h-5 border-l border-white/10" aria-hidden="true" />
        <button type="button" onClick={() => setZoom(value => Math.max(0.6, Math.round((value - 0.2) * 10) / 10))} aria-label={isChinese ? '缩小' : 'Zoom out'} className="rounded-lg p-2 text-slate-200 hover:bg-white/[0.08]">
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-12 text-center text-xs text-slate-400">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom(value => Math.min(2.5, Math.round((value + 0.2) * 10) / 10))} aria-label={isChinese ? '放大' : 'Zoom in'} className="rounded-lg p-2 text-slate-200 hover:bg-white/[0.08]">
          <Plus className="h-4 w-4" />
        </button>

        <form onSubmit={handleSearch} className="flex min-w-[220px] flex-1 items-center gap-2 sm:ml-auto sm:max-w-md">
          <label htmlFor="jupiter-pdf-search" className="sr-only">{isChinese ? '搜索文档文字' : 'Search document text'}</label>
          <input id="jupiter-pdf-search" value={searchText} onChange={event => setSearchText(event.target.value)} placeholder={isChinese ? '在 PDF 中搜索' : 'Search in PDF'} className="min-h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-cyan-300/50" />
          <button type="submit" disabled={!documentProxy} aria-label={isChinese ? '搜索文档' : 'Search document'} className="rounded-xl bg-cyan-300/10 p-2.5 text-cyan-100 hover:bg-cyan-300/20 disabled:opacity-40">
            <Search className="h-4 w-4" />
          </button>
        </form>

        {matchingPages.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-slate-300">
            <button type="button" onClick={() => changeMatch(-1)} aria-label={isChinese ? '上一个搜索结果' : 'Previous search result'} className="rounded-lg p-2 hover:bg-white/[0.08]"><ArrowLeft className="h-3.5 w-3.5" /></button>
            <span>{matchIndex + 1}/{matchingPages.length}</span>
            <button type="button" onClick={() => changeMatch(1)} aria-label={isChinese ? '下一个搜索结果' : 'Next search result'} className="rounded-lg p-2 hover:bg-white/[0.08]"><ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>

      {status && <p role="status" className="mb-3 text-center text-xs text-slate-400">{status}</p>}
      {error ? (
        <div role="alert" className="rounded-2xl border border-rose-300/15 bg-rose-950/30 p-6 text-sm text-rose-100">
          <p>{isChinese ? '无法在 JUPITER 中显示此 PDF。文件可能受网络、跨域或来源访问政策限制。' : 'JUPITER could not display this PDF. Network, cross-origin, or source access policies may restrict it.'}</p>
          <p className="mt-2 break-words text-xs text-rose-100/70">{error}</p>
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 underline underline-offset-4">
            {isChinese ? '在来源网站打开' : 'Open at source'} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : (
        <div className="overflow-auto rounded-2xl border border-white/10 bg-black/20 p-3 sm:p-5">
          <canvas ref={canvasRef} aria-label={isChinese ? `PDF 第 ${pageNumber} 页` : `PDF page ${pageNumber}`} className="mx-auto block h-auto max-w-full shadow-2xl" />
        </div>
      )}
    </section>
  );
};
