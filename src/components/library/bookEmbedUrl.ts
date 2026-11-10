/**
 * Official/public reader embed URLs for open sources (no API keys, no scraping).
 * Embeds are best-effort: availability, CORS/frame policy, and rights are controlled by the source.
 */
export interface EmbeddableBookRef {
  source?: string;
  sourceUrl?: string;
  externalReadUrl?: string;
  textUrl?: string;
  pageTitle?: string;
  identifier?: string;
  externalId?: string;
  epubUrl?: string;
  embedUrl?: string;
  language?: string;
}

function safeHttps(url?: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.href;
  } catch {
    return null;
  }
}

function iaIdentifier(book: EmbeddableBookRef): string | null {
  const id = typeof book.identifier === 'string' ? book.identifier : typeof book.externalId === 'string' ? book.externalId : '';
  if (/^[A-Za-z0-9._-]+$/.test(id)) return id;
  const sourceUrl = safeHttps(book.sourceUrl) || safeHttps(book.externalReadUrl);
  const m = sourceUrl?.match(/archive\.org\/(?:details|embed|download|stream)\/([A-Za-z0-9._-]+)/);
  return m?.[1] || null;
}

function gutenbergId(book: EmbeddableBookRef): string | null {
  const sourceUrl = safeHttps(book.sourceUrl) || safeHttps(book.externalReadUrl);
  const fromUrl = sourceUrl?.match(/gutenberg\.org\/ebooks\/(\d+)/)?.[1];
  if (fromUrl) return fromUrl;
  const ext = (book.externalId || book.identifier || '').replace(/^gutenberg_/, '');
  return /^\d+$/.test(ext) ? ext : null;
}

export function getBookEmbedUrl(book: EmbeddableBookRef): { url: string; label: string } | null {
  const source = String(book.source || '').toLowerCase();
  const sourceUrl = safeHttps(book.sourceUrl) || safeHttps(book.externalReadUrl);

  if (safeHttps(book.embedUrl)) {
    return { url: safeHttps(book.embedUrl)!, label: '官方嵌入阅读' };
  }

  const iaId = iaIdentifier(book);
  if (source === 'archive' || source === 'archive_islamic' || source === 'internet archive' || (sourceUrl && /archive\.org/.test(sourceUrl))) {
    if (iaId) return { url: `https://archive.org/embed/${encodeURIComponent(iaId)}`, label: 'Internet Archive 公开阅读' };
  }

  const olMatch = sourceUrl?.match(/openlibrary\.org\/(works|books)\/([A-Za-z0-9]+)/);
  if (source === 'openlibrary' || olMatch) {
    if (olMatch) return { url: `https://openlibrary.org/${olMatch[1]}/${olMatch[2]}`, label: 'Open Library 官方页面/借阅' };
    if (sourceUrl?.includes('openlibrary.org')) return { url: sourceUrl, label: 'Open Library 官方页面/借阅' };
  }

  const gutId = gutenbergId(book);
  if (source === 'gutenberg' || source === 'project gutenberg' || gutId) {
    if (gutId) return { url: `https://www.gutenberg.org/ebooks/${gutId}.html.images`, label: 'Project Gutenberg 在线阅读' };
  }

  if ((source === 'wikisource' || /zh\.wikisource\.org/.test(sourceUrl || '')) && book.pageTitle) {
    return { url: `https://zh.wikisource.org/wiki/${encodeURIComponent(book.pageTitle)}`, label: 'Wikisource 在线阅读' };
  }
  if ((source === 'ar_wikisource' || /ar\.wikisource\.org/.test(sourceUrl || '')) && book.pageTitle) {
    return { url: `https://ar.wikisource.org/wiki/${encodeURIComponent(book.pageTitle)}`, label: 'Arabic Wikisource 在线阅读' };
  }
  if (sourceUrl && /wikisource\.org\/wiki\//.test(sourceUrl)) {
    return { url: sourceUrl, label: 'Wikisource 在线阅读' };
  }

  if (sourceUrl && /google\.[^/]+\/books/.test(sourceUrl)) {
    return { url: sourceUrl, label: 'Google Books（按来源权限预览）' };
  }
  return null;
}

export function isProbablyPdfUrl(url?: string): boolean {
  const s = safeHttps(url);
  if (!s) return false;
  try {
    const u = new URL(s);
    return /\.pdf($|\?)/i.test(u.pathname) || /[?&](format|type)=pdf\b/i.test(u.search) || /\/pdf\//i.test(u.pathname);
  } catch {
    return false;
  }
}

export function getBookPdfUrl(book: EmbeddableBookRef & { formatType?: string }): string | null {
  const candidates = [book.textUrl, book.externalReadUrl, book.sourceUrl];
  for (const c of candidates) {
    if (isProbablyPdfUrl(c)) return safeHttps(c!);
  }
  return null;
}

const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'yi', 'ug', 'dv', 'ku']);
export function isRtlLanguage(lang?: string): boolean {
  if (!lang) return false;
  const base = lang.toLowerCase().split(/[-_]/)[0];
  return RTL_LANGS.has(base) || /^ar\b/i.test(lang);
}
