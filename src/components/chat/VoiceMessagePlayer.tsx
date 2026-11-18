import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2, AlertTriangle } from 'lucide-react';

// Global single-active audio controller so playing one voice message pauses any previous one.
let activeVoiceStopFn: (() => void) | null = null;

function formatVoiceTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

const STATIC_WAVE_BARS = [35, 62, 48, 84, 56, 92, 44, 72, 88, 52, 66, 94, 58, 76, 42, 68, 50, 78];

interface VoiceMessagePlayerProps {
  id: string;
  src: string;
  durationSec?: number;
  isMe?: boolean;
  onEndedNext?: () => void;
  registerPlay?: (id: string, playFn: () => void) => void;
  unregisterPlay?: (id: string) => void;
}

export const VoiceMessagePlayer: React.FC<VoiceMessagePlayerProps> = ({
  id,
  src,
  durationSec,
  isMe = false,
  onEndedNext,
  registerPlay,
  unregisterPlay,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(Math.max(0, Number(durationSec) || 0));
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);
  const [error, setError] = useState(false);

  const pauseSelf = () => {
    const el = audioRef.current;
    if (el && !el.paused) {
      try { el.pause(); } catch {}
    }
    setPlaying(false);
  };

  const startPlay = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (activeVoiceStopFn && activeVoiceStopFn !== pauseSelf) {
      try { activeVoiceStopFn(); } catch {}
    }
    activeVoiceStopFn = pauseSelf;
    setError(false);
    try {
      el.playbackRate = playbackRate;
      if (el.ended || (totalDuration > 0 && el.currentTime >= totalDuration - 0.1)) {
        el.currentTime = 0;
      }
      await el.play();
      setPlaying(true);
    } catch {
      setError(true);
      setPlaying(false);
    }
  };

  const togglePlay = () => {
    if (playing) {
      pauseSelf();
      if (activeVoiceStopFn === pauseSelf) activeVoiceStopFn = null;
    } else {
      void startPlay();
    }
  };

  const cycleRate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next: 1 | 1.5 | 2 = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el || !totalDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const target = ratio * totalDuration;
    try { el.currentTime = target; } catch {}
    setCurrentTime(target);
  };

  useEffect(() => {
    if (durationSec && durationSec > 0 && (!totalDuration || !Number.isFinite(totalDuration))) {
      setTotalDuration(durationSec);
    }
  }, [durationSec, totalDuration]);

  useEffect(() => {
    registerPlay?.(id, () => { void startPlay(); });
    return () => {
      unregisterPlay?.(id);
      if (activeVoiceStopFn === pauseSelf) activeVoiceStopFn = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, src]);

  const progress = totalDuration > 0 ? Math.max(0, Math.min(1, currentTime / totalDuration)) : 0;
  const displayTime = playing || currentTime > 0.2 ? currentTime : totalDuration;

  return (
    <div className={`rounded-xl px-2.5 py-2 min-w-[215px] sm:min-w-[260px] max-w-full border ${isMe ? 'border-white/25 bg-black/15 text-white' : 'border-slate-200 dark:border-white/15 bg-slate-100/80 dark:bg-black/25 text-slate-900 dark:text-slate-100'}`}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setTotalDuration(d);
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime || 0);
        }}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
          if (activeVoiceStopFn === pauseSelf) activeVoiceStopFn = null;
          onEndedNext?.();
        }}
        onPause={() => setPlaying(false)}
        onError={() => {
          setError(true);
          setPlaying(false);
        }}
      />
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? '暂停语音' : '播放语音'}
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition ${isMe ? 'bg-white text-sky-700 hover:bg-white/90' : 'bg-sky-600 text-white hover:bg-sky-500'}`}
        >
          {playing ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
        </button>

        <div
          onClick={handleSeek}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={Math.round(totalDuration)}
          aria-valuenow={Math.round(currentTime)}
          tabIndex={0}
          title="点击拖动语音进度"
          className="flex-1 flex items-center gap-[2px] h-7 cursor-pointer select-none px-0.5"
        >
          {STATIC_WAVE_BARS.map((h, i) => {
            const threshold = (i + 0.5) / STATIC_WAVE_BARS.length;
            const active = progress >= threshold;
            return (
              <span
                key={i}
                className={`flex-1 rounded-full transition-all duration-150 ${
                  active
                    ? (isMe ? 'bg-white' : 'bg-sky-600 dark:bg-sky-400')
                    : (isMe ? 'bg-white/35' : 'bg-slate-300 dark:bg-white/25')
                } ${playing && active ? 'animate-pulse' : ''}`}
                style={{ height: `${Math.max(24, h)}%` }}
              />
            );
          })}
        </div>

        <span className="text-[11px] font-medium tabular-nums shrink-0 opacity-90">
          {formatVoiceTime(displayTime)}
        </span>

        <button
          type="button"
          onClick={cycleRate}
          title="切换播放倍速"
          className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold tabular-nums shrink-0 border transition ${isMe ? 'border-white/30 bg-white/15 text-white hover:bg-white/25' : 'border-slate-300 dark:border-white/15 bg-white/70 dark:bg-white/10 text-slate-700 dark:text-slate-200'}`}
        >
          {playbackRate}x
        </button>
      </div>

      {error && (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-200 dark:text-amber-300">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>语音加载失败</span>
          <button type="button" onClick={() => { setError(false); void startPlay(); }} className="underline ml-1">重试</button>
        </div>
      )}
      {!error && !totalDuration && (
        <div className="mt-0.5 flex items-center gap-1 text-[10px] opacity-75">
          <Volume2 className="w-3 h-3" />
          <span>语音消息</span>
        </div>
      )}
    </div>
  );
};
