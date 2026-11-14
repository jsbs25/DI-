import React, { useState } from 'react';
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

const DEFAULT_COVER = '/assets/music/ambient-space.jpg';

export const GlobalMiniPlayer: React.FC<Props> = ({ lang, currentTab, onOpenMusic }) => {
  const isZh = lang === 'zh';
  const player = useMusicPlayer();
  const { state, currentTrack } = player;
  // Collapsed by default so navigating away doesn't pop up an intrusive 420px video box
  const [showEmbed, setShowEmbed] = useState(false);

  const isEmbed = currentTrack?.playback.kind === 'embed' || !!currentTrack?.playback.embedUrl;
  const duration = state.durationSec || currentTrack?.durationSeconds || 0;
  const progress = duration > 0 ? Math.min(100, (state.positionSec / duration) * 100) : 0;

  const title = currentTrack?.title || '';
  const artist = currentTrack?.artist || '';
  const cover = currentTrack?.coverUrl || DEFAULT_COVER;
  const canShow = !!currentTrack || state.queue.length > 0;

  const bottomOffset = 'calc(env(safe-area-inset-bottom) + 4.4rem)';

  if (!canShow) return null;
  if (currentTab === 'venus') return null;

  return (
    <>
      {isEmbed && showEmbed && currentTrack?.playback.embedUrl && (
        <div className="fixed right-3 bottom-[calc(env(safe-area-inset-bottom)+7.5rem)] md:right-6 md:bottom-24 z-50 w-[min(92vw,400px)] rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-xl dark:border-white/15 dark:bg-[#162238]/95">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-slate-900 dark:text-white">{title}</div>
              <div className="truncate text-[11px] text-slate-500 dark:text-slate-300">
                {artist} · {currentTrack?.playback.provider || currentTrack?.source || 'Embed'}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {currentTrack?.sourceUrl && (
                <a
                  href={currentTrack.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                  title={isZh ? '来源' : 'Source'}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <button
                onClick={() => setShowEmbed(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                title={isZh ? '收起画面' : 'Hide'}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <iframe
            title={title || 'Embedded player'}
            src={currentTrack.playback.embedUrl}
            className="aspect-video w-full rounded-xl border-0 bg-slate-950"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}

      <div
        className="pointer-events-auto fixed left-3 right-3 z-40 md:left-[6.5rem] md:right-6"
        style={{ bottom: bottomOffset }}
        aria-label="ONE MUSIC mini player"
      >
        <div className="mx-auto max-w-[1100px] rounded-2xl border border-slate-200/90 bg-white/92 px-3 py-2.5 shadow-lg backdrop-blur-xl dark:border-white/15 dark:bg-[#162238]/92 sm:px-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenMusic}
              className="group relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/[0.04]"
            >
              <img
                src={cover}
                alt=""
                referrerPolicy="no-referrer"
                onError={(e) => {
                  if (!e.currentTarget.dataset.fallback) {
                    e.currentTarget.dataset.fallback = '1';
                    e.currentTarget.src = DEFAULT_COVER;
                  }
                }}
                className="h-full w-full object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-slate-900/0 text-white opacity-0 transition group-hover:bg-slate-900/40 group-hover:opacity-100">
                <ChevronUp className="h-4 w-4" />
              </span>
            </button>

            <div className="min-w-0 flex-1">
              <button onClick={onOpenMusic} className="block w-full min-w-0 text-left">
                <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                  {title || (isZh ? '未选择曲目' : 'No track selected')}
                </div>
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {artist || currentTrack?.source || 'ONE MUSIC'}
                </div>
              </button>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/12">
                  <div
                    className="h-full rounded-full bg-sky-600 transition-[width] duration-200 dark:bg-sky-400"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="hidden w-20 shrink-0 text-right text-[10px] font-medium tabular-nums text-slate-500 dark:text-slate-400 sm:block">
                  {formatSeconds(state.positionSec)} / {formatSeconds(duration)}
                </span>
              </div>
              {state.error && (
                <div className="mt-1 truncate text-[11px] text-red-600 dark:text-red-400">
                  {state.error.message}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5">
              {isEmbed && (
                <button
                  onClick={() => setShowEmbed(s => !s)}
                  className={`hidden rounded-lg p-2 transition sm:inline-flex ${
                    showEmbed
                      ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
                  }`}
                  title={isZh ? '视频窗口' : 'Embed view'}
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => player.playPrevious()}
                className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                title={isZh ? '上一首' : 'Previous'}
              >
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
                className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-600 text-white shadow-xs transition hover:bg-sky-500 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                title={state.isPlaying ? (isZh ? '暂停' : 'Pause') : (isZh ? '播放' : 'Play')}
              >
                {state.isPlaying && !isEmbed ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
              </button>
              <button
                onClick={() => player.playNext()}
                className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                title={isZh ? '下一首' : 'Next'}
              >
                <SkipForward className="h-4 w-4" />
              </button>

              <button
                onClick={() => player.setRepeatMode(state.mode.repeat === 'one' ? 'off' : 'one')}
                className={`hidden rounded-lg p-2 transition sm:inline-flex ${
                  state.mode.repeat === 'one'
                    ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
                }`}
                title={isZh ? '循环' : 'Repeat'}
              >
                <Repeat className="h-4 w-4" />
              </button>
              <button
                onClick={() => player.toggleMute()}
                className="hidden rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 md:inline-flex dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                title={state.muted ? 'Unmute' : 'Mute'}
              >
                {state.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={state.muted ? 0 : state.volume}
                onChange={e => player.setVolume(parseFloat(e.target.value))}
                className="hidden h-1 w-20 cursor-pointer appearance-none rounded-lg bg-slate-200 accent-sky-600 md:block dark:bg-white/15 dark:accent-sky-400"
                aria-label={isZh ? '音量' : 'Volume'}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
