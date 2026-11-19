import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  FolderPlus,
  Link2,
  Loader2,
  Search,
  Upload,
} from 'lucide-react';
import type { Book, Language } from '../../types/index.ts';

export interface IslamicPdfBookItem {
  id: string;
  title: string;
  author: string;
  description: string;
  language: 'ar' | 'zh' | 'en';
  source: 'islamhouse' | 'archive' | 'local_vault' | 'noor_link';
  sourceName: string;
  pdfUrl: string;
  streamUrl: string;
  downloadUrl: string;
  sourcePageUrl: string;
  fileSize?: string;
  coverImage?: string;
  year?: string;
  savedBookId?: string;
}

interface NoorIslamicPdfPortalProps {
  lang: Language;
  initialQuery?: string;
  onBack: () => void;
  onOpenPdf: (payload: { url: string; title: string; sourceUrl?: string }) => void;
  onBookSaved: (book: Book) => void;
}

const LANG_TABS: Array<{ id: 'ar' | 'zh' | 'en' | 'all'; label: string; sub: string }> = [
  { id: 'ar', label: 'العربية', sub: '阿语典籍 5,099+' },
  { id: 'zh', label: '中文经典', sub: '汉语 PDF' },
  { id: 'en', label: 'English', sub: '英文 PDF' },
  { id: 'all', label: '全部语言', sub: '混合书库' },
];

const QUICK_TOPICS: Array<{ label: string; q: string; lang: 'ar' | 'zh' | 'en' | 'all' }> = [
  { label: 'حصن المسلم', q: 'حصن المسلم', lang: 'ar' },
  { label: 'القرآن الكريم', q: 'القرآن', lang: 'ar' },
  { label: 'السيرة النبوية', q: 'السيرة', lang: 'ar' },
  { label: 'صحيح البخاري', q: 'البخاري', lang: 'ar' },
  { label: 'تفسير', q: 'تفسير', lang: 'ar' },
  { label: '穆斯林的堡垒', q: '穆斯林', lang: 'zh' },
  { label: '古兰经', q: '古兰经', lang: 'zh' },
];

function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

export const NoorIslamicPdfPortal: React.FC<NoorIslamicPdfPortalProps> = ({
  initialQuery = '',
  onBack,
  onOpenPdf,
  onBookSaved,
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
  const [savedMap, setSavedMap] = useState<Record<string, { localPdfUrl: string; bookId: string }>>({});
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [showUrlImport, setShowUrlImport] = useState(false);
  const [directPdfUrl, setDirectPdfUrl] = useState('');
  const [directPdfTitle, setDirectPdfTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCatalog = async (q: string, langCode: 'ar' | 'zh' | 'en' | 'all', pageNum: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        lang: langCode,
        page: String(pageNum),
        limit: '24',
      });
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/library/islamic/books?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || '伊斯兰 PDF 书库加载失败，请稍后重试。');
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotalItems(Number(data.totalItems || 0));
      if (data.noorBookSearchUrl) setNoorBookSearchUrl(data.noorBookSearchUrl);
    } catch (err: any) {
      setError(err?.message || '网络连接异常，未能加载伊斯兰 PDF 书库。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCatalog(activeQuery, selectedLang, page);
  }, [activeQuery, selectedLang, page]);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setPage(1);
    setActiveQuery(searchInput.trim());
  };

  const handleSaveToVault = async (item: IslamicPdfBookItem) => {
    if (savingId) return;
    setSavingId(item.id);
    setStatusNotice(null);
    try {
      const res = await fetch('/api/library/islamic/save-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfUrl: item.pdfUrl,
          title: item.title,
          author: item.author,
          description: item.description,
          language: item.language,
          sourcePageUrl: item.sourcePageUrl,
          coverImage: item.coverImage,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data.book) {
        setStatusNotice(data?.error || '缓存 PDF 失败，您仍可直接在线阅读或下载到设备。');
        return;
      }
      setSavedMap((prev) => ({
        ...prev,
        [item.id]: { localPdfUrl: data.localPdfUrl, bookId: data.book.id },
      }));
      onBookSaved(data.book);
      setStatusNotice(`已将《${item.title}》离线保存到 ONE 本地书库，随时秒开。`);
    } catch (err: any) {
      setStatusNotice(err?.message || '保存失败，请稍后重试。');
    } finally {
      setSavingId(null);
    }
  };

  const handleLocalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setStatusNotice('请选择标准 .pdf 格式的书籍文件。');
      return;
    }
    if (file.size > 44 * 1024 * 1024) {
      setStatusNotice('单个 PDF 文件不能超过 44MB。');
      return;
    }

    setUploading(true);
    setStatusNotice(null);
    try {
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('读取本地 PDF 失败'));
        reader.readAsDataURL(file);
      });

      const derivedTitle = file.name.replace(/\.pdf$/i, '').trim();
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
        setStatusNotice(data?.error || '导入 PDF 失败，请重试。');
        return;
      }

      onBookSaved(data.book);
      setStatusNotice(`已导入《${data.book.title}》到 ONE 本地书库，正在打开阅读器…`);
      void fetchCatalog(activeQuery, selectedLang, page);
      onOpenPdf({
        url: data.localPdfUrl,
        title: data.book.title,
        sourceUrl: 'https://www.noor-book.com/',
      });
    } catch (err: any) {
      setStatusNotice(err?.message || '导入 PDF 失败。');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleOpenDirectUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = directPdfUrl.trim();
    if (!raw || !/^https?:\/\//i.test(raw)) {
      setStatusNotice('请输入以 https:// 开头的 PDF 直链（支持 IslamHouse、Archive.org、Waqfeya 等开放书库）。');
      return;
    }
    const label = directPdfTitle.trim() || 'مكتبة النور · PDF 阅读';
    const stream = `/api/library/pdf-stream?url=${encodeURIComponent(raw)}&filename=${encodeURIComponent(label)}`;
    onOpenPdf({ url: stream, title: label, sourceUrl: raw });
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
      {/* Top editorial bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-one-border)] bg-white/[0.02] px-3.5 py-2 text-xs font-medium text-[var(--color-one-text-muted)] transition hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.05] hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>返回数字图书馆</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
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
            <span>{uploading ? '正在导入 PDF…' : '导入本地 PDF（Noor 书库）'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowUrlImport((v) => !v)}
            className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-one-border)] bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-[var(--color-one-text-muted)] transition hover:border-[var(--color-one-border-strong)] hover:text-white"
          >
            <Link2 className="h-3.5 w-3.5" />
            <span>PDF 直链打开</span>
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
              NOOR &amp; ISLAMIC DIGITAL PDF ARCHIVE
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
                伊斯兰 PDF 典籍书库
              </span>
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-[var(--color-one-text-muted)] sm:text-sm">
              直连开放伊斯兰官方 PDF 书库接口（IslamHouse 5,099+ 阿/中/英真 PDF + Internet Archive 古籍 PDF），支持在 ONE 站内直接翻页阅读、一键下载 PDF 及离线存入书库；同时支持将您从 <span className="text-amber-200">noor-book.com</span> 下载的任意 PDF 直接导入阅读器。
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-4 border-t border-white/10 pt-3 lg:border-t-0 lg:pt-0">
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-one-text-dim)]">在线可直读 PDF</div>
              <div className="mt-0.5 text-xl font-semibold tabular-nums text-white">
                {totalItems > 0 ? totalItems.toLocaleString() : '5,099+'}
              </div>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-one-text-dim)]">阅读与下载</div>
              <div className="mt-0.5 text-xs font-medium text-emerald-300">站内无跨域直读 · 一键保存</div>
            </div>
          </div>
        </div>

        {/* Optional direct PDF link bar */}
        {showUrlImport && (
          <form
            onSubmit={handleOpenDirectUrl}
            className="mt-5 grid grid-cols-1 gap-2.5 rounded-2xl border border-white/10 bg-black/30 p-3.5 sm:grid-cols-[1.5fr_1fr_auto]"
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
        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={handleSearchSubmit} className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-one-text-dim)]" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              dir={containsArabic(searchInput) ? 'rtl' : 'auto'}
              placeholder="输入阿拉伯语或中文书名/作者（例如：حصن المسلم、القرآن、السيرة、穆斯林、古兰经）..."
              className="w-full rounded-2xl border border-[var(--color-one-border)] bg-[rgba(7,11,18,0.85)] py-3 pl-10 pr-24 text-sm text-white placeholder:text-[var(--color-one-text-dim)] focus:border-emerald-400/50 focus:outline-none"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-[#05120e] transition hover:brightness-110"
            >
              检索 PDF
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
                  className={`cursor-pointer rounded-xl border px-3 py-2 text-left transition ${
                    active
                      ? 'border-emerald-400/50 bg-emerald-500/18 text-white'
                      : 'border-[var(--color-one-border)] bg-white/[0.02] text-[var(--color-one-text-muted)] hover:bg-white/[0.05] hover:text-white'
                  }`}
                >
                  <div className="text-xs font-semibold leading-tight">{tab.label}</div>
                  <div className="text-[10px] opacity-75">{tab.sub}</div>
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
              清除筛选 · 浏览全部
            </button>
          )}
        </div>
      </section>

      {statusNotice && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100">
          <span>{statusNotice}</span>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="cursor-pointer text-[11px] text-emerald-200/80 hover:text-white"
          >
            关闭
          </button>
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
              className="h-52 animate-pulse rounded-2xl border border-[var(--color-one-border)] bg-white/[0.03] p-4"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-[var(--color-one-border-strong)] bg-white/[0.02] px-6 py-14 text-center">
          <FileText className="mx-auto mb-3 h-9 w-9 text-[var(--color-one-text-dim)]" />
          <p className="text-sm font-semibold text-white">当前关键词暂未在开放 PDF 接口匹配到结果</p>
          <p className="mx-auto mt-1.5 max-w-md text-xs text-[var(--color-one-text-muted)]">
            您可以直接前往 مكتبة النور 官网搜索该书，下载 PDF 后点击右上角「导入本地 PDF」，即可立即在 ONE 站内永久保存并翻阅。
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
              浏览全部 5,099+ PDF 书目
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const isArabic = item.language === 'ar' || containsArabic(item.title);
              const savedEntry = savedMap[item.id];
              const isSaved = Boolean(savedEntry || item.savedBookId || item.source === 'local_vault');
              const readUrl = savedEntry?.localPdfUrl || item.streamUrl;

              return (
                <article
                  key={item.id}
                  className="flex flex-col justify-between rounded-2xl border border-[var(--color-one-border)] bg-[rgba(12,18,28,0.78)] p-4 transition hover:border-emerald-400/35 hover:bg-[rgba(16,24,36,0.92)]"
                >
                  <div>
                    <div className="mb-2.5 flex items-center justify-between gap-2 text-[10px]">
                      <span className="truncate font-medium text-emerald-300/90">
                        {item.source === 'local_vault' ? 'ONE 本地 PDF 书库' : item.sourceName}
                      </span>
                      <span className="shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-slate-300">
                        PDF{item.fileSize ? ` · ${item.fileSize}` : ''}
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

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/8 pt-3">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenPdf({
                          url: readUrl,
                          title: item.title,
                          sourceUrl: item.sourcePageUrl,
                        })
                      }
                      className="inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-[#04140e] transition hover:brightness-110"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>直接阅读</span>
                    </button>

                    <a
                      href={item.downloadUrl}
                      download
                      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-white/[0.1]"
                      title="直接下载 PDF 到设备"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>下载 PDF</span>
                    </a>

                    {isSaved ? (
                      <span className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-200">
                        <Check className="h-3.5 w-3.5" />
                        <span>已存书库</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSaveToVault(item)}
                        disabled={savingId === item.id}
                        className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-xl border border-white/12 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition hover:border-white/25 hover:text-white disabled:opacity-50"
                        title="离线保存到 ONE 书库"
                      >
                        {savingId === item.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FolderPlus className="h-3.5 w-3.5" />
                        )}
                        <span>{savingId === item.id ? '保存中…' : '存入书库'}</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Pagination (when browsing live IslamHouse catalog) */}
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
