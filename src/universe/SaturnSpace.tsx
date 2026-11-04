import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Film, ExternalLink, Sparkles, Bookmark, BookmarkCheck, Library } from 'lucide-react';
import { Language } from '../types/index.ts';

interface SaturnSpaceProps {
  lang: Language;
  onBack: () => void;
}

type FilmCategory = 'space' | 'public';
type FilmKind = 'youtube' | 'archive';

interface SaturnFilm {
  id: string; // YouTube video id or Internet Archive identifier
  kind: FilmKind;
  title: string;
  titleZh: string;
  source: string;
  year: string;
  category: FilmCategory;
}

// 全部为公版内容：NASA 官方影像 + Internet Archive 公版电影。
// 每一部均经过元数据核实，未接入任何盗版源。
const SATURN_FILMS: SaturnFilm[] = [
  // —— 太空探索 (NASA · 公共领域) ——
  { id: 'xrGAQCq9BMU', kind: 'youtube', title: "NASA at Saturn: Cassini's Grand Finale", titleZh: 'NASA 卡西尼号：土星终章', source: 'NASA Jet Propulsion Laboratory', year: '2017', category: 'space' },
  { id: 'vl6jn-DdafM', kind: 'youtube', title: 'We Are Going — Artemis', titleZh: 'NASA 阿尔忒弥斯：重返月球', source: 'NASA', year: '2022', category: 'space' },

  // —— 公版电影 (Internet Archive · 公共领域) ——
  { id: 'ATripToTheMoonEnglishSubs', kind: 'archive', title: 'A Trip to the Moon', titleZh: '月球旅行记', source: 'Georges Méliès · Internet Archive', year: '1902', category: 'public' },
  { id: 'TheGeneral720p1926', kind: 'archive', title: 'The General', titleZh: '将军号', source: 'Buster Keaton · Internet Archive', year: '1926', category: 'public' },
  { id: 'HisGirlFriday1940', kind: 'archive', title: 'His Girl Friday', titleZh: '女友礼拜五', source: 'Howard Hawks · Internet Archive', year: '1940', category: 'public' },
  { id: 'Plan_9_from_Outer_Space_1959', kind: 'archive', title: 'Plan 9 from Outer Space', titleZh: '外太空九号计划', source: 'Ed Wood · Internet Archive', year: '1959', category: 'public' },
  { id: 'Night_of_the_Living_Dead_1968', kind: 'archive', title: 'Night of the Living Dead', titleZh: '活死人之夜', source: 'George A. Romero · Internet Archive', year: '1968', category: 'public' }
];

const CATEGORIES: { key: FilmCategory | 'all'; zh: string; en: string }[] = [
  { key: 'all', zh: '全部', en: 'All' },
  { key: 'space', zh: '太空探索', en: 'Space' },
  { key: 'public', zh: '公版电影', en: 'Public Domain' }
];

const WATCHLIST_KEY = 'earth-one.saturn.watchlist.v1';

function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export const SaturnSpace: React.FC<SaturnSpaceProps> = ({ lang, onBack }) => {
  const [category, setCategory] = useState<FilmCategory | 'all'>('all');
  const [watchlist, setWatchlist] = useState<string[]>([]);

  useEffect(() => {
    setWatchlist(loadWatchlist());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
    } catch {
      // Storage may be unavailable (private mode); watchlist simply won't persist.
    }
  }, [watchlist]);

  const films = useMemo(
    () => (category === 'all' ? SATURN_FILMS : SATURN_FILMS.filter(f => f.category === category)),
    [category]
  );

  const toggleWatchlist = (id: string) => {
    setWatchlist(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const embedSrc = (film: SaturnFilm) =>
    film.kind === 'youtube' ? `https://www.youtube.com/embed/${film.id}` : `https://archive.org/embed/${film.id}`;

  const isZh = lang === 'zh';

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
            <Sparkles className="h-3.5 w-3.5" />
            <span>{isZh ? '土星生态空间 · 影视宇宙' : 'SATURN · CINEMA UNIVERSE'}</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-5xl">
            {isZh ? '土星观影站' : 'Saturn Cinema'}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
            {isZh
              ? '收录 NASA 深空公版影像与 Internet Archive 公版电影。所有片源均为公共领域或开放许可内容，未接入任何盗版源。'
              : 'Public-domain NASA deep-space footage and Internet Archive classic films. Every title is public domain or openly licensed — no pirated sources.'}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        {/* Category tabs + watchlist count */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/60 p-1">
            {CATEGORIES.map(c => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                  category === c.key
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {isZh ? c.zh : c.en}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Library className="h-4 w-4 text-amber-400" />
            <span>
              {isZh ? '我的片单' : 'Watchlist'} · {watchlist.length}
            </span>
          </div>
        </div>

        {watchlist.length > 0 && (
          <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-amber-200">
              <BookmarkCheck className="h-4 w-4" />
              {isZh ? '我的片单' : 'My Watchlist'}
            </h2>
            <div className="flex flex-wrap gap-2">
              {watchlist.map(id => {
                const f = SATURN_FILMS.find(x => x.id === id);
                if (!f) return null;
                return (
                  <span key={id} className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-slate-200">
                    {isZh ? f.titleZh : f.title}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Film grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {films.map(film => (
            <article key={film.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 shadow-2xl transition-colors hover:border-slate-700">
              <div className="aspect-video w-full bg-black">
                <iframe
                  src={embedSrc(film)}
                  title={film.title}
                  className="h-full w-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-white" title={film.title}>
                      {isZh ? film.titleZh : film.title}
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      {film.source} · {film.year}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {isZh ? '公共领域 / 开放许可' : 'Public domain / open license'}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleWatchlist(film.id)}
                    className={`shrink-0 rounded-lg p-1.5 transition-colors ${
                      watchlist.includes(film.id)
                        ? 'text-amber-300 hover:bg-amber-500/10'
                        : 'text-slate-500 hover:bg-white/10 hover:text-white'
                    }`}
                    title={isZh ? '收藏 / 取消收藏' : 'Add / remove from watchlist'}
                  >
                    {watchlist.includes(film.id) ? (
                      <BookmarkCheck className="h-4 w-4" />
                    ) : (
                      <Bookmark className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        {films.length === 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-400">
            {isZh ? '该分类暂无内容。' : 'No titles in this category yet.'}
          </div>
        )}

        {/* Legitimate external libraries */}
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="https://archive.org/details/feature_films"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-xs font-semibold text-slate-300 transition-colors hover:border-amber-500/50 hover:text-white"
          >
            <Film className="h-3.5 w-3.5" />
            <span>{isZh ? 'Internet Archive 公版电影馆' : 'Internet Archive Feature Films'}</span>
          </a>
          <a
            href="https://www.youtube.com/@NASA"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-xs font-semibold text-slate-300 transition-colors hover:border-amber-500/50 hover:text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>{isZh ? '在 NASA 官方频道观看更多' : 'Watch more on the NASA channel'}</span>
          </a>
        </div>
      </main>
    </div>
  );
};
