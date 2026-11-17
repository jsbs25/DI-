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
  pinnedConstraints: string[];
  compactedSummary: string;
  evictedTurns: number;
  totalInputTurns: number;
  estimatedTokens: number;
}

const DEFAULT_MAX_RECENT_TURNS = 6;
const DEFAULT_MAX_TOTAL_CHARS = 3600;
const DEFAULT_MAX_TURN_CHARS = 900;
const DEFAULT_MAX_SUMMARY_CHARS = 420;

const CONSTRAINT_PATTERNS: RegExp[] = [
  /(?:只用|使用|用)(?:中文|英文|英语|日文|韩语|阿拉伯语|西班牙语|法语|简体|繁体|markdown|json)/i,
  /(?:不要|别|禁止|避免|必须|记住|始终|以后|一直|我叫|我的名字|我是|请称呼)/i,
  /(?:reply in|respond in|speak in|always use|never use|my name is|call me|format as|constraints?)/i,
  /(\d{2,5})\s*(?:个)?(?:汉字|中文字符|字|词|words?|sentences?|句话)/i,
];

function extractRawHistoryMessages(history: unknown): AIConversationMessage[] {
  if (!Array.isArray(history)) return [];

  // Accept up to 64 past messages so sliding-window compaction can inspect early constraints
  return history.slice(-64).flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as { role?: unknown; content?: unknown; parts?: unknown };
    const role =
      item.role === 'user'
        ? 'user'
        : item.role === 'assistant' || item.role === 'model'
          ? 'assistant'
          : null;
    if (!role) return [];

    const content =
      typeof item.content === 'string'
        ? item.content
        : Array.isArray(item.parts)
          ? item.parts
              .flatMap((part: unknown) =>
                part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
                  ? [(part as { text: string }).text]
                  : []
              )
              .join('')
          : '';
    const trimmed = content.replace(/\s+/g, ' ').trim();
    return trimmed ? [{ role, content: trimmed }] : [];
  });
}

function compactSingleLine(text: string, limit: number): string {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, Math.max(24, limit - 1)).trimEnd()}…`;
}

function extractPinnedConstraints(evictedTurns: AIConversationMessage[]): string[] {
  const seen = new Set<string>();
  const pinned: string[] = [];

  for (let i = 0; i < evictedTurns.length; i++) {
    const turn = evictedTurns[i];
    if (turn.role !== 'user') continue;
    const text = turn.content;

    // Always anchor the very first user turn goal concisely if evicted
    if (i === 0) {
      const firstGoal = compactSingleLine(text, 90);
      if (firstGoal && !seen.has(firstGoal)) {
        seen.add(firstGoal);
        pinned.push(`Initial goal: ${firstGoal}`);
      }
    }

    const clauses = text.split(/[。！？.!?\n;；]+/).map(c => c.trim()).filter(Boolean);
    for (const clause of clauses) {
      if (clause.length < 4 || clause.length > 140) continue;
      if (CONSTRAINT_PATTERNS.some(re => re.test(clause))) {
        const snippet = compactSingleLine(clause, 100);
        if (!seen.has(snippet)) {
          seen.add(snippet);
          pinned.push(snippet);
        }
      }
      if (pinned.length >= 4) break;
    }
    if (pinned.length >= 4) break;
  }

  return pinned;
}

function buildEvictedSummary(
  evictedTurns: AIConversationMessage[],
  pinnedConstraints: string[],
  maxSummaryChars: number
): string {
  if (evictedTurns.length === 0) return '';

  const parts: string[] = [];
  if (pinnedConstraints.length > 0) {
    parts.push(`[Pinned Context & Constraints] ${pinnedConstraints.join(' | ')}`);
  }

  const tailEvicted = evictedTurns.slice(-4);
  const topicSnippets = tailEvicted.map(t => {
    const tag = t.role === 'user' ? 'U' : 'A';
    return `${tag}: ${compactSingleLine(t.content, 68)}`;
  });
  if (topicSnippets.length > 0) {
    parts.push(`[Earlier Summary (${evictedTurns.length} turns)] ${topicSnippets.join(' -> ')}`);
  }

  const joined = parts.join('\n');
  if (joined.length <= maxSummaryChars) return joined;
  return `${joined.slice(0, Math.max(40, maxSummaryChars - 1)).trimEnd()}…`;
}

/**
 * Sliding Window Memory Management:
 * Keeps only the hottest recent turns verbatim within a strict character/token budget,
 * while extracting and pinning early user constraints & compacting older evicted turns
 * into a low-token memory recap for faster TTFT and coherent long conversations.
 */
export function manageSlidingWindowHistory(
  history: unknown,
  options: SlidingWindowOptions = {}
): SlidingWindowResult {
  const maxRecentTurns = Math.max(2, Math.min(16, options.maxRecentTurns ?? DEFAULT_MAX_RECENT_TURNS));
  const maxTotalChars = Math.max(800, options.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS);
  const maxTurnChars = Math.max(200, options.maxTurnChars ?? DEFAULT_MAX_TURN_CHARS);
  const maxSummaryChars = Math.max(160, options.maxSummaryChars ?? DEFAULT_MAX_SUMMARY_CHARS);

  const allTurns = extractRawHistoryMessages(history);
  if (allTurns.length === 0) {
    return {
      messages: [],
      pinnedConstraints: [],
      compactedSummary: '',
      evictedTurns: 0,
      totalInputTurns: 0,
      estimatedTokens: 0,
    };
  }

  // Pick recent window bounded by both turn count and character budget (newest to oldest)
  const selectedRecent: AIConversationMessage[] = [];
  let charBudgetUsed = 0;

  for (let i = allTurns.length - 1; i >= 0; i--) {
    if (selectedRecent.length >= maxRecentTurns) break;
    const truncated = compactSingleLine(allTurns[i].content, maxTurnChars);
    const nextChars = charBudgetUsed + truncated.length;
    if (selectedRecent.length >= 2 && nextChars > maxTotalChars) {
      break;
    }
    selectedRecent.unshift({ role: allTurns[i].role, content: truncated });
    charBudgetUsed = nextChars;
  }

  const splitIdx = Math.max(0, allTurns.length - selectedRecent.length);
  const evicted = allTurns.slice(0, splitIdx);
  const pinnedConstraints = extractPinnedConstraints(evicted);
  const compactedSummary = buildEvictedSummary(evicted, pinnedConstraints, maxSummaryChars);

  const finalMessages: AIConversationMessage[] = compactedSummary
    ? [{ role: 'assistant', content: compactedSummary }, ...selectedRecent]
    : selectedRecent;

  const totalChars = finalMessages.reduce((sum, m) => sum + m.content.length, 0);
  return {
    messages: finalMessages,
    pinnedConstraints,
    compactedSummary,
    evictedTurns: evicted.length,
    totalInputTurns: allTurns.length,
    estimatedTokens: Math.ceil(totalChars * 0.6),
  };
}

export function normalizeConversationHistory(
  history: unknown,
  options?: SlidingWindowOptions
): AIConversationMessage[] {
  return manageSlidingWindowHistory(history, options).messages;
}

export function buildConversationPrompt(prompt: string, history: unknown): string {
  const windowState = Array.isArray(history) && history.length > 0
    ? manageSlidingWindowHistory(history)
    : null;
  const turns = windowState ? windowState.messages : normalizeConversationHistory(history);
  if (turns.length === 0) return prompt;
  return `Conversation sliding-window memory (compacted older context + recent turns):\n${turns
    .map(turn => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`)
    .join('\n')}\n\nCurrent user message:\n${prompt}\n\nHonor any pinned user constraints and answer directly.`;
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
