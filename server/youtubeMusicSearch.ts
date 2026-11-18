/**
 * YouTube & Bilibili Music Crawler Discovery
 * Multi-tier YouTube resolution: Data API v3 -> InnerTube JSON API -> HTML ytInitialData -> Parallel Invidious/Piped -> Verified Fallback
 */
import { buildBilibiliEmbedUrl } from './bilibiliCrawler.ts';

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.ducks.party',
  'https://api.piped.private.coffee',
];

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
];

const YT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const YT_CONSENT_COOKIE = 'CONSENT=PENDING+999; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg';

export interface EmbeddableMusicTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  durationSeconds: number;
  embedUrl?: string;
  audioUrl?: string;
  coverUrl: string;
  source: string;
  sourceUrl: string;
  license: string;
  crawledAt: string;
  description?: string;
  playable: 'embed' | 'audio';
}

interface VerifiedFallbackItem {
  videoId: string;
  title: string;
  artist: string;
  durationSeconds: number;
  genre: 'mandopop' | 'pop' | 'jkpop' | 'piano';
  keywords: string;
}

const VERIFIED_YOUTUBE_FALLBACK: VerifiedFallbackItem[] = [
  { videoId: 'DYptgVvkVLQ', title: '晴天 Sunny Day (Official MV)', artist: '周杰倫 Jay Chou', durationSeconds: 319, genre: 'mandopop', keywords: '周杰伦 晴天 jay chou mandopop 华语' },
  { videoId: 'kfXdP7nZIiE', title: '等你下課 Waiting For You', artist: '周杰倫 Jay Chou', durationSeconds: 271, genre: 'mandopop', keywords: '周杰伦 等你下课 jay chou mandopop 华语' },
  { videoId: 'HK7SPnGSxLM', title: "說好不哭 Won't Cry (Official MV)", artist: '周杰倫 Jay Chou & 五月天阿信', durationSeconds: 230, genre: 'mandopop', keywords: '周杰伦 说好不哭 五月天 mandopop 华语' },
  { videoId: 'bu7nU9Mhpyo', title: '告白氣球 Love Confession (Official MV)', artist: '周杰倫 Jay Chou', durationSeconds: 215, genre: 'mandopop', keywords: '周杰伦 告白气球 jay chou mandopop 华语' },
  { videoId: 'Y2ge3KrdeWs', title: "怎麼了 What's Wrong (Official MV)", artist: '周興哲 Eric Chou', durationSeconds: 320, genre: 'mandopop', keywords: '周兴哲 怎么了 mandopop 华语' },
  { videoId: 'JGwWNGJdvx8', title: 'Shape of You (Official Music Video)', artist: 'Ed Sheeran', durationSeconds: 264, genre: 'pop', keywords: 'ed sheeran shape of you pop english' },
  { videoId: '2Vv-BfVoq4g', title: 'Perfect (Official Music Video)', artist: 'Ed Sheeran', durationSeconds: 280, genre: 'pop', keywords: 'ed sheeran perfect pop ballad' },
  { videoId: 'fLexgOxsZu0', title: 'The Lazy Song (Official Music Video)', artist: 'Bruno Mars', durationSeconds: 209, genre: 'pop', keywords: 'bruno mars lazy song pop' },
  { videoId: 'OPf0YbXqDm0', title: 'Uptown Funk (Official Video)', artist: 'Mark Ronson ft. Bruno Mars', durationSeconds: 270, genre: 'pop', keywords: 'mark ronson bruno mars uptown funk pop' },
  { videoId: 'kJQP7kiw5Fk', title: 'Despacito ft. Daddy Yankee', artist: 'Luis Fonsi', durationSeconds: 282, genre: 'pop', keywords: 'luis fonsi despacito pop' },
  { videoId: 'gdZLi9oWNZg', title: "Dynamite (Official MV)", artist: 'BTS', durationSeconds: 224, genre: 'jkpop', keywords: 'bts dynamite kpop jkpop' },
  { videoId: '9bZkp7q19f0', title: 'GANGNAM STYLE (Official MV)', artist: 'PSY', durationSeconds: 253, genre: 'jkpop', keywords: 'psy gangnam style kpop jkpop' },
  { videoId: 'lTRiuFIWV54', title: '1 A.M Study Session (Lo-Fi Hip Hop)', artist: 'Lofi Girl', durationSeconds: 3600, genre: 'piano', keywords: 'lofi piano chill beats ambient' },
  { videoId: '4xDzrJKXOOY', title: 'Synthwave Chill Beats Radio', artist: 'Lofi Girl', durationSeconds: 3600, genre: 'piano', keywords: 'synthwave chill ambient piano lofi' },
];

function extractVideoId(url: string): string | null {
  const m = String(url || '').match(/(?:v=|\/shorts\/|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function extractBvid(input: string): string | null {
  const m = String(input || '').match(/\b(BV[0-9A-Za-z]{8,14})\b/);
  return m ? m[1] : null;
}

export function buildYouTubeEmbedUrl(videoId: string, autoplay = true): string {
  return `https://www.youtube.com/embed/${videoId}?autoplay=${autoplay ? '1' : '0'}&enablejsapi=1&rel=0&playsinline=1`;
}

function parseDurationText(durationText: string): number {
  const clean = String(durationText || '').trim();
  if (!clean) return 210;
  const parts = clean.split(':').map(Number);
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 210;
}

function parseIsoDuration(iso?: string): number {
  if (!iso) return 210;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!m) return 210;
  const h = Number(m[1] || 0);
  const min = Number(m[2] || 0);
  const s = Number(m[3] || 0);
  return h * 3600 + min * 60 + s || 210;
}

function buildTrackItem(opts: {
  videoId: string;
  title: string;
  artist: string;
  durationSeconds?: number;
  description?: string;
}): EmbeddableMusicTrack {
  return {
    id: `yt_${opts.videoId}`,
    title: opts.title || 'YouTube Music',
    artist: opts.artist || 'YouTube',
    album: 'YouTube Music',
    genre: 'YouTube',
    durationSeconds: typeof opts.durationSeconds === 'number' && opts.durationSeconds > 0 ? opts.durationSeconds : 210,
    embedUrl: buildYouTubeEmbedUrl(opts.videoId, true),
    coverUrl: `https://i.ytimg.com/vi/${opts.videoId}/hqdefault.jpg`,
    source: 'YouTube',
    sourceUrl: `https://www.youtube.com/watch?v=${opts.videoId}`,
    license: 'YouTube official embed',
    crawledAt: new Date().toISOString(),
    description: opts.description || 'YouTube 官方嵌入播放',
    playable: 'embed',
  };
}

async function fetchJson(url: string, timeoutMs = 4000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeUrlInput(input: string): string {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be|bilibili\.com|b23\.tv)\//i.test(raw)) {
    return `https://${raw}`;
  }
  return raw;
}

function trackFromUrl(input: string): EmbeddableMusicTrack | null {
  const raw = normalizeUrlInput(input);
  if (!raw) return null;
  const now = new Date().toISOString();

  // Direct Bilibili BV ID or URL
  const bvid = extractBvid(raw);
  if (bvid && (raw === bvid || raw.toLowerCase().includes('bilibili.com') || raw.toLowerCase().includes('b23.tv'))) {
    return {
      id: `bili_${bvid}`,
      title: `Bilibili 音乐 (${bvid})`,
      artist: 'Bilibili',
      album: 'Bilibili 音乐播放器',
      genre: 'Bilibili',
      durationSeconds: 0,
      embedUrl: buildBilibiliEmbedUrl(bvid, true),
      coverUrl: '/assets/music/electronic-pulse.jpg',
      source: 'Bilibili',
      sourceUrl: `https://www.bilibili.com/video/${bvid}`,
      license: 'Bilibili official embed',
      crawledAt: now,
      description: 'Bilibili 官方嵌入播放器',
      playable: 'embed',
    };
  }

  if (!/^https?:\/\//i.test(raw)) return null;
  const yt = extractVideoId(raw);
  if (yt) {
    return buildTrackItem({
      videoId: yt,
      title: 'YouTube Music',
      artist: 'YouTube',
      durationSeconds: 0,
      description: 'YouTube 官方嵌入播放器',
    });
  }

  return null;
}

async function resolveYouTubeOEmbedMeta(videoId: string): Promise<{ title?: string; artist?: string }> {
  try {
    const data = await fetchJson(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
      2600
    );
    if (data && typeof data.title === 'string') {
      return {
        title: data.title,
        artist: typeof data.author_name === 'string' ? data.author_name : undefined,
      };
    }
  } catch {}
  return {};
}

export async function resolveMusicEmbedUrlAsync(input: string): Promise<EmbeddableMusicTrack | null> {
  const base = trackFromUrl(input);
  if (!base) return null;
  if (base.id.startsWith('yt_')) {
    const vid = base.id.slice(3);
    const meta = await resolveYouTubeOEmbedMeta(vid);
    if (meta.title) base.title = meta.title;
    if (meta.artist) base.artist = meta.artist;
  }
  return base;
}

function extractVideosFromYoutubeContents(data: any, limit: number): EmbeddableMusicTrack[] {
  const sectionList =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
  const allCandidates: EmbeddableMusicTrack[] = [];

  for (const section of sectionList) {
    const items = section?.itemSectionRenderer?.contents || [];
    for (const item of items) {
      const v = item?.videoRenderer;
      if (!v || !v.videoId) continue;
      const videoId = String(v.videoId);
      const durationText = v.lengthText?.simpleText || '';
      const durationSeconds = parseDurationText(durationText);
      const title = String(v.title?.runs?.[0]?.text || v.title?.simpleText || 'YouTube Music');
      const artist = String(v.ownerText?.runs?.[0]?.text || v.longBylineText?.runs?.[0]?.text || 'YouTube');
      const desc = String(v.viewCountText?.simpleText || 'YouTube 音乐频道');
      allCandidates.push(
        buildTrackItem({
          videoId,
          title,
          artist,
          durationSeconds,
          description: desc,
        })
      );
      if (allCandidates.length >= limit * 3) break;
    }
    if (allCandidates.length >= limit * 3) break;
  }

  // Prefer single songs / standard MVs (<= 15 min) first so users get real tracks rather than 4-hour streams
  const normalTracks = allCandidates.filter((t) => t.durationSeconds > 30 && t.durationSeconds <= 900);
  const longTracks = allCandidates.filter((t) => t.durationSeconds <= 30 || t.durationSeconds > 900);
  const ordered = [...normalTracks, ...longTracks];
  const seen = new Set<string>();
  const out: EmbeddableMusicTrack[] = [];
  for (const item of ordered) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

async function searchYouTubeDataApi(query: string, limit: number): Promise<EmbeddableMusicTrack[]> {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) return [];
  try {
    const search = await fetchJson(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&videoCategoryId=10&maxResults=${Math.min(limit, 20)}&q=${encodeURIComponent(query)}&key=${key}`,
      5000
    );
    const ids = (search?.items || []).map((i: any) => i?.id?.videoId).filter(Boolean);
    if (!ids.length) return [];
    const detail = await fetchJson(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=${ids.join(',')}&key=${key}`,
      5000
    );
    const items = Array.isArray(detail?.items) ? detail.items : [];
    return items
      .filter((v: any) => v?.status?.embeddable !== false)
      .slice(0, limit)
      .map((v: any) =>
        buildTrackItem({
          videoId: String(v.id),
          title: String(v?.snippet?.title || 'YouTube Music'),
          artist: String(v?.snippet?.channelTitle || 'YouTube'),
          durationSeconds: parseIsoDuration(v?.contentDetails?.duration),
        })
      );
  } catch {
    return [];
  }
}

async function searchYouTubeInnerTube(query: string, limit = 10): Promise<EmbeddableMusicTrack[]> {
  try {
    const qSuffix = /music|song|mv|audio|歌|音乐|钢琴|流行|official/i.test(query) ? query : `${query} official music`;
    const res = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': YT_UA,
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Cookie: YT_CONSENT_COOKIE,
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': '2.20240726.00.00',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240726.00.00',
            hl: /[\u4e00-\u9fa5]/.test(query) ? 'zh-CN' : 'en',
            gl: 'US',
          },
        },
        query: qSuffix,
      }),
      signal: AbortSignal.timeout(4800),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return extractVideosFromYoutubeContents(data, limit);
  } catch {
    return [];
  }
}

async function searchYouTubeMusicDirect(query: string, limit = 10): Promise<EmbeddableMusicTrack[]> {
  try {
    const qSuffix = /music|song|mv|audio|歌|音乐|钢琴|流行/i.test(query) ? query : `${query} official audio music`;
    const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(qSuffix)}`, {
      headers: {
        'User-Agent': YT_UA,
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Cookie: YT_CONSENT_COOKIE,
      },
      signal: AbortSignal.timeout(4800),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const match = html.match(/(?:var\s+|window\[["']ytInitialData["']\]\s*=\s*|ytInitialData\s*=\s*)(\{[\s\S]*?\});\s*<\/script>/);
    let data: any = null;
    if (match?.[1]) {
      data = JSON.parse(match[1]);
    } else {
      const marker = 'ytInitialData = ';
      const start = html.indexOf(marker);
      if (start !== -1) {
        const jsonStart = start + marker.length;
        const end = html.indexOf(';</script>', jsonStart);
        if (end !== -1) data = JSON.parse(html.slice(jsonStart, end));
      }
    }
    if (!data) return [];
    return extractVideosFromYoutubeContents(data, limit);
  } catch {
    return [];
  }
}

async function searchYouTubeParallelMirrors(query: string, limit = 8): Promise<EmbeddableMusicTrack[]> {
  const pipedPromises = PIPED_INSTANCES.map(async (instance) => {
    const data = await fetchJson(
      `${instance}/search?q=${encodeURIComponent(`${query} official music`)}&filter=music_songs`,
      3200
    );
    const list = Array.isArray(data?.items) ? data.items : [];
    const out: EmbeddableMusicTrack[] = [];
    for (const it of list) {
      const videoId = extractVideoId(it?.url || '') || extractVideoId(`https://youtube.com${it?.url || ''}`);
      if (!videoId) continue;
      out.push(
        buildTrackItem({
          videoId,
          title: String(it?.title || 'YouTube Music'),
          artist: String(it?.uploaderName || it?.uploader || 'YouTube'),
          durationSeconds: typeof it?.duration === 'number' ? it.duration : 210,
          description: 'YouTube 音乐镜像直连',
        })
      );
      if (out.length >= limit) break;
    }
    if (!out.length) throw new Error('empty piped');
    return out;
  });

  const invidiousPromises = INVIDIOUS_INSTANCES.map(async (instance) => {
    const list = await fetchJson(
      `${instance}/api/v1/search?q=${encodeURIComponent(`${query} music`)}&type=video`,
      3200
    );
    if (!Array.isArray(list) || !list.length) throw new Error('empty invidious');
    const out: EmbeddableMusicTrack[] = [];
    for (const it of list) {
      const videoId = String(it?.videoId || '').trim();
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) continue;
      out.push(
        buildTrackItem({
          videoId,
          title: String(it?.title || 'YouTube Music'),
          artist: String(it?.author || 'YouTube'),
          durationSeconds: typeof it?.lengthSeconds === 'number' ? it.lengthSeconds : 210,
          description: 'YouTube 开放实例检索',
        })
      );
      if (out.length >= limit) break;
    }
    if (!out.length) throw new Error('no video ids');
    return out;
  });

  try {
    return await Promise.any([...pipedPromises, ...invidiousPromises]);
  } catch {
    return [];
  }
}

function getVerifiedYouTubeFallback(queryOrGenre: string, limit = 8): EmbeddableMusicTrack[] {
  const q = queryOrGenre.toLowerCase().trim();
  let matched = VERIFIED_YOUTUBE_FALLBACK.filter((item) => {
    if (!q || q === 'all' || q === 'youtube') return true;
    if (q === item.genre) return true;
    const words = q.split(/\s+/).filter(Boolean);
    return words.some(
      (w) =>
        item.title.toLowerCase().includes(w) ||
        item.artist.toLowerCase().includes(w) ||
        item.keywords.toLowerCase().includes(w)
    );
  });
  if (matched.length === 0) {
    matched = VERIFIED_YOUTUBE_FALLBACK;
  }
  return matched.slice(0, limit).map((item) =>
    buildTrackItem({
      videoId: item.videoId,
      title: item.title,
      artist: item.artist,
      durationSeconds: item.durationSeconds,
      description: 'YouTube 官方嵌入曲库',
    })
  );
}

export async function searchYouTubeMusic(query: string, limit = 12, allowFallback = true): Promise<EmbeddableMusicTrack[]> {
  const q = query.trim();
  if (!q) return [];
  const direct = await resolveMusicEmbedUrlAsync(q);
  if (direct) return [direct];

  // Tier 0: Official Data API v3 (if YOUTUBE_API_KEY configured)
  const apiRes = await searchYouTubeDataApi(q, limit).catch(() => []);
  if (apiRes.length > 0) return apiRes.slice(0, limit);

  // Tier 1: YouTube InnerTube JSON API (fast, structured, no HTML consent wall)
  const innerRes = await searchYouTubeInnerTube(q, limit).catch(() => []);
  if (innerRes.length > 0) return innerRes.slice(0, limit);

  // Tier 2: Direct YouTube HTML search with consent cookies
  const directResults = await searchYouTubeMusicDirect(q, limit).catch(() => []);
  if (directResults.length > 0) return directResults.slice(0, limit);

  // Tier 3: Fast parallel Invidious / Piped race (max ~3.2s total)
  const mirrorRes = await searchYouTubeParallelMirrors(q, limit).catch(() => []);
  if (mirrorRes.length > 0) return mirrorRes.slice(0, limit);

  // Tier 4: Verified real-ID YouTube fallback when server network cannot reach youtube.com
  return allowFallback ? getVerifiedYouTubeFallback(q, limit) : [];
}

export async function getYouTubeDiscoveryMusic(genre = 'all', limit = 10): Promise<EmbeddableMusicTrack[]> {
  const g = genre.toLowerCase();
  const queryMap: Record<string, string> = {
    all: 'Official Music Video Hit Songs 2025 2026',
    mandopop: '华语流行热门单曲 Official MV',
    pop: 'Pop Hit Single Official Music Video',
    jkpop: 'K-Pop J-Pop Hit Single Official MV',
    piano: 'Relaxing Piano Solo Classical Lo-Fi Music',
    youtube: 'Official Music Video Trending Hits',
  };
  const q = queryMap[g] || queryMap.all;
  const live = await searchYouTubeMusic(q, limit, false);
  if (live.length > 0) return live;
  return getVerifiedYouTubeFallback(g, limit);
}

export function resolveMusicEmbedUrl(input: string): EmbeddableMusicTrack | null {
  return trackFromUrl(input);
}
