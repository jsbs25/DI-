export interface AIConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function normalizeConversationHistory(history: unknown): AIConversationMessage[] {
  if (!Array.isArray(history)) return [];

  return history.slice(-8).flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as { role?: unknown; content?: unknown; parts?: unknown };
    const role = item.role === 'user' ? 'user' :
      item.role === 'assistant' || item.role === 'model' ? 'assistant' : null;
    if (!role) return [];

    const content = typeof item.content === 'string'
      ? item.content
      : Array.isArray(item.parts)
        ? item.parts.flatMap((part: unknown) =>
          part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
            ? [(part as { text: string }).text]
            : []
        ).join('')
        : '';
    const trimmed = content.trim().slice(0, 3000);
    return trimmed ? [{ role, content: trimmed }] : [];
  });
}

export function buildConversationPrompt(prompt: string, history: unknown): string {
  const turns = normalizeConversationHistory(history);
  if (turns.length === 0) return prompt;
  return `Conversation history (oldest first):\n${turns.map(turn => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`).join('\n')}\n\nCurrent user message:\n${prompt}\n\nUse the conversation history to answer follow-up questions and honor the user's earlier constraints.`;
}

function findRequestedLength(text: string): RegExpMatchArray | null {
  return text.match(/(\d{3,5})\s*(?:个)?(?:汉字|中文字符|字|词|字符|words?|characters?)/i);
}

export function getOllamaTokenBudget(prompt: string, history: AIConversationMessage[] = []): number {
  const currentLength = findRequestedLength(prompt);
  const isContinuation = /继续|接着|补充|写完|完成|刚才|按之前|continue|keep going|finish|previous|as requested/i.test(prompt);
  const previousLength = isContinuation
    ? history.filter(message => message.role === 'user').map(message => findRequestedLength(message.content)).reverse().find(Boolean)
    : null;
  const requestedLength = currentLength || previousLength;
  if (requestedLength) {
    return Math.min(Math.max(Number(requestedLength[1]) * 2, 2048), 8192);
  }
  return /详细|深入|展开|全面|逐步|一步步|完整|长文|代码|程序|实现|分析|比较|(?:\b(?:detailed|in depth|step by step|full|complete|code|program|implement|analysis|compare)\b)/i.test(prompt)
    ? 1536
    : 512;
}

export function getOllamaContextWindow(
  prompt: string,
  systemInstruction = '',
  history: AIConversationMessage[] = []
): number {
  const tokenBudget = getOllamaTokenBudget(prompt, history);
  if (tokenBudget < 2048) return 4096;
  const inputTokenEstimate = Math.ceil(
    (prompt.length + systemInstruction.length + history.reduce((total, message) => total + message.content.length, 0)) * 0.75
  );
  return Math.min(16384, Math.max(4096, tokenBudget + inputTokenEstimate + 512));
}
