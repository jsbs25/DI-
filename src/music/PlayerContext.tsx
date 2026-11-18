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
  sessionActivated: boolean;
  activateMusicSession: () => void;
  userStopped: boolean;
  failedTrackIds: Set<string>;
  isTrackFailed: (trackId: string) => boolean;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  stopPlayback: () => void;
  stopAndHold: () => void;
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
  const [sessionActivated, setSessionActivated] = React.useState(false);
  const [userStopped, setUserStoppedState] = React.useState(false);
  const [failedTrackIds, setFailedTrackIds] = React.useState<Set<string>>(() => new Set());
  const userStoppedRef = useRef(false);
  const failedTrackIdsRef = useRef<Set<string>>(new Set());
  const consecutiveFailuresRef = useRef(0);
  const pendingAutoplayResumeRef = useRef(false);

  const activateMusicSession = useCallback(() => {
    setSessionActivated(true);
  }, []);

  const setUserStopped = useCallback((v: boolean) => {
    userStoppedRef.current = v;
    setUserStoppedState(v);
    if (v) {
      pendingAutoplayResumeRef.current = false;
    }
  }, []);

  const markTrackFailed = useCallback((trackId: string) => {
    if (!trackId) return;
    if (failedTrackIdsRef.current.has(trackId)) return;
    const next = new Set(failedTrackIdsRef.current);
    next.add(trackId);
    failedTrackIdsRef.current = next;
    setFailedTrackIds(next);
  }, []);

  const isTrackFailed = useCallback((trackId: string) => failedTrackIdsRef.current.has(trackId), []);
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

  const pruneFailedTrackAndAdvance = useCallback(
    (trackId: string | undefined, reason: string) => {
      if (!trackId) return;
      markTrackFailed(trackId);
      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current >= 5) {
        dispatch({
          type: 'SET_ERROR',
          error: {
            code: 'play_failed',
            message: `网络连接受限（${reason}），请检查网络后再试。`,
            at: Date.now(),
            trackId,
          },
        });
        return;
      }
      dispatch({ type: 'REMOVE_TRACK_ID', trackId });
    },
    [markTrackFailed]
  );

  useEffect(() => {
    const onForceStop = () => {
      if (stallTimerRef.current) {
        clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
      setSessionActivated(false);
      setUserStopped(true);
      engine.pause();
      void engine.load(undefined);
      lastTrackIdRef.current = undefined;
      lastKindRef.current = undefined;
      lastAudioSrcRef.current = undefined;
      dispatch({ type: 'CLEAR_QUEUE' });
      clearPersistedPlayerState();
    };
    window.addEventListener('one-music-force-stop', onForceStop);
    return () => window.removeEventListener('one-music-force-stop', onForceStop);
  }, [engine, setUserStopped]);

  // Do NOT pop up music player on initial launch; keep home clean until Music is opened.
  useEffect(() => {
    if (restoredOnceRef.current) return;
    restoredOnceRef.current = true;
    void probeClientMediaConnectivity();
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
      consecutiveFailuresRef.current = 0;
      if (stallTimerRef.current) {
        clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
      dispatch({ type: 'SET_POSITION', positionSec: current });
      if (Number.isFinite(duration) && duration > 0) dispatch({ type: 'SET_DURATION', durationSec: duration });
    });
    const offLoaded = engine.on('loaded', () => {
      consecutiveFailuresRef.current = 0;
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
        pruneFailedTrackAndAdvance(getActiveTrack(stateRef.current)?.id, msg);
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
  }, [engine, attemptFallback, pruneFailedTrackAndAdvance]);

  const currentTrack = getActiveTrack(state);

  // Auto-advance YouTube & Bilibili embed tracks when playback ends
  useEffect(() => {
    if (!sessionActivated || userStopped || !state.isPlaying || !currentTrack) return;
    if (currentTrack.playback.kind !== 'embed') return;

    const onMessage = (e: MessageEvent) => {
      if (typeof e.origin !== 'string' || !e.origin.includes('youtube')) return;
      try {
        const msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        // YouTube IFrame API sends info.playerState === 0 on video end
        if (
          (msg?.event === 'onStateChange' && msg?.info === 0) ||
          (msg?.event === 'infoDelivery' && msg?.info?.playerState === 0)
        ) {
          dispatch({ type: 'NEXT' });
          return;
        }
        // Auto-skip if uploader restricted embedding (100/101/150)
        const errCode =
          msg?.event === 'onError'
            ? Number(msg?.info)
            : msg?.event === 'infoDelivery' && msg?.info?.videoData?.errorCode
              ? Number(msg.info.videoData.errorCode)
              : NaN;
        if ([2, 5, 100, 101, 150].includes(errCode)) {
          if (!attemptFallback(`YouTube 嵌入受限 (${errCode})`)) {
            pruneFailedTrackAndAdvance(currentTrack.id, `YouTube 嵌入受限 (${errCode})`);
          }
        }
      } catch {}
    };
    window.addEventListener('message', onMessage);

    // Duration-based fallback auto-advance for embeds (especially Bilibili which has no postMessage API)
    const dur = currentTrack.durationSeconds && currentTrack.durationSeconds > 15 && currentTrack.durationSeconds < 1800
      ? currentTrack.durationSeconds
      : 0;
    const timer = dur
      ? setTimeout(() => {
          if (stateRef.current.isPlaying && !userStoppedRef.current) {
            dispatch({ type: 'NEXT' });
          }
        }, (dur + 3) * 1000)
      : null;

    return () => {
      window.removeEventListener('message', onMessage);
      if (timer) clearTimeout(timer);
    };
  }, [sessionActivated, userStopped, state.isPlaying, currentTrack]);

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
              pruneFailedTrackAndAdvance(trackId, '音频连接超时');
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
              pruneFailedTrackAndAdvance(trackId, '音频无法加载');
            }
          } else {
            // Browser blocked unprompted autoplay: pause silently and auto-resume on first user gesture
            pendingAutoplayResumeRef.current = true;
            dispatch({ type: 'PAUSE' });
            const resumeOnGesture = () => {
              window.removeEventListener('pointerdown', resumeOnGesture, true);
              window.removeEventListener('keydown', resumeOnGesture, true);
              if (pendingAutoplayResumeRef.current && !userStoppedRef.current && stateRef.current.queue.length > 0) {
                pendingAutoplayResumeRef.current = false;
                engine.unlockPlayback();
                void engine.resumeContext();
                dispatch({ type: 'PLAY' });
              }
            };
            window.addEventListener('pointerdown', resumeOnGesture, { once: true, capture: true });
            window.addEventListener('keydown', resumeOnGesture, { once: true, capture: true });
          }
        }
      });
    } else {
      engine.pause();
    }

    lastTrackIdRef.current = trackId;
    lastKindRef.current = kind;
  }, [engine, currentTrack, state.isPlaying, state.volume, state.muted, state.currentIndex, state.restored, state.activeSourceId, attemptFallback, pruneFailedTrackAndAdvance]);

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

  const play = useCallback(() => {
    setSessionActivated(true);
    setUserStopped(false);
    dispatch({ type: 'PLAY' });
  }, [setUserStopped]);

  const pause = useCallback(() => dispatch({ type: 'PAUSE' }), []);

  const togglePlay = useCallback(() => {
    if (!stateRef.current.isPlaying) {
      setSessionActivated(true);
      setUserStopped(false);
    }
    dispatch({ type: 'TOGGLE_PLAY' });
  }, [setUserStopped]);

  const stopAndHold = useCallback(() => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
    setSessionActivated(false);
    setUserStopped(true);
    engine.pause();
    dispatch({ type: 'PAUSE' });
    dispatch({ type: 'CLEAR_FALLBACK_NOTICE' });
  }, [engine, setUserStopped]);

  const stopPlayback = useCallback(() => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
    setSessionActivated(false);
    setUserStopped(true);
    engine.pause();
    void engine.load(undefined);
    lastTrackIdRef.current = undefined;
    lastKindRef.current = undefined;
    lastAudioSrcRef.current = undefined;
    dispatch({ type: 'CLEAR_QUEUE' });
    clearPersistedPlayerState();
  }, [engine, setUserStopped]);

  const playTrack = useCallback((track: MusicTrack | UnifiedTrack, queue?: Array<MusicTrack | UnifiedTrack>, index?: number) => {
    setSessionActivated(true);
    setUserStopped(false);
    consecutiveFailuresRef.current = 0;
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
    const filteredQueue = queue
      ? queue.filter((item: any) => !failedTrackIdsRef.current.has(String(item?.id || '')))
      : undefined;
    const q = filteredQueue && filteredQueue.length > 0 ? toQueueItems(filteredQueue as any[]) : undefined;
    const resolvedIndex = q ? Math.max(0, q.findIndex((item) => item.track.id === t.id)) : index;
    dispatch({ type: 'PLAY_TRACK', track: t, queue: q, index: resolvedIndex, sourceId: best?.id, play: true });
  }, [setUserStopped]);

  const playNext = useCallback(() => {
    setUserStopped(false);
    dispatch({ type: 'NEXT' });
  }, [setUserStopped]);

  const playPrevious = useCallback(() => {
    setUserStopped(false);
    dispatch({ type: 'PREVIOUS' });
  }, [setUserStopped]);

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
    setUserStopped(true);
    dispatch({ type: 'CLEAR_QUEUE' });
    clearPersistedPlayerState();
  }, [setUserStopped]);
  const reorderQueue = useCallback((from: number, to: number) => dispatch({ type: 'REORDER_QUEUE', from, to }), []);
  const toggleShuffle = useCallback(() => dispatch({ type: 'TOGGLE_SHUFFLE' }), []);
  const setRepeatMode = useCallback((mode: RepeatMode) => dispatch({ type: 'SET_REPEAT', repeat: mode }), []);
  const switchSource = useCallback((sourceId: string) => {
    setUserStopped(false);
    dispatch({ type: 'SWITCH_SOURCE', sourceId });
  }, [setUserStopped]);
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
      sessionActivated,
      activateMusicSession,
      userStopped,
      failedTrackIds,
      isTrackFailed,
      play,
      pause,
      togglePlay,
      stopPlayback,
      stopAndHold,
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
      sessionActivated,
      activateMusicSession,
      userStopped,
      failedTrackIds,
      isTrackFailed,
      play,
      pause,
      togglePlay,
      stopPlayback,
      stopAndHold,
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
