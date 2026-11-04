import React, { useState, useEffect } from 'react';
import {
  Globe,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Star,
  Bookmark,
  BookOpen,
  Sparkles,
  ExternalLink,
  Plus,
  X,
  Shield,
  CheckCircle,
  ChevronRight,
  Database,
  Search
} from 'lucide-react';
import { Language } from '../../types/index.ts';

interface BrowserTab {
  id: string;
  title: string;
  url: string;
  readerMode: boolean;
  content?: string;
  author?: string;
  readTime?: string;
}

interface BookmarkItem {
  id: string;
  title: string;
  url: string;
  category: string;
}

interface SavedArticle {
  id: string;
  url: string;
  title: string;
  author: string;
  aiSummary: string;
  savedAt: string;
  tags: string[];
}

interface WebBrowserProps {
  lang: Language;
}

const DEFAULT_BOOKMARKS: BookmarkItem[] = [
  { id: 'bm_nasa', title: 'NASA Earth Observatory', url: 'https://earthobservatory.nasa.gov', category: 'Science' },
  { id: 'bm_gutenberg', title: 'Project Gutenberg', url: 'https://www.gutenberg.org', category: 'Library' },
  { id: 'bm_arxiv', title: 'arXiv Astrophysics', url: 'https://arxiv.org/archive/astro-ph', category: 'Research' },
  { id: 'bm_sep', title: 'Stanford Encyclopedia of Philosophy', url: 'https://plato.stanford.edu', category: 'Philosophy' },
  { id: 'bm_wiki', title: 'Wikipedia Knowledge', url: 'https://en.wikipedia.org/wiki/Earth', category: 'Encyclopedia' }
];

const PRESET_PAGES: Record<string, { title: string; author: string; content: string; readTime: string }> = {
  'https://earthobservatory.nasa.gov': {
    title: 'Earth Observatory: Global Biosphere & Ocean Color Monitoring',
    author: 'NASA Earth Science Division',
    readTime: '4 min read',
    content: `NASA Earth Observatory provides satellite-based observations of planet Earth's changing environment. From MODIS instruments aboard Terra and Aqua satellites to VIIRS aboard Suomi NPP, researchers monitor global chlorophyll concentrations, terrestrial vegetation index (NDVI), atmospheric aerosol optical depth, and sea ice extents.

The modern blue planet is captured through multispectral bands that combine visible red, green, and blue reflectance with thermal infrared channels. Recent data shows seasonal oscillations in Northern Hemisphere boreal forest photosynthesis, modulating atmospheric CO2 levels between 415 ppm and 423 ppm.

Satellite orbital dynamics allow complete sun-synchronous pole-to-pole passes every 99 minutes at 705 km altitude, mapping oceanic thermal currents like the Gulf Stream and Kuroshio Current with millikelvin precision.`
  },
  'https://www.gutenberg.org': {
    title: 'Project Gutenberg: The Free Digital Archive of World Literature',
    author: 'Michael S. Hart / Gutenberg Community',
    readTime: '3 min read',
    content: `Project Gutenberg is the oldest digital library of free public domain cultural works, founded in 1971 by Michael Hart. The archive holds over 70,000 digitized ebooks available in Plain Text, EPUB, and HTML formats.

Among its treasures are original translations of Plato's Republic, Nicolaus Copernicus's De Revolutionibus Orbium Coelestium, Jane Austen's Pride and Prejudice, and Marcus Aurelius's Meditations.

EARTH ONE integrates directly with Project Gutenberg's public domain indexing to enable universal access to humanity's scientific and literary heritage without paywalls or geographic barriers.`
  },
  'https://arxiv.org/archive/astro-ph': {
    title: 'arXiv: Gravitational Lens Characterization & Exoplanet Atmospheres',
    author: 'Astrophysics Data System Collaboration',
    readTime: '6 min read',
    content: `Open-access research in astrophysics has revolutionized our understanding of exoplanetary systems. High-contrast coronagraphy paired with transmission spectroscopy enables direct chemical characterization of exoplanet atmospheres in the TRAPPIST-1 and TOI-700 systems.

Signatures of water vapor (H2O), methane (CH4), carbon dioxide (CO2), and nitrogen oxides are probed in the 0.6–5.0 micron wavelength regime using James Webb Space Telescope NIRSpec and MIRI instruments.

Furthermore, solar system dynamics confirm the presence of over 1.3 million catalogued minor planets and asteroids in the main asteroid belt between Mars and Jupiter, providing clues about primordial solar nebula accretion.`
  },
  'https://en.wikipedia.org/wiki/Earth': {
    title: 'Earth: The Third Planet from the Sun',
    author: 'Wikipedia Planetary Science Contributors',
    readTime: '5 min read',
    content: `Earth is the third planet from the Sun and the only astronomical object known to harbor life. While large amounts of water can be found throughout the Solar System, only Earth sustains liquid surface water. About 71% of Earth's surface is made up of the ocean, dwarfing Earth's polar ice, lakes, and rivers.

The remaining 29% of Earth's surface is land, consisting of continents and islands. Earth's surface layer is formed of several slowly moving tectonic plates, interacting to produce mountain ranges, volcanoes, and earthquakes.

Earth's interior remains active with a solid iron inner core, a liquid outer core that generates Earth's magnetic field, and a convective mantle that drives plate tectonics. Earth's atmosphere consists mostly of nitrogen and oxygen.`
  }
};

export const WebBrowser: React.FC<WebBrowserProps> = ({ lang }) => {
  // Browser-local language (defaults to global app language; user can override)
  const [browserLang, setBrowserLang] = useState<Language>(lang);

  const [tabs, setTabs] = useState<BrowserTab[]>([
    {
      id: 'tab_1',
      title: 'NASA Earth Observatory',
      url: 'https://earthobservatory.nasa.gov',
      readerMode: true,
      content: PRESET_PAGES['https://earthobservatory.nasa.gov'].content,
      author: PRESET_PAGES['https://earthobservatory.nasa.gov'].author,
      readTime: PRESET_PAGES['https://earthobservatory.nasa.gov'].readTime
    }
  ]);
  const [activeTabId, setActiveTabId] = useState('tab_1');
  const [inputUrl, setInputUrl] = useState('https://earthobservatory.nasa.gov');
  const [isLoading, setIsLoading] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(DEFAULT_BOOKMARKS);
  const [isSavedDrawerOpen, setIsSavedDrawerOpen] = useState(false);
  const [savedArticles, setSavedArticles] = useState<SavedArticle[]>([]);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Live search state
  const [searchResults, setSearchResults] = useState<{ title: string; url: string; snippet: string }[]>([]);
  const [lastSearchQuery, setLastSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Navigation history per tab (real back/forward)
  const [history, setHistory] = useState<Record<string, string[]>>({ tab_1: ['https://earthobservatory.nasa.gov'] });
  const [historyIndex, setHistoryIndex] = useState<Record<string, number>>({ tab_1: 0 });

  // Search engine selection
  const [searchEngine, setSearchEngine] = useState<'auto' | 'bing' | 'duckduckgo' | 'wikipedia'>('auto');

  // Sync browser language when the global app language changes
  useEffect(() => {
    setBrowserLang(lang);
  }, [lang]);

  // AI Web Companion State
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(true);
  const [aiAnalysisType, setAiAnalysisType] = useState<'summary' | 'entities' | 'qa'>('summary');
  const [aiOutput, setAiOutput] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');

  // Page translation state
  const [translatedContent, setTranslatedContent] = useState<string>('');
  const [showTranslation, setShowTranslation] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  const pushHistory = (tabId: string, url: string) => {
    setHistory(prev => {
      const stack = [...(prev[tabId] || [])];
      const idx = historyIndex[tabId] ?? stack.length - 1;
      // Truncate forward history if navigating after going back
      const truncated = stack.slice(0, idx + 1);
      if (truncated[truncated.length - 1] === url) return prev;
      truncated.push(url);
      return { ...prev, [tabId]: truncated };
    });
    setHistoryIndex(prev => {
      const idx = (prev[tabId] ?? (history[tabId]?.length ?? 0));
      return { ...prev, [tabId]: idx + 1 };
    });
  };

  useEffect(() => {
    if (activeTab) {
      setInputUrl(activeTab.url);
    }
    // Reset translation whenever the active tab changes
    setTranslatedContent('');
    setShowTranslation(false);
  }, [activeTabId]);

  useEffect(() => {
    fetch('/api/browser/bookmarks')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.bookmarks && d.bookmarks.length > 0) {
          setBookmarks(d.bookmarks);
        }
      })
      .catch(() => {});

    fetch('/api/browser/saved-articles')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.articles) {
          setSavedArticles(d.articles);
        }
      })
      .catch(() => {});
  }, []);

  const handleNavigate = async (targetUrl: string) => {
    let cleanUrl = targetUrl.trim();
    if (!cleanUrl) return;

    // A search term (no scheme and either has spaces or no TLD) -> run live web search
    const looksLikeUrl =
      cleanUrl.startsWith('http://') ||
      cleanUrl.startsWith('https://') ||
      (cleanUrl.includes('.') && !cleanUrl.includes(' '));

    if (!looksLikeUrl) {
      setIsSearching(true);
      setLastSearchQuery(cleanUrl);
      setInputUrl(cleanUrl);
      try {
        const res = await fetch(`/api/browser/search?q=${encodeURIComponent(cleanUrl)}&engine=${searchEngine}&lang=${browserLang}`);
        const data = await res.json();
        if (data.success && data.results) {
          setSearchResults(data.results);
        } else {
          setSearchResults([]);
        }
      } catch (e) {
        console.error(e);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
      return;
    }

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    setIsLoading(true);
    setInputUrl(cleanUrl);
    setSearchResults([]);
    pushHistory(activeTabId, cleanUrl);

    // Immediately show a loading placeholder in the article view so the user
    // sees clear feedback instead of the previous page's content.
    setTabs(prev =>
      prev.map(t =>
        t.id === activeTabId
          ? { ...t, url: cleanUrl, title: 'Loading…', content: '', author: '', readTime: '' }
          : t
      )
    );

    const preset = PRESET_PAGES[cleanUrl];
    if (preset) {
      setTabs(prev =>
        prev.map(t =>
          t.id === activeTabId
            ? {
                ...t,
                url: cleanUrl,
                title: preset.title,
                content: preset.content,
                author: preset.author,
                readTime: preset.readTime
              }
            : t
        )
      );
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/browser/fetch-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl })
      });
      const data = await res.json();
      if (data.success) {
        setTabs(prev =>
          prev.map(t =>
            t.id === activeTabId
              ? {
                  ...t,
                  url: cleanUrl,
                  title: data.title || cleanUrl,
                  content: data.content,
                  author: data.author,
                  readTime: data.readTime
                }
              : t
          )
        );
      } else {
        setTabs(prev =>
          prev.map(t =>
            t.id === activeTabId
              ? {
                  ...t,
                  url: cleanUrl,
                  title: data.error ? '无法加载该页面' : cleanUrl,
                  content: `无法在站内提取该页面内容（可能被目标网站拦截）。\n\n你可以点击上方的链接，或使用右侧的「在新窗口打开」按钮直接访问原网站。\n\n${data.error || ''}`,
                  author: cleanUrl,
                  readTime: ''
                }
              : t
          )
        );
      }
    } catch (e: any) {
      console.error(e);
      setTabs(prev =>
        prev.map(t =>
          t.id === activeTabId
            ? {
                ...t,
                url: cleanUrl,
                title: '网络请求失败',
                content: `加载失败：${e?.message || '网络错误'}\n\n请点击上方链接直接访问原网站。`,
                author: cleanUrl,
                readTime: ''
              }
            : t
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewTab = () => {
    const newId = `tab_${Date.now()}`;
    const newTab: BrowserTab = {
      id: newId,
      title: 'New Tab',
      url: 'https://en.wikipedia.org/wiki/Earth',
      readerMode: true,
      content: PRESET_PAGES['https://en.wikipedia.org/wiki/Earth'].content,
      author: PRESET_PAGES['https://en.wikipedia.org/wiki/Earth'].author,
      readTime: PRESET_PAGES['https://en.wikipedia.org/wiki/Earth'].readTime
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newId);
    setHistory(prev => ({ ...prev, [newId]: [newTab.url] }));
    setHistoryIndex(prev => ({ ...prev, [newId]: 0 }));
    setSearchResults([]);
  };

  const goBack = () => {
    const stack = history[activeTabId] || [];
    const idx = historyIndex[activeTabId] ?? 0;
    if (idx <= 0) return;
    const target = stack[idx - 1];
    setHistoryIndex(prev => ({ ...prev, [activeTabId]: idx - 1 }));
    handleNavigate(target);
  };

  const goForward = () => {
    const stack = history[activeTabId] || [];
    const idx = historyIndex[activeTabId] ?? 0;
    if (idx >= stack.length - 1) return;
    const target = stack[idx + 1];
    setHistoryIndex(prev => ({ ...prev, [activeTabId]: idx + 1 }));
    handleNavigate(target);
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    const remaining = tabs.filter(t => t.id !== id);
    setTabs(remaining);
    if (activeTabId === id) {
      setActiveTabId(remaining[0].id);
    }
  };

  const handleAddBookmark = async () => {
    if (!activeTab) return;
    try {
      const res = await fetch('/api/browser/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: activeTab.title,
          url: activeTab.url,
          category: 'User Bookmarks'
        })
      });
      const data = await res.json();
      if (data.success && data.bookmark) {
        setBookmarks(prev => [data.bookmark, ...prev]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const targetLanguageName: Record<Language, string> = {
    zh: '中文',
    en: 'English',
    ar: 'العربية',
    es: 'Español',
    fr: 'Français',
    ru: 'Русский'
  };

  const handleTranslatePage = async () => {
    if (!activeTab?.content || isTranslating) return;
    setIsTranslating(true);
    setShowTranslation(true);
    try {
      const res = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: activeTab.content,
          targetLang: targetLanguageName[browserLang]
        })
      });
      const data = await res.json();
      if (data.success && data.translation) {
        setTranslatedContent(data.translation);
      } else {
        setTranslatedContent('翻译失败：' + (data.error || '请确认 AI 模型已配置。'));
      }
    } catch (e: any) {
      setTranslatedContent('翻译请求异常：' + e.message);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSaveToLibrary = async () => {
    if (!activeTab) return;
    try {
      const res = await fetch('/api/browser/save-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: activeTab.url,
          title: activeTab.title,
          author: activeTab.author || 'Web Author',
          content: activeTab.content || '',
          aiSummary: aiOutput || 'Summary saved from EARTH ONE AI Companion.',
          tags: ['Web Harvest', 'Earth Research', 'Library Import']
        })
      });
      const data = await res.json();
      if (data.success) {
        setSavedArticles(prev => [data.article, ...prev]);
        setSaveSuccessMessage('已成功归档到全球数字图书馆知识库！');
        setTimeout(() => setSaveSuccessMessage(null), 3500);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRunAiAnalysis = async (type: 'summary' | 'entities' | 'qa') => {
    setAiAnalysisType(type);
    setIsAiLoading(true);

    const promptText =
      type === 'summary'
        ? `请对以下网页文章进行结构化专业总结。包括：\n1. 核心主旨与要点\n2. 关键论据与事实\n3. 对人类探索世界与认知升级的启示。\n\n文章标题: ${activeTab.title}\n来源: ${activeTab.url}\n内容:\n${activeTab.content}`
        : type === 'entities'
        ? `请从以下网页文章中提取所有关键知识实体（包括地理位置、历史年代、科学概念、重要人物、天文名词），并以清晰的知识图谱条目输出。\n\n文章标题: ${activeTab.title}\n内容:\n${activeTab.content}`
        : `用户提问: ${aiQuestion}\n\n参考网页内容: ${activeTab.title} (${activeTab.url})\n${activeTab.content}\n\n请结合上述内容给出准确、严谨的回答。`;

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: promptText }]
        })
      });
      const data = await res.json();
      if (data.success && data.message) {
        setAiOutput(data.message.content);
      } else {
        setAiOutput(data.error || 'AI 分析生成失败，请确认模型配置或重试。');
      }
    } catch (err: any) {
      setAiOutput(`请求异常: ${err.message}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-[#020512] text-slate-100 min-h-[calc(100vh-4rem)]">
      {/* 1. Browser Tab Strip */}
      <div className="flex items-center bg-[#070d20] border-b border-slate-800/80 px-3 pt-2 gap-1 overflow-x-auto select-none">
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`group flex items-center max-w-[220px] min-w-[140px] px-3 py-1.5 rounded-t-xl text-xs font-medium cursor-pointer border-t border-x transition-all ${
                isActive
                  ? 'bg-[#0b132b] border-slate-700 text-cyan-300 shadow-md'
                  : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <Globe className={`w-3.5 h-3.5 mr-2 shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
              <span className="truncate flex-1">{tab.title}</span>
              <button
                onClick={e => handleCloseTab(tab.id, e)}
                className="opacity-0 group-hover:opacity-100 hover:bg-slate-700/60 p-0.5 rounded-md ml-1 transition-opacity text-slate-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
        <button
          onClick={handleNewTab}
          className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800/60 transition-colors ml-1"
          title="New Tab"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Omnibox Toolbar */}
      <div className="flex min-w-0 items-center gap-2 px-4 py-2 bg-[#0b132b] border-b border-slate-800/90 shadow-sm overflow-x-auto">
        <div className="flex items-center space-x-1 text-slate-400">
          <button
            onClick={goBack}
            disabled={(historyIndex[activeTabId] ?? 0) <= 0}
            className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goForward}
            disabled={(historyIndex[activeTabId] ?? 0) >= (history[activeTabId]?.length ?? 1) - 1}
            className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Forward"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleNavigate(inputUrl)}
            className={`p-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition-colors ${
              isLoading ? 'animate-spin text-cyan-400' : ''
            }`}
            title="Reload"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={e => {
            e.preventDefault();
            handleNavigate(inputUrl);
          }}
          className="flex-1 min-w-0 flex items-center bg-[#050a18] border border-slate-700/80 rounded-xl px-3 py-1.5 focus-within:border-cyan-500/80 focus-within:ring-1 focus-within:ring-cyan-500/40 transition-all shadow-inner"
        >
          <Shield className="w-3.5 h-3.5 text-emerald-400 mr-2 shrink-0" />
          <input
            type="text"
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            placeholder="输入网址或知识关键词 (如: https://earthobservatory.nasa.gov)..."
            className="w-full bg-transparent text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
          />
          {inputUrl && (
            <button
              type="button"
              onClick={() => setInputUrl('')}
              className="text-slate-500 hover:text-slate-300 ml-1.5"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </form>

        <div className="flex items-center space-x-1.5">
          {/* Language selector (controls search result language) */}
          <div className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-slate-800/70 border border-slate-700">
            <span className="text-xs shrink-0">🌐</span>
            <select
              value={browserLang}
              onChange={e => setBrowserLang(e.target.value as Language)}
              className="bg-transparent text-xs text-slate-300 focus:outline-none cursor-pointer"
              title="Language"
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
              <option value="ar">العربية</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
              <option value="ru">Русский</option>
            </select>
          </div>

          {/* Search engine selector */}
          <div className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-slate-800/70 border border-slate-700">
            <Search className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <select
              value={searchEngine}
              onChange={e => setSearchEngine(e.target.value as any)}
              className="bg-transparent text-xs text-slate-300 focus:outline-none cursor-pointer"
              title="Search engine"
            >
              <option value="auto">自动</option>
              <option value="bing">Bing</option>
              <option value="duckduckgo">DuckDuckGo</option>
              <option value="wikipedia">Wikipedia</option>
            </select>
          </div>

          <button
            onClick={handleAddBookmark}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-amber-400 border border-slate-700 transition-colors"
            title="Bookmark this page"
          >
            <Star className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setTabs(prev =>
                prev.map(t => (t.id === activeTabId ? { ...t, readerMode: !t.readerMode } : t))
              );
            }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              activeTab?.readerMode
                ? 'bg-cyan-950/80 text-cyan-300 border-cyan-500/50 shadow-sm'
                : 'bg-slate-800/70 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">纯净阅读模式</span>
          </button>

          <button
            onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              isAiPanelOpen
                ? 'bg-purple-950/80 text-purple-300 border-purple-500/60 shadow-md shadow-purple-500/20'
                : 'bg-slate-800/70 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">AI 伴侣</span>
          </button>

          <button
            onClick={() => setIsSavedDrawerOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/70 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors"
          >
            <Database className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden md:inline">已归档 ({savedArticles.length})</span>
          </button>
        </div>
      </div>

      {/* 3. Bookmarks Bar */}
      <div className="flex items-center gap-2 px-4 py-1.5 bg-[#050a18]/90 border-b border-slate-800/60 overflow-x-auto text-[11px]">
        <span className="text-slate-500 flex items-center font-semibold shrink-0">
          <Bookmark className="w-3 h-3 mr-1 text-slate-400" /> 书签:
        </span>
        {bookmarks.map(bm => (
          <button
            key={bm.id}
            onClick={() => handleNavigate(bm.url)}
            className="px-2.5 py-1 rounded-md bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-cyan-300 shrink-0 transition-colors"
          >
            {bm.title}
          </button>
        ))}
      </div>

      {saveSuccessMessage && (
        <div className="bg-emerald-950/90 border-b border-emerald-500/40 text-emerald-200 text-xs px-4 py-2 flex items-center space-x-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {/* 4. Split Layout */}
      <div className="flex-1 min-w-0 flex overflow-hidden">
        <div className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-8 bg-[#030714]">
          {searchResults.length > 0 || isSearching ? (
            <div className="max-w-3xl mx-auto">
              <div className="mb-6">
                <div className="flex items-center space-x-2 text-xs text-slate-400 mb-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800/60 font-medium">
                    全网搜索
                  </span>
                  {!isSearching && <span>约 {searchResults.length} 条结果</span>}
                </div>
                <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white leading-snug">
                  “{lastSearchQuery}”
                </h1>
              </div>

              {isSearching ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-4">
                  <RotateCw className="w-8 h-8 animate-spin text-blue-400" />
                  <span>正在搜索全网知识库...</span>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="text-center text-slate-500 py-16 space-y-3">
                  <p>没有找到相关结果。</p>
                  <p className="text-xs">可尝试更换关键词，或直接输入网址打开页面。</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {searchResults.map((result, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleNavigate(result.url)}
                      className="w-full text-left p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-900/80 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center space-x-2 text-[11px] text-emerald-400 font-mono truncate">
                        <Globe className="w-3 h-3 shrink-0" />
                        <span className="truncate">{result.url}</span>
                      </div>
                      <h2 className="mt-1 text-base sm:text-lg font-semibold text-blue-300 group-hover:text-cyan-300 transition-colors leading-snug">
                        {result.title}
                      </h2>
                      {result.snippet && (
                        <p className="mt-1 text-xs sm:text-sm text-slate-400 leading-relaxed line-clamp-2">
                          {result.snippet}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab ? (
            activeTab.readerMode ? (
              <div className="max-w-3xl mx-auto bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 sm:p-10 shadow-2xl backdrop-blur-sm">
                <div className="border-b border-slate-800 pb-6 mb-6">
                  <div className="flex items-center space-x-3 mb-3 text-xs text-slate-400">
                    <span className="px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-medium">
                      Reader Mode
                    </span>
                    <span>{activeTab.author || 'EARTH ONE Knowledge Archive'}</span>
                    <span>·</span>
                    <span>{activeTab.readTime || '3 min read'}</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white leading-snug">
                    {activeTab.title}
                  </h1>
                  <div className="mt-3 flex items-center space-x-2 text-xs text-cyan-400/80 font-mono">
                    <ExternalLink className="w-3.5 h-3.5" />
                    <a href={activeTab.url} target="_blank" rel="noreferrer" className="hover:underline truncate">
                      {activeTab.url}
                    </a>
                  </div>
                  <div className="mt-3 flex items-center space-x-2 flex-wrap gap-2">
                    <a
                      href={activeTab.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-sm transition-all"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>在新窗口打开</span>
                    </a>
                    <button
                      onClick={handleTranslatePage}
                      disabled={!activeTab.content || isTranslating}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 text-xs font-semibold border border-slate-700 transition-all"
                    >
                      {isTranslating ? (
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      )}
                      <span>翻译为{targetLanguageName[browserLang]}</span>
                    </button>
                    {showTranslation && translatedContent && (
                      <button
                        onClick={() => setShowTranslation(false)}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-purple-950/80 hover:bg-purple-900 text-purple-200 text-xs font-semibold border border-purple-600/50 transition-all"
                      >
                        <span>显示原文</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="prose prose-invert max-w-none text-slate-200 font-serif leading-relaxed text-base sm:text-lg space-y-5">
                  {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-3">
                      <RotateCw className="w-6 h-6 animate-spin text-cyan-400" />
                      <span>正在加载页面内容...</span>
                    </div>
                  ) : (showTranslation && translatedContent) ? (
                    <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/50">
                      {translatedContent.split('\n\n').map((paragraph, idx) => (
                        <p key={idx} className="leading-8">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  ) : activeTab.content ? (
                    activeTab.content.split('\n\n').map((paragraph, idx) => (
                      <p key={idx} className="leading-8">
                        {paragraph}
                      </p>
                    ))
                  ) : (
                    <p className="text-slate-400 italic">正在提取网页纯净正文或该站点允许直接访问...</p>
                  )}
                </div>

                <div className="mt-10 pt-6 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleSaveToLibrary}
                      className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs shadow-lg shadow-cyan-600/30 transition-all cursor-pointer"
                    >
                      <Database className="w-4 h-4" />
                      <span>保存至全球数字图书馆</span>
                    </button>
                    <button
                      onClick={() => handleRunAiAnalysis('summary')}
                      className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs shadow-lg shadow-purple-600/30 transition-all cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>AI 总结当前文章</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full h-full min-h-[600px] flex flex-col bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden relative">
                <iframe
                  src={activeTab.url}
                  title={activeTab.title}
                  className="w-full flex-1 border-0 bg-white"
                  sandbox="allow-scripts allow-same-origin allow-popups"
                />
              </div>
            )
          ) : null}
        </div>

        {isAiPanelOpen && (
          <aside className="w-80 sm:w-96 border-l border-slate-800 bg-[#060c22] flex flex-col overflow-hidden select-none">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#08102b]">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span className="font-semibold text-sm text-purple-200">AI 网页研究伴侣</span>
              </div>
              <button onClick={() => setIsAiPanelOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1 p-2 bg-[#050a1b] border-b border-slate-800 text-xs">
              <button
                onClick={() => handleRunAiAnalysis('summary')}
                className={`py-1.5 px-2 rounded-lg font-medium transition-all ${
                  aiAnalysisType === 'summary' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:bg-slate-800/60'
                }`}
              >
                核心总结
              </button>
              <button
                onClick={() => handleRunAiAnalysis('entities')}
                className={`py-1.5 px-2 rounded-lg font-medium transition-all ${
                  aiAnalysisType === 'entities' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:bg-slate-800/60'
                }`}
              >
                知识图谱
              </button>
              <button
                onClick={() => setAiAnalysisType('qa')}
                className={`py-1.5 px-2 rounded-lg font-medium transition-all ${
                  aiAnalysisType === 'qa' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:bg-slate-800/60'
                }`}
              >
                深度问答
              </button>
            </div>

            {aiAnalysisType === 'qa' && (
              <div className="p-3 border-b border-slate-800 bg-slate-900/60 flex items-center space-x-2">
                <input
                  type="text"
                  value={aiQuestion}
                  onChange={e => setAiQuestion(e.target.value)}
                  placeholder="针对当前页面向 AI 提问..."
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && aiQuestion.trim()) {
                      handleRunAiAnalysis('qa');
                    }
                  }}
                />
                <button
                  onClick={() => handleRunAiAnalysis('qa')}
                  disabled={!aiQuestion.trim() || isAiLoading}
                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium cursor-pointer"
                >
                  提问
                </button>
              </div>
            )}

            <div className="flex-1 p-4 overflow-y-auto text-xs leading-relaxed text-slate-300 space-y-3 font-sans">
              {isAiLoading ? (
                <div className="h-full flex flex-col items-center justify-center space-y-3 text-slate-400">
                  <RotateCw className="w-6 h-6 animate-spin text-purple-400" />
                  <span>正在深度解析页面知识体系...</span>
                </div>
              ) : aiOutput ? (
                <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 whitespace-pre-line shadow-inner">
                  {aiOutput}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-3 p-6">
                  <Sparkles className="w-8 h-8 text-slate-600" />
                  <p>点击上方按钮即可让 AI 分析、总结当前网页，并提取关键论据与知识实体。</p>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-slate-800 bg-[#08102b] flex items-center justify-between">
              <span className="text-[11px] text-slate-400">一键沉淀研究成果</span>
              <button
                onClick={handleSaveToLibrary}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>存入数字图书馆</span>
              </button>
            </div>
          </aside>
        )}
      </div>

      {isSavedDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-[#0a1128] border-l border-slate-800 h-full flex flex-col p-6 shadow-2xl animate-in slide-in-from-right">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Database className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-semibold text-white">已归档网页知识库</h3>
              </div>
              <button onClick={() => setIsSavedDrawerOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {savedArticles.length === 0 ? (
                <div className="text-center text-slate-500 py-12 text-xs">
                  暂无已归档文章。在浏览网页时点击「存入数字图书馆」即可长期保存。
                </div>
              ) : (
                savedArticles.map(art => (
                  <div
                    key={art.id}
                    className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/50 transition-all space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <h4 className="text-xs font-semibold text-white line-clamp-1">{art.title}</h4>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(art.savedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2">{art.aiSummary}</p>
                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <span className="text-cyan-400 font-mono truncate max-w-[200px]">{art.url}</span>
                      <button
                        onClick={() => {
                          setIsSavedDrawerOpen(false);
                          handleNavigate(art.url);
                        }}
                        className="text-purple-400 hover:underline flex items-center space-x-1"
                      >
                        <span>阅读</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
