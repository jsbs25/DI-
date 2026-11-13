const JUPITER_ORIGIN = 'https://jupiter.earth.invalid';
const AUDIO_PATH = /\.(?:aac|flac|m4a|mp3|oga|ogg|opus|wav)$/i;

export function isRemoteAudioUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username && !url.password && AUDIO_PATH.test(url.pathname);
  } catch {
    return false;
  }
}

export function toJupiterAudioRoute(value: string): string | null {
  if (!isRemoteAudioUrl(value)) return null;
  return `/jupiter/audio/${encodeURIComponent(new URL(value).href)}`;
}

export function getJupiterAudioSource(value: string): string | null {
  try {
    const pathname = new URL(value, JUPITER_ORIGIN).pathname;
    const match = pathname.match(/^\/jupiter\/audio\/([^/]+)$/);
    if (!match) return null;
    const decoded = decodeURIComponent(match[1]);
    return isRemoteAudioUrl(decoded) ? new URL(decoded).href : null;
  } catch {
    return null;
  }
}
