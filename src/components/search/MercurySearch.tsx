import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Search,
  User as UserIcon,
  BookOpen,
  Users2,
  Compass,
  Network,
  PenTool,
  Film,
  Clock,
  Trash2,
  Sparkles
} from 'lucide-react';
import { Language, User, Post, Book, Community, KnowledgeNode, CreatorArticle, VideoItem } from '../../types/index.ts';

interface MercurySearchProps {
  lang: Language;
  onBack: () => void;
  onOpenBook: (bookId: string) => void;
  onOpenKnowledge: (nodeId: string) => void;
  onSelectTab: (tab: string) => void;
}

interface SearchResults {
  users: User[];
  posts: Post[];
  books: Book[];
  communities: Community[];
  knowledge: KnowledgeNode[];
  articles: CreatorArticle[];
  videos: VideoItem[];
}

type Category = 'all' | 'books' | 'knowledge' | 'users' | 'communities' | 'posts' | 'articles' | 'videos';

const CATEGORIES: { key: Category; zh: string; en: string }[] = [
  { key: 'all', zh: '全部', en: 'All' },
  { key: 'books', zh: '书籍', en: 'Books' },
  { key: 'knowledge', zh: '知识', en: 'Knowledge' },
  { key: 'users', zh: '用户', en: 'People' },
  { key: 'communities', zh: '社区', en: 'Communities' },
  { key: 'posts', zh: '动态', en: 'Posts' },
  { key: 'articles', zh: '文章', en: 'Articles' },
  { key: 'videos', zh: '视频', en: 'Videos' }
];

const HISTORY_KEY = 'earth-one.mercury.history.v1';

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export const MercurySearch: React.FC<MercurySearchProps> = ({ lang, onBack, onOpenBook, onOpenKnowledge, onSelectTab }) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [submittedQuery, setSubmittedQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const isZh = lang === 'zh';

  useEffect(() => {
    setHistory(loadHistory());
    inputRef.current?.focus();
  }, []);

  const runSearch = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setSubmittedQuery(trimmed);
    setSearching(true);
    try {
      const res = await fetch(`/api/search/global?q=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (data.success) setResults(data.results);
      else setResults(null);
    } catch {
      setResults(null);
    } finally {
      setSearching(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setHistory(prev => {
      const next = [trimmed, ...prev.filter(h => h !== trimmed)].slice(0, 10);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    runSearch(trimmed);
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      // ignore
    }
  };

  const totalCount = useMemo(() => {
    if (!results) return 0;
    return results.users.length + results.posts.length + results.books.length + results.communities.length + results.knowledge.length + results.articles.length + results.videos.length;
  }, [results]);

  const categoryHasResults = (cat: Exclude<Category, 'all'>): number => {
    if (!results) return 0;
    return results[cat].length;
  };

  return (
    <div className="min-h-screen bg-[#02050f] text-slate-100">
      <header className="border-b border-slate-800/70 px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-4xl">
          <button
            onClick={onBack}
            className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/70 px-4 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{isZh ? '返回宇宙引擎' : 'Back to Universe'}</span>
          </button>

          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{isZh ? '水星生态空间 · 全球搜索' : 'MERCURY · WORLD SEARCH'}</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-5xl">
            {isZh ? '全球搜索' : 'Global Search'}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
            {isZh
              ? '搜索整个 EARTH ONE 中有权限访问的内容：书籍、知识、用户、社区、动态、文章与视频。'
              : 'Search across all EARTH ONE content you can access: books, knowledge, people, communities, posts, articles and videos.'}
          </p>

          {/* Search box */}
          <form onSubmit={onSubmit} className="mt-6">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 focus-within:border-cyan-500/60">
              <Search className="h-5 w-5 shrink-0 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={isZh ? '搜索书籍、知识、用户、社区、动态…' : 'Search books, knowledge, people, communities…'}
                className="flex-1 bg-transparent text-base text-slate-100 outline-none placeholder:text-slate-500"
              />
              <button
                type="submit"
                className="rounded-xl bg-cyan-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-cyan-500"
              >
                {isZh ? '搜索' : 'Search'}
              </button>
            </div>
          </form>

          {/* Category filters */}
          <div className="mt-4 flex flex-wrap gap-2">
            {CATEGORIES.map(c => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  category === c.key
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30'
                    : 'border border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                {isZh ? c.zh : c.en}
                {c.key !== 'all' && categoryHasResults(c.key as Exclude<Category, 'all'>) > 0 && (
                  <span className="ml-1 text-[10px] text-cyan-300">{categoryHasResults(c.key as Exclude<Category, 'all'>)}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
        {/* Search history */}
        {history.length > 0 && !submittedQuery && (
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                <Clock className="h-4 w-4 text-cyan-400" />
                {isZh ? '搜索历史' : 'Search History'}
              </h2>
              <button onClick={clearHistory} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300">
                <Trash2 className="h-3.5 w-3.5" />
                {isZh ? '清除' : 'Clear'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {history.map(h => (
                <button
                  key={h}
                  onClick={() => {
                    setQuery(h);
                    runSearch(h);
                  }}
                  className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-500/50 hover:text-white"
                >
                  {h}
                </button>
              ))}
            </div>
          </section>
        )}

        {searching && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-400">
            {isZh ? '正在全局搜索…' : 'Searching across the universe…'}
          </div>
        )}

        {!searching && submittedQuery && results && totalCount === 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-400">
            {isZh ? `未找到与「${submittedQuery}」相关的内容。` : `No results for "${submittedQuery}".`}
          </div>
        )}

        {!searching && results && totalCount > 0 && (
          <div className="space-y-6">
            {category === 'all' || category === 'knowledge' ? (
              results.knowledge.length > 0 && (
                <Section title={isZh ? '知识' : 'Knowledge'} icon={<Network className="h-4 w-4 text-amber-400" />}>
                  {results.knowledge.map(n => (
                    <Row key={n.id} icon={<Network className="h-4 w-4 text-amber-400" />} title={n.title} subtitle={n.titleEn || n.description} onClick={() => onOpenKnowledge(n.id)} />
                  ))}
                </Section>
              )
            ) : null}

            {category === 'all' || category === 'books' ? (
              results.books.length > 0 && (
                <Section title={isZh ? '书籍' : 'Books'} icon={<BookOpen className="h-4 w-4 text-amber-400" />}>
                  {results.books.map(b => (
                    <Row key={b.id} icon={<BookOpen className="h-4 w-4 text-amber-400" />} title={b.title} subtitle={b.author} onClick={() => onOpenBook(b.id)} />
                  ))}
                </Section>
              )
            ) : null}

            {category === 'all' || category === 'users' ? (
              results.users.length > 0 && (
                <Section title={isZh ? '用户' : 'People'} icon={<UserIcon className="h-4 w-4 text-cyan-400" />}>
                  {results.users.map(u => (
                    <Row key={u.id} icon={<UserIcon className="h-4 w-4 text-cyan-400" />} title={u.displayName} subtitle={u.location?.countryName} onClick={() => onSelectTab('feed')} />
                  ))}
                </Section>
              )
            ) : null}

            {category === 'all' || category === 'communities' ? (
              results.communities.length > 0 && (
                <Section title={isZh ? '社区' : 'Communities'} icon={<Users2 className="h-4 w-4 text-emerald-400" />}>
                  {results.communities.map(c => (
                    <Row key={c.id} icon={<Users2 className="h-4 w-4 text-emerald-400" />} title={c.name} subtitle={c.description} onClick={() => onSelectTab('community')} />
                  ))}
                </Section>
              )
            ) : null}

            {category === 'all' || category === 'posts' ? (
              results.posts.length > 0 && (
                <Section title={isZh ? '动态' : 'Posts'} icon={<Compass className="h-4 w-4 text-blue-400" />}>
                  {results.posts.map(p => (
                    <Row key={p.id} icon={<Compass className="h-4 w-4 text-blue-400" />} title={p.content.slice(0, 80)} subtitle={p.author?.displayName} onClick={() => onSelectTab('feed')} />
                  ))}
                </Section>
              )
            ) : null}

            {category === 'all' || category === 'articles' ? (
              results.articles.length > 0 && (
                <Section title={isZh ? '文章' : 'Articles'} icon={<PenTool className="h-4 w-4 text-fuchsia-400" />}>
                  {results.articles.map(a => (
                    <Row key={a.id} icon={<PenTool className="h-4 w-4 text-fuchsia-400" />} title={a.title} subtitle={a.summary} onClick={() => onSelectTab('creator')} />
                  ))}
                </Section>
              )
            ) : null}

            {category === 'all' || category === 'videos' ? (
              results.videos.length > 0 && (
                <Section title={isZh ? '视频' : 'Videos'} icon={<Film className="h-4 w-4 text-purple-400" />}>
                  {results.videos.map(v => (
                    <Row key={v.id} icon={<Film className="h-4 w-4 text-purple-400" />} title={v.title} subtitle={v.description} onClick={() => onSelectTab('video')} />
                  ))}
                </Section>
              )
            ) : null}
          </div>
        )}

        {!searching && !submittedQuery && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-500">
            {isZh
              ? '输入关键词，搜索整个 EARTH ONE 数字宇宙。'
              : 'Type a query to search the entire EARTH ONE digital universe.'}
          </div>
        )}
      </main>
    </div>
  );
};

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <section>
    <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-200">
      {icon}
      {title}
    </h2>
    <div className="space-y-2">{children}</div>
  </section>
);

const Row: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string; onClick: () => void }> = ({ icon, title, subtitle, onClick }) => (
  <button
    onClick={onClick}
    className="flex w-full items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-left transition-colors hover:border-slate-600 hover:bg-slate-900/70"
  >
    <span className="mt-0.5 shrink-0">{icon}</span>
    <span className="min-w-0">
      <span className="block truncate text-sm font-semibold text-slate-100">{title}</span>
      {subtitle && <span className="mt-0.5 block truncate text-xs text-slate-500">{subtitle}</span>}
    </span>
  </button>
);
