/**
 * Open book discovery/crawler — aggregates metadata & reading links from public/open APIs.
 * Supports Open Library, Internet Archive, Wikisource, Project Gutenberg, and Z-Library discovery.
 * Provides instant in-page reading (IA Embed flip-book reader, EPUB, and Wikisource chapters).
 */
import { searchBooks, searchWikisource, searchArabicWikisource, searchInternetArchive, type BookSearchResult } from './webFetcher.ts';

export interface CrawledBook {
  id: string;
  title: string;
  author: string;
  language: string;
  coverImage?: string;
  description: string;
  year?: string;
  source: BookSearchResult['source'] | 'openlibrary' | 'zlibrary';
  sourceUrl: string;
  embedUrl?: string;
  textUrl?: string;
  epubUrl?: string;
  pageTitle?: string;
  identifier?: string;
  canImport: boolean; // server-verified import eligibility (public domain/open sources)
  canReadOnline: boolean;
}

const TIMEOUT_MS = 10_000;

async function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T | null> {
  try {
    return await Promise.race([p, new Promise<null>(resolve => setTimeout(() => resolve(null), ms))]);
  } catch {
    return null;
  }
}

async function searchOpenLibrary(query: string, limit = 10): Promise<CrawledBook[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${limit}&fields=key,title,author_name,first_publish_year,language,cover_i,edition_count,subject,ia`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'EarthOne/1.0 (build@earthone.world; library-hub)',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const docs: any[] = Array.isArray(data?.docs) ? data.docs : [];
    return docs.slice(0, limit).map((d: any) => {
      const key = typeof d.key === 'string' ? d.key : '';
      const olid = key.replace('/works/', '');
      const iaId = Array.isArray(d.ia) && d.ia[0] ? String(d.ia[0]) : '';
      const subjects = Array.isArray(d.subject) ? d.subject.slice(0, 3).join(', ') : '';
      return {
        id: `openlibrary_${olid || Math.random().toString(36).slice(2)}`,
        title: String(d.title || 'Untitled Book'),
        author: Array.isArray(d.author_name) && d.author_name[0] ? String(d.author_name[0]) : 'Unknown Author',
        language: Array.isArray(d.language) && d.language[0] ? String(d.language[0]) : 'zh',
        coverImage: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : undefined,
        description: subjects ? `主题: ${subjects}` : (d.edition_count ? `Open Library 收录，共 ${d.edition_count} 个版本` : 'Open Library 开放藏书'),
        year: d.first_publish_year ? String(d.first_publish_year) : undefined,
        source: 'openlibrary' as const,
        sourceUrl: key ? `https://openlibrary.org${key}` : 'https://openlibrary.org',
        embedUrl: iaId ? `https://archive.org/embed/${encodeURIComponent(iaId)}` : undefined,
        identifier: iaId || undefined,
        canImport: Boolean(iaId),
        canReadOnline: true
      };
    });
  } catch {
    return [];
  }
}

async function searchInternetArchiveTexts(query: string, limit = 10): Promise<CrawledBook[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const iaq = `(${q}) AND mediatype:(texts)`;
    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(iaq)}&fl[]=identifier,title,creator,year,language,description,subject&sort[]=downloads+desc&rows=${limit}&page=1&output=json`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'EarthOne/1.0 (build@earthone.world; library-crawler)',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const docs: any[] = Array.isArray(data?.response?.docs) ? data.response.docs : [];
    return docs.slice(0, limit).map((d: any) => {
      const identifier = String(d.identifier || '');
      return {
        id: `archive_${identifier || Math.random().toString(36).slice(2)}`,
        title: String(d.title || identifier || 'Untitled'),
        author: Array.isArray(d.creator) ? String(d.creator[0]) : (d.creator ? String(d.creator) : 'Internet Archive 典藏'),
        language: Array.isArray(d.language) ? String(d.language[0]) : (d.language ? String(d.language) : 'und'),
        coverImage: identifier ? `https://archive.org/services/img/${encodeURIComponent(identifier)}` : undefined,
        description: Array.isArray(d.subject) ? `学科分类: ${d.subject.slice(0, 4).join(', ')}` : (typeof d.description === 'string' ? d.description.slice(0, 160) : 'Internet Archive 公共图书与全文扫描文档'),
        year: d.year ? String(d.year) : undefined,
        source: 'archive' as const,
        sourceUrl: identifier ? `https://archive.org/details/${encodeURIComponent(identifier)}` : 'https://archive.org',
        embedUrl: identifier ? `https://archive.org/embed/${encodeURIComponent(identifier)}` : undefined,
        identifier: identifier || undefined,
        canImport: Boolean(identifier),
        canReadOnline: true
      };
    });
  } catch {
    return [];
  }
}

function toCrawled(r: BookSearchResult): CrawledBook {
  const sourceUrl =
    r.source === 'gutenberg' ? `https://www.gutenberg.org/ebooks/${r.id.replace('gutenberg_', '')}`
    : r.source === 'archive' && r.identifier ? `https://archive.org/details/${encodeURIComponent(r.identifier)}`
    : r.source === 'wikisource' && r.pageTitle ? `https://zh.wikisource.org/wiki/${encodeURIComponent(r.pageTitle)}`
    : r.source === 'ar_wikisource' && r.pageTitle ? `https://ar.wikisource.org/wiki/${encodeURIComponent(r.pageTitle)}`
    : '';

  const embedUrl =
    r.source === 'archive' && r.identifier ? `https://archive.org/embed/${encodeURIComponent(r.identifier)}`
    : undefined;

  return {
    id: r.id,
    title: typeof r.title === 'string' ? r.title : String(r.title || ''),
    author: typeof r.author === 'string' ? r.author : Array.isArray(r.author) ? (r.author as any).join(', ') : String(r.author || ''),
    language: r.language,
    coverImage: r.coverImage || (r.identifier ? `https://archive.org/services/img/${encodeURIComponent(r.identifier)}` : undefined),
    description: r.description,
    year: r.year,
    source: r.source,
    sourceUrl: sourceUrl || r.textUrl || '',
    embedUrl,
    textUrl: r.textUrl,
    epubUrl: r.epubUrl,
    pageTitle: r.pageTitle,
    identifier: r.identifier,
    canImport: r.source === 'gutenberg' || r.source === 'wikisource' || r.source === 'ar_wikisource' || r.source === 'archive',
    canReadOnline: !!(embedUrl || r.textUrl || r.pageTitle || r.identifier)
  };
}

export async function crawlOpenBooks(query: string, limit = 16): Promise<{ results: CrawledBook[]; sources: Array<{ source: string; count: number; ok: boolean }> }> {
  const q = query.trim();
  if (!q) return { results: [], sources: [] };
  const islamicHint = /\b(quran|koran|hadith|sunnah|islam|islamic|muslim|tafsir|fiqh|seerah|sirah|prophet|sahih|bukhari)\b|[\u0600-\u06FF]/i.test(q);

  const [gutenberg, ol, iaTexts, ws, arws] = await Promise.all([
    withTimeout(searchBooks(q, limit)),
    withTimeout(searchOpenLibrary(q, Math.min(12, limit))),
    withTimeout(searchInternetArchiveTexts(q, Math.min(12, limit))),
    withTimeout(searchWikisource(q, Math.min(8, limit))),
    withTimeout(searchArabicWikisource(q, Math.min(8, limit)))
  ]);

  const sources = [
    { source: 'openlibrary', count: ol?.length || 0, ok: ol !== null },
    { source: 'archive', count: iaTexts?.length || 0, ok: iaTexts !== null },
    { source: 'wikisource', count: ws?.length || 0, ok: ws !== null },
    { source: 'gutenberg', count: gutenberg?.length || 0, ok: gutenberg !== null },
    { source: 'arabic_wikisource', count: arws?.length || 0, ok: arws !== null }
  ];

  const all: CrawledBook[] = [
    ...(ol || []),
    ...(iaTexts || []),
    ...(ws || []).map(toCrawled),
    ...(gutenberg || []).map(toCrawled),
    ...(arws || []).map(toCrawled)
  ];

  // Dedupe by normalized title+author
  const seen = new Set<string>();
  const deduped = all.filter(b => {
    const titleStr = typeof b.title === 'string' ? b.title : String(b.title || '');
    const authorStr = typeof b.author === 'string' ? b.author : Array.isArray(b.author) ? (b.author as any).join(', ') : String(b.author || '');
    const key = `${titleStr.toLowerCase().replace(/\s+/g, ' ').trim()}::${authorStr.toLowerCase().trim()}`.slice(0, 120);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Prefer importable/readable items
  deduped.sort((a, b) => (Number(b.canImport) - Number(a.canImport)) || (Number(b.canReadOnline) - Number(a.canReadOnline)));
  return { results: deduped.slice(0, limit * 2), sources };
}
