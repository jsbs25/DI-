import React, { useRef, useState } from 'react';
import { ExternalLink, Music2 } from 'lucide-react';
import { Language } from '../../types/index.ts';

interface AudioDocumentViewerProps {
  sourceUrl: string;
  title: string;
  lang: Language;
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const AudioDocumentViewer: React.FC<AudioDocumentViewerProps> = ({ sourceUrl, title, lang }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const isChinese = lang === 'zh';
  const durationLabel = duration === null || !Number.isFinite(duration)
    ? ''
    : `${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}`;

  const handlePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  };

  return (
    <section aria-label={isChinese ? '音频播放器' : 'Audio player'} className="mx-auto w-full max-w-4xl rounded-3xl border border-white/[0.08] bg-[#0d151d] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.2)] sm:p-10">
      <header className="mb-8 flex items-start gap-4 border-b border-white/[0.08] pb-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-amber-200/20 bg-amber-200/[0.08] text-amber-100">
          <Music2 className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-amber-200/80">JUPITER · AUDIO</p>
          <h1 className="mt-1 break-words text-xl font-semibold text-white sm:text-2xl">{title}</h1>
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1.5 break-all text-xs text-cyan-200 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70">
            {isChinese ? '原始来源 / 下载（遵循来源权限）' : 'Original source / download (subject to source permissions)'}
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        </div>
      </header>

      {error ? (
        <div role="alert" className="rounded-2xl border border-rose-300/15 bg-rose-950/30 p-6 text-sm text-rose-100">
          <p>{isChinese ? '无法从原始来源播放此音频。来源可能不可用或拒绝访问。' : 'This audio could not be played from its original source. The source may be unavailable or deny access.'}</p>
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 underline underline-offset-4">
            {isChinese ? '在来源网站打开' : 'Open at source'} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-black/20 p-4 sm:p-6">
          <audio
            ref={audioRef}
            src={sourceUrl}
            controls
            preload="metadata"
            className="w-full"
            aria-label={title}
            onLoadedMetadata={event => setDuration(event.currentTarget.duration)}
            onError={() => setError(true)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <span>{durationLabel ? (isChinese ? `时长 ${durationLabel}` : `Duration ${durationLabel}`) : (isChinese ? '时长由来源提供' : 'Duration provided by source')}</span>
            <label className="flex items-center gap-2">
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
          </div>
        </div>
      )}
    </section>
  );
};
