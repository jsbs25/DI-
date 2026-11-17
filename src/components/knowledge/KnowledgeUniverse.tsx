import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Brain, Landmark, Languages, Library, MapPin, Network, Search, Sparkles, User, X } from 'lucide-react';
import { Language, KnowledgeNode, Book } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';

interface KnowledgeUniverseProps {
  lang: Language;
  onOpenLibrary?: () => void;
  onOpenBook?: (bookId: string) => void;
  focusNodeId?: string | null;
}

interface NodeDetail {
  node: KnowledgeNode;
  related: KnowledgeNode[];
  relatedBooks: Book[];
}

const CATEGORIES: { id: string; label: Record<'zh' | 'en', string>; icon: React.ReactNode }[] = [
  { id: 'all', label: { zh: '全部', en: 'All' }, icon: <Network className="h-3.5 w-3.5" /> },
  { id: 'civilization', label: { zh: '文明', en: 'Civilizations' }, icon: <Landmark className="h-3.5 w-3.5" /> },
  { id: 'person', label: { zh: '人物', en: 'People' }, icon: <User className="h-3.5 w-3.5" /> },
  { id: 'place', label: { zh: '地点', en: 'Places' }, icon: <MapPin className="h-3.5 w-3.5" /> },
  { id: 'language', label: { zh: '语言', en: 'Languages' }, icon: <Languages className="h-3.5 w-3.5" /> },
  { id: 'scientific_concept', label: { zh: '科学概念', en: 'Science' }, icon: <Brain className="h-3.5 w-3.5" /> },
  { id: 'thought', label: { zh: '思想', en: 'Ideas' }, icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: 'book', label: { zh: '文献', en: 'Works' }, icon: <BookOpen className="h-3.5 w-3.5" /> }
];

const typeLabel: Record<string, Record<'zh' | 'en', string>> = {
  civilization: { zh: '文明', en: 'Civilization' },
  historical_period: { zh: '历史时期', en: 'Period' },
  person: { zh: '人物', en: 'Person' },
  place: { zh: '地点', en: 'Place' },
  language: { zh: '语言', en: 'Language' },
  book: { zh: '文献', en: 'Work' },
  scientific_concept: { zh: '科学概念', en: 'Concept' },
  thought: { zh: '思想', en: 'Idea' },
  artwork: { zh: '艺术作品', en: 'Artwork' },
  historical_event: { zh: '历史事件', en: 'Event' }
};

export const KnowledgeUniverse: React.FC<KnowledgeUniverseProps> = ({ lang, onOpenLibrary, onOpenBook, focusNodeId }) => {
  const t = translations[lang] || translations.zh;
  const isZh = lang === 'zh';
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [category, setCategory] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchNodes = async (q: string, cat: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (cat && cat !== 'all') params.set('category', cat);
      const res = await fetch(`/api/knowledge/search?${params.toString()}`);
      const data = await res.json();
      if (data.success) setNodes(data.nodes || []);
      else setError(data.error || t.noResults);
    } catch {
      setError(isZh ? '无法连接到知识服务。' : 'Unable to reach knowledge service.');
    } finally { setIsLoading(false); }
  };

  useEffect(() => { fetchNodes('', 'all'); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchNodes(query, category), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category]);

  const openNode = async (id: string) => {
    setDetail(null); setError(null);
    try {
      const res = await fetch(`/api/knowledge/nodes/${id}`);
      const data = await res.json();
      if (data.success) setDetail(data as NodeDetail);
      else setError(data.error || t.noResults);
    } catch { setError(isZh ? '无法加载该知识节点。' : 'Unable to load this node.'); }
  };

  useEffect(() => { if (focusNodeId) openNode(focusNodeId); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [focusNodeId]);

  const featured = useMemo(() => nodes.slice(0, 12), [nodes]);
  const categoryLabel = (c: string) => (isZh ? CATEGORIES.find(x => x.id === c)?.label.zh : CATEGORIES.find(x => x.id === c)?.label.en) || c;
  const nodeTypeLabel = (c: string) => (isZh ? typeLabel[c]?.zh : typeLabel[c]?.en) || c;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 pb-20 sm:px-6 lg:px-8">
      <header className="mx-auto mb-10 max-w-3xl text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-one-border-strong)] bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-[var(--color-one-text-muted)]">
          <Network className="h-3.5 w-3.5 text-[var(--color-one-accent)]" />
          <span>ONE KNOWLEDGE</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">{t.knowledgeTab}</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-one-text-muted)] sm:text-base">
          {isZh ? '沿着文明、人物、地点、语言与思想之间的真实联系，探索人类知识网络。' : 'Explore the human knowledge network through real connections between civilizations, people, places, languages, and ideas.'}
        </p>

        <div className="mt-6 flex items-center rounded-[22px] border border-[var(--color-one-border)] bg-white/[0.03] px-4 py-3 shadow-[var(--shadow-one-sm)] transition focus-within:border-[rgba(78,161,255,0.45)] focus-within:ring-2 focus-within:ring-[rgba(78,161,255,0.12)]">
          <Search className="h-4 w-4 shrink-0 text-[var(--color-one-text-dim)]" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t.knowledgeSearchPlaceholder}
            className="ml-3 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[var(--color-one-text-dim)]"
          />
          {query && (
            <button onClick={() => setQuery('')} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-one-text-dim)] hover:bg-white/[0.05] hover:text-white">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
              category === c.id
                ? 'border-[rgba(78,161,255,0.35)] bg-[rgba(78,161,255,0.14)] text-white'
                : 'border-[var(--color-one-border)] bg-white/[0.02] text-[var(--color-one-text-muted)] hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.05] hover:text-white'
            }`}
          >
            {c.icon}<span>{categoryLabel(c.id)}</span>
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="py-12 text-center text-sm text-[var(--color-one-text-muted)]">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[var(--color-one-accent)]" />
          {isZh ? '正在探索知识网络…' : 'Exploring knowledge network…'}
        </div>
      )}
      {!isLoading && error && <p className="rounded-2xl border border-red-500/20 bg-red-500/10 py-6 text-center text-sm text-red-200">{error}</p>}
      {!isLoading && !error && nodes.length === 0 && (
        <p className="rounded-[28px] border border-dashed border-[var(--color-one-border-strong)] bg-white/[0.02] py-12 text-center text-sm text-[var(--color-one-text-muted)]">{t.noResults}</p>
      )}

      {!isLoading && nodes.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {featured.map(node => (
            <button
              key={node.id}
              onClick={() => openNode(node.id)}
              className="group cursor-pointer rounded-[24px] border border-[var(--color-one-border)] bg-white/[0.03] p-5 text-left transition hover:-translate-y-0.5 hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.05]"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-one-accent-soft)]">{nodeTypeLabel(node.type)}</span>
                {node.countryCode && <span className="text-[10px] text-[var(--color-one-text-dim)]">{node.countryCode}</span>}
              </div>
              <h3 className="text-base font-semibold text-white transition-colors group-hover:text-[var(--color-one-accent-soft)]">{node.title}</h3>
              {node.titleEn && node.titleEn !== node.title && <p className="mt-0.5 text-xs text-[var(--color-one-text-dim)]">{node.titleEn}</p>}
              <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[var(--color-one-text-muted)]">{node.description}</p>
              <div className="mt-3 flex items-center gap-1 text-[11px] text-[var(--color-one-text-dim)]">
                <span>{node.relatedIds.length} {isZh ? '关联' : 'links'}</span><ArrowRight className="h-3 w-3" />
              </div>
            </button>
          ))}
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-xl sm:p-8">
          <div className="my-8 w-full max-w-2xl overflow-hidden rounded-[28px] border border-[var(--color-one-border-strong)] bg-[color:var(--color-one-bg-elevated)] shadow-[var(--shadow-one-lg)]">
            <div className="border-b border-[var(--color-one-border)] p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-one-accent-soft)]">{nodeTypeLabel(detail.node.type)}</span>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{detail.node.title}</h2>
                  {detail.node.titleEn && detail.node.titleEn !== detail.node.title && <p className="mt-1 text-sm text-[var(--color-one-text-dim)]">{detail.node.titleEn}</p>}
                </div>
                <button onClick={() => setDetail(null)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--color-one-text-muted)] hover:bg-white/[0.05] hover:text-white"><X className="h-5 w-5" /></button>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-[var(--color-one-text-muted)]">{detail.node.description}</p>
              {detail.node.tags && detail.node.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {detail.node.tags.map(tag => (
                    <span key={tag} className="rounded-full border border-[var(--color-one-border)] bg-white/[0.02] px-2.5 py-1 text-[11px] text-[var(--color-one-text-muted)]">{tag}</span>
                  ))}
                </div>
              )}
            </div>

            {detail.related.length > 0 && (
              <div className="border-b border-[var(--color-one-border)] p-6 sm:p-8">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white"><Network className="h-4 w-4 text-[var(--color-one-accent)]" /><span>{t.relatedConnections}</span></h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {detail.related.map(n => (
                    <button key={n.id} onClick={() => openNode(n.id)} className="cursor-pointer rounded-2xl border border-[var(--color-one-border)] bg-white/[0.02] p-3 text-left transition hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.05]">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-one-accent-soft)]">{nodeTypeLabel(n.type)}</span>
                      <h4 className="mt-0.5 text-sm font-semibold text-white">{n.title}</h4>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {detail.relatedBooks.length > 0 && (
              <div className="p-6 sm:p-8">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white"><Library className="h-4 w-4 text-[var(--color-one-accent)]" /><span>{t.relatedBooks}</span></h3>
                <div className="space-y-3">
                  {detail.relatedBooks.map(book => (
                    <div key={book.id} className="flex items-center gap-3 rounded-2xl border border-[var(--color-one-border)] bg-white/[0.02] p-3">
                      {book.coverImage && <img src={book.coverImage} alt={book.title} className="h-14 w-10 shrink-0 rounded-lg object-cover" />}
                      <div className="min-w-0 flex-1">
                        <h4 className="line-clamp-1 text-sm font-semibold text-white">{book.title}</h4>
                        <p className="text-xs text-[var(--color-one-text-muted)]">{book.author}</p>
                      </div>
                      <button onClick={() => onOpenBook?.(book.id)} className="inline-flex min-h-10 shrink-0 cursor-pointer items-center rounded-xl bg-[var(--color-one-accent)] px-3 py-1.5 text-xs font-semibold text-[#071018] transition hover:brightness-110">{t.viewInLibrary}</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {onOpenLibrary && (
              <div className="px-6 pb-8 sm:px-8">
                <button onClick={onOpenLibrary} className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-[var(--color-one-border)] bg-white/[0.02] py-3 text-sm font-medium text-[var(--color-one-text-muted)] transition hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.05] hover:text-white">
                  <BookOpen className="h-4 w-4" /><span>{t.digitalLibrary}</span><ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
