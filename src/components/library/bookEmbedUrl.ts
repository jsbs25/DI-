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

export function getBookEmbedUrl(book: EmbeddableBookRef): { url: string; label: string } | null {
  const source = String(book.source || '').toLowerCase();
  const sourceUrl = safeHttps(book.sourceUrl) || safeHttps(book.externalReadUrl);
  const directEmbed = safeHttps(book.embedUrl);

  if (directEmbed) {
    if (source === 'youtube' || /youtube\.com|youtu\.be/i.test(directEmbed)) {
      return { url: directEmbed, label: 'YouTube 有声全本精读' };
    }
    if (source === 'bilibili' || /bilibili\.com/i.test(directEmbed)) {
      return { url: directEmbed, label: 'Bilibili 读书精讲' };
    }
    if (source === 'googlebooks' || /books\.google\./i.test(directEmbed)) {
      return { url: directEmbed, label: 'Google Books 官方在线预览' };
    }
    return { url: directEmbed, label: '官方嵌入阅读' };
  }

  if (source === 'youtube' || (sourceUrl && /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/.test(sourceUrl))) {
    const vid = book.identifier || sourceUrl?.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1];
    if (vid) {
      return { url: `https://www.youtube.com/embed/${vid}?autoplay=1&enablejsapi=1&rel=0&playsinline=1`, label: 'YouTube 有声全本精读' };
    }
  }

  if (source === 'bilibili' || (sourceUrl && /bilibili\.com\/video\/(BV[A-Za-z0-9]+)/i.test(sourceUrl))) {
    const bvid = book.identifier || sourceUrl?.match(/bilibili\.com\/video\/(BV[A-Za-z0-9]+)/i)?.[1];
    if (bvid) {
      return { url: `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}&high_quality=1&danmaku=0&autoplay=1`, label: 'Bilibili 读书精讲' };
    }
  }

  const iaId = iaIdentifier(book);
  if (source === 'archive' || source === 'archive_islamic' || source === 'internet archive' || (sourceUrl && /archive\.org/.test(sourceUrl))) {
    if (iaId) return { url: `https://archive.org/embed/${encodeURIComponent(iaId)}`, label: 'Internet Archive 公开阅读' };
  }

  // Open Library, Project Gutenberg, and Wikisource send X-Frame-Options / frame-ancestors
  // headers blocking <iframe> embeds; those sources are read directly in the built-in chapter
  // reader via full-text ingest or via external source link instead of blank frames.
  if (sourceUrl && /google\.[^/]+\/books/.test(sourceUrl)) {
    const gbId = book.identifier || sourceUrl.match(/[?&]id=([^&]+)/)?.[1];
    if (gbId) {
      return { url: `https://books.google.com/books?id=${encodeURIComponent(gbId)}&printsec=frontcover&output=embed`, label: 'Google Books 官方在线预览' };
    }
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
  const candidates = [book.externalReadUrl, book.textUrl, book.sourceUrl];
  for (const c of candidates) {
    if (!c) continue;
    if (c.startsWith('/api/library/local-pdfs/') || c.startsWith('/api/library/pdf-stream')) {
      return c;
    }
    if (isProbablyPdfUrl(c)) return safeHttps(c);
  }
  return null;
}

const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'yi', 'ug', 'dv', 'ku']);
export function isRtlLanguage(lang?: string): boolean {
  if (!lang) return false;
  const base = lang.toLowerCase().split(/[-_]/)[0];
  return RTL_LANGS.has(base) || /^ar\b/i.test(lang);
}
