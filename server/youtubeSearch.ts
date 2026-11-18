/**
 * Lightweight YouTube metadata search for JUPITER (Saturn Cinema).
 * Multi-tier: YOUTUBE_API_KEY -> InnerTube JSON API -> Direct HTML -> Parallel Piped/Invidious race.
 */
import type { SearchResult } from './webFetcher.ts';

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.ducks.party',
];

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
];

const YT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const YT_CONSENT_COOKIE = 'CONSENT=PENDING+999; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg';

function extractVideoId(url: string): string | null {
  const m = String(url || '').match(/(?:v=|\/shorts\/|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function formatDuration(seconds?: number): string | undefined {
  if (!seconds || seconds <= 0) return undefined;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

async function fetchJson(url: string, timeoutMs = 4000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseYoutubeSectionVideos(data: any, limit: number): SearchResult[] {
  const sectionList = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
  const out: SearchResult[] = [];
  for (const section of sectionList) {
    const items = section?.itemSectionRenderer?.contents || [];
    for (const item of items) {
      const v = item?.videoRenderer;
      if (!v || !v.videoId) continue;
      const videoId = String(v.videoId);
      out.push({
        title: v.title?.runs?.[0]?.text || 'YouTube video',
        url: `https://www.youtube.com/watch?v=${videoId}`,
        sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
        snippet: [v.ownerText?.runs?.[0]?.text, v.publishedTimeText?.simpleText].filter(Boolean).join(' · '),
        source: 'web' as const,
        category: 'videos' as const,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration: v.lengthText?.simpleText,
      });
      if (out.length >= limit) break;
    }
    if (out.length >= limit) break;
  }
  return out;
}

async function searchYouTubeInnerTube(query: string, limit: number): Promise<SearchResult[]> {
  try {
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
        query,
      }),
      signal: AbortSignal.timeout(4800),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return parseYoutubeSectionVideos(data, limit);
  } catch {
    return [];
  }
}

async function searchYouTubeDirectHtml(query: string, limit: number): Promise<SearchResult[]> {
  try {
    const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': YT_UA,
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Cookie: YT_CONSENT_COOKIE,
      },
      signal: AbortSignal.timeout(4800),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const start = html.indexOf('ytInitialData = ');
    if (start === -1) return [];
    const jsonStart = start + 'ytInitialData = '.length;
    const end = html.indexOf(';</script>', jsonStart);
    if (end === -1) return [];
    const data = JSON.parse(html.slice(jsonStart, end));
    return parseYoutubeSectionVideos(data, limit);
  } catch {
    return [];
  }
}

async function searchMirrorsParallel(query: string, limit: number): Promise<SearchResult[]> {
  const pipedJobs = PIPED_INSTANCES.map(async (instance) => {
    const data = await fetchJson(`${instance}/search?q=${encodeURIComponent(query)}&filter=videos`, 3200);
    const items = Array.isArray(data?.items) ? data.items : [];
    const out: SearchResult[] = [];
    for (const it of items) {
      if (it?.type !== 'stream') continue;
      const videoId = extractVideoId(it.url || '') || extractVideoId(`https://youtube.com${it.url || ''}`);
      if (!videoId) continue;
      out.push({
        title: String(it.title || 'YouTube video'),
        url: `https://www.youtube.com/watch?v=${videoId}`,
        sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
        snippet: [it.uploaderName || it.uploader, it.uploadedDate].filter(Boolean).join(' · '),
        source: 'web',
        category: 'videos',
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration: formatDuration(typeof it.duration === 'number' ? it.duration : undefined),
      });
      if (out.length >= limit) break;
    }
    if (!out.length) throw new Error('empty');
    return out;
  });

  const invJobs = INVIDIOUS_INSTANCES.map(async (instance) => {
    const list = await fetchJson(`${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, 3200);
    if (!Array.isArray(list) || !list.length) throw new Error('empty');
    const out: SearchResult[] = [];
    for (const it of list) {
      const videoId = String(it?.videoId || '').trim();
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) continue;
      out.push({
        title: String(it.title || 'YouTube video'),
        url: `https://www.youtube.com/watch?v=${videoId}`,
        sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
        snippet: [it.author, it.publishedText].filter(Boolean).join(' · '),
        source: 'web',
        category: 'videos',
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration: formatDuration(typeof it.lengthSeconds === 'number' ? it.lengthSeconds : undefined),
      });
      if (out.length >= limit) break;
    }
    if (!out.length) throw new Error('empty');
    return out;
  });

  try {
    return await Promise.any([...pipedJobs, ...invJobs]);
  } catch {
    return [];
  }
}

export async function searchYouTubeVideos(query: string, limit = 12): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (key) {
    try {
      const search = await fetchJson(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=${Math.min(limit, 20)}&q=${encodeURIComponent(q)}&key=${key}`,
        6000
      );
      const ids = (search?.items || []).map((i: any) => i?.id?.videoId).filter(Boolean);
      if (ids.length) {
        const detail = await fetchJson(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${ids.join(',')}&key=${key}`,
          6000
        );
        const items = Array.isArray(detail?.items) ? detail.items : [];
        return items.slice(0, limit).map((v: any) => {
          const videoId = String(v.id);
          return {
            title: String(v?.snippet?.title || 'YouTube video'),
            url: `https://www.youtube.com/watch?v=${videoId}`,
            sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
            snippet: [v?.snippet?.channelTitle, v?.snippet?.publishedAt?.slice(0, 10)].filter(Boolean).join(' · '),
            source: 'web' as const,
            category: 'videos' as const,
            thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          };
        });
      }
    } catch {
      /* fallback */
    }
  }

  const inner = await searchYouTubeInnerTube(q, limit);
  if (inner.length > 0) return inner;

  const direct = await searchYouTubeDirectHtml(q, limit);
  if (direct.length > 0) return direct;

  return searchMirrorsParallel(q, limit);
}
