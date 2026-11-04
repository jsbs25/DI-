import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  BookOpen,
  Sparkles,
  Network,
  MapPin,
  X,
  ArrowRight,
  Languages,
  Landmark,
  Brain,
  User,
  Library
} from 'lucide-react';
import { Language, KnowledgeNode, Book } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';

interface KnowledgeUniverseProps {
  lang: Language;
  onOpenLibrary?: () => void;
  onOpenBook?: (bookId: string) => void;
  /** When set, auto-opens a specific node's detail (cross-module navigation). */
  focusNodeId?: string | null;
}

interface NodeDetail {
  node: KnowledgeNode;
  related: KnowledgeNode[];
  relatedBooks: Book[];
}

const CATEGORIES: { id: string; label: Record<'zh' | 'en', string>; icon: React.ReactNode }[] = [
  { id: 'all', label: { zh: '全部', en: 'All' }, icon: <Network className="w-3.5 h-3.5" /> },
  { id: 'civilization', label: { zh: '文明', en: 'Civilizations' }, icon: <Landmark className="w-3.5 h-3.5" /> },
  { id: 'person', label: { zh: '人物', en: 'People' }, icon: <User className="w-3.5 h-3.5" /> },
  { id: 'place', label: { zh: '地点', en: 'Places' }, icon: <MapPin className="w-3.5 h-3.5" /> },
  { id: 'language', label: { zh: '语言', en: 'Languages' }, icon: <Languages className="w-3.5 h-3.5" /> },
  { id: 'scientific_concept', label: { zh: '科学概念', en: 'Science' }, icon: <Brain className="w-3.5 h-3.5" /> },
  { id: 'thought', label: { zh: '思想', en: 'Ideas' }, icon: <Sparkles className="w-3.5 h-3.5" /> },
  { id: 'book', label: { zh: '文献', en: 'Works' }, icon: <BookOpen className="w-3.5 h-3.5" /> }
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
      setError('无法连接到知识宇宙服务。');
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchNodes('', 'all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => fetchNodes(query, category), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category]);

  const openNode = async (id: string) => {
    setDetail(null);
    setError(null);
    try {
      const res = await fetch(`/api/knowledge/nodes/${id}`);
      const data = await res.json();
      if (data.success) setDetail(data as NodeDetail);
      else setError(data.error || t.noResults);
    } catch {
      setError('无法加载该知识节点。');
    }
  };

  // Cross-module navigation: open a node passed from global search or elsewhere
  useEffect(() => {
    if (focusNodeId) openNode(focusNodeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNodeId]);

  const featured = useMemo(() => nodes.slice(0, 12), [nodes]);

  const categoryLabel = (c: string) => {
    if (isZh) return CATEGORIES.find(x => x.id === c)?.label.zh || c;
    return CATEGORIES.find(x => x.id === c)?.label.en || c;
  };

  const nodeTypeLabel = (c: string) => (isZh ? typeLabel[c]?.zh : typeLabel[c]?.en) || c;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20">
      {/* Hero */}
      <header className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-950/50 border border-amber-600/40 text-amber-300 text-[11px] font-semibold mb-4">
          <Network className="w-3.5 h-3.5" />
          <span>KNOWLEDGE UNIVERSE</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight text-white">
          {t.knowledgeTab}
        </h1>
        <p className="text-slate-400 mt-3 text-sm sm:text-base leading-relaxed">
          {isZh
            ? '沿着文明、人物、地点、语言与思想之间的真实联系，探索人类知识的网络。'
            : 'Explore the network of human knowledge through the real connections between civilizations, people, places, languages and ideas.'}
        </p>

        {/* Search */}
        <div className="mt-6 flex items-center bg-slate-900/70 border border-slate-700/60 rounded-2xl px-4 py-3 focus-within:border-amber-500/60 transition-colors">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t.knowledgeSearchPlaceholder}
            className="flex-1 bg-transparent outline-none text-sm text-slate-100 placeholder:text-slate-500 ml-3"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-slate-500 hover:text-slate-300 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Category chips */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer ${
              category === c.id
                ? 'bg-amber-600 text-white border-amber-500'
                : 'bg-slate-900/50 border-slate-700/60 text-slate-300 hover:border-slate-500'
            }`}
          >
            {c.icon}
            <span>{categoryLabel(c.id)}</span>
          </button>
        ))}
      </div>

      {/* Error / loading */}
      {isLoading && <p className="text-center text-sm text-slate-500 py-10">正在探索知识宇宙...</p>}
      {!isLoading && error && <p className="text-center text-sm text-red-400 py-10">{error}</p>}
      {!isLoading && !error && nodes.length === 0 && (
        <p className="text-center text-sm text-slate-500 py-10">{t.noResults}</p>
      )}

      {/* Node grid */}
      {!isLoading && nodes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {featured.map(node => (
            <button
              key={node.id}
              onClick={() => openNode(node.id)}
              className="group text-left p-5 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-900 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-400">
                  {nodeTypeLabel(node.type)}
                </span>
                {node.countryCode && (
                  <span className="text-[10px] text-slate-500">{node.countryCode}</span>
                )}
              </div>
              <h3 className="text-base font-serif font-bold text-white group-hover:text-amber-300 transition-colors">
                {node.title}
              </h3>
              {node.titleEn && node.titleEn !== node.title && (
                <p className="text-xs text-slate-500 mt-0.5">{node.titleEn}</p>
              )}
              <p className="text-xs text-slate-400 mt-2 line-clamp-3 leading-relaxed">{node.description}</p>
              <div className="mt-3 flex items-center space-x-1 text-[11px] text-slate-500">
                <span>{node.relatedIds.length} 关联</span>
                <ArrowRight className="w-3 h-3" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Node detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-[#030712]/95 backdrop-blur-xl flex items-start justify-center overflow-y-auto p-4 sm:p-8 animate-in fade-in duration-150">
          <div className="w-full max-w-2xl my-8 rounded-3xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-6 sm:p-8 border-b border-slate-800/80">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-amber-400">
                    {nodeTypeLabel(detail.node.type)}
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-serif font-bold text-white mt-1">{detail.node.title}</h2>
                  {detail.node.titleEn && detail.node.titleEn !== detail.node.title && (
                    <p className="text-sm text-slate-500 mt-1">{detail.node.titleEn}</p>
                  )}
                </div>
                <button onClick={() => setDetail(null)} className="text-slate-500 hover:text-white cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed mt-4">{detail.node.description}</p>
              {detail.node.tags && detail.node.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {detail.node.tags.map(tag => (
                    <span key={tag} className="px-2.5 py-1 rounded-full bg-slate-900 text-[11px] text-slate-400 border border-slate-800">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Related connections */}
            {detail.related.length > 0 && (
              <div className="p-6 sm:p-8 border-b border-slate-800/80">
                <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center space-x-2">
                  <Network className="w-4 h-4 text-amber-400" />
                  <span>{t.relatedConnections}</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {detail.related.map(n => (
                    <button
                      key={n.id}
                      onClick={() => openNode(n.id)}
                      className="text-left p-3 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-amber-500/50 transition-all cursor-pointer"
                    >
                      <span className="text-[10px] uppercase tracking-wide text-amber-400">{nodeTypeLabel(n.type)}</span>
                      <h4 className="text-sm font-bold text-white mt-0.5">{n.title}</h4>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Related books */}
            {detail.relatedBooks.length > 0 && (
              <div className="p-6 sm:p-8">
                <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center space-x-2">
                  <Library className="w-4 h-4 text-amber-400" />
                  <span>{t.relatedBooks}</span>
                </h3>
                <div className="space-y-3">
                  {detail.relatedBooks.map(book => (
                    <div key={book.id} className="flex items-center space-x-3 p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                      {book.coverImage && (
                        <img src={book.coverImage} alt={book.title} className="w-10 h-14 object-cover rounded-lg shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-white line-clamp-1">{book.title}</h4>
                        <p className="text-xs text-slate-400">{book.author}</p>
                      </div>
                      <button
                        onClick={() => onOpenBook?.(book.id)}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold cursor-pointer transition-all"
                      >
                        {t.viewInLibrary}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Library CTA */}
            {onOpenLibrary && (
              <div className="px-6 sm:px-8 pb-8">
                <button
                  onClick={onOpenLibrary}
                  className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 text-sm font-semibold cursor-pointer transition-all"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>{t.digitalLibrary}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
