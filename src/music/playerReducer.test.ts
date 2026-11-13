import { createInitialState, playerReducer, toPersistedState } from './playerReducer.ts';
import { normalizeToUnifiedTrack, toQueueItems } from '../types/music.ts';

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}
function eq(a: any, b: any, msg: string) {
  if (a !== b) throw new Error(`${msg}: expected ${String(b)}, got ${String(a)}`);
}

const t1 = normalizeToUnifiedTrack({ id: 'a', title: 'A', artist: 'X', album: 'Al', audioUrl: 'https://example.com/a.mp3', source: 's', sourceUrl: 'u', license: 'l', crawledAt: 'now' } as any);
const t2 = normalizeToUnifiedTrack({ id: 'b', title: 'B', artist: 'Y', album: 'Al', embedUrl: 'https://youtube.com/embed/x', playable: 'embed', source: 'yt', sourceUrl: 'u2', license: 'l', crawledAt: 'now' } as any);
const t3 = normalizeToUnifiedTrack({ id: 'c', title: 'C', artist: 'Z', album: 'Al', audioUrl: 'https://example.com/c.mp3', source: 's', sourceUrl: 'u3', license: 'l', crawledAt: 'now' } as any);

let s = createInitialState();
s = playerReducer(s, { type: 'PLAY_TRACK', track: t1, queue: [t1, t2, t3] as any, index: 0 });
eq(s.currentIndex, 0, 'play sets index');
eq(s.isPlaying, true, 'audio track plays');
eq(s.queue.length, 3, 'queue length');

s = playerReducer(s, { type: 'PAUSE' }); eq(s.isPlaying, false, 'pause');
s = playerReducer(s, { type: 'PLAY' }); eq(s.isPlaying, true, 'play');
s = playerReducer(s, { type: 'TOGGLE_PLAY' }); eq(s.isPlaying, false, 'toggle');

s = playerReducer(s, { type: 'NEXT' }); eq(s.currentIndex, 1, 'next index');
eq(s.queue[1].track.playback.kind, 'embed', 'embed kind');

s = playerReducer(s, { type: 'PREVIOUS' }); eq(s.currentIndex, 0, 'prev index');
s = playerReducer(s, { type: 'SET_POSITION', positionSec: 10 });
s = playerReducer(s, { type: 'PREVIOUS' }); eq(s.positionSec, 0, 'prev restarts if >3s');

s = playerReducer(s, { type: 'ADD_TO_QUEUE', items: toQueueItems([normalizeToUnifiedTrack({ id: 'd', title: 'D', artist: 'W', album: 'A', audioUrl: 'https://e/d.mp3' } as any)]), position: 'end' });
eq(s.queue.length, 4, 'add to queue');

const removeId = s.queue[2].queueId;
s = playerReducer(s, { type: 'REMOVE_FROM_QUEUE', queueId: removeId }); eq(s.queue.length, 3, 'remove');

s = playerReducer(s, { type: 'REORDER_QUEUE', from: 2, to: 1 }); eq(s.queue.length, 3, 'reorder keeps size');

s = playerReducer(s, { type: 'SET_VOLUME', volume: 0.5 }); eq(s.volume, 0.5, 'volume');
s = playerReducer(s, { type: 'TOGGLE_MUTE' }); eq(s.muted, true, 'mute');

s = playerReducer(s, { type: 'SET_REPEAT', repeat: 'one' }); eq(s.mode.repeat, 'one', 'repeat one');
s = playerReducer(s, { type: 'SET_REPEAT', repeat: 'all' }); eq(s.mode.repeat, 'all', 'repeat all');
s = playerReducer(s, { type: 'TOGGLE_SHUFFLE' }); eq(s.mode.shuffle, true, 'shuffle on');

s = playerReducer(s, { type: 'SET_POSITION', positionSec: 42 });
const snap = toPersistedState(s);
let r = playerReducer(createInitialState(), { type: 'RESTORE', snapshot: snap as any });
eq(r.restored, true, 'restored flag');
eq(r.isPlaying, false, 'no autoplay on restore');
eq(r.positionSec, 42, 'restore position');
eq(r.volume, 0.5, 'restore volume');
eq(r.mode.repeat, 'all', 'restore repeat');

let bad = playerReducer(createInitialState(), { type: 'RESTORE', snapshot: { broken: true } as any });
eq(bad.restored, true, 'bad restore safe');

// unavailable track should not play
const none = normalizeToUnifiedTrack({ id: 'x', title: 'X', artist: 'A', album: 'A' } as any);
let s2 = playerReducer(createInitialState(), { type: 'PLAY_TRACK', track: none, queue: [none] as any });
eq(s2.isPlaying, false, 'unavailable not playing');
assert(s2.error, 'unavailable sets error');

console.log('playerReducer.test: PASS');
