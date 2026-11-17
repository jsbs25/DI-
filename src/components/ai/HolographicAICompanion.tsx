import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Language } from '../../types/index.ts';
import { readAIStream } from '../../utils/aiStream.ts';
import { useOptionalPlayerContext } from '../../music/PlayerContext.tsx';
import {
  extractInlineAgentDirective,
  parseInstantAgentAction,
  resolveConversationalFallback,
  type OneAgentAction,
} from '../../utils/oneAgentController.ts';

interface HolographicAICompanionProps {
  lang: Language;
  onFlyTo?: (lat: number, lng: number) => void;
  onExploreUniverse?: () => void;
  onOpenAIHub?: () => void;
  onNavigateTab?: (tab: string) => void;
  onPlayMusicAction?: (opts: { query?: string; crawl?: boolean }) => void;
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

function pickSweetVoice(isZh: boolean): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;

  const preferredPatterns = isZh
    ? [
        /xiaoxiao/i,
        /xiaoyi/i,
        /ting-?ting/i,
        /meijia/i,
        /sinji/i,
        /google\s*普通话/i,
        /huihui/i,
        /yaoyao/i,
        /natural.*zh|zh.*natural/i,
        /neural.*zh|zh.*neural/i,
        /female|女/i,
      ]
    : [
        /jenny/i,
        /aria/i,
        /ava/i,
        /samantha/i,
        /victoria/i,
        /karen/i,
        /google us english/i,
        /natural.*en|en.*natural/i,
        /neural.*en|en.*neural/i,
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

export const HolographicAICompanion: React.FC<HolographicAICompanionProps> = ({
  lang,
  onFlyTo,
  onExploreUniverse,
  onNavigateTab,
  onPlayMusicAction,
  onWatchDocumentaryAction,
  onBrowserSearchAction,
  onSetTheme,
  onSetLang,
  showLauncher = true,
  placement = 'corner',
}) => {
  const isZh = lang === 'zh';
  const player = useOptionalPlayerContext();
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [voiceActive, setVoiceActive] = useState(false);
  const [modelId, setModelId] = useState('deepseek-v3');
  const preferredVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // Cache sweet natural female voice as soon as browser populates speechSynthesis voices
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

  // Resolve default DeepSeek chat model from backend (prefer fast DeepSeek-V3 for low-latency voice)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/ai/models')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.success || !Array.isArray(data.models)) return;
        const deepseekPreferred =
          data.models.find((m: { id: string }) => m.id === 'deepseek-v3') ||
          data.models.find((m: { id: string; isDefault?: boolean }) => m.isDefault && m.id.startsWith('deepseek')) ||
          data.models.find((m: { id: string }) => m.id.startsWith('deepseek'));
        if (deepseekPreferred?.id) setModelId(deepseekPreferred.id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Launcher Orb 3D canvas & responsive drag bounds (respects mobile bottom dock & tablet left dock)
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

  // Real-time DeepSeek voice session with turn-epoch instant barge-in & sweet TTS queue
  const phaseRef = useRef<VoicePhase>('idle');
  phaseRef.current = phase;
  const sessionActiveRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const turnEpochRef = useRef(0);
  const activeFetchAbortRef = useRef<AbortController | null>(null);
  const isSendingRef = useRef(false);
  const isTtsSpeakingRef = useRef(false);
  const currentSpokenTextRef = useRef('');
  const lastExecutedActionRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const lastHandledFinalRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const modelIdRef = useRef(modelId);
  const historyRef = useRef<HistoryTurn[]>([]);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ttsQueueRef = useRef<string[]>([]);
  const ttsStreamDoneRef = useRef(true);
  const ttsDrainingRef = useRef(false);
  const ttsDoneCallbackRef = useRef<(() => void) | null>(null);
  const ttsSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  modelIdRef.current = modelId;

  // Render 3D wireframe orb driven smoothly by voice phase
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
    let rafId = 0;
    let t = 0;
    let active = true;

    const animate = () => {
      if (!active || document.hidden) return;
      rafId = requestAnimationFrame(animate);

      const currentPhase = phaseRef.current;
      let energy = 0.08;

      if (currentPhase === 'listening') {
        colorTarget.setHex(0x4ade80);
        energy = 0.25 + 0.18 * Math.sin(t * 4.2);
      } else if (currentPhase === 'speaking' || isTtsSpeakingRef.current) {
        colorTarget.setHex(0xf9a8d4);
        energy = 0.52 + 0.28 * Math.sin(t * 9.5);
      } else if (currentPhase === 'connecting' || currentPhase === 'thinking') {
        colorTarget.setHex(0x69b8ff);
        energy = 0.34 + 0.14 * Math.cos(t * 6.5);
      } else if (currentPhase === 'error') {
        colorTarget.setHex(0xf87171);
        energy = 0.12;
      } else {
        colorTarget.setHex(0x8ecfff);
      }
      coreMat.color.lerp(colorTarget, 0.14);

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
          player?.activateMusicSession();
          player?.playNext();
        } else if (action.control === 'prev') {
          player?.activateMusicSession();
          player?.playPrevious();
        } else if (action.control === 'stop' || action.control === 'pause') {
          player?.stopAndHold();
        } else if (action.control === 'resume') {
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
          player?.activateMusicSession();
          onPlayMusicAction({ query: action.query, crawl: action.crawl ?? true });
        } else if (onNavigateTab) {
          onNavigateTab('venus');
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
      onPlayMusicAction,
      onSetLang,
      onSetTheme,
      onWatchDocumentaryAction,
      player,
    ]
  );

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
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    isTtsSpeakingRef.current = false;
  }, []);

  /**
   * Instant Barge-In: cancels in-flight DeepSeek HTTP request and speech synthesis
   * within milliseconds so the user can interrupt mid-sentence with a new question.
   */
  const interruptCurrentTurn = useCallback(() => {
    turnEpochRef.current += 1;
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
    turnEpochRef.current += 1;
    isSendingRef.current = false;

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
    if (errorResetTimerRef.current) {
      clearTimeout(errorResetTimerRef.current);
      errorResetTimerRef.current = null;
    }

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

    setVoiceActive(false);
    setPhase('idle');
  }, [stopOutputAudio]);

  useEffect(() => {
    return () => {
      stopSessionResources();
    };
  }, [stopSessionResources]);

  const cleanSpeechSegment = (raw: string) =>
    raw
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/\[\[ACTION:[\s\S]*?\]\]/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[*_#`>~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const pumpTtsQueue = useCallback(
    (epoch: number) => {
      if (epoch !== turnEpochRef.current || ttsDrainingRef.current) return;
      const nextChunk = ttsQueueRef.current.shift();
      if (!nextChunk) {
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

      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        isTtsSpeakingRef.current = false;
        const cb = ttsDoneCallbackRef.current;
        ttsDoneCallbackRef.current = null;
        cb?.();
        return;
      }

      ttsDrainingRef.current = true;
      isTtsSpeakingRef.current = true;
      currentSpokenTextRef.current = nextChunk;
      setPhase('speaking');

      try {
        const utt = new SpeechSynthesisUtterance(nextChunk.slice(0, 260));
        const sweetVoice = preferredVoiceRef.current || pickSweetVoice(isZh);
        if (sweetVoice) {
          utt.voice = sweetVoice;
          utt.lang = sweetVoice.lang || (isZh ? 'zh-CN' : 'en-US');
        } else {
          utt.lang = isZh ? 'zh-CN' : 'en-US';
        }
        // Sweet, gentle, lively companion prosody
        utt.pitch = 1.15;
        utt.rate = 1.04;
        utt.volume = 1;

        let finished = false;
        const finalize = () => {
          if (finished) return;
          finished = true;
          if (ttsSafetyTimerRef.current) {
            clearTimeout(ttsSafetyTimerRef.current);
            ttsSafetyTimerRef.current = null;
          }
          ttsDrainingRef.current = false;
          if (epoch === turnEpochRef.current) {
            pumpTtsQueue(epoch);
          }
        };
        utt.onend = finalize;
        utt.onerror = finalize;
        ttsSafetyTimerRef.current = setTimeout(finalize, Math.max(2400, Math.min(12000, nextChunk.length * 200)));
        window.speechSynthesis.speak(utt);
      } catch {
        ttsDrainingRef.current = false;
        if (epoch === turnEpochRef.current) pumpTtsQueue(epoch);
      }
    },
    [isZh]
  );

  const enqueueSpeechChunk = useCallback(
    (segment: string, epoch: number) => {
      if (epoch !== turnEpochRef.current) return;
      const cleaned = cleanSpeechSegment(segment);
      if (!cleaned) return;
      ttsQueueRef.current.push(cleaned);
      pumpTtsQueue(epoch);
    },
    [pumpTtsQueue]
  );

  const speakDeepSeekReply = useCallback(
    (text: string, epoch: number, onDone?: () => void) => {
      if (epoch !== turnEpochRef.current) return;
      stopOutputAudio();
      const cleaned = cleanSpeechSegment(text);
      if (!cleaned) {
        onDone?.();
        return;
      }
      ttsStreamDoneRef.current = true;
      ttsDoneCallbackRef.current = onDone || null;
      enqueueSpeechChunk(cleaned.slice(0, 420), epoch);
    },
    [enqueueSpeechChunk, stopOutputAudio]
  );

  const runDeepSeekTurn = useCallback(
    async (userText: string) => {
      const clean = userText.trim();
      if (!clean) return;

      // Supersede any active speaking or streaming turn immediately (true instant barge-in)
      const myEpoch = interruptCurrentTurn();
      isSendingRef.current = true;
      const shouldSpeak = sessionActiveRef.current;

      historyRef.current = [...historyRef.current.slice(-4), { role: 'user', content: clean }];

      // 1. Instant local command dispatch (<1ms, zero network wait)
      const instantAction = parseInstantAgentAction(clean, isZh);
      if (instantAction && instantAction.type !== 'none') {
        const executed = executeParsedAction(instantAction, clean.toLowerCase());
        if (!executed) {
          if (myEpoch === turnEpochRef.current) {
            isSendingRef.current = false;
            setPhase(sessionActiveRef.current ? 'listening' : 'idle');
          }
          return;
        }
        const actionReply = instantAction.reply;
        historyRef.current = [...historyRef.current.slice(-4), { role: 'assistant', content: actionReply }];
        const isMediaPlayback =
          (instantAction.type === 'play_music' && !instantAction.control) ||
          (instantAction.type === 'play_music' && instantAction.control === 'resume') ||
          instantAction.type === 'watch_documentary';

        if (shouldSpeak && !isMediaPlayback) {
          speakDeepSeekReply(actionReply, myEpoch, () => {
            if (myEpoch === turnEpochRef.current) {
              isSendingRef.current = false;
              setPhase(sessionActiveRef.current ? 'listening' : 'idle');
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

      // 2. Single-trip fast DeepSeek-V3 streaming chat with AbortController barge-in support
      setPhase('thinking');
      stopOutputAudio();
      ttsStreamDoneRef.current = false;
      ttsDoneCallbackRef.current = () => {
        if (myEpoch === turnEpochRef.current) {
          isSendingRef.current = false;
          setPhase(sessionActiveRef.current ? 'listening' : 'idle');
        }
      };

      const controller = new AbortController();
      activeFetchAbortRef.current = controller;

      const activeDeepSeekModel = modelIdRef.current.startsWith('deepseek')
        ? modelIdRef.current
        : 'deepseek-v3';

      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            prompt: clean,
            modelId: activeDeepSeekModel,
            mode: 'voice-agent',
            maxTokens: 180,
            stream: true,
            history: historyRef.current.slice(-4),
          }),
        });

        let rawReply = '';
        let actionResolved = false;
        let mediaActionTriggered = false;
        let spokenOffset = 0;

        await readAIStream(res, (delta) => {
          if (myEpoch !== turnEpochRef.current) return;
          rawReply += delta;

          const trimmedStart = rawReply.trimStart();
          const waitingForDirective =
            !actionResolved && trimmedStart.startsWith('[') && !trimmedStart.includes(']]') && trimmedStart.length < 180;
          if (waitingForDirective) return;

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

          // Stream short clauses rapidly (>= 8 chars on punctuation) for ultra-low speech latency
          const display = parsed.spokenText.replace(/<think>[\s\S]*?(<\/think>|$)/g, '');
          const unuttered = display.slice(spokenOffset);
          if (!unuttered) return;

          const breakMatch = unuttered.match(/^([\s\S]*?[。！？!?;；\n]|[\s\S]{8,}?[，,、])/);
          if (breakMatch) {
            const segment = breakMatch[1];
            spokenOffset += segment.length;
            enqueueSpeechChunk(segment, myEpoch);
          }
        });

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

        const cleanedReply = finalParsed.spokenText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        const finalText = cleanedReply || resolveConversationalFallback(clean, isZh);
        historyRef.current = [...historyRef.current.slice(-4), { role: 'assistant', content: finalText }];

        if (!shouldSpeak || mediaActionTriggered) {
          stopOutputAudio();
          isSendingRef.current = false;
          setPhase(sessionActiveRef.current ? 'listening' : 'idle');
          return;
        }

        ttsStreamDoneRef.current = true;
        const remainder = cleanedReply ? cleanedReply.slice(spokenOffset) : finalText;
        if (cleanSpeechSegment(remainder)) {
          enqueueSpeechChunk(remainder, myEpoch);
        } else if (!ttsDrainingRef.current && ttsQueueRef.current.length === 0) {
          ttsDoneCallbackRef.current = null;
          isSendingRef.current = false;
          setPhase(sessionActiveRef.current ? 'listening' : 'idle');
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || myEpoch !== turnEpochRef.current) {
          return;
        }
        activeFetchAbortRef.current = null;
        const fallbackText = resolveConversationalFallback(
          clean,
          isZh,
          err instanceof Error ? err.message : undefined
        );
        historyRef.current = [...historyRef.current.slice(-4), { role: 'assistant', content: fallbackText }];
        if (shouldSpeak) {
          speakDeepSeekReply(fallbackText, myEpoch, () => {
            if (myEpoch === turnEpochRef.current) {
              isSendingRef.current = false;
              setPhase(sessionActiveRef.current ? 'listening' : 'idle');
            }
          });
        } else {
          stopOutputAudio();
          isSendingRef.current = false;
          setPhase('idle');
        }
      }
    },
    [enqueueSpeechChunk, executeParsedAction, interruptCurrentTurn, isZh, speakDeepSeekReply, stopOutputAudio]
  );

  // Instant Continuous Voice Session with Real-Time Barge-In
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
    setVoiceActive(true);
    setPhase('connecting');

    // Unlock SpeechSynthesis inside user gesture for iOS/iPadOS/Android browsers
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

    const launchRecognizer = () => {
      if (!sessionActiveRef.current) return;
      try {
        const rec = new SpeechRec();
        rec.lang = isZh ? 'zh-CN' : 'en-US';
        rec.continuous = !isAppleTouch;
        rec.interimResults = true;

        rec.onstart = () => {
          if (sessionActiveRef.current && !isTtsSpeakingRef.current && !isSendingRef.current) {
            setPhase('listening');
          }
        };

        let interimActionTimer: ReturnType<typeof setTimeout> | null = null;

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

          const normClean = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
          const spokenNorm = normClean(currentSpokenTextRef.current);
          const interimClean = interim.trim();
          const finalClean = finalSegment.trim();

          // Real-time Barge-In: interrupt TTS / in-flight request immediately if user speaks something new
          const isEchoOfAi =
            isTtsSpeakingRef.current &&
            interimClean.length < 10 &&
            spokenNorm &&
            normClean(interimClean).length >= 2 &&
            spokenNorm.includes(normClean(interimClean));

          if (interimClean.length >= 2 && !isEchoOfAi && (isTtsSpeakingRef.current || isSendingRef.current)) {
            interruptCurrentTurn();
          }

          if (interimActionTimer) {
            clearTimeout(interimActionTimer);
            interimActionTimer = null;
          }

          if (finalClean) {
            const now = Date.now();
            // Prevent duplicate trigger if interim quick-command already fired on identical phrase
            if (
              lastHandledFinalRef.current.text === finalClean &&
              now - lastHandledFinalRef.current.at < 1500
            ) {
              return;
            }
            // Ignore exact self-echo if mic hears our own speaker output with zero new words
            if (
              isTtsSpeakingRef.current &&
              spokenNorm &&
              normClean(finalClean).length >= 3 &&
              spokenNorm.includes(normClean(finalClean))
            ) {
              return;
            }
            lastHandledFinalRef.current = { text: finalClean, at: now };
            // Keep recognizer alive continuously without calling rec.stop() so next barge-in has 0ms lag!
            void runDeepSeekTurn(finalClean);
            return;
          }

          if (interimClean && parseInstantAgentAction(interimClean, isZh)) {
            interimActionTimer = setTimeout(() => {
              if (!sessionActiveRef.current) return;
              lastHandledFinalRef.current = { text: interimClean, at: Date.now() };
              void runDeepSeekTurn(interimClean);
            }, 340);
          }
        };

        rec.onerror = (e: any) => {
          if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
            sessionActiveRef.current = false;
            setVoiceActive(false);
            setPhase('error');
            errorResetTimerRef.current = setTimeout(() => {
              if (!sessionActiveRef.current) setPhase('idle');
            }, 3000);
          }
        };

        rec.onend = () => {
          // Always keep microphone hot while voice session is active (even during AI speech!)
          if (sessionActiveRef.current) {
            restartTimerRef.current = setTimeout(launchRecognizer, isAppleTouch ? 120 : 60);
          }
        };

        recognitionRef.current = rec;
        rec.start();
      } catch {
        sessionActiveRef.current = false;
        setVoiceActive(false);
        setPhase('error');
      }
    };

    launchRecognizer();
  }, [interruptCurrentTurn, isZh, runDeepSeekTurn, stopSessionResources]);

  const handleLauncherClick = () => {
    if (suppressClickRef.current) return;
    if (voiceActive || sessionActiveRef.current) {
      stopSessionResources();
    } else {
      player?.unlockAudio();
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
      ? 'border-pink-300/80 shadow-[0_0_26px_rgba(244,114,182,0.36)]'
      : phase === 'connecting' || phase === 'thinking'
      ? 'border-[#69B8FF]/80 shadow-[0_0_24px_rgba(105,184,255,0.32)]'
      : phase === 'error'
      ? 'border-rose-400/75 shadow-[0_0_20px_rgba(248,113,113,0.28)]'
      : 'border-white/18 shadow-[0_14px_38px_rgba(0,0,0,0.68)] hover:border-[#8ECFFF]/60';

  if (!showLauncher) return null;

  return placement === 'center-bottom' ? (
    <div
      id="globe-ai-launcher"
      className="fixed bottom-[calc(5.1rem+env(safe-area-inset-bottom))] md:bottom-7 left-1/2 -translate-x-1/2 z-40 select-none"
    >
      <button
        type="button"
        onClick={handleLauncherClick}
        aria-label="One."
        aria-pressed={voiceActive}
        className={`group inline-flex min-h-[44px] h-11 items-center gap-2.5 rounded-full border bg-[#070B16]/82 backdrop-blur-2xl pl-2 pr-4 transition-all hover:scale-[1.03] active:scale-95 cursor-pointer ${activeBorderClass}`}
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
