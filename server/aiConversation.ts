export interface AIConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SlidingWindowOptions {
  maxRecentTurns?: number;
  maxTotalChars?: number;
  maxTurnChars?: number;
  maxSummaryChars?: number;
}

export interface SlidingWindowResult {
  messages: AIConversationMessage[];
  evictedTurns: number;
  totalInputTurns: number;
  pinnedConstraints: string[];
  estimatedTokens: number;
  compactedSummary: string;
}

export function normalizeConversationHistory(
  history: unknown,
  maxTurns = 16,
  maxTurnChars = 3000
): AIConversationMessage[] {
  if (!Array.isArray(history)) return [];

  return history.slice(-maxTurns).flatMap((entry: unknown) => {
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
    const trimmed = content.trim().slice(0, maxTurnChars);
    return trimmed ? [{ role, content: trimmed }] : [];
  });
}

export function manageSlidingWindowHistory(
  history: unknown,
  options: SlidingWindowOptions = {}
): SlidingWindowResult {
  const maxRecentTurns = Math.max(2, options.maxRecentTurns ?? 8);
  const maxTotalChars = Math.max(400, options.maxTotalChars ?? 4200);
  const maxTurnChars = Math.max(120, options.maxTurnChars ?? 960);
  const maxSummaryChars = Math.max(120, options.maxSummaryChars ?? 480);

  const normalizedAll = normalizeConversationHistory(history, 40, maxTurnChars);
  const totalInputTurns = normalizedAll.length;

  const retained: AIConversationMessage[] = [];
  let charBudget = 0;
  for (let i = normalizedAll.length - 1; i >= 0; i--) {
    const turn = normalizedAll[i];
    if (retained.length >= maxRecentTurns) break;
    if (retained.length > 0 && charBudget + turn.content.length > maxTotalChars) break;
    retained.unshift(turn);
    charBudget += turn.content.length;
  }

  const evictedCount = Math.max(0, totalInputTurns - retained.length);
  const evicted = normalizedAll.slice(0, evictedCount);

  const constraintPattern = /记住|不要|别再|以后|偏好|习惯|用中文|用英文|简洁|简短|分点|remember|don't|do not|always|prefer|respond in|keep it/i;
  const pinnedConstraints: string[] = [];
  for (const turn of normalizedAll) {
    if (turn.role === 'user' && constraintPattern.test(turn.content)) {
      const compact = turn.content.replace(/\s+/g, ' ').slice(0, 120);
      if (!pinnedConstraints.includes(compact)) pinnedConstraints.push(compact);
    }
  }

  let compactedSummary = '';
  if (evicted.length > 0) {
    const snippets = evicted
      .slice(-6)
      .map((t) => `${t.role === 'user' ? 'U' : 'A'}: ${t.content.replace(/\s+/g, ' ').slice(0, 90)}`)
      .join(' | ');
    compactedSummary = snippets.slice(0, maxSummaryChars);
  }

  const estimatedTokens = Math.ceil(
    (retained.reduce((sum, m) => sum + m.content.length, 0) + compactedSummary.length) * 0.65
  );

  return {
    messages: retained,
    evictedTurns: evictedCount,
    totalInputTurns,
    pinnedConstraints: pinnedConstraints.slice(-5),
    estimatedTokens,
    compactedSummary,
  };
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
