export type PlaybackKind = 'audio' | 'embed' | 'none';

export type RepeatMode = 'off' | 'one' | 'all';

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre?: string;
  durationSeconds?: number;
  audioUrl?: string;
  embedUrl?: string;
  playable?: 'audio' | 'embed' | 'youtube-embed';
  coverUrl?: string;
  source?: string;
  sourceUrl?: string;
  license?: string;
  crawledAt?: string;
  bpm?: number;
  description?: string;
  videoId?: string;
  durationFormatted?: string;
  views?: string;
  [key: string]: unknown;
}

export interface MusicSource {
  id: string;
  label: string;
  url?: string;
  kind: PlaybackKind;
  audioUrl?: string;
  embedUrl?: string;
  provider?: string;
  license?: string;
  playable?: boolean;
  unavailableReason?: string;
}

export interface PlaybackInfo {
  kind: PlaybackKind;
  audioUrl?: string;
  embedUrl?: string;
  provider?: string;
  sourceLabel?: string;
  sourceUrl?: string;
}

export interface UnifiedTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  durationSeconds?: number;
  coverUrl?: string;
  source?: string;
  sourceUrl?: string;
  license?: string;
  crawledAt?: string;
  bpm?: number;
  description?: string;
  playback: PlaybackInfo;
  availability: 'playable' | 'embed-only' | 'unavailable' | 'unknown';
  sources: MusicSource[];
  raw?: MusicTrack;
}

export interface QueueItem {
  track: UnifiedTrack;
  queueId: string;
  addedAt: number;
}

export interface PlaybackError {
  code: 'load_failed' | 'play_failed' | 'unavailable' | 'unknown';
  message: string;
  at: number;
  trackId?: string;
}

export interface PlaybackMode {
  shuffle: boolean;
  repeat: RepeatMode;
}

export interface PlayerState {
  queue: QueueItem[];
  currentIndex: number;
  isPlaying: boolean;
  positionSec: number;
  durationSec: number;
  volume: number;
  muted: boolean;
  mode: PlaybackMode;
  activeSourceId?: string;
  error: PlaybackError | null;
  shuffleOrder: string[];
  shuffleCursor: number;
  restored: boolean;
}

export interface PersistedPlayerState {
  version: 1;
  queue: QueueItem[];
  currentIndex: number;
  positionSec: number;
  volume: number;
  muted: boolean;
  mode: PlaybackMode;
  activeSourceId?: string;
  savedAt: number;
}

export const DEFAULT_VOLUME = 0.85;

export function inferPlaybackKind(track: Partial<MusicTrack> | null | undefined): PlaybackKind {
  if (!track) return 'none';
  const playable = track.playable;
  if (playable === 'embed' || playable === 'youtube-embed' || track.embedUrl) return 'embed';
  if (track.audioUrl) return 'audio';
  return 'none';
}

export function normalizeToUnifiedTrack(input: MusicTrack | UnifiedTrack, indexHint = 0): UnifiedTrack {
  if ((input as UnifiedTrack).playback && Array.isArray((input as UnifiedTrack).sources)) {
    const t = input as UnifiedTrack;
    return {
      ...t,
      title: t.title || 'Unknown Track',
      artist: t.artist || 'Unknown Artist',
      sources: t.sources.length ? t.sources : buildSourcesFromRaw(t.raw || { id: t.id, title: t.title, artist: t.artist, album: t.album || '' } as MusicTrack),
      availability: t.availability || availabilityFromPlayback(t.playback.kind),
      playback: t.playback.kind === 'none' ? fallbackPlayback(t) : t.playback,
    };
  }

  const raw = input as MusicTrack;
  const id = String(raw.id || `track_${indexHint}`);
  const kind = inferPlaybackKind(raw);
  const sources = buildSourcesFromRaw(raw);
  const primary = pickPrimarySource(sources, kind, raw);
  const playback: PlaybackInfo = primary
    ? {
        kind: primary.kind,
        audioUrl: primary.audioUrl,
        embedUrl: primary.embedUrl,
        provider: primary.provider,
        sourceLabel: primary.label,
        sourceUrl: primary.url || raw.sourceUrl,
      }
    : { kind: 'none' };

  return {
    id,
    title: raw.title || 'Unknown Track',
    artist: raw.artist || 'Unknown Artist',
    album: raw.album,
    genre: raw.genre,
    durationSeconds: typeof raw.durationSeconds === 'number' ? raw.durationSeconds : undefined,
    coverUrl: raw.coverUrl,
    source: raw.source,
    sourceUrl: raw.sourceUrl,
    license: raw.license,
    crawledAt: raw.crawledAt,
    bpm: raw.bpm,
    description: raw.description,
    playback,
    availability: availabilityFromPlayback(playback.kind),
    sources,
    raw,
  };
}

function availabilityFromPlayback(kind: PlaybackKind): UnifiedTrack['availability'] {
  if (kind === 'audio') return 'playable';
  if (kind === 'embed') return 'embed-only';
  return 'unavailable';
}

function buildSourcesFromRaw(raw: MusicTrack): MusicSource[] {
  const sources: MusicSource[] = [];
  const baseLabel = raw.source || 'Source';
  if (raw.audioUrl) {
    sources.push({
      id: `${raw.id || 'track'}:audio`,
      label: baseLabel,
      url: raw.sourceUrl,
      kind: 'audio',
      audioUrl: raw.audioUrl,
      provider: guessProvider(raw.sourceUrl || raw.audioUrl || raw.source),
      license: raw.license,
      playable: true,
    });
  }
  if (raw.embedUrl) {
    sources.push({
      id: `${raw.id || 'track'}:embed`,
      label: baseLabel,
      url: raw.sourceUrl || raw.embedUrl,
      kind: 'embed',
      embedUrl: raw.embedUrl,
      provider: guessProvider(raw.sourceUrl || raw.embedUrl || raw.source),
      license: raw.license,
      playable: true,
    });
  }
  if (!sources.length) {
    sources.push({
      id: `${raw.id || 'track'}:none`,
      label: baseLabel,
      url: raw.sourceUrl,
      kind: 'none',
      provider: guessProvider(raw.sourceUrl || raw.source),
      license: raw.license,
      playable: false,
      unavailableReason: 'No playable audio or embed URL',
    });
  }
  return dedupeSources(sources);
}

function dedupeSources(sources: MusicSource[]): MusicSource[] {
  const seen = new Set<string>();
  const out: MusicSource[] = [];
  for (const s of sources) {
    const key = `${s.kind}|${s.audioUrl || ''}|${s.embedUrl || ''}|${s.url || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function pickPrimarySource(sources: MusicSource[], kind: PlaybackKind, raw: MusicTrack): MusicSource | undefined {
  if (kind === 'embed') return sources.find(s => s.kind === 'embed') || sources[0];
  if (kind === 'audio') return sources.find(s => s.kind === 'audio') || sources[0];
  if (raw.embedUrl) return sources.find(s => s.kind === 'embed');
  if (raw.audioUrl) return sources.find(s => s.kind === 'audio');
  return sources[0];
}

function fallbackPlayback(t: UnifiedTrack): PlaybackInfo {
  const s = t.sources.find(x => x.kind === 'audio') || t.sources.find(x => x.kind === 'embed') || t.sources[0];
  if (!s) return { kind: 'none' };
  return { kind: s.kind, audioUrl: s.audioUrl, embedUrl: s.embedUrl, provider: s.provider, sourceLabel: s.label, sourceUrl: s.url };
}

export function guessProvider(input?: string): string | undefined {
  if (!input) return undefined;
  const s = String(input).toLowerCase();
  if (s.includes('bilibili')) return 'bilibili';
  if (s.includes('youtube') || s.includes('youtu.be')) return 'youtube';
  if (s.includes('archive.org')) return 'internet-archive';
  if (s.includes('soundcloud')) return 'soundcloud';
  if (s.includes('mixcloud')) return 'mixcloud';
  if (s.includes('bandcamp')) return 'bandcamp';
  if (s.includes('jamendo')) return 'jamendo';
  if (s.includes('freesound')) return 'freesound';
  return undefined;
}

export function toQueueItems(tracks: Array<MusicTrack | UnifiedTrack>, startAt = Date.now()): QueueItem[] {
  return tracks.map((t, i) => ({
    track: normalizeToUnifiedTrack(t, i),
    queueId: `${normalizeToUnifiedTrack(t, i).id}::${startAt + i}::${Math.random().toString(36).slice(2, 7)}`,
    addedAt: startAt + i,
  }));
}

export function getActiveTrack(state: PlayerState): UnifiedTrack | null {
  if (state.currentIndex < 0 || state.currentIndex >= state.queue.length) return null;
  return state.queue[state.currentIndex]?.track || null;
}

export function canSeekTrack(track: UnifiedTrack | null | undefined): boolean {
  return !!track && track.playback.kind === 'audio';
}
