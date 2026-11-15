import type {
  MediaProviderDefinition,
  MediaProviderId,
  MediaSourceDescriptor,
} from '../../src/types/media.ts';

export function resolveMediaCdnUrl(relativeOrUrl: string): string {
  const s = String(relativeOrUrl || '').trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;
  const cdnBase = (process.env.MEDIA_CDN_BASE || '').trim().replace(/\/+$/, '');
  if (cdnBase && s.startsWith('/')) {
    return `${cdnBase}${s}`;
  }
  return s;
}

export function getRegisteredProviders(): MediaProviderDefinition[] {
  const jamendoConfigured = Boolean((process.env.JAMENDO_CLIENT_ID || '').trim());
  return [
    {
      providerId: 'one-native',
      providerName: 'ONE 自有与创作者媒体',
      mediaType: 'both',
      regionAvailability: 'global',
      playbackType: 'one_owned_media',
      officialUrl: '/',
      directAudioUrl: resolveMediaCdnUrl('/assets/'),
      copyrightStatus: 'one_owned',
      availabilityStatus: 'available',
      supportsSearch: true,
      supportsDirectPlay: true,
      notes: 'ONE 平台自有/创作者上传直连媒体，支持 CDN 加速，中国大陆与海外均可直连。',
    },
    {
      providerId: 'bilibili',
      providerName: 'Bilibili 官方播放器',
      mediaType: 'both',
      regionAvailability: 'global',
      playbackType: 'official_embed',
      officialUrl: 'https://www.bilibili.com',
      embedUrl: 'https://player.bilibili.com/player.html',
      copyrightStatus: 'official_embed_licensed',
      availabilityStatus: 'available',
      supportsSearch: true,
      supportsDirectPlay: false,
      notes: '中国大陆及海外均可访问的 Bilibili 官方合规嵌入播放器，不绕过权限或解析盗链。',
    },
    {
      providerId: 'netease-outchain',
      providerName: '网易云音乐官方外链 (仅非VIP曲目)',
      mediaType: 'music',
      regionAvailability: 'cn',
      playbackType: 'official_embed',
      officialUrl: 'https://music.163.com',
      embedUrl: 'https://music.163.com/outchain/player',
      copyrightStatus: 'official_embed_licensed',
      availabilityStatus: 'degraded',
      supportsSearch: false,
      supportsDirectPlay: false,
      notes: '仅用于用户主动粘贴的网易云单曲官方外链，VIP/受限版权曲目需跳转原平台。',
    },
    {
      providerId: 'youtube',
      providerName: 'YouTube 官方嵌入',
      mediaType: 'both',
      regionAvailability: 'overseas',
      playbackType: 'official_embed',
      officialUrl: 'https://www.youtube.com',
      embedUrl: 'https://www.youtube-nocookie.com/embed/',
      copyrightStatus: 'official_embed_licensed',
      availabilityStatus: 'available',
      supportsSearch: true,
      supportsDirectPlay: false,
      notes: '海外网络可用，使用 youtube-nocookie 官方嵌入；中国大陆网络下自动降级/切换备用源。',
    },
    {
      providerId: 'internet-archive',
      providerName: 'Internet Archive (公版/CC音频)',
      mediaType: 'music',
      regionAvailability: 'overseas',
      playbackType: 'legal_direct_audio',
      officialUrl: 'https://archive.org',
      directAudioUrl: 'https://archive.org/download/',
      copyrightStatus: 'creative_commons',
      availabilityStatus: 'available',
      supportsSearch: true,
      supportsDirectPlay: true,
      notes: '开放公版与 Creative Commons 授权直链音频库；海外稳定，中国大陆访问可能受限。',
    },
    {
      providerId: 'fma',
      providerName: 'Free Music Archive (IA 开放集合)',
      mediaType: 'music',
      regionAvailability: 'overseas',
      playbackType: 'legal_direct_audio',
      officialUrl: 'https://freemusicarchive.org',
      directAudioUrl: 'https://archive.org/download/',
      copyrightStatus: 'creative_commons',
      availabilityStatus: 'available',
      supportsSearch: true,
      supportsDirectPlay: true,
      notes: '通过 Internet Archive 开放集合检索 CC 授权音乐。',
    },
    {
      providerId: 'wikimedia',
      providerName: 'Wikimedia Commons 开放媒体',
      mediaType: 'both',
      regionAvailability: 'overseas',
      playbackType: 'legal_direct_audio',
      officialUrl: 'https://commons.wikimedia.org',
      directAudioUrl: 'https://upload.wikimedia.org',
      copyrightStatus: 'creative_commons',
      availabilityStatus: 'available',
      supportsSearch: true,
      supportsDirectPlay: true,
      notes: '维基共享资源公开授权音频与公版古典录音直链。',
    },
    {
      providerId: 'jamendo',
      providerName: 'Jamendo 官方授权 API',
      mediaType: 'music',
      regionAvailability: 'global',
      playbackType: 'legal_direct_audio',
      officialUrl: 'https://www.jamendo.com',
      directAudioUrl: 'https://api.jamendo.com/v3.0/tracks/',
      copyrightStatus: 'creative_commons',
      availabilityStatus: jamendoConfigured ? 'available' : 'unavailable',
      supportsSearch: jamendoConfigured,
      supportsDirectPlay: jamendoConfigured,
      notes: jamendoConfigured
        ? '已配置 JAMENDO_CLIENT_ID，提供官方 CC 授权 MP3 直链。'
        : '未配置 JAMENDO_CLIENT_ID，当前保持关闭状态（不伪造直链）。',
    },
    {
      providerId: 'soundcloud',
      providerName: 'SoundCloud 官方 Widget',
      mediaType: 'music',
      regionAvailability: 'overseas',
      playbackType: 'official_embed',
      officialUrl: 'https://soundcloud.com',
      embedUrl: 'https://w.soundcloud.com/player/',
      copyrightStatus: 'official_embed_licensed',
      availabilityStatus: 'available',
      supportsSearch: false,
      supportsDirectPlay: false,
      notes: '支持粘贴 SoundCloud 链接通过官方 Widget 嵌入播放。',
    },
    {
      providerId: 'mixcloud',
      providerName: 'Mixcloud 官方 Widget',
      mediaType: 'music',
      regionAvailability: 'overseas',
      playbackType: 'official_embed',
      officialUrl: 'https://www.mixcloud.com',
      embedUrl: 'https://www.mixcloud.com/widget/iframe/',
      copyrightStatus: 'official_embed_licensed',
      availabilityStatus: 'available',
      supportsSearch: false,
      supportsDirectPlay: false,
      notes: '支持粘贴 Mixcloud 链接通过官方 Widget 嵌入播放。',
    },
    {
      providerId: 'bandcamp',
      providerName: 'Bandcamp 原平台',
      mediaType: 'music',
      regionAvailability: 'overseas',
      playbackType: 'external_redirect',
      officialUrl: 'https://bandcamp.com',
      copyrightStatus: 'external_rights_vary',
      availabilityStatus: 'requires_redirect',
      supportsSearch: false,
      supportsDirectPlay: false,
      notes: 'Bandcamp 限制第三方 iframe，建议跳转原平台页收听。',
    },
  ];
}

export async function searchWikimediaAudio(query: string, limit = 6): Promise<any[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const searchUrl =
      `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
      `&gsrsearch=${encodeURIComponent(`${q} filetype:audio`)}` +
      `&gsrnamespace=6&gsrlimit=${Math.min(10, Math.max(limit * 2, 6))}` +
      `&prop=imageinfo&iiprop=url|mime|size|extmetadata&format=json`;
    const res = await fetch(searchUrl, {
      signal: AbortSignal.timeout(6500),
      headers: {
        'User-Agent': 'ONE-EarthOne-Media/1.0 (https://github.com/jsbs25/DI-)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const pages = Object.values(data?.query?.pages || {}) as any[];
    const out: any[] = [];
    for (const p of pages) {
      const info = Array.isArray(p?.imageinfo) ? p.imageinfo[0] : null;
      const mime = String(info?.mime || '').toLowerCase();
      const audioUrl = String(info?.url || '');
      if (!audioUrl || (!mime.startsWith('audio/') && mime !== 'application/ogg')) continue;
      if (!/\.(mp3|ogg|oga|wav|m4a|flac)(\?|$)/i.test(audioUrl)) continue;
      const titleRaw = String(p?.title || '').replace(/^File:/i, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');
      const meta = info?.extmetadata || {};
      const licenseShort = String(meta?.LicenseShortName?.value || 'CC / Public Domain').replace(/<[^>]+>/g, '');
      const artistRaw = String(meta?.Artist?.value || 'Wikimedia Commons').replace(/<[^>]+>/g, '').slice(0, 80);
      const sourceUrl = String(info?.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(p?.title || '')}`);
      const isPd = /public domain|pd|cc0/i.test(licenseShort);

      const desc: MediaSourceDescriptor = {
        id: `wm_${p.pageid}:audio`,
        providerId: 'wikimedia',
        providerName: 'Wikimedia Commons',
        mediaType: 'music',
        regionAvailability: 'overseas',
        playbackType: 'legal_direct_audio',
        officialUrl: sourceUrl,
        directAudioUrl: audioUrl,
        copyrightStatus: isPd ? 'public_domain' : 'creative_commons',
        copyrightLabel: licenseShort,
        availabilityStatus: 'available',
        priorityCn: 60,
        priorityOverseas: 15,
      };

      out.push({
        id: `wm_${p.pageid}`,
        title: titleRaw || 'Open Audio',
        artist: artistRaw || 'Wikimedia Commons',
        album: 'Wikimedia Commons',
        genre: 'Open Audio',
        durationSeconds: 0,
        audioUrl,
        coverUrl: '/assets/music/neo-classical.jpg',
        source: 'Wikimedia Commons',
        sourceUrl,
        license: licenseShort,
        crawledAt: new Date().toISOString(),
        description: `Wikimedia Commons 开放授权音频 (${licenseShort})`,
        playable: 'audio',
        providerId: desc.providerId,
        providerName: desc.providerName,
        mediaType: 'music',
        regionAvailability: desc.regionAvailability,
        playbackType: desc.playbackType,
        officialUrl: desc.officialUrl,
        directAudioUrl: desc.directAudioUrl,
        copyrightStatus: desc.copyrightStatus,
        availabilityStatus: desc.availabilityStatus,
        mediaSources: [desc],
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

export async function searchJamendoAudio(query: string, limit = 8): Promise<any[]> {
  const clientId = (process.env.JAMENDO_CLIENT_ID || '').trim();
  if (!clientId || !query.trim()) return [];
  try {
    const url =
      `https://api.jamendo.com/v3.0/tracks/?client_id=${encodeURIComponent(clientId)}` +
      `&format=json&limit=${Math.min(20, limit)}&search=${encodeURIComponent(query.trim())}` +
      `&audioformat=mp32&include=licenses`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6500) });
    if (!res.ok) return [];
    const data: any = await res.json();
    const list = Array.isArray(data?.results) ? data.results : [];
    return list
      .filter((t: any) => Boolean(t?.audio))
      .map((t: any) => {
        const sourceUrl = String(t.shareurl || `https://www.jamendo.com/track/${t.id}`);
        const desc: MediaSourceDescriptor = {
          id: `jam_${t.id}:audio`,
          providerId: 'jamendo',
          providerName: 'Jamendo',
          mediaType: 'music',
          regionAvailability: 'global',
          playbackType: 'legal_direct_audio',
          officialUrl: sourceUrl,
          directAudioUrl: String(t.audio),
          copyrightStatus: 'creative_commons',
          copyrightLabel: String(t.license_ccurl || 'Creative Commons'),
          availabilityStatus: 'available',
          priorityCn: 18,
          priorityOverseas: 12,
        };
        return {
          id: `jam_${t.id}`,
          title: String(t.name || 'Jamendo Track'),
          artist: String(t.artist_name || 'Jamendo Artist'),
          album: String(t.album_name || 'Jamendo'),
          genre: 'Jamendo CC',
          durationSeconds: Number(t.duration) || 0,
          audioUrl: String(t.audio),
          coverUrl: String(t.album_image || t.image || '/assets/music/lofi-horizon.jpg'),
          source: 'Jamendo',
          sourceUrl,
          license: String(t.license_ccurl || 'Creative Commons'),
          crawledAt: new Date().toISOString(),
          description: 'Jamendo 官方 CC 授权直链音源',
          playable: 'audio',
          providerId: desc.providerId,
          providerName: desc.providerName,
          mediaType: 'music',
          regionAvailability: desc.regionAvailability,
          playbackType: desc.playbackType,
          officialUrl: desc.officialUrl,
          directAudioUrl: desc.directAudioUrl,
          copyrightStatus: desc.copyrightStatus,
          availabilityStatus: desc.availabilityStatus,
          mediaSources: [desc],
        };
      });
  } catch {
    return [];
  }
}

export function inferProviderIdFromUrl(input?: string): MediaProviderId {
  const s = String(input || '').toLowerCase();
  if (!s) return 'external-direct';
  if (s.startsWith('/assets/') || s.startsWith('/api/uploads/') || s.startsWith('/media/')) return 'one-native';
  if (s.includes('bilibili.com') || s.includes('b23.tv')) return 'bilibili';
  if (s.includes('music.163.com')) return 'netease-outchain';
  if (s.includes('youtube.com') || s.includes('youtube-nocookie.com') || s.includes('youtu.be')) return 'youtube';
  if (s.includes('archive.org')) return 'internet-archive';
  if (s.includes('wikimedia.org')) return 'wikimedia';
  if (s.includes('jamendo.com')) return 'jamendo';
  if (s.includes('soundcloud.com')) return 'soundcloud';
  if (s.includes('mixcloud.com')) return 'mixcloud';
  if (s.includes('bandcamp.com')) return 'bandcamp';
  if (s.includes('vimeo.com')) return 'vimeo';
  if (s.includes('dailymotion.com') || s.includes('dai.ly')) return 'dailymotion';
  return 'external-direct';
}
