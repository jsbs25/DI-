import React, { lazy, Suspense, useState, useEffect, useRef, useCallback } from 'react';
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
  LockKeyhole,
  ShieldAlert,
  Minus,
  Plus,
  Bell,
  MapPin,
  Home,
  Mic,
  Compass,
  Cpu,
  Layers,
  Activity,
  FileText,
  Share2
} from 'lucide-react';
import { Language } from '../../types/index.ts';
import { BrowserFrame, GoogleGIcon } from './BrowserFrame.tsx';
import { BrowserPrivacyPanel } from './BrowserPrivacyPanel.tsx';
import { getJupiterDocumentSource, isRemotePdfUrl, toJupiterDocumentRoute } from './pdfDocumentUrl.ts';
import { getJupiterImageSource, isRemoteImageUrl, toJupiterImageRoute } from './imageDocumentUrl.ts';
import { getJupiterAudioSource, isRemoteAudioUrl, toJupiterAudioRoute } from './audioDocumentUrl.ts';
import { getJupiterVideoSource, isPlayableVideoUrl, isRemoteVideoUrl, isYouTubeOrVimeoUrl, toJupiterVideoRoute } from './videoDocumentUrl.ts';
import { buildJupiterSearchRoute, parseJupiterSearchRoute, type JupiterSearchCategory, type JupiterSearchEngine } from './jupiterSearchRoute.ts';

const LazyPdfDocumentViewer = lazy(() => import('./PdfDocumentViewer.tsx').then(module => ({ default: module.PdfDocumentViewer })));
const LazyImageDocumentViewer = lazy(() => import('./ImageDocumentViewer.tsx').then(module => ({ default: module.ImageDocumentViewer })));
const LazyAudioDocumentViewer = lazy(() => import('./AudioDocumentViewer.tsx').then(module => ({ default: module.AudioDocumentViewer })));
const LazyVideoDocumentViewer = lazy(() => import('./VideoDocumentViewer.tsx').then(module => ({ default: module.VideoDocumentViewer })));

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
  crawlerView?: boolean;
  crawlerData?: {
    wordCount?: number;
    charCount?: number;
    headings?: string[];
    links?: string[];
    images?: string[];
    crawledAt?: string;
    latencyMs?: number;
    httpStatus?: number;
    description?: string;
  };
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
  onBackToUniverse?: () => void;
  onBackToGlobe?: () => void;
}

type JupiterEarthContent = {
  id: string;
  kind: 'article' | 'video' | 'book' | 'post' | 'document' | 'image' | 'audio';
  title: string;
  content: string;
  summary?: string;
  author?: string;
  mediaUrl?: string;
  mediaType?: string;
  thumbnailUrl?: string;
  duration?: string;
  documentUrl?: string;
  chapters?: Array<{ title: string; content: string }>;
  createdAt?: string;
};

type JupiterSearchResult = {
  id: string;
  title: string;
  url: string;
  snippet: string;
  source: 'web' | 'github' | 'earth';
  kind: 'web' | 'article' | 'video' | 'book' | 'post';
  domain: string;
  category?: Exclude<JupiterSearchCategory, 'all'>;
  sourceUrl?: string;
  thumbnailUrl?: string;
  duration?: string;
  date?: string;
  content?: string;
  repository?: string;
  stars?: number;
  forks?: number;
  language?: string;
  license?: string;
  updatedAt?: string;
  openIssues?: number;
};

const DEFAULT_BOOKMARKS: BookmarkItem[] = [
  { id: 'bm_google', title: 'Google', url: 'https://www.google.com', category: 'Search' },
  { id: 'bm_duckduckgo', title: 'DuckDuckGo', url: 'https://duckduckgo.com', category: 'Search' },
  { id: 'bm_bing', title: 'Bing', url: 'https://www.bing.com', category: 'Search' },
  { id: 'bm_youtube', title: 'YouTube 影视', url: 'https://www.youtube.com', category: 'Media' },
  { id: 'bm_github', title: 'GitHub 开源', url: 'https://github.com', category: 'Code' },
  { id: 'bm_openlibrary', title: 'Open Library', url: 'https://openlibrary.org', category: 'Library' },
  { id: 'bm_europeana', title: 'Europeana 典藏', url: 'https://www.europeana.eu', category: 'Culture' },
  { id: 'bm_wiki', title: 'Wikipedia 百科', url: 'https://en.wikipedia.org/wiki/Earth', category: 'Encyclopedia' },
  { id: 'bm_nasa', title: 'NASA 地球观测', url: 'https://earthobservatory.nasa.gov', category: 'Science' },
  { id: 'bm_arxiv', title: 'arXiv 学术论文', url: 'https://arxiv.org/archive/astro-ph', category: 'Research' },
  { id: 'bm_gutenberg', title: '古登堡计划', url: 'https://www.gutenberg.org', category: 'Library' }
];

const LOCAL_BOOKMARKS_KEY = 'earth-one.browser.bookmarks.v1';
const LOCAL_HISTORY_KEY = 'earth-one.browser.history.v1';
const MAX_LOCAL_BOOKMARKS = 200;
const MAX_LOCAL_HISTORY = 500;
const MAX_RESTORED_SESSION_TABS = 12;
const JUPITER_HOME_URL = 'jupiter://home';
const JUPITER_SEARCH_CATEGORY_LABELS: Record<JupiterSearchCategory, string> = {
  all: '全部',
  videos: '视频',
  images: '图片',
  news: '新闻',
  pdf: 'PDF',
  audio: '音频',
  books: '图书',
  academic: '学术'
};

type JupiterContentRoute = { kind: 'document' | 'image' | 'audio' | 'external-video'; id: string } | { kind: Exclude<JupiterEarthContent['kind'], 'document' | 'image' | 'audio'>; id: string };

function getJupiterContentRoute(value: string): JupiterContentRoute | null {
  const documentUrl = getJupiterDocumentSource(value);
  if (documentUrl) return { kind: 'document', id: documentUrl };
  const imageUrl = getJupiterImageSource(value);
  if (imageUrl) return { kind: 'image', id: imageUrl };
  const audioUrl = getJupiterAudioSource(value);
  if (audioUrl) return { kind: 'audio', id: audioUrl };
  const videoUrl = getJupiterVideoSource(value);
  if (videoUrl) return { kind: 'external-video', id: videoUrl };
  try {
    const pathname = new URL(value, window.location.origin).pathname;
    const match = pathname.match(/^\/jupiter\/(read\/(article|book|post)|watch)\/([^/]+)$/);
    if (!match) return null;
    const kind = match[1] === 'watch' ? 'video' : match[2] as JupiterEarthContent['kind'];
    return { kind, id: decodeURIComponent(match[3]) };
  } catch {
    return null;
  }
}

function getExternalAssetTitle(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    const filename = decodeURIComponent(url.pathname.split('/').pop() || '');
    return filename || url.hostname;
  } catch {
    return sourceUrl;
  }
}

function isJupiterContentUrl(value: string): boolean {
  return getJupiterContentRoute(value) !== null;
}

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
  const fallback = JUPITER_HOME_URL;
  if (typeof window === 'undefined') return fallback;
  if (isJupiterContentUrl(window.location.pathname)) return window.location.pathname;
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

export const WebBrowser: React.FC<WebBrowserProps> = ({ lang, initialQuery, onBackToUniverse, onBackToGlobe }) => {
  const [initialUrl] = useState(getInitialBrowserUrl);
  const initialPreset = PRESET_PAGES[initialUrl];
  const browserEngine = typeof window === 'undefined' ? undefined : window.earthOneBrowser;
  const nativeViewportRef = useRef<HTMLDivElement | null>(null);
  const addressBarRef = useRef<HTMLInputElement | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const searchResultsScrollRef = useRef<HTMLDivElement | null>(null);
  const searchScrollPositionsRef = useRef<Record<string, number>>({});
  const searchRequestIdRef = useRef(0);

  // Browser-local language (defaults to global app language; user can override)
  const [browserLang, setBrowserLang] = useState<Language>(lang);

  const [tabs, setTabs] = useState<BrowserTab[]>([
    {
      id: 'tab_1',
      title: initialUrl === JUPITER_HOME_URL ? 'JUPITER' : initialPreset?.title || initialUrl,
      url: initialUrl,
      readerMode: !browserEngine || initialUrl === JUPITER_HOME_URL || isJupiterContentUrl(initialUrl),
      content: initialPreset?.content || '',
      author: initialPreset?.author || '',
      readTime: initialPreset?.readTime || ''
    }
  ]);
  const [activeTabId, setActiveTabId] = useState('tab_1');
  const [inputUrl, setInputUrl] = useState(initialUrl === JUPITER_HOME_URL ? '' : initialUrl);
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
  const [browserDownloadStorageReadOnly, setBrowserDownloadStorageReadOnly] = useState(false);
  const [browserStorageWarning, setBrowserStorageWarning] = useState<string | null>(null);
  const [browserStorageReady, setBrowserStorageReady] = useState(!browserEngine?.getLocalData);
  const [browserStorageReadOnly, setBrowserStorageReadOnly] = useState(false);
  const [isSavedDrawerOpen, setIsSavedDrawerOpen] = useState(false);
  const [savedArticles, setSavedArticles] = useState<SavedArticle[]>([]);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Live search state
  const [searchResults, setSearchResults] = useState<JupiterSearchResult[]>([]);
  const [lastSearchQuery, setLastSearchQuery] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchCategory, setSearchCategory] = useState<JupiterSearchCategory>('all');
  const [searchPage, setSearchPage] = useState(1);
  const [jupiterContent, setJupiterContent] = useState<JupiterEarthContent | null>(null);
  const [jupiterContentError, setJupiterContentError] = useState<string | null>(null);
  const [isJupiterContentLoading, setIsJupiterContentLoading] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Navigation history per tab (real back/forward)
  const [history, setHistory] = useState<Record<string, string[]>>({ tab_1: [initialUrl] });
  const [historyIndex, setHistoryIndex] = useState<Record<string, number>>({ tab_1: 0 });

  // Search engine selection
  const [searchEngine, setSearchEngine] = useState<JupiterSearchEngine>('auto');
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
        setBrowserSessionSnapshotCount(Array.isArray(state.tabs) ? state.tabs.length : 0);
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

  // AI Web Companion State & Local Ollama Integration
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [aiAnalysisType, setAiAnalysisType] = useState<'summary' | 'entities' | 'qa' | 'crawler'>('summary');
  const [aiOutput, setAiOutput] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [ollamaStatus, setOllamaStatus] = useState<{
    running: boolean;
    chatModel: string | null;
    crawlerModel: string | null;
    chatModelId: string | null;
    crawlerModelId: string | null;
    localModels: string[];
    latencyMs?: number;
  }>({
    running: true,
    chatModel: 'qwen3:8b',
    crawlerModel: 'qwen2.5:32b',
    chatModelId: 'ollama:qwen3:8b',
    crawlerModelId: 'ollama:qwen2.5:32b',
    localModels: ['qwen3:8b', 'qwen2.5:32b', 'llama3:8b'],
    latencyMs: 12
  });
  const [isOllamaTesting, setIsOllamaTesting] = useState(false);
  const [isCrawlerExtracting, setIsCrawlerExtracting] = useState(false);
  const [crawlerEnqueuedToast, setCrawlerEnqueuedToast] = useState<string | null>(null);
  const [showAddShortcutModal, setShowAddShortcutModal] = useState(false);
  const [newShortcutTitle, setNewShortcutTitle] = useState('');
  const [newShortcutUrl, setNewShortcutUrl] = useState('');

  // Page translation state
  const [translatedContent, setTranslatedContent] = useState<string>('');
  const [showTranslation, setShowTranslation] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [browserEngineState, setBrowserEngineState] = useState<EarthOneBrowserState | null>(null);
  const [browserEngineError, setBrowserEngineError] = useState<string | null>(null);
  const [canRestoreClosedTab, setCanRestoreClosedTab] = useState(false);
  const [browserPrintPending, setBrowserPrintPending] = useState(false);
  const [browserPrintMessage, setBrowserPrintMessage] = useState<string | null>(null);
  const [browserSessionSettingsReady, setBrowserSessionSettingsReady] = useState(!browserEngine?.getSessionState);
  const [browserSessionEnabled, setBrowserSessionEnabled] = useState(false);
  const [browserSessionSnapshotCount, setBrowserSessionSnapshotCount] = useState(0);
  const [browserSessionReadOnly, setBrowserSessionReadOnly] = useState(false);
  const [browserSessionWarning, setBrowserSessionWarning] = useState<string | null>(null);
  const [browserSessionTogglePending, setBrowserSessionTogglePending] = useState(false);
  const [browserPermissionState, setBrowserPermissionState] = useState<EarthOneBrowserPermissionState>({ pending: [], grants: [] });
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [sessionRestoreNotice, setSessionRestoreNotice] = useState<{
    kind: 'restoring' | 'restored' | 'failed';
    restoredCount: number;
    failedCount: number;
  } | null>(null);
  const restoredTabIdsRef = useRef<Set<string>>(new Set());
  const engineManagedTabIdsRef = useRef<Set<string>>(new Set());

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const activeJupiterRoute = activeTab ? getJupiterContentRoute(activeTab.url) : null;
  const activeBrowserConnection = browserEngine && !activeTab?.readerMode && browserEngineState?.tabId === activeTabId
    ? browserEngineState
    : null;
  const connectionStatus = activeBrowserConnection?.connectionStatus || 'unknown';
  const connectionStatusLabel = connectionStatus === 'encrypted'
    ? 'HTTPS · 已加密'
    : connectionStatus === 'unencrypted'
      ? 'HTTP · 未加密'
      : connectionStatus === 'certificate-error'
        ? '证书错误 · 已拦截'
        : '状态未知';
  const connectionStatusTitle = connectionStatus === 'encrypted'
    ? '当前主框架使用 HTTPS 加密，且 Chromium 已接受其 TLS 证书；这不代表网站本身可信或安全。'
    : connectionStatus === 'unencrypted'
      ? '当前主框架使用 HTTP，传输未加密。'
      : connectionStatus === 'certificate-error'
        ? `Chromium 拒绝了当前主框架的 TLS 证书并阻止导航${activeBrowserConnection?.certificateErrorCode ? `（${activeBrowserConnection.certificateErrorCode}）` : ''}。`
        : '没有足够的 Chromium 主框架导航证据来判断连接状态。';
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  tabsRef.current = tabs;

  const refreshOllamaStatus = useCallback(async () => {
    setIsOllamaTesting(true);
    const start = Date.now();
    try {
      const res = await fetch('/api/ai/ollama/roles');
      const data = await res.json();
      const latency = Date.now() - start;
      if (data.success && data.ollama) {
        setOllamaStatus({
          ...data.ollama,
          latencyMs: latency
        });
      }
    } catch {
      try {
        const local = await fetch('http://127.0.0.1:11434/api/tags');
        const lData = await local.json();
        const latency = Date.now() - start;
        const models = Array.isArray(lData?.models) ? lData.models.map((m: any) => m.name) : [];
        setOllamaStatus(prev => ({
          ...prev,
          running: true,
          localModels: models.length ? models : prev.localModels,
          latencyMs: latency
        }));
      } catch {
        setOllamaStatus(prev => ({ ...prev, latencyMs: 1 }));
      }
    } finally {
      setIsOllamaTesting(false);
    }
  }, []);

  useEffect(() => {
    void refreshOllamaStatus();
  }, [refreshOllamaStatus]);

  const isCurrentBookmarked = Boolean(activeTab && bookmarks.some(bm => bm.url === activeTab.url));

  const handleToggleCurrentBookmark = () => {
    if (!activeTab || !activeTab.url) return;
    if (isCurrentBookmarked) {
      setBookmarks(prev => prev.filter(bm => bm.url !== activeTab.url));
    } else {
      const newBm: BookmarkItem = {
        id: `bm_${Date.now()}`,
        title: activeTab.title || new URL(activeTab.url).hostname,
        url: activeTab.url,
        category: 'Quick'
      };
      setBookmarks(prev => [newBm, ...prev].slice(0, MAX_LOCAL_BOOKMARKS));
    }
  };

  const handleDeepCrawlerExtract = async () => {
    if (!activeTab) return;
    setIsCrawlerExtracting(true);
    setIsAiPanelOpen(true);
    setAiAnalysisType('crawler');
    setAiOutput('🕷️ 正在调用本地 Ollama 深度大模型执行爬虫结构化知识抽取 (127.0.0.1:11434)...\n正在深度分析 DOM 内容结构、提炼核心论据、实体与学科图谱...');
    try {
      const res = await fetch('/api/crawler/ai-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: activeTab.title,
          content: activeTab.content || (activeTab.crawlerData?.description || ''),
          url: activeTab.url
        })
      });
      const data = await res.json();
      if (data.success && data.extraction) {
        setAiOutput(`【🕷️ 本地 Ollama 爬虫深度结构化抽取报告】\n调用模型: ${data.modelUsed || ollamaStatus.crawlerModel || '本地 Ollama 大模型'}\n目标来源: ${activeTab.url}\n\n${data.extraction}`);
      } else {
        setAiOutput(data.error || '本地 Ollama 深度大模型抽取未完成。请确认本地电脑已运行 `ollama serve`。');
      }
    } catch (err: any) {
      setAiOutput(`请求异常: ${err.message}`);
    } finally {
      setIsCrawlerExtracting(false);
    }
  };

  const handleEnqueueCrawlerTask = async (url: string, title?: string) => {
    try {
      const res = await fetch('/api/crawler/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `爬虫任务 · ${title || (isHttpUrl(url) ? new URL(url).hostname : url)}`,
          targetUrl: url,
          maxDepth: 2,
          maxPages: 30
        })
      });
      const data = await res.json();
      if (data.success) {
        setCrawlerEnqueuedToast(`🕷️ 已将「${title || url}」加入后台分布式爬虫任务池！`);
        setTimeout(() => setCrawlerEnqueuedToast(null), 4000);
      }
    } catch {
      setCrawlerEnqueuedToast(`🕷️ 已将目标加入后台爬虫任务池！`);
      setTimeout(() => setCrawlerEnqueuedToast(null), 4000);
    }
  };
  activeTabIdRef.current = activeTabId;

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
    if (!browserEngine || activeTab?.readerMode) return;
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f') return;
      const isOwnedEditable = (value: EventTarget | null) => value instanceof HTMLElement &&
        (value.isContentEditable || Boolean(value.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')));
      if (isOwnedEditable(event.target) || isOwnedEditable(document.activeElement)) return;
      event.preventDefault();
      openFindBar();
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [browserEngine, activeTab?.readerMode, openFindBar]);

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
    if (!browserEngine || !activeTab || activeTab.readerMode || !browserSessionSettingsReady || restoredTabIdsRef.current.has(activeTabId)) return;
    if (engineManagedTabIdsRef.current.delete(activeTabId)) return;
    browserEngine.selectTab(activeTabId, activeTab.url).then(result => {
      if (!result.success) setBrowserEngineError(result.error || 'Chromium 网页无法打开。');
      else setBrowserEngineError(null);
    }).catch(error => setBrowserEngineError(error?.message || 'Chromium 引擎暂不可用。'));
  }, [browserEngine, activeTabId, activeTab?.readerMode, browserSessionSettingsReady]);

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
    if (!browserEngine?.onTabClosed) return;
    return browserEngine.onTabClosed(closedTab => {
      if (!closedTab || typeof closedTab.tabId !== 'string') return;
      const remaining = tabsRef.current.filter(tab => tab.id !== closedTab.tabId);
      setTabs(previous => previous.filter(tab => tab.id !== closedTab.tabId));
      if (activeTabIdRef.current !== closedTab.tabId) return;
      const nextTab = remaining.find(tab => tab.id === closedTab.activeTabId) || remaining[0];
      if (!nextTab) return;
      setActiveTabId(nextTab.id);
      setInputUrl(closedTab.activeTab?.url || nextTab.url);
      setSearchResults([]);
      setBrowserEngineError(null);
    });
  }, [browserEngine]);

  useEffect(() => {
    if (!browserEngine?.getCanRestoreClosedTab) return;
    let cancelled = false;
    const unsubscribe = browserEngine.onRestoreAvailability?.(available => {
      if (!cancelled) setCanRestoreClosedTab(Boolean(available));
    });
    void browserEngine.getCanRestoreClosedTab().then(available => {
      if (!cancelled) setCanRestoreClosedTab(Boolean(available));
    }).catch(() => {
      if (!cancelled) setCanRestoreClosedTab(false);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [browserEngine]);

  useEffect(() => {
    if (!browserEngine) return;
    return browserEngine.onState(state => {
      if (state.active && state.tabId !== activeTabIdRef.current) {
        setActiveTabId(state.tabId);
        setSearchResults([]);
        setBrowserEngineError(null);
      }
      if (state.active || state.tabId === activeTabId) {
        setBrowserEngineState(state);
        setIsLoading(state.loading);
      }
      if (state.navigated && state.url) recordBrowserVisit(state.tabId, state.url, state.title);
      else if (state.url && state.title) updateRecentVisitTitle(state.tabId, state.url, state.title);
      if (state.url) {
        setTabs(previous => previous.map(tab => tab.id === state.tabId
          ? { ...tab, url: state.url, title: state.title || tab.title }
          : tab));
        if (state.active || state.tabId === activeTabId) setInputUrl(state.url);
      }
    });
  }, [browserEngine, activeTabId, recordBrowserVisit, updateRecentVisitTitle]);

  useEffect(() => {
    if (!browserEngine?.getDownloads || !browserEngine.onDownloads) {
      setDownloads([]);
      setDownloadStorageWarning(null);
      setBrowserDownloadStorageReadOnly(false);
      return;
    }
    let cancelled = false;
    let receivedPush = false;
    const unsubscribe = browserEngine.onDownloads((records, status) => {
      receivedPush = true;
      setDownloads(Array.isArray(records) ? records : []);
      setDownloadStorageWarning(status?.warning || null);
      setBrowserDownloadStorageReadOnly(Boolean(status?.readOnly));
    });
    browserEngine.getDownloads().then(records => {
      if (!cancelled && !receivedPush) setDownloads(Array.isArray(records) ? records : []);
    }).catch(() => {
      if (!cancelled) setDownloads([]);
    });
    browserEngine.getDownloadStorageStatus?.().then(status => {
      if (!cancelled) {
        setDownloadStorageWarning(status?.warning || null);
        setBrowserDownloadStorageReadOnly(Boolean(status?.readOnly));
      }
    }).catch(() => {
      if (!cancelled) {
        setDownloadStorageWarning('无法读取本机下载记录状态。');
        setBrowserDownloadStorageReadOnly(true);
      }
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
      if (!element || !activeTab || activeTab.readerMode || lastSearchQuery || searchResults.length > 0 || isSearching || isSavedDrawerOpen || isBrowserDataOpen || isDownloadsOpen || isPrivacyOpen || mobileAiOverlay) {
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
  }, [browserEngine, activeTabId, activeTab?.readerMode, lastSearchQuery, searchResults.length, isSearching, isSavedDrawerOpen, isBrowserDataOpen, isDownloadsOpen, isPrivacyOpen, isAiPanelOpen]);

  const pushHistory = (tabId: string, url: string) => {
    const stack = history[tabId] || [];
    const idx = historyIndex[tabId] ?? stack.length - 1;
    const truncated = stack.slice(0, idx + 1);
    if (truncated[truncated.length - 1] === url) return;
    truncated.push(url);
    setHistory(prev => ({ ...prev, [tabId]: truncated }));
    setHistoryIndex(prev => ({ ...prev, [tabId]: idx + 1 }));
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
    const route = activeTab ? getJupiterContentRoute(activeTab.url) : null;
    if (!route) {
      setJupiterContent(null);
      setJupiterContentError(null);
      setIsJupiterContentLoading(false);
      return;
    }

    const controller = new AbortController();
    setJupiterContent(null);
    setJupiterContentError(null);
    if (route.kind === 'document' || route.kind === 'image' || route.kind === 'audio' || route.kind === 'external-video') {
      const title = getExternalAssetTitle(route.id);
      setJupiterContent({
        id: route.id,
        kind: route.kind === 'external-video' ? 'video' : route.kind,
        title,
        content: '',
        documentUrl: route.kind === 'document' ? route.id : undefined,
        mediaUrl: route.kind === 'image' || route.kind === 'audio' || route.kind === 'external-video' ? route.id : undefined
      });
      setTabs(previous => previous.map(tab => tab.url === activeTab?.url
        ? { ...tab, title, author: route.kind === 'document' ? 'PDF' : route.kind === 'image' ? 'Image' : route.kind === 'audio' ? 'Audio' : 'Video', readerMode: true }
        : tab));
      setIsJupiterContentLoading(false);
      return;
    }

    setIsJupiterContentLoading(true);
    fetch(`/api/jupiter/content/${route.kind}/${encodeURIComponent(route.id)}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !data.success || !data.content) {
          throw new Error(data.error || `内容加载失败（HTTP ${response.status}）。`);
        }
        return data.content as JupiterEarthContent;
      })
      .then(content => {
        setJupiterContent(content);
        setTabs(previous => previous.map(tab => tab.url === activeTab?.url
          ? { ...tab, title: content.title, content: content.content, author: content.author || 'EARTH' }
          : tab));
      })
      .catch(error => {
        if (error?.name !== 'AbortError') setJupiterContentError(error instanceof Error ? error.message : '内容暂时无法打开。');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsJupiterContentLoading(false);
      });

    return () => controller.abort();
  }, [activeTab?.url]);

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

  const saveCurrentSearchScroll = () => {
    const route = activeTab ? parseJupiterSearchRoute(activeTab.url) : null;
    if (route && searchResultsScrollRef.current) {
      const key = buildJupiterSearchRoute(route.query, route.engine, route.lang, route.category, route.page);
      searchScrollPositionsRef.current[key] = searchResultsScrollRef.current.scrollTop;
    }
  };

  const openPdfDocument = (sourceUrl: string, fromHistory = false) => {
    const viewerRoute = toJupiterDocumentRoute(sourceUrl);
    if (!viewerRoute) {
      setBrowserEngineError('PDF 来源地址无效或不受支持。');
      return;
    }

    const title = getExternalAssetTitle(sourceUrl);
    if (!fromHistory) {
      saveCurrentSearchScroll();
      pushHistory(activeTabId, viewerRoute);
    }
    recordBrowserVisit(activeTabId, sourceUrl, title);
    setTabs(previous => previous.map(tab => tab.id === activeTabId
      ? { ...tab, url: viewerRoute, title, content: '', author: 'PDF', readTime: '', readerMode: true }
      : tab));
    setInputUrl(viewerRoute);
    setSearchResults([]);
    setLastSearchQuery('');
    setSearchError(null);
    setBrowserEngineError(null);
    setJupiterContentError(null);
    setIsLoading(false);
    window.history.replaceState(null, '', viewerRoute);
  };

  const openImageDocument = (sourceUrl: string, fromHistory = false, allowUnknownImageExtension = false) => {
    const viewerRoute = toJupiterImageRoute(sourceUrl, allowUnknownImageExtension);
    if (!viewerRoute) {
      setBrowserEngineError('图片来源地址无效或不受支持。');
      return;
    }

    const title = getExternalAssetTitle(sourceUrl);
    if (!fromHistory) {
      saveCurrentSearchScroll();
      pushHistory(activeTabId, viewerRoute);
    }
    recordBrowserVisit(activeTabId, sourceUrl, title);
    setTabs(previous => previous.map(tab => tab.id === activeTabId
      ? { ...tab, url: viewerRoute, title, content: '', author: 'Image', readTime: '', readerMode: true }
      : tab));
    setInputUrl(viewerRoute);
    setSearchResults([]);
    setLastSearchQuery('');
    setSearchError(null);
    setBrowserEngineError(null);
    setJupiterContentError(null);
    setIsLoading(false);
    window.history.replaceState(null, '', viewerRoute);
  };

  const openAudioDocument = (sourceUrl: string, fromHistory = false) => {
    const viewerRoute = toJupiterAudioRoute(sourceUrl);
    if (!viewerRoute) {
      setBrowserEngineError('音频来源地址无效或不受支持。');
      return;
    }

    const title = getExternalAssetTitle(sourceUrl);
    if (!fromHistory) {
      saveCurrentSearchScroll();
      pushHistory(activeTabId, viewerRoute);
    }
    recordBrowserVisit(activeTabId, sourceUrl, title);
    setTabs(previous => previous.map(tab => tab.id === activeTabId
      ? { ...tab, url: viewerRoute, title, content: '', author: 'Audio', readTime: '', readerMode: true }
      : tab));
    setInputUrl(viewerRoute);
    setSearchResults([]);
    setLastSearchQuery('');
    setSearchError(null);
    setBrowserEngineError(null);
    setJupiterContentError(null);
    setIsLoading(false);
    window.history.replaceState(null, '', viewerRoute);
  };

  const openVideoDocument = (sourceUrl: string, fromHistory = false) => {
    const viewerRoute = toJupiterVideoRoute(sourceUrl);
    if (!viewerRoute) {
      setBrowserEngineError('视频来源地址无效或不受支持。');
      return;
    }

    const title = getExternalAssetTitle(sourceUrl);
    if (!fromHistory) {
      saveCurrentSearchScroll();
      pushHistory(activeTabId, viewerRoute);
    }
    recordBrowserVisit(activeTabId, sourceUrl, title);
    setTabs(previous => previous.map(tab => tab.id === activeTabId
      ? { ...tab, url: viewerRoute, title, content: '', author: 'Video', readTime: '', readerMode: true }
      : tab));
    setInputUrl(viewerRoute);
    setSearchResults([]);
    setLastSearchQuery('');
    setSearchError(null);
    setBrowserEngineError(null);
    setJupiterContentError(null);
    setIsLoading(false);
    window.history.replaceState(null, '', viewerRoute);
  };

  const runJupiterSearch = async (
    query: string,
    options: { fromHistory?: boolean; engine?: JupiterSearchEngine; lang?: Language; category?: JupiterSearchCategory; page?: number } = {}
  ) => {
    const cleanQuery = query.trim();
    if (!cleanQuery) return;
    const category = options.category ?? searchCategory;
    const engine = category === 'all' ? options.engine ?? searchEngine : 'auto';
    const searchLang = options.lang ?? browserLang;
    const page = options.page ?? 1;
    const route = buildJupiterSearchRoute(cleanQuery, engine, searchLang, category, page);
    const requestId = ++searchRequestIdRef.current;
    if (!options.fromHistory) {
      saveCurrentSearchScroll();
      pushHistory(activeTabId, route);
      searchScrollPositionsRef.current[route] = 0;
    }

    setSearchEngine(engine);
    setBrowserLang(searchLang);
    setSearchCategory(category);
    setSearchPage(page);
    setInputUrl(cleanQuery);
    setLastSearchQuery(cleanQuery);
    setSearchResults([]);
    setSearchError(null);
    setBrowserEngineError(null);
    setIsSearching(true);
    setTabs(previous => previous.map(tab => tab.id === activeTabId ? { ...tab, url: route, title: cleanQuery, readerMode: true } : tab));
    window.history.replaceState(null, '', route);

    try {
      const res = await fetch(`/api/jupiter/search?q=${encodeURIComponent(cleanQuery)}&engine=${engine}&lang=${searchLang}&type=${category}`);
      const data = await res.json();
      if (requestId !== searchRequestIdRef.current) return;
      if (res.ok && data.success && Array.isArray(data.results)) {
        setSearchResults(data.results);
      } else {
        setSearchResults([]);
        setSearchError(data.error || `搜索失败（HTTP ${res.status}）。`);
      }
    } catch (error) {
      if (requestId !== searchRequestIdRef.current) return;
      console.error(error);
      setSearchResults([]);
      setSearchError(error instanceof Error ? error.message : '搜索服务暂时不可用。');
    } finally {
      if (requestId === searchRequestIdRef.current) setIsSearching(false);
    }
  };

  const handleNavigate = async (targetUrl: string, fromHistory = false) => {
    if (targetUrl === JUPITER_HOME_URL) {
      const newId = `tab_${Date.now()}`;
      const newTab: BrowserTab = {
        id: newId,
        title: 'JUPITER',
        url: JUPITER_HOME_URL,
        readerMode: false,
        content: '',
        author: '',
        readTime: ''
      };
      setTabs(previous => [...previous, newTab]);
      setActiveTabId(newId);
      setInputUrl('');
      setSearchResults([]);
      setLastSearchQuery('');
      setSearchError(null);
      return;
    }
    let cleanUrl = targetUrl.trim();
    if (!cleanUrl) return;

    const searchRoute = parseJupiterSearchRoute(cleanUrl);
    if (searchRoute) {
      await runJupiterSearch(searchRoute.query, { ...searchRoute, fromHistory: true });
      return;
    }

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
      await runJupiterSearch(cleanUrl, { fromHistory, engine: searchEngine, lang: browserLang });
      return;
    }

    if (hasScheme && !/^https?:\/\//i.test(cleanUrl)) {
      setBrowserEngineError('出于安全考虑，只支持 HTTP 或 HTTPS 网页地址。');
      return;
    }

    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = 'https://' + cleanUrl;
    }

    // 1) JUPITER books route: open internal library detail for earth books.
    const jContent = (() => { try { const p = new URL(cleanUrl, 'https://jupiter.earth.invalid').pathname; const m = p.match(/^\/jupiter\/read\/book\/([^/]+)$/); return m ? decodeURIComponent(m[1]) : null; } catch { return null; } })();
    if (jContent) {
      // Navigate in-place to JUPITER content route (handled by reader render path).
      if (!fromHistory) { saveCurrentSearchScroll(); pushHistory(activeTabId, cleanUrl); }
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, url: cleanUrl, title: 'EARTH Book', readerMode: true } : t));
      setInputUrl(cleanUrl);
      setIsLoading(false);
      return;
    }

    // 2) Direct playable media URLs: open in JUPITER viewers (Saturn-style in-app playback for YouTube/Vimeo).
    if (isRemotePdfUrl(cleanUrl)) { openPdfDocument(cleanUrl, fromHistory); return; }
    if (isRemoteImageUrl(cleanUrl)) { openImageDocument(cleanUrl, fromHistory, true); return; }
    if (isRemoteAudioUrl(cleanUrl)) { openAudioDocument(cleanUrl, fromHistory); return; }
    if (isPlayableVideoUrl(cleanUrl)) { openVideoDocument(cleanUrl, fromHistory); return; }

    setIsLoading(true);
    setInputUrl(cleanUrl);
    setSearchResults([]);
    setLastSearchQuery('');
    setSearchError(null);
    if (!fromHistory) {
      saveCurrentSearchScroll();
      pushHistory(activeTabId, cleanUrl);
    }
    recordBrowserVisit(activeTabId, cleanUrl, new URL(cleanUrl).hostname);

    // Immediately show a loading placeholder in the article view so the user
    // sees clear feedback instead of the previous page's content.
    setTabs(prev =>
      prev.map(t =>
        t.id === activeTabId
          ? { ...t, url: cleanUrl, title: 'Loading…', content: '', author: '', readTime: '', readerMode: !browserEngine }
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

    if (!browserEngine) {
      window.open(cleanUrl, '_blank', 'noopener,noreferrer');
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
                  readTime: data.readTime,
                  crawlerData: {
                    wordCount: data.wordCount,
                    charCount: data.charCount,
                    headings: data.headings,
                    links: data.links,
                    images: data.images,
                    crawledAt: data.crawledAt,
                    latencyMs: data.latencyMs,
                    httpStatus: data.httpStatus || 200,
                    description: data.description
                  }
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

  const openJupiterResult = (result: JupiterSearchResult) => {
    if (isRemotePdfUrl(result.url)) { openPdfDocument(result.url); return; }
    if (isRemoteImageUrl(result.url)) { openImageDocument(result.url, false, true); return; }
    if (isRemoteAudioUrl(result.url)) { openAudioDocument(result.url); return; }
    if (isPlayableVideoUrl(result.url)) { openVideoDocument(result.url); return; }
    void handleNavigate(result.url);
  };

  const handleNewTab = () => {
    const newId = `tab_${Date.now()}`;
    const newTab: BrowserTab = {
      id: newId,
      title: 'JUPITER',
      url: JUPITER_HOME_URL,
      readerMode: true,
      content: ''
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newId);
    setHistory(prev => ({ ...prev, [newId]: [newTab.url] }));
    setHistoryIndex(prev => ({ ...prev, [newId]: 0 }));
    setSearchResults([]);
    recordBrowserVisit(newId, newTab.url, newTab.title);
  };

  const handleReorderTabs = (tabIds: string[]) => {
    const currentTabs = tabsRef.current;
    if (tabIds.length !== currentTabs.length || new Set(tabIds).size !== currentTabs.length) return;
    const currentById = new Map(currentTabs.map(tab => [tab.id, tab]));
    if (tabIds.some(id => !currentById.has(id))) return;

    if (browserEngine?.reorderTabs) {
      void browserEngine.reorderTabs(tabIds).then(result => {
        if (!result.success) {
          setBrowserEngineError(result.error || '无法调整浏览器标签顺序。');
          return;
        }
        setTabs(previous => {
          if (previous.length !== tabIds.length || tabIds.some(id => !previous.some(tab => tab.id === id))) return previous;
          const byId = new Map(previous.map(tab => [tab.id, tab]));
          return tabIds.map(id => byId.get(id)!);
        });
      }).catch(() => setBrowserEngineError('无法调整浏览器标签顺序。'));
      return;
    }

    setTabs(tabIds.map(id => currentById.get(id)!));
  };

  const handleRestoreClosedTab = () => {
    if (!browserEngine?.restoreLastClosedTab || !canRestoreClosedTab) return;
    void browserEngine.restoreLastClosedTab().then(result => {
      if (!result.success) {
        setCanRestoreClosedTab(false);
        setBrowserEngineError(result.error || '无法恢复最近关闭的标签页。');
      }
    }).catch(() => {
      setCanRestoreClosedTab(false);
      setBrowserEngineError('无法恢复最近关闭的标签页。');
    });
  };

  const goBack = () => {
    const stack = history[activeTabId] || [];
    const idx = historyIndex[activeTabId] ?? 0;
    if (idx > 0) {
      const target = stack[idx - 1];
      setHistoryIndex(prev => ({ ...prev, [activeTabId]: idx - 1 }));
      handleNavigate(target, true);
      return;
    }
    if (browserEngine) void browserEngine.goBack(activeTabId);
  };

  const goForward = () => {
    const stack = history[activeTabId] || [];
    const idx = historyIndex[activeTabId] ?? 0;
    if (idx < stack.length - 1) {
      const target = stack[idx + 1];
      setHistoryIndex(prev => ({ ...prev, [activeTabId]: idx + 1 }));
      handleNavigate(target, true);
      return;
    }
    if (browserEngine) void browserEngine.goForward(activeTabId);
  };

  useEffect(() => {
    const route = activeTab ? parseJupiterSearchRoute(activeTab.url) : null;
    if (route) {
      void runJupiterSearch(route.query, { ...route, fromHistory: true });
      return;
    }

    searchRequestIdRef.current += 1;
    setSearchResults([]);
    setLastSearchQuery('');
    setSearchError(null);
    setSearchCategory('all');
    setSearchPage(1);
    setIsSearching(false);
  }, [activeTabId]);

  useEffect(() => {
    if (browserEngine || !activeTab || activeTab.readerMode || isJupiterContentUrl(activeTab.url) || parseJupiterSearchRoute(activeTab.url)) {
      setPreviewHtml(null);
      return;
    }
    if (isHttpUrl(activeTab.url)) void loadPreviewHtml(activeTab.url);
    else setPreviewHtml(null);
  }, [activeTabId, activeTab?.url, activeTab?.readerMode, browserEngine]);

  useEffect(() => {
    const route = activeTab ? parseJupiterSearchRoute(activeTab.url) : null;
    if (!route || isSearching) return;
    const key = buildJupiterSearchRoute(route.query, route.engine, route.lang, route.category, route.page);
    const position = searchScrollPositionsRef.current[key] || 0;
    const frame = window.requestAnimationFrame(() => {
      searchResultsScrollRef.current?.scrollTo({ top: position });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTabId, isSearching, lastSearchQuery, searchResults]);

  const searchPageCount = Math.max(1, Math.ceil(searchResults.length / 10));
  const visibleSearchResults = searchResults.slice((searchPage - 1) * 10, searchPage * 10);
  const navigateSearchPage = (page: number) => {
    const route = activeTab ? parseJupiterSearchRoute(activeTab.url) : null;
    if (!route || page < 1 || page > searchPageCount) return;
    void runJupiterSearch(route.query, { ...route, page });
  };

  // 星图联动：仅 /jupiter/search 深链时消费 initialQuery；普通进入保持首页，避免地址栏被预填
  useEffect(() => {
    if (initialQuery && initialQuery.trim() && typeof window !== 'undefined' && window.location.pathname === '/jupiter/search') {
      void handleNavigate(initialQuery.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  // 网页预览（Web 预览模式）：优先尝试同源 HTML 代理（可嵌入时体验更接近原页），
  // 不可用时回退到 /api/browser/proxy。两者都不是原生 Chromium 浏览器。
  const loadPreviewHtml = async (url: string) => {
    const safe = isHttpUrl(url) ? url : '';
    setIsPreviewLoading(true);
    setPreviewHtml(null);
    if (!safe) { setIsPreviewLoading(false); return; }
    try {
      const res = await fetch(`/api/browser/raw-html?url=${encodeURIComponent(safe)}`);
      if (res.ok) {
        const html = await res.text();
        if (html && html.length > 32) setPreviewHtml(html);
      }
    } catch {
      /* proxy iframe fallback */
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabsRef.current.length === 1) return;
    if (browserEngine) {
      void browserEngine.closeTab(id).then(result => {
        if (!result.success) setBrowserEngineError('无法关闭该浏览器标签。');
      }).catch(() => setBrowserEngineError('无法关闭该浏览器标签。'));
      return;
    }
    const remaining = tabsRef.current.filter(t => t.id !== id);
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
      setBrowserSessionSnapshotCount(result.enabled ? tabs.length : 0);
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

  const handleClearBrowsingData = async (
    selection: EarthOneBrowserPrivacySelection,
    timeRange: EarthOneBrowserPrivacyTimeRange
  ): Promise<EarthOneBrowserPrivacyResult> => {
    if (!browserEngine?.clearBrowsingData) {
      return { success: false, changed: false, error: '此操作仅在桌面 Chromium Browser 中可用。', results: {} };
    }
    const result = await browserEngine.clearBrowsingData(selection, timeRange);
    const localData = result.results.localData;
    if (localData?.success && localData.data) {
      setBookmarks(localData.data.bookmarks);
      setBrowserHistory(localData.data.history);
      setWorkspaceRepos(localData.data.bookmarks.filter(bookmark => bookmark.category === 'GitHub / 待审核接入').map(bookmark => bookmark.title));
    }
    const [freshDownloads, freshSession, freshPermissions, freshDownloadStatus] = await Promise.all([
      browserEngine.getDownloads().catch(() => null),
      browserEngine.getSessionState().catch(() => null),
      browserEngine.getPermissionState().catch(() => null),
      browserEngine.getDownloadStorageStatus().catch(() => null)
    ]);
    if (freshDownloads) setDownloads(freshDownloads);
    if (freshSession) {
      setBrowserSessionEnabled(Boolean(freshSession.enabled));
      setBrowserSessionSnapshotCount(Array.isArray(freshSession.tabs) ? freshSession.tabs.length : 0);
      setBrowserSessionReadOnly(Boolean(freshSession.readOnly));
      setBrowserSessionWarning(freshSession.warning || null);
    }
    if (freshPermissions) setBrowserPermissionState(freshPermissions);
    if (freshDownloadStatus) {
      setBrowserDownloadStorageReadOnly(Boolean(freshDownloadStatus.readOnly));
      setDownloadStorageWarning(freshDownloadStatus.warning || null);
    }
    return result;
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

  const handleRunAiAnalysis = async (type: 'summary' | 'entities' | 'qa' | 'crawler') => {
    setAiAnalysisType(type);
    if (type === 'crawler') {
      await handleDeepCrawlerExtract();
      return;
    }
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
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[#05080d] p-3 text-slate-100 sm:p-5">
      <BrowserFrame
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
        canRestoreClosedTab={Boolean(browserEngine && canRestoreClosedTab)}
        onRestoreClosedTab={handleRestoreClosedTab}
        onReorderTabs={handleReorderTabs}
        onBackToUniverse={onBackToUniverse}
        onBackToGlobe={onBackToGlobe}
      >

      {/* 2. Omnibox Toolbar */}
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-white/10 bg-white/[0.02] px-3 py-2.5 backdrop-blur-xl sm:px-4">
        <div className="flex shrink-0 items-center gap-0.5 rounded-xl border border-white/10 bg-black/20 p-1 text-slate-400">
          <button
            onClick={goBack}
            disabled={(historyIndex[activeTabId] ?? 0) <= 0 &&
              !(browserEngineState?.tabId === activeTabId && browserEngineState.canGoBack)}
            className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="后退"
            title="后退 (Alt+Left)"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goForward}
            disabled={(historyIndex[activeTabId] ?? 0) >= (history[activeTabId]?.length ?? 1) - 1 &&
              !(browserEngineState?.tabId === activeTabId && browserEngineState.canGoForward)}
            className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="前进"
            title="前进 (Alt+Right)"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => browserEngine ? void browserEngine.reload(activeTabId) : void handleNavigate(inputUrl)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.07] hover:text-white ${
              isLoading ? 'animate-spin text-cyan-400' : ''
            }`}
            aria-label="重新加载"
            title="重新加载 (Ctrl+R / F5)"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleNavigate(JUPITER_HOME_URL)}
            className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.07] hover:text-cyan-200"
            aria-label="返回主页 (Google 新标签页)"
            title="返回主页 (Google / 新标签页)"
          >
            <Home className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={e => {
            e.preventDefault();
            handleNavigate(inputUrl);
          }}
          className="flex min-h-11 min-w-[220px] flex-1 items-center rounded-2xl border border-white/10 bg-black/25 px-4 transition-all focus-within:border-cyan-400/40 focus-within:ring-2 focus-within:ring-cyan-400/10 hover:border-white/15"
        >
          {browserEngine && !activeTab?.readerMode ? (
            <span
              role="status"
              aria-label={connectionStatusLabel}
              title={connectionStatusTitle}
              data-browser-connection-status
              data-status={connectionStatus}
              className={`mr-2 inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-[10px] font-medium leading-none ${
                connectionStatus === 'encrypted'
                  ? 'bg-cyan-300/[0.08] text-cyan-200'
                  : connectionStatus === 'unencrypted'
                    ? 'bg-amber-300/[0.08] text-amber-200'
                    : connectionStatus === 'certificate-error'
                      ? 'bg-rose-300/[0.1] text-rose-200'
                      : 'bg-white/[0.05] text-slate-400'
              }`}
            >
              {connectionStatus === 'encrypted'
                ? <LockKeyhole aria-hidden="true" className="h-3 w-3" />
                : connectionStatus === 'certificate-error'
                  ? <ShieldAlert aria-hidden="true" className="h-3 w-3" />
                  : <Globe aria-hidden="true" className="h-3 w-3" />}
              <span>{connectionStatusLabel}</span>
            </span>
          ) : !browserEngine ? (
            <div className="mr-2 flex shrink-0 items-center gap-1">
              <GoogleGIcon className="h-3.5 w-3.5" />
              <Shield className="h-3 w-3 text-emerald-400" />
            </div>
          ) : null}
          <input
            ref={addressBarRef}
            type="text"
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            aria-label="输入网址或搜索词"
            placeholder="搜索或输入网址"
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
          {/* Star bookmark toggle button */}
          <button
            type="button"
            onClick={handleToggleCurrentBookmark}
            title={isCurrentBookmarked ? "从书签中移除" : "为此网页添加书签 (Ctrl+D)"}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ml-1 ${isCurrentBookmarked ? 'text-amber-400' : 'text-slate-500 hover:text-amber-300'}`}
          >
            <Star className={`h-4 w-4 ${isCurrentBookmarked ? 'fill-amber-400' : ''}`} />
          </button>
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

        {browserEngine && !activeTab?.readerMode && (() => {
          const zoomState = browserEngineState?.tabId === activeTabId ? browserEngineState : null;
          const zoomPercent = zoomState?.zoomPercent ?? 100;
          const zoomReady = Boolean(zoomState?.active);
          return (
            <div
              role="group"
              aria-label="Chromium 网页缩放"
              data-browser-zoom
              className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-full border border-white/[0.07] bg-white/[0.035] p-0.5 text-slate-300"
            >
              <button
                type="button"
                onClick={() => void browserEngine.changeZoom('out')}
                disabled={!zoomReady || zoomPercent <= 50}
                aria-label="缩小网页"
                title="缩小网页（Ctrl/Cmd+Minus）"
                data-browser-zoom-out
                className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/[0.08] hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void browserEngine.changeZoom('reset')}
                disabled={!zoomReady || zoomPercent === 100}
                aria-label={`重置网页缩放，当前 ${zoomPercent}%`}
                title="重置网页缩放（Ctrl/Cmd+0）"
                data-browser-zoom-reset
                className="min-w-[3.25rem] rounded-md px-1.5 text-center text-[11px] font-semibold tabular-nums text-slate-200 transition hover:bg-white/[0.08] hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {zoomPercent}%
              </button>
              <button
                type="button"
                onClick={() => void browserEngine.changeZoom('in')}
                disabled={!zoomReady || zoomPercent >= 200}
                aria-label="放大网页"
                title="放大网页（Ctrl/Cmd+Plus）"
                data-browser-zoom-in
                className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/[0.08] hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })()}

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
          className={`inline-flex min-h-8 shrink-0 items-center rounded-full border px-3 text-[11px] font-medium tracking-wide ${
            browserEngine
              ? 'border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-200'
              : 'border-amber-300/20 bg-amber-300/[0.05] text-amber-200'
          }`}
        >
          {browserEngine ? '真实 Chromium' : '网页预览'}
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 sm:ml-auto sm:w-auto sm:justify-end">
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

          {browserEngine && (
            <button
              type="button"
              onClick={() => {
                setIsBrowserDataOpen(false);
                setIsDownloadsOpen(false);
                setIsPermissionsOpen(false);
                setIsPrivacyOpen(true);
              }}
              aria-label="打开隐私与清除浏览数据"
              title="选择要清除的本机 Browser 数据；下载文件和 PDF 会保留。"
              data-browser-privacy-open
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.035] px-3 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08] hover:text-cyan-100"
            >
              <ShieldAlert className="h-3.5 w-3.5 text-cyan-300" />
              <span>隐私</span>
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
              <option value="google">Google</option>
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

          {/* 3-Way Mode Switcher: Live Web / Reader Mode / Crawler Scraper */}
          <div className="inline-flex h-9 items-center rounded-full border border-white/[0.08] bg-white/[0.035] p-0.5 text-xs">
            <button
              onClick={() => {
                setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, readerMode: false, crawlerView: false } : t));
              }}
              title="原生网页浏览"
              className={`rounded-full px-2.5 py-1 font-medium transition ${!activeTab?.readerMode && !activeTab?.crawlerView ? 'bg-cyan-400 text-slate-950 font-semibold' : 'text-slate-400 hover:text-white'}`}
            >
              <Globe className="inline w-3 h-3 mr-1" />
              网页
            </button>
            <button
              onClick={() => {
                setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, readerMode: true, crawlerView: false } : t));
              }}
              title="纯净正文阅读"
              className={`rounded-full px-2.5 py-1 font-medium transition ${activeTab?.readerMode && !activeTab?.crawlerView ? 'bg-cyan-400 text-slate-950 font-semibold' : 'text-slate-400 hover:text-white'}`}
            >
              <BookOpen className="inline w-3 h-3 mr-1" />
              阅读
            </button>
            <button
              onClick={() => {
                setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, readerMode: true, crawlerView: true } : t));
              }}
              title="爬虫结构化数据深度探针"
              className={`rounded-full px-2.5 py-1 font-medium transition ${activeTab?.crawlerView ? 'bg-amber-400 text-slate-950 font-semibold' : 'text-slate-400 hover:text-white'}`}
            >
              <Compass className="inline w-3 h-3 mr-1 text-amber-400" />
              爬虫探针
            </button>
          </div>

          <button
            onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
            aria-label={isAiPanelOpen ? '关闭 AI 伴侣' : '打开 AI 伴侣'}
            title={`打开 Ollama AI 伴侣 (对话: ${ollamaStatus.chatModel || 'qwen3'} · 深度爬虫: ${ollamaStatus.crawlerModel || '32b'})`}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-all ${
              isAiPanelOpen
                ? 'border-violet-300/25 bg-violet-300/10 text-violet-100 shadow-sm shadow-violet-950/30'
                : 'border-white/[0.07] bg-white/[0.035] text-slate-300 hover:bg-white/[0.08]'
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Ollama AI</span>
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

      {/* 3. Chrome Bookmarks Bar */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-white/10 bg-white/[0.015] px-3 py-1.5 text-xs [scrollbar-width:none]">
        {bookmarks.slice(0, 12).map(bm => (
          <button
            key={bm.id}
            onClick={() => handleNavigate(bm.url)}
            title={`${bm.title} · ${bm.url}`}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white shrink-0 text-xs font-medium"
          >
            {bm.url.includes('google.com') ? (
              <GoogleGIcon className="h-3.5 w-3.5 shrink-0" />
            ) : bm.url.includes('youtube.com') ? (
              <span className="text-red-500 font-bold text-[11px] leading-none shrink-0">▶</span>
            ) : bm.url.includes('github.com') ? (
              <Code2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            ) : bm.url.includes('openlibrary.org') ? (
              <BookOpen className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            ) : bm.url.includes('europeana.eu') ? (
              <Globe className="h-3.5 w-3.5 text-sky-400 shrink-0" />
            ) : bm.url.includes('wikipedia.org') ? (
              <span className="font-serif font-bold text-slate-300 text-xs shrink-0">W</span>
            ) : (
              <Globe className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            )}
            <span className="truncate max-w-[110px]">{bm.title}</span>
          </button>
        ))}
        {crawlerEnqueuedToast && (
          <div className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-950/60 border border-amber-500/30 px-3 py-1 rounded-full shrink-0">
            <span>{crawlerEnqueuedToast}</span>
          </div>
        )}
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
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(34,211,238,0.06),transparent_55%),linear-gradient(180deg,#070a0f,#05080d)]">
        <div ref={searchResultsScrollRef} className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-8">
          {lastSearchQuery || searchResults.length > 0 || isSearching ? (
            <div className="mx-auto w-full max-w-4xl">
              <div className="mb-6">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-2.5 py-1 font-semibold tracking-[0.18em] text-cyan-100">JUPITER SEARCH</span>
                  <span className={`rounded-full border px-2.5 py-1 font-medium ${searchCategory !== 'all' ? 'border-violet-300/20 bg-violet-300/[0.06] text-violet-100' : searchEngine === 'github' ? 'border-slate-600 bg-slate-900 text-white' : 'border-white/[0.08] bg-white/[0.04] text-slate-300'}`}>
                    {searchCategory !== 'all' ? `${JUPITER_SEARCH_CATEGORY_LABELS[searchCategory]}搜索` : searchEngine === 'github' ? 'GitHub 公共仓库' : '真实互联网搜索'}
                  </span>
                  {!isSearching && <span>{searchResults.length} 条结果</span>}
                  <span className="text-slate-500">{searchCategory === 'all' ? 'EARTH 内容与公开网页' : 'EARTH 内容与对应外部搜索源'}</span>
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-white leading-snug sm:text-4xl">
                  “{lastSearchQuery}”
                </h1>
                <nav aria-label="JUPITER 搜索分类" className="mt-4 flex gap-2 overflow-x-auto pb-1">
                  {([
                    'all', 'videos', 'images', 'news', 'pdf', 'audio', 'books', 'academic'
                  ] as const).map(category => (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={searchCategory === category}
                      onClick={() => void runJupiterSearch(lastSearchQuery, { category, engine: searchEngine, lang: browserLang })}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        searchCategory === category
                          ? 'border-amber-200/30 bg-amber-200/[0.1] text-amber-100'
                          : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-white'
                      }`}
                    >
                      {JUPITER_SEARCH_CATEGORY_LABELS[category]}
                    </button>
                  ))}
                </nav>
              </div>

              {isSearching ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-4">
                  <RotateCw className="w-8 h-8 animate-spin text-blue-400" />
                  <span>正在搜索 EARTH 内容与真实互联网…</span>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="text-center text-slate-500 py-16 space-y-3">
                  <p className="text-sm text-slate-300">{searchError || '没有找到相关结果。'}</p>
                  <p className="mx-auto max-w-md text-xs leading-relaxed text-slate-500">结果来自真实搜索源与 EARTH 索引；无结果可能代表来源限制、配置缺失或查询过窄。可切换分类/引擎、调整语言，或直接输入网址打开。</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleSearchResults.map((result, idx) => result.source === 'github' ? (
                    <div key={idx} className="group w-full rounded-2xl border border-white/[0.08] bg-[#0d151d] p-5 text-left transition-all hover:border-cyan-200/20 hover:bg-[#111d25] sm:p-6">
                      <div className="flex items-start justify-between gap-4">
                        <button onClick={() => openJupiterResult(result)} className="min-w-0 text-left">
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
                    <button key={idx} onClick={() => openJupiterResult(result)} className="group w-full cursor-pointer rounded-2xl border border-white/[0.07] bg-[#0d151d] p-5 text-left transition-all hover:border-amber-200/20 hover:bg-[#111922] sm:p-6">
                      {(result.category === 'images' || result.category === 'videos') && result.thumbnailUrl && (
                        <div className="mb-4 flex max-h-72 items-center justify-center overflow-hidden rounded-xl bg-black/20">
                          <img
                            src={result.thumbnailUrl}
                            alt={result.title}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="max-h-72 w-full object-contain"
                          />
                        </div>
                      )}
                      <div className="flex min-w-0 items-center gap-2 truncate font-mono text-[11px] text-amber-200/80">
                        {result.source === 'earth' ? <Globe className="h-3 w-3 shrink-0" /> : <ExternalLink className="h-3 w-3 shrink-0" />}
                        <span className="truncate">{result.source === 'earth' ? `EARTH · ${result.kind}` : result.domain}</span>
                      </div>
                      <h2 className="mt-2 text-base font-semibold leading-snug text-slate-100 transition-colors group-hover:text-amber-100 sm:text-lg">{result.title}</h2>
                      {result.snippet && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400 sm:text-sm">{result.snippet}</p>}
                      {(result.date || result.duration) && (
                        <span className="mt-2 block text-[11px] text-slate-500">
                          {[result.date, result.duration].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      <span className="mt-3 inline-flex items-center gap-1 text-[11px] text-amber-200/70">
                        {result.category === 'images'
                          ? '在 JUPITER 内查看图片'
                          : result.category === 'videos' || result.kind === 'video' || isPlayableVideoUrl(result.url)
                            ? (isPlayableVideoUrl(result.url) ? '在 JUPITER 内播放' : '打开视频来源')
                            : result.category === 'news'
                              ? '在 JUPITER 内阅读新闻来源'
                              : result.category === 'pdf'
                                ? '在 JUPITER 内阅读 PDF'
                                : result.category === 'audio'
                                  ? '在 JUPITER 内播放音频'
                                  : result.category === 'books'
                                    ? '在 JUPITER 内打开图书来源'
                                    : result.category === 'academic'
                                      ? '打开学术来源'
                                      : result.source === 'earth'
                          ? '在 JUPITER 内阅读'
                          : isRemotePdfUrl(result.url)
                            ? '在 JUPITER 内阅读 PDF'
                            : isRemoteImageUrl(result.url)
                              ? '在 JUPITER 内查看图片'
                              : isRemoteAudioUrl(result.url)
                                ? '在 JUPITER 内播放音频'
                                : isRemoteVideoUrl(result.url) ? '在 JUPITER 内播放视频' : '在 JUPITER 标签页打开'}
                        <ChevronRight className="h-3 w-3" />
                      </span>
                    </button>
                  ))}
                  {searchPageCount > 1 && (
                    <nav aria-label="搜索结果分页" className="flex items-center justify-between gap-3 pt-3">
                      <button
                        type="button"
                        disabled={searchPage <= 1 || isSearching}
                        onClick={() => navigateSearchPage(searchPage - 1)}
                        className="rounded-full border border-white/[0.1] px-4 py-2 text-xs text-slate-300 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        上一页
                      </button>
                      <span className="text-xs text-slate-500">第 {searchPage} / {searchPageCount} 页 · 共 {searchResults.length} 条</span>
                      <button
                        type="button"
                        disabled={searchPage >= searchPageCount || isSearching}
                        onClick={() => navigateSearchPage(searchPage + 1)}
                        className="rounded-full border border-white/[0.1] px-4 py-2 text-xs text-slate-300 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        下一页
                      </button>
                    </nav>
                  )}
                </div>
              )}
            </div>
          ) : activeTab ? (
            isJupiterContentUrl(activeTab.url) ? (
              activeJupiterRoute?.kind === 'document' ? (
                <div className="mx-auto w-full max-w-5xl">
                  <Suspense fallback={<div role="status" className="py-16 text-center text-sm text-slate-400">正在加载文档查看器…</div>}>
                    <LazyPdfDocumentViewer sourceUrl={activeJupiterRoute.id} title={jupiterContent?.title || getExternalAssetTitle(activeJupiterRoute.id)} lang={browserLang} />
                  </Suspense>
                </div>
              ) : activeJupiterRoute?.kind === 'image' ? (
                <div className="mx-auto w-full max-w-6xl">
                  <Suspense fallback={<div role="status" className="py-16 text-center text-sm text-slate-400">正在加载图片查看器…</div>}>
                    <LazyImageDocumentViewer sourceUrl={activeJupiterRoute.id} title={jupiterContent?.title || getExternalAssetTitle(activeJupiterRoute.id)} lang={browserLang} />
                  </Suspense>
                </div>
              ) : activeJupiterRoute?.kind === 'audio' ? (
                <div className="mx-auto w-full max-w-4xl">
                  <Suspense fallback={<div role="status" className="py-16 text-center text-sm text-slate-400">正在加载音频播放器…</div>}>
                    <LazyAudioDocumentViewer sourceUrl={activeJupiterRoute.id} title={jupiterContent?.title || getExternalAssetTitle(activeJupiterRoute.id)} lang={browserLang} />
                  </Suspense>
                </div>
              ) : activeJupiterRoute?.kind === 'external-video' ? (
                <div className="mx-auto w-full max-w-5xl">
                  <Suspense fallback={<div role="status" className="py-16 text-center text-sm text-slate-400">正在加载视频播放器…</div>}>
                    <LazyVideoDocumentViewer sourceUrl={activeJupiterRoute.id} title={jupiterContent?.title || getExternalAssetTitle(activeJupiterRoute.id)} lang={browserLang} />
                  </Suspense>
                </div>
              ) : (
              <article className="mx-auto w-full max-w-4xl rounded-3xl border border-white/[0.07] bg-[#0d151d] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.2)] sm:p-10">
                {isJupiterContentLoading ? (
                  <div className="py-20 text-center text-sm text-slate-400" role="status">正在从 EARTH 内容索引加载…</div>
                ) : jupiterContentError ? (
                  <div className="py-20 text-center text-sm text-rose-300" role="alert">{jupiterContentError}</div>
                ) : jupiterContent ? (
                  <>
                    <div className="mb-6 border-b border-slate-800 pb-6">
                      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="rounded-full border border-amber-200/15 bg-amber-200/[0.06] px-2.5 py-1 font-medium text-amber-100">EARTH · {jupiterContent.kind}</span>
                        {jupiterContent.author && <span>{jupiterContent.author}</span>}
                        {jupiterContent.duration && <span>· {jupiterContent.duration}</span>}
                        {jupiterContent.createdAt && <span>· {new Date(jupiterContent.createdAt).toLocaleDateString()}</span>}
                      </div>
                      <h1 className="text-2xl font-semibold leading-snug text-white sm:text-4xl">{jupiterContent.title}</h1>
                      {jupiterContent.summary && <p className="mt-4 text-sm leading-7 text-slate-300">{jupiterContent.summary}</p>}
                    </div>
                    {jupiterContent.kind === 'video' && jupiterContent.mediaUrl && isHttpUrl(jupiterContent.mediaUrl) ? (
                      <video
                        className="mb-8 max-h-[70vh] w-full rounded-2xl bg-black"
                        src={jupiterContent.mediaUrl}
                        poster={jupiterContent.thumbnailUrl && isHttpUrl(jupiterContent.thumbnailUrl) ? jupiterContent.thumbnailUrl : undefined}
                        controls
                        playsInline
                        preload="metadata"
                        aria-label={jupiterContent.title}
                      />
                    ) : null}
                    {jupiterContent.kind === 'post' && jupiterContent.mediaUrl && isHttpUrl(jupiterContent.mediaUrl) ? (
                      jupiterContent.mediaType === 'video'
                        ? <video className="mb-8 max-h-[70vh] w-full rounded-2xl bg-black" src={jupiterContent.mediaUrl} controls playsInline preload="metadata" aria-label={jupiterContent.title} />
                        : <img className="mb-8 max-h-[70vh] w-full rounded-2xl object-contain" src={jupiterContent.mediaUrl} alt={jupiterContent.title} loading="lazy" />
                    ) : null}
                    {jupiterContent.kind === 'book' && jupiterContent.chapters?.length ? (
                      <div className="space-y-8">
                        {jupiterContent.chapters.map((chapter, index) => (
                          <section key={`${index}-${chapter.title}`} className="border-b border-white/[0.06] pb-7 last:border-0">
                            <h2 className="mb-3 text-lg font-semibold text-amber-100">{chapter.title}</h2>
                            <p className="whitespace-pre-wrap text-sm leading-8 text-slate-300">{chapter.content}</p>
                          </section>
                        ))}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap text-sm leading-8 text-slate-300 sm:text-base">
                        {jupiterContent.content || '此内容目前没有可供站内阅读的正文。'}
                      </div>
                    )}
                  </>
                ) : null}
              </article>
              )
            ) : activeTab.url === JUPITER_HOME_URL ? (
              <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-4 py-16 text-center sm:py-24">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] tracking-[0.18em] text-slate-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-300/80" aria-hidden="true" />
                  ONE BROWSER
                </div>
                <h1 className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-5xl">Explore Beyond Boundaries.</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400 sm:text-base">JUPITER 统一搜索 EARTH 内容与公开网络来源，并以阅读、查看器或{browserEngine ? '原生 Chromium' : '网页预览'}方式打开结果。结果与可用性取决于真实来源与配置。</p>
                <form
                  onSubmit={event => {
                    event.preventDefault();
                    void handleNavigate(inputUrl);
                  }}
                  className="mt-8 w-full max-w-2xl flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3.5 transition-all hover:border-white/15 focus-within:border-cyan-400/40 focus-within:ring-2 focus-within:ring-cyan-400/10"
                >
                  <Search className="h-5 w-5 shrink-0 text-slate-400" />
                  <input
                    value={inputUrl}
                    onChange={event => setInputUrl(event.target.value)}
                    aria-label="搜索或输入网址"
                    placeholder="搜索 EARTH 与互联网，或输入网址"
                    className="min-w-0 flex-1 bg-transparent py-1 text-sm text-white outline-none placeholder:text-slate-500 sm:text-base"
                    autoComplete="off"
                  />
                  <button type="submit" className="shrink-0 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">搜索</button>
                </form>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                  {[
                    { label: 'NASA Earth', url: 'https://earthobservatory.nasa.gov' },
                    { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Earth' },
                    { label: 'arXiv', url: 'https://arxiv.org' },
                    { label: 'Project Gutenberg', url: 'https://www.gutenberg.org' },
                    { label: 'GitHub', url: 'https://github.com' }
                  ].map(item => (
                    <button key={item.url} type="button" onClick={() => void handleNavigate(item.url)} className="rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs text-slate-300 transition hover:border-cyan-400/20 hover:bg-cyan-400/10 hover:text-cyan-100">{item.label}</button>
                  ))}
                </div>
                <div className="mt-10 grid w-full max-w-2xl grid-cols-1 gap-3 text-left sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"><p className="text-xs font-medium text-slate-200">真实搜索</p><p className="mt-1 text-[11px] leading-relaxed text-slate-400">聚合 EARTH 索引与公开搜索源；部分垂类依赖服务端配置。</p></div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"><p className="text-xs font-medium text-slate-200">沉浸阅读与查看</p><p className="mt-1 text-[11px] leading-relaxed text-slate-400">网页提取阅读、PDF/图片/音频/视频查看器与可嵌入媒体播放。</p></div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"><p className="text-xs font-medium text-slate-200">诚实边界</p><p className="mt-1 text-[11px] leading-relaxed text-slate-400">网页预览不等于原生浏览器；受站点策略、CSP 与 iframe 限制。</p></div>
                </div>
              </div>
            ) : activeTab.crawlerView ? (
              <div className="mx-auto max-w-4xl rounded-3xl border border-amber-500/20 bg-[#0d1622] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] sm:p-10">
                {/* Crawler Inspector Header */}
                <div className="border-b border-amber-500/20 pb-6 mb-6">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div className="flex items-center space-x-2 text-xs">
                      <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 font-semibold text-amber-200 flex items-center gap-1.5">
                        <Compass className="w-3.5 h-3.5 text-amber-300" />
                        <span>🕷️ 爬虫数据探针 · 结构化解析</span>
                      </span>
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 font-mono text-[11px] text-emerald-300">
                        HTTP {activeTab.crawlerData?.httpStatus || 200} OK
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                      <span>时延: <strong className="text-amber-200">{activeTab.crawlerData?.latencyMs || 180} ms</strong></span>
                      <span>·</span>
                      <span>字符: <strong className="text-cyan-200">{activeTab.crawlerData?.charCount || activeTab.content?.length || 0}</strong></span>
                      <span>·</span>
                      <span>词数: <strong className="text-cyan-200">{activeTab.crawlerData?.wordCount || 0}</strong></span>
                    </div>
                  </div>

                  <h1 className="text-2xl font-semibold tracking-tight text-white leading-snug sm:text-4xl">
                    {activeTab.title}
                  </h1>

                  <div className="mt-3 flex items-center space-x-2 text-xs text-cyan-400 font-mono">
                    <ExternalLink className="w-3.5 h-3.5" />
                    <a href={activeTab.url} target="_blank" rel="noreferrer" className="hover:underline truncate max-w-2xl">
                      {activeTab.url}
                    </a>
                  </div>

                  {/* Crawler Action Toolbar */}
                  <div className="mt-5 flex items-center flex-wrap gap-2.5">
                    <button
                      onClick={handleDeepCrawlerExtract}
                      disabled={isCrawlerExtracting}
                      className="inline-flex min-h-9 items-center gap-2 rounded-full bg-gradient-to-r from-amber-400 to-amber-300 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-amber-950/30 transition hover:brightness-110 disabled:opacity-50"
                    >
                      {isCrawlerExtracting ? (
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                      )}
                      <span>🤖 本地 Ollama 深度大模型结构化抽取</span>
                    </button>

                    <button
                      onClick={() => handleEnqueueCrawlerTask(activeTab.url, activeTab.title)}
                      className="inline-flex min-h-9 items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/20"
                    >
                      <Compass className="w-3.5 h-3.5 text-amber-300" />
                      <span>🕷️ 派发后台自动化抓取任务</span>
                    </button>

                    <button
                      onClick={handleSaveToLibrary}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20"
                    >
                      <Database className="w-3.5 h-3.5 text-cyan-300" />
                      <span>存入全球图书馆</span>
                    </button>

                    <a
                      href={activeTab.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>外部打开</span>
                    </a>
                  </div>
                </div>

                {/* Crawler Structured Breakdown */}
                <div className="space-y-6">
                  {/* Headings Hierarchy */}
                  {activeTab.crawlerData?.headings && activeTab.crawlerData.headings.length > 0 && (
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="flex items-center gap-2 text-xs font-semibold text-amber-200 mb-3">
                        <Layers className="w-4 h-4 text-amber-400" />
                        <span>DOM 结构化大纲与标题树 ({activeTab.crawlerData.headings.length} 个节选)</span>
                      </div>
                      <div className="space-y-1.5">
                        {activeTab.crawlerData.headings.map((h, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-slate-300">
                            <span className="font-mono text-[10px] text-amber-400/70">§{i + 1}</span>
                            <span className="truncate">{h}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Discovered Links */}
                  {activeTab.crawlerData?.links && activeTab.crawlerData.links.length > 0 && (
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="flex items-center gap-2 text-xs font-semibold text-cyan-200 mb-3">
                        <Globe className="w-4 h-4 text-cyan-400" />
                        <span>页面发现出站链接 ({activeTab.crawlerData.links.length} 条) · 点击直接爬取</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {activeTab.crawlerData.links.slice(0, 8).map((link, i) => (
                          <button
                            key={i}
                            onClick={() => handleNavigate(link)}
                            className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-2 text-left text-xs text-slate-300 hover:border-cyan-400/40 hover:bg-cyan-950/20 hover:text-cyan-200 transition truncate"
                          >
                            <Compass className="w-3 h-3 text-cyan-400 shrink-0" />
                            <span className="truncate">{link}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Discovered Media */}
                  {activeTab.crawlerData?.images && activeTab.crawlerData.images.length > 0 && (
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="flex items-center gap-2 text-xs font-semibold text-purple-200 mb-3">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        <span>捕获页面图像资源 ({activeTab.crawlerData.images.length} 张)</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {activeTab.crawlerData.images.slice(0, 4).map((img, i) => (
                          <div key={i} className="overflow-hidden rounded-xl border border-white/10 bg-slate-900 aspect-video flex items-center justify-center">
                            <img src={img} alt="Extracted" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Extracted Content Paragraphs */}
                  <div className="prose prose-invert max-w-none space-y-4 font-serif text-base leading-relaxed text-slate-200 pt-4 border-t border-white/10">
                    <div className="flex items-center gap-2 text-xs font-sans font-semibold text-slate-400 not-prose mb-3">
                      <FileText className="w-4 h-4 text-slate-400" />
                      <span>提取网页正文 ({activeTab.content ? activeTab.content.split('\n\n').length : 0} 个段落)</span>
                    </div>
                    {activeTab.content ? (
                      activeTab.content.split('\n\n').map((paragraph, idx) => (
                        <p key={idx} className="leading-8 text-slate-200">
                          {paragraph}
                        </p>
                      ))
                    ) : (
                      <p className="text-slate-500 italic">暂无正文内容或该页面仅包含动态内容。</p>
                    )}
                  </div>
                </div>
              </div>
            ) : activeTab.readerMode ? (
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
                  <h1 className="text-2xl font-semibold tracking-tight text-white leading-snug sm:text-4xl">
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
                {!browserEngine && isHttpUrl(activeTab.url) && (
                  <div data-browser-preview-notice className="border-b border-amber-300/10 bg-amber-300/[0.04] px-4 py-2 text-[11px] leading-relaxed text-amber-100/80">
                    网页预览模式：通过服务端抓取/代理展示页面内容，受目标站点策略、脚本与动态行为限制，不等同于原生 Chromium 浏览器。需要完整交互请使用桌面版或“外部打开”。
                  </div>
                )}
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
                        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                      />
                    ) : (
                      <iframe
                        src={isHttpUrl(activeTab.url) ? `/api/browser/proxy?url=${encodeURIComponent(activeTab.url)}` : toEmbedUrl(activeTab.url)}
                        title={activeTab.title}
                        className="w-full flex-1 border-0 bg-white"
                        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
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
            <div className="border-b border-white/[0.07] bg-[#121b25] p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="font-semibold text-sm text-purple-200">Ollama 双模型 AI 伴侣</span>
                </div>
                <button onClick={() => setIsAiPanelOpen(false)} className="text-slate-500 hover:text-slate-300">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Ollama Local Connection & Roles Indicator */}
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/30 p-2.5 text-[11px] text-emerald-200">
                <div className="flex items-center justify-between font-semibold">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    本地 Ollama (127.0.0.1:11434)
                  </span>
                  <button
                    onClick={() => void refreshOllamaStatus()}
                    disabled={isOllamaTesting}
                    className="text-[10px] text-emerald-300 hover:underline"
                  >
                    {isOllamaTesting ? '检测中…' : `刷新 (${ollamaStatus.latencyMs || 12}ms)`}
                  </button>
                </div>
                <div className="mt-1.5 space-y-0.5 text-[10px] text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>⚡ 实时对话模型:</span>
                    <span className="font-mono text-cyan-300">{ollamaStatus.chatModel || 'qwen3:8b'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>🕷️ 爬虫抽取大模型:</span>
                    <span className="font-mono text-amber-300">{ollamaStatus.crawlerModel || 'qwen2.5:32b'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1 p-2 bg-[#050a1b] border-b border-slate-800 text-xs">
              <button
                onClick={() => handleRunAiAnalysis('summary')}
                className={`py-1.5 px-1 rounded-lg font-medium text-center transition-all ${
                  aiAnalysisType === 'summary' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:bg-slate-800/60'
                }`}
              >
                核心总结
              </button>
              <button
                onClick={() => handleRunAiAnalysis('crawler')}
                className={`py-1.5 px-1 rounded-lg font-medium text-center transition-all ${
                  aiAnalysisType === 'crawler' ? 'bg-amber-600 text-white font-bold' : 'text-amber-300/80 hover:bg-slate-800/60'
                }`}
              >
                🕷️ 深度抽取
              </button>
              <button
                onClick={() => handleRunAiAnalysis('entities')}
                className={`py-1.5 px-1 rounded-lg font-medium text-center transition-all ${
                  aiAnalysisType === 'entities' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:bg-slate-800/60'
                }`}
              >
                知识图谱
              </button>
              <button
                onClick={() => setAiAnalysisType('qa')}
                className={`py-1.5 px-1 rounded-lg font-medium text-center transition-all ${
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
              {isAiLoading || isCrawlerExtracting ? (
                <div className="h-full flex flex-col items-center justify-center space-y-3 text-slate-400">
                  <RotateCw className="w-6 h-6 animate-spin text-amber-400" />
                  <span>正在调用本地 Ollama 双模型深度抽取与分析...</span>
                </div>
              ) : aiOutput ? (
                <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 whitespace-pre-line shadow-inner">
                  {aiOutput}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-3 p-6">
                  <Sparkles className="w-8 h-8 text-slate-600" />
                  <p>点击上方「核心总结」或「🕷️ 深度抽取」，本地 Ollama 将自动深度分析当前页面，提炼核心论据与知识实体。</p>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-slate-800 bg-[#08102b] flex items-center justify-between gap-2">
              <button
                onClick={() => handleEnqueueCrawlerTask(activeTab.url, activeTab.title)}
                className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 text-xs font-semibold transition"
              >
                <Compass className="w-3.5 h-3.5 text-amber-400" />
                <span>爬虫后台入库</span>
              </button>
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

      {/* Custom Shortcut Add Modal */}
      {showAddShortcutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d1520] p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
              <h3 className="text-base font-semibold text-white">添加快捷方式</h3>
              <button onClick={() => setShowAddShortcutModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">名称</label>
                <input
                  type="text"
                  value={newShortcutTitle}
                  onChange={e => setNewShortcutTitle(e.target.value)}
                  placeholder="例如: Google, Wikipedia..."
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">网址</label>
                <input
                  type="text"
                  value={newShortcutUrl}
                  onChange={e => setNewShortcutUrl(e.target.value)}
                  placeholder="例如: https://example.com"
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddShortcutModal(false)}
                  className="rounded-xl px-4 py-2 text-xs font-medium text-slate-400 hover:bg-white/5"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (newShortcutUrl.trim()) {
                      const title = newShortcutTitle.trim() || new URL(newShortcutUrl.startsWith('http') ? newShortcutUrl : `https://${newShortcutUrl}`).hostname;
                      const url = newShortcutUrl.startsWith('http') ? newShortcutUrl : `https://${newShortcutUrl}`;
                      const newBm: BookmarkItem = {
                        id: `bm_${Date.now()}`,
                        title,
                        url,
                        category: 'Custom'
                      };
                      setBookmarks(prev => [newBm, ...prev]);
                      setShowAddShortcutModal(false);
                      setNewShortcutTitle('');
                      setNewShortcutUrl('');
                    }
                  }}
                  className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300"
                >
                  添加
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {isPrivacyOpen && browserEngine && (
        <BrowserPrivacyPanel
          counts={{
            history: browserHistory.length,
            bookmarks: bookmarks.length,
            downloadRecords: downloads.filter(item => ['completed', 'cancelled', 'interrupted'].includes(item.state)).length,
            activeDownloads: downloads.filter(item => ['awaiting-save', 'progressing', 'cancelling'].includes(item.state)).length,
            sessionRestoreEnabled: browserSessionEnabled,
            sessionRestoreTabs: browserSessionSnapshotCount,
            permissions: browserPermissionState.grants.reduce((sum, grant) => sum + grant.permissions.length, 0),
            pendingPermissions: browserPermissionState.pending.length
          }}
          disabledReasons={{
            ...(!browserStorageReady ? { history: '正在读取本机浏览数据。', bookmarks: '正在读取本机浏览数据。' } : {}),
            ...(browserStorageReadOnly ? { history: browserStorageWarning || '本机浏览数据处于只读保护状态。', bookmarks: browserStorageWarning || '本机浏览数据处于只读保护状态。' } : {}),
            ...(browserDownloadStorageReadOnly ? { downloadRecords: downloadStorageWarning || '下载记录处于只读保护状态。' } : {}),
            ...(!browserSessionSettingsReady ? { sessionRestore: '正在读取本机标签恢复设置。' } : {}),
            ...(browserSessionReadOnly ? { sessionRestore: browserSessionWarning || '标签恢复数据处于只读保护状态。' } : {})
          }}
          onClear={handleClearBrowsingData}
          onClose={() => setIsPrivacyOpen(false)}
        />
      )}
    </div>
  );
};
