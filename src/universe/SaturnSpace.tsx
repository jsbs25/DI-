import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Search,
  Play,
  Bookmark,
  BookmarkCheck,
  Maximize2,
  X,
  ExternalLink,
  RefreshCw,
  Tv,
  Youtube,
  Film,
  Clapperboard,
  Radio,
  SkipBack,
  SkipForward,
  History,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { Language } from '../types/index.ts';
import type { SaturnAgentAction } from '../utils/oneAgentController.ts';

interface SaturnSpaceProps {
  lang: Language;
  onBack: () => void;
  quickAction?: SaturnAgentAction | null;
}

export interface SaturnVideo {
  videoId: string; // YouTube ID, Bilibili bvid, or native stream ID
  platform: 'youtube' | 'bilibili' | 'native';
  title: string;
  author: string;
  publishedText?: string;
  durationSeconds?: number;
  durationText?: string;
  views?: number;
  viewsText?: string;
  coverUrl?: string;
  embedUrl?: string;
  videoUrl?: string;
  arcurl?: string;
  description?: string;
}

const YOUTUBE_API_KEY = '';

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.moomoo.me',
  'https://pipedapi.ducks.party',
];

const QUICK_CHANNELS: {
  key: string;
  zh: string;
  en: string;
  query: string;
  platform: 'all' | 'bilibili' | 'youtube';
}[] = [
  { key: 'daily', zh: '星环每日精选', en: 'Daily Picks', query: '宇宙 太空 纪录片', platform: 'all' },
  { key: 'bili_universe', zh: 'B站 · 宇宙探索', en: 'Bilibili Space', query: '宇宙 天文 纪录片 空间站 4K', platform: 'bilibili' },
  { key: 'bili_scifi', zh: 'B站 · 科幻影视', en: 'Bilibili Sci-Fi', query: '流浪地球 三体 科幻电影 混剪', platform: 'bilibili' },
  { key: 'bili_science', zh: 'B站 · 硬核科普', en: 'Bilibili Science', query: '量子力学 相对论 人工智能 深度科普', platform: 'bilibili' },
  { key: 'yt_space', zh: 'YouTube · 天文纪实', en: 'YouTube Space', query: 'space astronomy universe NASA James Webb 4K', platform: 'youtube' },
  { key: 'yt_tech', zh: 'YouTube · AI与未来', en: 'YouTube Tech', query: 'future technology AI robotics quantum documentary', platform: 'youtube' },
  { key: 'yt_doc', zh: 'YouTube · 顶级纪录片', en: 'YouTube Doc', query: 'planet earth nature cosmos documentary 4K', platform: 'youtube' },
  { key: 'ambient', zh: '深空环境白噪音', en: 'Space Ambient', query: 'deep space ambient music 4K visual', platform: 'all' },
];

const WATCHLIST_KEY = 'earth-one.saturn.watchlist.v4';
const HISTORY_KEY = 'earth-one.saturn.history.v1';
const DAILY_KEY = 'earth-one.saturn.daily.v4';

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function extractYouTubeId(input: string): string | null {
  const m = input.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

function extractBilibiliBvid(input: string): string | null {
  const m = input.match(/(?:bilibili\.com\/video\/)?(BV[0-9A-Za-z]{10})/i);
  return m ? m[1] : null;
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatViews(views?: number): string {
  if (!views || views <= 0) return '';
  if (views >= 100000000) return `${(views / 100000000).toFixed(1)}亿`;
  if (views >= 10000) return `${(views / 10000).toFixed(1)}万`;
  return String(views);
}

function thumbnailOf(v: SaturnVideo): string {
  if (v.coverUrl) return v.coverUrl;
  if (v.platform === 'bilibili') {
    return 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80';
  }
  if (v.platform === 'native') {
    return 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&auto=format&fit=crop&q=80';
  }
  return `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function loadJsonArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const SaturnSpace: React.FC<SaturnSpaceProps> = ({ lang, onBack, quickAction }) => {
  const isZh = lang === 'zh';

  const [query, setQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'bilibili' | 'youtube'>('all');
  const [results, setResults] = useState<SaturnVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeChannel, setActiveChannel] = useState<string>('daily');
  const [playingVideo, setPlayingVideo] = useState<SaturnVideo | null>(null);
  const [cinemaVideo, setCinemaVideo] = useState<SaturnVideo | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>(() => loadJsonArray<string>(WATCHLIST_KEY));
  const [history, setHistory] = useState<SaturnVideo[]>(() => loadJsonArray<SaturnVideo>(HISTORY_KEY));
  const [dailyVideos, setDailyVideos] = useState<SaturnVideo[]>([]);

  // Player source & quality toggles for reliable playback across networks
  const [ytPrivacyNode, setYtPrivacyNode] = useState(true);
  const [biliDanmaku, setBiliDanmaku] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const handledQuickSeqRef = useRef<number>(0);

  useEffect(() => {
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
    } catch {}
  }, [watchlist]);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 12)));
    } catch {}
  }, [history]);

  const openVideoPlayer = useCallback((video: SaturnVideo, fullscreen = false) => {
    if (fullscreen) {
      setCinemaVideo(video);
    } else {
      setPlayingVideo(video);
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {}
    }
    setHistory((prev) => {
      const key = `${video.platform}:${video.videoId}`;
      const filtered = prev.filter((item) => `${item.platform}:${item.videoId}` !== key);
      return [video, ...filtered].slice(0, 12);
    });
  }, []);

  const searchBilibili = useCallback(async (q: string, limit = 18): Promise<SaturnVideo[]> => {
    try {
      const res = await fetchWithTimeout(
        `/api/bilibili/search?q=${encodeURIComponent(q)}&limit=${limit}`,
        9000
      );
      if (!res.ok) return [];
      const data = await res.json();
      if (data.success && Array.isArray(data.videos)) {
        return data.videos.map((bv: any) => ({
          videoId: bv.bvid,
          platform: 'bilibili' as const,
          title: bv.title || 'Untitled',
          author: bv.author || 'UP主',
          durationText: bv.duration,
          viewsText: bv.play ? `${bv.play} 播放` : undefined,
          coverUrl: bv.pic,
          embedUrl: bv.embedUrl,
          arcurl: bv.arcurl || bv.sourceUrl,
          description: bv.description,
        }));
      }
    } catch {}
    return [];
  }, []);

  const searchYouTube = useCallback(async (q: string, limit = 18): Promise<SaturnVideo[]> => {
    // 1) Real server-side YouTube scraper
    try {
      const res = await fetchWithTimeout(
        `/api/video/youtube-search?q=${encodeURIComponent(q)}&limit=${limit}`,
        8500
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.videos) && data.videos.length > 0) {
          return data.videos.map((y: any) => ({
            videoId: y.videoId,
            platform: 'youtube' as const,
            title: y.title || 'Untitled',
            author: y.author || 'YouTube',
            publishedText: y.publishedText,
            durationText: y.durationText,
            durationSeconds: y.durationSeconds,
            views: y.views,
            viewsText: y.viewsText,
            coverUrl: y.coverUrl,
            embedUrl: y.embedUrl,
            arcurl: `https://www.youtube.com/watch?v=${y.videoId}`,
          }));
        }
      }
    } catch {}

    // 2) Optional YouTube Data API v3
    if (YOUTUBE_API_KEY) {
      try {
        const res = await fetchWithTimeout(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=12&q=${encodeURIComponent(q)}&key=${YOUTUBE_API_KEY}`,
          8000
        );
        if (res.ok) {
          const data = await res.json();
          const ids = (data.items || []).map((i: any) => i.id?.videoId).filter(Boolean);
          if (ids.length) {
            const detail = await fetchWithTimeout(
              `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids.join(',')}&key=${YOUTUBE_API_KEY}`,
              8000
            );
            const d = await detail.json();
            return (d.items || []).map((v: any) => ({
              videoId: v.id,
              platform: 'youtube' as const,
              title: v.snippet?.title || 'Untitled',
              author: v.snippet?.channelTitle || 'Unknown',
              publishedText: v.snippet?.publishedAt?.slice(0, 10),
              durationSeconds: parseISODuration(v.contentDetails?.duration),
              views: Number(v.statistics?.viewCount || 0),
              arcurl: `https://www.youtube.com/watch?v=${v.id}`,
            }));
          }
        }
      } catch {}
    }

    // 3) Public Piped mirrors
    for (const instance of PIPED_INSTANCES) {
      try {
        const res = await fetchWithTimeout(
          `${instance}/search?q=${encodeURIComponent(q)}&filter=videos`,
          5500
        );
        if (!res.ok) continue;
        const data = await res.json();
        const items = data?.items;
        if (Array.isArray(items) && items.length > 0) {
          const out: SaturnVideo[] = [];
          for (const it of items) {
            if (it?.type !== 'stream') continue;
            const url: string = it.url || '';
            const videoId = extractYouTubeId(url) || extractYouTubeId(`youtube.com${url}`);
            if (!videoId) continue;
            out.push({
              videoId,
              platform: 'youtube',
              title: it.title || 'Untitled',
              author: it.uploaderName || it.uploader || 'Unknown',
              publishedText: it.uploadedDate || undefined,
              durationSeconds: typeof it.duration === 'number' ? it.duration : undefined,
              views: typeof it.views === 'number' ? it.views : undefined,
              arcurl: `https://www.youtube.com/watch?v=${videoId}`,
            });
          }
          if (out.length) return out;
        }
      } catch {
        continue;
      }
    }

    return [];
  }, []);

  const searchAllPlatforms = useCallback(
    async (q: string, targetPlatform: 'all' | 'bilibili' | 'youtube' = 'all'): Promise<SaturnVideo[]> => {
      if (targetPlatform === 'bilibili') {
        return await searchBilibili(q, 18);
      }
      if (targetPlatform === 'youtube') {
        return await searchYouTube(q, 18);
      }
      const [biliRes, ytRes] = await Promise.allSettled([searchBilibili(q, 10), searchYouTube(q, 10)]);
      const biliList = biliRes.status === 'fulfilled' ? biliRes.value : [];
      const ytList = ytRes.status === 'fulfilled' ? ytRes.value : [];

      const merged: SaturnVideo[] = [];
      const maxLen = Math.max(biliList.length, ytList.length);
      for (let i = 0; i < maxLen; i++) {
        if (biliList[i]) merged.push(biliList[i]);
        if (ytList[i]) merged.push(ytList[i]);
      }
      return merged;
    },
    [searchBilibili, searchYouTube]
  );

  const loadDaily = useCallback(
    async (forceRefresh = false) => {
      const today = todayStr();
      if (!forceRefresh) {
        try {
          const raw = localStorage.getItem(DAILY_KEY);
          if (raw) {
            const cached = JSON.parse(raw) as { date: string; videos: SaturnVideo[] };
            if (cached.date === today && cached.videos?.length) {
              setDailyVideos(cached.videos);
              setResults(cached.videos);
              return;
            }
          }
        } catch {}
      }

      setLoading(true);
      setError('');
      try {
        // Blend live Bilibili + YouTube astronomy & science documentaries
        const dualInitial = await searchAllPlatforms('宇宙 太空 纪录片 4K', 'all');
        if (dualInitial.length > 0) {
          setDailyVideos(dualInitial);
          setResults(dualInitial);
          try {
            localStorage.setItem(DAILY_KEY, JSON.stringify({ date: today, videos: dualInitial }));
          } catch {}
          return;
        }

        // Fallback to static daily catalog
        const res = await fetchWithTimeout('/saturn_daily.json', 5000);
        if (res.ok) {
          const data = await res.json();
          if (data?.videos?.length) {
            const videos = data.videos.map((v: any) => ({
              ...v,
              platform: v.platform || 'youtube',
              arcurl: v.arcurl || `https://www.youtube.com/watch?v=${v.videoId}`,
            })) as SaturnVideo[];
            setDailyVideos(videos);
            setResults(videos);
          }
        }
      } catch {
        setError(isZh ? '每日影单加载波动，请点击刷新重试。' : 'Failed to load daily feed.');
      } finally {
        setLoading(false);
      }
    },
    [isZh, searchAllPlatforms]
  );

  useEffect(() => {
    void loadDaily(false);
  }, [loadDaily]);

  useEffect(() => {
    if (!quickAction || quickAction.seq === handledQuickSeqRef.current) return;
    handledQuickSeqRef.current = quickAction.seq;

    const autoSearchAndOpen = async () => {
      const q = (quickAction.query || '宇宙 天文 纪录片 4K').trim();
      const targetPlatform = quickAction.platform || 'all';
      setQuery(q);
      setPlatformFilter(targetPlatform);
      setLoading(true);
      setError('');
      setActiveChannel('');

      try {
        let videos = await searchAllPlatforms(q, targetPlatform);
        if (!videos.length) {
          try {
            const res = await fetchWithTimeout('/saturn_daily.json', 5000);
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data?.videos) && data.videos.length > 0) {
                videos = data.videos.map((v: any) => ({ ...v, platform: v.platform || 'youtube' }));
              }
            }
          } catch {}
        }

        if (videos.length > 0) {
          setResults(videos);
          const pickPoolSize = quickAction.autoPlayRandom ? Math.min(videos.length, 6) : 1;
          const picked = videos[Math.floor(Math.random() * pickPoolSize)] || videos[0];
          openVideoPlayer(picked, false);
        } else {
          setError(isZh ? '暂未搜索到可播放的纪录片，请稍后再试。' : 'No documentary found.');
        }
      } catch {
        setError(isZh ? '纪录片检索服务波动，请重试。' : 'Documentary search error.');
      } finally {
        setLoading(false);
      }
    };

    void autoSearchAndOpen();
  }, [quickAction, searchAllPlatforms, openVideoPlayer, isZh]);

  const runSearch = useCallback(
    async (raw: string, overridePlatform?: 'all' | 'bilibili' | 'youtube') => {
      const q = raw.trim();
      if (!q) return;
      const targetPlatform = overridePlatform || platformFilter;
      setLoading(true);
      setError('');
      setActiveChannel('');

      const bvid = extractBilibiliBvid(q);
      if (bvid) {
        const directBili: SaturnVideo = {
          videoId: bvid,
          platform: 'bilibili',
          title: `哔哩哔哩视频 (${bvid})`,
          author: 'Bilibili',
          arcurl: `https://www.bilibili.com/video/${bvid}`,
        };
        setResults([directBili]);
        openVideoPlayer(directBili, false);
        setLoading(false);
        return;
      }

      const ytId = extractYouTubeId(q);
      if (ytId) {
        const directYt: SaturnVideo = {
          videoId: ytId,
          platform: 'youtube',
          title: `YouTube 视频 (${ytId})`,
          author: 'YouTube',
          arcurl: `https://www.youtube.com/watch?v=${ytId}`,
        };
        setResults([directYt]);
        openVideoPlayer(directYt, false);
        setLoading(false);
        return;
      }

      try {
        const videos = await searchAllPlatforms(q, targetPlatform);
        setResults(videos);
        if (!videos.length) {
          setError(isZh ? '未找到相关视频，请尝试其他关键词。' : 'No videos found, please try another query.');
        }
      } catch {
        setError(isZh ? '后端搜索服务响应超时，请稍后重试。' : 'Search service timeout, please retry.');
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [platformFilter, searchAllPlatforms, openVideoPlayer, isZh]
  );

  const onChannel = useCallback(
    async (ch: (typeof QUICK_CHANNELS)[number]) => {
      setActiveChannel(ch.key);
      setPlatformFilter(ch.platform);
      setQuery('');
      if (ch.key === 'daily') {
        if (dailyVideos.length) {
          setResults(dailyVideos);
          return;
        }
        await loadDaily(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const videos = await searchAllPlatforms(ch.query, ch.platform);
        setResults(videos);
        if (!videos.length) {
          setError(isZh ? '当前频道暂未抓取到结果。' : 'No videos in this channel.');
        }
      } catch {
        setError(isZh ? '频道检索异常，请稍后刷新。' : 'Channel fetch error.');
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [searchAllPlatforms, dailyVideos, loadDaily, isZh]
  );

  const toggleWatchlist = (video: SaturnVideo) => {
    const key = `${video.platform}:${video.videoId}`;
    setWatchlist((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  };

  const isBookmarked = (video: SaturnVideo) => watchlist.includes(`${video.platform}:${video.videoId}`);

  const displayVideos = useMemo(() => {
    if (platformFilter === 'all') return results;
    return results.filter((v) => v.platform === platformFilter);
  }, [results, platformFilter]);

  // Featured hero highlight when browsing without opening inline player
  const heroVideo = useMemo(() => displayVideos[0] || null, [displayVideos]);

  const activePlayerVideo = cinemaVideo || playingVideo;

  const navigateQueue = useCallback(
    (delta: number) => {
      if (!activePlayerVideo || displayVideos.length === 0) return;
      const idx = displayVideos.findIndex(
        (v) => v.platform === activePlayerVideo.platform && v.videoId === activePlayerVideo.videoId
      );
      const nextIdx = idx === -1 ? 0 : (idx + delta + displayVideos.length) % displayVideos.length;
      const target = displayVideos[nextIdx];
      if (!target) return;
      if (cinemaVideo) {
        openVideoPlayer(target, true);
      } else {
        openVideoPlayer(target, false);
      }
    },
    [activePlayerVideo, cinemaVideo, displayVideos, openVideoPlayer]
  );

  const resolveEmbedUrl = useCallback(
    (v: SaturnVideo): string => {
      if (v.platform === 'bilibili') {
        const danmakuFlag = biliDanmaku ? 1 : 0;
        return `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(
          v.videoId
        )}&page=1&high_quality=1&autoplay=1&danmaku=${danmakuFlag}`;
      }
      const host = ytPrivacyNode ? 'https://www.youtube-nocookie.com' : 'https://www.youtube.com';
      return `${host}/embed/${encodeURIComponent(v.videoId)}?autoplay=1&rel=0&modestbranding=1`;
    },
    [biliDanmaku, ytPrivacyNode]
  );

  useEffect(() => {
    if (!cinemaVideo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCinemaVideo(null);
      if (e.key === 'ArrowRight') navigateQueue(1);
      if (e.key === 'ArrowLeft') navigateQueue(-1);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [cinemaVideo, navigateQueue]);

  const renderPlayerSurface = (video: SaturnVideo) => {
    if (video.platform === 'native' && video.videoUrl) {
      return (
        <video
          key={`native:${video.videoId}`}
          src={video.videoUrl}
          poster={thumbnailOf(video)}
          controls
          autoPlay
          playsInline
          className="h-full w-full object-contain bg-black"
        />
      );
    }
    const src = resolveEmbedUrl(video);
    return (
      <iframe
        key={`${video.platform}:${video.videoId}:${ytPrivacyNode ? 'nc' : 'st'}:${biliDanmaku ? 'dm' : 'cl'}`}
        src={src}
        title={video.title}
        className="h-full w-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    );
  };

  return (
    <div
      className="min-h-screen text-[color:var(--color-one-text)]"
      style={{
        background:
          'radial-gradient(1100px 600px at 20% -10%, rgba(215,182,118,0.10), transparent 55%), radial-gradient(900px 500px at 85% 10%, rgba(127,212,255,0.08), transparent 50%), linear-gradient(180deg, #030508 0%, #05070b 45%, #030508 100%)',
      }}
    >
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div
          className="absolute bottom-[-15%] left-1/2 h-[60vw] w-[60vw] -translate-x-1/2 rounded-full opacity-[0.08] blur-[140px]"
          style={{ background: 'radial-gradient(circle, rgba(215,182,118,0.45), transparent 65%)' }}
        />
      </div>

      <header className="relative z-10 mx-auto w-full max-w-[1440px] px-4 pb-4 pt-4 sm:px-6 lg:px-10 lg:pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <button onClick={onBack} className="one-btn one-btn-sm one-btn-ghost -ml-2">
            <ArrowLeft className="h-4 w-4" />
            <span>{isZh ? '返回宇宙引擎' : 'Back to Universe'}</span>
          </button>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[color:var(--color-one-text-dim)]">
            <span className="one-badge one-badge-gold inline-flex items-center gap-1">
              <Clapperboard className="h-3 w-3" />
              {isZh ? 'ONE · 星环影院' : 'ONE · SATURN CINEMA'}
            </span>
            <span className="one-badge one-badge-neutral inline-flex items-center gap-1 normal-case tracking-normal">
              <Tv className="h-3 w-3" /> Bilibili
            </span>
            <span className="one-badge one-badge-neutral inline-flex items-center gap-1 normal-case tracking-normal">
              <Youtube className="h-3 w-3" /> YouTube
            </span>
          </div>
        </div>

        <div className="one-surface-elevated relative overflow-hidden px-4 py-4 sm:px-6 sm:py-5">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-15 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(215,182,118,0.4), transparent 70%)' }}
          />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-[color:var(--color-one-text)] sm:text-2xl">
                {isZh ? '星环影院 · ONE SATURN' : 'ONE SATURN CINEMA'}
              </h1>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[color:var(--color-one-text-muted)] sm:text-sm">
                {isZh
                  ? '双核影视聚合放映厅 · 原生检索 Bilibili 与 YouTube，支持无痕节点、纯净无弹幕、连播剧场。'
                  : 'Dual-source cinema aggregating Bilibili and YouTube with privacy node switching and theater queue.'}
              </p>
            </div>

            <div
              className="inline-flex shrink-0 items-center gap-2.5 self-start rounded-xl border px-3 py-2 sm:self-auto"
              style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.03)' }}
            >
              <Film className="h-4 w-4 text-[color:var(--color-one-gold)]" />
              <div className="text-[11px] leading-tight">
                <div className="font-medium text-[color:var(--color-one-text)]">
                  {isZh ? '即搜即播 · 连播剧场' : 'Instant Play · Queue'}
                </div>
                <div className="font-mono text-[10px] text-[color:var(--color-one-text-dim)]">
                  Bilibili · YouTube NoCookie
                </div>
              </div>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(query);
            }}
            className="relative mt-4 space-y-2.5"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-[color:var(--color-one-text-dim)]">
                  <Search className="h-4 w-4" />
                </div>
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    isZh
                      ? '搜索电影解说、4K 纪录片、科普影像，或直接粘贴 BV 号 / YouTube 链接播放…'
                      : 'Search films, 4K documentaries, or paste BV ID / YouTube URL to play…'
                  }
                  className="w-full rounded-xl border bg-[color:var(--color-one-surface-soft)] py-3 pl-11 pr-10 text-sm text-[color:var(--color-one-text)] placeholder-[color:var(--color-one-text-dim)] transition focus:border-[rgba(215,182,118,0.45)] focus:outline-none focus:ring-1 focus:ring-[rgba(215,182,118,0.35)]"
                  style={{ borderColor: 'var(--color-one-border)' }}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-[color:var(--color-one-text-dim)] hover:text-[color:var(--color-one-text)]"
                    aria-label="Clear"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="one-btn one-btn-md one-btn-primary shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {loading ? (isZh ? '检索中...' : 'Searching...') : isZh ? '全网影库检索' : 'Search'}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-one-text-dim)]">
                  {isZh ? '来源' : 'Source'}
                </span>
                {[
                  { id: 'all' as const, label: isZh ? `双源聚合 (${results.length})` : `All (${results.length})` },
                  { id: 'bilibili' as const, label: 'Bilibili' },
                  { id: 'youtube' as const, label: 'YouTube' },
                ].map((s) => {
                  const active = platformFilter === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setPlatformFilter(s.id);
                        if (query.trim()) void runSearch(query, s.id);
                      }}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all"
                      style={
                        active
                          ? {
                              color: 'var(--color-one-gold)',
                              background: 'rgba(215,182,118,0.14)',
                              border: '1px solid rgba(215,182,118,0.28)',
                            }
                          : {
                              color: 'var(--color-one-text-muted)',
                              background: 'rgba(244,243,238,0.03)',
                              border: '1px solid var(--color-one-border)',
                            }
                      }
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-one-text-dim)]">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <button
                  type="button"
                  onClick={() => setYtPrivacyNode((v) => !v)}
                  className="rounded-lg border px-2.5 py-1 transition hover:text-[color:var(--color-one-text)]"
                  style={{
                    borderColor: ytPrivacyNode ? 'rgba(127,212,255,0.35)' : 'var(--color-one-border)',
                    color: ytPrivacyNode ? 'var(--color-one-accent)' : undefined,
                  }}
                >
                  {ytPrivacyNode ? (isZh ? 'YouTube 无痕节点' : 'YT NoCookie') : isZh ? 'YouTube 官方节点' : 'YT Standard'}
                </button>
                <button
                  type="button"
                  onClick={() => setBiliDanmaku((v) => !v)}
                  className="rounded-lg border px-2.5 py-1 transition hover:text-[color:var(--color-one-text)]"
                  style={{
                    borderColor: biliDanmaku ? 'rgba(215,182,118,0.4)' : 'var(--color-one-border)',
                    color: biliDanmaku ? 'var(--color-one-gold)' : undefined,
                  }}
                >
                  {biliDanmaku ? (isZh ? 'B站弹幕: 开' : 'Danmaku: On') : isZh ? 'B站纯净无弹幕' : 'Danmaku: Off'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[1440px] space-y-5 px-4 pb-16 sm:px-6 lg:px-10">
        {/* Inline Theater Player when active */}
        {playingVideo && (
          <section className="one-surface-elevated overflow-hidden">
            <div
              className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
              style={{ borderColor: 'var(--color-one-border)' }}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <PlatformBadge platform={playingVideo.platform} />
                <h2 className="truncate text-sm font-medium text-[color:var(--color-one-text)]">
                  {playingVideo.title}
                </h2>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => navigateQueue(-1)}
                  className="one-btn one-btn-sm one-btn-ghost"
                  title={isZh ? '上一部' : 'Previous'}
                >
                  <SkipBack className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => navigateQueue(1)}
                  className="one-btn one-btn-sm one-btn-ghost"
                  title={isZh ? '下一部' : 'Next'}
                >
                  <SkipForward className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleWatchlist(playingVideo)}
                  className="one-btn one-btn-sm one-btn-ghost"
                  style={{ color: isBookmarked(playingVideo) ? 'var(--color-one-gold)' : undefined }}
                >
                  {isBookmarked(playingVideo) ? (
                    <BookmarkCheck className="h-3.5 w-3.5" />
                  ) : (
                    <Bookmark className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">{isZh ? '收藏' : 'Save'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCinemaVideo(playingVideo)}
                  className="one-btn one-btn-sm one-btn-secondary"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{isZh ? '全屏影院' : 'Cinema'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPlayingVideo(null)}
                  className="one-btn one-btn-sm one-btn-ghost"
                  aria-label="Close player"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="bg-black">
              <div className="aspect-video w-full">{renderPlayerSurface(playingVideo)}</div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-[color:var(--color-one-text-muted)] sm:px-5">
              <div className="flex flex-wrap items-center gap-3 min-w-0">
                <span className="truncate font-medium text-[color:var(--color-one-text)]">{playingVideo.author}</span>
                {playingVideo.durationText && <span>{playingVideo.durationText}</span>}
                {playingVideo.viewsText && <span>{playingVideo.viewsText}</span>}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {playingVideo.platform === 'youtube' && (
                  <button
                    type="button"
                    onClick={() => setYtPrivacyNode((v) => !v)}
                    className="rounded-md border px-2 py-1 text-[11px] hover:text-[color:var(--color-one-text)]"
                    style={{ borderColor: 'var(--color-one-border)' }}
                  >
                    {ytPrivacyNode ? (isZh ? '切至 YouTube 标准线' : 'Switch Standard') : isZh ? '切至无痕专线' : 'Switch NoCookie'}
                  </button>
                )}
                {playingVideo.platform === 'bilibili' && (
                  <button
                    type="button"
                    onClick={() => setBiliDanmaku((v) => !v)}
                    className="rounded-md border px-2 py-1 text-[11px] hover:text-[color:var(--color-one-text)]"
                    style={{ borderColor: 'var(--color-one-border)' }}
                  >
                    {biliDanmaku ? (isZh ? '关闭弹幕' : 'Hide Danmaku') : isZh ? '开启弹幕' : 'Show Danmaku'}
                  </button>
                )}
                {playingVideo.arcurl && (
                  <a
                    href={playingVideo.arcurl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 transition hover:text-[color:var(--color-one-accent)]"
                  >
                    <span>{isZh ? '原站直达' : 'Original'}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Featured Cinema Spotlight when idle */}
        {!playingVideo && !loading && heroVideo && (
          <section className="one-surface-elevated overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-12">
              <button
                type="button"
                onClick={() => openVideoPlayer(heroVideo, false)}
                className="group relative aspect-video lg:aspect-auto lg:min-h-[290px] lg:col-span-7 overflow-hidden bg-black text-left"
              >
                <img
                  src={thumbnailOf(heroVideo)}
                  alt={heroVideo.title}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/30 to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    className="flex h-16 w-16 items-center justify-center rounded-full border backdrop-blur-md transition-transform group-hover:scale-110"
                    style={{
                      borderColor: 'rgba(215,182,118,0.65)',
                      background: 'rgba(5,7,11,0.58)',
                      color: 'var(--color-one-gold)',
                    }}
                  >
                    <Play className="ml-1 h-7 w-7 fill-current" />
                  </span>
                </div>
                <div className="absolute left-4 top-4 flex items-center gap-2">
                  <span className="one-badge one-badge-gold inline-flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    {isZh ? '今日星环首映' : 'Featured Screening'}
                  </span>
                  <PlatformBadge platform={heroVideo.platform} />
                </div>
              </button>

              <div className="flex flex-col justify-between p-5 sm:p-7 lg:col-span-5">
                <div>
                  <div className="text-xs font-medium text-[color:var(--color-one-gold)]">
                    {heroVideo.author}
                    {heroVideo.durationText ? ` · ${heroVideo.durationText}` : ''}
                  </div>
                  <h2 className="mt-2 text-lg font-semibold leading-snug text-[color:var(--color-one-text)] sm:text-xl">
                    {heroVideo.title}
                  </h2>
                  <p className="mt-2.5 line-clamp-3 text-xs leading-relaxed text-[color:var(--color-one-text-muted)]">
                    {heroVideo.description ||
                      (isZh
                        ? '星环影院为您精选的高分影像内容，点击即可在站内放映厅或全屏影院模式无干扰观看。'
                        : 'Featured high-definition story ready for instant inline or fullscreen cinema playback.')}
                  </p>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => openVideoPlayer(heroVideo, false)}
                    className="one-btn one-btn-md one-btn-primary"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    <span>{isZh ? '立即放映' : 'Play Now'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openVideoPlayer(heroVideo, true)}
                    className="one-btn one-btn-md one-btn-secondary"
                  >
                    <Maximize2 className="h-4 w-4" />
                    <span>{isZh ? '全屏影院' : 'Fullscreen'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleWatchlist(heroVideo)}
                    className="one-btn one-btn-md one-btn-ghost"
                    style={{ color: isBookmarked(heroVideo) ? 'var(--color-one-gold)' : undefined }}
                  >
                    {isBookmarked(heroVideo) ? (
                      <BookmarkCheck className="h-4 w-4" />
                    ) : (
                      <Bookmark className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Channels */}
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_CHANNELS.map((ch) => {
            const active = activeChannel === ch.key;
            return (
              <button
                key={ch.key}
                onClick={() => void onChannel(ch)}
                className="min-h-[40px] rounded-full px-3.5 py-2 text-xs font-medium transition-all"
                style={
                  active
                    ? {
                        color: 'var(--color-one-text)',
                        background: 'rgba(244,243,238,0.1)',
                        border: '1px solid rgba(244,243,238,0.22)',
                      }
                    : {
                        color: 'var(--color-one-text-muted)',
                        background: 'rgba(244,243,238,0.03)',
                        border: '1px solid var(--color-one-border)',
                      }
                }
              >
                {isZh ? ch.zh : ch.en}
              </button>
            );
          })}
          <button
            onClick={() => void loadDaily(true)}
            className="one-btn one-btn-sm one-btn-ghost"
            title={isZh ? '刷新每日精选' : 'Refresh daily'}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{isZh ? '刷新片单' : 'Refresh'}</span>
          </button>
        </div>

        {/* Watchlist + Watch History */}
        {(watchlist.length > 0 || history.length > 0) && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {watchlist.length > 0 && (
              <div className="one-surface px-4 py-4 sm:px-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-[color:var(--color-one-text)]">
                  <BookmarkCheck className="h-4 w-4" style={{ color: 'var(--color-one-gold)' }} />
                  {isZh ? '我的观影单' : 'My Watchlist'}
                  <span className="one-badge one-badge-neutral font-mono normal-case tracking-normal">
                    {watchlist.length}
                  </span>
                </h2>
                <div className="flex flex-wrap gap-2">
                  {watchlist.map((key) => {
                    const [platform, id] = key.split(':');
                    const v = results.find((x) => x.videoId === id) || history.find((x) => x.videoId === id);
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          if (v) {
                            openVideoPlayer(v, false);
                          } else {
                            openVideoPlayer(
                              {
                                videoId: id,
                                platform: platform as any,
                                title: `${platform === 'bilibili' ? 'B站' : 'YouTube'} 收藏 (${id})`,
                                author: 'Watchlist',
                              },
                              false
                            );
                          }
                        }}
                        className="inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition hover:bg-[rgba(244,243,238,0.05)]"
                        style={{ borderColor: 'var(--color-one-border)', color: 'var(--color-one-text-muted)' }}
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{
                            background: platform === 'bilibili' ? 'var(--color-one-accent)' : 'var(--color-one-danger)',
                          }}
                        />
                        <span className="max-w-[200px] truncate">{v ? v.title : id}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {history.length > 0 && (
              <div className="one-surface px-4 py-4 sm:px-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-sm font-medium text-[color:var(--color-one-text)]">
                    <History className="h-4 w-4 text-sky-400" />
                    {isZh ? '最近放映记录' : 'Recently Watched'}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setHistory([])}
                    className="text-[11px] text-[color:var(--color-one-text-dim)] hover:text-[color:var(--color-one-text)]"
                  >
                    {isZh ? '清空' : 'Clear'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {history.slice(0, 6).map((h) => (
                    <button
                      key={`${h.platform}:${h.videoId}`}
                      onClick={() => openVideoPlayer(h, false)}
                      className="inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition hover:bg-[rgba(244,243,238,0.05)]"
                      style={{ borderColor: 'var(--color-one-border)', color: 'var(--color-one-text-muted)' }}
                    >
                      <Play className="h-3 w-3 shrink-0 text-[color:var(--color-one-gold)]" />
                      <span className="max-w-[200px] truncate">{h.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl border"
                style={{ borderColor: 'var(--color-one-border)', background: 'rgba(14,19,27,0.45)' }}
              >
                <div className="aspect-video w-full animate-pulse" style={{ background: 'rgba(244,243,238,0.06)' }} />
                <div className="space-y-2 p-4">
                  <div className="h-3.5 w-4/5 animate-pulse rounded" style={{ background: 'rgba(244,243,238,0.08)' }} />
                  <div className="h-3 w-2/3 animate-pulse rounded" style={{ background: 'rgba(244,243,238,0.05)' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="one-surface flex flex-col items-center justify-center px-6 py-12 text-center" role="status">
            <Radio className="mb-3 h-8 w-8" style={{ color: 'var(--color-one-warning)' }} />
            <p className="text-sm font-medium text-[color:var(--color-one-text)]">{error}</p>
            <p className="mt-1 text-xs text-[color:var(--color-one-text-dim)]">
              {isZh ? '可切换频道、来源或更换关键词重试。' : 'Try another channel, source, or keyword.'}
            </p>
          </div>
        )}

        {!loading && !error && displayVideos.length === 0 && (
          <div className="one-surface flex flex-col items-center justify-center px-6 py-14 text-center">
            <div
              className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border"
              style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.03)' }}
            >
              <Film className="h-7 w-7 text-[color:var(--color-one-text-dim)]" />
            </div>
            <h3 className="text-base font-semibold text-[color:var(--color-one-text)]">
              {isZh ? '暂无影像内容' : 'No stories yet'}
            </h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-[color:var(--color-one-text-muted)]">
              {isZh ? '选择上方频道或输入关键词开始探索。' : 'Pick a channel above or search to discover moving stories.'}
            </p>
          </div>
        )}

        {!loading && displayVideos.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayVideos.map((video) => {
              const bookmarked = isBookmarked(video);
              const isPlaying =
                playingVideo?.videoId === video.videoId && playingVideo?.platform === video.platform;
              return (
                <article
                  key={`${video.platform}:${video.videoId}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border transition-all"
                  style={{
                    borderColor: isPlaying ? 'rgba(215,182,118,0.55)' : 'var(--color-one-border)',
                    background: 'rgba(14,19,27,0.55)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => openVideoPlayer(video, false)}
                    className="relative block aspect-video w-full overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2"
                    style={{ background: '#030508' }}
                  >
                    <img
                      src={thumbnailOf(video)}
                      alt={video.title}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-one)] group-hover:scale-[1.03]"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          video.platform === 'bilibili'
                            ? 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80'
                            : `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;
                      }}
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                    <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
                      <PlatformBadge platform={video.platform} />
                      {isPlaying && (
                        <span className="rounded-md bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold text-black">
                          {isZh ? '放映中' : 'Playing'}
                        </span>
                      )}
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      <span
                        className="flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur-sm"
                        style={{
                          borderColor: 'rgba(244,243,238,0.3)',
                          background: 'rgba(5,7,11,0.45)',
                          color: 'var(--color-one-text)',
                        }}
                      >
                        <Play className="ml-0.5 h-5 w-5 fill-current" />
                      </span>
                    </div>
                    {(video.durationText || video.durationSeconds) && (
                      <span
                        className="absolute bottom-2.5 right-2.5 rounded-md px-1.5 py-0.5 font-mono text-[10px]"
                        style={{ background: 'rgba(5,7,11,0.75)', color: 'var(--color-one-text)' }}
                      >
                        {video.durationText || formatDuration(video.durationSeconds)}
                      </span>
                    )}
                  </button>

                  <div className="flex flex-1 flex-col justify-between p-4">
                    <div>
                      <button
                        type="button"
                        onClick={() => openVideoPlayer(video, false)}
                        className="line-clamp-2 text-left text-sm font-medium leading-snug text-[color:var(--color-one-text)] transition hover:text-[color:var(--color-one-accent)]"
                        title={video.title}
                      >
                        {video.title}
                      </button>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-[color:var(--color-one-text-dim)]">
                        <span className="truncate">{video.author}</span>
                        <span className="shrink-0 text-[11px]">
                          {video.viewsText ||
                            (video.views ? `${formatViews(video.views)} ${isZh ? '次观看' : 'views'}` : video.publishedText || '')}
                        </span>
                      </div>
                    </div>

                    <div
                      className="mt-3 flex items-center justify-between border-t pt-3"
                      style={{ borderColor: 'var(--color-one-border)' }}
                    >
                      <button
                        type="button"
                        onClick={() => openVideoPlayer(video, false)}
                        className="inline-flex min-h-[40px] items-center gap-1.5 px-1 text-xs font-medium transition"
                        style={{ color: 'var(--color-one-gold)' }}
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>{isZh ? '立即播放' : 'Play'}</span>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleWatchlist(video)}
                          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg transition hover:bg-[rgba(244,243,238,0.06)]"
                          style={{ color: bookmarked ? 'var(--color-one-gold)' : 'var(--color-one-text-dim)' }}
                          title={
                            bookmarked ? (isZh ? '已在观影单' : 'In watchlist') : isZh ? '加入观影单' : 'Add to watchlist'
                          }
                        >
                          {bookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => openVideoPlayer(video, true)}
                          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-[color:var(--color-one-text-dim)] transition hover:bg-[rgba(244,243,238,0.06)] hover:text-[color:var(--color-one-text)]"
                          title={isZh ? '全屏影院模式' : 'Cinema mode'}
                        >
                          <Maximize2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Fullscreen Cinema Theater Modal */}
      {cinemaVideo && (
        <div
          className="fixed inset-0 z-[100] flex flex-col"
          style={{ background: 'rgba(3,5,8,0.98)' }}
          role="dialog"
          aria-modal="true"
          aria-label={cinemaVideo.title}
        >
          <div
            className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6"
            style={{ borderColor: 'var(--color-one-border)' }}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <PlatformBadge platform={cinemaVideo.platform} />
              <h2 className="truncate text-sm font-medium text-[color:var(--color-one-text)]">{cinemaVideo.title}</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => navigateQueue(-1)}
                className="one-btn one-btn-sm one-btn-ghost"
                title={isZh ? '上一部' : 'Previous'}
              >
                <SkipBack className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => navigateQueue(1)}
                className="one-btn one-btn-sm one-btn-ghost"
                title={isZh ? '下一部' : 'Next'}
              >
                <SkipForward className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setCinemaVideo(null)}
                className="one-btn one-btn-sm one-btn-ghost"
                aria-label="Close cinema"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6">
            <div className="w-full max-w-6xl">
              <div
                className="aspect-video w-full overflow-hidden rounded-xl bg-black"
                style={{ boxShadow: '0 30px 80px rgba(0,0,0,0.65)' }}
              >
                {renderPlayerSurface(cinemaVideo)}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[color:var(--color-one-text)]">{cinemaVideo.title}</p>
                  <p className="mt-0.5 text-xs text-[color:var(--color-one-text-muted)]">{cinemaVideo.author}</p>
                </div>
                <p className="hidden text-[11px] text-[color:var(--color-one-text-dim)] sm:block">
                  {isZh ? '左右方向键切换上/下一部 · Esc 退出影院' : 'Left/Right to switch · Esc to close'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function PlatformBadge({ platform }: { platform: SaturnVideo['platform'] }) {
  const isBili = platform === 'bilibili';
  const isNative = platform === 'native';
  return (
    <span
      className="rounded-md px-2 py-0.5 text-[10px] font-medium"
      style={
        isBili
          ? {
              color: 'var(--color-one-accent)',
              background: 'rgba(127,212,255,0.14)',
              border: '1px solid rgba(127,212,255,0.28)',
            }
          : isNative
          ? {
              color: 'var(--color-one-gold)',
              background: 'rgba(215,182,118,0.14)',
              border: '1px solid rgba(215,182,118,0.32)',
            }
          : {
              color: 'var(--color-one-danger)',
              background: 'rgba(224,122,122,0.14)',
              border: '1px solid rgba(224,122,122,0.28)',
            }
      }
    >
      {isBili ? 'Bilibili' : isNative ? 'HD Native' : 'YouTube'}
    </span>
  );
}

function parseISODuration(iso?: string): number {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}
