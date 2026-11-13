const JUPITER_ORIGIN = 'https://jupiter.earth.invalid';
const VIDEO_PATH = /\.(?:m4v|mov|mp4|ogv|webm)$/i;

function safeHttpUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function hostOf(url: URL): string {
  return url.hostname.replace(/^www\./, '').replace(/^m\./, '').replace(/^vm\./, '');
}

function youtubeVideoId(url: URL): string | null {
  const host = hostOf(url);
  if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || null;
  if (host !== 'youtube.com') return null;
  if (url.pathname === '/watch') return url.searchParams.get('v');
  if (url.pathname.startsWith('/shorts/')) return url.pathname.slice('/shorts/'.length).split('/')[0] || null;
  if (url.pathname.startsWith('/embed/')) return url.pathname.slice('/embed/'.length).split('/')[0] || null;
  if (url.pathname.startsWith('/live/')) return url.pathname.slice('/live/'.length).split('/')[0] || null;
  return null;
}

function dailymotionId(url: URL): string | null {
  const host = hostOf(url);
  if (host === 'dai.ly') return url.pathname.split('/').filter(Boolean)[0] || null;
  if (host !== 'dailymotion.com' && host !== 'geo.dailymotion.com') return null;
  const m = url.pathname.match(/\/video\/([A-Za-z0-9]+)/);
  if (m) return m[1];
  const e = url.pathname.match(/\/embed\/video\/([A-Za-z0-9]+)/);
  return e ? e[1] : null;
}

function bilibiliId(url: URL): string | null {
  const host = hostOf(url);
  if (host !== 'bilibili.com' && host !== 'player.bilibili.com' && host !== 'b23.tv') return null;
  const bv = url.pathname.match(/\/(BV[0-9A-Za-z]+)/);
  if (bv) return bv[1];
  const qbv = url.searchParams.get('bvid');
  if (qbv && /^BV[0-9A-Za-z]+$/.test(qbv)) return qbv;
  return null;
}

function twitchEmbed(url: URL): string | null {
  const host = hostOf(url);
  if (host !== 'twitch.tv' && host !== 'player.twitch.tv' && host !== 'clips.twitch.tv') return null;
  const parent = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  if (host === 'clips.twitch.tv') {
    const clip = url.pathname.split('/').filter(Boolean)[0];
    return clip ? `https://clips.twitch.tv/embed?clip=${encodeURIComponent(clip)}&parent=${encodeURIComponent(parent)}&autoplay=false` : null;
  }
  if (host === 'player.twitch.tv') return url.href;
  const video = url.pathname.match(/^\/videos\/(\d+)/);
  if (video) return `https://player.twitch.tv/?video=v${video[1]}&parent=${encodeURIComponent(parent)}&autoplay=false`;
  const channel = url.pathname.split('/').filter(Boolean)[0];
  if (channel && !['directory', 'downloads', 'jobs', 'settings', 'search'].includes(channel)) {
    return `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(parent)}&autoplay=false`;
  }
  return null;
}

function soundcloudUrl(url: URL): boolean {
  const host = hostOf(url);
  return (host === 'soundcloud.com' || host === 'on.soundcloud.com' || host === 'w.soundcloud.com') && url.pathname.length > 1;
}

export function isYouTubeOrVimeoUrl(value: unknown): value is string {
  const url = safeHttpUrl(value);
  if (!url) return false;
  const host = hostOf(url);
  if (host === 'vimeo.com' || host === 'player.vimeo.com') return /\/\d+/.test(url.pathname);
  return Boolean(youtubeVideoId(url));
}

function tiktokVideoId(url: URL): string | null {
  const m = url.pathname.match(/\/video\/(\d+)/);
  if (m) return m[1];
  const q = url.searchParams.get('item_id');
  return q && /^\d+$/.test(q) ? q : null;
}

function instagramEmbedPath(url: URL): string | null {
  const m = url.pathname.match(/^\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return m ? `/${m[1]}/${m[2]}/embed` : null;
}

export function isEmbeddableSocialVideoUrl(value: unknown): value is string {
  const url = safeHttpUrl(value);
  if (!url) return false;
  const host = hostOf(url);
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return Boolean(tiktokVideoId(url));
  if (host === 'instagram.com') return Boolean(instagramEmbedPath(url));
  if (host === 'dailymotion.com' || host === 'dai.ly' || host === 'geo.dailymotion.com') return Boolean(dailymotionId(url));
  if (host === 'bilibili.com' || host === 'player.bilibili.com') return Boolean(bilibiliId(url));
  if (host === 'twitch.tv' || host === 'player.twitch.tv' || host === 'clips.twitch.tv') return Boolean(twitchEmbed(url));
  return false;
}

export function isEmbeddableMediaUrl(value: unknown): value is string {
  return isYouTubeOrVimeoUrl(value) || isEmbeddableSocialVideoUrl(value);
}

export function toEmbedVideoUrl(url: string): string | null {
  const u = safeHttpUrl(url);
  if (!u) return null;
  const host = hostOf(u);
  const yt = youtubeVideoId(u);
  if (yt) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt)}`;
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = u.pathname.match(/\/(\d+)/);
    return m ? `https://player.vimeo.com/video/${m[1]}?dnt=1` : null;
  }
  const dm = dailymotionId(u);
  if (dm) return `https://www.dailymotion.com/embed/video/${encodeURIComponent(dm)}`;
  const bv = bilibiliId(u);
  if (bv) return `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bv)}&page=1&autoplay=0`;
  const tw = twitchEmbed(u);
  if (tw) return tw;
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    const id = tiktokVideoId(u);
    return id ? `https://www.tiktok.com/embed/v2/${encodeURIComponent(id)}` : null;
  }
  if (host === 'instagram.com') {
    const path = instagramEmbedPath(u);
    return path ? `https://www.instagram.com${path}/captioned/` : null;
  }
  if (soundcloudUrl(u)) {
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(u.href)}&auto_play=false&show_artwork=true&visual=true`;
  }
  return null;
}

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

export function isPlayableVideoUrl(value: unknown): value is string {
  return isRemoteVideoUrl(value) || isYouTubeOrVimeoUrl(value) || isEmbeddableSocialVideoUrl(value);
}

export function toJupiterVideoRoute(value: string): string | null {
  if (!isPlayableVideoUrl(value)) return null;
  return `/jupiter/watch/${encodeURIComponent(new URL(value).href)}`;
}

export function getJupiterVideoSource(value: string): string | null {
  try {
    const pathname = new URL(value, JUPITER_ORIGIN).pathname;
    const match = pathname.match(/^\/jupiter\/watch\/([^/]+)$/);
    if (!match) return null;
    const decoded = decodeURIComponent(match[1]);
    return isPlayableVideoUrl(decoded) ? new URL(decoded).href : null;
  } catch {
    return null;
  }
}
