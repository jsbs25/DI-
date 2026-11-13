import React, { useMemo, useState } from 'react';
import { ChevronUp, ExternalLink, Maximize2, Pause, Play, Repeat, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import { useMusicPlayer } from '../../music/useMusicPlayer.ts';
import type { Language } from '../../types/index.ts';

function formatSeconds(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type Props = {
  lang: Language;
  currentTab: string;
  onOpenMusic: () => void;
};

export const GlobalMiniPlayer: React.FC<Props> = ({ lang, currentTab, onOpenMusic }) => {
  const isZh = lang === 'zh';
  const player = useMusicPlayer();
  const { state, currentTrack } = player;
  const [showEmbed, setShowEmbed] = useState(true);

  const isEmbed = currentTrack?.playback.kind === 'embed' || !!currentTrack?.playback.embedUrl;
  const duration = state.durationSec || currentTrack?.durationSeconds || 0;
  const progress = duration > 0 ? Math.min(100, (state.positionSec / duration) * 100) : 0;

  const title = currentTrack?.title || '';
  const artist = currentTrack?.artist || '';
  const cover = currentTrack?.coverUrl || '';
  const canShow = !!currentTrack || state.queue.length > 0;

  const bottomOffset = useMemo(() => {
    // keep above mobile dock when dock visible
    return 'calc(env(safe-area-inset-bottom) + 0.75rem)';
  }, []);

  if (!canShow) return null;
  if (currentTab === 'venus') return null; // Venus renders full player experience

  return (
    <>
      {isEmbed && showEmbed && currentTrack?.playback.embedUrl && (
        <div className="fixed right-3 bottom-[calc(env(safe-area-inset-bottom)+7.5rem)] md:right-6 md:bottom-24 z-50 w-[min(92vw,420px)] rounded-2xl border border-[var(--color-one-border-strong)] bg-[rgba(14,19,27,0.96)] p-3 shadow-[var(--shadow-one-lg)] backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-[var(--color-one-text)]">{title}</div>
              <div className="truncate text-[11px] text-[var(--color-one-text-muted)]">{artist} · {currentTrack?.playback.provider || currentTrack?.source || 'embed'}</div>
            </div>
            <div className="flex items-center gap-1">
              {currentTrack?.sourceUrl && (
                <a href={currentTrack.sourceUrl} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-[var(--color-one-text-muted)] hover:bg-white/5 hover:text-white" title={isZh ? '来源' : 'Source'}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <button onClick={() => setShowEmbed(false)} className="rounded-lg p-1.5 text-[var(--color-one-text-muted)] hover:bg-white/5 hover:text-white" title={isZh ? '收起画面' : 'Hide'}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <iframe
            title={title || 'Embedded player'}
            src={currentTrack.playback.embedUrl}
            className="aspect-video w-full rounded-xl border-0 bg-black"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
          <p className="mt-2 text-[11px] text-[var(--color-one-text-dim)]">{isZh ? '嵌入来源由官方播放器控制播放/暂停。' : 'Playback controls are provided by the embedded source.'}</p>
        </div>
      )}

      <div
        className="pointer-events-auto fixed left-3 right-3 z-40 md:left-[6.5rem] md:right-6"
        style={{ bottom: bottomOffset }}
        aria-label="ONE MUSIC mini player"
      >
        <div className="mx-auto max-w-[1100px] rounded-2xl border border-[var(--color-one-border-strong)] bg-[rgba(14,19,27,0.88)] px-3 py-2.5 shadow-[var(--shadow-one-md)] backdrop-blur-xl sm:px-4">
          <div className="flex items-center gap-3">
            <button onClick={onOpenMusic} className="group relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
              {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full" />}
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100"><ChevronUp className="h-4 w-4" /></span>
            </button>

            <div className="min-w-0 flex-1">
              <button onClick={onOpenMusic} className="block w-full min-w-0 text-left">
                <div className="truncate text-sm font-medium text-white">{title || (isZh ? '未选择曲目' : 'No track selected')}</div>
                <div className="truncate text-xs text-[var(--color-one-text-muted)]">{artist || currentTrack?.source || (isZh ? 'ONE MUSIC' : 'ONE MUSIC')}</div>
              </button>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[var(--color-one-accent)] transition-[width] duration-200" style={{ width: `${progress}%` }} />
                </div>
                <span className="hidden w-20 shrink-0 text-right text-[10px] tabular-nums text-[var(--color-one-text-dim)] sm:block">{formatSeconds(state.positionSec)} / {formatSeconds(duration)}</span>
              </div>
              {state.error && <div className="mt-1 truncate text-[11px] text-[var(--color-one-danger)]">{state.error.message}</div>}
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5">
              {isEmbed && (
                <button onClick={() => setShowEmbed(s => !s)} className={`hidden rounded-lg p-2 transition sm:inline-flex ${showEmbed ? 'text-[var(--color-one-accent)] bg-white/5' : 'text-[var(--color-one-text-muted)] hover:bg-white/5 hover:text-white'}`} title={isZh ? '嵌入画面' : 'Embed view'}>
                  <Maximize2 className="h-4 w-4" />
                </button>
              )}
              <button onClick={() => player.playPrevious()} className="rounded-lg p-2 text-[var(--color-one-text-muted)] hover:bg-white/5 hover:text-white" title={isZh ? '上一首' : 'Previous'}>
                <SkipBack className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  if (isEmbed) {
                    setShowEmbed(true);
                    onOpenMusic();
                    return;
                  }
                  void player.resumeAudioContext();
                  player.togglePlay();
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#0a0d12] hover:bg-[#f4f3ee]"
                title={state.isPlaying ? (isZh ? '暂停' : 'Pause') : (isZh ? '播放' : 'Play')}
              >
                {state.isPlaying && !isEmbed ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
              </button>
              <button onClick={() => player.playNext()} className="rounded-lg p-2 text-[var(--color-one-text-muted)] hover:bg-white/5 hover:text-white" title={isZh ? '下一首' : 'Next'}>
                <SkipForward className="h-4 w-4" />
              </button>

              <button onClick={() => player.setRepeatMode(state.mode.repeat === 'one' ? 'off' : 'one')} className={`hidden rounded-lg p-2 sm:inline-flex ${state.mode.repeat === 'one' ? 'text-[var(--color-one-accent)] bg-white/5' : 'text-[var(--color-one-text-muted)] hover:bg-white/5 hover:text-white'}`} title={isZh ? '循环' : 'Repeat'}>
                <Repeat className="h-4 w-4" />
              </button>
              <button onClick={() => player.toggleMute()} className="hidden rounded-lg p-2 text-[var(--color-one-text-muted)] hover:bg-white/5 hover:text-white md:inline-flex" title={state.muted ? 'Unmute' : 'Mute'}>
                {state.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={state.muted ? 0 : state.volume}
                onChange={e => player.setVolume(parseFloat(e.target.value))}
                className="hidden h-1 w-20 cursor-pointer appearance-none rounded-lg bg-white/15 accent-[var(--color-one-accent)] md:block"
                aria-label={isZh ? '音量' : 'Volume'}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
