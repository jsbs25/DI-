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
  Radio
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
  { key: 'daily', zh: '每日精选', en: 'Daily Picks', query: 'universe space documentary', platform: 'all' },
  { key: 'bili_universe', zh: 'B站 · 宇宙探索', en: 'Bilibili Space', query: '宇宙 天文 纪录片 空间站', platform: 'bilibili' },
  { key: 'bili_scifi', zh: 'B站 · 深度科幻', en: 'Bilibili Sci-Fi', query: '流浪地球 三体 科幻电影 解说', platform: 'bilibili' },
  { key: 'bili_science', zh: 'B站 · 硬核科普', en: 'Bilibili Science', query: '量子力学 相对论 人工智能 科普', platform: 'bilibili' },
  { key: 'yt_space', zh: 'YouTube · 天文纪实', en: 'YouTube Space', query: 'space astronomy universe NASA James Webb', platform: 'youtube' },
  { key: 'yt_tech', zh: 'YouTube · 前沿科技', en: 'YouTube Tech', query: 'future technology AI robotics quantum', platform: 'youtube' },
  { key: 'yt_doc', zh: 'YouTube · 顶级纪录片', en: 'YouTube Doc', query: 'nature space civilization documentary 4K', platform: 'youtube' },
  { key: 'ambient', zh: '太空环境白噪音', en: 'Space Ambient', query: 'space ambient music deep sleep', platform: 'youtube' }
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
      const [biliRes, ytRes] = await Promise.allSettled([searchBilibili(q, 12), searchYouTube(q, 12)]);
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
    async (ch: (typeof QUICK_CHANNELS)[number]) => {
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
    setWatchlist((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  };

  const isBookmarked = (video: SaturnVideo) => {
    return watchlist.includes(`${video.platform}:${video.videoId}`);
  };

  // 根据当前平台筛选器展示
  const displayVideos = useMemo(() => {
    if (platformFilter === 'all') return results;
    return results.filter((v) => v.platform === platformFilter);
  }, [results, platformFilter]);

  // cinema keyboard close
  useEffect(() => {
    if (!cinemaVideo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCinemaVideo(null);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [cinemaVideo]);

  return (
    <div
      className="min-h-screen text-[color:var(--color-one-text)]"
      style={{
        background:
          'radial-gradient(1100px 600px at 20% -10%, rgba(215,182,118,0.08), transparent 55%), radial-gradient(900px 500px at 85% 10%, rgba(127,212,255,0.06), transparent 50%), linear-gradient(180deg, #030508 0%, #05070b 45%, #030508 100%)'
      }}
    >
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div
          className="absolute bottom-[-15%] left-1/2 h-[60vw] w-[60vw] -translate-x-1/2 rounded-full opacity-[0.08] blur-[140px]"
          style={{ background: 'radial-gradient(circle, rgba(215,182,118,0.45), transparent 65%)' }}
        />
      </div>

      <header className="relative z-10 mx-auto w-full max-w-[1440px] px-4 pb-6 pt-6 sm:px-6 lg:px-10 lg:pt-8">
        <button onClick={onBack} className="one-btn one-btn-sm one-btn-ghost mb-5 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          <span>{isZh ? '返回宇宙引擎' : 'Back to Universe'}</span>
        </button>

        <div className="one-surface-elevated relative overflow-hidden px-5 py-6 sm:px-7 sm:py-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-16 h-72 w-72 rounded-full opacity-20 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(215,182,118,0.4), transparent 70%)' }}
          />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="one-badge one-badge-gold inline-flex items-center gap-1.5">
                  <Clapperboard className="h-3.5 w-3.5" />
                  ONE · SATURN
                </span>
                <span className="one-badge one-badge-neutral inline-flex items-center gap-1.5 normal-case tracking-normal">
                  <Tv className="h-3.5 w-3.5" /> Bilibili
                </span>
                <span className="one-badge one-badge-neutral inline-flex items-center gap-1.5 normal-case tracking-normal">
                  <Youtube className="h-3.5 w-3.5" /> YouTube
                </span>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-[color:var(--color-one-text)] sm:text-4xl lg:text-5xl">
                ONE SATURN
              </h1>
              <p className="mt-1 text-sm font-medium tracking-[0.18em] text-[color:var(--color-one-text-muted)] sm:text-base">
                A World of Moving Stories.
              </p>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--color-one-text-muted)]">
                {isZh
                  ? '影像、时间、叙事与探索。原生检索 Bilibili 与 YouTube 的真实内容，即搜即播，无需安装。封面即入口，故事即旅程。'
                  : 'Moving image, time, narrative, discovery. Search real content across Bilibili and YouTube and play instantly—no install required.'}
              </p>
            </div>

            <div
              className="flex shrink-0 items-center gap-4 rounded-2xl border px-4 py-3.5"
              style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.03)' }}
            >
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl border"
                style={{ borderColor: 'rgba(215,182,118,0.28)', background: 'rgba(215,182,118,0.1)', color: 'var(--color-one-gold)' }}
              >
                <Film className="h-5 w-5" />
              </div>
              <div className="text-xs">
                <div className="text-[color:var(--color-one-text-dim)]">{isZh ? '双源影像检索' : 'Dual-source discovery'}</div>
                <div className="mt-0.5 font-medium text-[color:var(--color-one-text)]">
                  {isZh ? '免装播放 · 真实内容' : 'Instant play · Real content'}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-[color:var(--color-one-text-dim)]">Bilibili · YouTube</div>
              </div>
            </div>
          </div>

          {/* Search */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runSearch(query);
            }}
            className="relative mt-7 space-y-3"
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
                      ? '搜索 B站 / YouTube，或粘贴 BV号、视频链接直达播放...'
                      : 'Search Bilibili/YouTube, or paste BV/video link to play...'
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
              <button type="submit" disabled={loading} className="one-btn one-btn-md one-btn-primary shrink-0 disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {loading ? (isZh ? '检索中...' : 'Searching...') : isZh ? '全网检索' : 'Search'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-one-text-dim)]">
                {isZh ? '来源' : 'Source'}
              </span>
              {([
                { id: 'all' as const, label: isZh ? `聚合 (${results.length})` : `All (${results.length})` },
                { id: 'bilibili' as const, label: 'Bilibili' },
                { id: 'youtube' as const, label: 'YouTube' }
              ]).map((s) => {
                const active = platformFilter === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setPlatformFilter(s.id);
                      if (query.trim()) runSearch(query, s.id);
                    }}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all"
                    style={
                      active
                        ? {
                            color: 'var(--color-one-gold)',
                            background: 'rgba(215,182,118,0.14)',
                            border: '1px solid rgba(215,182,118,0.28)'
                          }
                        : {
                            color: 'var(--color-one-text-muted)',
                            background: 'rgba(244,243,238,0.03)',
                            border: '1px solid var(--color-one-border)'
                          }
                    }
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </form>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[1440px] space-y-5 px-4 pb-16 sm:px-6 lg:px-10">
        {/* Now playing (inline) */}
        {playingVideo && (
          <section className="one-surface-elevated overflow-hidden">
            <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5" style={{ borderColor: 'var(--color-one-border)' }}>
              <div className="flex min-w-0 items-center gap-2.5">
                <PlatformBadge platform={playingVideo.platform} />
                <h2 className="truncate text-sm font-medium text-[color:var(--color-one-text)]">{playingVideo.title}</h2>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button type="button" onClick={() => setCinemaVideo(playingVideo)} className="one-btn one-btn-sm one-btn-secondary" title={isZh ? '影院模式' : 'Cinema'}>
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{isZh ? '影院' : 'Cinema'}</span>
                </button>
                <button type="button" onClick={() => setPlayingVideo(null)} className="one-btn one-btn-sm one-btn-ghost" aria-label="Close player">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="bg-black">
              <div className="aspect-video w-full">
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
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-[color:var(--color-one-text-muted)] sm:px-5">
              <span className="truncate">
                {playingVideo.author}
                {playingVideo.durationText ? ` · ${playingVideo.durationText}` : ''}
              </span>
              {playingVideo.arcurl && (
                <a
                  href={playingVideo.arcurl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 transition hover:text-[color:var(--color-one-accent)]"
                >
                  <span>{isZh ? 'B站官方链接' : 'Bilibili link'}</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
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
                onClick={() => onChannel(ch)}
                className="rounded-full px-3.5 py-1.5 text-xs font-medium transition-all"
                style={
                  active
                    ? {
                        color: 'var(--color-one-text)',
                        background: 'rgba(244,243,238,0.1)',
                        border: '1px solid rgba(244,243,238,0.22)'
                      }
                    : {
                        color: 'var(--color-one-text-muted)',
                        background: 'rgba(244,243,238,0.03)',
                        border: '1px solid var(--color-one-border)'
                      }
                }
              >
                {isZh ? ch.zh : ch.en}
              </button>
            );
          })}
          <button onClick={() => loadDaily()} className="one-btn one-btn-sm one-btn-ghost" title={isZh ? '刷新每日精选' : 'Refresh daily'}>
            <RefreshCw className="h-3.5 w-3.5" />
            <span>{isZh ? '刷新' : 'Refresh'}</span>
          </button>
        </div>

        {/* Watchlist */}
        {watchlist.length > 0 && (
          <div className="one-surface px-4 py-4 sm:px-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-[color:var(--color-one-text)]">
              <BookmarkCheck className="h-4 w-4" style={{ color: 'var(--color-one-gold)' }} />
              {isZh ? '我的观影单' : 'My Watchlist'} <span className="one-badge one-badge-neutral font-mono normal-case tracking-normal">{watchlist.length}</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {watchlist.map((key) => {
                const [platform, id] = key.split(':');
                const v = results.find((x) => x.videoId === id);
                return (
                  <button
                    key={key}
                    onClick={() => {
                      if (v) {
                        setPlayingVideo(v);
                      } else {
                        const fallback: SaturnVideo = {
                          videoId: id,
                          platform: platform as any,
                          title: `${platform === 'bilibili' ? 'B站' : 'YouTube'} 收藏视频 (${id})`,
                          author: 'Watchlist',
                          embedUrl:
                            platform === 'bilibili'
                              ? `https://player.bilibili.com/player.html?bvid=${id}&page=1&autoplay=1`
                              : `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`
                        };
                        setPlayingVideo(fallback);
                      }
                    }}
                    className="inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition hover:bg-[rgba(244,243,238,0.05)]"
                    style={{ borderColor: 'var(--color-one-border)', color: 'var(--color-one-text-muted)' }}
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: platform === 'bilibili' ? 'var(--color-one-accent)' : 'var(--color-one-danger)' }}
                    />
                    <span className="max-w-[220px] truncate">{v ? v.title : id}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* States */}
        {loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--color-one-border)', background: 'rgba(14,19,27,0.45)' }}>
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
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border" style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.03)' }}>
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

        {/* Video grid */}
        {!loading && displayVideos.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayVideos.map((video) => {
              const bookmarked = isBookmarked(video);
              return (
                <article
                  key={`${video.platform}:${video.videoId}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border transition-all"
                  style={{ borderColor: 'var(--color-one-border)', background: 'rgba(14,19,27,0.55)' }}
                >
                  <button
                    type="button"
                    onClick={() => setPlayingVideo(video)}
                    className="relative block aspect-video w-full overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2"
                    style={{ background: '#030508' }}
                  >
                    <img
                      src={thumbnailOf(video)}
                      alt={video.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-one)] group-hover:scale-[1.03]"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          video.platform === 'bilibili'
                            ? 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80'
                            : `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;
                      }}
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                    <div className="absolute left-2.5 top-2.5">
                      <PlatformBadge platform={video.platform} />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      <span
                        className="flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur-sm"
                        style={{ borderColor: 'rgba(244,243,238,0.3)', background: 'rgba(5,7,11,0.45)', color: 'var(--color-one-text)' }}
                      >
                        <Play className="ml-0.5 h-5 w-5 fill-current" />
                      </span>
                    </div>
                    {(video.durationText || video.durationSeconds) && (
                      <span
                        className="absolute bottom-2.5 right-2.5 rounded-md px-1.5 py-0.5 font-mono text-[10px]"
                        style={{ background: 'rgba(5,7,11,0.7)', color: 'var(--color-one-text)' }}
                      >
                        {video.durationText || formatDuration(video.durationSeconds)}
                      </span>
                    )}
                  </button>

                  <div className="flex flex-1 flex-col justify-between p-4">
                    <div>
                      <button
                        type="button"
                        onClick={() => setPlayingVideo(video)}
                        className="line-clamp-2 text-left text-sm font-medium leading-snug text-[color:var(--color-one-text)] transition hover:text-[color:var(--color-one-accent)]"
                        title={video.title}
                      >
                        {video.title}
                      </button>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-[color:var(--color-one-text-dim)]">
                        <span className="truncate">{video.author}</span>
                        <span className="shrink-0 text-[11px]">
                          {video.viewsText || (video.views ? `${formatViews(video.views)} ${isZh ? '次观看' : 'views'}` : video.publishedText || '')}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t pt-3" style={{ borderColor: 'var(--color-one-border)' }}>
                      <button
                        type="button"
                        onClick={() => setPlayingVideo(video)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium transition"
                        style={{ color: 'var(--color-one-gold)' }}
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>{isZh ? '播放' : 'Play'}</span>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleWatchlist(video)}
                          className="rounded-lg p-1.5 transition hover:bg-[rgba(244,243,238,0.06)]"
                          style={{ color: bookmarked ? 'var(--color-one-gold)' : 'var(--color-one-text-dim)' }}
                          title={bookmarked ? (isZh ? '已在观影单' : 'In watchlist') : (isZh ? '加入观影单' : 'Add to watchlist')}
                        >
                          {bookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCinemaVideo(video)}
                          className="rounded-lg p-1.5 text-[color:var(--color-one-text-dim)] transition hover:bg-[rgba(244,243,238,0.06)] hover:text-[color:var(--color-one-text)]"
                          title={isZh ? '影院模式' : 'Cinema mode'}
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

        {/* External links */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-6" style={{ borderColor: 'var(--color-one-border)' }}>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="https://souju6.ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="one-btn one-btn-sm one-btn-secondary"
            >
              <Tv className="h-3.5 w-3.5" />
              <span>{isZh ? '在线影视检索站' : 'Online Cinema Portal'}</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <a
              href="https://www.bilibili.com"
              target="_blank"
              rel="noopener noreferrer"
              className="one-btn one-btn-sm one-btn-ghost"
            >
              <Tv className="h-3.5 w-3.5" />
              <span>哔哩哔哩官方主站</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <span className="text-xs text-[color:var(--color-one-text-dim)]">
            {isZh ? '第三方站点 · 版权归原权利人所有' : 'Third-party sites · rights belong to respective owners'}
          </span>
        </div>
      </main>

      {/* Cinema modal */}
      {cinemaVideo && (
        <div
          className="fixed inset-0 z-[100] flex flex-col"
          style={{ background: 'rgba(3,5,8,0.97)' }}
          role="dialog"
          aria-modal="true"
          aria-label={cinemaVideo.title}
        >
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6" style={{ borderColor: 'var(--color-one-border)' }}>
            <div className="flex min-w-0 items-center gap-2.5">
              <PlatformBadge platform={cinemaVideo.platform} />
              <h2 className="truncate text-sm font-medium text-[color:var(--color-one-text)]">{cinemaVideo.title}</h2>
            </div>
            <button type="button" onClick={() => setCinemaVideo(null)} className="one-btn one-btn-sm one-btn-ghost" aria-label="Close cinema">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6">
            <div className="w-full max-w-6xl">
              <div className="aspect-video w-full overflow-hidden rounded-xl bg-black" style={{ boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}>
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
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[color:var(--color-one-text)]">{cinemaVideo.title}</p>
                  <p className="mt-0.5 text-xs text-[color:var(--color-one-text-muted)]">{cinemaVideo.author}</p>
                </div>
                <p className="hidden text-[11px] text-[color:var(--color-one-text-dim)] sm:block">
                  {isZh ? 'Esc 关闭' : 'Esc to close'}
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
  return (
    <span
      className="rounded-md px-2 py-0.5 text-[10px] font-medium"
      style={
        isBili
          ? { color: 'var(--color-one-accent)', background: 'rgba(127,212,255,0.14)', border: '1px solid rgba(127,212,255,0.28)' }
          : { color: 'var(--color-one-danger)', background: 'rgba(224,122,122,0.14)', border: '1px solid rgba(224,122,122,0.28)' }
      }
    >
      {isBili ? 'Bilibili' : 'YouTube'}
    </span>
  );
}

// ISO 8601 duration ("PT1H2M3S") -> seconds
function parseISODuration(iso?: string): number {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}
