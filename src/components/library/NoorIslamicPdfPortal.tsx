import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookMarked,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { Book, BookShelfItem, Language } from '../../types/index.ts';

export interface IslamicAttachmentItem {
  type: string;
  url: string;
  streamUrl: string;
  downloadUrl: string;
  size?: string;
  description?: string;
}

export interface IslamicPdfBookItem {
  id: string;
  title: string;
  author: string;
  description: string;
  fullText?: string;
  language: 'ar' | 'zh' | 'en';
  contentType: string;
  source: 'islamhouse' | 'archive' | 'openlibrary' | 'gutenberg' | 'local_vault' | 'noor_link';
  sourceName: string;
  pdfUrl?: string;
  streamUrl?: string;
  downloadUrl?: string;
  textUrl?: string;
  attachments: IslamicAttachmentItem[];
  sourcePageUrl: string;
  fileSize?: string;
  coverImage?: string;
  year?: string;
  savedBookId?: string;
  onShelf?: boolean;
}

interface NoorIslamicPdfPortalProps {
  lang: Language;
  initialQuery?: string;
  onBack: () => void;
  onGoToShelf: () => void;
  onOpenPdf: (payload: { url: string; title: string; sourceUrl?: string }) => void;
  onOpenBook?: (book: Book) => void;
  onBookSavedToShelf: (book: Book, shelfItem?: BookShelfItem) => void;
}

const LANG_TABS: Array<{ id: 'ar' | 'zh' | 'en' | 'all'; label: string }> = [
  { id: 'ar', label: 'العربية 阿语' },
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
  { id: 'all', label: '全球全部' },
];

const QUICK_BOOK_TOPICS: Array<{ label: string; q: string; lang: 'ar' | 'zh' | 'en' | 'all' }> = [
  { label: 'حصن المسلم', q: 'حصن المسلم', lang: 'ar' },
  { label: 'تفسير القرآن', q: 'تفسير', lang: 'ar' },
  { label: 'السيرة النبوية', q: 'السيرة', lang: 'ar' },
  { label: 'صحيح البخاري', q: 'البخاري', lang: 'ar' },
  { label: '穆斯林的堡垒', q: '穆斯林', lang: 'zh' },
  { label: '古兰经', q: '古兰经', lang: 'zh' },
  { label: 'Philosophy', q: 'Philosophy', lang: 'en' },
];

function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

export const NoorIslamicPdfPortal: React.FC<NoorIslamicPdfPortalProps> = ({
  initialQuery = '',
  onBack,
  onGoToShelf,
  onOpenPdf,
  onOpenBook,
  onBookSavedToShelf,
}) => {
  const [selectedLang, setSelectedLang] = useState<'ar' | 'zh' | 'en' | 'all'>(
    initialQuery && !containsArabic(initialQuery) && /[\u4e00-\u9fff]/.test(initialQuery) ? 'zh' : 'ar'
  );
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<IslamicPdfBookItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [noorBookSearchUrl, setNoorBookSearchUrl] = useState('https://www.noor-book.com/');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedMap, setSavedMap] = useState<Record<string, { localPdfUrl?: string; book: Book; isTextBook?: boolean }>>({});
  const [statusNotice, setStatusNotice] = useState<{ text: string; showShelfLink?: boolean } | null>(null);

  const [uploading, setUploading] = useState(false);
  const [showUrlImport, setShowUrlImport] = useState(false);
  const [directPdfUrl, setDirectPdfUrl] = useState('');
  const [directPdfTitle, setDirectPdfTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Strictly books only on user terminal (Quran audio / lectures / videos / articles remain backend-only)
  const fetchBooks = async (q: string, langCode: 'ar' | 'zh' | 'en' | 'all', pageNum: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        lang: langCode,
        type: 'books',
        page: String(pageNum),
        limit: '24',
      });
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/library/islamic/books?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || '全球书籍检索失败，请稍后重试。');
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotalItems(Number(data.totalItems || 0));
      if (data.noorBookSearchUrl) setNoorBookSearchUrl(data.noorBookSearchUrl);
    } catch (err: any) {
      setError(err?.message || '网络连接异常，未能加载全球原版书籍。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchBooks(activeQuery, selectedLang, page);
  }, [activeQuery, selectedLang, page]);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setPage(1);
    setActiveQuery(searchInput.trim());
  };

  const handleDownloadToShelf = async (item: IslamicPdfBookItem) => {
    if (savingId) return;
    setSavingId(item.id);
    setStatusNotice(null);
    try {
      const res = await fetch('/api/library/islamic/save-to-shelf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfUrl: item.pdfUrl,
          textUrl: item.textUrl,
          title: item.title,
          author: item.author,
          description: item.description,
          fullText: item.fullText,
          language: item.language,
          sourcePageUrl: item.sourcePageUrl,
          coverImage: item.coverImage,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data.book) {
        setStatusNotice({
          text: data?.error || '下载到原文书架失败，您仍可直接打开在线阅读。',
        });
        return;
      }
      setSavedMap((prev) => ({
        ...prev,
        [item.id]: { localPdfUrl: data.localPdfUrl, book: data.book, isTextBook: data.isTextBook },
      }));
      onBookSavedToShelf(data.book, data.shelfItem);
      setStatusNotice({
        text: `已将《${item.title}》原版文档下载到你的网站书架！翻开即可使用 AI 逐页讲解与点词查义。`,
        showShelfLink: true,
      });
    } catch (err: any) {
      setStatusNotice({ text: err?.message || '下载到原文书架失败，请稍后重试。' });
    } finally {
      setSavingId(null);
    }
  };

  const handleOpenItemReader = async (item: IslamicPdfBookItem) => {
    const saved = savedMap[item.id];
    if (saved?.localPdfUrl) {
      onOpenPdf({ url: saved.localPdfUrl, title: item.title, sourceUrl: item.sourcePageUrl });
      return;
    }
    if (saved?.isTextBook && saved.book && onOpenBook) {
      onOpenBook(saved.book);
      return;
    }
    const pdfAtt = item.attachments?.find((a) => a.type === 'PDF');
    const pdfUrl = pdfAtt?.streamUrl || (item.pdfUrl ? item.streamUrl : undefined);
    if (pdfUrl) {
      onOpenPdf({ url: pdfUrl, title: item.title, sourceUrl: item.sourcePageUrl });
      return;
    }
    // Gutenberg / text book -> save & open directly in Apple Books Reader
    await handleDownloadToShelf(item);
  };

  const handleLocalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    const isSupported =
      lower.endsWith('.pdf') ||
      lower.endsWith('.md') ||
      lower.endsWith('.markdown') ||
      lower.endsWith('.txt') ||
      file.type === 'application/pdf';
    if (!isSupported) {
      setStatusNotice({ text: '支持导入 .pdf、.md 或 .txt 原版书籍到书架。' });
      return;
    }
    if (file.size > 44 * 1024 * 1024) {
      setStatusNotice({ text: '单个文件不能超过 44MB。' });
      return;
    }

    setUploading(true);
    setStatusNotice(null);
    try {
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('读取本地文件失败'));
        reader.readAsDataURL(file);
      });

      const derivedTitle = file.name.replace(/\.(pdf|md|markdown|txt)$/i, '').trim();
      const res = await fetch('/api/library/islamic/upload-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: derivedTitle,
          author: 'مكتبة النور · 本地导入',
          language: containsArabic(derivedTitle) ? 'ar' : /[\u4e00-\u9fff]/.test(derivedTitle) ? 'zh' : 'en',
          filename: file.name,
          fileBase64: base64,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data.book) {
        setStatusNotice({ text: data?.error || '导入失败，请重试。' });
        return;
      }

      onBookSavedToShelf(data.book, data.shelfItem);
      setStatusNotice({
        text: `已将《${data.book.title}》导入你的原文书架，正在打开阅读器…`,
        showShelfLink: true,
      });
      void fetchBooks(activeQuery, selectedLang, page);
      if (data.localPdfUrl) {
        onOpenPdf({
          url: data.localPdfUrl,
          title: data.book.title,
          sourceUrl: 'https://www.noor-book.com/',
        });
      } else if (data.isTextBook && onOpenBook) {
        onOpenBook(data.book);
      }
    } catch (err: any) {
      setStatusNotice({ text: err?.message || '导入失败。' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleOpenDirectUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = directPdfUrl.trim();
    if (!raw || !/^https?:\/\//i.test(raw)) {
      setStatusNotice({ text: '请输入以 https:// 开头的 PDF 直链。' });
      return;
    }
    const label = directPdfTitle.trim() || '原版 PDF 书籍';
    const stream = `/api/library/pdf-stream?url=${encodeURIComponent(raw)}&filename=${encodeURIComponent(label)}`;
    onOpenPdf({ url: stream, title: label, sourceUrl: raw });
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
      {/* Top action bar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-one-border)] bg-white/[0.02] px-3.5 py-2 text-xs font-medium text-[var(--color-one-text-muted)] transition hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.05] hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>返回图书馆</span>
          </button>

          <button
            type="button"
            onClick={onGoToShelf}
            className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-500/14 px-3.5 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/24"
          >
            <BookMarked className="h-3.5 w-3.5" />
            <span>我的原文书架</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain"
            onChange={handleLocalFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/12 px-3.5 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            <span>{uploading ? '正在导入…' : '导入本地 PDF / Markdown'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowUrlImport((v) => !v)}
            className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-one-border)] bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-[var(--color-one-text-muted)] transition hover:border-[var(--color-one-border-strong)] hover:text-white"
          >
            <Link2 className="h-3.5 w-3.5" />
            <span>链接直开</span>
          </button>

          <a
            href={noorBookSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-amber-500/35 bg-amber-500/12 px-3.5 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/20"
          >
            <span>مكتبة النور 官网</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Focused Single-Search-Box Global Books Header */}
      <section className="mb-6 rounded-[28px] border border-[var(--color-one-border)] bg-gradient-to-br from-[#0e1824] via-[#0b131e] to-[#0a1019] p-5 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2
                dir="rtl"
                lang="ar"
                className="font-serif text-3xl font-bold tracking-tight text-white sm:text-4xl"
              >
                مكتبة النور
              </h2>
              <span className="text-lg font-semibold text-white/95 sm:text-xl">
                全球伊斯兰与典籍原版书库
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--color-one-text-muted)] sm:text-sm">
              一个搜索框直搜全球伊斯兰与世界原版书籍（IslamHouse 5,099+ 阿/中/英 PDF · Internet Archive · Project Gutenberg）。点击 <strong className="text-emerald-200">「下载到原文书架」</strong> 后，阅读时支持 <strong className="text-white">AI 逐页讲解</strong> 与 <strong className="text-white">点击任意单词自动查义</strong>。
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2 text-xs text-emerald-300">
            <Sparkles className="h-4 w-4" />
            <span>阅读器内置 AI 讲解本页 · 点词查词 · 一键返回</span>
          </div>
        </div>

        {/* Optional direct PDF link bar */}
        {showUrlImport && (
          <form
            onSubmit={handleOpenDirectUrl}
            className="mt-4 grid grid-cols-1 gap-2.5 rounded-2xl border border-white/10 bg-black/30 p-3.5 sm:grid-cols-[1.5fr_1fr_auto]"
          >
            <input
              type="url"
              value={directPdfUrl}
              onChange={(e) => setDirectPdfUrl(e.target.value)}
              placeholder="粘贴 IslamHouse / Archive.org / Waqfeya 的 HTTPS .pdf 直链..."
              className="rounded-xl border border-white/10 bg-[#080d15] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-emerald-400/50 focus:outline-none"
            />
            <input
              type="text"
              value={directPdfTitle}
              onChange={(e) => setDirectPdfTitle(e.target.value)}
              placeholder="书名（可选）"
              className="rounded-xl border border-white/10 bg-[#080d15] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-emerald-400/50 focus:outline-none"
            />
            <button
              type="submit"
              className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-[#061310] transition hover:brightness-110"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>立即打开</span>
            </button>
          </form>
        )}

        {/* Unified Global Book Search Box + Minimal Language Switcher */}
        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
          <form onSubmit={handleSearchSubmit} className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-one-text-dim)]" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              dir={containsArabic(searchInput) ? 'rtl' : 'auto'}
              placeholder="输入任意书名或作者（阿拉伯语 / 中文 / 英文），全网搜书并下载到原文书架..."
              className="w-full rounded-2xl border border-[var(--color-one-border-strong)] bg-[rgba(7,11,18,0.9)] py-3.5 pl-11 pr-28 text-sm text-white placeholder:text-[var(--color-one-text-dim)] focus:border-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/15"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-[#04140e] transition hover:brightness-110"
            >
              搜索书籍
            </button>
          </form>

          <div className="flex flex-wrap gap-1.5">
            {LANG_TABS.map((tab) => {
              const active = selectedLang === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setSelectedLang(tab.id);
                    setPage(1);
                  }}
                  className={`cursor-pointer rounded-xl border px-3 py-2.5 text-xs font-medium transition ${
                    active
                      ? 'border-emerald-400/55 bg-emerald-500/18 text-white'
                      : 'border-[var(--color-one-border)] bg-white/[0.02] text-[var(--color-one-text-muted)] hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Minimal Quick Book Shortcuts */}
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] text-[var(--color-one-text-dim)]">快捷搜书：</span>
          {QUICK_BOOK_TOPICS.map((topic) => (
            <button
              key={topic.label}
              type="button"
              onClick={() => {
                setSelectedLang(topic.lang);
                setSearchInput(topic.q);
                setPage(1);
                setActiveQuery(topic.q);
              }}
              className="cursor-pointer rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-slate-200 transition hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-white"
            >
              {topic.label}
            </button>
          ))}
          {activeQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setActiveQuery('');
                setPage(1);
              }}
              className="cursor-pointer rounded-lg border border-white/10 px-2.5 py-1 text-xs text-amber-200 hover:bg-white/10"
            >
              清除搜索 · 看全部书目
            </button>
          )}
        </div>
      </section>

      {statusNotice && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/35 bg-emerald-500/12 px-4 py-3 text-xs text-emerald-100">
          <span>{statusNotice.text}</span>
          <div className="flex items-center gap-2">
            {statusNotice.showShelfLink && (
              <button
                type="button"
                onClick={onGoToShelf}
                className="cursor-pointer rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-[#04140e] transition hover:brightness-110"
              >
                去我的书架查看
              </button>
            )}
            <button
              type="button"
              onClick={() => setStatusNotice(null)}
              className="cursor-pointer text-[11px] text-emerald-200/80 hover:text-white"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-100">
          {error}
        </div>
      )}

      {/* Clean Books Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-52 animate-pulse rounded-2xl border border-[var(--color-one-border)] bg-white/[0.03] p-4"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-[var(--color-one-border-strong)] bg-white/[0.02] px-6 py-14 text-center">
          <FileText className="mx-auto mb-3 h-9 w-9 text-[var(--color-one-text-dim)]" />
          <p className="text-sm font-semibold text-white">暂未检索到匹配的书籍</p>
          <p className="mx-auto mt-1.5 max-w-md text-xs text-[var(--color-one-text-muted)]">
            你可以切换语言筛选（或选「全球全部」），也可以前往 مكتبة النور 官网下载后点击右上角「导入本地 PDF」直接加入书架。
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2.5">
            <a
              href={noorBookSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-[#151008]"
            >
              <span>在 مكتبة النور 官网搜此书</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setActiveQuery('');
                setPage(1);
              }}
              className="cursor-pointer rounded-xl border border-white/15 px-4 py-2 text-xs text-slate-200 hover:bg-white/10"
            >
              浏览全部原版书籍
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const isArabic = item.language === 'ar' || containsArabic(item.title);
              const savedEntry = savedMap[item.id];
              const isOnShelf = Boolean(savedEntry || item.onShelf);
              const pdfAtt = item.attachments?.find((a) => a.type === 'PDF');
              const primaryDownloadUrl = pdfAtt?.downloadUrl || item.downloadUrl;

              return (
                <article
                  key={item.id}
                  className="flex flex-col justify-between rounded-2xl border border-[var(--color-one-border)] bg-[rgba(12,18,28,0.8)] p-4 transition hover:border-emerald-400/35 hover:bg-[rgba(16,24,36,0.94)]"
                >
                  <div>
                    <div className="mb-2.5 flex items-center justify-between gap-2 text-[10px]">
                      <span className="truncate font-medium text-emerald-300/90">
                        {isOnShelf ? '已在原文书架 · 秒开' : item.sourceName}
                      </span>
                      <span className="shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-slate-300">
                        {pdfAtt ? `PDF${pdfAtt.size ? ` · ${pdfAtt.size}` : ''}` : item.textUrl ? '原著全文' : '原版书'}
                      </span>
                    </div>

                    <h3
                      dir={isArabic ? 'rtl' : 'ltr'}
                      lang={item.language}
                      className={`line-clamp-2 text-[15px] font-semibold leading-snug text-white ${
                        isArabic ? 'font-serif text-right text-[17px] leading-relaxed' : ''
                      }`}
                    >
                      {item.title}
                    </h3>

                    <p
                      dir={isArabic ? 'rtl' : 'ltr'}
                      className={`mt-1 line-clamp-1 text-xs text-amber-200/85 ${isArabic ? 'text-right' : ''}`}
                    >
                      {item.author}
                    </p>

                    {item.description && (
                      <p
                        dir={isArabic ? 'rtl' : 'ltr'}
                        className={`mt-2 line-clamp-3 text-xs leading-relaxed text-[var(--color-one-text-muted)] ${
                          isArabic ? 'text-right' : ''
                        }`}
                      >
                        {item.description}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 space-y-2 border-t border-white/8 pt-3">
                    <div className="flex items-center gap-2">
                      {isOnShelf ? (
                        <button
                          type="button"
                          onClick={onGoToShelf}
                          className="inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-emerald-400/50 bg-emerald-500/18 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/28"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>已在书架 · 查看</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDownloadToShelf(item)}
                          disabled={savingId === item.id}
                          className="inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-[#04140e] transition hover:brightness-110 disabled:opacity-55"
                        >
                          {savingId === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <BookMarked className="h-3.5 w-3.5" />
                          )}
                          <span>{savingId === item.id ? '下载中…' : '下载到原文书架'}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => void handleOpenItemReader(item)}
                        className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-1 rounded-xl border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/[0.12]"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        <span>阅读</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[var(--color-one-text-dim)]">
                      {primaryDownloadUrl ? (
                        <a
                          href={primaryDownloadUrl}
                          download
                          className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-slate-300 transition hover:text-white"
                        >
                          <Download className="h-3 w-3" />
                          <span>存到本机</span>
                        </a>
                      ) : (
                        <span />
                      )}
                      {item.sourcePageUrl && (
                        <a
                          href={item.sourcePageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-slate-400 transition hover:text-white"
                        >
                          <span>原页</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {!activeQuery && totalItems > 24 && (
            <div className="mt-7 flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-xl border border-white/15 bg-white/[0.03] px-4 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-35"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>上一页</span>
              </button>
              <span className="text-xs tabular-nums text-[var(--color-one-text-muted)]">
                第 {page} 页 · 共约 {Math.ceil(totalItems / 24).toLocaleString()} 页
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-xl border border-white/15 bg-white/[0.03] px-4 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/[0.08]"
              >
                <span>下一页</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
