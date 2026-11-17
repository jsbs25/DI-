const PROFILE_STORAGE_KEY = 'earth-one-ai-profile:v1';

export function getAiProfileKey(): string {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return 'default';
  }
  try {
    let existing = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!existing) {
      const rand = Math.random().toString(36).slice(2, 10);
      existing = `eo_${Date.now().toString(36)}_${rand}`;
      localStorage.setItem(PROFILE_STORAGE_KEY, existing);
    }
    return existing;
  } catch {
    return 'default';
  }
}
