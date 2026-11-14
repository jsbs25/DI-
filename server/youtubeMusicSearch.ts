/**
 * Music discovery for Venus (metadata + embeddable/playable URLs only).
 * No audio downloading/ripping. Uses official embeds and direct public/open audio URLs where permitted.
 */
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

async function fetchJson(url: string, timeoutMs = 9000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    return res.ok ? await res.json() : null;
  } catch { return null; } finally { clearTimeout(timer); }
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

function extractBvid(input: string): string | null {
  const m = String(input || '').match(/\b(BV[0-9A-Za-z]{8,14})\b/);
  return m ? m[1] : null;
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
      album: 'Bilibili',
      genre: 'B站音乐',
      durationSeconds: 0,
      embedUrl: `https://player.bilibili.com/player.html?bvid=${bvid}&page=1&autoplay=1&danmaku=0`,
      coverUrl: '/assets/music/electronic-pulse.jpg',
      source: 'Bilibili',
      sourceUrl: `https://www.bilibili.com/video/${bvid}`,
      license: 'Bilibili official embed',
      crawledAt: now,
      description: 'B站官方嵌入播放器；版权与清晰度由来源提供。',
      playable: 'embed'
    };
  }

  if (!/^https?:\/\//i.test(raw)) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
  const yt = extractVideoId(raw);
  if (yt) return {
    id: `yt_${yt}`, title: 'YouTube 音乐', artist: 'YouTube', album: 'YouTube (official embed)', genre: 'YouTube', durationSeconds: 0,
    embedUrl: `https://www.youtube-nocookie.com/embed/${yt}?enablejsapi=1&rel=0`, coverUrl: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
    source: 'YouTube', sourceUrl: `https://www.youtube.com/watch?v=${yt}`, license: 'YouTube terms / rights vary by video', crawledAt: now,
    description: '官方嵌入播放；版权/可用性由来源控制。', playable: 'embed'
  };
  if (host === 'soundcloud.com' || host === 'on.soundcloud.com' || host === 'w.soundcloud.com') return {
    id: `sc_${Buffer.from(raw).toString('base64url').slice(0, 24)}`, title: 'SoundCloud 音轨', artist: 'SoundCloud', album: 'SoundCloud (official widget)', genre: 'SoundCloud', durationSeconds: 0,
    embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(u.href)}&auto_play=true&show_artwork=true&visual=true`,
    coverUrl: '/assets/music/lofi-horizon.jpg',
    source: 'SoundCloud', sourceUrl: u.href, license: 'SoundCloud terms / rights vary by track', crawledAt: now,
    description: 'SoundCloud 官方 widget 嵌入；版权/可用性由来源控制。', playable: 'embed'
  };
  if (host === 'mixcloud.com' && u.pathname.split('/').filter(Boolean).length >= 2) return {
    id: `mc_${Buffer.from(raw).toString('base64url').slice(0, 24)}`, title: 'Mixcloud', artist: 'Mixcloud', album: 'Mixcloud (official widget)', genre: 'Mixcloud', durationSeconds: 0,
    embedUrl: `https://www.mixcloud.com/widget/iframe/?hide_cover=1&feed=${encodeURIComponent(u.pathname)}`,
    coverUrl: '/assets/music/electronic-pulse.jpg',
    source: 'Mixcloud', sourceUrl: u.href, license: 'Mixcloud terms / rights vary', crawledAt: now,
    description: 'Mixcloud 官方 widget 嵌入。', playable: 'embed'
  };
  if (host === 'bandcamp.com' || host.endsWith('.bandcamp.com')) return {
    id: `bc_${Buffer.from(raw).toString('base64url').slice(0, 24)}`, title: 'Bandcamp', artist: host, album: 'Bandcamp (official page)', genre: 'Bandcamp', durationSeconds: 0,
    embedUrl: u.href, coverUrl: '/assets/music/neo-classical.jpg',
    source: 'Bandcamp', sourceUrl: u.href, license: 'Bandcamp terms / rights vary', crawledAt: now,
    description: 'Bandcamp 页面/嵌入；若站点限制 iframe，请用原始来源打开。', playable: 'embed'
  };
  if (/\.(mp3|ogg|wav|m4a)(\?|$)/i.test(u.pathname) && (u.protocol === 'https:' || u.protocol === 'http:')) return {
    id: `au_${Buffer.from(raw).toString('base64url').slice(0, 24)}`, title: decodeURIComponent(u.pathname.split('/').pop() || 'Audio'), artist: host, album: host, genre: 'Direct Audio', durationSeconds: 0,
    audioUrl: u.href, coverUrl: '/assets/music/ambient-space.jpg',
    source: host, sourceUrl: u.href, license: 'Rights vary by source; direct link only', crawledAt: now,
    description: '直接音频链接播放；版权/可用性由来源控制。', playable: 'audio'
  };
  return null;
}

async function searchInternetArchiveAudio(query: string, limit = 8): Promise<EmbeddableMusicTrack[]> {
  const q = `(${query}) AND mediatype:(audio)`;
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier,title,creator,licenseurl,description&sort[]=downloads+desc&rows=${Math.max(limit * 2, 10)}&page=1&output=json`;
  const data = await fetchJson(url, 10000);
  const docs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
  const out: EmbeddableMusicTrack[] = [];
  for (const d of docs) {
    const identifier = String(d?.identifier || '');
    if (!identifier) continue;
    const meta = await fetchJson(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, 8000);
    const files = Array.isArray(meta?.files) ? meta.files : [];
    const audio = files.find((f: any) => /\.(mp3|ogg|m4a)$/i.test(String(f?.name || '')) && !String(f?.name || '').includes('_spectrogram'));
    if (!audio?.name) continue;
    const fileUrl = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(audio.name)}`;
    out.push({
      id: `ia_${identifier}`,
      title: String(d?.title || identifier),
      artist: Array.isArray(d?.creator) ? String(d.creator[0]) : (d?.creator ? String(d.creator) : 'Internet Archive'),
      album: 'Internet Archive Audio',
      genre: 'Internet Archive',
      durationSeconds: Number(audio?.length) || 0,
      audioUrl: fileUrl,
      coverUrl: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
      source: 'Internet Archive',
      sourceUrl: `https://archive.org/details/${encodeURIComponent(identifier)}`,
      license: String(d?.licenseurl || 'Rights vary; check item page'),
      crawledAt: new Date().toISOString(),
      description: '来自 Internet Archive 的公开音频文件（直链播放）；具体版权/许可请以条目页为准。',
      playable: 'audio'
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function searchYouTubeKeyword(query: string, limit = 8): Promise<EmbeddableMusicTrack[]> {
  for (const instance of PIPED_INSTANCES) {
    const data = await fetchJson(`${instance}/search?q=${encodeURIComponent(query + ' music')}&filter=music_songs`);
    let list = Array.isArray(data?.items) ? data.items : [];
    if (!list.length) {
      const data2 = await fetchJson(`${instance}/search?q=${encodeURIComponent(query)}&filter=videos`);
      list = Array.isArray(data2?.items) ? data2.items : [];
    }
    const out: EmbeddableMusicTrack[] = [];
    for (const it of list) {
      const videoId = extractVideoId(it?.url || '') || extractVideoId(`https://youtube.com${it?.url || ''}`);
      if (!videoId) continue;
      out.push({
        id: `yt_${videoId}`,
        title: String(it?.title || 'YouTube music'),
        artist: String(it?.uploaderName || it?.uploader || 'YouTube'),
        album: 'YouTube (official embed)',
        genre: 'YouTube',
        durationSeconds: typeof it?.duration === 'number' ? it.duration : 0,
        embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&rel=0`,
        coverUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        source: 'YouTube',
        sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
        license: 'YouTube terms / rights vary by video',
        crawledAt: new Date().toISOString(),
        description: '通过 YouTube 官方嵌入播放；版权/可嵌入性由原视频与 YouTube 控制。',
        playable: 'embed'
      });
      if (out.length >= limit) break;
    }
    if (out.length) return out;
  }
  return [];
}

async function searchYouTubeMusicDirect(query: string, limit = 8): Promise<EmbeddableMusicTrack[]> {
  try {
    const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' music')}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      signal: AbortSignal.timeout(7000)
    });
    if (!res.ok) return [];
    const html = await res.text();
    const start = html.indexOf('ytInitialData = ');
    if (start === -1) return [];
    const jsonStart = start + 'ytInitialData = '.length;
    const end = html.indexOf(';</script>', jsonStart);
    if (end === -1) return [];
    const data = JSON.parse(html.slice(jsonStart, end));
    const sectionList = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
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
        }
        out.push({
          id: `yt_${videoId}`,
          title: String(v.title?.runs?.[0]?.text || 'YouTube Music'),
          artist: String(v.ownerText?.runs?.[0]?.text || 'YouTube Artist'),
          album: 'YouTube Music Stream',
          genre: 'Streaming Music',
          durationSeconds,
          embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&rel=0`,
          coverUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          source: 'YouTube Music',
          sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
          license: 'YouTube Standard Terms',
          crawledAt: new Date().toISOString(),
          description: v.viewCountText?.simpleText || 'YouTube 音乐流媒体',
          playable: 'embed'
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

  // Parallel multi-source: YouTube direct, Internet Archive, and Piped fallback
  const [ia, ytDirect, ytPiped] = await Promise.all([
    searchInternetArchiveAudio(q, Math.max(3, Math.floor(limit / 3))).catch(() => []),
    searchYouTubeMusicDirect(q, Math.max(6, Math.floor(limit / 2))).catch(() => []),
    searchYouTubeKeyword(q, Math.max(4, Math.floor(limit / 3))).catch(() => [])
  ]);

  const seen = new Set<string>();
  const merged = [...ytDirect, ...ia, ...ytPiped].filter(t => {
    const k = t.sourceUrl || t.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (merged.length) return merged.slice(0, limit);
  return searchYouTubeMusicDirect(q, limit);
}

export function resolveMusicEmbedUrl(input: string): EmbeddableMusicTrack | null {
  return trackFromUrl(input);
}
