/**
 * Pure YouTube & Bilibili Music Crawler Discovery
 * No Archive.org, NetEase, SoundCloud, or random test audio — strictly official YouTube & Bilibili streams.
 */
import { buildBilibiliEmbedUrl } from './bilibiliCrawler.ts';

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.moomoo.me',
  'https://pipedapi.ducks.party',
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

async function fetchJson(url: string, timeoutMs = 8000): Promise<any> {
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

function trackFromUrl(input: string): EmbeddableMusicTrack | null {
  const raw = String(input || '').trim();
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
    return {
      id: `yt_${yt}`,
      title: 'YouTube Music',
      artist: 'YouTube',
      album: 'YouTube Music',
      genre: 'YouTube',
      durationSeconds: 0,
      embedUrl: buildYouTubeEmbedUrl(yt, true),
      coverUrl: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
      source: 'YouTube',
      sourceUrl: `https://www.youtube.com/watch?v=${yt}`,
      license: 'YouTube official embed',
      crawledAt: now,
      description: 'YouTube 官方嵌入播放器',
      playable: 'embed',
    };
  }

  return null;
}

async function searchYouTubeKeyword(query: string, limit = 8): Promise<EmbeddableMusicTrack[]> {
  for (const instance of PIPED_INSTANCES) {
    const data = await fetchJson(`${instance}/search?q=${encodeURIComponent(query + ' official audio')}&filter=music_songs`);
    let list = Array.isArray(data?.items) ? data.items : [];
    if (!list.length) {
      const data2 = await fetchJson(`${instance}/search?q=${encodeURIComponent(query + ' music')}&filter=videos`);
      list = Array.isArray(data2?.items) ? data2.items : [];
    }
    const out: EmbeddableMusicTrack[] = [];
    for (const it of list) {
      const videoId = extractVideoId(it?.url || '') || extractVideoId(`https://youtube.com${it?.url || ''}`);
      if (!videoId) continue;
      out.push({
        id: `yt_${videoId}`,
        title: String(it?.title || 'YouTube Music'),
        artist: String(it?.uploaderName || it?.uploader || 'YouTube'),
        album: 'YouTube Music',
        genre: 'YouTube',
        durationSeconds: typeof it?.duration === 'number' ? it.duration : 210,
        embedUrl: buildYouTubeEmbedUrl(videoId, true),
        coverUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        source: 'YouTube',
        sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
        license: 'YouTube official embed',
        crawledAt: new Date().toISOString(),
        description: 'YouTube 音乐直连',
        playable: 'embed',
      });
      if (out.length >= limit) break;
    }
    if (out.length) return out;
  }
  return [];
}

async function searchYouTubeMusicDirect(query: string, limit = 10): Promise<EmbeddableMusicTrack[]> {
  try {
    const qSuffix = /music|song|mv|audio|歌|音乐|钢琴|流行/i.test(query) ? query : `${query} official audio music`;
    const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(qSuffix)}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const start = html.indexOf('ytInitialData = ');
    if (start === -1) return [];
    const jsonStart = start + 'ytInitialData = '.length;
    const end = html.indexOf(';</script>', jsonStart);
    if (end === -1) return [];
    const data = JSON.parse(html.slice(jsonStart, end));
    const sectionList =
      data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
    const out: EmbeddableMusicTrack[] = [];
    for (const section of sectionList) {
      const items = section.itemSectionRenderer?.contents || [];
      for (const item of items) {
        const v = item.videoRenderer;
        if (!v || !v.videoId) continue;
        const videoId = v.videoId;
        const durationText = v.lengthText?.simpleText || '3:30';
        let durationSeconds = 210;
        const parts = durationText.split(':').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          durationSeconds = parts[0] * 60 + parts[1];
        } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
          durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        // Skip extra-long multi-hour mix streams when individual tracks are available
        if (durationSeconds > 1800 && out.length >= 2) continue;

        out.push({
          id: `yt_${videoId}`,
          title: String(v.title?.runs?.[0]?.text || 'YouTube Music'),
          artist: String(v.ownerText?.runs?.[0]?.text || 'YouTube'),
          album: 'YouTube Music',
          genre: 'YouTube',
          durationSeconds,
          embedUrl: buildYouTubeEmbedUrl(videoId, true),
          coverUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          source: 'YouTube',
          sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
          license: 'YouTube official embed',
          crawledAt: new Date().toISOString(),
          description: v.viewCountText?.simpleText || 'YouTube 音乐频道',
          playable: 'embed',
        });
        if (out.length >= limit) break;
      }
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

export async function searchYouTubeMusic(query: string, limit = 12): Promise<EmbeddableMusicTrack[]> {
  const q = query.trim();
  if (!q) return [];
  const direct = trackFromUrl(q);
  if (direct) return [direct];

  const directResults = await searchYouTubeMusicDirect(q, limit).catch(() => []);
  if (directResults.length > 0) return directResults.slice(0, limit);

  return searchYouTubeKeyword(q, limit).catch(() => []);
}

export async function getYouTubeDiscoveryMusic(genre = 'all', limit = 10): Promise<EmbeddableMusicTrack[]> {
  const queryMap: Record<string, string> = {
    all: 'Top Global Music Hits Official Audio',
    mandopop: '华语流行热歌精选 Official MV',
    pop: 'Billboard Hot 100 Pop Songs Official Audio',
    jkpop: 'K-Pop & J-Pop Hit Songs Official MV',
    piano: 'Relaxing Piano & Lo-Fi Beats Music',
    youtube: 'YouTube Music Top Trending Songs Official Video',
  };
  const q = queryMap[genre.toLowerCase()] || queryMap.all;
  return searchYouTubeMusic(q, limit);
}

export function resolveMusicEmbedUrl(input: string): EmbeddableMusicTrack | null {
  return trackFromUrl(input);
}
