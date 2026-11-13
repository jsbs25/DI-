import React, { useState } from 'react';
import { ExternalLink, Minus, Plus, RotateCcw, Scan } from 'lucide-react';
import { Language } from '../../types/index.ts';

interface ImageDocumentViewerProps {
  sourceUrl: string;
  title: string;
  lang: Language;
}

export const ImageDocumentViewer: React.FC<ImageDocumentViewerProps> = ({ sourceUrl, title, lang }) => {
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  const isChinese = lang === 'zh';

  const enterFullscreen = async () => {
    try {
      await document.querySelector('[data-jupiter-image-viewer]')?.requestFullscreen();
    } catch (reason) {
      console.error('Unable to enter image fullscreen mode:', reason);
      setFullscreenError(isChinese ? '此浏览器无法进入全屏模式。' : 'Fullscreen mode is unavailable in this browser.');
    }
  };

  return (
    <section data-jupiter-image-viewer aria-label={isChinese ? '图片查看器' : 'Image viewer'} className="mx-auto w-full max-w-6xl">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#0d151d] p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-amber-200/80">JUPITER · IMAGE</p>
          <h1 className="mt-1 break-words text-lg font-semibold text-white sm:text-xl">{title}</h1>
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1.5 break-all text-xs text-cyan-200 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70">
            {isChinese ? '查看原始来源' : 'View original source'}
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-black/20 p-1">
          <button type="button" onClick={() => setZoom(value => Math.max(0.5, Math.round((value - 0.25) * 100) / 100))} aria-label={isChinese ? '缩小图片' : 'Zoom image out'} className="rounded-lg p-2 text-slate-200 hover:bg-white/[0.08]">
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-12 text-center text-xs text-slate-300">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom(value => Math.min(3, Math.round((value + 0.25) * 100) / 100))} aria-label={isChinese ? '放大图片' : 'Zoom image in'} className="rounded-lg p-2 text-slate-200 hover:bg-white/[0.08]">
            <Plus className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setZoom(1)} aria-label={isChinese ? '重置图片大小' : 'Reset image zoom'} className="rounded-lg p-2 text-slate-200 hover:bg-white/[0.08]">
            <RotateCcw className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => void enterFullscreen()} aria-label={isChinese ? '全屏查看图片' : 'View image fullscreen'} className="rounded-lg p-2 text-slate-200 hover:bg-white/[0.08]">
            <Scan className="h-4 w-4" />
          </button>
        </div>
      </header>

      {fullscreenError && <p role="status" className="mb-3 text-xs text-amber-100/80">{fullscreenError}</p>}
      {error ? (
        <div role="alert" className="rounded-2xl border border-rose-300/15 bg-rose-950/30 p-6 text-sm text-rose-100">
          <p>{isChinese ? '无法从原始来源加载此图片。来源可能不可用或拒绝访问。' : 'This image could not be loaded from its original source. The source may be unavailable or deny access.'}</p>
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 underline underline-offset-4">
            {isChinese ? '在来源网站打开' : 'Open at source'} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : (
        <div className="max-h-[75vh] overflow-auto rounded-2xl border border-white/[0.08] bg-[#111820] p-3 text-center sm:p-5">
          <img
            src={sourceUrl}
            alt={title}
            onError={() => setError(true)}
            className="mx-auto h-auto"
            style={{ width: `${zoom * 100}%`, maxWidth: zoom <= 1 ? '100%' : 'none' }}
          />
        </div>
      )}
    </section>
  );
};
