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
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
      {/* Top action bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] px-3.5 py-2 text-xs font-medium text-[var(--color-one-text-muted)] transition hover:border-[var(--color-one-border-strong)] hover:text-[var(--color-one-text)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>返回图书馆</span>
          </button>

          <button
            type="button"
            onClick={onGoToShelf}
            className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-one-accent)]/35 bg-[var(--color-one-accent)]/10 px-3.5 py-2 text-xs font-semibold text-[var(--color-one-accent)] transition hover:bg-[var(--color-one-accent)]/18"
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
            className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] px-3.5 py-2 text-xs font-medium text-[var(--color-one-text)] transition hover:border-[var(--color-one-border-strong)] disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            <span>{uploading ? '正在导入…' : '导入本地 PDF / Markdown'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowUrlImport((v) => !v)}
            className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] px-3.5 py-2 text-xs font-medium text-[var(--color-one-text-muted)] transition hover:border-[var(--color-one-border-strong)] hover:text-[var(--color-one-text)]"
          >
            <Link2 className="h-3.5 w-3.5" />
            <span>链接直开</span>
          </button>

          <a
            href={noorBookSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] px-3.5 py-2 text-xs font-medium text-[var(--color-one-text-muted)] transition hover:border-[var(--color-one-border-strong)] hover:text-[var(--color-one-text)]"
          >
            <span dir="rtl" lang="ar" className="font-arabic-ui text-sm leading-normal">مكتبة النور</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Focused Single-Search-Box Global Books Header */}
      <section className="mb-7 rounded-[24px] border border-[var(--color-one-border)] bg-[var(--color-one-surface)] p-5 shadow-xs sm:p-7">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
              <h2
                dir="rtl"
                lang="ar"
                className="font-arabic-book text-2xl font-bold leading-[1.7] text-[var(--color-one-text)] sm:text-3xl"
              >
                مكتبة النور
              </h2>
              <span className="text-base font-semibold text-[var(--color-one-text)] sm:text-lg">
                全球原版书库
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--color-one-text-muted)] sm:text-sm">
              直连 IslamHouse、Internet Archive、Project Gutenberg 等全球公开原版书籍。下载到书架后自动转为电子书重排阅读，支持 AI 精讲、段落翻译、点词查义与生词本。
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--color-one-accent)]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>PDF 电子书重排 · AI 智能伴读</span>
          </div>
        </div>

        {/* Optional direct PDF link bar */}
        {showUrlImport && (
          <form
            onSubmit={handleOpenDirectUrl}
            className="mt-4 grid grid-cols-1 gap-2.5 rounded-2xl border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)] p-3.5 sm:grid-cols-[1.5fr_1fr_auto]"
          >
            <input
              type="url"
              value={directPdfUrl}
              onChange={(e) => setDirectPdfUrl(e.target.value)}
              placeholder="粘贴 HTTPS .pdf 直链..."
              className="rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] px-3.5 py-2.5 text-xs text-[var(--color-one-text)] placeholder:text-[var(--color-one-text-dim)] focus:border-[var(--color-one-accent)] focus:outline-none"
            />
            <input
              type="text"
              value={directPdfTitle}
              onChange={(e) => setDirectPdfTitle(e.target.value)}
              placeholder="书名（可选）"
              className="rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] px-3.5 py-2.5 text-xs text-[var(--color-one-text)] placeholder:text-[var(--color-one-text-dim)] focus:border-[var(--color-one-accent)] focus:outline-none"
            />
            <button
              type="submit"
              className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[var(--color-one-accent)] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90"
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
              placeholder="输入任意书名或作者（阿拉伯语 / 中文 / 英文）..."
              className={`w-full rounded-2xl border border-[var(--color-one-border-strong)] bg-[var(--color-one-bg)] py-3 pl-11 pr-24 text-sm text-[var(--color-one-text)] placeholder:text-[var(--color-one-text-dim)] focus:border-[var(--color-one-accent)] focus:outline-none ${containsArabic(searchInput) ? 'font-arabic-ui' : ''}`}
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-xl bg-[var(--color-one-accent)] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90"
            >
              搜索
            </button>
          </form>

          <div className="inline-flex flex-wrap gap-1 rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)] p-1">
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
                  className={`cursor-pointer rounded-lg px-3 py-2 text-xs font-medium transition ${
                    active
                      ? 'bg-[var(--color-one-surface)] text-[var(--color-one-text)] shadow-xs'
                      : 'text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Minimal Quick Book Shortcuts */}
        <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          <span className="text-[11px] text-[var(--color-one-text-dim)]">快捷检索</span>
          {QUICK_BOOK_TOPICS.map((topic) => {
            const topicIsAr = containsArabic(topic.label);
            return (
              <button
                key={topic.label}
                type="button"
                dir={topicIsAr ? 'rtl' : 'auto'}
                lang={topicIsAr ? 'ar' : undefined}
                onClick={() => {
                  setSelectedLang(topic.lang);
                  setSearchInput(topic.q);
                  setPage(1);
                  setActiveQuery(topic.q);
                }}
                className={`cursor-pointer text-[var(--color-one-text-muted)] underline-offset-4 transition hover:text-[var(--color-one-accent)] hover:underline ${
                  topicIsAr ? 'font-arabic-ui text-sm leading-normal' : 'text-xs'
                }`}
              >
                {topic.label}
              </button>
            );
          })}
          {activeQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setActiveQuery('');
                setPage(1);
              }}
              className="cursor-pointer text-xs font-medium text-[var(--color-one-accent)] hover:underline"
            >
              清除筛选
            </button>
          )}
        </div>
      </section>

      {statusNotice && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-one-accent)]/30 bg-[var(--color-one-accent)]/8 px-4 py-3 text-xs text-[var(--color-one-text)]">
          <span>{statusNotice.text}</span>
          <div className="flex items-center gap-2">
            {statusNotice.showShelfLink && (
              <button
                type="button"
                onClick={onGoToShelf}
                className="cursor-pointer rounded-lg bg-[var(--color-one-accent)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
              >
                去书架查看
              </button>
            )}
            <button
              type="button"
              onClick={() => setStatusNotice(null)}
              className="cursor-pointer text-[11px] text-[var(--color-one-text-muted)] hover:text-[var(--color-one-text)]"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-2xl border border-rose-500/30 bg-rose-500/8 px-4 py-3 text-xs text-rose-600 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Clean Editorial Books Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-48 animate-pulse rounded-2xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] p-5"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)] px-6 py-14 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-[var(--color-one-text-dim)]" />
          <p className="text-sm font-semibold text-[var(--color-one-text)]">暂未检索到匹配的书籍</p>
          <p className="mx-auto mt-1.5 max-w-md text-xs text-[var(--color-one-text-muted)]">
            可切换语言筛选或选择「全球全部」，也可直接导入本地 PDF / Markdown 到书架阅读。
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2.5">
            <a
              href={noorBookSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-one-accent)] px-4 py-2 text-xs font-semibold text-white"
            >
              <span>在 مكتبة النور 检索</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setActiveQuery('');
                setPage(1);
              }}
              className="cursor-pointer rounded-xl border border-[var(--color-one-border-strong)] px-4 py-2 text-xs text-[var(--color-one-text)] hover:bg-[var(--color-one-surface-soft)]"
            >
              查看全部书目
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
                  className="flex flex-col justify-between rounded-2xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] p-5 transition hover:border-[var(--color-one-border-strong)] hover:shadow-sm"
                >
                  <div>
                    <div className="mb-2.5 flex items-center justify-between gap-2 text-[11px] text-[var(--color-one-text-dim)]">
                      <span className="truncate font-medium text-[var(--color-one-accent)]">
                        {isOnShelf ? '已在原文书架' : item.sourceName}
                      </span>
                      <span className="shrink-0 font-mono text-[10px]">
                        {pdfAtt ? `PDF${pdfAtt.size ? ` · ${pdfAtt.size}` : ''}` : item.textUrl ? '全文' : '原版'}
                      </span>
                    </div>

                    <h3
                      dir={isArabic ? 'rtl' : 'ltr'}
                      lang={item.language}
                      className={`line-clamp-2 font-semibold text-[var(--color-one-text)] ${
                        isArabic ? 'font-arabic-book text-right text-[18px] leading-[1.9]' : 'text-[15px] leading-snug'
                      }`}
                    >
                      {item.title}
                    </h3>

                    <p
                      dir={isArabic ? 'rtl' : 'ltr'}
                      lang={isArabic ? 'ar' : undefined}
                      className={`mt-1 line-clamp-1 text-[var(--color-one-text-muted)] ${
                        isArabic ? 'font-arabic-ui text-right text-[13px] leading-[1.75]' : 'text-xs'
                      }`}
                    >
                      {item.author}
                    </p>

                    {item.description && (
                      <p
                        dir={isArabic ? 'rtl' : 'ltr'}
                        lang={isArabic ? 'ar' : undefined}
                        className={`mt-2 line-clamp-3 text-[var(--color-one-text-dim)] ${
                          isArabic ? 'font-arabic-ui text-right text-[13px] leading-[1.85]' : 'text-xs leading-relaxed'
                        }`}
                      >
                        {item.description}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 space-y-2.5 border-t border-[var(--color-one-border)] pt-3.5">
                    <div className="flex items-center gap-2">
                      {isOnShelf ? (
                        <button
                          type="button"
                          onClick={onGoToShelf}
                          className="inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[var(--color-one-accent)]/40 bg-[var(--color-one-accent)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--color-one-accent)] transition hover:bg-[var(--color-one-accent)]/18"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>已在书架</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDownloadToShelf(item)}
                          disabled={savingId === item.id}
                          className="inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[var(--color-one-accent)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-55"
                        >
                          {savingId === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <BookMarked className="h-3.5 w-3.5" />
                          )}
                          <span>{savingId === item.id ? '下载中…' : '下载到书架'}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => void handleOpenItemReader(item)}
                        className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-1 rounded-xl border border-[var(--color-one-border-strong)] bg-[var(--color-one-surface-soft)] px-3.5 py-1.5 text-xs font-medium text-[var(--color-one-text)] transition hover:border-[var(--color-one-accent)]"
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
                          className="inline-flex items-center gap-1 transition hover:text-[var(--color-one-text)]"
                        >
                          <Download className="h-3 w-3" />
                          <span>下载原文件</span>
                        </a>
                      ) : (
                        <span />
                      )}
                      {item.sourcePageUrl && (
                        <a
                          href={item.sourcePageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 transition hover:text-[var(--color-one-text)]"
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
                className="inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] px-4 py-2 text-xs font-medium text-[var(--color-one-text)] transition hover:border-[var(--color-one-border-strong)] disabled:opacity-35"
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
                className="inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-xl border border-[var(--color-one-border)] bg-[var(--color-one-surface)] px-4 py-2 text-xs font-medium text-[var(--color-one-text)] transition hover:border-[var(--color-one-border-strong)]"
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
