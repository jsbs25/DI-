import React, { useState, useEffect } from 'react';
import { ArrowUpRight, Flame, Info, Pause, Play, Radio, Search, Tag, TrendingUp } from 'lucide-react';
import { Language } from '../../types/index.ts';

export interface TrendingTopic {
  id: string; tag: string; title: string; titleZh: string;
  category: 'space' | 'tech' | 'climate' | 'culture' | 'humanity' | 'life';
  categoryLabel: string; categoryLabelZh: string; postCount: number; growthPercent: number;
  isHot: boolean; isBreaking?: boolean; region: string; keywords: string[]; latestPostSnippet: string;
}

const INITIAL_TOPICS: TrendingTopic[] = [
  { id: 'topic_webb', tag: '#JamesWebbDeepSpace', title: 'James Webb Cosmic Horizons', titleZh: '韦伯深空宇宙视界新发现', category: 'space', categoryLabel: 'Cosmology & Space', categoryLabelZh: '深空天文', postCount: 14820, growthPercent: 32, isHot: true, region: 'Global Observatories', keywords: ['space', 'webb', 'cosmic', 'astronomy', 'horizon', 'telescope', 'universe', 'deep'], latestPostSnippet: 'New spectroscopy confirms high-redshift galaxy clusters near the cosmic dawn.' },
  { id: 'topic_peace', tag: '#GlobalPeaceAccord', title: 'One Earth Planetary Harmony', titleZh: '一颗地球·全球和平对话', category: 'humanity', categoryLabel: 'Humanity', categoryLabelZh: '人类互联', postCount: 21540, growthPercent: 44, isHot: true, isBreaking: true, region: 'Worldwide', keywords: ['peace', 'humanity', 'one earth', 'greeting', 'bridge', 'dialogue', 'cooperation', 'world'], latestPostSnippet: 'Citizens across 80+ nations sharing morning greetings in original native languages.' },
  { id: 'topic_agri', tag: '#RenewableEnergyTransition', title: 'Agrivoltaic Deserts & Clean Grids', titleZh: '沙漠光伏农业与清洁能源转型', category: 'climate', categoryLabel: 'Earth & Climate', categoryLabelZh: '生态与气候', postCount: 12390, growthPercent: 24, isHot: true, region: 'Riyadh & MENA', keywords: ['agrivoltaic', 'photovoltaic', 'solar', 'panels', 'riyadh', 'clean', 'energy', 'future', 'climate'], latestPostSnippet: 'Bifacial solar panels shading date palms reducing desert water loss by 40%.' },
  { id: 'topic_beijing', tag: '#BeijingArchitecture', title: 'Dougong Canopies & Timber Craft', titleZh: '斗拱木构与生候建筑设计', category: 'culture', categoryLabel: 'Culture & Design', categoryLabelZh: '文化与建筑', postCount: 6430, growthPercent: 18, isHot: false, region: 'Beijing, China', keywords: ['beijing', 'dougong', 'architecture', 'wooden', 'brackets', 'canopy', 'harmony', 'culture', 'sunset'], latestPostSnippet: 'Sunset reflections on traditional brackets inspiring modern bio-climatic architectural designs.' },
  { id: 'topic_amman', tag: '#AmmanHeritage', title: 'Roman Theatre & Cardamom Dawns', titleZh: '安曼古罗马剧场与豆蔻清晨', category: 'life', categoryLabel: 'Life & Heritage', categoryLabelZh: '生活与遗产', postCount: 4890, growthPercent: 12, isHot: false, region: 'Amman, Jordan', keywords: ['amman', 'jordan', 'roman', 'theatre', 'coffee', 'cardamom', 'heritage', 'sandstone', 'dawn'], latestPostSnippet: 'Morning cardamon-infused coffee overlooking ancient golden sandstone steps.' },
  { id: 'topic_cassini', tag: '#CassiniRingDiscovery', title: 'Saturnian Ring Dynamics & Ice Oceans', titleZh: '卡西尼土星环动力学新重构', category: 'space', categoryLabel: 'Solar System', categoryLabelZh: '太阳系探索', postCount: 8210, growthPercent: 15, isHot: false, region: 'Outer Planets', keywords: ['cassini', 'saturn', 'rings', 'ice', 'planet', 'solar system', 'voyager', 'titan'], latestPostSnippet: 'High-resolution re-analysis of Cassini magnetosphere data reveals micro-ringlets.' },
  { id: 'topic_quantum', tag: '#QuantumComputing', title: 'Fault-Tolerant Coherence Protocols', titleZh: '容错量子相干与拓扑计算', category: 'tech', categoryLabel: 'Deep Tech', categoryLabelZh: '前沿科技', postCount: 16420, growthPercent: 27, isHot: true, region: 'Global Tech Centers', keywords: ['quantum', 'computing', 'algorithm', 'qubit', 'coherence', 'physics', 'tech'], latestPostSnippet: 'International physics consortium confirms millisecond coherence on neutral atom grids.' },
  { id: 'topic_spb', tag: '#SaintPetersburgWinter', title: 'Canal Snowfalls & Classical Chess', titleZh: '圣彼得堡初雪与运河棋局', category: 'life', categoryLabel: 'Life & Games', categoryLabelZh: '生活与棋弈', postCount: 3740, growthPercent: 9, isHot: false, region: 'Saint Petersburg, Russia', keywords: ['chess', 'fontanka', 'saint petersburg', 'canal', 'snow', 'match', 'winter', 'samovar'], latestPostSnippet: 'First seasonal snowfall over Fontanka canal while international chess matches begin.' }
];

interface TrendingTopicsWidgetProps { onSelectTopic: (topic: TrendingTopic) => void; selectedTopicTag: string | null; onClearTopicFilter: () => void; lang: Language; }

export const TrendingTopicsWidget: React.FC<TrendingTopicsWidgetProps> = ({ onSelectTopic, selectedTopicTag, onClearTopicFilter, lang }) => {
  const isZh = lang === 'zh';
  const [topics, setTopics] = useState<TrendingTopic[]>(INITIAL_TOPICS);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLiveStreaming, setIsLiveStreaming] = useState(true);
  const [lastUpdatedTopicId, setLastUpdatedTopicId] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [simulatedTickCount, setSimulatedTickCount] = useState(0);

  useEffect(() => {
    if (!isLiveStreaming) return;
    const interval = setInterval(() => {
      setTopics(prev => {
        const randomIndex = Math.floor(Math.random() * prev.length);
        const increment = Math.floor(Math.random() * 4) + 1;
        const velocityDelta = (Math.random() > 0.4 ? 1 : -1) * (Math.random() > 0.7 ? 2 : 1);
        const updated = prev.map((t, idx) => {
          if (idx === randomIndex) {
            const nextGrowth = Math.max(2, Math.min(99, t.growthPercent + velocityDelta));
            return { ...t, postCount: t.postCount + increment, growthPercent: nextGrowth, isHot: t.isHot || nextGrowth > 30 };
          }
          return t;
        });
        setLastUpdatedTopicId(prev[randomIndex]?.id || null);
        return updated;
      });
      setSimulatedTickCount(c => c + 1);
    }, 3200);
    return () => clearInterval(interval);
  }, [isLiveStreaming]);

  useEffect(() => {
    if (!lastUpdatedTopicId) return;
    const timer = setTimeout(() => setLastUpdatedTopicId(null), 1200);
    return () => clearTimeout(timer);
  }, [lastUpdatedTopicId]);

  const filteredTopics = topics.filter(t => {
    if (activeCategory !== 'all' && t.category !== activeCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchTag = t.tag.toLowerCase().includes(q);
      const matchTitle = t.title.toLowerCase().includes(q) || t.titleZh.toLowerCase().includes(q);
      const matchKeywords = t.keywords.some(k => k.toLowerCase().includes(q));
      if (!matchTag && !matchTitle && !matchKeywords) return false;
    }
    return true;
  });

  const categories = [
    { id: 'all', label: isZh ? '全部' : 'All' }, { id: 'space', label: isZh ? '深空' : 'Space' }, { id: 'tech', label: isZh ? '科技' : 'Tech' }, { id: 'climate', label: isZh ? '气候' : 'Climate' }, { id: 'culture', label: isZh ? '文化' : 'Culture' }, { id: 'humanity', label: isZh ? '人类' : 'Humanity' }
  ];

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[28px] border border-[var(--color-one-border)] bg-white/[0.03] shadow-[var(--shadow-one-sm)] backdrop-blur-sm">
        <div className="border-b border-[var(--color-one-border)] p-4 sm:p-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-[rgba(78,161,255,0.3)] bg-[rgba(78,161,255,0.12)] text-[var(--color-one-accent-soft)]"><TrendingUp className="h-4 w-4" /></div>
              <div>
                <h3 className="text-sm font-semibold text-white">{isZh ? '全球热议主题' : 'Global Trending Topics'}</h3>
                <p className="text-[11px] text-[var(--color-one-text-muted)]">{isZh ? '话题热度与讨论聚合' : 'Topic momentum and discussion'}</p>
              </div>
            </div>
            <button type="button" onClick={() => setIsLiveStreaming(!isLiveStreaming)} title={isLiveStreaming ? (isZh ? '暂停模拟' : 'Pause simulation') : (isZh ? '恢复模拟' : 'Resume simulation')} className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border transition ${isLiveStreaming ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15' : 'border-[var(--color-one-border)] bg-white/[0.02] text-[var(--color-one-text-muted)] hover:text-white'}`}>
              {isLiveStreaming ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.55)] p-2 text-[11px]">
            <div className="flex min-w-0 items-center gap-2">
              <span className="relative flex h-2 w-2 shrink-0">{isLiveStreaming && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-one-accent)] opacity-60" />}<span className={`relative inline-flex h-2 w-2 rounded-full ${isLiveStreaming ? 'bg-[var(--color-one-accent)]' : 'bg-white/20'}`} /></span>
              <span className="truncate font-mono text-[10px] font-medium tracking-wide text-[var(--color-one-accent-soft)]">{isZh ? '[实时遥测模拟流]' : '[LIVE SIMULATION DATA]'}</span>
            </div>
            <button type="button" onClick={() => setShowExplanation(!showExplanation)} className="ml-2 inline-flex shrink-0 cursor-pointer items-center gap-0.5 text-[10px] text-[var(--color-one-text-muted)] hover:text-white"><Info className="h-3 w-3" /><span>{showExplanation ? (isZh ? '收起' : 'Hide') : (isZh ? '说明' : 'Audit')}</span></button>
          </div>
          {showExplanation && (
            <div className="mt-2 space-y-1 rounded-xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.7)] p-2.5 text-[11px] leading-relaxed text-[var(--color-one-text-muted)]">
              <p className="font-medium text-white">{isZh ? '透明度说明' : 'Transparency note'}</p>
              <p className="text-[10px]">{isZh ? '本组件为客户端遥测模拟（约每3.2秒更新），用于展示话题聚合与动态能力；非真实全球实时用户数据。' : 'Client-side telemetry simulation (~3.2s ticks) demonstrating topic aggregation behavior; not real-time global user data.'}</p>
            </div>
          )}

          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-one-text-dim)]" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={isZh ? '搜索话题或关键词…' : 'Filter topics, tags, regions…'} className="w-full rounded-xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.7)] py-2 pl-8 pr-8 text-xs text-white placeholder:text-[var(--color-one-text-dim)] focus:border-[rgba(78,161,255,0.45)] focus:outline-none" />
            {searchQuery && <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--color-one-text-muted)] hover:text-white">×</button>}
          </div>

          <div className="scrollbar-none mt-3 flex items-center gap-1.5 overflow-x-auto pb-1">
            {categories.map(c => (
              <button key={c.id} type="button" onClick={() => setActiveCategory(c.id)} className={`min-h-9 cursor-pointer whitespace-nowrap rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${activeCategory === c.id ? 'border-[rgba(78,161,255,0.35)] bg-[rgba(78,161,255,0.14)] text-white' : 'border-[var(--color-one-border)] bg-white/[0.02] text-[var(--color-one-text-muted)] hover:text-white'}`}>{c.label}</button>
            ))}
          </div>
        </div>

        <div className="max-h-[460px] divide-y divide-[var(--color-one-border)] overflow-y-auto">
          {filteredTopics.length === 0 ? (
            <div className="p-6 text-center text-xs text-[var(--color-one-text-muted)]"><Tag className="mx-auto mb-2 h-6 w-6 text-[var(--color-one-text-dim)]" /><p>{isZh ? '未找到匹配的话题' : 'No topics match current filter'}</p></div>
          ) : (
            filteredTopics.map((topic, index) => {
              const isSelected = selectedTopicTag === topic.tag;
              const isUpdatedRecently = lastUpdatedTopicId === topic.id;
              return (
                <div key={topic.id} onClick={() => onSelectTopic(topic)} className={`group relative cursor-pointer p-3.5 transition ${isSelected ? 'border-l-2 border-l-[var(--color-one-accent)] bg-[rgba(78,161,255,0.08)]' : 'hover:bg-white/[0.03]'} ${isUpdatedRecently ? 'bg-[rgba(78,161,255,0.06)]' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 text-[10px] text-[var(--color-one-text-dim)]"><span className="font-mono text-[var(--color-one-accent-soft)]">#{index + 1}</span><span>·</span><span className="truncate">{isZh ? topic.categoryLabelZh : topic.categoryLabel}</span><span>·</span><span className="truncate">{topic.region}</span></div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-white transition group-hover:text-[var(--color-one-accent-soft)]">{topic.tag}</span>
                        {topic.isBreaking && <span className="inline-flex items-center gap-0.5 rounded border border-rose-500/25 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-rose-200"><Flame className="h-2.5 w-2.5" />{isZh ? '热议' : 'HOT'}</span>}
                        {topic.isHot && !topic.isBreaking && <span className="rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-200">{isZh ? '上升' : 'TRENDING'}</span>}
                      </div>
                      <p className="line-clamp-1 text-[11px] font-medium text-[var(--color-one-text)]">{isZh ? topic.titleZh : topic.title}</p>
                      <p className="line-clamp-1 text-[10px] text-[var(--color-one-text-muted)]">{topic.latestPostSnippet}</p>
                    </div>
                    <div className="shrink-0 space-y-1 text-right">
                      <div className="font-mono text-xs font-semibold text-white">{topic.postCount.toLocaleString()}</div>
                      <div className="flex items-center justify-end gap-0.5 font-mono text-[10px] text-emerald-300"><TrendingUp className="h-3 w-3" /><span>+{topic.growthPercent}%/hr</span></div>
                      {isSelected ? <span className="inline-block font-mono text-[10px] text-[var(--color-one-accent-soft)]">{isZh ? '已筛选' : 'Active'}</span> : <span className="flex items-center justify-end text-[var(--color-one-text-dim)] transition group-hover:text-[var(--color-one-accent-soft)]"><ArrowUpRight className="h-3 w-3" /></span>}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {selectedTopicTag && (
          <div className="flex items-center justify-between border-t border-[rgba(78,161,255,0.25)] bg-[rgba(78,161,255,0.08)] p-3 text-xs">
            <span className="truncate font-mono text-[11px] text-white">{isZh ? `已筛选: ${selectedTopicTag}` : `Filtering: ${selectedTopicTag}`}</span>
            <button type="button" onClick={onClearTopicFilter} className="ml-2 shrink-0 cursor-pointer font-medium text-rose-200 underline hover:text-rose-100">{isZh ? '重置' : 'Clear'}</button>
          </div>
        )}
      </div>

      <div className="space-y-3.5 rounded-[28px] border border-[var(--color-one-border)] bg-white/[0.03] p-4 shadow-[var(--shadow-one-sm)] sm:p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Radio className="h-4 w-4 animate-pulse text-emerald-300" /><h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-one-text-muted)]">{isZh ? '全球遥测脉搏' : 'Telemetry Pulse'}</h4></div>
          <span className="font-mono text-[10px] text-[var(--color-one-text-dim)]">{isZh ? '模拟流' : 'Simulated'}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="space-y-1 rounded-xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.55)] p-2.5"><div className="text-[10px] text-[var(--color-one-text-dim)]">{isZh ? '在线节点' : 'Active Nodes'}</div><div className="flex items-center gap-1 font-mono text-sm font-semibold text-white"><span>{(1420 + (simulatedTickCount % 12)).toLocaleString()}</span><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /></div></div>
          <div className="space-y-1 rounded-xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.55)] p-2.5"><div className="text-[10px] text-[var(--color-one-text-dim)]">{isZh ? '跨国对话' : 'Cross-border Links'}</div><div className="font-mono text-sm font-semibold text-[var(--color-one-accent-soft)]">{(864 + (simulatedTickCount % 8)).toLocaleString()}</div></div>
          <div className="space-y-1 rounded-xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.55)] p-2.5"><div className="text-[10px] text-[var(--color-one-text-dim)]">{isZh ? 'AI 翻译吞吐' : 'AI Translation'}</div><div className="font-mono text-sm font-semibold text-white">340 {isZh ? '字/秒' : 'w/s'}</div></div>
          <div className="space-y-1 rounded-xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.55)] p-2.5"><div className="text-[10px] text-[var(--color-one-text-dim)]">{isZh ? '和谐指数' : 'Harmony Index'}</div><div className="font-mono text-sm font-semibold text-emerald-300">96.8%</div></div>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--color-one-border)] pt-2 text-[10px] text-[var(--color-one-text-dim)]"><span className="font-mono">ONE · ONE WORLD</span><span className="font-mono text-[var(--color-one-accent-soft)]">195 Countries</span></div>
      </div>
    </div>
  );
};
