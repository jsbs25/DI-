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
  const [view, setView] = useState<'home' | 'category' | 'detail' | 'shelf' | 'noor' | 'admin'>('home');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [noorInitialQuery, setNoorInitialQuery] = useState<string>('');

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
      {/* ONE LIBRARY header */}
      <header className="sticky top-[58px] z-30 border-b border-[var(--color-one-border)] bg-[color:var(--color-one-bg-elevated)]/88 backdrop-blur-xl md:top-16">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--color-one-border-strong)] bg-white/[0.03] text-[var(--color-one-accent)]">
              <Library className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-one-text-dim)]">ONE LIBRARY</p>
              <h1 className="text-base font-semibold leading-tight tracking-tight text-white sm:text-lg">A World of Knowledge</h1>
              <p className="text-[11px] text-[var(--color-one-text-muted)]">One library for humanity · 真实馆藏、开放检索与阅读</p>
            </div>
          </div>

          <nav className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:hidden" aria-label="ONE LIBRARY 导航">
            {[
              { id: 'home', label: '首页' },
              { id: 'noor', label: 'مكتبة النور · 全球书库' },
              { id: 'shelf', label: '我的书架' },
              { id: 'admin', label: '管理' }
            ].map(n => (
              <button
                key={n.id}
                type="button"
                onClick={() => setView(n.id as any)}
                aria-current={view === n.id ? 'page' : undefined}
                className={`min-h-11 rounded-xl px-3 text-xs font-medium transition-colors cursor-pointer ${
                  view === n.id
                    ? n.id === 'noor'
                      ? 'bg-emerald-500 text-[#04140e] font-semibold'
                      : 'bg-[var(--color-one-accent)] text-[#071018]'
                    : n.id === 'noor'
                      ? 'border border-emerald-500/35 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20'
                      : 'border border-[var(--color-one-border)] bg-white/[0.02] text-[var(--color-one-text-muted)] hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                {n.label}
              </button>
            ))}
          </nav>

          <nav className="hidden items-center gap-1 rounded-2xl border border-[var(--color-one-border)] bg-white/[0.02] p-1 text-xs font-medium md:flex">
            {[
              { id: 'home', label: '首页' },
              { id: 'noor', label: 'مكتبة النور · 全球书库' },
              { id: 'shelf', label: '我的书架' },
              { id: 'admin', label: '管理' }
            ].map(n => (
              <button
                key={n.id}
                onClick={() => setView(n.id as any)}
                className={`rounded-xl px-3 py-2 transition-colors cursor-pointer ${
                  view === n.id
                    ? n.id === 'noor'
                      ? 'bg-emerald-500 text-[#04140e] font-semibold'
                      : 'bg-white/[0.08] text-white'
                    : n.id === 'noor'
                      ? 'text-emerald-200 hover:bg-emerald-500/15 hover:text-white'
                      : 'text-[var(--color-one-text-muted)] hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                {n.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {readerNotice && (
        <div role="status" className="mx-auto mt-3 w-full max-w-7xl px-4 sm:px-8">
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.08] p-3 text-xs text-amber-100/90">
            <p className="leading-relaxed"><span className="font-semibold text-amber-200">无法在站内完整阅读：</span>{readerNotice}</p>
            <button type="button" onClick={()=>setReaderNotice(null)} className="shrink-0 rounded-lg p-1.5 text-amber-200 hover:bg-white/10"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}
      {/* ===================================================================== */}
      {/* HOME VIEW                                                            */}
      {/* ===================================================================== */}
      {view === 'home' && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-8 py-8 space-y-12">
          {/* ONE LIBRARY hero */}
          <section className="grid grid-cols-1 items-center gap-8 py-4 lg:grid-cols-[1.2fr_0.8fr] lg:gap-12">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-one-border-strong)] bg-white/[0.03] px-3 py-1 text-xs font-medium text-[var(--color-one-text-muted)]">
                <Sparkles className="h-3.5 w-3.5 text-[var(--color-one-accent)]" />
                <span>开放馆藏 · 真实检索 · 诚实阅读能力</span>
              </div>
              <h2 className="max-w-2xl text-3xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl">
                一个世界，无数思想。
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--color-one-text-muted)] sm:text-base">
                在 ONE LIBRARY 中检索与阅读真实的公开图书与文献资源。汇聚 Project Gutenberg、Open Library、Internet Archive、arXiv 等来源，保留原始入口、权利标注与可用阅读方式。
              </p>

              {/* Global search */}
              <div className="mt-7 rounded-[28px] border border-[var(--color-one-border)] bg-white/[0.03] p-3 shadow-[var(--shadow-one-sm)] backdrop-blur-sm sm:p-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-one-text-dim)]" />
                  <label htmlFor="world-library-search" className="sr-only">搜索全球馆藏</label>
                  <input
                    id="world-library-search"
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleUnifiedSearch()}
                    placeholder="输入书名、作者、主题、ISBN 或 DOI..."
                    aria-describedby="world-library-search-help"
                    className="w-full rounded-2xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.7)] py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-[var(--color-one-text-dim)] focus:border-[rgba(78,161,255,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(78,161,255,0.12)] sm:pr-[13.5rem]"
                  />
                  <div className="mt-2 flex items-center gap-2 sm:absolute sm:right-2 sm:top-1/2 sm:mt-0 sm:-translate-y-1/2">
                    <button
                      type="button"
                      onClick={() => handleCrawlBooks()}
                      disabled={isCrawling || !searchQuery.trim()}
                      title="多源并行检索开放图书（Gutenberg/Open Library/Internet Archive/Wikisource）"
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-one-border-strong)] bg-white/[0.03] px-3 py-2 text-xs font-medium text-[var(--color-one-text-muted)] transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40 sm:flex-none"
                    >
                      <Compass className="h-3.5 w-3.5" />
                      <span>{isCrawling ? '爬取中...' : '开放爬取'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUnifiedSearch()}
                      disabled={(isSearchingOnline && isCrawling) || !searchQuery.trim()}
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--color-one-accent)] px-4 py-2 text-xs font-semibold text-[#071018] transition hover:brightness-110 disabled:opacity-40 sm:flex-none"
                    >
                      <Search className="h-3.5 w-3.5" />
                      <span>{isSearchingOnline || isCrawling ? '检索中...' : '搜索'}</span>
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="flex items-center gap-1 text-[11px] text-[var(--color-one-text-dim)]">
                    <Sparkles className="h-3 w-3 text-[var(--color-one-accent)]" /> 推荐检索
                  </span>
                  {[
                    { label: '道德经', q: '道德经' },
                    { label: '论语', q: '论语' },
                    { label: '史记', q: '史记' },
                    { label: 'The Time Machine', q: 'The Time Machine' },
                    { label: 'Principia', q: 'Philosophiae Naturalis Principia' },
                    { label: 'Alice in Wonderland', q: 'Alice in Wonderland' }
                  ].map(chip => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => handleUnifiedSearch(chip.q)}
                      className="cursor-pointer rounded-lg border border-[var(--color-one-border)] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-[var(--color-one-text-muted)] transition hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.05] hover:text-white"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-2 text-[11px] text-[var(--color-one-text-dim)]">
                  <Globe className="h-3.5 w-3.5 text-[var(--color-one-accent)]/80" />
                  <span id="world-library-search-help">直连公开/开放来源；结果保留来源、许可与可用性信息</span>
                </div>
              </div>
                <div className="mt-4">
                  <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[var(--color-one-text-dim)]">
                    国际数字图书馆官方入口 · {searchQuery.trim() ? '将当前关键词带到来源网站' : '可直接访问或搜索'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a href={`https://openlibrary.org/search?q=${encodeURIComponent(searchQuery.trim())}`} target="_blank" rel="noopener noreferrer" aria-label="在 Open Library 官方网站搜索当前关键词（新标签页）" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--color-one-border)] bg-white/[0.02] px-3 py-2 text-[11px] text-[var(--color-one-text-muted)] hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.05] hover:text-white">
                      Open Library <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                    <a href={`https://www.europeana.eu/en/search?query=${encodeURIComponent(searchQuery.trim())}`} target="_blank" rel="noopener noreferrer" aria-label="在 Europeana 官方网站搜索当前关键词（新标签页）" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--color-one-border)] bg-white/[0.02] px-3 py-2 text-[11px] text-[var(--color-one-text-muted)] hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.05] hover:text-white">
                      Europeana <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-emerald-300/80">مكتبة النور · 全球伊斯兰与世界原版书库（搜索 + 下载到原文书架 + AI 讲解）</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNoorInitialQuery(searchQuery.trim());
                        setView('noor');
                      }}
                      className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/25"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>مكتبة النور · 进入全球图书搜索</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                    <a href="https://www.noor-book.com/" target="_blank" rel="noopener noreferrer" title="مكتبة النور 官方网站" className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-[var(--color-one-border)] bg-white/[0.02] px-3 py-2 text-[11px] text-[var(--color-one-text-muted)] hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.05] hover:text-white">
                      <span>Noor Book 官网</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <a href="https://waqfeya.net/books" target="_blank" rel="noopener noreferrer" title="Waqfeya 官方扫描书目录" className="inline-flex min-h-11 items-center rounded-xl border border-[var(--color-one-border)] bg-white/[0.02] px-3 py-2 text-[11px] text-[var(--color-one-text-muted)] hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.05] hover:text-white">Waqfeya</a>
                    <a href="https://shamela.ws/search" target="_blank" rel="noopener noreferrer" title="Shamela 官方站内搜索" className="inline-flex min-h-11 items-center rounded-xl border border-[var(--color-one-border)] bg-white/[0.02] px-3 py-2 text-[11px] text-[var(--color-one-text-muted)] hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.05] hover:text-white">Shamela</a>
                  </div>
                </div>
              </div>

            {/* Featured real book */}
            {featuredBook && (
              <button
                type="button"
                onClick={() => openBookDetail(featuredBook)}
                aria-label={`查看《${featuredBook.title}》详情`}
                className="group flex cursor-pointer justify-center rounded-3xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-one-accent)] lg:justify-end"
              >
                <div className="relative w-full max-w-sm rounded-[28px] border border-[var(--color-one-border)] bg-white/[0.03] p-4 sm:p-5">
                  <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-[var(--color-one-text-dim)]">馆藏精选</p>
                  <div className="mx-auto aspect-[2/3] w-44 overflow-hidden rounded-2xl border border-white/10 shadow-[var(--shadow-one-md)] transition duration-300 group-hover:scale-[1.02] sm:w-52">
                    <img
                      src={featuredBook.coverImage || '/assets/library/cover-little-prince.jpg'}
                      alt={featuredBook.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="mt-4">
                    <h3 className="text-base font-semibold leading-snug text-white transition-colors group-hover:text-[var(--color-one-accent-soft)]">
                      {featuredBook.title}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--color-one-text-muted)]">{featuredBook.author}</p>
                    {featuredBook.description && <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[var(--color-one-text-dim)]">{featuredBook.description}</p>}
                  </div>
                </div>
              </button>
            )}
          </section>

          {/* Saturn-style multi-engine open book & audiobook crawler results */}
          {(crawlResults.length > 0 || isCrawling) && (
            <section aria-labelledby="library-crawl-results-title" aria-busy={isCrawling} className="rounded-[28px] border border-[var(--color-one-border)] bg-white/[0.03] p-5 shadow-[var(--shadow-one-sm)]">
              <h3 id="library-crawl-results-title" className="mb-1 text-sm font-semibold text-white">全网图书 / 有声精读爬虫结果</h3>
              <p className="mb-3 text-[11px] leading-relaxed text-[var(--color-one-text-muted)]">已并行接入 Google Books、YouTube 有声精读、Bilibili 读书、Gutenberg、Open Library、Internet Archive、Wikisource，支持直接站内翻开阅读与有声聆听。</p>
              {crawlSources.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {crawlSources.map((src: any) => {
                    const srcNameMap: Record<string, string> = {
                      youtube: 'YouTube 有声/精读',
                      googlebooks: 'Google Books',
                      bilibili: 'Bilibili 读书',
                      openlibrary: 'Open Library',
                      archive: 'Internet Archive',
                      wikisource: 'Wikisource',
                      gutenberg: 'Gutenberg',
                      arabic_wikisource: 'Arabic Wikisource',
                    };
                    return (
                      <span key={src.source} className={`rounded-md border px-2 py-1 text-[10px] ${src.ok && src.count > 0 ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200' : 'border-[var(--color-one-border)] text-[var(--color-one-text-dim)]'}`}>
                        {srcNameMap[src.source] || src.source}: {src.ok ? `已采集 ${src.count}` : '待连接/超时'}
                      </span>
                    );
                  })}
                </div>
              )}
              {isCrawling ? (
                <div role="status" className="py-6 text-center text-xs text-[var(--color-one-text-muted)]">正在并行爬取/检索开放图书来源...</div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {crawlResults.map((r: any) => {
                    const embedInfo = getBookEmbedUrl(r);
                    return (
                    <div key={r.id} className="flex items-start gap-3 rounded-2xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.55)] p-3 transition hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.04]">
                      {r.coverImage && <img src={r.coverImage} alt={r.title} className="h-16 w-12 shrink-0 rounded-lg object-cover" />}
                      <div className="min-w-0 flex-1">
                        <h4 className="line-clamp-1 text-xs font-semibold text-white">{r.title}</h4>
                        <p className="mb-1 text-[11px] text-[var(--color-one-accent-soft)]">{r.author} · {(r.language || '').toUpperCase()} · {r.source}{r.year ? ` · ${r.year}` : ''}</p>
                        <p className="mb-2 line-clamp-2 text-[11px] text-[var(--color-one-text-muted)]">{r.description}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          {r.canImport && (
                            <button type="button" onClick={() => handleIngestCrawledBook(r)} disabled={ingestingId === r.id} className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-[var(--color-one-accent)] px-3 py-2 text-[11px] font-semibold text-[#071018] transition hover:brightness-110 disabled:opacity-50">
                              {ingestingId === r.id ? <span>正在读取...</span> : <><BookOpen className="h-3 w-3" /><span>保存并诵读</span></>}
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
                              className="inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px] font-medium text-emerald-100 transition hover:bg-emerald-500/15"
                            >
                              <BookOpen className="h-3 w-3" /><span>在线阅读</span>
                            </button>
                          )}
                          {r.canReadOnline === false && !embedInfo && !getBookPdfUrl(r) && !r.canImport && (
                            <span className="text-[10px] text-amber-200/90">无法站内阅读：{r.rightsNote || r.availability || '来源受限/需官方页面'}</span>
                          )}
                          {r.sourceUrl && (
                            <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-[var(--color-one-border)] px-3 py-2 text-[11px] font-medium text-[var(--color-one-text-muted)] transition hover:bg-white/[0.05] hover:text-white">
                              <ExternalLink className="h-3 w-3" /><span>官方来源</span>
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
            <section aria-labelledby="library-online-results-title" aria-busy={isSearchingOnline} className="rounded-[28px] border border-[var(--color-one-border)] bg-white/[0.03] p-5 shadow-[var(--shadow-one-sm)]">
              <h3 id="library-online-results-title" className="mb-3 text-sm font-semibold text-white">全球检索结果</h3>
              {onlineSourceStatuses.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {onlineSourceStatuses.map(source => {
                    const statusLabel = source.status === 'ok' ? `可用 ${source.count}` : source.status === 'disabled' ? '未启用' : source.status === 'unsupported' ? '此查询语言暂不适用' : '查询失败';
                    const statusTone = source.status === 'ok' ? 'text-emerald-300 border-emerald-800/70' : source.status === 'disabled' ? 'text-amber-200 border-amber-800/70' : source.status === 'unsupported' ? 'text-slate-300 border-slate-700' : 'text-red-300 border-red-800/70';
                    return (
                      <span key={source.source} title={source.reason} className={`max-w-full break-words rounded-md border px-2 py-1 text-[10px] ${statusTone}`}>
                        {source.name}: {statusLabel}{source.reason && source.status !== 'ok' ? ` · ${source.reason}` : ''}
                      </span>
                    );
                  })}
                </div>
              )}
              {ingestError && <div role="status" aria-live="polite" className="text-xs text-red-400 mb-3">{ingestError}</div>}
              {!isSearchingOnline && onlineResults.length > 0 && (
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end xl:grid-cols-4">
                  <label className="block text-[11px] text-[var(--color-one-text-muted)]">
                    <span className="mb-1 block">按来源筛选</span>
                    <select aria-label="按来源筛选全球检索结果" value={onlineSourceFilter} onChange={event => setOnlineSourceFilter(event.target.value)} className="min-h-11 w-full rounded-xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.7)] px-3 py-2 text-xs text-white focus:border-[rgba(78,161,255,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(78,161,255,0.12)]">
                      <option value="all">全部来源（{onlineResults.length}）</option>
                      {onlineFilterOptions.sources.map(option => (<option key={option.source} value={option.source}>{option.name}（{option.count}）</option>))}
                    </select>
                  </label>
                  <label className="block text-[11px] text-[var(--color-one-text-muted)]">
                    <span className="mb-1 block">按语言筛选</span>
                    <select aria-label="按语言筛选全球检索结果" value={onlineLanguageFilter} onChange={event => setOnlineLanguageFilter(event.target.value)} className="min-h-11 w-full rounded-xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.7)] px-3 py-2 text-xs text-white focus:border-[rgba(78,161,255,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(78,161,255,0.12)]">
                      <option value="all">全部语言（{onlineResults.length}）</option>
                      {onlineFilterOptions.languages.map(option => (<option key={option.value} value={option.value}>{option.label}（{option.count}）</option>))}
                    </select>
                  </label>
                  <label className="block text-[11px] text-[var(--color-one-text-muted)]">
                    <span className="mb-1 block">按年份筛选</span>
                    <select aria-label="按年份筛选全球检索结果" value={onlineYearFilter} onChange={event => setOnlineYearFilter(event.target.value)} className="min-h-11 w-full rounded-xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.7)] px-3 py-2 text-xs text-white focus:border-[rgba(78,161,255,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(78,161,255,0.12)]">
                      <option value="all">全部年份（{onlineResults.length}）</option>
                      {onlineFilterOptions.years.map(option => (<option key={option.value} value={option.value}>{option.label}（{option.count}）</option>))}
                    </select>
                  </label>
                  <label className="block text-[11px] text-[var(--color-one-text-muted)]">
                    <span className="mb-1 block">按来源标注的权利状态筛选</span>
                    <select aria-label="按权利状态筛选全球检索结果" value={onlineRightsFilter} onChange={event => setOnlineRightsFilter(event.target.value)} className="min-h-11 w-full rounded-xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.7)] px-3 py-2 text-xs text-white focus:border-[rgba(78,161,255,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(78,161,255,0.12)]">
                      <option value="all">全部权利状态</option>
                      {onlineFilterOptions.rights.map(option => (<option key={option.value} value={option.value}>{LIBRARY_RIGHTS_FILTER_LABELS[option.value]}（{option.count}）</option>))}
                    </select>
                  </label>
                  <p role="status" aria-live="polite" className="text-[10px] text-[var(--color-one-text-dim)] sm:col-span-2 xl:col-span-4">
                    显示 {visibleOnlineResults.length} / {onlineResults.length} 条；仅按返回记录的来源、语言、年份和权利分类筛选，未标注的语言/年份及未知权利仍保留为未知。
                  </p>
                </div>
              )}
              {!isSearchingOnline && onlineResults.length > 0 && visibleOnlineResults.length === 0 && (
                <div role="status" className="rounded-2xl border border-dashed border-[var(--color-one-border-strong)] px-4 py-8 text-center text-xs text-[var(--color-one-text-muted)]">
                  没有符合当前筛选条件的结果，请尝试其他来源、语言、年份或权利状态。
                </div>
              )}
              {isSearchingOnline ? (
                <div role="status" aria-live="polite" className="py-6 text-center text-xs text-[var(--color-one-text-muted)]">正在查询全球图书馆与开放资源...</div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleOnlineResults.map(r => {
                    const canImport = r.canImport === true;
                    const sourceName = r.sourceName || ({
                      youtube: 'YouTube 有声精读', bilibili: 'Bilibili 精读', openlibrary: 'Open Library', gutenberg: 'Project Gutenberg', googlebooks: 'Google Books', europeana: 'Europeana', archive: 'Internet Archive', wikisource: 'Wikisource', ar_wikisource: '阿拉伯语维基文库', openalex: 'OpenAlex', crossref: 'Crossref', arxiv: 'arXiv', europepmc: 'Europe PMC', pmc: 'PubMed Central', pubmed: 'PubMed', shamela: 'Shamela'
                    } as Record<string, string>)[r.source] || r.source;
                    const resourceType = typeof r.metadata?.resourceType === 'string' ? r.metadata.resourceType : undefined;
                    const identifierLabel = r.doi ? `DOI ${r.doi}` : r.isbn?.length ? `ISBN ${r.isbn[0]}` : r.identifier ? `ID ${r.identifier}` : undefined;
                    const availabilityLabel = ({ 'official-source-only': '仅官方来源页面', 'licensed-thumbnail-and-official-source': '官方页面；许可缩略图', 'provider-preview': '提供方预览', 'provider-full-view': '提供方页面阅读', 'open-access-link': '开放获取入口（官方来源）', 'provider-download': '提供方访问入口', 'metadata-only': '仅元数据', 'access-unknown': '访问状态未知', 'verify-official-opds': '需官方目录核验' } as Record<string, string>)[r.availability || ''] || '官方来源访问';
                    const downloadLabel = (r.downloadLinks?.length || 0) > 0 ? `来源链接 ${r.downloadLinks!.length} 个（遵循许可）` : '无已核验下载入口';
                    const rightsLabel = ({ PUBLIC_DOMAIN: '公共领域（依来源声明）', OPEN_LICENSE: '开放许可', OPEN_ACCESS: '开放获取', BORROWABLE: '需经来源借阅', PREVIEW_ONLY: '仅预览', METADATA_ONLY: '仅元数据', COPYRIGHT_RESTRICTED: '受版权限制', UNKNOWN: '权利状态未知' } as Record<string, string>)[r.rightsClassification || 'UNKNOWN'] || '权利状态未知';
                    const licenseUrl = safeHttpsUrl(r.licenseUrl);
                    const providerFullTextUrl = safeHttpsUrl(r.providerFullTextUrl);
                    return (
                      <div key={r.id} className="flex items-start gap-3 rounded-2xl border border-[var(--color-one-border)] bg-[rgba(10,14,22,0.55)] p-3 transition hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.04]">
                        {r.coverImage && <img src={r.coverImage} alt={r.title} className="h-16 w-12 shrink-0 rounded-lg object-cover" />}
                        <div className="min-w-0 flex-1">
                          <h4 className="line-clamp-1 text-xs font-semibold text-white">{r.title}</h4>
                          <p className="mb-1 text-[11px] text-[var(--color-one-accent-soft)]">{r.author} · {r.language?.toUpperCase()} · {sourceName}{r.year ? ` · ${r.year}` : ''}</p>
                          <p className="mb-1 line-clamp-2 text-[11px] text-[var(--color-one-text-muted)]">{r.description}</p>
                          {(resourceType || identifierLabel) && <p className="mb-1 text-[10px] text-[var(--color-one-text-dim)]">{resourceType ? `类型：${resourceType}` : ''}{resourceType && identifierLabel ? ' · ' : ''}{identifierLabel || ''}</p>}
                          <p className="mb-1 text-[10px] text-[var(--color-one-text-dim)]">访问：{availabilityLabel} · 下载：{downloadLabel}</p>
                          <p className="mb-2 text-[10px] text-[var(--color-one-text-dim)]">权利状态：{rightsLabel}{r.rightsNote ? ` · ${r.rightsNote}` : ''}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            {canImport && (
                              <button type="button" onClick={() => handleIngestBook(r)} disabled={ingestingId === r.id} className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-[var(--color-one-accent)] px-3 py-2 text-[11px] font-semibold text-[#071018] transition hover:brightness-110 disabled:opacity-50">
                                {ingestingId === r.id ? <span>正在读取...</span> : <><BookOpen className="h-3 w-3" /><span>保存并诵读</span></>}
                              </button>
                            )}
                            {(() => {
                              const onlineEmbed = getBookEmbedUrl(r);
                              if (!onlineEmbed) return null;
                              return (
                                <button
                                  type="button"
                                  onClick={() => setWebReader({ url: onlineEmbed.url, title: r.title, sourceUrl: r.sourceUrl, label: onlineEmbed.label })}
                                  className="inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px] font-medium text-emerald-100 transition hover:bg-emerald-500/15"
                                >
                                  <BookOpen className="h-3 w-3" /><span>在线阅读</span>
                                </button>
                              );
                            })()}
                            {r.sourceUrl && (
                              <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-[var(--color-one-border)] px-3 py-2 text-[11px] font-medium text-[var(--color-one-text-muted)] transition hover:bg-white/[0.05] hover:text-white">
                                <ExternalLink className="h-3 w-3" /><span>在来源平台查看</span>
                              </a>
                            )}
                            {providerFullTextUrl && providerFullTextUrl !== r.sourceUrl && (
                              <a href={providerFullTextUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px] font-medium text-emerald-100 transition hover:bg-emerald-500/15">
                                <ExternalLink className="h-3 w-3" /><span>打开官方全文</span>
                              </a>
                            )}
                            {licenseUrl && (
                              <a href={licenseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-[var(--color-one-border)] px-3 py-2 text-[11px] font-medium text-[var(--color-one-text-muted)] transition hover:bg-white/[0.05] hover:text-white">
                                <ExternalLink className="h-3 w-3" /><span>查看许可证</span>
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
          {CATEGORIES.filter(c => booksByCategory(c.id).length > 0).map(cat => {
            const catBooks = booksByCategory(cat.id);
            return (
              <section key={cat.id}>
                <div className="mb-4 flex items-end justify-between">
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight text-white">{cat.label}</h3>
                    <p className="mt-0.5 text-xs text-[var(--color-one-text-dim)]">{cat.description}</p>
                  </div>
                  <button
                    onClick={() => { setActiveCategory(cat.id); setView('category'); }}
                    className="flex cursor-pointer items-center gap-1 text-xs font-medium text-[var(--color-one-accent-soft)] transition hover:text-white"
                  >
                    <span>查看全部</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {catBooks.slice(0, 6).map(book => (
                    <BookCard key={book.id} book={book} onClick={() => openBookDetail(book)} />
                  ))}
                </div>
              </section>
            );
          })}

          {/* Empty state */}
          {!isLoading && books.length === 0 && (
            <div className="rounded-[28px] border border-dashed border-[var(--color-one-border-strong)] bg-white/[0.02] py-20 text-center text-[var(--color-one-text-muted)]">
              <Library className="mx-auto mb-3 h-10 w-10 text-[var(--color-one-text-dim)]" />
              <p className="text-sm font-medium text-white">ONE LIBRARY 正在加载馆藏</p>
              <p className="mt-1 text-xs">使用上方搜索框检索全球公开/开放书籍与文献。</p>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* CATEGORY VIEW                                                        */}
      {/* ===================================================================== */}
      {view === 'category' && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-8 py-8">
          <button onClick={() => setView('home')} className="flex items-center space-x-1 text-xs text-slate-400 hover:text-white mb-6 cursor-pointer">
            <ChevronLeft className="w-4 h-4" />
            <span>返回首页</span>
          </button>
          <div className="flex items-center space-x-2 overflow-x-auto pb-4 mb-6">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  activeCategory === cat.id
                    ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30 border border-amber-400/40'
                    : 'bg-slate-900/60 text-slate-300 border border-slate-800 hover:border-slate-700 hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
            {books.map(book => (
              <BookCard key={book.id} book={book} onClick={() => openBookDetail(book)} />
            ))}
          </div>
          {books.length === 0 && <div className="text-center text-slate-500 py-16">该分类暂无书籍。</div>}
        </div>
      )}

      {/* ===================================================================== */}
      {/* BOOK DETAIL VIEW                                                     */}
      {/* ===================================================================== */}
      {view === 'detail' && selectedBook && (
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-8 py-8">
          <button onClick={() => setView('home')} className="flex items-center space-x-1 text-xs text-slate-400 hover:text-white mb-6 cursor-pointer">
            <ChevronLeft className="w-4 h-4" />
            <span>返回</span>
          </button>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Cover */}
            <div>
              <div className="w-full max-w-xs aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl border border-slate-700/50 bg-slate-900">
                <img
                  src={selectedBook.coverImage || '/assets/library/cover-little-prince.jpg'}
                  alt={selectedBook.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="mt-4 space-y-2">
                {(selectedBook.chapters?.some(c=>c.content?.trim()) || selectedBook.epubUrl || getBookPdfUrl(selectedBook as any) || getBookEmbedUrl(selectedBook as any) || selectedBook.sourceUrl || selectedBook.externalReadUrl) ? (
                  <button
                    onClick={() => openReader(selectedBook)}
                    className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm transition-all cursor-pointer"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>{selectedBook.chapters?.some(c=>c.content?.trim()) || selectedBook.epubUrl || getBookPdfUrl(selectedBook as any) || getBookEmbedUrl(selectedBook as any) ? '立即阅读' : '查看阅读方式'}</span>
                  </button>
                ) : (
                  <div className="w-full text-center text-xs text-slate-400 py-3 rounded-xl bg-slate-900 border border-slate-800">该记录无可用阅读入口（仅元数据或受限）。</div>
                )}
                {readerNotice && view === 'detail' && <p className="text-[11px] text-amber-300 bg-amber-950/30 border border-amber-800/40 rounded-lg p-2 leading-relaxed">{readerNotice}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => isOnShelf(selectedBook.id) ? removeFromShelf(selectedBook.id) : addToShelf(selectedBook, 'want_to_read')}
                    className={`min-h-11 flex items-center justify-center space-x-1.5 px-2 py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      isOnShelf(selectedBook.id)
                        ? 'bg-amber-950/60 text-amber-300 border-amber-500/50'
                        : 'bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    {isOnShelf(selectedBook.id) ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>{isOnShelf(selectedBook.id) ? '已加入书架' : '加入书架'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addToShelf(selectedBook, 'favorite')}
                    className="min-h-11 flex items-center justify-center space-x-1.5 px-2 py-2.5 rounded-xl bg-slate-900 text-slate-200 border border-slate-700 hover:bg-slate-800 text-xs font-semibold transition-all cursor-pointer"
                  >
                    <Heart className="w-3.5 h-3.5 text-red-400" />
                    <span>收藏</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Metadata */}
            <div className="md:col-span-2">
              <p className="text-xs text-amber-400 font-semibold mb-1">{selectedBook.source}</p>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white leading-tight">{selectedBook.title}</h1>
              <p className="text-sm text-slate-300 mt-2">{selectedBook.author}</p>

              {/* Real metadata only — omit fields without data */}
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                {selectedBook.year && <MetaItem label="出版年份" value={selectedBook.year} />}
                {selectedBook.publisher && <MetaItem label="出版社" value={selectedBook.publisher} />}
                {selectedBook.isbn && <MetaItem label="ISBN" value={selectedBook.isbn} />}
                {selectedBook.language && <MetaItem label="语言" value={selectedBook.language.toUpperCase()} />}
                {selectedBook.originalLanguage && <MetaItem label="原始语言" value={selectedBook.originalLanguage} />}
                <MetaItem label="版权/许可" value={selectedBook.rightsClassification === 'PUBLIC_DOMAIN' || selectedBook.copyrightStatus === 'public_domain' ? '公共领域（按来源标注）' : selectedBook.rightsClassification === 'OPEN_LICENSE' || selectedBook.copyrightStatus === 'licensed' ? '开放许可' : selectedBook.rightsClassification === 'OPEN_ACCESS' || selectedBook.copyrightStatus === 'open_access' ? '开放获取（再利用权需看许可）' : selectedBook.rightsClassification === 'COPYRIGHT_RESTRICTED' || selectedBook.copyrightStatus === 'copyrighted' ? '受版权保护' : '状态未确认'} />
                <MetaItem label="章节" value={`${selectedBook.chapters.length} 章`} />
              </div>

              {(selectedBook.rightsNote || safeHttpsUrl(selectedBook.licenseUrl)) && (
                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
                  {selectedBook.rightsNote && <p>来源权利说明：{selectedBook.rightsNote}</p>}
                  {safeHttpsUrl(selectedBook.licenseUrl) && (
                    <a href={safeHttpsUrl(selectedBook.licenseUrl)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1 px-2 py-2 text-amber-300 hover:text-amber-200">
                      <ExternalLink className="w-3 h-3" />查看许可证原文
                    </a>
                  )}
                </div>
              )}

              {/* Description */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-slate-200 mb-2">内容简介</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{selectedBook.description}</p>
              </div>

              {/* Table of contents */}
              {selectedBook.chapters.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-slate-200 mb-2">目录</h3>
                  <ol className="space-y-1 text-xs text-slate-400">
                    {selectedBook.chapters.slice(0, 8).map((ch, i) => (
                      <li key={ch.id} className="flex items-center space-x-2">
                        <span className="text-slate-600">{i + 1}.</span>
                        <span>{ch.title}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Actions */}
              <div className="mt-8 flex flex-wrap gap-3">
                {selectedBook.chapters.some(chapter => chapter.content.trim().length > 0) && (
                  <button
                    type="button"
                    onClick={() => openReader(selectedBook)}
                    className="min-h-11 flex items-center space-x-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-all cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI 解读</span>
                  </button>
                )}
                {(selectedBook.sourceUrl || selectedBook.externalReadUrl) && (
                  <a
                    href={selectedBook.sourceUrl || selectedBook.externalReadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-11 flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
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
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-8 py-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-serif font-bold text-white">我的书架</h2>
            <button type="button" onClick={() => setView('home')} className="min-h-11 px-3 flex items-center space-x-1 rounded-lg text-xs text-slate-400 hover:text-white cursor-pointer">
              <ChevronLeft className="w-4 h-4" />
              <span>返回首页</span>
            </button>
          </div>

          {/* Shelf tabs */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-4 mb-6">
            {SHELF_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setShelfTab(tab.id)}
                className={`min-h-11 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  shelfTab === tab.id
                    ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30'
                    : 'bg-slate-900/60 text-slate-300 border border-slate-800 hover:border-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {shelfBooks.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-[var(--color-one-border-strong)] bg-white/[0.02] py-20 text-center text-[var(--color-one-text-muted)]">
              <BookMarked className="mx-auto mb-3 h-10 w-10 text-[var(--color-one-text-dim)]" />
              <p className="text-sm font-medium text-white">书架还是空的</p>
              <p className="mt-1 text-xs">在「مكتبة النور · 全球书库」搜索全球图书，点击「下载到原文书架」即可直接阅读并使用 AI 逐页讲解与点词查义。</p>
              <button
                type="button"
                onClick={() => setView('noor')}
                className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-[#04140e] transition hover:brightness-110"
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>去全球书库搜索并下载图书</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-5">
              {shelfBooks.map(item => {
                const localPdf = getBookPdfUrl(item.book as any);
                return (
                  <div key={item.id} className="relative flex flex-col">
                    <div className="relative">
                      <BookCard book={item.book} onClick={() => openShelfBook(item.book)} />
                      {localPdf && (
                        <span className="pointer-events-none absolute right-2 top-2 rounded-lg border border-emerald-400/40 bg-[#051a14]/85 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-200 backdrop-blur-sm">
                          PDF 已存
                        </span>
                      )}
                      {item.progress > 0 && (
                        <div className="pointer-events-none absolute inset-x-2 bottom-[3.25rem] h-1 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/10">
                          <div className="h-full rounded-full bg-[var(--color-one-accent)]" style={{ width: `${item.progress}%` }} />
                        </div>
                      )}
                    </div>
                    {localPdf && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openShelfBook(item.book)}
                          className="flex-1 cursor-pointer rounded-lg bg-emerald-500/18 px-2 py-1 text-[11px] font-medium text-emerald-100 transition hover:bg-emerald-500/28"
                        >
                          阅读 PDF
                        </button>
                        <a
                          href={localPdf.includes('?') ? `${localPdf}&download=1` : `${localPdf}?download=1&filename=${encodeURIComponent(item.book.title)}`}
                          download
                          className="rounded-lg border border-white/12 px-2 py-1 text-[11px] text-slate-300 transition hover:bg-white/10 hover:text-white"
                          title="下载到本地设备"
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
          onClose={closeReader}
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
          initialCfi={shelf.find(item => item.bookId === readingEpub.id && item.userId === currentUser?.id)?.lastReadEpubCfi}
          onProgress={(progress, cfi, bookId, ownerId) => { void saveEpubProgress(bookId, progress, cfi, ownerId); }}
          onClose={() => setReadingEpub(null)}
        />
      )}
      {crawlReader && (() => {
        const embed = getBookEmbedUrl(crawlReader);
        return (
          <div role="dialog" aria-modal="true" aria-label="在线阅读" className="fixed inset-0 z-50 flex flex-col bg-[#030712]/98 backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold text-white">{crawlReader.title}</h2>
                <p className="truncate text-[11px] text-slate-400">{crawlReader.author} · {crawlReader.source} · {embed?.label || '官方来源'}</p>
              </div>
              <div className="ml-3 flex shrink-0 items-center gap-2">
                {crawlReader.sourceUrl && (
                  <a href={crawlReader.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-700 px-3 text-[11px] text-slate-300 hover:text-white">
                    <ExternalLink className="h-3.5 w-3.5" /> 官方来源
                  </a>
                )}
                <button type="button" onClick={() => setCrawlReader(null)} aria-label="关闭阅读器" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
              </div>
            </div>
            {embed ? (
              <>
                <iframe
                  src={embed.url}
                  title={crawlReader.title}
                  className="min-h-0 flex-1 border-0 bg-black sm:bg-white"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  {...(/youtube\.com|bilibili\.com|archive\.org/i.test(embed.url)
                    ? {}
                    : { sandbox: 'allow-same-origin allow-scripts allow-popups allow-forms allow-downloads allow-presentation' })}
                />
                <p className="flex items-start gap-1.5 border-t border-slate-800 px-4 py-2 text-[10px] leading-relaxed text-slate-500">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> 通过官方/公开阅读页面或有声精读播放器嵌入显示；若加载空白，请点击“官方来源”打开。
                </p>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-300">
                <p>该来源暂不支持站内嵌入阅读，请使用官方来源打开。</p>
                {crawlReader.sourceUrl && <a href={crawlReader.sourceUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-amber-600 px-4 py-2 text-white">打开官方来源</a>}
              </div>
            )}
          </div>
        );
      })()}
      {webReader && (
        <div role="dialog" aria-modal="true" aria-label="网页原文阅读" className="fixed inset-0 z-50 flex flex-col bg-[#030712]/98 backdrop-blur-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-white">{webReader.title}</h2>
              <p className="truncate text-[11px] text-slate-400">{webReader.label} · 官方/公开来源</p>
            </div>
            <div className="ml-3 flex shrink-0 items-center gap-2">
              {webReader.sourceUrl && (
                <a href={webReader.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-700 px-3 text-[11px] text-slate-300 hover:text-white">
                  <ExternalLink className="h-3.5 w-3.5" /> 官方来源
                </a>
              )}
              <button type="button" onClick={() => setWebReader(null)} aria-label="关闭阅读器" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <iframe
            src={webReader.url}
            title={webReader.title}
            className="min-h-0 flex-1 border-0 bg-black sm:bg-white"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            {...(/youtube\.com|bilibili\.com|archive\.org/i.test(webReader.url)
              ? {}
              : { sandbox: 'allow-same-origin allow-scripts allow-popups allow-forms allow-downloads allow-presentation' })}
          />
          <p className="flex items-start gap-1.5 border-t border-slate-800 px-4 py-2 text-[10px] leading-relaxed text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> 网页/官方阅读页或有声精读按来源站点权限嵌入显示；若加载受限请点击“官方来源”打开。
          </p>
        </div>
      )}
      {pdfReader && (
        <div role="dialog" aria-modal="true" aria-label={pdfReader.title} className="fixed inset-0 z-[70] flex flex-col bg-[#0b0e14]">
          <PdfDocumentViewer
            sourceUrl={pdfReader.url}
            title={pdfReader.title}
            lang={lang}
            originPageUrl={pdfReader.sourceUrl}
            onClose={() => setPdfReader(null)}
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
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl border border-[var(--color-one-border)] bg-white/[0.02] shadow-[var(--shadow-one-sm)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[var(--color-one-border-strong)] group-hover:shadow-[var(--shadow-one-md)]">
        <img
          src={book.coverImage || '/assets/library/cover-little-prince.jpg'}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <h3 className="mt-2.5 line-clamp-2 text-[13px] font-medium leading-snug text-white transition-colors group-hover:text-[var(--color-one-accent-soft)]">
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
    <div className="rounded-2xl border border-[var(--color-one-border)] bg-white/[0.02] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-one-text-dim)]">{label}</div>
      <div className="mt-0.5 text-xs font-medium text-[var(--color-one-text)]">{value}</div>
    </div>
  );
}
