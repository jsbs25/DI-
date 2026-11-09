import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Search,
  Sparkles,
  Play,
  Bookmark,
  BookmarkCheck,
  Maximize2,
  X,
  ExternalLink,
  RefreshCw,
  Tv,
  Youtube,
  Radio,
  SlidersHorizontal,
  Flame,
  CheckCircle2
} from 'lucide-react';
import { Language } from '../types/index.ts';

interface SaturnSpaceProps {
  lang: Language;
  onBack: () => void;
}

export interface SaturnVideo {
  videoId: string; // YouTube ID or Bilibili bvid
  platform: 'youtube' | 'bilibili';
  title: string;
  author: string;
  publishedText?: string;
  durationSeconds?: number;
  durationText?: string;
  views?: number;
  viewsText?: string;
  coverUrl?: string;
  embedUrl?: string;
  arcurl?: string;
  description?: string;
}

const YOUTUBE_API_KEY = ''; // 可选：填入 YouTube Data API v3 Key

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.moomoo.me',
  'https://pipedapi.ducks.party'
];

// 快捷探索频道标签
const QUICK_CHANNELS: { key: string; zh: string; en: string; query: string; platform: 'all' | 'bilibili' | 'youtube' }[] = [
  { key: 'daily', zh: '🔥 每日精选', en: 'Daily Picks', query: 'universe space documentary', platform: 'all' },
  { key: 'bili_universe', zh: '📺 B站 · 宇宙探索', en: 'Bilibili Space', query: '宇宙 天文 纪录片 空间站', platform: 'bilibili' },
  { key: 'bili_scifi', zh: '🚀 B站 · 深度科幻', en: 'Bilibili Sci-Fi', query: '流浪地球 三体 科幻电影 解说', platform: 'bilibili' },
  { key: 'bili_science', zh: '🧬 B站 · 硬核科普', en: 'Bilibili Science', query: '量子力学 相对论 人工智能 科普', platform: 'bilibili' },
  { key: 'yt_space', zh: '🪐 YouTube · 天文纪实', en: 'YouTube Space', query: 'space astronomy universe NASA James Webb', platform: 'youtube' },
  { key: 'yt_tech', zh: '🤖 YouTube · 前沿科技', en: 'YouTube Tech', query: 'future technology AI robotics quantum', platform: 'youtube' },
  { key: 'yt_doc', zh: '🎬 YouTube · 顶级纪录片', en: 'YouTube Doc', query: 'nature space civilization documentary 4K', platform: 'youtube' },
  { key: 'ambient', zh: '🎵 太空环境白噪音', en: 'Space Ambient', query: 'space ambient music deep sleep', platform: 'youtube' }
];

const WATCHLIST_KEY = 'earth-one.saturn.watchlist.v3';
const DAILY_KEY = 'earth-one.saturn.daily.v3';

// ---------- 工具函数 ----------

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function extractYouTubeId(input: string): string | null {
  const m = input.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/);
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

function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

// ---------- 主组件 ----------

export const SaturnSpace: React.FC<SaturnSpaceProps> = ({ lang, onBack }) => {
  const isZh = lang === 'zh';

  const [query, setQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'bilibili' | 'youtube'>('all');
  const [results, setResults] = useState<SaturnVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeChannel, setActiveChannel] = useState<string>('daily');
  const [playingVideo, setPlayingVideo] = useState<SaturnVideo | null>(null);
  const [cinemaVideo, setCinemaVideo] = useState<SaturnVideo | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [dailyVideos, setDailyVideos] = useState<SaturnVideo[]>([]);
  const [searched, setSearched] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // 书签持久化
  useEffect(() => {
    setWatchlist(loadWatchlist());
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
    } catch {
      /* ignore */
    }
  }, [watchlist]);

  // 后端 Bilibili 真实爬虫
  const searchBilibili = useCallback(async (q: string, limit = 18): Promise<SaturnVideo[]> => {
    try {
      const res = await fetchWithTimeout(`/api/bilibili/search?q=${encodeURIComponent(q)}&limit=${limit}`, 9000);
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
          arcurl: bv.arcurl,
          description: bv.description
        }));
      }
    } catch {
      /* fallback */
    }
    return [];
  }, []);

  // 后端 YouTube 爬虫与镜像多节点检索
  const searchYouTube = useCallback(async (q: string, limit = 18): Promise<SaturnVideo[]> => {
    // 1) 后端抓取服务
    try {
      const res = await fetchWithTimeout(`/api/video/youtube-search?q=${encodeURIComponent(q)}&limit=${limit}`, 8000);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.videos) && data.videos.length > 0) {
          return data.videos.map((y: any) => ({
            videoId: y.videoId,
            platform: 'youtube' as const,
            title: y.title || 'Untitled',
            author: y.author || 'YouTube',
            publishedText: y.publishedText,
            durationSeconds: y.durationSeconds,
            views: y.views,
            coverUrl: y.coverUrl,
            embedUrl: y.embedUrl || `https://www.youtube.com/embed/${y.videoId}?autoplay=1&rel=0`
          }));
        }
      }
    } catch {
      /* fallback to client piped */
    }

    // 2) 官方 YouTube Data API v3（若配置）
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
              views: Number(v.statistics?.viewCount || 0)
            }));
          }
        }
      } catch {
        /* fall through to mirror nodes */
      }
    }

    // 3) Piped 镜像公共节点
    for (const instance of PIPED_INSTANCES) {
      try {
        const res = await fetchWithTimeout(`${instance}/search?q=${encodeURIComponent(q)}&filter=videos`, 7000);
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
              views: typeof it.views === 'number' ? it.views : undefined
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

  // 综合检索（并行抓取 B站 + YouTube）
  const searchAllPlatforms = useCallback(
    async (q: string, targetPlatform: 'all' | 'bilibili' | 'youtube' = 'all'): Promise<SaturnVideo[]> => {
      if (targetPlatform === 'bilibili') {
        return await searchBilibili(q, 18);
      }
      if (targetPlatform === 'youtube') {
        return await searchYouTube(q, 18);
      }
      // 并行请求双方
      const [biliRes, ytRes] = await Promise.allSettled([
        searchBilibili(q, 12),
        searchYouTube(q, 12)
      ]);
      const biliList = biliRes.status === 'fulfilled' ? biliRes.value : [];
      const ytList = ytRes.status === 'fulfilled' ? ytRes.value : [];

      // 交织合并展现丰富生态
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

  // 每日精选加载
  const loadDaily = useCallback(async () => {
    const today = todayStr();
    // 1) localStorage 今日缓存
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
    } catch {
      /* ignore */
    }

    // 2) 尝试先拉取 B站 宇宙热点
    try {
      const biliInitial = await searchBilibili('宇宙 空间站 纪录片', 12);
      if (biliInitial.length > 0) {
        setDailyVideos(biliInitial);
        setResults(biliInitial);
        try {
          localStorage.setItem(DAILY_KEY, JSON.stringify({ date: today, videos: biliInitial }));
        } catch {
          /* ignore */
        }
        return;
      }
    } catch {
      /* ignore */
    }

    // 3) 后端兜底 public/saturn_daily.json
    try {
      const res = await fetchWithTimeout('/saturn_daily.json', 5000);
      if (res.ok) {
        const data = await res.json();
        if (data?.videos?.length) {
          const videos = data.videos.map((v: any) => ({ ...v, platform: v.platform || 'youtube' })) as SaturnVideo[];
          setDailyVideos(videos);
          setResults(videos);
          return;
        }
      }
    } catch {
      /* ignore */
    }
  }, [searchBilibili]);

  useEffect(() => {
    loadDaily();
  }, [loadDaily]);

  // 运行搜索
  const runSearch = useCallback(
    async (raw: string, overridePlatform?: 'all' | 'bilibili' | 'youtube') => {
      const q = raw.trim();
      if (!q) return;
      const targetPlatform = overridePlatform || platformFilter;
      setLoading(true);
      setError('');
      setSearched(true);
      setActiveChannel('');

      // 1. 链接/ID 直解：立即站内免装播放
      // Bilibili 直解
      const bvid = extractBilibiliBvid(q);
      if (bvid) {
        const directBili: SaturnVideo = {
          videoId: bvid,
          platform: 'bilibili',
          title: `哔哩哔哩视频 (${bvid})`,
          author: 'Bilibili',
          embedUrl: `https://player.bilibili.com/player.html?bvid=${bvid}&page=1&autoplay=1`,
          arcurl: `https://www.bilibili.com/video/${bvid}`
        };
        setResults([directBili]);
        setPlayingVideo(directBili);
        setLoading(false);
        return;
      }

      // YouTube 直解
      const ytId = extractYouTubeId(q);
      if (ytId) {
        const directYt: SaturnVideo = {
          videoId: ytId,
          platform: 'youtube',
          title: `YouTube 视频 (${ytId})`,
          author: 'YouTube',
          embedUrl: `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`
        };
        setResults([directYt]);
        setPlayingVideo(directYt);
        setLoading(false);
        return;
      }

      // 2. 多源爬虫并行检索
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
    [platformFilter, searchAllPlatforms, isZh]
  );

  // 切换频道
  const onChannel = useCallback(
    async (ch: typeof QUICK_CHANNELS[number]) => {
      setActiveChannel(ch.key);
      setPlatformFilter(ch.platform);
      setQuery('');
      if (ch.key === 'daily') {
        setSearched(false);
        if (dailyVideos.length) {
          setResults(dailyVideos);
          return;
        }
        await loadDaily();
        return;
      }

      setLoading(true);
      setError('');
      setSearched(true);
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
    setWatchlist(prev => (prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]));
  };

  const isBookmarked = (video: SaturnVideo) => {
    return watchlist.includes(`${video.platform}:${video.videoId}`);
  };

  // 根据当前平台筛选器展示
  const displayVideos = useMemo(() => {
    if (platformFilter === 'all') return results;
    return results.filter(v => v.platform === platformFilter);
  }, [results, platformFilter]);

  return (
    <div className="min-h-screen bg-[#02050f] text-slate-100 selection:bg-amber-500/30 selection:text-amber-200">
      {/* 顶部环境光景 */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-[20%] left-[15%] w-[50vw] h-[50vw] rounded-full bg-amber-600/10 blur-[150px]" />
        <div className="absolute top-[30%] -right-[10%] w-[45vw] h-[45vw] rounded-full bg-sky-600/10 blur-[160px]" />
      </div>

      {/* Hero Header */}
      <header className="relative z-10 overflow-hidden border-b border-slate-800/70 bg-[radial-gradient(ellipse_at_50%_120%,rgba(245,190,110,0.16),transparent_60%),#02050f] px-4 py-8 sm:px-8">
        <button
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/70 px-4 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-amber-500/50 hover:text-white cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{isZh ? '返回宇宙引擎' : 'Back to Universe'}</span>
        </button>

        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/15 px-3 py-1 text-[11px] font-semibold text-sky-300">
              <Tv className="h-3.5 w-3.5 text-sky-400" />
              <span>B站 / Bilibili 原生爬虫集成</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/15 px-3 py-1 text-[11px] font-semibold text-red-300">
              <Youtube className="h-3.5 w-3.5 text-red-400" />
              <span>YouTube 开放媒体流</span>
            </span>
          </div>

          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            {isZh ? '🪐 土星观影站 · 影视宇宙' : '🪐 Saturn Cinema Station'}
          </h1>
          <p className="mt-2 text-xs sm:text-sm font-semibold tracking-[0.2em] text-amber-400/90 uppercase">
            SATURN CINEMA · ZERO INSTALLATION DIRECT PLAYER
          </p>
          <p className="mt-3 max-w-3xl text-xs sm:text-sm leading-relaxed text-slate-300">
            {isZh
              ? '后端高并发双轨爬虫：原生检索 B站 (Bilibili) 视频与官方播放器嵌入，同步支持 YouTube 宇宙纪录片与深度科幻。无需安装客户端，即搜即播。'
              : 'Direct full-stack crawler for Bilibili & YouTube. No app installation required. Search and watch instantly.'}
          </p>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-8 space-y-6">
        {/* 顶部正在播放视窗（若有） */}
        {playingVideo && (
          <div className="overflow-hidden rounded-3xl border border-amber-500/40 bg-black/90 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                  playingVideo.platform === 'bilibili' ? 'bg-sky-500 text-white' : 'bg-red-600 text-white'
                }`}>
                  {playingVideo.platform === 'bilibili' ? 'Bilibili' : 'YouTube'}
                </span>
                <span className="text-sm font-bold text-white truncate max-w-xl">{playingVideo.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCinemaVideo(playingVideo)}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title="全屏影院模式"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPlayingVideo(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title="关闭播放器"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="relative aspect-video w-full mt-3 rounded-2xl overflow-hidden bg-black">
              {playingVideo.platform === 'bilibili' ? (
                <iframe
                  src={playingVideo.embedUrl || `https://player.bilibili.com/player.html?bvid=${playingVideo.videoId}&page=1&autoplay=1`}
                  title={playingVideo.title}
                  className="h-full w-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <iframe
                  src={`https://www.youtube.com/embed/${playingVideo.videoId}?autoplay=1&rel=0`}
                  title={playingVideo.title}
                  className="h-full w-full border-0"
                  allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              )}
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span>{playingVideo.author} {playingVideo.durationText ? `· ${playingVideo.durationText}` : ''}</span>
              {playingVideo.arcurl && (
                <a
                  href={playingVideo.arcurl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sky-400 hover:underline"
                >
                  <span>B站官方链接</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* 综合搜索栏 */}
        <form
          onSubmit={e => {
            e.preventDefault();
            runSearch(query);
          }}
          className="space-y-3"
        >
          <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 shadow-xl focus-within:border-amber-500/80 transition-all">
            <Search className="h-5 w-5 shrink-0 text-slate-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={isZh ? '搜索 B站视频、YouTube 科幻纪录片，或直接粘贴 BV号 / 视频链接...' : 'Search Bilibili, YouTube space docs, or paste BV/video link...'}
              className="flex-1 bg-transparent text-sm sm:text-base text-slate-100 outline-none placeholder:text-slate-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-amber-900/40 transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (isZh ? '爬取中...' : 'Crawling...') : isZh ? '全网爬取' : 'Crawl'}
            </button>
          </div>

          {/* 平台筛选标签 */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">来源筛选:</span>
              <button
                type="button"
                onClick={() => {
                  setPlatformFilter('all');
                  if (query.trim()) runSearch(query, 'all');
                }}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  platformFilter === 'all'
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-500/50'
                    : 'bg-slate-900/60 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                ✨ 聚合双端 ({results.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setPlatformFilter('bilibili');
                  if (query.trim()) runSearch(query, 'bilibili');
                }}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  platformFilter === 'bilibili'
                    ? 'bg-sky-500/20 text-sky-200 border border-sky-500/50'
                    : 'bg-slate-900/60 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                <Tv className="w-3 h-3 text-sky-400" />
                <span>哔哩哔哩 (B站)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPlatformFilter('youtube');
                  if (query.trim()) runSearch(query, 'youtube');
                }}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  platformFilter === 'youtube'
                    ? 'bg-red-500/20 text-red-200 border border-red-500/50'
                    : 'bg-slate-900/60 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                <Youtube className="w-3 h-3 text-red-400" />
                <span>YouTube</span>
              </button>
            </div>

            <div className="text-[11px] text-slate-500 font-mono">
              免装播放 · 免 Key 原生流
            </div>
          </div>
        </form>

        {/* 快捷频道标签 */}
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_CHANNELS.map(ch => (
            <button
              key={ch.key}
              onClick={() => onChannel(ch)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                activeChannel === ch.key
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/50'
                  : 'border border-slate-800 bg-slate-900/40 text-slate-300 hover:text-white hover:border-slate-600'
              }`}
            >
              {isZh ? ch.zh : ch.en}
            </button>
          ))}
          <button
            onClick={() => loadDaily()}
            className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
            title={isZh ? '刷新每日精选' : 'Refresh daily'}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>刷新</span>
          </button>
        </div>

        {/* 我的观影单（书签） */}
        {watchlist.length > 0 && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-xs sm:text-sm font-bold text-amber-200">
              <BookmarkCheck className="h-4 w-4" />
              {isZh ? '我的星际观影单' : 'My Watchlist'} · {watchlist.length}
            </h2>
            <div className="flex flex-wrap gap-2">
              {watchlist.map(key => {
                const [platform, id] = key.split(':');
                const v = results.find(x => x.videoId === id);
                return (
                  <button
                    key={key}
                    onClick={() => {
                      if (v) {
                        setPlayingVideo(v);
                      } else {
                        // 构造直解
                        const fallback: SaturnVideo = {
                          videoId: id,
                          platform: platform as any,
                          title: `${platform === 'bilibili' ? 'B站' : 'YouTube'} 收藏视频 (${id})`,
                          author: 'Watchlist',
                          embedUrl: platform === 'bilibili'
                            ? `https://player.bilibili.com/player.html?bvid=${id}&page=1&autoplay=1`
                            : `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`
                        };
                        setPlayingVideo(fallback);
                      }
                    }}
                    className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-xs text-slate-200 hover:border-amber-500/50 flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${platform === 'bilibili' ? 'bg-sky-400' : 'bg-red-400'}`} />
                    <span className="truncate max-w-[200px]">{v ? v.title : id}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 状态指示 */}
        {loading && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-sm text-slate-400">
            <div className="inline-block animate-spin mb-3">🪐</div>
            <div>{isZh ? '正在从 B站与 YouTube 爬虫网络检索音画资源...' : 'Crawling video streams across platforms...'}</div>
          </div>
        )}
        {!loading && error && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-400">
            {error}
          </div>
        )}
        {!loading && !error && displayVideos.length === 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-sm text-slate-400">
            {isZh ? '暂无视频，点击上方频道标签（如 B站 · 宇宙探索）或搜索关键词开始探索。' : 'No videos found. Pick a channel or search above.'}
          </div>
        )}

        {/* 视频卡片网格 */}
        {!loading && displayVideos.length > 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {displayVideos.map(video => (
              <article
                key={`${video.platform}:${video.videoId}`}
                className="group overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-xl backdrop-blur-sm transition-all hover:border-slate-600 hover:-translate-y-0.5"
              >
                {/* 封面缩略图 + 播放按钮 */}
                <div
                  onClick={() => setPlayingVideo(video)}
                  className="group/thumb relative block aspect-video w-full bg-slate-950 overflow-hidden cursor-pointer"
                >
                  <img
                    src={thumbnailOf(video)}
                    alt={video.title}
                    loading="lazy"
                    className="h-full w-full object-cover opacity-90 transition-transform duration-300 group-hover/thumb:scale-105 group-hover/thumb:opacity-75"
                    onError={e => {
                      (e.currentTarget as HTMLImageElement).src =
                        video.platform === 'bilibili'
                          ? 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80'
                          : `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;
                    }}
                  />
                  {/* Platform Badge */}
                  <span className={`absolute top-2.5 left-2.5 px-2 py-0.5 rounded text-[10px] font-bold shadow-md ${
                    video.platform === 'bilibili' ? 'bg-sky-500 text-white' : 'bg-red-600 text-white'
                  }`}>
                    {video.platform === 'bilibili' ? 'B站' : 'YouTube'}
                  </span>

                  {/* Play Trigger */}
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className={`flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-transform group-hover/thumb:scale-110 ${
                      video.platform === 'bilibili' ? 'bg-sky-500/90' : 'bg-red-600/90'
                    }`}>
                      <Play className="h-5 w-5 fill-white text-white ml-0.5" />
                    </span>
                  </span>

                  {/* Duration Tag */}
                  {(video.durationText || video.durationSeconds) && (
                    <span className="absolute bottom-2 right-2 rounded bg-black/85 px-1.5 py-0.5 text-[11px] font-semibold text-white font-mono">
                      {video.durationText || formatDuration(video.durationSeconds)}
                    </span>
                  )}
                </div>

                {/* 视频信息区 */}
                <div className="p-4 flex flex-col justify-between">
                  <div>
                    <h3
                      onClick={() => setPlayingVideo(video)}
                      className="line-clamp-2 text-xs sm:text-sm font-bold text-white hover:text-amber-300 transition-colors cursor-pointer"
                      title={video.title}
                    >
                      {video.title}
                    </h3>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-slate-400">
                      <span className="truncate max-w-[160px]">{video.author}</span>
                      <span className="text-[11px] text-slate-500 shrink-0">
                        {video.viewsText || (video.views ? `${formatViews(video.views)} 次观看` : video.publishedText || '')}
                      </span>
                    </div>
                  </div>

                  {/* 快捷操作条 */}
                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <button
                      onClick={() => setPlayingVideo(video)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300 cursor-pointer"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      <span>立即播放</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleWatchlist(video)}
                        className={`rounded-lg p-1.5 transition-colors cursor-pointer ${
                          isBookmarked(video)
                            ? 'text-amber-300 bg-amber-500/10'
                            : 'text-slate-500 hover:bg-slate-800 hover:text-white'
                        }`}
                        title={isBookmarked(video) ? '已在观影单' : '加入观影单'}
                      >
                        {isBookmarked(video) ? (
                          <BookmarkCheck className="h-4 w-4" />
                        ) : (
                          <Bookmark className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => setCinemaVideo(video)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
                        title="全屏影院模式"
                      >
                        <Maximize2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* 外部观影扩展（新窗口直通） */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/70 pt-6">
          <div className="flex items-center gap-3">
            <a
              href="https://souju6.ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-purple-600/20 transition-all hover:from-purple-500 hover:to-indigo-500"
            >
              <Tv className="h-3.5 w-3.5" />
              <span>{isZh ? '在线影视检索站' : 'Online Cinema Portal'}</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <a
              href="https://www.bilibili.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600/20 border border-sky-500/40 px-3 py-2 text-xs font-semibold text-sky-200 transition-all hover:bg-sky-600/30"
            >
              <Tv className="h-3.5 w-3.5 text-sky-400" />
              <span>哔哩哔哩官方主站</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <span className="text-xs text-slate-500">
            {isZh ? '第三方站点 · 版权归原权利人所有' : 'Third-party sites · all rights belong to respective owners'}
          </span>
        </div>
      </main>

      {/* 全屏影院模式 */}
      {cinemaVideo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-5xl">
            <button
              onClick={() => setCinemaVideo(null)}
              className="absolute -top-10 right-0 rounded-lg bg-white/10 p-2 text-white hover:bg-white/20 cursor-pointer"
              title={isZh ? '关闭影院模式' : 'Close cinema'}
            >
              <X className="h-5 w-5" />
            </button>
            <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-2xl">
              {cinemaVideo.platform === 'bilibili' ? (
                <iframe
                  src={cinemaVideo.embedUrl || `https://player.bilibili.com/player.html?bvid=${cinemaVideo.videoId}&page=1&autoplay=1`}
                  title={cinemaVideo.title}
                  className="h-full w-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <iframe
                  src={`https://www.youtube.com/embed/${cinemaVideo.videoId}?autoplay=1&rel=0`}
                  title={cinemaVideo.title}
                  className="h-full w-full border-0"
                  allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              )}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="truncate text-base font-bold text-white">{cinemaVideo.title}</p>
                <p className="mt-0.5 text-xs text-slate-400">{cinemaVideo.author}</p>
              </div>
              <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                cinemaVideo.platform === 'bilibili' ? 'bg-sky-500 text-white' : 'bg-red-600 text-white'
              }`}>
                {cinemaVideo.platform === 'bilibili' ? 'Bilibili' : 'YouTube'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ISO 8601 duration ("PT1H2M3S") -> seconds
function parseISODuration(iso?: string): number {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}
