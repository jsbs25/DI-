import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import type { store as appStore } from './store.ts';
import type { Book } from '../src/types/index.ts';

type DataStore = typeof appStore;

const ISLAMHOUSE_API_BASE = 'https://api3.islamhouse.com/v3/paV29H2gm56kvLPy/main';
const PDF_VAULT_DIR = path.resolve(process.cwd(), 'data', 'pdfs');

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
    // Block loopback/private IPs explicitly
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

function buildStreamUrl(pdfUrl: string, title: string, download = false): string {
  if (pdfUrl.startsWith('/api/library/local-pdfs/')) {
    return download ? `${pdfUrl}?download=1&filename=${encodeURIComponent(title)}` : pdfUrl;
  }
  const params = new URLSearchParams({ url: pdfUrl });
  if (title) params.set('filename', title.slice(0, 80));
  if (download) params.set('download', '1');
  return `/api/library/pdf-stream?${params.toString()}`;
}

function sanitizePdfFilename(raw: string): string {
  const cleaned = raw
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 72)
    .trim();
  const base = cleaned || 'islamic_book';
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

function buildContentDisposition(rawFilename: string, wantsDownload: boolean): string {
  const utf8Name = sanitizePdfFilename(rawFilename);
  const asciiBase = utf8Name
    .replace(/\.pdf$/i, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/["\\;]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  const asciiFallback = `${asciiBase || 'islamic_book'}.pdf`;
  return `${wantsDownload ? 'attachment' : 'inline'}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(utf8Name)}`;
}

// 10-minute in-memory cache per (lang, page)
const islamHouseCache = new Map<string, { expiresAt: number; totalItems: number; items: IslamicPdfBookItem[] }>();

async function fetchIslamHousePage(
  lang: 'ar' | 'zh' | 'en',
  page = 1,
  limit = 20
): Promise<{ items: IslamicPdfBookItem[]; totalItems: number }> {
  const safePage = Math.max(1, Math.min(200, Math.floor(page)));
  const safeLimit = Math.max(5, Math.min(40, Math.floor(limit)));
  const cacheKey = `${lang}:${safePage}:${safeLimit}`;
  const cached = islamHouseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { items: cached.items, totalItems: cached.totalItems };
  }

  const url = `${ISLAMHOUSE_API_BASE}/books/${lang}/${lang}/${safePage}/${safeLimit}/json`;
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
    const attachments = Array.isArray(row?.attachments) ? row.attachments : [];
    const pdfAtt = attachments.find(
      (a: any) =>
        String(a?.extension_type || '').toUpperCase() === 'PDF' &&
        typeof a?.url === 'string' &&
        a.url.startsWith('http')
    );
    if (!pdfAtt) continue;

    const title = String(row.title || '').trim() || 'كتاب إسلامي';
    const authors = Array.isArray(row.prepared_by)
      ? row.prepared_by
          .map((p: any) => String(p?.title || '').trim())
          .filter(Boolean)
          .join(' · ')
      : '';
    const pdfUrl = String(pdfAtt.url).trim();
    const id = `ih_${lang}_${row.id || crypto.createHash('md5').update(pdfUrl).digest('hex').slice(0, 8)}`;

    items.push({
      id,
      title,
      author: authors || (lang === 'zh' ? '伊斯兰学者' : lang === 'en' ? 'Islamic Scholars' : 'علماء ومؤلفون'),
      description: String(row.description || '').trim().slice(0, 260),
      language: lang,
      source: 'islamhouse',
      sourceName: lang === 'zh' ? 'IslamHouse 伊斯兰官方 PDF 库' : 'مكتبة دار الإسلام · PDF',
      pdfUrl,
      streamUrl: buildStreamUrl(pdfUrl, title, false),
      downloadUrl: buildStreamUrl(pdfUrl, title, true),
      sourcePageUrl: `https://islamhouse.com/${lang}/books/${row.id || ''}`,
      fileSize: typeof pdfAtt.size === 'string' ? pdfAtt.size : undefined,
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

/**
 * Searches Internet Archive Arabic & Islamic collections and resolves each item's
 * REAL .pdf file URL from /metadata/{identifier}/files (never guessing broken URLs).
 */
async function searchArchiveIslamicPdfs(query: string, limit = 8): Promise<IslamicPdfBookItem[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const encodedQ = encodeURIComponent(
      `(${q}) AND mediatype:texts AND format:"Text PDF" AND (language:ara OR language:Arabic OR subject:Islam OR subject:Arabic OR collection:islamic_library OR collection:arabic_books)`
    );
    const searchUrl = `https://archive.org/advancedsearch.php?q=${encodedQ}&fl[]=identifier,title,creator,description,year,language&rows=${Math.min(12, limit)}&output=json`;
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'EarthOne-Library/1.0 (+https://earthone.world)' },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    const docs: any[] = Array.isArray(json?.response?.docs) ? json.response.docs : [];
    if (docs.length === 0) return [];

    // Resolve actual PDF filenames in parallel (max 6 to keep response super snappy)
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
          // Pick cleanest PDF file (prefer non-text-encrypted PDFs under 80MB)
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

          return {
            id: `ia_pdf_${identifier}`,
            title,
            author,
            description: String(doc.description || 'كتاب إسلامي وتراثي بصيغة PDF متاح للقراءة والتحميل المباشر.').slice(0, 240),
            language: 'ar',
            source: 'archive',
            sourceName: 'Internet Archive · مكتبة التراث PDF',
            pdfUrl,
            streamUrl: buildStreamUrl(pdfUrl, title, false),
            downloadUrl: buildStreamUrl(pdfUrl, title, true),
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
  page?: number;
  limit?: number;
  store: DataStore;
}): Promise<{
  items: IslamicPdfBookItem[];
  totalItems: number;
  page: number;
  noorBookSearchUrl: string;
  sources: Array<{ id: string; name: string; count: number; status: 'ok' | 'limited' }>;
}> {
  const q = (opts.query || '').trim();
  const langPref = opts.lang || 'ar';
  const page = Math.max(1, opts.page || 1);
  const limit = Math.max(6, Math.min(36, opts.limit || 20));
  const noorBookSearchUrl = q
    ? `https://www.noor-book.com/?search_for=${encodeURIComponent(q)}`
    : 'https://www.noor-book.com/';

  // Index local PDF books already saved in our backend vault
  const savedLocalPdfs: IslamicPdfBookItem[] = (opts.store.books || [])
    .filter((b) => b.formatType === 'pdf' && typeof b.externalReadUrl === 'string' && b.externalReadUrl.startsWith('/api/library/local-pdfs/'))
    .map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      description: b.description || '已下载并缓存在本地书库的 PDF 电子书，支持秒开阅读。',
      language: (b.language === 'zh' || b.language === 'en' ? b.language : 'ar') as 'ar' | 'zh' | 'en',
      source: 'local_vault',
      sourceName: '已下载到本地书库 · 秒开',
      pdfUrl: b.externalReadUrl!,
      streamUrl: b.externalReadUrl!,
      downloadUrl: buildStreamUrl(b.externalReadUrl!, b.title, true),
      sourcePageUrl: b.sourceUrl || b.externalReadUrl!,
      coverImage: b.coverImage || '/assets/library/cover-arabian-nights.jpg',
      savedBookId: b.id,
    }));

  const savedByUrl = new Map<string, string>();
  for (const b of opts.store.books || []) {
    if (b.sourceUrl) savedByUrl.set(b.sourceUrl, b.id);
  }

  let ihItems: IslamicPdfBookItem[] = [];
  let ihTotal = 0;
  let archiveItems: IslamicPdfBookItem[] = [];

  if (!q) {
    // Direct browse mode: fetch live official IslamHouse PDF catalog
    if (langPref === 'all') {
      const [arRes, zhRes] = await Promise.all([
        fetchIslamHousePage('ar', page, Math.ceil(limit * 0.65)).catch(() => ({ items: [], totalItems: 0 })),
        fetchIslamHousePage('zh', page, Math.ceil(limit * 0.35)).catch(() => ({ items: [], totalItems: 0 })),
      ]);
      ihItems = [...arRes.items, ...zhRes.items];
      ihTotal = arRes.totalItems + zhRes.totalItems;
    } else {
      const res = await fetchIslamHousePage(langPref, page, limit).catch(() => ({ items: [], totalItems: 0 }));
      ihItems = res.items;
      ihTotal = res.totalItems;
    }
  } else {
    // Search mode: search IslamHouse recent pages + live Archive.org Islamic PDF index in parallel
    const qLower = q.toLowerCase();
    const targetLangs: Array<'ar' | 'zh' | 'en'> =
      langPref === 'all' ? ['ar', 'zh'] : [langPref];

    const [ihPages, iaResults] = await Promise.all([
      Promise.all(
        targetLangs.flatMap((l) => [
          fetchIslamHousePage(l, 1, 30).catch(() => ({ items: [], totalItems: 0 })),
          fetchIslamHousePage(l, 2, 30).catch(() => ({ items: [], totalItems: 0 })),
        ])
      ),
      searchArchiveIslamicPdfs(q, 8),
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
    ? savedLocalPdfs.filter(
        (b) =>
          b.title.toLowerCase().includes(q.toLowerCase()) ||
          b.author.toLowerCase().includes(q.toLowerCase()) ||
          b.description.toLowerCase().includes(q.toLowerCase())
      )
    : savedLocalPdfs;

  const merged = [...filteredLocal, ...archiveItems, ...ihItems].map((item) => ({
    ...item,
    savedBookId: item.savedBookId || savedByUrl.get(item.sourcePageUrl) || savedByUrl.get(item.pdfUrl),
  }));

  // Deduplicate by pdfUrl
  const seen = new Set<string>();
  const deduped: IslamicPdfBookItem[] = [];
  for (const item of merged) {
    if (seen.has(item.pdfUrl)) continue;
    seen.add(item.pdfUrl);
    deduped.push(item);
  }

  return {
    items: deduped.slice(0, limit),
    totalItems: Math.max(ihTotal, deduped.length),
    page,
    noorBookSearchUrl,
    sources: [
      { id: 'islamhouse', name: 'IslamHouse 伊斯兰 PDF 官方接口 (5,099+)', count: ihItems.length, status: 'ok' },
      { id: 'archive', name: 'Internet Archive 伊斯兰古籍 PDF', count: archiveItems.length, status: 'ok' },
      { id: 'local_vault', name: '已保存到本地书库的 PDF', count: filteredLocal.length, status: 'ok' },
    ],
  };
}

export function registerNoorIslamicLibraryRoutes(app: Express, store: DataStore): void {
  fs.mkdirSync(PDF_VAULT_DIR, { recursive: true });

  // 1. Browse & Search Islamic PDF Books (IslamHouse Official API + Archive.org PDFs + Local Vault)
  app.get('/api/library/islamic/books', async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const rawLang = typeof req.query.lang === 'string' ? req.query.lang.trim().toLowerCase() : 'ar';
      const lang: 'ar' | 'zh' | 'en' | 'all' =
        rawLang === 'zh' || rawLang === 'en' || rawLang === 'all' ? rawLang : 'ar';
      const page = Number(req.query.page || 1) || 1;
      const limit = Number(req.query.limit || 20) || 20;

      const result = await queryNoorIslamicPdfs({ query: q, lang, page, limit, store });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(502).json({
        success: false,
        error: err?.message || '伊斯兰 PDF 书库检索失败，请稍后重试。',
      });
    }
  });

  // 2. CORS-free Same-Origin PDF Streaming & Direct Download Proxy
  app.get('/api/library/pdf-stream', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const wantsDownload = req.query.download === '1' || req.query.download === 'true';
    const rawFilename = typeof req.query.filename === 'string' ? req.query.filename.trim() : '';

    if (!rawUrl || !isAllowedPdfRemoteUrl(rawUrl)) {
      return res.status(400).json({
        success: false,
        error: '仅允许代理受信任的伊斯兰与开放图书馆 HTTPS PDF 链接。',
      });
    }

    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'application/pdf,*/*;q=0.8',
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
          error: `远程 PDF 来源返回状态 ${upstream.status}，请尝试前往原站查看。`,
        });
      }

      const ct = (upstream.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) {
        return res.status(422).json({
          success: false,
          error: '该来源返回了网页验证页而非直接 PDF 文件，请先在原站下载 PDF 后直接拖入 ONE 阅读。',
        });
      }

      res.status(upstream.status);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Accept-Ranges', 'bytes');

      const contentLen = upstream.headers.get('content-length');
      if (contentLen) res.setHeader('Content-Length', contentLen);
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) res.setHeader('Content-Range', contentRange);

      const rawBase = rawFilename || path.basename(new URL(rawUrl).pathname) || 'book.pdf';
      res.setHeader('Content-Disposition', buildContentDisposition(rawBase, wantsDownload));

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
          error: `PDF 读取超时或连接中断：${err?.message || '未知错误'}`,
        });
      } else {
        res.end();
      }
    }
  });

  // 3. Download Remote PDF into Local Server Vault & Register in Digital Library
  app.post('/api/library/islamic/save-pdf', async (req: Request, res: Response) => {
    const { pdfUrl, title, author, description, language, sourcePageUrl, coverImage } = req.body || {};
    if (typeof pdfUrl !== 'string' || !isAllowedPdfRemoteUrl(pdfUrl)) {
      return res.status(400).json({ success: false, error: '无效或不受信任的 PDF 下载地址。' });
    }

    try {
      const upstream = await fetch(pdfUrl, {
        headers: {
          'User-Agent': 'EarthOne-Library/1.0 (+https://earthone.world)',
          Accept: 'application/pdf,*/*',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(30000),
      });
      if (!upstream.ok) {
        return res.status(502).json({ success: false, error: `下载失败 (HTTP ${upstream.status})` });
      }
      const ct = (upstream.headers.get('content-type') || '').toLowerCase();
      const buf = Buffer.from(await upstream.arrayBuffer());
      if (ct.includes('text/html') || buf.byteLength < 1024 || !buf.subarray(0, 8).toString('ascii').includes('%PDF')) {
        return res.status(422).json({
          success: false,
          error: '远程地址未返回有效的 PDF 文件（可能受网站防爬限制），建议下载后通过「导入本地 PDF」直接加入书库。',
        });
      }
      if (buf.byteLength > 45 * 1024 * 1024) {
        return res.status(413).json({ success: false, error: '该 PDF 超过 45MB 离线缓存上限，可直接在线流式阅读或直接下载到设备。' });
      }

      const hash = crypto.createHash('sha1').update(pdfUrl).digest('hex').slice(0, 12);
      const filename = `islamic_${hash}.pdf`;
      const targetPath = path.join(PDF_VAULT_DIR, filename);
      fs.writeFileSync(targetPath, buf);

      const localUrl = `/api/library/local-pdfs/${filename}`;
      const existing = store.books.find((b) => b.externalReadUrl === localUrl || b.sourceUrl === (sourcePageUrl || pdfUrl));
      if (existing) {
        return res.json({
          success: true,
          book: existing,
          localPdfUrl: localUrl,
          downloadUrl: `${localUrl}?download=1&filename=${encodeURIComponent(existing.title)}`,
          sizeBytes: buf.byteLength,
        });
      }

      const bookId = `book_pdf_${hash}`;
      const newBook: Book = {
        id: bookId,
        title: String(title || 'كتاب إسلامي PDF').trim().slice(0, 180),
        author: String(author || 'علماء التراث الإسلامي').trim().slice(0, 120),
        category: 'islamic_studies',
        language: language === 'zh' || language === 'en' ? language : 'ar',
        year: new Date().getFullYear().toString(),
        source: 'Open Access',
        sourceUrl: typeof sourcePageUrl === 'string' && sourcePageUrl ? sourcePageUrl : pdfUrl,
        externalReadUrl: localUrl,
        formatType: 'pdf',
        textAvailability: 'full_text',
        coverImage: typeof coverImage === 'string' && coverImage.startsWith('/') ? coverImage : '/assets/library/cover-arabian-nights.jpg',
        description: String(description || '已离线缓存到 ONE 本地书库的伊斯兰 PDF 电子书，随时直接翻阅与下载。').slice(0, 400),
        readProgress: 0,
        chapters: [],
      };

      store.books.unshift(newBook);
      store.saveToDisk();

      return res.json({
        success: true,
        book: newBook,
        localPdfUrl: localUrl,
        downloadUrl: `${localUrl}?download=1&filename=${encodeURIComponent(newBook.title)}`,
        sizeBytes: buf.byteLength,
      });
    } catch (err: any) {
      return res.status(502).json({ success: false, error: err?.message || 'PDF 保存失败，请稍后重试。' });
    }
  });

  // 4. Upload a Local PDF (e.g. downloaded directly from noor-book.com) into ONE's Library Vault
  app.post('/api/library/islamic/upload-pdf', (req: Request, res: Response) => {
    const { title, author, language, fileBase64, filename: originalFilename } = req.body || {};
    if (typeof fileBase64 !== 'string' || fileBase64.length < 100) {
      return res.status(400).json({ success: false, error: '请选择有效的 PDF 文件。' });
    }
    try {
      const cleanB64 = fileBase64.replace(/^data:application\/pdf;base64,/, '').trim();
      const buf = Buffer.from(cleanB64, 'base64');
      if (buf.byteLength < 512 || !buf.subarray(0, 8).toString('ascii').includes('%PDF')) {
        return res.status(400).json({ success: false, error: '上传的文件不是标准 PDF 格式。' });
      }
      if (buf.byteLength > 45 * 1024 * 1024) {
        return res.status(413).json({ success: false, error: '单个 PDF 文件不能超过 45MB。' });
      }

      const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);
      const storedFilename = `noor_upload_${hash}.pdf`;
      fs.writeFileSync(path.join(PDF_VAULT_DIR, storedFilename), buf);

      const localUrl = `/api/library/local-pdfs/${storedFilename}`;
      const derivedTitle =
        String(title || '').trim() ||
        String(originalFilename || 'مكتبة النور · كتاب PDF').replace(/\.pdf$/i, '').trim();

      const newBook: Book = {
        id: `book_noor_${hash}`,
        title: derivedTitle.slice(0, 180),
        author: String(author || 'مكتبة النور · 导入书库').trim().slice(0, 120),
        category: 'islamic_studies',
        language: language === 'zh' || language === 'en' ? language : 'ar',
        year: new Date().getFullYear().toString(),
        source: 'Open Access',
        sourceUrl: 'https://www.noor-book.com/',
        externalReadUrl: localUrl,
        formatType: 'pdf',
        textAvailability: 'full_text',
        coverImage: '/assets/library/cover-arabian-nights.jpg',
        description: '已导入 ONE 本地书库的 PDF 典籍，支持站内 Apple 风格 PDF 阅读器直接翻页、检索与随时导出。',
        readProgress: 0,
        chapters: [],
      };

      const existingIdx = store.books.findIndex((b) => b.id === newBook.id);
      if (existingIdx !== -1) store.books[existingIdx] = newBook;
      else store.books.unshift(newBook);
      store.saveToDisk();

      return res.json({
        success: true,
        book: newBook,
        localPdfUrl: localUrl,
        downloadUrl: `${localUrl}?download=1&filename=${encodeURIComponent(newBook.title)}`,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'PDF 导入失败' });
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
    res.setHeader('Content-Disposition', buildContentDisposition(requestedName, wantsDownload));
    return res.sendFile(filePath);
  });
}
