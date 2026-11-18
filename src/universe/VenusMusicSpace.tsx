import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Disc3,
  ExternalLink,
  ListMusic,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Repeat,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { Language } from '../types/index.ts';
import type { MusicTrack } from '../types/music.ts';
import { useMusicPlayer } from '../music/useMusicPlayer.ts';
import {
  getEffectiveMediaRegion,
  getMediaRegionMode,
  probeClientMediaConnectivity,
  setMediaRegionMode,
  subscribeMediaScheduler,
} from '../services/media/scheduler.ts';
import type { MediaRegionMode } from '../types/media.ts';
import type { VenusAgentAction } from '../utils/oneAgentController.ts';

interface VenusMusicSpaceProps {
  lang: Language;
  onBack: () => void;
  quickAction?: VenusAgentAction | null;
}

const GENRE_FILTERS = [
  { id: 'all', zh: '全部热歌', en: 'All' },
  { id: 'mandopop', zh: '华语流行', en: 'Mandopop' },
  { id: 'pop', zh: '欧美热歌', en: 'Global Pop' },
  { id: 'jkpop', zh: '日韩精选', en: 'J/K-Pop' },
  { id: 'piano', zh: '钢琴氛围', en: 'Piano & Ambient' },
  { id: 'bilibili', zh: 'B站音乐', en: 'Bilibili' },
  { id: 'youtube', zh: 'YouTube 精选', en: 'YouTube' },
];

const DEFAULT_COVER = '/assets/music/ambient-space.jpg';

function formatSeconds(sec: number) {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function isYouTubeOrBilibiliTrack(t: any): boolean {
  if (!t) return false;
  if (t.availabilityStatus === 'unavailable' || t.playbackType === 'external_redirect') return false;
  const embed = String(t.embedUrl || t.playback?.embedUrl || '');
  const src = String(t.source || t.providerId || t.sourceUrl || '').toLowerCase();
  const isYtOrBili =
    embed.includes('youtube.com') ||
    embed.includes('youtu.be') ||
    embed.includes('bilibili.com') ||
    src.includes('youtube') ||
    src.includes('bilibili');
  return Boolean(embed) && isYtOrBili;
}

function normalizeServerTrack(t: any): MusicTrack {
  const coverUrl =
    typeof t?.coverUrl === 'string' && t.coverUrl.trim() && !t.coverUrl.includes('images.unsplash.com')
      ? t.coverUrl
      : DEFAULT_COVER;
  const embedUrl = t?.embedUrl || t?.playback?.embedUrl;
  return {
    ...t,
    embedUrl,
    coverUrl,
    playable: embedUrl ? 'embed' : undefined,
  };
}

function isUrlOrBvidQuery(q: string): boolean {
  const s = q.trim();
  return (
    /^https?:\/\//i.test(s) ||
    /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be|bilibili\.com|b23\.tv)\//i.test(s) ||
    /^BV[0-9A-Za-z]{8,14}$/i.test(s)
  );
}

function handleCoverError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (img.dataset.fallbackApplied) return;
  img.dataset.fallbackApplied = '1';
  img.src = DEFAULT_COVER;
}

export const VenusMusicSpace: React.FC<VenusMusicSpaceProps> = ({ lang, onBack, quickAction }) => {
  const isZh = lang === 'zh';
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('all');
  const [view, setView] = useState<'discover' | 'queue'>('discover');

  const player = useMusicPlayer();
  const { state: p, currentTrack } = player;
  const isPlaying = p.isPlaying;
  const isLoop = p.mode.repeat === 'one';
  const isShuffle = p.mode.shuffle;

  const [showEmbedStage, setShowEmbedStage] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [regionMode, setRegionModeState] = useState<MediaRegionMode>(() => getMediaRegionMode());
  const [effectiveRegion, setEffectiveRegion] = useState(() => getEffectiveMediaRegion());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const handledQuickSeqRef = useRef<number>(0);
  const crawlOverrideRef = useRef<boolean>(false);
  const didAutoStartRef = useRef<boolean>(false);

  const showNotice = (msg: string, ms = 3200) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNotice(msg);
    noticeTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setNotice(null);
    }, ms);
  };

  useEffect(() => {
    mountedRef.current = true;
    player.activateMusicSession();
    void probeClientMediaConnectivity();
    const unsub = subscribeMediaScheduler(() => {
      if (!mountedRef.current) return;
      setRegionModeState(getMediaRegionMode());
      setEffectiveRegion(getEffectiveMediaRegion());
    });
    return () => {
      mountedRef.current = false;
      unsub();
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      loadAbortRef.current?.abort();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleTracks = useMemo(() => {
    return tracks.filter((t) => !player.failedTrackIds.has(t.id) && isYouTubeOrBilibiliTrack(t));
  }, [tracks, player.failedTrackIds]);

  const loadTracks = async (genre = 'all', query = '', regionOverride = effectiveRegion) => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 14000);
    if (mountedRef.current) setLoading(true);
    try {
      const endpoint = query.trim()
        ? `/api/music/search?q=${encodeURIComponent(query)}&genre=${encodeURIComponent(genre)}&region=${regionOverride}`
        : `/api/music/tracks?genre=${encodeURIComponent(genre)}&region=${regionOverride}`;
      const res = await fetch(endpoint, { signal: controller.signal });
      const data = await res.json();
      if (!mountedRef.current || controller.signal.aborted) return;
      if (data.success && Array.isArray(data.tracks)) {
        const normalized = data.tracks
          .map(normalizeServerTrack)
          .filter((t: MusicTrack) => isYouTubeOrBilibiliTrack(t) && !player.isTrackFailed(t.id));
        setTracks(normalized);
      } else {
        setTracks([]);
      }
    } catch {
      if (!mountedRef.current || controller.signal.aborted) return;
      setTracks([]);
    } finally {
      clearTimeout(timeout);
      if (mountedRef.current && !controller.signal.aborted) setLoading(false);
    }
  };

  const searchDirectUrlTrack = async (rawUrl: string) => {
    setSearching(true);
    try {
      const res = await fetch(`/api/music/search?q=${encodeURIComponent(rawUrl)}&region=${effectiveRegion}`);
      const data = await res.json();
      if (!mountedRef.current) return;
      if (data.success && Array.isArray(data.tracks)) {
        const mapped = data.tracks
          .map(normalizeServerTrack)
          .filter((t: MusicTrack) => isYouTubeOrBilibiliTrack(t) && !player.isTrackFailed(t.id));
        if (mapped.length > 0) {
          setTracks(mapped);
          setShowEmbedStage(true);
          player.playTrack(mapped[0], mapped, 0);
        } else {
          showNotice(isZh ? '未解析到可播放的 YouTube / Bilibili 曲目。' : 'No playable YouTube / Bilibili track resolved.');
        }
      }
    } catch {
      showNotice(isZh ? '网络波动，请稍后重试。' : 'Network error.');
    } finally {
      if (mountedRef.current) {
        setSearching(false);
        setLoading(false);
      }
    }
  };

  const executeUnifiedSearch = async () => {
    const q = searchQuery.trim();
    if (!q) {
      void loadTracks(selectedGenre, '');
      return;
    }
    if (isUrlOrBvidQuery(q)) {
      await searchDirectUrlTrack(q);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(
        `/api/music/search?q=${encodeURIComponent(q)}&genre=${encodeURIComponent(selectedGenre)}&region=${effectiveRegion}`
      );
      const data = await res.json();
      if (!mountedRef.current) return;

      if (data.success && Array.isArray(data.tracks)) {
        const mapped = data.tracks
          .map(normalizeServerTrack)
          .filter((t: MusicTrack) => isYouTubeOrBilibiliTrack(t) && !player.isTrackFailed(t.id));
        setTracks(mapped);
        if (mapped.length > 0) {
          showNotice(isZh ? `已从 YouTube & Bilibili 抓取 ${mapped.length} 首曲目` : `Found ${mapped.length} YouTube & Bilibili tracks`, 2600);
        } else {
          showNotice(isZh ? '暂未找到匹配的 YouTube / Bilibili 音乐，请换个关键词。' : 'No YouTube / Bilibili music matched.');
        }
      }
    } catch {
      showNotice(isZh ? '搜索服务暂不可用，请重试。' : 'Search failed.');
    } finally {
      if (mountedRef.current) setSearching(false);
    }
  };

  // Run quickAction triggered by One. AI assistant
  useEffect(() => {
    if (!quickAction || quickAction.seq === handledQuickSeqRef.current) return;
    handledQuickSeqRef.current = quickAction.seq;
    crawlOverrideRef.current = true;
    didAutoStartRef.current = true;
    loadAbortRef.current?.abort();

    const runAutoCrawlAndPlay = async () => {
      const kw = (quickAction.query || '').trim();
      setLoading(true);
      setSearching(true);
      setShowEmbedStage(true);
      if (kw) setSearchQuery(kw);
      showNotice(
        isZh
          ? kw
            ? `One. 正在通过 YouTube & Bilibili 抓取并播放「${kw}」…`
            : 'One. 正在为你抓取 YouTube & Bilibili 热门曲目…'
          : 'One. is fetching from YouTube & Bilibili…',
        3400
      );

      try {
        const res = await fetch('/api/music/crawl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: kw || '热门音乐', query: kw || '热门音乐' }),
        });
        const data = await res.json();
        const rawList = Array.isArray(data?.tracks) ? data.tracks : [];
        const seen = new Set<string>();
        const combined: MusicTrack[] = rawList
          .map(normalizeServerTrack)
          .filter((t: MusicTrack) => {
            if (!t?.id || seen.has(t.id) || player.isTrackFailed(t.id)) return false;
            seen.add(t.id);
            return isYouTubeOrBilibiliTrack(t);
          });

        if (!mountedRef.current) return;
        setTracks(combined);

        if (combined.length > 0) {
          const chosenIdx = kw ? 0 : Math.floor(Math.random() * Math.min(combined.length, 6));
          const chosen = combined[chosenIdx] || combined[0];
          player.playTrack(chosen, combined, chosenIdx);
          showNotice(
            isZh
              ? `正在播放：${chosen.title} · ${chosen.artist}`
              : `Playing: ${chosen.title} · ${chosen.artist}`,
            3600
          );
        } else {
          showNotice(isZh ? '暂时未抓取到匹配曲目，请稍后重试。' : 'No matching tracks fetched.');
        }
      } catch {
        if (!mountedRef.current) return;
        showNotice(isZh ? '抓取歌曲时出现网络波动，请重试。' : 'Network hiccup while fetching.');
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setSearching(false);
          crawlOverrideRef.current = false;
        }
      }
    };

    void runAutoCrawlAndPlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickAction]);

  // Initial load & genre filter load
  useEffect(() => {
    if (crawlOverrideRef.current) return;
    void loadTracks(selectedGenre, searchQuery.trim(), effectiveRegion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGenre, effectiveRegion]);

  // Auto-play first YouTube/Bilibili track right upon entering Music
  useEffect(() => {
    if (didAutoStartRef.current || loading || searching || crawlOverrideRef.current || quickAction) return;
    if (visibleTracks.length === 0) return;
    didAutoStartRef.current = true;
    if (p.isPlaying && currentTrack) return;

    setShowEmbedStage(true);
    player.playTrack(visibleTracks[0], visibleTracks, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searching, visibleTracks.length, quickAction]);

  // Smooth slim audio spectrum visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      animFrameRef.current = requestAnimationFrame(render);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const bars = 28;
      const gap = 3;
      const w = (canvas.width - gap * (bars - 1)) / bars;
      const isDark = document.documentElement.classList.contains('dark');
      const now = Date.now() * 0.0044;

      for (let i = 0; i < bars; i++) {
        let ratio: number;
        if (isPlaying) {
          const wave1 = Math.sin(now + i * 0.42);
          const wave2 = Math.cos(now * 1.45 - i * 0.27);
          const env = 0.62 + 0.38 * Math.sin((i / bars) * Math.PI);
          ratio = Math.max(0.14, Math.min(0.92, (0.46 + 0.24 * wave1 + 0.16 * wave2) * env));
        } else {
          ratio = 0.08 + 0.03 * Math.sin(i * 0.5);
        }

        const h = Math.max(2, ratio * canvas.height * 0.85);
        const x = i * (w + gap);
        const y = canvas.height - h;

        ctx.fillStyle = isPlaying
          ? isDark
            ? 'rgba(56, 189, 248, 0.78)'
            : 'rgba(2, 132, 199, 0.78)'
          : isDark
            ? 'rgba(148, 163, 184, 0.25)'
            : 'rgba(148, 163, 184, 0.32)';
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, [2, 2, 0, 0]);
        ctx.fill();
      }
    };

    render();
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying]);

  const rawEmbedSrc = (currentTrack as any)?.playback?.embedUrl || (currentTrack as any)?.embedUrl;
  const hasEmbed = Boolean(rawEmbedSrc);
  const activeSourceUrl = currentTrack?.playback?.sourceUrl || currentTrack?.sourceUrl;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('one-venus-stage-change'));
  }, [hasEmbed, showEmbedStage, player.userStopped, currentTrack?.id]);

  const togglePlay = () => {
    if (!currentTrack && visibleTracks.length > 0) {
      handleSelectTrack(0);
      return;
    }
    if (!currentTrack) return;
    player.togglePlay();
  };

  const handleSelectTrack = (index: number) => {
    const track = visibleTracks[index];
    if (!track) return;
    setShowEmbedStage(true);
    player.playTrack(track, visibleTracks, index);
  };

  const queue = p.queue.filter((item) => !player.failedTrackIds.has(item.track.id) && isYouTubeOrBilibiliTrack(item.track.raw || item.track));

  return (
    <div className="w-full max-w-full bg-[var(--color-one-bg)] text-[var(--color-one-text)] transition-colors">
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-8 pt-3 sm:px-6 md:px-8">
        {/* Clean Header */}
        <header className="mb-5 flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200/80 pb-3.5 dark:border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-2 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-white whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>{isZh ? '返回' : 'Back'}</span>
            </button>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
              ONE Music
            </h1>
            <span className="hidden sm:inline text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
              YouTube · Bilibili
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex items-center rounded-xl bg-slate-100 p-1 dark:bg-white/6">
              {([
                { id: 'auto', zh: '自动', en: 'Auto' },
                { id: 'overseas', zh: 'YouTube', en: 'YouTube' },
                { id: 'cn', zh: 'B站', en: 'Bilibili' },
              ] as const).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMediaRegionMode(m.id);
                    if (m.id === 'overseas') setSelectedGenre((prev) => (prev === 'bilibili' ? 'youtube' : prev));
                    if (m.id === 'cn') setSelectedGenre((prev) => (prev === 'youtube' ? 'bilibili' : prev));
                  }}
                  className={`min-h-[34px] rounded-lg px-2.5 text-xs font-medium transition whitespace-nowrap ${
                    regionMode === m.id
                      ? 'bg-white text-sky-600 shadow-2xs dark:bg-sky-500/20 dark:text-sky-300'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                  }`}
                >
                  {isZh ? m.zh : m.en}
                </button>
              ))}
            </div>

            <div className="inline-flex items-center rounded-xl bg-slate-100 p-1 dark:bg-white/6">
              <button
                type="button"
                onClick={() => setView('discover')}
                className={`min-h-[34px] rounded-lg px-3 text-xs font-medium transition whitespace-nowrap ${
                  view === 'discover'
                    ? 'bg-white text-slate-900 shadow-2xs dark:bg-white/14 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                {isZh ? '曲库' : 'Library'}
              </button>
              <button
                type="button"
                onClick={() => setView('queue')}
                className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition whitespace-nowrap tabular-nums ${
                  view === 'queue'
                    ? 'bg-white text-slate-900 shadow-2xs dark:bg-white/14 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                <ListMusic className="h-3.5 w-3.5" />
                <span>{isZh ? `队列 ${queue.length}` : `Queue ${queue.length}`}</span>
              </button>
            </div>

            {currentTrack && !player.userStopped && (
              <button
                type="button"
                onClick={() => player.stopAndHold()}
                title={isZh ? '停止播放' : 'Stop playback'}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 dark:border-white/12 dark:text-slate-300 dark:hover:border-rose-400/40 dark:hover:bg-rose-500/10 dark:hover:text-rose-300 whitespace-nowrap"
              >
                <Square className="h-3 w-3 fill-current" />
                <span className="hidden sm:inline">{isZh ? '停止' : 'Stop'}</span>
              </button>
            )}
          </div>
        </header>

        {notice && (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-sky-200/80 bg-sky-50/70 px-3.5 py-2 text-xs text-sky-900 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-100">
            <span className="truncate">{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="shrink-0 opacity-70 hover:opacity-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Balanced 2-Column Studio Layout */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
          {/* Unified Responsive Player Deck (hosts #venus-stage-slot across all viewports) */}
          <section className="w-full min-w-0 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-white/12 dark:bg-[#162238] sm:p-5 lg:sticky lg:top-20">
            <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-950 shadow-sm dark:border-white/10">
              {hasEmbed && showEmbedStage && !player.userStopped ? (
                <div
                  id="venus-stage-slot"
                  className="relative aspect-video w-full overflow-hidden rounded-2xl bg-slate-950"
                >
                  {currentTrack?.coverUrl && (
                    <img
                      src={currentTrack.coverUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={handleCoverError}
                      className="h-full w-full object-cover opacity-35"
                    />
                  )}
                </div>
              ) : (
                <div className="aspect-video w-full overflow-hidden bg-slate-100 dark:bg-slate-900">
                  {currentTrack?.coverUrl ? (
                    <img
                      src={currentTrack.coverUrl}
                      alt={currentTrack.title}
                      referrerPolicy="no-referrer"
                      onError={handleCoverError}
                      className={`h-full w-full object-cover transition duration-700 ${
                        isPlaying ? 'scale-[1.03]' : 'scale-100'
                      }`}
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
                      <Disc3 className={`h-10 w-10 ${isPlaying || loading ? 'animate-spin' : ''}`} />
                      <span className="text-xs font-medium tracking-wider">
                        {loading ? (isZh ? '正在抓取热歌…' : 'FETCHING…') : 'ONE MUSIC'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {hasEmbed && !player.userStopped && (
                <button
                  type="button"
                  onClick={() => setShowEmbedStage((s) => !s)}
                  className="absolute right-2.5 top-2.5 z-30 inline-flex items-center gap-1 rounded-lg bg-slate-900/75 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md transition hover:bg-slate-900"
                >
                  {showEmbedStage ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                  <span>{showEmbedStage ? (isZh ? '切回封面' : 'Cover') : (isZh ? '显示画面' : 'Video')}</span>
                </button>
              )}
            </div>

            <div className="mt-4">
              <h2 className="truncate text-base font-semibold tracking-tight text-slate-900 dark:text-white sm:text-lg">
                {currentTrack?.title || (loading ? (isZh ? '正在自动载入歌曲…' : 'Auto-loading track…') : isZh ? '选择一首歌曲' : 'Select a track')}
              </h2>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <p className="truncate">
                  {currentTrack?.artist || 'YouTube · Bilibili'}
                  {currentTrack?.source ? ` · ${currentTrack.source}` : ''}
                </p>
                {activeSourceUrl && (
                  <a
                    href={activeSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-sky-600 hover:underline dark:text-sky-400"
                  >
                    <span>{isZh ? '原平台' : 'Source'}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>

            <div className="mt-3.5 w-full overflow-hidden">
              <canvas ref={canvasRef} width={320} height={22} className="block h-5.5 w-full max-w-full" />
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                {isZh ? '退出页面将自动转入音乐灵腕' : 'Continues in Wrist-Orb on exit'}
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => player.toggleShuffle()}
                  title={isZh ? '随机播放' : 'Shuffle'}
                  className={`flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl transition ${
                    isShuffle ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Shuffle className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => player.playPrevious()}
                  title={isZh ? '上一首' : 'Previous'}
                  className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <SkipBack className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  title={isPlaying ? (isZh ? '暂停' : 'Pause') : (isZh ? '播放' : 'Play')}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-600 text-white shadow-xs transition hover:bg-sky-500 dark:bg-white dark:text-slate-900"
                >
                  {isPlaying ? <Pause className="h-4.5 w-4.5 fill-current" /> : <Play className="ml-0.5 h-4.5 w-4.5 fill-current" />}
                </button>
                <button
                  type="button"
                  onClick={() => player.playNext()}
                  title={isZh ? '下一首' : 'Next'}
                  className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <SkipForward className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => player.setRepeatMode(isLoop ? 'off' : 'one')}
                  title={isZh ? '单曲循环' : 'Repeat One'}
                  className={`flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl transition ${
                    isLoop ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Repeat className="h-4 w-4" />
                </button>
              </div>
            </div>

            {p.error && (
              <div
                data-testid="music-error-banner"
                className="mt-3 rounded-lg border border-red-200 bg-red-50/90 px-3 py-2 text-xs text-red-700 dark:border-red-500/25 dark:bg-red-500/12 dark:text-red-200"
              >
                {p.error.message}
              </div>
            )}
          </section>

          {/* Right Clean Library / Queue (Strictly YouTube & Bilibili) */}
          <section className="w-full min-w-0 rounded-2xl border border-slate-200/90 bg-white p-4 dark:border-white/12 dark:bg-[#162238] sm:p-5">
            {view === 'discover' ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void executeUnifiedSearch();
                      }}
                      placeholder={isZh ? '搜索歌名、歌手、YouTube 链接或 B站 BV 号…' : 'Search song, artist, YouTube URL or Bilibili BV…'}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-8 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-sky-500 focus:bg-white dark:border-white/12 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-sky-400"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          void loadTracks(selectedGenre, '');
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => void executeUnifiedSearch()}
                    disabled={searching}
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-sky-600 px-4 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:opacity-45 dark:bg-white dark:text-slate-900 whitespace-nowrap"
                  >
                    {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    <span>{isZh ? '搜索' : 'Search'}</span>
                  </button>
                </div>

                {/* Single-Row Clean Genre Filter Strip */}
                <div className="mt-3.5 flex w-full max-w-full items-center gap-1 overflow-x-auto border-b border-slate-200/80 pb-2 dark:border-white/10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {GENRE_FILTERS.map((g) => {
                    const active = selectedGenre === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setSelectedGenre(g.id)}
                        className={`min-h-[36px] shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                          active
                            ? 'bg-slate-900 text-white dark:bg-sky-500/20 dark:text-sky-300'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/6 dark:hover:text-white'
                        }`}
                      >
                        {isZh ? g.zh : g.en}
                      </button>
                    );
                  })}
                </div>

                {/* Clean Hairline-Divided YouTube & Bilibili Tracklist */}
                <div className="mt-2 max-h-[58vh] lg:max-h-[62vh] overflow-y-auto divide-y divide-slate-100 dark:divide-white/8 pr-1">
                  {loading || searching ? (
                    <div className="flex items-center justify-center gap-2 py-14 text-sm text-slate-500 dark:text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400" />
                      <span>{isZh ? '正在从 YouTube & Bilibili 抓取可播放曲目…' : 'Crawling YouTube & Bilibili tracks…'}</span>
                    </div>
                  ) : visibleTracks.length === 0 ? (
                    <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                      {isZh ? '暂未抓取到曲目，请更换关键词再试。' : 'No YouTube or Bilibili tracks found.'}
                    </div>
                  ) : (
                    visibleTracks.map((track, idx) => {
                      const isCurrent = currentTrack?.id === track.id;
                      const provider = track.source || (String(track.embedUrl || '').includes('bilibili') ? 'Bilibili' : 'YouTube');
                      return (
                        <button
                          key={track.id}
                          type="button"
                          onClick={() => handleSelectTrack(idx)}
                          className={`group flex min-h-[56px] w-full items-center gap-3 px-2 py-2.5 text-left transition ${
                            isCurrent
                              ? 'bg-sky-50/75 dark:bg-sky-500/10'
                              : 'hover:bg-slate-50/90 dark:hover:bg-white/[0.04]'
                          }`}
                        >
                          <span className="w-6 shrink-0 text-center text-xs font-medium tabular-nums text-slate-400 dark:text-slate-500">
                            {isCurrent ? (
                              isPlaying ? (
                                <Pause className="mx-auto h-3.5 w-3.5 text-sky-600 dark:text-sky-400 fill-current" />
                              ) : (
                                <Play className="mx-auto h-3.5 w-3.5 text-sky-600 dark:text-sky-400 fill-current" />
                              )
                            ) : (
                              String(idx + 1).padStart(2, '0')
                            )}
                          </span>

                          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                            <img
                              src={track.coverUrl || DEFAULT_COVER}
                              alt=""
                              referrerPolicy="no-referrer"
                              onError={handleCoverError}
                              className="h-full w-full object-cover"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div
                              className={`truncate text-sm font-medium ${
                                isCurrent ? 'text-sky-700 dark:text-sky-300' : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {track.title}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                              {track.artist} · {provider}
                            </div>
                          </div>

                          <span className="w-11 shrink-0 text-right text-xs tabular-nums text-slate-400 dark:text-slate-500">
                            {track.durationSeconds ? formatSeconds(track.durationSeconds) : '--:--'}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/8">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                    {isZh ? `播放队列 (${queue.length})` : `Play Queue (${queue.length})`}
                  </h3>
                  {queue.length > 0 && (
                    <button
                      type="button"
                      onClick={() => player.clearQueue()}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-xs text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{isZh ? '清空' : 'Clear'}</span>
                    </button>
                  )}
                </div>
                <div className="mt-2 max-h-[60vh] divide-y divide-slate-100 overflow-y-auto dark:divide-white/8 pr-1">
                  {queue.length === 0 ? (
                    <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                      {isZh ? '播放队列为空。' : 'Queue is empty.'}
                    </div>
                  ) : (
                    queue.map((item, i) => {
                      const t = item.track;
                      const active = currentTrack?.id === t.id;
                      const provider = t.source || (String(t.playback?.embedUrl || '').includes('bilibili') ? 'Bilibili' : 'YouTube');
                      return (
                        <button
                          key={item.queueId}
                          type="button"
                          onClick={() => player.playTrack(t, queue.map((q) => q.track), i)}
                          className={`flex min-h-[54px] w-full items-center gap-3 px-2 py-2.5 text-left transition ${
                            active
                              ? 'bg-sky-50/75 dark:bg-sky-500/10'
                              : 'hover:bg-slate-50/90 dark:hover:bg-white/[0.04]'
                          }`}
                        >
                          <span className="w-6 shrink-0 text-center text-xs font-medium tabular-nums text-slate-400">
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          <img
                            src={t.coverUrl || DEFAULT_COVER}
                            alt=""
                            referrerPolicy="no-referrer"
                            onError={handleCoverError}
                            className="h-10 w-10 shrink-0 rounded-lg object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <div
                              className={`truncate text-sm font-medium ${
                                active ? 'text-sky-700 dark:text-sky-300' : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {t.title}
                            </div>
                            <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {t.artist} · {provider}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default VenusMusicSpace;
