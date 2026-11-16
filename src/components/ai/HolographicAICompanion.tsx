import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Language } from '../../types/index.ts';
import { readAIStream } from '../../utils/aiStream.ts';

interface HolographicAICompanionProps {
  lang: Language;
  onFlyTo?: (lat: number, lng: number) => void;
  onExploreUniverse?: () => void;
  onOpenAIHub?: () => void;
  onNavigateTab?: (tab: string) => void;
  currentTab?: string;
  showLauncher?: boolean;
  placement?: 'center-bottom' | 'corner';
}

interface HistoryTurn {
  role: 'user' | 'model';
  parts: [{ text: string }];
}

type VoicePhase =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
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
}) => {
  const isZh = lang === 'zh';
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [voiceActive, setVoiceActive] = useState(false);
  const [modelId, setModelId] = useState('gemini-2.5-flash');

  // Fetch default backend chat model for fallback streaming
  useEffect(() => {
    let cancelled = false;
    fetch('/api/ai/models')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.success || !Array.isArray(data.models)) return;
        const preferred =
          data.models.find((m: { id: string; isDefault?: boolean }) => m.isDefault) || data.models[0];
        if (preferred?.id) setModelId(preferred.id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Launcher Orb 3D canvas & drag positioning
  const orbCanvasRef = useRef<HTMLCanvasElement | null>(null);
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

  // Audio & Real-time Voice Refs (never stale inside WebGL / WebAudio callbacks)
  const phaseRef = useRef<VoicePhase>('idle');
  phaseRef.current = phase;
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
  const micRmsRef = useRef(0);
  const liveReadyRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const isSendingFallbackRef = useRef(false);
  const isTtsSpeakingRef = useRef(false);
  const pendingUserTranscriptRef = useRef('');
  const modelIdRef = useRef(modelId);
  const historyRef = useRef<HistoryTurn[]>([]);

  modelIdRef.current = modelId;

  // Render audio-reactive 3D wireframe sphere directly inside the compact launcher
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
    const nucMat = new THREE.MeshBasicMaterial({ color: 0xcab07b });
    const nucMesh = new THREE.Mesh(nucGeo, nucMat);
    scene.add(nucMesh);

    const bins = new Uint8Array(32);
    const colorTarget = new THREE.Color(0x8ecfff);
    let rafId = 0;
    let t = 0;
    let active = true;

    const animate = () => {
      if (!active || document.hidden) return;
      rafId = requestAnimationFrame(animate);

      const currentPhase = phaseRef.current;
      let audioLevel = Math.min(1, micRmsRef.current * 4.5);

      if (outAnalyserRef.current && activeAudioSourcesRef.current.size > 0) {
        outAnalyserRef.current.getByteFrequencyData(bins);
        let sum = 0;
        for (let i = 0; i < 16; i++) sum += bins[i];
        audioLevel = Math.max(audioLevel, Math.min(1, sum / (16 * 140)));
      } else if (isTtsSpeakingRef.current) {
        audioLevel = Math.max(audioLevel, 0.35 + 0.2 * Math.sin(t * 9));
      }

      if (currentPhase === 'listening') {
        colorTarget.setHex(0x4ade80);
      } else if (currentPhase === 'speaking') {
        colorTarget.setHex(0xe5c17d);
      } else if (currentPhase === 'connecting' || currentPhase === 'thinking') {
        colorTarget.setHex(0x69b8ff);
      } else if (currentPhase === 'error') {
        colorTarget.setHex(0xf87171);
      } else {
        colorTarget.setHex(0x8ecfff);
      }
      coreMat.color.lerp(colorTarget, 0.14);

      const speedBoost = sessionActiveRef.current ? 1 + audioLevel * 1.4 : 1;
      t += 0.025 * speedBoost;
      coreMesh.rotation.y += 0.018 * speedBoost;
      coreMesh.rotation.x += 0.008 * speedBoost;
      const s = 1 + Math.sin(t * 2.6) * 0.08 + audioLevel * 0.28;
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
      } else if (lower.includes('语言学习') || lower.includes('学英语') || lower.includes('学习') || lower.includes('language') || lower.includes('english')) {
        targetTab = 'arabic-learning';
      } else if (lower.includes('发现') || lower.includes('discover')) {
        targetTab = 'feed';
      } else if (lower.includes('智能') || lower.includes('ai')) {
        targetTab = 'aihub';
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
        setPhase('listening');
      }
    };

    source.start(startAt);
  }, []);

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
          if (sessionActiveRef.current) setPhase('listening');
          onDone?.();
        };
        utt.onerror = () => {
          isTtsSpeakingRef.current = false;
          if (sessionActiveRef.current) setPhase('listening');
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

  const runFallbackTurn = useCallback(
    async (userText: string, resumeSpeechAfter?: () => void) => {
      const clean = userText.trim();
      if (!clean || isSendingFallbackRef.current) return;
      isSendingFallbackRef.current = true;
      const shouldSpeak = sessionActiveRef.current;

      historyRef.current = [...historyRef.current.slice(-5), { role: 'user', parts: [{ text: clean }] }];
      setPhase('thinking');

      const navTab = detectAndNavigateIntent(clean);
      if (navTab) {
        const navReply = isZh ? '好的，已为您切换画面。' : 'Done, navigating now.';
        historyRef.current = [...historyRef.current.slice(-5), { role: 'model', parts: [{ text: navReply }] }];
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
            history: historyRef.current.slice(-6),
          }),
        });

        let fullReply = '';
        await readAIStream(res, (delta) => {
          fullReply += delta;
        });

        const finalText = fullReply.trim() || (isZh ? '我明白了，请继续说。' : 'Got it, please continue.');
        historyRef.current = [...historyRef.current.slice(-5), { role: 'model', parts: [{ text: finalText }] }];
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
        isSendingFallbackRef.current = false;
        if (sessionActiveRef.current) setPhase('listening');
        else setPhase('idle');
        resumeSpeechAfter?.();
      }
    },
    [detectAndNavigateIntent, isZh, speakFallbackReply]
  );

  // Continuous browser SpeechRecognition fallback when Gemini Live WS isn't available
  const startContinuousSpeechFallback = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setPhase('error');
      return;
    }

    const launchRecognizer = () => {
      if (!sessionActiveRef.current || isTtsSpeakingRef.current || isSendingFallbackRef.current) {
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
          if (!sessionActiveRef.current) return;
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
          if (interim && isTtsSpeakingRef.current) {
            stopOutputAudio();
          }
          if (finalSegment.trim()) {
            try {
              rec.stop();
            } catch {}
            void runFallbackTurn(finalSegment.trim(), () => {
              if (sessionActiveRef.current) {
                setTimeout(launchRecognizer, 180);
              }
            });
          }
        };

        rec.onerror = (e: any) => {
          if (e?.error === 'not-allowed') {
            setPhase('error');
          }
        };

        rec.onend = () => {
          if (sessionActiveRef.current && !isTtsSpeakingRef.current && !isSendingFallbackRef.current) {
            setTimeout(launchRecognizer, 260);
          }
        };

        recognitionRef.current = rec;
        rec.start();
      } catch {
        setPhase('error');
      }
    };

    launchRecognizer();
  }, [isZh, runFallbackTurn, stopOutputAudio]);

  // One-click instant full-duplex voice activation in place (no popup / no expansion!)
  const startInstantVoiceSession = useCallback(async () => {
    stopSessionResources();
    sessionActiveRef.current = true;
    setVoiceActive(true);
    setPhase('connecting');

    let outCtx: AudioContext;
    try {
      outCtx = new AudioContext({ sampleRate: 24000 });
    } catch {
      outCtx = new AudioContext();
    }
    const outAnalyser = outCtx.createAnalyser();
    outAnalyser.fftSize = 64;
    outAnalyser.connect(outCtx.destination);
    outputAudioCtxRef.current = outCtx;
    outAnalyserRef.current = outAnalyser;
    nextStartTimeRef.current = outCtx.currentTime;
    if (outCtx.state === 'suspended') {
      void outCtx.resume();
    }

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
      sessionActiveRef.current = false;
      setVoiceActive(false);
      setPhase('error');
      setTimeout(() => {
        if (!sessionActiveRef.current) setPhase('idle');
      }, 2800);
      return;
    }

    if (!sessionActiveRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    micStreamRef.current = stream;

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
      if (!sessionActiveRef.current) {
        micRmsRef.current = 0;
        return;
      }
      const channelData = event.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < channelData.length; i += 4) {
        sum += channelData[i] * channelData[i];
      }
      micRmsRef.current = Math.sqrt(sum / (channelData.length / 4));

      if (wsRef.current?.readyState === WebSocket.OPEN && liveReadyRef.current) {
        const base64Pcm = downsampleFloatTo16kPcmBase64(channelData, inCtx.sampleRate);
        wsRef.current.send(JSON.stringify({ type: 'audio', data: base64Pcm }));
      }
    };

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
          setPhase('listening');
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
          return;
        }

        if (msg.type === 'interrupted') {
          stopOutputAudio();
          setPhase('listening');
          return;
        }

        if (msg.type === 'turnComplete') {
          if (pendingUserTranscriptRef.current.trim()) {
            detectAndNavigateIntent(pendingUserTranscriptRef.current.trim());
            pendingUserTranscriptRef.current = '';
          }
          if (activeAudioSourcesRef.current.size === 0) {
            setPhase('listening');
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
    detectAndNavigateIntent,
    playPcm24kChunk,
    startContinuousSpeechFallback,
    stopOutputAudio,
    stopSessionResources,
  ]);

  // Single click directly toggles automatic in-place voice conversation (never pops open or expands!)
  const handleLauncherClick = () => {
    if (suppressClickRef.current) return;
    if (voiceActive || sessionActiveRef.current) {
      stopSessionResources();
    } else {
      void startInstantVoiceSession();
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
    if (!voiceActive && phase !== 'error') return 'One.';
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

  const activeBorderClass =
    phase === 'listening'
      ? 'border-emerald-400/75 shadow-[0_0_24px_rgba(52,211,153,0.32)]'
      : phase === 'speaking'
      ? 'border-[#E5C17D]/80 shadow-[0_0_24px_rgba(229,193,125,0.34)]'
      : phase === 'connecting' || phase === 'thinking'
      ? 'border-[#69B8FF]/80 shadow-[0_0_24px_rgba(105,184,255,0.32)]'
      : phase === 'error'
      ? 'border-rose-400/75 shadow-[0_0_20px_rgba(248,113,113,0.28)]'
      : 'border-white/18 shadow-[0_14px_38px_rgba(0,0,0,0.68)] hover:border-[#8ECFFF]/60';

  if (!showLauncher) return null;

  return placement === 'center-bottom' ? (
    <div
      id="globe-ai-launcher"
      className="fixed bottom-[calc(5.2rem+env(safe-area-inset-bottom))] md:bottom-7 left-1/2 -translate-x-1/2 z-40 select-none"
    >
      <button
        type="button"
        onClick={handleLauncherClick}
        aria-label="One."
        aria-pressed={voiceActive}
        className={`group inline-flex h-11 items-center gap-2.5 rounded-full border bg-[#070B16]/82 backdrop-blur-2xl pl-2 pr-4 transition-all hover:scale-[1.03] active:scale-95 cursor-pointer ${activeBorderClass}`}
      >
        <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.04] border border-white/12">
          <canvas ref={orbCanvasRef} className="pointer-events-none h-7 w-7 rounded-full" />
        </span>
        <span className="text-xs font-semibold tracking-[0.14em] text-[#F7F5F0] whitespace-nowrap">
          {activePillLabel}
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
        aria-label="One."
        aria-pressed={voiceActive}
        title={activePillLabel}
        className={`group relative flex h-12 w-12 items-center justify-center rounded-full border bg-[#070B16]/82 backdrop-blur-2xl transition-transform ${activeBorderClass} ${
          isDragging
            ? 'scale-110 cursor-grabbing ring-2 ring-[#8ECFFF]/60'
            : 'cursor-pointer hover:scale-105 active:scale-95'
        }`}
      >
        <canvas ref={orbCanvasRef} className="pointer-events-none h-10 w-10 rounded-full" />
      </button>
    </div>
  );
};
