import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  type MusicTrack,
  type PlaybackError,
  type PlaybackMode,
  type PlayerState,
  type QueueItem,
  type RepeatMode,
  type UnifiedTrack,
  getActiveTrack,
  normalizeToUnifiedTrack,
  toQueueItems,
} from '../types/music.ts';
import { createInitialState, playerReducer, toPersistedState } from './playerReducer.ts';
import { loadPersistedPlayerState, savePersistedPlayerState } from './persistence.ts';
import { getGlobalAudioEngine } from './playback/audioEngine.ts';
import { getEmbedSrc } from './playback/embedAdapter.ts';

export interface MusicPlayerApi {
  state: PlayerState;
  currentTrack: UnifiedTrack | null;
  // actions
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  playTrack: (track: MusicTrack | UnifiedTrack, queue?: Array<MusicTrack | UnifiedTrack>, index?: number) => void;
  playNext: () => void;
  playPrevious: () => void;
  seek: (sec: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  addToQueue: (tracks: Array<MusicTrack | UnifiedTrack>, position?: 'next' | 'end') => void;
  removeFromQueue: (queueId: string) => void;
  clearQueue: () => void;
  reorderQueue: (from: number, to: number) => void;
  toggleShuffle: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
  switchSource: (sourceId: string) => void;
  restorePlayerState: () => void;
  setError: (error: PlaybackError | null) => void;
  getAudioAnalyser: () => AnalyserNode | null;
  resumeAudioContext: () => Promise<void>;
}

const PlayerContext = createContext<MusicPlayerApi | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(playerReducer, undefined, createInitialState);
  const engine = useMemo(() => getGlobalAudioEngine(), []);
  const lastTrackIdRef = useRef<string | undefined>(undefined);
  const lastKindRef = useRef<string | undefined>(undefined);
  const lastAudioSrcRef = useRef<string | undefined>(undefined);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredOnceRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const wantPlayRef = useRef(false);

  // restore once on mount (no autoplay)
  useEffect(() => {
    if (restoredOnceRef.current) return;
    restoredOnceRef.current = true;
    const snap = loadPersistedPlayerState();
    if (snap) dispatch({ type: 'RESTORE', snapshot: snap });
    else dispatch({ type: 'RESTORE', snapshot: { version: 1, queue: [], currentIndex: -1, positionSec: 0, volume: state.volume, muted: state.muted, mode: state.mode, savedAt: Date.now() } as any });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // wire engine events -> state
  useEffect(() => {
    const offTime = engine.on('time', (current, duration) => {
      dispatch({ type: 'SET_POSITION', positionSec: current });
      if (Number.isFinite(duration) && duration > 0) dispatch({ type: 'SET_DURATION', durationSec: duration });
    });
    const offDur = engine.on('duration', (d) => { if (Number.isFinite(d) && d > 0) dispatch({ type: 'SET_DURATION', durationSec: d }); });
    const offEnded = engine.on('ended', () => {
      // let reducer decide next based on repeat/shuffle
      dispatch({ type: 'NEXT' });
    });
    const offErr = engine.on('error', (msg) => {
      dispatch({ type: 'SET_ERROR', error: { code: 'play_failed', message: msg, at: Date.now() } });
    });
    const offPlay = engine.on('play', () => {
      // sync if engine started externally
      // avoid loops: only if state says not playing
    });
    const offPause = engine.on('pause', () => {});
    return () => { offTime(); offDur(); offEnded(); offErr(); offPlay(); offPause(); };
  }, [engine]);

  const currentTrack = getActiveTrack(state);

  // sync engine with state (single effect = single source of truth driver)
  useEffect(() => {
    const track = currentTrack;
    const trackId = track?.id;
    const kind = track?.playback.kind;
    const audioSrc = kind === 'audio' ? track?.playback.audioUrl : undefined;

    // volume/mute always applied
    engine.setVolume(state.volume, state.muted);

    if (!track) {
      void engine.load(undefined);
      engine.pause();
      lastTrackIdRef.current = undefined;
      lastKindRef.current = undefined;
      lastAudioSrcRef.current = undefined;
      return;
    }

    if (kind === 'embed' || kind === 'none') {
      // stop audio element for embeds/unavailable, iframe is handled by UI
      if (lastKindRef.current === 'audio') {
        engine.pause();
      }
      if (audioSrc === undefined) {
        void engine.load(undefined);
        lastAudioSrcRef.current = undefined;
      }
      lastTrackIdRef.current = trackId;
      lastKindRef.current = kind;
      return;
    }

    // audio
    const trackChanged = lastTrackIdRef.current !== trackId;
    const srcChanged = lastAudioSrcRef.current !== audioSrc;
    if (srcChanged) {
      void engine.load(audioSrc);
      lastAudioSrcRef.current = audioSrc;
    }
    // if restored and position > 0, seek once after track is ready-ish; we attempt on change
    if (trackChanged && state.positionSec > 0 && state.restored) {
      pendingSeekRef.current = state.positionSec;
    }
    if (trackChanged && !state.restored) {
      pendingSeekRef.current = 0;
    }

    if (state.isPlaying && audioSrc) {
      if (pendingSeekRef.current != null) {
        // best-effort seek before/around play
        engine.seek(pendingSeekRef.current);
        pendingSeekRef.current = null;
      }
      void engine.play().then(ok => {
        if (!ok && state.isPlaying) {
          dispatch({ type: 'SET_ERROR', error: { code: 'play_failed', message: 'Playback could not start (autoplay blocked or load failed)', at: Date.now(), trackId } });
        }
      });
    } else {
      engine.pause();
    }

    lastTrackIdRef.current = trackId;
    lastKindRef.current = kind;
  }, [engine, currentTrack, state.isPlaying, state.volume, state.muted, state.currentIndex, state.restored]);

  // persist (debounced) - never persist isPlaying as true intent to autoplay except not needed; we persist position/mode/queue
  useEffect(() => {
    if (!state.restored) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try { savePersistedPlayerState(toPersistedState(state)); } catch {}
    }, 400);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state]);

  const play = useCallback(() => dispatch({ type: 'PLAY' }), []);
  const pause = useCallback(() => dispatch({ type: 'PAUSE' }), []);
  const togglePlay = useCallback(() => dispatch({ type: 'TOGGLE_PLAY' }), []);
  const playTrack = useCallback((track: MusicTrack | UnifiedTrack, queue?: Array<MusicTrack | UnifiedTrack>, index?: number) => {
    const t = normalizeToUnifiedTrack(track as any);
    const q = queue ? toQueueItems(queue as any[]) : undefined;
    dispatch({ type: 'PLAY_TRACK', track: t, queue: q, index, play: true });
  }, []);
  const playNext = useCallback(() => dispatch({ type: 'NEXT' }), []);
  const playPrevious = useCallback(() => dispatch({ type: 'PREVIOUS' }), []);
  const seek = useCallback((sec: number) => {
    const t = getActiveTrack({ ...state } as any);
    if (t && t.playback.kind === 'audio') {
      engine.seek(sec);
    }
    dispatch({ type: 'SET_POSITION', positionSec: sec });
  }, [engine, state]);
  const setVolume = useCallback((v: number) => dispatch({ type: 'SET_VOLUME', volume: v }), []);
  const toggleMute = useCallback(() => dispatch({ type: 'TOGGLE_MUTE' }), []);
  const addToQueue = useCallback((tracks: Array<MusicTrack | UnifiedTrack>, position?: 'next' | 'end') => {
    dispatch({ type: 'ADD_TO_QUEUE', items: toQueueItems(tracks as any[]), position });
  }, []);
  const removeFromQueue = useCallback((queueId: string) => dispatch({ type: 'REMOVE_FROM_QUEUE', queueId }), []);
  const clearQueue = useCallback(() => dispatch({ type: 'CLEAR_QUEUE' }), []);
  const reorderQueue = useCallback((from: number, to: number) => dispatch({ type: 'REORDER_QUEUE', from, to }), []);
  const toggleShuffle = useCallback(() => dispatch({ type: 'TOGGLE_SHUFFLE' }), []);
  const setRepeatMode = useCallback((mode: RepeatMode) => dispatch({ type: 'SET_REPEAT', repeat: mode }), []);
  const switchSource = useCallback((sourceId: string) => dispatch({ type: 'SWITCH_SOURCE', sourceId }), []);
  const restorePlayerState = useCallback(() => {
    const snap = loadPersistedPlayerState();
    if (snap) dispatch({ type: 'RESTORE', snapshot: snap });
  }, []);
  const setError = useCallback((error: PlaybackError | null) => dispatch({ type: 'SET_ERROR', error }), []);
  const getAudioAnalyser = useCallback(() => engine.getAnalyser(), [engine]);
  const resumeAudioContext = useCallback(() => engine.resumeContext(), [engine]);

  const api = useMemo<MusicPlayerApi>(() => ({
    state,
    currentTrack,
    play, pause, togglePlay, playTrack, playNext, playPrevious, seek, setVolume, toggleMute,
    addToQueue, removeFromQueue, clearQueue, reorderQueue, toggleShuffle, setRepeatMode, switchSource, restorePlayerState,
    setError, getAudioAnalyser, resumeAudioContext,
  }), [state, currentTrack, play, pause, togglePlay, playTrack, playNext, playPrevious, seek, setVolume, toggleMute, addToQueue, removeFromQueue, clearQueue, reorderQueue, toggleShuffle, setRepeatMode, switchSource, restorePlayerState, setError, getAudioAnalyser, resumeAudioContext]);

  return <PlayerContext.Provider value={api}>{children}</PlayerContext.Provider>;
}

export function usePlayerContext(): MusicPlayerApi {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('useMusicPlayer must be used within PlayerProvider');
  return ctx;
}

export function isTrackEmbeddable(track: UnifiedTrack | null | undefined): boolean {
  return !!getEmbedSrc(track);
}
