export function loadAIConversationHistory<T>(
  key: string,
  isMessage: (value: unknown) => value is T
): T[] {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return [];
  try {
    const saved = sessionStorage.getItem(key);
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter(isMessage).slice(-40) : [];
  } catch (error) {
    console.warn('Unable to restore this tab’s AI conversation history:', error);
    return [];
  }
}

export function saveAIConversationHistory(key: string, messages: unknown[]): void {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(key, JSON.stringify(messages.slice(-40)));
  } catch (error) {
    console.warn('Unable to preserve this tab’s AI conversation history:', error);
  }
}
