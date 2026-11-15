import type {
  MediaPlaybackType,
  MediaRegionMode,
  MediaSourceDescriptor,
  ResolvedRegion,
} from '../../types/media.ts';
import type { MusicSource } from '../../types/music.ts';

const STORAGE_KEY_REGION = 'one.media.regionMode';

export interface ConnectivitySnapshot {
  checkedAt: number;
  probing: boolean;
  bilibiliOk: boolean | null;
  youtubeOk: boolean | null;
  archiveOk: boolean | null;
  oneNativeOk: boolean | null;
  recommendedRegion: ResolvedRegion;
}

const failedUrls = new Map<string, { reason: string; at: number }>();
const listeners = new Set<() => void>();

let regionMode: MediaRegionMode = loadInitialRegionMode();

let connectivity: ConnectivitySnapshot = {
  checkedAt: 0,
  probing: false,
  bilibiliOk: null,
  youtubeOk: null,
  archiveOk: null,
  oneNativeOk: true,
  recommendedRegion: inferBrowserRegionFallback(),
};

function loadInitialRegionMode(): MediaRegionMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_REGION);
    if (saved === 'cn' || saved === 'overseas' || saved === 'auto') return saved;
  } catch {}
  return 'auto';
}

function inferBrowserRegionFallback(): ResolvedRegion {
  try {
    const lang = (navigator.language || '').toLowerCase();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (lang === 'zh-cn' || tz === 'Asia/Shanghai' || tz === 'Asia/Chongqing' || tz === 'Asia/Urumqi') {
      return 'cn';
    }
  } catch {}
  return 'overseas';
}

function emitChange() {
  for (const fn of Array.from(listeners)) {
    try {
      fn();
    } catch {}
  }
}

export function subscribeMediaScheduler(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getMediaRegionMode(): MediaRegionMode {
  return regionMode;
}

export function setMediaRegionMode(next: MediaRegionMode) {
  regionMode = next;
  try {
    localStorage.setItem(STORAGE_KEY_REGION, next);
  } catch {}
  emitChange();
}

export function getEffectiveMediaRegion(): ResolvedRegion {
  if (regionMode === 'cn') return 'cn';
  if (regionMode === 'overseas') return 'overseas';
  return connectivity.recommendedRegion;
}

export function getConnectivitySnapshot(): ConnectivitySnapshot {
  return connectivity;
}

export function markMediaUrlFailed(urlOrKey: string | undefined, reason: string) {
  if (!urlOrKey) return;
  failedUrls.set(urlOrKey, { reason, at: Date.now() });
  emitChange();
}

export function isMediaUrlFailed(urlOrKey: string | undefined): boolean {
  if (!urlOrKey) return false;
  const entry = failedUrls.get(urlOrKey);
  if (!entry) return false;
  // Re-allow checking after 10 minutes
  if (Date.now() - entry.at > 10 * 60 * 1000) {
    failedUrls.delete(urlOrKey);
    return false;
  }
  return true;
}

export function clearFailedMediaUrls() {
  failedUrls.clear();
  emitChange();
}

async function probeReachable(url: string, timeoutMs = 3500): Promise<boolean> {
  try {
    await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return true;
  } catch {
    return false;
  }
}

async function probeImageLoad(url: string, timeoutMs = 3500): Promise<boolean> {
  if (typeof Image === 'undefined') return probeReachable(url, timeoutMs);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const img = new Image();
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      img.src = '';
      resolve(false);
    }, timeoutMs);
    img.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(false);
    };
    img.src = `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`;
  });
}

let activeProbePromise: Promise<ConnectivitySnapshot> | null = null;

export async function probeClientMediaConnectivity(force = false): Promise<ConnectivitySnapshot> {
  if (!force && connectivity.checkedAt > 0 && Date.now() - connectivity.checkedAt < 180_000) {
    return connectivity;
  }
  if (activeProbePromise) return activeProbePromise;

  connectivity = { ...connectivity, probing: true };
  emitChange();

  activeProbePromise = (async () => {
    const [biliOk, ytOk, archiveOk, oneOk] = await Promise.all([
      probeReachable('https://player.bilibili.com/favicon.ico', 3200),
      probeImageLoad('https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg', 3200),
      probeReachable('https://archive.org/favicon.ico', 3200),
      fetch('/api/media/providers', { signal: AbortSignal.timeout(3500) })
        .then((r) => r.ok)
        .catch(() => false),
    ]);

    let recommended: ResolvedRegion = inferBrowserRegionFallback();
    if (!ytOk && !archiveOk && biliOk) {
      recommended = 'cn';
    } else if (ytOk && archiveOk) {
      recommended = inferBrowserRegionFallback() === 'cn' && !navigator.language.toLowerCase().startsWith('zh-cn')
        ? 'overseas'
        : recommended;
      if (ytOk && archiveOk && recommended === 'cn') {
        // Real overseas connectivity detected even if OS language/TZ is Asia
        recommended = 'overseas';
      }
    }

    connectivity = {
      checkedAt: Date.now(),
      probing: false,
      bilibiliOk: biliOk,
      youtubeOk: ytOk,
      archiveOk,
      oneNativeOk: oneOk,
      recommendedRegion: recommended,
    };
    activeProbePromise = null;
    emitChange();
    return connectivity;
  })();

  return activeProbePromise;
}

export function formatPlaybackTypeBadge(
  playbackType?: MediaPlaybackType,
  isZh = true
): { label: string; tone: 'emerald' | 'sky' | 'amber' | 'slate' } {
  switch (playbackType) {
    case 'one_owned_media':
      return { label: isZh ? 'ONE 自有媒体' : 'ONE Native', tone: 'emerald' };
    case 'legal_direct_audio':
      return { label: isZh ? '合法音频直链' : 'Legal Direct', tone: 'emerald' };
    case 'legal_direct_video':
      return { label: isZh ? '合法视频直链' : 'Direct Video', tone: 'emerald' };
    case 'official_embed':
      return { label: isZh ? '官方合规嵌入' : 'Official Embed', tone: 'sky' };
    case 'external_redirect':
      return { label: isZh ? '跳转原平台' : 'Open Source', tone: 'amber' };
    default:
      return { label: isZh ? '标准播放' : 'Standard', tone: 'slate' };
  }
}

function sourceUrlKey(src: MusicSource): string {
  return src.audioUrl || src.embedUrl || src.url || src.id;
}

function scoreClientMusicSource(src: MusicSource, region: ResolvedRegion): number {
  const key = sourceUrlKey(src);
  if (src.kind === 'none' || src.playable === false) return 1000;
  if (isMediaUrlFailed(key)) return 900;

  const prov = (src.provider || '').toLowerCase();
  // Live probe penalty when client connectivity already observed failure
  if (region === 'cn') {
    if (prov === 'one-native') return 5;
    if (prov === 'bilibili') return connectivity.bilibiliOk === false ? 80 : 10;
    if (prov === 'netease-outchain') return 14;
    if (prov === 'jamendo') return 18;
    if (prov === 'internet-archive' || prov === 'fma') return connectivity.archiveOk ? 40 : 120;
    if (prov === 'youtube') return connectivity.youtubeOk ? 60 : 150;
    return 70;
  }

  // Overseas preference
  if (prov === 'one-native') return 5;
  if (src.kind === 'audio') {
    if ((prov === 'internet-archive' || prov === 'fma') && connectivity.archiveOk === false) return 140;
    return 10;
  }
  if (prov === 'youtube') return connectivity.youtubeOk === false ? 150 : 20;
  if (prov === 'bilibili') return connectivity.bilibiliOk === false ? 120 : 28;
  return 40;
}

export function sortClientMusicSources(
  sources: MusicSource[],
  region: ResolvedRegion = getEffectiveMediaRegion()
): MusicSource[] {
  return [...sources].sort((a, b) => scoreClientMusicSource(a, region) - scoreClientMusicSource(b, region));
}

export function findNextMusicFallbackSource(
  sources: MusicSource[],
  currentSourceId?: string,
  currentUrl?: string,
  region: ResolvedRegion = getEffectiveMediaRegion()
): MusicSource | null {
  const candidates = sortClientMusicSources(sources, region).filter((s) => {
    if (s.kind === 'none' || s.playable === false) return false;
    if (currentSourceId && s.id === currentSourceId) return false;
    const u = s.audioUrl || s.embedUrl;
    if (!u) return false;
    if (currentUrl && u === currentUrl) return false;
    if (isMediaUrlFailed(u)) return false;
    return true;
  });
  return candidates[0] || null;
}

function videoSourceUrlKey(s: MediaSourceDescriptor): string {
  return s.directVideoUrl || s.embedUrl || s.officialUrl || s.id;
}

function scoreVideoSource(s: MediaSourceDescriptor, region: ResolvedRegion): number {
  if (s.playbackType === 'external_redirect' || s.availabilityStatus === 'unavailable') return 900;
  if (isMediaUrlFailed(videoSourceUrlKey(s))) return 850;
  if (region === 'cn') {
    if (s.providerId === 'one-native') return 5;
    if (s.providerId === 'bilibili') return connectivity.bilibiliOk === false ? 80 : 10;
    if (s.regionAvailability === 'global') return 20;
    if (s.providerId === 'youtube') return connectivity.youtubeOk ? 60 : 150;
    return 110;
  }
  if (s.providerId === 'one-native') return 5;
  if (s.playbackType === 'legal_direct_video') return 10;
  if (s.providerId === 'youtube') return connectivity.youtubeOk === false ? 150 : 18;
  if (s.providerId === 'bilibili') return 26;
  return 40;
}

export function sortVideoSources(
  sources: MediaSourceDescriptor[],
  region: ResolvedRegion = getEffectiveMediaRegion()
): MediaSourceDescriptor[] {
  return [...sources].sort((a, b) => scoreVideoSource(a, region) - scoreVideoSource(b, region));
}

export function findNextVideoFallbackSource(
  sources: MediaSourceDescriptor[],
  currentSourceId?: string,
  region: ResolvedRegion = getEffectiveMediaRegion()
): MediaSourceDescriptor | null {
  const sorted = sortVideoSources(sources, region);
  return (
    sorted.find((s) => {
      if (s.id === currentSourceId) return false;
      if (s.playbackType === 'external_redirect' || s.availabilityStatus === 'unavailable') return false;
      const key = videoSourceUrlKey(s);
      if (isMediaUrlFailed(key)) return false;
      return Boolean(s.directVideoUrl || s.embedUrl);
    }) || null
  );
}
