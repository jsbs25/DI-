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
import { AdminLibrary } from './AdminLibrary.tsx';

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
  const token = localStorage.getItem('earth_one_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
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
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [ingestingId, setIngestingId] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

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

  // =========================================================================
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
  const handleOnlineSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearchingOnline(true);
    setIngestError(null);
    setOnlineResults([]);
    setOnlineSourceStatuses([]);
    try {
      const res = await fetch(`/api/library/search?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = await res.json();
      if (data.success && data.results) {
        setOnlineResults(data.results);
        setOnlineSourceStatuses(Array.isArray(data.sources) ? data.sources : []);
        if (data.results.length === 0) {
          setIngestError('未找到匹配的全球馆藏，请尝试其他书名、作者、ISBN 或 DOI。');
        }
      } else {
        setIngestError(data.error || '在线搜索失败，请稍后重试。');
      }
    } catch (err: any) {
      setIngestError(`搜索异常: ${err.message}`);
    } finally {
      setIsSearchingOnline(false);
    }
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
  const openReader = (book: Book) => {
    // EPUB books use the epub.js reader; text books use the chapter reader
    if (book.epubUrl) {
      setReadingEpub(book);
      return;
    }
    readerReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const shelfItem = shelf.find(item => item.bookId === book.id);
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
    openReader(full || book);
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
    if (!readingBook || !selectedText) return;
    const currentChapter = readingBook.chapters[activeChapterIndex];
    const saveAiKnowledgeNote = !!(aiCitation && aiExplanation && aiAnswerReady && !aiNoteSaved);
    const token = localStorage.getItem('earth_one_token');
    if (saveAiKnowledgeNote && !token) {
      setAiSaveMessage('登录后才能将带来源的 AI 解读保存为仅自己可见的知识笔记；当前解读尚未保存。');
      return;
    }
    try {
      const res = await fetch(saveAiKnowledgeNote
        ? `/api/library/books/${readingBook.id}/knowledge-notes`
        : `/api/library/books/${readingBook.id}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(saveAiKnowledgeNote ? libraryAuthHeaders() : {}) },
        body: JSON.stringify({
          chapterId: currentChapter?.id || 'ch1',
          selectedText,
          note: annotationNote,
          aiExplanation: aiExplanation || undefined
        })
      });
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
    if (!chapter || !shelf.some(item => item.bookId === book.id)) return;
    const progress = requestedProgress ?? Math.min(99, Math.round(((chapterIndex + 1) / book.chapters.length) * 100));
    try {
      const res = await fetch(`/api/library/shelf/${encodeURIComponent(book.id)}/reading-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...libraryAuthHeaders() },
        body: JSON.stringify({ chapterId: chapter.id, progress })
      });
      const data = await res.json();
      if (data.success && data.item) {
        setShelf(prev => prev.map(item => item.bookId === book.id
          ? { ...data.item, book: item.book }
          : item));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const saveEpubProgress = async (bookId: string, progress: number, cfi: string, ownerId?: string) => {
    if (!ownerId || currentUser?.id !== ownerId || !shelf.some(item => item.bookId === bookId && item.userId === ownerId)) return;
    try {
      const res = await fetch(`/api/library/shelf/${encodeURIComponent(bookId)}/epub-reading-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...libraryAuthHeaders() },
        body: JSON.stringify({ progress, cfi, ownerId })
      });
      const data = await res.json();
      if (data.success && data.item) {
        setShelf(prev => prev.map(item => item.bookId === bookId
          ? { ...data.item, book: item.book }
          : item));
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
    if (!readingBook) return;
    const chapter = readingBook.chapters[activeChapterIndex];
    try {
      if (chapter) {
        await saveShelfReadingState(readingBook, activeChapterIndex, progress);
      }
      await fetch(`/api/library/books/${readingBook.id}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress })
      });
    } catch (e) {
      console.error(e);
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
    <div className="flex-1 flex flex-col bg-[#030713] text-slate-100 min-h-[calc(100vh-4rem)]">
      {/* ===================================================================== */}
      {/* WORLD LIBRARY TOP BRAND BAR                                          */}
      {/* ===================================================================== */}
      <header className="sticky top-16 z-30 bg-[#030713]/90 backdrop-blur-xl border-b border-slate-800/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-amber-950/80 border border-amber-500/40 text-amber-400">
              <Library className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-white tracking-wide leading-tight">
                WORLD LIBRARY
              </h1>
              <p className="text-[11px] text-slate-400 tracking-wide">
                A World of Knowledge · One Library for Humanity
              </p>
            </div>
          </div>

          <nav className="grid grid-cols-3 gap-2 md:hidden" aria-label="WORLD LIBRARY 导航">
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
                className={`min-h-11 px-3 rounded-lg transition-colors cursor-pointer ${
                  view === n.id ? 'bg-amber-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                {n.label}
              </button>
            ))}
          </nav>

          <nav className="hidden md:flex items-center space-x-1 text-xs font-medium">
            {[
              { id: 'home', label: '首页' },
              { id: 'shelf', label: '我的书架' },
              { id: 'admin', label: '管理' }
            ].map(n => (
              <button
                key={n.id}
                onClick={() => setView(n.id as any)}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  view === n.id ? 'bg-amber-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                {n.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* ===================================================================== */}
      {/* HOME VIEW                                                            */}
      {/* ===================================================================== */}
      {view === 'home' && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-8 py-8 space-y-12">
          {/* Hero */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center py-6">
            <div>
              <h2 className="text-3xl sm:text-5xl font-serif font-bold text-white leading-tight">
                一个世界，无数思想。
              </h2>
              <p className="mt-4 text-sm sm:text-base text-slate-300 max-w-xl leading-relaxed">
                探索人类积累的知识、文明、历史与思想。全球公版书籍、中文经典与阿拉伯语文献，在同一个空间相遇。
              </p>

              {/* Global search */}
              <div className="mt-8">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <label htmlFor="world-library-search" className="sr-only">搜索全球馆藏</label>
                  <input
                    id="world-library-search"
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleOnlineSearch()}
                    placeholder="搜索书名、作者、主题、语言..."
                    aria-describedby="world-library-search-help"
                    className="w-full bg-slate-900/80 border border-slate-700/80 rounded-2xl pl-11 pr-4 py-3.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-all shadow-inner"
                  />
                </div>
                <div className="mt-3 flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={handleOnlineSearch}
                    disabled={isSearchingOnline || !searchQuery.trim()}
                    className="inline-flex min-h-11 items-center space-x-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold transition-all cursor-pointer"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>{isSearchingOnline ? '正在检索全球书库...' : '搜索全球馆藏'}</span>
                  </button>
                  <span id="world-library-search-help" className="text-[11px] text-slate-500">支持书名、作者、ISBN、DOI 与多语言检索；OpenAlex 作者可用 author:姓名，机构可用 institution:名称</span>
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">阿拉伯语馆藏官方入口 · 仅跳转，不复制全文</p>
                  <div className="flex flex-wrap gap-2">
                    <a href="https://waqfeya.net/books" target="_blank" rel="noopener noreferrer" title="Waqfeya 官方扫描书目录" className="inline-flex min-h-11 items-center rounded-lg border border-slate-700 px-3 py-2 text-[11px] text-slate-300 hover:border-amber-500/60 hover:text-white">Waqfeya</a>
                    <a href="https://shamela.ws/search" target="_blank" rel="noopener noreferrer" title="Shamela 官方站内搜索" className="inline-flex min-h-11 items-center rounded-lg border border-slate-700 px-3 py-2 text-[11px] text-slate-300 hover:border-amber-500/60 hover:text-white">Shamela</a>
                    <a href="https://www.qdl.qa/en/search/site/" target="_blank" rel="noopener noreferrer" title="Qatar Digital Library 官方档案搜索" className="inline-flex min-h-11 items-center rounded-lg border border-slate-700 px-3 py-2 text-[11px] text-slate-300 hover:border-amber-500/60 hover:text-white">Qatar Digital Library</a>
                  </div>
                </div>
              </div>
            </div>

            {/* Featured real book */}
            {featuredBook && (
              <button
                type="button"
                onClick={() => openBookDetail(featuredBook)}
                aria-label={`查看《${featuredBook.title}》详情`}
                className="flex justify-center lg:justify-end cursor-pointer group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 rounded-2xl"
              >
                <div className="relative">
                  <div className="w-48 sm:w-56 aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl shadow-amber-900/30 border border-slate-700/50 group-hover:scale-[1.02] transition-transform duration-300">
                    <img
                      src={featuredBook.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80'}
                      alt={featuredBook.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-amber-400">编辑精选</p>
                    <h3 className="text-sm font-serif font-bold text-white mt-1 group-hover:text-amber-300 transition-colors">
                      {featuredBook.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">{featuredBook.author}</p>
                  </div>
                </div>
              </button>
            )}
          </section>

          {/* Online search results */}
          {(onlineResults.length > 0 || isSearchingOnline || ingestError) && (
            <section aria-labelledby="library-online-results-title" aria-busy={isSearchingOnline} className="p-5 rounded-2xl bg-slate-900/50 border border-amber-600/30">
              <h3 id="library-online-results-title" className="text-sm font-semibold text-amber-300 mb-3">全球检索结果</h3>
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
              {isSearchingOnline ? (
                <div role="status" aria-live="polite" className="text-xs text-slate-400 py-4 text-center">正在查询全球图书馆与开放资源...</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {onlineResults.map(r => {
                    const canImport = r.canImport === true;
                    const sourceName = r.sourceName || ({
                      openlibrary: 'Open Library',
                      gutenberg: 'Project Gutenberg',
                      googlebooks: 'Google Books',
                      europeana: 'Europeana',
                      archive: 'Internet Archive',
                      wikisource: 'Wikisource',
                      ar_wikisource: '阿拉伯语维基文库',
                      openalex: 'OpenAlex',
                      crossref: 'Crossref',
                      arxiv: 'arXiv',
                      europepmc: 'Europe PMC',
                      pmc: 'PubMed Central',
                      pubmed: 'PubMed',
                      shamela: 'Shamela'
                    } as Record<string, string>)[r.source] || r.source;
                    const resourceType = typeof r.metadata?.resourceType === 'string' ? r.metadata.resourceType : undefined;
                    const identifierLabel = r.doi ? `DOI ${r.doi}` : r.isbn?.length ? `ISBN ${r.isbn[0]}` : r.identifier ? `ID ${r.identifier}` : undefined;
                    const availabilityLabel = ({
                      'official-source-only': '仅官方来源页面',
                      'licensed-thumbnail-and-official-source': '官方页面；许可缩略图',
                      'provider-preview': '提供方预览',
                      'provider-full-view': '提供方页面阅读',
                      'open-access-link': '开放获取入口（官方来源）',
                      'provider-download': '提供方访问入口',
                      'metadata-only': '仅元数据',
                      'access-unknown': '访问状态未知',
                      'verify-official-opds': '需官方目录核验'
                    } as Record<string, string>)[r.availability || ''] || '官方来源访问';
                    const downloadLabel = (r.downloadLinks?.length || 0) > 0 ? `来源链接 ${r.downloadLinks!.length} 个（遵循许可）` : '无已核验下载入口';
                    const rightsLabel = ({
                      PUBLIC_DOMAIN: '公共领域（依来源声明）',
                      OPEN_LICENSE: '开放许可',
                      OPEN_ACCESS: '开放获取',
                      BORROWABLE: '需经来源借阅',
                      PREVIEW_ONLY: '仅预览',
                      METADATA_ONLY: '仅元数据',
                      COPYRIGHT_RESTRICTED: '受版权限制',
                      UNKNOWN: '权利状态未知'
                    } as Record<string, string>)[r.rightsClassification || 'UNKNOWN'] || '权利状态未知';
                    const licenseUrl = safeHttpsUrl(r.licenseUrl);
                    const providerFullTextUrl = safeHttpsUrl(r.providerFullTextUrl);
                    return (
                      <div key={r.id} className="flex items-start space-x-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-amber-500/50 transition-all">
                        {r.coverImage && (
                          <img src={r.coverImage} alt={r.title} className="w-12 h-16 object-cover rounded-lg shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-white line-clamp-1">{r.title}</h4>
                          <p className="text-[11px] text-amber-400 mb-1">
                            {r.author} · {r.language?.toUpperCase()} · {sourceName}{r.year ? ` · ${r.year}` : ''}
                          </p>
                          <p className="text-[11px] text-slate-400 line-clamp-2 mb-1">{r.description}</p>
                          {(resourceType || identifierLabel) && <p className="text-[10px] text-slate-500 mb-1">{resourceType ? `类型：${resourceType}` : ''}{resourceType && identifierLabel ? ' · ' : ''}{identifierLabel || ''}</p>}
                          <p className="text-[10px] text-slate-500 mb-1">访问：{availabilityLabel} · 下载：{downloadLabel}</p>
                          <p className="text-[10px] text-slate-500 mb-2">权利状态：{rightsLabel}{r.rightsNote ? ` · ${r.rightsNote}` : ''}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            {canImport && (
                              <button
                                type="button"
                                onClick={() => handleIngestBook(r)}
                                disabled={ingestingId === r.id}
                                className="min-h-11 inline-flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-[11px] font-semibold cursor-pointer transition-all"
                              >
                                {ingestingId === r.id ? <span>正在读取...</span> : <><BookOpen className="w-3 h-3" /><span>保存并诵读</span></>}
                              </button>
                            )}
                            {r.sourceUrl && (
                              <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center space-x-1 px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white text-[11px] font-semibold transition-colors">
                                <ExternalLink className="w-3 h-3" /><span>在来源平台查看</span>
                              </a>
                            )}
                            {providerFullTextUrl && providerFullTextUrl !== r.sourceUrl && (
                              <a href={providerFullTextUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center space-x-1 px-3 py-2 rounded-lg border border-emerald-800/70 text-emerald-200 hover:text-white text-[11px] font-semibold transition-colors">
                                <ExternalLink className="w-3 h-3" /><span>打开官方全文</span>
                              </a>
                            )}
                            {licenseUrl && (
                              <a href={licenseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center space-x-1 px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white text-[11px] font-semibold transition-all">
                                <ExternalLink className="w-3 h-3" /><span>查看许可证</span>
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
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-serif font-bold text-white">{cat.label}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{cat.description}</p>
                  </div>
                  <button
                    onClick={() => { setActiveCategory(cat.id); setView('category'); }}
                    className="flex items-center space-x-1 text-xs text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                  >
                    <span>查看全部</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {catBooks.slice(0, 6).map(book => (
                    <BookCard key={book.id} book={book} onClick={() => openBookDetail(book)} />
                  ))}
                </div>
              </section>
            );
          })}

          {/* Empty state */}
          {!isLoading && books.length === 0 && (
            <div className="text-center py-20 text-slate-500">
              <Library className="w-10 h-10 mx-auto mb-3 text-slate-600" />
              <p>图书馆正在建设中。使用上方搜索框检索全球公版书籍。</p>
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
                {selectedBook.chapters.length > 0 || selectedBook.epubUrl ? (
                  <button
                    onClick={() => openReader(selectedBook)}
                    className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm transition-all cursor-pointer"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>立即阅读</span>
                  </button>
                ) : (selectedBook.sourceUrl || selectedBook.externalReadUrl) ? (
                  <a href={selectedBook.sourceUrl || selectedBook.externalReadUrl} target="_blank" rel="noreferrer" className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm transition-all">
                    <ExternalLink className="w-4 h-4" />
                    <span>前往来源平台查看</span>
                  </a>
                ) : null}
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
            <div className="text-center py-20 text-slate-500">
              <BookMarked className="w-10 h-10 mx-auto mb-3 text-slate-600" />
              <p className="text-sm">书架还是空的</p>
              <p className="text-xs mt-1">在书籍详情页点击「加入书架」即可收藏。</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
              {shelfBooks.map(item => (
                <div key={item.id} className="relative">
                  <BookCard book={item.book} onClick={() => openShelfBook(item.book)} />
                  {item.progress > 0 && (
                    <div className="absolute bottom-2 left-2 right-2 h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500" style={{ width: `${item.progress}%` }} />
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
    </div>
  );
};

// ===========================================================================
// Book card (editorial-quality cover wall)
// ===========================================================================
function BookCard({ book, onClick }: { book: Book; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`打开《${book.title}》详情`}
      className="group cursor-pointer flex flex-col w-full text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-slate-900 border border-slate-800/60 shadow-lg group-hover:shadow-xl group-hover:shadow-amber-900/20 group-hover:border-amber-500/40 transition-all duration-300">
        <img
          src={book.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80'}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <h3 className="mt-2.5 text-xs font-serif font-bold text-white line-clamp-2 group-hover:text-amber-300 transition-colors leading-snug">
        {book.title}
      </h3>
      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{book.author}</p>
    </button>
  );
}

// ===========================================================================
// Metadata item (only shown when value exists)
// ===========================================================================
function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900/50 border border-slate-800/60 rounded-xl px-3 py-2">
      <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-xs text-slate-200 mt-0.5 font-medium">{value}</div>
    </div>
  );
}
