export type MediaRegionMode = 'auto' | 'cn' | 'overseas';
export type ResolvedRegion = 'cn' | 'overseas';

export type MediaType = 'music' | 'video' | 'both';

export type MediaRegionAvailability = 'cn' | 'overseas' | 'global';

export type MediaPlaybackType =
  | 'official_embed'
  | 'legal_direct_audio'
  | 'legal_direct_video'
  | 'one_owned_media'
  | 'external_redirect';

export type MediaCopyrightStatus =
  | 'one_owned'
  | 'public_domain'
  | 'creative_commons'
  | 'official_embed_licensed'
  | 'external_rights_vary';

export type MediaAvailabilityStatus =
  | 'available'
  | 'degraded'
  | 'unavailable'
  | 'unverified'
  | 'requires_redirect';

export type MediaProviderId =
  | 'one-native'
  | 'bilibili'
  | 'youtube'
  | 'internet-archive'
  | 'fma'
  | 'wikimedia'
  | 'soundcloud'
  | 'mixcloud'
  | 'bandcamp'
  | 'jamendo'
  | 'netease-outchain'
  | 'vimeo'
  | 'dailymotion'
  | 'external-direct';

export interface MediaProviderDefinition {
  providerId: MediaProviderId;
  providerName: string;
  mediaType: MediaType;
  regionAvailability: MediaRegionAvailability;
  playbackType: MediaPlaybackType;
  officialUrl: string;
  embedUrl?: string;
  directAudioUrl?: string;
  copyrightStatus: MediaCopyrightStatus;
  availabilityStatus: MediaAvailabilityStatus;
  supportsSearch: boolean;
  supportsDirectPlay: boolean;
  notes?: string;
}

export interface MediaSourceDescriptor {
  id: string;
  providerId: MediaProviderId;
  providerName: string;
  mediaType: 'music' | 'video';
  regionAvailability: MediaRegionAvailability;
  playbackType: MediaPlaybackType;
  officialUrl: string;
  embedUrl?: string;
  directAudioUrl?: string;
  directVideoUrl?: string;
  copyrightStatus: MediaCopyrightStatus;
  copyrightLabel?: string;
  availabilityStatus: MediaAvailabilityStatus;
  unavailableReason?: string;
  lastCheckedAt?: string;
  priorityCn?: number;
  priorityOverseas?: number;
}

export interface MediaProbeOutcome {
  url: string;
  ok: boolean;
  status: number;
  contentType?: string;
  reason?: string;
  checkedAt: string;
  cached?: boolean;
}
