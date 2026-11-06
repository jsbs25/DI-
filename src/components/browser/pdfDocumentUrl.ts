const JUPITER_ORIGIN = 'https://jupiter.earth.invalid';

export function isRemotePdfUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username && !url.password && /\.pdf$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function toJupiterDocumentRoute(value: string): string | null {
  if (!isRemotePdfUrl(value)) return null;
  return `/jupiter/document/${encodeURIComponent(new URL(value).href)}`;
}

export function getJupiterDocumentSource(value: string): string | null {
  try {
    const pathname = new URL(value, JUPITER_ORIGIN).pathname;
    const match = pathname.match(/^\/jupiter\/document\/([^/]+)$/);
    if (!match) return null;
    const decoded = decodeURIComponent(match[1]);
    return isRemotePdfUrl(decoded) ? new URL(decoded).href : null;
  } catch {
    return null;
  }
}
