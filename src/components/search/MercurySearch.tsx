import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Clock, Compass, Film, Network, PenTool, Search, Sparkles, Trash2, User as UserIcon, Users2 } from 'lucide-react';
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
  } catch { return []; }
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
    } catch { setResults(null); } finally { setSearching(false); }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setHistory(prev => {
      const next = [trimmed, ...prev.filter(h => h !== trimmed)].slice(0, 10);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    runSearch(trimmed);
  };

  const clearHistory = () => {
    setHistory([]);
    try { localStorage.removeItem(HISTORY_KEY); } catch {}
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
    <div className="min-h-screen bg-[var(--color-one-bg)] text-[var(--color-one-text)]">
      <header className="border-b border-[var(--color-one-border)] bg-[color:var(--color-one-bg-elevated)]/70 px-4 py-6 backdrop-blur-xl sm:px-8">
        <div className="mx-auto max-w-4xl">
          <button onClick={onBack} className="mb-5 inline-flex min-h-11 items-center gap-1.5 rounded-2xl border border-[var(--color-one-border)] bg-white/[0.02] px-4 py-2 text-xs font-medium text-[var(--color-one-text-muted)] transition hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.05] hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{isZh ? '返回宇宙引擎' : 'Back to Universe'}</span>
          </button>

          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-one-border-strong)] bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-[var(--color-one-text-muted)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--color-one-accent)]" />
            <span>{isZh ? 'ONE SEARCH · 全局检索' : 'ONE SEARCH · Global Search'}</span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-5xl">{isZh ? '全局搜索' : 'Global Search'}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--color-one-text-muted)]">
            {isZh ? '检索 ONE 中你有权限访问的真实内容：书籍、知识、用户、社区、动态、文章与视频。' : 'Search real ONE content you can access: books, knowledge, people, communities, posts, articles and videos.'}
          </p>

          <form onSubmit={onSubmit} className="mt-6">
            <div className="flex flex-col gap-2 rounded-[28px] border border-[var(--color-one-border)] bg-white/[0.03] p-3 shadow-[var(--shadow-one-sm)] sm:flex-row sm:items-center sm:px-4 sm:py-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Search className="h-5 w-5 shrink-0 text-[var(--color-one-text-dim)]" />
                <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder={isZh ? '搜索书籍、知识、用户、社区、动态…' : 'Search books, knowledge, people, communities…'} className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-[var(--color-one-text-dim)]" />
              </div>
              <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--color-one-accent)] px-5 py-2.5 text-sm font-semibold text-[#071018] transition hover:brightness-110">{isZh ? '搜索' : 'Search'}</button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            {CATEGORIES.map(c => (
              <button key={c.key} onClick={() => setCategory(c.key)} className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${category === c.key ? 'border border-[rgba(78,161,255,0.35)] bg-[rgba(78,161,255,0.14)] text-white' : 'border border-[var(--color-one-border)] bg-white/[0.02] text-[var(--color-one-text-muted)] hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.05] hover:text-white'}`}>
                {isZh ? c.zh : c.en}
                {c.key !== 'all' && categoryHasResults(c.key as Exclude<Category, 'all'>) > 0 && <span className="text-[10px] text-[var(--color-one-accent-soft)]">{categoryHasResults(c.key as Exclude<Category, 'all'>)}</span>}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
        {history.length > 0 && !submittedQuery && (
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Clock className="h-4 w-4 text-[var(--color-one-accent)]" />{isZh ? '搜索历史' : 'Search History'}</h2>
              <button onClick={clearHistory} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs text-[var(--color-one-text-dim)] hover:bg-white/[0.04] hover:text-[var(--color-one-text-muted)]"><Trash2 className="h-3.5 w-3.5" />{isZh ? '清除' : 'Clear'}</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {history.map(h => (
                <button key={h} onClick={() => { setQuery(h); runSearch(h); }} className="min-h-10 rounded-full border border-[var(--color-one-border)] bg-white/[0.02] px-3.5 py-1.5 text-xs text-[var(--color-one-text-muted)] transition hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.05] hover:text-white">{h}</button>
              ))}
            </div>
          </section>
        )}

        {searching && (
          <div className="rounded-[28px] border border-[var(--color-one-border)] bg-white/[0.03] p-10 text-center text-sm text-[var(--color-one-text-muted)]">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[var(--color-one-accent)]" />
            {isZh ? '正在全局搜索…' : 'Searching across ONE…'}
          </div>
        )}

        {!searching && submittedQuery && results && totalCount === 0 && (
          <div className="rounded-[28px] border border-dashed border-[var(--color-one-border-strong)] bg-white/[0.02] p-10 text-center text-sm text-[var(--color-one-text-muted)]">
            {isZh ? `未找到与「${submittedQuery}」相关的可访问内容。` : `No accessible results for "${submittedQuery}".`}
          </div>
        )}

        {!searching && results && totalCount > 0 && (
          <div className="space-y-6">
            {(category === 'all' || category === 'knowledge') && results.knowledge.length > 0 && (
              <Section title={isZh ? '知识' : 'Knowledge'} icon={<Network className="h-4 w-4 text-amber-300" />}>
                {results.knowledge.map(n => <Row key={n.id} icon={<Network className="h-4 w-4 text-amber-300" />} title={n.title} subtitle={n.titleEn || n.description} onClick={() => onOpenKnowledge(n.id)} />)}
              </Section>
            )}
            {(category === 'all' || category === 'books') && results.books.length > 0 && (
              <Section title={isZh ? '书籍' : 'Books'} icon={<BookOpen className="h-4 w-4 text-sky-300" />}>
                {results.books.map(b => <Row key={b.id} icon={<BookOpen className="h-4 w-4 text-sky-300" />} title={b.title} subtitle={b.author} onClick={() => onOpenBook(b.id)} />)}
              </Section>
            )}
            {(category === 'all' || category === 'users') && results.users.length > 0 && (
              <Section title={isZh ? '用户' : 'People'} icon={<UserIcon className="h-4 w-4 text-cyan-300" />}>
                {results.users.map(u => <Row key={u.id} icon={<UserIcon className="h-4 w-4 text-cyan-300" />} title={u.displayName} subtitle={u.location?.countryName} onClick={() => onSelectTab('feed')} />)}
              </Section>
            )}
            {(category === 'all' || category === 'communities') && results.communities.length > 0 && (
              <Section title={isZh ? '社区' : 'Communities'} icon={<Users2 className="h-4 w-4 text-emerald-300" />}>
                {results.communities.map(c => <Row key={c.id} icon={<Users2 className="h-4 w-4 text-emerald-300" />} title={c.name} subtitle={c.description} onClick={() => onSelectTab('community')} />)}
              </Section>
            )}
            {(category === 'all' || category === 'posts') && results.posts.length > 0 && (
              <Section title={isZh ? '动态' : 'Posts'} icon={<Compass className="h-4 w-4 text-blue-300" />}>
                {results.posts.map(p => <Row key={p.id} icon={<Compass className="h-4 w-4 text-blue-300" />} title={p.content.slice(0, 80)} subtitle={p.author?.displayName} onClick={() => onSelectTab('feed')} />)}
              </Section>
            )}
            {(category === 'all' || category === 'articles') && results.articles.length > 0 && (
              <Section title={isZh ? '文章' : 'Articles'} icon={<PenTool className="h-4 w-4 text-fuchsia-300" />}>
                {results.articles.map(a => <Row key={a.id} icon={<PenTool className="h-4 w-4 text-fuchsia-300" />} title={a.title} subtitle={a.summary} onClick={() => onSelectTab('creator')} />)}
              </Section>
            )}
            {(category === 'all' || category === 'videos') && results.videos.length > 0 && (
              <Section title={isZh ? '视频' : 'Videos'} icon={<Film className="h-4 w-4 text-violet-300" />}>
                {results.videos.map(v => <Row key={v.id} icon={<Film className="h-4 w-4 text-violet-300" />} title={v.title} subtitle={v.description} onClick={() => onSelectTab('video')} />)}
              </Section>
            )}
          </div>
        )}

        {!searching && !submittedQuery && (
          <div className="rounded-[28px] border border-[var(--color-one-border)] bg-white/[0.02] p-10 text-center text-sm text-[var(--color-one-text-muted)]">
            {isZh ? '输入关键词，搜索整个 ONE 数字空间中可访问的真实内容。' : 'Type a query to search accessible real content across ONE.'}
          </div>
        )}
      </main>
    </div>
  );
};

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <section className="rounded-[28px] border border-[var(--color-one-border)] bg-white/[0.03] p-4 sm:p-5">
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">{icon}{title}</h2>
    <div className="space-y-2">{children}</div>
  </section>
);

const Row: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string; onClick: () => void }> = ({ icon, title, subtitle, onClick }) => (
  <button onClick={onClick} className="flex w-full items-start gap-3 rounded-2xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.45)] px-4 py-3 text-left transition hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.05]">
    <span className="mt-0.5 shrink-0">{icon}</span>
    <span className="min-w-0">
      <span className="block truncate text-sm font-medium text-white">{title}</span>
      {subtitle && <span className="mt-0.5 block truncate text-xs text-[var(--color-one-text-muted)]">{subtitle}</span>}
    </span>
  </button>
);
