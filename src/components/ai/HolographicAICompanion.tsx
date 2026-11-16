import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Mic, Radio, X, Zap } from 'lucide-react';
import type { Language } from '../../types/index.ts';
import { useOptionalPlayerContext } from '../../music/PlayerContext.tsx';
import { readAIStream } from '../../utils/aiStream.ts';
import {
  mapGeminiToolCallToAgentAction,
  resolveConversationalFallback,
  resolveNaturalAgentAction,
  type OneAgentAction,
} from '../../utils/oneAgentController.ts';
import {
  readVoiceListeningMode,
  readVoiceSpeechSettings,
  subscribeVoiceListeningMode,
  writeVoiceListeningMode,
  type VoiceListeningMode,
} from '../../utils/voiceModeSettings.ts';

interface HolographicAICompanionProps {
  lang: Language;
  onFlyTo?: (lat: number, lng: number) => void;
  onExploreUniverse?: () => void;
  onOpenAIHub?: () => void;
  onNavigateTab?: (tab: string) => void;
  onPlayMusicAction?: (opts: { query?: string; crawl?: boolean }) => void;
  onWatchDocumentaryAction?: (opts: { query: string; platform?: 'all' | 'bilibili' | 'youtube'; randomPick?: boolean }) => void;
  onBrowserSearchAction?: (query: string) => void;
  onExecuteAction?: (action: OneAgentAction) => void;
  onSetTheme?: (theme: 'light' | 'dark') => void;
  onSetLang?: (lang: 'zh' | 'en') => void;
  currentTab?: string;
  siteContext?: Record<string, unknown>;
  showLauncher?: boolean;
  placement?: 'corner' | 'center-bottom';
}

type VoicePhase = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';

interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

const readVoiceSettings = readVoiceSpeechSettings;

function downsampleTo16kInt16(input: Float32Array, inputSampleRate: number): Int16Array {
  const targetRate = 16000;
  let samples: Float32Array;
  if (inputSampleRate === targetRate) {
    samples = input;
  } else {
    const ratio = inputSampleRate / targetRate;
    const newLength = Math.max(1, Math.round(input.length / ratio));
    samples = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < newLength) {
      const nextOffsetBuffer = Math.min(input.length, Math.round((offsetResult + 1) * ratio));
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer; i++) {
        accum += input[i];
        count++;
      }
      samples[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
  }

  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return pcm;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function int16ToWavBase64(chunks: Int16Array[], sampleRate = 16000): string {
  let totalSamples = 0;
  for (const c of chunks) totalSamples += c.length;
  const dataByteLength = totalSamples * 2;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataByteLength, true);

  let byteOffset = 44;
  for (const c of chunks) {
    for (let i = 0; i < c.length; i++) {
      view.setInt16(byteOffset, c[i], true);
      byteOffset += 2;
    }
  }
  return bytesToBase64(new Uint8Array(buffer));
}

function decodePcm24kBase64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const byteLen = binary.length;
  const bytes = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(byteLen / 2);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }
  return float32;
}

export const HolographicAICompanion: React.FC<HolographicAICompanionProps> = ({
  lang,
  onFlyTo,
  onExploreUniverse,
  onNavigateTab,
  onPlayMusicAction,
  onWatchDocumentaryAction,
  onBrowserSearchAction,
  onExecuteAction,
  onSetTheme,
  onSetLang,
  currentTab,
  siteContext,
  showLauncher = true,
  placement = 'corner',
}) => {
  const isZh = lang === 'zh';
  const player = useOptionalPlayerContext();
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [voiceActive, setVoiceActive] = useState(false);
  const [listeningMode, setListeningMode] = useState<VoiceListeningMode>(() => readVoiceListeningMode());
  const listeningModeRef = useRef<VoiceListeningMode>(listeningMode);
  listeningModeRef.current = listeningMode;
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [serverLatencyMs, setServerLatencyMs] = useState<number | null>(null);
  const [liveThinkingMs, setLiveThinkingMs] = useState<number>(0);
  const [modelId, setModelId] = useState('gemini-3.1-flash-lite');

  useEffect(() => {
    return subscribeVoiceListeningMode((nextMode) => {
      setListeningMode(nextMode);
    });
  }, []);

  const toggleListeningMode = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    const next: VoiceListeningMode =
      listeningModeRef.current === 'always-listening' ? 'click-to-speak' : 'always-listening';
    writeVoiceListeningMode(next);
    setListeningMode(next);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.getVoices?.();
      } catch {}
    }
    let cancelled = false;
    fetch('/api/ai/models')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.success || !Array.isArray(data.models)) return;
        const preferred =
          data.models.find((m: { id: string; isDefault?: boolean; status?: string }) => m.isDefault && m.status === 'active') ||
          data.models.find((m: { id: string }) => m.id.startsWith('gemini')) ||
          data.models[0];
        if (preferred?.id) setModelId(preferred.id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
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

  // Core audio & duplex voice session refs
  const phaseRef = useRef<VoicePhase>('idle');
  phaseRef.current = phase;
  const sessionActiveRef = useRef(false);
  const wsModeRef = useRef<'connecting' | 'live' | 'duplex' | 'browser-fallback'>('connecting');
  const liveWsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextStartTimeRef = useRef<number>(0);
  const vadBurstCountRef = useRef<number>(0);

  // Instant barge-in audio suppression & latency stopwatch refs
  const bargeInSuppressAudioRef = useRef(false);
  const bargeInAtRef = useRef(0);
  const turnSentAtRef = useRef<number | null>(null);
  const turnLatencyCapturedRef = useRef(false);

  // Client-side VAD utterance recorder (used when wsMode === 'duplex')
  const preRollRef = useRef<Int16Array[]>([]);
  const utteranceChunksRef = useRef<Int16Array[]>([]);
  const isCapturingSpeechRef = useRef(false);
  const speechStartedAtRef = useRef(0);
  const lastVoiceAtRef = useRef(0);
  const peakRmsRef = useRef(0);

  // Fallback SpeechRecognition + TTS refs
  const recognitionRef = useRef<any>(null);
  const recognitionRunningRef = useRef(false);
  const isSendingRef = useRef(false);
  const isTtsSpeakingRef = useRef(false);
  const ttsQueueRef = useRef<string[]>([]);
  const ttsSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSpokenAtRef = useRef(0);
  const lastExecutedActionRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const modelIdRef = useRef(modelId);
  modelIdRef.current = modelId;
  const historyRef = useRef<HistoryTurn[]>([]);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickToSpeakTurnSentRef = useRef(false);
  const awaitingReplyAfterSendRef = useRef(false);

  const siteContextRef = useRef<Record<string, unknown>>({});
  siteContextRef.current = {
    currentTab: currentTab || 'globe',
    lang,
    playingTrack: player?.currentTrack?.title || null,
    isPlaying: Boolean(player?.state?.isPlaying),
    ...(siteContext || {}),
  };

  useEffect(() => {
    const ws = liveWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'context', context: siteContextRef.current }));
      } catch {}
    }
  }, [currentTab, lang, siteContext, player?.state?.isPlaying, player?.currentTrack?.title]);

  // Live latency stopwatch while AI is processing speech -> generating first response
  useEffect(() => {
    if (!voiceActive || phase !== 'thinking') {
      setLiveThinkingMs(0);
      return;
    }
    if (turnSentAtRef.current === null) {
      turnSentAtRef.current = performance.now();
    }
    const timer = setInterval(() => {
      if (turnSentAtRef.current !== null) {
        setLiveThinkingMs(Math.max(1, Math.round(performance.now() - turnSentAtRef.current)));
      }
    }, 45);
    return () => clearInterval(timer);
  }, [voiceActive, phase]);

  // Render 3D wireframe orb driven smoothly by voice phase (crisp cobalt/emerald/amber on light frosted shell)
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
      color: 0x0284c7,
      wireframe: true,
      transparent: true,
      opacity: 0.92,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    scene.add(coreMesh);

    const nucGeo = new THREE.SphereGeometry(0.35, 16, 16);
    const nucMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const nucMesh = new THREE.Mesh(nucGeo, nucMat);
    scene.add(nucMesh);

    const colorTarget = new THREE.Color(0x0284c7);
    let rafId = 0;
    let t = 0;
    let active = true;

    const animate = () => {
      if (!active || document.hidden) return;
      rafId = requestAnimationFrame(animate);
      const currentPhase = phaseRef.current;
      let energy = 0.08;
      if (currentPhase === 'listening') {
        colorTarget.setHex(0x059669);
        energy = 0.28 + 0.2 * Math.sin(t * 4.5);
      } else if (currentPhase === 'speaking' || isTtsSpeakingRef.current) {
        colorTarget.setHex(0xd97706);
        energy = 0.52 + 0.28 * Math.sin(t * 10);
      } else if (currentPhase === 'connecting' || currentPhase === 'thinking') {
        colorTarget.setHex(0x0ea5e9);
        energy = 0.36 + 0.16 * Math.cos(t * 6.5);
      } else if (currentPhase === 'error') {
        colorTarget.setHex(0xe11d48);
        energy = 0.12;
      } else {
        colorTarget.setHex(0x0284c7);
      }
      coreMat.color.lerp(colorTarget, 0.16);
      const speedBoost = sessionActiveRef.current ? 1.2 + energy * 1.45 : 1;
      t += 0.025 * speedBoost;
      coreMesh.rotation.y += 0.018 * speedBoost;
      coreMesh.rotation.x += 0.008 * speedBoost;
      const s = 1 + Math.sin(t * 2.6) * 0.07 + energy * 0.24;
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

  // Execute ANY structured full-website action triggered by AI voice or tool call
  const dispatchSiteAction = useCallback(
    (action: OneAgentAction) => {
      if (!action || action.type === 'none') return;

      if (action.type === 'play_music') {
        if (action.control === 'next') {
          player?.playNext();
          return;
        }
        if (action.control === 'prev') {
          player?.playPrevious();
          return;
        }
        if (action.control === 'stop' || action.control === 'pause') {
          player?.stopAndHold();
          return;
        }
        if (action.control === 'resume' && player?.currentTrack) {
          player.unlockAudio();
          void player.resumeAudioContext();
          player.play();
          return;
        }
        player?.unlockAudio();
      }

      if (onExecuteAction) {
        onExecuteAction(action);
        return;
      }

      if (action.type === 'play_music') {
        if (onPlayMusicAction) onPlayMusicAction({ query: action.query, crawl: action.crawl ?? true });
        else onNavigateTab?.('venus');
      } else if (action.type === 'watch_documentary') {
        if (onWatchDocumentaryAction) {
          onWatchDocumentaryAction({
            query: action.query,
            platform: action.platform,
            randomPick: action.randomPick ?? true,
          });
        } else {
          onNavigateTab?.('saturn');
        }
      } else if (action.type === 'browser_search') {
        if (onBrowserSearchAction) onBrowserSearchAction(action.query);
        else onNavigateTab?.('browser');
      } else if (action.type === 'fly_to') {
        if (onFlyTo) onFlyTo(action.lat, action.lng);
        else onNavigateTab?.('globe');
      } else if (action.type === 'set_theme') {
        onSetTheme?.(action.theme);
      } else if (action.type === 'set_language') {
        onSetLang?.(action.lang);
      } else if (action.type === 'navigate_tab') {
        if (onNavigateTab) onNavigateTab(action.tab);
        else if (action.tab === 'universe') onExploreUniverse?.();
      }
    },
    [
      onBrowserSearchAction,
      onExecuteAction,
      onExploreUniverse,
      onFlyTo,
      onNavigateTab,
      onPlayMusicAction,
      onSetLang,
      onSetTheme,
      onWatchDocumentaryAction,
      player,
    ]
  );

  // Immediately silence all queued 24kHz PCM & SpeechSynthesis audio (used for barge-in interruption!)
  const stopOutputAudio = useCallback(() => {
    ttsQueueRef.current = [];
    if (ttsSafetyTimerRef.current) {
      clearTimeout(ttsSafetyTimerRef.current);
      ttsSafetyTimerRef.current = null;
    }

    for (const src of activeSourcesRef.current) {
      try {
        src.onended = null;
        src.stop(0);
        src.disconnect();
      } catch {}
    }
    activeSourcesRef.current = [];
    if (outputAudioCtxRef.current) {
      nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    isTtsSpeakingRef.current = false;
  }, []);

  const triggerImmediateBargeIn = useCallback(() => {
    bargeInSuppressAudioRef.current = true;
    bargeInAtRef.current = Date.now();
    isSendingRef.current = false;
    vadBurstCountRef.current = 0;
    turnSentAtRef.current = null;
    turnLatencyCapturedRef.current = false;
    clickToSpeakTurnSentRef.current = false;
    awaitingReplyAfterSendRef.current = false;
    stopOutputAudio();
    if (sessionActiveRef.current) {
      setPhase('listening');
    }
    const ws = liveWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'barge_in' }));
      } catch {}
    }
  }, [stopOutputAudio]);

  const stopSessionResources = useCallback(() => {
    sessionActiveRef.current = false;
    isSendingRef.current = false;
    vadBurstCountRef.current = 0;
    bargeInSuppressAudioRef.current = false;
    isCapturingSpeechRef.current = false;
    preRollRef.current = [];
    utteranceChunksRef.current = [];
    recognitionRunningRef.current = false;
    turnSentAtRef.current = null;
    turnLatencyCapturedRef.current = false;
    clickToSpeakTurnSentRef.current = false;
    awaitingReplyAfterSendRef.current = false;

    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (errorResetTimerRef.current) {
      clearTimeout(errorResetTimerRef.current);
      errorResetTimerRef.current = null;
    }

    stopOutputAudio();

    if (processorNodeRef.current) {
      try {
        processorNodeRef.current.onaudioprocess = null;
        processorNodeRef.current.disconnect();
      } catch {}
      processorNodeRef.current = null;
    }

    if (micStreamRef.current) {
      try {
        micStreamRef.current.getTracks().forEach((tr) => tr.stop());
      } catch {}
      micStreamRef.current = null;
    }

    if (inputAudioCtxRef.current) {
      try {
        void inputAudioCtxRef.current.close();
      } catch {}
      inputAudioCtxRef.current = null;
    }

    if (outputAudioCtxRef.current) {
      try {
        void outputAudioCtxRef.current.close();
      } catch {}
      outputAudioCtxRef.current = null;
    }

    if (liveWsRef.current) {
      try {
        liveWsRef.current.onclose = null;
        liveWsRef.current.onerror = null;
        liveWsRef.current.onmessage = null;
        liveWsRef.current.close();
      } catch {}
      liveWsRef.current = null;
    }

    if (recognitionRef.current) {
      try {
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
  }, [stopOutputAudio]);

  useEffect(() => {
    return () => {
      stopSessionResources();
    };
  }, [stopSessionResources]);

  const schedulePcm24kChunk = useCallback((base64Data: string) => {
    const ctx = outputAudioCtxRef.current;
    if (!ctx || !sessionActiveRef.current) return;
    if (bargeInSuppressAudioRef.current) {
      if (Date.now() - bargeInAtRef.current < 1500) {
        return;
      }
      bargeInSuppressAudioRef.current = false;
    }
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const floatData = decodePcm24kBase64ToFloat32(base64Data);
    if (floatData.length === 0) return;

    const audioBuffer = ctx.createBuffer(1, floatData.length, 24000);
    audioBuffer.getChannelData(0).set(floatData);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now + 0.015, nextStartTimeRef.current);
    nextStartTimeRef.current = startAt + audioBuffer.duration;

    activeSourcesRef.current.push(source);
    isTtsSpeakingRef.current = true;
    setPhase('speaking');

    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
      if (activeSourcesRef.current.length === 0) {
        isTtsSpeakingRef.current = false;
        lastSpokenAtRef.current = Date.now();
        if (
          listeningModeRef.current === 'click-to-speak' &&
          clickToSpeakTurnSentRef.current &&
          !awaitingReplyAfterSendRef.current
        ) {
          stopSessionResources();
          return;
        }
        if (sessionActiveRef.current && phaseRef.current === 'speaking') {
          setPhase('listening');
        }
      }
    };

    source.start(startAt);
  }, [stopSessionResources]);

  // Browser TTS fallback with sequential sentence queue (instantly interruptible!)
  const speakFallbackReply = useCallback(
    (text: string, onDone?: () => void, queueIfBusy = false) => {
      if (bargeInSuppressAudioRef.current && Date.now() - bargeInAtRef.current < 1500) {
        onDone?.();
        return;
      }
      bargeInSuppressAudioRef.current = false;

      const clean = text
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/[*_#`>]/g, '')
        .trim();
      if (!clean) {
        onDone?.();
        return;
      }

      if (queueIfBusy && isTtsSpeakingRef.current) {
        ttsQueueRef.current.push(clean);
        onDone?.();
        return;
      }

      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        isTtsSpeakingRef.current = false;
        if (sessionActiveRef.current) setPhase('listening');
        onDone?.();
        return;
      }

      const playUtterance = (segment: string) => {
        if (!sessionActiveRef.current || bargeInSuppressAudioRef.current) {
          isTtsSpeakingRef.current = false;
          onDone?.();
          return;
        }
        try {
          const utt = new SpeechSynthesisUtterance(segment.slice(0, 480));
          const vs = readVoiceSettings();
          utt.lang = isZh ? 'zh-CN' : 'en-US';
          utt.rate = vs.rate;
          utt.pitch = vs.pitch;
          try {
            const voices = window.speechSynthesis.getVoices?.() || [];
            const langPrefix = isZh ? 'zh' : 'en';
            const preferred =
              voices.find(
                (v) =>
                  v.lang?.toLowerCase().startsWith(langPrefix) &&
                  /natural|neural|premium|xiaoxiao|yunxi|samantha|google|microsoft/i.test(v.name)
              ) || voices.find((v) => v.lang?.toLowerCase().startsWith(langPrefix));
            if (preferred) utt.voice = preferred;
          } catch {}

          isTtsSpeakingRef.current = true;
          setPhase('speaking');
          let finished = false;
          const finalize = () => {
            if (finished) return;
            finished = true;
            if (ttsSafetyTimerRef.current) {
              clearTimeout(ttsSafetyTimerRef.current);
              ttsSafetyTimerRef.current = null;
            }
            if (bargeInSuppressAudioRef.current) {
              isTtsSpeakingRef.current = false;
              ttsQueueRef.current = [];
              onDone?.();
              return;
            }
            const nextSegment = ttsQueueRef.current.shift();
            if (nextSegment && sessionActiveRef.current) {
              playUtterance(nextSegment);
              return;
            }
            isTtsSpeakingRef.current = false;
            lastSpokenAtRef.current = Date.now();
            if (
              listeningModeRef.current === 'click-to-speak' &&
              clickToSpeakTurnSentRef.current &&
              !awaitingReplyAfterSendRef.current
            ) {
              stopSessionResources();
              onDone?.();
              return;
            }
            if (sessionActiveRef.current && phaseRef.current === 'speaking') {
              setPhase('listening');
            }
            onDone?.();
          };
          utt.onend = finalize;
          utt.onerror = finalize;
          const safetyMs = Math.max(3000, Math.min(18000, segment.length * 220));
          ttsSafetyTimerRef.current = setTimeout(finalize, safetyMs);
          window.speechSynthesis.speak(utt);
        } catch {
          isTtsSpeakingRef.current = false;
          if (sessionActiveRef.current) setPhase('listening');
          onDone?.();
        }
      };

      try {
        window.speechSynthesis.cancel();
        ttsQueueRef.current = [];
        if (ttsSafetyTimerRef.current) {
          clearTimeout(ttsSafetyTimerRef.current);
          ttsSafetyTimerRef.current = null;
        }
        playUtterance(clean);
      } catch {
        isTtsSpeakingRef.current = false;
        if (sessionActiveRef.current) setPhase('listening');
        onDone?.();
      }
    },
    [isZh, stopSessionResources]
  );

  // Last-resort browser SpeechRecognition turn
  const runFallbackTurn = useCallback(
    async (userText: string) => {
      const clean = userText.trim();
      if (!clean || isSendingRef.current) return;
      isSendingRef.current = true;
      bargeInSuppressAudioRef.current = false;
      turnSentAtRef.current = performance.now();
      turnLatencyCapturedRef.current = false;
      historyRef.current = [...historyRef.current.slice(-5), { role: 'user', content: clean }];
      setPhase('thinking');

      const recordFallbackLatency = () => {
        if (!turnLatencyCapturedRef.current && turnSentAtRef.current !== null) {
          turnLatencyCapturedRef.current = true;
          setLatencyMs(Math.max(1, Math.round(performance.now() - turnSentAtRef.current)));
        }
      };

      try {
        const normalizedKey = clean.toLowerCase();
        const now = Date.now();
        let action: OneAgentAction = { type: 'none' };
        if (
          normalizedKey &&
          !(
            lastExecutedActionRef.current.key === normalizedKey &&
            now - lastExecutedActionRef.current.at < 2200
          )
        ) {
          action = await resolveNaturalAgentAction(clean, isZh, siteContextRef.current);
          if (action.type !== 'none') {
            lastExecutedActionRef.current = { key: normalizedKey, at: now };
            recordFallbackLatency();
            dispatchSiteAction(action);
          }
        }

        if (action.type !== 'none') {
          const actionReply = action.reply;
          historyRef.current = [...historyRef.current.slice(-5), { role: 'assistant', content: actionReply }];
          const isMediaPlayback =
            (action.type === 'play_music' && !action.control) ||
            (action.type === 'play_music' && action.control === 'resume') ||
            action.type === 'watch_documentary';
          if (!isMediaPlayback && sessionActiveRef.current) {
            speakFallbackReply(actionReply, () => {
              isSendingRef.current = false;
            });
          } else {
            if (isMediaPlayback) stopOutputAudio();
            isSendingRef.current = false;
            if (sessionActiveRef.current) setPhase('listening');
          }
          return;
        }

        const contextHint = `[当前界面:${currentTab || 'globe'}|语言:${isZh ? 'zh' : 'en'}] `;
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: contextHint + clean,
            modelId: modelIdRef.current,
            mode: 'companion',
            stream: true,
            history: historyRef.current.slice(-6),
          }),
        });

        let fullReply = '';
        await readAIStream(res, (delta) => {
          if (delta) recordFallbackLatency();
          fullReply += delta;
        });
        recordFallbackLatency();
        const cleanedReply = fullReply.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        const finalText = cleanedReply || resolveConversationalFallback(clean, isZh);
        historyRef.current = [...historyRef.current.slice(-5), { role: 'assistant', content: finalText }];

        if (sessionActiveRef.current) {
          speakFallbackReply(finalText, () => {
            isSendingRef.current = false;
          });
        } else {
          isSendingRef.current = false;
        }
      } catch (err) {
        const fallbackText = resolveConversationalFallback(
          clean,
          isZh,
          err instanceof Error ? err.message : undefined
        );
        historyRef.current = [...historyRef.current.slice(-5), { role: 'assistant', content: fallbackText }];
        if (sessionActiveRef.current) {
          speakFallbackReply(fallbackText, () => {
            isSendingRef.current = false;
          });
        } else {
          isSendingRef.current = false;
        }
      }
    },
    [currentTab, dispatchSiteAction, isZh, speakFallbackReply, stopOutputAudio]
  );

  // Last-resort browser SpeechRecognition loop (with instant proactive greeting & continuous listening!)
  const startBrowserFallbackSession = useCallback(() => {
    wsModeRef.current = 'browser-fallback';

    // Immediately greet user out loud so One. starts speaking right when clicked!
    const greeting = isZh ? '我在呢，请说。' : "I'm listening, go ahead.";
    speakFallbackReply(greeting);

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      return;
    }

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isAppleTouch =
      /iPad|iPhone|iPod/i.test(ua) ||
      (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const launchRecognizer = () => {
      if (!sessionActiveRef.current || recognitionRunningRef.current) return;
      try {
        const rec = new SpeechRec();
        rec.lang = isZh ? 'zh-CN' : 'en-US';
        rec.continuous = !isAppleTouch && listeningModeRef.current === 'always-listening';
        rec.interimResults = true;

        rec.onstart = () => {
          recognitionRunningRef.current = true;
          if (sessionActiveRef.current && !isTtsSpeakingRef.current && !isSendingRef.current) {
            setPhase('listening');
          }
        };

        rec.onresult = (e: any) => {
          if (!sessionActiveRef.current) return;
          let interim = '';
          let finalSegment = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            if (res.isFinal) finalSegment += res[0].transcript;
            else interim += res[0].transcript;
          }

          if ((interim.trim().length >= 2 || finalSegment.trim()) && isTtsSpeakingRef.current) {
            if (Date.now() - lastSpokenAtRef.current > 160) {
              triggerImmediateBargeIn();
            }
          }

          if (finalSegment.trim()) {
            clickToSpeakTurnSentRef.current = true;
            awaitingReplyAfterSendRef.current = true;
            void runFallbackTurn(finalSegment.trim()).finally(() => {
              awaitingReplyAfterSendRef.current = false;
              if (
                listeningModeRef.current === 'click-to-speak' &&
                !isTtsSpeakingRef.current &&
                activeSourcesRef.current.length === 0
              ) {
                stopSessionResources();
              }
            });
          }
        };

        rec.onerror = (e: any) => {
          recognitionRunningRef.current = false;
          if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
            stopSessionResources();
            setPhase('error');
          }
        };

        rec.onend = () => {
          recognitionRunningRef.current = false;
          if (
            sessionActiveRef.current &&
            (listeningModeRef.current === 'always-listening' || !clickToSpeakTurnSentRef.current)
          ) {
            restartTimerRef.current = setTimeout(launchRecognizer, isAppleTouch ? 360 : 180);
          }
        };

        recognitionRef.current = rec;
        rec.start();
      } catch {
        recognitionRunningRef.current = false;
      }
    };

    launchRecognizer();
  }, [isZh, runFallbackTurn, speakFallbackReply, stopSessionResources, triggerImmediateBargeIn]);

  // Primary: Start True Full-Duplex Voice Session immediately on click
  const startDuplexVoiceSession = useCallback(async () => {
    stopSessionResources();
    sessionActiveRef.current = true;
    wsModeRef.current = 'connecting';
    turnSentAtRef.current = performance.now();
    turnLatencyCapturedRef.current = false;
    setLatencyMs(null);
    setServerLatencyMs(null);
    setVoiceActive(true);
    setPhase('connecting');

    // CRITICAL: Create & unlock AudioContexts synchronously inside the user's click event
    // BEFORE any await, so Chrome/Safari/iOS autoplay policies allow immediate voice output!
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    let inputCtx: AudioContext;
    let outputCtx: AudioContext;
    try {
      inputCtx = new AudioCtx();
      outputCtx = new AudioCtx({ sampleRate: 24000 });
      inputAudioCtxRef.current = inputCtx;
      outputAudioCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;
      if (inputCtx.state === 'suspended') void inputCtx.resume();
      if (outputCtx.state === 'suspended') void outputCtx.resume();
    } catch {
      sessionActiveRef.current = false;
      setVoiceActive(false);
      setPhase('error');
      return;
    }

    // 1. Request microphone with hardware echo cancellation so user can talk & interrupt freely
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      micStreamRef.current = stream;
    } catch {
      stopSessionResources();
      setPhase('error');
      errorResetTimerRef.current = setTimeout(() => {
        if (!sessionActiveRef.current) setPhase('idle');
      }, 2800);
      return;
    }

    if (!sessionActiveRef.current) {
      stream.getTracks().forEach((tr) => tr.stop());
      return;
    }

    // 2. Connect persistent bidirectional WebSocket to /ws/ai-live (with instant greeting)
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws/ai-live?lang=${encodeURIComponent(isZh ? 'zh' : 'en')}&tab=${encodeURIComponent(currentTab || 'globe')}&greet=1`;
    const ws = new WebSocket(wsUrl);
    liveWsRef.current = ws;

    let fellBackToBrowser = false;
    const triggerBrowserFallback = () => {
      if (fellBackToBrowser || !sessionActiveRef.current) return;
      fellBackToBrowser = true;
      try {
        ws.close();
      } catch {}
      liveWsRef.current = null;
      startBrowserFallbackSession();
    };

    const connectTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        triggerBrowserFallback();
      }
    }, 4500);

    ws.onopen = () => {
      clearTimeout(connectTimeout);
      if (!sessionActiveRef.current) {
        ws.close();
        return;
      }
      ws.send(JSON.stringify({ type: 'context', context: siteContextRef.current }));
    };

    ws.onmessage = (event) => {
      if (!sessionActiveRef.current) return;
      try {
        const msg = JSON.parse(event.data);
        const captureClientLatency = (explicitServerMs?: number) => {
          if (typeof explicitServerMs === 'number' && explicitServerMs > 0) {
            setServerLatencyMs(Math.round(explicitServerMs));
          }
          if (!turnLatencyCapturedRef.current && turnSentAtRef.current !== null) {
            turnLatencyCapturedRef.current = true;
            setLatencyMs(Math.max(1, Math.round(performance.now() - turnSentAtRef.current)));
          }
        };

        if (msg.type === 'ready') {
          wsModeRef.current = msg.mode === 'duplex' ? 'duplex' : 'live';
          captureClientLatency();
          if (phaseRef.current === 'connecting') {
            setPhase('listening');
          }
        } else if (msg.type === 'latency_metric') {
          captureClientLatency(typeof msg.firstTokenMs === 'number' ? msg.firstTokenMs : undefined);
        } else if (msg.type === 'audio' && typeof msg.data === 'string') {
          captureClientLatency(typeof msg.latencyMs === 'number' ? msg.latencyMs : undefined);
          schedulePcm24kChunk(msg.data);
        } else if (msg.type === 'fallback_tts' && typeof msg.text === 'string') {
          captureClientLatency(typeof msg.latencyMs === 'number' ? msg.latencyMs : undefined);
          speakFallbackReply(msg.text, undefined, true);
        } else if (msg.type === 'interrupted') {
          bargeInSuppressAudioRef.current = false;
          stopOutputAudio();
          setPhase('listening');
        } else if (msg.type === 'input_transcript' && typeof msg.text === 'string') {
          bargeInSuppressAudioRef.current = false;
        } else if (msg.type === 'output_transcript' && typeof msg.text === 'string') {
          captureClientLatency(typeof msg.latencyMs === 'number' ? msg.latencyMs : undefined);
        } else if (msg.type === 'turn_complete') {
          bargeInSuppressAudioRef.current = false;
          awaitingReplyAfterSendRef.current = false;
          if (activeSourcesRef.current.length === 0 && !isTtsSpeakingRef.current) {
            if (listeningModeRef.current === 'click-to-speak' && clickToSpeakTurnSentRef.current) {
              stopSessionResources();
            } else {
              setPhase('listening');
            }
          }
        } else if (msg.type === 'tool_call' && Array.isArray(msg.calls)) {
          captureClientLatency(typeof msg.latencyMs === 'number' ? msg.latencyMs : undefined);
          const responses: Array<{ id?: string; name: string; response: Record<string, unknown> }> = [];
          for (const call of msg.calls) {
            const mapped = mapGeminiToolCallToAgentAction(
              call.name,
              call.args || {},
              isZh
            );
            if (mapped.type !== 'none') {
              dispatchSiteAction(mapped);
            }
            responses.push({
              id: call.id,
              name: call.name,
              response: {
                ok: true,
                executedAction: mapped.type,
                summary: mapped.type !== 'none' ? mapped.reply : 'ok',
                currentContext: siteContextRef.current,
              },
            });
          }
          if (ws.readyState === WebSocket.OPEN && wsModeRef.current === 'live' && responses.length > 0) {
            ws.send(JSON.stringify({ type: 'tool_response', responses }));
          }
        } else if (msg.type === 'error') {
          triggerBrowserFallback();
        }
      } catch {}
    };

    ws.onerror = () => {
      clearTimeout(connectTimeout);
      triggerBrowserFallback();
    };

    ws.onclose = () => {
      clearTimeout(connectTimeout);
      if (sessionActiveRef.current && !fellBackToBrowser) {
        triggerBrowserFallback();
      }
    };

    // 3. Continuous mic PCM capture + sub-50ms Barge-In VAD + fast 360ms Duplex Utterance VAD
    const source = inputCtx.createMediaStreamSource(stream);
    const processor = inputCtx.createScriptProcessor(1024, 1, 1);
    processorNodeRef.current = processor;

    const silentGain = inputCtx.createGain();
    silentGain.gain.value = 0;
    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(inputCtx.destination);

    processor.onaudioprocess = (e) => {
      if (!sessionActiveRef.current) return;
      const samples = e.inputBuffer.getChannelData(0);

      let sumSq = 0;
      for (let i = 0; i < samples.length; i++) {
        sumSq += samples[i] * samples[i];
      }
      const rms = Math.sqrt(sumSq / samples.length);
      const now = Date.now();

      // Instant sub-50ms Barge-In: stop AI audio/thinking & reset state the instant user speaks!
      const isAiBusyOrSpeaking =
        activeSourcesRef.current.length > 0 ||
        isTtsSpeakingRef.current ||
        phaseRef.current === 'speaking' ||
        phaseRef.current === 'thinking';
      if (isAiBusyOrSpeaking && rms > 0.024) {
        vadBurstCountRef.current += 1;
        if (vadBurstCountRef.current >= 2) {
          vadBurstCountRef.current = 0;
          triggerImmediateBargeIn();
        }
      } else if (rms <= 0.018) {
        vadBurstCountRef.current = 0;
      }

      const activeWs = liveWsRef.current;
      if (!activeWs || activeWs.readyState !== WebSocket.OPEN || fellBackToBrowser) {
        return;
      }

      const int16 = downsampleTo16kInt16(samples, inputCtx.sampleRate);

      if (wsModeRef.current === 'live') {
        const b64 = bytesToBase64(
          new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength)
        );
        activeWs.send(JSON.stringify({ type: 'audio', data: b64 }));
        return;
      }

      if (wsModeRef.current === 'duplex') {
        if (listeningModeRef.current === 'click-to-speak' && clickToSpeakTurnSentRef.current) {
          return;
        }
        // Duplex Streaming Mode: 8-frame (~170ms) pre-roll + fast 200ms speech-end VAD
        if (!isCapturingSpeechRef.current) {
          preRollRef.current.push(int16);
          if (preRollRef.current.length > 8) preRollRef.current.shift();

          const threshold = isAiBusyOrSpeaking ? 0.024 : 0.017;
          if (rms > threshold) {
            isCapturingSpeechRef.current = true;
            speechStartedAtRef.current = now;
            lastVoiceAtRef.current = now;
            peakRmsRef.current = rms;
            utteranceChunksRef.current = [...preRollRef.current, int16];
            preRollRef.current = [];
            bargeInSuppressAudioRef.current = false;
          }
        } else {
          utteranceChunksRef.current.push(int16);
          if (rms > peakRmsRef.current) peakRmsRef.current = rms;
          if (rms > 0.015) {
            lastVoiceAtRef.current = now;
          }

          const elapsedSpeech = now - speechStartedAtRef.current;
          const silenceDuration = now - lastVoiceAtRef.current;
          if (silenceDuration > 200 || elapsedSpeech > 11000) {
            const chunks = utteranceChunksRef.current;
            utteranceChunksRef.current = [];
            isCapturingSpeechRef.current = false;

            let totalSamples = 0;
            for (const c of chunks) totalSamples += c.length;
            const durationMs = (totalSamples / 16000) * 1000;

            if (durationMs >= 150 && peakRmsRef.current >= 0.019) {
              const wavBase64 = int16ToWavBase64(chunks, 16000);
              turnSentAtRef.current = performance.now();
              turnLatencyCapturedRef.current = false;
              if (listeningModeRef.current === 'click-to-speak') {
                clickToSpeakTurnSentRef.current = true;
                awaitingReplyAfterSendRef.current = true;
              }
              setLiveThinkingMs(0);
              setPhase('thinking');
              activeWs.send(JSON.stringify({ type: 'audio_turn', data: wavBase64 }));
            }
          }
        }
      }
    };
  }, [
    currentTab,
    dispatchSiteAction,
    isZh,
    schedulePcm24kChunk,
    speakFallbackReply,
    startBrowserFallbackSession,
    stopOutputAudio,
    stopSessionResources,
    triggerImmediateBargeIn,
  ]);

  const handleLauncherClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!voiceActive) {
      void startDuplexVoiceSession();
      return;
    }
    if (phase === 'speaking' || phase === 'thinking') {
      triggerImmediateBargeIn();
      return;
    }
    stopSessionResources();
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
    if (!voiceActive && phase !== 'error') return 'One.';
    switch (phase) {
      case 'connecting':
        return isZh ? '接入中…' : 'Connecting…';
      case 'listening':
        return isZh ? '我在听' : 'Listening';
      case 'thinking':
        return isZh ? '响应中' : 'Thinking';
      case 'speaking':
        return isZh ? '点按/开口打断' : 'Tap/Speak Stop';
      case 'error':
        return isZh ? '需麦克风权限' : 'Mic Needed';
      default:
        return 'One.';
    }
  })();

  const displayedLatencyMs =
    phase === 'thinking'
      ? liveThinkingMs > 0
        ? liveThinkingMs
        : null
      : latencyMs;

  const latencyBadgeTone =
    displayedLatencyMs === null
      ? 'border-sky-200/90 bg-sky-50/95 text-sky-700'
      : displayedLatencyMs < 700
      ? 'border-emerald-300/90 bg-emerald-50/95 text-emerald-700'
      : displayedLatencyMs < 1400
      ? 'border-sky-300/90 bg-sky-50/95 text-sky-700'
      : 'border-amber-300/90 bg-amber-50/95 text-amber-700';

  const activeBorderClass =
    phase === 'listening'
      ? 'border-emerald-400/90 shadow-[0_10px_30px_rgba(16,185,129,0.28)]'
      : phase === 'speaking'
      ? 'border-amber-400/90 shadow-[0_10px_32px_rgba(245,158,11,0.32)]'
      : phase === 'connecting' || phase === 'thinking'
      ? 'border-sky-400/90 shadow-[0_10px_30px_rgba(14,165,233,0.30)]'
      : phase === 'error'
      ? 'border-rose-400/90 shadow-[0_10px_24px_rgba(244,63,94,0.25)]'
      : 'border-sky-200/90 shadow-[0_12px_32px_rgba(15,23,42,0.18)] hover:border-sky-300';

  if (!showLauncher) return null;

  const LatencyMonitorBadge = voiceActive ? (
    <span
      title={
        serverLatencyMs
          ? isZh
            ? `语音处理响应延迟: ${displayedLatencyMs ?? serverLatencyMs}ms (服务端: ${serverLatencyMs}ms)`
            : `Speech-to-response latency: ${displayedLatencyMs ?? serverLatencyMs}ms (Server: ${serverLatencyMs}ms)`
          : isZh
          ? '实时语音处理延迟监控'
          : 'Real-time voice latency monitor'
      }
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums transition-colors ${latencyBadgeTone}`}
    >
      <Zap className={`h-2.5 w-2.5 shrink-0 ${phase === 'thinking' ? 'animate-pulse' : ''}`} />
      <span>{displayedLatencyMs !== null ? `${displayedLatencyMs}ms` : isZh ? '实时' : 'LIVE'}</span>
    </span>
  ) : null;

  const ModeTogglePill = (
    <button
      type="button"
      onClick={toggleListeningMode}
      title={
        listeningMode === 'always-listening'
          ? isZh
            ? '当前：始终监听（声控实时打断）。点击切换为「点按说话」'
            : 'Mode: Always-listening (VAD). Click to switch to Click-to-speak'
          : isZh
          ? '当前：点按说话（说完一轮自动收声）。点击切换为「始终监听」'
          : 'Mode: Click-to-speak. Click to switch to Always-listening'
      }
      className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[10px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
        listeningMode === 'always-listening'
          ? 'border-sky-300/90 bg-sky-50/95 text-sky-700 hover:bg-sky-100'
          : 'border-slate-300/90 bg-white/95 text-slate-700 hover:bg-slate-100'
      }`}
    >
      {listeningMode === 'always-listening' ? (
        <Radio className="h-2.5 w-2.5 shrink-0 text-sky-600" />
      ) : (
        <Mic className="h-2.5 w-2.5 shrink-0 text-slate-600" />
      )}
      <span>
        {listeningMode === 'always-listening'
          ? isZh
            ? '持续监听'
            : 'Always'
          : isZh
          ? '点按说话'
          : 'Tap'}
      </span>
    </button>
  );

  return placement === 'center-bottom' ? (
    <div
      id="globe-ai-launcher"
      className="fixed bottom-[calc(5.1rem+env(safe-area-inset-bottom))] md:bottom-7 left-1/2 -translate-x-1/2 z-40 select-none"
    >
      <div
        className={`group inline-flex min-h-[44px] h-11 items-center gap-1.5 rounded-full border bg-gradient-to-r from-[#F9FCFF]/95 via-[#EFF7FF]/95 to-[#E5F2FF]/95 text-slate-800 backdrop-blur-xl pl-1.5 pr-2 transition-all ${activeBorderClass}`}
      >
        <button
          type="button"
          onClick={handleLauncherClick}
          aria-label="One."
          aria-pressed={voiceActive}
          className="inline-flex items-center gap-2 pr-1 cursor-pointer focus:outline-none"
        >
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white border border-sky-200/80 shadow-2xs">
            <canvas ref={orbCanvasRef} className="pointer-events-none h-7 w-7 rounded-full" />
          </span>
          <span className="text-xs font-semibold tracking-[0.06em] text-slate-800 whitespace-nowrap">
            {activePillLabel}
          </span>
        </button>

        {ModeTogglePill}
        {LatencyMonitorBadge}

        {voiceActive && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              stopSessionResources();
            }}
            aria-label={isZh ? '关闭语音' : 'Stop voice'}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200/75 text-slate-600 hover:bg-rose-100 hover:text-rose-600 transition cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  ) : (
    <div
      id="globe-ai-launcher"
      style={{ left: `${launcherPos.x}px`, top: `${launcherPos.y}px` }}
      className="fixed z-40 select-none"
    >
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1.5">
          {voiceActive && (
            <div className="inline-flex h-8 items-center gap-1.5 rounded-full border border-sky-200/90 bg-white/95 px-2.5 text-[11px] font-medium text-slate-700 backdrop-blur-xl shadow-md">
              <span className="whitespace-nowrap">{activePillLabel}</span>
              {ModeTogglePill}
              {LatencyMonitorBadge}
              <button
                type="button"
                onClick={stopSessionResources}
                aria-label={isZh ? '关闭语音' : 'Stop voice'}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-rose-100 hover:text-rose-600 transition cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

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
            className={`group relative flex h-12 w-12 items-center justify-center rounded-full border bg-gradient-to-br from-[#FAFDFF]/95 to-[#E5F2FF]/95 backdrop-blur-xl transition-transform ${activeBorderClass} ${
              isDragging
                ? 'scale-110 cursor-grabbing ring-2 ring-sky-400/70'
                : 'cursor-pointer hover:scale-105 active:scale-95'
            }`}
          >
            <canvas ref={orbCanvasRef} className="pointer-events-none h-10 w-10 rounded-full" />
          </button>
        </div>

        {!voiceActive && (
          <div className="flex justify-end pr-0.5">{ModeTogglePill}</div>
        )}
      </div>
    </div>
  );
};
