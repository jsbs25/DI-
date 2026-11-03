/**
 * EARTH ONE - WEB INGESTION ENGINE
 * Real networked fetching, search, and crawler workers for the Digital Library,
 * Web Browser, and Content Crawler subsystems.
 *
 * Uses Node's built-in global `fetch` (Node 18+). No third-party dependencies.
 * Robust to network failures: every call is bounded by a timeout and degrades
 * gracefully so the UI never crashes on a dead link.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface ExtractedPage {
  url: string;
  title: string;
  author: string;
  content: string;
  readTime: string;
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 EARTH-ONE-Ingestion/1.0';

const DEFAULT_TIMEOUT_MS = 9000;

// ---------------------------------------------------------------------------
// HTTP layer
// ---------------------------------------------------------------------------

async function fetchText(url: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en,zh-CN;q=0.8,zh;q=0.6'
      }
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// HTML parsing utilities (lightweight, no cheerio/jsdom)
// ---------------------------------------------------------------------------

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMetaContent(html: string, nameOrProperty: string): string {
  const nameRe = new RegExp(
    `<meta[^>]+(?:name|property)=["']${nameOrProperty}["'][^>]+content=["']([^"']*)["']`,
    'i'
  );
  const contentFirstRe = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${nameOrProperty}["']`,
    'i'
  );
  const m = html.match(nameRe) || html.match(contentFirstRe);
  return m ? decodeEntities(m[1]) : '';
}

function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1].trim()) return decodeEntities(titleMatch[1].trim());
  return extractMetaContent(html, 'og:title') || extractMetaContent(html, 'twitter:title') || '';
}

function extractAuthor(html: string): string {
  return (
    extractMetaContent(html, 'author') ||
    extractMetaContent(html, 'article:author') ||
    extractMetaContent(html, 'og:site_name') ||
    ''
  );
}

function extractDescription(html: string): string {
  return (
    extractMetaContent(html, 'description') ||
    extractMetaContent(html, 'og:description') ||
    ''
  );
}

function extractMainText(html: string): string {
  // Prefer <article>, <main>, then fall back to <body>
  let scope = html;
  const article = html.match(/<article[\s\S]*?<\/article>/i);
  const main = html.match(/<main[\s\S]*?<\/main>/i);
  if (article && article[0]) scope = article[0];
  else if (main && main[0]) scope = main[0];

  const paragraphs = scope
    .split(/<\/(p|h1|h2|h3|li|div)>/gi)
    .map(stripHtml)
    .filter(t => t.length > 40);

  if (paragraphs.length > 0) {
    return dedupeParagraphs(paragraphs).slice(0, 20).join('\n\n');
  }

  const fallback = stripHtml(scope);
  return fallback.length > 80 ? fallback.slice(0, 8000) : fallback;
}

function dedupeParagraphs(paragraphs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paragraphs) {
    const key = p.slice(0, 80);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
    if (out.length >= 25) break;
  }
  return out;
}

function estimateReadTime(content: string): string {
  const words = content.split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 220));
  return `${minutes} min read`;
}

function extractLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const links = new Set<string>();
  const re = /<a[^>]+href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const absolute = new URL(m[1], baseUrl);
      if (absolute.protocol === 'http:' || absolute.protocol === 'https:') {
        absolute.hash = '';
        links.add(absolute.toString());
      }
    } catch {
      // ignore malformed hrefs
    }
  }
  return Array.from(links);
}

// ---------------------------------------------------------------------------
// Article extraction
// ---------------------------------------------------------------------------

export async function fetchAndExtract(url: string): Promise<ExtractedPage> {
  const html = await fetchText(url);
  const title = extractTitle(html);
  const author = extractAuthor(html) || new URL(url).hostname.replace(/^www\./, '');
  const description = extractDescription(html);
  let content = extractMainText(html);

  if (content.length < 80) content = description || content;

  const hostname = new URL(url).hostname.replace(/^www\./, '');
  return {
    url,
    title: title || hostname,
    author,
    content: content.length ? content : `No extractable text from ${url}.`,
    readTime: estimateReadTime(content)
  };
}

// ---------------------------------------------------------------------------
// Search (multi-provider with graceful fallback)
// ---------------------------------------------------------------------------

/**
 * Web search. Tries Bing first (general web search, most Google-like),
 * then DuckDuckGo, then Wikipedia's opensearch API — so a search always
 * returns something useful even when one provider blocks us.
 */
export async function searchWeb(
  query: string,
  limit = 8,
  engine: 'auto' | 'bing' | 'duckduckgo' | 'wikipedia' = 'auto',
  lang: 'en' | 'zh' | 'ar' | 'es' | 'fr' | 'ru' = 'en'
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  if (engine === 'bing') {
    const r = await searchBing(q, limit);
    return r.length > 0 ? r : await searchWikipedia(q, limit, lang);
  }
  if (engine === 'duckduckgo') {
    const r = await searchDuckDuckGo(q, limit);
    return r.length > 0 ? r : await searchWikipedia(q, limit, lang);
  }
  if (engine === 'wikipedia') {
    return searchWikipedia(q, limit, lang);
  }

  // auto: Wikipedia first (accurate + multilingual), then DuckDuckGo, then Bing.
  // Bing is last because its HTML endpoint is unreliable and often returns
  // unrelated regional content regardless of query.
  const wiki = await searchWikipedia(q, limit, lang);
  if (wiki.length > 0) return wiki;

  const ddg = await searchDuckDuckGo(q, limit);
  if (ddg.length > 0) return ddg;

  return searchBing(q, limit);
}

async function searchBing(query: string, limit: number): Promise<SearchResult[]> {
  try {
    const html = await fetchText(
      `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${limit}`,
      7000
    );

    const results: SearchResult[] = [];
    const blocks = html.split(/<li class="b_algo"/i).slice(1);

    for (const block of blocks) {
      const linkMatch = block.match(/<h2><a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/i);
      if (!linkMatch) continue;

      let url = decodeEntities(linkMatch[1]);
      // Bing wraps the real destination in a /ck/a redirect; the `u=` param is base64url,
      // sometimes prefixed with "a1" (denoting base64-encoded UTF-8 data).
      const uMatch = url.match(/[?&]u=([^&]+)/);
      if (uMatch) {
        try {
          let encoded = uMatch[1].replace(/-/g, '+').replace(/_/g, '/');
          encoded = encoded.replace(/^a1/, '');
          const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
          if (/^https?:\/\//i.test(decoded)) url = decoded;
        } catch {
          // keep the redirect URL if decoding fails
        }
      }

      const title = stripHtml(linkMatch[2]);
      const snippetMatch = block.match(/<p class="b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
      const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : '';

      if (!title || !url) continue;
      if (!url.startsWith('http://') && !url.startsWith('https://')) continue;

      results.push({ title, url, snippet });
      if (results.length >= limit) break;
    }

    return results;
  } catch {
    return [];
  }
}

async function searchDuckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
  try {
    const html = await fetchText(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      7000
    );

    const results: SearchResult[] = [];
    const resultBlocks = html.split(/<div[^>]+class=["'][^"']*result/gi).slice(1);

    for (const block of resultBlocks) {
      const linkMatch = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*result__a/i) ||
        block.match(/<a[^>]+class=["'][^"']*result__a[^>]+href=["']([^"']+)["']/i) ||
        block.match(/<a[^>]+href=["']([^"']+)["']/i);

      if (!linkMatch) continue;

      let url = linkMatch[1];
      // DuckDuckGo wraps redirects in //duckduckgo.com/l/?uddg=...
      const uddg = url.match(/uddg=([^&]+)/);
      if (uddg) {
        url = decodeURIComponent(uddg[1]);
      }

      const titleMatch = block.match(/<a[^>]+class=["'][^"']*result__a[^>]*>([\s\S]*?)<\/a>/i) ||
        block.match(/<a[^>]+href=["'][^"']+["'][^>]*>([\s\S]*?)<\/a>/i);
      const snippetMatch = block.match(/<a[^>]+class=["'][^"']*result__snippet[^>]*>([\s\S]*?)<\/a>/i) ||
        block.match(/<[^>]+class=["'][^"']*result__snippet[^>]*>([\s\S]*?)<\//i);

      const title = titleMatch ? stripHtml(titleMatch[1]) : url;
      const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : '';

      if (!title || !url || url.startsWith('javascript:')) continue;
      if (!url.startsWith('http://') && !url.startsWith('https://')) continue;

      results.push({ title, url, snippet });
      if (results.length >= limit) break;
    }

    return results;
  } catch {
    return [];
  }
}

async function searchWikipedia(
  query: string,
  limit: number,
  lang: 'en' | 'zh' | 'ar' | 'es' | 'fr' | 'ru' = 'en'
): Promise<SearchResult[]> {
  // Map app language to the matching Wikipedia subdomain
  const langHost: Record<string, string> = {
    en: 'en.wikipedia.org',
    zh: 'zh.wikipedia.org',
    ar: 'ar.wikipedia.org',
    es: 'es.wikipedia.org',
    fr: 'fr.wikipedia.org',
    ru: 'ru.wikipedia.org'
  };
  const host = langHost[lang] || 'en.wikipedia.org';

  try {
    const opensearchUrl = `https://${host}/w/api.php?action=opensearch&search=${encodeURIComponent(
      query
    )}&limit=${limit}&namespace=0&format=json&origin=*`;
    const json = await fetchText(opensearchUrl, 7000);
    const parsed = JSON.parse(json);
    // opensearch shape: [query, [titles], [descriptions], [urls]]
    const titles: string[] = parsed[1] || [];
    const urls: string[] = parsed[3] || [];

    const results: SearchResult[] = [];
    for (let i = 0; i < titles.length; i++) {
      if (!titles[i] || !urls[i]) continue;
      const snippet = await fetchWikipediaExtract(urls[i]);
      results.push({ title: titles[i], url: urls[i], snippet });
      if (results.length >= limit) break;
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Fetch a short plain-text extract for a Wikipedia article URL, used as the
 * search result snippet. Falls back to an empty string on failure.
 */
async function fetchWikipediaExtract(articleUrl: string): Promise<string> {
  try {
    const title = articleUrl.split('/wiki/')[1];
    if (!title) return '';
    const host = articleUrl.includes('zh.wikipedia.org') ? 'zh.wikipedia.org' : 'en.wikipedia.org';
    const url = `https://${host}/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exsentences=2&format=json&origin=*&titles=${encodeURIComponent(
      decodeURIComponent(title)
    )}`;
    const jsonText = await fetchText(url, 5000);
    const json = JSON.parse(jsonText);
    const pages = json?.query?.pages || {};
    const firstPage: any = Object.values(pages)[0];
    const extract = firstPage?.extract || '';
    return String(extract).replace(/\s+/g, ' ').trim().slice(0, 260);
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Crawler
// ---------------------------------------------------------------------------

export interface CrawlResult {
  url: string;
  title: string;
  author: string;
  cleanContent: string;
}

/**
 * Breadth-first crawl starting at `startUrl`, staying within the same hostname.
 * Returns up to `maxPages` extracted pages (the start page plus discovered links).
 * Respects a simple robots.txt Disallow list when `respectRobots` is true.
 */
export async function crawlWebsite(
  startUrl: string,
  maxPages: number,
  respectRobots: boolean
): Promise<CrawlResult[]> {
  const start = new URL(startUrl);
  const disallowed: string[] = respectRobots ? await fetchRobotsDisallowed(start) : [];

  const visited = new Set<string>();
  const queue: string[] = [start.toString()];
  const pages: CrawlResult[] = [];

  while (queue.length > 0 && pages.length < maxPages) {
    const current = queue.shift()!;
    const urlObj = new URL(current);
    const canonical = urlObj.toString().replace(/\/$/, '');
    if (visited.has(canonical)) continue;
    visited.add(canonical);

    if (isDisallowed(urlObj.pathname, disallowed)) continue;

    try {
      const html = await fetchText(current);
      const extracted = await fetchAndExtract(current);
      pages.push({
        url: current,
        title: extracted.title,
        author: extracted.author,
        cleanContent: extracted.content
      });

      // Enqueue same-host links for continued crawling
      const links = extractLinks(html, current);
      for (const link of links) {
        try {
          const linkObj = new URL(link);
          if (linkObj.hostname !== start.hostname) continue;
          const linkCanonical = linkObj.toString().replace(/\/$/, '');
          if (!visited.has(linkCanonical) && queue.length + visited.size < maxPages * 4) {
            queue.push(link);
          }
        } catch {
          // skip invalid link
        }
      }
    } catch {
      // Skip pages that fail to load; the crawler is best-effort.
    }
  }

  return pages;
}

async function fetchRobotsDisallowed(start: URL): Promise<string[]> {
  try {
    const robotsUrl = `${start.protocol}//${start.hostname}/robots.txt`;
    const text = await fetchText(robotsUrl, 4000);
    const disallowed: string[] = [];
    let appliesToAll = false;

    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (/^user-agent:/i.test(trimmed)) {
        const agent = trimmed.replace(/^user-agent:\s*/i, '').toLowerCase();
        appliesToAll = agent === '*';
      } else if (appliesToAll && /^disallow:/i.test(trimmed)) {
        const path = trimmed.replace(/^disallow:\s*/i, '').trim();
        if (path) disallowed.push(path);
      }
    }
    return disallowed;
  } catch {
    return [];
  }
}

function isDisallowed(pathname: string, disallowed: string[]): boolean {
  return disallowed.some(pattern => {
    if (!pattern) return false;
    if (pattern === '/') return true;
    return pathname.startsWith(pattern);
  });
}

// ---------------------------------------------------------------------------
// Book search & full-text retrieval (Project Gutenberg via Gutendex)
// ---------------------------------------------------------------------------

export interface BookSearchResult {
  id: string;
  title: string;
  author: string;
  language: string;
  coverImage?: string;
  description: string;
  year?: string;
  textUrl?: string;
  epubUrl?: string;
  source: 'gutenberg' | 'wikisource';
  pageTitle?: string; // wikisource page title for full-text retrieval
}

const GUTENDEX_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 EARTH-ONE-Library/1.0';

/**
 * Search public-domain books by title/author via Gutendex (Project Gutenberg
 * JSON API). Returns metadata + the plain-text URL used to fetch full content.
 */
export async function searchBooks(query: string, limit = 12): Promise<BookSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    // Note: use /books/ (trailing slash) — Gutendex 301-redirects /books to /books/
    const res = await fetch(
      `https://gutendex.com/books/?search=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': GUTENDEX_USER_AGENT, Accept: 'application/json' }, signal: controller.signal }
    );
    clearTimeout(timer);

    if (!res.ok) return [];
    const data = await res.json();
    const results: any[] = data?.results || [];

    return results.slice(0, limit).map((r: any) => {
      const formats: Record<string, string> = r.formats || {};
      // Prefer UTF-8 plain text, then any text/plain variant
      const textUrl =
        formats['text/plain; charset=utf-8'] ||
        formats['text/plain'] ||
        formats['text/plain; charset=us-ascii'] ||
        undefined;
      const epubUrl = formats['application/epub+zip'] || undefined;

      const author = r.authors?.[0]?.name || 'Unknown Author';
      const summary = (r.summaries?.[0] || '').replace(/\s+/g, ' ').trim();

      return {
        id: `gutenberg_${r.id}`,
        title: r.title || 'Untitled',
        author,
        language: r.languages?.[0] || 'en',
        coverImage: formats['image/jpeg'] || undefined,
        description: summary.slice(0, 300) || `A public-domain work by ${author}.`,
        year: r.authors?.[0]?.birth_year ? undefined : undefined,
        textUrl,
        epubUrl,
        source: 'gutenberg' as const
      };
    }).filter(b => b.textUrl || b.epubUrl); // only books we can actually read
  } catch {
    return [];
  }
}

/**
 * Search Chinese classical / public-domain texts via Wikisource.
 * Returns metadata + the page title used to fetch full wikitext content.
 */
export async function searchWikisource(query: string, limit = 10): Promise<BookSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const url = `https://zh.wikisource.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      q
    )}&format=json&formatversion=2&srlimit=${limit}&srnamespace=0`;
    const res = await fetch(url, {
      headers: { 'User-Agent': GUTENDEX_USER_AGENT, Accept: 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) return [];
    const data = await res.json();
    const results: any[] = data?.query?.search || [];

    return results.map((r: any) => ({
      id: `wikisource_${r.pageid}`,
      title: r.title || 'Untitled',
      author: '维基文库 · 公版文献',
      language: 'zh',
      description: stripHtml(r.snippet || '').slice(0, 260) || '中文维基文库收录的公版文献。',
      textUrl: undefined,
      source: 'wikisource' as const,
      pageTitle: r.title
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch the full plain text of a Chinese Wikisource page (wikitext → text).
 * Returns title and chapter list, splitting on wikitext `== heading ==`
 * section markers so books keep their natural chapter structure.
 */
export async function fetchWikisourceFullText(pageTitle: string): Promise<{ title: string; author: string; chapters: { title: string; content: string }[] }> {
  const url = `https://zh.wikisource.org/w/api.php?action=parse&page=${encodeURIComponent(
    pageTitle
  )}&prop=wikitext&format=json&formatversion=2`;
  const data = JSON.parse(await fetchText(url, 15000));
  const wikitext: string = data?.parse?.wikitext || '';

  const title = pageTitle.replace(/\([^)]*\)/g, '').trim();
  const author = '维基文库 · 公版文献';

  // Clean wiki markup from a chunk of text while preserving newlines
  const cleanChunk = (chunk: string): string => {
    return chunk
      .replace(/\{\{[^}]*\}\}/g, ' ')                 // templates
      .replace(/\[\[File:[^\]]*\]\]/g, ' ')             // file embeds
      .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1') // internal links → label
      .replace(/\[https?:[^\]\s]+\s([^\]]+)\]/g, '$1')  // external links → label
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, ' ')       // references
      .replace(/<[^>]+>/g, ' ')                           // remaining HTML
      .replace(/['*#\[\]{}|]/g, ' ')                      // wiki markup symbols
      .replace(/[ \t]+/g, ' ')                             // collapse spaces (keep newlines)
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  // Split on `== heading ==` section markers to preserve real chapter structure
  const sections = wikitext.split(/\n\s*(?=={2,6}[^=])/);

  const chapters: { title: string; content: string }[] = [];
  let preamble = '';

  for (const section of sections) {
    const m = section.match(/^\s*(={2,6})\s*(.+?)\s*\1\s*\n?/);
    if (m) {
      const heading = m[2].trim();
      const body = cleanChunk(section.slice(m[0].length));
      if (body.length > 0) {
        chapters.push({ title: heading, content: body });
      }
    } else {
      preamble += section + '\n';
    }
  }

  // If no `==` headings found (e.g. a single prose page), chunk by paragraphs
  if (chapters.length === 0) {
    const cleaned = cleanChunk(wikitext);
    const paragraphs = cleaned.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 15);
    const chunkSize = Math.max(1, Math.ceil(paragraphs.length / 8));
    for (let i = 0; i < paragraphs.length; i += chunkSize) {
      const chunk = paragraphs.slice(i, i + chunkSize);
      chapters.push({ title: `第 ${chapters.length + 1} 节`, content: chunk.join('\n\n') });
    }
  }

  // Prepend any preamble (intro text before first heading) as its own chapter
  const intro = cleanChunk(preamble);
  if (intro.length > 0) {
    chapters.unshift({ title: '序言', content: intro });
  }

  return { title, author, chapters: chapters.slice(0, 50) };
}

/**
 * Download a book's full plain text and split it into chapters.
 * Gutenberg texts use explicit "CHAPTER I." / "Chapter 1" / "BOOK IV."
 * markers; we split on those so each chapter is a readable, natural unit.
 *
 * Tolerates Gutenberg footnote artifacts like "Chapter I.]" or missing
 * trailing periods ("CHAPTER XIII").
 */
export async function fetchBookFullText(textUrl: string): Promise<{ title: string; author: string; chapters: { title: string; content: string }[] }> {
  const raw = await fetchText(textUrl, 15000);

  // Strip Gutenberg header (up to the first "*** START" marker) and footer
  let body = raw;
  const startMatch = raw.match(/\*\*\*\s*START[^*]*\*\*\*/i);
  if (startMatch && startMatch.index !== undefined) {
    body = raw.slice(startMatch.index + startMatch[0].length);
  }
  const endMatch = body.match(/\*\*\*\s*END[^*]*\*\*\*/i);
  if (endMatch && endMatch.index !== undefined) {
    body = body.slice(0, endMatch.index);
  }

  body = body.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  // Extract title/author from the header portion
  const header = raw.slice(0, 2000);
  const titleMatch = header.match(/Title:\s*(.+)/i);
  const authorMatch = header.match(/Author:\s*(.+)/i);
  const title = titleMatch?.[1]?.trim() || 'Untitled Book';
  const author = authorMatch?.[1]?.trim() || 'Unknown Author';

  // Match chapter headings, tolerating Gutenberg artifacts like "Chapter I.]"
  const headingRe = /^\s*(?:CHAPTER|Chapter|BOOK|Book)\s+[IVXLC0-9]+[.\]\s]*$/gm;

  const chapters: { title: string; content: string }[] = [];
  let lastIndex = 0;
  let lastHeading = '';
  let m: RegExpExecArray | null;

  while ((m = headingRe.exec(body)) !== null) {
    const heading = m[0].trim().replace(/[.\] ]+$/, '');
    const start = m.index;
    // Text between the previous heading and this one belongs to the previous chapter
    if (lastHeading) {
      const content = body.slice(lastIndex, start).trim();
      if (content.length >= 40) chapters.push({ title: lastHeading, content });
    }
    lastHeading = heading;
    lastIndex = headingRe.lastIndex;
  }

  // Trailing content after the final heading
  if (lastHeading) {
    const content = body.slice(lastIndex).trim();
    if (content.length >= 40) chapters.push({ title: lastHeading, content });
  }

  // If no chapter markers were found, fall back to paragraph chunking
  if (chapters.length <= 1) {
    const paragraphs = body.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 20);
    const chunkSize = Math.max(1, Math.ceil(paragraphs.length / 12));
    const fallback: { title: string; content: string }[] = [];
    for (let i = 0; i < paragraphs.length; i += chunkSize) {
      const chunk = paragraphs.slice(i, i + chunkSize);
      fallback.push({ title: `Chapter ${fallback.length + 1}`, content: chunk.join('\n\n') });
    }
    return { title, author, chapters: fallback.slice(0, 40) };
  }

  return { title, author, chapters: chapters.slice(0, 80) };
}
