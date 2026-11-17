import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Disc3,
  ExternalLink,
  Maximize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
  X,
} from 'lucide-react';
import { useMusicPlayer } from '../../music/useMusicPlayer.ts';
import type { Language } from '../../types/index.ts';

type Props = {
  lang: Language;
  currentTab: string;
  onOpenMusic: () => void;
};

const DEFAULT_COVER = '/assets/music/ambient-space.jpg';

function buildLiveEmbedUrl(rawUrl: string | undefined, shouldAutoplay: boolean): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const u = new URL(rawUrl);
    if (u.hostname.includes('youtube')) {
      u.searchParams.set('autoplay', shouldAutoplay ? '1' : '0');
      u.searchParams.set('enablejsapi', '1');
      u.searchParams.set('playsinline', '1');
      u.searchParams.set('rel', '0');
      return u.toString();
    }
    if (u.hostname.includes('bilibili')) {
      u.searchParams.set('autoplay', shouldAutoplay ? '1' : '0');
      u.searchParams.set('danmaku', '0');
      u.searchParams.set('muted', '0');
      return u.toString();
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

export const GlobalMiniPlayer: React.FC<Props> = ({ lang, currentTab, onOpenMusic }) => {
  const isZh = lang === 'zh';
  const player = useMusicPlayer();
  const { state, currentTrack, sessionActivated, userStopped } = player;

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [showMiniVideo, setShowMiniVideo] = useState(false);
  const [stageRect, setStageRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [auroraIdx, setAuroraIdx] = useState(0);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const popoverStageAnchorRef = useRef<HTMLDivElement | null>(null);

  const canRunAudioSession = sessionActivated && !userStopped && !!currentTrack;
  const rawEmbed =
    currentTrack?.playback.embedUrl ||
    (currentTrack?.raw as any)?.embedUrl ||
    currentTrack?.sources.find((s) => s.kind === 'embed' && s.embedUrl)?.embedUrl;
  const liveEmbedSrc = canRunAudioSession ? buildLiveEmbedUrl(rawEmbed, state.isPlaying) : undefined;

  const isOnVenus = currentTab === 'venus';
  const showWristOrb = canRunAudioSession && !isOnVenus;

  // Cycle vibrant multi-color glow palette while playing on the Wrist-Orb
  useEffect(() => {
    if (!showWristOrb || !state.isPlaying) return;
    const timer = setInterval(() => {
      setAuroraIdx((i) => (i + 1) % 5);
    }, 1800);
    return () => clearInterval(timer);
  }, [showWristOrb, state.isPlaying]);

  // Close wrist popover when returning to full Music view
  useEffect(() => {
    if (isOnVenus) {
      setPopoverOpen(false);
    }
  }, [isOnVenus]);

  // Send instant YouTube postMessage play/pause so toggling play doesn't reload the video
  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !liveEmbedSrc || !liveEmbedSrc.includes('youtube')) return;
    try {
      win.postMessage(
        JSON.stringify({
          event: 'command',
          func: state.isPlaying ? 'playVideo' : 'pauseVideo',
          args: [],
        }),
        '*'
      );
    } catch {}
  }, [state.isPlaying, liveEmbedSrc]);

  // Dock the SINGLE persistent iframe cleanly into #venus-stage-slot or the Wrist-Orb mini preview
  useLayoutEffect(() => {
    if (!canRunAudioSession || !liveEmbedSrc) {
      setStageRect(null);
      return;
    }

    const measure = () => {
      const target = isOnVenus
        ? document.getElementById('venus-stage-slot')
        : popoverOpen && showMiniVideo
          ? popoverStageAnchorRef.current
          : null;
      if (!target) {
        setStageRect(null);
        return;
      }
      const r = target.getBoundingClientRect();
      if (r.width > 20 && r.height > 20) {
        setStageRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else {
        setStageRect(null);
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    const slot = document.getElementById('venus-stage-slot');
    if (slot) ro.observe(slot);
    if (popoverStageAnchorRef.current) ro.observe(popoverStageAnchorRef.current);

    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const rafTick = setInterval(measure, 250);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      clearInterval(rafTick);
    };
  }, [canRunAudioSession, liveEmbedSrc, isOnVenus, popoverOpen, showMiniVideo, currentTrack?.id]);

  if (!canRunAudioSession) return null;

  const title = currentTrack?.title || (isZh ? '正在播放' : 'Now Playing');
  const artist = currentTrack?.artist || 'ONE Music';
  const cover = currentTrack?.coverUrl || DEFAULT_COVER;
  const sourceLabel = currentTrack?.source || currentTrack?.playback.provider || 'YouTube / Bilibili';

  const glowColors = [
    'shadow-[0_0_24px_rgba(56,189,248,0.55)]',
    'shadow-[0_0_24px_rgba(192,132,252,0.55)]',
    'shadow-[0_0_24px_rgba(244,114,182,0.55)]',
    'shadow-[0_0_24px_rgba(251,191,36,0.55)]',
    'shadow-[0_0_24px_rgba(52,211,153,0.55)]',
  ];
  const activeGlow = state.isPlaying
    ? glowColors[auroraIdx]
    : 'shadow-[0_10px_28px_rgba(15,23,42,0.28)]';

  return (
    <>
      {/* Single persistent YouTube / Bilibili player iframe that NEVER unmounts across page switches */}
      {liveEmbedSrc && (
        <div
          style={
            stageRect
              ? {
                  position: 'fixed',
                  top: `${stageRect.top}px`,
                  left: `${stageRect.left}px`,
                  width: `${stageRect.width}px`,
                  height: `${stageRect.height}px`,
                  zIndex: isOnVenus ? 20 : 52,
                }
              : {
                  position: 'fixed',
                  bottom: '8px',
                  left: '8px',
                  width: '2px',
                  height: '2px',
                  opacity: 0.01,
                  pointerEvents: 'none',
                  zIndex: 0,
                }
          }
          className={stageRect ? 'overflow-hidden rounded-2xl bg-slate-950' : 'overflow-hidden'}
        >
          <iframe
            ref={iframeRef}
            key={currentTrack?.id || liveEmbedSrc}
            title={title}
            src={liveEmbedSrc}
            className="h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}

      {/* Luminous Multi-Color Wrist-Orb ("音乐灵腕") when navigating outside Music */}
      {showWristOrb && (
        <div
          className="fixed bottom-[calc(5.1rem+env(safe-area-inset-bottom))] left-3 md:bottom-7 md:left-[6.25rem] z-40 select-none"
          aria-label="ONE Music Wrist Orb"
        >
          {/* Compact Wrist-Orb Popover Card */}
          {popoverOpen && (
            <div className="mb-3 w-[min(88vw,288px)] rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 shadow-xl backdrop-blur-2xl dark:border-white/15 dark:bg-[#162238]/95">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{title}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-500 dark:text-slate-400">
                    <span className="truncate">{artist}</span>
                    <span aria-hidden="true">·</span>
                    <span className="shrink-0">{sourceLabel}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPopoverOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                  title={isZh ? '收起' : 'Close'}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {liveEmbedSrc && showMiniVideo && (
                <div
                  ref={popoverStageAnchorRef}
                  className="mt-2.5 aspect-video w-full overflow-hidden rounded-xl bg-slate-950"
                />
              )}

              <div className="mt-3 flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => player.playPrevious()}
                    className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                    title={isZh ? '上一首' : 'Previous'}
                  >
                    <SkipBack className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      player.unlockAudio();
                      void player.resumeAudioContext();
                      player.togglePlay();
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                    title={state.isPlaying ? (isZh ? '暂停' : 'Pause') : (isZh ? '播放' : 'Play')}
                  >
                    {state.isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => player.playNext()}
                    className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                    title={isZh ? '下一首' : 'Next'}
                  >
                    <SkipForward className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  {liveEmbedSrc && (
                    <button
                      type="button"
                      onClick={() => setShowMiniVideo((v) => !v)}
                      className={`flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl transition ${
                        showMiniVideo
                          ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300'
                          : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10'
                      }`}
                      title={isZh ? '切换画面' : 'Toggle video'}
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setPopoverOpen(false);
                      onOpenMusic();
                    }}
                    className="flex min-h-[38px] items-center gap-1 rounded-xl px-2.5 text-xs font-medium text-sky-600 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/15 whitespace-nowrap"
                  >
                    <span>{isZh ? '打开音乐' : 'Open'}</span>
                    <ExternalLink className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => player.stopAndHold()}
                    className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl text-rose-500 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/15"
                    title={isZh ? '停止播放' : 'Stop'}
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Compact Multi-Color Luminous Wrist-Orb + One-Tap Next Track Trigger */}
          <div
            className={`inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-[#0b1325]/88 p-1.5 backdrop-blur-2xl transition-shadow duration-700 ${activeGlow}`}
          >
            <button
              type="button"
              onClick={() => setPopoverOpen((o) => !o)}
              title={`${title} · ${artist}`}
              aria-label={isZh ? '音乐灵腕' : 'Music Wrist Orb'}
              className="relative flex h-10 w-10 items-center justify-center rounded-full cursor-pointer transition-transform hover:scale-105 active:scale-95"
            >
              {/* Multi-color rotating aurora rim */}
              <span
                className={`one-wrist-aurora absolute inset-0 rounded-full p-[2.5px] ${
                  state.isPlaying ? 'opacity-100' : 'opacity-45 [animation-play-state:paused]'
                }`}
              />
              <span className="relative z-10 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-slate-950 ring-2 ring-[#0b1325]">
                {cover ? (
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
                    className={`h-full w-full object-cover ${state.isPlaying ? 'animate-[spin_10s_linear_infinite]' : ''}`}
                  />
                ) : (
                  <Disc3 className={`h-4 w-4 text-sky-300 ${state.isPlaying ? 'animate-spin' : ''}`} />
                )}
              </span>
            </button>

            <button
              type="button"
              onClick={() => player.playNext()}
              title={isZh ? '换下一首' : 'Next song'}
              aria-label={isZh ? '换下一首' : 'Next song'}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/90 transition hover:bg-white/20 hover:text-white active:scale-90 cursor-pointer"
            >
              <SkipForward className="h-4 w-4 fill-current" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
