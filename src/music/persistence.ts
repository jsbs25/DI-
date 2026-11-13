import type { PersistedPlayerState } from '../types/music.ts';

export const PLAYER_STORAGE_KEY = 'earthone.one-music.player.v1';

export function loadPersistedPlayerState(): PersistedPlayerState | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(PLAYER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.queue)) {
      window.localStorage.removeItem(PLAYER_STORAGE_KEY);
      return null;
    }
    // basic sanity
    if (parsed.queue.length > 500) parsed.queue = parsed.queue.slice(0, 500);
    return parsed as PersistedPlayerState;
  } catch {
    try { window.localStorage.removeItem(PLAYER_STORAGE_KEY); } catch {}
    return null;
  }
}

export function savePersistedPlayerState(state: PersistedPlayerState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota or serialization issues - fail safely
  }
}

export function clearPersistedPlayerState(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try { window.localStorage.removeItem(PLAYER_STORAGE_KEY); } catch {}
}
