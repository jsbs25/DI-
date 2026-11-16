import React, { useEffect, useState } from 'react';
import { VideoItem, Language } from '../../types/index.ts';
import type { MediaRegionMode, MediaSourceDescriptor, ResolvedRegion } from '../../types/media.ts';
import { translations } from '../../i18n/translations.ts';
import {
  AlertTriangle,
  ArrowRightLeft,
  ExternalLink,
  Eye,
  Film,
  Globe,
  Heart,
  Loader2,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  findNextVideoFallbackSource,
  formatPlaybackTypeBadge,
  getConnectivitySnapshot,
  getEffectiveMediaRegion,
  getMediaRegionMode,
  markMediaUrlFailed,
  probeClientMediaConnectivity,
  setMediaRegionMode,
  sortVideoSources,
  subscribeMediaScheduler,
} from '../../services/media/scheduler.ts';

interface VideoCenterProps {
  videos: VideoItem[];
  lang: Language;
}

export const VideoCenter: React.FC<VideoCenterProps> = ({ videos: initialVideos, lang }) => {
  const t = translations[lang];
  const isZh = lang === 'zh';

  const [regionMode, setRegionModeState] = useState<MediaRegionMode>(() => getMediaRegionMode());
  const [effectiveRegion, setEffectiveRegion] = useState<ResolvedRegion>(() => getEffectiveMediaRegion());
  const [conn, setConn] = useState(() => getConnectivitySnapshot());

  const [videos, setVideos] = useState<VideoItem[]>(initialVideos);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [activeSourceId, setActiveSourceId] = useState<string | undefined>(undefined);
  const [videoFallbackNotice, setVideoFallbackNotice] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void probeClientMediaConnectivity();
    return subscribeMediaScheduler(() => {
      setRegionModeState(getMediaRegionMode());
      setEffectiveRegion(getEffectiveMediaRegion());
      setConn(getConnectivitySnapshot());
    });
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setVideos(initialVideos);
    }
  }, [initialVideos, searchQuery]);

  // Re-fetch region-ordered catalog when region changes and no custom search active
  useEffect(() => {
    let cancelled = false;
    const loadByRegion = async () => {
      try {
        const endpoint = searchQuery.trim()
          ? `/api/media/search?mediaType=video&q=${encodeURIComponent(searchQuery.trim())}&region=${effectiveRegion}`
          : `/api/videos?region=${effectiveRegion}`;
        const res = await fetch(endpoint);
        const data = await res.json();
        if (!cancelled && data.success && Array.isArray(data.videos)) {
          setVideos(data.videos);
        }
      } catch {}
    };
    void loadByRegion();
    return () => {
      cancelled = true;
    };
  }, [effectiveRegion]);

  const handleSearch = async (override?: string) => {
    const q = (override ?? searchQuery).trim();
    setSearching(true);
    try {
      const endpoint = q
        ? `/api/media/search?mediaType=video&q=${encodeURIComponent(q)}&region=${effectiveRegion}`
        : `/api/videos?region=${effectiveRegion}`;
      const res = await fetch(endpoint);
      const data = await res.json();
      if (data.success && Array.isArray(data.videos)) {
        setVideos(data.videos);
      }
    } catch {
      // Keep current list on transient failure
    } finally {
      setSearching(false);
    }
  };

  const openVideo = (vid: VideoItem) => {
    const rawSources: MediaSourceDescriptor[] =
      vid.mediaSources && vid.mediaSources.length > 0
        ? vid.mediaSources
        : [
            vid.embedUrl
              ? {
                  id: `${vid.id}:embed`,
                  providerId: vid.providerId || 'bilibili',
                  providerName: vid.providerName || vid.source || '官方嵌入',
                  mediaType: 'video',
                  regionAvailability: vid.regionAvailability || 'global',
                  playbackType: vid.playbackType || 'official_embed',
                  officialUrl: vid.sourceUrl || vid.embedUrl,
                  embedUrl: vid.embedUrl,
                  copyrightStatus: vid.copyrightStatus || 'official_embed_licensed',
                  availabilityStatus: 'available',
                }
              : {
                  id: `${vid.id}:video`,
                  providerId: vid.providerId || 'external-direct',
                  providerName: vid.providerName || vid.source || '视频直链',
                  mediaType: 'video',
                  regionAvailability: vid.regionAvailability || 'global',
                  playbackType: vid.playbackType || 'legal_direct_video',
                  officialUrl: vid.sourceUrl || vid.videoUrl,
                  directVideoUrl: vid.videoUrl,
                  copyrightStatus: vid.copyrightStatus || 'creative_commons',
                  availabilityStatus: 'available',
                },
          ];

    const sorted = sortVideoSources(rawSources, effectiveRegion);
    setSelectedVideo({ ...vid, mediaSources: sorted });
    setActiveSourceId(sorted[0]?.id);
    setVideoError(null);
    setVideoFallbackNotice(null);
  };

  const modalSources: MediaSourceDescriptor[] = selectedVideo?.mediaSources || [];
  const activeSource: MediaSourceDescriptor | undefined =
    modalSources.find((s) => s.id === activeSourceId) || modalSources[0];

  const handleVideoFallback = (reason: string) => {
    if (!selectedVideo) return;
    if (activeSource) {
      const failKey = activeSource.directVideoUrl || activeSource.embedUrl || activeSource.officialUrl;
      markMediaUrlFailed(failKey, reason);
    }
    const next = findNextVideoFallbackSource(modalSources, activeSource?.id, effectiveRegion);
    if (next) {
      setActiveSourceId(next.id);
      setVideoError(null);
      setVideoFallbackNotice(
        isZh
          ? `当前视频源不可用（${reason}），已自动切换至：${next.providerName}`
          : `Source unavailable (${reason}), switched to ${next.providerName}`
      );
    } else {
      setVideoError(
        isZh
          ? `${reason}。当前视频暂无其他可用的站内备用源，请点击下方“在原平台打开”。`
          : `${reason}. No other in-app source available; please open on the original platform.`
      );
    }
  };

  // Watchdog for <video> sources that stall without firing quick onError (e.g., firewall packet drop in China Mainland)
  useEffect(() => {
    if (!selectedVideo || !activeSource?.directVideoUrl || activeSource.playbackType === 'official_embed') {
      return;
    }
    const timer = setTimeout(() => {
      const el = document.getElementById('one-video-player-el') as HTMLVideoElement | null;
      if (el && el.readyState === 0 && !el.paused) {
        handleVideoFallback(isZh ? '直链加载超时' : 'Direct video timeout');
      }
    }, 6500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVideo?.id, activeSource?.id]);

  const toggleLike = (vidId: string) => {
    setLikedMap((prev) => ({ ...prev, [vidId]: !prev[vidId] }));
  };

  const switchRegionMode = (next: MediaRegionMode) => {
    setMediaRegionMode(next);
    setRegionModeState(next);
    setEffectiveRegion(next === 'auto' ? conn.recommendedRegion : next);
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:px-6">
      <div className="border-b border-[var(--color-one-border)] pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-[var(--color-one-border)] bg-[var(--color-one-surface)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--color-one-text-muted)]">
              <Film className="h-3 w-3 text-[var(--color-one-accent)]" />
              <span>
                {isZh ? 'ONE 影像 · 中国大陆 & 海外双通道合法分发' : 'ONE VIDEO · CN & Global Media Scheduler'}
              </span>
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-2xl">{t.videoTab}</h1>
          </div>

          {/* Region Scheduler Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1 text-xs shadow-2xs dark:border-white/10 dark:bg-white/5">
              {(
                [
                  { id: 'auto', zh: '智能调度', en: 'Auto' },
                  { id: 'cn', zh: '中国大陆', en: 'Mainland CN' },
                  { id: 'overseas', zh: '海外网络', en: 'Overseas' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  onClick={() => switchRegionMode(m.id)}
                  className={`rounded-full px-3 py-1 font-medium transition ${
                    regionMode === m.id
                      ? 'bg-sky-600 text-white dark:bg-white dark:text-slate-900'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                  }`}
                >
                  {isZh ? m.zh : m.en}
                </button>
              ))}
            </div>
            <button
              onClick={() => void probeClientMediaConnectivity(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
              title={isZh ? '重新探测当前网络对 B站/海外源的连通性' : 'Re-probe connectivity'}
            >
              {conn.probing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Globe className="h-3 w-3 text-sky-600 dark:text-sky-400" />
              )}
              <span>
                {effectiveRegion === 'cn'
                  ? isZh
                    ? '优先国内源 (Bilibili)'
                    : 'CN Priority'
                  : isZh
                    ? '优先海外直连源'
                    : 'Overseas Priority'}
              </span>
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSearch();
              }}
              placeholder={
                isZh
                  ? '搜索纪录片、科普影像、音乐现场（中国大陆优先 B站官方源 / 海外兼顾 YouTube）…'
                  : 'Search documentaries, nature films, music sessions (region-aware)…'
              }
              className="h-10 w-full rounded-full border border-slate-200 bg-white pl-10 pr-9 text-base sm:text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  void handleSearch('');
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => void handleSearch()}
            disabled={searching}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-sky-600 px-5 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            <span>{isZh ? '搜索影像' : 'Search Videos'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-5">
        {videos.map((vid) => {
          const isLiked = likedMap[vid.id] || vid.liked;
          const badge = formatPlaybackTypeBadge(vid.playbackType, isZh);
          return (
            <div
              key={vid.id}
              data-testid={`video-card-${vid.id}`}
              className="group flex cursor-pointer flex-col overflow-hidden rounded-[24px] border border-[var(--color-one-border)] bg-[var(--color-one-surface)] shadow-[var(--shadow-one-sm)] transition hover:border-[var(--color-one-border-strong)]"
              onClick={() => openVideo(vid)}
            >
              <div className="relative aspect-video overflow-hidden bg-slate-900">
                <img
                  src={vid.thumbnailUrl}
                  alt={vid.title}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    if (!e.currentTarget.dataset.fb) {
                      e.currentTarget.dataset.fb = '1';
                      e.currentTarget.src = '/assets/music/ambient-space.jpg';
                    }
                  }}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/10">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-lg transition-transform group-hover:scale-105">
                    <Play className="ml-0.5 h-5 w-5 fill-current" />
                  </div>
                </div>
                <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/70 px-2 py-0.5 font-mono text-[11px] text-white backdrop-blur-sm">
                  {vid.duration}
                </span>
                <span className="absolute left-2.5 top-2.5 rounded-md border border-white/20 bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                  {vid.source || vid.countryName}
                </span>
              </div>

              <div className="flex flex-1 flex-col justify-between space-y-3 p-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                      <ShieldCheck className="h-3 w-3" />
                      {badge.label}
                    </span>
                    {vid.mediaSources && vid.mediaSources.length > 1 && (
                      <span className="text-[10px] text-slate-400">
                        {vid.mediaSources.length} {isZh ? '个可用源' : 'sources'}
                      </span>
                    )}
                  </div>
                  <h3 className="line-clamp-1 text-sm font-semibold text-slate-900 transition-colors group-hover:text-sky-600 dark:text-white dark:group-hover:text-sky-300">
                    {vid.title}
                  </h3>
                  <p className="line-clamp-2 text-xs leading-relaxed text-[var(--color-one-text-muted)]">
                    {vid.description}
                  </p>
                </div>

                <div className="flex items-center justify-between border-t border-[var(--color-one-border)] pt-2 text-[11px] text-[var(--color-one-text-muted)]">
                  <div className="flex min-w-0 items-center gap-2">
                    <img
                      src={vid.creator.avatar}
                      alt={vid.creator.displayName}
                      className="h-5 w-5 rounded-full object-cover"
                    />
                    <span className="truncate font-medium text-[var(--color-one-text)]">
                      {vid.creator.displayName}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5 text-[var(--color-one-text-dim)]" />
                      <span className="tabular-nums">{vid.viewsCount.toLocaleString()}</span>
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLike(vid.id);
                      }}
                      className={`inline-flex min-h-9 items-center gap-1 rounded-lg px-1.5 transition ${
                        isLiked
                          ? 'text-rose-600 dark:text-rose-300'
                          : 'hover:text-rose-500 dark:hover:text-rose-200'
                      }`}
                    >
                      <Heart className={`h-3.5 w-3.5 ${isLiked ? 'fill-current' : ''}`} />
                      <span className="tabular-nums">{vid.likesCount + (isLiked ? 1 : 0)}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {videos.length === 0 && (
        <div className="rounded-[24px] border border-dashed border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)] py-16 text-center text-sm text-[var(--color-one-text-muted)]">
          {isZh ? '暂无匹配视频内容，可尝试搜索关键词。' : 'No videos matched your query.'}
        </div>
      )}

      {selectedVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-3 sm:p-4 backdrop-blur-md"
          data-testid="video-player-modal"
        >
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[24px] border border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--color-one-border)] p-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className="rounded-full border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)] px-2.5 py-0.5 text-[10px] font-medium text-[var(--color-one-text-muted)]">
                  {selectedVideo.category}
                </span>
                <span className="truncate text-xs text-[var(--color-one-text-dim)]">
                  · {activeSource?.providerName || selectedVideo.countryName}
                </span>
              </div>
              <button
                onClick={() => setSelectedVideo(null)}
                className="rounded-xl p-2 text-[var(--color-one-text-muted)] hover:bg-[var(--color-one-surface-soft)] hover:text-slate-900 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {videoFallbackNotice && (
              <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
                <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                <span>{videoFallbackNotice}</span>
              </div>
            )}

            <div className="relative mt-2 aspect-video bg-black">
              {videoError ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-rose-200">
                  <AlertTriangle className="h-8 w-8 text-rose-400" />
                  <p className="max-w-md">{videoError}</p>
                  {activeSource?.officialUrl && (
                    <a
                      href={activeSource.officialUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {isZh ? '前往原平台观看' : 'Open on Original Platform'}
                    </a>
                  )}
                </div>
              ) : activeSource?.playbackType === 'official_embed' && activeSource.embedUrl ? (
                <iframe
                  key={activeSource.id}
                  title={selectedVideo.title}
                  src={activeSource.embedUrl}
                  className="h-full w-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : activeSource?.directVideoUrl ? (
                <video
                  id="one-video-player-el"
                  key={activeSource.id}
                  src={activeSource.directVideoUrl}
                  controls
                  autoPlay
                  playsInline
                  className="h-full w-full object-contain"
                  poster={selectedVideo.thumbnailUrl}
                  onError={() => handleVideoFallback(isZh ? '视频直链加载失败' : 'Direct video error')}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-slate-200">
                  <p className="text-sm">
                    {isZh ? '该资源需前往原平台页面播放。' : 'This content requires opening the official platform.'}
                  </p>
                  {activeSource?.officialUrl && (
                    <a
                      href={activeSource.officialUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-900"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {isZh ? '跳转原平台' : 'Open Source'}
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Source Switcher & Fallback Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-one-border)] bg-slate-50/70 px-4 py-2.5 text-xs dark:bg-white/[0.03]">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 font-medium text-slate-500 dark:text-slate-400">
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  {isZh ? '播放源：' : 'Sources:'}
                </span>
                {modalSources.map((src) => {
                  const isCurrent = src.id === activeSource?.id;
                  return (
                    <button
                      key={src.id}
                      onClick={() => {
                        setActiveSourceId(src.id);
                        setVideoError(null);
                        setVideoFallbackNotice(null);
                      }}
                      data-testid={`video-source-btn-${src.providerId}`}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                        isCurrent
                          ? 'bg-sky-600 text-white dark:bg-sky-500'
                          : 'border border-slate-200 bg-white text-slate-600 hover:border-sky-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-300'
                      }`}
                    >
                      {src.providerName}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                {modalSources.length > 1 && (
                  <button
                    onClick={() => handleVideoFallback(isZh ? '用户切换备用源' : 'Manual fallback')}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200"
                  >
                    <RefreshCw className="h-3 w-3" />
                    {isZh ? '无法播放？切备用源' : 'Try Backup Source'}
                  </button>
                )}
                {activeSource?.officialUrl && (
                  <a
                    href={activeSource.officialUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-600 hover:underline dark:text-sky-400"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {isZh ? '原平台打开' : 'Original'}
                  </a>
                )}
              </div>
            </div>

            <div className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{selectedVideo.title}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-one-text-muted)]">
                    <span>{selectedVideo.creator.displayName}</span>
                    <span>·</span>
                    <span>
                      {selectedVideo.viewsCount.toLocaleString()} {isZh ? '次观看' : 'views'}
                    </span>
                    <span>·</span>
                    <span>{activeSource?.copyrightLabel || selectedVideo.countryName}</span>
                  </div>
                </div>
                <button
                  onClick={() => toggleLike(selectedVideo.id)}
                  className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)] px-3 py-2 text-xs font-medium text-rose-600 hover:opacity-85 dark:text-rose-200"
                >
                  <Heart
                    className={`h-4 w-4 ${likedMap[selectedVideo.id] || selectedVideo.liked ? 'fill-current' : ''}`}
                  />
                  <span>{isZh ? '喜欢' : 'Like'}</span>
                </button>
              </div>
              <p className="text-sm leading-relaxed text-[var(--color-one-text-muted)]">
                {selectedVideo.description}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
