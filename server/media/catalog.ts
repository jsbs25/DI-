import type {
  MediaAvailabilityStatus,
  MediaCopyrightStatus,
  MediaPlaybackType,
  MediaProviderId,
  MediaRegionAvailability,
  MediaSourceDescriptor,
  ResolvedRegion,
} from '../../src/types/media.ts';
import { inferProviderIdFromUrl, resolveMediaCdnUrl } from './providers.ts';

function providerDisplayName(providerId: MediaProviderId, fallback?: string): string {
  switch (providerId) {
    case 'one-native':
      return 'ONE 自有媒体 / CDN';
    case 'bilibili':
      return 'Bilibili 官方播放器';
    case 'youtube':
      return 'YouTube 官方嵌入';
    case 'internet-archive':
      return 'Internet Archive (公版/CC)';
    case 'fma':
      return 'Free Music Archive';
    case 'wikimedia':
      return 'Wikimedia Commons';
    case 'jamendo':
      return 'Jamendo CC';
    case 'soundcloud':
      return 'SoundCloud 官方嵌入';
    case 'mixcloud':
      return 'Mixcloud 官方嵌入';
    case 'bandcamp':
      return 'Bandcamp 原平台';
    case 'netease-outchain':
      return '网易云音乐官方外链';
    case 'vimeo':
      return 'Vimeo 官方嵌入';
    case 'dailymotion':
      return 'Dailymotion 官方嵌入';
    default:
      return fallback || '外部开放媒体源';
  }
}

function regionForProvider(providerId: MediaProviderId): MediaRegionAvailability {
  if (providerId === 'one-native' || providerId === 'bilibili' || providerId === 'jamendo') {
    return 'global';
  }
  if (providerId === 'netease-outchain') {
    return 'cn';
  }
  return 'overseas';
}

function copyrightForTrack(track: any, providerId: MediaProviderId): {
  status: MediaCopyrightStatus;
  label: string;
} {
  const lic = String(track?.license || '').trim();
  const lower = lic.toLowerCase();
  if (providerId === 'one-native') {
    return { status: 'one_owned', label: lic || 'ONE 自有/创作者授权' };
  }
  if (lower.includes('public domain') || lower.includes('cc0')) {
    return { status: 'public_domain', label: lic || 'Public Domain' };
  }
  if (lower.includes('cc ') || lower.includes('creative commons')) {
    return { status: 'creative_commons', label: lic || 'Creative Commons' };
  }
  if (
    providerId === 'bilibili' ||
    providerId === 'youtube' ||
    providerId === 'soundcloud' ||
    providerId === 'mixcloud' ||
    providerId === 'netease-outchain'
  ) {
    return { status: 'official_embed_licensed', label: lic || '官方嵌入授权播放' };
  }
  return { status: 'external_rights_vary', label: lic || '版权归原平台及作者所有' };
}

// Verified Bilibili official embed backups for existing public-domain/CC seed tracks
// so China Mainland users get smooth legal fallback instead of hanging on archive.org.
const SEED_TRACK_BILIBILI_BACKUPS: Record<string, { bvid: string; titleHint: string; officialUrl: string }> = {
  venus_track_01: {
    bvid: 'BV1Kx41177SQ',
    titleHint: '德彪西《月光》钢琴演奏 (Bilibili 官方播放器)',
    officialUrl: 'https://www.bilibili.com/video/BV1Kx41177SQ',
  },
  venus_track_02: {
    bvid: 'BV1m4411k793',
    titleHint: '埃里克·萨蒂《Gymnopédie No.1》钢琴曲 (Bilibili 官方播放器)',
    officialUrl: 'https://www.bilibili.com/video/BV1m4411k793',
  },
};

// Verified Bilibili official embed backups for seed videos whose primary URLs use googleapis.com
const SEED_VIDEO_BILIBILI_BACKUPS: Record<string, { bvid: string; officialUrl: string; titleHint: string }> = {
  vid_1: {
    bvid: 'BV1bj411279j',
    officialUrl: 'https://www.bilibili.com/video/BV1bj411279j',
    titleHint: '星空荒漠延时摄影 (Bilibili 官方备用源)',
  },
  vid_2: {
    bvid: 'BV1zc411F7kK',
    officialUrl: 'https://www.bilibili.com/video/BV1zc411F7kK',
    titleHint: '生成艺术光影实验短片 (Bilibili 官方备用源)',
  },
};

// Curated China Mainland & Global verified music entries (additive virtual catalog; never overwrites disk JSON)
export const CURATED_GLOBAL_CN_MUSIC: any[] = [
  {
    id: 'bili_music_clair_de_lune',
    title: 'Clair de Lune · 德彪西《月光》(钢琴演奏)',
    artist: 'Claude Debussy / Bilibili',
    album: '中国大陆直连古典精选',
    genre: 'Neo-Classical',
    durationSeconds: 312,
    embedUrl: 'https://player.bilibili.com/player.html?bvid=BV1Kx41177SQ&page=1&autoplay=0&danmaku=0',
    audioUrl: 'https://archive.org/download/ClairDeLunedebussy/2009-03-30-clairdelune.mp3',
    coverUrl: '/assets/music/neo-classical.jpg',
    source: 'Bilibili 官方播放器',
    sourceUrl: 'https://www.bilibili.com/video/BV1Kx41177SQ',
    license: 'Bilibili official embed / Public Domain work',
    crawledAt: '2026-11-15T00:00:00Z',
    playable: 'embed',
    description: '支持中国大陆（Bilibili 官方合规嵌入）与海外（Internet Archive 公版直链）双源智能切换。',
  },
  {
    id: 'bili_music_gymnopedie',
    title: 'Gymnopédie No. 1 · 萨蒂极简钢琴曲',
    artist: 'Erik Satie / Bilibili',
    album: '中国大陆直连古典精选',
    genre: 'Neo-Classical',
    durationSeconds: 215,
    embedUrl: 'https://player.bilibili.com/player.html?bvid=BV1m4411k793&page=1&autoplay=0&danmaku=0',
    audioUrl: 'https://archive.org/download/GymnopedieNo.1/Gymnopedie%20No.1.mp3',
    coverUrl: '/assets/music/neo-classical.jpg',
    source: 'Bilibili 官方播放器',
    sourceUrl: 'https://www.bilibili.com/video/BV1m4411k793',
    license: 'Bilibili official embed / Public Domain work',
    crawledAt: '2026-11-15T00:00:00Z',
    playable: 'embed',
    description: '支持中国大陆官方嵌入与海外公版音频双通道。',
  },
];

// Curated China Mainland & Global verified videos (additive; existing vid_1/vid_2 untouched)
export const CURATED_CN_VIDEOS: any[] = [
  {
    id: 'vid_cn_1',
    creatorId: 'user_cn_1',
    creator: {
      displayName: 'Li Wei (李伟)',
      username: 'li_wei',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      countryCode: 'CN',
    },
    title: '星辰大海与荒漠夜空 · 8K 自然延时影像',
    description: '通过 Bilibili 官方合规播放器呈现的自然延时影像，中国大陆与海外均可流畅加载。',
    videoUrl: '',
    embedUrl: 'https://player.bilibili.com/player.html?bvid=BV1bj411279j&page=1&autoplay=0&danmaku=0',
    sourceUrl: 'https://www.bilibili.com/video/BV1bj411279j',
    source: 'Bilibili',
    bvid: 'BV1bj411279j',
    thumbnailUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=80',
    duration: '04:08',
    viewsCount: 18600,
    likesCount: 2340,
    liked: false,
    category: 'Travel & Nature',
    countryName: 'China',
    createdAt: '2026-11-10T10:00:00Z',
  },
  {
    id: 'vid_cn_2',
    creatorId: 'user_cn_1',
    creator: {
      displayName: 'ONE 音画实验室',
      username: 'li_wei',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      countryCode: 'CN',
    },
    title: '数字空间几何与沉浸式古典声景',
    description: 'Bilibili 官方嵌入渠道直连播放，无第三方盗链或代理负担。',
    videoUrl: '',
    embedUrl: 'https://player.bilibili.com/player.html?bvid=BV1Kx41177SQ&page=1&autoplay=0&danmaku=0',
    sourceUrl: 'https://www.bilibili.com/video/BV1Kx41177SQ',
    source: 'Bilibili',
    bvid: 'BV1Kx41177SQ',
    thumbnailUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80',
    duration: '05:12',
    viewsCount: 11200,
    likesCount: 1490,
    liked: false,
    category: 'Creative Arts',
    countryName: 'China',
    createdAt: '2026-11-12T15:00:00Z',
  },
];

export function scoreSourceForRegion(source: MediaSourceDescriptor, region: ResolvedRegion): number {
  const explicit = region === 'cn' ? source.priorityCn : source.priorityOverseas;
  if (typeof explicit === 'number') return explicit;

  if (source.availabilityStatus === 'unavailable' || source.playbackType === 'external_redirect') return 999;

  if (region === 'cn') {
    if (source.providerId === 'one-native') return 5;
    if (source.playbackType === 'legal_direct_audio' && source.directAudioUrl) return 8;
    if (source.providerId === 'bilibili') return 14;
    if (source.providerId === 'netease-outchain') return 18;
    if (source.providerId === 'jamendo') return 18;
    if (source.regionAvailability === 'cn') return 25;
    if (source.providerId === 'internet-archive' || source.providerId === 'fma') return 35;
    if (source.providerId === 'youtube') return 85;
    return 70;
  }

  // Overseas scoring
  if (source.providerId === 'one-native') return 5;
  if (source.playbackType === 'legal_direct_audio' || source.playbackType === 'legal_direct_video') {
    if (source.providerId === 'internet-archive' || source.providerId === 'fma') return 10;
    if (source.providerId === 'jamendo' || source.providerId === 'wikimedia') return 12;
    return 15;
  }
  if (source.providerId === 'youtube') return 18;
  if (source.providerId === 'bilibili') return 28;
  if (source.playbackType === 'official_embed') return 30;
  return 50;
}

export function sortSourcesForRegion(
  sources: MediaSourceDescriptor[],
  region: ResolvedRegion
): MediaSourceDescriptor[] {
  return [...sources].sort((a, b) => scoreSourceForRegion(a, region) - scoreSourceForRegion(b, region));
}

export function buildSourcesForMusicTrack(track: any): MediaSourceDescriptor[] {
  if (Array.isArray(track?.mediaSources) && track.mediaSources.length > 0) {
    return track.mediaSources as MediaSourceDescriptor[];
  }

  const sources: MediaSourceDescriptor[] = [];
  const audioUrlRaw = String(track?.audioUrl || '').trim();
  const embedUrlRaw = String(track?.embedUrl || '').trim();
  const sourceUrl = String(track?.sourceUrl || embedUrlRaw || audioUrlRaw || '').trim();

  if (audioUrlRaw) {
    const resolvedAudio = resolveMediaCdnUrl(audioUrlRaw);
    const providerId = inferProviderIdFromUrl(resolvedAudio || sourceUrl);
    const playbackType: MediaPlaybackType =
      providerId === 'one-native' ? 'one_owned_media' : 'legal_direct_audio';
    const copy = copyrightForTrack(track, providerId);
    sources.push({
      id: `${track.id || 'track'}:audio:${providerId}`,
      providerId,
      providerName: providerDisplayName(providerId, track?.source),
      mediaType: 'music',
      regionAvailability: regionForProvider(providerId),
      playbackType,
      officialUrl: sourceUrl || resolvedAudio,
      directAudioUrl: resolvedAudio,
      copyrightStatus: copy.status,
      copyrightLabel: copy.label,
      availabilityStatus: 'available',
    });
  }

  if (embedUrlRaw) {
    const providerId = inferProviderIdFromUrl(embedUrlRaw || sourceUrl);
    const isBandcamp = providerId === 'bandcamp';
    const copy = copyrightForTrack(track, providerId);
    sources.push({
      id: `${track.id || 'track'}:embed:${providerId}`,
      providerId,
      providerName: providerDisplayName(providerId, track?.source),
      mediaType: 'music',
      regionAvailability: regionForProvider(providerId),
      playbackType: isBandcamp ? 'external_redirect' : 'official_embed',
      officialUrl: sourceUrl || embedUrlRaw,
      embedUrl: isBandcamp ? undefined : embedUrlRaw,
      copyrightStatus: copy.status,
      copyrightLabel: copy.label,
      availabilityStatus: isBandcamp ? 'requires_redirect' : 'available',
    });
  }

  // Attach verified Bilibili official embed backup for matching seed tracks
  const backup = SEED_TRACK_BILIBILI_BACKUPS[String(track?.id || '')];
  if (backup && !sources.some((s) => s.providerId === 'bilibili')) {
    sources.push({
      id: `${track.id}:embed:bilibili`,
      providerId: 'bilibili',
      providerName: 'Bilibili 官方播放器 (中国大陆直连备用)',
      mediaType: 'music',
      regionAvailability: 'global',
      playbackType: 'official_embed',
      officialUrl: backup.officialUrl,
      embedUrl: `https://player.bilibili.com/player.html?bvid=${backup.bvid}&page=1&autoplay=0&danmaku=0`,
      copyrightStatus: 'official_embed_licensed',
      copyrightLabel: backup.titleHint,
      availabilityStatus: 'available',
    });
  }

  if (sources.length === 0) {
    const fallbackProvider = inferProviderIdFromUrl(sourceUrl);
    sources.push({
      id: `${track.id || 'track'}:redirect`,
      providerId: fallbackProvider,
      providerName: providerDisplayName(fallbackProvider, track?.source),
      mediaType: 'music',
      regionAvailability: regionForProvider(fallbackProvider),
      playbackType: 'external_redirect',
      officialUrl: sourceUrl || 'https://earthone.app',
      copyrightStatus: 'external_rights_vary',
      copyrightLabel: track?.license || '原平台播放',
      availabilityStatus: 'requires_redirect',
    });
  }

  return sources;
}

export function enrichMusicTrack(track: any, region: ResolvedRegion = 'overseas'): any {
  const rawSources = buildSourcesForMusicTrack(track);
  const sortedSources = sortSourcesForRegion(rawSources, region);
  const primary = sortedSources[0];

  const mappedSources = sortedSources.map((s) => ({
    id: s.id,
    label: s.providerName,
    url: s.officialUrl,
    kind: s.directAudioUrl ? 'audio' : s.embedUrl ? 'embed' : 'none',
    audioUrl: s.directAudioUrl,
    embedUrl: s.embedUrl,
    provider: s.providerId,
    license: s.copyrightLabel || track.license,
    playable: s.availabilityStatus !== 'unavailable' && s.playbackType !== 'external_redirect',
    regionAvailability: s.regionAvailability,
    playbackType: s.playbackType,
    copyrightStatus: s.copyrightStatus,
    availabilityStatus: s.availabilityStatus,
  }));

  return {
    ...track,
    playable: primary?.directAudioUrl ? 'audio' : primary?.embedUrl ? 'embed' : track.playable,
    audioUrl: primary?.directAudioUrl || track.audioUrl,
    embedUrl: primary?.embedUrl || track.embedUrl,
    providerId: primary?.providerId || inferProviderIdFromUrl(track.sourceUrl || track.audioUrl || track.embedUrl),
    providerName: primary?.providerName || track.source || 'ONE Media',
    mediaType: 'music',
    regionAvailability: primary?.regionAvailability || 'global',
    playbackType: primary?.playbackType || 'legal_direct_audio',
    officialUrl: primary?.officialUrl || track.sourceUrl || '',
    directAudioUrl: primary?.directAudioUrl,
    copyrightStatus: primary?.copyrightStatus || 'creative_commons',
    availabilityStatus: (primary?.availabilityStatus || 'available') as MediaAvailabilityStatus,
    mediaSources: sortedSources,
    sources: mappedSources,
  };
}

const LIVE_OPEN_VIDEO_REPLACEMENTS: Record<string, { directVideoUrl: string; providerName: string; officialUrl: string; copyrightLabel: string }> = {
  vid_1: {
    directVideoUrl: 'https://archive.org/download/MSFC-0601215/0601215.mp4',
    providerName: 'Internet Archive / NASA (公版 MP4 直链)',
    officialUrl: 'https://archive.org/details/MSFC-0601215',
    copyrightLabel: 'NASA Public Domain (video/mp4)',
  },
  vid_2: {
    directVideoUrl: 'https://archive.org/download/BigBuckBunny_124/Content%2Fbig_buck_bunny_720p_surround.mp4',
    providerName: 'Internet Archive / Blender CC BY 3.0 (MP4 直链)',
    officialUrl: 'https://archive.org/details/BigBuckBunny_124',
    copyrightLabel: 'CC BY 3.0 (Blender Foundation)',
  },
};

export function buildSourcesForVideo(video: any): MediaSourceDescriptor[] {
  if (Array.isArray(video?.mediaSources) && video.mediaSources.length > 0) {
    return video.mediaSources as MediaSourceDescriptor[];
  }

  const sources: MediaSourceDescriptor[] = [];
  const rawVideoUrl = String(video?.videoUrl || '').trim();
  const rawEmbedUrl = String(video?.embedUrl || '').trim();
  const rawSourceUrl = String(video?.sourceUrl || rawEmbedUrl || rawVideoUrl || '').trim();

  if (rawVideoUrl) {
    const resolved = resolveMediaCdnUrl(rawVideoUrl);
    const isDeadGoogleSample = resolved.includes('commondatastorage.googleapis.com/gtv-videos-bucket/sample/');
    const replacement = isDeadGoogleSample ? LIVE_OPEN_VIDEO_REPLACEMENTS[String(video?.id || '')] : undefined;
    const effectiveDirectUrl = replacement ? replacement.directVideoUrl : resolved;
    const providerId = replacement ? 'internet-archive' : inferProviderIdFromUrl(effectiveDirectUrl);
    const isOneNative = providerId === 'one-native';

    sources.push({
      id: `${video.id}:video:${providerId}`,
      providerId,
      providerName: replacement
        ? replacement.providerName
        : isOneNative
          ? 'ONE 自有高清视频'
          : providerDisplayName(providerId, video.source),
      mediaType: 'video',
      regionAvailability: isOneNative ? 'global' : isDeadGoogleSample && !replacement ? 'overseas' : regionForProvider(providerId),
      playbackType: isOneNative ? 'one_owned_media' : 'legal_direct_video',
      officialUrl: replacement ? replacement.officialUrl : (rawSourceUrl || effectiveDirectUrl),
      directVideoUrl: effectiveDirectUrl,
      copyrightStatus: replacement ? 'public_domain' : isOneNative ? 'one_owned' : 'creative_commons',
      copyrightLabel: replacement ? replacement.copyrightLabel : isOneNative ? 'ONE 创作者直传' : '开放演示授权',
      availabilityStatus: isDeadGoogleSample && !replacement ? 'unavailable' : 'available',
    });
  }

  if (rawEmbedUrl) {
    const providerId = inferProviderIdFromUrl(rawEmbedUrl || rawSourceUrl);
    sources.push({
      id: `${video.id}:embed:${providerId}`,
      providerId,
      providerName: providerDisplayName(providerId, video.source),
      mediaType: 'video',
      regionAvailability: regionForProvider(providerId),
      playbackType: 'official_embed',
      officialUrl: rawSourceUrl || rawEmbedUrl,
      embedUrl: rawEmbedUrl,
      copyrightStatus: 'official_embed_licensed',
      copyrightLabel: `${providerDisplayName(providerId)} 合规嵌入`,
      availabilityStatus: 'available',
    });
  }

  const backup = SEED_VIDEO_BILIBILI_BACKUPS[String(video?.id || '')];
  if (backup && !sources.some((s) => s.providerId === 'bilibili')) {
    sources.push({
      id: `${video.id}:embed:bilibili`,
      providerId: 'bilibili',
      providerName: 'Bilibili 官方播放器 (中国大陆备用源)',
      mediaType: 'video',
      regionAvailability: 'global',
      playbackType: 'official_embed',
      officialUrl: backup.officialUrl,
      embedUrl: `https://player.bilibili.com/player.html?bvid=${backup.bvid}&page=1&autoplay=0&danmaku=0`,
      copyrightStatus: 'official_embed_licensed',
      copyrightLabel: backup.titleHint,
      availabilityStatus: 'available',
    });
  }

  return sources;
}

export function enrichVideoItem(video: any, region: ResolvedRegion = 'overseas'): any {
  const rawSources = buildSourcesForVideo(video);
  const sorted = sortSourcesForRegion(rawSources, region);
  const primary = sorted[0];

  return {
    ...video,
    videoUrl: primary?.directVideoUrl || video.videoUrl || '',
    embedUrl: primary?.embedUrl || video.embedUrl || '',
    sourceUrl: primary?.officialUrl || video.sourceUrl || '',
    providerId: primary?.providerId || 'external-direct',
    providerName: primary?.providerName || video.source || 'ONE Video',
    mediaType: 'video',
    regionAvailability: primary?.regionAvailability || 'global',
    playbackType: primary?.playbackType || 'legal_direct_video',
    officialUrl: primary?.officialUrl || video.sourceUrl || '',
    copyrightStatus: primary?.copyrightStatus || 'creative_commons',
    availabilityStatus: primary?.availabilityStatus || 'available',
    mediaSources: sorted,
  };
}

export function getCombinedEnrichedVideos(storeVideos: any[], region: ResolvedRegion = 'overseas'): any[] {
  const seen = new Set<string>();
  const combined: any[] = [];
  const rawList = region === 'cn' ? [...CURATED_CN_VIDEOS, ...storeVideos] : [...storeVideos, ...CURATED_CN_VIDEOS];
  for (const v of rawList) {
    if (!v || !v.id || seen.has(v.id)) continue;
    seen.add(v.id);
    combined.push(enrichVideoItem(v, region));
  }
  return combined;
}
