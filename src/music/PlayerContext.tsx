import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  type MusicTrack,
  type PlaybackError,
  type PlayerState,
  type RepeatMode,
  type UnifiedTrack,
  getActiveTrack,
  normalizeToUnifiedTrack,
  toQueueItems,
} from '../types/music.ts';
import { createInitialState, playerReducer, toPersistedState } from './playerReducer.ts';
import { clearPersistedPlayerState, loadPersistedPlayerState, savePersistedPlayerState } from './persistence.ts';
import { getGlobalAudioEngine } from './playback/audioEngine.ts';
import { getEmbedSrc } from './playback/embedAdapter.ts';
import {
  findNextMusicFallbackSource,
  getEffectiveMediaRegion,
  markMediaUrlFailed,
  probeClientMediaConnectivity,
  sortClientMusicSources,
} from '../services/media/scheduler.ts';

export interface MusicPlayerApi {
  state: PlayerState;
  currentTrack: UnifiedTrack | null;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  stopPlayback: () => void;
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
  tryFallbackSource: (reason?: string) => boolean;
  clearFallbackNotice: () => void;
  restorePlayerState: () => void;
  setError: (error: PlaybackError | null) => void;
  getAudioAnalyser: () => AnalyserNode | null;
  resumeAudioContext: () => Promise<void>;
  unlockAudio: () => void;
}

const PlayerContext = createContext<MusicPlayerApi | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(playerReducer, undefined, createInitialState);
  const engine = useMemo(() => getGlobalAudioEngine(), []);
  const stateRef = useRef(state);
  stateRef.current = state;

  const lastTrackIdRef = useRef<string | undefined>(undefined);
  const lastKindRef = useRef<string | undefined>(undefined);
  const lastAudioSrcRef = useRef<string | undefined>(undefined);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredOnceRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const attemptFallback = useCallback(
    (reason: string): boolean => {
      const s = stateRef.current;
      const track = getActiveTrack(s);
      if (!track) return false;
      const currentUrl = track.playback.audioUrl || track.playback.embedUrl;
      if (currentUrl) markMediaUrlFailed(currentUrl, reason);
      if (s.activeSourceId) markMediaUrlFailed(s.activeSourceId, reason);

      const nextSrc = findNextMusicFallbackSource(
        track.sources || [],
        s.activeSourceId,
        currentUrl,
        getEffectiveMediaRegion()
      );
      if (nextSrc) {
        dispatch({
          type: 'FALLBACK_SOURCE',
          sourceId: nextSrc.id,
          notice: `当前音源不可用（${reason}），已自动切换至：${nextSrc.label}`,
        });
        return true;
      }
      return false;
    },
    []
  );

  useEffect(() => {
    if (restoredOnceRef.current) return;
    restoredOnceRef.current = true;
    void probeClientMediaConnectivity();
    const snap = loadPersistedPlayerState();
    if (snap && Array.isArray(snap.queue)) {
      const cleanedQueue = snap.queue.filter((item) => {
        const audioUrl = String(item?.track?.playback?.audioUrl || '');
        const title = String(item?.track?.title || '');
        return (
          !audioUrl.includes('soundhelix.com') &&
          !audioUrl.includes('testmp3testfile') &&
          !audioUrl.includes('cdn.freesound.org/previews/') &&
          !title.includes('Test Instrumental') &&
          !title.includes('Connectivity Check')
        );
      });
      if (cleanedQueue.length > 0) {
        dispatch({
          type: 'RESTORE',
          snapshot: {
            ...snap,
            queue: cleanedQueue,
            currentIndex: Math.min(Math.max(0, snap.currentIndex), cleanedQueue.length - 1),
          },
        });
        return;
      }
    }
    dispatch({
      type: 'RESTORE',
      snapshot: {
        version: 1,
        queue: [],
        currentIndex: -1,
        positionSec: 0,
        volume: state.volume,
        muted: state.muted,
        mode: state.mode,
        savedAt: Date.now(),
      } as any,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const offTime = engine.on('time', (current, duration) => {
      if (stallTimerRef.current) {
        clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
      dispatch({ type: 'SET_POSITION', positionSec: current });
      if (Number.isFinite(duration) && duration > 0) dispatch({ type: 'SET_DURATION', durationSec: duration });
    });
    const offLoaded = engine.on('loaded', () => {
      if (stallTimerRef.current) {
        clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
    });
    const offDur = engine.on('duration', (d) => {
      if (Number.isFinite(d) && d > 0) dispatch({ type: 'SET_DURATION', durationSec: d });
    });
    const offEnded = engine.on('ended', () => {
      dispatch({ type: 'NEXT' });
    });
    const offErr = engine.on('error', (msg) => {
      if (stallTimerRef.current) {
        clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
      const switched = attemptFallback(msg);
      if (!switched) {
        dispatch({
          type: 'SET_ERROR',
          error: {
            code: 'play_failed',
            message: `${msg}；暂无其他可用站内备用源，请切换地区模式或打开原平台页面。`,
            at: Date.now(),
            trackId: getActiveTrack(stateRef.current)?.id,
          },
        });
      }
    });
    const offPlay = engine.on('play', () => {});
    const offPause = engine.on('pause', () => {});
    return () => {
      offTime();
      offLoaded();
      offDur();
      offEnded();
      offErr();
      offPlay();
      offPause();
    };
  }, [engine, attemptFallback]);

  const currentTrack = getActiveTrack(state);

  useEffect(() => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }

    const track = currentTrack;
    const trackId = track?.id;
    const kind = track?.playback.kind;
    const audioSrc = kind === 'audio' ? track?.playback.audioUrl : undefined;

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

    const trackChanged = lastTrackIdRef.current !== trackId;
    const srcChanged = lastAudioSrcRef.current !== audioSrc;
    if (srcChanged) {
      void engine.load(audioSrc);
      lastAudioSrcRef.current = audioSrc;
    }
    if (trackChanged && state.positionSec > 0 && state.restored) {
      pendingSeekRef.current = state.positionSec;
    }
    if (trackChanged && !state.restored) {
      pendingSeekRef.current = 0;
    }

    if (state.isPlaying && audioSrc) {
      if (pendingSeekRef.current != null) {
        engine.seek(pendingSeekRef.current);
        pendingSeekRef.current = null;
      }
      // Watchdog: if direct audio hangs with readyState < 2 for 8s (common under firewall drops), auto-fallback
      const el = engine.getElement();
      if (!el || el.readyState < 2) {
        stallTimerRef.current = setTimeout(() => {
          const curEl = engine.getElement();
          const cur = stateRef.current;
          if (cur.isPlaying && getActiveTrack(cur)?.playback.audioUrl === audioSrc && (!curEl || curEl.readyState < 2)) {
            const switched = attemptFallback('音频连接超时');
            if (!switched) {
              dispatch({
                type: 'SET_ERROR',
                error: {
                  code: 'load_failed',
                  message: '音频直链连接超时，当前曲目无其他备用源，请打开原平台或切换地区通道。',
                  at: Date.now(),
                  trackId,
                },
              });
            }
          }
        }, 8000);
      }

      void engine.play().then((ok) => {
        if (!ok && stateRef.current.isPlaying) {
          const elNow = engine.getElement();
          if (elNow?.error) {
            const switched = attemptFallback('音频无法加载');
            if (!switched) {
              dispatch({
                type: 'SET_ERROR',
                error: { code: 'play_failed', message: '音频加载失败，请切换音源或打开原平台。', at: Date.now(), trackId },
              });
            }
          } else {
            dispatch({
              type: 'SET_ERROR',
              error: { code: 'play_failed', message: '请再次点击播放或切换其它音源', at: Date.now(), trackId },
            });
          }
        }
      });
    } else {
      engine.pause();
    }

    lastTrackIdRef.current = trackId;
    lastKindRef.current = kind;
  }, [engine, currentTrack, state.isPlaying, state.volume, state.muted, state.currentIndex, state.restored, state.activeSourceId, attemptFallback]);

  useEffect(() => {
    if (!state.restored) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        savePersistedPlayerState(toPersistedState(state));
      } catch {}
    }, 400);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state]);

  const play = useCallback(() => dispatch({ type: 'PLAY' }), []);
  const pause = useCallback(() => dispatch({ type: 'PAUSE' }), []);
  const togglePlay = useCallback(() => dispatch({ type: 'TOGGLE_PLAY' }), []);
  const stopPlayback = useCallback(() => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
    engine.pause();
    void engine.load(undefined);
    lastTrackIdRef.current = undefined;
    lastKindRef.current = undefined;
    lastAudioSrcRef.current = undefined;
    dispatch({ type: 'CLEAR_QUEUE' });
    clearPersistedPlayerState();
  }, [engine]);

  const playTrack = useCallback((track: MusicTrack | UnifiedTrack, queue?: Array<MusicTrack | UnifiedTrack>, index?: number) => {
    const region = getEffectiveMediaRegion();
    const norm = normalizeToUnifiedTrack(track as any);
    const orderedSources = sortClientMusicSources(norm.sources, region);
    const best = orderedSources[0];
    const t: UnifiedTrack = best
      ? {
          ...norm,
          sources: orderedSources,
          playback: {
            kind: best.kind,
            audioUrl: best.audioUrl,
            embedUrl: best.embedUrl,
            provider: best.provider,
            sourceLabel: best.label,
            sourceUrl: best.url || norm.sourceUrl,
            playbackType: best.playbackType,
            regionAvailability: best.regionAvailability,
            copyrightStatus: best.copyrightStatus,
          },
          source: best.label || norm.source,
          sourceUrl: best.url || norm.sourceUrl,
        }
      : norm;
    const q = queue ? toQueueItems(queue as any[]) : undefined;
    dispatch({ type: 'PLAY_TRACK', track: t, queue: q, index, sourceId: best?.id, play: true });
  }, []);

  const playNext = useCallback(() => dispatch({ type: 'NEXT' }), []);
  const playPrevious = useCallback(() => dispatch({ type: 'PREVIOUS' }), []);
  const seek = useCallback(
    (sec: number) => {
      const t = getActiveTrack({ ...state } as any);
      if (t && t.playback.kind === 'audio') {
        engine.seek(sec);
      }
      dispatch({ type: 'SET_POSITION', positionSec: sec });
    },
    [engine, state]
  );
  const setVolume = useCallback((v: number) => dispatch({ type: 'SET_VOLUME', volume: v }), []);
  const toggleMute = useCallback(() => dispatch({ type: 'TOGGLE_MUTE' }), []);
  const addToQueue = useCallback((tracks: Array<MusicTrack | UnifiedTrack>, position?: 'next' | 'end') => {
    dispatch({ type: 'ADD_TO_QUEUE', items: toQueueItems(tracks as any[]), position });
  }, []);
  const removeFromQueue = useCallback((queueId: string) => dispatch({ type: 'REMOVE_FROM_QUEUE', queueId }), []);
  const clearQueue = useCallback(() => {
    dispatch({ type: 'CLEAR_QUEUE' });
    clearPersistedPlayerState();
  }, []);
  const reorderQueue = useCallback((from: number, to: number) => dispatch({ type: 'REORDER_QUEUE', from, to }), []);
  const toggleShuffle = useCallback(() => dispatch({ type: 'TOGGLE_SHUFFLE' }), []);
  const setRepeatMode = useCallback((mode: RepeatMode) => dispatch({ type: 'SET_REPEAT', repeat: mode }), []);
  const switchSource = useCallback((sourceId: string) => dispatch({ type: 'SWITCH_SOURCE', sourceId }), []);
  const tryFallbackSource = useCallback((reason = '用户手动切换备用源') => attemptFallback(reason), [attemptFallback]);
  const clearFallbackNotice = useCallback(() => dispatch({ type: 'CLEAR_FALLBACK_NOTICE' }), []);
  const restorePlayerState = useCallback(() => {
    const snap = loadPersistedPlayerState();
    if (snap) dispatch({ type: 'RESTORE', snapshot: snap });
  }, []);
  const setError = useCallback((error: PlaybackError | null) => dispatch({ type: 'SET_ERROR', error }), []);
  const getAudioAnalyser = useCallback(() => engine.getAnalyser(), [engine]);
  const resumeAudioContext = useCallback(() => engine.resumeContext(), [engine]);
  const unlockAudio = useCallback(() => engine.unlockPlayback(), [engine]);

  const api = useMemo<MusicPlayerApi>(
    () => ({
      state,
      currentTrack,
      play,
      pause,
      togglePlay,
      stopPlayback,
      playTrack,
      playNext,
      playPrevious,
      seek,
      setVolume,
      toggleMute,
      addToQueue,
      removeFromQueue,
      clearQueue,
      reorderQueue,
      toggleShuffle,
      setRepeatMode,
      switchSource,
      tryFallbackSource,
      clearFallbackNotice,
      restorePlayerState,
      setError,
      getAudioAnalyser,
      resumeAudioContext,
      unlockAudio,
    }),
    [
      state,
      currentTrack,
      play,
      pause,
      togglePlay,
      stopPlayback,
      playTrack,
      playNext,
      playPrevious,
      seek,
      setVolume,
      toggleMute,
      addToQueue,
      removeFromQueue,
      clearQueue,
      reorderQueue,
      toggleShuffle,
      setRepeatMode,
      switchSource,
      tryFallbackSource,
      clearFallbackNotice,
      restorePlayerState,
      setError,
      getAudioAnalyser,
      resumeAudioContext,
      unlockAudio,
    ]
  );

  return <PlayerContext.Provider value={api}>{children}</PlayerContext.Provider>;
}

export function usePlayerContext(): MusicPlayerApi {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('useMusicPlayer must be used within PlayerProvider');
  return ctx;
}

export function useOptionalPlayerContext(): MusicPlayerApi | null {
  return useContext(PlayerContext);
}

export function isTrackEmbeddable(track: UnifiedTrack | null | undefined): boolean {
  return !!getEmbedSrc(track);
}
