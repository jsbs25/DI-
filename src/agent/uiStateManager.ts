import { useSyncExternalStore } from 'react';
import type { WeatherKind, TimePreset } from '../components/paradise/paradiseEnvironment.ts';

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

export interface AgentUiSnapshot {
  spiritState: SpiritState;
  pavilionHudOpen: boolean;
  commDrawerOpen: boolean;
  activeTask: AgentTaskView | null;
  pausedTask: AgentTaskView | null;
  pendingConfirmation: AgentConfirmationRequest | null;
  realtimeSync: boolean;
  liveWeather: LiveWeatherInfo | null;
  weatherCommand: EnvironmentOverrideCommand | null;
  voiceListening: boolean;
  wakeListening: boolean;
  lastSpokenTranscript: string;
}

let state: AgentUiSnapshot = {
  spiritState: 'idle_explore',
  pavilionHudOpen: false,
  commDrawerOpen: false,
  activeTask: null,
  pausedTask: null,
  pendingConfirmation: null,
  realtimeSync: true,
  liveWeather: null,
  weatherCommand: null,
  voiceListening: false,
  wakeListening: false,
  lastSpokenTranscript: '',
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
      // Entering communication: pause current running/working Spirit task into Rest Cottage
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

  setVoiceStatus(patch: { voiceListening?: boolean; wakeListening?: boolean; lastSpokenTranscript?: string }) {
    state = { ...state, ...patch };
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
