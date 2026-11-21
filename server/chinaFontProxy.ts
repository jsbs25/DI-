import type express from 'express';

const GOOGLE_FONT_QUERY =
  'family=Amiri:ital,wght@0,400;0,700;1,400&family=Cairo:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Noto+Naskh+Arabic:wght@400;500;600;700&family=Noto+Serif+SC:wght@400;500;600;700&family=Scheherazade+New:wght@400;700&display=swap';

// Try China-friendly mirror first, then Google Fonts (server-side only; browser never touches Google directly)
const CSS_UPSTREAMS = [
  `https://fonts.loli.net/css2?${GOOGLE_FONT_QUERY}`,
  `https://fonts.googleapis.com/css2?${GOOGLE_FONT_QUERY}`,
];

const ALLOWED_FONT_HOSTS = new Set([
  'fonts.gstatic.com',
  'gstatic.loli.net',
]);

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

interface CssCacheEntry {
  css: string;
  expiresAt: number;
}

interface FontAssetEntry {
  buffer: Buffer;
  contentType: string;
  expiresAt: number;
}

let cachedReaderCss: CssCacheEntry | null = null;
const fontAssetCache = new Map<string, FontAssetEntry>();
const CSS_TTL_MS = 24 * 60 * 60 * 1000;
const ASSET_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ASSET_CACHE_ENTRIES = 96;

function rewriteFontUrlsToSameOrigin(css: string): string {
  return css.replace(
    /url\(\s*(['"]?)(https:\/\/(?:fonts\.gstatic\.com|gstatic\.loli\.net)\/[^)'"\s]+)\1\s*\)/gi,
    (_match, _quote, assetUrl) => `url("/api/fonts/asset?u=${encodeURIComponent(assetUrl)}")`
  );
}

function setBoundedAssetCache(key: string, entry: FontAssetEntry) {
  if (fontAssetCache.size >= MAX_ASSET_CACHE_ENTRIES) {
    const oldestKey = fontAssetCache.keys().next().value;
    if (oldestKey) fontAssetCache.delete(oldestKey);
  }
  fontAssetCache.set(key, entry);
}

/**
 * Same-origin CSS endpoint for Arabic & Chinese typography.
 * Eliminates all browser-side requests to fonts.googleapis.com / fonts.gstatic.com
 * so Mainland China visitors never experience blank-screen hangs.
 */
export async function handleReaderFontsCssRoute(_req: express.Request, res: express.Response) {
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (cachedReaderCss && cachedReaderCss.expiresAt > Date.now()) {
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    return res.status(200).send(cachedReaderCss.css);
  }

  for (const upstream of CSS_UPSTREAMS) {
    try {
      const response = await fetch(upstream, {
        headers: {
          'User-Agent': CHROME_UA,
          Accept: 'text/css,*/*;q=0.1',
        },
        signal: AbortSignal.timeout(4500),
      });
      if (!response.ok) continue;
      const rawCss = await response.text();
      if (!rawCss || !rawCss.includes('@font-face')) continue;

      const rewritten = rewriteFontUrlsToSameOrigin(rawCss);
      cachedReaderCss = {
        css: rewritten,
        expiresAt: Date.now() + CSS_TTL_MS,
      };
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return res.status(200).send(rewritten);
    } catch {
      // Try next upstream silently
    }
  }

  // Graceful non-blocking empty fallback if offline/upstream unreachable
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).send('/* System typography fallback active */\n');
}

/**
 * Same-origin SSRF-safe proxy for woff2 font binaries with immutable caching.
 */
export async function handleReaderFontAssetRoute(req: express.Request, res: express.Response) {
  const rawUrl = typeof req.query.u === 'string' ? req.query.u.trim() : '';
  if (!rawUrl) {
    return res.status(400).end();
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return res.status(400).end();
  }

  if (parsed.protocol !== 'https:' || !ALLOWED_FONT_HOSTS.has(parsed.hostname)) {
    return res.status(403).end();
  }

  const cacheKey = parsed.toString();
  const cached = fontAssetCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(cached.buffer);
  }

  // Try requested URL first, then alternate host mirror on failure
  const candidateUrls = [cacheKey];
  if (parsed.hostname === 'fonts.gstatic.com') {
    candidateUrls.push(cacheKey.replace('https://fonts.gstatic.com/', 'https://gstatic.loli.net/'));
  } else if (parsed.hostname === 'gstatic.loli.net') {
    candidateUrls.push(cacheKey.replace('https://gstatic.loli.net/', 'https://fonts.gstatic.com/'));
  }

  for (const url of candidateUrls) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': CHROME_UA },
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) continue;
      const arrayBuf = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      if (buffer.length === 0 || buffer.length > 2 * 1024 * 1024) continue;
      const contentType = response.headers.get('content-type') || 'font/woff2';

      setBoundedAssetCache(cacheKey, {
        buffer,
        contentType,
        expiresAt: Date.now() + ASSET_TTL_MS,
      });

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(200).send(buffer);
    } catch {
      // Try mirror
    }
  }

  return res.status(204).end();
}
