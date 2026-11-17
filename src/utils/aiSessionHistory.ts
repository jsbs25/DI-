export function loadAIConversationHistory<T>(
  key: string,
  isMessage: (value: unknown) => value is T
): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const rawSession = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null;
    const rawLocal = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    const saved = rawSession || rawLocal;
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter(isMessage).slice(-40) : [];
  } catch (error) {
    console.warn('Unable to restore AI conversation history:', error);
    return [];
  }
}

export function saveAIConversationHistory(key: string, messages: unknown[]): void {
  if (typeof window === 'undefined') return;
  const serialized = JSON.stringify(messages.slice(-40));
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, serialized);
  } catch {}
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, serialized);
  } catch (error) {
    console.warn('Unable to preserve AI conversation history:', error);
  }
}
