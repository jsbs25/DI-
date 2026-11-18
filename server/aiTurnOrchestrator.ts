import { store } from './store.ts';
import { aiGateway } from './aiGateway.ts';
import {
  buildConversationPrompt,
  manageSlidingWindowHistory,
  type AIConversationMessage,
} from './aiConversation.ts';
import {
  commitMemoriesFromTurn,
  normalizeProfileKey,
  retrieveRelevantMemories,
  type AIMemoryItem,
} from './aiMemory.ts';
import { analyzeTurnContext, composeSystemPrompt } from './aiIntent.ts';
import { answerWithLiveKnowledge } from './liveKnowledge.ts';
import { solvePrecisionQuery } from '../src/utils/precisionSolver.ts';
import { matchPureSocialBanter } from '../src/utils/oneAgentController.ts';

function sanitizeReply(raw: string): { reply: string; emotion?: string } {
  let text = typeof raw === 'string' ? raw : '';
  let emotion: string | undefined;
  while (true) {
    const m = text.match(/^\s*\[\[(?:EMO|EMOTION):([a-z_-]+)\]\]\s*/i);
    if (!m) break;
    emotion = emotion || m[1].toLowerCase();
    text = text.slice(m[0].length);
  }
  text = text.replace(/^\s*\[\[ACTION:[\s\S]*?\]\]\s*/i, '').trim();
  text = text.replace(/\[\[(?:EMO|EMOTION):[a-z_-]+\]\]\s*/gi, '').trim();
  return { reply: text, emotion };
}

export interface ExecuteAiTurnParams {
  prompt: string;
  history?: unknown;
  modelId?: string;
  mode?: string;
  profileKey?: string;
  userId?: string;
  apiKey?: string;
  baseUrl?: string;
  customModel?: string;
  maxTokens?: number;
  pageContext?: string;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
}

export interface ExecuteAiTurnResult {
  reply: string;
  model: string;
  tokens: number;
  intent: string;
  emotion?: string;
  savedMemories: AIMemoryItem[];
  recalledMemoriesCount: number;
  memoryWindow: {
    retainedTurns: number;
    evictedTurns: number;
    totalInputTurns: number;
    pinnedConstraints: number;
    estimatedTokens: number;
  };
}

export async function executeAiTurn(params: ExecuteAiTurnParams): Promise<ExecuteAiTurnResult> {
  const userPrompt = (params.prompt || '').trim();
  const mode = params.mode || 'general';
  const profileKey = normalizeProfileKey(params.profileKey, params.userId);

  if (params.apiKey) {
    aiGateway.registerCustomProvider(params.apiKey, params.baseUrl, params.customModel);
  }

  const resolvedModelId = params.apiKey
    ? 'custom'
    : (params.modelId || aiGateway.getChatModelId());

  const slidingWindow = manageSlidingWindowHistory(
    params.history,
    mode === 'voice-agent'
      ? { maxRecentTurns: 6, maxTotalChars: 2000, maxTurnChars: 480, maxSummaryChars: 340 }
      : { maxRecentTurns: 8, maxTotalChars: 4200, maxTurnChars: 960, maxSummaryChars: 480 }
  );
  const conversationHistory: AIConversationMessage[] = slidingWindow.messages;

  const memoryWindow = {
    retainedTurns: conversationHistory.length,
    evictedTurns: slidingWindow.evictedTurns,
    totalInputTurns: slidingWindow.totalInputTurns,
    pinnedConstraints: slidingWindow.pinnedConstraints.length,
    estimatedTokens: slidingWindow.estimatedTokens,
  };

  // Extract durable facts/preferences/corrections from current user turn & resolve active memories
  const savedMemories = commitMemoriesFromTurn(store, profileKey, userPrompt, conversationHistory);
  const recalledMemories = retrieveRelevantMemories(store, profileKey, userPrompt, conversationHistory, 560);
  const analysis = analyzeTurnContext(userPrompt, conversationHistory, recalledMemories);

  // 1. Exact deterministic precision solver (<1ms)
  if ((mode === 'general' || mode === 'voice-agent') && !userPrompt.includes('\n')) {
    const exact = solvePrecisionQuery(analysis.normalizedPrompt, analysis.isZh);
    if (exact) {
      const exSan = sanitizeReply(exact.answer);
      params.onDelta?.(exSan.reply || exact.answer);
      return {
        reply: exSan.reply || exact.answer,
        model: 'one-precision-solver',
        tokens: Math.ceil((exSan.reply || exact.answer).length / 2),
        intent: analysis.intent,
        emotion: exSan.emotion || (exact as any).emotion || 'focused',
        savedMemories,
        recalledMemoriesCount: recalledMemories.length,
        memoryWindow,
      };
    }

    if (mode === 'voice-agent' && analysis.intent === 'casual_banter') {
      const banter = matchPureSocialBanter(analysis.normalizedPrompt, analysis.isZh);
      if (banter) {
        const bSan = sanitizeReply(banter);
        params.onDelta?.(bSan.reply || banter);
        return {
          reply: bSan.reply || banter,
          model: 'one-instant-companion',
          tokens: Math.ceil((bSan.reply || banter).length / 2),
          intent: analysis.intent,
          emotion: bSan.emotion || (banter.match(/\[\[(?:EMO|EMOTION):([a-z_-]+)\]\]/i)||[])[1] || 'happy',
          savedMemories,
          recalledMemoriesCount: recalledMemories.length,
          memoryWindow,
        };
      }
    }
  }

  const systemPrompt = composeSystemPrompt(mode, analysis, recalledMemories, slidingWindow.compactedSummary, params.pageContext);
  const contextualPrompt = buildConversationPrompt(userPrompt, conversationHistory);
  const resolvedMaxTokens =
    typeof params.maxTokens === 'number' && params.maxTokens > 0
      ? Math.min(4096, Math.max(64, Math.floor(params.maxTokens)))
      : mode === 'voice-agent'
        ? 220
        : undefined;

  // 2. If cloud DeepSeek / custom key / local Ollama is available, run streaming LLM generation
  if (params.apiKey || aiGateway.hasLiveEngine()) {
    const usesStructuredHistory =
      resolvedModelId.startsWith('deepseek') ||
      resolvedModelId === 'custom' ||
      /^ollama:/i.test(resolvedModelId);

    try {
      const result = await aiGateway.generateContent(
        resolvedModelId,
        usesStructuredHistory ? userPrompt : contextualPrompt,
        systemPrompt,
        params.onDelta,
        conversationHistory,
        resolvedMaxTokens,
        { temperature: analysis.temperatureHint, signal: params.signal }
      );
      if (params.signal?.aborted) {
        const abortErr = new Error('Turn aborted');
        (abortErr as any).name = 'AbortError';
        throw abortErr;
      }
      if (result.success && result.content.trim()) {
        const san = sanitizeReply(result.content);
        const emo = san.emotion || (result.content.match(/\[\[(?:EMO|EMOTION):([a-z_-]+)\]\]/i)||[])[1];
        return {
          reply: san.reply || result.content.trim(),
          model: resolvedModelId,
          tokens: result.tokens || Math.ceil((san.reply || result.content).length / 2.5),
          intent: analysis.intent,
          emotion: emo || undefined,
          savedMemories,
          recalledMemoriesCount: recalledMemories.length,
          memoryWindow,
        };
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || params.signal?.aborted) {
        throw err;
      }
    }
  }

  // 3. Context-aware multi-turn & live-knowledge fallback engine (zero cloud key required)
  const liveAns = await answerWithLiveKnowledge(userPrompt, mode, {
    history: conversationHistory,
    memories: recalledMemories,
    savedMemories,
    analysis,
    signal: params.signal,
  });

  if (params.signal?.aborted) {
    const abortErr = new Error('Turn aborted');
    (abortErr as any).name = 'AbortError';
    throw abortErr;
  }

  if (params.onDelta) {
    const text = liveAns.text;
    const chunkSize = mode === 'voice-agent' ? 24 : 42;
    for (let i = 0; i < text.length; i += chunkSize) {
      if (params.signal?.aborted) {
        const abortErr = new Error('Turn aborted');
        (abortErr as any).name = 'AbortError';
        throw abortErr;
      }
      params.onDelta(text.slice(i, i + chunkSize));
      if (i + chunkSize < text.length) {
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => {
            clearTimeout(timer);
            const abortErr = new Error('Turn aborted');
            (abortErr as any).name = 'AbortError';
            reject(abortErr);
          };
          const timer = setTimeout(() => {
            params.signal?.removeEventListener('abort', onAbort);
            resolve();
          }, 12);
          params.signal?.addEventListener('abort', onAbort, { once: true });
        });
      }
    }
  }

  const liveSan = sanitizeReply(liveAns.text);
  const liveEmo = liveSan.emotion || (liveAns.text.match(/\[\[(?:EMO|EMOTION):([a-z_-]+)\]\]/i)||[])[1];
  return {
    reply: liveSan.reply || liveAns.text.trim(),
    model: `one-live-${liveAns.source}`,
    tokens: Math.ceil((liveSan.reply || liveAns.text).length / 2),
    intent: analysis.intent,
    emotion: liveEmo || undefined,
    savedMemories,
    recalledMemoriesCount: recalledMemories.length,
    memoryWindow,
  };
}
