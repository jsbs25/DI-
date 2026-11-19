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
  Film,
  Headphones,
  Link2,
  Loader2,
  Play,
  Search,
  Upload,
  X,
} from 'lucide-react';
import type { Book, BookShelfItem, Language } from '../../types/index.ts';

export type IslamicContentCategory =
  | 'books'
  | 'quran'
  | 'audios'
  | 'videos'
  | 'articles'
  | 'khotab'
  | 'fatwa'
  | 'showall';

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
  contentType: Exclude<IslamicContentCategory, 'showall'>;
  source: 'islamhouse' | 'archive' | 'local_vault' | 'noor_link';
  sourceName: string;
  pdfUrl?: string;
  streamUrl?: string;
  downloadUrl?: string;
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

const CONTENT_TABS: Array<{ id: IslamicContentCategory; label: string; countHint: string }> = [
  { id: 'books', label: '电子书 PDF', countHint: '5,099+' },
  { id: 'quran', label: '古兰经诵读', countHint: '180 部' },
  { id: 'audios', label: '有声讲座', countHint: '3,841+' },
  { id: 'videos', label: '视频讲堂', countHint: '844+' },
  { id: 'articles', label: '精选文章', countHint: '1,673+' },
  { id: 'khotab', label: '主麻演讲词', countHint: '286+' },
  { id: 'fatwa', label: '教法问答', countHint: '482+' },
  { id: 'showall', label: '全部资源', countHint: '12,724+' },
];

const LANG_TABS: Array<{ id: 'ar' | 'zh' | 'en' | 'all'; label: string }> = [
  { id: 'ar', label: 'العربية 阿语' },
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
  { id: 'all', label: '全部' },
];

const QUICK_TOPICS: Array<{ label: string; q: string; lang: 'ar' | 'zh' | 'en' | 'all'; category: IslamicContentCategory }> = [
  { label: 'حصن المسلم', q: 'حصن المسلم', lang: 'ar', category: 'books' },
  { label: 'القرآن الكريم', q: '', lang: 'ar', category: 'quran' },
  { label: 'السيرة النبوية', q: 'السيرة', lang: 'ar', category: 'books' },
  { label: 'صحيح البخاري', q: 'البخاري', lang: 'ar', category: 'books' },
  { label: '穆斯林的堡垒', q: '穆斯林', lang: 'zh', category: 'books' },
  { label: '中文古兰经音频', q: '', lang: 'zh', category: 'audios' },
  { label: '中文视频讲堂', q: '', lang: 'zh', category: 'videos' },
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
  const [selectedCategory, setSelectedCategory] = useState<IslamicContentCategory>('books');
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
  const [savedMap, setSavedMap] = useState<Record<string, { localPdfUrl?: string; book: Book }>>({});
  const [statusNotice, setStatusNotice] = useState<{ text: string; showShelfLink?: boolean } | null>(null);

  const [uploading, setUploading] = useState(false);
  const [showUrlImport, setShowUrlImport] = useState(false);
  const [directPdfUrl, setDirectPdfUrl] = useState('');
  const [directPdfTitle, setDirectPdfTitle] = useState('');
  const [activeMediaModal, setActiveMediaModal] = useState<{
    kind: 'audio' | 'video';
    title: string;
    author: string;
    tracks: IslamicAttachmentItem[];
    activeIndex: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCatalog = async (
    q: string,
    langCode: 'ar' | 'zh' | 'en' | 'all',
    category: IslamicContentCategory,
    pageNum: number
  ) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        lang: langCode,
        type: category,
        page: String(pageNum),
        limit: '24',
      });
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/library/islamic/books?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || '伊斯兰书库加载失败，请稍后重试。');
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotalItems(Number(data.totalItems || 0));
      if (data.noorBookSearchUrl) setNoorBookSearchUrl(data.noorBookSearchUrl);
    } catch (err: any) {
      setError(err?.message || '网络连接异常，未能加载伊斯兰书库。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCatalog(activeQuery, selectedLang, selectedCategory, page);
  }, [activeQuery, selectedLang, selectedCategory, page]);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setPage(1);
    setActiveQuery(searchInput.trim());
  };

  // Primary requested action: Download PDF (or Islamic resource) directly onto the website's Bookshelf ("我的书架")
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
          title: item.title,
          author: item.author,
          description: item.description,
          fullText: item.fullText,
          language: item.language,
          contentType: item.contentType,
          attachments: item.attachments,
          sourcePageUrl: item.sourcePageUrl,
          coverImage: item.coverImage,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data.book) {
        setStatusNotice({
          text: data?.error || '下载到书架失败，您仍可直接在线阅读或下载到本机。',
        });
        return;
      }
      setSavedMap((prev) => ({
        ...prev,
        [item.id]: { localPdfUrl: data.localPdfUrl, book: data.book },
      }));
      onBookSavedToShelf(data.book, data.shelfItem);
      setStatusNotice({
        text: item.pdfUrl
          ? `已将《${item.title}》完整 PDF 下载到你的网站书架！随时打开「我的书架」即可秒开阅读。`
          : `已将《${item.title}》保存到你的网站书架！`,
        showShelfLink: true,
      });
    } catch (err: any) {
      setStatusNotice({ text: err?.message || '下载到书架失败，请稍后重试。' });
    } finally {
      setSavingId(null);
    }
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
      setStatusNotice({ text: '支持导入 .pdf、.md（Markdown）或 .txt 书籍文件到网站书架。' });
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
        setStatusNotice({ text: data?.error || '导入到书架失败，请重试。' });
        return;
      }

      onBookSavedToShelf(data.book, data.shelfItem);
      setStatusNotice({
        text: `已将《${data.book.title}》直接导入你的网站书架！`,
        showShelfLink: true,
      });
      void fetchCatalog(activeQuery, selectedLang, selectedCategory, page);
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

  const handleOpenDirectUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = directPdfUrl.trim();
    if (!raw || !/^https?:\/\//i.test(raw)) {
      setStatusNotice({
        text: '请输入以 https:// 开头的 PDF 直链（支持 IslamHouse、Archive.org、Waqfeya、Shamela）。',
      });
      return;
    }
    const label = directPdfTitle.trim() || 'مكتبة النور · PDF 典籍';
    const stream = `/api/library/pdf-stream?url=${encodeURIComponent(raw)}&filename=${encodeURIComponent(label)}`;
    onOpenPdf({ url: stream, title: label, sourceUrl: raw });
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
      {/* Top editorial action bar */}
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
            <span>查看我的书架</span>
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
            <span>{uploading ? '正在导入书架…' : '导入本地 PDF / Markdown 到书架'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowUrlImport((v) => !v)}
            className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-one-border)] bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-[var(--color-one-text-muted)] transition hover:border-[var(--color-one-border-strong)] hover:text-white"
          >
            <Link2 className="h-3.5 w-3.5" />
            <span>PDF 链接直开</span>
          </button>

          <a
            href={noorBookSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-amber-500/35 bg-amber-500/12 px-3.5 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/20"
          >
            <span>前往 مكتبة النور 官网</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Hero Header */}
      <section className="mb-6 rounded-[28px] border border-[var(--color-one-border)] bg-gradient-to-br from-[#0e1824] via-[#0b131e] to-[#0a1019] p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-emerald-300/90">
              NOOR &amp; ISLAMIC FULL-MEDIA DIGITAL ARCHIVE
            </p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2
                dir="rtl"
                lang="ar"
                className="font-serif text-3xl font-bold tracking-tight text-white sm:text-4xl"
              >
                مكتبة النور
              </h2>
              <span className="text-lg font-semibold text-white/90 sm:text-xl">
                伊斯兰全媒体书库（PDF · 古兰经 · 音频 · 视频 · 文章 · 问答）
              </span>
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-[var(--color-one-text-muted)] sm:text-sm">
              完整打通 12,724+ 伊斯兰真实馆藏（PDF / DOCX / Markdown / MP3 诵读 / MP4 讲堂 / 教法问答 / 主麻演讲）。点击 <strong className="text-emerald-200">「下载 PDF 到书架」</strong> 即可直接下载并固定到你网站的 <strong className="text-white">「我的书架」</strong>，随时打开即看。
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-4 border-t border-white/10 pt-3 lg:border-t-0 lg:pt-0">
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-one-text-dim)]">当前分类资源</div>
              <div className="mt-0.5 text-xl font-semibold tabular-nums text-white">
                {totalItems > 0 ? totalItems.toLocaleString() : '5,099+'}
              </div>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-one-text-dim)]">书架直存</div>
              <div className="mt-0.5 text-xs font-medium text-emerald-300">一键下载到我的书架</div>
            </div>
          </div>
        </div>

        {/* All Islamic Content Type Tabs */}
        <div className="mt-5 flex flex-wrap gap-1.5 border-t border-white/10 pt-4">
          {CONTENT_TABS.map((tab) => {
            const active = selectedCategory === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(tab.id);
                  setPage(1);
                }}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                  active
                    ? 'border-emerald-400/60 bg-emerald-500 text-[#04140e] font-semibold'
                    : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-white/25 hover:bg-white/[0.07] hover:text-white'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] tabular-nums ${active ? 'text-[#04140e]/75' : 'text-slate-400'}`}>
                  {tab.countHint}
                </span>
              </button>
            );
          })}
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
              <span>立即打开 PDF</span>
            </button>
          </form>
        )}

        {/* Search & Language controls */}
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={handleSearchSubmit} className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-one-text-dim)]" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              dir={containsArabic(searchInput) ? 'rtl' : 'auto'}
              placeholder="输入阿语或中文书名/主题（例如：حصن المسلم、القرآن、السيرة、穆斯林、古兰经）..."
              className="w-full rounded-2xl border border-[var(--color-one-border)] bg-[rgba(7,11,18,0.85)] py-3 pl-10 pr-24 text-sm text-white placeholder:text-[var(--color-one-text-dim)] focus:border-emerald-400/50 focus:outline-none"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-[#05120e] transition hover:brightness-110"
            >
              检索
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
                  className={`cursor-pointer rounded-xl border px-3 py-2 text-xs font-medium transition ${
                    active
                      ? 'border-emerald-400/50 bg-emerald-500/18 text-white'
                      : 'border-[var(--color-one-border)] bg-white/[0.02] text-[var(--color-one-text-muted)] hover:bg-white/[0.05] hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Topic Shortcuts */}
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] text-[var(--color-one-text-dim)]">热门直达：</span>
          {QUICK_TOPICS.map((topic) => (
            <button
              key={topic.label}
              type="button"
              onClick={() => {
                setSelectedCategory(topic.category);
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
              清除搜索 · 浏览全部
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
                立即打开我的书架
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

      {/* Results Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-56 animate-pulse rounded-2xl border border-[var(--color-one-border)] bg-white/[0.03] p-4"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-[var(--color-one-border-strong)] bg-white/[0.02] px-6 py-14 text-center">
          <FileText className="mx-auto mb-3 h-9 w-9 text-[var(--color-one-text-dim)]" />
          <p className="text-sm font-semibold text-white">当前条件下暂未匹配到结果</p>
          <p className="mx-auto mt-1.5 max-w-md text-xs text-[var(--color-one-text-muted)]">
            您可以切换上方内容分类（电子书/古兰经/音频/视频/文章）或语言，也可以前往 مكتبة النور 官网下载后点击右上角导入书架。
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
              浏览全部资源
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
              const audioTracks = (item.attachments || []).filter((a) => a.type === 'MP3');
              const videoTracks = (item.attachments || []).filter((a) => a.type === 'MP4');
              const otherDocs = (item.attachments || []).filter(
                (a) => a.type !== 'PDF' && a.type !== 'MP3' && a.type !== 'MP4'
              );
              const pdfReadUrl = savedEntry?.localPdfUrl || pdfAtt?.streamUrl || (item.pdfUrl ? item.streamUrl : undefined);
              const primaryDownloadUrl = pdfAtt?.downloadUrl || item.downloadUrl;

              return (
                <article
                  key={item.id}
                  className="flex flex-col justify-between rounded-2xl border border-[var(--color-one-border)] bg-[rgba(12,18,28,0.78)] p-4 transition hover:border-emerald-400/35 hover:bg-[rgba(16,24,36,0.92)]"
                >
                  <div>
                    <div className="mb-2.5 flex items-center justify-between gap-2 text-[10px]">
                      <span className="truncate font-medium text-emerald-300/90">
                        {isOnShelf ? '已在我的书架 · 秒开' : item.sourceName}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        {pdfAtt && (
                          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/12 px-1.5 py-0.5 font-mono text-[10px] text-emerald-200">
                            PDF{pdfAtt.size ? ` · ${pdfAtt.size}` : ''}
                          </span>
                        )}
                        {audioTracks.length > 0 && (
                          <span className="rounded-md border border-sky-500/30 bg-sky-500/12 px-1.5 py-0.5 font-mono text-[10px] text-sky-200">
                            MP3 ×{audioTracks.length}
                          </span>
                        )}
                        {videoTracks.length > 0 && (
                          <span className="rounded-md border border-amber-500/30 bg-amber-500/12 px-1.5 py-0.5 font-mono text-[10px] text-amber-200">
                            MP4
                          </span>
                        )}
                        {otherDocs.slice(0, 1).map((doc, idx) => (
                          <span
                            key={idx}
                            className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-slate-300"
                          >
                            {doc.type}
                          </span>
                        ))}
                      </div>
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

                  {/* Action Buttons — Primary hero action: Download PDF straight to website Bookshelf! */}
                  <div className="mt-4 space-y-2 border-t border-white/8 pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {isOnShelf ? (
                        <button
                          type="button"
                          onClick={onGoToShelf}
                          className="inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-emerald-400/50 bg-emerald-500/18 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/28"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>已下载到书架 · 去查看</span>
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
                          <span>
                            {savingId === item.id
                              ? '正在下载到书架…'
                              : item.pdfUrl
                                ? '下载 PDF 到书架'
                                : '下载到我的书架'}
                          </span>
                        </button>
                      )}

                      {pdfReadUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenPdf({
                              url: pdfReadUrl,
                              title: item.title,
                              sourceUrl: item.sourcePageUrl,
                            })
                          }
                          className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-1 rounded-xl border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/[0.12]"
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                          <span>立即看</span>
                        </button>
                      )}

                      {audioTracks.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setActiveMediaModal({
                              kind: 'audio',
                              title: item.title,
                              author: item.author,
                              tracks: audioTracks,
                              activeIndex: 0,
                            })
                          }
                          className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-1 rounded-xl border border-sky-400/35 bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-100 transition hover:bg-sky-500/25"
                        >
                          <Headphones className="h-3.5 w-3.5" />
                          <span>听音频</span>
                        </button>
                      )}

                      {videoTracks.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setActiveMediaModal({
                              kind: 'video',
                              title: item.title,
                              author: item.author,
                              tracks: videoTracks,
                              activeIndex: 0,
                            })
                          }
                          className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-1 rounded-xl border border-amber-400/35 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-500/25"
                        >
                          <Film className="h-3.5 w-3.5" />
                          <span>看视频</span>
                        </button>
                      )}
                    </div>

                    {/* Secondary format row: Direct local device downloads (PDF / DOCX / MP3 / MP4 / Origin) */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-one-text-dim)]">
                      {primaryDownloadUrl && (
                        <a
                          href={primaryDownloadUrl}
                          download
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
                        >
                          <Download className="h-3 w-3" />
                          <span>存到本机 ({pdfAtt ? 'PDF' : item.attachments[0]?.type || '文件'})</span>
                        </a>
                      )}
                      {otherDocs.slice(0, 2).map((doc, idx) => (
                        <a
                          key={idx}
                          href={doc.downloadUrl}
                          download
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
                        >
                          <Download className="h-3 w-3" />
                          <span>{doc.type}</span>
                        </a>
                      ))}
                      {item.sourcePageUrl && (
                        <a
                          href={item.sourcePageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-slate-400 transition hover:text-white"
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

          {/* Pagination */}
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

      {/* Inline Islamic Audio / Quran Recitation / Video Player Modal */}
      {activeMediaModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
        >
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-[#0d1420] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-white">{activeMediaModal.title}</h3>
                <p className="truncate text-xs text-slate-400">
                  {activeMediaModal.author} · 共 {activeMediaModal.tracks.length}{' '}
                  {activeMediaModal.kind === 'audio' ? '段音频' : '段视频'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveMediaModal(null)}
                className="cursor-pointer rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5">
              {activeMediaModal.kind === 'audio' ? (
                <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                  <p className="mb-2 text-xs font-medium text-emerald-200">
                    正在播放：{activeMediaModal.tracks[activeMediaModal.activeIndex]?.description || `第 ${activeMediaModal.activeIndex + 1} 节`}
                  </p>
                  <audio
                    key={activeMediaModal.tracks[activeMediaModal.activeIndex]?.streamUrl}
                    src={activeMediaModal.tracks[activeMediaModal.activeIndex]?.streamUrl}
                    controls
                    autoPlay
                    className="w-full"
                  />
                  <div className="mt-3 flex justify-end">
                    <a
                      href={activeMediaModal.tracks[activeMediaModal.activeIndex]?.downloadUrl}
                      download
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>下载当前 MP3</span>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
                  <video
                    key={activeMediaModal.tracks[activeMediaModal.activeIndex]?.streamUrl}
                    src={activeMediaModal.tracks[activeMediaModal.activeIndex]?.streamUrl}
                    controls
                    autoPlay
                    className="max-h-[52vh] w-full"
                  />
                  <div className="flex justify-end border-t border-white/10 bg-[#0c121c] p-3">
                    <a
                      href={activeMediaModal.tracks[activeMediaModal.activeIndex]?.downloadUrl}
                      download
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>下载当前 MP4</span>
                    </a>
                  </div>
                </div>
              )}
            </div>

            {activeMediaModal.tracks.length > 1 && (
              <div className="min-h-0 flex-1 overflow-y-auto border-t border-white/10 px-5 py-3">
                <p className="mb-2 text-[11px] font-medium text-slate-400">章节 / 音频列表</p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {activeMediaModal.tracks.map((tr, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveMediaModal((prev) => (prev ? { ...prev, activeIndex: idx } : null))}
                      className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${
                        idx === activeMediaModal.activeIndex
                          ? 'border-emerald-400/50 bg-emerald-500/18 text-white'
                          : 'border-white/8 bg-white/[0.02] text-slate-300 hover:bg-white/[0.06]'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Play className="h-3 w-3 shrink-0" />
                        <span className="truncate">{tr.description || `第 ${idx + 1} 节`}</span>
                      </span>
                      {tr.size && <span className="shrink-0 font-mono text-[10px] opacity-70">{tr.size}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
