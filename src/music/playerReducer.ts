import {
  DEFAULT_VOLUME,
  type PersistedPlayerState,
  type PlaybackError,
  type PlaybackMode,
  type PlayerState,
  type QueueItem,
  type RepeatMode,
  type UnifiedTrack,
  getActiveTrack,
  toQueueItems,
} from '../types/music.ts';

export type PlayerAction =
  | { type: 'PLAY_TRACK'; track: UnifiedTrack; queue?: Array<UnifiedTrack | QueueItem>; index?: number; sourceId?: string; play?: boolean }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'SET_POSITION'; positionSec: number }
  | { type: 'SET_DURATION'; durationSec: number }
  | { type: 'SET_VOLUME'; volume: number }
  | { type: 'TOGGLE_MUTE' }
  | { type: 'SET_MODE'; mode: Partial<PlaybackMode> }
  | { type: 'TOGGLE_SHUFFLE' }
  | { type: 'SET_REPEAT'; repeat: RepeatMode }
  | { type: 'NEXT' }
  | { type: 'PREVIOUS' }
  | { type: 'ADD_TO_QUEUE'; items: QueueItem[]; position?: 'next' | 'end' }
  | { type: 'REMOVE_FROM_QUEUE'; queueId: string }
  | { type: 'CLEAR_QUEUE' }
  | { type: 'REORDER_QUEUE'; from: number; to: number }
  | { type: 'SET_ERROR'; error: PlaybackError | null }
  | { type: 'SWITCH_SOURCE'; sourceId: string }
  | { type: 'RESTORE'; snapshot: PersistedPlayerState }
  | { type: 'SYNC_QUEUE'; queue: QueueItem[]; index?: number; keepTrackId?: string };

export function createInitialState(): PlayerState {
  return {
    queue: [],
    currentIndex: -1,
    isPlaying: false,
    positionSec: 0,
    durationSec: 0,
    volume: DEFAULT_VOLUME,
    muted: false,
    mode: { shuffle: false, repeat: 'off' },
    activeSourceId: undefined,
    error: null,
    shuffleOrder: [],
    shuffleCursor: -1,
    restored: false,
  };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function isQueueItem(v: UnifiedTrack | QueueItem): v is QueueItem {
  return !!v && typeof (v as QueueItem).queueId === 'string' && !!(v as QueueItem).track;
}

function ensureQueueItems(items: Array<UnifiedTrack | QueueItem>): QueueItem[] {
  const raw = items.map((it, i) => (isQueueItem(it) ? it : toQueueItems([it], Date.now() + i)[0]));
  // ensure stable unique queueIds
  const seen = new Set<string>();
  return raw.map((it, i) => {
    let qid = it.queueId || `${it.track.id}::${i}`;
    if (seen.has(qid)) qid = `${qid}::${i}`;
    seen.add(qid);
    return { ...it, queueId: qid };
  });
}

function buildShuffleOrder(queue: QueueItem[], currentQueueId?: string): string[] {
  const ids = queue.map(q => q.queueId);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  if (currentQueueId) {
    const idx = ids.indexOf(currentQueueId);
    if (idx > 0) {
      ids.splice(idx, 1);
      ids.unshift(currentQueueId);
    }
  }
  return ids;
}

function indexOfQueueId(queue: QueueItem[], queueId?: string): number {
  if (!queueId) return -1;
  return queue.findIndex(q => q.queueId === queueId);
}

function getCurrentQueueId(state: PlayerState): string | undefined {
  return state.queue[state.currentIndex]?.queueId;
}

function resolveActiveSourceId(track: UnifiedTrack | null | undefined, requested?: string): string | undefined {
  if (!track) return undefined;
  if (requested && track.sources.some(s => s.id === requested)) return requested;
  const pb = track.playback;
  const match = track.sources.find(s => s.kind === pb.kind && (s.audioUrl === pb.audioUrl || s.embedUrl === pb.embedUrl));
  if (match) return match.id;
  return track.sources.find(s => s.kind === 'audio')?.id || track.sources.find(s => s.kind === 'embed')?.id || track.sources[0]?.id;
}

function applySource(track: UnifiedTrack, sourceId?: string): UnifiedTrack {
  if (!sourceId) return track;
  const src = track.sources.find(s => s.id === sourceId);
  if (!src) return track;
  return {
    ...track,
    playback: {
      kind: src.kind,
      audioUrl: src.audioUrl,
      embedUrl: src.embedUrl,
      provider: src.provider,
      sourceLabel: src.label,
      sourceUrl: src.url || track.sourceUrl,
    },
    availability: src.kind === 'audio' ? 'playable' : src.kind === 'embed' ? 'embed-only' : 'unavailable',
    source: src.label || track.source,
    sourceUrl: src.url || track.sourceUrl,
  };
}

function withUpdatedCurrentTrack(state: PlayerState, track: UnifiedTrack): PlayerState {
  if (state.currentIndex < 0 || state.currentIndex >= state.queue.length) return state;
  const queue = state.queue.slice();
  queue[state.currentIndex] = { ...queue[state.currentIndex], track };
  return { ...state, queue };
}

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'PLAY_TRACK': {
      let queue = action.queue ? ensureQueueItems(action.queue) : state.queue;
      if (queue.length === 0) queue = ensureQueueItems([action.track]);
      let index = typeof action.index === 'number' ? action.index : queue.findIndex(q => q.track.id === action.track.id);
      if (index < 0 || index >= queue.length) {
        queue = ensureQueueItems([action.track, ...queue.filter(q => q.track.id !== action.track.id)]);
        index = 0;
      }
      const sourceId = resolveActiveSourceId(queue[index].track, action.sourceId);
      const track = applySource(queue[index].track, sourceId);
      queue = queue.slice();
      queue[index] = { ...queue[index], track };
      const queueId = queue[index].queueId;
      const shuffleOrder = state.mode.shuffle ? buildShuffleOrder(queue, queueId) : [];
      const shuffleCursor = state.mode.shuffle ? shuffleOrder.indexOf(queueId) : -1;
      const playable = track.playback.kind !== 'none';
      return {
        ...state,
        queue,
        currentIndex: index,
        isPlaying: action.play !== false && playable,
        positionSec: 0,
        durationSec: track.durationSeconds || 0,
        activeSourceId: sourceId,
        error: playable ? null : { code: 'unavailable', message: 'Track is not playable', at: Date.now(), trackId: track.id },
        shuffleOrder,
        shuffleCursor,
      };
    }
    case 'PLAY': {
      const t = getActiveTrack(state);
      if (!t || t.playback.kind === 'none') {
        return { ...state, isPlaying: false, error: { code: 'unavailable', message: 'No playable track', at: Date.now(), trackId: t?.id } };
      }
      return { ...state, isPlaying: true, error: null };
    }
    case 'PAUSE':
      return { ...state, isPlaying: false };
    case 'TOGGLE_PLAY':
      return playerReducer(state, { type: state.isPlaying ? 'PAUSE' : 'PLAY' });
    case 'SET_POSITION':
      return { ...state, positionSec: Math.max(0, Number(action.positionSec) || 0) };
    case 'SET_DURATION':
      return { ...state, durationSec: Math.max(0, Number(action.durationSec) || 0) };
    case 'SET_VOLUME':
      return { ...state, volume: clamp(Number(action.volume), 0, 1), muted: clamp(Number(action.volume), 0, 1) === 0 ? state.muted : false };
    case 'TOGGLE_MUTE':
      return { ...state, muted: !state.muted };
    case 'SET_MODE': {
      const mode = { ...state.mode, ...action.mode };
      const currentQueueId = getCurrentQueueId(state);
      const shuffleOrder = mode.shuffle ? (state.shuffleOrder.length ? state.shuffleOrder : buildShuffleOrder(state.queue, currentQueueId)) : [];
      const shuffleCursor = mode.shuffle ? Math.max(0, indexOfQueueIdFromOrder(shuffleOrder, currentQueueId)) : -1;
      return { ...state, mode, shuffleOrder, shuffleCursor };
    }
    case 'TOGGLE_SHUFFLE':
      return playerReducer(state, { type: 'SET_MODE', mode: { shuffle: !state.mode.shuffle } });
    case 'SET_REPEAT':
      return playerReducer(state, { type: 'SET_MODE', mode: { repeat: action.repeat } });
    case 'NEXT': {
      const nextIndex = computeNextIndex(state);
      if (nextIndex < 0) return { ...state, isPlaying: false, positionSec: 0 };
      const track = applySource(state.queue[nextIndex].track, resolveActiveSourceId(state.queue[nextIndex].track, state.activeSourceId));
      const queue = state.queue.slice();
      queue[nextIndex] = { ...queue[nextIndex], track };
      const playable = track.playback.kind !== 'none';
      return {
        ...state,
        queue,
        currentIndex: nextIndex,
        isPlaying: playable,
        positionSec: 0,
        durationSec: track.durationSeconds || 0,
        error: playable ? null : { code: 'unavailable', message: 'Track is not playable', at: Date.now(), trackId: track.id },
        shuffleCursor: state.mode.shuffle ? indexOfQueueIdFromOrder(state.shuffleOrder, queue[nextIndex].queueId) : -1,
      };
    }
    case 'PREVIOUS': {
      if (state.positionSec > 3) return { ...state, positionSec: 0 };
      const prevIndex = computePreviousIndex(state);
      if (prevIndex < 0) return { ...state, positionSec: 0 };
      const track = applySource(state.queue[prevIndex].track, resolveActiveSourceId(state.queue[prevIndex].track, state.activeSourceId));
      const queue = state.queue.slice();
      queue[prevIndex] = { ...queue[prevIndex], track };
      const playable = track.playback.kind !== 'none';
      return {
        ...state,
        queue,
        currentIndex: prevIndex,
        isPlaying: playable,
        positionSec: 0,
        durationSec: track.durationSeconds || 0,
        error: playable ? null : { code: 'unavailable', message: 'Track is not playable', at: Date.now(), trackId: track.id },
        shuffleCursor: state.mode.shuffle ? indexOfQueueIdFromOrder(state.shuffleOrder, queue[prevIndex].queueId) : -1,
      };
    }
    case 'ADD_TO_QUEUE': {
      const items = ensureQueueItems(action.items);
      if (items.length === 0) return state;
      let queue = state.queue.slice();
      if (action.position === 'next' && state.currentIndex >= 0) {
        queue.splice(state.currentIndex + 1, 0, ...items);
      } else {
        queue = queue.concat(items);
      }
      let currentIndex = state.currentIndex;
      if (currentIndex < 0 && queue.length > 0) currentIndex = 0;
      const currentQueueId = queue[currentIndex]?.queueId;
      const shuffleOrder = state.mode.shuffle ? rebuildShuffleWithNew(queue, state.shuffleOrder, currentQueueId) : [];
      const shuffleCursor = state.mode.shuffle ? indexOfQueueIdFromOrder(shuffleOrder, currentQueueId) : -1;
      return { ...state, queue, currentIndex, shuffleOrder, shuffleCursor };
    }
    case 'REMOVE_FROM_QUEUE': {
      const removeIdx = indexOfQueueId(state.queue, action.queueId);
      if (removeIdx < 0) return state;
      const queue = state.queue.filter(q => q.queueId !== action.queueId);
      let currentIndex = state.currentIndex;
      let isPlaying = state.isPlaying;
      let positionSec = state.positionSec;
      if (queue.length === 0) {
        return { ...createInitialState(), volume: state.volume, muted: state.muted, mode: state.mode, restored: state.restored };
      }
      if (removeIdx < currentIndex) currentIndex -= 1;
      else if (removeIdx === currentIndex) {
        currentIndex = Math.min(removeIdx, queue.length - 1);
        positionSec = 0;
        isPlaying = isPlaying && queue[currentIndex].track.playback.kind !== 'none';
      }
      const currentQueueId = queue[currentIndex]?.queueId;
      const shuffleOrder = state.mode.shuffle ? state.shuffleOrder.filter(id => id !== action.queueId) : [];
      const shuffleCursor = state.mode.shuffle ? indexOfQueueIdFromOrder(shuffleOrder, currentQueueId) : -1;
      return { ...state, queue, currentIndex, isPlaying, positionSec, shuffleOrder, shuffleCursor };
    }
    case 'CLEAR_QUEUE':
      return { ...createInitialState(), volume: state.volume, muted: state.muted, mode: state.mode, restored: state.restored };
    case 'REORDER_QUEUE': {
      const { from, to } = action;
      if (from === to || from < 0 || to < 0 || from >= state.queue.length || to >= state.queue.length) return state;
      const queue = state.queue.slice();
      const [item] = queue.splice(from, 1);
      queue.splice(to, 0, item);
      let currentIndex = state.currentIndex;
      if (from === currentIndex) currentIndex = to;
      else if (from < currentIndex && to >= currentIndex) currentIndex -= 1;
      else if (from > currentIndex && to <= currentIndex) currentIndex += 1;
      const currentQueueId = queue[currentIndex]?.queueId;
      const shuffleCursor = state.mode.shuffle ? indexOfQueueIdFromOrder(state.shuffleOrder, currentQueueId) : -1;
      return { ...state, queue, currentIndex, shuffleCursor };
    }
    case 'SET_ERROR':
      return { ...state, error: action.error, isPlaying: action.error ? false : state.isPlaying };
    case 'SWITCH_SOURCE': {
      const current = getActiveTrack(state);
      if (!current) return state;
      const track = applySource(current, action.sourceId);
      const sourceId = resolveActiveSourceId(track, action.sourceId);
      return { ...withUpdatedCurrentTrack(state, track), activeSourceId: sourceId, error: track.playback.kind === 'none' ? { code: 'unavailable', message: 'Selected source unavailable', at: Date.now(), trackId: track.id } : null };
    }
    case 'RESTORE': {
      try {
        const snap = action.snapshot;
        if (!snap || snap.version !== 1 || !Array.isArray(snap.queue)) return { ...state, restored: true };
        const queue = ensureQueueItems(snap.queue);
        if (queue.length === 0) return { ...state, restored: true };
        let currentIndex = Number.isInteger(snap.currentIndex) ? snap.currentIndex : 0;
        if (currentIndex < 0 || currentIndex >= queue.length) currentIndex = 0;
        const mode: PlaybackMode = {
          shuffle: !!snap.mode?.shuffle,
          repeat: snap.mode?.repeat === 'one' || snap.mode?.repeat === 'all' ? snap.mode.repeat : 'off',
        };
        const currentQueueId = queue[currentIndex]?.queueId;
        const shuffleOrder = mode.shuffle ? buildShuffleOrder(queue, currentQueueId) : [];
        const shuffleCursor = mode.shuffle ? indexOfQueueIdFromOrder(shuffleOrder, currentQueueId) : -1;
        return {
          ...state,
          queue,
          currentIndex,
          isPlaying: false, // never auto-play on restore
          positionSec: Math.max(0, Number(snap.positionSec) || 0),
          durationSec: queue[currentIndex]?.track.durationSeconds || 0,
          volume: clamp(Number(snap.volume ?? DEFAULT_VOLUME), 0, 1),
          muted: !!snap.muted,
          mode,
          activeSourceId: snap.activeSourceId,
          error: null,
          shuffleOrder,
          shuffleCursor,
          restored: true,
        };
      } catch {
        return { ...state, restored: true };
      }
    }
    case 'SYNC_QUEUE': {
      const queue = ensureQueueItems(action.queue);
      if (queue.length === 0) return state;
      let currentIndex = state.currentIndex;
      if (action.keepTrackId) {
        const idx = queue.findIndex(q => q.track.id === action.keepTrackId);
        if (idx >= 0) currentIndex = idx;
      }
      if (typeof action.index === 'number') currentIndex = action.index;
      if (currentIndex < 0 || currentIndex >= queue.length) currentIndex = 0;
      return { ...state, queue, currentIndex };
    }
    default:
      return state;
  }
}

function computeNextIndex(state: PlayerState): number {
  const { queue, currentIndex, mode } = state;
  if (queue.length === 0 || currentIndex < 0) return -1;
  if (mode.repeat === 'one') return currentIndex;
  if (mode.shuffle) {
    const order = state.shuffleOrder.length ? state.shuffleOrder : buildShuffleOrder(queue, getCurrentQueueId(state));
    const cursor = indexOfQueueIdFromOrder(order, getCurrentQueueId(state));
    const nextCursor = cursor + 1;
    if (nextCursor < order.length) return indexOfQueueId(queue, order[nextCursor]);
    if (mode.repeat === 'all' && order.length > 0) return indexOfQueueId(queue, order[0]);
    return -1;
  }
  const next = currentIndex + 1;
  if (next < queue.length) return next;
  if (mode.repeat === 'all') return 0;
  return -1;
}

function computePreviousIndex(state: PlayerState): number {
  const { queue, currentIndex, mode } = state;
  if (queue.length === 0 || currentIndex < 0) return -1;
  if (mode.shuffle) {
    const order = state.shuffleOrder.length ? state.shuffleOrder : buildShuffleOrder(queue, getCurrentQueueId(state));
    const cursor = indexOfQueueIdFromOrder(order, getCurrentQueueId(state));
    const prevCursor = cursor - 1;
    if (prevCursor >= 0) return indexOfQueueId(queue, order[prevCursor]);
    if (mode.repeat === 'all' && order.length > 0) return indexOfQueueId(queue, order[order.length - 1]);
    return currentIndex;
  }
  const prev = currentIndex - 1;
  if (prev >= 0) return prev;
  if (mode.repeat === 'all') return queue.length - 1;
  return currentIndex;
}

function indexOfQueueIdFromOrder(order: string[], queueId?: string): number {
  if (!queueId) return -1;
  return order.indexOf(queueId);
}

function rebuildShuffleWithNew(queue: QueueItem[], existing: string[], currentQueueId?: string): string[] {
  const set = new Set(existing);
  const next = existing.filter(id => queue.some(q => q.queueId === id));
  const added = queue.map(q => q.queueId).filter(id => !set.has(id));
  // append newly added in random-ish order (stable enough) while keeping current near front
  for (let i = added.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [added[i], added[j]] = [added[j], added[i]];
  }
  const merged = [...next, ...added];
  if (currentQueueId) {
    const idx = merged.indexOf(currentQueueId);
    if (idx > 0) { merged.splice(idx, 1); merged.unshift(currentQueueId); }
  }
  return merged;
}

export function toPersistedState(state: PlayerState): PersistedPlayerState {
  return {
    version: 1,
    queue: state.queue,
    currentIndex: state.currentIndex,
    positionSec: state.positionSec,
    volume: state.volume,
    muted: state.muted,
    mode: state.mode,
    activeSourceId: state.activeSourceId,
    savedAt: Date.now(),
  };
}
