import { useSyncExternalStore } from 'react';
import type { WeatherKind, TimePreset } from '../components/paradise/paradiseEnvironment.ts';
import type { VoiceEmotion } from '../utils/emotionEngine.ts';

export type SpiritState =
  | 'idle_explore'
  | 'woken_approaching'
  | 'entering_pavilion'
  | 'working_in_pavilion'
  | 'presenting_result'
  | 'returning_to_rest'
  | 'sleeping_in_house';

export interface AgentStepView {
  id: string;
  label: string;
  status: string;
  detail?: string;
  timestamp?: string;
}

export interface AgentTaskView {
  sessionId?: string;
  prompt: string;
  module: string;
  status: 'running' | 'paused' | 'awaiting_confirmation' | 'completed' | 'failed';
  reply?: string;
  error?: string;
  steps: AgentStepView[];
  clientActions?: Array<Record<string, unknown>>;
  resultData?: Record<string, unknown>;
}

export interface AgentConfirmationRequest {
  confirmToken: string;
  sessionId: string;
  actionType: 'send_message' | 'start_audio_call' | 'start_video_call' | string;
  targetId: string;
  targetName: string;
  summary: string;
  preview: Record<string, unknown>;
}

export interface LiveWeatherInfo {
  locationName: string;
  temperatureC: number;
  humidityPct: number;
  windSpeedKmh: number;
  conditionZh: string;
  conditionEn: string;
  mappedWeather: WeatherKind;
  observedAt: string;
  unavailable?: boolean;
  error?: string;
}

export interface EnvironmentOverrideCommand {
  seq: number;
  weatherPreset?: WeatherKind;
  timePreset?: TimePreset;
  realtimeSync?: boolean;
}

export interface SpokenRescueCard {
  level: 'simple' | 'natural' | 'native';
  labelZh: string;
  targetText: string;
  translationZh: string;
  phonetic: string;
  chunkGuide: string;
}

export interface GeneratedImagePayload {
  imageUrl: string;
  mimeType: string;
  prompt: string;
  enhancedPrompt?: string;
  captionZh: string;
  aspectRatio?: string;
  mode?: 'standalone' | 'dialogue_scene';
  engine?: string;
  providerLabelZh?: string;
  promptDirectorLabelZh?: string;
  freePoolChain?: string[];
  failoverCount?: number;
  createdAt?: string;
}

export interface SpiritQuickAction {
  label: string;
  action: 'open_library' | 'play_music' | 'stop_music' | 'next_music';
}

export interface SpiritBubbleState {
  visible: boolean;
  isLoading?: boolean;
  loadingLabel?: string;
  speaking?: boolean;
  badge?: string;
  text: string;
  translationZh?: string;
  phonetic?: string;
  speakLang?: string;
  rescueCards?: SpokenRescueCard[];
  rescueExpanded?: boolean;
  generatedImage?: GeneratedImagePayload | null;
  quickActions?: SpiritQuickAction[];
  isAmbientHint?: boolean;
  updatedAt: number;
}

export interface ActiveRoleplayContext {
  targetLang: 'en' | 'ar' | 'ja' | 'fr' | 'es' | 'ko';
  scenarioId: string;
  scenarioTitle: string;
  npcRole: string;
  lastNpcLine: string;
  lastNpcTranslationZh?: string;
}

export interface LanguageStudioConfig {
  seq: number;
  targetLang: 'en' | 'ar' | 'ja' | 'fr' | 'es' | 'ko';
  mode: 'roleplay' | 'quiz' | 'image_pool';
  scenarioId?: string;
  initialRoleplay?: any;
  initialQuiz?: any;
}

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  translationZh?: string;
  phonetic?: string;
  speakLang?: string;
  rescueCards?: SpokenRescueCard[];
  generatedImage?: GeneratedImagePayload | null;
  timestamp: number;
}

const AI_NAME_STORAGE_KEY = 'earth-one-ai-name:v1';
const VOICE_PREF_KEY = 'earth-one-ai-voice-pref:v2';
const VOICE_REPLY_KEY = 'earth-one-voice-reply:v1';

function readStoredAiName(): string {
  try {
    const saved = localStorage.getItem(AI_NAME_STORAGE_KEY)?.trim();
    if (saved) return saved.slice(0, 20);
  } catch {
    // ignore
  }
  return 'ONE';
}

function readStoredVoiceName(): string {
  try {
    const saved = localStorage.getItem(VOICE_PREF_KEY)?.trim();
    if (saved && ['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir'].includes(saved)) return saved;
  } catch {
    // ignore
  }
  return 'Zephyr';
}

function readStoredVoiceReply(): boolean {
  try {
    const saved = localStorage.getItem(VOICE_REPLY_KEY);
    if (saved === 'false') return false;
  } catch {
    // ignore
  }
  return true;
}

export interface AgentUiSnapshot {
  aiName: string;
  voiceName: string;
  currentEmotion: VoiceEmotion;
  spiritState: SpiritState;
  pavilionHudOpen: boolean;
  commDrawerOpen: boolean;
  activeTask: AgentTaskView | null;
  pausedTask: AgentTaskView | null;
  pendingConfirmation: AgentConfirmationRequest | null;
  chatMessages: AgentChatMessage[];
  spiritBubble: SpiritBubbleState | null;
  languageStudioOpen: boolean;
  languageStudioConfig: LanguageStudioConfig | null;
  activeRoleplayContext: ActiveRoleplayContext | null;
  imageLightbox: GeneratedImagePayload | null;
  gardenDaylight: number;
  realtimeSync: boolean;
  liveWeather: LiveWeatherInfo | null;
  weatherCommand: EnvironmentOverrideCommand | null;
  voiceListening: boolean;
  voiceReplyEnabled: boolean;
  wakeListening: boolean;
  lastSpokenTranscript: string;
  liveVoiceActive: boolean;
  liveVoicePhase: 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';
  musicPlaying: boolean;
  musicTrackTitle: string;
  musicArtist: string;
}

let state: AgentUiSnapshot = {
  aiName: typeof window !== 'undefined' ? readStoredAiName() : 'ONE',
  voiceName: typeof window !== 'undefined' ? readStoredVoiceName() : 'Zephyr',
  currentEmotion: 'calm',
  spiritState: 'idle_explore',
  pavilionHudOpen: false,
  commDrawerOpen: false,
  activeTask: null,
  pausedTask: null,
  pendingConfirmation: null,
  chatMessages: [],
  spiritBubble: null,
  languageStudioOpen: false,
  languageStudioConfig: null,
  activeRoleplayContext: null,
  imageLightbox: null,
  gardenDaylight: 0.72,
  realtimeSync: true,
  liveWeather: null,
  weatherCommand: null,
  voiceListening: false,
  voiceReplyEnabled: typeof window !== 'undefined' ? readStoredVoiceReply() : true,
  wakeListening: false,
  lastSpokenTranscript: '',
  liveVoiceActive: false,
  liveVoicePhase: 'idle',
  musicPlaying: false,
  musicTrackTitle: '',
  musicArtist: '',
};

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const uiStateManager = {
  getSnapshot(): AgentUiSnapshot {
    return state;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  setAiName(name: string) {
    const clean = name.trim().slice(0, 20);
    if (!clean) return;
    try {
      localStorage.setItem(AI_NAME_STORAGE_KEY, clean);
    } catch {
      // ignore
    }
    if (state.aiName === clean) return;
    state = { ...state, aiName: clean };
    emit();
  },

  setGardenDaylight(dayFactor: number) {
    const clamped = Math.max(0, Math.min(1, dayFactor));
    if (Math.abs(state.gardenDaylight - clamped) < 0.04) return;
    state = { ...state, gardenDaylight: clamped };
    emit();
  },

  appendChatMessage(
    role: 'user' | 'assistant',
    content: string,
    extra?: {
      translationZh?: string;
      phonetic?: string;
      speakLang?: string;
      rescueCards?: SpokenRescueCard[];
      generatedImage?: GeneratedImagePayload | null;
    }
  ) {
    const clean = content.trim();
    if (!clean && !extra?.generatedImage) return;
    const msg: AgentChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      role,
      content: clean,
      translationZh: extra?.translationZh,
      phonetic: extra?.phonetic,
      speakLang: extra?.speakLang,
      rescueCards: extra?.rescueCards,
      generatedImage: extra?.generatedImage,
      timestamp: Date.now(),
    };
    state = { ...state, chatMessages: [...state.chatMessages.slice(-24), msg] };
    emit();
  },

  clearChatMessages() {
    state = { ...state, chatMessages: [] };
    emit();
  },

  setSpiritBubble(patch: Partial<SpiritBubbleState> | null) {
    if (!patch) {
      state = { ...state, spiritBubble: null };
      emit();
      return;
    }
    const prev = state.spiritBubble;
    state = {
      ...state,
      spiritBubble: {
        visible: true,
        text: prev?.text || '',
        ...prev,
        ...patch,
        updatedAt: Date.now(),
      },
    };
    emit();
  },

  hideSpiritBubble() {
    if (!state.spiritBubble) return;
    state = { ...state, spiritBubble: { ...state.spiritBubble, visible: false } };
    emit();
  },

  openLanguageStudio(config?: Partial<Omit<LanguageStudioConfig, 'seq'>>) {
    const prev = state.languageStudioConfig;
    state = {
      ...state,
      languageStudioOpen: true,
      pavilionHudOpen: false,
      spiritState: 'working_in_pavilion',
      languageStudioConfig: {
        seq: Date.now(),
        targetLang: config?.targetLang || prev?.targetLang || 'en',
        mode: config?.mode || prev?.mode || 'roleplay',
        scenarioId: config?.scenarioId ?? prev?.scenarioId ?? 'cafe',
        initialRoleplay: config?.initialRoleplay,
        initialQuiz: config?.initialQuiz,
      },
    };
    emit();
  },

  closeLanguageStudio() {
    if (!state.languageStudioOpen) return;
    state = { ...state, languageStudioOpen: false };
    emit();
  },

  setActiveRoleplayContext(ctx: ActiveRoleplayContext | null) {
    state = { ...state, activeRoleplayContext: ctx };
    emit();
  },

  setImageLightbox(img: GeneratedImagePayload | null) {
    state = { ...state, imageLightbox: img };
    emit();
  },

  setSpiritState(next: SpiritState) {
    if (state.spiritState === next) return;
    state = { ...state, spiritState: next };
    emit();
  },

  setPavilionHudOpen(open: boolean) {
    state = { ...state, pavilionHudOpen: open };
    emit();
  },

  setCommDrawerOpen(open: boolean) {
    if (open) {
      const shouldPause =
        state.activeTask && (state.activeTask.status === 'running' || state.activeTask.status === 'awaiting_confirmation');
      state = {
        ...state,
        commDrawerOpen: true,
        pausedTask: shouldPause ? { ...state.activeTask!, status: 'paused' } : state.pausedTask,
        spiritState: 'returning_to_rest',
      };
    } else {
      state = {
        ...state,
        commDrawerOpen: false,
        spiritState: state.pausedTask ? 'woken_approaching' : 'idle_explore',
      };
    }
    emit();
  },

  setTask(task: AgentTaskView | null) {
    state = { ...state, activeTask: task };
    emit();
  },

  setPausedTask(task: AgentTaskView | null) {
    state = { ...state, pausedTask: task };
    emit();
  },

  setPendingConfirmation(req: AgentConfirmationRequest | null) {
    state = { ...state, pendingConfirmation: req };
    emit();
  },

  setRealtimeSync(enabled: boolean) {
    state = { ...state, realtimeSync: enabled };
    emit();
  },

  setLiveWeather(info: LiveWeatherInfo | null) {
    state = { ...state, liveWeather: info };
    emit();
  },

  issueEnvironmentCommand(cmd: Omit<EnvironmentOverrideCommand, 'seq'>) {
    state = {
      ...state,
      realtimeSync: typeof cmd.realtimeSync === 'boolean' ? cmd.realtimeSync : state.realtimeSync,
      weatherCommand: {
        seq: Date.now() + Math.floor(Math.random() * 1000),
        ...cmd,
      },
    };
    emit();
  },

  setVoiceName(voiceName: string) {
    const allowed = ['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir'];
    const clean = allowed.includes(voiceName) ? voiceName : 'Zephyr';
    try {
      localStorage.setItem(VOICE_PREF_KEY, clean);
    } catch {
      // ignore
    }
    if (state.voiceName === clean) return;
    state = { ...state, voiceName: clean };
    emit();
  },

  setEmotion(emotion: VoiceEmotion) {
    if (state.currentEmotion === emotion) return;
    state = { ...state, currentEmotion: emotion };
    emit();
  },

  setVoiceStatus(patch: {
    voiceListening?: boolean;
    voiceReplyEnabled?: boolean;
    wakeListening?: boolean;
    lastSpokenTranscript?: string;
  }) {
    if (typeof patch.voiceReplyEnabled === 'boolean') {
      try {
        localStorage.setItem(VOICE_REPLY_KEY, patch.voiceReplyEnabled ? 'true' : 'false');
      } catch {
        // ignore
      }
    }
    state = { ...state, ...patch };
    emit();
  },

  setLiveVoiceStatus(patch: {
    liveVoiceActive?: boolean;
    liveVoicePhase?: 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';
  }) {
    state = { ...state, ...patch };
    emit();
  },

  setMusicStatus(patch: { musicPlaying?: boolean; musicTrackTitle?: string; musicArtist?: string }) {
    const nextPlaying = typeof patch.musicPlaying === 'boolean' ? patch.musicPlaying : state.musicPlaying;
    const nextTitle = typeof patch.musicTrackTitle === 'string' ? patch.musicTrackTitle : state.musicTrackTitle;
    const nextArtist = typeof patch.musicArtist === 'string' ? patch.musicArtist : state.musicArtist;
    if (
      state.musicPlaying === nextPlaying &&
      state.musicTrackTitle === nextTitle &&
      state.musicArtist === nextArtist
    ) {
      return;
    }
    state = {
      ...state,
      musicPlaying: nextPlaying,
      musicTrackTitle: nextTitle,
      musicArtist: nextArtist,
    };
    emit();
  },
};

export function useAgentUiState(): AgentUiSnapshot {
  return useSyncExternalStore(
    (cb) => uiStateManager.subscribe(cb),
    () => uiStateManager.getSnapshot(),
    () => uiStateManager.getSnapshot()
  );
}
