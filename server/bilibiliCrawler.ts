/**
 * Bilibili (B站) Public Music & Video Crawler
 * Acquires live SPI session cookies (buvid3/buvid4) so Bilibili search and
 * music ranking endpoints return real playable BV tracks reliably.
 */

export interface BilibiliVideoResult {
  id: string;
  bvid: string;
  aid?: number;
  title: string;
  author: string;
  authorMid?: number;
  pic: string;
  duration: string;
  durationSeconds?: number;
  play: number | string;
  description: string;
  source: 'bilibili';
  sourceUrl: string;
  embedUrl: string;
  category?: string;
  tag?: string;
}

const BILI_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

let cachedBiliCookie = '';
let cachedBiliCookieExpires = 0;

export async function getBilibiliSessionCookie(): Promise<string> {
  if (cachedBiliCookie && cachedBiliCookieExpires > Date.now()) {
    return cachedBiliCookie;
  }
  try {
    const res = await fetch('https://api.bilibili.com/x/frontend/finger/spi', {
      headers: {
        'User-Agent': BILI_UA,
        Referer: 'https://www.bilibili.com/',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const json: any = await res.json();
      const b3 = json?.data?.b_3;
      const b4 = json?.data?.b_4;
      if (b3) {
        cachedBiliCookie = `buvid3=${b3};${b4 ? ` buvid4=${b4};` : ''}`;
        cachedBiliCookieExpires = Date.now() + 20 * 60 * 1000;
        return cachedBiliCookie;
      }
    }
  } catch {
    // Fallback below
  }
  return 'buvid3=infoc;';
}

function parseDurationSeconds(durationStr: string): number {
  if (!durationStr) return 0;
  const parts = durationStr.split(':').map(Number);
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

function formatSecondsDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '03:30';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function cleanHtmlTags(str?: string): string {
  if (!str) return '';
  return str
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export function buildBilibiliEmbedUrl(bvid: string, autoplay = true): string {
  return `https://player.bilibili.com/player.html?bvid=${bvid}&page=1&autoplay=${autoplay ? '1' : '0'}&danmaku=0&muted=0`;
}

export async function searchBilibiliVideos(query: string, limit = 20): Promise<BilibiliVideoResult[]> {
  const q = query.trim();
  if (!q) return [];

  const cookie = await getBilibiliSessionCookie();
  const headers = {
    'User-Agent': BILI_UA,
    Referer: 'https://search.bilibili.com/',
    Accept: 'application/json, text/plain, */*',
    Cookie: cookie,
  };

  try {
    const url = `https://api.bilibili.com/x/web-interface/search/all/v2?keyword=${encodeURIComponent(q)}&page=1&pagesize=${Math.min(limit, 30)}`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Bilibili HTTP status ${res.status}`);

    const json: any = await res.json();
    if (json.code !== 0 || !json.data) {
      throw new Error(json.message || 'Bilibili search returned non-zero code');
    }

    const results = json.data.result || [];
    const videoSection = results.find((r: any) => r.result_type === 'video') || results[0];
    const rawList: any[] = Array.isArray(videoSection?.data) ? videoSection.data : [];

    const out: BilibiliVideoResult[] = [];
    for (const item of rawList) {
      const bvid = item.bvid || (item.arcurl ? item.arcurl.match(/video\/(BV[0-9A-Za-z]+)/)?.[1] : '');
      if (!bvid) continue;

      let pic = item.pic || '';
      if (pic.startsWith('//')) {
        pic = 'https:' + pic;
      }

      const title = cleanHtmlTags(item.title) || 'Bilibili 视频';
      const author = item.author || item.upic || 'Bilibili 音乐人';
      const duration = item.duration || '03:30';
      const play =
        typeof item.play === 'number'
          ? item.play > 10000
            ? `${(item.play / 10000).toFixed(1)}万`
            : String(item.play)
          : String(item.play || '0');
      const description = cleanHtmlTags(item.description || item.desc || '');

      out.push({
        id: `bili_${bvid}`,
        bvid,
        aid: item.aid,
        title,
        author,
        authorMid: item.mid,
        pic,
        duration,
        durationSeconds: parseDurationSeconds(duration),
        play,
        description,
        source: 'bilibili',
        sourceUrl: `https://www.bilibili.com/video/${bvid}`,
        embedUrl: buildBilibiliEmbedUrl(bvid, true),
        tag: item.tag,
      });

      if (out.length >= limit) break;
    }

    return out;
  } catch (err) {
    console.warn('Bilibili crawler search error:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function getBilibiliTrendingMusic(limit = 12): Promise<BilibiliVideoResult[]> {
  const cookie = await getBilibiliSessionCookie();
  try {
    const res = await fetch('https://api.bilibili.com/x/web-interface/ranking/v2?rid=3&type=all', {
      headers: {
        'User-Agent': BILI_UA,
        Referer: 'https://www.bilibili.com/v/music/',
        Accept: 'application/json, text/plain, */*',
        Cookie: cookie,
      },
      signal: AbortSignal.timeout(7000),
    });
    if (res.ok) {
      const json: any = await res.json();
      const list: any[] = Array.isArray(json?.data?.list) ? json.data.list : [];
      if (list.length > 0) {
        return list.slice(0, limit).map((item: any) => {
          const bvid = String(item.bvid || '');
          let pic = String(item.pic || '');
          if (pic.startsWith('//')) pic = `https:${pic}`;
          const durSec = typeof item.duration === 'number' ? item.duration : 210;
          const viewsNum = Number(item?.stat?.view || 0);
          return {
            id: `bili_${bvid}`,
            bvid,
            aid: item.aid,
            title: cleanHtmlTags(item.title) || 'Bilibili 热门音乐',
            author: item.owner?.name || 'Bilibili 音乐区',
            authorMid: item.owner?.mid,
            pic,
            duration: formatSecondsDuration(durSec),
            durationSeconds: durSec,
            play: viewsNum > 10000 ? `${(viewsNum / 10000).toFixed(1)}万` : String(viewsNum),
            description: cleanHtmlTags(item.desc || ''),
            source: 'bilibili',
            sourceUrl: `https://www.bilibili.com/video/${bvid}`,
            embedUrl: buildBilibiliEmbedUrl(bvid, true),
            category: 'Bilibili 音乐榜',
          };
        });
      }
    }
  } catch {
    // fallback to keyword search
  }
  return searchBilibiliVideos('热门 华语流行 音乐 MV', limit);
}
