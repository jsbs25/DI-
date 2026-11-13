/**
 * EARTH ONE - URL Normalizer & Deduplication Utilities
 * Ensures single source of truth: no duplicate entries for the same website/resource.
 */
import crypto from 'crypto';

// Common marketing, referral, session, and tracking parameters that must be stripped
const TRACKING_QUERY_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'spm',
  'spm_id_from',
  'from_source',
  'from',
  'ref',
  'ref_src',
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'mc_cid',
  'mc_eid',
  'msclkid',
  '_hsenc',
  '_hsmi',
  'wbraid',
  'gbraid',
  'yclid',
  '_openstat'
]);

export interface NormalizedUrlResult {
  canonicalUrl: string;
  originalUrl: string;
  domain: string;
  urlHash: string;
  faviconUrl: string;
  isValid: boolean;
}

/**
 * Standardize any web URL into its clean, canonical representation.
 */
export function normalizeCanonicalUrl(rawUrl: string): NormalizedUrlResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return {
      canonicalUrl: '',
      originalUrl: rawUrl || '',
      domain: '',
      urlHash: '',
      faviconUrl: '',
      isValid: false
    };
  }

  const trimmed = rawUrl.trim();
  let candidate = trimmed;

  // Add default protocol if omitted
  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);

    // Only allow http and https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        canonicalUrl: '',
        originalUrl: rawUrl,
        domain: '',
        urlHash: '',
        faviconUrl: '',
        isValid: false
      };
    }

    // Lowercase hostname and strip www.
    let host = parsed.hostname.toLowerCase().replace(/^www\./, '');

    // Strip default ports
    if ((parsed.protocol === 'http:' && parsed.port === '80') ||
        (parsed.protocol === 'https:' && parsed.port === '443')) {
      parsed.port = '';
    }

    // Filter out tracking query params
    const cleanParams = new URLSearchParams();
    const sortedKeys = Array.from(parsed.searchParams.keys()).sort();
    for (const key of sortedKeys) {
      if (!TRACKING_QUERY_PARAMS.has(key.toLowerCase()) && !key.startsWith('utm_')) {
        const val = parsed.searchParams.get(key);
        if (val !== null) {
          cleanParams.set(key, val);
        }
      }
    }

    // Normalize path
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    if (!pathname) {
      pathname = '/';
    }

    // Reconstruct canonical URL (always without hash/fragment)
    const queryString = cleanParams.toString();
    const canonical = `${parsed.protocol}//${host}${pathname}${queryString ? '?' + queryString : ''}`;

    const urlHash = crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 32);
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${host}&sz=128`;

    return {
      canonicalUrl: canonical,
      originalUrl: rawUrl,
      domain: host,
      urlHash,
      faviconUrl,
      isValid: true
    };
  } catch {
    return {
      canonicalUrl: '',
      originalUrl: rawUrl,
      domain: '',
      urlHash: '',
      faviconUrl: '',
      isValid: false
    };
  }
}

/**
 * Generate a deterministic ID based on canonical URL or unique seed
 */
export function generateResourceId(canonicalUrl: string): string {
  if (!canonicalUrl) return `res_${crypto.randomUUID().slice(0, 12)}`;
  const hash = crypto.createHash('sha256').update(canonicalUrl).digest('hex').slice(0, 16);
  return `res_${hash}`;
}

/**
 * Calculate title similarity token overlap (0.0 to 1.0)
 */
export function titleSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const tokensA = new Set((a.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []));
  const tokensB = new Set((b.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let common = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) common++;
  }
  return (2 * common) / (tokensA.size + tokensB.size);
}
