import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  AlertCircle,
  Brain,
  Disc3,
  ExternalLink,
  Flame,
  Heart,
  HelpCircle,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Pause,
  Play,
  Send,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import type { Language } from '../../types/index.ts';
import { apiUrl, wsUrl } from '../../apiBase.ts';
import { useOptionalPlayerContext } from '../../music/PlayerContext.tsx';
import { getAiProfileKey } from '../../utils/aiProfile.ts';
import { AudioLiveClient } from './audioLiveClient.ts';
import {
  collectLivePageContext,
  type LivePageContextSummary,
} from '../../utils/pageContextEngine.ts';
import {
  executeGeminiToolCall,
  parseInstantAgentAction,
  resolveConversationalFallback,
  type WebsiteControlHandlers,
} from '../../utils/oneAgentController.ts';
import {
  analyzeDialogueEmotion,
  buildExpressivePhrases,
  type VoiceEmotion,
} from '../../utils/emotionEngine.ts';
import {
  readVoiceListeningMode,
  subscribeVoiceListeningMode,
  writeVoiceListeningMode,
  type VoiceListeningMode,
} from '../../utils/voiceModeSettings.ts';
import { uiStateManager, useAgentUiState } from '../../agent/uiStateManager.ts';
import {
  playNormalizedArrayBuffer,
  playNormalizedBase64Audio,
  stopSteadyVoice,
  unlockSteadyVoiceAudio,
} from '../../utils/steadyVoicePlayer.ts';

export type CompanionEmotion =
  | 'calm'
  | 'happy'
  | 'excited'
  | 'curious'
  | 'concerned'
  | 'empathetic'
  | 'playful'
  | 'focused'
  | 'thinking';

type VoicePhase =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';

interface TranscriptEntry {
  id: string;
  role: 'user' | 'assistant' | 'action';
  text: string;
  emotion?: CompanionEmotion;
  interrupted?: boolean;
}

export interface HolographicAICompanionProps {
  lang: Language;
  theme?: 'light' | 'dark';
  isAuthenticated?: boolean;
  userName?: string;
  userCity?: string;
  currentTab?: string;
  showLauncher?: boolean;
  placement?: 'center-bottom' | 'corner';
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
  onGlobalSearchAction?: (query: string) => void;
  onSetTheme?: (theme: 'dark' | 'light') => void;
  onSetLang?: (lang: Language) => void;
  onSetImmersive?: (v: boolean) => void;
  onOpenCommandPalette?: () => void;
  onReplayIntro?: () => void;
  onCreatePost?: (postData: { content: string; category: string }) => Promise<void> | void;
  onCreateArticle?: (articleData: { title: string; content: string; category: string }) => Promise<void> | void;
  onFilterCountry?: (countryCode: string | null) => void;
  onToggleJoinCommunity?: (commId: string) => void;
  onOpenBook?: (bookId: string) => void;
  onOpenKnowledge?: (nodeId: string) => void;
  onOpenProfile?: () => void;
  onOpenAuth?: () => void;
  onOpenSecurity?: () => void;
  onToggleLocationPrivacy?: () => void;
  onOpenMessages?: (conversationId?: string) => void;
  onOpenCalls?: () => void;
  onQuickCall?: (kind: 'audio' | 'video', target: { targetUserId?: string; conversationId?: string }) => void;
}

const VOICE_PREF_KEY = 'earth-one-ai-voice-pref:v2';
const VOICE_SESSION_STORAGE_KEY = 'earth-one-voice-session:v1';
const POS_KEY = 'earth-one-ai-launcher-pos:v1';
const DEFAULT_MUSIC_COVER = '/assets/music/ambient-space.jpg';

const VOICE_OPTIONS = [
  { id: 'Zephyr', labelZh: 'Zephyr · 清澈灵动', labelEn: 'Zephyr · Bright' },
  { id: 'Kore', labelZh: 'Kore · 温暖柔和', labelEn: 'Kore · Warm' },
  { id: 'Puck', labelZh: 'Puck · 活力好奇', labelEn: 'Puck · Playful' },
  { id: 'Charon', labelZh: 'Charon · 沉稳深邃', labelEn: 'Charon · Deep' },
  { id: 'Fenrir', labelZh: 'Fenrir · 果断锐利', labelEn: 'Fenrir · Crisp' },
] as const;

const EMOTION_META: Record<
  CompanionEmotion,
  { zh: string; en: string; hex: number; cssAccent: string; ringClass: string }
> = {
  calm: {
    zh: '平静聆听',
    en: 'Serene',
    hex: 0x8ecfff,
    cssAccent: '#8ECFFF',
    ringClass: 'border-sky-400/50 shadow-[0_0_24px_rgba(142,207,255,0.28)]',
  },
  happy: {
    zh: '愉悦开心',
    en: 'Happy',
    hex: 0xf5c451,
    cssAccent: '#F5C451',
    ringClass: 'border-amber-400/70 shadow-[0_0_26px_rgba(245,196,81,0.34)]',
  },
  excited: {
    zh: '兴奋雀跃',
    en: 'Excited',
    hex: 0xfb923c,
    cssAccent: '#FB923C',
    ringClass: 'border-orange-400/75 shadow-[0_0_28px_rgba(251,146,60,0.38)]',
  },
  curious: {
    zh: '充满好奇',
    en: 'Curious',
    hex: 0x34d399,
    cssAccent: '#34D399',
    ringClass: 'border-emerald-400/70 shadow-[0_0_26px_rgba(52,211,153,0.34)]',
  },
  concerned: {
    zh: '关切在意',
    en: 'Concerned',
    hex: 0xf87171,
    cssAccent: '#F87171',
    ringClass: 'border-rose-400/75 shadow-[0_0_26px_rgba(248,113,113,0.34)]',
  },
  empathetic: {
    zh: '温柔共情',
    en: 'Empathetic',
    hex: 0xf472b6,
    cssAccent: '#F472B6',
    ringClass: 'border-pink-400/70 shadow-[0_0_26px_rgba(244,114,182,0.34)]',
  },
  playful: {
    zh: '俏皮轻快',
    en: 'Playful',
    hex: 0x2dd4bf,
    cssAccent: '#2DD4BF',
    ringClass: 'border-teal-400/70 shadow-[0_0_26px_rgba(45,212,191,0.34)]',
  },
  focused: {
    zh: '专注执行',
    en: 'Focused',
    hex: 0x60a5fa,
    cssAccent: '#60A5FA',
    ringClass: 'border-blue-400/75 shadow-[0_0_26px_rgba(96,165,250,0.34)]',
  },
  thinking: {
    zh: '深度思考',
    en: 'Thinking',
    hex: 0xa78bfa,
    cssAccent: '#A78BFA',
    ringClass: 'border-violet-400/70 shadow-[0_0_26px_rgba(167,139,250,0.34)]',
  },
};

function mapVoiceEmotionToCompanion(v: VoiceEmotion): CompanionEmotion {
  if (v === 'cheerful' || v === 'affectionate') return 'happy';
  if (v === 'excited') return 'excited';
  if (v === 'curious') return 'curious';
  if (v === 'empathetic') return 'empathetic';
  if (v === 'playful') return 'playful';
  return 'calm';
}

function mapCompanionToVoiceEmotion(c: CompanionEmotion): VoiceEmotion {
  if (c === 'happy') return 'cheerful';
  if (c === 'excited') return 'excited';
  if (c === 'curious') return 'curious';
  if (c === 'empathetic' || c === 'concerned') return 'empathetic';
  if (c === 'playful') return 'playful';
  return 'calm';
}

function stripCompanionMarkup(raw: string): string {
  return (raw || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<(?:think|thought)>[\s\S]*$/i, '')
    .replace(/\[\[(?:EMO|EMOTION):[^\]]*\]\]\s*/gi, '')
    .replace(/\[\[ACTION:[\s\S]*?\]\]\s*/gi, '')
    .replace(/\[\[(?:EMO|EMOTION)(?::[a-z_-]*)?\]?\]?$/i, '')
    .replace(/\[\[ACTION:[\s\S]*$/i, '')
    .trim();
}

function EmotionIcon({ emotion }: { emotion: CompanionEmotion }) {
  const cls = 'h-3.5 w-3.5 shrink-0';
  switch (emotion) {
    case 'excited':
      return <Flame className={`${cls} text-orange-400`} />;
    case 'happy':
      return <Sparkles className={`${cls} text-amber-400`} />;
    case 'curious':
      return <HelpCircle className={`${cls} text-emerald-400`} />;
    case 'concerned':
      return <AlertCircle className={`${cls} text-rose-400`} />;
    case 'empathetic':
      return <Heart className={`${cls} text-pink-400`} />;
    case 'playful':
      return <Zap className={`${cls} text-teal-400`} />;
    case 'focused':
      return <Brain className={`${cls} text-blue-400`} />;
    case 'thinking':
      return <Brain className={`${cls} text-violet-400`} />;
    default:
      return <Wind className={`${cls} text-sky-400`} />;
  }
}

function buildUnifiedEmbedUrl(rawUrl: string | undefined, isPlaying: boolean): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const u = new URL(rawUrl);
    if (u.hostname.includes('youtube')) {
      if (!u.searchParams.has('autoplay')) {
        u.searchParams.set('autoplay', isPlaying ? '1' : '0');
      } else {
        u.searchParams.set('autoplay', '1');
      }
      u.searchParams.set('enablejsapi', '1');
      u.searchParams.set('playsinline', '1');
      u.searchParams.set('rel', '0');
      if (typeof window !== 'undefined' && window.location?.origin) {
        u.searchParams.set('origin', window.location.origin);
      }
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

export const HolographicAICompanion: React.FC<HolographicAICompanionProps> = (props) => {
  const {
    lang,
    theme = 'light',
    isAuthenticated = true,
    userName,
    userCity,
    currentTab = 'globe',
    showLauncher = true,
    placement = 'corner',
  } = props;

  const isZh = lang === 'zh';
  const player = useOptionalPlayerContext();
  const agentSnap = useAgentUiState();
  const aiName = agentSnap.aiName || 'ONE';
  const isGardenHome = currentTab === 'globe';
  const isGardenDay = isGardenHome && agentSnap.gardenDaylight > 0.44;

  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [voiceActive, setVoiceActive] = useState(false);
  const [hudOpen, setHudOpen] = useState(false);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const [mutedOutput, setMutedOutput] = useState(false);
  const [liveModeEngine, setLiveModeEngine] = useState<'gemini-live' | 'companion-api'>('gemini-live');
  const [listeningMode, setListeningMode] = useState<VoiceListeningMode>(() => readVoiceListeningMode());

  useEffect(() => {
    const onOpenHud = () => setHudOpen(true);
    window.addEventListener('one-open-live-companion', onOpenHud);
    return () => window.removeEventListener('one-open-live-companion', onOpenHud);
  }, []);

  const [emotion, setEmotion] = useState<CompanionEmotion>('calm');
  const [emotionIntensity, setEmotionIntensity] = useState(0.65);
  const [emotionReason, setEmotionReason] = useState('');

  const [voiceName, setVoiceName] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(VOICE_PREF_KEY);
      if (saved && VOICE_OPTIONS.some((v) => v.id === saved)) return saved;
    } catch {}
    return 'Zephyr';
  });

  const [textInput, setTextInput] = useState('');
  const [isSendingText, setIsSendingText] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [energySnapshot, setEnergySnapshot] = useState<{ input: number; output: number }>({
    input: 0,
    output: 0,
  });

  // Unified Music Player embed & popover state hosted inside One. orb
  const [musicPopoverOpen, setMusicPopoverOpen] = useState(false);
  const [showMiniVideo, setShowMiniVideo] = useState(false);
  const [stageRect, setStageRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [auroraIdx, setAuroraIdx] = useState(0);
  const embedIframeRef = useRef<HTMLIFrameElement | null>(null);
  const popoverStageAnchorRef = useRef<HTMLDivElement | null>(null);

  const phaseRef = useRef<VoicePhase>('idle');
  phaseRef.current = phase;
  const emotionRef = useRef<CompanionEmotion>('calm');
  emotionRef.current = emotion;
  const emotionIntensityRef = useRef<number>(0.65);
  emotionIntensityRef.current = emotionIntensity;
  const voiceActiveRef = useRef(false);
  voiceActiveRef.current = voiceActive;
  const mutedOutputRef = useRef(false);
  mutedOutputRef.current = mutedOutput;
  const listeningModeRef = useRef<VoiceListeningMode>(listeningMode);
  listeningModeRef.current = listeningMode;
  const profileKeyRef = useRef<string>(getAiProfileKey());
  const voiceSessionIdRef = useRef<string>(
    (() => {
      try {
        const saved = localStorage.getItem(VOICE_SESSION_STORAGE_KEY);
        if (saved && saved.trim()) return saved.trim();
      } catch {}
      const fresh = `voice_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      try {
        localStorage.setItem(VOICE_SESSION_STORAGE_KEY, fresh);
      } catch {}
      return fresh;
    })()
  );

  const wsRef = useRef<WebSocket | null>(null);
  const audioClientRef = useRef<AudioLiveClient | null>(null);
  const fallbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const fallbackObjectUrlRef = useRef<string | null>(null);
  const speakSeqRef = useRef(0);
  const autoSpeakTextRef = useRef(false);
  const suppressUserSpeechUntilRef = useRef(0);
  const speechRecRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const orbCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hudOrbCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const voiceNameRef = useRef(voiceName);
  voiceNameRef.current = voiceName;
  const currentOutputTurnIdRef = useRef<string | null>(null);
  const currentInputTurnIdRef = useRef<string | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Music player synchronization refs
  const playerRef = useRef(player);
  playerRef.current = player;
  const isMusicPlayingRef = useRef(false);
  const pausedMusicForVoiceRef = useRef(false);
  const explicitStopMusicRef = useRef(false);
  const speculativePauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentTrack = player?.currentTrack ?? null;
  const isMusicPlaying = Boolean(player?.state.isPlaying);
  isMusicPlayingRef.current = isMusicPlaying;
  const isOnVenus = currentTab === 'venus';
  const canRunAudioSession = Boolean(
    isAuthenticated && player?.sessionActivated && !player?.userStopped && currentTrack
  );
  const rawEmbed =
    currentTrack?.playback.embedUrl ||
    (currentTrack?.raw as any)?.embedUrl ||
    currentTrack?.sources.find((s) => s.kind === 'embed' && s.embedUrl)?.embedUrl;
  const liveEmbedSrc = canRunAudioSession ? buildUnifiedEmbedUrl(rawEmbed, isMusicPlaying) : undefined;
  const showUnifiedMusicControls = canRunAudioSession && !isOnVenus;

  useEffect(() => {
    return subscribeVoiceListeningMode((mode) => {
      setListeningMode(mode);
      listeningModeRef.current = mode;
    });
  }, []);

  const sendYouTubeCmd = useCallback((func: 'playVideo' | 'pauseVideo' | 'stopVideo') => {
    try {
      const win = embedIframeRef.current?.contentWindow;
      if (!win) return;
      if (func === 'stopVideo') {
        win.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*');
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

  const pauseMusicForVoice = useCallback(
    (isSpeculative = false) => {
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
            if (phaseRef.current !== 'speaking' && phaseRef.current !== 'thinking' && pausedMusicForVoiceRef.current) {
              resumeMusicIfPausedForVoice();
            }
          }, 1800);
        }
      }
    },
    [resumeMusicIfPausedForVoice, sendYouTubeCmd]
  );

  // Cycle aurora aura color while music is playing outside Venus tab
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

  useEffect(() => {
    if (!liveEmbedSrc || !liveEmbedSrc.includes('youtube')) return;
    sendYouTubeCmd(isMusicPlaying ? 'playVideo' : 'pauseVideo');
  }, [isMusicPlaying, liveEmbedSrc, sendYouTubeCmd]);

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
    window.addEventListener('one-venus-stage-change', measure);
    const rafTick = setInterval(measure, 250);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('one-venus-stage-change', measure);
      clearInterval(rafTick);
    };
  }, [canRunAudioSession, liveEmbedSrc, isOnVenus, musicPopoverOpen, showMiniVideo, currentTrack?.id]);

  // Build live page context snapshot on demand
  const getPageContext = useCallback((): LivePageContextSummary => {
    return collectLivePageContext({
      currentTab,
      theme,
      lang,
      isAuthenticated,
      userName,
      userCity,
      music: player
        ? {
            isPlaying: player.state.isPlaying,
            title: player.currentTrack?.title,
            artist: player.currentTrack?.artist,
            volume: Math.round((player.state.volume ?? 0.8) * 100),
            muted: player.state.muted,
          }
        : undefined,
    });
  }, [currentTab, theme, lang, isAuthenticated, userName, userCity, player]);

  const proactiveSuggestions = useMemo(() => {
    return collectLivePageContext({
      currentTab,
      theme,
      lang,
      isAuthenticated,
      userName,
      userCity,
      music: player
        ? {
            isPlaying: player.state.isPlaying,
            title: player.currentTrack?.title,
            artist: player.currentTrack?.artist,
            volume: Math.round((player.state.volume ?? 0.8) * 100),
            muted: player.state.muted,
          }
        : undefined,
    }).proactiveSuggestions;
  }, [currentTab, theme, lang, isAuthenticated, userName, userCity, player, hudOpen]);

  const controlHandlersRef = useRef<WebsiteControlHandlers>({
    lang,
    theme,
    player,
    getPageContext,
  });
  controlHandlersRef.current = {
    lang,
    theme,
    player,
    getPageContext,
    onNavigateTab: props.onNavigateTab,
    onFlyTo: props.onFlyTo,
    onExploreUniverse: props.onExploreUniverse,
    onOpenAIHub: props.onOpenAIHub,
    onPlayMusicAction: props.onPlayMusicAction,
    onOpenBookAction: props.onOpenBookAction,
    onWatchDocumentaryAction: props.onWatchDocumentaryAction,
    onBrowserSearchAction: props.onBrowserSearchAction,
    onGlobalSearchAction: props.onGlobalSearchAction,
    onSetTheme: props.onSetTheme,
    onSetLang: props.onSetLang,
    onSetImmersive: props.onSetImmersive,
    onOpenCommandPalette: props.onOpenCommandPalette,
    onReplayIntro: props.onReplayIntro,
    onCreatePost: props.onCreatePost,
    onCreateArticle: props.onCreateArticle,
    onFilterCountry: props.onFilterCountry,
    onToggleJoinCommunity: props.onToggleJoinCommunity,
    onOpenBook: props.onOpenBook,
    onOpenKnowledge: props.onOpenKnowledge,
    onOpenProfile: props.onOpenProfile,
    onOpenAuth: props.onOpenAuth,
    onOpenSecurity: props.onOpenSecurity,
    onToggleLocationPrivacy: props.onToggleLocationPrivacy,
    onOpenMessages: props.onOpenMessages,
    onOpenCalls: props.onOpenCalls,
    onQuickCall: props.onQuickCall,
  };

  useEffect(() => {
    if (hudOpen) {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [transcript, hudOpen]);

  const appendEntry = useCallback(
    (role: TranscriptEntry['role'], text: string, extra?: Partial<TranscriptEntry>) => {
      const clean = stripCompanionMarkup(text);

      if (!clean) return '';
      const id = `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setTranscript((prev) => [...prev.slice(-24), { id, role, text: clean, ...extra }]);
      return id;
    },
    []
  );

  // Stop all AI audio output immediately (< 5ms)
  const stopAllOutputImmediately = useCallback((markInterrupted = true) => {
    const wasSpeaking = phaseRef.current === 'speaking';
    speakSeqRef.current += 1;
    audioClientRef.current?.flushOutput();
    stopSteadyVoice();
    if (fallbackAudioRef.current) {
      try {
        fallbackAudioRef.current.onended = null;
        fallbackAudioRef.current.onerror = null;
        fallbackAudioRef.current.pause();
        fallbackAudioRef.current.src = '';
      } catch {}
      fallbackAudioRef.current = null;
    }
    if (fallbackObjectUrlRef.current) {
      try {
        URL.revokeObjectURL(fallbackObjectUrlRef.current);
      } catch {}
      fallbackObjectUrlRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch {}
      abortControllerRef.current = null;
    }

    if (markInterrupted && currentOutputTurnIdRef.current) {
      const targetId = currentOutputTurnIdRef.current;
      setTranscript((prev) =>
        prev.map((item) => (item.id === targetId ? { ...item, interrupted: true } : item))
      );
    }
    currentOutputTurnIdRef.current = null;

    // After barge-in/stop, briefly ignore mic transcripts to avoid feeding echoed TTS tail back as user speech.
    if (wasSpeaking) {
      suppressUserSpeechUntilRef.current = Date.now() + 1200;
    }

    if (voiceActiveRef.current) {
      setPhase('listening');
    } else if (phaseRef.current === 'speaking' || phaseRef.current === 'thinking') {
      setPhase('idle');
    }
  }, []);

  const handleManualInterrupt = useCallback(() => {
    stopAllOutputImmediately(true);
    setEmotion('curious');
    setEmotionReason(isZh ? '随时听你说' : 'All ears');
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'interrupt' }));
      } catch {}
    }
  }, [isZh, stopAllOutputImmediately]);

  // Keep live Gemini session synced whenever user navigates or changes theme/music
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const timer = setTimeout(() => {
      try {
        ws.send(
          JSON.stringify({
            type: 'context',
            pageContext: getPageContext(),
          })
        );
      } catch {}
    }, 150);
    return () => clearTimeout(timer);
  }, [currentTab, theme, lang, isAuthenticated, player?.state.isPlaying, player?.currentTrack?.id, getPageContext]);

  const stopVoiceSession = useCallback(() => {
    voiceActiveRef.current = false;
    autoSpeakTextRef.current = false;
    setVoiceActive(false);
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    stopAllOutputImmediately(false);

    if (speechRecRef.current) {
      try {
        speechRecRef.current.onend = null;
        speechRecRef.current.onresult = null;
        speechRecRef.current.abort?.();
        speechRecRef.current.stop?.();
      } catch {}
      speechRecRef.current = null;
    }
    if (audioClientRef.current) {
      audioClientRef.current.dispose();
      audioClientRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
    setEnergySnapshot({ input: 0, output: 0 });
    setPhase('idle');
    resumeMusicIfPausedForVoice();
  }, [resumeMusicIfPausedForVoice, stopAllOutputImmediately]);

  useEffect(() => {
    return () => {
      stopVoiceSession();
    };
  }, [stopVoiceSession]);

  // Speak via Gemini TTS (POST /api/ai/tts), expressive keyless server TTS phrases (GET /api/ai/tts), or SpeechSynthesis fallback
  const speakFallbackReply = useCallback(
    async (text: string, replyEmotion: CompanionEmotion) => {
      if (mutedOutputRef.current) {
        resumeMusicIfPausedForVoice();
        return;
      }
      const clean = stripCompanionMarkup(text).replace(/[*_#`>]/g, '').trim();

      if (!clean) {
        resumeMusicIfPausedForVoice();
        return;
      }

      const mySeq = ++speakSeqRef.current;
      pauseMusicForVoice(false);
      setPhase('speaking');

      const speakUttAndWait = (phraseText: string): Promise<boolean> =>
        new Promise((resolve) => {
          if (mySeq !== speakSeqRef.current || mutedOutputRef.current || typeof window === 'undefined' || !('speechSynthesis' in window)) {
            resolve(false);
            return;
          }
          try {
            window.speechSynthesis.cancel();
            const utt = new SpeechSynthesisUtterance(phraseText);
            utt.lang = isZh ? 'zh-CN' : 'en-US';
            utt.volume = 0.85;
            utt.rate = 1.0;
            utt.pitch = 1.0;
            let settled = false;
            const done = (ok: boolean) => {
              if (settled) return;
              settled = true;
              resolve(ok);
            };
            utt.onend = () => done(true);
            utt.onerror = () => done(false);
            window.speechSynthesis.speak(utt);
          } catch {
            resolve(false);
          }
        });

      const finishAll = () => {
        if (mySeq === speakSeqRef.current) {
          // Suppress residual speaker echo so fallback speech recognition doesn't hear the AI as the user.
          suppressUserSpeechUntilRef.current = Date.now() + 1500;
          setPhase(voiceActiveRef.current ? 'listening' : 'idle');
          resumeMusicIfPausedForVoice();
        }
      };

      unlockSteadyVoiceAudio();

      // 1. Primary natural human voice via Gemini TTS (POST /api/ai/tts — steady loudness-locked WAV)
      try {
        const res = await fetch(apiUrl('/api/ai/tts'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: clean,
            emotion: replyEmotion,
            voiceName: voiceNameRef.current,
          }),
        });
        if (mySeq !== speakSeqRef.current || mutedOutputRef.current) return;
        if (res.ok) {
          const data = await res.json();
          if (data?.success && data.audioBase64) {
            const played = await playNormalizedBase64Audio(
              data.audioBase64,
              data.mimeType || 'audio/wav',
              () => mySeq === speakSeqRef.current && !mutedOutputRef.current
            );
            if (played) {
              finishAll();
              return;
            }
          }
        }
      } catch {
        // fall through to secondary normalized server TTS
      }

      if (mySeq !== speakSeqRef.current || mutedOutputRef.current) return;

      // 2. Fallback server TTS (GET /api/ai/tts) routed through steady loudness bus at locked 1.0x rate
      const voiceEmo = mapCompanionToVoiceEmotion(replyEmotion);
      const analysis = analyzeDialogueEmotion('', clean, voiceEmo);
      const phrases = buildExpressivePhrases(clean, analysis, 'audio');
      const phraseList =
        phrases.length > 0
          ? phrases
          : [
              {
                text: clean.slice(0, 220),
                emotion: voiceEmo,
                pitch: 1.0,
                rate: 1.0,
                baiduSpd: 5,
                audioPlaybackRate: 1.0,
                pauseAfterMs: 30,
              },
            ];

      for (let i = 0; i < phraseList.length; i++) {
        if (mySeq !== speakSeqRef.current || mutedOutputRef.current) return;
        const p = phraseList[i];
        let phrasePlayed = false;

        try {
          const ttsUrl = `${apiUrl('/api/ai/tts')}?text=${encodeURIComponent(p.text)}&lang=${isZh ? 'zh' : 'en'}&spd=5`;
          const getRes = await fetch(ttsUrl);
          if (mySeq !== speakSeqRef.current || mutedOutputRef.current) return;
          if (getRes.ok) {
            const ab = await getRes.arrayBuffer();
            if (ab.byteLength > 200) {
              phrasePlayed = await playNormalizedArrayBuffer(
                ab,
                'audio/mpeg',
                () => mySeq === speakSeqRef.current && !mutedOutputRef.current
              );
            }
          }
        } catch {
          phrasePlayed = false;
        }

        if (mySeq !== speakSeqRef.current || mutedOutputRef.current) return;

        if (!phrasePlayed) {
          await speakUttAndWait(p.text);
        }

        if (mySeq !== speakSeqRef.current || mutedOutputRef.current) return;
        if (i < phraseList.length - 1) {
          await new Promise((r) => setTimeout(r, 30));
        }
      }

      finishAll();
    },
    [isZh, pauseMusicForVoice, resumeMusicIfPausedForVoice]
  );

  // Fallback text/action turn via /api/ai/companion-turn
  const runCompanionTurnApi = useCallback(
    async (userPrompt: string, speakOut: boolean) => {
      const clean = userPrompt.trim();
      if (!clean) return;

      stopAllOutputImmediately(true);
      setIsSendingText(true);
      setPhase('thinking');
      appendEntry('user', clean);

      const recentHistory = transcript
        .filter((t) => t.role === 'user' || t.role === 'assistant')
        .slice(-14)
        .map((t) => ({ role: t.role as 'user' | 'assistant', content: t.text }));

      // Instant deterministic fast-path for crisp single commands (compound/emotional prompts go to Gemini)
      const isCompoundOrEmotional =
        clean.length > 18 ||
        /(?:有点|好累|疲惫|难过|开心|记住|顺便|并|并且|而且|然后|同时|顺手|\band\b|\bthen\b|\balso\b)/i.test(clean);
      const instant = isCompoundOrEmotional ? null : parseInstantAgentAction(clean, isZh, recentHistory);
      if (instant && instant.type !== 'none') {
        if (instant.type === 'play_music') {
          if (instant.control === 'stop' || instant.control === 'pause') {
            explicitStopMusicRef.current = true;
            pausedMusicForVoiceRef.current = false;
          } else {
            explicitStopMusicRef.current = false;
          }
          await executeGeminiToolCall(
            'control_music_player',
            instant.control
              ? { action: instant.control === 'prev' ? 'previous' : instant.control }
              : { action: 'play_query', query: instant.query },
            controlHandlersRef.current
          );
          setEmotion(instant.control === 'stop' ? 'calm' : 'happy');
        } else if (instant.type === 'watch_documentary') {
          await executeGeminiToolCall(
            'watch_cinema_video',
            { query: instant.query, platform: instant.platform, autoPlay: true },
            controlHandlersRef.current
          );
          setEmotion('excited');
        } else if (instant.type === 'open_book') {
          await executeGeminiToolCall('open_book_action', { query: instant.query }, controlHandlersRef.current);
          setEmotion('curious');
        } else if (instant.type === 'navigate_tab') {
          await executeGeminiToolCall('navigate_to_space', { space: instant.tab }, controlHandlersRef.current);
          setEmotion('focused');
        } else if (instant.type === 'browser_search') {
          await executeGeminiToolCall(
            'browser_and_search',
            { mode: 'browser_url_or_search', query: instant.query },
            controlHandlersRef.current
          );
          setEmotion('curious');
        } else if (instant.type === 'fly_to') {
          await executeGeminiToolCall(
            'control_earth_globe',
            { action: 'fly_to', lat: instant.lat, lng: instant.lng, placeName: instant.place },
            controlHandlersRef.current
          );
          setEmotion('excited');
        } else if (instant.type === 'set_theme') {
          await executeGeminiToolCall('control_appearance', { theme: instant.theme }, controlHandlersRef.current);
          setEmotion('happy');
        } else if (instant.type === 'set_language') {
          await executeGeminiToolCall('control_appearance', { language: instant.lang }, controlHandlersRef.current);
          setEmotion('happy');
        }
        appendEntry('assistant', instant.reply, { emotion: emotionRef.current });
        setIsSendingText(false);
        if (speakOut) {
          void speakFallbackReply(instant.reply, emotionRef.current);
        } else {
          setPhase(voiceActiveRef.current ? 'listening' : 'idle');
        }
        return;
      }

      const ac = new AbortController();
      abortControllerRef.current = ac;

      try {
        const res = await fetch(apiUrl('/api/ai/companion-turn'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ac.signal,
          body: JSON.stringify({
            prompt: clean,
            lang,
            sessionId: voiceSessionIdRef.current,
            profileKey: profileKeyRef.current,
            pageContext: getPageContext(),
            history: recentHistory,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (ac.signal.aborted) return;

        if (typeof data?.sessionId === 'string' && data.sessionId.trim()) {
          voiceSessionIdRef.current = data.sessionId.trim();
          try {
            localStorage.setItem(VOICE_SESSION_STORAGE_KEY, data.sessionId.trim());
          } catch {}
        }

        if (res.ok && data?.success) {
          let nextEmotion = (EMOTION_META[data.emotion as CompanionEmotion]
            ? data.emotion
            : 'calm') as CompanionEmotion;

          const actionSummaries: string[] = [];
          if (Array.isArray(data.toolCalls)) {
            for (const tc of data.toolCalls) {
              if (tc.name === 'control_music_player') {
                const act = String(tc.args?.action || '');
                if (act === 'stop' || act === 'pause') {
                  explicitStopMusicRef.current = true;
                  pausedMusicForVoiceRef.current = false;
                } else {
                  explicitStopMusicRef.current = false;
                }
              }
              const fb = await executeGeminiToolCall(tc.name, tc.args || {}, controlHandlersRef.current);
              if (fb.summary) {
                actionSummaries.push(fb.summary);
                appendEntry('action', fb.summary);
              }
            }
          }

          const cleanedDataReply = typeof data.reply === 'string' ? stripCompanionMarkup(data.reply) : '';
          const finalReply =
            cleanedDataReply ||

            (actionSummaries.length > 0
              ? isZh
                ? `好的，已经为你搞定：${actionSummaries.join('、')}。`
                : `All set! ${actionSummaries.join(', ')}.`
              : resolveConversationalFallback(clean, isZh));

          // Also enrich emotion with local dialogue analysis if model stayed neutral
          if (nextEmotion === 'calm') {
            const analyzed = analyzeDialogueEmotion(clean, finalReply);
            nextEmotion = mapVoiceEmotionToCompanion(analyzed.emotion);
            setEmotionIntensity(analyzed.intensity);
          } else {
            setEmotionIntensity(typeof data.emotionIntensity === 'number' ? data.emotionIntensity : 0.78);
          }

          setEmotion(nextEmotion);
          setEmotionReason(typeof data.emotionReason === 'string' ? data.emotionReason : '');

          currentOutputTurnIdRef.current = appendEntry('assistant', finalReply, { emotion: nextEmotion });
          if (speakOut) {
            void speakFallbackReply(finalReply, nextEmotion);
          } else {
            setPhase(voiceActiveRef.current ? 'listening' : 'idle');
          }
        } else {
          const fallback = resolveConversationalFallback(clean, isZh);
          setEmotion('concerned');
          setEmotionReason(isZh ? '网络波动' : 'Connection hiccup');
          appendEntry('assistant', fallback, { emotion: 'concerned' });
          setPhase(voiceActiveRef.current ? 'listening' : 'idle');
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          const fallback = resolveConversationalFallback(clean, isZh);
          setEmotion('concerned');
          appendEntry('assistant', fallback, { emotion: 'concerned' });
          setPhase(voiceActiveRef.current ? 'listening' : 'idle');
        }
      } finally {
        setIsSendingText(false);
      }
    },
    [appendEntry, getPageContext, isZh, lang, speakFallbackReply, stopAllOutputImmediately, transcript]
  );

  // Fallback Web SpeechRecognition loop when Gemini Live WS is unavailable
  const startSpeechRecognitionFallback = useCallback(() => {
    setLiveModeEngine('companion-api');
    autoSpeakTextRef.current = true;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      voiceActiveRef.current = false;
      setVoiceActive(false);
      setPhase('idle');
      setEmotion('empathetic');
      setEmotionReason(isZh ? 'One. 情绪对话与语音播报在线' : 'Emotional text + voice ready');
      appendEntry(
        'action',
        isZh
          ? '当前浏览器不支持持续麦克风听写，直接在下方输入文字，我同样会用带情绪的语音陪你聊。'
          : 'Continuous mic recognition is unavailable in this browser; type below and I will still reply with expressive voice.'
      );
      return;
    }

    setEmotion('happy');
    setEmotionReason(isZh ? 'One. 情绪伴侣在线 · 随时对话' : 'Emotional Companion Online');

    const launch = () => {
      if (!voiceActiveRef.current) return;
      try {
        const rec = new SpeechRec();
        rec.lang = isZh ? 'zh-CN' : 'en-US';
        rec.continuous = true;
        rec.interimResults = true;
        rec.onstart = () => {
          if (voiceActiveRef.current) setPhase('listening');
        };
        rec.onresult = (e: any) => {
          let finalText = '';
          let interimText = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
            else interimText += e.results[i][0].transcript;
          }
          const heard = interimText.trim() || finalText.trim();
          // While AI is speaking, mic/SR will often pick up speaker output as "echo". Never treat it as a user turn.
          if (heard && phaseRef.current === 'speaking') {
            suppressUserSpeechUntilRef.current = Math.max(
              suppressUserSpeechUntilRef.current,
              Date.now() + 1200
            );
            return;
          }
          // Drop residual speaker echo tail after AI playback ends.
          if (Date.now() < suppressUserSpeechUntilRef.current) {
            return;
          }
          if (finalText.trim()) {
            void runCompanionTurnApi(finalText.trim(), true);
          }
        };
        rec.onend = () => {
          if (voiceActiveRef.current) {
            setTimeout(launch, 300);
          }
        };
        speechRecRef.current = rec;
        rec.start();
      } catch {
        setPhase('error');
      }
    };
    launch();
  }, [isZh, runCompanionTurnApi, stopAllOutputImmediately]);

  // Start Gemini Live real-time full-duplex bidirectional voice session
  const startLiveVoiceSession = useCallback(async () => {
    stopVoiceSession();
    voiceActiveRef.current = true;
    setVoiceActive(true);
    setHudOpen(true);
    setPhase('connecting');
    setEmotion('curious');
    setEmotionReason(isZh ? '正在建立实时全双工语音' : 'Connecting live duplex voice');

    const audioClient = new AudioLiveClient();
    audioClientRef.current = audioClient;

    const liveWsUrl = `${wsUrl('/ws/ai-live')}?profileKey=${encodeURIComponent(profileKeyRef.current)}`;
    const ws = new WebSocket(liveWsUrl);
    wsRef.current = ws;

    let liveFailed = false;

    ws.onopen = async () => {
      if (!voiceActiveRef.current) return;
      ws.send(
        JSON.stringify({
          type: 'init',
          lang,
          aiName,
          sessionId: voiceSessionIdRef.current,
          voiceName: voiceNameRef.current,
          profileKey: profileKeyRef.current,
          pageContext: getPageContext(),
        })
      );
      try {
        await audioClient.startMic({
          onMicPcmBase64: (b64) => {
            if (ws.readyState === WebSocket.OPEN && !liveFailed) {
              ws.send(JSON.stringify({ type: 'audio', data: b64 }));
            }
          },
          onLocalBargeIn: () => {
            // Instant <5ms local barge-in before server round-trip
            stopAllOutputImmediately(true);
            pauseMusicForVoice(true);
            setEmotion('curious');
            setEmotionReason(isZh ? '我在听，你说' : 'All ears — listening');
          },
        });
      } catch {
        setPhase('error');
        setEmotion('concerned');
        setEmotionReason(isZh ? '需要麦克风权限' : 'Microphone permission needed');
        appendEntry(
          'action',
          isZh
            ? '未获取到麦克风权限，你仍可以在下方直接输入文字控制整个网站。'
            : 'Microphone unavailable — type below anytime to talk and control everything.'
        );
        voiceActiveRef.current = false;
        setVoiceActive(false);
      }
    };

    ws.onmessage = async (event) => {
      let msg: any;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === 'ready') {
        if (msg.engine === 'deepseek' || msg.streaming) return;
        setLiveModeEngine('gemini-live');
        if (voiceActiveRef.current) {
          setPhase('listening');
          setEmotion('happy');
          setEmotionReason(isZh ? '全双工在线 · 随时召唤/打断' : 'Duplex Ready · Always listening');
        }
        return;
      }

      if (msg.type === 'live_unavailable') {
        liveFailed = true;
        audioClient.stopMic();
        try {
          ws.close();
        } catch {}
        wsRef.current = null;
        startSpeechRecognitionFallback();
        return;
      }

      if (msg.type === 'audio' && typeof msg.data === 'string') {
        pauseMusicForVoice(false);
        if (!mutedOutputRef.current) {
          audioClient.setAssistantOutputting(true);
          audioClient.enqueuePcm24k(msg.data);
        }
        if (phaseRef.current !== 'speaking') {
          setPhase('speaking');
        }
        return;
      }

      if (msg.type === 'interrupted') {
        stopAllOutputImmediately(true);
        setEmotion('curious');
        setEmotionReason(isZh ? '收到你的打断，请讲' : 'Interrupted — listening');
        return;
      }

      if (msg.type === 'input_transcript' && typeof msg.text === 'string') {
        const piece = msg.text;
        if (!piece.trim()) return;

        // During AI playback (or right after), incoming "user" transcripts are often speaker echo picked up by the mic.
        // Ignore them to prevent self-dialogue loops; real barge-in is handled by local VAD / server interrupt.
        const assistantPlaying =
          phaseRef.current === 'speaking' ||
          Boolean(audioClientRef.current?.isPlayingOutput());
        if (assistantPlaying || Date.now() < suppressUserSpeechUntilRef.current) {
          suppressUserSpeechUntilRef.current = Math.max(
            suppressUserSpeechUntilRef.current,
            Date.now() + 1200
          );
          return;
        }

        currentOutputTurnIdRef.current = null;
        setTranscript((prev) => {
          const existingId = currentInputTurnIdRef.current;
          if (existingId && prev.some((item) => item.id === existingId)) {
            return prev.map((item) =>
              item.id === existingId ? { ...item, text: item.text + piece } : item
            );
          }
          const newId = `user_${Date.now()}`;
          currentInputTurnIdRef.current = newId;
          return [...prev.slice(-24), { id: newId, role: 'user', text: piece }];
        });
        return;
      }

      if (msg.type === 'output_transcript' && typeof msg.text === 'string') {
        const piece = stripCompanionMarkup(msg.text);
        if (!piece.trim()) return;
        currentInputTurnIdRef.current = null;
        setTranscript((prev) => {
          const existingId = currentOutputTurnIdRef.current;
          if (existingId && prev.some((item) => item.id === existingId)) {
            return prev.map((item) =>
              item.id === existingId
                ? { ...item, text: item.text + piece, emotion: emotionRef.current }
                : item
            );
          }
          const newId = `assistant_${Date.now()}`;
          currentOutputTurnIdRef.current = newId;
          return [
            ...prev.slice(-24),
            { id: newId, role: 'assistant', text: piece, emotion: emotionRef.current },
          ];
        });
        return;
      }

      if (msg.type === 'emotion' && typeof msg.emotion === 'string') {
        const nextEmotion = (EMOTION_META[msg.emotion as CompanionEmotion]
          ? msg.emotion
          : 'calm') as CompanionEmotion;
        setEmotion(nextEmotion);
        if (typeof msg.intensity === 'number') setEmotionIntensity(msg.intensity);
        if (typeof msg.reason === 'string') setEmotionReason(msg.reason);
        return;
      }

      if (msg.type === 'tool_call' && Array.isArray(msg.calls)) {
        setPhase('thinking');
        const responses: Array<{ id?: string; name: string; response: Record<string, unknown> }> = [];
        for (const call of msg.calls) {
          if (call.name === 'control_music_player') {
            const act = String(call.args?.action || '');
            if (act === 'stop' || act === 'pause') {
              explicitStopMusicRef.current = true;
              pausedMusicForVoiceRef.current = false;
            } else {
              explicitStopMusicRef.current = false;
            }
          }
          const fb = await executeGeminiToolCall(call.name, call.args || {}, controlHandlersRef.current);
          if (fb.summary) {
            appendEntry('action', fb.summary);
          }
          responses.push({
            id: call.id,
            name: call.name,
            response: fb.response,
          });
        }
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'tool_response', responses }));
        }
        return;
      }

      if (msg.type === 'turn_complete') {
        // If we are still inside an echo-suppression window, discard any half-captured "user" transcript (likely AI echo).
        if (Date.now() < suppressUserSpeechUntilRef.current) {
          if (currentInputTurnIdRef.current) {
            const uid = currentInputTurnIdRef.current;
            setTranscript((prev) => prev.filter((item) => item.id !== uid));
          }
          currentInputTurnIdRef.current = null;
        }
        currentInputTurnIdRef.current = null;
        currentOutputTurnIdRef.current = null;
        audioClient.setAssistantOutputting(false);
        const finishTurn = () => {
          if (voiceActiveRef.current) {
            // echo tail guard before re-arming listening state
            suppressUserSpeechUntilRef.current = Math.max(
              suppressUserSpeechUntilRef.current,
              Date.now() + 800
            );
            setPhase('listening');
          }
          resumeMusicIfPausedForVoice();
        };
        if (!audioClient.isPlayingOutput()) {
          finishTurn();
        } else {
          const checkDone = setInterval(() => {
            if (!voiceActiveRef.current) {
              clearInterval(checkDone);
              return;
            }
            if (!audioClient.isPlayingOutput()) {
              clearInterval(checkDone);
              finishTurn();
            }
          }, 120);
        }
        return;
      }

      if (msg.type === 'live_error') {
        setEmotion('concerned');
        setEmotionReason(isZh ? '语音通道波动，随时重连' : 'Voice channel hiccup');
      }
    };

    ws.onerror = () => {
      if (!liveFailed && voiceActiveRef.current) {
        liveFailed = true;
        startSpeechRecognitionFallback();
      }
    };

    ws.onclose = () => {
      // Keep always-on voice active by auto-reconnecting seamlessly if session wasn't explicitly stopped
      if (voiceActiveRef.current && !liveFailed) {
        if (listeningModeRef.current === 'always-listening') {
          setPhase('connecting');
          reconnectTimerRef.current = setTimeout(() => {
            if (voiceActiveRef.current) {
              void startLiveVoiceSession();
            }
          }, 1200);
        } else {
          setPhase('idle');
          setVoiceActive(false);
        }
      }
    };
  }, [
    appendEntry,
    getPageContext,
    isZh,
    lang,
    pauseMusicForVoice,
    resumeMusicIfPausedForVoice,
    startSpeechRecognitionFallback,
    stopAllOutputImmediately,
    stopVoiceSession,
  ]);

  // Sample real-time input/output audio energy for HUD waveform bars
  useEffect(() => {
    if (!voiceActive && !hudOpen) return;
    const id = setInterval(() => {
      const e = audioClientRef.current?.getEnergies() || { input: 0, output: 0 };
      setEnergySnapshot(e);
    }, 65);
    return () => clearInterval(id);
  }, [voiceActive, hudOpen]);

  // Send text prompt (works in Live WS mode OR Companion HTTP mode; interrupts audio immediately!)
  const handleSendText = useCallback(
    async (overrideText?: string) => {
      const raw = (overrideText ?? textInput).trim();
      if (!raw) return;
      if (!overrideText) setTextInput('');

      // Interrupt any active speech immediately when user submits a command
      stopAllOutputImmediately(true);

      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && liveModeEngine === 'gemini-live') {
        appendEntry('user', raw);
        setPhase('thinking');
        ws.send(JSON.stringify({ type: 'text', text: raw }));
        return;
      }

      await runCompanionTurnApi(raw, voiceActiveRef.current || autoSpeakTextRef.current);
    },
    [appendEntry, liveModeEngine, runCompanionTurnApi, stopAllOutputImmediately, textInput]
  );

  // Draggable launcher orb positioning
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
      const saved = localStorage.getItem(POS_KEY);
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
  const dragStateRef = useRef({
    active: false,
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    moved: false,
  });
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

  // Living 3D Emotion-Reactive WebGL Orb renderer
  useEffect(() => {
    if (!showLauncher) return;
    const mountOrb = (canvas: HTMLCanvasElement | null, size: number) => {
      if (!canvas) return () => {};
      canvas.width = size;
      canvas.height = size;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
      camera.position.z = 2.45;

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      } catch {
        return () => {};
      }
      renderer.setSize(size, size);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

      const coreGeo = new THREE.IcosahedronGeometry(0.72, 2);
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0x8ecfff,
        wireframe: true,
        transparent: true,
        opacity: 0.9,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      scene.add(coreMesh);

      const nucGeo = new THREE.SphereGeometry(0.34, 20, 20);
      const nucMat = new THREE.MeshBasicMaterial({
        color: 0xe5c17d,
        transparent: true,
        opacity: 0.92,
      });
      const nucMesh = new THREE.Mesh(nucGeo, nucMat);
      scene.add(nucMesh);

      const ringGeo = new THREE.TorusGeometry(0.95, 0.018, 8, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x8ecfff,
        transparent: true,
        opacity: 0.45,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI * 0.36;
      scene.add(ringMesh);

      const colorTarget = new THREE.Color(0x8ecfff);
      const nucColorTarget = new THREE.Color(0xe5c17d);
      let rafId = 0;
      let t = 0;
      let alive = true;

      const animate = () => {
        if (!alive || document.hidden) return;
        rafId = requestAnimationFrame(animate);

        const curPhase = phaseRef.current;
        const curEmotion = emotionRef.current;
        const emoMeta = EMOTION_META[curEmotion] || EMOTION_META.calm;
        const energies = audioClientRef.current?.getEnergies() || { input: 0, output: 0 };

        colorTarget.setHex(emoMeta.hex);
        if (curPhase === 'listening') {
          nucColorTarget.setHex(0x34d399);
        } else if (curPhase === 'speaking') {
          nucColorTarget.setHex(0xf5c451);
        } else if (curPhase === 'error') {
          colorTarget.setHex(0xf87171);
          nucColorTarget.setHex(0xfca5a5);
        } else {
          nucColorTarget.setHex(emoMeta.hex);
        }

        coreMat.color.lerp(colorTarget, 0.14);
        ringMat.color.lerp(colorTarget, 0.14);
        nucMat.color.lerp(nucColorTarget, 0.14);

        const audioEnergy = Math.max(energies.input, energies.output);
        const emotionBoost =
          curEmotion === 'excited'
            ? 1.5
            : curEmotion === 'playful'
              ? 1.35
              : curEmotion === 'thinking'
                ? 1.25
                : curEmotion === 'concerned'
                  ? 0.85
                  : 1.0;

        const speed = (voiceActiveRef.current ? 1.35 : 0.9) * emotionBoost + audioEnergy * 2.2;
        t += 0.024 * speed;

        coreMesh.rotation.y += 0.015 * speed;
        coreMesh.rotation.x += 0.007 * speed;
        ringMesh.rotation.z += 0.018 * speed;
        ringMesh.rotation.y = Math.sin(t * 0.6) * 0.45;

        const nucScale = 1 + Math.sin(t * 2.4) * 0.08 + audioEnergy * 0.42;
        nucMesh.scale.set(nucScale, nucScale, nucScale);

        const shellScale = 1 + audioEnergy * 0.16 * emotionIntensityRef.current;
        coreMesh.scale.set(shellScale, shellScale, shellScale);

        renderer.render(scene, camera);
      };

      const onVis = () => {
        if (!document.hidden && alive) {
          cancelAnimationFrame(rafId);
          animate();
        }
      };
      document.addEventListener('visibilitychange', onVis);
      animate();

      return () => {
        alive = false;
        document.removeEventListener('visibilitychange', onVis);
        cancelAnimationFrame(rafId);
        coreGeo.dispose();
        coreMat.dispose();
        nucGeo.dispose();
        nucMat.dispose();
        ringGeo.dispose();
        ringMat.dispose();
        renderer.dispose();
      };
    };

    const cleanMain = mountOrb(orbCanvasRef.current, placement === 'center-bottom' ? 38 : 44);
    const cleanHud = mountOrb(hudOrbCanvasRef.current, 36);
    return () => {
      cleanMain();
      cleanHud();
    };
  }, [showLauncher, placement, hudOpen]);

  const handleLauncherClick = () => {
    if (suppressClickRef.current) return;
    player?.unlockAudio();
    if (!voiceActive) {
      setHudOpen(true);
      void startLiveVoiceSession();
    } else {
      stopVoiceSession();
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
        localStorage.setItem(POS_KEY, JSON.stringify(finalPos));
      } catch {}
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 60);
    }
  };

  if (!showLauncher && !canRunAudioSession) return null;

  const emotionInfo = EMOTION_META[emotion] || EMOTION_META.calm;
  const glowColors = [
    'shadow-[0_0_24px_rgba(56,189,248,0.48)]',
    'shadow-[0_0_24px_rgba(192,132,252,0.48)]',
    'shadow-[0_0_24px_rgba(244,114,182,0.48)]',
    'shadow-[0_0_24px_rgba(251,191,36,0.48)]',
    'shadow-[0_0_24px_rgba(52,211,153,0.48)]',
  ];
  const activeBorderClass = voiceActive
    ? emotionInfo.ringClass
    : showUnifiedMusicControls && isMusicPlaying
      ? `border-white/25 ${glowColors[auroraIdx]}`
      : 'border-white/18 shadow-[0_14px_38px_rgba(0,0,0,0.68)] hover:border-[#8ECFFF]/60';

  const phaseLabel = (() => {
    switch (phase) {
      case 'connecting':
        return isZh ? '正在连接' : 'Connecting';
      case 'listening':
        return isZh ? '全双工聆听中' : 'Duplex Listening';
      case 'thinking':
        return isZh ? '思考执行中' : 'Thinking';
      case 'speaking':
        return isZh ? '说话中 · 随时开口打断' : 'Speaking · Speak to interrupt';
      case 'error':
        return isZh ? '需麦克风权限' : 'Mic Needed';
      default:
        return isZh ? emotionInfo.zh : emotionInfo.en;
    }
  })();

  const activePillLabel = (() => {
    if (!voiceActive && phase !== 'error') {
      return showUnifiedMusicControls && currentTrack?.title ? currentTrack.title : 'One.';
    }
    return `One. · ${phaseLabel}`;
  })();

  const activeLevel = Math.max(energySnapshot.input, energySnapshot.output);
  const trackTitle = currentTrack?.title || (isZh ? '正在播放' : 'Now Playing');
  const trackArtist = currentTrack?.artist || 'ONE Music';
  const trackCover = currentTrack?.coverUrl || DEFAULT_MUSIC_COVER;
  const trackSource = currentTrack?.source || currentTrack?.playback.provider || 'YouTube / Bilibili';
  const displayCornerLeft =
    showUnifiedMusicControls && typeof window !== 'undefined'
      ? Math.min(launcherPos.x, Math.max(10, window.innerWidth - 260))
      : launcherPos.x;

  const renderMusicPopover = () =>
    showUnifiedMusicControls && musicPopoverOpen ? (
      <div className="mb-3 w-[min(88vw,288px)] rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 shadow-xl backdrop-blur-2xl dark:border-white/15 dark:bg-[#162238]/95">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{trackTitle}</div>
            <div className="truncate text-xs text-slate-500 dark:text-slate-400">
              {trackArtist} · {trackSource}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMusicPopoverOpen(false)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label={isZh ? '关闭音乐卡片' : 'Close music card'}
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
                props.onNavigateTab?.('venus');
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
      {/* Persistent YouTube / Bilibili embed hosted cleanly across pages */}
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
            onLoad={() => {
              if (!liveEmbedSrc || !liveEmbedSrc.includes('youtube')) return;
              try {
                const win = embedIframeRef.current?.contentWindow;
                if (!win) return;
                win.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
                sendYouTubeCmd(isMusicPlayingRef.current ? 'playVideo' : 'pauseVideo');
              } catch {}
            }}
            className="h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}

      {/* Floating Launcher Orb + Embedded Music Pill */}
      {showLauncher && (
        placement === 'center-bottom' ? (
          <div
            id="globe-ai-launcher"
            className="fixed bottom-[calc(5.1rem+env(safe-area-inset-bottom))] md:bottom-7 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center select-none"
          >
            {renderMusicPopover()}
            <div className="flex items-center gap-1.5">
              <div
                className={`inline-flex min-h-[46px] items-center gap-1.5 rounded-full border bg-[#070B16]/88 backdrop-blur-2xl p-1 transition-all duration-500 ${activeBorderClass}`}
              >
                <button
                  type="button"
                  onClick={handleLauncherClick}
                  aria-label="One."
                  aria-pressed={voiceActive}
                  title={activePillLabel}
                  className="group relative inline-flex h-9 items-center gap-2 rounded-full pl-1 pr-3 transition-transform cursor-pointer hover:scale-[1.02] active:scale-95"
                >
                  <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.04] border border-white/12">
                    {showUnifiedMusicControls && (
                      <span
                        className={`one-wrist-aurora absolute -inset-[2px] rounded-full opacity-90 pointer-events-none ${
                          isMusicPlaying ? '' : '[animation-play-state:paused] opacity-40'
                        }`}
                      />
                    )}
                    <canvas ref={orbCanvasRef} className="relative z-10 pointer-events-none h-7 w-7 rounded-full" />
                  </span>
                  <span className="max-w-[155px] truncate text-xs font-semibold tracking-[0.08em] text-[#F7F5F0]">
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
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/90 transition hover:bg-white/20 cursor-pointer"
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
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/90 transition hover:bg-white/20 cursor-pointer"
                    >
                      <SkipForward className="h-3.5 w-3.5 fill-current" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMusicPopoverOpen((o) => !o)}
                      title={isZh ? '音乐详情' : 'Music details'}
                      className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-slate-900 cursor-pointer hover:scale-105 transition"
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
              <button
                type="button"
                onClick={() => setHudOpen((v) => !v)}
                title={hudOpen ? (isZh ? '收起面板' : 'Collapse') : (isZh ? '展开 One. 智能面板' : 'Open One. HUD')}
                aria-label={hudOpen ? 'Collapse AI HUD' : 'Expand AI HUD'}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/18 bg-[#070B16]/88 text-[#F7F5F0] backdrop-blur-2xl transition-all hover:border-[#8ECFFF]/60 hover:scale-105 active:scale-95 cursor-pointer shadow-[0_14px_38px_rgba(0,0,0,0.55)]"
              >
                {hudOpen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            </div>
          </div>
        ) : (
          <div
            id="globe-ai-launcher"
            style={{ left: `${displayCornerLeft}px`, top: `${launcherPos.y}px` }}
            className="fixed z-40 flex flex-col items-start select-none"
          >
            {renderMusicPopover()}
            <div className="flex items-center gap-1.5">
              <div
                className={`inline-flex items-center gap-1 rounded-full border bg-[#070B16]/88 backdrop-blur-2xl p-1 transition-all duration-500 ${activeBorderClass}`}
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
                  <canvas ref={orbCanvasRef} className="relative z-10 pointer-events-none h-9 w-9 rounded-full" />
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
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/90 transition hover:bg-white/20 cursor-pointer"
                    >
                      <SkipForward className="h-3.5 w-3.5 fill-current" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMusicPopoverOpen((o) => !o)}
                      title={trackTitle}
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
              {!hudOpen && (
                <button
                  type="button"
                  onClick={() => setHudOpen(true)}
                  title={isZh ? '展开 One. 面板' : 'Open One. HUD'}
                  aria-label="Open One. Companion HUD"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-[#070B16]/85 text-slate-300 hover:text-white hover:border-[#8ECFFF]/50 backdrop-blur-xl shadow-lg transition-all cursor-pointer"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )
      )}

      {/* Expandable Floating Companion HUD */}
      {(showLauncher || isGardenHome) && hudOpen && (
        <section
          id="one-ai-hud"
          aria-label={`${aiName} Living AI Companion`}
          className={`fixed z-[65] flex flex-col overflow-hidden rounded-2xl border transition-all duration-200 ${
            isGardenHome
              ? isGardenDay
                ? 'border-white/55 bg-[#f7f3eb]/86 text-[#223029] shadow-[0_14px_40px_rgba(24,36,28,0.16)]'
                : 'border-white/14 bg-[#141d29]/82 text-[#f2eee6] shadow-[0_18px_46px_rgba(4,8,14,0.45)]'
              : `bg-[#0B101D]/95 text-slate-100 shadow-[0_24px_70px_rgba(0,0,0,0.65)] backdrop-blur-2xl ${emotionInfo.ringClass}`
          } ${
            placement === 'center-bottom'
              ? 'bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-[4.5rem] left-1/2 -translate-x-1/2'
              : 'bottom-[calc(5.2rem+env(safe-area-inset-bottom))] md:bottom-20 right-3 md:right-6'
          } w-[calc(100vw-1.5rem)] max-w-[360px] max-h-[64dvh]`}
        >
          {/* Header with Living Orb + Emotion Status + Controls */}
          <div className={`flex items-center justify-between gap-2 border-b px-3.5 py-2.5 ${isGardenDay ? 'border-black/10' : 'border-white/10'}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`relative h-8 w-8 shrink-0 rounded-full border flex items-center justify-center ${isGardenDay ? 'border-black/12 bg-black/[0.04]' : 'border-white/12 bg-white/[0.04]'}`}>
                <canvas ref={hudOrbCanvasRef} className="h-8 w-8 rounded-full pointer-events-none" />
              </div>
              <div className="min-w-0">
                <div className={`flex items-center gap-1.5 text-xs font-semibold tracking-wide ${isGardenDay ? 'text-[#1d2a23]' : 'text-white'}`}>
                  <span>{aiName}</span>
                  <span className="opacity-45">·</span>
                  <span className="inline-flex items-center gap-1 font-medium opacity-85 truncate">
                    <EmotionIcon emotion={emotion} />
                    <span>{isZh ? emotionInfo.zh : emotionInfo.en}</span>
                  </span>
                </div>
                <div className={`text-[11px] truncate ${isGardenDay ? 'text-[#42554a]' : 'text-slate-400'}`}>
                  {emotionReason ? `${emotionReason} · ${phaseLabel}` : phaseLabel}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setMutedOutput((v) => !v)}
                title={mutedOutput ? (isZh ? '取消静音' : 'Unmute AI') : (isZh ? '静音 AI 语音' : 'Mute AI')}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                  isGardenDay ? 'text-[#394b42] hover:bg-black/[0.06] hover:text-[#18251e]' : 'text-slate-400 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                {mutedOutput ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setShowVoiceMenu((v) => !v)}
                title={isZh ? '声线与双工模式设置' : 'Voice & Duplex Settings'}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                  isGardenDay ? 'text-[#394b42] hover:bg-black/[0.06] hover:text-[#18251e]' : 'text-slate-400 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setHudOpen(false)}
                title={isZh ? '收起面板' : 'Minimize'}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                  isGardenDay ? 'text-[#394b42] hover:bg-black/[0.06] hover:text-[#18251e]' : 'text-slate-400 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Voice Timbre + Duplex Mode Drawer */}
          {showVoiceMenu && (
            <div className={`border-b px-3.5 py-2.5 space-y-2.5 ${isGardenDay ? 'border-black/10 bg-white/45' : 'border-white/10 bg-white/[0.03]'}`}>
              <div>
                <div className={`text-[11px] font-medium mb-1.5 ${isGardenDay ? 'text-[#42554a]' : 'text-slate-400'}`}>
                  {isZh ? '通话与召唤模式' : 'Summon & Listening Mode'}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      writeVoiceListeningMode('always-listening');
                      setListeningMode('always-listening');
                    }}
                    className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors cursor-pointer ${
                      listeningMode === 'always-listening'
                        ? isGardenDay
                          ? 'border-[#2a3832] bg-[#2a3832] text-[#f7f4ee]'
                          : 'border-white/30 bg-white/15 text-white'
                        : isGardenDay
                          ? 'border-black/10 bg-white/55 text-[#223029] hover:bg-white/80'
                          : 'border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/[0.06]'
                    }`}
                  >
                    {isZh ? '全双工 · 随时打断/召唤' : 'Always-On Duplex'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      writeVoiceListeningMode('click-to-speak');
                      setListeningMode('click-to-speak');
                    }}
                    className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors cursor-pointer ${
                      listeningMode === 'click-to-speak'
                        ? isGardenDay
                          ? 'border-[#2a3832] bg-[#2a3832] text-[#f7f4ee]'
                          : 'border-white/30 bg-white/15 text-white'
                        : isGardenDay
                          ? 'border-black/10 bg-white/55 text-[#223029] hover:bg-white/80'
                          : 'border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/[0.06]'
                    }`}
                  >
                    {isZh ? '手动开关对话' : 'Manual Mic Toggle'}
                  </button>
                </div>
              </div>

              <div>
                <div className={`text-[11px] font-medium mb-1.5 ${isGardenDay ? 'text-[#42554a]' : 'text-slate-400'}`}>
                  {isZh ? `选择 ${aiName} 声线` : 'Voice Persona'}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {VOICE_OPTIONS.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setVoiceName(v.id);
                        voiceNameRef.current = v.id;
                        uiStateManager.setVoiceName(v.id);
                        setShowVoiceMenu(false);
                        if (voiceActive) {
                          void startLiveVoiceSession();
                        }
                      }}
                      className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap truncate ${
                        voiceName === v.id
                          ? isGardenDay
                            ? 'border-[#2a3832] bg-[#2a3832] text-[#f7f4ee]'
                            : 'border-[#E5C17D]/60 bg-[#E5C17D]/15 text-[#F7E5BA]'
                          : isGardenDay
                            ? 'border-black/10 bg-white/55 text-[#223029] hover:bg-white/80'
                            : 'border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/[0.06]'
                      }`}
                    >
                      {isZh ? v.labelZh : v.labelEn}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Live Audio Energy Bar + Instant Interrupt Control */}
          {(voiceActive || phase === 'speaking') && (
            <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.02] px-3.5 py-2">
              <div className="flex items-center gap-1 h-5 flex-1">
                {[0.45, 0.75, 1.0, 0.8, 0.6, 0.9, 0.5, 0.7, 0.4].map((w, idx) => {
                  const scale = Math.max(0.22, Math.min(1, 0.22 + activeLevel * w * 1.15));
                  return (
                    <span
                      key={idx}
                      style={{
                        transform: `scaleY(${scale})`,
                        backgroundColor: emotionInfo.cssAccent,
                      }}
                      className="h-4 w-1 rounded-full transition-transform duration-75 origin-center"
                    />
                  );
                })}
                <span className="ml-2 text-[11px] text-slate-300 truncate">
                  {phase === 'speaking'
                    ? isZh
                      ? '直接开口即可打断并切换'
                      : 'Speak anytime to interrupt'
                    : isZh
                      ? '全双工实时听写 · 随时召唤'
                      : 'Live duplex listening'}
                </span>
              </div>
              {phase === 'speaking' && (
                <button
                  type="button"
                  onClick={handleManualInterrupt}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-400/50 bg-rose-500/20 px-2.5 py-1 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/30 transition-colors cursor-pointer shrink-0"
                >
                  <Square className="h-2.5 w-2.5 fill-current" />
                  <span>{isZh ? '打断' : 'Interrupt'}</span>
                </button>
              )}
            </div>
          )}

          {/* Conversation & Executed Actions Stream */}
          <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-2.5 min-h-[140px] max-h-[260px]">
            {transcript.length === 0 ? (
              <div className={`space-y-1.5 py-2 text-xs leading-relaxed ${isGardenDay ? 'text-[#2b3b32]' : 'text-slate-300'}`}>
                <p className={`font-medium ${isGardenDay ? 'text-[#18251e]' : 'text-white'}`}>
                  {isZh
                    ? `你好，我是 ${aiName} — 随时与你实时对话。`
                    : `Hi, I am ${aiName} — your real-time garden companion.`}
                </p>
                <p className={isGardenDay ? 'text-[#485a50]' : 'text-slate-400'}>
                  {isZh
                    ? '点击下方麦克风即可像真人一样自然对话：我说话时你随时开口就会立刻停下听你讲；还能记住你的喜好，并直接操控音乐、影院、图书馆、游戏、主题切换和页面上的所有元素。'
                    : 'Tap the mic for natural face-to-face voice chat: speak anytime to interrupt me mid-sentence, and ask me to control music, cinema, books, games, theme, or any control on screen.'}
                </p>
              </div>
            ) : (
              transcript.map((item) => {
                if (item.role === 'action') {
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-1.5 text-[11px] text-[#E5C17D] px-1"
                    >
                      <Zap className="h-3 w-3 shrink-0" />
                      <span>{item.text}</span>
                    </div>
                  );
                }
                const isUser = item.role === 'user';
                return (
                  <div
                    key={item.id}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[88%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                        isUser
                          ? isGardenDay
                            ? 'bg-[#2a3832]/12 border border-[#2a3832]/15 text-[#18251e]'
                            : 'bg-white/12 border border-white/15 text-white'
                          : isGardenDay
                            ? 'bg-white/65 border border-black/8 text-[#1e2c25]'
                            : 'bg-white/[0.06] border border-white/10 text-slate-100'
                      }`}
                    >
                      <span>{item.text}</span>
                      {item.interrupted && (
                        <span className="ml-1.5 text-[10px] opacity-65">
                          {isZh ? '· 已打断' : '· Interrupted'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={transcriptEndRef} />
          </div>

          {!isGardenHome && proactiveSuggestions.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto border-t border-white/10 px-3 py-2 [scrollbar-width:none]">
              {proactiveSuggestions.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => void handleSendText(s.prompt)}
                  className="shrink-0 rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-white/[0.1] hover:border-[#8ECFFF]/45 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendText();
            }}
            className={`flex items-center gap-2 border-t px-3 py-2.5 ${
              isGardenDay ? 'border-black/10 bg-white/45' : 'border-white/10 bg-white/[0.03]'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                player?.unlockAudio();
                if (voiceActive) stopVoiceSession();
                else void startLiveVoiceSession();
              }}
              title={voiceActive ? (isZh ? '关闭实时语音' : 'Stop Voice') : (isZh ? '开启全双工实时语音' : 'Start Live Duplex Voice')}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                voiceActive
                  ? isGardenDay
                    ? 'border-[#2a3832] bg-[#2a3832] text-[#f7f4ee]'
                    : 'border-white/30 bg-white/20 text-white'
                  : isGardenDay
                    ? 'border-black/15 bg-white/70 text-[#223029] hover:bg-white'
                    : 'border-white/12 bg-white/[0.05] text-slate-300 hover:bg-white/[0.1] hover:text-white'
              }`}
            >
              {voiceActive ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </button>

            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={
                isZh
                  ? '直接说或输入任何指令 / 问题…'
                  : 'Speak or type any command or question…'
              }
              className={`min-w-0 flex-1 h-9 rounded-xl border px-3 text-xs outline-none ${
                isGardenDay
                  ? 'border-black/15 bg-white/75 text-[#1d2a23] placeholder:text-[#4d5f54]/70 focus:border-[#2a3832]'
                  : 'border-white/12 bg-white/[0.05] text-white placeholder:text-slate-400 focus:border-white/35'
              }`}
            />

            <button
              type="submit"
              disabled={!textInput.trim() || isSendingText}
              aria-label={isZh ? '发送' : 'Send'}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer ${
                isGardenDay
                  ? 'bg-[#2a3832] text-[#f7f4ee] hover:bg-[#1e2924]'
                  : 'bg-[#e9e2d4] text-[#17202b] hover:bg-white'
              }`}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </section>
      )}
    </>
  );
};
