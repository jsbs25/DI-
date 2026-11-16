export type VoiceListeningMode = 'always-listening' | 'click-to-speak';

const VOICE_MODE_STORAGE_KEY = 'earth-one-voice-mode:v1';
const VOICE_SETTINGS_STORAGE_KEY = 'earth-one-voice-settings:v1';
const VOICE_MODE_EVENT = 'earth-one-voice-mode-change';

export function readVoiceListeningMode(): VoiceListeningMode {
  if (typeof window === 'undefined') return 'always-listening';
  try {
    const raw = localStorage.getItem(VOICE_MODE_STORAGE_KEY);
    return raw === 'click-to-speak' ? 'click-to-speak' : 'always-listening';
  } catch {
    return 'always-listening';
  }
}

export function writeVoiceListeningMode(mode: VoiceListeningMode): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VOICE_MODE_STORAGE_KEY, mode);
    window.dispatchEvent(new CustomEvent<VoiceListeningMode>(VOICE_MODE_EVENT, { detail: mode }));
  } catch {}
}

export function subscribeVoiceListeningMode(cb: (mode: VoiceListeningMode) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent<VoiceListeningMode>).detail;
    if (detail === 'always-listening' || detail === 'click-to-speak') {
      cb(detail);
    } else {
      cb(readVoiceListeningMode());
    }
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === VOICE_MODE_STORAGE_KEY) {
      cb(readVoiceListeningMode());
    }
  };
  window.addEventListener(VOICE_MODE_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(VOICE_MODE_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}

export function readVoiceSpeechSettings(): { rate: number; pitch: number } {
  if (typeof window === 'undefined') return { rate: 1.08, pitch: 1.0 };
  try {
    const raw = localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        rate: typeof p.rate === 'number' ? Math.min(1.6, Math.max(0.7, p.rate)) : 1.08,
        pitch: typeof p.pitch === 'number' ? Math.min(1.5, Math.max(0.7, p.pitch)) : 1.0,
      };
    }
  } catch {}
  return { rate: 1.08, pitch: 1.0 };
}

export function writeVoiceSpeechSettings(settings: { rate: number; pitch: number }): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VOICE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}
