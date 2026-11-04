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
  Youtube
} from 'lucide-react';
import { Language } from '../types/index.ts';

interface SaturnSpaceProps {
  lang: Language;
  onBack: () => void;
}

interface SaturnVideo {
  videoId: string;
  title: string;
  author: string;
  publishedText?: string;
  durationSeconds?: number;
  views?: number;
}

// 免 Key 的 YouTube 镜像检索节点（Piped API），按顺序轮询，超时自动切换下一个。
// 在代码顶部预留官方 YouTube Data API v3 Key：如配置了 key，则优先走官方接口。
const YOUTUBE_API_KEY = ''; // 可选：填入 YouTube Data API v3 Key（切勿提交到 GitHub）

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.moomoo.me',
  'https://pipedapi.ducks.party'
];

// 快捷探索频道标签
const QUICK_CHANNELS: { key: string; zh: string; en: string; query: string }[] = [
  { key: 'daily', zh: '🔥 每日精选', en: 'Daily Picks', query: 'universe space documentary' },
  { key: 'space', zh: '🪐 宇宙与天文', en: 'Space & Astronomy', query: 'space astronomy universe NASA' },
  { key: 'tech', zh: '🤖 前沿科技', en: 'Frontier Tech', query: 'future technology AI science' },
  { key: 'doc', zh: '🎬 深度纪录片', en: 'Documentary', query: 'documentary nature science history' },
  { key: 'ambient', zh: '🎵 太空环境音', en: 'Space Ambient', query: 'space ambient music relax' }
];

const WATCHLIST_KEY = 'earth-one.saturn.watchlist.v2';
const DAILY_KEY = 'earth-one.saturn.daily.v2';

// ---------- 工具函数 ----------

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function extractVideoId(input: string): string | null {
  const m = input.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/);
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

function thumbnailOf(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function seededQuery(date: string): string {
  const queries = QUICK_CHANNELS.filter(c => c.key !== 'daily').map(c => c.query);
  let hash = 0;
  for (let i = 0; i < date.length; i++) hash = (hash * 31 + date.charCodeAt(i)) >>> 0;
  return queries[hash % queries.length];
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
  const [results, setResults] = useState<SaturnVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeChannel, setActiveChannel] = useState<string>('daily');
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
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

  // 解析 Piped API 响应 -> SaturnVideo[]
  const parsePiped = useCallback((data: any): SaturnVideo[] => {
    const items = data?.items;
    if (!Array.isArray(items)) return [];
    const out: SaturnVideo[] = [];
    for (const it of items) {
      if (it?.type !== 'stream') continue;
      const url: string = it.url || '';
      const videoId = extractVideoId(url) || extractVideoId(`youtube.com${url}`);
      if (!videoId) continue;
      out.push({
        videoId,
        title: it.title || 'Untitled',
        author: it.uploaderName || it.uploader || 'Unknown',
        publishedText: it.uploadedDate || undefined,
        durationSeconds: typeof it.duration === 'number' ? it.duration : undefined,
        views: typeof it.views === 'number' ? it.views : undefined
      });
    }
    return out;
  }, []);

  // 免 Key 多节点检索
  const searchYouTube = useCallback(
    async (q: string): Promise<SaturnVideo[]> => {
      if (YOUTUBE_API_KEY) {
        // 官方 YouTube Data API v3（如已配置）
        try {
          const res = await fetchWithTimeout(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=12&q=${encodeURIComponent(q)}&key=${YOUTUBE_API_KEY}`,
            10000
          );
          if (res.ok) {
            const data = await res.json();
            const ids = (data.items || []).map((i: any) => i.id?.videoId).filter(Boolean);
            if (ids.length) {
              const detail = await fetchWithTimeout(
                `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids.join(',')}&key=${YOUTUBE_API_KEY}`,
                10000
              );
              const d = await detail.json();
              return (d.items || []).map((v: any) => ({
                videoId: v.id,
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

      for (const instance of PIPED_INSTANCES) {
        try {
          const res = await fetchWithTimeout(
            `${instance}/search?q=${encodeURIComponent(q)}&filter=videos`,
            8000
          );
          if (!res.ok) continue;
          const data = await res.json();
          const videos = parsePiped(data);
          if (videos.length) return videos;
        } catch {
          continue;
        }
      }
      throw new Error('search-unavailable');
    },
    [parsePiped]
  );

  // 每日自动抓取（localStorage 缓存，24h 刷新）
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
    // 2) 后端兜底 public/saturn_daily.json
    try {
      const res = await fetchWithTimeout('/saturn_daily.json', 5000);
      if (res.ok) {
        const data = await res.json();
        if (data?.videos?.length) {
          const videos = data.videos as SaturnVideo[];
          setDailyVideos(videos);
          setResults(videos);
          try {
            localStorage.setItem(DAILY_KEY, JSON.stringify({ date: data.date || today, videos }));
          } catch {
            /* ignore */
          }
          return;
        }
      }
    } catch {
      /* ignore */
    }
    // 3) 实时抓取（免 Key 镜像）
    try {
      const q = seededQuery(today);
      const videos = await searchYouTube(q);
      if (videos.length) {
        setDailyVideos(videos);
        setResults(videos);
        try {
          localStorage.setItem(DAILY_KEY, JSON.stringify({ date: today, videos }));
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* leave empty; show empty state */
    }
  }, [searchYouTube]);

  useEffect(() => {
    loadDaily();
  }, [loadDaily]);

  const runSearch = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q) return;
      setLoading(true);
      setError('');
      setSearched(true);
      setActiveChannel('');

      // 链接直解：立即站内播放
      const videoId = extractVideoId(q);
      if (videoId) {
        const direct: SaturnVideo = { videoId, title: `YouTube 视频 (${videoId})`, author: 'YouTube' };
        setResults([direct]);
        setPlayingVideoId(videoId);
        setLoading(false);
        return;
      }

      try {
        const videos = await searchYouTube(q);
        setResults(videos);
        if (!videos.length) setError(isZh ? '未找到相关视频' : 'No videos found');
      } catch {
        setError(isZh ? '搜索服务暂时不可用，请稍后重试' : 'Search service unavailable, please retry');
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [searchYouTube, isZh]
  );

  const onChannel = useCallback(
    async (ch: typeof QUICK_CHANNELS[number]) => {
      setActiveChannel(ch.key);
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
        const videos = await searchYouTube(ch.query);
        setResults(videos);
      } catch {
        setError(isZh ? '搜索服务暂时不可用，请稍后重试' : 'Search service unavailable');
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [searchYouTube, dailyVideos, loadDaily, isZh]
  );

  const toggleWatchlist = (videoId: string) => {
    setWatchlist(prev => (prev.includes(videoId) ? prev.filter(x => x !== videoId) : [...prev, videoId]));
  };

  const displayVideos = results;

  return (
    <div className="min-h-screen bg-[#02050f] text-slate-100">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-slate-800/70 bg-[radial-gradient(ellipse_at_50%_120%,rgba(245,190,110,0.16),transparent_60%),#02050f] px-4 py-10 sm:px-8">
        <button
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/70 px-4 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-amber-500/50 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{isZh ? '返回宇宙引擎' : 'Back to Universe'}</span>
        </button>

        <div className="mx-auto max-w-6xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-300">
            <Youtube className="h-3.5 w-3.5" />
            <span>{isZh ? '土星生态空间 · 影视宇宙' : 'SATURN · CINEMA UNIVERSE'}</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-5xl">
            {isZh ? '🪐 土星观影站' : '🪐 Saturn Cinema'}
          </h1>
          <p className="mt-1 text-sm font-semibold tracking-[0.2em] text-amber-400/80">
            {isZh ? 'SATURN CINEMA STATION' : 'SATURN CINEMA STATION'}
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
            {isZh
              ? '自动抓取 YouTube 宇宙与科技视频，站内搜索、站内播放。支持直接粘贴视频链接。'
              : 'Auto-crawl YouTube space & tech videos. Search and watch in-page. Paste a video link to play instantly.'}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        {/* 搜索栏 */}
        <form
          onSubmit={e => {
            e.preventDefault();
            runSearch(query);
          }}
          className="mb-4"
        >
          <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 focus-within:border-amber-500/60">
            <Search className="h-5 w-5 shrink-0 text-slate-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={isZh ? '在土星观影站搜索 YouTube 视频，或直接粘贴视频链接...' : 'Search YouTube videos, or paste a video link...'}
              className="flex-1 bg-transparent text-base text-slate-100 outline-none placeholder:text-slate-500"
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
              className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
            >
              {loading ? (isZh ? '搜索中...' : 'Searching...') : isZh ? '搜索' : 'Search'}
            </button>
          </div>
        </form>

        {/* 快捷频道标签 */}
        <div className="mb-6 flex flex-wrap gap-2">
          {QUICK_CHANNELS.map(ch => (
            <button
              key={ch.key}
              onClick={() => onChannel(ch)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeChannel === ch.key
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30'
                  : 'border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500'
              }`}
            >
              {isZh ? ch.zh : ch.en}
            </button>
          ))}
          <button
            onClick={() => loadDaily()}
            className="ml-1 inline-flex items-center gap-1 rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-white"
            title={isZh ? '刷新每日精选' : 'Refresh daily'}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* 我的观影单（书签） */}
        {watchlist.length > 0 && (
          <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-amber-200">
              <BookmarkCheck className="h-4 w-4" />
              {isZh ? '我的观影单' : 'My Watchlist'} · {watchlist.length}
            </h2>
            <div className="flex flex-wrap gap-2">
              {watchlist.map(id => {
                const v = displayVideos.find(x => x.videoId === id);
                return (
                  <button
                    key={id}
                    onClick={() => v && setPlayingVideoId(v.videoId)}
                    className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-slate-200 hover:border-amber-500/50"
                  >
                    {v ? (isZh ? v.title : v.title) : id}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 加载/错误/空状态 */}
        {loading && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-400">
            {isZh ? '正在抓取 YouTube 视频...' : 'Fetching YouTube videos...'}
          </div>
        )}
        {!loading && error && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-400">
            {error}
          </div>
        )}
        {!loading && !error && displayVideos.length === 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-400">
            {isZh ? '暂无视频，点击上方频道标签或搜索开始探索。' : 'No videos yet. Pick a channel or search above.'}
          </div>
        )}

        {/* 视频卡片网格 */}
        {!loading && displayVideos.length > 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {displayVideos.map(video => (
              <article
                key={video.videoId}
                className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 shadow-2xl backdrop-blur-sm transition-colors hover:border-slate-600"
              >
                {playingVideoId === video.videoId ? (
                  /* 站内原地播放 */
                  <div className="relative aspect-video w-full bg-black">
                    <iframe
                      src={`https://www.youtube.com/embed/${video.videoId}?autoplay=1&rel=0`}
                      title={video.title}
                      className="h-full w-full border-0"
                      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                      allowFullScreen
                    />
                    <button
                      onClick={() => setPlayingVideoId(null)}
                      className="absolute right-2 top-2 rounded-lg bg-black/70 p-1.5 text-white hover:bg-black"
                      title={isZh ? '收起' : 'Close'}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  /* 封面缩略图 + 播放按钮 */
                  <button
                    onClick={() => setPlayingVideoId(video.videoId)}
                    className="group relative block aspect-video w-full bg-black"
                  >
                    <img
                      src={thumbnailOf(video.videoId)}
                      alt={video.title}
                      loading="lazy"
                      className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-70"
                      onError={e => {
                        (e.currentTarget as HTMLImageElement).src = `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;
                      }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600/90 shadow-lg transition-transform group-hover:scale-110">
                        <Play className="h-6 w-6 fill-white text-white" />
                      </span>
                    </span>
                    {video.durationSeconds ? (
                      <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                        {formatDuration(video.durationSeconds)}
                      </span>
                    ) : null}
                  </button>
                )}

                {/* 信息区 */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 text-sm font-bold text-white" title={video.title}>
                        {video.title}
                      </h3>
                      <p className="mt-1 truncate text-xs text-slate-400">
                        {video.author}
                        {video.publishedText ? ` · ${video.publishedText}` : ''}
                      </p>
                      {video.views ? (
                        <p className="mt-1 text-[11px] text-slate-500">
                          {isZh ? `${formatViews(video.views)} 次观看` : `${formatViews(video.views)} views`}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => toggleWatchlist(video.videoId)}
                        className={`rounded-lg p-1.5 transition-colors ${
                          watchlist.includes(video.videoId)
                            ? 'text-amber-300 hover:bg-amber-500/10'
                            : 'text-slate-500 hover:bg-white/10 hover:text-white'
                        }`}
                        title={isZh ? '收藏 / 取消收藏' : 'Add / remove from watchlist'}
                      >
                        {watchlist.includes(video.videoId) ? (
                          <BookmarkCheck className="h-4 w-4" />
                        ) : (
                          <Bookmark className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => setCinemaVideo(video)}
                        className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
                        title={isZh ? '全屏影院模式' : 'Cinema mode'}
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

        {/* 外部观影站入口（搜剧AI，新窗口打开） */}
        <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-slate-800/70 pt-6">
          <a
            href="https://souju6.ai/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-purple-600/20 transition-all hover:from-purple-500 hover:to-indigo-500"
          >
            <Tv className="h-3.5 w-3.5" />
            <span>{isZh ? '在线观影站（新窗口打开）' : 'Online Cinema (new tab)'}</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <span className="text-xs text-slate-500">
            {isZh ? '第三方站点 · 内容归原站所有' : 'Third-party site · rights belong to the source'}
          </span>
        </div>
      </main>

      {/* 全屏影院模式 */}
      {cinemaVideo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4">
          <div className="relative w-full max-w-5xl">
            <button
              onClick={() => setCinemaVideo(null)}
              className="absolute -top-10 right-0 rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
              title={isZh ? '关闭影院模式' : 'Close cinema'}
            >
              <X className="h-5 w-5" />
            </button>
            <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
              <iframe
                src={`https://www.youtube.com/embed/${cinemaVideo.videoId}?autoplay=1&rel=0`}
                title={cinemaVideo.title}
                className="h-full w-full border-0"
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
              />
            </div>
            <p className="mt-3 truncate text-sm font-semibold text-white">{cinemaVideo.title}</p>
            <p className="mt-1 text-xs text-slate-400">{cinemaVideo.author}</p>
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
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}
