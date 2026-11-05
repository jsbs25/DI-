const JUPITER_ORIGIN = 'https://jupiter.earth.invalid';
const VIDEO_PATH = /\.(?:m4v|mov|mp4|ogv|webm)$/i;

export function isRemoteVideoUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username && !url.password && VIDEO_PATH.test(url.pathname);
  } catch {
    return false;
  }
}

export function toJupiterVideoRoute(value: string): string | null {
  if (!isRemoteVideoUrl(value)) return null;
  return `/jupiter/watch/${encodeURIComponent(new URL(value).href)}`;
}

export function getJupiterVideoSource(value: string): string | null {
  try {
    const pathname = new URL(value, JUPITER_ORIGIN).pathname;
    const match = pathname.match(/^\/jupiter\/watch\/([^/]+)$/);
    if (!match) return null;
    const decoded = decodeURIComponent(match[1]);
    return isRemoteVideoUrl(decoded) ? new URL(decoded).href : null;
  } catch {
    return null;
  }
}
