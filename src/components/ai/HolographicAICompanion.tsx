import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Mic,
  MicOff,
  PhoneOff,
  RotateCcw,
  Send,
  Volume2,
  X,
} from 'lucide-react';
import { Language } from '../../types/index.ts';
import { readAIStream } from '../../utils/aiStream.ts';
import { loadAIConversationHistory, saveAIConversationHistory } from '../../utils/aiSessionHistory.ts';

interface HolographicAICompanionProps {
  lang: Language;
  onFlyTo?: (lat: number, lng: number) => void;
  onExploreUniverse?: () => void;
  onNavigateTab?: (tab: string) => void;
  currentTab?: string;
  showLauncher?: boolean;
  placement?: 'center-bottom' | 'corner';
  openRequestSeq?: number;
}

interface MessageItem {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  time: string;
}

type VoicePhase =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'muted'
  | 'error';

function downsampleFloatTo16kPcmBase64(input: Float32Array, sourceRate: number): string {
  const targetRate = 16000;
  const ratio = sourceRate / targetRate;
  const targetLen = ratio <= 1 ? input.length : Math.floor(input.length / ratio);
  const pcm16 = new Int16Array(targetLen);
  for (let i = 0; i < targetLen; i++) {
    const srcIdx = ratio <= 1 ? i : i * ratio;
    const idx0 = Math.floor(srcIdx);
    const idx1 = Math.min(idx0 + 1, input.length - 1);
    const frac = srcIdx - idx0;
    const sample = input[idx0] * (1 - frac) + input[idx1] * frac;
    const clamped = Math.max(-1, Math.min(1, sample));
    pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function decodePcm24kBase64ToFloat(base64: string): Float32Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const pcm16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / 32768;
  }
  return float32;
}

export const HolographicAICompanion: React.FC<HolographicAICompanionProps> = ({
  lang,
  onExploreUniverse,
  onNavigateTab,
  showLauncher = true,
  placement = 'corner',
  openRequestSeq,
}) => {
  const isZh = lang === 'zh';
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [engineMode, setEngineMode] = useState<'live' | 'fallback'>('live');
  const [isMuted, setIsMuted] = useState(false);
  const [showTextInput, setShowTextInput] = useState(true);
  const [voiceActive, setVoiceActive] = useState(false);
  const [inputMsg, setInputMsg] = useState('');
  const [liveUserCaption, setLiveUserCaption] = useState('');
  const [liveAiCaption, setLiveAiCaption] = useState('');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [modelId, setModelId] = useState('gemini-2.5-flash');

  const initialGreeting = isZh
    ? '直接在下方输入即可对话，或点击麦克风开启实时语音。支持指令如「打开信息与通话」、「进入品牌规划」。'
    : 'Type below to chat right away, or tap the mic for live voice. Try "open messages" or "brand planning".';

  const [messages, setMessages] = useState<MessageItem[]>(() => {
    const saved = loadAIConversationHistory(
      'earth-one-ai-companion:v1',
      (value): value is MessageItem =>
        !!value &&
        typeof value === 'object' &&
        typeof (value as MessageItem).id === 'string' &&
        ((value as MessageItem).sender === 'ai' || (value as MessageItem).sender === 'user') &&
        typeof (value as MessageItem).text === 'string' &&
        typeof (value as MessageItem).time === 'string'
    );
    return saved.length ? saved.slice(-24) : [];
  });

  useEffect(() => {
    saveAIConversationHistory('earth-one-ai-companion:v1', messages.slice(-24));
  }, [messages]);

  // Fetch default backend chat model for fallback streaming
  useEffect(() => {
    let cancelled = false;
    fetch('/api/ai/models')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.success || !Array.isArray(data.models)) return;
        const preferred =
          data.models.find((m: any) => m.id === 'deepseek-r1-open') ||
          data.models.find((m: any) => m.ollamaRole === 'chat') ||
          data.models.find((m: any) => m.isDefault) ||
          data.models[0];
        if (preferred?.id) setModelId(preferred.id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Launcher Orb 3D canvas & drag positioning
  const orbCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hudWaveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const ORB_SIZE = 46;
  const clampLauncherPos = useCallback((x: number, y: number) => {
    if (typeof window === 'undefined') return { x: 16, y: 120 };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const minX = 10;
    const maxX = Math.max(minX, vw - ORB_SIZE - 10);
    const minY = 64;
    const maxY = Math.max(minY, vh - ORB_SIZE - (vw < 768 ? 78 : 18));
    return {
      x: Math.min(Math.max(x, minX), maxX),
      y: Math.min(Math.max(y, minY), maxY),
    };
  }, []);

  const [launcherPos, setLauncherPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === 'undefined') return { x: 16, y: 120 };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const defaultPos = {
      x: Math.max(10, vw - ORB_SIZE - (vw < 768 ? 14 : 22)),
      y: Math.max(64, vh - ORB_SIZE - (vw < 768 ? 84 : 22)),
    };
    try {
      const saved = localStorage.getItem('earth-one-ai-launcher-pos:v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
          const minX = 10;
          const maxX = Math.max(minX, vw - ORB_SIZE - 10);
          const minY = 64;
          const maxY = Math.max(minY, vh - ORB_SIZE - (vw < 768 ? 78 : 18));
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

  // Audio & Real-time Voice Refs (never stale in audio callbacks)
  const sessionActiveRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const outAnalyserRef = useRef<AnalyserNode | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const activeAudioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef(0);
  const isMutedRef = useRef(false);
  const micRmsRef = useRef(0);
  const liveReadyRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const isSendingFallbackRef = useRef(false);
  const isTtsSpeakingRef = useRef(false);
  const pendingUserTranscriptRef = useRef('');
  const pendingAiTranscriptRef = useRef('');
  const modelIdRef = useRef(modelId);
  const messagesRef = useRef(messages);

  isMutedRef.current = isMuted;
  modelIdRef.current = modelId;
  messagesRef.current = messages;

  // Render subtle 3D wireframe sphere on floating launcher orb
  useEffect(() => {
    if (isOpen || !showLauncher) return;
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
    const nucMat = new THREE.MeshBasicMaterial({ color: 0xcab07b });
    const nucMesh = new THREE.Mesh(nucGeo, nucMat);
    scene.add(nucMesh);

    let rafId = 0;
    let t = 0;
    let active = true;

    const animate = () => {
      if (!active || document.hidden) return;
      rafId = requestAnimationFrame(animate);
      t += 0.025;
      coreMesh.rotation.y += 0.018;
      coreMesh.rotation.x += 0.008;
      const s = 1 + Math.sin(t * 2.6) * 0.08;
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
  }, [isOpen, showLauncher, placement]);

  // Real audio-driven waveform visualizer when open
  useEffect(() => {
    if (!isOpen) return;
    const canvas = hudWaveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bars = 28;
    const smoothed = new Float32Array(bars);
    const bins = new Uint8Array(64);
    let rafId = 0;
    let alive = true;

    const renderWave = () => {
      if (!alive) return;
      rafId = requestAnimationFrame(renderWave);

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      let outFftReady = false;
      const outAnalyser = outAnalyserRef.current;
      if (outAnalyser && activeAudioSourcesRef.current.size > 0) {
        outAnalyser.getByteFrequencyData(bins);
        for (let i = 0; i < bars; i++) {
          if ((bins[i] || 0) > 2) {
            outFftReady = true;
            break;
          }
        }
      }

      const micEnergy = isMutedRef.current ? 0 : Math.min(1, micRmsRef.current * 4.5);
      const barW = 2.5;
      const gap = (w - bars * barW) / Math.max(1, bars - 1);

      for (let i = 0; i < bars; i++) {
        let target = 0.08;
        if (outFftReady) {
          target = Math.max(0.12, (bins[i % 24] || 0) / 255);
        } else if (micEnergy > 0.02) {
          const centerFactor = 1 - Math.abs(i - bars / 2) / (bars / 2);
          target = Math.max(0.1, micEnergy * (0.45 + 0.55 * centerFactor));
        } else if (isTtsSpeakingRef.current) {
          const centerFactor = 1 - Math.abs(i - bars / 2) / (bars / 2);
          target = 0.25 + 0.35 * centerFactor;
        }
        smoothed[i] += (target - smoothed[i]) * 0.28;
        const barH = Math.max(3, smoothed[i] * h);
        const x = i * (barW + gap);
        const y = (h - barH) / 2;

        ctx.fillStyle = outFftReady || isTtsSpeakingRef.current
          ? '#C4A876'
          : micEnergy > 0.02
          ? '#2E8B74'
          : 'rgba(157, 165, 178, 0.35)';
        ctx.fillRect(x, y, barW, barH);
      }
    };

    renderWave();
    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
    };
  }, [isOpen]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveUserCaption, liveAiCaption, isOpen]);

  const appendMessage = useCallback((sender: 'ai' | 'user', text: string) => {
    const clean = text.trim();
    if (!clean) return;
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [
      ...prev.slice(-23),
      { id: `${sender}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, sender, text: clean, time: nowTime },
    ]);
  }, []);

  // Voice navigation intent router
  const detectAndNavigateIntent = useCallback(
    (text: string): string | null => {
      const lower = text.toLowerCase();
      let targetTab: string | null = null;
      if (lower.includes('信息') || lower.includes('消息') || lower.includes('通话') || lower.includes('聊天') || lower.includes('message') || lower.includes('call') || lower.includes('chat')) {
        targetTab = 'chat';
      } else if (lower.includes('品牌') || lower.includes('文化') || lower.includes('规范') || lower.includes('brand')) {
        targetTab = 'brand';
      } else if (lower.includes('首页') || lower.includes('主页') || lower.includes('home')) {
        targetTab = 'home';
      } else if (lower.includes('宇宙') || lower.includes('星空') || lower.includes('universe')) {
        targetTab = 'universe';
      } else if (lower.includes('地球') || lower.includes('globe') || lower.includes('earth')) {
        targetTab = 'globe';
      } else if (lower.includes('影视') || lower.includes('电影') || lower.includes('cinema')) {
        targetTab = 'video';
      } else if (lower.includes('音乐') || lower.includes('歌曲') || lower.includes('music')) {
        targetTab = 'venus';
      } else if (lower.includes('图书馆') || lower.includes('看书') || lower.includes('library')) {
        targetTab = 'library';
      } else if (lower.includes('浏览器') || lower.includes('browser')) {
        targetTab = 'browser';
      }

      if (targetTab) {
        if (onNavigateTab) {
          onNavigateTab(targetTab);
        } else if (targetTab === 'universe' && onExploreUniverse) {
          onExploreUniverse();
        }
      }
      return targetTab;
    },
    [onNavigateTab, onExploreUniverse]
  );

  const stopOutputAudio = useCallback(() => {
    for (const src of activeAudioSourcesRef.current) {
      try {
        src.stop();
      } catch {}
    }
    activeAudioSourcesRef.current.clear();
    if (outputAudioCtxRef.current) {
      nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    isTtsSpeakingRef.current = false;
  }, []);

  const stopSessionResources = useCallback(() => {
    sessionActiveRef.current = false;
    liveReadyRef.current = false;

    stopOutputAudio();

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

    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    if (scriptNodeRef.current) {
      try {
        scriptNodeRef.current.onaudioprocess = null;
        scriptNodeRef.current.disconnect();
      } catch {}
      scriptNodeRef.current = null;
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {}
      sourceNodeRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
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
      outAnalyserRef.current = null;
    }

    micRmsRef.current = 0;
    pendingUserTranscriptRef.current = '';
    pendingAiTranscriptRef.current = '';
    setLiveUserCaption('');
    setLiveAiCaption('');
    setVoiceActive(false);
    setPhase('idle');
  }, [stopOutputAudio]);

  useEffect(() => {
    return () => {
      stopSessionResources();
    };
  }, [stopSessionResources]);

  const playPcm24kChunk = useCallback((base64: string) => {
    const outCtx = outputAudioCtxRef.current;
    const analyser = outAnalyserRef.current;
    if (!outCtx || !sessionActiveRef.current) return;

    if (outCtx.state === 'suspended') {
      void outCtx.resume();
    }

    const floats = decodePcm24kBase64ToFloat(base64);
    if (floats.length === 0) return;

    const buffer = outCtx.createBuffer(1, floats.length, 24000);
    buffer.getChannelData(0).set(floats);

    const source = outCtx.createBufferSource();
    source.buffer = buffer;
    if (analyser) {
      source.connect(analyser);
    } else {
      source.connect(outCtx.destination);
    }

    const now = outCtx.currentTime;
    const startAt = Math.max(now + 0.015, nextStartTimeRef.current);
    nextStartTimeRef.current = startAt + buffer.duration;

    activeAudioSourcesRef.current.add(source);
    setPhase('speaking');

    source.onended = () => {
      activeAudioSourcesRef.current.delete(source);
      if (activeAudioSourcesRef.current.size === 0 && sessionActiveRef.current) {
        setPhase(isMutedRef.current ? 'muted' : 'listening');
      }
    };

    source.start(startAt);
  }, []);

  // Fallback TTS helper for environments without Gemini Live server key
  const speakFallbackReply = useCallback(
    (text: string, onDone?: () => void) => {
      const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```[\s\S]*?```/g, '').trim();
      if (!clean || !('speechSynthesis' in window)) {
        isTtsSpeakingRef.current = false;
        onDone?.();
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(clean.slice(0, 420));
        utt.lang = isZh ? 'zh-CN' : 'en-US';
        utt.rate = 1.08;
        isTtsSpeakingRef.current = true;
        setPhase('speaking');
        utt.onend = () => {
          isTtsSpeakingRef.current = false;
          if (sessionActiveRef.current) setPhase(isMutedRef.current ? 'muted' : 'listening');
          onDone?.();
        };
        utt.onerror = () => {
          isTtsSpeakingRef.current = false;
          if (sessionActiveRef.current) setPhase(isMutedRef.current ? 'muted' : 'listening');
          onDone?.();
        };
        window.speechSynthesis.speak(utt);
      } catch {
        isTtsSpeakingRef.current = false;
        onDone?.();
      }
    },
    [isZh]
  );

  // Fallback streaming turn handler (supports both normal text chat and active voice session)
  const runFallbackTurn = useCallback(
    async (userText: string, resumeSpeechAfter?: () => void) => {
      const clean = userText.trim();
      if (!clean || isSendingFallbackRef.current) return;
      isSendingFallbackRef.current = true;
      const shouldSpeak = sessionActiveRef.current;

      appendMessage('user', clean);
      setLiveUserCaption('');
      setPhase('thinking');

      // Check local navigation intent first for instantaneous jump
      const navTab = detectAndNavigateIntent(clean);
      if (navTab) {
        const navReply = isZh ? '好的，已为您切换画面。' : 'Done, navigating now.';
        appendMessage('ai', navReply);
        setLiveAiCaption('');
        if (shouldSpeak) {
          speakFallbackReply(navReply, () => {
            isSendingFallbackRef.current = false;
            resumeSpeechAfter?.();
          });
        } else {
          isSendingFallbackRef.current = false;
          setPhase('idle');
        }
        return;
      }

      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: clean,
            modelId: modelIdRef.current,
            mode: 'general',
            stream: true,
            useSearchGrounding: true,
            history: messagesRef.current.slice(-6).map((m) => ({
              role: m.sender === 'user' ? 'user' : 'model',
              parts: [{ text: m.text }],
            })),
          }),
        });

        let fullReply = '';
        await readAIStream(res, (delta) => {
          fullReply += delta;
          setLiveAiCaption(fullReply);
        });

        const finalText = fullReply.trim() || (isZh ? '我明白了，请继续说。' : 'Got it, please continue.');
        appendMessage('ai', finalText);
        setLiveAiCaption('');
        if (shouldSpeak) {
          speakFallbackReply(finalText, () => {
            isSendingFallbackRef.current = false;
            resumeSpeechAfter?.();
          });
        } else {
          isSendingFallbackRef.current = false;
          setPhase('idle');
        }
      } catch {
        const errMsg = isZh ? 'AI 对话连接波动，请再试一次。' : 'Connection interrupted, please try again.';
        appendMessage('ai', errMsg);
        setLiveAiCaption('');
        isSendingFallbackRef.current = false;
        if (sessionActiveRef.current) setPhase(isMutedRef.current ? 'muted' : 'listening');
        else setPhase('idle');
        resumeSpeechAfter?.();
      }
    },
    [appendMessage, detectAndNavigateIntent, isZh, speakFallbackReply]
  );

  // Continuous browser SpeechRecognition fallback when Gemini Live WS isn't available
  const startContinuousSpeechFallback = useCallback(() => {
    setEngineMode('fallback');
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setShowTextInput(true);
      setPhase('listening');
      setStatusNotice(
        isZh
          ? '当前浏览器不支持免按连续语音识别，可在下方直接输入对话'
          : 'Continuous speech recognition unavailable in this browser; type below'
      );
      return;
    }

    const launchRecognizer = () => {
      if (!sessionActiveRef.current || isMutedRef.current || isTtsSpeakingRef.current || isSendingFallbackRef.current) {
        return;
      }
      try {
        const rec = new SpeechRec();
        rec.lang = isZh ? 'zh-CN' : 'en-US';
        rec.continuous = true;
        rec.interimResults = true;

        rec.onstart = () => {
          if (sessionActiveRef.current) setPhase('listening');
        };

        rec.onresult = (e: any) => {
          if (!sessionActiveRef.current || isMutedRef.current) return;
          let interim = '';
          let finalSegment = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            if (res.isFinal) {
              finalSegment += res[0].transcript;
            } else {
              interim += res[0].transcript;
            }
          }
          if (interim) {
            setLiveUserCaption(interim);
            // Barge-in if user starts speaking
            if (isTtsSpeakingRef.current) stopOutputAudio();
          }
          if (finalSegment.trim()) {
            try {
              rec.stop();
            } catch {}
            void runFallbackTurn(finalSegment.trim(), () => {
              if (sessionActiveRef.current && !isMutedRef.current) {
                setTimeout(launchRecognizer, 180);
              }
            });
          }
        };

        rec.onerror = (e: any) => {
          if (e?.error === 'not-allowed') {
            setShowTextInput(true);
            setStatusNotice(
              isZh ? '麦克风权限被拒绝，可在浏览器地址栏开启或使用下方输入框' : 'Microphone blocked; enable mic or type below'
            );
          }
        };

        rec.onend = () => {
          if (
            sessionActiveRef.current &&
            !isMutedRef.current &&
            !isTtsSpeakingRef.current &&
            !isSendingFallbackRef.current
          ) {
            setTimeout(launchRecognizer, 260);
          }
        };

        recognitionRef.current = rec;
        rec.start();
      } catch {
        setShowTextInput(true);
      }
    };

    launchRecognizer();
  }, [isZh, runFallbackTurn, stopOutputAudio]);

  // One-click instant full-duplex voice activation (runs directly inside user gesture click!)
  const startInstantVoiceSession = useCallback(async () => {
    stopSessionResources();
    sessionActiveRef.current = true;
    setVoiceActive(true);
    setPhase('connecting');
    setStatusNotice(null);
    setLiveUserCaption('');
    setLiveAiCaption('');

    // Prepare 24kHz Output AudioContext + Analyser inside user click gesture
    let outCtx: AudioContext;
    try {
      outCtx = new AudioContext({ sampleRate: 24000 });
    } catch {
      outCtx = new AudioContext();
    }
    const outAnalyser = outCtx.createAnalyser();
    outAnalyser.fftSize = 128;
    outAnalyser.connect(outCtx.destination);
    outputAudioCtxRef.current = outCtx;
    outAnalyserRef.current = outAnalyser;
    nextStartTimeRef.current = outCtx.currentTime;
    if (outCtx.state === 'suspended') {
      void outCtx.resume();
    }

    // Request Mic immediately in gesture
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      setShowTextInput(true);
      setPhase('listening');
      setStatusNotice(
        isZh ? '未获取到麦克风权限，可先在下方输入或重新开启麦克风' : 'Microphone unavailable; type below or enable mic'
      );
      return;
    }

    if (!sessionActiveRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    micStreamRef.current = stream;

    // Input AudioContext for mic RMS level + 16kHz PCM encoding
    let inCtx: AudioContext;
    try {
      inCtx = new AudioContext({ sampleRate: 16000 });
    } catch {
      inCtx = new AudioContext();
    }
    inputAudioCtxRef.current = inCtx;
    if (inCtx.state === 'suspended') {
      void inCtx.resume();
    }

    const source = inCtx.createMediaStreamSource(stream);
    const processor = inCtx.createScriptProcessor(4096, 1, 1);
    sourceNodeRef.current = source;
    scriptNodeRef.current = processor;

    source.connect(processor);
    processor.connect(inCtx.destination);

    processor.onaudioprocess = (event) => {
      if (!sessionActiveRef.current || isMutedRef.current) {
        micRmsRef.current = 0;
        return;
      }
      const channelData = event.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < channelData.length; i += 4) {
        sum += channelData[i] * channelData[i];
      }
      const rms = Math.sqrt(sum / (channelData.length / 4));
      micRmsRef.current = rms;

      if (wsRef.current?.readyState === WebSocket.OPEN && liveReadyRef.current) {
        const base64Pcm = downsampleFloatTo16kPcmBase64(channelData, inCtx.sampleRate);
        wsRef.current.send(JSON.stringify({ type: 'audio', data: base64Pcm }));
      }
    };

    // Connect Gemini Live WS relay
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/ai-live`);
    wsRef.current = ws;

    const fallbackTimer = setTimeout(() => {
      if (sessionActiveRef.current && !liveReadyRef.current) {
        startContinuousSpeechFallback();
      }
    }, 3200);

    ws.onmessage = (evt) => {
      if (!sessionActiveRef.current) return;
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'ready') {
          clearTimeout(fallbackTimer);
          liveReadyRef.current = true;
          setEngineMode('live');
          setPhase(isMutedRef.current ? 'muted' : 'listening');
          return;
        }

        if (msg.type === 'fallback') {
          clearTimeout(fallbackTimer);
          startContinuousSpeechFallback();
          return;
        }

        if (msg.type === 'audio' && typeof msg.data === 'string') {
          playPcm24kChunk(msg.data);
          return;
        }

        if (msg.type === 'inputTranscript' && typeof msg.text === 'string') {
          pendingUserTranscriptRef.current += msg.text;
          setLiveUserCaption(pendingUserTranscriptRef.current);
          return;
        }

        if (msg.type === 'outputTranscript' && typeof msg.text === 'string') {
          pendingAiTranscriptRef.current += msg.text;
          setLiveAiCaption(pendingAiTranscriptRef.current);
          return;
        }

        if (msg.type === 'interrupted') {
          stopOutputAudio();
          if (pendingAiTranscriptRef.current.trim()) {
            appendMessage('ai', pendingAiTranscriptRef.current);
            pendingAiTranscriptRef.current = '';
          }
          setLiveAiCaption('');
          setPhase(isMutedRef.current ? 'muted' : 'listening');
          return;
        }

        if (msg.type === 'turnComplete') {
          if (pendingUserTranscriptRef.current.trim()) {
            const finalizedUser = pendingUserTranscriptRef.current.trim();
            appendMessage('user', finalizedUser);
            detectAndNavigateIntent(finalizedUser);
            pendingUserTranscriptRef.current = '';
            setLiveUserCaption('');
          }
          if (pendingAiTranscriptRef.current.trim()) {
            appendMessage('ai', pendingAiTranscriptRef.current.trim());
            pendingAiTranscriptRef.current = '';
            setLiveAiCaption('');
          }
          if (activeAudioSourcesRef.current.size === 0) {
            setPhase(isMutedRef.current ? 'muted' : 'listening');
          }
        }
      } catch {
        // ignore malformed packet
      }
    };

    ws.onerror = () => {
      clearTimeout(fallbackTimer);
      if (sessionActiveRef.current && !liveReadyRef.current) {
        startContinuousSpeechFallback();
      }
    };

    ws.onclose = () => {
      clearTimeout(fallbackTimer);
      if (sessionActiveRef.current && !liveReadyRef.current) {
        startContinuousSpeechFallback();
      }
    };
  }, [
    appendMessage,
    detectAndNavigateIntent,
    isZh,
    playPcm24kChunk,
    startContinuousSpeechFallback,
    stopOutputAudio,
    stopSessionResources,
  ]);

  // External trigger (e.g. nav "智能") opens direct chat immediately
  useEffect(() => {
    if (openRequestSeq && openRequestSeq > 0) {
      setIsOpen(true);
      setShowTextInput(true);
      setStatusNotice(null);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [openRequestSeq]);

  // Triggered on single click of floating AI -> opens directly into instant chat (no extra page navigation!)
  const handleLauncherClick = () => {
    if (suppressClickRef.current) return;
    setIsOpen(true);
    setShowTextInput(true);
    setStatusNotice(null);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const handleToggleVoice = () => {
    if (voiceActive || sessionActiveRef.current) {
      stopSessionResources();
    } else {
      setIsMuted(false);
      void startInstantVoiceSession();
    }
  };

  const handleClose = () => {
    stopSessionResources();
    setIsOpen(false);
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    isMutedRef.current = nextMuted;
    if (nextMuted) {
      setPhase('muted');
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    } else {
      setPhase('listening');
      if (engineMode === 'fallback' && !isTtsSpeakingRef.current && !isSendingFallbackRef.current) {
        startContinuousSpeechFallback();
      }
    }
  };

  const handleSendText = () => {
    const text = inputMsg.trim();
    if (!text) return;
    setInputMsg('');
    if (wsRef.current?.readyState === WebSocket.OPEN && liveReadyRef.current) {
      appendMessage('user', text);
      detectAndNavigateIntent(text);
      wsRef.current.send(JSON.stringify({ type: 'text', text }));
      setPhase('thinking');
    } else {
      void runFallbackTurn(text, () => {
        if (sessionActiveRef.current && !isMutedRef.current && engineMode === 'fallback') {
          startContinuousSpeechFallback();
        }
      });
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

  const phaseLabel = (() => {
    switch (phase) {
      case 'connecting':
        return isZh ? '正在接通实时语音…' : 'Connecting live voice…';
      case 'listening':
        return isZh ? '正在聆听 · 直接开口说话' : 'Listening · Speak naturally';
      case 'thinking':
        return isZh ? '正在思考回复…' : 'Thinking…';
      case 'speaking':
        return isZh ? 'AI 正在回答 · 说话可随时打断' : 'Speaking · Interrupt anytime';
      case 'muted':
        return isZh ? '麦克风已静音' : 'Microphone muted';
      default:
        return isZh ? '直接对话 · 点击麦克风可语音通话' : 'Direct chat · Tap mic for voice';
    }
  })();

  return (
    <>
      {/* Floating AI Launcher: Centered directly under the 01 Logo on Home, or draggable corner orb on sub-pages */}
      {!isOpen && showLauncher && (
        placement === 'center-bottom' ? (
          <div
            id="globe-ai-launcher"
            className="fixed bottom-[calc(5.2rem+env(safe-area-inset-bottom))] md:bottom-7 left-1/2 -translate-x-1/2 z-40 select-none"
          >
            <button
              type="button"
              onClick={handleLauncherClick}
              aria-label={isZh ? '点击立即与 EARTH ONE AI 直接聊天' : 'Open EARTH ONE AI direct chat'}
              className="group inline-flex h-12 items-center gap-3 rounded-full border border-white/18 bg-[#070B16]/80 backdrop-blur-2xl pl-2 pr-4 shadow-[0_14px_38px_rgba(0,0,0,0.68)] transition-all hover:scale-[1.02] hover:border-[#8ECFFF]/60 active:scale-95 cursor-pointer"
            >
              <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.04] border border-white/12">
                <canvas ref={orbCanvasRef} className="pointer-events-none h-8 w-8 rounded-full" />
              </span>
              <span className="flex flex-col items-start text-left">
                <span className="text-xs font-semibold tracking-wide text-[#F7F5F0]">
                  {isZh ? '问问 EARTH ONE AI' : 'Ask EARTH ONE AI'}
                </span>
                <span className="text-[10px] text-[#8FA8C8] leading-tight">
                  {isZh ? '点击直接对话 / 语音' : 'Tap to chat or speak'}
                </span>
              </span>
              <span className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-[#69B8FF]/18 text-[#9AD6FF] group-hover:bg-[#69B8FF]/28 transition-colors">
                <Mic className="h-3.5 w-3.5" />
              </span>
            </button>
          </div>
        ) : (
          <div
            id="globe-ai-launcher"
            style={{ left: `${launcherPos.x}px`, top: `${launcherPos.y}px` }}
            className="fixed z-40 select-none"
          >
            <button
              type="button"
              onPointerDown={handleOrbPointerDown}
              onPointerMove={handleOrbPointerMove}
              onPointerUp={finishOrbDrag}
              onPointerCancel={finishOrbDrag}
              onClick={handleLauncherClick}
              style={{ touchAction: 'none' }}
              aria-label={isZh ? '点击立即与 EARTH ONE AI 对话' : 'Tap to chat with EARTH ONE AI'}
              title={isZh ? '点击直接对话（可拖动）' : 'Tap to chat (drag to move)'}
              className={`group relative flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-[#070B16]/82 backdrop-blur-2xl shadow-[0_10px_28px_rgba(0,0,0,0.48)] transition-transform ${
                isDragging
                  ? 'scale-110 cursor-grabbing ring-2 ring-[#8ECFFF]/60'
                  : 'cursor-pointer hover:scale-105 hover:border-[#8ECFFF]/80 active:scale-95'
              }`}
            >
              <canvas ref={orbCanvasRef} className="pointer-events-none h-10 w-10 rounded-full" />
              <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-white/25 bg-[#070B16] text-[#8ECFFF] shadow">
                <Mic className="h-2.5 w-2.5" />
              </span>
            </button>
          </div>
        )
      )}

      {/* Sleek Apple-Grade Instant Floating Chat + Optional Live Voice Console */}
      {isOpen && (
        <div
          id="globe-ai-console-wrapper"
          className={
            placement === 'center-bottom'
              ? 'fixed bottom-[calc(5.15rem+env(safe-area-inset-bottom))] md:bottom-7 left-1/2 -translate-x-1/2 z-50 w-[min(440px,calc(100vw-1.25rem))] select-none'
              : 'fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-6 right-3 sm:right-5 z-50 w-[min(390px,calc(100vw-1.5rem))] select-none'
          }
        >
          <div className="rounded-2xl border border-white/16 bg-[#070B16]/88 backdrop-blur-2xl saturate-150 text-[#F7F5F0] shadow-[0_24px_60px_rgba(0,0,0,0.72)] flex flex-col overflow-hidden">
            {/* Compact Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    phase === 'speaking'
                      ? 'bg-[#C4A876]'
                      : phase === 'listening'
                      ? 'bg-[#2E8B74]'
                      : phase === 'connecting' || phase === 'thinking'
                      ? 'bg-[#69B8FF]'
                      : 'bg-[#8ECFFF]/65'
                  }`}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold tracking-wide text-[#F7F5F0]">
                      EARTH ONE AI
                    </span>
                    {voiceActive && (
                      <span className="font-mono text-[10px] uppercase text-[#8ECFFF]">
                        {engineMode === 'live' ? 'LIVE PCM' : 'VOICE'}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#9DA5B2] truncate">{phaseLabel}</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMessages([])}
                    className="flex h-8 w-8 items-center justify-center rounded-xl text-[#9DA5B2] hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
                    title={isZh ? '清空记录' : 'Clear history'}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleClose}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-[#9DA5B2] hover:bg-white/[0.08] hover:text-rose-400 transition-colors cursor-pointer"
                  title={isZh ? '关闭对话' : 'Close'}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Voice Waveform Strip (shown smoothly when Live Voice is toggled active) */}
            {voiceActive && (
              <div className="border-b border-white/10 bg-white/[0.03] px-4 py-2.5 flex items-center justify-between gap-3">
                <canvas
                  ref={hudWaveCanvasRef}
                  width={210}
                  height={26}
                  className="h-6 w-[210px] shrink-0"
                />
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={toggleMute}
                    className={`inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] border cursor-pointer ${
                      isMuted
                        ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                        : 'border-[#2E8B74]/50 bg-[#2E8B74]/18 text-[#F7F5F0]'
                    }`}
                  >
                    {isMuted ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3 text-[#2E8B74]" />}
                    <span>{isMuted ? (isZh ? '静音' : 'Muted') : (isZh ? '聆听中' : 'Live')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopOutputAudio}
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/14 px-2 text-[11px] text-[#9DA5B2] hover:text-white cursor-pointer"
                    title={isZh ? '打断播报' : 'Stop audio'}
                  >
                    <Volume2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}

            {/* Direct Conversation Feed */}
            <div className="max-h-56 overflow-y-auto px-4 py-3 space-y-2.5 text-xs">
              {messages.length === 0 && !liveUserCaption && !liveAiCaption && (
                <p className="text-[11px] text-[#8E98A6] leading-relaxed">
                  {initialGreeting}
                </p>
              )}

              {messages.slice(-10).map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[88%] rounded-xl px-3 py-2 leading-relaxed ${
                      m.sender === 'user'
                        ? 'bg-[#69B8FF]/20 border border-[#69B8FF]/35 text-[#F7F5F0]'
                        : 'bg-white/[0.06] border border-white/10 text-[#DCE4F0]'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.text}</p>
                  </div>
                </div>
              ))}

              {liveUserCaption && (
                <div className="flex flex-col items-end">
                  <div className="max-w-[88%] rounded-xl px-3 py-2 bg-[#2E8B74]/20 border border-[#2E8B74]/35 text-[#B5EFE0]">
                    {liveUserCaption}
                  </div>
                </div>
              )}

              {liveAiCaption && (
                <div className="flex flex-col items-start">
                  <div className="max-w-[88%] rounded-xl px-3 py-2 bg-white/[0.06] border border-white/10 text-[#F7F5F0]">
                    <p className="whitespace-pre-wrap">{liveAiCaption}</p>
                  </div>
                </div>
              )}

              {statusNotice && (
                <p className="text-[11px] text-[#C4A876]">{statusNotice}</p>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Always-Ready Direct Input + One-Tap Live Voice Bar */}
            {showTextInput && (
              <div className="flex items-center gap-2 border-t border-white/10 bg-white/[0.03] px-3 py-2.5">
                <button
                  type="button"
                  onClick={handleToggleVoice}
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                    voiceActive
                      ? 'border-rose-500/60 bg-rose-500/20 text-rose-300'
                      : 'border-white/14 bg-white/[0.04] text-[#9AD6FF] hover:border-[#8ECFFF]'
                  }`}
                  title={voiceActive ? (isZh ? '挂断语音' : 'End voice') : (isZh ? '开启实时语音' : 'Start live voice')}
                >
                  {voiceActive ? <PhoneOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
                <input
                  ref={inputRef}
                  type="text"
                  value={inputMsg}
                  onChange={(e) => setInputMsg(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendText();
                  }}
                  placeholder={isZh ? '直接输入问题，回车发送…' : 'Ask anything, press Enter…'}
                  className="flex-1 min-w-0 rounded-xl border border-white/14 bg-[#03050B]/85 px-3 py-2 text-xs text-[#F7F5F0] placeholder-[#7B8698] focus:border-[#8ECFFF] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSendText}
                  disabled={!inputMsg.trim()}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#8ECFFF] text-[#03050B] hover:bg-[#B2DFFF] disabled:opacity-35 transition-colors cursor-pointer"
                  title={isZh ? '发送' : 'Send'}
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
