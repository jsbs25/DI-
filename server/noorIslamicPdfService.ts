import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import type { store as appStore } from './store.ts';
import type { Book, User } from '../src/types/index.ts';

type DataStore = typeof appStore;

const ISLAMHOUSE_API_BASE = 'https://api3.islamhouse.com/v3/paV29H2gm56kvLPy/main';
const PDF_VAULT_DIR = path.resolve(process.cwd(), 'data', 'pdfs');

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
  type: string; // PDF | DOCX | MP3 | MP4 | EPUB | TXT | MD
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
  /** Primary PDF URL if available */
  pdfUrl?: string;
  streamUrl?: string;
  downloadUrl?: string;
  /** All attachments (PDF, DOCX, MP3, MP4, etc.) */
  attachments: IslamicAttachmentItem[];
  sourcePageUrl: string;
  fileSize?: string;
  coverImage?: string;
  year?: string;
  savedBookId?: string;
  onShelf?: boolean;
}

const ALLOWED_PDF_HOST_SUFFIXES = [
  'islamhouse.com',
  'archive.org',
  'waqfeya.net',
  'noor-book.com',
  'gutenberg.org',
  'wikimedia.org',
  'shamela.ws',
];

export function isAllowedPdfRemoteUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      /^169\.254\./.test(host)
    ) {
      return false;
    }
    return ALLOWED_PDF_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

function guessExtension(rawUrl: string, explicitExt?: string): string {
  if (explicitExt && /^[a-z0-9]{2,6}$/i.test(explicitExt)) return explicitExt.toLowerCase();
  try {
    const pathname = new URL(rawUrl).pathname;
    const m = pathname.match(/\.([a-z0-9]{2,6})$/i);
    if (m?.[1]) return m[1].toLowerCase();
  } catch {}
  return 'pdf';
}

function mimeTypeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'pdf':
      return 'application/pdf';
    case 'mp3':
      return 'audio/mpeg';
    case 'mp4':
      return 'video/mp4';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'doc':
      return 'application/msword';
    case 'epub':
      return 'application/epub+zip';
    case 'md':
    case 'markdown':
      return 'text/markdown; charset=utf-8';
    case 'txt':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function buildStreamUrl(rawUrl: string, title: string, download = false, ext = 'pdf'): string {
  if (rawUrl.startsWith('/api/library/local-pdfs/')) {
    return download ? `${rawUrl}?download=1&filename=${encodeURIComponent(title)}` : rawUrl;
  }
  const params = new URLSearchParams({ url: rawUrl, ext });
  if (title) params.set('filename', title.slice(0, 80));
  if (download) params.set('download', '1');
  return `/api/library/pdf-stream?${params.toString()}`;
}

function sanitizeFilename(raw: string, ext = 'pdf'): string {
  const safeExt = /^[a-z0-9]{2,6}$/i.test(ext) ? ext.toLowerCase() : 'pdf';
  const cleaned = raw
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 72)
    .trim();
  const base = cleaned || 'islamic_resource';
  return base.toLowerCase().endsWith(`.${safeExt}`) ? base : `${base}.${safeExt}`;
}

function buildContentDisposition(rawFilename: string, wantsDownload: boolean, ext = 'pdf'): string {
  const utf8Name = sanitizeFilename(rawFilename, ext);
  const safeExt = /^[a-z0-9]{2,6}$/i.test(ext) ? ext.toLowerCase() : 'pdf';
  const asciiBase = utf8Name
    .replace(new RegExp(`\\.${safeExt}$`, 'i'), '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/["\\;]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  const asciiFallback = `${asciiBase || 'islamic_resource'}.${safeExt}`;
  return `${wantsDownload ? 'attachment' : 'inline'}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(utf8Name)}`;
}

function normalizeContentType(raw?: string): IslamicContentCategory {
  const v = String(raw || 'books').toLowerCase().trim();
  if (['books', 'quran', 'audios', 'videos', 'articles', 'khotab', 'fatwa', 'showall'].includes(v)) {
    return v as IslamicContentCategory;
  }
  return 'books';
}

function mapIslamHouseItemType(rawType: string | undefined, fallback: IslamicContentCategory): Exclude<IslamicContentCategory, 'showall'> {
  const t = String(rawType || '').toLowerCase();
  if (t.includes('book')) return 'books';
  if (t.includes('quran')) return 'quran';
  if (t.includes('audio')) return 'audios';
  if (t.includes('video')) return 'videos';
  if (t.includes('article')) return 'articles';
  if (t.includes('khotb') || t.includes('khotab')) return 'khotab';
  if (t.includes('fatwa')) return 'fatwa';
  return fallback === 'showall' ? 'books' : fallback;
}

const islamHouseCache = new Map<string, { expiresAt: number; totalItems: number; items: IslamicPdfBookItem[] }>();

async function fetchIslamHousePage(
  category: IslamicContentCategory,
  lang: 'ar' | 'zh' | 'en',
  page = 1,
  limit = 20
): Promise<{ items: IslamicPdfBookItem[]; totalItems: number }> {
  const safePage = Math.max(1, Math.min(200, Math.floor(page)));
  const safeLimit = Math.max(5, Math.min(40, Math.floor(limit)));
  const cacheKey = `${category}:${lang}:${safePage}:${safeLimit}`;
  const cached = islamHouseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { items: cached.items, totalItems: cached.totalItems };
  }

  const url = `${ISLAMHOUSE_API_BASE}/${category}/${lang}/${lang}/${safePage}/${safeLimit}/json`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'EarthOne-Library/1.0 (+https://earthone.world)',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`IslamHouse API returned ${res.status}`);
  }
  const data: any = await res.json();
  const rows = Array.isArray(data?.data) ? data.data : [];
  const totalItems = Number(data?.links?.total_items || rows.length);

  const items: IslamicPdfBookItem[] = [];
  for (const row of rows) {
    const title = String(row.title || '').trim() || 'مورد إسلامي';
    const contentType = mapIslamHouseItemType(row.type, category);
    const rawAttachments = Array.isArray(row?.attachments) ? row.attachments : [];

    const attachments: IslamicAttachmentItem[] = rawAttachments
      .filter((a: any) => typeof a?.url === 'string' && a.url.startsWith('http'))
      .slice(0, 120)
      .map((a: any) => {
        const extType = String(a.extension_type || guessExtension(a.url)).toUpperCase();
        const ext = extType.toLowerCase();
        const attUrl = String(a.url).trim();
        const attLabel = String(a.description || title).trim();
        return {
          type: extType,
          url: attUrl,
          streamUrl: buildStreamUrl(attUrl, attLabel, false, ext),
          downloadUrl: buildStreamUrl(attUrl, attLabel, true, ext),
          size: typeof a.size === 'string' ? a.size : undefined,
          description: typeof a.description === 'string' && a.description.trim() ? a.description.trim() : undefined,
        };
      });

    // Skip book rows with zero attachments and no text
    const desc = String(row.description || '').trim();
    const fullText = String(row.full_description || '').trim();
    if (category === 'books' && attachments.length === 0 && !fullText) continue;

    const pdfAtt = attachments.find((a) => a.type === 'PDF');
    const primaryAtt = pdfAtt || attachments[0];
    const authors = Array.isArray(row.prepared_by)
      ? row.prepared_by
          .map((p: any) => String(p?.title || '').trim())
          .filter(Boolean)
          .join(' · ')
      : '';

    const id = `ih_${contentType}_${lang}_${row.id || crypto.createHash('md5').update(title).digest('hex').slice(0, 8)}`;
    const sourceLabelMap: Record<Exclude<IslamicContentCategory, 'showall'>, string> = {
      books: lang === 'zh' ? 'IslamHouse 伊斯兰官方 PDF 书库' : 'مكتبة دار الإسلام · كتب PDF',
      quran: lang === 'zh' ? '《古兰经》完整诵读库' : 'المصحف المرتل · تلاوات MP3',
      audios: lang === 'zh' ? '伊斯兰音频讲座库' : 'الصوتيات الإسلامية · MP3',
      videos: lang === 'zh' ? '伊斯兰视频讲堂' : 'المرئيات الإسلامية · MP4',
      articles: lang === 'zh' ? '伊斯兰精选文章库' : 'المقالات الإسلامية',
      khotab: lang === 'zh' ? '主麻演讲词库' : 'خطب الجمعة · PDF/DOCX',
      fatwa: lang === 'zh' ? '伊斯兰教法问答' : 'الفتاوى الشرعية',
    };

    items.push({
      id,
      title,
      author: authors || (lang === 'zh' ? '伊斯兰学者' : lang === 'en' ? 'Islamic Scholars' : 'علماء ومؤلفون'),
      description: desc.slice(0, 280),
      fullText: fullText || undefined,
      language: lang,
      contentType,
      source: 'islamhouse',
      sourceName: sourceLabelMap[contentType],
      pdfUrl: pdfAtt?.url,
      streamUrl: primaryAtt?.streamUrl,
      downloadUrl: primaryAtt?.downloadUrl,
      attachments,
      sourcePageUrl: `https://islamhouse.com/${lang}/${contentType}/${row.id || ''}`,
      fileSize: primaryAtt?.size,
      coverImage: '/assets/library/cover-arabian-nights.jpg',
    });
  }

  islamHouseCache.set(cacheKey, {
    expiresAt: Date.now() + 10 * 60 * 1000,
    totalItems,
    items,
  });

  return { items, totalItems };
}

async function searchArchiveIslamicPdfs(query: string, limit = 6): Promise<IslamicPdfBookItem[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const encodedQ = encodeURIComponent(
      `(${q}) AND mediatype:texts AND format:"Text PDF" AND (language:ara OR language:Arabic OR subject:Islam OR subject:Arabic OR collection:islamic_library OR collection:arabic_books)`
    );
    const searchUrl = `https://archive.org/advancedsearch.php?q=${encodedQ}&fl[]=identifier,title,creator,description,year,language&rows=${Math.min(10, limit)}&output=json`;
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'EarthOne-Library/1.0 (+https://earthone.world)' },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    const docs: any[] = Array.isArray(json?.response?.docs) ? json.response.docs : [];
    if (docs.length === 0) return [];

    const resolved = await Promise.all(
      docs.slice(0, 6).map(async (doc): Promise<IslamicPdfBookItem | null> => {
        const identifier = String(doc.identifier || '').trim();
        if (!identifier) return null;
        try {
          const metaRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}/files`, {
            headers: { 'User-Agent': 'EarthOne-Library/1.0' },
            signal: AbortSignal.timeout(5500),
          });
          if (!metaRes.ok) return null;
          const meta: any = await metaRes.json();
          const files: any[] = Array.isArray(meta?.result) ? meta.result : [];
          const pdfFile = files.find(
            (f) =>
              typeof f?.name === 'string' &&
              /\.pdf$/i.test(f.name) &&
              !/encrypted/i.test(String(f.format || ''))
          );
          if (!pdfFile) return null;

          const pdfUrl = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(pdfFile.name)}`;
          const title = String(doc.title || identifier).trim();
          const author = Array.isArray(doc.creator)
            ? doc.creator.join(' · ')
            : String(doc.creator || 'المكتبة التراثية الإسلامية');
          const sizeBytes = Number(pdfFile.size || 0);
          const fileSize =
            sizeBytes > 1024 * 1024
              ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
              : sizeBytes > 1024
                ? `${Math.round(sizeBytes / 1024)} KB`
                : undefined;

          const streamUrl = buildStreamUrl(pdfUrl, title, false, 'pdf');
          const downloadUrl = buildStreamUrl(pdfUrl, title, true, 'pdf');
          return {
            id: `ia_pdf_${identifier}`,
            title,
            author,
            description: String(doc.description || 'كتاب إسلامي وتراثي بصيغة PDF متاح للقراءة والتحميل المباشر.').slice(0, 240),
            language: 'ar',
            contentType: 'books',
            source: 'archive',
            sourceName: 'Internet Archive · مكتبة التراث PDF',
            pdfUrl,
            streamUrl,
            downloadUrl,
            attachments: [{ type: 'PDF', url: pdfUrl, streamUrl, downloadUrl, size: fileSize }],
            sourcePageUrl: `https://archive.org/details/${encodeURIComponent(identifier)}`,
            fileSize,
            coverImage: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
            year: doc.year ? String(doc.year) : undefined,
          };
        } catch {
          return null;
        }
      })
    );

    return resolved.filter((x): x is IslamicPdfBookItem => Boolean(x));
  } catch {
    return [];
  }
}

export async function queryNoorIslamicPdfs(opts: {
  query?: string;
  lang?: 'ar' | 'zh' | 'en' | 'all';
  category?: IslamicContentCategory;
  page?: number;
  limit?: number;
  store: DataStore;
  userId?: string;
}): Promise<{
  items: IslamicPdfBookItem[];
  totalItems: number;
  page: number;
  category: IslamicContentCategory;
  noorBookSearchUrl: string;
  sources: Array<{ id: string; name: string; count: number; status: 'ok' | 'limited' }>;
}> {
  const q = (opts.query || '').trim();
  const langPref = opts.lang || 'ar';
  const category = normalizeContentType(opts.category);
  const page = Math.max(1, opts.page || 1);
  const limit = Math.max(6, Math.min(36, opts.limit || 24));
  const noorBookSearchUrl = q
    ? `https://www.noor-book.com/?search_for=${encodeURIComponent(q)}`
    : 'https://www.noor-book.com/';

  const userShelf = opts.store.getBookShelf(opts.userId || 'guest');
  const shelfBookIds = new Set(userShelf.map((s) => s.bookId));

  const savedByUrl = new Map<string, string>();
  for (const b of opts.store.books || []) {
    if (b.sourceUrl) savedByUrl.set(b.sourceUrl, b.id);
    if (b.externalReadUrl) savedByUrl.set(b.externalReadUrl, b.id);
  }

  // Local Islamic vault books (PDF / Markdown / Saved Islamic content)
  const savedLocalItems: IslamicPdfBookItem[] =
    category === 'books' || category === 'showall'
      ? (opts.store.books || [])
          .filter(
            (b: Book) =>
              b.category === 'islamic_studies' &&
              (b.formatType === 'pdf' || b.id.startsWith('book_pdf_') || b.id.startsWith('book_noor_') || b.id.startsWith('book_islamic_'))
          )
          .map((b: Book) => {
            const isLocalPdf = typeof b.externalReadUrl === 'string' && b.externalReadUrl.startsWith('/api/library/local-pdfs/');
            const dlUrl = isLocalPdf ? buildStreamUrl(b.externalReadUrl!, b.title, true, 'pdf') : undefined;
            return {
              id: b.id,
              title: b.title,
              author: b.author,
              description: b.description || '已下载并保存在 ONE 网站书架的伊斯兰典籍，随时秒开阅读。',
              language: (b.language === 'zh' || b.language === 'en' ? b.language : 'ar') as 'ar' | 'zh' | 'en',
              contentType: 'books' as const,
              source: 'local_vault' as const,
              sourceName: shelfBookIds.has(b.id) ? '已下载到我的书架 · 秒开' : '已保存到本地书库',
              pdfUrl: isLocalPdf ? b.externalReadUrl : undefined,
              streamUrl: isLocalPdf ? b.externalReadUrl : undefined,
              downloadUrl: dlUrl,
              attachments: isLocalPdf
                ? [{ type: 'PDF', url: b.externalReadUrl!, streamUrl: b.externalReadUrl!, downloadUrl: dlUrl! }]
                : [],
              sourcePageUrl: b.sourceUrl || b.externalReadUrl || '',
              coverImage: b.coverImage || '/assets/library/cover-arabian-nights.jpg',
              savedBookId: b.id,
              onShelf: shelfBookIds.has(b.id),
            };
          })
      : [];

  let ihItems: IslamicPdfBookItem[] = [];
  let ihTotal = 0;
  let archiveItems: IslamicPdfBookItem[] = [];

  if (!q) {
    if (langPref === 'all') {
      const [arRes, zhRes] = await Promise.all([
        fetchIslamHousePage(category, 'ar', page, Math.ceil(limit * 0.65)).catch(() => ({ items: [], totalItems: 0 })),
        fetchIslamHousePage(category, 'zh', page, Math.ceil(limit * 0.35)).catch(() => ({ items: [], totalItems: 0 })),
      ]);
      ihItems = [...arRes.items, ...zhRes.items];
      ihTotal = arRes.totalItems + zhRes.totalItems;
    } else {
      // Note: some categories like quran/fatwa/khotab have richest catalog in Arabic; if zh/en returns 0, gently fall back to ar
      let res = await fetchIslamHousePage(category, langPref, page, limit).catch(() => ({ items: [], totalItems: 0 }));
      if (res.items.length === 0 && langPref !== 'ar') {
        res = await fetchIslamHousePage(category, 'ar', page, limit).catch(() => ({ items: [], totalItems: 0 }));
      }
      ihItems = res.items;
      ihTotal = res.totalItems;
    }
  } else {
    const qLower = q.toLowerCase();
    const targetLangs: Array<'ar' | 'zh' | 'en'> = langPref === 'all' ? ['ar', 'zh'] : [langPref];

    const [ihPages, iaResults] = await Promise.all([
      Promise.all(
        targetLangs.flatMap((l) => [
          fetchIslamHousePage(category, l, 1, 30).catch(() => ({ items: [], totalItems: 0 })),
          fetchIslamHousePage(category, l, 2, 30).catch(() => ({ items: [], totalItems: 0 })),
        ])
      ),
      category === 'books' || category === 'showall' ? searchArchiveIslamicPdfs(q, 6) : Promise.resolve([]),
    ]);

    const pool = ihPages.flatMap((p) => p.items);
    ihItems = pool.filter(
      (b) =>
        b.title.toLowerCase().includes(qLower) ||
        b.author.toLowerCase().includes(qLower) ||
        b.description.toLowerCase().includes(qLower)
    );
    archiveItems = iaResults;
    ihTotal = ihItems.length + archiveItems.length;
  }

  const filteredLocal = q
    ? savedLocalItems.filter(
        (b) =>
          b.title.toLowerCase().includes(q.toLowerCase()) ||
          b.author.toLowerCase().includes(q.toLowerCase()) ||
          b.description.toLowerCase().includes(q.toLowerCase())
      )
    : savedLocalItems;

  const merged = [...filteredLocal, ...archiveItems, ...ihItems].map((item) => {
    const savedId =
      item.savedBookId ||
      (item.sourcePageUrl ? savedByUrl.get(item.sourcePageUrl) : undefined) ||
      (item.pdfUrl ? savedByUrl.get(item.pdfUrl) : undefined);
    return {
      ...item,
      savedBookId: savedId,
      onShelf: item.onShelf || (savedId ? shelfBookIds.has(savedId) : false),
    };
  });

  const seen = new Set<string>();
  const deduped: IslamicPdfBookItem[] = [];
  for (const item of merged) {
    const key = item.pdfUrl || item.sourcePageUrl || item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return {
    items: deduped.slice(0, limit),
    totalItems: Math.max(ihTotal, deduped.length),
    page,
    category,
    noorBookSearchUrl,
    sources: [
      { id: 'islamhouse', name: 'IslamHouse 伊斯兰全媒体官方接口', count: ihItems.length, status: 'ok' },
      { id: 'archive', name: 'Internet Archive 伊斯兰古籍 PDF', count: archiveItems.length, status: 'ok' },
      { id: 'local_vault', name: '已下载到我的书架', count: filteredLocal.length, status: 'ok' },
    ],
  };
}

export function registerNoorIslamicLibraryRoutes(
  app: Express,
  store: DataStore,
  getSessionUser?: (req: Request) => User | undefined
): void {
  fs.mkdirSync(PDF_VAULT_DIR, { recursive: true });

  const resolveShelfUserId = (req: Request): string => {
    return getSessionUser?.(req)?.id || 'guest';
  };

  // 1. Browse & Search ALL Islamic Content Categories (Books PDF, Quran MP3, Audios, Videos, Articles, Khotab, Fatwa, All)
  app.get('/api/library/islamic/books', async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const rawLang = typeof req.query.lang === 'string' ? req.query.lang.trim().toLowerCase() : 'ar';
      const lang: 'ar' | 'zh' | 'en' | 'all' =
        rawLang === 'zh' || rawLang === 'en' || rawLang === 'all' ? rawLang : 'ar';
      const category = normalizeContentType(typeof req.query.type === 'string' ? req.query.type : 'books');
      const page = Number(req.query.page || 1) || 1;
      const limit = Number(req.query.limit || 24) || 24;

      const result = await queryNoorIslamicPdfs({
        query: q,
        lang,
        category,
        page,
        limit,
        store,
        userId: resolveShelfUserId(req),
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(502).json({
        success: false,
        error: err?.message || '伊斯兰书库检索失败，请稍后重试。',
      });
    }
  });

  // 2. CORS-free Same-Origin Streaming & Direct Download Proxy (PDF, MP3, MP4, DOCX, EPUB, MD, TXT)
  app.get('/api/library/pdf-stream', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const wantsDownload = req.query.download === '1' || req.query.download === 'true';
    const rawFilename = typeof req.query.filename === 'string' ? req.query.filename.trim() : '';
    const explicitExt = typeof req.query.ext === 'string' ? req.query.ext.trim() : undefined;

    if (!rawUrl || !isAllowedPdfRemoteUrl(rawUrl)) {
      return res.status(400).json({
        success: false,
        error: '仅允许代理受信任的伊斯兰与开放图书馆 HTTPS 资源链接。',
      });
    }

    try {
      const ext = guessExtension(rawUrl, explicitExt);
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: '*/*',
      };
      if (typeof req.headers.range === 'string') {
        headers.Range = req.headers.range;
      }

      const upstream = await fetch(rawUrl, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(25000),
      });

      if (!upstream.ok && upstream.status !== 206) {
        return res.status(upstream.status).json({
          success: false,
          error: `远程来源返回状态 ${upstream.status}，请尝试前往原站查看。`,
        });
      }

      const ct = (upstream.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html') && ext === 'pdf') {
        return res.status(422).json({
          success: false,
          error: '该来源返回了网页验证页而非直接 PDF 文件，请先在原站下载后通过「导入本地 PDF」加入书架。',
        });
      }

      res.status(upstream.status);
      res.setHeader('Content-Type', ext === 'pdf' ? 'application/pdf' : ct || mimeTypeForExt(ext));
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Accept-Ranges', 'bytes');

      const contentLen = upstream.headers.get('content-length');
      if (contentLen) res.setHeader('Content-Length', contentLen);
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) res.setHeader('Content-Range', contentRange);

      const rawBase = rawFilename || path.basename(new URL(rawUrl).pathname) || `resource.${ext}`;
      res.setHeader('Content-Disposition', buildContentDisposition(rawBase, wantsDownload, ext));

      if (!upstream.body) {
        const buf = Buffer.from(await upstream.arrayBuffer());
        return res.end(buf);
      }

      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) res.write(Buffer.from(value));
      }
      res.end();
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(502).json({
          success: false,
          error: `文件读取超时或连接中断：${err?.message || '未知错误'}`,
        });
      } else {
        res.end();
      }
    }
  });

  // 3. Download PDF OR Any Islamic Content (Article / Quran / Audio / Video / Fatwa / Khotab / Markdown)
  //    Directly into Website Server Vault AND Automatically Add onto User's Bookshelf ("我的书架")!
  const handleSaveToBookshelf = async (req: Request, res: Response) => {
    const userId = resolveShelfUserId(req);
    const {
      pdfUrl,
      title,
      author,
      description,
      fullText,
      language,
      sourcePageUrl,
      coverImage,
      contentType,
      attachments,
    } = req.body || {};

    const cleanTitle = String(title || 'كتاب إسلامي').trim().slice(0, 180);
    const cleanAuthor = String(author || 'علماء التراث الإسلامي').trim().slice(0, 120);
    const cleanLang = language === 'zh' || language === 'en' ? language : 'ar';

    // Path A: Download actual PDF file into /data/pdfs/ and pin onto user's Bookshelf
    if (typeof pdfUrl === 'string' && pdfUrl.trim()) {
      // Already local? Just make sure it's on user's shelf!
      if (pdfUrl.startsWith('/api/library/local-pdfs/')) {
        const existingLocal = store.books.find((b: Book) => b.externalReadUrl === pdfUrl);
        if (existingLocal) {
          const shelfItem = store.addToBookShelf(userId, existingLocal.id, 'reading');
          return res.json({
            success: true,
            book: existingLocal,
            shelfItem,
            localPdfUrl: pdfUrl,
            downloadUrl: `${pdfUrl}?download=1&filename=${encodeURIComponent(existingLocal.title)}`,
          });
        }
      }

      if (!isAllowedPdfRemoteUrl(pdfUrl)) {
        return res.status(400).json({ success: false, error: '无效或不受信任的 PDF 下载地址。' });
      }

      try {
        const upstream = await fetch(pdfUrl, {
          headers: {
            'User-Agent': 'EarthOne-Library/1.0 (+https://earthone.world)',
            Accept: 'application/pdf,*/*',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(35000),
        });
        if (!upstream.ok) {
          return res.status(502).json({ success: false, error: `下载失败 (HTTP ${upstream.status})` });
        }
        const ct = (upstream.headers.get('content-type') || '').toLowerCase();
        const buf = Buffer.from(await upstream.arrayBuffer());
        if (ct.includes('text/html') || buf.byteLength < 1024 || !buf.subarray(0, 8).toString('ascii').includes('%PDF')) {
          return res.status(422).json({
            success: false,
            error: '远程地址未返回标准 PDF 文件（可能受防爬限制），建议下载后通过「导入本地 PDF」加入书架。',
          });
        }
        if (buf.byteLength > 45 * 1024 * 1024) {
          return res.status(413).json({
            success: false,
            error: '该 PDF 超过 45MB 书架离线存储上限，您仍可直接在线阅读或下载到本机。',
          });
        }

        const hash = crypto.createHash('sha1').update(pdfUrl).digest('hex').slice(0, 12);
        const filename = `islamic_${hash}.pdf`;
        fs.writeFileSync(path.join(PDF_VAULT_DIR, filename), buf);

        const localUrl = `/api/library/local-pdfs/${filename}`;
        let book = store.books.find(
          (b: Book) => b.externalReadUrl === localUrl || b.sourceUrl === (sourcePageUrl || pdfUrl)
        );
        if (!book) {
          book = {
            id: `book_pdf_${hash}`,
            title: cleanTitle,
            author: cleanAuthor,
            category: 'islamic_studies',
            language: cleanLang,
            year: new Date().getFullYear().toString(),
            source: 'Open Access',
            sourceUrl: typeof sourcePageUrl === 'string' && sourcePageUrl ? sourcePageUrl : pdfUrl,
            externalReadUrl: localUrl,
            formatType: 'pdf',
            textAvailability: 'full_text',
            coverImage:
              typeof coverImage === 'string' && coverImage.startsWith('/')
                ? coverImage
                : '/assets/library/cover-arabian-nights.jpg',
            description: String(
              description || '已直接下载到 ONE 网站书架的伊斯兰 PDF 典籍，随时翻页阅读或导出。'
            ).slice(0, 420),
            readProgress: 0,
            chapters: [],
          };
          store.books.unshift(book);
        }

        const shelfItem = store.addToBookShelf(userId, book.id, 'reading');
        store.saveToDisk();

        return res.json({
          success: true,
          book,
          shelfItem,
          localPdfUrl: localUrl,
          downloadUrl: `${localUrl}?download=1&filename=${encodeURIComponent(book.title)}`,
          sizeBytes: buf.byteLength,
        });
      } catch (err: any) {
        return res.status(502).json({ success: false, error: err?.message || 'PDF 下载到书架失败，请稍后重试。' });
      }
    }

    // Path B: Non-PDF Islamic content (Articles, Fatwa, Khotab, Quran MP3, Audios, Videos) -> save structured readable edition directly to Bookshelf!
    const keySeed = String(sourcePageUrl || cleanTitle);
    const hash = crypto.createHash('sha1').update(keySeed).digest('hex').slice(0, 12);
    const bookId = `book_islamic_${hash}`;

    const attLines = Array.isArray(attachments)
      ? attachments
          .slice(0, 30)
          .map((a: any, idx: number) => `${idx + 1}. [${a.type || 'FILE'}] ${a.description || cleanTitle}${a.size ? ` (${a.size})` : ''}\n${a.url || ''}`)
          .join('\n\n')
      : '';

    const bodyText = [
      String(fullText || description || '').trim(),
      attLines ? `\n\n---\n资源清单 (${String(contentType || 'islamic').toUpperCase()}):\n${attLines}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim() || `${cleanTitle}\n\n${cleanAuthor}`;

    let book = store.books.find((b: Book) => b.id === bookId);
    if (!book) {
      book = {
        id: bookId,
        title: cleanTitle,
        author: cleanAuthor,
        category: 'islamic_studies',
        language: cleanLang,
        year: new Date().getFullYear().toString(),
        source: 'Open Access',
        sourceUrl: typeof sourcePageUrl === 'string' && sourcePageUrl ? sourcePageUrl : 'https://islamhouse.com/',
        formatType: 'text',
        textAvailability: 'full_text',
        coverImage:
          typeof coverImage === 'string' && coverImage.startsWith('/')
            ? coverImage
            : '/assets/library/cover-arabian-nights.jpg',
        description: String(description || '已保存到 ONE 网站书架的伊斯兰典籍与音频/文章资料。').slice(0, 420),
        readProgress: 0,
        chapters: [
          {
            id: 'ch_main',
            title: cleanTitle,
            content: bodyText,
          },
        ],
      };
      store.books.unshift(book);
    }

    const shelfItem = store.addToBookShelf(userId, book.id, 'reading');
    store.saveToDisk();

    return res.json({
      success: true,
      book,
      shelfItem,
    });
  };

  app.post('/api/library/islamic/save-pdf', handleSaveToBookshelf);
  app.post('/api/library/islamic/save-to-shelf', handleSaveToBookshelf);

  // 4. Upload Local PDF / Markdown (.md) / Text (.txt) directly into Website Bookshelf
  app.post('/api/library/islamic/upload-pdf', (req: Request, res: Response) => {
    const userId = resolveShelfUserId(req);
    const { title, author, language, fileBase64, filename: originalFilename } = req.body || {};
    if (typeof fileBase64 !== 'string' || fileBase64.length < 16) {
      return res.status(400).json({ success: false, error: '请选择有效的 PDF、Markdown 或 TXT 书籍文件。' });
    }
    try {
      const lowerName = String(originalFilename || '').toLowerCase();
      const isTextOrMd = lowerName.endsWith('.md') || lowerName.endsWith('.markdown') || lowerName.endsWith('.txt');
      const cleanB64 = fileBase64.replace(/^data:[^;]+;base64,/, '').trim();
      const buf = Buffer.from(cleanB64, 'base64');

      if (buf.byteLength > 45 * 1024 * 1024) {
        return res.status(413).json({ success: false, error: '单个文件不能超过 45MB。' });
      }

      const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);
      const derivedTitle =
        String(title || '').trim() ||
        String(originalFilename || 'مكتبة النور · 书籍').replace(/\.(pdf|md|markdown|txt)$/i, '').trim();
      const cleanLang = language === 'zh' || language === 'en' ? language : 'ar';

      if (isTextOrMd) {
        const textContent = buf.toString('utf8').trim();
        if (!textContent) {
          return res.status(400).json({ success: false, error: '文件内容为空。' });
        }
        // Split Markdown by headings into neat Apple Books chapters
        const sections = textContent.split(/\n(?=#{1,2}\s+)/).filter((s) => s.trim().length > 0);
        const chapters = sections.slice(0, 60).map((sec, idx) => {
          const firstLine = sec.split('\n')[0].replace(/^#+\s*/, '').trim();
          const body = sec.replace(/^#+\s*[^\n]*\n?/, '').trim() || sec.trim();
          return {
            id: `ch_${idx + 1}`,
            title: firstLine || `第 ${idx + 1} 节`,
            content: body,
          };
        });

        const newBook: Book = {
          id: `book_noor_md_${hash}`,
          title: derivedTitle.slice(0, 180),
          author: String(author || 'مكتبة النور · Markdown 导入').trim().slice(0, 120),
          category: 'islamic_studies',
          language: cleanLang,
          year: new Date().getFullYear().toString(),
          source: 'Open Access',
          sourceUrl: 'https://www.noor-book.com/',
          formatType: 'text',
          textAvailability: 'full_text',
          coverImage: '/assets/library/cover-arabian-nights.jpg',
          description: textContent.slice(0, 220),
          readProgress: 0,
          chapters: chapters.length > 0 ? chapters : [{ id: 'ch_1', title: derivedTitle, content: textContent }],
        };

        const existingIdx = store.books.findIndex((b: Book) => b.id === newBook.id);
        if (existingIdx !== -1) store.books[existingIdx] = newBook;
        else store.books.unshift(newBook);
        const shelfItem = store.addToBookShelf(userId, newBook.id, 'reading');
        store.saveToDisk();

        return res.json({
          success: true,
          book: newBook,
          shelfItem,
          isTextBook: true,
        });
      }

      if (buf.byteLength < 512 || !buf.subarray(0, 8).toString('ascii').includes('%PDF')) {
        return res.status(400).json({ success: false, error: '上传的文件不是标准 PDF、Markdown 或 TXT 格式。' });
      }

      const storedFilename = `noor_upload_${hash}.pdf`;
      fs.writeFileSync(path.join(PDF_VAULT_DIR, storedFilename), buf);

      const localUrl = `/api/library/local-pdfs/${storedFilename}`;
      const newBook: Book = {
        id: `book_noor_${hash}`,
        title: derivedTitle.slice(0, 180),
        author: String(author || 'مكتبة النور · 已导入书架').trim().slice(0, 120),
        category: 'islamic_studies',
        language: cleanLang,
        year: new Date().getFullYear().toString(),
        source: 'Open Access',
        sourceUrl: 'https://www.noor-book.com/',
        externalReadUrl: localUrl,
        formatType: 'pdf',
        textAvailability: 'full_text',
        coverImage: '/assets/library/cover-arabian-nights.jpg',
        description: '已导入 ONE 网站书架的 PDF 典籍，随时直接翻页、检索与导出。',
        readProgress: 0,
        chapters: [],
      };

      const existingIdx = store.books.findIndex((b: Book) => b.id === newBook.id);
      if (existingIdx !== -1) store.books[existingIdx] = newBook;
      else store.books.unshift(newBook);
      const shelfItem = store.addToBookShelf(userId, newBook.id, 'reading');
      store.saveToDisk();

      return res.json({
        success: true,
        book: newBook,
        shelfItem,
        localPdfUrl: localUrl,
        downloadUrl: `${localUrl}?download=1&filename=${encodeURIComponent(newBook.title)}`,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || '文件导入书架失败' });
    }
  });

  // 5. Serve Locally Saved Vault PDFs (Inline Reading or Attachment Download)
  app.get('/api/library/local-pdfs/:filename', (req: Request, res: Response) => {
    const rawName = String(req.params.filename || '');
    if (!/^[a-zA-Z0-9_-]+\.pdf$/.test(rawName)) {
      return res.status(400).json({ success: false, error: 'Invalid filename' });
    }
    const filePath = path.join(PDF_VAULT_DIR, rawName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'PDF file not found' });
    }

    const wantsDownload = req.query.download === '1' || req.query.download === 'true';
    const requestedName =
      typeof req.query.filename === 'string' && req.query.filename.trim() ? req.query.filename : rawName;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Disposition', buildContentDisposition(requestedName, wantsDownload, 'pdf'));
    return res.sendFile(filePath);
  });
}
