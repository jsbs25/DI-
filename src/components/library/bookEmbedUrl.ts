/**
 * Official/public reader embed URLs for open sources (no API keys, no scraping).
 * Embeds are best-effort: availability, CORS/frame policy, and rights are controlled by the source.
 */
export interface EmbeddableBookRef {
  source?: string;
  sourceUrl?: string;
  textUrl?: string;
  pageTitle?: string;
  identifier?: string;
  epubUrl?: string;
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

export function getBookEmbedUrl(book: EmbeddableBookRef): { url: string; label: string } | null {
  const source = String(book.source || '').toLowerCase();
  const sourceUrl = safeHttps(book.sourceUrl);
  const identifier = typeof book.identifier === 'string' && /^[A-Za-z0-9._-]+$/.test(book.identifier) ? book.identifier : null;

  if ((book as any).embedUrl && safeHttps((book as any).embedUrl)) {
    return { url: safeHttps((book as any).embedUrl)!, label: '官方嵌入阅读' };
  }
  if (source === 'archive' || source === 'archive_islamic') {
    if (identifier) return { url: `https://archive.org/embed/${encodeURIComponent(identifier)}`, label: 'Internet Archive 3D翻书阅读' };
    if (sourceUrl?.includes('archive.org/details/')) {
      const id = sourceUrl.split('/details/')[1]?.split(/[?#/]/)[0];
      if (id) return { url: `https://archive.org/embed/${encodeURIComponent(id)}`, label: 'Internet Archive 3D翻书阅读' };
    }
  }
  if (source === 'openlibrary' && sourceUrl?.includes('openlibrary.org')) {
    return { url: sourceUrl, label: 'Open Library' };
  }
  if (source === 'gutenberg') {
    const id = book.sourceUrl?.match(/gutenberg\.org\/ebooks\/(\d+)/)?.[1] || book.identifier?.replace(/^gutenberg_/, '');
    if (id) return { url: `https://www.gutenberg.org/ebooks/${id}.html.images`, label: 'Project Gutenberg' };
  }
  if (source === 'wikisource' && book.pageTitle) {
    return { url: `https://zh.wikisource.org/wiki/${encodeURIComponent(book.pageTitle)}`, label: 'Wikisource' };
  }
  if (source === 'ar_wikisource' && book.pageTitle) {
    return { url: `https://ar.wikisource.org/wiki/${encodeURIComponent(book.pageTitle)}`, label: 'Arabic Wikisource' };
  }
  if (sourceUrl && /google\.[^/]+\/books/.test(sourceUrl)) {
    return { url: sourceUrl, label: 'Google Books' };
  }
  return null;
}
