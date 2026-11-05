const JUPITER_ORIGIN = 'https://jupiter.earth.invalid';
const IMAGE_PATH = /\.(?:avif|gif|jpe?g|png|webp)$/i;

function isSafeRemoteUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isRemoteImageUrl(value: unknown): value is string {
  if (!isSafeRemoteUrl(value)) return false;
  return IMAGE_PATH.test(new URL(value).pathname);
}

export function toJupiterImageRoute(value: string, allowUnknownImageExtension = false): string | null {
  if (!isSafeRemoteUrl(value) || (!allowUnknownImageExtension && !isRemoteImageUrl(value))) return null;
  return `/jupiter/image/${encodeURIComponent(new URL(value).href)}`;
}

export function getJupiterImageSource(value: string): string | null {
  try {
    const pathname = new URL(value, JUPITER_ORIGIN).pathname;
    const match = pathname.match(/^\/jupiter\/image\/([^/]+)$/);
    if (!match) return null;
    const decoded = decodeURIComponent(match[1]);
    return isSafeRemoteUrl(decoded) ? new URL(decoded).href : null;
  } catch {
    return null;
  }
}
