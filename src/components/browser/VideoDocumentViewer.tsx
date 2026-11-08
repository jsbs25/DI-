import React, { useRef, useState } from 'react';
import { ExternalLink, Film, Info } from 'lucide-react';
import { Language } from '../../types/index.ts';
import { toEmbedVideoUrl } from './videoDocumentUrl.ts';

interface VideoDocumentViewerProps {
  sourceUrl: string;
  title: string;
  lang: Language;
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const VideoDocumentViewer: React.FC<VideoDocumentViewerProps> = ({ sourceUrl, title, lang }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [error, setError] = useState(false);
  const isChinese = lang === 'zh';
  const embedUrl = toEmbedVideoUrl(sourceUrl);

  const handlePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  };

  return (
    <section aria-label={isChinese ? '视频播放器' : 'Video player'} className="mx-auto w-full max-w-5xl rounded-3xl border border-white/[0.08] bg-[#0d151d] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.2)] sm:p-8">
      <header className="mb-5 flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-amber-200/20 bg-amber-200/[0.08] text-amber-100">
          <Film className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-amber-200/80">JUPITER · VIDEO</p>
          <h1 className="mt-1 break-words text-xl font-semibold text-white sm:text-2xl">{title}</h1>
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1.5 break-all text-xs text-cyan-200 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70">
            {isChinese ? '原始来源' : 'Original source'}
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        </div>
      </header>

      {embedUrl ? (
        <>
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black">
            <iframe
              src={embedUrl}
              title={title}
              className="aspect-video w-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
            <span>{isChinese ? '通过官方嵌入播放器播放；可用性、版权与地区限制由来源平台控制。若无法播放，请使用上方“原始来源”打开。' : 'Played via the official embed player; availability, copyright, and region restrictions are controlled by the source platform. If playback fails, open the original source above.'}</span>
          </p>
        </>
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-rose-300/15 bg-rose-950/30 p-6 text-sm text-rose-100">
          <p>{isChinese ? '无法从原始来源播放此视频。来源可能不可用、需要登录或拒绝访问。' : 'This video could not be played from its original source. The source may be unavailable, require login, or deny access.'}</p>
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 underline underline-offset-4">
            {isChinese ? '在来源网站打开' : 'Open at source'} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            src={sourceUrl}
            controls
            playsInline
            preload="metadata"
            onError={() => setError(true)}
            aria-label={title}
            className="max-h-[75vh] w-full rounded-2xl bg-black"
          />
          <label className="mt-4 flex w-fit items-center gap-2 text-xs text-slate-400">
            <span>{isChinese ? '播放速度' : 'Playback speed'}</span>
            <select
              value={playbackRate}
              onChange={event => handlePlaybackRate(Number(event.target.value))}
              aria-label={isChinese ? '选择播放速度' : 'Select playback speed'}
              className="min-h-9 rounded-lg border border-white/10 bg-[#111820] px-2 text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
            >
              {PLAYBACK_RATES.map(rate => <option key={rate} value={rate}>{rate}×</option>)}
            </select>
          </label>
        </>
      )}
    </section>
  );
};
