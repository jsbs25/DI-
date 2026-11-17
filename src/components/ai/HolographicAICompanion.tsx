import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Disc3,
  ExternalLink,
  Maximize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
  X,
} from 'lucide-react';
import { Language } from '../../types/index.ts';
import { readAIStream } from '../../utils/aiStream.ts';
import { getAiProfileKey } from '../../utils/aiProfile.ts';
import { useOptionalPlayerContext } from '../../music/PlayerContext.tsx';
import {
  extractInlineAgentDirective,
  matchPureSocialBanter,
  parseInstantAgentAction,
  resolveConversationalFallback,
  type OneAgentAction,
} from '../../utils/oneAgentController.ts';
import { solvePrecisionQuery } from '../../utils/precisionSolver.ts';
import {
  analyzeDialogueEmotion,
  buildExpressivePhrases,
  extractEmotionTag,
  type EmotionAnalysisResult,
  type ProsodyPhrase,
  type VoiceEmotion,
} from '../../utils/emotionEngine.ts';

interface HolographicAICompanionProps {
  lang: Language;
  onFlyTo?: (lat: number, lng: number) => void;
  onExploreUniverse?: () => void;
  onOpenAIHub?: () => void;
  onNavigateTab?: (tab: string) => void;
  onPlayMusicAction?: (opts: { query?: string; crawl?: boolean }) => void;
  onOpenBookAction?: (opts: { query: string }) => void;
  onWatchDocumentaryAction?: (opts: {
    query: string;
    platform?: 'all' | 'bilibili' | 'youtube';
    randomPick?: boolean;
  }) => void;
  onBrowserSearchAction?: (query: string) => void;
  onSetTheme?: (theme: 'dark' | 'light') => void;
  onSetLang?: (lang: Language) => void;
  currentTab?: string;
  showLauncher?: boolean;
  placement?: 'center-bottom' | 'corner';
}

interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

type VoicePhase =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';

interface QueuedSpeechItem {
  phrase: ProsodyPhrase;
  audioPromise: Promise<string | null> | null;
}

const DEFAULT_MUSIC_COVER = '/assets/music/ambient-space.jpg';

function buildUnifiedEmbedUrl(rawUrl: string | undefined, isPlaying: boolean): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const u = new URL(rawUrl);
    if (u.hostname.includes('youtube')) {
      // Keep YouTube embed URL stable across pause/resume so postMessage preserves exact playback position
      u.searchParams.set('autoplay', '1');
      u.searchParams.set('enablejsapi', '1');
      u.searchParams.set('playsinline', '1');
      u.searchParams.set('rel', '0');
      return u.toString();
    }
    if (u.hostname.includes('bilibili')) {
      u.searchParams.set('autoplay', isPlaying ? '1' : '0');
      u.searchParams.set('danmaku', '0');
      u.searchParams.set('muted', '0');
      return u.toString();
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

function pickSweetVoice(isZh: boolean): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;

  const preferredPatterns = isZh
    ? [
        /xiaoxiao/i,
        /xiaoyi/i,
        /ting-?ting.*enhanced/i,
        /meijia.*enhanced/i,
        /ting-?ting/i,
        /meijia/i,
        /sinji/i,
        /natural.*zh|zh.*natural/i,
        /neural.*zh|zh.*neural/i,
        /google\s*普通话/i,
        /huihui/i,
        /yaoyao/i,
        /female|女/i,
      ]
    : [
        /jenny.*natural|jenny/i,
        /aria.*natural|aria/i,
        /ava.*natural|ava/i,
        /samantha.*enhanced|samantha/i,
        /natural.*en|en.*natural/i,
        /neural.*en|en.*neural/i,
        /victoria/i,
        /karen/i,
        /google us english/i,
        /female/i,
      ];

  const langPrefix = isZh ? 'zh' : 'en';
  const langVoices = voices.filter((v) => (v.lang || '').toLowerCase().startsWith(langPrefix));
  const pool = langVoices.length > 0 ? langVoices : voices;

  for (const pat of preferredPatterns) {
    const match = pool.find((v) => pat.test(v.name) || pat.test(v.voiceURI));
    if (match) return match;
  }
  return pool[0] || null;
}

function isAuthenticNeuralVoice(voice: SpeechSynthesisVoice | null): boolean {
  if (!voice) return false;
  return /xiaoxiao|xiaoyi|natural|neural|enhanced|premium|jenny|aria/i.test(
    `${voice.name} ${voice.voiceURI}`
  );
}

export const HolographicAICompanion: React.FC<HolographicAICompanionProps> = ({
  lang,
  onFlyTo,
  onExploreUniverse,
  onNavigateTab,
  onPlayMusicAction,
  onOpenBookAction,
  onWatchDocumentaryAction,
  onBrowserSearchAction,
  onSetTheme,
  onSetLang,
  currentTab = 'globe',
  showLauncher = true,
  placement = 'corner',
}) => {
  const isZh = lang === 'zh';
  const player = useOptionalPlayerContext();
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [voiceActive, setVoiceActive] = useState(false);
  const [modelId, setModelId] = useState('deepseek-v3');
  const [activeEmotion, setActiveEmotion] = useState<EmotionAnalysisResult | null>(null);
  const preferredVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // Unified Music Player state hosted directly inside One. orb
  const [musicPopoverOpen, setMusicPopoverOpen] = useState(false);
  const [showMiniVideo, setShowMiniVideo] = useState(false);
  const [stageRect, setStageRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [auroraIdx, setAuroraIdx] = useState(0);
  const embedIframeRef = useRef<HTMLIFrameElement | null>(null);
  const popoverStageAnchorRef = useRef<HTMLDivElement | null>(null);
  const pausedMusicForVoiceRef = useRef(false);
  const explicitStopMusicRef = useRef(false);
  const speculativePauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerRef = useRef(player);
  playerRef.current = player;
  const isZhRef = useRef(isZh);
  isZhRef.current = isZh;

  // Cache sweet natural voice as soon as browser populates speechSynthesis voices
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const refreshVoice = () => {
      preferredVoiceRef.current = pickSweetVoice(isZh);
    };
    refreshVoice();
    window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoice);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', refreshVoice);
    };
  }, [isZh]);

  // Resolve default DeepSeek chat model and live engine availability from backend
  useEffect(() => {
    let cancelled = false;
    const syncModels = () => {
      fetch('/api/ai/models')
        .then((r) => r.json())
        .then((data) => {
          if (cancelled || !data?.success) return;
          if (Array.isArray(data.models)) {
            const deepseekPreferred =
              data.models.find((m: { id: string }) => m.id === 'deepseek-v3') ||
              data.models.find((m: { id: string; isDefault?: boolean }) => m.isDefault && m.id.startsWith('deepseek')) ||
              data.models.find((m: { id: string }) => m.id.startsWith('deepseek'));
            if (deepseekPreferred?.id) setModelId(deepseekPreferred.id);
          }
        })
        .catch(() => {});
    };
    syncModels();
    window.addEventListener('one-ai-config-updated', syncModels);
    return () => {
      cancelled = true;
      window.removeEventListener('one-ai-config-updated', syncModels);
    };
  }, []);

  // Launcher Orb 3D canvas & responsive drag bounds
  const orbCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ORB_SIZE = 48;
  const clampLauncherPos = useCallback((x: number, y: number) => {
    if (typeof window === 'undefined') return { x: 16, y: 120 };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const minX = vw >= 768 ? 82 : 10;
    const maxX = Math.max(minX, vw - ORB_SIZE - 10);
    const minY = 66;
    const maxY = Math.max(minY, vh - ORB_SIZE - (vw < 768 ? 86 : 18));
    return {
      x: Math.min(Math.max(x, minX), maxX),
      y: Math.min(Math.max(y, minY), maxY),
    };
  }, []);

  const [launcherPos, setLauncherPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === 'undefined') return { x: 16, y: 120 };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const minX = vw >= 768 ? 82 : 10;
    const maxX = Math.max(minX, vw - ORB_SIZE - 10);
    const minY = 66;
    const maxY = Math.max(minY, vh - ORB_SIZE - (vw < 768 ? 86 : 18));
    const defaultPos = {
      x: Math.max(minX, vw - ORB_SIZE - (vw < 768 ? 14 : 22)),
      y: Math.max(minY, vh - ORB_SIZE - (vw < 768 ? 90 : 22)),
    };
    try {
      const saved = localStorage.getItem('earth-one-ai-launcher-pos:v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
          return {
            x: Math.min(Math.max(parsed.x, minX), maxX),
            y: Math.min(Math.max(parsed.y, minY), maxY),
          };
        }
      }
    } catch {}
    return defaultPos;
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  }>({ active: false, pointerId: null, startX: 0, startY: 0, origX: 0, origY: 0, moved: false });
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const onResize = () => setLauncherPos((p) => clampLauncherPos(p.x, p.y));
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    vv?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      vv?.removeEventListener('resize', onResize);
    };
  }, [clampLauncherPos]);

  // Real-time DeepSeek voice session + Emotion Engine + Hybrid Neural TTS Audio
  const phaseRef = useRef<VoicePhase>('idle');
  phaseRef.current = phase;
  const activeEmotionRef = useRef<EmotionAnalysisResult | null>(null);
  activeEmotionRef.current = activeEmotion;
  const sessionActiveRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const turnEpochRef = useRef(0);
  const activeFetchAbortRef = useRef<AbortController | null>(null);
  const isSendingRef = useRef(false);
  const isTtsSpeakingRef = useRef(false);
  const currentSpokenTextRef = useRef('');
  const currentUserTurnRef = useRef('');
  const lastExecutedActionRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const lastHandledFinalRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const modelIdRef = useRef(modelId);
  const historyRef = useRef<HistoryTurn[]>([]);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recStateRef = useRef<'stopped' | 'starting' | 'running'>('stopped');
  const recKeepaliveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recRetryDelayRef = useRef(180);
  const profileKeyRef = useRef<string>(getAiProfileKey());
  const liveWsRef = useRef<WebSocket | null>(null);
  const wsPendingTurnRef = useRef<{
    turnId: string;
    epoch: number;
    resolve: (res: { rawReply: string; model?: string }) => void;
    reject: (err: Error) => void;
    onDelta: (delta: string) => void;
    rawReply: string;
  } | null>(null);

  const ttsQueueRef = useRef<QueuedSpeechItem[]>([]);
  const ttsStreamDoneRef = useRef(true);
  const ttsDrainingRef = useRef(false);
  const ttsDoneCallbackRef = useRef<(() => void) | null>(null);
  const ttsSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsFetchControllersRef = useRef<Set<AbortController>>(new Set());
  const ttsBlobUrlsRef = useRef<Set<string>>(new Set());
  const ttsAudioElRef = useRef<HTMLAudioElement | null>(null);
  const ttsAudioCtxRef = useRef<AudioContext | null>(null);

  modelIdRef.current = modelId;

  const ensureLiveWs = useCallback(() => {
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return null;
    const existing = liveWsRef.current;
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return existing;
    }
    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws/ai-live?profileKey=${encodeURIComponent(profileKeyRef.current)}`);
      liveWsRef.current = ws;
      ws.onmessage = (ev) => {
        let msg: any = null;
        try { msg = JSON.parse(String(ev.data || '')); } catch { return; }
        if (!msg || typeof msg.type !== 'string') return;
        const pending = wsPendingTurnRef.current;
        if (!pending || msg.turnId !== pending.turnId || pending.epoch !== turnEpochRef.current) return;

        if (msg.type === 'turn:delta' && typeof msg.delta === 'string') {
          pending.rawReply += msg.delta;
          pending.onDelta(msg.delta);
        } else if (msg.type === 'turn:done') {
          const finalRaw = typeof msg.rawReply === 'string' && msg.rawReply ? msg.rawReply : (pending.rawReply || String(msg.reply || ''));
          wsPendingTurnRef.current = null;
          pending.resolve({ rawReply: finalRaw, model: msg.model });
        } else if (msg.type === 'turn:cancelled') {
          wsPendingTurnRef.current = null;
          const abortErr = new Error('Turn aborted');
          (abortErr as any).name = 'AbortError';
          pending.reject(abortErr);
        } else if (msg.type === 'turn:error') {
          wsPendingTurnRef.current = null;
          pending.reject(new Error(String(msg.error || 'WebSocket turn failed')));
        }
      };
      ws.onclose = () => {
        if (liveWsRef.current === ws) liveWsRef.current = null;
        const pending = wsPendingTurnRef.current;
        if (pending) {
          wsPendingTurnRef.current = null;
          pending.reject(new Error('WebSocket disconnected'));
        }
      };
      return ws;
    } catch {
      return null;
    }
  }, []);

  // Ensure reusable HTMLAudioElement with subtle warmth EQ for sweet expressive neural MP3 playback
  const ensureTtsAudioUnlocked = useCallback(() => {
    if (typeof window === 'undefined') return null;
    if (!ttsAudioElRef.current) {
      const el = new Audio();
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
      (el as any).preservesPitch = true;
      (el as any).webkitPreservesPitch = true;
      ttsAudioElRef.current = el;

      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          ttsAudioCtxRef.current = ctx;
          const src = ctx.createMediaElementSource(el);
          // Balanced natural vocal EQ
          const warmth = ctx.createBiquadFilter();
          warmth.type = 'lowshelf';
          warmth.frequency.value = 230;
          warmth.gain.value = 1.6;

          const presence = ctx.createBiquadFilter();
          presence.type = 'peaking';
          presence.frequency.value = 2900;
          presence.Q.value = 1.1;
          presence.gain.value = 1.4;

          src.connect(warmth);
          warmth.connect(presence);
          presence.connect(ctx.destination);
        }
      } catch {
        // Basic <audio> playback works seamlessly even if Web Audio graph is restricted
      }
    }

    if (ttsAudioCtxRef.current?.state === 'suspended') {
      void ttsAudioCtxRef.current.resume().catch(() => {});
    }
    // Unlock audio element synchronously inside user tap using silent tiny data-URI WAV
    try {
      const el = ttsAudioElRef.current;
      if (el && el.paused && !el.src) {
        el.src =
          'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
        el.volume = 0.01;
        void el.play().then(() => {
          el.pause();
          el.volume = 1;
          el.removeAttribute('src');
        }).catch(() => {
          el.volume = 1;
        });
      }
    } catch {}
    return ttsAudioElRef.current;
  }, []);

  // Render 3D wireframe orb reflecting live voice phase AND active emotional color aura
  useEffect(() => {
    if (!showLauncher) return;
    const canvas = orbCanvasRef.current;
    if (!canvas) return;

    const size = placement === 'center-bottom' ? 38 : 46;
    canvas.width = size;
    canvas.height = size;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.z = 2.35;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      return;
    }
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    const coreGeo = new THREE.IcosahedronGeometry(0.76, 2);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x8ecfff,
      wireframe: true,
      transparent: true,
      opacity: 0.92,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    scene.add(coreMesh);

    const nucGeo = new THREE.SphereGeometry(0.35, 16, 16);
    const nucMat = new THREE.MeshBasicMaterial({ color: 0xf4a2c4 });
    const nucMesh = new THREE.Mesh(nucGeo, nucMat);
    scene.add(nucMesh);

    const colorTarget = new THREE.Color(0x8ecfff);
    const nucColorTarget = new THREE.Color(0xf4a2c4);
    let rafId = 0;
    let t = 0;
    let active = true;

    const animate = () => {
      if (!active || document.hidden) return;
      rafId = requestAnimationFrame(animate);

      const currentPhase = phaseRef.current;
      const emo = activeEmotionRef.current;
      let energy = 0.08;

      if (currentPhase === 'listening') {
        colorTarget.setHex(0x4ade80);
        nucColorTarget.setHex(0x38bdf8);
        energy = 0.25 + 0.18 * Math.sin(t * 4.2);
      } else if (currentPhase === 'speaking' || isTtsSpeakingRef.current) {
        colorTarget.setHex(emo?.auraHex ?? 0xf9a8d4);
        nucColorTarget.setHex(emo?.auraHex ?? 0xf472b6);
        energy = 0.52 + 0.28 * Math.sin(t * 9.5);
      } else if (currentPhase === 'connecting' || currentPhase === 'thinking') {
        colorTarget.setHex(0x69b8ff);
        nucColorTarget.setHex(0xfbbf24);
        energy = 0.34 + 0.14 * Math.cos(t * 6.5);
      } else if (currentPhase === 'error') {
        colorTarget.setHex(0xf87171);
        nucColorTarget.setHex(0xf87171);
        energy = 0.12;
      } else {
        colorTarget.setHex(0x8ecfff);
        nucColorTarget.setHex(0xf4a2c4);
      }
      coreMat.color.lerp(colorTarget, 0.14);
      nucMat.color.lerp(nucColorTarget, 0.14);

      const speedBoost = sessionActiveRef.current ? 1.15 + energy * 1.4 : 1;
      t += 0.025 * speedBoost;
      coreMesh.rotation.y += 0.018 * speedBoost;
      coreMesh.rotation.x += 0.008 * speedBoost;
      const s = 1 + Math.sin(t * 2.6) * 0.07 + energy * 0.22;
      nucMesh.scale.set(s, s, s);
      renderer.render(scene, camera);
    };

    const onVis = () => {
      if (!document.hidden && active) {
        cancelAnimationFrame(rafId);
        animate();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    animate();

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVis);
      cancelAnimationFrame(rafId);
      coreGeo.dispose();
      coreMat.dispose();
      nucGeo.dispose();
      nucMat.dispose();
      renderer.dispose();
    };
  }, [showLauncher, placement]);

  // Execute parsed website action cleanly
  const executeParsedAction = useCallback(
    (action: OneAgentAction, dedupeKey = ''): boolean => {
      if (action.type === 'none') return false;
      const now = Date.now();
      const key = dedupeKey || JSON.stringify(action);
      if (
        lastExecutedActionRef.current.key === key &&
        now - lastExecutedActionRef.current.at < 2200
      ) {
        return false;
      }
      lastExecutedActionRef.current = { key, at: now };

      if (action.type === 'play_music') {
        if (action.control === 'next') {
          explicitStopMusicRef.current = false;
          pausedMusicForVoiceRef.current = false;
          player?.activateMusicSession();
          player?.playNext();
        } else if (action.control === 'prev') {
          explicitStopMusicRef.current = false;
          pausedMusicForVoiceRef.current = false;
          player?.activateMusicSession();
          player?.playPrevious();
        } else if (action.control === 'stop' || action.control === 'pause') {
          explicitStopMusicRef.current = true;
          pausedMusicForVoiceRef.current = false;
          player?.stopAndHold();
        } else if (action.control === 'resume') {
          explicitStopMusicRef.current = false;
          pausedMusicForVoiceRef.current = false;
          if (player?.currentTrack) {
            player.activateMusicSession();
            player.unlockAudio();
            void player.resumeAudioContext();
            player.play();
          } else if (onPlayMusicAction) {
            player?.activateMusicSession();
            onPlayMusicAction({ crawl: true });
          } else if (onNavigateTab) {
            onNavigateTab('venus');
          }
        } else if (onPlayMusicAction) {
          explicitStopMusicRef.current = false;
          pausedMusicForVoiceRef.current = false;
          player?.activateMusicSession();
          onPlayMusicAction({ query: action.query, crawl: action.crawl ?? true });
        } else if (onNavigateTab) {
          explicitStopMusicRef.current = false;
          pausedMusicForVoiceRef.current = false;
          onNavigateTab('venus');
        }
      } else if (action.type === 'open_book') {
        if (onOpenBookAction) {
          onOpenBookAction({ query: action.query });
        } else if (onNavigateTab) {
          onNavigateTab('library');
        }
      } else if (action.type === 'watch_documentary') {
        if (onWatchDocumentaryAction) {
          onWatchDocumentaryAction({
            query: action.query,
            platform: action.platform,
            randomPick: action.randomPick ?? true,
          });
        } else if (onNavigateTab) {
          onNavigateTab('saturn');
        }
      } else if (action.type === 'browser_search') {
        if (onBrowserSearchAction) {
          onBrowserSearchAction(action.query);
        } else if (onNavigateTab) {
          onNavigateTab('browser');
        }
      } else if (action.type === 'fly_to') {
        if (onFlyTo) {
          onFlyTo(action.lat, action.lng);
        } else if (onNavigateTab) {
          onNavigateTab('globe');
        }
      } else if (action.type === 'set_theme') {
        onSetTheme?.(action.theme);
      } else if (action.type === 'set_language') {
        onSetLang?.(action.lang);
      } else if (action.type === 'navigate_tab') {
        if (onNavigateTab) {
          onNavigateTab(action.tab);
        } else if (action.tab === 'universe' && onExploreUniverse) {
          onExploreUniverse();
        }
      }
      return true;
    },
    [
      onBrowserSearchAction,
      onExploreUniverse,
      onFlyTo,
      onNavigateTab,
      onOpenBookAction,
      onPlayMusicAction,
      onSetLang,
      onSetTheme,
      onWatchDocumentaryAction,
      player,
    ]
  );

  const canRunAudioSession = Boolean(
    player?.sessionActivated && !player?.userStopped && player?.currentTrack
  );
  const currentTrack = player?.currentTrack ?? null;
  const isMusicPlaying = Boolean(player?.state.isPlaying);
  const isOnVenus = currentTab === 'venus';
  const showUnifiedMusicControls = canRunAudioSession && !isOnVenus;

  const rawEmbed =
    currentTrack?.playback.embedUrl ||
    (currentTrack?.raw as any)?.embedUrl ||
    currentTrack?.sources.find((s) => s.kind === 'embed' && s.embedUrl)?.embedUrl;
  const liveEmbedSrc = canRunAudioSession ? buildUnifiedEmbedUrl(rawEmbed, isMusicPlaying) : undefined;
  const liveEmbedSrcRef = useRef(liveEmbedSrc);
  liveEmbedSrcRef.current = liveEmbedSrc;
  const isMusicPlayingRef = useRef(isMusicPlaying);
  isMusicPlayingRef.current = isMusicPlaying;

  const sendYouTubeCmd = useCallback((func: 'playVideo' | 'pauseVideo' | 'unMute') => {
    const win = embedIframeRef.current?.contentWindow;
    const src = liveEmbedSrcRef.current;
    if (!win || !src || !src.includes('youtube')) return;
    try {
      if (func === 'playVideo') {
        win.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*');
      }
      win.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
    } catch {}
  }, []);

  const resumeMusicIfPausedForVoice = useCallback(() => {
    if (speculativePauseTimerRef.current) {
      clearTimeout(speculativePauseTimerRef.current);
      speculativePauseTimerRef.current = null;
    }
    const p = playerRef.current;
    if (!p || explicitStopMusicRef.current) {
      pausedMusicForVoiceRef.current = false;
      return;
    }
    if (pausedMusicForVoiceRef.current && p.currentTrack && !p.userStopped) {
      pausedMusicForVoiceRef.current = false;
      p.unlockAudio();
      void p.resumeAudioContext();
      p.play();
      sendYouTubeCmd('playVideo');
    }
  }, [sendYouTubeCmd]);

  const pauseMusicForVoice = useCallback((isSpeculative = false) => {
    const p = playerRef.current;
    if (!p) return;
    if (speculativePauseTimerRef.current) {
      clearTimeout(speculativePauseTimerRef.current);
      speculativePauseTimerRef.current = null;
    }
    if (p.state.isPlaying || isMusicPlayingRef.current || pausedMusicForVoiceRef.current) {
      if (p.state.isPlaying || isMusicPlayingRef.current) {
        pausedMusicForVoiceRef.current = true;
        p.pause();
      }
      sendYouTubeCmd('pauseVideo');
      if (isSpeculative) {
        speculativePauseTimerRef.current = setTimeout(() => {
          speculativePauseTimerRef.current = null;
          if (!isSendingRef.current && !isTtsSpeakingRef.current && pausedMusicForVoiceRef.current) {
            resumeMusicIfPausedForVoice();
          }
        }, 1500);
      }
    }
  }, [resumeMusicIfPausedForVoice, sendYouTubeCmd]);

  // Cycle aurora aura color subtly while playing music outside Music tab
  useEffect(() => {
    if (!showUnifiedMusicControls || !isMusicPlaying) return;
    const timer = setInterval(() => {
      setAuroraIdx((i) => (i + 1) % 5);
    }, 1800);
    return () => clearInterval(timer);
  }, [showUnifiedMusicControls, isMusicPlaying]);

  useEffect(() => {
    if (isOnVenus || !canRunAudioSession) {
      setMusicPopoverOpen(false);
    }
  }, [isOnVenus, canRunAudioSession]);

  // Keep YouTube embed synchronized with PlayerContext play/pause without reloading
  useEffect(() => {
    if (!liveEmbedSrc || !liveEmbedSrc.includes('youtube')) return;
    sendYouTubeCmd(isMusicPlaying ? 'playVideo' : 'pauseVideo');
  }, [isMusicPlaying, liveEmbedSrc, sendYouTubeCmd]);

  // Direct synchronous play/pause triggers from VenusMusicSpace real-playback toggle switch
  useEffect(() => {
    const onTriggerPlay = () => {
      explicitStopMusicRef.current = false;
      sendYouTubeCmd('playVideo');
    };
    const onTriggerPause = () => {
      sendYouTubeCmd('pauseVideo');
    };
    window.addEventListener('one-music-trigger-play', onTriggerPlay);
    window.addEventListener('one-music-trigger-pause', onTriggerPause);
    return () => {
      window.removeEventListener('one-music-trigger-play', onTriggerPlay);
      window.removeEventListener('one-music-trigger-pause', onTriggerPause);
    };
  }, [sendYouTubeCmd]);

  // Dock persistent YouTube/Bilibili iframe into #venus-stage-slot or orb popover preview
  useLayoutEffect(() => {
    if (!canRunAudioSession || !liveEmbedSrc) {
      setStageRect(null);
      return;
    }
    const measure = () => {
      const target = isOnVenus
        ? document.getElementById('venus-stage-slot')
        : musicPopoverOpen && showMiniVideo
          ? popoverStageAnchorRef.current
          : null;
      if (!target) {
        setStageRect(null);
        return;
      }
      const r = target.getBoundingClientRect();
      if (r.width > 20 && r.height > 20) {
        setStageRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else {
        setStageRect(null);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    const slot = document.getElementById('venus-stage-slot');
    if (slot) ro.observe(slot);
    if (popoverStageAnchorRef.current) ro.observe(popoverStageAnchorRef.current);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const rafTick = setInterval(measure, 250);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      clearInterval(rafTick);
    };
  }, [canRunAudioSession, liveEmbedSrc, isOnVenus, musicPopoverOpen, showMiniVideo, currentTrack?.id]);

  const stopOutputAudio = useCallback(() => {
    ttsQueueRef.current = [];
    ttsStreamDoneRef.current = true;
    ttsDrainingRef.current = false;
    ttsDoneCallbackRef.current = null;
    currentSpokenTextRef.current = '';

    if (ttsSafetyTimerRef.current) {
      clearTimeout(ttsSafetyTimerRef.current);
      ttsSafetyTimerRef.current = null;
    }
    if (ttsPauseTimerRef.current) {
      clearTimeout(ttsPauseTimerRef.current);
      ttsPauseTimerRef.current = null;
    }

    for (const ctrl of ttsFetchControllersRef.current) {
      try {
        ctrl.abort();
      } catch {}
    }
    ttsFetchControllersRef.current.clear();

    const audioEl = ttsAudioElRef.current;
    if (audioEl) {
      try {
        audioEl.onended = null;
        audioEl.onerror = null;
        audioEl.pause();
        audioEl.currentTime = 0;
      } catch {}
    }

    for (const url of ttsBlobUrlsRef.current) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
    ttsBlobUrlsRef.current.clear();

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    isTtsSpeakingRef.current = false;
  }, []);

  /**
   * Instant Barge-In: cancels in-flight DeepSeek HTTP request, TTS MP3 prefetch,
   * HTMLAudio playback, and speech synthesis within milliseconds.
   */
  const interruptCurrentTurn = useCallback(() => {
    turnEpochRef.current += 1;
    if (liveWsRef.current && liveWsRef.current.readyState === WebSocket.OPEN && wsPendingTurnRef.current) {
      try {
        liveWsRef.current.send(JSON.stringify({ type: 'turn:cancel', turnId: wsPendingTurnRef.current.turnId }));
      } catch {}
      wsPendingTurnRef.current = null;
    }
    if (activeFetchAbortRef.current) {
      try {
        activeFetchAbortRef.current.abort();
      } catch {}
      activeFetchAbortRef.current = null;
    }
    isSendingRef.current = false;
    stopOutputAudio();
    if (sessionActiveRef.current) {
      setPhase('listening');
    }
    return turnEpochRef.current;
  }, [stopOutputAudio]);

  const stopSessionResources = useCallback(() => {
    sessionActiveRef.current = false;
    recStateRef.current = 'stopped';
    turnEpochRef.current += 1;
    isSendingRef.current = false;
    setActiveEmotion(null);

    if (wsPendingTurnRef.current) {
      if (liveWsRef.current && liveWsRef.current.readyState === WebSocket.OPEN) {
        try {
          liveWsRef.current.send(JSON.stringify({ type: 'turn:cancel', turnId: wsPendingTurnRef.current.turnId }));
        } catch {}
      }
      wsPendingTurnRef.current = null;
    }
    if (liveWsRef.current) {
      try {
        liveWsRef.current.close();
      } catch {}
      liveWsRef.current = null;
    }

    if (activeFetchAbortRef.current) {
      try {
        activeFetchAbortRef.current.abort();
      } catch {}
      activeFetchAbortRef.current = null;
    }
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recKeepaliveTimerRef.current) {
      clearInterval(recKeepaliveTimerRef.current);
      recKeepaliveTimerRef.current = null;
    }
    if (speculativePauseTimerRef.current) {
      clearTimeout(speculativePauseTimerRef.current);
      speculativePauseTimerRef.current = null;
    }
    if (errorResetTimerRef.current) {
      clearTimeout(errorResetTimerRef.current);
      errorResetTimerRef.current = null;
    }

    stopOutputAudio();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.abort?.();
        recognitionRef.current.stop?.();
      } catch {}
      recognitionRef.current = null;
    }

    setVoiceActive(false);
    setPhase('idle');
    resumeMusicIfPausedForVoice();
  }, [resumeMusicIfPausedForVoice, stopOutputAudio]);

  useEffect(() => {
    return () => {
      stopSessionResources();
    };
  }, [stopSessionResources]);

  const cleanSpeechSegment = (raw: string) =>
    raw
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/\[\[EMO:[^\]]+\]\]/gi, '')
      .replace(/\[\[ACTION:[\s\S]*?\]\]/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[*_#`>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  // Prefetch /api/ai/tts MP3 audio blob for natural expressive female voice
  const prefetchNeuralAudioUrl = useCallback(
    async (phrase: ProsodyPhrase): Promise<string | null> => {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 2400);
      ttsFetchControllersRef.current.add(ctrl);
      try {
        const res = await fetch(
          `/api/ai/tts?text=${encodeURIComponent(phrase.text)}&lang=${isZh ? 'zh' : 'en'}&spd=${phrase.baiduSpd}&emotion=${phrase.emotion}`,
          { signal: ctrl.signal }
        );
        if (!res.ok) return null;
        const blob = await res.blob();
        if (blob.size < 400) return null;
        const objUrl = URL.createObjectURL(blob);
        ttsBlobUrlsRef.current.add(objUrl);
        return objUrl;
      } catch {
        return null;
      } finally {
        clearTimeout(timeout);
        ttsFetchControllersRef.current.delete(ctrl);
      }
    },
    [isZh]
  );

  // Fallback expressive browser SpeechSynthesis using phrase-level pitch & rate contour
  const speakPhraseViaBrowserSpeech = useCallback(
    (phrase: ProsodyPhrase, onDone: () => void) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        onDone();
        return;
      }
      try {
        const utt = new SpeechSynthesisUtterance(phrase.text.slice(0, 260));
        const sweetVoice = preferredVoiceRef.current || pickSweetVoice(isZh);
        if (sweetVoice) {
          utt.voice = sweetVoice;
          utt.lang = sweetVoice.lang || (isZh ? 'zh-CN' : 'en-US');
        } else {
          utt.lang = isZh ? 'zh-CN' : 'en-US';
        }
        utt.pitch = phrase.pitch;
        utt.rate = phrase.rate;
        utt.volume = 1;

        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          if (ttsSafetyTimerRef.current) {
            clearTimeout(ttsSafetyTimerRef.current);
            ttsSafetyTimerRef.current = null;
          }
          onDone();
        };
        utt.onend = finish;
        utt.onerror = finish;
        ttsSafetyTimerRef.current = setTimeout(
          finish,
          Math.max(2200, Math.min(12000, phrase.text.length * 220))
        );
        try {
          if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        } catch {}
        window.speechSynthesis.speak(utt);
      } catch {
        onDone();
      }
    },
    [isZh]
  );

  const pumpTtsQueue = useCallback(
    async (epoch: number) => {
      if (epoch !== turnEpochRef.current || ttsDrainingRef.current) return;
      const nextItem = ttsQueueRef.current.shift();
      if (!nextItem) {
        if (ttsStreamDoneRef.current) {
          isTtsSpeakingRef.current = false;
          currentSpokenTextRef.current = '';
          if (sessionActiveRef.current) setPhase('listening');
          const cb = ttsDoneCallbackRef.current;
          ttsDoneCallbackRef.current = null;
          cb?.();
        }
        return;
      }

      ttsDrainingRef.current = true;
      isTtsSpeakingRef.current = true;
      currentSpokenTextRef.current = nextItem.phrase.text;
      setPhase('speaking');

      const advanceNext = (pauseMs: number) => {
        if (epoch !== turnEpochRef.current) {
          ttsDrainingRef.current = false;
          return;
        }
        ttsPauseTimerRef.current = setTimeout(() => {
          ttsDrainingRef.current = false;
          if (epoch === turnEpochRef.current) {
            void pumpTtsQueue(epoch);
          }
        }, pauseMs);
      };

      const finishPhrase = () => {
        if (ttsSafetyTimerRef.current) {
          clearTimeout(ttsSafetyTimerRef.current);
          ttsSafetyTimerRef.current = null;
        }
        advanceNext(nextItem.phrase.pauseAfterMs);
      };

      // If browser already has a genuine neural voice (Edge Xiaoxiao/Jenny or Apple Enhanced), speak natively with expressive prosody
      const nativeVoice = preferredVoiceRef.current || pickSweetVoice(isZh);
      if (isAuthenticNeuralVoice(nativeVoice)) {
        speakPhraseViaBrowserSpeech(nextItem.phrase, finishPhrase);
        return;
      }

      // Use fast Google-backed neural MP3 audio (~165ms) with a generous 1750ms deadline before browser fallback
      const blobUrl = nextItem.audioPromise
        ? await Promise.race([
            nextItem.audioPromise,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 1750)),
          ])
        : null;
      if (epoch !== turnEpochRef.current) {
        ttsDrainingRef.current = false;
        return;
      }

      const audioEl = blobUrl ? ensureTtsAudioUnlocked() : null;
      if (blobUrl && audioEl) {
        try {
          if (ttsAudioCtxRef.current?.state === 'suspended') {
            await ttsAudioCtxRef.current.resume().catch(() => {});
          }
          audioEl.pause();
          audioEl.src = blobUrl;
          (audioEl as any).preservesPitch = true;
          (audioEl as any).webkitPreservesPitch = true;
          audioEl.playbackRate = nextItem.phrase.audioPlaybackRate || 1.16;
          audioEl.volume = 1;

          let settled = false;
          const onClipEnd = () => {
            if (settled) return;
            settled = true;
            audioEl.onended = null;
            audioEl.onerror = null;
            ttsBlobUrlsRef.current.delete(blobUrl);
            try {
              URL.revokeObjectURL(blobUrl);
            } catch {}
            finishPhrase();
          };
          const onClipError = () => {
            if (settled) return;
            settled = true;
            audioEl.onended = null;
            audioEl.onerror = null;
            speakPhraseViaBrowserSpeech(nextItem.phrase, finishPhrase);
          };

          audioEl.onended = onClipEnd;
          audioEl.onerror = onClipError;
          ttsSafetyTimerRef.current = setTimeout(
            onClipEnd,
            Math.max(2600, Math.min(14000, nextItem.phrase.text.length * 260))
          );

          await audioEl.play();
          return;
        } catch {
          if (ttsSafetyTimerRef.current) {
            clearTimeout(ttsSafetyTimerRef.current);
            ttsSafetyTimerRef.current = null;
          }
          audioEl.onended = null;
          audioEl.onerror = null;
          ttsBlobUrlsRef.current.delete(blobUrl);
          try {
            URL.revokeObjectURL(blobUrl);
          } catch {}
        }
      }

      speakPhraseViaBrowserSpeech(nextItem.phrase, finishPhrase);
    },
    [ensureTtsAudioUnlocked, isZh, speakPhraseViaBrowserSpeech]
  );

  const enqueueEmotionalText = useCallback(
    (rawText: string, epoch: number, explicitEmotion?: VoiceEmotion | null) => {
      if (epoch !== turnEpochRef.current) return;
      const cleaned = cleanSpeechSegment(rawText);
      if (!cleaned) return;

      const analysis = analyzeDialogueEmotion(
        currentUserTurnRef.current,
        cleaned,
        explicitEmotion
      );
      setActiveEmotion(analysis);

      const nativeNeural = isAuthenticNeuralVoice(preferredVoiceRef.current || pickSweetVoice(isZh));
      const phrases = buildExpressivePhrases(cleaned, analysis, nativeNeural ? 'speech' : 'audio');
      for (const phrase of phrases) {
        const audioPromise = nativeNeural ? null : prefetchNeuralAudioUrl(phrase);
        ttsQueueRef.current.push({ phrase, audioPromise });
      }
      void pumpTtsQueue(epoch);
    },
    [isZh, prefetchNeuralAudioUrl, pumpTtsQueue]
  );

  const speakDeepSeekReply = useCallback(
    (text: string, epoch: number, explicitEmotion?: VoiceEmotion | null, onDone?: () => void) => {
      if (epoch !== turnEpochRef.current) return;
      stopOutputAudio();
      const extracted = extractEmotionTag(text);
      const cleaned = cleanSpeechSegment(extracted.text);
      if (!cleaned) {
        onDone?.();
        return;
      }
      ttsStreamDoneRef.current = true;
      ttsDoneCallbackRef.current = onDone || null;
      enqueueEmotionalText(cleaned.slice(0, 420), epoch, explicitEmotion || extracted.emotion);
    },
    [enqueueEmotionalText, stopOutputAudio]
  );

  const runDeepSeekTurn = useCallback(
    async (userText: string) => {
      const clean = userText.trim();
      if (!clean) return;

      // Clear any pending speculative music resume timer because a real voice turn has committed
      if (speculativePauseTimerRef.current) {
        clearTimeout(speculativePauseTimerRef.current);
        speculativePauseTimerRef.current = null;
      }
      // Supersede any active speaking or streaming turn immediately (true instant barge-in)
      const myEpoch = interruptCurrentTurn();
      explicitStopMusicRef.current = false;
      currentUserTurnRef.current = clean;
      isSendingRef.current = true;
      const shouldSpeak = sessionActiveRef.current;

      if (/^(休眠|退出语音|关闭语音|别听我说话|go to sleep|stop listening)$/i.test(clean)) {
        try { localStorage.setItem('one-voice-always-on:v1', '0'); } catch {}
        stopSessionResources();
        return;
      }

      historyRef.current = [...historyRef.current.slice(-20), { role: 'user', content: clean }];
      const priorHistory = historyRef.current.slice(0, -1);

      // 1. Instant local command dispatch (<1ms, zero network wait) with context-aware anti-hijack guard
      const instantAction = parseInstantAgentAction(clean, isZh, priorHistory);
      if (instantAction && instantAction.type !== 'none') {
        const isMusicAction = instantAction.type === 'play_music';
        if (!isMusicAction) {
          pauseMusicForVoice();
        }
        const executed = executeParsedAction(instantAction, clean.toLowerCase());
        if (!executed) {
          if (myEpoch === turnEpochRef.current) {
            isSendingRef.current = false;
            setPhase(sessionActiveRef.current ? 'listening' : 'idle');
            if (!isMusicAction) resumeMusicIfPausedForVoice();
          }
          return;
        }
        const extractedReply = extractEmotionTag(instantAction.reply);
        historyRef.current = [...historyRef.current.slice(-20), { role: 'assistant', content: extractedReply.text }];
        const isMediaPlayback =
          (instantAction.type === 'play_music' && !instantAction.control) ||
          (instantAction.type === 'play_music' && (instantAction.control === 'resume' || instantAction.control === 'next' || instantAction.control === 'prev')) ||
          instantAction.type === 'watch_documentary';

        if (shouldSpeak && !isMediaPlayback) {
          speakDeepSeekReply(extractedReply.text, myEpoch, extractedReply.emotion, () => {
            if (myEpoch === turnEpochRef.current) {
              isSendingRef.current = false;
              setPhase(sessionActiveRef.current ? 'listening' : 'idle');
              if (!isMusicAction) resumeMusicIfPausedForVoice();
            }
          });
        } else {
          if (isMediaPlayback) stopOutputAudio();
          if (myEpoch === turnEpochRef.current) {
            isSendingRef.current = false;
            setPhase(sessionActiveRef.current ? 'listening' : 'idle');
          }
        }
        return;
      }

      // Pause active music while user converses with One., and resume automatically afterward
      pauseMusicForVoice();

      // 2. Exact Precision Solver (<1ms, 100% mathematically/factually exact — zero hallucination)
      const precision = solvePrecisionQuery(clean, isZh);
      if (precision) {
        historyRef.current = [...historyRef.current.slice(-20), { role: 'assistant', content: precision.answer }];
        if (shouldSpeak) {
          speakDeepSeekReply(precision.answer, myEpoch, precision.emotion, () => {
            if (myEpoch === turnEpochRef.current) {
              isSendingRef.current = false;
              setPhase(sessionActiveRef.current ? 'listening' : 'idle');
              resumeMusicIfPausedForVoice();
            }
          });
        } else {
          stopOutputAudio();
          isSendingRef.current = false;
          setPhase('idle');
          resumeMusicIfPausedForVoice();
        }
        return;
      }

      // 3. Instant natural conversation (<1ms, responds immediately to greetings & daily chat)
      const banterRaw = priorHistory.length === 0 ? matchPureSocialBanter(clean, isZh) : null;
      if (banterRaw) {
        const banterParsed = extractEmotionTag(banterRaw);
        historyRef.current = [...historyRef.current.slice(-20), { role: 'assistant', content: banterParsed.text }];
        if (shouldSpeak) {
          speakDeepSeekReply(banterParsed.text, myEpoch, banterParsed.emotion, () => {
            if (myEpoch === turnEpochRef.current) {
              isSendingRef.current = false;
              setPhase(sessionActiveRef.current ? 'listening' : 'idle');
              resumeMusicIfPausedForVoice();
            }
          });
        } else {
          stopOutputAudio();
          isSendingRef.current = false;
          setPhase('idle');
          resumeMusicIfPausedForVoice();
        }
        return;
      }

      // 4. Live DeepSeek-V3 / WebSocket / Live Knowledge Engine streaming turn with AbortController barge-in
      setPhase('thinking');
      stopOutputAudio();
      ttsStreamDoneRef.current = false;
      ttsDoneCallbackRef.current = () => {
        if (myEpoch === turnEpochRef.current) {
          isSendingRef.current = false;
          setPhase(sessionActiveRef.current ? 'listening' : 'idle');
          resumeMusicIfPausedForVoice();
        }
      };

      const controller = new AbortController();
      activeFetchAbortRef.current = controller;

      const activeDeepSeekModel = modelIdRef.current.startsWith('deepseek')
        ? modelIdRef.current
        : 'deepseek-v3';

      try {
        let rawReply = '';
        let actionResolved = false;
        let mediaActionTriggered = false;
        let spokenOffset = 0;
        let detectedEmotion: VoiceEmotion | null = null;

        const handleStreamDelta = (delta: string) => {
          if (myEpoch !== turnEpochRef.current) return;
          rawReply += delta;

          const trimmedStart = rawReply.trimStart();
          const waitingForBracket =
            trimmedStart.startsWith('[') && !trimmedStart.includes(']]') && trimmedStart.length < 180;
          if (!actionResolved && waitingForBracket) return;

          const parsed = extractInlineAgentDirective(rawReply);
          if (!actionResolved) {
            actionResolved = true;
            if (parsed.action && parsed.action.type !== 'none') {
              executeParsedAction(parsed.action);
              if (
                (parsed.action.type === 'play_music' && !parsed.action.control) ||
                (parsed.action.type === 'play_music' && parsed.action.control === 'resume') ||
                parsed.action.type === 'watch_documentary'
              ) {
                mediaActionTriggered = true;
                stopOutputAudio();
              }
            }
          }

          if (!shouldSpeak || mediaActionTriggered) return;

          const spokenTrim = parsed.spokenText.trimStart();
          if (spokenTrim.startsWith('[[EMO:') && !spokenTrim.includes(']]') && spokenTrim.length < 40) {
            return;
          }

          const emoExtracted = extractEmotionTag(parsed.spokenText);
          if (emoExtracted.emotion) detectedEmotion = emoExtracted.emotion;

          const display = emoExtracted.text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '');
          const unuttered = display.slice(spokenOffset);
          if (!unuttered) return;

          const breakMatch = unuttered.match(/^([\s\S]*?[。！？!?;；\n]|[\s\S]{4,}?[，,、])/);
          if (breakMatch) {
            const segment = breakMatch[1];
            spokenOffset += segment.length;
            enqueueEmotionalText(segment, myEpoch, detectedEmotion);
          }
        };

        const ws = liveWsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          const turnId = `ws_${myEpoch}_${Date.now()}`;
          await new Promise<{ rawReply: string }>((resolve, reject) => {
            wsPendingTurnRef.current = {
              turnId,
              epoch: myEpoch,
              resolve: (out) => resolve(out),
              reject,
              onDelta: handleStreamDelta,
              rawReply: '',
            };
            ws.send(
              JSON.stringify({
                type: 'turn:input',
                turnId,
                text: clean,
                modelId: activeDeepSeekModel,
                mode: 'voice-agent',
                maxTokens: 200,
                profileKey: profileKeyRef.current,
                history: priorHistory.slice(-16),
              })
            );
          }).catch(async (wsErr) => {
            if (wsErr?.name === 'AbortError' || myEpoch !== turnEpochRef.current) throw wsErr;
            // Transparently fall back to HTTP NDJSON stream if WS dropped mid-turn
            rawReply = '';
            spokenOffset = 0;
            actionResolved = false;
            const res = await fetch('/api/ai/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                prompt: clean,
                modelId: activeDeepSeekModel,
                mode: 'voice-agent',
                maxTokens: 200,
                stream: true,
                profileKey: profileKeyRef.current,
                history: priorHistory.slice(-16),
              }),
            });
            await readAIStream(res, handleStreamDelta);
          });
        } else {
          const res = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              prompt: clean,
              modelId: activeDeepSeekModel,
              mode: 'voice-agent',
              maxTokens: 200,
              stream: true,
              profileKey: profileKeyRef.current,
              history: priorHistory.slice(-16),
            }),
          });
          await readAIStream(res, handleStreamDelta);
        }

        if (myEpoch !== turnEpochRef.current) return;
        activeFetchAbortRef.current = null;

        const finalParsed = extractInlineAgentDirective(rawReply);
        if (!actionResolved && finalParsed.action && finalParsed.action.type !== 'none') {
          executeParsedAction(finalParsed.action);
          if (
            (finalParsed.action.type === 'play_music' && !finalParsed.action.control) ||
            (finalParsed.action.type === 'play_music' && finalParsed.action.control === 'resume') ||
            finalParsed.action.type === 'watch_documentary'
          ) {
            mediaActionTriggered = true;
            stopOutputAudio();
          }
        }

        const emoFinal = extractEmotionTag(finalParsed.spokenText.replace(/<think>[\s\S]*?<\/think>/g, '').trim());
        const resolvedEmotion = emoFinal.emotion || detectedEmotion;
        const cleanedReply = emoFinal.text.trim();
        const fallbackParsed = extractEmotionTag(resolveConversationalFallback(clean, isZh));
        const finalText = cleanedReply || fallbackParsed.text;
        const finalEmotion = resolvedEmotion || fallbackParsed.emotion;

        historyRef.current = [...historyRef.current.slice(-20), { role: 'assistant', content: finalText }];

        if (!shouldSpeak || mediaActionTriggered) {
          stopOutputAudio();
          isSendingRef.current = false;
          setPhase(sessionActiveRef.current ? 'listening' : 'idle');
          if (!mediaActionTriggered) resumeMusicIfPausedForVoice();
          return;
        }

        ttsStreamDoneRef.current = true;
        const remainder = cleanedReply ? cleanedReply.slice(spokenOffset) : finalText;
        if (cleanSpeechSegment(remainder)) {
          enqueueEmotionalText(remainder, myEpoch, finalEmotion);
        } else if (!ttsDrainingRef.current && ttsQueueRef.current.length === 0) {
          ttsDoneCallbackRef.current = null;
          isSendingRef.current = false;
          setPhase(sessionActiveRef.current ? 'listening' : 'idle');
          resumeMusicIfPausedForVoice();
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || myEpoch !== turnEpochRef.current) {
          return;
        }
        activeFetchAbortRef.current = null;
        const fallbackRaw = resolveConversationalFallback(
          clean,
          isZh,
          err instanceof Error ? err.message : undefined
        );
        const fallbackParsed = extractEmotionTag(fallbackRaw);
        historyRef.current = [...historyRef.current.slice(-20), { role: 'assistant', content: fallbackParsed.text }];
        if (shouldSpeak) {
          speakDeepSeekReply(fallbackParsed.text, myEpoch, fallbackParsed.emotion, () => {
            if (myEpoch === turnEpochRef.current) {
              isSendingRef.current = false;
              setPhase(sessionActiveRef.current ? 'listening' : 'idle');
              resumeMusicIfPausedForVoice();
            }
          });
        } else {
          stopOutputAudio();
          isSendingRef.current = false;
          setPhase('idle');
          resumeMusicIfPausedForVoice();
        }
      }
    },
    [
      enqueueEmotionalText,
      executeParsedAction,
      interruptCurrentTurn,
      isZh,
      pauseMusicForVoice,
      resumeMusicIfPausedForVoice,
      speakDeepSeekReply,
      stopOutputAudio,
      stopSessionResources,
    ]
  );

  const runDeepSeekTurnRef = useRef(runDeepSeekTurn);
  runDeepSeekTurnRef.current = runDeepSeekTurn;

  // Instant Continuous Voice Session with Real-Time Barge-In & Self-Healing Watchdog
  const startDeepSeekVoiceSession = useCallback(() => {
    stopSessionResources();

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setVoiceActive(false);
      setPhase('error');
      errorResetTimerRef.current = setTimeout(() => {
        if (!sessionActiveRef.current) setPhase('idle');
      }, 2800);
      return;
    }

    sessionActiveRef.current = true;
    recRetryDelayRef.current = 180;
    setVoiceActive(true);
    setPhase('connecting');
    ensureLiveWs();

    // Unlock BOTH HTMLAudioElement + Web Speech Synthesis synchronously when inside user gesture
    ensureTtsAudioUnlocked();
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const primer = new SpeechSynthesisUtterance('');
        primer.volume = 0;
        window.speechSynthesis.speak(primer);
      }
    } catch {}

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isAppleTouch =
      /iPad|iPhone|iPod/i.test(ua) ||
      (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const scheduleLaunch = (delayMs: number) => {
      if (!sessionActiveRef.current) return;
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
      }
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        launchRecognizer();
      }, delayMs);
    };

    const launchRecognizer = () => {
      if (!sessionActiveRef.current) return;
      if (recStateRef.current === 'starting' || recStateRef.current === 'running') return;

      if (recognitionRef.current) {
        try {
          recognitionRef.current.onstart = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.abort?.();
        } catch {}
        recognitionRef.current = null;
      }

      try {
        recStateRef.current = 'starting';
        const rec = new SpeechRec();
        rec.lang = isZhRef.current ? 'zh-CN' : 'en-US';
        rec.continuous = !isAppleTouch;
        rec.interimResults = true;

        rec.onstart = () => {
          recStateRef.current = 'running';
          recRetryDelayRef.current = 180;
          if (sessionActiveRef.current && !isTtsSpeakingRef.current && !isSendingRef.current) {
            setPhase('listening');
          }
        };

        let interimActionTimer: ReturnType<typeof setTimeout> | null = null;

        rec.onresult = (e: any) => {
          if (!sessionActiveRef.current) return;
          let interim = '';
          let finalSegment = '';
          let minFinalConf = 1;
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            const conf = Number(res[0]?.confidence ?? 0);
            if (res.isFinal) {
              finalSegment += res[0].transcript;
              if (conf > 0 && conf < minFinalConf) minFinalConf = conf;
            } else {
              interim += res[0].transcript;
            }
          }

          const normClean = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
          const spokenNorm = normClean(currentSpokenTextRef.current);
          const interimClean = interim.trim();
          const finalClean = finalSegment.trim();
          const liveZh = isZhRef.current;
          const musicNowPlaying = Boolean(playerRef.current?.state.isPlaying || isMusicPlayingRef.current);

          const isEchoOfAi =
            isTtsSpeakingRef.current &&
            interimClean.length < 12 &&
            spokenNorm &&
            normClean(interimClean).length >= 2 &&
            spokenNorm.includes(normClean(interimClean));

          const interimAction = interimClean.length >= 2
            ? parseInstantAgentAction(interimClean, liveZh, historyRef.current)
            : null;
          const isPureTransportInterim = Boolean(
            interimAction && interimAction.type === 'play_music' && interimAction.control
          );
          const instantInterimMatch = Boolean(
            interimClean.length >= 2 &&
              (isPureTransportInterim ||
                solvePrecisionQuery(interimClean, liveZh) ||
                (historyRef.current.length === 0 && matchPureSocialBanter(interimClean, liveZh)))
          );

          const looksLikeIntentWhileMusic =
            instantInterimMatch ||
            Boolean(interimAction) ||
            /^(one|你好|在吗|停止|停下|暂停|下一首|换歌|今天|现在|帮我|我在)/i.test(interimClean) ||
            interimClean.length >= 4;

          // Real-time Barge-In: only pause music eagerly on clear speech (never stray 2-char lyrics)
          if (interimClean.length >= 2 && !isEchoOfAi) {
            if (!musicNowPlaying || looksLikeIntentWhileMusic) {
              pauseMusicForVoice(true);
            }
            if (isTtsSpeakingRef.current || isSendingRef.current) {
              interruptCurrentTurn();
            }
          }

          if (interimActionTimer) {
            clearTimeout(interimActionTimer);
            interimActionTimer = null;
          }

          if (finalClean) {
            const now = Date.now();
            const prevNorm = normClean(lastHandledFinalRef.current.text);
            const curNorm = normClean(finalClean);
            if (
              curNorm &&
              prevNorm &&
              now - lastHandledFinalRef.current.at < 2600 &&
              (curNorm === prevNorm || (prevNorm.length >= 2 && curNorm.startsWith(prevNorm)))
            ) {
              return;
            }
            if (
              isTtsSpeakingRef.current &&
              spokenNorm &&
              curNorm.length >= 3 &&
              spokenNorm.includes(curNorm)
            ) {
              return;
            }
            if (
              musicNowPlaying &&
              curNorm.length <= 2 &&
              minFinalConf > 0 &&
              minFinalConf < 0.42 &&
              !parseInstantAgentAction(finalClean, liveZh, historyRef.current) &&
              !matchPureSocialBanter(finalClean, liveZh)
            ) {
              return;
            }
            lastHandledFinalRef.current = { text: finalClean, at: now };
            void runDeepSeekTurnRef.current(finalClean);
            return;
          }

          // Speculative fast commit: only 160ms on unambiguous transport stop/next; 480ms quiet pause for conversational thoughts
          if (interimClean.length >= 2 && !isEchoOfAi) {
            const commitDelay = isPureTransportInterim ? 160 : (!musicNowPlaying || interimClean.length >= 4) ? 480 : 0;
            if (commitDelay > 0) {
              interimActionTimer = setTimeout(() => {
                if (!sessionActiveRef.current) return;
                const prevNorm = normClean(lastHandledFinalRef.current.text);
                const curNorm = normClean(interimClean);
                if (
                  curNorm &&
                  prevNorm &&
                  Date.now() - lastHandledFinalRef.current.at < 2600 &&
                  curNorm === prevNorm
                ) {
                  return;
                }
                lastHandledFinalRef.current = { text: interimClean, at: Date.now() };
                void runDeepSeekTurnRef.current(interimClean);
              }, commitDelay);
            }
          }
        };

        rec.onerror = (e: any) => {
          recStateRef.current = 'stopped';
          if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
            sessionActiveRef.current = false;
            setVoiceActive(false);
            setPhase('error');
            errorResetTimerRef.current = setTimeout(() => {
              if (!sessionActiveRef.current) setPhase('idle');
            }, 3000);
            return;
          }
          if (sessionActiveRef.current) {
            const waitMs = e?.error === 'audio-capture' || e?.error === 'network' ? 360 : 180;
            scheduleLaunch(waitMs);
          }
        };

        rec.onend = () => {
          recStateRef.current = 'stopped';
          if (interimActionTimer) {
            clearTimeout(interimActionTimer);
            interimActionTimer = null;
          }
          if (sessionActiveRef.current) {
            scheduleLaunch(isAppleTouch ? 200 : 150);
          }
        };

        recognitionRef.current = rec;
        rec.start();
      } catch {
        recStateRef.current = 'stopped';
        if (sessionActiveRef.current) {
          const delay = recRetryDelayRef.current;
          recRetryDelayRef.current = Math.min(1200, delay + 150);
          scheduleLaunch(delay);
        }
      }
    };

    launchRecognizer();

    // 2s keepalive watchdog guarantees continuous active listening + WS heartbeat
    recKeepaliveTimerRef.current = setInterval(() => {
      if (!sessionActiveRef.current) return;
      ensureLiveWs();
      if (liveWsRef.current && liveWsRef.current.readyState === WebSocket.OPEN) {
        try { liveWsRef.current.send(JSON.stringify({ type: 'ping' })); } catch {}
      }
      if (recStateRef.current === 'stopped' && !restartTimerRef.current) {
        launchRecognizer();
      } else if (phaseRef.current === 'connecting' && recStateRef.current === 'running') {
        if (!isTtsSpeakingRef.current && !isSendingRef.current) {
          setPhase('listening');
        }
      }
    }, 2000);
  }, [ensureLiveWs, ensureTtsAudioUnlocked, interruptCurrentTurn, pauseMusicForVoice, stopSessionResources]);

  // Auto-resume continuous listening on load if mic permission was already granted and user has not turned it off
  const autoStartTriedRef = useRef(false);
  useEffect(() => {
    if (autoStartTriedRef.current || typeof window === 'undefined') return;
    autoStartTriedRef.current = true;
    try {
      if (localStorage.getItem('one-voice-always-on:v1') === '0') return;
    } catch {}
    const navPerms = (navigator as any)?.permissions;
    if (navPerms?.query) {
      navPerms
        .query({ name: 'microphone' })
        .then((status: PermissionStatus) => {
          if (status.state === 'granted' && !sessionActiveRef.current) {
            startDeepSeekVoiceSession();
          }
        })
        .catch(() => {});
    }
  }, [startDeepSeekVoiceSession]);

  // Unlock audio output cleanly on first user interaction whenever always-on listening is running
  useEffect(() => {
    const unlockOnce = () => {
      if (sessionActiveRef.current) {
        ensureTtsAudioUnlocked();
      }
    };
    window.addEventListener('pointerdown', unlockOnce, { passive: true, capture: true });
    window.addEventListener('keydown', unlockOnce, { passive: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', unlockOnce, true);
      window.removeEventListener('keydown', unlockOnce, true);
    };
  }, [ensureTtsAudioUnlocked]);

  const handleLauncherClick = () => {
    if (suppressClickRef.current) return;
    if (voiceActive || sessionActiveRef.current) {
      try {
        localStorage.setItem('one-voice-always-on:v1', '0');
      } catch {}
      stopSessionResources();
    } else {
      try {
        localStorage.setItem('one-voice-always-on:v1', '1');
      } catch {}
      player?.unlockAudio();
      ensureTtsAudioUnlocked();
      startDeepSeekVoiceSession();
    }
  };

  const handleOrbPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    dragStateRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: launcherPos.x,
      origY: launcherPos.y,
      moved: false,
    };
    suppressClickRef.current = false;
  };

  const handleOrbPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const ds = dragStateRef.current;
    if (!ds.active || ds.pointerId !== e.pointerId) return;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    if (!ds.moved && Math.hypot(dx, dy) > 5) {
      ds.moved = true;
      setIsDragging(true);
    }
    if (ds.moved) {
      setLauncherPos(clampLauncherPos(ds.origX + dx, ds.origY + dy));
    }
  };

  const finishOrbDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const ds = dragStateRef.current;
    if (!ds.active || ds.pointerId !== e.pointerId) return;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
    const wasMoved = ds.moved;
    ds.active = false;
    ds.pointerId = null;
    ds.moved = false;
    setIsDragging(false);
    if (wasMoved) {
      suppressClickRef.current = true;
      const finalPos = clampLauncherPos(
        ds.origX + (e.clientX - ds.startX),
        ds.origY + (e.clientY - ds.startY)
      );
      setLauncherPos(finalPos);
      try {
        localStorage.setItem('earth-one-ai-launcher-pos:v1', JSON.stringify(finalPos));
      } catch {}
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 60);
    }
  };

  const activePillLabel = (() => {
    if (!voiceActive && phase !== 'error') {
      return showUnifiedMusicControls && currentTrack?.title ? currentTrack.title : 'One.';
    }
    switch (phase) {
      case 'connecting':
        return isZh ? 'One. · 连接中' : 'One. · Connecting';
      case 'listening':
        return isZh ? 'One. · 聆听中' : 'One. · Listening';
      case 'thinking':
        return isZh ? 'One. · 思考中' : 'One. · Thinking';
      case 'speaking':
        return isZh ? 'One. · 对话中' : 'One. · Speaking';
      case 'error':
        return isZh ? 'One. · 需麦克风' : 'One. · Mic Needed';
      default:
        return 'One.';
    }
  })();

  const glowColors = [
    'shadow-[0_0_24px_rgba(56,189,248,0.48)]',
    'shadow-[0_0_24px_rgba(192,132,252,0.48)]',
    'shadow-[0_0_24px_rgba(244,114,182,0.48)]',
    'shadow-[0_0_24px_rgba(251,191,36,0.48)]',
    'shadow-[0_0_24px_rgba(52,211,153,0.48)]',
  ];

  const activeBorderClass =
    phase === 'listening'
      ? 'border-emerald-400/75 shadow-[0_0_24px_rgba(52,211,153,0.32)]'
      : phase === 'speaking'
      ? 'border-sky-300/80 shadow-[0_0_26px_rgba(142,207,255,0.42)]'
      : phase === 'connecting' || phase === 'thinking'
      ? 'border-[#69B8FF]/80 shadow-[0_0_24px_rgba(105,184,255,0.32)]'
      : phase === 'error'
      ? 'border-rose-400/75 shadow-[0_0_20px_rgba(248,113,113,0.28)]'
      : showUnifiedMusicControls && isMusicPlaying
      ? `border-white/25 ${glowColors[auroraIdx]}`
      : 'border-white/18 shadow-[0_14px_38px_rgba(0,0,0,0.68)] hover:border-[#8ECFFF]/60';

  if (!showLauncher && !canRunAudioSession) return null;

  const trackTitle = currentTrack?.title || (isZh ? '正在播放' : 'Now Playing');
  const trackArtist = currentTrack?.artist || 'ONE Music';
  const trackCover = currentTrack?.coverUrl || DEFAULT_MUSIC_COVER;
  const trackSource = currentTrack?.source || currentTrack?.playback.provider || 'YouTube / Bilibili';

  const displayCornerLeft =
    showUnifiedMusicControls && typeof window !== 'undefined'
      ? Math.min(launcherPos.x, Math.max(10, window.innerWidth - 220))
      : launcherPos.x;

  const renderMusicPopover = () =>
    showUnifiedMusicControls && musicPopoverOpen ? (
      <div className="mb-3 w-[min(88vw,288px)] rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 shadow-xl backdrop-blur-2xl dark:border-white/15 dark:bg-[#162238]/95">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{trackTitle}</div>
            <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">{trackArtist}</span>
              <span aria-hidden="true">·</span>
              <span className="shrink-0">{trackSource}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMusicPopoverOpen(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
            title={isZh ? '收起' : 'Close'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {liveEmbedSrc && showMiniVideo && (
          <div
            ref={popoverStageAnchorRef}
            className="mt-2.5 aspect-video w-full overflow-hidden rounded-xl bg-slate-950"
          />
        )}

        <div className="mt-3 flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                explicitStopMusicRef.current = false;
                pausedMusicForVoiceRef.current = false;
                player?.playPrevious();
              }}
              className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
              title={isZh ? '上一首' : 'Previous'}
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                explicitStopMusicRef.current = false;
                pausedMusicForVoiceRef.current = false;
                player?.unlockAudio();
                void player?.resumeAudioContext();
                player?.togglePlay();
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
              title={isMusicPlaying ? (isZh ? '暂停' : 'Pause') : (isZh ? '播放' : 'Play')}
            >
              {isMusicPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
            </button>
            <button
              type="button"
              onClick={() => {
                explicitStopMusicRef.current = false;
                pausedMusicForVoiceRef.current = false;
                player?.playNext();
              }}
              className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
              title={isZh ? '下一首' : 'Next'}
            >
              <SkipForward className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            {liveEmbedSrc && (
              <button
                type="button"
                onClick={() => setShowMiniVideo((v) => !v)}
                className={`flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl transition ${
                  showMiniVideo
                    ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10'
                }`}
                title={isZh ? '切换画面' : 'Toggle video'}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMusicPopoverOpen(false);
                onNavigateTab?.('venus');
              }}
              className="flex min-h-[38px] items-center gap-1 rounded-xl px-2.5 text-xs font-medium text-sky-600 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/15 whitespace-nowrap"
            >
              <span>{isZh ? '打开音乐' : 'Open'}</span>
              <ExternalLink className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => {
                explicitStopMusicRef.current = true;
                pausedMusicForVoiceRef.current = false;
                setMusicPopoverOpen(false);
                player?.stopAndHold();
              }}
              className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl text-rose-500 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/15"
              title={isZh ? '停止播放' : 'Stop'}
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <>
      {/* Single persistent YouTube / Bilibili player iframe hosted inside One. across all pages */}
      {canRunAudioSession && liveEmbedSrc && (
        <div
          style={
            stageRect
              ? {
                  position: 'fixed',
                  top: `${stageRect.top}px`,
                  left: `${stageRect.left}px`,
                  width: `${stageRect.width}px`,
                  height: `${stageRect.height}px`,
                  zIndex: isOnVenus ? 20 : 52,
                }
              : {
                  position: 'fixed',
                  bottom: '8px',
                  left: '8px',
                  width: '2px',
                  height: '2px',
                  opacity: 0.01,
                  pointerEvents: 'none',
                  zIndex: 0,
                }
          }
          className={stageRect ? 'overflow-hidden rounded-2xl bg-slate-950' : 'overflow-hidden'}
        >
          <iframe
            ref={embedIframeRef}
            key={currentTrack?.id || liveEmbedSrc}
            title={trackTitle}
            src={liveEmbedSrc}
            className="h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}

      {showLauncher && (
        placement === 'center-bottom' ? (
          <div
            id="globe-ai-launcher"
            className="fixed bottom-[calc(5.1rem+env(safe-area-inset-bottom))] md:bottom-7 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center select-none"
          >
            {renderMusicPopover()}
            <div
              className={`inline-flex min-h-[46px] items-center gap-1.5 rounded-full border bg-[#070B16]/86 backdrop-blur-2xl p-1 transition-all duration-500 ${activeBorderClass}`}
            >
              <button
                type="button"
                onClick={handleLauncherClick}
                aria-label="One."
                aria-pressed={voiceActive}
                className="group relative inline-flex h-9 items-center gap-2 rounded-full pl-1.5 pr-3 transition-transform hover:scale-[1.02] active:scale-95 cursor-pointer"
              >
                <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.04] border border-white/12">
                  {showUnifiedMusicControls && (
                    <span
                      className={`one-wrist-aurora absolute -inset-[2px] rounded-full opacity-90 pointer-events-none ${
                        isMusicPlaying ? '' : '[animation-play-state:paused] opacity-40'
                      }`}
                    />
                  )}
                  <canvas ref={orbCanvasRef} className="relative z-10 pointer-events-none h-7 w-7 rounded-full bg-[#070B16]" />
                </span>
                <span className="max-w-[138px] truncate text-xs font-semibold tracking-[0.08em] text-[#F7F5F0]">
                  {activePillLabel}
                </span>
              </button>

              {showUnifiedMusicControls && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      explicitStopMusicRef.current = false;
                      pausedMusicForVoiceRef.current = false;
                      player?.unlockAudio();
                      void player?.resumeAudioContext();
                      player?.togglePlay();
                    }}
                    title={isMusicPlaying ? (isZh ? '暂停音乐' : 'Pause') : (isZh ? '播放音乐' : 'Play')}
                    aria-label={isMusicPlaying ? (isZh ? '暂停音乐' : 'Pause') : (isZh ? '播放音乐' : 'Play')}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/90 transition hover:bg-white/20 cursor-pointer"
                  >
                    {isMusicPlaying ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      explicitStopMusicRef.current = false;
                      pausedMusicForVoiceRef.current = false;
                      player?.playNext();
                    }}
                    title={isZh ? '换下一首' : 'Next song'}
                    aria-label={isZh ? '换下一首' : 'Next song'}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/90 transition hover:bg-white/20 cursor-pointer"
                  >
                    <SkipForward className="h-3.5 w-3.5 fill-current" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMusicPopoverOpen((o) => !o)}
                    title={isZh ? '音乐详情' : 'Music details'}
                    aria-label={isZh ? '音乐详情' : 'Music details'}
                    className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-slate-900 cursor-pointer hover:scale-105 transition"
                  >
                    {trackCover ? (
                      <img
                        src={trackCover}
                        alt=""
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          if (!e.currentTarget.dataset.fallback) {
                            e.currentTarget.dataset.fallback = '1';
                            e.currentTarget.src = DEFAULT_MUSIC_COVER;
                          }
                        }}
                        className={`h-full w-full object-cover ${isMusicPlaying ? 'animate-[spin_10s_linear_infinite]' : ''}`}
                      />
                    ) : (
                      <Disc3 className={`h-4 w-4 text-sky-300 ${isMusicPlaying ? 'animate-spin' : ''}`} />
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div
            id="globe-ai-launcher"
            style={{ left: `${displayCornerLeft}px`, top: `${launcherPos.y}px` }}
            className="fixed z-40 flex flex-col items-start select-none"
          >
            {renderMusicPopover()}
            <div
              className={`inline-flex items-center gap-1 rounded-full border bg-[#070B16]/86 backdrop-blur-2xl p-1 transition-all duration-500 ${activeBorderClass}`}
            >
              <button
                type="button"
                onPointerDown={handleOrbPointerDown}
                onPointerMove={handleOrbPointerMove}
                onPointerUp={finishOrbDrag}
                onPointerCancel={finishOrbDrag}
                onClick={handleLauncherClick}
                style={{ touchAction: 'none' }}
                aria-label="One."
                aria-pressed={voiceActive}
                title={activePillLabel}
                className={`group relative flex h-10 w-10 items-center justify-center rounded-full transition-transform ${
                  isDragging
                    ? 'scale-110 cursor-grabbing ring-2 ring-[#8ECFFF]/60'
                    : 'cursor-pointer hover:scale-105 active:scale-95'
                }`}
              >
                {showUnifiedMusicControls && (
                  <span
                    className={`one-wrist-aurora absolute inset-0 rounded-full opacity-95 pointer-events-none ${
                      isMusicPlaying ? '' : '[animation-play-state:paused] opacity-40'
                    }`}
                  />
                )}
                <canvas ref={orbCanvasRef} className="relative z-10 pointer-events-none h-9 w-9 rounded-full bg-[#070B16]" />
              </button>

              {showUnifiedMusicControls && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      explicitStopMusicRef.current = false;
                      pausedMusicForVoiceRef.current = false;
                      player?.unlockAudio();
                      void player?.resumeAudioContext();
                      player?.togglePlay();
                    }}
                    title={isMusicPlaying ? (isZh ? '暂停音乐' : 'Pause') : (isZh ? '播放音乐' : 'Play')}
                    aria-label={isMusicPlaying ? (isZh ? '暂停音乐' : 'Pause') : (isZh ? '播放音乐' : 'Play')}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/90 transition hover:bg-white/20 cursor-pointer"
                  >
                    {isMusicPlaying ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      explicitStopMusicRef.current = false;
                      pausedMusicForVoiceRef.current = false;
                      player?.playNext();
                    }}
                    title={isZh ? '换下一首' : 'Next song'}
                    aria-label={isZh ? '换下一首' : 'Next song'}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/90 transition hover:bg-white/20 cursor-pointer"
                  >
                    <SkipForward className="h-3.5 w-3.5 fill-current" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMusicPopoverOpen((o) => !o)}
                    title={trackTitle}
                    aria-label={isZh ? '音乐详情' : 'Music details'}
                    className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-slate-900 cursor-pointer hover:scale-105 transition"
                  >
                    {trackCover ? (
                      <img
                        src={trackCover}
                        alt=""
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          if (!e.currentTarget.dataset.fallback) {
                            e.currentTarget.dataset.fallback = '1';
                            e.currentTarget.src = DEFAULT_MUSIC_COVER;
                          }
                        }}
                        className={`h-full w-full object-cover ${isMusicPlaying ? 'animate-[spin_10s_linear_infinite]' : ''}`}
                      />
                    ) : (
                      <Disc3 className={`h-4 w-4 text-sky-300 ${isMusicPlaying ? 'animate-spin' : ''}`} />
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        )
      )}
    </>
  );
};
