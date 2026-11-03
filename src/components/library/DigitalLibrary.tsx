import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Search,
  Sparkles,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Type,
  Sun,
  Moon,
  Compass,
  MessageSquare,
  Share2,
  Check,
  X,
  ExternalLink,
  Layers,
  Star
} from 'lucide-react';
import { Book, Chapter, BookAnnotation, Language } from '../../types/index.ts';

interface DigitalLibraryProps {
  lang: Language;
}

const CATEGORIES = [
  { id: 'all', label: '全部馆藏 (All Works)' },
  { id: 'philosophy', label: '哲学与伦理 (Philosophy)' },
  { id: 'science', label: '自然与天文学 (Science)' },
  { id: 'literature', label: '世界文学经典 (Literature)' },
  { id: 'history', label: '全球文明史 (History)' },
  { id: 'islamic_studies', label: '伊斯兰文明研究 (Islamic Studies)' },
  { id: 'computer_science', label: '计算与AI (Computing & AI)' }
];

export const DigitalLibrary: React.FC<DigitalLibraryProps> = ({ lang }) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Active Reading Modal State
  const [readingBook, setReadingBook] = useState<Book | null>(null);
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [fontSize, setFontSize] = useState<number>(18);
  const [readerTheme, setReaderTheme] = useState<'dark' | 'sepia' | 'light'>('dark');
  const [annotations, setAnnotations] = useState<BookAnnotation[]>([]);

  // Text selection & AI commentary state
  const [selectedText, setSelectedText] = useState('');
  const [isAiExplaining, setIsAiExplaining] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [annotationNote, setAnnotationNote] = useState('');
  const [isAnnotationDrawerOpen, setIsAnnotationDrawerOpen] = useState(false);

  const loadBooks = async () => {
    setIsLoading(true);
    try {
      const url = new URL('/api/library/books', window.location.origin);
      if (selectedCategory !== 'all') url.searchParams.set('category', selectedCategory);
      if (searchQuery.trim()) url.searchParams.set('search', searchQuery.trim());

      const res = await fetch(url.toString());
      const data = await res.json();
      if (data.success && data.books) {
        setBooks(data.books);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBooks();
  }, [selectedCategory, searchQuery]);

  const handleOpenReader = async (book: Book) => {
    setReadingBook(book);
    setActiveChapterIndex(0);
    setAiExplanation(null);
    setSelectedText('');

    try {
      const res = await fetch(`/api/library/books/${book.id}`);
      const data = await res.json();
      if (data.success && data.annotations) {
        setAnnotations(data.annotations);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCloseReader = () => {
    setReadingBook(null);
    setIsAnnotationDrawerOpen(false);
  };

  // Text selection handler
  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 3) {
      setSelectedText(selection.toString().trim());
    }
  };

  // Ask AI to explain the selected passage
  const handleExplainSelection = async () => {
    if (!selectedText || !readingBook) return;
    setIsAiExplaining(true);
    setAiExplanation(null);

    const prompt = `你是一位博学的哲学家与学者。请针对《${readingBook.title}》（作者：${readingBook.author}）中的以下段落，给出深刻的学术背景释义、逻辑要点和现代启示：\n\n"${selectedText}"`;

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await res.json();
      if (data.success && data.message) {
        setAiExplanation(data.message.content);
      } else {
        setAiExplanation(data.error || 'AI 伴读服务响应繁忙，请稍后重试。');
      }
    } catch (err: any) {
      setAiExplanation(`请求出错: ${err.message}`);
    } finally {
      setIsAiExplaining(false);
    }
  };

  // Save selected annotation to library store
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

  const activeChapter: Chapter | undefined = readingBook?.chapters[activeChapterIndex];

  return (
    <div className="flex-1 flex flex-col bg-[#030713] text-slate-100 min-h-[calc(100vh-4rem)] p-4 sm:p-8">
      {/* 1. Header Banner */}
      <div className="max-w-7xl mx-auto w-full mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2.5 rounded-xl bg-amber-950/80 border border-amber-500/40 text-amber-400">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-wide">
                全球数字图书馆 (Global Digital Library)
              </h1>
              <p className="text-xs text-slate-400">
                收录人类公共领域（Public Domain）思想巨著 · 跨学科通识典藏 · AI 原生伴读与深度批注
              </p>
            </div>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索书名、作者或关键词..."
            className="w-full bg-slate-900/80 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-all shadow-inner"
          />
        </div>
      </div>

      {/* 2. Category Chips Bar */}
      <div className="max-w-7xl mx-auto w-full flex items-center space-x-2 overflow-x-auto pb-4 mb-6">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              selectedCategory === cat.id
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30 border border-amber-400/40'
                : 'bg-slate-900/60 text-slate-300 border border-slate-800 hover:border-slate-700 hover:text-white'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 3. Book Grid */}
      <div className="max-w-7xl mx-auto w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {books.map(book => (
          <div
            key={book.id}
            onClick={() => handleOpenReader(book)}
            className="group relative bg-slate-900/50 border border-slate-800/80 hover:border-amber-500/60 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-2xl hover:shadow-amber-500/10 flex flex-col justify-between"
          >
            {/* Book Cover */}
            <div className="relative h-56 w-full overflow-hidden bg-slate-950">
              <img
                src={book.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80'}
                alt={book.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b132b] via-transparent to-transparent opacity-90" />
              <span className="absolute top-3 left-3 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/90 text-amber-300 border border-amber-600/50 backdrop-blur-md">
                {book.source}
              </span>
              <span className="absolute top-3 right-3 px-2 py-0.5 rounded-md text-[10px] font-mono text-slate-300 bg-slate-950/80">
                {book.year}
              </span>
            </div>

            {/* Book Info */}
            <div className="p-5 flex-1 flex flex-col justify-between">
              <div>
                <h3 className="font-serif font-bold text-base text-white group-hover:text-amber-300 transition-colors line-clamp-1 mb-1">
                  {book.title}
                </h3>
                <span className="text-xs text-amber-400 font-medium block mb-2">{book.author}</span>
                <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed mb-4">
                  {book.description}
                </p>
              </div>

              {/* Progress & Chapter counts */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>{book.chapters.length} 章节</span>
                <div className="flex items-center space-x-1.5 text-amber-400 group-hover:translate-x-1 transition-transform">
                  <span>开始阅读</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 4. Fullscreen Immersive Apple Books-Style Reader Modal */}
      {readingBook && activeChapter && (
        <div className="fixed inset-0 z-50 bg-[#030712]/95 backdrop-blur-2xl flex flex-col animate-in fade-in duration-200">
          {/* Top Reader Navigation Bar */}
          <header className="h-16 border-b border-slate-800 px-6 flex items-center justify-between select-none bg-[#02050f]/80">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleCloseReader}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>返回藏书馆</span>
              </button>
              <div>
                <h2 className="text-sm font-serif font-bold text-white line-clamp-1">
                  {readingBook.title}
                </h2>
                <span className="text-[11px] text-amber-400">{readingBook.author}</span>
              </div>
            </div>

            {/* Typography & Theme Controls */}
            <div className="flex items-center space-x-3">
              {/* Font Sizer */}
              <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-xl px-2 py-1">
                <button
                  onClick={() => setFontSize(Math.max(14, fontSize - 2))}
                  className="px-2 py-0.5 text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  A-
                </button>
                <span className="text-xs font-mono text-slate-300 px-1">{fontSize}px</span>
                <button
                  onClick={() => setFontSize(Math.min(28, fontSize + 2))}
                  className="px-2 py-0.5 text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  A+
                </button>
              </div>

              {/* Theme switcher */}
              <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
                <button
                  onClick={() => setReaderTheme('dark')}
                  className={`p-1.5 rounded-lg text-xs transition-colors ${
                    readerTheme === 'dark' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400'
                  }`}
                  title="Dark Obsidian"
                >
                  <Moon className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setReaderTheme('sepia')}
                  className={`p-1.5 rounded-lg text-xs transition-colors ${
                    readerTheme === 'sepia' ? 'bg-amber-950 text-amber-300' : 'text-slate-400'
                  }`}
                  title="Sepia Parchment"
                >
                  <Sun className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Annotation Drawer Toggle */}
              <button
                onClick={() => setIsAnnotationDrawerOpen(!isAnnotationDrawerOpen)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  isAnnotationDrawerOpen
                    ? 'bg-amber-600 text-white border-amber-500 shadow-md'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                <span>批注与笔记 ({annotations.length})</span>
              </button>
            </div>
          </header>

          {/* Reader Body (Split with Annotation Drawer) */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Chapter Index */}
            <aside className="w-64 border-r border-slate-800 bg-[#060c20]/60 hidden md:flex flex-col p-4 select-none">
              <span className="text-xs font-semibold text-slate-400 mb-3 px-2">目录结构 (TOC)</span>
              <div className="space-y-1 overflow-y-auto">
                {readingBook.chapters.map((ch, idx) => (
                  <button
                    key={ch.id}
                    onClick={() => {
                      setActiveChapterIndex(idx);
                      setSelectedText('');
                      setAiExplanation(null);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      activeChapterIndex === idx
                        ? 'bg-amber-950/80 text-amber-300 border border-amber-600/50 shadow-sm'
                        : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                    }`}
                  >
                    {ch.title}
                  </button>
                ))}
              </div>
            </aside>

            {/* Main Reading Canvas */}
            <main
              onMouseUp={handleTextSelection}
              className={`flex-1 overflow-y-auto p-6 sm:p-12 lg:px-24 flex justify-center transition-colors ${
                readerTheme === 'sepia'
                  ? 'bg-[#181512] text-[#e0d6c4]'
                  : 'bg-[#030713] text-slate-200'
              }`}
            >
              <div className="max-w-3xl w-full">
                {/* Chapter Title */}
                <div className="mb-10 pb-6 border-b border-slate-800/80">
                  <span className="text-xs text-amber-400 font-mono tracking-wider uppercase block mb-1">
                    Chapter {activeChapterIndex + 1} of {readingBook.chapters.length}
                  </span>
                  <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-white">
                    {activeChapter.title}
                  </h1>
                </div>

                {/* Chapter Body */}
                <div
                  className="font-serif leading-relaxed space-y-6"
                  style={{ fontSize: `${fontSize}px` }}
                >
                  {activeChapter.content.split('\n\n').map((para, i) => (
                    <p key={i} className="leading-8 text-justify">
                      {para}
                    </p>
                  ))}
                </div>

                {/* Chapter Bottom Navigation */}
                <div className="mt-16 pt-8 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <button
                    disabled={activeChapterIndex === 0}
                    onClick={() => setActiveChapterIndex(prev => Math.max(0, prev - 1))}
                    className="flex items-center space-x-1 hover:text-white disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>上一章</span>
                  </button>
                  <span className="font-mono">
                    {activeChapterIndex + 1} / {readingBook.chapters.length}
                  </span>
                  <button
                    disabled={activeChapterIndex === readingBook.chapters.length - 1}
                    onClick={() =>
                      setActiveChapterIndex(prev =>
                        Math.min(readingBook.chapters.length - 1, prev + 1)
                      )
                    }
                    className="flex items-center space-x-1 hover:text-white disabled:opacity-30 cursor-pointer"
                  >
                    <span>下一章</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </main>

            {/* Selection Floating AI Bar or Right Drawer */}
            {(selectedText || isAnnotationDrawerOpen) && (
              <aside className="w-80 sm:w-96 border-l border-slate-800 bg-[#060c22] flex flex-col p-4 overflow-y-auto">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="font-semibold text-xs text-white">
                      {selectedText ? '段落 AI 深度解读' : '本书读者批注'}
                    </span>
                  </div>
                  {selectedText && (
                    <button
                      onClick={() => {
                        setSelectedText('');
                        setAiExplanation(null);
                      }}
                      className="text-slate-400 hover:text-white text-xs"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {selectedText && (
                  <div className="space-y-4 mb-6">
                    <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 text-xs italic text-amber-200">
                      "{selectedText}"
                    </div>

                    {!aiExplanation && (
                      <button
                        onClick={handleExplainSelection}
                        disabled={isAiExplaining}
                        className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold text-xs shadow-md transition-all cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{isAiExplaining ? 'AI 正在解析哲学与学术内涵...' : '调用 AI 深度解析该段落'}</span>
                      </button>
                    )}

                    {aiExplanation && (
                      <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl text-xs leading-relaxed text-slate-300 whitespace-pre-line shadow-inner">
                        <div className="font-semibold text-amber-400 mb-2 flex items-center space-x-1">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>AI 学术伴读解读:</span>
                        </div>
                        {aiExplanation}
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">写下您的个人批注与心得:</label>
                      <textarea
                        rows={3}
                        value={annotationNote}
                        onChange={e => setAnnotationNote(e.target.value)}
                        placeholder="记录您的思考..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                      />
                      <button
                        onClick={handleSaveAnnotation}
                        className="mt-2 w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium cursor-pointer"
                      >
                        保存到个人批注笔记
                      </button>
                    </div>
                  </div>
                )}

                {/* Saved Annotations List */}
                <div className="space-y-3">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    历史批注列表 ({annotations.length})
                  </span>
                  {annotations.length === 0 ? (
                    <div className="text-center text-slate-500 py-8 text-xs">
                      划选正文段落即可呼叫 AI 伴读并保存专属学术批注。
                    </div>
                  ) : (
                    annotations.map(a => (
                      <div
                        key={a.id}
                        className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5"
                      >
                        <p className="text-xs italic text-amber-300 font-serif">"{a.selectedText}"</p>
                        {a.note && <p className="text-xs text-slate-200">批注: {a.note}</p>}
                        {a.aiExplanation && (
                          <p className="text-[11px] text-slate-400 bg-slate-950/50 p-2 rounded-lg line-clamp-3">
                            AI 解读: {a.aiExplanation}
                          </p>
                        )}
                        <span className="text-[10px] text-slate-500 block">
                          {new Date(a.createdAt).toLocaleDateString()}
                        </span>
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
