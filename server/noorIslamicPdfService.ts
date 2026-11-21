import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import type { store as appStore } from './store.ts';
import type { Book, User } from '../src/types/index.ts';
import { oneAiRouter } from './oneAi/router.ts';
import { aiGateway } from './aiGateway.ts';
import { getGeminiClient } from './geminiClient.ts';
import { runUnifiedAiTurn } from './ai/unifiedAiCore.ts';
import { lookupAuthoritativeDictionary } from './dictionaryService.ts';

type DataStore = typeof appStore;

const ISLAMHOUSE_API_BASE = 'https://api3.islamhouse.com/v3/paV29H2gm56kvLPy/main';
const PDF_VAULT_DIR = path.resolve(process.cwd(), 'data', 'pdfs');
const VOCAB_STORE_PATH = path.resolve(process.cwd(), 'data', 'vocabulary_bank.json');

export interface SavedVocabItem {
  id: string;
  userId: string;
  word: string;
  lemma?: string;
  reading?: string;
  partOfSpeech?: string;
  root?: string;
  meaning: string;
  usage?: string;
  contextSentence?: string;
  example?: string;
  bookId?: string;
  bookTitle?: string;
  createdAt: string;
}

function readVocabBank(): SavedVocabItem[] {
  try {
    if (!fs.existsSync(VOCAB_STORE_PATH)) return [];
    const raw = fs.readFileSync(VOCAB_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeVocabBank(items: SavedVocabItem[]): void {
  try {
    fs.mkdirSync(path.dirname(VOCAB_STORE_PATH), { recursive: true });
    fs.writeFileSync(VOCAB_STORE_PATH, JSON.stringify(items.slice(0, 4000), null, 2), 'utf8');
  } catch (err) {
    console.warn('[VocabBank] write failed:', err);
  }
}

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
  source: 'islamhouse' | 'archive' | 'openlibrary' | 'gutenberg' | 'local_vault' | 'noor_link';
  sourceName: string;
  /** Primary PDF URL if available */
  pdfUrl?: string;
  streamUrl?: string;
  downloadUrl?: string;
  /** Optional plain-text / Gutenberg URL for direct full-text download into Bookshelf */
  textUrl?: string;
  /** All attachments (PDF, DOCX, EPUB, etc.) */
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
  'openlibrary.org',
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
      books: lang === 'zh' ? 'IslamHouse 伊斯兰书籍库' : 'مكتبة دار الإسلام · PDF',
      quran: lang === 'zh' ? '《古兰经》完整诵读库' : 'المصحف المرتل',
      audios: lang === 'zh' ? '伊斯兰音频讲座库' : 'الصوتيات الإسلامية',
      videos: lang === 'zh' ? '伊斯兰视频讲堂' : 'المرئيات الإسلامية',
      articles: lang === 'zh' ? '伊斯兰精选文章库' : 'المقالات الإسلامية',
      khotab: lang === 'zh' ? '主麻演讲词库' : 'خطب الجمعة',
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

/**
 * Federated Internet Archive Global Books PDF search (Arabic, Islamic, and worldwide open PDFs).
 * Resolves exact real .pdf filenames from /metadata/{id}/files.
 */
async function searchArchiveGlobalPdfBooks(query: string, limit = 8): Promise<IslamicPdfBookItem[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const encodedQ = encodeURIComponent(`(${q}) AND mediatype:texts AND format:"Text PDF"`);
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
      docs.slice(0, 7).map(async (doc): Promise<IslamicPdfBookItem | null> => {
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
          const allPdfs = files.filter(
            (f) =>
              typeof f?.name === 'string' &&
              /\.pdf$/i.test(f.name) &&
              !/encrypted/i.test(String(f.format || '')) &&
              Number(f.size || 0) > 20 * 1024
          );
          if (allPdfs.length === 0) return null;

          // Exclude 1-page cover sheets (Waqfeya / Arabic Archive.org convention: 00_xxx.pdf, 000.pdf, cover.pdf, ghilaf.pdf)
          const isCoverLike = (name: string): boolean => {
            const base = name.split('/').pop() || name;
            return (
              /^0{2,}[_\-.\s]/i.test(base) ||
              /^0+\.pdf$/i.test(base) ||
              /(^|[_\-.\s])(cover|ghilaf|front|titlepage|wagheha|fihris_00|00_cover)([_\-.\s.]|$)/i.test(base)
            );
          };

          const maxPdfSize = Math.max(...allPdfs.map((f) => Number(f.size || 0)));
          const contentPdfs = allPdfs.filter((f) => {
            if (isCoverLike(String(f.name || ''))) return false;
            // If multi-PDF archive has real volumes (> 2.5MB) and tiny stub files (< 1.4MB), skip tiny stubs
            if (maxPdfSize > 2.5 * 1024 * 1024 && Number(f.size || 0) < 1.4 * 1024 * 1024) return false;
            return true;
          });

          const candidates = contentPdfs.length > 0 ? contentPdfs : allPdfs;
          // Prefer primary readable edition (avoid duplicate *_text.pdf OCR bloat if clean primary PDF exists)
          const nonDupText = candidates.filter((f) => !/_text\.pdf$/i.test(String(f.name || '')));
          const pool = nonDupText.length > 0 ? nonDupText : candidates;
          pool.sort((a, b) =>
            String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' })
          );

          // Pick Volume 1 (or the largest single-volume file when filenames aren't numbered volumes)
          const hasNumberedVolumes = pool.length > 1 && pool.some((f) => /^(0?1|vol|juz|part|p0?1)[_\-.\s]/i.test(String(f.name || '').split('/').pop() || ''));
          const pdfFile = hasNumberedVolumes
            ? pool[0]
            : [...pool].sort((a, b) => Number(b.size || 0) - Number(a.size || 0))[0];
          if (!pdfFile) return null;

          const pdfUrl = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(pdfFile.name)}`;
          const title = String(doc.title || identifier).trim();
          const author = Array.isArray(doc.creator)
            ? doc.creator.join(' · ')
            : String(doc.creator || 'Internet Archive 全球典籍');
          const formatBytes = (bytes: number) =>
            bytes > 1024 * 1024
              ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
              : bytes > 1024
                ? `${Math.round(bytes / 1024)} KB`
                : undefined;
          const fileSize = formatBytes(Number(pdfFile.size || 0));

          const rawLang = String(Array.isArray(doc.language) ? doc.language[0] : doc.language || '').toLowerCase();
          const detectedLang: 'ar' | 'zh' | 'en' =
            /[\u0600-\u06FF]/.test(title) || rawLang.includes('ara')
              ? 'ar'
              : /[\u4e00-\u9fff]/.test(title) || rawLang.includes('chi') || rawLang.includes('zh')
                ? 'zh'
                : 'en';

          const streamUrl = buildStreamUrl(pdfUrl, title, false, 'pdf');
          const downloadUrl = buildStreamUrl(pdfUrl, title, true, 'pdf');
          const attachments = pool.slice(0, 12).map((pf, idx) => {
            const u = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(pf.name)}`;
            const volTitle = pool.length > 1 ? `${title} (卷 ${idx + 1})` : title;
            return {
              type: pool.length > 1 ? `PDF · 卷 ${idx + 1}` : 'PDF',
              url: u,
              streamUrl: buildStreamUrl(u, volTitle, false, 'pdf'),
              downloadUrl: buildStreamUrl(u, volTitle, true, 'pdf'),
              size: formatBytes(Number(pf.size || 0)),
            };
          });
          return {
            id: `ia_pdf_${identifier}`,
            title,
            author,
            description: String(doc.description || '全球数字档案库原版 PDF 书籍，支持站内直读、AI 讲解与下载到书架。').slice(0, 240),
            language: detectedLang,
            contentType: 'books',
            source: 'archive',
            sourceName: pool.length > 1 ? `Internet Archive · 共 ${pool.length} 卷原版 PDF` : 'Internet Archive · 全球原版 PDF',
            pdfUrl,
            streamUrl,
            downloadUrl,
            attachments,
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

/**
 * Federated Project Gutenberg global full-text classics search (via Gutendex open JSON API).
 */
async function searchGutenbergBooks(query: string, limit = 5): Promise<IslamicPdfBookItem[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const res = await fetch(`https://gutendex.com/books/?search=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'EarthOne-Library/1.0' },
      signal: AbortSignal.timeout(6500),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const rows: any[] = Array.isArray(data?.results) ? data.results.slice(0, limit) : [];
    const out: IslamicPdfBookItem[] = [];
    for (const row of rows) {
      const formats = row?.formats || {};
      const textUrl: string | undefined =
        formats['text/plain; charset=utf-8'] ||
        formats['text/plain; charset=us-ascii'] ||
        formats['text/plain'];
      const epubUrl: string | undefined = formats['application/epub+zip'];
      if (!textUrl && !epubUrl) continue;
      const title = String(row.title || 'Classic Book').trim();
      const author = Array.isArray(row.authors) && row.authors[0]?.name ? row.authors[0].name : 'Project Gutenberg';
      const rawLang = String(row.languages?.[0] || 'en').toLowerCase();
      const lang: 'ar' | 'zh' | 'en' = rawLang === 'ar' ? 'ar' : rawLang === 'zh' ? 'zh' : 'en';
      out.push({
        id: `gut_${row.id}`,
        title,
        author,
        description: `Project Gutenberg 全球公版原著全文，支持一键下载原文到书架并启用 AI 逐页讲解与点词查义。`,
        language: lang,
        contentType: 'books',
        source: 'gutenberg',
        sourceName: 'Project Gutenberg · 全球公版全文',
        textUrl,
        attachments: textUrl
          ? [
              {
                type: 'TXT',
                url: textUrl,
                streamUrl: buildStreamUrl(textUrl, title, false, 'txt'),
                downloadUrl: buildStreamUrl(textUrl, title, true, 'txt'),
              },
            ]
          : [],
        sourcePageUrl: `https://www.gutenberg.org/ebooks/${row.id}`,
        coverImage: '/assets/library/cover-little-prince.jpg',
      });
    }
    return out;
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

  const savedLocalItems: IslamicPdfBookItem[] =
    category === 'books' || category === 'showall'
      ? (opts.store.books || [])
          .filter(
            (b: Book) =>
              b.formatType === 'pdf' ||
              b.id.startsWith('book_pdf_') ||
              b.id.startsWith('book_noor_') ||
              b.id.startsWith('book_islamic_') ||
              b.id.startsWith('book_global_')
          )
          .map((b: Book) => {
            const isLocalPdf = typeof b.externalReadUrl === 'string' && b.externalReadUrl.startsWith('/api/library/local-pdfs/');
            const dlUrl = isLocalPdf ? buildStreamUrl(b.externalReadUrl!, b.title, true, 'pdf') : undefined;
            return {
              id: b.id,
              title: b.title,
              author: b.author,
              description: b.description || '已下载并保存在 ONE 网站书架的原版典籍，随时秒开阅读并支持 AI 讲解。',
              language: (b.language === 'zh' || b.language === 'en' ? b.language : 'ar') as 'ar' | 'zh' | 'en',
              contentType: 'books' as const,
              source: 'local_vault' as const,
              sourceName: shelfBookIds.has(b.id) ? '已下载到原文书架 · 秒开' : '本地书库原文',
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
  let gutenbergItems: IslamicPdfBookItem[] = [];

  if (!q) {
    if (langPref === 'all') {
      const [arRes, zhRes, enRes] = await Promise.all([
        fetchIslamHousePage(category, 'ar', page, Math.ceil(limit * 0.5)).catch(() => ({ items: [], totalItems: 0 })),
        fetchIslamHousePage(category, 'zh', page, Math.ceil(limit * 0.25)).catch(() => ({ items: [], totalItems: 0 })),
        fetchIslamHousePage(category, 'en', page, Math.ceil(limit * 0.25)).catch(() => ({ items: [], totalItems: 0 })),
      ]);
      ihItems = [...arRes.items, ...zhRes.items, ...enRes.items];
      ihTotal = arRes.totalItems + zhRes.totalItems + enRes.totalItems;
    } else {
      let res = await fetchIslamHousePage(category, langPref, page, limit).catch(() => ({ items: [], totalItems: 0 }));
      if (res.items.length === 0 && langPref !== 'ar') {
        res = await fetchIslamHousePage(category, 'ar', page, limit).catch(() => ({ items: [], totalItems: 0 }));
      }
      ihItems = res.items;
      ihTotal = res.totalItems;
    }
  } else {
    const qLower = q.toLowerCase();
    const targetLangs: Array<'ar' | 'zh' | 'en'> = langPref === 'all' ? ['ar', 'zh', 'en'] : [langPref];

    const [ihPages, iaResults, gutResults] = await Promise.all([
      Promise.all(
        targetLangs.flatMap((l) => [
          fetchIslamHousePage(category, l, 1, 30).catch(() => ({ items: [], totalItems: 0 })),
          fetchIslamHousePage(category, l, 2, 30).catch(() => ({ items: [], totalItems: 0 })),
        ])
      ),
      category === 'books' || category === 'showall' ? searchArchiveGlobalPdfBooks(q, 8) : Promise.resolve([]),
      category === 'books' || category === 'showall' ? searchGutenbergBooks(q, 5) : Promise.resolve([]),
    ]);

    const pool = ihPages.flatMap((p) => p.items);
    ihItems = pool.filter(
      (b) =>
        b.title.toLowerCase().includes(qLower) ||
        b.author.toLowerCase().includes(qLower) ||
        b.description.toLowerCase().includes(qLower)
    );
    archiveItems = iaResults;
    gutenbergItems = gutResults;
    ihTotal = ihItems.length + archiveItems.length + gutenbergItems.length;
  }

  const filteredLocal = q
    ? savedLocalItems.filter(
        (b) =>
          b.title.toLowerCase().includes(q.toLowerCase()) ||
          b.author.toLowerCase().includes(q.toLowerCase()) ||
          b.description.toLowerCase().includes(q.toLowerCase())
      )
    : savedLocalItems;

  const merged = [...filteredLocal, ...archiveItems, ...ihItems, ...gutenbergItems].map((item) => {
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
    const key = item.pdfUrl || item.textUrl || item.sourcePageUrl || item.id;
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
      { id: 'islamhouse', name: 'IslamHouse 全球伊斯兰书籍 API', count: ihItems.length, status: 'ok' },
      { id: 'archive', name: 'Internet Archive 全球 PDF 书库', count: archiveItems.length, status: 'ok' },
      { id: 'gutenberg', name: 'Project Gutenberg 全球原著', count: gutenbergItems.length, status: 'ok' },
      { id: 'local_vault', name: '已下载到我的书架', count: filteredLocal.length, status: 'ok' },
    ],
  };
}

async function runFastLibraryAiText(
  req: Request,
  systemInstruction: string,
  prompt: string,
  maxTokens = 900,
  imageBase64?: string,
  speed: 'fast' | 'deep' = 'fast'
): Promise<string> {
  const res = await runUnifiedAiTurn({
    prompt,
    systemInstruction,
    imageBase64,
    maxTokens,
    speed,
    mode: 'library-reading',
    subjectKey: `ip:${req.ip || 'unknown'}`,
  });
  if (res.success && res.content.trim()) {
    return res.content.trim();
  }
  throw new Error(res.errorMessage || 'ONE AI 阅读引擎暂忙，请稍后重试。');
}

export function registerNoorIslamicLibraryRoutes(
  app: Express,
  store: DataStore,
  getSessionUser?: (req: Request) => User | undefined
): void {
  fs.mkdirSync(PDF_VAULT_DIR, { recursive: true });

  // Non-blocking startup self-healer: upgrade any previously saved 1-page Archive.org cover PDF (e.g. 00_98991.pdf)
  // to the real multi-hundred-page Volume 1 PDF stream so users never hit a 1-page stub.
  void (async () => {
    let changed = false;
    for (const book of store.books) {
      if (book.formatType !== 'pdf') continue;
      const src = String(book.sourceUrl || '');
      const iaMatch = src.match(/archive\.org\/details\/([^/?#]+)/i);
      const localMatch = String(book.externalReadUrl || '').match(/^\/api\/library\/local-pdfs\/([a-zA-Z0-9_-]+\.pdf)$/);
      if (!iaMatch || !localMatch) continue;
      const localPath = path.join(PDF_VAULT_DIR, localMatch[1]);
      try {
        const stat = fs.existsSync(localPath) ? fs.statSync(localPath) : null;
        if (stat && stat.size > 1.5 * 1024 * 1024) continue; // already a full multi-page book
        const iaId = decodeURIComponent(iaMatch[1]);
        const metaRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(iaId)}/files`, {
          headers: { 'User-Agent': 'EarthOne-Library/1.0' },
          signal: AbortSignal.timeout(7000),
        });
        if (!metaRes.ok) continue;
        const meta: any = await metaRes.json();
        const files: any[] = Array.isArray(meta?.result) ? meta.result : [];
        const pdfs = files.filter(
          (f) => typeof f?.name === 'string' && /\.pdf$/i.test(f.name) && !/encrypted/i.test(String(f.format || '')) && Number(f.size || 0) > 20 * 1024
        );
        const maxSz = Math.max(0, ...pdfs.map((f) => Number(f.size || 0)));
        const realPdfs = pdfs.filter((f) => {
          const base = String(f.name).split('/').pop() || '';
          if (/^0{2,}[_\-.\s]|^0+\.pdf$|cover|ghilaf|front/i.test(base)) return false;
          if (maxSz > 2.5 * 1024 * 1024 && Number(f.size || 0) < 1.4 * 1024 * 1024) return false;
          return true;
        });
        const nonText = realPdfs.filter((f) => !/_text\.pdf$/i.test(String(f.name)));
        const pool = nonText.length > 0 ? nonText : realPdfs;
        pool.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
        if (pool[0]) {
          const realUrl = `https://archive.org/download/${encodeURIComponent(iaId)}/${encodeURIComponent(pool[0].name)}`;
          book.externalReadUrl = buildStreamUrl(realUrl, book.title, false, 'pdf');
          changed = true;
        }
      } catch {
        // non-fatal startup check
      }
    }
    if (changed) {
      store.saveToDisk();
    }
  })();

  const resolveShelfUserId = (req: Request): string => {
    return getSessionUser?.(req)?.id || 'guest';
  };

  // 1. Global Islamic & World Books Search API (Backend also retains quran/audios/videos/articles/khotab/fatwa for admin/backend use)
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
        error: err?.message || '全球书库检索失败，请稍后重试。',
      });
    }
  });

  // 2. CORS-free Same-Origin Streaming & Direct Download Proxy
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

  // 3. Download PDF or Full-Text Book Directly into Website Vault & Automatically Add to "我的书架"
  const handleSaveToBookshelf = async (req: Request, res: Response) => {
    const userId = resolveShelfUserId(req);
    const {
      pdfUrl,
      textUrl,
      title,
      author,
      description,
      fullText,
      language,
      sourcePageUrl,
      coverImage,
    } = req.body || {};

    const cleanTitle = String(title || 'كتاب إسلامي').trim().slice(0, 180);
    const cleanAuthor = String(author || 'علماء التراث الإسلامي').trim().slice(0, 120);
    const cleanLang = language === 'zh' || language === 'en' ? language : 'ar';

    // Path A: Download actual PDF binary into /data/pdfs/ & add to user's Bookshelf
    if (typeof pdfUrl === 'string' && pdfUrl.trim()) {
      let effectivePdfUrl = pdfUrl.trim();
      // Auto-upgrade Archive.org 1-page cover sheets (e.g. /download/{id}/00_98991.pdf) to real Volume 1 content PDF
      const iaMatch =
        effectivePdfUrl.match(/archive\.org\/download\/([^/?#]+)\/([^/?#]+\.pdf)/i) ||
        String(sourcePageUrl || '').match(/archive\.org\/details\/([^/?#]+)/i);
      if (iaMatch) {
        const iaId = decodeURIComponent(iaMatch[1]);
        const currentFile = iaMatch[2] ? decodeURIComponent(iaMatch[2]) : '';
        if (!currentFile || /^0{2,}[_\-.\s]/i.test(currentFile) || /cover|ghilaf/i.test(currentFile)) {
          try {
            const metaRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(iaId)}/files`, {
              headers: { 'User-Agent': 'EarthOne-Library/1.0' },
              signal: AbortSignal.timeout(6000),
            });
            if (metaRes.ok) {
              const meta: any = await metaRes.json();
              const files: any[] = Array.isArray(meta?.result) ? meta.result : [];
              const pdfs = files.filter(
                (f) => typeof f?.name === 'string' && /\.pdf$/i.test(f.name) && !/encrypted/i.test(String(f.format || '')) && Number(f.size || 0) > 20 * 1024
              );
              const maxSz = Math.max(0, ...pdfs.map((f) => Number(f.size || 0)));
              const realPdfs = pdfs.filter((f) => {
                const base = String(f.name).split('/').pop() || '';
                if (/^0{2,}[_\-.\s]|^0+\.pdf$|cover|ghilaf|front/i.test(base)) return false;
                if (maxSz > 2.5 * 1024 * 1024 && Number(f.size || 0) < 1.4 * 1024 * 1024) return false;
                return true;
              });
              const nonText = realPdfs.filter((f) => !/_text\.pdf$/i.test(String(f.name)));
              const chosenPool = nonText.length > 0 ? nonText : realPdfs;
              chosenPool.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
              if (chosenPool[0]) {
                effectivePdfUrl = `https://archive.org/download/${encodeURIComponent(iaId)}/${encodeURIComponent(chosenPool[0].name)}`;
              }
            }
          } catch {
            // keep original url if metadata lookup fails
          }
        }
      }

      if (effectivePdfUrl.startsWith('/api/library/local-pdfs/')) {
        const existingLocal = store.books.find((b: Book) => b.externalReadUrl === effectivePdfUrl);
        if (existingLocal) {
          const shelfItem = store.addToBookShelf(userId, existingLocal.id, 'reading');
          return res.json({
            success: true,
            book: existingLocal,
            shelfItem,
            localPdfUrl: effectivePdfUrl,
            downloadUrl: `${effectivePdfUrl}?download=1&filename=${encodeURIComponent(existingLocal.title)}`,
          });
        }
      }

      if (!isAllowedPdfRemoteUrl(effectivePdfUrl)) {
        return res.status(400).json({ success: false, error: '无效或不受信任的 PDF 下载地址。' });
      }

      try {
        const upstream = await fetch(effectivePdfUrl, {
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
            error: '远程地址未返回标准 PDF 文件，建议下载后通过「导入本地 PDF」加入书架。',
          });
        }
        if (buf.byteLength > 45 * 1024 * 1024) {
          // For very large multi-hundred-page books (>45MB), link directly via range-streaming proxy instead of failing!
          const hash = crypto.createHash('sha1').update(effectivePdfUrl).digest('hex').slice(0, 12);
          const streamUrl = buildStreamUrl(effectivePdfUrl, cleanTitle, false, 'pdf');
          let book = store.books.find((b: Book) => b.externalReadUrl === streamUrl || b.sourceUrl === (sourcePageUrl || effectivePdfUrl));
          if (!book) {
            book = {
              id: `book_pdf_${hash}`,
              title: cleanTitle,
              author: cleanAuthor,
              category: 'islamic_studies',
              language: cleanLang,
              year: new Date().getFullYear().toString(),
              source: 'Open Access',
              sourceUrl: typeof sourcePageUrl === 'string' && sourcePageUrl ? sourcePageUrl : effectivePdfUrl,
              externalReadUrl: streamUrl,
              formatType: 'pdf',
              textAvailability: 'full_text',
              coverImage: typeof coverImage === 'string' && coverImage.startsWith('/') ? coverImage : '/assets/library/cover-arabian-nights.jpg',
              description: String(description || '已加入 ONE 书架的高清流式原版 PDF 书籍，支持秒开翻页与 AI 伴读。').slice(0, 420),
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
            localPdfUrl: streamUrl,
            downloadUrl: buildStreamUrl(effectivePdfUrl, book.title, true, 'pdf'),
          });
        }

        const hash = crypto.createHash('sha1').update(effectivePdfUrl).digest('hex').slice(0, 12);
        const filename = `islamic_${hash}.pdf`;
        fs.writeFileSync(path.join(PDF_VAULT_DIR, filename), buf);

        const localUrl = `/api/library/local-pdfs/${filename}`;
        let book = store.books.find(
          (b: Book) => b.externalReadUrl === localUrl || b.sourceUrl === (sourcePageUrl || effectivePdfUrl)
        );
        if (book) {
          book.externalReadUrl = localUrl;
        }
        if (!book) {
          book = {
            id: `book_pdf_${hash}`,
            title: cleanTitle,
            author: cleanAuthor,
            category: 'islamic_studies',
            language: cleanLang,
            year: new Date().getFullYear().toString(),
            source: 'Open Access',
            sourceUrl: typeof sourcePageUrl === 'string' && sourcePageUrl ? sourcePageUrl : effectivePdfUrl,
            externalReadUrl: localUrl,
            formatType: 'pdf',
            textAvailability: 'full_text',
            coverImage:
              typeof coverImage === 'string' && coverImage.startsWith('/')
                ? coverImage
                : '/assets/library/cover-arabian-nights.jpg',
            description: String(
              description || '已直接下载到 ONE 网站书架的原版 PDF，支持 AI 逐页讲解与点词查义。'
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

    // Path B: Full-text open book (e.g. Gutenberg plain text) -> download & split into readable chapters directly on Bookshelf!
    let downloadedText = String(fullText || '').trim();
    if (!downloadedText && typeof textUrl === 'string' && isAllowedPdfRemoteUrl(textUrl)) {
      try {
        const txtRes = await fetch(textUrl, {
          headers: { 'User-Agent': 'EarthOne-Library/1.0' },
          signal: AbortSignal.timeout(18000),
        });
        if (txtRes.ok) {
          downloadedText = (await txtRes.text()).slice(0, 350_000).trim();
        }
      } catch {}
    }

    const keySeed = String(sourcePageUrl || textUrl || cleanTitle);
    const hash = crypto.createHash('sha1').update(keySeed).digest('hex').slice(0, 12);
    const bookId = `book_global_${hash}`;
    const bodyText = downloadedText || String(description || cleanTitle).trim();

    // Split long full text cleanly into ~4500-char chapters for smooth Apple Books pagination
    const chapters: Array<{ id: string; title: string; content: string }> = [];
    if (bodyText.length > 5000) {
      const chunkSize = 4800;
      for (let i = 0; i < Math.min(bodyText.length, 240_000); i += chunkSize) {
        const idx = chapters.length + 1;
        chapters.push({
          id: `ch_${idx}`,
          title: `第 ${idx} 部分`,
          content: bodyText.slice(i, i + chunkSize).trim(),
        });
      }
    } else {
      chapters.push({ id: 'ch_1', title: cleanTitle, content: bodyText });
    }

    let book = store.books.find((b: Book) => b.id === bookId);
    if (!book) {
      book = {
        id: bookId,
        title: cleanTitle,
        author: cleanAuthor,
        category: cleanLang === 'ar' ? 'islamic_studies' : 'literature',
        language: cleanLang,
        year: new Date().getFullYear().toString(),
        source: 'Open Access',
        sourceUrl: typeof sourcePageUrl === 'string' && sourcePageUrl ? sourcePageUrl : 'https://www.gutenberg.org/',
        formatType: 'text',
        textAvailability: 'full_text',
        coverImage:
          typeof coverImage === 'string' && coverImage.startsWith('/')
            ? coverImage
            : '/assets/library/cover-arabian-nights.jpg',
        description: String(description || '已下载到 ONE 网站书架的原著全文，支持 AI 逐页讲解与点词查义。').slice(0, 420),
        readProgress: 0,
        chapters,
      };
      store.books.unshift(book);
    }

    const shelfItem = store.addToBookShelf(userId, book.id, 'reading');
    store.saveToDisk();

    return res.json({
      success: true,
      book,
      shelfItem,
      isTextBook: true,
    });
  };

  app.post('/api/library/islamic/save-pdf', handleSaveToBookshelf);
  app.post('/api/library/islamic/save-to-shelf', handleSaveToBookshelf);

  // 4. Upload Local PDF / Markdown (.md) / Text (.txt) directly into Website Bookshelf
  //    Supports pre-converted full-book electronic chapters + cover thumbnail so users never click page-by-page!
  const handleLocalBookUpload = (req: Request, res: Response) => {
    const userId = resolveShelfUserId(req);
    const {
      title,
      author,
      language,
      category,
      fileBase64,
      filename: originalFilename,
      chapters: incomingChapters,
      coverImageBase64,
      pageCount,
    } = req.body || {};

    if (typeof fileBase64 !== 'string' || fileBase64.length < 16) {
      return res.status(400).json({ success: false, error: '请选择有效的 PDF、Markdown 或 TXT 书籍文件。' });
    }
    try {
      fs.mkdirSync(PDF_VAULT_DIR, { recursive: true });
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
        String(originalFilename || '导入电子书').replace(/\.(pdf|md|markdown|txt)$/i, '').trim();
      const cleanLang =
        language === 'zh' || language === 'en' || language === 'ar'
          ? language
          : /[\u0600-\u06FF]/.test(derivedTitle)
            ? 'ar'
            : /[\u4E00-\u9FFF]/.test(derivedTitle)
              ? 'zh'
              : 'en';
      const validCategories = ['literature', 'history', 'philosophy', 'science', 'religion', 'islamic_studies', 'education', 'computer_science'];
      const resolvedCategory: Book['category'] =
        typeof category === 'string' && validCategories.includes(category)
          ? (category as Book['category'])
          : cleanLang === 'ar'
            ? 'islamic_studies'
            : 'literature';

      // Save optional Page-1 cover thumbnail to disk so store.json stays lean
      let coverUrl = cleanLang === 'ar' ? '/assets/library/cover-arabian-nights.jpg' : '/assets/library/cover-little-prince.jpg';
      if (typeof coverImageBase64 === 'string' && coverImageBase64.startsWith('data:image/')) {
        try {
          const imgB64 = coverImageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
          const imgBuf = Buffer.from(imgB64, 'base64');
          if (imgBuf.byteLength > 200 && imgBuf.byteLength < 2 * 1024 * 1024) {
            const coverName = `cover_${hash}.jpg`;
            fs.writeFileSync(path.join(PDF_VAULT_DIR, coverName), imgBuf);
            coverUrl = `/api/library/local-covers/${coverName}`;
          }
        } catch {
          // Keep default cover gracefully
        }
      }

      if (isTextOrMd) {
        const textContent = buf.toString('utf8').trim();
        if (!textContent) {
          return res.status(400).json({ success: false, error: '文件内容为空。' });
        }
        const sections = textContent.split(/\n(?=#{1,2}\s+)/).filter((s) => s.trim().length > 0);
        const chapters = sections.slice(0, 120).map((sec, idx) => {
          const firstLine = sec.split('\n')[0].replace(/^#+\s*/, '').trim();
          const body = sec.replace(/^#+\s*[^\n]*\n?/, '').trim() || sec.trim();
          return {
            id: `ch_${idx + 1}`,
            title: firstLine || `第 ${idx + 1} 节`,
            content: body,
          };
        });

        const newBook: Book = {
          id: `book_upload_txt_${hash}`,
          title: derivedTitle.slice(0, 180),
          author: String(author || '本地导入电子书').trim().slice(0, 120),
          category: resolvedCategory,
          language: cleanLang,
          year: new Date().getFullYear().toString(),
          source: 'Open Access',
          formatType: 'text',
          textAvailability: 'full_text',
          coverImage: coverUrl,
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

      const storedFilename = `upload_${hash}.pdf`;
      fs.writeFileSync(path.join(PDF_VAULT_DIR, storedFilename), buf);
      const localUrl = `/api/library/local-pdfs/${storedFilename}`;

      // Sanitize pre-converted structured electronic chapters when supplied by automatic converter
      const sanitizedChapters = Array.isArray(incomingChapters)
        ? incomingChapters
            .filter((c: any) => c && typeof c.content === 'string' && c.content.trim().length > 0)
            .slice(0, 300)
            .map((c: any, idx: number) => ({
              id: typeof c.id === 'string' && c.id.trim() ? c.id.trim().slice(0, 64) : `ch_${idx + 1}`,
              title: typeof c.title === 'string' && c.title.trim() ? c.title.trim().slice(0, 140) : `第 ${idx + 1} 章`,
              content: String(c.content).trim(),
            }))
        : [];

      const hasFullEbookChapters = sanitizedChapters.length > 0;
      const totalPagesNum = Number.isFinite(Number(pageCount)) && Number(pageCount) > 0 ? Math.floor(Number(pageCount)) : undefined;

      const newBook: Book = {
        id: `book_pdf_${hash}`,
        title: derivedTitle.slice(0, 180),
        author: String(author || '本地 PDF 导入').trim().slice(0, 120),
        category: resolvedCategory,
        language: cleanLang,
        year: new Date().getFullYear().toString(),
        source: 'Open Access',
        externalReadUrl: localUrl,
        formatType: hasFullEbookChapters ? 'text' : 'pdf',
        textAvailability: 'full_text',
        coverImage: coverUrl,
        description: hasFullEbookChapters
          ? `已自动整本转为精排电子版（共 ${sanitizedChapters.length} 章${totalPagesNum ? ` · 原书 ${totalPagesNum} 页` : ''}），支持全书分段阅读、点词查义、AI 翻译与进度自动云端保存。`
          : `已导入本地 PDF 典籍${totalPagesNum ? `（共 ${totalPagesNum} 页）` : ''}，支持高清原版直呈、AI 识字与整本转电子版。`,
        readProgress: 0,
        chapters: sanitizedChapters,
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
        isTextBook: hasFullEbookChapters,
        localPdfUrl: localUrl,
        downloadUrl: `${localUrl}?download=1&filename=${encodeURIComponent(newBook.title)}`,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || '文件导入书架失败' });
    }
  };

  app.post('/api/library/islamic/upload-pdf', handleLocalBookUpload);
  app.post('/api/library/upload-pdf', handleLocalBookUpload);

  // 4b. Persist whole-book converted electronic chapters back onto an existing PDF book
  app.post('/api/library/books/:id/ebook-chapters', (req: Request, res: Response) => {
    const book = store.books.find((b: Book) => b.id === req.params.id);
    if (!book) return res.status(404).json({ success: false, error: 'Book not found' });

    const { chapters, language, coverImageBase64, pageCount } = req.body || {};
    if (!Array.isArray(chapters) || chapters.length === 0) {
      return res.status(400).json({ success: false, error: '没有可保存的电子书章节内容。' });
    }

    const sanitizedChapters = chapters
      .filter((c: any) => c && typeof c.content === 'string' && c.content.trim().length > 0)
      .slice(0, 300)
      .map((c: any, idx: number) => ({
        id: typeof c.id === 'string' && c.id.trim() ? c.id.trim().slice(0, 64) : `ch_${idx + 1}`,
        title: typeof c.title === 'string' && c.title.trim() ? c.title.trim().slice(0, 140) : `第 ${idx + 1} 章`,
        content: String(c.content).trim(),
      }));

    if (sanitizedChapters.length === 0) {
      return res.status(400).json({ success: false, error: '转换结果为空，请尝试使用 AI 识字模式。' });
    }

    book.chapters = sanitizedChapters;
    book.formatType = 'text';
    book.textAvailability = 'full_text';
    if (language === 'ar' || language === 'zh' || language === 'en') {
      book.language = language;
    }
    const totalPagesNum = Number.isFinite(Number(pageCount)) && Number(pageCount) > 0 ? Math.floor(Number(pageCount)) : undefined;
    book.description = `已自动整本转为精排电子版（共 ${sanitizedChapters.length} 章${totalPagesNum ? ` · 原书 ${totalPagesNum} 页` : ''}），支持全书虚拟滚动、点词查义、翻译与服务器进度同步。`;

    if (typeof coverImageBase64 === 'string' && coverImageBase64.startsWith('data:image/')) {
      try {
        fs.mkdirSync(PDF_VAULT_DIR, { recursive: true });
        const imgB64 = coverImageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
        const imgBuf = Buffer.from(imgB64, 'base64');
        if (imgBuf.byteLength > 200 && imgBuf.byteLength < 2 * 1024 * 1024) {
          const safeId = book.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
          const coverName = `cover_${safeId}.jpg`;
          fs.writeFileSync(path.join(PDF_VAULT_DIR, coverName), imgBuf);
          book.coverImage = `/api/library/local-covers/${coverName}`;
        }
      } catch {}
    }

    store.saveToDisk();
    return res.json({ success: true, book, chapterCount: sanitizedChapters.length });
  });

  // 5. Serve Locally Saved Vault PDFs & Cover Thumbnails
  app.get('/api/library/local-covers/:filename', (req: Request, res: Response) => {
    const rawName = String(req.params.filename || '');
    if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(rawName)) {
      return res.status(400).json({ success: false, error: 'Invalid cover filename' });
    }
    const filePath = path.join(PDF_VAULT_DIR, rawName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Cover not found' });
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    return res.sendFile(filePath);
  });

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

  // 6. AI Page Tutor ("读到这一页不会讲，让 AI 分析这一页怎么讲") — supports both PDF text & scanned image pages!
  app.post('/api/library/ai/explain-page', async (req: Request, res: Response) => {
    const { title, pageNumber, pageText, pageImageBase64, question, lang } = req.body || {};
    const cleanText = typeof pageText === 'string' ? pageText.trim().slice(0, 6500) : '';
    const hasImage = typeof pageImageBase64 === 'string' && pageImageBase64.length > 200;

    if (!cleanText && !hasImage) {
      return res.status(400).json({ success: false, error: '当前页未提取到可分析的文本或页面图像。' });
    }

    const replyZh = lang !== 'en';
    const systemInstruction = replyZh
      ? '你是博学、温和、表达清晰的资深双语（阿拉伯语/英语/汉语）典籍讲师。用户正在阅读一本书的某一页，可能不知道这一页该怎么理解或怎么讲给别人听。请用清晰、自然、易懂的中文分点讲解：1)「本页核心大意」（用大白话讲明白）；2)「这一页该怎么讲」（帮你梳理讲解逻辑和逐段要点）；3)「重点外语/阿语词句解析」（挑出 3-5 个关键原词，给读音/标音与释义）。如果用户提了具体问题，请优先直接回答该问题。不要输出多余寒暄。'
      : 'You are an expert bilingual book tutor (Arabic/English/Chinese). Clearly explain the current page so the reader understands it deeply and knows how to explain it to others: 1) Core meaning, 2) How to explain this page step-by-step, 3) Key vocabulary with pronunciation and meaning.';

    const prompt = [
      `书名：${String(title || '原版书籍').slice(0, 140)}`,
      pageNumber ? `页码：第 ${pageNumber} 页` : '',
      question ? `读者追问：${String(question).slice(0, 400)}` : '请帮我分析这一页在讲什么，以及我该怎么把它讲清楚。',
      cleanText ? `本页原文内容：\n"""\n${cleanText}\n"""` : '（本页为扫描图像页，请直接识读附图中的全部原文并进行精讲）',
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      const explanation = await runFastLibraryAiText(
        req,
        systemInstruction,
        prompt,
        1500,
        cleanText.length < 40 && hasImage ? pageImageBase64 : undefined
      );
      return res.json({ success: true, explanation });
    } catch (err: any) {
      return res.status(503).json({
        success: false,
        error: err?.message || 'AI 本页讲解暂时不可用，请稍后重试。',
      });
    }
  });

  // 7. Instant Tap-Any-Word Authoritative Dictionary Lookup (剑桥/牛津双解 · 真人英美音标发音 · CEFR · 语境义 · 例句)
  app.post('/api/library/ai/lookup-word', async (req: Request, res: Response) => {
    const { word, contextSentence, bookTitle, lang } = req.body || {};
    const cleanWord = typeof word === 'string' ? word.trim().slice(0, 80) : '';
    if (!cleanWord) {
      return res.status(400).json({ success: false, error: '请选择要查询的单词。' });
    }

    try {
      const ctxStr = [
        typeof bookTitle === 'string' && bookTitle ? `《${bookTitle.slice(0, 80)}》` : '',
        typeof contextSentence === 'string' && contextSentence ? contextSentence.slice(0, 280) : '',
      ]
        .filter(Boolean)
        .join(' · ');

      const authEntry = await lookupAuthoritativeDictionary(cleanWord, ctxStr || undefined);
      if (authEntry && authEntry.senses.length > 0) {
        const primarySense = authEntry.senses[0];
        const summaryMeaning = authEntry.senses
          .slice(0, 3)
          .map((s) => {
            const zh = s.definitionZh ? s.definitionZh : '';
            const en = s.definitionEn ? s.definitionEn : '';
            const body = zh && en ? `${zh}（${en}）` : zh || en;
            return s.partOfSpeech ? `[${s.partOfSpeech}] ${body}` : body;
          })
          .join('；');

        const firstExample = primarySense?.examples?.[0];
        const exampleStr = firstExample
          ? firstExample.zh
            ? `${firstExample.en} — ${firstExample.zh}`
            : firstExample.en
          : '';

        const usageStr =
          authEntry.usageNote ||
          (authEntry.collocations.length > 0
            ? authEntry.collocations
                .slice(0, 3)
                .map((c) => (c.zh ? `${c.phrase}（${c.zh}）` : c.phrase))
                .join(' · ')
            : '');

        return res.json({
          success: true,
          entry: {
            word: authEntry.word,
            lemma: authEntry.lemma || authEntry.word,
            reading:
              authEntry.ukPhonetic && authEntry.usPhonetic && authEntry.ukPhonetic !== authEntry.usPhonetic
                ? `UK ${authEntry.ukPhonetic} · US ${authEntry.usPhonetic}`
                : authEntry.usPhonetic || authEntry.ukPhonetic || authEntry.reading || '',
            ukPhonetic: authEntry.ukPhonetic,
            usPhonetic: authEntry.usPhonetic,
            audioUrl: authEntry.audioUrl || authEntry.usAudioUrl || authEntry.ukAudioUrl,
            ukAudioUrl: authEntry.ukAudioUrl,
            usAudioUrl: authEntry.usAudioUrl,
            cefrLevel: authEntry.cefrLevel,
            partOfSpeech: primarySense?.partOfSpeech || '',
            root: authEntry.root || authEntry.etymology || '',
            meaning: summaryMeaning,
            usage: usageStr,
            contextMeaning: authEntry.contextMeaning || '',
            example: exampleStr,
            senses: authEntry.senses,
            collocations: authEntry.collocations,
            sources: authEntry.sources,
          },
        });
      }
    } catch {
      // Fall through to direct AI lookup if authoritative service had an issue
    }

    const replyZh = lang !== 'en';
    const systemInstruction = replyZh
      ? '你是 ONE AI 权威词典与多语阅读助教（精通英语、阿拉伯语、汉语及古典文献）。请仅返回严格 JSON（不要加 markdown 代码块），包含以下字段：{"word":"原词","lemma":"单词原形/词典形","reading":"发音（阿语完全标音 Tashkeel+拉丁读音 或 国际音标 IPA / 汉语拼音）","partOfSpeech":"词性","root":"词根或词源（无则留空）","meaning":"精准简洁的中文核心释义","usage":"常见搭配与典型用法","contextMeaning":"结合当前句子的确切语境含义","example":"1句自然实用例句及中文翻译"}。'
      : 'You are ONE AI multilingual dictionary (Arabic/English/Chinese). Return ONLY strict JSON (no markdown fences): {"word":"...","lemma":"...","reading":"...","partOfSpeech":"...","root":"...","meaning":"...","usage":"...","contextMeaning":"...","example":"..."}.';

    const prompt = [
      `查询单词：${cleanWord}`,
      bookTitle ? `所在书籍：${String(bookTitle).slice(0, 120)}` : '',
      contextSentence ? `所在上下文：${String(contextSentence).slice(0, 320)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const raw = await runFastLibraryAiText(req, systemInstruction, prompt, 800, undefined, 'fast');
      let parsed: Record<string, string> | null = null;
      try {
        const cleanedRaw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
        const jsonMatch = cleanedRaw.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {}

      if (parsed && typeof parsed.meaning === 'string') {
        return res.json({
          success: true,
          entry: {
            word: parsed.word || cleanWord,
            lemma: parsed.lemma || parsed.word || cleanWord,
            reading: parsed.reading || '',
            partOfSpeech: parsed.partOfSpeech || '',
            root: parsed.root || '',
            meaning: parsed.meaning || '',
            usage: parsed.usage || '',
            contextMeaning: parsed.contextMeaning || '',
            example: parsed.example || '',
          },
        });
      }

      return res.json({
        success: true,
        entry: {
          word: cleanWord,
          lemma: cleanWord,
          reading: '',
          partOfSpeech: '',
          root: '',
          meaning: raw.slice(0, 600),
          usage: '',
          contextMeaning: '',
          example: '',
        },
      });
    } catch (err: any) {
      return res.status(503).json({
        success: false,
        error: err?.message || 'AI 查词暂时不可用，请稍后重试。',
      });
    }
  });

  // 8. Scanned PDF Page Vision OCR -> Structured Reflowable Paragraphs
  app.post('/api/library/ai/ocr-page', async (req: Request, res: Response) => {
    const { pageImageBase64, pageNumber, bookTitle, language } = req.body || {};
    if (typeof pageImageBase64 !== 'string' || pageImageBase64.length < 200) {
      return res.status(400).json({ success: false, error: '缺少待识别的页面图像。' });
    }
    const systemInstruction =
      'You are a high-precision book digitization OCR engine for Arabic, Chinese, and English publications. Extract ALL readable text from the page image faithfully in original reading order. Preserve headings by prefixing major headings with "## " and subheadings with "### ". Separate natural paragraphs with a blank line. Preserve footnotes at the end prefixed with "[脚注] ". Output ONLY the extracted structured text with zero commentary or markdown fences.';
    const prompt = `Book: ${String(bookTitle || 'Document').slice(0, 140)} | Page ${Number(pageNumber) || 1} | Primary language hint: ${String(language || 'auto')}. Transcribe every paragraph accurately for reflowable ebook reading.`;
    try {
      const text = await runFastLibraryAiText(req, systemInstruction, prompt, 2400, pageImageBase64, 'fast');
      return res.json({ success: true, text });
    } catch (err: any) {
      return res.status(503).json({ success: false, error: err?.message || 'OCR 识别暂时不可用。' });
    }
  });

  // 9. Inline Paragraph / Selection / Scanned-Page Vision Translation (NEVER translates garbled numbers!)
  app.post('/api/library/ai/translate', async (req: Request, res: Response) => {
    const { text, pageImageBase64, targetLang = 'zh', bookTitle, pageNumber } = req.body || {};
    const cleanText = typeof text === 'string' ? text.trim().slice(0, 4500) : '';
    const hasImage = typeof pageImageBase64 === 'string' && pageImageBase64.length > 200;

    if (!cleanText && !hasImage) {
      return res.status(400).json({ success: false, error: '请选中需要翻译的段落或使用整页视觉翻译。' });
    }

    // Reject garbled numeric-only CID dumps when no page image is supplied (prevents translating Arabic PDFs into a string of numbers!)
    if (!hasImage && cleanText.length >= 16) {
      const compact = cleanText.replace(/\s+/g, '');
      const digits = (compact.match(/[0-9\u0660-\u0669]/g) || []).length;
      const realLetters = (compact.match(/[\u0621-\u064A\u4E00-\u9FFFA-Za-z]/g) || []).length;
      if (/(?:\(cid:\d+\)|\bcid:\d+\b)/i.test(cleanText) || (digits / compact.length >= 0.45 && realLetters / compact.length < 0.35)) {
        return res.status(422).json({
          success: false,
          error: '检测到该页 PDF 原文本层为损坏的字体编码/数字流，请点击「AI 翻译本页」直接识别书页图像进行精准翻译。',
        });
      }
    }

    const targetLabel =
      targetLang === 'en' ? '流畅自然的英文' : targetLang === 'ar' ? '地道典雅的现代标准阿拉伯语' : '精准流畅、富有书卷气的简体中文';
    const systemInstruction = hasImage
      ? `你是 ONE AI 专业多语图书翻译专家（精通阿拉伯语古典/现代典籍、英语、汉语）。请直接识读附图中的书页原文，并将其忠实、自然、完整地翻译为${targetLabel}。保留自然段落与小标题，不要输出乱码或页码数字串，也不要添加寒暄或解释性前缀。`
      : `你是 ONE AI 专业图书翻译专家。请将读者选中的原文忠实、自然地翻译为${targetLabel}。保留原有段落结构，不遗漏关键术语，直接输出译文，不要加多余寒暄或标题。`;

    const prompt = [
      bookTitle ? `书名：《${String(bookTitle).slice(0, 120)}》` : '',
      pageNumber ? `页码：第 ${Number(pageNumber)} 页` : '',
      hasImage
        ? '请直接识读图片中的完整书页文字并忠实翻译。'
        : `待翻译原文：\n"""\n${cleanText}\n"""`,
    ]
      .filter(Boolean)
      .join('\n\n');
    try {
      const translation = await runFastLibraryAiText(
        req,
        systemInstruction,
        prompt,
        1800,
        hasImage ? pageImageBase64 : undefined,
        'fast'
      );
      return res.json({ success: true, translation });
    } catch (err: any) {
      return res.status(503).json({ success: false, error: err?.message || '段落翻译暂时不可用。' });
    }
  });

  // 10. AI Deep Explanation (AI 精讲：内容背景 · 核心观点 · 重点词汇 · 句子结构 · 难点分析 · 延伸知识)
  app.post('/api/library/ai/deep-explain', async (req: Request, res: Response) => {
    const { text, bookTitle, chapterTitle, lang } = req.body || {};
    const cleanText = typeof text === 'string' ? text.trim().slice(0, 5000) : '';
    if (!cleanText) {
      return res.status(400).json({ success: false, error: '请选择需要 AI 精讲的段落内容。' });
    }
    const replyZh = lang !== 'en';
    const systemInstruction = replyZh
      ? '你是 ONE AI 资深人文与学术伴读导师。请对读者选中的书页段落进行深度精讲，严格按以下 6 个清晰小节组织（简明精炼、切中要害，避免空话）：\n1. **内容背景**：出处语境与历史/思想背景\n2. **核心观点**：作者最核心的论点与表达意图\n3. **重点词汇**：挑选 3-5 个关键原词或术语，附读音与准确释义\n4. **句子结构**：拆解难句的语法主干与修辞逻辑\n5. **难点分析**：点破读者容易误解或晦涩之处\n6. **延伸知识**：关联相关思想、典故或现实启发'
      : 'You are ONE AI scholarly reading mentor. Provide a structured deep explanation of the passage in 6 clear sections: 1. Context & Background, 2. Core Thesis, 3. Key Vocabulary, 4. Sentence Structure, 5. Difficult Nuances, 6. Extended Knowledge.';

    const prompt = [
      bookTitle ? `书名：《${String(bookTitle).slice(0, 140)}》` : '',
      chapterTitle ? `章节：${String(chapterTitle).slice(0, 120)}` : '',
      `选中原文：\n"""\n${cleanText}\n"""`,
    ]
      .filter(Boolean)
      .join('\n\n');
    try {
      const explanation = await runFastLibraryAiText(req, systemInstruction, prompt, 1800, undefined, 'deep');
      return res.json({ success: true, explanation });
    } catch (err: any) {
      return res.status(503).json({ success: false, error: err?.message || 'AI 精讲暂时不可用。' });
    }
  });

  // 11. Whole-Book Context AI Q&A (结合整本书检索相关上下文回答，而不只看当前屏幕)
  app.post('/api/library/ai/book-qa', async (req: Request, res: Response) => {
    const { question, bookTitle, author, currentSectionText, fullBookChunks, history, lang } = req.body || {};
    const cleanQuestion = typeof question === 'string' ? question.trim().slice(0, 800) : '';
    if (!cleanQuestion) {
      return res.status(400).json({ success: false, error: '请输入你想围绕本书提出的问题。' });
    }

    // Retrieve top relevant excerpts across the ENTIRE extracted book using lexical/BM25-style scoring
    const chunks: Array<{ label: string; text: string }> = Array.isArray(fullBookChunks)
      ? fullBookChunks
          .filter((c: any) => typeof c?.text === 'string' && c.text.trim().length > 12)
          .slice(0, 400)
          .map((c: any, i: number) => ({
            label: String(c.label || `第 ${i + 1} 节`).slice(0, 80),
            text: String(c.text).trim().slice(0, 2600),
          }))
      : [];

    const tokens = cleanQuestion
      .toLowerCase()
      .split(/[\s,，。？！?!、；;：:"'“”‘’()（）\-]+/)
      .filter((t) => t.length >= 2);
    const bigrams: string[] = [];
    const compactQ = cleanQuestion.replace(/\s+/g, '');
    for (let i = 0; i < compactQ.length - 1; i++) {
      const bg = compactQ.slice(i, i + 2);
      if (/[\u4e00-\u9fff\u0600-\u06ff]/.test(bg)) bigrams.push(bg);
    }
    const queryTerms = Array.from(new Set([...tokens, ...bigrams])).slice(0, 24);

    const scored = chunks
      .map((ch, idx) => {
        const lower = ch.text.toLowerCase();
        let score = 0;
        for (const term of queryTerms) {
          if (lower.includes(term)) {
            score += term.length >= 3 ? 3 : 1.5;
          }
        }
        return { ...ch, idx, score };
      })
      .sort((a, b) => b.score - a.score);

    const pickedExcerpts = scored.filter((s) => s.score > 0).slice(0, 6);
    // If question is broad ("这本书讲了什么 / 核心思想"), sample evenly across start, middle, and end of whole book!
    if (pickedExcerpts.length < 3 && chunks.length > 0) {
      const sampleIndices = Array.from(
        new Set([
          0,
          Math.floor(chunks.length * 0.2),
          Math.floor(chunks.length * 0.5),
          Math.floor(chunks.length * 0.8),
          chunks.length - 1,
        ])
      ).filter((i) => i >= 0 && i < chunks.length);
      for (const idx of sampleIndices) {
        if (!pickedExcerpts.some((p) => p.idx === idx) && pickedExcerpts.length < 6) {
          pickedExcerpts.push({ ...chunks[idx], idx, score: 0.5 });
        }
      }
    }

    const replyZh = lang !== 'en';
    const systemInstruction = replyZh
      ? '你是 ONE AI 书籍伴读专家。你会结合「全书检索到的多处上下文片段」与「读者当前所读页面」，精准、深刻地回答读者关于整本书的问题。引用书中依据时注明对应页码或章节，语言简洁优雅，不编造书中未出现的内容。'
      : 'You are ONE AI book reading assistant. Answer the reader using the retrieved excerpts from across the entire book plus the current reading section. Cite chapter/page references accurately and concisely.';

    const excerptsBlock = pickedExcerpts
      .map((ex) => `【${ex.label}】\n${ex.text.slice(0, 1400)}`)
      .join('\n\n---\n\n');

    const prompt = [
      `书名：《${String(bookTitle || '当前书籍').slice(0, 140)}》${author ? ` · 作者：${String(author).slice(0, 80)}` : ''}`,
      `全书覆盖片段数：共检索 ${chunks.length} 个章节/页面，命中 ${pickedExcerpts.length} 处关键上下文。`,
      currentSectionText ? `【当前正在阅读的位置】\n${String(currentSectionText).trim().slice(0, 1600)}` : '',
      excerptsBlock ? `【全书相关上下文】\n${excerptsBlock}` : '',
      `读者提问：${cleanQuestion}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      const safeHistory = Array.isArray(history)
        ? history
            .filter((h: any) => (h?.role === 'user' || h?.role === 'assistant') && typeof h?.content === 'string')
            .slice(-6)
        : [];
      const resAi = await runUnifiedAiTurn({
        prompt,
        systemInstruction,
        history: safeHistory,
        maxTokens: 1400,
        speed: 'fast',
        mode: 'library-reading',
        subjectKey: `ip:${req.ip || 'unknown'}`,
      });
      if (!resAi.success || !resAi.content) {
        throw new Error(resAi.errorMessage || '全书问答引擎暂忙');
      }
      return res.json({
        success: true,
        answer: resAi.content,
        citedSections: pickedExcerpts.map((p) => p.label),
      });
    } catch (err: any) {
      return res.status(503).json({ success: false, error: err?.message || 'AI 阅读问答暂时不可用。' });
    }
  });

  // 12. AI Summary (支持：段落总结 · 章节总结 · 整本书总结)
  app.post('/api/library/ai/summarize', async (req: Request, res: Response) => {
    const { scope = 'chapter', bookTitle, author, sectionTitle, content, lang } = req.body || {};
    const cleanContent = typeof content === 'string' ? content.trim().slice(0, 14000) : '';
    if (!cleanContent) {
      return res.status(400).json({ success: false, error: '暂无可用于总结的文本内容。' });
    }

    const scopeLabel = scope === 'book' ? '整本书' : scope === 'paragraph' ? '当前段落' : '当前章节';
    const replyZh = lang !== 'en';
    const systemInstruction = replyZh
      ? `你是 ONE AI 精炼图书总结专家。请针对「${scopeLabel}」生成清晰、高密度的中文总结：先用 1-2 句话概括核心主旨，再列出 3-5 条关键要点，最后提炼一句值得记住的精华启发。排版干净利落。`
      : `You are ONE AI book summarizer. Summarize the ${scope} clearly: 1-2 sentence core thesis, 3-5 key takeaways, and 1 memorable insight.`;

    const prompt = [
      `书名：《${String(bookTitle || '书籍').slice(0, 140)}》${author ? ` · 作者：${String(author).slice(0, 80)}` : ''}`,
      sectionTitle ? `范围：${String(sectionTitle).slice(0, 120)}` : `范围：${scopeLabel}`,
      `原文素材：\n"""\n${cleanContent}\n"""`,
    ].join('\n\n');

    try {
      const summary = await runFastLibraryAiText(req, systemInstruction, prompt, 1200, undefined, 'fast');
      return res.json({ success: true, summary, scope });
    } catch (err: any) {
      return res.status(503).json({ success: false, error: err?.message || 'AI 总结暂时不可用。' });
    }
  });

  // 13. Personal Vocabulary Book (个人生词库 — 持久化存储)
  app.get('/api/library/vocabulary', (req: Request, res: Response) => {
    const userId = resolveShelfUserId(req);
    const all = readVocabBank();
    const items = all
      .filter((v) => v.userId === userId || (userId !== 'guest' && v.userId === 'guest'))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return res.json({ success: true, items });
  });

  app.post('/api/library/vocabulary', (req: Request, res: Response) => {
    const userId = resolveShelfUserId(req);
    const { word, lemma, reading, partOfSpeech, root, meaning, usage, contextSentence, example, bookId, bookTitle } = req.body || {};
    const cleanWord = String(word || '').trim().slice(0, 100);
    const cleanMeaning = String(meaning || '').trim().slice(0, 800);
    if (!cleanWord || !cleanMeaning) {
      return res.status(400).json({ success: false, error: '单词与释义不能为空。' });
    }
    const all = readVocabBank();
    const existingIdx = all.findIndex(
      (v) => v.userId === userId && v.word.toLowerCase() === cleanWord.toLowerCase()
    );
    const item: SavedVocabItem = {
      id: existingIdx >= 0 ? all[existingIdx].id : `voc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      word: cleanWord,
      lemma: typeof lemma === 'string' ? lemma.trim().slice(0, 100) : cleanWord,
      reading: typeof reading === 'string' ? reading.trim().slice(0, 160) : '',
      partOfSpeech: typeof partOfSpeech === 'string' ? partOfSpeech.trim().slice(0, 60) : '',
      root: typeof root === 'string' ? root.trim().slice(0, 100) : '',
      meaning: cleanMeaning,
      usage: typeof usage === 'string' ? usage.trim().slice(0, 320) : '',
      contextSentence: typeof contextSentence === 'string' ? contextSentence.trim().slice(0, 320) : '',
      example: typeof example === 'string' ? example.trim().slice(0, 400) : '',
      bookId: typeof bookId === 'string' ? bookId.trim().slice(0, 120) : undefined,
      bookTitle: typeof bookTitle === 'string' ? bookTitle.trim().slice(0, 160) : undefined,
      createdAt: new Date().toISOString(),
    };
    if (existingIdx >= 0) all[existingIdx] = item;
    else all.unshift(item);
    writeVocabBank(all);
    return res.json({ success: true, item });
  });

  app.delete('/api/library/vocabulary/:id', (req: Request, res: Response) => {
    const userId = resolveShelfUserId(req);
    const targetId = String(req.params.id || '').trim();
    const all = readVocabBank();
    const next = all.filter((v) => !(v.id === targetId && (v.userId === userId || v.userId === 'guest')));
    writeVocabBank(next);
    return res.json({ success: true, removedId: targetId });
  });

  // 14. Fast Unified Search AI Answer (used by Mercury Search & Built-in Search Bar)
  app.post('/api/search/ai-answer', async (req: Request, res: Response) => {
    const { query, snippets, lang } = req.body || {};
    const cleanQuery = typeof query === 'string' ? query.trim().slice(0, 500) : '';
    if (!cleanQuery) {
      return res.status(400).json({ success: false, error: '请输入搜索问题。' });
    }
    const snippetBlock = Array.isArray(snippets)
      ? snippets
          .slice(0, 6)
          .map((s: any, idx: number) => `${idx + 1}. ${String(s?.title || '').slice(0, 100)}：${String(s?.snippet || '').slice(0, 260)}`)
          .join('\n')
      : '';

    const replyZh = lang !== 'en';
    const systemInstruction = replyZh
      ? '你是 EARTH ONE 统一 AI 核心（ONE AI）的搜索分析引擎。请直接、清晰、准确地回答用户检索的问题，结构简洁（不超过 260 字），优先给出结论与关键事实，不输出任何模板废话。'
      : 'You are ONE AI Search Synthesis. Provide a clear, direct, accurate answer under 180 words with key facts first.';

    const prompt = snippetBlock
      ? `用户检索：${cleanQuery}\n\n实时参考检索结果：\n${snippetBlock}\n\n请综合给出精准回答：`
      : `用户检索：${cleanQuery}\n\n请给出精准、简洁的解答：`;

    try {
      const answer = await runFastLibraryAiText(req, systemInstruction, prompt, 650, undefined, 'fast');
      return res.json({ success: true, answer, model: 'ONE AI' });
    } catch (err: any) {
      return res.status(503).json({ success: false, error: err?.message || 'AI 搜索解析暂时不可用。' });
    }
  });
}
