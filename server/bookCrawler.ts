/**
 * Large-scale parallel book discovery/crawler across:
 * - YouTube Books, Audiobooks & Lectures (in-app interactive player)
 * - Bilibili Books, Readings & Book Talks (in-app interactive player)
 * - Google Books (official Books Embed Preview / Google Books search)
 * - Open Library, Internet Archive, Project Gutenberg, Wikisource, Arabic Wikisource
 */
import {
  searchBooks,
  searchWikisource,
  searchArabicWikisource,
  type BookSearchResult,
} from './webFetcher.ts';
import { searchYouTubeVideos } from './youtubeSearch.ts';
import { buildBilibiliEmbedUrl, searchBilibiliVideos } from './bilibiliCrawler.ts';

export interface CrawledBook {
  id: string;
  title: string;
  author: string;
  language: string;
  coverImage?: string;
  description: string;
  year?: string;
  source: BookSearchResult['source'] | 'openlibrary' | 'zlibrary' | 'googlebooks' | 'youtube' | 'bilibili';
  sourceUrl: string;
  embedUrl?: string;
  textUrl?: string;
  epubUrl?: string;
  pageTitle?: string;
  identifier?: string;
  canImport: boolean;
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

async function searchGoogleBooksCrawler(query: string, limit = 8): Promise<CrawledBook[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const apiKey = process.env.GOOGLE_BOOKS_API_KEY?.trim();
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${Math.min(16, limit)}&printType=books${
      apiKey ? `&key=${encodeURIComponent(apiKey)}` : ''
    }`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'EarthOne/1.0 (library-crawler)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(apiKey ? 8000 : 2800),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const items: any[] = Array.isArray(data?.items) ? data.items : [];
    return items.slice(0, limit).map((item: any) => {
      const id = String(item.id || '');
      const v = item.volumeInfo || {};
      const access = item.accessInfo || {};
      const cover = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail;
      const safeCover = typeof cover === 'string' ? cover.replace(/^http:\/\//i, 'https://') : undefined;
      const embeddable = access.embeddable === true || (access.viewability && access.viewability !== 'NO_PAGES');
      return {
        id: `googlebooks_${id || Math.random().toString(36).slice(2)}`,
        title: String(v.title || 'Google Books 图书'),
        author: Array.isArray(v.authors) && v.authors.length ? v.authors.join(', ') : 'Google Books 收录作者',
        language: typeof v.language === 'string' ? v.language : 'zh',
        coverImage: safeCover,
        description:
          typeof v.description === 'string' && v.description.trim()
            ? v.description.slice(0, 180)
            : v.publisher
              ? `${v.publisher}${v.publishedDate ? ` (${v.publishedDate})` : ''}`
              : 'Google Books 全球图书预览',
        year: typeof v.publishedDate === 'string' ? v.publishedDate.slice(0, 4) : undefined,
        source: 'googlebooks' as const,
        sourceUrl: String(v.previewLink || v.infoLink || `https://books.google.com/books?id=${id}`),
        embedUrl: embeddable && id ? `https://books.google.com/books?id=${encodeURIComponent(id)}&printsec=frontcover&output=embed` : undefined,
        identifier: id || undefined,
        canImport: false,
        canReadOnline: Boolean(embeddable && id),
      };
    });
  } catch {
    return [];
  }
}

async function searchYouTubeBooksCrawler(query: string, limit = 8): Promise<CrawledBook[]> {
  const q = query.trim();
  if (!q) return [];
  const hasCjk = /[\u4e00-\u9fff]/.test(q);
  const ytQuery = hasCjk ? `${q} 有声书 全本 精读` : `${q} full audiobook book reading`;
  try {
    const items = await searchYouTubeVideos(ytQuery, limit);
    return items
      .map((yt) => {
        const m = String(yt.url || '').match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
        const videoId = m?.[1];
        if (!videoId) return null;
        return {
          id: `ytbook_${videoId}`,
          title: yt.title || `${q} · YouTube 有声精读`,
          author: String(yt.snippet || 'YouTube 有声书频道').split(' · ')[0] || 'YouTube 图书频道',
          language: hasCjk ? 'zh' : 'en',
          coverImage: yt.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          description: yt.snippet || 'YouTube 书籍精读 / 全本有声朗读，支持站内直接播放阅读',
          source: 'youtube' as const,
          sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
          embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&rel=0&playsinline=1`,
          identifier: videoId,
          canImport: false,
          canReadOnline: true,
        } satisfies CrawledBook;
      })
      .filter(Boolean) as CrawledBook[];
  } catch {
    return [];
  }
}

async function searchBilibiliBooksCrawler(query: string, limit = 6): Promise<CrawledBook[]> {
  const q = query.trim();
  if (!q) return [];
  const hasCjk = /[\u4e00-\u9fff]/.test(q);
  if (!hasCjk) return [];
  try {
    const items = await searchBilibiliVideos(`${q} 有声书 精读`, limit);
    return items.slice(0, limit).map((b) => ({
      id: `bilibook_${b.bvid}`,
      title: b.title,
      author: b.author || 'Bilibili 读书 UP主',
      language: 'zh',
      coverImage: b.pic,
      description: b.description || 'Bilibili 有声书 / 全本精读解读，支持站内播放',
      source: 'bilibili' as const,
      sourceUrl: b.sourceUrl || `https://www.bilibili.com/video/${b.bvid}`,
      embedUrl: buildBilibiliEmbedUrl(b.bvid, true),
      identifier: b.bvid,
      canImport: false,
      canReadOnline: true,
    }));
  } catch {
    return [];
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
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
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
        description: subjects
          ? `主题: ${subjects}`
          : d.edition_count
            ? `Open Library 收录，共 ${d.edition_count} 个版本`
            : 'Open Library 开放藏书',
        year: d.first_publish_year ? String(d.first_publish_year) : undefined,
        source: 'openlibrary' as const,
        sourceUrl: key ? `https://openlibrary.org${key}` : 'https://openlibrary.org',
        embedUrl: iaId ? `https://archive.org/embed/${encodeURIComponent(iaId)}` : undefined,
        identifier: iaId || undefined,
        canImport: Boolean(iaId),
        canReadOnline: true,
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
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const docs: any[] = Array.isArray(data?.response?.docs) ? data.response.docs : [];
    return docs.slice(0, limit).map((d: any) => {
      const identifier = String(d.identifier || '');
      return {
        id: `archive_${identifier || Math.random().toString(36).slice(2)}`,
        title: String(d.title || identifier || 'Untitled'),
        author: Array.isArray(d.creator) ? String(d.creator[0]) : d.creator ? String(d.creator) : 'Internet Archive 典藏',
        language: Array.isArray(d.language) ? String(d.language[0]) : d.language ? String(d.language) : 'und',
        coverImage: identifier ? `https://archive.org/services/img/${encodeURIComponent(identifier)}` : undefined,
        description: Array.isArray(d.subject)
          ? `学科分类: ${d.subject.slice(0, 4).join(', ')}`
          : typeof d.description === 'string'
            ? d.description.slice(0, 160)
            : 'Internet Archive 公共图书与全文扫描文档',
        year: d.year ? String(d.year) : undefined,
        source: 'archive' as const,
        sourceUrl: identifier ? `https://archive.org/details/${encodeURIComponent(identifier)}` : 'https://archive.org',
        embedUrl: identifier ? `https://archive.org/embed/${encodeURIComponent(identifier)}` : undefined,
        identifier: identifier || undefined,
        canImport: Boolean(identifier),
        canReadOnline: true,
      };
    });
  } catch {
    return [];
  }
}

function toCrawled(r: BookSearchResult): CrawledBook {
  const sourceUrl =
    r.source === 'gutenberg'
      ? `https://www.gutenberg.org/ebooks/${r.id.replace('gutenberg_', '')}`
      : r.source === 'archive' && r.identifier
        ? `https://archive.org/details/${encodeURIComponent(r.identifier)}`
        : r.source === 'wikisource' && r.pageTitle
          ? `https://zh.wikisource.org/wiki/${encodeURIComponent(r.pageTitle)}`
          : r.source === 'ar_wikisource' && r.pageTitle
            ? `https://ar.wikisource.org/wiki/${encodeURIComponent(r.pageTitle)}`
            : '';

  const embedUrl =
    r.source === 'archive' && r.identifier ? `https://archive.org/embed/${encodeURIComponent(r.identifier)}` : undefined;

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
    canReadOnline: !!(embedUrl || r.textUrl || r.pageTitle || r.identifier),
  };
}

export async function crawlOpenBooks(
  query: string,
  limit = 16
): Promise<{ results: CrawledBook[]; sources: Array<{ source: string; count: number; ok: boolean }> }> {
  const q = query.trim();
  if (!q) return { results: [], sources: [] };

  const [googleBooks, ytBooks, biliBooks, ol, iaTexts, gutenberg, ws, arws] = await Promise.all([
    withTimeout(searchGoogleBooksCrawler(q, Math.min(8, limit)), 4000),
    withTimeout(searchYouTubeBooksCrawler(q, Math.min(8, limit)), 8000),
    withTimeout(searchBilibiliBooksCrawler(q, 6), 8000),
    withTimeout(searchOpenLibrary(q, Math.min(10, limit))),
    withTimeout(searchInternetArchiveTexts(q, Math.min(10, limit))),
    withTimeout(searchBooks(q, limit)),
    withTimeout(searchWikisource(q, Math.min(8, limit))),
    withTimeout(searchArabicWikisource(q, Math.min(6, limit))),
  ]);

  const sources = [
    { source: 'youtube', count: ytBooks?.length || 0, ok: ytBooks !== null },
    { source: 'googlebooks', count: googleBooks?.length || 0, ok: googleBooks !== null },
    { source: 'bilibili', count: biliBooks?.length || 0, ok: biliBooks !== null },
    { source: 'openlibrary', count: ol?.length || 0, ok: ol !== null },
    { source: 'archive', count: iaTexts?.length || 0, ok: iaTexts !== null },
    { source: 'wikisource', count: ws?.length || 0, ok: ws !== null },
    { source: 'gutenberg', count: gutenberg?.length || 0, ok: gutenberg !== null },
    { source: 'arabic_wikisource', count: arws?.length || 0, ok: arws !== null },
  ];

  // Prioritize exact-relevance open text/embed books & YouTube/Bilibili full readings
  const all: CrawledBook[] = [
    ...(googleBooks || []),
    ...(ol || []),
    ...(gutenberg || []).map(toCrawled),
    ...(ws || []).map(toCrawled),
    ...(iaTexts || []),
    ...(ytBooks || []),
    ...(biliBooks || []),
    ...(arws || []).map(toCrawled),
  ];

  const seen = new Set<string>();
  const deduped = all.filter((b) => {
    const titleStr = typeof b.title === 'string' ? b.title : String(b.title || '');
    const authorStr =
      typeof b.author === 'string' ? b.author : Array.isArray(b.author) ? (b.author as any).join(', ') : String(b.author || '');
    const key = `${titleStr.toLowerCase().replace(/\s+/g, ' ').trim()}::${authorStr.toLowerCase().trim()}`.slice(0, 120);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const qLower = q.toLowerCase();
  const verdictNoiseRe = /判决书|裁定书|民事一审|民事二审|合同纠纷|仲裁|股份有限公司|有限责任公司/;
  deduped.sort((a, b) => {
    const score = (item: CrawledBook) => {
      const t = (item.title || '').toLowerCase();
      let s = 0;
      if (t === qLower || t === `《${qLower}》`) s += 6;
      else if (t.startsWith(qLower)) s += 4;
      else if (t.includes(qLower)) s += 2;
      if (verdictNoiseRe.test(item.title || '')) s -= 12;
      if (item.canImport) s += 2;
      if (item.embedUrl) s += 2;
      if (item.canReadOnline) s += 1;
      return s;
    };
    return score(b) - score(a);
  });

  return { results: deduped.slice(0, limit * 2), sources };
}
