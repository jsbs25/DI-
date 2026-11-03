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

interface DigitalLibraryProps {
  lang: Language;
  currentUser?: { id: string } | null;
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

export const DigitalLibrary: React.FC<DigitalLibraryProps> = ({ lang, currentUser }) => {
  // ---- View routing ----
  const [view, setView] = useState<'home' | 'category' | 'detail' | 'shelf'>('home');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  // ---- Data ----
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  // ---- Online search ----
  const [onlineResults, setOnlineResults] = useState<
    Array<{ id: string; title: string; author: string; language: string; coverImage?: string; description: string; textUrl?: string; source: string; pageTitle?: string }>
  >([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [ingestingId, setIngestingId] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  // ---- Bookshelf ----
  const [shelf, setShelf] = useState<Array<BookShelfItem & { book: Book }>>([]);
  const [shelfTab, setShelfTab] = useState<BookshelfStatus | 'all'>('all');

  // ---- Reader modal ----
  const [readingBook, setReadingBook] = useState<Book | null>(null);
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
  const [annotationNote, setAnnotationNote] = useState('');
  const [isAnnotationDrawerOpen, setIsAnnotationDrawerOpen] = useState(false);

  // ---- Text-to-speech ----
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

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

  const loadShelf = async () => {
    try {
      const res = await fetch('/api/library/shelf');
      const data = await res.json();
      if (data.success && data.items) setShelf(data.items);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadBooks();
  }, [activeCategory, searchQuery]);

  useEffect(() => {
    loadShelf();
  }, []);

  // =========================================================================
  // Search & ingest
  // =========================================================================
  const handleOnlineSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearchingOnline(true);
    setIngestError(null);
    setOnlineResults([]);
    try {
      const res = await fetch(`/api/library/search?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = await res.json();
      if (data.success && data.results) {
        setOnlineResults(data.results);
        if (data.results.length === 0) {
          setIngestError('未找到可诵读的公共领域书籍，请尝试其他书名或作者。');
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

  const handleIngestBook = async (r: { id: string; title: string; author: string; language: string; coverImage?: string; description: string; textUrl?: string; source: string; pageTitle?: string }) => {
    if ((!r.textUrl && !r.pageTitle) || ingestingId) return;
    setIngestingId(r.id);
    setIngestError(null);
    try {
      const res = await fetch('/api/library/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textUrl: r.textUrl,
          pageTitle: r.pageTitle,
          source: r.source,
          title: r.title,
          author: r.author,
          coverImage: r.coverImage,
          description: r.description,
          language: r.language
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
    setReadingBook(book);
    setActiveChapterIndex(0);
    setAiExplanation(null);
    setSelectedText('');
    setAnnotationNote('');
  };

  const closeReader = () => {
    stopSpeaking();
    setReadingBook(null);
    setIsAnnotationDrawerOpen(false);
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
    }
  };

  const handleExplainSelection = async () => {
    if (!selectedText || !readingBook) return;
    setIsAiExplaining(true);
    setAiExplanation(null);
    const prompt = `你是一位博学的学者与语言专家。请针对《${readingBook.title}》（作者：${readingBook.author}，语言：${readingBook.language}）中的以下文字，给出：\n1. 翻译（如果是中文则译为英文，如果是阿拉伯语/英文等则译为中文）\n2. 生词/难点词汇解释\n3. 语法与句子结构分析\n4. 段落含义与背景知识\n\n原文：\n"${selectedText}"`;
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
      });
      const data = await res.json();
      if (data.success && data.message) setAiExplanation(data.message.content);
      else setAiExplanation(data.error || 'AI 服务尚未配置，请在服务端配置模型密钥。');
    } catch (err: any) {
      setAiExplanation(`请求出错: ${err.message}`);
    } finally {
      setIsAiExplaining(false);
    }
  };

  const handleSaveAnnotation = async () => {
    if (!readingBook || !selectedText) return;
    const currentChapter = readingBook.chapters[activeChapterIndex];
    try {
      const res = await fetch(`/api/library/books/${readingBook.id}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        setSelectedText('');
        setAiExplanation(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // =========================================================================
  // Bookshelf actions
  // =========================================================================
  const addToShelf = async (book: Book, status: BookshelfStatus = 'want_to_read') => {
    try {
      const res = await fetch('/api/library/shelf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      await fetch(`/api/library/shelf/${bookId}`, { method: 'DELETE' });
      setShelf(prev => prev.filter(i => i.bookId !== bookId));
    } catch (e) {
      console.error(e);
    }
  };

  const saveProgress = async (progress: number) => {
    if (!readingBook) return;
    try {
      await fetch(`/api/library/shelf/${readingBook.id}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress })
      });
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
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3 flex items-center justify-between gap-4">
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

          <nav className="hidden md:flex items-center space-x-1 text-xs font-medium">
            {[
              { id: 'home', label: '首页' },
              { id: 'shelf', label: '我的书架' }
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
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleOnlineSearch()}
                    placeholder="搜索书名、作者、主题、语言..."
                    className="w-full bg-slate-900/80 border border-slate-700/80 rounded-2xl pl-11 pr-4 py-3.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-all shadow-inner"
                  />
                </div>
                <div className="mt-3 flex items-center space-x-3">
                  <button
                    onClick={handleOnlineSearch}
                    disabled={isSearchingOnline}
                    className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold transition-all cursor-pointer"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>{isSearchingOnline ? '正在检索全球书库...' : '搜索全球公版书籍'}</span>
                  </button>
                  <span className="text-[11px] text-slate-500">支持书名、作者、主题、语言</span>
                </div>
              </div>
            </div>

            {/* Featured real book */}
            {featuredBook && (
              <div
                onClick={() => { setSelectedBook(featuredBook); setView('detail'); }}
                className="flex justify-center lg:justify-end cursor-pointer group"
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
              </div>
            )}
          </section>

          {/* Online search results */}
          {(onlineResults.length > 0 || isSearchingOnline || ingestError) && (
            <section className="p-5 rounded-2xl bg-slate-900/50 border border-amber-600/30">
              <h3 className="text-sm font-semibold text-amber-300 mb-3">全球检索结果</h3>
              {ingestError && <div className="text-xs text-red-400 mb-3">{ingestError}</div>}
              {isSearchingOnline ? (
                <div className="text-xs text-slate-400 py-4 text-center">正在检索可诵读的全球书籍...</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {onlineResults.map(r => (
                    <div key={r.id} className="flex items-start space-x-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-amber-500/50 transition-all">
                      {r.coverImage && (
                        <img src={r.coverImage} alt={r.title} className="w-12 h-16 object-cover rounded-lg shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-white line-clamp-1">{r.title}</h4>
                        <p className="text-[11px] text-amber-400 mb-1">
                          {r.author} · {r.language?.toUpperCase()}
                          {r.source === 'wikisource' ? ' · 维基文库' : ' · Gutenberg'}
                        </p>
                        <p className="text-[11px] text-slate-400 line-clamp-2 mb-2">{r.description}</p>
                        <button
                          onClick={() => handleIngestBook(r)}
                          disabled={ingestingId === r.id || (!r.textUrl && !r.pageTitle)}
                          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-[11px] font-semibold cursor-pointer transition-all"
                        >
                          {ingestingId === r.id ? <span>正在下载全文...</span> : <><BookOpen className="w-3 h-3" /><span>保存并诵读</span></>}
                        </button>
                      </div>
                    </div>
                  ))}
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
                    <BookCard key={book.id} book={book} onClick={() => { setSelectedBook(book); setView('detail'); }} />
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
              <BookCard key={book.id} book={book} onClick={() => { setSelectedBook(book); setView('detail'); }} />
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
                <button
                  onClick={() => openReader(selectedBook)}
                  className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm transition-all cursor-pointer"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>立即阅读</span>
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => isOnShelf(selectedBook.id) ? removeFromShelf(selectedBook.id) : addToShelf(selectedBook, 'want_to_read')}
                    className={`flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      isOnShelf(selectedBook.id)
                        ? 'bg-amber-950/60 text-amber-300 border-amber-500/50'
                        : 'bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    {isOnShelf(selectedBook.id) ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>{isOnShelf(selectedBook.id) ? '已加入书架' : '加入书架'}</span>
                  </button>
                  <button
                    onClick={() => addToShelf(selectedBook, 'favorite')}
                    className="flex items-center justify-center space-x-1.5 py-2.5 rounded-xl bg-slate-900 text-slate-200 border border-slate-700 hover:bg-slate-800 text-xs font-semibold transition-all cursor-pointer"
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
                <MetaItem label="版权状态" value={selectedBook.copyrightStatus === 'copyrighted' ? '受版权保护' : selectedBook.copyrightStatus === 'licensed' ? '授权许可' : '公共领域'} />
                <MetaItem label="章节" value={`${selectedBook.chapters.length} 章`} />
              </div>

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
                <button
                  onClick={() => openReader(selectedBook)}
                  className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-all cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI 解读</span>
                </button>
                {selectedBook.externalReadUrl && (
                  <a
                    href={selectedBook.externalReadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition-all"
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
            <button onClick={() => setView('home')} className="flex items-center space-x-1 text-xs text-slate-400 hover:text-white cursor-pointer">
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
                className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
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
                  <BookCard book={item.book} onClick={() => openReader(item.book)} />
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
      {/* READER MODAL                                                         */}
      {/* ===================================================================== */}
      {readingBook && activeChapter && (
        <div className="fixed inset-0 z-50 bg-[#030712]/98 backdrop-blur-2xl flex flex-col animate-in fade-in duration-200">
          {/* Reader header */}
          <header className="h-16 border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between select-none bg-[#02050f]/80 shrink-0">
            <div className="flex items-center space-x-3 min-w-0">
              <button
                onClick={closeReader}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">返回</span>
              </button>
              <div className="min-w-0">
                <h2 className="text-sm font-serif font-bold text-white line-clamp-1">{readingBook.title}</h2>
                <span className="text-[11px] text-amber-400">{readingBook.author}</span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {/* Read aloud */}
              <button
                onClick={handleReadAloud}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  isSpeaking ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
                <span className="hidden sm:inline">{isSpeaking ? '停止' : '诵读'}</span>
              </button>

              {/* Font size */}
              <div className="hidden sm:flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-xl px-2 py-1">
                <button onClick={() => setFontSize(Math.max(14, fontSize - 2))} className="px-1.5 text-xs text-slate-400 hover:text-white cursor-pointer">A-</button>
                <span className="text-[10px] font-mono text-slate-300">{fontSize}</span>
                <button onClick={() => setFontSize(Math.min(30, fontSize + 2))} className="px-1.5 text-xs text-slate-400 hover:text-white cursor-pointer">A+</button>
              </div>

              {/* Line height */}
              <div className="hidden sm:flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-xl px-2 py-1">
                <button onClick={() => setLineHeight(Math.max(1.4, lineHeight - 0.2))} className="px-1.5 text-xs text-slate-400 hover:text-white cursor-pointer">行距-</button>
                <button onClick={() => setLineHeight(Math.min(2.6, lineHeight + 0.2))} className="px-1.5 text-xs text-slate-400 hover:text-white cursor-pointer">行距+</button>
              </div>

              {/* Theme */}
              <div className="hidden sm:flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
                <button onClick={() => setReaderTheme('sepia')} className={`p-1 rounded-lg cursor-pointer ${readerTheme === 'sepia' ? 'bg-amber-950 text-amber-300' : 'text-slate-400'}`} title="纸张"><Sun className="w-3.5 h-3.5" /></button>
                <button onClick={() => setReaderTheme('dark')} className={`p-1 rounded-lg cursor-pointer ${readerTheme === 'dark' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400'}`} title="夜间"><Moon className="w-3.5 h-3.5" /></button>
                <button onClick={() => setReaderTheme('focus')} className={`p-1 rounded-lg cursor-pointer ${readerTheme === 'focus' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400'}`} title="专注"><Menu className="w-3.5 h-3.5" /></button>
              </div>

              {/* Fullscreen */}
              <button onClick={toggleFullscreen} className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white cursor-pointer" title="全屏">
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
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
                      onClick={() => { setActiveChapterIndex(idx); setSelectedText(''); setAiExplanation(null); }}
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
              onMouseUp={handleTextSelection}
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
                    disabled={activeChapterIndex === 0}
                    onClick={() => { setActiveChapterIndex(prev => Math.max(0, prev - 1)); }}
                    className="flex items-center space-x-1 hover:text-white disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>上一章</span>
                  </button>
                  <button
                    onClick={() => saveProgress(Math.round(((activeChapterIndex + 1) / readingBook.chapters.length) * 100))}
                    className="text-amber-400 hover:text-amber-300 cursor-pointer"
                  >
                    保存进度
                  </button>
                  <button
                    disabled={activeChapterIndex === readingBook.chapters.length - 1}
                    onClick={() => setActiveChapterIndex(prev => Math.min(readingBook.chapters.length - 1, prev + 1))}
                    className="flex items-center space-x-1 hover:text-white disabled:opacity-30 cursor-pointer"
                  >
                    <span>下一章</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </main>

            {/* Selection AI sidebar */}
            {(selectedText || isAnnotationDrawerOpen) && readerTheme !== 'focus' && (
              <aside className="w-80 sm:w-96 border-l border-slate-800 bg-[#060c22] flex flex-col p-4 overflow-y-auto shrink-0">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="font-semibold text-xs text-white">{selectedText ? 'AI 智能阅读' : '批注'}</span>
                  </div>
                  {selectedText && (
                    <button onClick={() => { setSelectedText(''); setAiExplanation(null); }} className="text-slate-400 hover:text-white text-xs cursor-pointer">
                      <X className="w-4 h-4" />
                    </button>
                  )}
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

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">笔记:</label>
                      <textarea
                        rows={3}
                        value={annotationNote}
                        onChange={e => setAnnotationNote(e.target.value)}
                        placeholder="记录你的思考..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                      />
                      <button onClick={handleSaveAnnotation} className="mt-2 w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium cursor-pointer">
                        保存批注
                      </button>
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
                      </div>
                    ))
                  )}
                </div>
              </aside>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ===========================================================================
// Book card (editorial-quality cover wall)
// ===========================================================================
function BookCard({ book, onClick }: { book: Book; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="group cursor-pointer flex flex-col"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-slate-900 border border-slate-800/60 shadow-lg group-hover:shadow-xl group-hover:shadow-amber-900/20 group-hover:border-amber-500/40 transition-all duration-300">
        <img
          src={book.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80'}
          alt={book.title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <h3 className="mt-2.5 text-xs font-serif font-bold text-white line-clamp-2 group-hover:text-amber-300 transition-colors leading-snug">
        {book.title}
      </h3>
      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{book.author}</p>
    </div>
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
