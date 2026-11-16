import type express from 'express';
import type { MediaRegionMode, ResolvedRegion } from '../../src/types/media.ts';
import { searchBilibiliVideos } from '../bilibiliCrawler.ts';
import { musicStore } from '../musicStore.ts';
import { resolveMusicEmbedUrl, searchYouTubeMusic } from '../youtubeMusicSearch.ts';
import { searchYouTubeVideos } from '../youtubeSearch.ts';
import { CURATED_GLOBAL_CN_MUSIC, enrichMusicTrack, enrichVideoItem } from './catalog.ts';
import { searchJamendoAudio, searchWikimediaAudio } from './providers.ts';

interface SearchCacheEntry {
  expiresAt: number;
  payload: any;
}

const searchCache = new Map<string, SearchCacheEntry>();
const SEARCH_CACHE_TTL_MS = 2 * 60 * 1000;

export function resolveRegionFromRequest(req: express.Request): {
  mode: MediaRegionMode;
  region: ResolvedRegion;
  signal: string;
} {
  const qRegion = String(req.query.region || req.headers['x-one-media-region'] || '').trim().toLowerCase();
  if (qRegion === 'cn' || qRegion === 'china') {
    return { mode: 'cn', region: 'cn', signal: 'explicit-cn' };
  }
  if (qRegion === 'overseas' || qRegion === 'global') {
    return { mode: 'overseas', region: 'overseas', signal: 'explicit-overseas' };
  }

  const cfCountry = String(req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || '').toUpperCase();
  if (cfCountry === 'CN') {
    return { mode: 'auto', region: 'cn', signal: 'cf-ipcountry-CN' };
  }

  const acceptLang = String(req.headers['accept-language'] || '').toLowerCase();
  if (acceptLang.startsWith('zh-cn')) {
    return { mode: 'auto', region: 'cn', signal: 'accept-language-zh-CN' };
  }

  return { mode: 'auto', region: 'overseas', signal: 'default-overseas' };
}

function bilibiliToUnifiedMusicTrack(b: any, region: ResolvedRegion) {
  const embedUrl = `https://player.bilibili.com/player.html?bvid=${b.bvid}&page=1&autoplay=0&danmaku=0`;
  return enrichMusicTrack(
    {
      id: b.id || `bili_${b.bvid}`,
      title: b.title,
      artist: b.author || 'Bilibili 音乐人',
      album: 'Bilibili 官方播放器',
      genre: 'Bilibili',
      durationSeconds: b.durationSeconds || 0,
      durationFormatted: b.duration,
      embedUrl,
      coverUrl: b.pic || '/assets/music/electronic-pulse.jpg',
      source: 'Bilibili 官方播放器',
      sourceUrl: b.sourceUrl || `https://www.bilibili.com/video/${b.bvid}`,
      license: 'Bilibili official embed',
      crawledAt: new Date().toISOString(),
      description: b.description || 'Bilibili 官方合规嵌入播放器，支持中国大陆与海外播放',
      playable: 'embed',
      views: b.play,
      bvid: b.bvid,
    },
    region
  );
}

function bilibiliToUnifiedVideo(b: any, region: ResolvedRegion) {
  const embedUrl = `https://player.bilibili.com/player.html?bvid=${b.bvid}&page=1&autoplay=0&danmaku=0`;
  return enrichVideoItem(
    {
      id: b.id || `bili_${b.bvid}`,
      creatorId: `bili_${b.authorMid || b.bvid}`,
      creator: {
        displayName: b.author || 'Bilibili UP主',
        username: `bili_${b.authorMid || 'creator'}`,
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
        countryCode: 'CN',
      },
      title: b.title,
      description: b.description || '来自 Bilibili 官方嵌入播放器的开放搜索结果',
      videoUrl: '',
      embedUrl,
      sourceUrl: b.sourceUrl || `https://www.bilibili.com/video/${b.bvid}`,
      source: 'Bilibili',
      bvid: b.bvid,
      thumbnailUrl: b.pic || 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80',
      duration: b.duration || '00:00',
      viewsCount: typeof b.play === 'number' ? b.play : parseInt(String(b.play || '0').replace(/[^\d]/g, ''), 10) || 0,
      likesCount: 0,
      liked: false,
      category: 'Bilibili',
      countryName: 'China',
      createdAt: new Date().toISOString(),
    },
    region
  );
}

function youtubeSearchResultToVideo(yt: any, region: ResolvedRegion) {
  const m = String(yt.url || yt.sourceUrl || '').match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  const videoId = m?.[1];
  if (!videoId) return null;
  return enrichVideoItem(
    {
      id: `yt_${videoId}`,
      creatorId: `yt_${videoId}`,
      creator: {
        displayName: String(yt.snippet || 'YouTube').split(' · ')[0] || 'YouTube',
        username: 'youtube',
        avatar: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&auto=format&fit=crop&q=80',
        countryCode: 'US',
      },
      title: yt.title,
      description: yt.snippet || 'YouTube 官方嵌入视频',
      videoUrl: '',
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&rel=0`,
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
      source: 'YouTube',
      videoId,
      thumbnailUrl: yt.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: yt.duration || '00:00',
      viewsCount: 0,
      likesCount: 0,
      liked: false,
      category: 'YouTube',
      countryName: 'Global',
      createdAt: new Date().toISOString(),
    },
    region
  );
}

export async function dispatchUnifiedMusicSearch(options: {
  query: string;
  genre?: string;
  region: ResolvedRegion;
  limit?: number;
}): Promise<{
  tracks: any[];
  providersQueried: Array<{ providerId: string; count: number; ok: boolean; reason?: string }>;
  mode?: string;
}> {
  const q = options.query.trim();
  const limit = Math.max(4, Math.min(30, options.limit || 18));

  if (!q) {
    const base = [...musicStore.getTracks(options.genre), ...CURATED_GLOBAL_CN_MUSIC];
    const enriched = base.map((t) => enrichMusicTrack(t, options.region));
    return { tracks: enriched, providersQueried: [{ providerId: 'one-native', count: enriched.length, ok: true }] };
  }

  // Direct link / BV / NetEase / SoundCloud / YouTube paste resolution
  const direct = resolveMusicEmbedUrl(q);
  if (direct) {
    const enriched = enrichMusicTrack(direct, options.region);
    return {
      tracks: [enriched],
      providersQueried: [{ providerId: enriched.providerId, count: 1, ok: true }],
      mode: 'embed-url',
    };
  }

  const cacheKey = `music:${options.region}:${options.genre || 'all'}:${q.toLowerCase()}:${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const localRaw = [
    ...musicStore.searchTracks(q, options.genre),
    ...CURATED_GLOBAL_CN_MUSIC.filter(
      (t) =>
        t.title.toLowerCase().includes(q.toLowerCase()) ||
        t.artist.toLowerCase().includes(q.toLowerCase())
    ),
  ];
  const localEnriched = localRaw.map((t) => enrichMusicTrack(t, options.region));

  const providersQueried: Array<{ providerId: string; count: number; ok: boolean; reason?: string }> = [
    { providerId: 'one-native', count: localEnriched.length, ok: true },
  ];

  // Fault-tolerant parallel dispatch across legal providers appropriate for region
  const biliTask = searchBilibiliVideos(`${q} 音乐`, options.region === 'cn' ? 10 : 5)
    .then((rows) => ({ ok: true, rows: rows.map((r) => bilibiliToUnifiedMusicTrack(r, options.region)) }))
    .catch((e: any) => ({ ok: false, rows: [], reason: e?.message || 'failed' }));

  const wmTask = searchWikimediaAudio(q, 5)
    .then((rows) => ({ ok: true, rows: rows.map((r) => enrichMusicTrack(r, options.region)) }))
    .catch((e: any) => ({ ok: false, rows: [], reason: e?.message || 'failed' }));

  const jamendoTask = (process.env.JAMENDO_CLIENT_ID || '').trim()
    ? searchJamendoAudio(q, 5)
        .then((rows) => ({ ok: true, rows: rows.map((r) => enrichMusicTrack(r, options.region)) }))
        .catch((e: any) => ({ ok: false, rows: [], reason: e?.message || 'failed' }))
    : Promise.resolve({ ok: false, rows: [], reason: 'JAMENDO_CLIENT_ID not configured' });

  const ytIaTask = searchYouTubeMusic(q, options.region === 'cn' ? 6 : 12)
    .then((rows) => ({ ok: true, rows: rows.map((r) => enrichMusicTrack(r, options.region)) }))
    .catch((e: any) => ({ ok: false, rows: [], reason: e?.message || 'failed' }));

  const [biliRes, wmRes, jamRes, ytIaRes] = await Promise.all([biliTask, wmTask, jamendoTask, ytIaTask]);

  providersQueried.push(
    { providerId: 'bilibili', count: biliRes.rows.length, ok: biliRes.ok, reason: (biliRes as any).reason },
    { providerId: 'wikimedia', count: wmRes.rows.length, ok: wmRes.ok, reason: (wmRes as any).reason },
    { providerId: 'jamendo', count: jamRes.rows.length, ok: jamRes.ok, reason: (jamRes as any).reason },
    { providerId: 'youtube-and-archive', count: ytIaRes.rows.length, ok: ytIaRes.ok, reason: (ytIaRes as any).reason }
  );

  // Order merged tracks cleanly: directly playable audio first, then verified official embeds
  const rawMerged =
    options.region === 'cn'
      ? [...localEnriched, ...jamRes.rows, ...wmRes.rows, ...ytIaRes.rows, ...biliRes.rows]
      : [...localEnriched, ...ytIaRes.rows, ...wmRes.rows, ...jamRes.rows, ...biliRes.rows];

  const isLikelyNonMusic = (item: any): boolean => {
    const hay = `${item?.title || ''} ${item?.artist || ''} ${item?.album || ''} ${item?.description || ''} ${item?.genre || ''}`.toLowerCase();
    return /speech|sermon|podcast|audiobook|lecture|news report|breaking news|white noise|brown noise|pink noise|fan noise|air conditioner|test tone|sample pack|asmr sleep sounds only|number station|greatest speeches|abdication/.test(hay);
  };

  const isPlayableTrack = (item: any): boolean => {
    if (!item) return false;
    if (item.availabilityStatus === 'unavailable' || item.playbackType === 'external_redirect') return false;
    if (isLikelyNonMusic(item)) return false;
    const audioUrl = typeof item.audioUrl === 'string' ? item.audioUrl.trim() : '';
    const hasAudio = audioUrl.length > 0 && /^https?:\/\//i.test(audioUrl);
    const hasEmbed = typeof item.embedUrl === 'string' && item.embedUrl.trim().length > 0 && item.playable !== 'none';
    // Prefer direct playable audio for reliable listening; allow embeds only when marked clearly playable
    return hasAudio || hasEmbed;
  };

  // Sort direct audio tracks before embed-only items so background playback works across tabs
  const sortedMerged = [...rawMerged]
    .filter(isPlayableTrack)
    .sort((a, b) => {
      const aAudio = (a.audioUrl && /^https?:\/\//i.test(String(a.audioUrl))) ? 0 : 1;
      const bAudio = (b.audioUrl && /^https?:\/\//i.test(String(b.audioUrl))) ? 0 : 1;
      if (aAudio !== bAudio) return aAudio - bAudio;
      return 0;
    });

  const seen = new Set<string>();
  const deduped: any[] = [];
  for (const item of sortedMerged) {
    const key = String(item.sourceUrl || item.id || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= limit) break;
  }

  const payload = { tracks: deduped, providersQueried };
  searchCache.set(cacheKey, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, payload });
  return payload;
}

export async function dispatchUnifiedVideoSearch(options: {
  query: string;
  region: ResolvedRegion;
  limit?: number;
  storeVideos?: any[];
}): Promise<{
  videos: any[];
  providersQueried: Array<{ providerId: string; count: number; ok: boolean; reason?: string }>;
}> {
  const q = options.query.trim();
  const limit = Math.max(4, Math.min(24, options.limit || 14));
  const localMatches = (options.storeVideos || [])
    .filter((v) => {
      if (!q) return true;
      const hay = `${v.title || ''} ${v.description || ''} ${v.category || ''} ${v.creator?.displayName || ''}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    })
    .map((v) => enrichVideoItem(v, options.region));

  if (!q) {
    return {
      videos: localMatches,
      providersQueried: [{ providerId: 'one-native', count: localMatches.length, ok: true }],
    };
  }

  const cacheKey = `video:${options.region}:${q.toLowerCase()}:${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    const mergedWithLocal = [...localMatches, ...cached.payload.videos].filter(
      (v, idx, self) => idx === self.findIndex((s) => s.id === v.id)
    );
    return { ...cached.payload, videos: mergedWithLocal.slice(0, limit) };
  }

  const [biliRes, ytRes] = await Promise.all([
    searchBilibiliVideos(q, options.region === 'cn' ? 10 : 6)
      .then((rows) => ({ ok: true, rows: rows.map((r) => bilibiliToUnifiedVideo(r, options.region)) }))
      .catch((e: any) => ({ ok: false, rows: [], reason: e?.message || 'failed' })),
    options.region === 'overseas'
      ? searchYouTubeVideos(q, 8)
          .then((rows) => ({
            ok: true,
            rows: rows.map((r) => youtubeSearchResultToVideo(r, options.region)).filter(Boolean),
          }))
          .catch((e: any) => ({ ok: false, rows: [], reason: e?.message || 'failed' }))
      : searchYouTubeVideos(q, 4)
          .then((rows) => ({
            ok: true,
            rows: rows.map((r) => youtubeSearchResultToVideo(r, options.region)).filter(Boolean),
          }))
          .catch((e: any) => ({ ok: false, rows: [], reason: e?.message || 'failed' })),
  ]);

  const providersQueried = [
    { providerId: 'one-native', count: localMatches.length, ok: true },
    { providerId: 'bilibili', count: biliRes.rows.length, ok: biliRes.ok, reason: (biliRes as any).reason },
    { providerId: 'youtube', count: ytRes.rows.length, ok: ytRes.ok, reason: (ytRes as any).reason },
  ];

  const ordered =
    options.region === 'cn'
      ? [...localMatches, ...biliRes.rows, ...ytRes.rows]
      : [...localMatches, ...ytRes.rows, ...biliRes.rows];

  const seen = new Set<string>();
  const deduped: any[] = [];
  for (const v of ordered) {
    if (!v || !v.id || seen.has(v.id)) continue;
    seen.add(v.id);
    deduped.push(v);
    if (deduped.length >= limit) break;
  }

  const payload = { videos: deduped, providersQueried };
  searchCache.set(cacheKey, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, payload });
  return payload;
}
