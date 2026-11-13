import type { UnifiedTrack } from '../../types/music.ts';

/**
 * Embed playback (YouTube/Bilibili/SoundCloud/etc.) is delegated to official iframes.
 * We do NOT fake audio element control (seek/volume) for embeds.
 */

export type EmbedCapability = {
  canSeek: false;
  canSetVolume: false;
  canReadProgress: false;
};

export const EMBED_CAPABILITY: EmbedCapability = {
  canSeek: false,
  canSetVolume: false,
  canReadProgress: false,
};

export function isEmbeddableTrack(track: UnifiedTrack | null | undefined): boolean {
  return !!track && track.playback.kind === 'embed' && !!track.playback.embedUrl;
}

export function getEmbedSrc(track: UnifiedTrack | null | undefined): string | undefined {
  if (!track) return undefined;
  return track.playback.embedUrl || track.sources.find(s => s.kind === 'embed' && s.embedUrl)?.embedUrl;
}

export function embedProviderLabel(track: UnifiedTrack | null | undefined): string {
  if (!track) return 'Embed';
  return track.playback.provider || track.playback.sourceLabel || track.source || 'Embed';
}
