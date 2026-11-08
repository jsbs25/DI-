/**
 * Lightweight YouTube metadata search for JUPITER (Saturn-style fallback).
 * Uses public Piped API instances; returns discovery metadata only (no media download).
 * Optional: YOUTUBE_API_KEY for official Data API v3.
 */
import type { SearchResult } from './webFetcher.ts';

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.moomoo.me',
  'https://pipedapi.ducks.party'
];

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

async function fetchJson(url: string, timeoutMs = 8000): Promise<any> {
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

async function searchPiped(query: string, limit: number): Promise<SearchResult[]> {
  for (const instance of PIPED_INSTANCES) {
    const data = await fetchJson(`${instance}/search?q=${encodeURIComponent(query)}&filter=videos`, 8000);
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
        duration: formatDuration(typeof it.duration === 'number' ? it.duration : undefined)
      });
      if (out.length >= limit) break;
    }
    if (out.length) return out;
  }
  return [];
}

export async function searchYouTubeVideos(query: string, limit = 12): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (key) {
    try {
      const search = await fetchJson(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${Math.min(limit, 20)}&q=${encodeURIComponent(q)}&key=${key}`, 10000);
      const ids = (search?.items || []).map((i: any) => i?.id?.videoId).filter(Boolean);
      if (ids.length) {
        const detail = await fetchJson(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${ids.join(',')}&key=${key}`, 10000);
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
            thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
          };
        });
      }
    } catch { /* fallback */ }
  }
  return searchPiped(q, limit);
}
