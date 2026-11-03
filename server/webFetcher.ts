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
