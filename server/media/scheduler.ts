import type express from 'express';
import type { MediaRegionMode, ResolvedRegion } from '../../src/types/media.ts';
import { buildBilibiliEmbedUrl, getBilibiliTrendingMusic, searchBilibiliVideos } from '../bilibiliCrawler.ts';
import { getYouTubeDiscoveryMusic, resolveMusicEmbedUrl, searchYouTubeMusic } from '../youtubeMusicSearch.ts';
import { searchYouTubeVideos } from '../youtubeSearch.ts';
import { enrichMusicTrack, enrichVideoItem } from './catalog.ts';

interface SearchCacheEntry {
  expiresAt: number;
  payload: any;
}

const searchCache = new Map<string, SearchCacheEntry>();
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

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
  const embedUrl = buildBilibiliEmbedUrl(b.bvid, true);
  return enrichMusicTrack(
    {
      id: b.id || `bili_${b.bvid}`,
      title: b.title,
      artist: b.author || 'Bilibili 音乐人',
      album: 'Bilibili 音乐',
      genre: b.category || 'Bilibili',
      durationSeconds: b.durationSeconds || 210,
      durationFormatted: b.duration,
      embedUrl,
      coverUrl: b.pic || '/assets/music/electronic-pulse.jpg',
      source: 'Bilibili',
      sourceUrl: b.sourceUrl || `https://www.bilibili.com/video/${b.bvid}`,
      license: 'Bilibili official embed',
      crawledAt: new Date().toISOString(),
      description: b.description || 'Bilibili 音乐流',
      playable: 'embed',
      views: b.play,
      bvid: b.bvid,
    },
    region
  );
}

function bilibiliToUnifiedVideo(b: any, region: ResolvedRegion) {
  const embedUrl = buildBilibiliEmbedUrl(b.bvid, false);
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
      embedUrl: `https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0`,
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

function interleaveLists<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
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
  const genre = (options.genre || 'all').trim().toLowerCase();
  const limit = Math.max(6, Math.min(30, options.limit || 20));

  // Direct link / BV / YouTube paste resolution
  if (q) {
    const direct = resolveMusicEmbedUrl(q);
    if (direct) {
      const enriched = enrichMusicTrack(direct, options.region);
      return {
        tracks: [enriched],
        providersQueried: [{ providerId: enriched.providerId, count: 1, ok: true }],
        mode: 'embed-url',
      };
    }
  }

  const cacheKey = `ytbili_music:${options.region}:${genre}:${q.toLowerCase()}:${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const biliQueryMap: Record<string, string> = {
    all: '热门音乐 MV 无损音质',
    mandopop: '华语流行 音乐 MV',
    pop: '欧美流行 音乐 MV',
    jkpop: '日语 韩语 热门音乐 MV',
    piano: '钢琴 纯音乐 轻音乐',
    bilibili: '音乐 现场 Live',
  };

  const wantYouTube = genre !== 'bilibili';
  const wantBilibili = genre !== 'youtube';

  const biliPromise = wantBilibili
    ? (q
        ? searchBilibiliVideos(`${q} 音乐`, Math.ceil(limit / 2))
        : genre === 'all' || genre === 'bilibili'
          ? getBilibiliTrendingMusic(Math.ceil(limit / 2))
          : searchBilibiliVideos(biliQueryMap[genre] || biliQueryMap.all, Math.ceil(limit / 2))
      )
        .then((rows) => ({ ok: true, rows: rows.map((r) => bilibiliToUnifiedMusicTrack(r, options.region)) }))
        .catch((e: any) => ({ ok: false, rows: [], reason: e?.message || 'failed' }))
    : Promise.resolve({ ok: true, rows: [] as any[], reason: 'filtered' });

  const ytPromise = wantYouTube
    ? (q ? searchYouTubeMusic(q, Math.ceil(limit / 2)) : getYouTubeDiscoveryMusic(genre, Math.ceil(limit / 2)))
        .then((rows) => ({ ok: true, rows: rows.map((r) => enrichMusicTrack(r, options.region)) }))
        .catch((e: any) => ({ ok: false, rows: [], reason: e?.message || 'failed' }))
    : Promise.resolve({ ok: true, rows: [] as any[], reason: 'filtered' });

  const [biliRes, ytRes] = await Promise.all([biliPromise, ytPromise]);

  const providersQueried = [
    { providerId: 'youtube', count: ytRes.rows.length, ok: ytRes.ok, reason: (ytRes as any).reason },
    { providerId: 'bilibili', count: biliRes.rows.length, ok: biliRes.ok, reason: (biliRes as any).reason },
  ];

  // Put CN region Bilibili first / Overseas region YouTube first, cleanly interleaved
  const interleaved =
    options.region === 'cn'
      ? interleaveLists(biliRes.rows, ytRes.rows)
      : interleaveLists(ytRes.rows, biliRes.rows);

  const seen = new Set<string>();
  const deduped: any[] = [];
  for (const item of interleaved) {
    if (!item || !item.embedUrl) continue;
    const key = String(item.sourceUrl || item.id || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= limit) break;
  }

  const payload = { tracks: deduped, providersQueried, mode: 'youtube-bilibili' };
  if (deduped.length > 0) {
    searchCache.set(cacheKey, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, payload });
  }
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
