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
  source?: 'web' | 'github';
  category?: 'images' | 'videos' | 'news' | 'pdf' | 'audio' | 'books' | 'academic';
  sourceUrl?: string;
  thumbnailUrl?: string;
  duration?: string;
  date?: string;
  repository?: string;
  stars?: number;
  forks?: number;
  language?: string;
  license?: string;
  updatedAt?: string;
  openIssues?: number;
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
const GOOGLE_SEARCH_LOCALES = {
  en: { hl: 'en', gl: 'us' },
  zh: { hl: 'zh-cn', gl: 'cn' },
  ar: { hl: 'ar', gl: 'sa' },
  es: { hl: 'es', gl: 'es' },
  fr: { hl: 'fr', gl: 'fr' },
  ru: { hl: 'ru', gl: 'ru' }
} as const;

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
// Raw HTML (for in-page preview via srcdoc)
// ---------------------------------------------------------------------------

/** Fetch the raw HTML of a page (server-side, no CORS/iframe restrictions). */
export async function fetchRawHtml(url: string): Promise<string> {
  return fetchText(url, 12000);
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

  // auto: 优先 Serper.dev（真实 Google 搜索结果），未配置 key 时回退 Bing/DDG/Wikipedia
  const google = await searchGoogle(q, limit);
  if (google.length > 0) return google;

  // auto: prefer broad search providers for normal queries. Wikipedia is a
  // fallback for knowledge lookups, not the default result set for every query.
  const bing = await searchBing(q, limit);
  if (bing.length > 0) return bing.map(result => ({ ...result, source: 'web' as const }));

  const ddg = await searchDuckDuckGo(q, limit);
  if (ddg.length > 0) return ddg.map(result => ({ ...result, source: 'web' as const }));

  return (await searchWikipedia(q, limit, lang)).map(result => ({ ...result, source: 'web' as const }));
}

export async function searchWebProviders(
  query: string,
  limit = 10,
  lang: 'en' | 'zh' | 'ar' | 'es' | 'fr' | 'ru' = 'en'
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const [google, duckDuckGo, bing] = await Promise.all([
    searchGoogle(q, limit),
    searchDuckDuckGo(q, limit),
    searchBing(q, limit)
  ]);
  const relevantResults = [...google, ...duckDuckGo, ...bing]
    .map(result => ({ ...result, source: 'web' as const }))
    .filter(result => {
      try {
        const url = new URL(result.url);
        if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return false;
      } catch {
        return false;
      }
      const terms = q.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [q.toLocaleLowerCase()];
      const searchableText = `${result.title} ${result.snippet}`.toLocaleLowerCase();
      return terms.some(term => searchableText.includes(term));
    });

  if (relevantResults.length) return relevantResults.slice(0, limit * 3);
  const wikipedia = await searchWikipedia(q, limit, lang);
  return wikipedia
    .filter(result => {
      const terms = q.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [q.toLocaleLowerCase()];
      const searchableText = `${result.title} ${result.snippet}`.toLocaleLowerCase();
      return terms.some(term => searchableText.includes(term));
    })
    .map(result => ({ ...result, source: 'web' as const }));
}

/** Google 搜索（Serper.dev）。配置 SERPER_API_KEY 后返回真实 Google 搜索结果，与 Google 首页一致。 */
export async function searchGoogle(query: string, limit = 10): Promise<SearchResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  const q = query.trim();
  if (!q) return [];

  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q, num: Math.min(limit, 20), hl: 'zh-cn', gl: 'cn' })
    });

    if (!res.ok) return [];

    const data = await res.json();
    const organic = data?.organic;
    if (!Array.isArray(organic)) return [];

    return organic.slice(0, limit).map((r: any) => ({
      title: r.title || r.link || 'Untitled',
      url: r.link || '',
      snippet: r.snippet || '',
      source: 'web' as const
    })).filter(r => r.url);
  } catch {
    return [];
  }
}

export function parseGoogleImageResults(data: unknown, limit = 20): SearchResult[] {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { images?: unknown }).images)) return [];
  return ((data as { images: Array<Record<string, unknown>> }).images)
    .slice(0, limit)
    .flatMap(image => {
      const imageUrl = typeof image.imageUrl === 'string' ? image.imageUrl : '';
      const sourceUrl = typeof image.link === 'string' ? image.link : '';
      const thumbnailUrl = typeof image.thumbnailUrl === 'string' ? image.thumbnailUrl : imageUrl;
      const title = typeof image.title === 'string' && image.title.trim() ? image.title.trim() : 'Image result';
      try {
        const imageAddress = new URL(imageUrl);
        const sourceAddress = new URL(sourceUrl);
        const thumbnailAddress = new URL(thumbnailUrl);
        if (imageUrl.length > 2048 || sourceUrl.length > 4096 || thumbnailUrl.length > 2048) return [];
        if (!['http:', 'https:'].includes(imageAddress.protocol) || imageAddress.username || imageAddress.password) return [];
        if (!['http:', 'https:'].includes(sourceAddress.protocol) || sourceAddress.username || sourceAddress.password) return [];
        if (!['http:', 'https:'].includes(thumbnailAddress.protocol) || thumbnailAddress.username || thumbnailAddress.password) return [];
      } catch {
        return [];
      }
      const dimensions = Number.isFinite(image.imageWidth) && Number.isFinite(image.imageHeight)
        ? `${image.imageWidth} × ${image.imageHeight}`
        : '';
      return [{
        title,
        url: imageUrl,
        sourceUrl,
        thumbnailUrl,
        snippet: dimensions,
        source: 'web' as const,
        category: 'images' as const
      }];
    });
}

export async function searchGoogleImages(
  query: string,
  limit = 20,
  lang: 'en' | 'zh' | 'ar' | 'es' | 'fr' | 'ru' = 'en'
): Promise<{ configured: boolean; results: SearchResult[] }> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return { configured: false, results: [] };
  const q = query.trim();
  if (!q) return { configured: true, results: [] };
  const locale = GOOGLE_SEARCH_LOCALES[lang];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, num: Math.min(limit, 20), ...locale })
    });
    if (!response.ok) throw new Error(`Image search provider returned HTTP ${response.status}.`);
    const data: unknown = await response.json();
    return { configured: true, results: parseGoogleImageResults(data, limit) };
  } finally {
    clearTimeout(timer);
  }
}

export type JupiterExternalSearchCategory = Exclude<NonNullable<SearchResult['category']>, 'images'>;

const AUDIO_RESULT_PATH = /\.(?:aac|flac|m4a|mp3|oga|ogg|opus|wav)$/i;
const BOOK_HOSTS = ['books.google.com', 'openlibrary.org', 'gutenberg.org', 'archive.org'];

export function parseGoogleCategoryResults(
  payload: unknown,
  category: JupiterExternalSearchCategory,
  limit = 20
): SearchResult[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = payload as Record<string, unknown>;
  const field = category === 'videos' ? 'videos' : category === 'news' ? 'news' : 'organic';
  const items = data[field];
  if (!Array.isArray(items)) return [];

  return items.slice(0, limit).flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      const url = typeof record.link === 'string' ? record.link : '';
      const title = typeof record.title === 'string' ? record.title.trim() : '';
      if (!url || !title) return [];
      try {
        const address = new URL(url);
        if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password) return [];
        if (category === 'pdf' && !/\.pdf$/i.test(address.pathname)) return [];
        if (category === 'audio' && !AUDIO_RESULT_PATH.test(address.pathname)) return [];
        if (category === 'books' && !BOOK_HOSTS.some(host => address.hostname.toLowerCase() === host || address.hostname.toLowerCase().endsWith(`.${host}`))) return [];
      } catch {
        return [];
      }

      const snippet = [record.snippet, record.description, record.publicationInfo, record.authors]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join(' · ');
      const thumbnailUrl = typeof record.imageUrl === 'string' ? record.imageUrl : '';
      let safeThumbnailUrl: string | undefined;
      try {
        const address = new URL(thumbnailUrl);
        if (['http:', 'https:'].includes(address.protocol) && !address.username && !address.password && thumbnailUrl.length <= 2048) {
          safeThumbnailUrl = thumbnailUrl;
        }
      } catch {
        safeThumbnailUrl = undefined;
      }
      return [{
        title,
        url,
        sourceUrl: url,
        snippet: snippet.slice(0, 1000),
        source: 'web' as const,
        category,
        thumbnailUrl: safeThumbnailUrl,
        duration: typeof record.duration === 'string' ? record.duration : undefined,
        date: typeof record.date === 'string' ? record.date : undefined
      }];
    });
}

export async function searchGoogleCategory(
  query: string,
  category: JupiterExternalSearchCategory,
  limit = 20,
  lang: 'en' | 'zh' | 'ar' | 'es' | 'fr' | 'ru' = 'en'
): Promise<{ configured: boolean; results: SearchResult[] }> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return { configured: false, results: [] };
  const q = query.trim();
  if (!q) return { configured: true, results: [] };
  const locale = GOOGLE_SEARCH_LOCALES[lang];

  const endpoint = category === 'videos' ? 'videos'
    : category === 'news' ? 'news'
      : category === 'academic' ? 'scholar'
        : 'search';
  const providerQuery = category === 'pdf' ? `${q} filetype:pdf`
    : category === 'audio' ? `${q} (filetype:mp3 OR filetype:m4a OR filetype:ogg OR filetype:wav)`
      : category === 'books' ? `${q} (site:books.google.com OR site:openlibrary.org OR site:gutenberg.org OR site:archive.org)`
        : q;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`https://google.serper.dev/${endpoint}`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: providerQuery, num: Math.min(limit, 20), ...locale })
    });
    if (!response.ok) throw new Error(`${category} search provider returned HTTP ${response.status}.`);
    const payload: unknown = await response.json();
    return { configured: true, results: parseGoogleCategoryResults(payload, category, limit) };
  } finally {
    clearTimeout(timer);
  }
}

/** Search GitHub's public repository index. Results are discovery metadata only;
 * importing or executing repository code is intentionally a separate approval step. */
export async function searchGitHubRepositories(query: string, limit = 10): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const apiUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${Math.min(limit, 20)}`;
  const raw = await fetchText(apiUrl, 8000);
  const data = JSON.parse(raw);
  if (!Array.isArray(data?.items)) return [];

  return data.items.map((repo: any) => ({
    title: repo.full_name || repo.name || 'GitHub repository',
    url: repo.html_url,
    snippet: repo.description || 'No repository description provided.',
    source: 'github' as const,
    repository: repo.full_name,
    stars: Number(repo.stargazers_count || 0),
    forks: Number(repo.forks_count || 0),
    language: repo.language || '未标注',
    license: repo.license?.spdx_id || repo.license?.name || '许可证未标注',
    updatedAt: repo.pushed_at || repo.updated_at,
    openIssues: Number(repo.open_issues_count || 0)
  }));
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
  source: 'gutenberg' | 'wikisource' | 'ar_wikisource' | 'archive';
  pageTitle?: string; // wikisource page title for full-text retrieval
  identifier?: string; // Internet Archive item identifier
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

// ---------------------------------------------------------------------------
// Arabic Wikisource (Islamic / Arabic public-domain texts)
// ---------------------------------------------------------------------------

/**
 * Search Arabic Wikisource (ar.wikisource.org) — the richest open source for
 * classical Islamic & Arabic public-domain texts (Quran, Hadith, Tafsir, etc.).
 */
export async function searchArabicWikisource(query: string, limit = 8): Promise<BookSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const url = `https://ar.wikisource.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
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
      id: `ar_wikisource_${r.pageid}`,
      title: r.title || 'Untitled',
      author: 'المكتبة العربية · Arabic Wikisource',
      language: 'ar',
      description: stripHtml(r.snippet || '').slice(0, 260) || 'نص عربي من الملك العام (Arabic public-domain text).',
      textUrl: undefined,
      source: 'ar_wikisource' as const,
      pageTitle: r.title
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch the rendered text of an Arabic Wikisource page. Uses the rendered
 * (HTML) output so MediaWiki templates are already expanded into real text.
 * Splits into chapters by section headings (`<h2>`/`<h3>`/`<h4>`).
 */
export async function fetchArabicWikisourceFullText(
  pageTitle: string
): Promise<{ title: string; author: string; chapters: { title: string; content: string }[] }> {
  const url = `https://ar.wikisource.org/w/api.php?action=parse&page=${encodeURIComponent(
    pageTitle
  )}&prop=text&format=json&formatversion=2`;
  const data = JSON.parse(await fetchText(url, 15000));
  let html: string = data?.parse?.text || '';

  // Remove embedded CSS blocks (MediaWiki injects a big <style> block)
  html = html.replace(/<style[\s\S]*?<\/style>/gi, ' ');

  const toText = (chunk: string): string => {
    return chunk
      .replace(/<(?:p|div|li|tr|br|h[1-6])[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, c) => String.fromCodePoint(parseInt(c, 10)))
      .replace(/&#x([0-9a-f]+);/gi, (_, c) => String.fromCodePoint(parseInt(c, 16)))
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const navNoise = /(السابق|التالي|تصنيف|مصدر|ملاحظات|رأسية|نثر|صندوق)/i;

  // Split by rendered section headings
  const headingRe = /<h([2-4])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const sections: { heading: string; body: string }[] = [];
  let lastIndex = 0;
  let lastHeading = '';
  let m: RegExpExecArray | null;

  while ((m = headingRe.exec(html)) !== null) {
    if (lastHeading) {
      const body = toText(html.slice(lastIndex, m.index));
      if (body.length > 20) sections.push({ heading: lastHeading, body });
    }
    lastHeading = toText(m[2]);
    lastIndex = headingRe.lastIndex;
  }
  // trailing content
  if (lastHeading) {
    const body = toText(html.slice(lastIndex));
    if (body.length > 20) sections.push({ heading: lastHeading, body });
  }

  const chapters = sections
    .filter(s => !navNoise.test(s.heading))
    .map(s => ({ title: s.heading || 'قسم', content: s.body }));

  // If no headings found, chunk the whole rendered text by paragraphs
  if (chapters.length === 0) {
    const whole = toText(html);
    const paragraphs = whole.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 20);
    const chunkSize = Math.max(1, Math.ceil(paragraphs.length / 20));
    for (let i = 0; i < paragraphs.length; i += chunkSize) {
      const chunk = paragraphs.slice(i, i + chunkSize);
      chapters.push({ title: `قسم ${chapters.length + 1}`, content: chunk.join('\n\n') });
    }
  }

  const title = pageTitle.replace(/\/.*$/, '').trim();
  return { title, author: 'Arabic Wikisource · الملك العام', chapters: chapters.slice(0, 60) };
}

// ---------------------------------------------------------------------------
// Internet Archive (public-domain scanned books, incl. Islamic & Arabic)
// ---------------------------------------------------------------------------

/**
 * Search Internet Archive text collection (mediatype:texts) for public-domain
 * books. Each result carries its identifier so full OCR text can be fetched.
 */
export async function searchInternetArchive(query: string, limit = 8): Promise<BookSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const params = new URLSearchParams({
      q: `${q} AND mediatype:texts`,
      fl: ['identifier', 'title', 'creator', 'language', 'year'].join(','),
      rows: String(limit),
      page: '1',
      output: 'json'
    });
    const res = await fetch(`https://archive.org/advancedsearch.php?${params.toString()}`, {
      headers: { 'User-Agent': GUTENDEX_USER_AGENT, Accept: 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) return [];
    const data = await res.json();
    const docs: any[] = data?.response?.docs || [];

    return docs
      .filter((d: any) => d.identifier)
      .map((d: any) => ({
        id: `archive_${d.identifier}`,
        title: d.title || d.identifier,
        author: d.creator || 'Internet Archive',
        language: d.language || 'unknown',
        description: 'Internet Archive 公共领域扫描文献（公版 OCR 全文）。',
        year: d.year ? String(d.year) : undefined,
        textUrl: `https://archive.org/download/${encodeURIComponent(d.identifier)}/${encodeURIComponent(d.identifier)}_djvu.txt`,
        source: 'archive' as const,
        identifier: d.identifier
      }));
  } catch {
    return [];
  }
}

/**
 * Fetch the OCR full text of an Internet Archive item and split it into
 * readable chunks. IA scanned books are OCR'd page-by-page and usually lack
 * clean chapter markers, so we chunk by paragraphs/page breaks.
 *
 * Resolves the real `_djvu.txt` filename via the metadata API (the filename
 * is not always `{identifier}_djvu.txt`).
 */
export async function fetchInternetArchiveFullText(
  identifier: string
): Promise<{ title: string; author: string; chapters: { title: string; content: string }[] }> {
  // Resolve the actual OCR text filename
  let textFilename: string | undefined;
  try {
    const metaRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, {
      headers: { 'User-Agent': GUTENDEX_USER_AGENT, Accept: 'application/json' }
    });
    if (metaRes.ok) {
      const meta = await metaRes.json();
      const files: any[] = meta?.files || [];
      const txt = files.find((f: any) => typeof f.name === 'string' && /_djvu\.txt$/i.test(f.name));
      if (txt) textFilename = txt.name;
    }
  } catch {
    textFilename = undefined;
  }

  if (!textFilename) {
    throw new Error('该 Internet Archive 条目暂无可下载的 OCR 全文（可能只有扫描图片或音频）。');
  }

  const url = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(textFilename)}`;
  const raw = await fetchText(url, 30000);

  let body = raw.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  // Some IA texts have a leading metadata header; drop obvious boilerplate lines
  body = body
    .split('\n')
    .filter(l => !/^https?:\/\//i.test(l.trim()) && !/^Identifier:/i.test(l.trim()))
    .join('\n')
    .trim();

  const paragraphs = body.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 25);
  const chunkSize = Math.max(1, Math.ceil(paragraphs.length / 30));
  const chapters: { title: string; content: string }[] = [];
  for (let i = 0; i < paragraphs.length; i += chunkSize) {
    const chunk = paragraphs.slice(i, i + chunkSize);
    chapters.push({ title: `Section ${chapters.length + 1}`, content: chunk.join('\n\n') });
  }

  if (chapters.length === 0) {
    throw new Error('该条目的 OCR 全文为空，无法诵读。');
  }

  return { title: identifier, author: 'Internet Archive', chapters: chapters.slice(0, 60) };
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
  // and common Islamic/classical section markers (SURA, PART, SECTION, BOOK).
  const headingRe = /^\s*(?:CHAPTER|Chapter|BOOK|Book|SURA|SURAH|Surah|SECTION|Section|PART|Part)\s+[IVXLC0-9]+[.\]\s]*$/gm;

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

  // If no chapter markers were found, fall back to paragraph chunking.
  if (chapters.length <= 1) {
    let paragraphs = body.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 20);

    // Poetry, Quranic verse and many scanned texts use single newlines instead
    // of blank lines. If blank-line splitting yields almost nothing, group
    // single lines into readable chunks so the book is never collapsed to 1 page.
    if (paragraphs.length <= 1) {
      const lines = body.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const linesPerChunk = Math.max(1, Math.ceil(lines.length / 24));
      paragraphs = [];
      for (let i = 0; i < lines.length; i += linesPerChunk) {
        paragraphs.push(lines.slice(i, i + linesPerChunk).join('\n'));
      }
    }

    const chunkSize = Math.max(1, Math.ceil(paragraphs.length / 20));
    const fallback: { title: string; content: string }[] = [];
    for (let i = 0; i < paragraphs.length; i += chunkSize) {
      const chunk = paragraphs.slice(i, i + chunkSize);
      fallback.push({ title: `Chapter ${fallback.length + 1}`, content: chunk.join('\n\n') });
    }
    return { title, author, chapters: fallback.slice(0, 60) };
  }

  return { title, author, chapters: chapters.slice(0, 80) };
}
