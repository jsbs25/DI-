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
import { PdfDocumentViewer } from '../browser/PdfDocumentViewer.tsx';
import { getBookEmbedUrl, getBookPdfUrl, isRtlLanguage } from './bookEmbedUrl.ts';
import { AdminLibrary } from './AdminLibrary.tsx';
import { filterLibrarySearchResults, getLibrarySearchFilterOptions, LIBRARY_RIGHTS_FILTER_LABELS } from './searchFilters.ts';

interface DigitalLibraryProps {
  lang: Language;
  currentUser?: { id: string } | null;
  /** When set, opens the detail view for a specific book (cross-module navigation). */
  focusBookId?: string | null;
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

export const DigitalLibrary: React.FC<DigitalLibraryProps> = ({ lang, currentUser, focusBookId }) => {
  // ---- View routing ----
  const [view, setView] = useState<'home' | 'category' | 'detail' | 'shelf' | 'admin'>('home');
  const [activeCategory, setActiveCategory] = useState<string>('all');

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

  // Cross-module navigation: when a book id is provided from another module
  // (e.g. Knowledge Universe), load that book and open its detail view.
  useEffect(() => {
    if (!focusBookId) return;
    let cancelled = false;
    fetch(`/api/library/books/${focusBookId}`)
      .then(r => r.json())
      .then(d => {
        if (!cancelled && d.success && d.book) {
          setSelectedBook(d.book);
          setView('detail');
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [focusBookId]);

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
        setCrawlResults([]);
        setIngestingId(null);
        setSelectedBook(data.book);
        setView('detail');
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
        setOnlineResults([]);
        setIngestingId(null);
        setSelectedBook(data.book);
        setView('detail');
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
    <div className="flex min-h-[calc(100vh-4rem)] flex-1 flex-col bg-[var(--color-one-bg)] text-[var(--color-one-text)]">
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

          <nav className="grid grid-cols-3 gap-2 md:hidden" aria-label="ONE LIBRARY 导航">
            {[
              { id: 'home', label: '首页' },
              { id: 'shelf', label: '我的书架' },
              { id: 'admin', label: '管理' }
            ].map(n => (
              <button
                key={n.id}
                type="button"
                onClick={() => setView(n.id as any)}
                aria-current={view === n.id ? 'page' : undefined}
                className={`min-h-11 rounded-xl px-3 text-sm font-medium transition-colors cursor-pointer ${view === n.id ? 'bg-[var(--color-one-accent)] text-[#071018]' : 'border border-[var(--color-one-border)] bg-white/[0.02] text-[var(--color-one-text-muted)] hover:bg-white/[0.05] hover:text-white'}`}
              >
                {n.label}
              </button>
            ))}
          </nav>

          <nav className="hidden items-center gap-1 rounded-2xl border border-[var(--color-one-border)] bg-white/[0.02] p-1 text-xs font-medium md:flex">
            {[
              { id: 'home', label: '首页' },
              { id: 'shelf', label: '我的书架' },
              { id: 'admin', label: '管理' }
            ].map(n => (
              <button
                key={n.id}
                onClick={() => setView(n.id as any)}
                className={`rounded-xl px-3 py-2 transition-colors cursor-pointer ${view === n.id ? 'bg-white/[0.08] text-white' : 'text-[var(--color-one-text-muted)] hover:bg-white/[0.04] hover:text-white'}`}
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
                  <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[var(--color-one-text-dim)]">阿拉伯语馆藏官方入口 · 仅跳转，不复制全文</p>
                  <div className="flex flex-wrap gap-2">
                    <a href="https://waqfeya.net/books" target="_blank" rel="noopener noreferrer" title="Waqfeya 官方扫描书目录" className="inline-flex min-h-11 items-center rounded-xl border border-[var(--color-one-border)] bg-white/[0.02] px-3 py-2 text-[11px] text-[var(--color-one-text-muted)] hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.05] hover:text-white">Waqfeya</a>
                    <a href="https://shamela.ws/search" target="_blank" rel="noopener noreferrer" title="Shamela 官方站内搜索" className="inline-flex min-h-11 items-center rounded-xl border border-[var(--color-one-border)] bg-white/[0.02] px-3 py-2 text-[11px] text-[var(--color-one-text-muted)] hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.05] hover:text-white">Shamela</a>
                    <a href="https://www.qdl.qa/en/search/site/" target="_blank" rel="noopener noreferrer" title="Qatar Digital Library 官方档案搜索" className="inline-flex min-h-11 items-center rounded-xl border border-[var(--color-one-border)] bg-white/[0.02] px-3 py-2 text-[11px] text-[var(--color-one-text-muted)] hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.05] hover:text-white">Qatar Digital Library</a>
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
                      src={featuredBook.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80'}
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

          {/* Saturn-style open book crawl results */}
          {(crawlResults.length > 0 || isCrawling) && (
            <section aria-labelledby="library-crawl-results-title" aria-busy={isCrawling} className="rounded-[28px] border border-[var(--color-one-border)] bg-white/[0.03] p-5 shadow-[var(--shadow-one-sm)]">
              <h3 id="library-crawl-results-title" className="mb-1 text-sm font-semibold text-white">开放图书爬取 / 多源检索结果</h3>
              <p className="mb-3 text-[11px] leading-relaxed text-[var(--color-one-text-muted)]">并行检索 Gutenberg、Open Library、Internet Archive、Wikisource 等公开/开放来源；仅展示元数据与官方链接，不抓取受版权保护内容。</p>
              {crawlSources.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {crawlSources.map((src: any) => (
                    <span key={src.source} className={`rounded-md border px-2 py-1 text-[10px] ${src.ok ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200' : 'border-[var(--color-one-border)] text-[var(--color-one-text-dim)]'}`}>
                      {src.source}: {src.ok ? `可用 ${src.count}` : '失败/超时'}
                    </span>
                  ))}
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
                            <button type="button" onClick={() => { const pdf=getBookPdfUrl(r); if(pdf){setPdfReader({url:pdf,title:r.title,sourceUrl:r.sourceUrl}); return;} if(embedInfo){setWebReader({url:embedInfo.url,title:r.title,sourceUrl:r.sourceUrl,label:embedInfo.label}); return;} setReaderNotice(getOnlineReaderReason(r)); if(r.sourceUrl) window.open(r.sourceUrl,'_blank','noopener,noreferrer'); }} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px] font-medium text-emerald-100 transition hover:bg-emerald-500/15">
                              <BookOpen className="h-3 w-3" /><span>在线阅读</span>
                            </button>
                          )}
                          {r.canReadOnline === false && !embedInfo && !getBookPdfUrl(r) && (
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
                      openlibrary: 'Open Library', gutenberg: 'Project Gutenberg', googlebooks: 'Google Books', europeana: 'Europeana', archive: 'Internet Archive', wikisource: 'Wikisource', ar_wikisource: '阿拉伯语维基文库', openalex: 'OpenAlex', crossref: 'Crossref', arxiv: 'arXiv', europepmc: 'Europe PMC', pmc: 'PubMed Central', pubmed: 'PubMed', shamela: 'Shamela'
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
                  src={selectedBook.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80'}
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
              <p className="mt-1 text-xs">在书籍详情页点击「加入书架」即可收藏。</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-5">
              {shelfBooks.map(item => (
                <div key={item.id} className="relative">
                  <BookCard book={item.book} onClick={() => openShelfBook(item.book)} />
                  {item.progress > 0 && (
                    <div className="pointer-events-none absolute inset-x-2 bottom-[3.25rem] h-1 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/10">
                      <div className="h-full rounded-full bg-[var(--color-one-accent)]" style={{ width: `${item.progress}%` }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* ADMIN VIEW                                                           */}
      {/* ===================================================================== */}
      {view === 'admin' && <AdminLibrary onBack={() => setView('home')} />}

      {/* ===================================================================== */}
      {/* READER MODAL                                                         */}
      {/* ===================================================================== */}
      {readingBook && activeChapter && (
        <div ref={readerDialogRef} role="dialog" aria-modal="true" aria-labelledby="library-reader-title" tabIndex={-1} onKeyDown={handleReaderDialogKeyDown} className="fixed inset-0 z-50 bg-[#030712]/98 backdrop-blur-2xl flex flex-col animate-in fade-in duration-200 focus:outline-none">
          {/* Reader header */}
          <header className="min-h-16 border-b border-slate-800 px-3 sm:px-6 flex flex-col md:flex-row md:items-center md:justify-between gap-2 py-2 select-none bg-[#02050f]/80 shrink-0">
            <div className="flex w-full md:w-auto min-w-0 items-center justify-between gap-2">
              <div className="flex items-center space-x-3 min-w-0">
              <button
                type="button"
                onClick={closeReader}
                aria-label="关闭阅读器"
                className="min-h-11 min-w-11 flex items-center justify-center space-x-1 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">返回</span>
              </button>
              <div className="min-w-0">
                <h2 id="library-reader-title" className="text-sm font-serif font-bold text-white line-clamp-1">{readingBook.title}</h2>
                <span className="text-[11px] text-amber-400">{readingBook.author}</span>
              </div>
              </div>
              <div className="flex md:hidden items-center gap-1 shrink-0">
                <button type="button" onClick={handleReadAloud} aria-label={isSpeaking ? '停止朗读' : '朗读本章'} title={isSpeaking ? '停止朗读' : '朗读本章'} className={`min-h-11 min-w-11 flex items-center justify-center rounded-xl text-xs font-semibold border transition-all cursor-pointer ${isSpeaking ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'}`}>
                  {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                </button>
                <button type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? '退出全屏' : '全屏'} title={isFullscreen ? '退出全屏' : '全屏'} className="min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white cursor-pointer">
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="hidden md:flex items-center space-x-2">
              {/* Read aloud */}
              <button
                type="button"
                onClick={handleReadAloud}
                aria-label={isSpeaking ? '停止朗读' : '朗读本章'}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  isSpeaking ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
                <span className="hidden sm:inline">{isSpeaking ? '停止' : '诵读'}</span>
              </button>

              {/* Font size */}
              <div role="group" aria-label="字体大小" className="flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-xl px-2 py-1">
                <button type="button" aria-label="缩小字体" onClick={() => setFontSize(Math.max(14, fontSize - 2))} className="px-1.5 text-xs text-slate-400 hover:text-white cursor-pointer">A-</button>
                <span className="text-[10px] font-mono text-slate-300">{fontSize}</span>
                <button type="button" aria-label="增大字体" onClick={() => setFontSize(Math.min(30, fontSize + 2))} className="px-1.5 text-xs text-slate-400 hover:text-white cursor-pointer">A+</button>
              </div>

              {/* Line height */}
              <div role="group" aria-label="行距" className="flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-xl px-2 py-1">
                <button type="button" aria-label="减小行距" onClick={() => setLineHeight(Math.max(1.4, lineHeight - 0.2))} className="px-1.5 text-xs text-slate-400 hover:text-white cursor-pointer">行距-</button>
                <button type="button" aria-label="增大行距" onClick={() => setLineHeight(Math.min(2.6, lineHeight + 0.2))} className="px-1.5 text-xs text-slate-400 hover:text-white cursor-pointer">行距+</button>
              </div>

              {/* Theme */}
              <div role="group" aria-label="阅读主题" className="flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
                <button type="button" onClick={() => setReaderTheme('sepia')} aria-label="纸张背景" aria-pressed={readerTheme === 'sepia'} className={`p-1 rounded-lg cursor-pointer ${readerTheme === 'sepia' ? 'bg-amber-950 text-amber-300' : 'text-slate-400'}`} title="纸张"><Sun className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => setReaderTheme('dark')} aria-label="夜间背景" aria-pressed={readerTheme === 'dark'} className={`p-1 rounded-lg cursor-pointer ${readerTheme === 'dark' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400'}`} title="夜间"><Moon className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => setReaderTheme('focus')} aria-label="专注模式" aria-pressed={readerTheme === 'focus'} className={`p-1 rounded-lg cursor-pointer ${readerTheme === 'focus' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400'}`} title="专注"><Menu className="w-3.5 h-3.5" /></button>
              </div>

              {/* Bookmark */}
              <button type="button" onClick={async()=>{ if(!readingBook) return; const ch=readingBook.chapters[activeChapterIndex]; try{ const res=await fetch(`/api/library/books/${readingBook.id}/annotations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chapterId:ch?.id||'ch1',selectedText:`书签：${ch?.title||''}`,note:`阅读进度书签（第 ${activeChapterIndex+1}/${readingBook.chapters.length} 章）`})}); const data=await res.json(); if(data.success&&data.annotation){setAnnotations(p=>[data.annotation,...p]); setIsAnnotationDrawerOpen(true);} }catch{} }} aria-label="添加书签" className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-amber-300 cursor-pointer" title="添加书签">
                <Bookmark className="w-3.5 h-3.5" />
              </button>
              {/* Fullscreen */}
              <button type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? '退出全屏' : '全屏'} className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white cursor-pointer" title={isFullscreen ? '退出全屏' : '全屏'}>
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex md:hidden w-full flex-wrap items-center gap-1.5" role="group" aria-label="阅读设置">
              <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-xl px-1 py-1" role="group" aria-label="字体大小">
                <button type="button" aria-label="缩小字体" onClick={() => setFontSize(Math.max(14, fontSize - 2))} className="min-h-11 min-w-11 rounded-lg text-xs text-slate-300 hover:text-white cursor-pointer">A-</button>
                <span className="text-[10px] font-mono text-slate-300">{fontSize}</span>
                <button type="button" aria-label="增大字体" onClick={() => setFontSize(Math.min(30, fontSize + 2))} className="min-h-11 min-w-11 rounded-lg text-xs text-slate-300 hover:text-white cursor-pointer">A+</button>
              </div>
              <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-xl px-1 py-1" role="group" aria-label="行距">
                <button type="button" aria-label="减小行距" onClick={() => setLineHeight(Math.max(1.4, lineHeight - 0.2))} className="min-h-11 min-w-11 rounded-lg text-[11px] text-slate-300 hover:text-white cursor-pointer">行距-</button>
                <button type="button" aria-label="增大行距" onClick={() => setLineHeight(Math.min(2.6, lineHeight + 0.2))} className="min-h-11 min-w-11 rounded-lg text-[11px] text-slate-300 hover:text-white cursor-pointer">行距+</button>
              </div>
              <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-xl p-1" role="group" aria-label="阅读主题">
                <button type="button" onClick={() => setReaderTheme('sepia')} aria-label="纸张背景" aria-pressed={readerTheme === 'sepia'} className={`min-h-11 min-w-11 rounded-lg cursor-pointer ${readerTheme === 'sepia' ? 'bg-amber-950 text-amber-300' : 'text-slate-400'}`} title="纸张"><Sun className="w-4 h-4 mx-auto" /></button>
                <button type="button" onClick={() => setReaderTheme('dark')} aria-label="夜间背景" aria-pressed={readerTheme === 'dark'} className={`min-h-11 min-w-11 rounded-lg cursor-pointer ${readerTheme === 'dark' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400'}`} title="夜间"><Moon className="w-4 h-4 mx-auto" /></button>
                <button type="button" onClick={() => setReaderTheme('focus')} aria-label="专注模式" aria-pressed={readerTheme === 'focus'} className={`min-h-11 min-w-11 rounded-lg cursor-pointer ${readerTheme === 'focus' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400'}`} title="专注"><Menu className="w-4 h-4 mx-auto" /></button>
              </div>
              <button type="button" onClick={async()=>{ if(!readingBook) return; const ch=readingBook.chapters[activeChapterIndex]; try{ const res=await fetch(`/api/library/books/${readingBook.id}/annotations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chapterId:ch?.id||'ch1',selectedText:`书签：${ch?.title||''}`,note:`阅读进度书签（第 ${activeChapterIndex+1}/${readingBook.chapters.length} 章）`})}); const data=await res.json(); if(data.success&&data.annotation){setAnnotations(p=>[data.annotation,...p]); setIsAnnotationDrawerOpen(true);} }catch{} }} aria-label="添加书签" className="min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-amber-300 cursor-pointer" title="添加书签"><Bookmark className="w-4 h-4" /></button>
            </div>
          </header>

          {/* Reader body */}
          <div className="flex-1 flex overflow-hidden">
            {/* TOC (hidden in focus mode) */}
            {readerTheme !== 'focus' && (
              <aside className="w-56 border-r border-slate-800 bg-[#060c20]/60 hidden md:flex flex-col p-4 select-none shrink-0">
                <span className="text-xs font-semibold text-slate-400 mb-3 px-2">目录</span>
                <div className="space-y-1 overflow-y-auto">
                  {readingBook.chapters.map((ch, idx) => (
                    <button
                      key={ch.id}
                      onClick={() => { setActiveChapterIndex(idx); setSelectedText(''); setAiExplanation(null); setAiCitation(null); setAiReadingNotice(null); setAiAnswerReady(false); setAiNoteSaved(false); setAiSaveMessage(null); }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                        activeChapterIndex === idx ? 'bg-amber-950/80 text-amber-300 border border-amber-600/50' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                      }`}
                    >
                      {ch.title}
                    </button>
                  ))}
                </div>
              </aside>
            )}

            {/* Main reading canvas */}
            <main
              onPointerUp={handleTextSelection}
              dir={isRtlLanguage(readingBook.language) ? 'rtl' : 'ltr'}
              lang={readingBook.language || undefined}
              className={`flex-1 overflow-y-auto p-6 sm:p-12 lg:px-24 flex justify-center transition-colors ${readerBg}`}
            >
              <div className="max-w-3xl w-full">
                <div className="mb-10 pb-6 border-b border-slate-700/50">
                  <span className="text-xs text-amber-400 font-mono tracking-wider uppercase block mb-1">
                    {activeChapterIndex + 1} / {readingBook.chapters.length}
                  </span>
                  <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight">{activeChapter.title}</h1>
                </div>

                <div className="font-serif leading-relaxed space-y-6" style={{ fontSize: `${fontSize}px`, ...readerLineHeight }}>
                  {activeChapter.content.split('\n\n').map((para, i) => (
                    <p key={i} className="text-justify">{para}</p>
                  ))}
                </div>

                {/* Chapter navigation */}
                <div className="mt-16 pt-8 border-t border-slate-700/50 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    disabled={activeChapterIndex === 0}
                    onClick={() => { setActiveChapterIndex(prev => Math.max(0, prev - 1)); }}
                    className="min-h-11 px-3 flex items-center space-x-1 hover:text-white disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>上一章</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => saveProgress(Math.round(((activeChapterIndex + 1) / readingBook.chapters.length) * 100))}
                    className="min-h-11 px-3 text-amber-400 hover:text-amber-300 cursor-pointer"
                  >
                    保存进度
                  </button>
                  <button
                    type="button"
                    disabled={activeChapterIndex === readingBook.chapters.length - 1}
                    onClick={() => setActiveChapterIndex(prev => Math.min(readingBook.chapters.length - 1, prev + 1))}
                    className="min-h-11 px-3 flex items-center space-x-1 hover:text-white disabled:opacity-30 cursor-pointer"
                  >
                    <span>下一章</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </main>

            {/* Selection AI sidebar */}
            {(selectedText || isAnnotationDrawerOpen) && readerTheme !== 'focus' && (
              <aside aria-label={selectedText ? 'AI 智能阅读与批注' : '批注'} className="fixed inset-x-0 top-[35vh] bottom-0 z-[60] border-t border-slate-800 bg-[#060c22] flex flex-col p-4 overflow-y-auto rounded-t-2xl shadow-2xl md:relative md:inset-auto md:z-auto md:top-auto md:right-auto md:bottom-auto md:left-auto md:w-80 lg:w-96 md:rounded-none md:shadow-none md:border-t-0 md:border-l shrink-0">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="font-semibold text-xs text-white">{selectedText ? 'AI 智能阅读' : '批注'}</span>
                  </div>
                  <button type="button" aria-label="关闭批注面板" onClick={() => { setSelectedText(''); setIsAnnotationDrawerOpen(false); setAiExplanation(null); setAiCitation(null); setAiReadingNotice(null); setAiAnswerReady(false); setAiNoteSaved(false); setAiSaveMessage(null); window.requestAnimationFrame(() => readerDialogRef.current?.focus()); }} className="min-h-11 min-w-11 flex items-center justify-center rounded-lg text-slate-400 hover:text-white cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {selectedText && (
                  <div className="space-y-4 mb-6">
                    <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 text-xs italic text-amber-200">
                      "{selectedText}"
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={handleReadSelection} className="flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs cursor-pointer">
                        <Volume2 className="w-3.5 h-3.5" /><span>朗读</span>
                      </button>
                      <button onClick={handleExplainSelection} disabled={isAiExplaining} className="flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold text-xs cursor-pointer">
                        <Sparkles className="w-3.5 h-3.5" /><span>{isAiExplaining ? '解读中...' : 'AI 解读'}</span>
                      </button>
                    </div>

                    {aiExplanation && (
                      <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl text-xs leading-relaxed text-slate-300 whitespace-pre-line">
                        <div className="font-semibold text-amber-400 mb-2 flex items-center space-x-1">
                          <Sparkles className="w-3.5 h-3.5" /><span>AI 解读:</span>
                        </div>
                        {aiExplanation}
                      </div>
                    )}

                    {aiCitation && (
                      <div className="bg-slate-950/70 border border-amber-700/40 p-3 rounded-xl text-[11px] leading-relaxed text-slate-300">
                        <div className="font-semibold text-amber-300 mb-1">可核查引用</div>
                        <div>《{aiCitation.title}》— {aiCitation.author}</div>
                        <div>版本：{aiCitation.version}</div>
                        <div>定位：{aiCitation.location}</div>
                        <a href={safeHttpsUrl(aiCitation.sourceUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-1 text-cyan-300 hover:text-cyan-200">
                          核查原始来源 <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                    {aiReadingNotice && <p className="text-[10px] leading-relaxed text-slate-400">{aiReadingNotice}</p>}

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">笔记:</label>
                      <textarea
                        rows={3}
                        value={annotationNote}
                        onChange={e => setAnnotationNote(e.target.value)}
                        placeholder="记录你的思考..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                      />
                      <button onClick={handleSaveAnnotation} disabled={aiNoteSaved} className="mt-2 w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-medium cursor-pointer">
                        {aiNoteSaved ? '已保存为私有知识笔记' : aiCitation && aiAnswerReady ? '保存为私有知识笔记' : '保存批注'}
                      </button>
                      {aiSaveMessage && <p className="mt-2 text-[10px] text-amber-300">{aiSaveMessage}</p>}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">批注 ({annotations.length})</span>
                  {annotations.length === 0 ? (
                    <div className="text-center text-slate-500 py-8 text-xs">划选正文即可 AI 解读并保存批注。</div>
                  ) : (
                    annotations.map(a => (
                      <div key={a.id} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5">
                        <p className="text-xs italic text-amber-300 font-serif">"{a.selectedText}"</p>
                        {a.note && <p className="text-xs text-slate-200">笔记: {a.note}</p>}
                        {a.aiExplanation && <p className="text-[11px] text-slate-400 bg-slate-950/50 p-2 rounded-lg line-clamp-3">AI: {a.aiExplanation}</p>}
                        {a.citation && (
                          <a href={safeHttpsUrl(a.citation.sourceUrl)} target="_blank" rel="noreferrer" className="block text-[10px] text-cyan-300 hover:text-cyan-200">
                            《{a.citation.title}》· {a.citation.version} · {a.citation.location} <ExternalLink className="inline w-3 h-3" />
                          </a>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </aside>
            )}
          </div>
        </div>
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
                  className="min-h-0 flex-1 border-0 bg-white"
                  referrerPolicy="strict-origin-when-cross-origin"
                  sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads"
                />
                <p className="flex items-start gap-1.5 border-t border-slate-800 px-4 py-2 text-[10px] leading-relaxed text-slate-500">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> 通过官方/公开阅读页面嵌入显示；内容版权、可用性与是否允许嵌入由来源站点控制。若空白或受限，请点击“官方来源”打开。网页嵌入阅读暂不支持精确进度保存与站内批注。
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
          <iframe src={webReader.url} title={webReader.title} className="min-h-0 flex-1 border-0 bg-white" referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads" />
          <p className="flex items-start gap-1.5 border-t border-slate-800 px-4 py-2 text-[10px] leading-relaxed text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> 网页/官方阅读页按来源站点权限嵌入显示；若被站点禁止嵌入或需登录/付费/借阅，将无法在站内加载，请使用“官方来源”打开。嵌入网页阅读不支持跨站精确进度、书签与批注保存。
          </p>
        </div>
      )}
      {pdfReader && (
        <div role="dialog" aria-modal="true" aria-label="PDF 在线阅读" className="fixed inset-0 z-50 flex flex-col bg-[#030712]/98 backdrop-blur-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-white">{pdfReader.title}</h2>
              <p className="truncate text-[11px] text-slate-400">PDF 在线阅读（来源站点权限/CORS 可能影响加载）</p>
            </div>
            <div className="ml-3 flex shrink-0 items-center gap-2">
              {pdfReader.sourceUrl && (
                <a href={pdfReader.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-700 px-3 text-[11px] text-slate-300 hover:text-white">
                  <ExternalLink className="h-3.5 w-3.5" /> 官方来源
                </a>
              )}
              <button type="button" onClick={() => setPdfReader(null)} aria-label="关闭阅读器" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <PdfDocumentViewer sourceUrl={pdfReader.url} title={pdfReader.title} lang={lang} />
            <p className="mx-auto mt-3 max-w-5xl text-[10px] text-slate-500">PDF 阅读进度/书签暂不自动保存到书架（受跨来源文件与客户端渲染限制）；如需持续阅读请在来源页面或保存后使用支持的阅读器。</p>
          </div>
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
          src={book.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80'}
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
