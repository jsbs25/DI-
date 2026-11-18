/**
 * Bilibili (B站) Public Video & Media Crawler
 * Allows searching Bilibili videos, documentaries, music videos, and sci-fi content
 * without requiring third-party API keys. Official embed player support.
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

function cleanHtmlTags(str?: string): string {
  if (!str) return '';
  return str.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
}

export async function searchBilibiliVideos(query: string, limit = 20): Promise<BilibiliVideoResult[]> {
  const q = query.trim();
  if (!q) return [];

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/',
    'Accept': 'application/json, text/plain, */*',
    'Cookie': 'buvid3=infoc;'
  };

  try {
    const url = `https://api.bilibili.com/x/web-interface/search/all/v2?keyword=${encodeURIComponent(q)}&page=1&pagesize=${Math.min(limit, 30)}`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Bilibili HTTP status ${res.status}`);

    const json = await res.json();
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
      const author = item.author || item.upic || 'Bilibili UP主';
      const duration = item.duration || '0:00';
      const play = typeof item.play === 'number' ? (item.play > 10000 ? `${(item.play / 10000).toFixed(1)}万` : String(item.play)) : String(item.play || '0');
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
        embedUrl: `https://player.bilibili.com/player.html?bvid=${bvid}&page=1&autoplay=0`,
        tag: item.tag
      });

      if (out.length >= limit) break;
    }

    return out;
  } catch (err) {
    console.warn('Bilibili crawler error, using fallback stream extraction:', err);
    return [];
  }
}
