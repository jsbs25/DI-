import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  BookOpen,
  Search,
  Sparkles,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Compass,
  X,
  ExternalLink,
  Info,
  Star,
  Volume2,
  VolumeX,
  Globe,
  Library,
  Clock,
  Heart,
  BookMarked,
  Plus,
  Check,
  ArrowRight,
  Maximize2,
  Menu,
  User
} from 'lucide-react';
import { Book, Chapter, BookAnnotation, BookShelfItem, BookshelfStatus, Language } from '../../types/index.ts';
import { EpubReader } from './EpubReader.tsx';
import { AppleBookReader } from './AppleBookReader.tsx';
import { NoorIslamicPdfPortal } from './NoorIslamicPdfPortal.tsx';
import { PdfDocumentViewer } from '../browser/PdfDocumentViewer.tsx';
import { getBookEmbedUrl, getBookPdfUrl, isRtlLanguage } from './bookEmbedUrl.ts';
import { AdminLibrary } from './AdminLibrary.tsx';
import { filterLibrarySearchResults, getLibrarySearchFilterOptions, LIBRARY_RIGHTS_FILTER_LABELS } from './searchFilters.ts';
import type { LibraryAgentAction } from '../../utils/oneAgentController.ts';
import { listRecentReadingHistory, type BookProgressRecord } from '../../utils/readerPreferences.ts';
import { Trash2 } from 'lucide-react';

interface DigitalLibraryProps {
  lang: Language;
  currentUser?: { id: string } | null;
  /** When set, opens the detail view (or directly launches Apple Books Reader when focusBookAutoRead is true). */
  focusBookId?: string | null;
  focusBookSeq?: number;
  focusBookAutoRead?: boolean;
  /** Driven by One. voice AI: searches & immediately opens the matched book reader cleanly on mobile and desktop. */
  quickAction?: LibraryAgentAction | null;
}

interface OnlineLibraryResult {
  id: string;
  externalId?: string;
  title: string;
  author: string;
  language: string;
  coverImage?: string;
  description: string;
  year?: string;
  textUrl?: string;
  epubUrl?: string;
  source: string;
  sourceName?: string;
  sourceUrl?: string;
  providerFullTextUrl?: string;
  pageTitle?: string;
  rightsClassification?: string;
  rightsNote?: string;
  licenseUrl?: string;
  availability?: string;
  downloadLinks?: string[];
  identifier?: string;
  isbn?: string[];
  doi?: string;
  metadata?: Record<string, unknown>;
  canImport?: boolean;
}

interface OnlineSourceStatus {
  source: string;
  name: string;
  status: 'ok' | 'error' | 'disabled' | 'unsupported';
  count: number;
  reason?: string;
}

function safeHttpsUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function libraryAuthHeaders(): Record<string, string> {
  return {};
}

// ---------------------------------------------------------------------------
// Real category taxonomy (only real books are shown — no fabricated entries)
// ---------------------------------------------------------------------------
const CATEGORIES: { id: string; label: string; description: string }[] = [
  { id: 'literature', label: '文学与艺术', description: '世界文学经典与艺术' },
  { id: 'history', label: '历史与文明', description: '人类文明史与历史研究' },
  { id: 'philosophy', label: '哲学与思想', description: '东西方哲学思想典籍' },
  { id: 'science', label: '科学与技术', description: '自然科学与技术进步' },
  { id: 'religion', label: '宗教与文化', description: '宗教典籍与文化研究' },
  { id: 'islamic_studies', label: '阿拉伯语文献', description: '阿拉伯语与伊斯兰文明' },
  { id: 'education', label: '教育与语言', description: '教育与语言学习' },
  { id: 'computer_science', label: '计算与 AI', description: '计算机科学与人工智能' }
];

const SHELF_TABS: { id: BookshelfStatus | 'all'; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'reading', label: '正在阅读' },
  { id: 'finished', label: '已读完' },
  { id: 'want_to_read', label: '想读' },
  { id: 'favorite', label: '收藏' }
];

export const DigitalLibrary: React.FC<DigitalLibraryProps> = ({ lang, currentUser, focusBookId, focusBookSeq, focusBookAutoRead, quickAction }) => {
  // ---- View routing ----
  const [view, setView] = useState<'home' | 'category' | 'detail' | 'shelf' | 'noor' | 'vocab' | 'admin'>('home');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [noorInitialQuery, setNoorInitialQuery] = useState<string>('');
  const [recentHistory, setRecentHistory] = useState<BookProgressRecord[]>(() => listRecentReadingHistory(6));
  const [vocabItems, setVocabItems] = useState<Array<{
    id: string;
    word: string;
    lemma?: string;
    reading?: string;
    partOfSpeech?: string;
    meaning: string;
    usage?: string;
    example?: string;
    bookTitle?: string;
    savedAt?: string;
  }>>([]);
  const [vocabLoading, setVocabLoading] = useState(false);

  const refreshRecentHistory = () => setRecentHistory(listRecentReadingHistory(6));

  const loadVocabulary = async () => {
    setVocabLoading(true);
    try {
      const res = await fetch('/api/library/vocabulary');
      const data = await res.json();
      if (data?.success && Array.isArray(data.items)) setVocabItems(data.items);
    } catch {} finally {
      setVocabLoading(false);
    }
  };

  useEffect(() => {
    if (view === 'vocab') void loadVocabulary();
    if (view === 'home' || view === 'shelf') refreshRecentHistory();
  }, [view]);

  // ---- Data ----
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  // ---- Online search ----
  const [onlineResults, setOnlineResults] = useState<OnlineLibraryResult[]>([]);
  const [onlineSourceStatuses, setOnlineSourceStatuses] = useState<OnlineSourceStatus[]>([]);
  const [onlineSourceFilter, setOnlineSourceFilter] = useState('all');
  const [onlineRightsFilter, setOnlineRightsFilter] = useState('all');
  const [onlineLanguageFilter, setOnlineLanguageFilter] = useState('all');
  const [onlineYearFilter, setOnlineYearFilter] = useState('all');
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlResults, setCrawlResults] = useState<any[]>([]);
  const [crawlSources, setCrawlSources] = useState<any[]>([]);
  const [crawlReader, setCrawlReader] = useState<any | null>(null);
  const [pdfReader, setPdfReader] = useState<{ url: string; title: string; sourceUrl?: string } | null>(null);
  const [webReader, setWebReader] = useState<{ url: string; title: string; sourceUrl?: string; label: string } | null>(null);
  const [readerNotice, setReaderNotice] = useState<string | null>(null);
  const [ingestingId, setIngestingId] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const onlineFilterOptions = useMemo(() => getLibrarySearchFilterOptions(onlineResults), [onlineResults]);
  const visibleOnlineResults = useMemo(
    () => filterLibrarySearchResults(onlineResults, onlineSourceFilter, onlineRightsFilter, onlineLanguageFilter, onlineYearFilter),
    [onlineResults, onlineSourceFilter, onlineRightsFilter, onlineLanguageFilter, onlineYearFilter]
  );

  // ---- Bookshelf ----
  const [shelf, setShelf] = useState<Array<BookShelfItem & { book: Book }>>([]);
  const [shelfTab, setShelfTab] = useState<BookshelfStatus | 'all'>('all');

  // ---- Reader modal ----
  const [readingBook, setReadingBook] = useState<Book | null>(null);
  const [readingEpub, setReadingEpub] = useState<Book | null>(null);
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [fontSize, setFontSize] = useState<number>(18);
  const [lineHeight, setLineHeight] = useState<number>(1.9);
  const [readerTheme, setReaderTheme] = useState<'dark' | 'sepia' | 'light' | 'focus'>('dark');
  const [annotations, setAnnotations] = useState<BookAnnotation[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ---- Text selection & AI ----
  const [selectedText, setSelectedText] = useState('');
  const [isAiExplaining, setIsAiExplaining] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiCitation, setAiCitation] = useState<BookAnnotation['citation'] | null>(null);
  const [aiReadingNotice, setAiReadingNotice] = useState<string | null>(null);
  const [aiAnswerReady, setAiAnswerReady] = useState(false);
  const [aiNoteSaved, setAiNoteSaved] = useState(false);
  const [aiSaveMessage, setAiSaveMessage] = useState<string | null>(null);
  const [annotationNote, setAnnotationNote] = useState('');
  const [isAnnotationDrawerOpen, setIsAnnotationDrawerOpen] = useState(false);

  // ---- Text-to-speech ----
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const readerDialogRef = useRef<HTMLDivElement>(null);
  const readerReturnFocusRef = useRef<HTMLElement | null>(null);
  const savingProgressRef = useRef(false);
  const savingAnnotationRef = useRef(false);
  const mountedRef = useRef(true);

  // =========================================================================
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Data loading
  // =========================================================================
  const loadBooks = async () => {
    setIsLoading(true);
    try {
      const url = new URL('/api/library/books', window.location.origin);
      if (activeCategory !== 'all') url.searchParams.set('category', activeCategory);
      if (searchQuery.trim()) url.searchParams.set('search', searchQuery.trim());
      const res = await fetch(url.toString());
      const data = await res.json();
      if (data.success && data.books) setBooks(data.books);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBooks();
  }, [activeCategory, searchQuery]);

  // Cross-module & AI navigation: when a book id is provided, load full chapters
  // and immediately open the Apple Books Reader if focusBookAutoRead is enabled.
  useEffect(() => {
    if (!focusBookId) return;
    let cancelled = false;
    fetch(`/api/library/books/${focusBookId}`)
      .then(r => r.json())
      .then(async d => {
        if (!cancelled && d.success && d.book) {
          setSelectedBook(d.book);
          if (Array.isArray(d.annotations)) setAnnotations(d.annotations);
          setView('detail');
          if (focusBookAutoRead) {
            await openReader(d.book);
          }
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [focusBookId, focusBookSeq, focusBookAutoRead]);

  const handledLibrarySeqRef = useRef<number>(0);
  useEffect(() => {
    if (!quickAction || !quickAction.query?.trim() || quickAction.seq === handledLibrarySeqRef.current) return;
    handledLibrarySeqRef.current = quickAction.seq;
    const q = quickAction.query.trim();
    if (/^__noor_library__$|مكتبة\s*ال?نور|noor[\s-]?book|努尔图书馆|伊斯兰(?:书籍|书库|电子书|图书|PDF)/i.test(q)) {
      const cleanedNoorQ = q
        .replace(/__noor_library__|مكتبة\s*ال?نور|noor[\s-]?book|努尔图书馆|伊斯兰(?:书籍|书库|电子书|图书|PDF)/gi, '')
        .trim();
      setNoorInitialQuery(cleanedNoorQ);
      setView('noor');
      return;
    }
    let cancelled = false;

    setView('home');
    setSearchQuery(q);
    setIngestError(null);
    setReaderNotice(null);
    setIsCrawling(true);
    setCrawlResults([]);
    setCrawlSources([]);

    void (async () => {
      try {
        const [localRes, crawlRes] = await Promise.all([
          fetch(`/api/library/books?search=${encodeURIComponent(q)}`).then(r => r.json()).catch(() => null),
          fetch(`/api/library/crawl?q=${encodeURIComponent(q)}&limit=16`).then(r => r.json()).catch(() => null),
        ]);
        if (cancelled) return;

        const localList: Book[] = Array.isArray(localRes?.books) ? localRes.books : [];
        const crawledList: any[] = Array.isArray(crawlRes?.results) ? crawlRes.results : [];
        if (crawlRes?.success) {
          setCrawlResults(crawledList);
          setCrawlSources(Array.isArray(crawlRes.sources) ? crawlRes.sources : []);
        }

        if (quickAction.autoOpen !== false) {
          const qLower = q.toLowerCase();
          const localHit = localList.find(b =>
            (b.title || '').toLowerCase().includes(qLower) || qLower.includes((b.title || '').toLowerCase())
          ) || localList[0];

          if (localHit) {
            const fullLocal = (await loadFullBook(localHit.id)) || localHit;
            const hasReadableLocal = Boolean(
              fullLocal.epubUrl ||
              getBookPdfUrl(fullLocal as any) ||
              (fullLocal.chapters && fullLocal.chapters.some(ch => ch.content && ch.content.trim().length > 0)) ||
              getBookEmbedUrl(fullLocal as any)
            );
            if (hasReadableLocal) {
              setSelectedBook(fullLocal);
              await openReader(fullLocal);
              return;
            }
          }

          // Prefer genuine literary full-text editions (skip legal verdict noise)
          const legalNoiseRe = /判决书|裁定书|民事一审|民事二审|合同纠纷|有限责任公司|股份有限公司/;
          const importCandidate = crawledList.find(
            (r) =>
              r?.canImport &&
              ['wikisource', 'gutenberg', 'ar_wikisource'].includes(String(r.source || '').toLowerCase()) &&
              !legalNoiseRe.test(String(r.title || ''))
          );
          if (importCandidate) {
            try {
              setIngestingId(importCandidate.id);
              const ingestResp = await fetch('/api/library/ingest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  textUrl: importCandidate.textUrl,
                  externalId: importCandidate.id,
                  pageTitle: importCandidate.pageTitle,
                  identifier: importCandidate.identifier,
                  epubUrl: importCandidate.epubUrl,
                  source: importCandidate.source,
                  title: importCandidate.title,
                  author: importCandidate.author,
                  coverImage: importCandidate.coverImage,
                  description: importCandidate.description,
                  language: importCandidate.language,
                  sourceUrl: importCandidate.sourceUrl,
                }),
              }).then(r => r.json());
              if (!cancelled && ingestResp?.success && ingestResp.book) {
                setBooks(prev => (prev.find(b => b.id === ingestResp.book.id) ? prev : [ingestResp.book, ...prev]));
                setSelectedBook(ingestResp.book);
                setIngestingId(null);
                await openReader(ingestResp.book);
                return;
              }
            } catch {} finally {
              if (!cancelled) setIngestingId(null);
            }
          }

          // Otherwise auto-open embeddable Archive / Google Books / YouTube Audiobook / Bilibili Book Reading cleanly in-app
          const playableCandidate =
            crawledList.find(r => getBookPdfUrl(r)) ||
            crawledList.find(r => Boolean(getBookEmbedUrl(r))) ||
            crawledList[0];

          if (playableCandidate) {
            const pdf = getBookPdfUrl(playableCandidate);
            if (pdf) {
              setPdfReader({ url: pdf, title: playableCandidate.title, sourceUrl: playableCandidate.sourceUrl });
              return;
            }
            const embed = getBookEmbedUrl(playableCandidate);
            if (embed) {
              setWebReader({
                url: embed.url,
                title: playableCandidate.title,
                sourceUrl: playableCandidate.sourceUrl,
                label: embed.label,
              });
              return;
            }
            setCrawlReader(playableCandidate);
          }
        }
      } finally {
        if (!cancelled) setIsCrawling(false);
      }
    })();

    return () => { cancelled = true; };
  }, [quickAction]);

  useEffect(() => {
    let cancelled = false;
    setShelf([]);
    fetch('/api/library/shelf', { headers: libraryAuthHeaders() })
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data.success && Array.isArray(data.items)) setShelf(data.items);
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  // =========================================================================
  // Search & ingest
  // =========================================================================
  const handleCrawlBooks = async (overrideQuery?: string, preserveOnline = false) => {
    const q = (typeof overrideQuery === 'string' ? overrideQuery : searchQuery).trim();
    if (!q) return;
    if (typeof overrideQuery === 'string') setSearchQuery(overrideQuery);
    setIsCrawling(true);
    setIngestError(null);
    setCrawlResults([]);
    setCrawlSources([]);
    if (!preserveOnline) {
      setOnlineResults([]);
      setOnlineSourceStatuses([]);
    }
    try {
      const res = await fetch(`/api/library/crawl?q=${encodeURIComponent(q)}&limit=16`);
      const data = await res.json();
      if (data.success) {
        setCrawlResults(Array.isArray(data.results) ? data.results : []);
        setCrawlSources(Array.isArray(data.sources) ? data.sources : []);
        if (!data.results?.length && !preserveOnline) setIngestError('未从开放图书来源检索到结果，请尝试其他关键词。');
      } else {
        if (!preserveOnline) setIngestError(data.error || '开放图书爬取/检索失败，请稍后重试。');
      }
    } catch (err: any) {
      if (!preserveOnline) setIngestError(`爬取异常: ${err.message}`);
    } finally {
      setIsCrawling(false);
    }
  };

  const handleIngestCrawledBook = async (r: any) => {
    if (!r?.canImport || ingestingId) return;
    setIngestingId(r.id);
    setIngestError(null);
    try {
      const res = await fetch('/api/library/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textUrl: r.textUrl,
          externalId: r.id,
          pageTitle: r.pageTitle,
          identifier: r.identifier,
          epubUrl: r.epubUrl,
          source: r.source,
          title: r.title,
          author: r.author,
          coverImage: r.coverImage,
          description: r.description,
          language: r.language,
          sourceUrl: r.sourceUrl
        })
      });
      const data = await res.json();
      if (data.success && data.book) {
        setBooks(prev => (prev.find((b: Book) => b.id === data.book.id) ? prev : [data.book, ...prev]));
        setIngestingId(null);
        setSelectedBook(data.book);
        await openReader(data.book);
      } else if (data.fallbackEmbedUrl) {
        setIngestingId(null);
        setWebReader({
          url: data.fallbackEmbedUrl,
          title: r.title,
          sourceUrl: r.sourceUrl,
          label: 'Internet Archive 在线阅览'
        });
      } else {
        setIngestError(data.error || '保存失败，请稍后重试。');
        setIngestingId(null);
      }
    } catch (err: any) {
      setIngestError(`保存异常: ${err.message}`);
      setIngestingId(null);
    }
  };

  const handleOnlineSearch = async (overrideQuery?: string, preserveCrawl = false) => {
    const q = (typeof overrideQuery === 'string' ? overrideQuery : searchQuery).trim();
    if (!q) return;
    if (typeof overrideQuery === 'string') {
      setSearchQuery(overrideQuery);
    }
    setIsSearchingOnline(true);
    setIngestError(null);
    setOnlineSourceFilter('all');
    setOnlineRightsFilter('all');
    setOnlineLanguageFilter('all');
    setOnlineYearFilter('all');
    setOnlineResults([]);
    setOnlineSourceStatuses([]);
    if (!preserveCrawl) {
      setCrawlResults([]);
      setCrawlSources([]);
    }

    try {
      const res = await fetch(`/api/library/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success && data.results) {
        setOnlineResults(data.results);
        setOnlineSourceStatuses(Array.isArray(data.sources) ? data.sources : []);
        if (data.results.length === 0 && !preserveCrawl) {
          setIngestError('未找到匹配的全球馆藏，请尝试其他书名、作者、ISBN 或 DOI。');
        }
      } else {
        if (!preserveCrawl) setIngestError(data.error || '在线搜索失败，请稍后重试。');
      }
    } catch (err: any) {
      if (!preserveCrawl) setIngestError(`搜索异常: ${err.message}`);
    } finally {
      setIsSearchingOnline(false);
    }
  };

  const handleUnifiedSearch = async (overrideQuery?: string) => {
    const q = (typeof overrideQuery === 'string' ? overrideQuery : searchQuery).trim();
    if (!q) return;
    if (typeof overrideQuery === 'string') setSearchQuery(overrideQuery);
    void handleCrawlBooks(q, true);
    void handleOnlineSearch(q, true);
  };

  const handleIngestBook = async (r: OnlineLibraryResult) => {
    if (r.canImport !== true || (!r.textUrl && !r.pageTitle && !r.identifier && !r.epubUrl) || ingestingId) return;
    setIngestingId(r.id);
    setIngestError(null);
    try {
      const res = await fetch('/api/library/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textUrl: r.textUrl,
          externalId: r.externalId,
          pageTitle: r.pageTitle,
          identifier: r.identifier,
          epubUrl: r.epubUrl,
          source: r.source,
          title: r.title,
          author: r.author,
          coverImage: r.coverImage,
          description: r.description,
          language: r.language,
          sourceUrl: r.sourceUrl,
          rightsClassification: r.rightsClassification
        })
      });
      const data = await res.json();
      if (data.success && data.book) {
        setBooks(prev => (prev.find(b => b.id === data.book.id) ? prev : [data.book, ...prev]));
        setIngestingId(null);
        setSelectedBook(data.book);
        await openReader(data.book);
      } else if (data.fallbackEmbedUrl) {
        setIngestingId(null);
        setWebReader({
          url: data.fallbackEmbedUrl,
          title: r.title,
          sourceUrl: r.sourceUrl,
          label: 'Internet Archive 在线阅览'
        });
      } else {
        setIngestError(data.error || '保存失败，请稍后重试。');
        setIngestingId(null);
      }
    } catch (err: any) {
      setIngestError(`保存异常: ${err.message}`);
      setIngestingId(null);
    }
  };

  // =========================================================================
  // Reader
  // =========================================================================
  const getOnlineReaderReason = (ref: any): string => {
    if (!ref) return '未提供可用的阅读资源。';
    if (ref.canReadOnline === false) return ref.rightsNote || ref.availability === 'official-source-only' ? `该资源按来源标注仅提供官方页面访问：${ref.rightsNote || '请在来源站点阅读'}。` : (ref.rightsNote || '来源未提供可直接在线阅读的公开副本。');
    const embed = getBookEmbedUrl(ref);
    if (embed) return '';
    const pdf = getBookPdfUrl(ref);
    if (pdf) return '';
    if (ref.sourceUrl || ref.externalReadUrl) return '该来源暂不支持站内嵌入或内置阅读器打开（可能受跨域/嵌入策略、登录或版权限制），请通过“官方来源/前往来源平台”在原站阅读。';
    return '未找到可在线阅读的公开链接；如有版权或访问限制，请通过合法来源获取。';
  };

  const openExternalReadable = (ref: any) => {
    setReaderNotice(null);
    const pdf = getBookPdfUrl(ref);
    if (pdf) { setPdfReader({ url: pdf, title: ref.title || 'PDF', sourceUrl: ref.sourceUrl || ref.externalReadUrl || pdf }); return; }
    const embed = getBookEmbedUrl(ref);
    if (embed) { setWebReader({ url: embed.url, title: ref.title || '在线阅读', sourceUrl: ref.sourceUrl || ref.externalReadUrl, label: embed.label }); return; }
    const reason = getOnlineReaderReason(ref);
    setReaderNotice(reason);
    if (ref.sourceUrl || ref.externalReadUrl) window.open(ref.sourceUrl || ref.externalReadUrl, '_blank', 'noopener,noreferrer');
  };

  const ensureShelfForReading = async (book: Book): Promise<(BookShelfItem & { book: Book }) | null> => {
    const existing = shelf.find(i => i.bookId === book.id);
    if (existing) return existing;
    try {
      const res = await fetch('/api/library/shelf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...libraryAuthHeaders() },
        body: JSON.stringify({ bookId: book.id, status: 'reading' })
      });
      const data = await res.json();
      if (data.success && data.item) {
        const entry = { ...data.item, book } as BookShelfItem & { book: Book };
        setShelf(prev => prev.some(i => i.bookId === book.id) ? prev.map(i => i.bookId === book.id ? entry : i) : [...prev, entry]);
        return entry;
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  };

  const openReader = async (book: Book) => {
    // EPUB books use the epub.js reader; text books use the chapter reader
    if (book.epubUrl) {
      setReadingEpub(book);
      await ensureShelfForReading(book);
      return;
    }
    const pdf = getBookPdfUrl(book as any) || (book.formatType === 'pdf' ? (book as any).textUrl || book.externalReadUrl : null);
    if (pdf) {
      setPdfReader({ url: pdf, title: book.title, sourceUrl: book.sourceUrl || book.externalReadUrl || pdf });
      await ensureShelfForReading(book);
      return;
    }
    if (book.chapters && book.chapters.length > 0 && book.chapters.some(ch => ch.content && ch.content.trim().length > 0)) {
      readerReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      let shelfItem = shelf.find(item => item.bookId === book.id);
      if (!shelfItem) shelfItem = await ensureShelfForReading(book) || undefined;
      const savedChapterIndex = shelfItem?.lastReadChapterId
        ? book.chapters.findIndex(chapter => chapter.id === shelfItem.lastReadChapterId)
        : -1;
      const legacyProgressIndex = shelfItem?.progress
        ? Math.min(book.chapters.length - 1, Math.max(0, Math.round((shelfItem.progress / 100) * book.chapters.length) - 1))
        : 0;
      setReadingBook(book);
      setActiveChapterIndex(savedChapterIndex >= 0 ? savedChapterIndex : legacyProgressIndex);
      setAiExplanation(null);
      setAiCitation(null);
      setAiReadingNotice(null);
      setAiAnswerReady(false);
      setAiNoteSaved(false);
      setAiSaveMessage(null);
      setSelectedText('');
      setAnnotationNote('');
      return;
    }
    const embed = getBookEmbedUrl(book as any);
    if (embed) { setWebReader({ url: embed.url, title: book.title, sourceUrl: book.sourceUrl || book.externalReadUrl, label: embed.label }); await ensureShelfForReading(book); return; }
    setReaderNotice('该书籍当前没有可在站内阅读的全文（可能仅有元数据/受版权限制/需在来源站点借阅或登录）。请使用“资源来源/官方来源”在合法来源查看。');
  };

  // List/shelf endpoints return metadata only, so fetch the full book
  // (with chapter bodies) before showing the detail view or opening the reader.
  const loadFullBook = async (bookId: string): Promise<Book | null> => {
    try {
      const res = await fetch(`/api/library/books/${bookId}`);
      const data = await res.json();
      if (!data.success || !data.book) return null;
      setAnnotations(Array.isArray(data.annotations) ? data.annotations : []);
      return data.book as Book;
    } catch {
      return null;
    }
  };

  const openBookDetail = async (book: Book) => {
    setSelectedBook(book);
    setView('detail');
    const full = await loadFullBook(book.id);
    if (full) setSelectedBook(full);
  };

  const openShelfBook = async (book: Book) => {
    const full = await loadFullBook(book.id);
    await openReader(full || book);
  };

  const closeReader = () => {
    stopSpeaking();
    setReadingBook(null);
    setIsAnnotationDrawerOpen(false);
  };

  useEffect(() => {
    if (!readingBook) return;
    const returnFocus = readerReturnFocusRef.current;
    readerDialogRef.current?.focus();
    return () => {
      window.requestAnimationFrame(() => {
        if (returnFocus?.isConnected) returnFocus.focus();
      });
    };
  }, [readingBook?.id]);

  const handleReaderDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeReader();
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = readerDialogRef.current;
    if (!dialog) return;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled])'));
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const stopSpeaking = () => {
    const synth = window.speechSynthesis;
    if (synth) synth.cancel();
    setIsSpeaking(false);
  };

  const speechLocaleFor = (code?: string): string => {
    const map: Record<string, string> = {
      en: 'en-US', zh: 'zh-CN', ar: 'ar-SA', es: 'es-ES', fr: 'fr-FR',
      ru: 'ru-RU', de: 'de-DE', it: 'it-IT', pt: 'pt-PT', ja: 'ja-JP'
    };
    return map[code || 'en'] || 'en-US';
  };

  const handleReadAloud = () => {
    const chapter = readingBook?.chapters[activeChapterIndex];
    if (!chapter) return;
    const synth = window.speechSynthesis;
    if (!synth) { alert('当前浏览器不支持语音诵读功能。'); return; }
    if (isSpeaking) { stopSpeaking(); return; }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(chapter.content);
    utterance.lang = speechLocaleFor(readingBook?.language);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    utteranceRef.current = utterance;
    synth.speak(utterance);
    setIsSpeaking(true);
  };

  const handleReadSelection = () => {
    if (!selectedText) return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(selectedText);
    utterance.lang = speechLocaleFor(readingBook?.language);
    utterance.rate = 0.95;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    synth.speak(utterance);
    setIsSpeaking(true);
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 3) {
      setSelectedText(selection.toString().trim());
      setAiExplanation(null);
      setAiCitation(null);
      setAiReadingNotice(null);
      setAiAnswerReady(false);
      setAiNoteSaved(false);
      setAiSaveMessage(null);
    }
  };

  const handleExplainSelection = async () => {
    if (!selectedText || !readingBook) return;
    const chapter = readingBook.chapters[activeChapterIndex];
    if (!chapter) return;
    setIsAiExplaining(true);
    setAiExplanation(null);
    setAiCitation(null);
    setAiReadingNotice(null);
    setAiAnswerReady(false);
    setAiNoteSaved(false);
    setAiSaveMessage(null);
    try {
      const res = await fetch(`/api/library/books/${encodeURIComponent(readingBook.id)}/ai-reading`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId: chapter.id, selectedText, replyLanguage: lang })
      });
      const data = await res.json();
      setAiCitation(data.citation || null);
      setAiReadingNotice(data.notice || null);
      if (data.success && data.message) {
        setAiExplanation(data.message.content);
        setAiAnswerReady(true);
      } else {
        setAiExplanation(data.error || '无法核验当前正文，未生成 AI 解读。');
      }
    } catch (err: any) {
      setAiExplanation(`请求出错: ${err.message}`);
    } finally {
      setIsAiExplaining(false);
    }
  };

  const handleSaveAnnotation = async () => {
    if (!readingBook || !selectedText || savingAnnotationRef.current) return;
    savingAnnotationRef.current = true;
    const currentChapter = readingBook.chapters[activeChapterIndex];
    const saveAiKnowledgeNote = !!(aiCitation && aiExplanation && aiAnswerReady && !aiNoteSaved);
      if (saveAiKnowledgeNote && !currentUser) {
        setAiSaveMessage('登录后才能将带来源的 AI 解读保存为仅自己可见的知识笔记；当前解读尚未保存。');
        return;
      }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      let res: Response;
      try {
        res = await fetch(saveAiKnowledgeNote
          ? `/api/library/books/${readingBook.id}/knowledge-notes`
          : `/api/library/books/${readingBook.id}/annotations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(saveAiKnowledgeNote ? libraryAuthHeaders() : {}) },
          body: JSON.stringify({
            chapterId: currentChapter?.id || 'ch1',
            selectedText,
            note: annotationNote,
            aiExplanation: aiExplanation || undefined
          }),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }
      const data = await res.json();
      if (data.success && data.annotation) {
        setAnnotations(prev => [data.annotation, ...prev]);
        setAnnotationNote('');
        if (!saveAiKnowledgeNote) {
          setSelectedText('');
          setAiExplanation(null);
          setAiCitation(null);
          setAiReadingNotice(null);
          setAiAnswerReady(false);
          setAiNoteSaved(false);
        }
        if (saveAiKnowledgeNote) setAiNoteSaved(true);
        setAiSaveMessage(saveAiKnowledgeNote ? '已保存为仅自己可见、带来源引用的知识笔记。' : null);
      } else {
        setAiSaveMessage(data.error || '保存笔记失败。');
      }
    } catch (e) {
      setAiSaveMessage(`保存笔记失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      savingAnnotationRef.current = false;
    }
  };

  // =========================================================================
  // Bookshelf actions
  // =========================================================================
  const addToShelf = async (book: Book, status: BookshelfStatus = 'want_to_read') => {
    try {
      const res = await fetch('/api/library/shelf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...libraryAuthHeaders() },
        body: JSON.stringify({ bookId: book.id, status })
      });
      const data = await res.json();
      if (data.success) {
        setShelf(prev => {
          const exists = prev.find(i => i.bookId === book.id);
          const entry = { ...data.item, book };
          return exists ? prev.map(i => (i.bookId === book.id ? entry : i)) : [...prev, entry];
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const removeFromShelf = async (bookId: string) => {
    try {
      await fetch(`/api/library/shelf/${encodeURIComponent(bookId)}`, {
        method: 'DELETE',
        headers: libraryAuthHeaders()
      });
      setShelf(prev => prev.filter(i => i.bookId !== bookId));
    } catch (e) {
      console.error(e);
    }
  };

  const saveShelfReadingState = async (book: Book, chapterIndex: number, requestedProgress?: number) => {
    const chapter = book.chapters[chapterIndex];
    if (!chapter) return;
    if (!shelf.some(item => item.bookId === book.id)) {
      await ensureShelfForReading(book);
    }
    const progress = requestedProgress ?? Math.min(99, Math.round(((chapterIndex + 1) / book.chapters.length) * 100));
    try {
      const res = await fetch(`/api/library/shelf/${encodeURIComponent(book.id)}/reading-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...libraryAuthHeaders() },
        body: JSON.stringify({ chapterId: chapter.id, progress })
      });
      const data = await res.json();
      if (data.success && data.item) {
        setShelf(prev => {
          const bookRef = prev.find(item => item.bookId === book.id)?.book || book;
          const entry = { ...data.item, book: bookRef };
          return prev.some(item => item.bookId === book.id) ? prev.map(item => item.bookId === book.id ? entry : item) : [...prev, entry];
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const saveEpubProgress = async (bookId: string, progress: number, cfi: string, ownerId?: string) => {
    if (!ownerId || currentUser?.id !== ownerId) return;
    if (!shelf.some(item => item.bookId === bookId && item.userId === ownerId)) {
      const book = readingEpub?.id === bookId ? readingEpub : selectedBook?.id === bookId ? selectedBook : books.find(b => b.id === bookId);
      if (book) await ensureShelfForReading(book);
    }
    try {
      const res = await fetch(`/api/library/shelf/${encodeURIComponent(bookId)}/epub-reading-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...libraryAuthHeaders() },
        body: JSON.stringify({ progress, cfi, ownerId })
      });
      const data = await res.json();
      if (data.success && data.item) {
        setShelf(prev => {
          const bookRef = prev.find(item => item.bookId === bookId)?.book || readingEpub || selectedBook || books.find(b => b.id === bookId);
          if (!bookRef) return prev;
          const entry = { ...data.item, book: bookRef };
          return prev.some(item => item.bookId === bookId) ? prev.map(item => item.bookId === bookId ? entry : item) : [...prev, entry];
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!readingBook || !shelf.some(item => item.bookId === readingBook.id)) return;
    void saveShelfReadingState(readingBook, activeChapterIndex);
  }, [readingBook, activeChapterIndex, shelf.some(item => item.bookId === readingBook?.id)]);

  const saveProgress = async (progress: number) => {
    if (!readingBook || savingProgressRef.current) return;
    savingProgressRef.current = true;
    const chapter = readingBook.chapters[activeChapterIndex];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      if (chapter) {
        await saveShelfReadingState(readingBook, activeChapterIndex, progress);
      }
      await fetch(`/api/library/books/${readingBook.id}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress }),
        signal: controller.signal
      });
    } catch (e) {
      console.error(e);
    } finally {
      clearTimeout(timeout);
      savingProgressRef.current = false;
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  // =========================================================================
  // Derived data
  // =========================================================================
  const activeChapter: Chapter | undefined = readingBook?.chapters[activeChapterIndex];

  const featuredBook = useMemo(() => {
    return books.find(b => b.coverImage) || books[0];
  }, [books]);

  const booksByCategory = (category: string) => books.filter(b => b.category === category);

  const shelfBooks = useMemo(() => {
    if (shelfTab === 'all') return shelf;
    return shelf.filter(i => i.status === shelfTab);
  }, [shelf, shelfTab]);

  const isOnShelf = (bookId: string) => shelf.some(i => i.bookId === bookId);

  // =========================================================================
  // Render helpers
  // =========================================================================
  const readerBg = readerTheme === 'sepia'
    ? 'bg-[#181512] text-[#e0d6c4]'
    : readerTheme === 'light'
    ? 'bg-[#f5f1e8] text-[#2a2620]'
    : 'bg-[#030713] text-slate-200';

  const readerLineHeight = { lineHeight: lineHeight };

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-1 flex-col bg-[var(--color-one-bg)] text-[var(--color-one-text)]">
      {/* ONE LIBRARY unified header */}
      <header className="sticky top-[52px] z-30 border-b border-[var(--color-one-border)] bg-[var(--color-one-surface)]/88 backdrop-blur-xl md:top-16">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-one-border-strong)] bg-[var(--color-one-surface-soft)] text-[var(--color-one-accent)]">
              <Library className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-one-text-dim)]">ONE LIBRARY</p>
              <h1 className="text-base font-semibold leading-tight tracking-tight text-[var(--color-one-text)]">世界图书馆</h1>
            </div>
          </div>

          <nav className="flex items-center gap-1 overflow-x-auto rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)] p-1 text-xs font-medium" aria-label="世界图书馆导航">
            {[
              { id: 'home', label: '馆藏首页' },
              { id: 'noor', label: 'مكتبة النور 全球书库' },
              { id: 'shelf', label: `我的书架${shelf.length > 0 ? ` (${shelf.length})` : ''}` },
              { id: 'vocab', label: '生词本' },
              { id: 'admin', label: '管理' },
            ].map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setView(n.id as any)}
                aria-current={view === n.id ? 'page' : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 transition-colors cursor-pointer ${
                  view === n.id
                    ? 'bg-[var(--color-one-surface)] font-semibold text-[var(--color-one-text)] shadow-xs'
                    : 'text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)]'
                }`}
              >
                {n.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {readerNotice && (
        <div role="status" className="mx-auto mt-3 w-full max-w-6xl px-4 sm:px-8">
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-[var(--color-one-text)]">
            <p className="leading-relaxed"><span className="font-semibold text-amber-700 dark:text-amber-300">阅读提示：</span>{readerNotice}</p>
            <button type="button" onClick={() => setReaderNotice(null)} className="shrink-0 rounded-lg p-1 text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)]"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* HOME VIEW                                                            */}
      {/* ===================================================================== */}
      {view === 'home' && (
        <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-7 sm:px-8 sm:py-9">
          {/* Serene Apple-style Library Hero */}
          <section className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:gap-12">
            <div>
              <p className="text-[11px] font-medium tracking-[0.18em] uppercase text-[var(--color-one-accent)]">
                WORLD DIGITAL LIBRARY
              </p>
              <h2 className="mt-2 max-w-2xl font-serif text-3xl font-semibold leading-[1.14] tracking-tight text-[var(--color-one-text)] sm:text-4xl">
                一个世界，无数典籍。
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--color-one-text-muted)]">
                直连全球公开图书库（IslamHouse · Project Gutenberg · Open Library · Internet Archive）。下载 PDF 自动重排为电子书，内置字号排版自定义与统一 ONE AI 精讲查词。
              </p>

              {/* Unified Search Box */}
              <div className="mt-6 rounded-2xl border border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)] p-3 shadow-xs sm:p-3.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-one-text-dim)]" />
                  <label htmlFor="world-library-search" className="sr-only">搜索全球馆藏</label>
                  <input
                    id="world-library-search"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleUnifiedSearch()}
                    placeholder="输入书名、作者、主题、ISBN 或 DOI…"
                    aria-describedby="world-library-search-help"
                    className="w-full rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-bg)] py-3 pl-10 pr-4 text-sm text-[var(--color-one-text)] placeholder:text-[var(--color-one-text-dim)] focus:border-[var(--color-one-accent)] focus:outline-none sm:pr-[12.5rem]"
                  />
                  <div className="mt-2 flex items-center gap-2 sm:absolute sm:right-1.5 sm:top-1/2 sm:mt-0 sm:-translate-y-1/2">
                    <button
                      type="button"
                      onClick={() => handleCrawlBooks()}
                      disabled={isCrawling || !searchQuery.trim()}
                      title="多源并行检索开放图书"
                      className="inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-one-text-muted)] transition hover:text-[var(--color-one-text)] disabled:opacity-40 sm:flex-none"
                    >
                      <Compass className="h-3.5 w-3.5" />
                      <span>{isCrawling ? '检索中…' : '开放源'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUnifiedSearch()}
                      disabled={(isSearchingOnline && isCrawling) || !searchQuery.trim()}
                      className="inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg bg-[var(--color-one-accent)] px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40 sm:flex-none"
                    >
                      <Search className="h-3.5 w-3.5" />
                      <span>{isSearchingOnline || isCrawling ? '检索中…' : '搜索'}</span>
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                  <span className="text-[11px] text-[var(--color-one-text-dim)]">推荐</span>
                  {[
                    { label: '道德经', q: '道德经' },
                    { label: '论语', q: '论语' },
                    { label: '史记', q: '史记' },
                    { label: 'The Time Machine', q: 'The Time Machine' },
                    { label: 'Principia', q: 'Philosophiae Naturalis Principia' },
                  ].map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => handleUnifiedSearch(chip.q)}
                      className="cursor-pointer text-xs text-[var(--color-one-text-muted)] underline-offset-4 transition hover:text-[var(--color-one-accent)] hover:underline"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                <p id="world-library-search-help" className="sr-only">直连全球公开图书馆</p>
              </div>

              {/* Clean Global Catalog Entry */}
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setNoorInitialQuery(searchQuery.trim());
                    setView('noor');
                  }}
                  className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-[var(--color-one-accent)] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>مكتبة النور · 全球原版 PDF 书库</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <a
                  href={`https://openlibrary.org/search?q=${encodeURIComponent(searchQuery.trim())}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] px-3.5 py-2 text-xs font-medium text-[var(--color-one-text-muted)] transition hover:border-[var(--color-one-border-strong)] hover:text-[var(--color-one-text)]"
                >
                  <span>Open Library</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
                <a
                  href="https://www.noor-book.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] px-3.5 py-2 text-xs font-medium text-[var(--color-one-text-muted)] transition hover:border-[var(--color-one-border-strong)] hover:text-[var(--color-one-text)]"
                >
                  <span>Noor Book</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
                <a
                  href="https://waqfeya.net/books"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] px-3.5 py-2 text-xs font-medium text-[var(--color-one-text-muted)] transition hover:border-[var(--color-one-border-strong)] hover:text-[var(--color-one-text)]"
                >
                  <span>Waqfeya</span>
                </a>
              </div>
            </div>

            {/* Featured real book */}
            {featuredBook && (
              <button
                type="button"
                onClick={() => openBookDetail(featuredBook)}
                aria-label={`查看《${featuredBook.title}》详情`}
                className="group flex cursor-pointer justify-center rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-one-accent)] lg:justify-end"
              >
                <div className="relative w-full max-w-xs rounded-[24px] border border-[var(--color-one-border)] bg-[var(--color-one-surface)] p-5 shadow-xs transition hover:border-[var(--color-one-border-strong)]">
                  <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-one-text-dim)]">馆藏精选</p>
                  <div className="mx-auto aspect-[2/3] w-40 overflow-hidden rounded-xl border border-[var(--color-one-border)] shadow-sm transition duration-300 group-hover:scale-[1.02] sm:w-44">
                    <img
                      src={featuredBook.coverImage || '/assets/library/cover-little-prince.jpg'}
                      alt={featuredBook.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold leading-snug text-[var(--color-one-text)] transition-colors group-hover:text-[var(--color-one-accent)]">
                      {featuredBook.title}
                    </h3>
                    <p className="mt-0.5 text-xs text-[var(--color-one-text-muted)]">{featuredBook.author}</p>
                    {featuredBook.description && (
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--color-one-text-dim)]">{featuredBook.description}</p>
                    )}
                  </div>
                </div>
              </button>
            )}
          </section>

          {/* Continue Reading (Recent Reading History from readerPreferences) */}
          {recentHistory.length > 0 && (
            <section>
              <div className="mb-3.5 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-one-text)]">
                  <Clock className="h-4 w-4 text-[var(--color-one-accent)]" />
                  <span>继续阅读</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setView('shelf')}
                  className="cursor-pointer text-xs font-medium text-[var(--color-one-accent)] hover:underline"
                >
                  我的书架
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recentHistory.map((rec) => (
                  <button
                    key={rec.bookKey}
                    type="button"
                    onClick={() => {
                      if (rec.sourceUrl) {
                        setPdfReader({ url: rec.sourceUrl, title: rec.title });
                      } else {
                        const match = books.find((b) => b.id === rec.bookKey || b.title === rec.title);
                        if (match) void openShelfBook(match);
                      }
                    }}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] px-4 py-3 text-left transition hover:border-[var(--color-one-border-strong)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[var(--color-one-text)]">{rec.title}</div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--color-one-text-muted)]">
                        <span>第 {rec.pageNumber}/{rec.totalPages} 页</span>
                        <span>·</span>
                        <span className="font-mono">{rec.progressPct}%</span>
                      </div>
                      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--color-one-border)]">
                        <div className="h-full rounded-full bg-[var(--color-one-accent)]" style={{ width: `${rec.progressPct}%` }} />
                      </div>
                    </div>
                    <BookOpen className="h-4 w-4 shrink-0 text-[var(--color-one-accent)]" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Multi-engine open book search results (books only) */}
          {(crawlResults.length > 0 || isCrawling) && (
            <section aria-labelledby="library-crawl-results-title" aria-busy={isCrawling} className="rounded-[24px] border border-[var(--color-one-border)] bg-[var(--color-one-surface)] p-5 shadow-xs">
              <h3 id="library-crawl-results-title" className="mb-1 text-sm font-semibold text-[var(--color-one-text)]">全球开放书籍检索结果</h3>
              <p className="mb-3 text-xs text-[var(--color-one-text-muted)]">汇聚 Gutenberg、Open Library、Internet Archive、Wikisource、Google Books 公开图书资源。</p>
              {isCrawling ? (
                <div role="status" className="py-6 text-center text-xs text-[var(--color-one-text-muted)]">正在检索全球开放图书…</div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {crawlResults
                    .filter((r: any) => !['youtube', 'bilibili'].includes(String(r.source || '').toLowerCase()))
                    .map((r: any) => {
                      const embedInfo = getBookEmbedUrl(r);
                      return (
                        <div key={r.id} className="flex items-start gap-3 rounded-2xl border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)] p-3.5 transition hover:border-[var(--color-one-border-strong)]">
                          {r.coverImage && <img src={r.coverImage} alt={r.title} className="h-16 w-12 shrink-0 rounded-lg object-cover" />}
                          <div className="min-w-0 flex-1">
                            <h4 className="line-clamp-1 text-xs font-semibold text-[var(--color-one-text)]">{r.title}</h4>
                            <p className="mb-1 text-[11px] text-[var(--color-one-accent)]">{r.author} · {(r.language || '').toUpperCase()} · {r.source}{r.year ? ` · ${r.year}` : ''}</p>
                            <p className="mb-2.5 line-clamp-2 text-[11px] text-[var(--color-one-text-muted)]">{r.description}</p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {r.canImport && (
                                <button type="button" onClick={() => handleIngestCrawledBook(r)} disabled={ingestingId === r.id} className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg bg-[var(--color-one-accent)] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
                                  {ingestingId === r.id ? <span>保存中…</span> : <><BookOpen className="h-3 w-3" /><span>加入并阅读</span></>}
                                </button>
                              )}
                              {(r.canReadOnline || embedInfo || getBookPdfUrl(r) || r.sourceUrl) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const pdf = getBookPdfUrl(r);
                                    if (pdf) { setPdfReader({ url: pdf, title: r.title, sourceUrl: r.sourceUrl }); return; }
                                    if (embedInfo) { setWebReader({ url: embedInfo.url, title: r.title, sourceUrl: r.sourceUrl, label: embedInfo.label }); return; }
                                    if (r.canImport) { void handleIngestCrawledBook(r); return; }
                                    setReaderNotice(getOnlineReaderReason(r));
                                    if (r.sourceUrl) window.open(r.sourceUrl, '_blank', 'noopener,noreferrer');
                                  }}
                                  className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg border border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-one-text)] transition hover:border-[var(--color-one-accent)]"
                                >
                                  <BookOpen className="h-3 w-3" /><span>阅读</span>
                                </button>
                              )}
                              {r.sourceUrl && (
                                <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[var(--color-one-border)] px-2.5 py-1.5 text-[11px] text-[var(--color-one-text-muted)] transition hover:text-[var(--color-one-text)]">
                                  <ExternalLink className="h-3 w-3" /><span>来源</span>
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </section>
          )}

          {/* Online search results */}
          {(onlineResults.length > 0 || isSearchingOnline || ingestError) && (
            <section aria-labelledby="library-online-results-title" aria-busy={isSearchingOnline} className="rounded-[24px] border border-[var(--color-one-border)] bg-[var(--color-one-surface)] p-5 shadow-xs">
              <h3 id="library-online-results-title" className="mb-3 text-sm font-semibold text-[var(--color-one-text)]">全球馆藏索引</h3>
              {ingestError && <div role="status" aria-live="polite" className="mb-3 text-xs text-rose-600 dark:text-rose-400">{ingestError}</div>}
              {!isSearchingOnline && onlineResults.length > 0 && (
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="block text-[11px] text-[var(--color-one-text-muted)]">
                    <span className="mb-1 block">来源</span>
                    <select aria-label="按来源筛选" value={onlineSourceFilter} onChange={(e) => setOnlineSourceFilter(e.target.value)} className="min-h-10 w-full rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-bg)] px-3 py-2 text-xs text-[var(--color-one-text)]">
                      <option value="all">全部来源（{onlineResults.length}）</option>
                      {onlineFilterOptions.sources.map((option) => (<option key={option.source} value={option.source}>{option.name}（{option.count}）</option>))}
                    </select>
                  </label>
                  <label className="block text-[11px] text-[var(--color-one-text-muted)]">
                    <span className="mb-1 block">语言</span>
                    <select aria-label="按语言筛选" value={onlineLanguageFilter} onChange={(e) => setOnlineLanguageFilter(e.target.value)} className="min-h-10 w-full rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-bg)] px-3 py-2 text-xs text-[var(--color-one-text)]">
                      <option value="all">全部语言（{onlineResults.length}）</option>
                      {onlineFilterOptions.languages.map((option) => (<option key={option.value} value={option.value}>{option.label}（{option.count}）</option>))}
                    </select>
                  </label>
                  <label className="block text-[11px] text-[var(--color-one-text-muted)]">
                    <span className="mb-1 block">年份</span>
                    <select aria-label="按年份筛选" value={onlineYearFilter} onChange={(e) => setOnlineYearFilter(e.target.value)} className="min-h-10 w-full rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-bg)] px-3 py-2 text-xs text-[var(--color-one-text)]">
                      <option value="all">全部年份（{onlineResults.length}）</option>
                      {onlineFilterOptions.years.map((option) => (<option key={option.value} value={option.value}>{option.label}（{option.count}）</option>))}
                    </select>
                  </label>
                  <label className="block text-[11px] text-[var(--color-one-text-muted)]">
                    <span className="mb-1 block">权利状态</span>
                    <select aria-label="按权利状态筛选" value={onlineRightsFilter} onChange={(e) => setOnlineRightsFilter(e.target.value)} className="min-h-10 w-full rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-bg)] px-3 py-2 text-xs text-[var(--color-one-text)]">
                      <option value="all">全部权利状态</option>
                      {onlineFilterOptions.rights.map((option) => (<option key={option.value} value={option.value}>{LIBRARY_RIGHTS_FILTER_LABELS[option.value]}（{option.count}）</option>))}
                    </select>
                  </label>
                </div>
              )}
              {isSearchingOnline ? (
                <div role="status" aria-live="polite" className="py-6 text-center text-xs text-[var(--color-one-text-muted)]">正在查询全球馆藏…</div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleOnlineResults
                    .filter((r) => !['youtube', 'bilibili'].includes(String(r.source || '').toLowerCase()))
                    .map((r) => {
                      const canImport = r.canImport === true;
                      const sourceName = r.sourceName || r.source;
                      return (
                        <div key={r.id} className="flex items-start gap-3 rounded-2xl border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)] p-3.5 transition hover:border-[var(--color-one-border-strong)]">
                          {r.coverImage && <img src={r.coverImage} alt={r.title} className="h-16 w-12 shrink-0 rounded-lg object-cover" />}
                          <div className="min-w-0 flex-1">
                            <h4 className="line-clamp-1 text-xs font-semibold text-[var(--color-one-text)]">{r.title}</h4>
                            <p className="mb-1 text-[11px] text-[var(--color-one-accent)]">{r.author} · {r.language?.toUpperCase()} · {sourceName}{r.year ? ` · ${r.year}` : ''}</p>
                            <p className="mb-2.5 line-clamp-2 text-[11px] text-[var(--color-one-text-muted)]">{r.description}</p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {canImport && (
                                <button type="button" onClick={() => handleIngestBook(r)} disabled={ingestingId === r.id} className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg bg-[var(--color-one-accent)] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
                                  {ingestingId === r.id ? <span>保存中…</span> : <><BookOpen className="h-3 w-3" /><span>加入并阅读</span></>}
                                </button>
                              )}
                              {r.sourceUrl && (
                                <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[var(--color-one-border)] px-2.5 py-1.5 text-[11px] text-[var(--color-one-text-muted)] transition hover:text-[var(--color-one-text)]">
                                  <ExternalLink className="h-3 w-3" /><span>来源页</span>
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </section>
          )}

          {/* Category sections */}
          {CATEGORIES.filter((c) => booksByCategory(c.id).length > 0).map((cat) => {
            const catBooks = booksByCategory(cat.id);
            return (
              <section key={cat.id}>
                <div className="mb-4 flex items-end justify-between">
                  <div>
                    <h3 className="text-base font-semibold tracking-tight text-[var(--color-one-text)]">{cat.label}</h3>
                    <p className="mt-0.5 text-xs text-[var(--color-one-text-dim)]">{cat.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setActiveCategory(cat.id); setView('category'); }}
                    className="flex cursor-pointer items-center gap-1 text-xs font-medium text-[var(--color-one-accent)] transition hover:underline"
                  >
                    <span>查看全部</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {catBooks.slice(0, 6).map((book) => (
                    <BookCard key={book.id} book={book} onClick={() => openBookDetail(book)} />
                  ))}
                </div>
              </section>
            );
          })}

          {!isLoading && books.length === 0 && (
            <div className="rounded-[24px] border border-dashed border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)] py-16 text-center text-[var(--color-one-text-muted)]">
              <Library className="mx-auto mb-3 h-9 w-9 text-[var(--color-one-text-dim)]" />
              <p className="text-sm font-medium text-[var(--color-one-text)]">世界图书馆正在加载馆藏</p>
              <p className="mt-1 text-xs">使用上方搜索框检索全球公开书籍，或进入 مكتبة النور 全球书库。</p>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* CATEGORY VIEW                                                        */}
      {/* ===================================================================== */}
      {view === 'category' && (
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
          <button type="button" onClick={() => setView('home')} className="mb-6 flex cursor-pointer items-center space-x-1 text-xs text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)]">
            <ChevronLeft className="h-4 w-4" />
            <span>返回首页</span>
          </button>
          <div className="mb-6 flex items-center space-x-2 overflow-x-auto pb-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`whitespace-nowrap rounded-xl px-4 py-2 text-xs font-medium transition cursor-pointer ${
                  activeCategory === cat.id
                    ? 'bg-[var(--color-one-accent)] text-white'
                    : 'border border-[var(--color-one-border)] bg-[var(--color-one-surface)] text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {books.map((book) => (
              <BookCard key={book.id} book={book} onClick={() => openBookDetail(book)} />
            ))}
          </div>
          {books.length === 0 && <div className="py-16 text-center text-sm text-[var(--color-one-text-muted)]">该分类暂无书籍。</div>}
        </div>
      )}

      {/* ===================================================================== */}
      {/* BOOK DETAIL VIEW                                                     */}
      {/* ===================================================================== */}
      {view === 'detail' && selectedBook && (
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">
          <button type="button" onClick={() => setView('home')} className="mb-6 flex cursor-pointer items-center space-x-1 text-xs text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)]">
            <ChevronLeft className="h-4 w-4" />
            <span>返回</span>
          </button>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <div>
              <div className="aspect-[2/3] w-full max-w-xs overflow-hidden rounded-2xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] shadow-sm">
                <img
                  src={selectedBook.coverImage || '/assets/library/cover-little-prince.jpg'}
                  alt={selectedBook.title}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="mt-4 space-y-2">
                {(selectedBook.chapters?.some((c) => c.content?.trim()) || selectedBook.epubUrl || getBookPdfUrl(selectedBook as any) || getBookEmbedUrl(selectedBook as any) || selectedBook.sourceUrl || selectedBook.externalReadUrl) ? (
                  <button
                    type="button"
                    onClick={() => openReader(selectedBook)}
                    className="flex w-full cursor-pointer items-center justify-center space-x-2 rounded-xl bg-[var(--color-one-accent)] py-3 text-sm font-semibold text-white transition hover:opacity-90"
                  >
                    <BookOpen className="h-4 w-4" />
                    <span>立即阅读</span>
                  </button>
                ) : (
                  <div className="w-full rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] py-3 text-center text-xs text-[var(--color-one-text-muted)]">该记录无可用阅读入口。</div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => isOnShelf(selectedBook.id) ? removeFromShelf(selectedBook.id) : addToShelf(selectedBook, 'want_to_read')}
                    className={`flex min-h-10 cursor-pointer items-center justify-center space-x-1.5 rounded-xl border px-2 py-2 text-xs font-medium transition ${
                      isOnShelf(selectedBook.id)
                        ? 'border-[var(--color-one-accent)]/40 bg-[var(--color-one-accent)]/10 text-[var(--color-one-accent)]'
                        : 'border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)] text-[var(--color-one-text)]'
                    }`}
                  >
                    {isOnShelf(selectedBook.id) ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    <span>{isOnShelf(selectedBook.id) ? '已在书架' : '加入书架'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addToShelf(selectedBook, 'favorite')}
                    className="flex min-h-10 cursor-pointer items-center justify-center space-x-1.5 rounded-xl border border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)] px-2 py-2 text-xs font-medium text-[var(--color-one-text)] transition hover:border-[var(--color-one-accent)]"
                  >
                    <Heart className="h-3.5 w-3.5 text-rose-500" />
                    <span>收藏</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="md:col-span-2">
              <p className="mb-1 text-xs font-medium text-[var(--color-one-accent)]">{selectedBook.source}</p>
              <h1 className="font-serif text-2xl font-bold leading-tight text-[var(--color-one-text)] sm:text-3xl">{selectedBook.title}</h1>
              <p className="mt-2 text-sm text-[var(--color-one-text-muted)]">{selectedBook.author}</p>

              <div className="mt-6 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                {selectedBook.year && <MetaItem label="出版年份" value={selectedBook.year} />}
                {selectedBook.publisher && <MetaItem label="出版社" value={selectedBook.publisher} />}
                {selectedBook.isbn && <MetaItem label="ISBN" value={selectedBook.isbn} />}
                {selectedBook.language && <MetaItem label="语言" value={selectedBook.language.toUpperCase()} />}
                {selectedBook.originalLanguage && <MetaItem label="原始语言" value={selectedBook.originalLanguage} />}
                <MetaItem label="章节" value={`${selectedBook.chapters.length} 章`} />
              </div>

              {selectedBook.description && (
                <div className="mt-6">
                  <h3 className="mb-2 text-sm font-semibold text-[var(--color-one-text)]">内容简介</h3>
                  <p className="text-sm leading-relaxed text-[var(--color-one-text-muted)]">{selectedBook.description}</p>
                </div>
              )}

              {selectedBook.chapters.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-2 text-sm font-semibold text-[var(--color-one-text)]">目录</h3>
                  <ol className="space-y-1 text-xs text-[var(--color-one-text-muted)]">
                    {selectedBook.chapters.slice(0, 8).map((ch, i) => (
                      <li key={ch.id} className="flex items-center space-x-2">
                        <span className="font-mono text-[var(--color-one-text-dim)]">{i + 1}.</span>
                        <span>{ch.title}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="mt-8 flex flex-wrap gap-3">
                {(selectedBook.sourceUrl || selectedBook.externalReadUrl) && (
                  <a
                    href={selectedBook.sourceUrl || selectedBook.externalReadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-10 items-center space-x-2 rounded-xl border border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)] px-4 py-2 text-xs font-medium text-[var(--color-one-text)] transition hover:border-[var(--color-one-accent)]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>资源来源</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SHELF VIEW                                                           */}
      {/* ===================================================================== */}
      {view === 'shelf' && (
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-serif text-xl font-semibold text-[var(--color-one-text)]">我的书架</h2>
            <button type="button" onClick={() => setView('home')} className="flex min-h-10 cursor-pointer items-center space-x-1 rounded-lg px-3 text-xs text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)]">
              <ChevronLeft className="h-4 w-4" />
              <span>返回首页</span>
            </button>
          </div>

          <div className="mb-6 flex items-center space-x-2 overflow-x-auto pb-2">
            {SHELF_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setShelfTab(tab.id)}
                className={`whitespace-nowrap rounded-xl px-4 py-2 text-xs font-medium transition cursor-pointer ${
                  shelfTab === tab.id
                    ? 'bg-[var(--color-one-accent)] text-white'
                    : 'border border-[var(--color-one-border)] bg-[var(--color-one-surface)] text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {shelfBooks.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)] py-16 text-center text-[var(--color-one-text-muted)]">
              <BookMarked className="mx-auto mb-3 h-9 w-9 text-[var(--color-one-text-dim)]" />
              <p className="text-sm font-medium text-[var(--color-one-text)]">书架还是空的</p>
              <p className="mt-1 text-xs">前往「مكتبة النور 全球书库」搜索全球原版图书，下载后自动转为电子书重排阅读。</p>
              <button
                type="button"
                onClick={() => setView('noor')}
                className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[var(--color-one-accent)] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90"
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>去全球书库找书</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-5">
              {shelfBooks.map((item) => {
                const localPdf = getBookPdfUrl(item.book as any);
                return (
                  <div key={item.id} className="relative flex flex-col">
                    <div className="relative">
                      <BookCard book={item.book} onClick={() => openShelfBook(item.book)} />
                      {item.progress > 0 && (
                        <div className="pointer-events-none absolute inset-x-2 bottom-[3.25rem] h-1 overflow-hidden rounded-full bg-black/30">
                          <div className="h-full rounded-full bg-[var(--color-one-accent)]" style={{ width: `${item.progress}%` }} />
                        </div>
                      )}
                    </div>
                    {localPdf && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openShelfBook(item.book)}
                          className="flex-1 cursor-pointer rounded-lg bg-[var(--color-one-accent)]/12 px-2 py-1.5 text-[11px] font-medium text-[var(--color-one-accent)] transition hover:bg-[var(--color-one-accent)]/20"
                        >
                          电子书阅读
                        </button>
                        <a
                          href={localPdf.includes('?') ? `${localPdf}&download=1` : `${localPdf}?download=1&filename=${encodeURIComponent(item.book.title)}`}
                          download
                          className="rounded-lg border border-[var(--color-one-border)] px-2 py-1.5 text-[11px] text-[var(--color-one-text-muted)] transition hover:text-[var(--color-one-text)]"
                          title="下载原始 PDF"
                        >
                          下载
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* PERSONAL VOCABULARY BANK VIEW                                         */}
      {/* ===================================================================== */}
      {view === 'vocab' && (
        <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="font-serif text-xl font-semibold text-[var(--color-one-text)]">个人词汇库</h2>
              <p className="mt-1 text-xs text-[var(--color-one-text-muted)]">在电子书阅读器中点击查词并保存的生词，自动跨设备持久化。</p>
            </div>
            <button type="button" onClick={() => setView('home')} className="flex min-h-10 cursor-pointer items-center space-x-1 rounded-lg px-3 text-xs text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)]">
              <ChevronLeft className="h-4 w-4" />
              <span>返回首页</span>
            </button>
          </div>

          {vocabLoading ? (
            <div className="py-12 text-center text-xs text-[var(--color-one-text-muted)]">正在加载个人生词本…</div>
          ) : vocabItems.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)] py-16 text-center text-[var(--color-one-text-muted)]">
              <Sparkles className="mx-auto mb-3 h-8 w-8 text-[var(--color-one-text-dim)]" />
              <p className="text-sm font-medium text-[var(--color-one-text)]">生词本为空</p>
              <p className="mt-1 text-xs">打开任意书籍，轻点生词即可由 ONE AI 注解并一键收入个人词汇库。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {vocabItems.map((v) => (
                <div key={v.id} className="rounded-2xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-base font-semibold text-[var(--color-one-text)]">{v.word}</span>
                        {v.partOfSpeech && <span className="text-[11px] text-[var(--color-one-accent)]">{v.partOfSpeech}</span>}
                      </div>
                      {v.reading && <div className="text-xs text-[var(--color-one-text-muted)]">{v.reading}</div>}
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch(`/api/library/vocabulary/${encodeURIComponent(v.id)}`, { method: 'DELETE' }).catch(() => {});
                        setVocabItems((prev) => prev.filter((item) => item.id !== v.id));
                      }}
                      className="cursor-pointer rounded-lg p-1.5 text-[var(--color-one-text-dim)] hover:text-rose-500"
                      title="删除生词"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--color-one-text)]">{v.meaning}</p>
                  {v.usage && <p className="mt-1 text-[11px] text-[var(--color-one-text-muted)]">用法：{v.usage}</p>}
                  {v.example && <p className="mt-1 text-[11px] italic text-[var(--color-one-text-dim)]">{v.example}</p>}
                  {v.bookTitle && <p className="mt-2 text-[10px] text-[var(--color-one-text-dim)]">出自《{v.bookTitle}》</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* NOOR ISLAMIC PDF PORTAL VIEW                                         */}
      {/* ===================================================================== */}
      {view === 'noor' && (
        <NoorIslamicPdfPortal
          lang={lang}
          initialQuery={noorInitialQuery}
          onBack={() => setView('home')}
          onGoToShelf={() => setView('shelf')}
          onOpenPdf={(payload) => setPdfReader(payload)}
          onOpenBook={(book) => { void openReader(book); }}
          onBookSavedToShelf={(savedBook, shelfItem) => {
            setBooks((prev) => (prev.some((b) => b.id === savedBook.id) ? prev : [savedBook, ...prev]));
            setShelf((prev) => {
              const entry: BookShelfItem & { book: Book } = {
                id: shelfItem?.id || `shelf_${savedBook.id}`,
                userId: shelfItem?.userId || currentUser?.id || 'guest',
                bookId: savedBook.id,
                status: shelfItem?.status || 'reading',
                progress: shelfItem?.progress || 0,
                savedAt: shelfItem?.savedAt || new Date().toISOString(),
                updatedAt: shelfItem?.updatedAt || new Date().toISOString(),
                book: savedBook,
              };
              return prev.some((i) => i.bookId === savedBook.id)
                ? prev.map((i) => (i.bookId === savedBook.id ? entry : i))
                : [entry, ...prev];
            });
          }}
        />
      )}

      {/* ===================================================================== */}
      {/* ADMIN VIEW                                                           */}
      {/* ===================================================================== */}
      {view === 'admin' && <AdminLibrary onBack={() => setView('home')} />}

      {/* ===================================================================== */}
      {/* APPLE BOOKS FULL-SCREEN READER                                       */}
      {/* ===================================================================== */}
      {readingBook && activeChapter && (
        <AppleBookReader
          key={readingBook.id}
          book={readingBook}
          lang={lang}
          initialChapterIndex={activeChapterIndex}
          initialAnnotations={annotations}
          onClose={() => {
            closeReader();
            refreshRecentHistory();
          }}
          onSaveProgress={(progress, chapterId) => {
            if (chapterId) {
              const idx = readingBook.chapters.findIndex((c) => c.id === chapterId);
              if (idx >= 0 && idx !== activeChapterIndex) setActiveChapterIndex(idx);
            }
            void saveProgress(progress);
          }}
          onAnnotationsChange={setAnnotations}
        />
      )}

      {/* ===================================================================== */}
      {/* EPUB READER                                                          */}
      {/* ===================================================================== */}
      {readingEpub && (
        <EpubReader
          key={`${currentUser?.id || 'guest'}:${readingEpub.id}`}
          book={readingEpub}
          ownerId={currentUser?.id}
          initialCfi={shelf.find((item) => item.bookId === readingEpub.id && item.userId === currentUser?.id)?.lastReadEpubCfi}
          onProgress={(progress, cfi, bookId, ownerId) => { void saveEpubProgress(bookId, progress, cfi, ownerId); }}
          onClose={() => setReadingEpub(null)}
        />
      )}
      {crawlReader && (() => {
        const embed = getBookEmbedUrl(crawlReader);
        return (
          <div role="dialog" aria-modal="true" aria-label="在线阅读" className="fixed inset-0 z-[70] flex flex-col bg-[var(--color-one-bg)] text-[var(--color-one-text)]">
            <div className="flex items-center justify-between border-b border-[var(--color-one-border)] bg-[var(--color-one-surface)] px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-[var(--color-one-text)]">{crawlReader.title}</h2>
                <p className="truncate text-[11px] text-[var(--color-one-text-muted)]">{crawlReader.author} · {crawlReader.source}</p>
              </div>
              <div className="ml-3 flex shrink-0 items-center gap-2">
                {crawlReader.sourceUrl && (
                  <a href={crawlReader.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-[var(--color-one-border)] px-3 text-xs text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)]">
                    <ExternalLink className="h-3.5 w-3.5" /> 官方来源
                  </a>
                )}
                <button type="button" onClick={() => setCrawlReader(null)} aria-label="关闭阅读器" className="rounded-xl p-2 text-[var(--color-one-text-muted)] hover:bg-[var(--color-one-surface-soft)]"><X className="h-4 w-4" /></button>
              </div>
            </div>
            {embed ? (
              <iframe
                src={embed.url}
                title={crawlReader.title}
                className="min-h-0 flex-1 border-0 bg-white"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-[var(--color-one-text-muted)]">
                <p>该来源暂不支持站内嵌入阅读，请使用官方来源打开。</p>
                {crawlReader.sourceUrl && <a href={crawlReader.sourceUrl} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[var(--color-one-accent)] px-4 py-2 text-white">打开官方来源</a>}
              </div>
            )}
          </div>
        );
      })()}
      {webReader && (
        <div role="dialog" aria-modal="true" aria-label="网页原文阅读" className="fixed inset-0 z-[70] flex flex-col bg-[var(--color-one-bg)] text-[var(--color-one-text)]">
          <div className="flex items-center justify-between border-b border-[var(--color-one-border)] bg-[var(--color-one-surface)] px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-[var(--color-one-text)]">{webReader.title}</h2>
              <p className="truncate text-[11px] text-[var(--color-one-text-muted)]">{webReader.label}</p>
            </div>
            <div className="ml-3 flex shrink-0 items-center gap-2">
              {webReader.sourceUrl && (
                <a href={webReader.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-[var(--color-one-border)] px-3 text-xs text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)]">
                  <ExternalLink className="h-3.5 w-3.5" /> 官方来源
                </a>
              )}
              <button type="button" onClick={() => setWebReader(null)} aria-label="关闭阅读器" className="rounded-xl p-2 text-[var(--color-one-text-muted)] hover:bg-[var(--color-one-surface-soft)]"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <iframe
            src={webReader.url}
            title={webReader.title}
            className="min-h-0 flex-1 border-0 bg-white"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      )}
      {pdfReader && (
        <div role="dialog" aria-modal="true" aria-label={pdfReader.title} className="fixed inset-0 z-[70] flex flex-col">
          <PdfDocumentViewer
            sourceUrl={pdfReader.url}
            title={pdfReader.title}
            lang={lang}
            originPageUrl={pdfReader.sourceUrl}
            onClose={() => {
              setPdfReader(null);
              refreshRecentHistory();
            }}
          />
        </div>
      )}
    </div>
  );
};

// ===========================================================================
// Book card (ONE LIBRARY)
// ===========================================================================
function BookCard({ book, onClick }: { book: Book; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`打开《${book.title}》详情`}
      className="group flex w-full cursor-pointer flex-col rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-one-accent)]"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] shadow-xs transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[var(--color-one-border-strong)] group-hover:shadow-md">
        <img
          src={book.coverImage || '/assets/library/cover-little-prince.jpg'}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </div>
      <h3 className="mt-2.5 line-clamp-2 text-[13px] font-medium leading-snug text-[var(--color-one-text)] transition-colors group-hover:text-[var(--color-one-accent)]">
        {book.title}
      </h3>
      <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--color-one-text-muted)]">{book.author}</p>
    </button>
  );
}

// ===========================================================================
// Metadata item (only shown when value exists)
// ===========================================================================
function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-one-text-dim)]">{label}</div>
      <div className="mt-0.5 text-xs font-medium text-[var(--color-one-text)]">{value}</div>
    </div>
  );
}
