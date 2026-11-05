import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Globe,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  RotateCw,
  Star,
  Bookmark,
  BookOpen,
  Sparkles,
  ExternalLink,
  X,
  Shield,
  CheckCircle,
  ChevronRight,
  Database,
  Search,
  BookmarkPlus,
  GitFork,
  Code2,
  Check,
  Clock3,
  Trash2,
  Download,
  FolderOpen,
  Printer,
  Bell,
  MapPin
} from 'lucide-react';
import { Language } from '../../types/index.ts';
import { BrowserFrame } from './BrowserFrame.tsx';

/**
 * Convert a YouTube / Vimeo watch URL into its embeddable endpoint so videos
 * play inside the browser viewport (the full sites block iframe embedding).
 * Non-video URLs are returned unchanged.
 */
function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
      let videoId = '';
      if (host === 'youtu.be') {
        videoId = u.pathname.split('/').filter(Boolean)[0] || '';
      } else if (u.pathname === '/watch') {
        videoId = u.searchParams.get('v') || '';
      } else if (u.pathname.startsWith('/shorts/')) {
        videoId = u.pathname.slice('/shorts/'.length);
      } else if (u.pathname.startsWith('/embed/')) {
        return url;
      }
      if (videoId) return `https://www.youtube.com/embed/${videoId}`;
    }

    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const m = u.pathname.match(/\/(\d+)/);
      if (m) return `https://player.vimeo.com/video/${m[1]}`;
    }
  } catch {
    // invalid URL — leave as-is
  }
  return url;
}

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

interface BrowserHistoryItem {
  id: string;
  tabId: string;
  title: string;
  url: string;
  visitedAt: string;
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

interface BrowserFindStatus {
  activeMatchOrdinal: number;
  matches: number;
  error?: string;
}

interface WebBrowserProps {
  lang: Language;
  initialQuery?: string;
}

const DEFAULT_BOOKMARKS: BookmarkItem[] = [
  { id: 'bm_nasa', title: 'NASA Earth Observatory', url: 'https://earthobservatory.nasa.gov', category: 'Science' },
  { id: 'bm_gutenberg', title: 'Project Gutenberg', url: 'https://www.gutenberg.org', category: 'Library' },
  { id: 'bm_arxiv', title: 'arXiv Astrophysics', url: 'https://arxiv.org/archive/astro-ph', category: 'Research' },
  { id: 'bm_sep', title: 'Stanford Encyclopedia of Philosophy', url: 'https://plato.stanford.edu', category: 'Philosophy' },
  { id: 'bm_wiki', title: 'Wikipedia Knowledge', url: 'https://en.wikipedia.org/wiki/Earth', category: 'Encyclopedia' }
];

const LOCAL_BOOKMARKS_KEY = 'earth-one.browser.bookmarks.v1';
const LOCAL_HISTORY_KEY = 'earth-one.browser.history.v1';
const MAX_LOCAL_BOOKMARKS = 200;
const MAX_LOCAL_HISTORY = 500;
const MAX_RESTORED_SESSION_TABS = 12;

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function formatDownloadBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  if (value < 1024) return `${Math.round(value)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

function readLocalList<T>(key: string, fallback: T[], validate: (value: unknown) => value is T, limit: number): T[] {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = window.localStorage.getItem(key);
    if (saved === null) return fallback;
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter(validate).slice(0, limit) : fallback;
  } catch {
    return fallback;
  }
}

function isBookmarkItem(value: unknown): value is BookmarkItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<BookmarkItem>;
  return typeof item.id === 'string' && item.id.length <= 128 &&
    typeof item.title === 'string' && item.title.length <= 300 &&
    typeof item.category === 'string' && item.category.length <= 100 && isHttpUrl(item.url);
}

function isBrowserHistoryItem(value: unknown): value is BrowserHistoryItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<BrowserHistoryItem>;
  return typeof item.id === 'string' && item.id.length <= 160 &&
    typeof item.tabId === 'string' && item.tabId.length <= 80 &&
    typeof item.title === 'string' && item.title.length <= 300 &&
    typeof item.visitedAt === 'string' && Number.isFinite(Date.parse(item.visitedAt)) && isHttpUrl(item.url);
}

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

function getInitialBrowserUrl(): string {
  const fallback = 'https://earthobservatory.nasa.gov';
  if (typeof window === 'undefined') return fallback;
  const requested = new URLSearchParams(window.location.search).get('browserUrl');
  if (!requested) return fallback;
  try {
    const parsed = new URL(requested);
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && !parsed.username && !parsed.password) {
      return parsed.href;
    }
  } catch {
    // Ignore invalid deep links and keep the established default page.
  }
  return fallback;
}

export const WebBrowser: React.FC<WebBrowserProps> = ({ lang, initialQuery }) => {
  const [initialUrl] = useState(getInitialBrowserUrl);
  const initialPreset = PRESET_PAGES[initialUrl];
  const browserEngine = typeof window === 'undefined' ? undefined : window.earthOneBrowser;
  const nativeViewportRef = useRef<HTMLDivElement | null>(null);
  const addressBarRef = useRef<HTMLInputElement | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);

  // Browser-local language (defaults to global app language; user can override)
  const [browserLang, setBrowserLang] = useState<Language>(lang);

  const [tabs, setTabs] = useState<BrowserTab[]>([
    {
      id: 'tab_1',
      title: initialPreset?.title || initialUrl,
      url: initialUrl,
      readerMode: !browserEngine,
      content: initialPreset?.content || '',
      author: initialPreset?.author || '',
      readTime: initialPreset?.readTime || ''
    }
  ]);
  const [activeTabId, setActiveTabId] = useState('tab_1');
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findStatus, setFindStatus] = useState<BrowserFindStatus | null>(null);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(() =>
    readLocalList(LOCAL_BOOKMARKS_KEY, DEFAULT_BOOKMARKS, isBookmarkItem, MAX_LOCAL_BOOKMARKS)
  );
  const [browserHistory, setBrowserHistory] = useState<BrowserHistoryItem[]>(() =>
    readLocalList(LOCAL_HISTORY_KEY, [], isBrowserHistoryItem, MAX_LOCAL_HISTORY)
  );
  const [isBrowserDataOpen, setIsBrowserDataOpen] = useState(false);
  const [isDownloadsOpen, setIsDownloadsOpen] = useState(false);
  const [downloads, setDownloads] = useState<EarthOneBrowserDownload[]>([]);
  const [downloadStorageWarning, setDownloadStorageWarning] = useState<string | null>(null);
  const [browserStorageWarning, setBrowserStorageWarning] = useState<string | null>(null);
  const [browserStorageReady, setBrowserStorageReady] = useState(!browserEngine?.getLocalData);
  const [browserStorageReadOnly, setBrowserStorageReadOnly] = useState(false);
  const [isSavedDrawerOpen, setIsSavedDrawerOpen] = useState(false);
  const [savedArticles, setSavedArticles] = useState<SavedArticle[]>([]);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Live search state
  const [searchResults, setSearchResults] = useState<Array<{ title: string; url: string; snippet: string; source?: 'web' | 'github'; repository?: string; stars?: number; forks?: number; language?: string; license?: string; updatedAt?: string; openIssues?: number }>>([]);
  const [lastSearchQuery, setLastSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Navigation history per tab (real back/forward)
  const [history, setHistory] = useState<Record<string, string[]>>({ tab_1: [initialUrl] });
  const [historyIndex, setHistoryIndex] = useState<Record<string, number>>({ tab_1: 0 });

  // Search engine selection
  const [searchEngine, setSearchEngine] = useState<'auto' | 'bing' | 'duckduckgo' | 'wikipedia' | 'github'>('auto');
  const [workspaceRepos, setWorkspaceRepos] = useState<string[]>(() =>
    bookmarks.filter(bookmark => bookmark.category === 'GitHub / 待审核接入').map(bookmark => bookmark.title)
  );

  // Sync browser language when the global app language changes
  useEffect(() => {
    setBrowserLang(lang);
  }, [lang]);

  useEffect(() => {
    if (!browserEngine?.getSessionState || !browserEngine.restoreSession) return;
    let cancelled = false;
    const loadSessionState = async () => {
      try {
        const state = await browserEngine.getSessionState();
        if (cancelled) return;
        setBrowserSessionEnabled(Boolean(state.enabled));
        setBrowserSessionReadOnly(Boolean(state.readOnly));
        setBrowserSessionWarning(state.warning || null);

        const restoredTabs = state.enabled && Array.isArray(state.tabs)
          ? state.tabs.filter(tab => tab && typeof tab.id === 'string' && isHttpUrl(tab.url))
            .slice(0, MAX_RESTORED_SESSION_TABS)
            .map(tab => ({
              id: tab.id,
              title: tab.title || new URL(tab.url).host,
              url: tab.url,
              readerMode: !browserEngine
            }))
          : [];

        if (restoredTabs.length > 0) {
          const activeId = state.activeTabId && restoredTabs.some(tab => tab.id === state.activeTabId)
            ? state.activeTabId
            : restoredTabs[0].id;
          restoredTabIdsRef.current = new Set(restoredTabs.map(tab => tab.id));
          setTabs(restoredTabs);
          setActiveTabId(activeId);
          setInputUrl(restoredTabs.find(tab => tab.id === activeId)?.url || restoredTabs[0].url);
          setHistory(Object.fromEntries(restoredTabs.map(tab => [tab.id, [tab.url]])));
          setHistoryIndex(Object.fromEntries(restoredTabs.map(tab => [tab.id, 0])));
          setSessionRestoreNotice({ kind: 'restoring', restoredCount: restoredTabs.length, failedCount: 0 });
          const restorePromise = browserEngine.restoreSession();
          setBrowserSessionSettingsReady(true);
          void restorePromise.then(result => {
            if (cancelled) return;
            const failedCount = result.tabs.filter(tab => !tab.success).length;
            setSessionRestoreNotice({
              kind: failedCount > 0 ? 'failed' : 'restored',
              restoredCount: restoredTabs.length,
              failedCount
            });
          }).catch(() => {
            if (!cancelled) setSessionRestoreNotice({ kind: 'failed', restoredCount: restoredTabs.length, failedCount: restoredTabs.length });
          });
          return;
        }

        restoredTabIdsRef.current.clear();
        setSessionRestoreNotice(null);
      } catch {
        if (cancelled) return;
        setBrowserSessionReadOnly(true);
        setBrowserSessionWarning('无法读取本机标签恢复设置；为避免覆盖原文件，当前不会写入或清除它。');
      }
      if (!cancelled) setBrowserSessionSettingsReady(true);
    };
    void loadSessionState();
    return () => { cancelled = true; };
  }, [browserEngine]);

  useEffect(() => {
    if (!browserEngine?.getPermissionState || !browserEngine.onPermissions) return;
    let cancelled = false;
    const unsubscribe = browserEngine.onPermissions(state => {
      if (!cancelled) setBrowserPermissionState(state);
    });
    void browserEngine.getPermissionState().then(state => {
      if (!cancelled) setBrowserPermissionState(state);
    }).catch(() => {});
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [browserEngine]);

  useEffect(() => {
    if (!browserEngine?.getLocalData) {
      setBrowserStorageReady(true);
      return;
    }
    let cancelled = false;
    browserEngine.getLocalData().then(data => {
      if (cancelled) return;
      const loadedBookmarks = Array.isArray(data.bookmarks) ? data.bookmarks.filter(isBookmarkItem).slice(0, MAX_LOCAL_BOOKMARKS) : [];
      const loadedHistory = Array.isArray(data.history) ? data.history.filter(isBrowserHistoryItem).slice(0, MAX_LOCAL_HISTORY) : [];
      setBookmarks(data.initialized ? loadedBookmarks : DEFAULT_BOOKMARKS);
      setBrowserHistory(previous => {
        const byId = new Map<string, BrowserHistoryItem>();
        [...loadedHistory, ...previous].forEach(item => byId.set(item.id, item));
        return [...byId.values()].sort((a, b) => Date.parse(b.visitedAt) - Date.parse(a.visitedAt)).slice(0, MAX_LOCAL_HISTORY);
      });
      setWorkspaceRepos(loadedBookmarks.filter(bookmark => bookmark.category === 'GitHub / 待审核接入').map(bookmark => bookmark.title));
      setBrowserStorageReadOnly(Boolean(data.readOnly));
      setBrowserStorageWarning(data.warning || null);
      setBrowserStorageReady(true);
    }).catch(() => {
      if (cancelled) return;
      setBrowserStorageReadOnly(true);
      setBrowserStorageWarning('无法读取此设备上的本机浏览数据；为避免误覆盖，当前会话不会写入或清空它。');
      setBrowserStorageReady(true);
    });
    return () => { cancelled = true; };
  }, [browserEngine]);

  useEffect(() => {
    if (!browserStorageReady || browserStorageReadOnly) return;
    if (browserEngine?.saveLocalData) {
      browserEngine.saveLocalData({ bookmarks, history: browserHistory }).then(result => {
        if (!result.success) {
          setBrowserStorageReadOnly(true);
          setBrowserStorageWarning(result.error || '本机浏览数据无法保存到此设备。');
        }
      }).catch(() => {
        setBrowserStorageReadOnly(true);
        setBrowserStorageWarning('本机浏览数据无法保存到此设备。');
      });
      return;
    }
    try {
      window.localStorage.setItem(LOCAL_BOOKMARKS_KEY, JSON.stringify(bookmarks));
      window.localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(browserHistory));
    } catch {
      setBrowserStorageWarning('本地存储不可用；书签和历史不会同步到服务器，关闭页面后可能无法保留。');
    }
  }, [browserEngine, browserStorageReady, browserStorageReadOnly, bookmarks, browserHistory]);

  // AI Web Companion State
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [aiAnalysisType, setAiAnalysisType] = useState<'summary' | 'entities' | 'qa'>('summary');
  const [aiOutput, setAiOutput] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');

  // Page translation state
  const [translatedContent, setTranslatedContent] = useState<string>('');
  const [showTranslation, setShowTranslation] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [browserEngineState, setBrowserEngineState] = useState<EarthOneBrowserState | null>(null);
  const [browserEngineError, setBrowserEngineError] = useState<string | null>(null);
  const [browserPrintPending, setBrowserPrintPending] = useState(false);
  const [browserPrintMessage, setBrowserPrintMessage] = useState<string | null>(null);
  const [browserSessionSettingsReady, setBrowserSessionSettingsReady] = useState(!browserEngine?.getSessionState);
  const [browserSessionEnabled, setBrowserSessionEnabled] = useState(false);
  const [browserSessionReadOnly, setBrowserSessionReadOnly] = useState(false);
  const [browserSessionWarning, setBrowserSessionWarning] = useState<string | null>(null);
  const [browserSessionTogglePending, setBrowserSessionTogglePending] = useState(false);
  const [browserPermissionState, setBrowserPermissionState] = useState<EarthOneBrowserPermissionState>({ pending: [], grants: [] });
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [sessionRestoreNotice, setSessionRestoreNotice] = useState<{
    kind: 'restoring' | 'restored' | 'failed';
    restoredCount: number;
    failedCount: number;
  } | null>(null);
  const restoredTabIdsRef = useRef<Set<string>>(new Set());
  const engineManagedTabIdsRef = useRef<Set<string>>(new Set());

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  const openFindBar = useCallback(() => {
    if (!browserEngine) return;
    setIsFindOpen(true);
    window.requestAnimationFrame(() => findInputRef.current?.focus());
  }, [browserEngine]);

  const closeFindBar = useCallback((returnFocus = true) => {
    setIsFindOpen(false);
    setFindQuery('');
    setFindStatus(null);
    void browserEngine?.stopFindInPage(returnFocus).catch(() => {});
  }, [browserEngine]);

  const handleSavePdf = useCallback(async () => {
    if (!browserEngine?.printToPdf || activeTab?.readerMode || isLoading || browserEngineState?.tabId !== activeTabId) return;
    setBrowserPrintPending(true);
    setBrowserPrintMessage(null);
    try {
      const result = await browserEngine.printToPdf();
      if (result.success) setBrowserPrintMessage('PDF 已保存到你选择的本机位置。');
      else if (result.cancelled) setBrowserPrintMessage('已取消保存 PDF。');
      else setBrowserPrintMessage(result.error || '无法保存此网页的 PDF。');
    } catch {
      setBrowserPrintMessage('无法保存此网页的 PDF。');
    } finally {
      setBrowserPrintPending(false);
    }
  }, [browserEngine, activeTab?.readerMode, activeTabId, browserEngineState?.tabId, isLoading]);

  const runBrowserFind = useCallback((query: string, direction: EarthOneBrowserFindDirection) => {
    if (!browserEngine) return;
    if (!query.trim()) {
      setFindStatus(null);
      void browserEngine.stopFindInPage(false).catch(() => {});
      return;
    }
    if (direction === 'new') setFindStatus(null);
    void browserEngine.findInPage(query, direction).then(result => {
      if (!result.success) setFindStatus({ activeMatchOrdinal: 0, matches: 0, error: result.error || '无法查找当前页面。' });
    }).catch(() => setFindStatus({ activeMatchOrdinal: 0, matches: 0, error: '无法查找当前页面。' }));
  }, [browserEngine]);

  useEffect(() => {
    if (!browserEngine) return;
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f') return;
      event.preventDefault();
      openFindBar();
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [browserEngine, openFindBar]);

  useEffect(() => {
    setIsFindOpen(false);
    setFindQuery('');
    setFindStatus(null);
    setBrowserPrintMessage(null);
  }, [activeTabId]);

  const recordBrowserVisit = useCallback((tabId: string, url: string, title: string) => {
    if (!isHttpUrl(url)) return;
    const safeTitle = (title || new URL(url).hostname).slice(0, 300);
    setBrowserHistory(previous => {
      const latest = previous[0];
      if (latest?.tabId === tabId && latest.url === url) {
        return latest.title === safeTitle ? previous : [{ ...latest, title: safeTitle }, ...previous.slice(1)];
      }
      return [{
        id: `visit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tabId,
        title: safeTitle,
        url,
        visitedAt: new Date().toISOString()
      }, ...previous].slice(0, MAX_LOCAL_HISTORY);
    });
  }, []);

  const updateRecentVisitTitle = useCallback((tabId: string, url: string, title: string) => {
    if (!title) return;
    setBrowserHistory(previous => {
      const latest = previous[0];
      if (!latest || latest.tabId !== tabId || latest.url !== url || latest.title === title) return previous;
      return [{ ...latest, title: title.slice(0, 300) }, ...previous.slice(1)];
    });
  }, []);

  useEffect(() => {
    if (!browserEngine) return;
    void browserEngine.setActive(true);
    return () => {
      void browserEngine.setBounds(null);
      void browserEngine.setActive(false);
    };
  }, [browserEngine]);

  useEffect(() => {
    if (!browserEngine || !activeTab || !browserSessionSettingsReady || restoredTabIdsRef.current.has(activeTabId)) return;
    if (engineManagedTabIdsRef.current.delete(activeTabId)) return;
    browserEngine.selectTab(activeTabId, activeTab.url).then(result => {
      if (!result.success) setBrowserEngineError(result.error || 'Chromium 网页无法打开。');
      else setBrowserEngineError(null);
    }).catch(error => setBrowserEngineError(error?.message || 'Chromium 引擎暂不可用。'));
  }, [browserEngine, activeTabId, browserSessionSettingsReady]);

  useEffect(() => {
    if (!browserEngine?.onNewTab) return;
    return browserEngine.onNewTab(tab => {
      if (!tab || typeof tab.tabId !== 'string' || !/^tab_[a-zA-Z0-9_-]{1,64}$/.test(tab.tabId) || !isHttpUrl(tab.url)) return;
      const url = new URL(tab.url).href;
      const title = typeof tab.title === 'string' && tab.title.trim()
        ? tab.title.slice(0, 300)
        : new URL(url).hostname;
      engineManagedTabIdsRef.current.add(tab.tabId);
      setTabs(previous => previous.some(existing => existing.id === tab.tabId)
        ? previous.map(existing => existing.id === tab.tabId ? { ...existing, url, title } : existing)
        : [...previous, { id: tab.tabId, title, url, readerMode: false }]);
      setActiveTabId(tab.tabId);
      setInputUrl(url);
      setHistory(previous => ({ ...previous, [tab.tabId]: [url] }));
      setHistoryIndex(previous => ({ ...previous, [tab.tabId]: 0 }));
      setSearchResults([]);
      setBrowserEngineError(null);
    });
  }, [browserEngine]);

  useEffect(() => {
    if (!browserEngine) return;
    return browserEngine.onState(state => {
      setBrowserEngineState(state);
      setIsLoading(state.loading);
      if (state.navigated && state.url) recordBrowserVisit(state.tabId, state.url, state.title);
      else if (state.url && state.title) updateRecentVisitTitle(state.tabId, state.url, state.title);
      if (state.url) {
        setTabs(previous => previous.map(tab => tab.id === state.tabId
          ? { ...tab, url: state.url, title: state.title || tab.title }
          : tab));
        if (state.tabId === activeTabId) setInputUrl(state.url);
      }
    });
  }, [browserEngine, activeTabId, recordBrowserVisit, updateRecentVisitTitle]);

  useEffect(() => {
    if (!browserEngine?.getDownloads || !browserEngine.onDownloads) {
      setDownloads([]);
      setDownloadStorageWarning(null);
      return;
    }
    let cancelled = false;
    let receivedPush = false;
    const unsubscribe = browserEngine.onDownloads((records, status) => {
      receivedPush = true;
      setDownloads(Array.isArray(records) ? records : []);
      setDownloadStorageWarning(status?.warning || null);
    });
    browserEngine.getDownloads().then(records => {
      if (!cancelled && !receivedPush) setDownloads(Array.isArray(records) ? records : []);
    }).catch(() => {
      if (!cancelled) setDownloads([]);
    });
    browserEngine.getDownloadStorageStatus?.().then(status => {
      if (!cancelled) setDownloadStorageWarning(status?.warning || null);
    }).catch(() => {
      if (!cancelled) setDownloadStorageWarning('无法读取本机下载记录状态。');
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [browserEngine]);

  useEffect(() => {
    if (!browserEngine && activeTab) recordBrowserVisit(activeTab.id, activeTab.url, activeTab.title);
  }, [browserEngine, activeTab?.id, activeTab?.url, activeTab?.title, recordBrowserVisit]);

  useEffect(() => {
    if (!browserEngine) return;
    return browserEngine.onFocusAddressBar(tabId => {
      if (tabId !== activeTabId || !addressBarRef.current) return;
      addressBarRef.current.focus();
      addressBarRef.current.select();
    });
  }, [browserEngine, activeTabId]);

  useEffect(() => {
    if (!browserEngine?.onFocusFind) return;
    return browserEngine.onFocusFind(tabId => {
      if (tabId === activeTabId) openFindBar();
    });
  }, [browserEngine, activeTabId, openFindBar]);

  useEffect(() => {
    if (!browserEngine?.onFindResult) return;
    return browserEngine.onFindResult(result => {
      if (result.tabId !== activeTabId) return;
      if (result.cleared) {
        setFindQuery('');
        setFindStatus(null);
        return;
      }
      setFindStatus({ activeMatchOrdinal: result.activeMatchOrdinal, matches: result.matches });
    });
  }, [browserEngine, activeTabId]);

  useEffect(() => {
    if (!browserEngine) return;
    const syncViewport = () => {
      const element = nativeViewportRef.current;
      const mobileAiOverlay = isAiPanelOpen && window.innerWidth < 768;
      if (!element || !activeTab || activeTab.readerMode || searchResults.length > 0 || isSearching || isSavedDrawerOpen || isBrowserDataOpen || isDownloadsOpen || mobileAiOverlay) {
        void browserEngine.setBounds(null);
        return;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        void browserEngine.setBounds(null);
        return;
      }
      void browserEngine.setBounds({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    };
    const scheduleSync = () => window.requestAnimationFrame(syncViewport);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleSync) : null;
    if (nativeViewportRef.current) observer?.observe(nativeViewportRef.current);
    window.addEventListener('resize', scheduleSync);
    document.addEventListener('scroll', scheduleSync, true);
    scheduleSync();
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', scheduleSync);
      document.removeEventListener('scroll', scheduleSync, true);
      void browserEngine.setBounds(null);
    };
  }, [browserEngine, activeTabId, activeTab?.readerMode, searchResults.length, isSearching, isSavedDrawerOpen, isBrowserDataOpen, isDownloadsOpen, isAiPanelOpen]);

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

    // Bare hosts with ports (for example localhost:3000) are URLs, not schemes.
    const isBareHttpHost = /^(?:localhost(?::\d+)?|(?:[\w-]+\.)+[\w-]+(?::\d+)?|[\w-]+:\d+|\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?|\[[\da-f:]+\](?::\d+)?)(?:[/?#]|$)/i.test(cleanUrl);
    const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(cleanUrl) && !isBareHttpHost && !/\s/.test(cleanUrl);
    const bareHostPort = isBareHttpHost && /:\d+(?:[/?#]|$)/.test(cleanUrl) && !/^https?:\/\//i.test(cleanUrl);
    // A search term without a URL scheme, a dotted host, or an explicit host:port -> run live web search.
    const looksLikeUrl =
      /^https?:\/\//i.test(cleanUrl) ||
      hasScheme ||
      (browserEngine && isBareHttpHost) ||
      (!bareHostPort && cleanUrl.includes('.') && !cleanUrl.includes(' '));

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

    if (hasScheme && !/^https?:\/\//i.test(cleanUrl)) {
      setBrowserEngineError('出于安全考虑，只支持 HTTP 或 HTTPS 网页地址。');
      return;
    }

    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = 'https://' + cleanUrl;
    }

    setIsLoading(true);
    setInputUrl(cleanUrl);
    setSearchResults([]);
    pushHistory(activeTabId, cleanUrl);
    recordBrowserVisit(activeTabId, cleanUrl, new URL(cleanUrl).hostname);

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
    if (browserEngine) {
      const result = await browserEngine.navigate(activeTabId, cleanUrl);
      if (!result.success) {
        setBrowserEngineError(result.error || 'Chromium 网页无法打开。');
        setIsLoading(false);
        return;
      }
      setBrowserEngineError(null);
      setTabs(prev => prev.map(tab => tab.id === activeTabId
        ? preset
          ? { ...tab, url: cleanUrl, title: preset.title, content: preset.content, author: preset.author, readTime: preset.readTime }
          : { ...tab, url: cleanUrl, title: tab.title === 'Loading…' ? new URL(cleanUrl).hostname : tab.title, content: '', author: cleanUrl, readTime: '' }
        : tab));
      setIsLoading(false);
      return;
    }

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
      readerMode: !browserEngine,
      content: PRESET_PAGES['https://en.wikipedia.org/wiki/Earth'].content,
      author: PRESET_PAGES['https://en.wikipedia.org/wiki/Earth'].author,
      readTime: PRESET_PAGES['https://en.wikipedia.org/wiki/Earth'].readTime
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newId);
    setHistory(prev => ({ ...prev, [newId]: [newTab.url] }));
    setHistoryIndex(prev => ({ ...prev, [newId]: 0 }));
    setSearchResults([]);
    recordBrowserVisit(newId, newTab.url, newTab.title);
  };

  const goBack = () => {
    if (browserEngine) {
      void browserEngine.goBack(activeTabId);
      return;
    }
    const stack = history[activeTabId] || [];
    const idx = historyIndex[activeTabId] ?? 0;
    if (idx <= 0) return;
    const target = stack[idx - 1];
    setHistoryIndex(prev => ({ ...prev, [activeTabId]: idx - 1 }));
    handleNavigate(target);
  };

  const goForward = () => {
    if (browserEngine) {
      void browserEngine.goForward(activeTabId);
      return;
    }
    const stack = history[activeTabId] || [];
    const idx = historyIndex[activeTabId] ?? 0;
    if (idx >= stack.length - 1) return;
    const target = stack[idx + 1];
    setHistoryIndex(prev => ({ ...prev, [activeTabId]: idx + 1 }));
    handleNavigate(target);
  };

  // 星图联动：从宇宙引擎点击行星进入浏览器时，自动以行星名触发搜索
  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      void handleNavigate(initialQuery.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  // 网页预览：通过后端代理抓取原始 HTML，注入 base href 后写入 iframe srcdoc
  const loadPreviewHtml = async (url: string) => {
    setIsPreviewLoading(true);
    setPreviewHtml(null);
    try {
      const res = await fetch(`/api/browser/raw-html?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        let html = await res.text();
        try {
          const origin = new URL(url).origin;
          html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${origin}/">`);
        } catch {
          /* keep raw html */
        }
        setPreviewHtml(html);
      } else {
        setPreviewHtml(null);
      }
    } catch {
      setPreviewHtml(null);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    void browserEngine?.closeTab(id);
    const remaining = tabs.filter(t => t.id !== id);
    setTabs(remaining);
    if (activeTabId === id) {
      setActiveTabId(remaining[0].id);
    }
  };

  const handleToggleSessionRestore = async () => {
    if (!browserEngine?.setSessionEnabled || browserSessionReadOnly || browserSessionTogglePending) return;
    setBrowserSessionTogglePending(true);
    try {
      const result = await browserEngine.setSessionEnabled(!browserSessionEnabled);
      if (!result.success) {
        setBrowserSessionWarning(result.error || '无法更新本机标签恢复设置。');
        return;
      }
      setBrowserSessionEnabled(result.enabled);
      setBrowserSessionWarning(null);
      if (!result.enabled) setSessionRestoreNotice(null);
    } catch {
      setBrowserSessionWarning('无法更新本机标签恢复设置。');
    } finally {
      setBrowserSessionTogglePending(false);
    }
  };

  const handleResolveBrowserPermission = async (requestId: string, decision: 'allow' | 'deny') => {
    if (!browserEngine?.resolvePermissionRequest) return;
    try {
      const result = await browserEngine.resolvePermissionRequest(requestId, decision);
      if (!result.success) {
        const latest = await browserEngine.getPermissionState();
        setBrowserPermissionState(latest);
      }
    } catch {
      const latest = await browserEngine.getPermissionState().catch(() => null);
      if (latest) setBrowserPermissionState(latest);
    }
  };

  const handleRevokeBrowserPermission = async (origin: string, permission: EarthOneBrowserPermission) => {
    if (!browserEngine?.revokePermission) return;
    try {
      await browserEngine.revokePermission(origin, permission);
      setBrowserPermissionState(await browserEngine.getPermissionState());
    } catch {
      // The main process remains the source of truth for the session permission list.
    }
  };

  const handleRevokeAllBrowserPermissions = async () => {
    if (!browserEngine?.revokeAllPermissions) return;
    try {
      await browserEngine.revokeAllPermissions();
      setBrowserPermissionState(await browserEngine.getPermissionState());
    } catch {
      // Keep the last verified list if IPC is unavailable.
    }
  };

  const handleAddBookmark = () => {
    if (!browserStorageReady || browserStorageReadOnly || !activeTab || !isHttpUrl(activeTab.url)) return;
    if (bookmarks.some(bookmark => bookmark.url === activeTab.url)) {
      setSaveSuccessMessage('此页面已在本机书签中。');
      window.setTimeout(() => setSaveSuccessMessage(null), 3000);
      return;
    }
    const bookmark: BookmarkItem = {
      id: `bm_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: activeTab.title || new URL(activeTab.url).hostname,
      url: activeTab.url,
      category: '本机书签'
    };
    setBookmarks(previous => [bookmark, ...previous].slice(0, MAX_LOCAL_BOOKMARKS));
    setSaveSuccessMessage('已保存到此设备的本机书签；不会同步到服务器。');
    window.setTimeout(() => setSaveSuccessMessage(null), 3500);
  };

  const handleRemoveBookmark = (bookmarkId: string) => {
    if (!browserStorageReady || browserStorageReadOnly) return;
    const removed = bookmarks.find(bookmark => bookmark.id === bookmarkId);
    setBookmarks(previous => previous.filter(bookmark => bookmark.id !== bookmarkId));
    if (removed?.category === 'GitHub / 待审核接入') {
      setWorkspaceRepos(previous => previous.filter(repository => repository !== removed.title));
    }
  };

  const handleClearLocalBookmarks = () => {
    if (!browserStorageReady || browserStorageReadOnly || !bookmarks.length || !window.confirm('确定清空此设备上的全部浏览器书签吗？此操作不可撤销。')) return;
    setBookmarks([]);
    setWorkspaceRepos([]);
    setSaveSuccessMessage('本机书签已清空；浏览历史未受影响。');
    window.setTimeout(() => setSaveSuccessMessage(null), 3500);
  };

  const handleClearLocalHistory = () => {
    if (!browserStorageReady || browserStorageReadOnly || !browserHistory.length || !window.confirm('确定清空此设备上的全部浏览历史吗？此操作不可撤销。')) return;
    setBrowserHistory([]);
    setSaveSuccessMessage('本机浏览历史已清空；书签未受影响。');
    window.setTimeout(() => setSaveSuccessMessage(null), 3500);
  };

  const handleAddGitHubToWorkspace = (result: typeof searchResults[number]) => {
    if (!browserStorageReady || browserStorageReadOnly || !result.repository || !isHttpUrl(result.url) || workspaceRepos.includes(result.repository)) return;
    const bookmark: BookmarkItem = {
      id: `bm_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: result.repository,
      url: result.url,
      category: 'GitHub / 待审核接入'
    };
    setWorkspaceRepos(previous => [...previous, result.repository as string]);
    setBookmarks(previous => [bookmark, ...previous.filter(item => item.url !== result.url)].slice(0, MAX_LOCAL_BOOKMARKS));
    setSaveSuccessMessage('已保存为本机工作区候选书签。请检查许可证、依赖和安全性后再决定是否接入。');
    setTimeout(() => setSaveSuccessMessage(null), 4500);
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
    if (browserEngine && !activeTab.content?.trim()) {
      setSaveSuccessMessage('桌面 Chromium 模式不会把当前网址交给服务器提取正文；此页目前没有可归档的正文。');
      setTimeout(() => setSaveSuccessMessage(null), 4500);
      return;
    }
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
    if (browserEngine && !activeTab.content?.trim()) {
      setAiOutput('为避免服务器代访当前网址，桌面 Chromium 模式不会自动提取网页正文。此页暂无可分析正文，请直接在上方 Chromium 页面阅读。');
      setIsAiLoading(false);
      return;
    }
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
    <div className="flex min-h-[calc(100vh-4rem)] min-w-0 flex-1 flex-col bg-[#05080d] p-3 text-slate-100 sm:p-5">
      <BrowserFrame
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
      >

      {/* 2. Omnibox Toolbar */}
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-white/[0.06] bg-[#0d151d] px-3 py-3 sm:px-5">
        <div className="flex shrink-0 items-center gap-0.5 rounded-xl border border-white/[0.06] bg-white/[0.025] p-1 text-slate-400">
          <button
            onClick={goBack}
            disabled={browserEngine
              ? !(browserEngineState?.tabId === activeTabId && browserEngineState.canGoBack)
              : (historyIndex[activeTabId] ?? 0) <= 0}
            className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="后退"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goForward}
            disabled={browserEngine
              ? !(browserEngineState?.tabId === activeTabId && browserEngineState.canGoForward)
              : (historyIndex[activeTabId] ?? 0) >= (history[activeTabId]?.length ?? 1) - 1}
            className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="前进"
            title="Forward"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => browserEngine ? void browserEngine.reload(activeTabId) : void handleNavigate(inputUrl)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.07] hover:text-white ${
              isLoading ? 'animate-spin text-cyan-400' : ''
            }`}
            aria-label="重新加载"
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
          className="flex min-h-10 min-w-[220px] flex-1 items-center rounded-full border border-white/[0.09] bg-[#080f16] px-4 shadow-inner transition-all focus-within:border-cyan-400/50 focus-within:ring-2 focus-within:ring-cyan-400/10"
        >
          <Shield className="w-3.5 h-3.5 text-emerald-400 mr-2 shrink-0" />
          <input
            ref={addressBarRef}
            type="text"
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            aria-label="输入网址或搜索词"
            placeholder="输入网址或知识关键词 (如: https://earthobservatory.nasa.gov)..."
            className="w-full bg-transparent text-sm text-slate-200 placeholder-slate-500 focus:outline-none"
          />
          {inputUrl && (
            <button
              type="button"
              onClick={() => setInputUrl('')}
              className="text-slate-500 hover:text-slate-300 ml-1.5"
              aria-label="清空地址栏"
              title="清空地址栏"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </form>

        <button
          type="button"
          onClick={openFindBar}
          disabled={!browserEngine}
          aria-label="在当前网页中查找"
          title={browserEngine ? '在当前网页中查找（Ctrl+F / Cmd+F）' : '普通 Web 预览不支持内嵌页内查找；浏览器原有快捷键保持不变。'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.035] text-slate-300 transition hover:bg-white/[0.08] hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Search className="h-4 w-4" />
        </button>

        <div className="inline-flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handleSavePdf()}
            disabled={!browserEngine || browserPrintPending || isLoading || activeTab?.readerMode || browserEngineState?.tabId !== activeTabId}
            aria-label={browserEngine ? '保存当前 Chromium 网页为 PDF' : '保存 PDF（普通 Web 预览不支持）'}
            title={!browserEngine
              ? '普通 Web 网页预览不支持 Chromium 打印为 PDF；请在桌面版真实 Chromium 标签页中使用。'
              : activeTab?.readerMode
                ? '请先退出纯净阅读模式；PDF 仅从当前可见的 Chromium 网页生成。'
                : '使用系统保存对话框将当前可见 Chromium 网页保存为 PDF。'}
            data-browser-print
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.035] px-3 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08] hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Printer className="h-3.5 w-3.5 text-cyan-300" />
            <span>{browserPrintPending ? '正在保存…' : '保存 PDF'}</span>
          </button>
          {!browserEngine && <span className="text-[10px] text-amber-200/80">网页预览不支持 Chromium PDF</span>}
        </div>

        <div
          role="status"
          aria-label={browserEngine ? '真实 Chromium 浏览器引擎' : '网页预览模式'}
          title={browserEngine
            ? '此桌面版由 Electron 内嵌的 Chromium 渲染网页'
            : '此 Web 版为网页预览，不具备桌面浏览器引擎'}
          className={`inline-flex min-h-8 shrink-0 items-center rounded-full border px-3 text-[11px] font-medium ${
            browserEngine
              ? 'border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-200'
              : 'border-amber-300/20 bg-amber-300/[0.05] text-amber-200'
          }`}
        >
          {browserEngine ? '真实 Chromium' : '网页预览'}
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 sm:w-auto">
          {browserEngine && browserSessionSettingsReady && (
            <button
              type="button"
              onClick={() => void handleToggleSessionRestore()}
              disabled={browserSessionReadOnly || browserSessionTogglePending}
              aria-label="启动时恢复上次打开的标签"
              aria-pressed={browserSessionEnabled}
              title="默认关闭。开启后仅在此设备保存最多 12 个 HTTP(S) 标签地址；普通查询参数保留，片段移除；含 token、auth、code、key、password、session、credential 等敏感查询键的网址不会保存。不保存 Cookie 或表单内容。关闭时会清除标签快照。"
              data-browser-session-toggle
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${browserSessionEnabled ? 'border-cyan-300/25 bg-cyan-300/[0.08] text-cyan-100' : 'border-white/[0.07] bg-white/[0.035] text-slate-300 hover:bg-white/[0.08]'}`}
            >
              <Clock3 className="h-3.5 w-3.5" />
              <span>启动恢复：{browserSessionEnabled ? '开' : '关'}</span>
            </button>
          )}

          {/* Language selector (controls search result language) */}
          <div className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.035] px-3">
            <Globe className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <select
              value={browserLang}
              onChange={e => setBrowserLang(e.target.value as Language)}
              className="cursor-pointer bg-transparent text-xs text-slate-300 focus:outline-none"
              aria-label="搜索结果语言"
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
          <div className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.035] px-3">
            <Search className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <select
              value={searchEngine}
              onChange={e => setSearchEngine(e.target.value as any)}
              className="cursor-pointer bg-transparent text-xs text-slate-300 focus:outline-none"
              aria-label="搜索引擎"
              title="Search engine"
            >
              <option value="auto">自动</option>
              <option value="bing">Bing</option>
              <option value="duckduckgo">DuckDuckGo</option>
              <option value="wikipedia">Wikipedia</option>
              <option value="github">GitHub 开源项目</option>
            </select>
          </div>

          <button
            onClick={handleAddBookmark}
            disabled={!browserStorageReady || browserStorageReadOnly}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.035] text-amber-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="收藏当前页面"
            title="Bookmark this page"
          >
            <Star className="w-4 h-4" />
          </button>

          <button
            onClick={() => { setIsDownloadsOpen(false); setIsBrowserDataOpen(true); }}
            disabled={!browserStorageReady}
            aria-label="打开本地浏览数据"
            title="本机书签与浏览历史"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.035] px-3 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08]"
          >
            <Clock3 className="h-3.5 w-3.5 text-cyan-300" />
            <span>本地记录 ({browserHistory.length})</span>
          </button>

          {browserEngine && (
            <button
              onClick={() => {
                setIsBrowserDataOpen(false);
                setIsDownloadsOpen(true);
                void browserEngine.getDownloads().then(setDownloads).catch(() => {});
              }}
              aria-label={`打开下载管理器，共 ${downloads.length} 项`}
              title="下载管理器"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.035] px-3 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08]"
            >
              <Download className="h-3.5 w-3.5 text-cyan-300" />
              <span>下载 ({downloads.length})</span>
            </button>
          )}

          {browserEngine && (
            <button
              type="button"
              onClick={() => setIsPermissionsOpen(true)}
              aria-label={`查看会话站点权限，共 ${browserPermissionState.grants.reduce((sum, grant) => sum + grant.permissions.length, 0)} 项授权`}
              title="仅本次应用运行有效；可随时撤销"
              data-browser-permissions-toggle
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.035] px-3 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08]"
            >
              <Shield className="h-3.5 w-3.5 text-emerald-300" />
              <span>站点权限 ({browserPermissionState.grants.reduce((sum, grant) => sum + grant.permissions.length, 0)})</span>
            </button>
          )}

          <button
            onClick={() => {
              const willPreview = activeTab?.readerMode;
              setTabs(prev =>
                prev.map(t => (t.id === activeTabId ? { ...t, readerMode: !t.readerMode } : t))
              );
              if (willPreview && activeTab?.url) void loadPreviewHtml(activeTab.url);
            }}
            aria-label="切换纯净阅读模式"
            title="切换纯净阅读模式"
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-all ${
              activeTab?.readerMode
                ? 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100 shadow-sm shadow-cyan-950/30'
                : 'border-white/[0.07] bg-white/[0.035] text-slate-300 hover:bg-white/[0.08]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">纯净阅读模式</span>
          </button>

          <button
            onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
            aria-label={isAiPanelOpen ? '关闭 AI 伴侣' : '打开 AI 伴侣'}
            title={isAiPanelOpen ? '关闭 AI 伴侣' : '打开 AI 伴侣'}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-all ${
              isAiPanelOpen
                ? 'border-violet-300/25 bg-violet-300/10 text-violet-100 shadow-sm shadow-violet-950/30'
                : 'border-white/[0.07] bg-white/[0.035] text-slate-300 hover:bg-white/[0.08]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">AI 伴侣</span>
          </button>

          <button
            onClick={() => setIsSavedDrawerOpen(true)}
            aria-label={`打开已归档网页知识库，共 ${savedArticles.length} 篇`}
            title="已归档网页知识库"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.035] px-3 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08]"
          >
            <Database className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden md:inline">已归档 ({savedArticles.length})</span>
          </button>
        </div>
      </div>

      {isFindOpen && browserEngine && (
        <div data-browser-find-bar className="flex min-w-0 flex-wrap items-center gap-2 border-b border-cyan-300/10 bg-[#101b25] px-3 py-2 sm:px-5">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-cyan-300" />
          <input
            ref={findInputRef}
            data-browser-find-input
            type="search"
            value={findQuery}
            maxLength={512}
            onChange={event => {
              const query = event.target.value;
              setFindQuery(query);
              runBrowserFind(query, 'new');
            }}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeFindBar(true);
              } else if (event.key === 'Enter') {
                event.preventDefault();
                runBrowserFind(findQuery, event.shiftKey ? 'previous' : 'next');
              }
            }}
            aria-label="查找当前 Chromium 网页"
            placeholder="查找网页中的文字"
            className="min-h-9 min-w-[150px] flex-1 rounded-lg border border-white/10 bg-[#080f16] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/10"
          />
          <span
            role="status"
            aria-live="polite"
            data-browser-find-count
            data-active-match={findStatus?.activeMatchOrdinal ?? 0}
            data-total-matches={findStatus?.matches ?? 0}
            className="min-w-[58px] text-center text-xs tabular-nums text-slate-300"
          >
            {findStatus?.error || (findStatus ? `${findStatus.activeMatchOrdinal} / ${findStatus.matches}` : (findQuery ? '查找中…' : '输入查找词'))}
          </span>
          <button
            type="button"
            data-browser-find-previous
            onClick={() => runBrowserFind(findQuery, 'previous')}
            disabled={!findQuery || findStatus?.matches === 0}
            aria-label="上一个匹配项"
            title="上一个匹配项（Shift+Enter）"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            data-browser-find-next
            onClick={() => runBrowserFind(findQuery, 'next')}
            disabled={!findQuery || findStatus?.matches === 0}
            aria-label="下一个匹配项"
            title="下一个匹配项（Enter）"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => closeFindBar(true)}
            aria-label="关闭页内查找"
            title="关闭并清除高亮（Esc）"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.08] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 3. Bookmarks Bar */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-white/[0.06] bg-[#0a1118] px-4 py-2 text-[11px] [scrollbar-width:thin]">
        <span className="flex shrink-0 items-center font-semibold text-slate-500">
          <Bookmark className="w-3 h-3 mr-1 text-slate-400" /> 书签:
        </span>
        {bookmarks.map(bm => (
          <button
            key={bm.id}
            onClick={() => handleNavigate(bm.url)}
            className="min-h-8 shrink-0 rounded-full border border-white/[0.06] bg-white/[0.025] px-3 text-slate-300 transition-colors hover:border-cyan-200/20 hover:bg-cyan-200/[0.06] hover:text-cyan-100"
          >
            {bm.title}
          </button>
        ))}
      </div>

      {browserEngineError && (
        <div role="alert" className="border-b border-rose-300/15 bg-rose-950/40 px-4 py-2 text-xs text-rose-200">
          {browserEngineError}
        </div>
      )}

      {browserPrintMessage && (
        <div role="status" aria-live="polite" data-browser-print-status className="border-b border-cyan-300/15 bg-cyan-950/30 px-4 py-2 text-xs text-cyan-100">
          {browserPrintMessage}
        </div>
      )}

      {browserSessionWarning && (
        <div role="alert" data-browser-session-warning className="border-b border-amber-300/15 bg-amber-950/40 px-4 py-2 text-xs text-amber-100">
          {browserSessionWarning}
        </div>
      )}

      {sessionRestoreNotice && (
        <div
          role={sessionRestoreNotice.kind === 'failed' ? 'alert' : 'status'}
          data-browser-session-restore-notice={sessionRestoreNotice.kind}
          className={`border-b px-4 py-2 text-xs ${sessionRestoreNotice.kind === 'failed' ? 'border-rose-300/15 bg-rose-950/40 text-rose-100' : 'border-cyan-300/15 bg-cyan-950/30 text-cyan-100'}`}
        >
          {sessionRestoreNotice.kind === 'restoring'
            ? `正在恢复上次打开的 ${sessionRestoreNotice.restoredCount} 个标签…`
            : sessionRestoreNotice.kind === 'failed'
              ? `已恢复 ${sessionRestoreNotice.restoredCount} 个上次标签，其中 ${sessionRestoreNotice.failedCount} 个页面未能加载；标签仍保留，可在地址栏重试。`
              : `已恢复上次打开的 ${sessionRestoreNotice.restoredCount} 个标签。`}
        </div>
      )}

      {saveSuccessMessage && (
        <div role="status" className="flex items-center gap-2 border-b border-emerald-300/15 bg-emerald-950/50 px-4 py-2 text-xs text-emerald-100">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {browserStorageWarning && (
        <div role="alert" className="border-b border-amber-300/15 bg-amber-950/40 px-4 py-2 text-xs text-amber-100">
          {browserStorageWarning}
        </div>
      )}

      {/* 4. Split Layout */}
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[#080d13]">
        <div className="min-w-0 flex-1 overflow-y-auto bg-[#080d13] p-4 sm:p-8">
          {searchResults.length > 0 || isSearching ? (
            <div className="max-w-3xl mx-auto">
              <div className="mb-6">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className={`rounded-full border px-2.5 py-1 font-medium ${searchEngine === 'github' ? 'border-slate-600 bg-slate-900 text-white' : 'border-cyan-200/15 bg-cyan-200/[0.06] text-cyan-100'}`}>
                    {searchEngine === 'github' ? 'GitHub 开源项目' : '高质量网页搜索'}
                  </span>
                  {!isSearching && <span>约 {searchResults.length} 条结果</span>}
                  {searchEngine === 'github' && <span className="text-emerald-300/80">按 Stars 排序 · 官方 API · 仅展示公开元数据</span>}
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
                  {searchResults.map((result, idx) => result.source === 'github' ? (
                    <div key={idx} className="group w-full rounded-2xl border border-white/[0.08] bg-[#0d151d] p-5 text-left transition-all hover:border-cyan-200/20 hover:bg-[#111d25] sm:p-6">
                      <div className="flex items-start justify-between gap-4">
                        <button onClick={() => handleNavigate(result.url)} className="min-w-0 text-left">
                          <div className="flex min-w-0 items-center gap-2 truncate font-mono text-[11px] text-cyan-300/80"><Code2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">github.com/{result.repository}</span></div>
                          <h2 className="mt-2 text-base font-semibold leading-snug text-slate-100 transition-colors group-hover:text-cyan-100 sm:text-lg">{result.title}</h2>
                        </button>
                        <button onClick={() => handleAddGitHubToWorkspace(result)} disabled={!result.repository || workspaceRepos.includes(result.repository)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-cyan-300 px-3 py-2 text-[11px] font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:bg-emerald-900/60 disabled:text-emerald-200">
                          {workspaceRepos.includes(result.repository || '') ? <Check className="h-3.5 w-3.5" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
                          <span className="hidden sm:inline">{workspaceRepos.includes(result.repository || '') ? '已加入' : '加入工作区'}</span>
                        </button>
                      </div>
                      {result.snippet && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400 sm:text-sm">{result.snippet}</p>}
                      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2.5 py-1 text-amber-300"><Star className="h-3 w-3" /> {(result.stars || 0).toLocaleString()}</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-2.5 py-1"><span className="sr-only">Forks </span><GitFork className="h-3 w-3" /> {(result.forks || 0).toLocaleString()}</span>
                        <span className="rounded-full bg-white/[0.05] px-2.5 py-1">{result.language}</span>
                        <span className="rounded-full bg-white/[0.05] px-2.5 py-1">{result.license}</span>
                        <span className="text-slate-500">更新于 {result.updatedAt ? new Date(result.updatedAt).toLocaleDateString() : '未知'}</span>
                      </div>
                    </div>
                  ) : (
                    <button key={idx} onClick={() => handleNavigate(result.url)} className="group w-full cursor-pointer rounded-2xl border border-white/[0.07] bg-[#0d151d] p-5 text-left transition-all hover:border-cyan-200/20 hover:bg-[#111d25] sm:p-6">
                      <div className="flex min-w-0 items-center gap-2 truncate font-mono text-[11px] text-emerald-300/80"><Globe className="h-3 w-3 shrink-0" /><span className="truncate">{result.url}</span></div>
                      <h2 className="mt-2 text-base font-semibold leading-snug text-slate-100 transition-colors group-hover:text-cyan-100 sm:text-lg">{result.title}</h2>
                      {result.snippet && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400 sm:text-sm">{result.snippet}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab ? (
            activeTab.readerMode ? (
              <div className="mx-auto max-w-3xl rounded-3xl border border-white/[0.07] bg-[#0d151d] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.2)] sm:p-10">
                <div className="border-b border-slate-800 pb-6 mb-6">
                  <div className="flex items-center space-x-3 mb-3 text-xs text-slate-400">
                    <span className="rounded-full border border-cyan-200/15 bg-cyan-200/[0.06] px-2.5 py-1 font-medium text-cyan-100">
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
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-cyan-300 px-4 py-2 text-xs font-semibold text-slate-950 shadow-sm shadow-cyan-950/30 transition hover:bg-cyan-200"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>在新窗口打开</span>
                    </a>
                    <button
                      onClick={handleTranslatePage}
                      disabled={!activeTab.content || isTranslating}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-40"
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
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-violet-200/15 bg-violet-200/[0.06] px-4 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-200/10"
                      >
                        <span>显示原文</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="prose prose-invert max-w-none space-y-5 font-serif text-base leading-relaxed text-slate-200 sm:text-lg">
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
                    <p className="text-slate-400 italic">
                      {browserEngine
                        ? '桌面 Chromium 页面由本机直接打开，不会转交服务器代访或提取正文；请直接在上方网页中阅读。'
                        : '正在提取网页纯净正文或该站点允许直接访问...'}
                    </p>
                  )}
                </div>

                <div className="mt-10 pt-6 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleSaveToLibrary}
                      className="flex min-h-10 items-center gap-2 rounded-full bg-cyan-300 px-4 py-2 text-xs font-semibold text-slate-950 shadow-sm shadow-cyan-950/30 transition hover:bg-cyan-200"
                    >
                      <Database className="w-4 h-4" />
                      <span>保存至全球数字图书馆</span>
                    </button>
                    <button
                      onClick={() => handleRunAiAnalysis('summary')}
                      className="flex min-h-10 items-center gap-2 rounded-full border border-violet-200/15 bg-violet-300/[0.12] px-4 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-300/20"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>AI 总结当前文章</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative flex h-full min-h-[480px] w-full flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-slate-950">
                <div
                  ref={nativeViewportRef}
                  data-browser-engine-viewport
                  aria-label={browserEngine ? 'Chromium 网页内容' : '网页预览内容'}
                  className="relative flex min-h-[480px] w-full flex-1 bg-white"
                >
                  {browserEngine ? (
                    <div className="flex h-full min-h-[480px] w-full items-center justify-center bg-[#080d13] text-sm text-slate-400">
                      正在启动 Chromium 网页视图…
                    </div>
                  ) : (
                    isPreviewLoading ? (
                      <div className="flex h-full w-full items-center justify-center bg-white text-sm text-slate-500">
                        正在加载网页预览…
                      </div>
                    ) : previewHtml ? (
                      <iframe
                        srcDoc={previewHtml}
                        title={activeTab.title}
                        className="w-full flex-1 border-0 bg-white"
                        sandbox="allow-scripts allow-same-origin allow-popups"
                      />
                    ) : (
                      <iframe
                        src={toEmbedUrl(activeTab.url)}
                        title={activeTab.title}
                        className="w-full flex-1 border-0 bg-white"
                        sandbox="allow-scripts allow-same-origin allow-popups"
                      />
                    )
                  )}
                </div>
              </div>
            )
          ) : null}
        </div>

        {isAiPanelOpen && (
          <>
            <button
              type="button"
              aria-label="关闭 AI 网页研究伴侣"
              onClick={() => setIsAiPanelOpen(false)}
              className="absolute inset-0 z-20 cursor-default bg-black/50 backdrop-blur-[2px] md:hidden"
            />
            <aside className="absolute inset-x-3 bottom-3 top-3 z-30 flex select-none flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101720] shadow-2xl md:relative md:inset-auto md:z-0 md:w-[340px] md:shrink-0 md:rounded-none md:border-y-0 md:border-r-0 md:border-l md:border-white/[0.07] md:shadow-none">
            <div className="flex items-center justify-between border-b border-white/[0.07] bg-[#121b25] p-4">
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
          </>
        )}
      </div>

      </BrowserFrame>

      {browserEngine && browserPermissionState.pending.length > 0 && (() => {
        const request = browserPermissionState.pending[0];
        const capability = request.permission === 'notifications' ? '通知' : '位置信息';
        return (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="browser-permission-title" data-browser-permission-prompt data-permission={request.permission} data-origin={request.origin}>
            <section className="w-full max-w-md rounded-2xl border border-cyan-200/15 bg-[#08111a] p-5 shadow-2xl shadow-black/60 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="rounded-xl border border-cyan-200/15 bg-cyan-200/[0.06] p-2 text-cyan-200">
                  {request.permission === 'notifications' ? <Bell className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 id="browser-permission-title" className="text-base font-semibold text-white">EARTH ONE 站点权限请求</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">以下网站请求访问{capability}：</p>
                  <code data-browser-permission-origin className="mt-2 block break-all rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-xs text-cyan-100">{request.origin}</code>
                  <p className="mt-3 text-xs leading-relaxed text-slate-400">默认拒绝。允许仅在 EARTH ONE 本次运行中对该来源的{capability}请求生效；退出应用后自动清除。</p>
                  {browserPermissionState.pending.length > 1 && <p className="mt-2 text-[11px] text-slate-500">另有 {browserPermissionState.pending.length - 1} 项请求等待处理。</p>}
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => void handleResolveBrowserPermission(request.requestId, 'deny')} data-browser-permission-deny className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/[0.06]">拒绝</button>
                <button type="button" onClick={() => void handleResolveBrowserPermission(request.requestId, 'allow')} data-browser-permission-allow className="rounded-lg border border-emerald-300/20 bg-emerald-300/[0.09] px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-300/[0.15]">仅本次运行允许</button>
              </div>
            </section>
          </div>
        );
      })()}

      {isPermissionsOpen && browserEngine && (
        <div className="fixed inset-0 z-[60] flex justify-end bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="会话站点权限" data-browser-permissions-panel>
          <button type="button" aria-label="关闭会话站点权限背景" onClick={() => setIsPermissionsOpen(false)} className="absolute inset-0 cursor-default" />
          <section className="relative flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-[#08111a] p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2 text-emerald-200">
                  <Shield className="h-5 w-5" />
                  <h2 className="text-lg font-semibold text-white">会话站点权限</h2>
                </div>
                <p className="mt-2 max-w-lg text-xs leading-relaxed text-slate-400">仅显示本次应用运行内由你明确允许的通知和位置信息权限。授权只在内存中，不写入磁盘，退出 EARTH ONE 后全部清除。</p>
              </div>
              <button type="button" onClick={() => setIsPermissionsOpen(false)} aria-label="关闭会话站点权限" className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-white/[0.06] hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-5">
              {browserPermissionState.grants.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-400">此会话没有已允许的站点权限。网站请求将由 EARTH ONE 明确询问，默认拒绝。</p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-400">共 {browserPermissionState.grants.reduce((sum, grant) => sum + grant.permissions.length, 0)} 项会话授权</p>
                    <button type="button" onClick={() => void handleRevokeAllBrowserPermissions()} data-browser-revoke-all-permissions className="rounded-lg border border-rose-300/15 px-3 py-2 text-xs text-rose-200 transition hover:bg-rose-300/[0.08]">撤销全部</button>
                  </div>
                  {browserPermissionState.grants.map(grant => (
                    <section key={grant.origin} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
                      <code className="block break-all text-xs font-medium text-slate-100">{grant.origin}</code>
                      <div className="mt-3 space-y-2">
                        {grant.permissions.map(permission => {
                          const label = permission === 'notifications' ? '通知' : '位置信息';
                          const Icon = permission === 'notifications' ? Bell : MapPin;
                          return (
                            <div key={permission} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] px-3 py-2">
                              <span className="inline-flex items-center gap-2 text-xs text-emerald-100"><Icon className="h-3.5 w-3.5" />{label}</span>
                              <button type="button" onClick={() => void handleRevokeBrowserPermission(grant.origin, permission)} data-browser-revoke-permission={permission} data-browser-revoke-origin={grant.origin} className="rounded-md px-2 py-1 text-xs text-rose-200 transition hover:bg-rose-300/[0.08]">撤销</button>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </>
              )}
              <p className="text-[11px] leading-relaxed text-slate-500">不支持摄像头、麦克风、剪贴板或 USB 权限。非安全来源、子框架和不属于活动 Chromium 页面的请求会被拒绝。</p>
            </div>
          </section>
        </div>
      )}

      {isBrowserDataOpen && (
        <div className="fixed inset-0 z-[60] flex justify-end bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="本地浏览数据">
          <div className="flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-[#08111a] p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2 text-cyan-200">
                  <Clock3 className="h-5 w-5" />
                  <h2 className="text-lg font-semibold text-white">本地书签与浏览历史</h2>
                </div>
                <p className="mt-2 max-w-lg text-xs leading-relaxed text-slate-400">
                  书签与历史只保存在此设备的浏览器本地存储，不会向服务器同步。清除后无法恢复；已归档文章是独立功能，仍使用现有归档服务。
                </p>
              </div>
              <button onClick={() => setIsBrowserDataOpen(false)} aria-label="关闭本地浏览数据" className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-white/[0.06] hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto py-5">
              <section aria-labelledby="local-bookmarks-heading">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 id="local-bookmarks-heading" className="text-sm font-semibold text-slate-100">书签 ({bookmarks.length})</h3>
                  <button onClick={handleClearLocalBookmarks} disabled={!browserStorageReady || browserStorageReadOnly || !bookmarks.length} aria-label="清空本地书签" className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300/15 px-3 py-2 text-xs text-rose-200 transition hover:bg-rose-300/[0.08] disabled:cursor-not-allowed disabled:opacity-40">
                    <Trash2 className="h-3.5 w-3.5" />清空书签
                  </button>
                </div>
                {bookmarks.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-slate-500">暂无本地书签。浏览网页时点击星形按钮即可保存。</p>
                ) : (
                  <div className="space-y-2">
                    {bookmarks.map(bookmark => (
                      <div key={bookmark.id} className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                        <button onClick={() => { setIsBrowserDataOpen(false); handleNavigate(bookmark.url); }} className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-sm font-medium text-slate-100">{bookmark.title}</span>
                          <span className="mt-1 block truncate text-[11px] text-slate-500">{bookmark.url}</span>
                          <span className="mt-1 block text-[10px] text-cyan-300/70">{bookmark.category}</span>
                        </button>
                        <button onClick={() => handleRemoveBookmark(bookmark.id)} disabled={!browserStorageReady || browserStorageReadOnly} aria-label={`删除书签 ${bookmark.title}`} title="删除此书签" className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-rose-300/[0.08] hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-40">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section aria-labelledby="local-history-heading">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 id="local-history-heading" className="text-sm font-semibold text-slate-100">浏览历史 ({browserHistory.length})</h3>
                  <button onClick={handleClearLocalHistory} disabled={!browserStorageReady || browserStorageReadOnly || !browserHistory.length} aria-label="清空本地浏览历史" className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300/15 px-3 py-2 text-xs text-rose-200 transition hover:bg-rose-300/[0.08] disabled:cursor-not-allowed disabled:opacity-40">
                    <Trash2 className="h-3.5 w-3.5" />清空历史
                  </button>
                </div>
                {browserHistory.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-slate-500">暂无本地浏览历史。打开网页后会自动记录。</p>
                ) : (
                  <div className="space-y-2">
                    {browserHistory.map(item => (
                      <button key={item.id} onClick={() => { setIsBrowserDataOpen(false); handleNavigate(item.url); }} className="block w-full rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 text-left transition hover:border-cyan-200/20 hover:bg-white/[0.04]">
                        <span className="block truncate text-sm font-medium text-slate-100">{item.title}</span>
                        <span className="mt-1 block truncate text-[11px] text-slate-500">{item.url}</span>
                        <span className="mt-1 block text-[10px] text-slate-600">{new Date(item.visitedAt).toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {isDownloadsOpen && browserEngine && (
        <div className="fixed inset-0 z-[60] flex justify-end bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="下载管理器" data-browser-download-manager>
          <button type="button" aria-label="关闭下载管理器背景" onClick={() => setIsDownloadsOpen(false)} className="absolute inset-0 cursor-default" />
          <section className="relative flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-[#08111a] p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2 text-cyan-200">
                  <Download className="h-5 w-5" />
                  <h2 className="text-lg font-semibold text-white">下载管理器</h2>
                </div>
                <p className="mt-2 max-w-lg text-xs leading-relaxed text-slate-400">
                  每次下载都需在系统保存对话框中选择位置；记录仅保存在此设备，最多保留最近 50 条，不同步到服务器。完成后不会自动打开文件，也不提供恶意文件扫描。
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {downloads.some(download => ['completed', 'cancelled', 'interrupted'].includes(download.state)) && (
                  <button type="button" onClick={() => { void browserEngine.clearDownloadRecords().then(result => {
                    if (!result.success) browserEngine.getDownloadStorageStatus().then(status => setDownloadStorageWarning(status.warning || '无法清除本机下载记录。'));
                  }); }} disabled={Boolean(downloadStorageWarning)} aria-label="清除已结束的下载记录" title="只清除已结束记录；不会删除文件或取消正在下载的任务" className="rounded-lg px-2 py-2 text-[11px] text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
                    清除记录
                  </button>
                )}
                <button onClick={() => setIsDownloadsOpen(false)} aria-label="关闭下载管理器" className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.06] hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {downloadStorageWarning && (
              <p role="status" className="mt-4 rounded-xl border border-amber-200/15 bg-amber-200/[0.05] px-3 py-2 text-xs leading-relaxed text-amber-100/80">{downloadStorageWarning}</p>
            )}

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-5">
              {downloads.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-xs text-slate-500">此设备没有可显示的下载记录。</p>
              ) : downloads.map(download => {
                const canCancel = download.state === 'awaiting-save' || download.state === 'progressing';
                const canRemove = download.state === 'completed' || download.state === 'cancelled' || download.state === 'interrupted';
                const statusLabel = download.state === 'awaiting-save' ? '等待保存位置'
                  : download.state === 'progressing' ? '正在下载'
                  : download.state === 'cancelling' ? '正在取消'
                  : download.state === 'completed' ? '已完成'
                  : download.state === 'cancelled' ? '已取消'
                  : '已中断';
                return (
                  <article key={download.id} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4" data-download-id={download.id}>
                    <div className="flex items-start gap-3">
                      <Download className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                      <div className="min-w-0 flex-1">
                        <h3 className="break-all text-sm font-medium text-slate-100">{download.filename}</h3>
                        <p className="mt-1 break-all text-[11px] text-slate-500">来源：{download.source}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                          <span className={download.state === 'completed' ? 'text-emerald-300' : download.state === 'interrupted' ? 'text-rose-300' : 'text-cyan-200'}>{statusLabel}</span>
                          {download.state === 'progressing' && (
                            <span className="text-slate-400">
                              {download.progress === null
                                ? `已接收 ${formatDownloadBytes(download.receivedBytes)} · 总大小未知`
                                : `${download.progress}% · ${formatDownloadBytes(download.receivedBytes)} / ${formatDownloadBytes(download.totalBytes)}`}
                            </span>
                          )}
                        </div>
                        {download.state === 'progressing' && download.progress !== null && (
                          <div role="progressbar" aria-label={`${download.filename} 下载进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={download.progress} className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-cyan-300 transition-[width]" style={{ width: `${download.progress}%` }} />
                          </div>
                        )}
                        {download.savePath && download.fileAvailable && <p className="mt-2 break-all text-[11px] text-slate-500">保存位置：{download.savePath}</p>}
                        {download.savePath && !download.fileAvailable && <p className="mt-2 text-[11px] text-amber-200/70">文件不可用（可能已移动或删除）</p>}
                      </div>
                      {download.fileAvailable && (
                        <button type="button" onClick={() => { void browserEngine.showDownloadInFolder(download.id).then(result => {
                          if (!result.success) browserEngine.getDownloads().then(setDownloads).catch(() => {});
                        }); }} aria-label={`在文件夹中显示 ${download.filename}`} title="在文件夹中显示；不会打开文件" className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-cyan-300/[0.08] hover:text-cyan-100">
                          <FolderOpen className="h-4 w-4" />
                        </button>
                      )}
                      {canCancel && (
                        <button type="button" onClick={() => { void browserEngine.cancelDownload(download.id); }} aria-label={`取消下载 ${download.filename}`} title="取消下载" className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-rose-300/[0.08] hover:text-rose-200">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                      {canRemove && (
                        <button type="button" onClick={() => { void browserEngine.removeDownload(download.id).then(result => {
                          if (!result.success) browserEngine.getDownloadStorageStatus().then(status => setDownloadStorageWarning(status.warning || '无法移除本机下载记录。'));
                        }); }} disabled={Boolean(downloadStorageWarning)} aria-label={`从列表移除下载 ${download.filename}`} title="仅从记录中移除，不删除文件" className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-white/[0.08] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {isSavedDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-[#0a1128] border-l border-slate-800 h-full flex flex-col p-6 shadow-2xl animate-in slide-in-from-right">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Database className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-semibold text-white">已归档网页知识库</h3>
              </div>
              <button onClick={() => setIsSavedDrawerOpen(false)} aria-label="关闭已归档网页知识库" className="text-slate-400 hover:text-white">
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
