import React, { useEffect, useState } from 'react';
import { ArrowLeft, Bookmark, BookmarkCheck, ExternalLink, Film, Search, Sparkles } from 'lucide-react';
import { Language } from '../types/index.ts';
import { parseSaturnVideoResults, SaturnVideo } from './saturnSearch.ts';

interface SaturnSpaceProps {
  lang: Language;
  onBack: () => void;
  onOpenInJupiter: (url: string) => void;
}

const SEARCH_SUGGESTIONS = [
  { zh: '太空探索与天文学', en: 'Space exploration & astronomy', query: 'space exploration astronomy NASA' },
  { zh: '火星任务', en: 'Mars missions', query: 'Mars rover mission NASA' },
  { zh: '科学纪录片', en: 'Science documentaries', query: 'science documentary space' },
  { zh: '地球与气候', en: 'Earth & climate', query: 'Earth climate science documentary' }
];

const WATCHLIST_KEY = 'earth-one.saturn.watchlist.v3';

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password;
  } catch {
    return false;
  }
}

function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return [];
    const values: unknown = JSON.parse(raw);
    return Array.isArray(values)
      ? values.filter((value): value is string => typeof value === 'string' && isHttpUrl(value)).slice(0, 100)
      : [];
  } catch {
    return [];
  }
}

export const SaturnSpace: React.FC<SaturnSpaceProps> = ({ lang, onBack, onOpenInJupiter }) => {
  const isZh = lang === 'zh';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SaturnVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [watchlist, setWatchlist] = useState<string[]>([]);
  useEffect(() => {
    setWatchlist(loadWatchlist());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
    } catch {
      // Local storage can be unavailable in private browsing contexts.
    }
  }, [watchlist]);

  const runSearch = async (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (!trimmed) return;
    if (isHttpUrl(trimmed)) {
      onOpenInJupiter(trimmed);
      return;
    }

    setQuery(trimmed);
    setSearched(true);
    setLoading(true);
    setError('');
    setResults([]);
    try {
      const params = new URLSearchParams({ q: trimmed, type: 'videos', lang });
      const response = await fetch(`/api/jupiter/search?${params.toString()}`);
      const payload: unknown = await response.json();
      if (response.status === 503) {
        throw new Error(isZh
          ? '视频搜索尚未配置。请在服务端设置 SERPER_API_KEY；不会用普通网页结果冒充视频结果。'
          : 'Video search is not configured. Set SERPER_API_KEY on the server; ordinary web results will not be presented as videos.');
      }
      if (!response.ok || !payload || typeof payload !== 'object' || !('success' in payload) || payload.success !== true) {
        const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : isZh ? '视频搜索暂时不可用，请稍后重试。' : 'Video search is temporarily unavailable. Please try again later.';
        throw new Error(message);
      }
      const nextResults = parseSaturnVideoResults(payload);
      setResults(nextResults);
      if (!nextResults.length) {
        setError(isZh ? '真实视频搜索源没有返回匹配结果。' : 'The video search sources returned no matching results.');
      }
    } catch (searchError) {
      setError(searchError instanceof Error
        ? searchError.message
        : isZh ? '视频搜索暂时不可用，请稍后重试。' : 'Video search is temporarily unavailable. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const toggleWatchlist = (url: string) => {
    setWatchlist(previous => previous.includes(url)
      ? previous.filter(item => item !== url)
      : [url, ...previous].slice(0, 100));
  };

  return (
    <div className="min-h-screen bg-[#02050f] text-slate-100">
      <header className="relative overflow-hidden border-b border-slate-800/70 bg-[radial-gradient(ellipse_at_50%_120%,rgba(245,190,110,0.16),transparent_60%),#02050f] px-4 py-10 sm:px-8">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-700 bg-slate-900/70 px-4 py-2 text-xs font-semibold text-slate-300 transition-colors hover:border-amber-500/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{isZh ? '返回太阳系' : 'Back to Solar System'}</span>
        </button>

        <div className="mx-auto max-w-6xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{isZh ? '土星生态空间 · 影视探索' : 'SATURN · VIDEO DISCOVERY'}</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-5xl">
            {isZh ? '土星影视探索' : 'Saturn Video Discovery'}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
            {isZh
              ? '使用 JUPITER 的真实视频搜索发现全网公开内容，再在 JUPITER 内打开来源。媒体由原始网站提供；本页面不抓取、复制或重新托管视频。'
              : 'Discover public videos through JUPITER’s real video search and open their sources inside JUPITER. Media stays with its original publisher; this page does not crawl, copy, or rehost videos.'}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <form
          onSubmit={event => {
            event.preventDefault();
            void runSearch(query);
          }}
          className="mb-5"
        >
          <label htmlFor="saturn-video-search" className="sr-only">
            {isZh ? '搜索公开视频' : 'Search public videos'}
          </label>
          <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 focus-within:border-amber-500/60">
            <Search className="h-5 w-5 shrink-0 text-slate-400" />
            <input
              id="saturn-video-search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={isZh ? '搜索视频，或粘贴公开媒体链接…' : 'Search videos or paste a public media URL…'}
              className="min-h-10 flex-1 bg-transparent text-base text-slate-100 outline-none placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="min-h-10 rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
            >
              {loading ? (isZh ? '搜索中…' : 'Searching…') : isZh ? '搜索' : 'Search'}
            </button>
          </div>
        </form>

        <nav aria-label={isZh ? '视频搜索建议' : 'Video search suggestions'} className="mb-6 flex flex-wrap gap-2">
          {SEARCH_SUGGESTIONS.map(suggestion => (
            <button
              key={suggestion.query}
              type="button"
              onClick={() => {
                setQuery(suggestion.query);
                void runSearch(suggestion.query);
              }}
              className="min-h-9 rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-amber-500/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
            >
              {isZh ? suggestion.zh : suggestion.en}
            </button>
          ))}
        </nav>

        {watchlist.length > 0 && (
          <section aria-label={isZh ? '已收藏的来源' : 'Saved sources'} className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-amber-200">
              <BookmarkCheck className="h-4 w-4" />
              {isZh ? '已收藏的来源' : 'Saved sources'} · {watchlist.length}
            </h2>
            <div className="flex flex-wrap gap-2">
              {watchlist.map(url => (
                <button
                  key={url}
                  type="button"
                  onClick={() => onOpenInJupiter(url)}
                  className="max-w-full truncate rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-200 hover:border-amber-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
                >
                  {new URL(url).hostname}
                </button>
              ))}
            </div>
          </section>
        )}

        <div aria-live="polite" aria-busy={loading}>
          {loading && (
            <div role="status" className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-400">
              {isZh ? '正在查询真实视频搜索源…' : 'Searching real video sources…'}
            </div>
          )}
          {!loading && error && (
            <div role="status" className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm leading-6 text-slate-300">
              {error}
            </div>
          )}
          {!loading && !error && !searched && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm leading-6 text-slate-400">
              {isZh ? '选择主题或输入关键词，开始探索真实公开的视频来源。' : 'Choose a topic or enter a query to explore real public video sources.'}
            </div>
          )}
          {!loading && !error && results.length > 0 && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {results.map(video => (
                <article key={video.url} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 transition-colors hover:border-slate-600">
                  <button
                    type="button"
                    onClick={() => onOpenInJupiter(video.url)}
                    className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-300/70"
                  >
                    {video.thumbnailUrl ? (
                      <img src={video.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-video w-full bg-black object-cover" />
                    ) : (
                      <span className="flex aspect-video w-full items-center justify-center bg-black/50 text-amber-200/70">
                        <Film className="h-10 w-10" aria-hidden="true" />
                      </span>
                    )}
                    <span className="block p-4">
                      <span className="block line-clamp-2 text-sm font-bold text-white">{video.title}</span>
                      <span className="mt-2 block truncate text-xs text-slate-400">{video.domain}</span>
                      {video.snippet && <span className="mt-2 block line-clamp-2 text-xs leading-5 text-slate-500">{video.snippet}</span>}
                      {video.date && <span className="mt-2 block text-[11px] text-slate-500">{video.date}</span>}
                      <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-amber-200">
                        {isZh ? '在 JUPITER 中打开来源' : 'Open source in JUPITER'}
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                    </span>
                  </button>
                  <div className="border-t border-slate-800 px-4 py-2">
                    <button
                      type="button"
                      onClick={() => toggleWatchlist(video.url)}
                      aria-pressed={watchlist.includes(video.url)}
                      className="inline-flex min-h-9 items-center gap-2 text-xs text-slate-400 transition-colors hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
                    >
                      {watchlist.includes(video.url) ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                      {isZh ? (watchlist.includes(video.url) ? '已收藏' : '收藏来源') : (watchlist.includes(video.url) ? 'Saved' : 'Save source')}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
