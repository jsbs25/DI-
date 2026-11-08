/**
 * Open book discovery/crawler — aggregates metadata from public/open APIs.
 * Similar to Saturn's multi-source video search: queries multiple providers in
 * parallel and returns unified, safe-to-display results (metadata + official links).
 * Does NOT scrape or download from shadow libraries or unauthorized sources.
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
  source: BookSearchResult['source'] | 'openlibrary';
  sourceUrl: string;
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

async function searchOpenLibrary(query: string, limit = 8): Promise<CrawledBook[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${limit}&fields=key,title,author_name,first_publish_year,language,cover_i,edition_count,subject,ia`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return [];
    const data: any = await res.json();
    const docs: any[] = Array.isArray(data?.docs) ? data.docs : [];
    return docs.slice(0, limit).map((d: any) => {
      const key = typeof d.key === 'string' ? d.key : '';
      const olid = key.replace('/works/', '');
      const subjects = Array.isArray(d.subject) ? d.subject.slice(0, 3).join(', ') : '';
      return {
        id: `openlibrary_${olid || Math.random().toString(36).slice(2)}`,
        title: String(d.title || 'Untitled'),
        author: Array.isArray(d.author_name) && d.author_name[0] ? String(d.author_name[0]) : 'Unknown Author',
        language: Array.isArray(d.language) && d.language[0] ? String(d.language[0]) : 'und',
        coverImage: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : undefined,
        description: subjects ? `Subjects: ${subjects}` : (d.edition_count ? `${d.edition_count} editions on Open Library` : 'Open Library record'),
        year: d.first_publish_year ? String(d.first_publish_year) : undefined,
        source: 'openlibrary' as const,
        sourceUrl: key ? `https://openlibrary.org${key}` : 'https://openlibrary.org',
        canImport: false,
        canReadOnline: true
      };
    });
  } catch {
    return [];
  }
}

async function searchInternetArchiveIslamic(query: string, limit = 8): Promise<CrawledBook[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    // Use IA advancedsearch with subject/language bias for Islamic texts (public metadata/OCR items vary).
    const iaq = `(${q}) AND (subject:(Islam OR Quran OR Hadith OR Tafsir OR Fiqh OR Seerah) OR collection:(islamic_studies) OR language:(ara OR urd OR eng)) AND mediatype:(texts)`;
    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(iaq)}&fl[]=identifier,title,creator,year,language,description,subject&sort[]=downloads+desc&rows=${limit}&page=1&output=json`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return [];
    const data: any = await res.json();
    const docs: any[] = Array.isArray(data?.response?.docs) ? data.response.docs : [];
    return docs.slice(0, limit).map((d: any) => {
      const identifier = String(d.identifier || '');
      return {
        id: `archive_${identifier || Math.random().toString(36).slice(2)}`,
        title: String(d.title || identifier || 'Untitled'),
        author: Array.isArray(d.creator) ? String(d.creator[0]) : (d.creator ? String(d.creator) : 'Internet Archive'),
        language: Array.isArray(d.language) ? String(d.language[0]) : (d.language ? String(d.language) : 'und'),
        description: Array.isArray(d.subject) ? `Subjects: ${d.subject.slice(0, 4).join(', ')}` : 'Internet Archive text record',
        year: d.year ? String(d.year) : undefined,
        source: 'archive' as const,
        sourceUrl: identifier ? `https://archive.org/details/${encodeURIComponent(identifier)}` : 'https://archive.org',
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
  return {
    id: r.id,
    title: r.title,
    author: r.author,
    language: r.language,
    coverImage: r.coverImage,
    description: r.description,
    year: r.year,
    source: r.source,
    sourceUrl: sourceUrl || r.textUrl || '',
    textUrl: r.textUrl,
    epubUrl: r.epubUrl,
    pageTitle: r.pageTitle,
    identifier: r.identifier,
    canImport: r.source === 'gutenberg' || r.source === 'wikisource' || r.source === 'ar_wikisource' || r.source === 'archive',
    canReadOnline: !!(r.textUrl || r.pageTitle || r.identifier)
  };
}

export async function crawlOpenBooks(query: string, limit = 12): Promise<{ results: CrawledBook[]; sources: Array<{ source: string; count: number; ok: boolean }> }> {
  const q = query.trim();
  if (!q) return { results: [], sources: [] };
  const islamicHint = /\b(quran|koran|hadith|sunnah|islam|islamic|muslim|tafsir|fiqh|seerah|sirah|prophet|sahih|bukhari)\b|[\u0600-\u06FF]/i.test(q);

  const [gutenberg, ol, ia, ws, arws, iaIslamic] = await Promise.all([
    withTimeout(searchBooks(q, limit)),
    withTimeout(searchOpenLibrary(q, Math.min(8, limit))),
    withTimeout(searchInternetArchive(q, Math.min(8, limit))),
    withTimeout(searchWikisource(q, Math.min(6, limit))),
    withTimeout(searchArabicWikisource(q, Math.min(8, limit))),
    islamicHint ? withTimeout(searchInternetArchiveIslamic(q, Math.min(8, limit))) : Promise.resolve([] as CrawledBook[])
  ]);

  const sources = [
    { source: 'gutenberg', count: gutenberg?.length || 0, ok: gutenberg !== null },
    { source: 'openlibrary', count: ol?.length || 0, ok: ol !== null },
    { source: 'archive', count: ia?.length || 0, ok: ia !== null },
    { source: 'arabic_wikisource', count: arws?.length || 0, ok: arws !== null },
    { source: 'wikisource', count: ws?.length || 0, ok: ws !== null },
    ...(islamicHint ? [{ source: 'archive_islamic', count: iaIslamic?.length || 0, ok: iaIslamic !== null && iaIslamic !== undefined }] : [])
  ];

  const all: CrawledBook[] = [
    ...(arws || []).map(toCrawled), // prioritize Arabic/Islamic classical texts when relevant
    ...(iaIslamic || []),
    ...(gutenberg || []).map(toCrawled),
    ...(ol || []),
    ...(ia || []).map(toCrawled),
    ...(ws || []).map(toCrawled)
  ];

  // Dedupe by normalized title+author
  const seen = new Set<string>();
  const deduped = all.filter(b => {
    const key = `${b.title.toLowerCase().replace(/\s+/g, ' ').trim()}::${b.author.toLowerCase().trim()}`.slice(0, 120);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Prefer importable/readable items
  deduped.sort((a, b) => (Number(b.canImport) - Number(a.canImport)) || (Number(b.canReadOnline) - Number(a.canReadOnline)));
  return { results: deduped.slice(0, limit * 2), sources };
}
