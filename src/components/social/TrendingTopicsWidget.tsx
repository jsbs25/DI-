import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Sparkles,
  Flame,
  Radio,
  Search,
  RefreshCw,
  Pause,
  Play,
  Globe2,
  Info,
  CheckCircle2,
  Zap,
  Tag,
  ArrowUpRight,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Language } from '../../types/index.ts';

export interface TrendingTopic {
  id: string;
  tag: string;
  title: string;
  titleZh: string;
  category: 'space' | 'tech' | 'climate' | 'culture' | 'humanity' | 'life';
  categoryLabel: string;
  categoryLabelZh: string;
  postCount: number;
  growthPercent: number;
  isHot: boolean;
  isBreaking?: boolean;
  region: string;
  keywords: string[];
  latestPostSnippet: string;
}

const INITIAL_TOPICS: TrendingTopic[] = [
  {
    id: 'topic_webb',
    tag: '#JamesWebbDeepSpace',
    title: 'James Webb Cosmic Horizons',
    titleZh: '韦伯深空宇宙视界新发现',
    category: 'space',
    categoryLabel: 'Cosmology & Space',
    categoryLabelZh: '深空天文',
    postCount: 14820,
    growthPercent: 32,
    isHot: true,
    region: 'Global Observatories',
    keywords: ['space', 'webb', 'cosmic', 'astronomy', 'horizon', 'telescope', 'universe', 'deep'],
    latestPostSnippet: 'New spectroscopy confirms high-redshift galaxy clusters near the cosmic dawn.'
  },
  {
    id: 'topic_peace',
    tag: '#GlobalPeaceAccord',
    title: 'One Earth Planetary Harmony',
    titleZh: '一颗地球·全球和平对话',
    category: 'humanity',
    categoryLabel: 'Humanity',
    categoryLabelZh: '人类互联',
    postCount: 21540,
    growthPercent: 44,
    isHot: true,
    isBreaking: true,
    region: 'Worldwide',
    keywords: ['peace', 'humanity', 'one earth', 'greeting', 'bridge', 'dialogue', 'cooperation', 'world'],
    latestPostSnippet: 'Citizens across 80+ nations sharing morning greetings in original native languages.'
  },
  {
    id: 'topic_agri',
    tag: '#RenewableEnergyTransition',
    title: 'Agrivoltaic Deserts & Clean Grids',
    titleZh: '沙漠光伏农业与清洁能源转型',
    category: 'climate',
    categoryLabel: 'Earth & Climate',
    categoryLabelZh: '生态与气候',
    postCount: 12390,
    growthPercent: 24,
    isHot: true,
    region: 'Riyadh & MENA',
    keywords: ['agrivoltaic', 'photovoltaic', 'solar', 'panels', 'riyadh', 'clean', 'energy', 'future', 'climate'],
    latestPostSnippet: 'Bifacial solar panels shading date palms reducing desert water loss by 40%.'
  },
  {
    id: 'topic_beijing',
    tag: '#BeijingArchitecture',
    title: 'Dougong Canopies & Timber Craft',
    titleZh: '斗拱木构与生候建筑设计',
    category: 'culture',
    categoryLabel: 'Culture & Design',
    categoryLabelZh: '文化与建筑',
    postCount: 6430,
    growthPercent: 18,
    isHot: false,
    region: 'Beijing, China',
    keywords: ['beijing', 'dougong', 'architecture', 'wooden', 'brackets', 'canopy', 'harmony', 'culture', 'sunset'],
    latestPostSnippet: 'Sunset reflections on traditional brackets inspiring modern bio-climatic architectural designs.'
  },
  {
    id: 'topic_amman',
    tag: '#AmmanHeritage',
    title: 'Roman Theatre & Cardamom Dawns',
    titleZh: '安曼古罗马剧场与豆蔻清晨',
    category: 'life',
    categoryLabel: 'Life & Heritage',
    categoryLabelZh: '生活与遗产',
    postCount: 4890,
    growthPercent: 12,
    isHot: false,
    region: 'Amman, Jordan',
    keywords: ['amman', 'jordan', 'roman', 'theatre', 'coffee', 'cardamom', 'heritage', 'sandstone', 'dawn'],
    latestPostSnippet: 'Morning cardamon-infused coffee overlooking ancient golden sandstone steps.'
  },
  {
    id: 'topic_cassini',
    tag: '#CassiniRingDiscovery',
    title: 'Saturnian Ring Dynamics & Ice Oceans',
    titleZh: '卡西尼土星环动力学新重构',
    category: 'space',
    categoryLabel: 'Solar System',
    categoryLabelZh: '太阳系探索',
    postCount: 8210,
    growthPercent: 15,
    isHot: false,
    region: 'Outer Planets',
    keywords: ['cassini', 'saturn', 'rings', 'ice', 'planet', 'solar system', 'voyager', 'titan'],
    latestPostSnippet: 'High-resolution re-analysis of Cassini magnetosphere data reveals micro-ringlets.'
  },
  {
    id: 'topic_quantum',
    tag: '#QuantumComputing',
    title: 'Fault-Tolerant Coherence Protocols',
    titleZh: '容错量子相干与拓扑计算',
    category: 'tech',
    categoryLabel: 'Deep Tech',
    categoryLabelZh: '前沿科技',
    postCount: 16420,
    growthPercent: 27,
    isHot: true,
    region: 'Global Tech Centers',
    keywords: ['quantum', 'computing', 'algorithm', 'qubit', 'coherence', 'physics', 'tech'],
    latestPostSnippet: 'International physics consortium confirms millisecond coherence on neutral atom grids.'
  },
  {
    id: 'topic_spb',
    tag: '#SaintPetersburgWinter',
    title: 'Canal Snowfalls & Classical Chess',
    titleZh: '圣彼得堡初雪与运河棋局',
    category: 'life',
    categoryLabel: 'Life & Games',
    categoryLabelZh: '生活与棋弈',
    postCount: 3740,
    growthPercent: 9,
    isHot: false,
    region: 'Saint Petersburg, Russia',
    keywords: ['chess', 'fontanka', 'saint petersburg', 'canal', 'snow', 'match', 'winter', 'samovar'],
    latestPostSnippet: 'First seasonal snowfall over Fontanka canal while international chess matches begin.'
  }
];

interface TrendingTopicsWidgetProps {
  onSelectTopic: (topic: TrendingTopic) => void;
  selectedTopicTag: string | null;
  onClearTopicFilter: () => void;
  lang: Language;
}

export const TrendingTopicsWidget: React.FC<TrendingTopicsWidgetProps> = ({
  onSelectTopic,
  selectedTopicTag,
  onClearTopicFilter,
  lang
}) => {
  const isZh = lang === 'zh';

  const [topics, setTopics] = useState<TrendingTopic[]>(INITIAL_TOPICS);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLiveStreaming, setIsLiveStreaming] = useState(true);
  const [lastUpdatedTopicId, setLastUpdatedTopicId] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [simulatedTickCount, setSimulatedTickCount] = useState(0);

  // Live simulation telemetry interval
  useEffect(() => {
    if (!isLiveStreaming) return;

    const interval = setInterval(() => {
      setTopics(prev => {
        // Randomly pick 1 or 2 topics to simulate inbound citizen posts & velocity updates
        const randomIndex = Math.floor(Math.random() * prev.length);
        const increment = Math.floor(Math.random() * 4) + 1;
        const velocityDelta = (Math.random() > 0.4 ? 1 : -1) * (Math.random() > 0.7 ? 2 : 1);

        const updated = prev.map((t, idx) => {
          if (idx === randomIndex) {
            const nextGrowth = Math.max(2, Math.min(99, t.growthPercent + velocityDelta));
            return {
              ...t,
              postCount: t.postCount + increment,
              growthPercent: nextGrowth,
              isHot: t.isHot || nextGrowth > 30
            };
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

  // Clear pulse animation trigger after 1.2s
  useEffect(() => {
    if (!lastUpdatedTopicId) return;
    const timer = setTimeout(() => {
      setLastUpdatedTopicId(null);
    }, 1200);
    return () => clearTimeout(timer);
  }, [lastUpdatedTopicId]);

  // Filter topics by category and search
  const filteredTopics = topics.filter(t => {
    if (activeCategory !== 'all' && t.category !== activeCategory) {
      return false;
    }
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
    { id: 'all', label: isZh ? '全部热点' : 'All Topics' },
    { id: 'space', label: isZh ? '深空' : 'Space' },
    { id: 'tech', label: isZh ? '前沿科技' : 'Tech' },
    { id: 'climate', label: isZh ? '气候生态' : 'Climate' },
    { id: 'culture', label: isZh ? '文化遗产' : 'Culture' },
    { id: 'humanity', label: isZh ? '人类互联' : 'Humanity' }
  ];

  return (
    <div className="space-y-4">
      {/* 1. Main Trending Topics Card */}
      <div className="rounded-2xl bg-slate-900/85 border border-slate-800 shadow-xl backdrop-blur-md overflow-hidden">
        {/* Card Header with Live Simulation Indicator */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100 flex items-center space-x-1.5">
                  <span>{isZh ? '全球热议主题' : 'Global Trending Topics'}</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  {isZh ? '行星级实时讨论热度与话题聚合' : 'Planetary conversation volume & velocity'}
                </p>
              </div>
            </div>

            {/* Live Ticker Control */}
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => setIsLiveStreaming(!isLiveStreaming)}
                title={isLiveStreaming ? (isZh ? '暂停遥测模拟' : 'Pause live stream simulation') : (isZh ? '恢复遥测模拟' : 'Resume live stream simulation')}
                className={`p-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                  isLiveStreaming
                    ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800/60 hover:bg-emerald-900/50'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
              >
                {isLiveStreaming ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Explicit Honesty Simulation Banner */}
          <div className="mt-3 p-2 rounded-xl bg-slate-950/70 border border-cyan-900/40 flex items-center justify-between text-[11px]">
            <div className="flex items-center space-x-2 min-w-0">
              <span className="relative flex h-2 w-2 shrink-0">
                {isLiveStreaming && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isLiveStreaming ? 'bg-cyan-500' : 'bg-slate-600'}`}></span>
              </span>
              <span className="font-mono text-[10px] text-cyan-300 font-medium tracking-wide truncate">
                {isZh ? '[实时遥测模拟流]' : '[LIVE SIMULATION DATA]'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowExplanation(!showExplanation)}
              className="text-[10px] text-slate-400 hover:text-cyan-300 flex items-center space-x-0.5 cursor-pointer shrink-0 ml-2"
            >
              <Info className="w-3 h-3" />
              <span>{showExplanation ? (isZh ? '收起' : 'Hide') : (isZh ? '说明' : 'Audit')}</span>
            </button>
          </div>

          {showExplanation && (
            <div className="mt-2 p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-[11px] text-slate-300 leading-relaxed space-y-1">
              <p className="font-medium text-cyan-400">
                {isZh ? '严格工程透明度说明 (EARTH ONE 宪章第7条)' : 'Strict Engineering Transparency (EARTH ONE Constitution):'}
              </p>
              <p className="text-slate-400 text-[10px]">
                {isZh
                  ? '本小部件使用高仿真客户端遥测模拟流（每3.2秒刷新一次全球话题频次与速度），展示 EARTH ONE 未来连接195+国家真实数字节点时的话题聚合能力。绝无虚假伪造或暗箱操作。'
                  : 'This widget streams synthetic real-time telemetry simulating live global planetary topic surges every 3.2s, showing how topic aggregation operates across 195+ digital territories. Marked transparently as simulation.'}
              </p>
            </div>
          )}

          {/* Quick Search */}
          <div className="mt-3 relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={isZh ? '搜索话题、关键词或深空主题...' : 'Filter topics, hashtags, regions...'}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200"
              >
                ×
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="mt-3 flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
            {categories.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCategory(c.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap cursor-pointer transition-all ${
                  activeCategory === c.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'bg-slate-950/60 text-slate-400 border border-slate-800/80 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Topics List */}
        <div className="divide-y divide-slate-800/60 max-h-[460px] overflow-y-auto">
          {filteredTopics.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              <Tag className="w-6 h-6 mx-auto text-slate-600 mb-2" />
              <p>{isZh ? '未找到匹配的热议主题' : 'No topics match current filter'}</p>
            </div>
          ) : (
            filteredTopics.map((topic, index) => {
              const isSelected = selectedTopicTag === topic.tag;
              const isUpdatedRecently = lastUpdatedTopicId === topic.id;

              return (
                <div
                  key={topic.id}
                  onClick={() => onSelectTopic(topic)}
                  className={`p-3.5 transition-all cursor-pointer group relative ${
                    isSelected
                      ? 'bg-cyan-950/30 border-l-2 border-l-cyan-400'
                      : 'hover:bg-slate-800/40'
                  } ${isUpdatedRecently ? 'bg-cyan-500/10' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0 flex-1">
                      {/* Topic Category & Region metadata */}
                      <div className="flex items-center space-x-2 text-[10px] text-slate-400">
                        <span className="font-mono text-cyan-400/90 font-medium">#{index + 1}</span>
                        <span>·</span>
                        <span className="truncate">{isZh ? topic.categoryLabelZh : topic.categoryLabel}</span>
                        <span>·</span>
                        <span className="text-slate-500 truncate">{topic.region}</span>
                      </div>

                      {/* Hashtag & Title */}
                      <div className="flex items-center space-x-1.5 flex-wrap">
                        <span className="font-semibold text-xs text-slate-100 group-hover:text-cyan-300 transition-colors font-mono">
                          {topic.tag}
                        </span>
                        {topic.isBreaking && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-950 text-rose-300 border border-rose-800 flex items-center space-x-0.5">
                            <Flame className="w-2.5 h-2.5 fill-rose-400" />
                            <span>{isZh ? '热议' : 'HOT'}</span>
                          </span>
                        )}
                        {topic.isHot && !topic.isBreaking && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-amber-950 text-amber-300 border border-amber-800">
                            {isZh ? '上升' : 'TRENDING'}
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-300 font-medium line-clamp-1">
                        {isZh ? topic.titleZh : topic.title}
                      </p>

                      <p className="text-[10px] text-slate-400 line-clamp-1">
                        {topic.latestPostSnippet}
                      </p>
                    </div>

                    {/* Stats Column */}
                    <div className="text-right shrink-0 space-y-1">
                      <div className="text-xs font-mono font-semibold text-slate-200">
                        {topic.postCount.toLocaleString()}
                      </div>
                      <div className="flex items-center justify-end space-x-0.5 text-[10px] font-mono text-emerald-400">
                        <TrendingUp className="w-3 h-3" />
                        <span>+{topic.growthPercent}%/hr</span>
                      </div>
                      {isSelected ? (
                        <span className="inline-block text-[10px] text-cyan-300 font-medium font-mono">
                          {isZh ? '已筛选' : 'Active'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 group-hover:text-cyan-400 transition-colors flex items-center justify-end">
                          <ArrowUpRight className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Selected Topic Bar */}
        {selectedTopicTag && (
          <div className="p-3 bg-cyan-950/40 border-t border-cyan-800/60 flex items-center justify-between text-xs">
            <span className="text-cyan-200 font-mono text-[11px] truncate">
              {isZh ? `已应用话题筛选: ${selectedTopicTag}` : `Filtering feed by: ${selectedTopicTag}`}
            </span>
            <button
              type="button"
              onClick={onClearTopicFilter}
              className="text-xs text-rose-300 hover:text-rose-200 cursor-pointer font-medium underline shrink-0 ml-2"
            >
              {isZh ? '重置' : 'Clear'}
            </button>
          </div>
        )}
      </div>

      {/* 2. Global Telemetry Pulse Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-md space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              {isZh ? '全球行星遥测脉搏' : 'Planetary Telemetry Pulse'}
            </h4>
          </div>
          <span className="text-[10px] font-mono text-slate-500">
            {isZh ? '模拟流' : 'Live Mock Stream'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
            <div className="text-[10px] text-slate-400">{isZh ? '在线节点' : 'Active Nodes'}</div>
            <div className="text-sm font-mono font-bold text-slate-100 flex items-center space-x-1">
              <span>{(1420 + (simulatedTickCount % 12)).toLocaleString()}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
            <div className="text-[10px] text-slate-400">{isZh ? '跨国对话' : 'Cross-border Links'}</div>
            <div className="text-sm font-mono font-bold text-cyan-300">
              {(864 + (simulatedTickCount % 8)).toLocaleString()}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
            <div className="text-[10px] text-slate-400">{isZh ? '实时翻译吞吐' : 'AI Translation Speed'}</div>
            <div className="text-sm font-mono font-bold text-slate-100">
              340 {isZh ? '字/秒' : 'w/sec'}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
            <div className="text-[10px] text-slate-400">{isZh ? '和平友好度' : 'Harmony Index'}</div>
            <div className="text-sm font-mono font-bold text-emerald-400">
              96.8%
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-800/70 text-[10px] text-slate-400 flex items-center justify-between">
          <span className="font-mono">EARTH ONE · ONE HUMANITY</span>
          <span className="text-cyan-400/80 font-mono">195 Countries</span>
        </div>
      </div>
    </div>
  );
};
