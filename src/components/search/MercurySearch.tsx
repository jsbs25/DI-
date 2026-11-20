import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Clock,
  Compass,
  Film,
  Loader2,
  Network,
  PenTool,
  Search,
  Sparkles,
  Trash2,
  User as UserIcon,
  Users2,
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
  { key: 'videos', zh: '视频', en: 'Videos' },
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

export const MercurySearch: React.FC<MercurySearchProps> = ({
  lang,
  onBack,
  onOpenBook,
  onOpenKnowledge,
  onSelectTab,
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [submittedQuery, setSubmittedQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const searchSeqRef = useRef(0);
  const isZh = lang === 'zh';

  useEffect(() => {
    setHistory(loadHistory());
    inputRef.current?.focus();
  }, []);

  const runSearch = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    const seq = ++searchSeqRef.current;
    setSubmittedQuery(trimmed);
    setSearching(true);
    setAiLoading(true);
    setAiAnswer('');

    // Run global content search and fast Unified ONE AI answer in parallel
    const globalPromise = fetch(`/api/search/global?q=${encodeURIComponent(trimmed)}`)
      .then((r) => r.json())
      .then((data) => {
        if (seq !== searchSeqRef.current) return null;
        if (data?.success) {
          setResults(data.results);
          return data.results as SearchResults;
        }
        setResults(null);
        return null;
      })
      .catch(() => {
        if (seq === searchSeqRef.current) setResults(null);
        return null;
      })
      .finally(() => {
        if (seq === searchSeqRef.current) setSearching(false);
      });

    void globalPromise.then(async (found) => {
      if (seq !== searchSeqRef.current) return;
      const snippets: string[] = [];
      if (found) {
        for (const b of found.books.slice(0, 3)) snippets.push(`书籍《${b.title}》(${b.author || ''}): ${b.description?.slice(0, 120) || ''}`);
        for (const k of found.knowledge.slice(0, 3)) snippets.push(`知识节点《${k.title}》: ${k.description?.slice(0, 120) || ''}`);
        for (const a of found.articles.slice(0, 2)) snippets.push(`文章《${a.title}》: ${a.summary?.slice(0, 100) || ''}`);
      }
      try {
        const res = await fetch('/api/search/ai-answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: trimmed,
            snippets,
            lang: isZh ? 'zh' : 'en',
          }),
        });
        const data = await res.json();
        if (seq === searchSeqRef.current && data?.success && data.answer) {
          setAiAnswer(data.answer);
        }
      } catch {
        // Silent fallback: global results still show cleanly
      } finally {
        if (seq === searchSeqRef.current) setAiLoading(false);
      }
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setHistory((prev) => {
      const next = [trimmed, ...prev.filter((h) => h !== trimmed)].slice(0, 10);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    void runSearch(trimmed);
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {}
  };

  const totalCount = useMemo(() => {
    if (!results) return 0;
    return (
      results.users.length +
      results.posts.length +
      results.books.length +
      results.communities.length +
      results.knowledge.length +
      results.articles.length +
      results.videos.length
    );
  }, [results]);

  const categoryHasResults = (cat: Exclude<Category, 'all'>): number => {
    if (!results) return 0;
    return results[cat].length;
  };

  return (
    <div className="min-h-screen bg-[var(--color-one-bg)] text-[var(--color-one-text)]">
      <header className="border-b border-[var(--color-one-border)] bg-[var(--color-one-surface)]/85 px-4 py-6 backdrop-blur-xl sm:px-8">
        <div className="mx-auto max-w-4xl">
          <button
            type="button"
            onClick={onBack}
            className="mb-5 inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] px-3.5 py-2 text-xs font-medium text-[var(--color-one-text-muted)] transition hover:border-[var(--color-one-border-strong)] hover:text-[var(--color-one-text)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{isZh ? '返回' : 'Back'}</span>
          </button>

          <p className="text-[11px] font-medium tracking-[0.18em] uppercase text-[var(--color-one-accent)]">
            ONE SEARCH
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[var(--color-one-text)] sm:text-4xl">
            {isZh ? '全局搜索与 AI 直答' : 'Global Search & ONE AI'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-one-text-muted)]">
            {isZh
              ? '统一 ONE AI 核心即时解析问题，同时检索书籍、知识、用户、社区与创作内容。'
              : 'Instant synthesis from the unified ONE AI core alongside books, knowledge, people, and communities.'}
          </p>

          <form onSubmit={onSubmit} className="mt-6">
            <div className="flex flex-col gap-2 rounded-2xl border border-[var(--color-one-border-strong)] bg-[var(--color-one-bg)] p-2 shadow-xs sm:flex-row sm:items-center sm:px-3.5 sm:py-2">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Search className="h-4.5 w-4.5 shrink-0 text-[var(--color-one-text-dim)]" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={isZh ? '输入问题、书名、作者或关键词…' : 'Ask a question or search books, knowledge, people…'}
                  className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-[var(--color-one-text)] outline-none placeholder:text-[var(--color-one-text-dim)]"
                />
              </div>
              <button
                type="submit"
                className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl bg-[var(--color-one-accent)] px-5 py-2 text-xs font-semibold text-white transition hover:opacity-90"
              >
                {isZh ? '搜索' : 'Search'}
              </button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--color-one-border)] pt-3">
            {CATEGORIES.map((c) => {
              const active = category === c.key;
              const count = c.key !== 'all' ? categoryHasResults(c.key as Exclude<Category, 'all'>) : 0;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={`inline-flex cursor-pointer items-center gap-1.5 border-b-2 pb-1 text-xs font-medium transition ${
                    active
                      ? 'border-[var(--color-one-accent)] text-[var(--color-one-text)]'
                      : 'border-transparent text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)]'
                  }`}
                >
                  <span>{isZh ? c.zh : c.en}</span>
                  {count > 0 && <span className="font-mono text-[10px] text-[var(--color-one-accent)]">{count}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-8 space-y-6">
        {history.length > 0 && !submittedQuery && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-one-text-muted)]">
                <Clock className="h-3.5 w-3.5 text-[var(--color-one-accent)]" />
                {isZh ? '最近搜索' : 'Recent Searches'}
              </h2>
              <button
                type="button"
                onClick={clearHistory}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--color-one-text-dim)] hover:text-[var(--color-one-text)]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isZh ? '清除' : 'Clear'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {history.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => {
                    setQuery(h);
                    void runSearch(h);
                  }}
                  className="cursor-pointer rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] px-3.5 py-2 text-xs text-[var(--color-one-text-muted)] transition hover:border-[var(--color-one-border-strong)] hover:text-[var(--color-one-text)]"
                >
                  {h}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Unified ONE AI Instant Answer Card */}
        {submittedQuery && (aiLoading || aiAnswer) && (
          <section className="rounded-[24px] border border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)] p-5 shadow-xs sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-one-accent)]">
                <Sparkles className="h-4 w-4" />
                <span>{isZh ? 'ONE AI 检索综述' : 'ONE AI Synthesis'}</span>
              </div>
              <span className="text-[11px] text-[var(--color-one-text-dim)]">{submittedQuery}</span>
            </div>
            {aiLoading ? (
              <div className="flex items-center gap-2.5 py-2 text-xs text-[var(--color-one-text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--color-one-accent)]" />
                <span>{isZh ? 'ONE AI 正在快速检索与整理要点…' : 'ONE AI is synthesizing an answer…'}</span>
              </div>
            ) : (
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-one-text)]">
                {aiAnswer}
              </div>
            )}
          </section>
        )}

        {searching && (
          <div className="rounded-[24px] border border-[var(--color-one-border)] bg-[var(--color-one-surface)] p-10 text-center text-xs text-[var(--color-one-text-muted)]">
            <Loader2 className="mx-auto mb-2.5 h-6 w-6 animate-spin text-[var(--color-one-accent)]" />
            {isZh ? '正在检索馆藏与站内内容…' : 'Searching across ONE…'}
          </div>
        )}

        {!searching && submittedQuery && results && totalCount === 0 && !aiAnswer && (
          <div className="rounded-[24px] border border-dashed border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)] p-10 text-center text-sm text-[var(--color-one-text-muted)]">
            {isZh ? `未找到与「${submittedQuery}」相关的站内内容。` : `No matching items for "${submittedQuery}".`}
          </div>
        )}

        {!searching && results && totalCount > 0 && (
          <div className="space-y-5">
            {(category === 'all' || category === 'books') && results.books.length > 0 && (
              <Section title={isZh ? '世界图书馆书籍' : 'Books'} icon={<BookOpen className="h-4 w-4 text-[var(--color-one-accent)]" />}>
                {results.books.map((b) => (
                  <Row
                    key={b.id}
                    icon={<BookOpen className="h-4 w-4 text-[var(--color-one-accent)]" />}
                    title={b.title}
                    subtitle={b.author}
                    onClick={() => onOpenBook(b.id)}
                  />
                ))}
              </Section>
            )}
            {(category === 'all' || category === 'knowledge') && results.knowledge.length > 0 && (
              <Section title={isZh ? '知识图谱' : 'Knowledge'} icon={<Network className="h-4 w-4 text-[var(--color-one-accent-gold)]" />}>
                {results.knowledge.map((n) => (
                  <Row
                    key={n.id}
                    icon={<Network className="h-4 w-4 text-[var(--color-one-accent-gold)]" />}
                    title={n.title}
                    subtitle={n.titleEn || n.description}
                    onClick={() => onOpenKnowledge(n.id)}
                  />
                ))}
              </Section>
            )}
            {(category === 'all' || category === 'users') && results.users.length > 0 && (
              <Section title={isZh ? '用户' : 'People'} icon={<UserIcon className="h-4 w-4 text-[var(--color-one-accent)]" />}>
                {results.users.map((u) => (
                  <Row
                    key={u.id}
                    icon={<UserIcon className="h-4 w-4 text-[var(--color-one-accent)]" />}
                    title={u.displayName}
                    subtitle={u.location?.countryName}
                    onClick={() => onSelectTab('feed')}
                  />
                ))}
              </Section>
            )}
            {(category === 'all' || category === 'communities') && results.communities.length > 0 && (
              <Section title={isZh ? '社区' : 'Communities'} icon={<Users2 className="h-4 w-4 text-[var(--color-one-accent)]" />}>
                {results.communities.map((c) => (
                  <Row
                    key={c.id}
                    icon={<Users2 className="h-4 w-4 text-[var(--color-one-accent)]" />}
                    title={c.name}
                    subtitle={c.description}
                    onClick={() => onSelectTab('community')}
                  />
                ))}
              </Section>
            )}
            {(category === 'all' || category === 'posts') && results.posts.length > 0 && (
              <Section title={isZh ? '动态' : 'Posts'} icon={<Compass className="h-4 w-4 text-[var(--color-one-accent)]" />}>
                {results.posts.map((p) => (
                  <Row
                    key={p.id}
                    icon={<Compass className="h-4 w-4 text-[var(--color-one-accent)]" />}
                    title={p.content.slice(0, 80)}
                    subtitle={p.author?.displayName}
                    onClick={() => onSelectTab('feed')}
                  />
                ))}
              </Section>
            )}
            {(category === 'all' || category === 'articles') && results.articles.length > 0 && (
              <Section title={isZh ? '文章' : 'Articles'} icon={<PenTool className="h-4 w-4 text-[var(--color-one-accent)]" />}>
                {results.articles.map((a) => (
                  <Row
                    key={a.id}
                    icon={<PenTool className="h-4 w-4 text-[var(--color-one-accent)]" />}
                    title={a.title}
                    subtitle={a.summary}
                    onClick={() => onSelectTab('creator')}
                  />
                ))}
              </Section>
            )}
            {(category === 'all' || category === 'videos') && results.videos.length > 0 && (
              <Section title={isZh ? '视频' : 'Videos'} icon={<Film className="h-4 w-4 text-[var(--color-one-accent)]" />}>
                {results.videos.map((v) => (
                  <Row
                    key={v.id}
                    icon={<Film className="h-4 w-4 text-[var(--color-one-accent)]" />}
                    title={v.title}
                    subtitle={v.description}
                    onClick={() => onSelectTab('video')}
                  />
                ))}
              </Section>
            )}
          </div>
        )}

        {!searching && !submittedQuery && (
          <div className="rounded-[24px] border border-[var(--color-one-border)] bg-[var(--color-one-surface)] p-10 text-center text-sm text-[var(--color-one-text-muted)]">
            {isZh ? '输入关键词或问题，由统一 ONE AI 实时解答并同步检索站内馆藏。' : 'Type a question or keyword for unified ONE AI synthesis and instant catalog search.'}
          </div>
        )}
      </main>
    </div>
  );
};

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <section className="rounded-[24px] border border-[var(--color-one-border)] bg-[var(--color-one-surface)] p-4 shadow-xs sm:p-5">
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-one-text)]">
      {icon}
      {title}
    </h2>
    <div className="space-y-2">{children}</div>
  </section>
);

const Row: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string; onClick: () => void }> = ({
  icon,
  title,
  subtitle,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)] px-4 py-3 text-left transition hover:border-[var(--color-one-border-strong)] hover:bg-[var(--color-one-bg)]"
  >
    <span className="mt-0.5 shrink-0">{icon}</span>
    <span className="min-w-0">
      <span className="block truncate text-sm font-medium text-[var(--color-one-text)]">{title}</span>
      {subtitle && <span className="mt-0.5 block truncate text-xs text-[var(--color-one-text-muted)]">{subtitle}</span>}
    </span>
  </button>
);
