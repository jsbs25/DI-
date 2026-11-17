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
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
}

export interface ExecuteAiTurnResult {
  reply: string;
  model: string;
  tokens: number;
  intent: string;
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
      params.onDelta?.(exact.answer);
      return {
        reply: exact.answer,
        model: 'one-precision-solver',
        tokens: Math.ceil(exact.answer.length / 2),
        intent: analysis.intent,
        savedMemories,
        recalledMemoriesCount: recalledMemories.length,
        memoryWindow,
      };
    }

    if (mode === 'voice-agent' && analysis.intent === 'casual_banter') {
      const banter = matchPureSocialBanter(analysis.normalizedPrompt, analysis.isZh);
      if (banter) {
        params.onDelta?.(banter);
        return {
          reply: banter,
          model: 'one-instant-companion',
          tokens: Math.ceil(banter.length / 2),
          intent: analysis.intent,
          savedMemories,
          recalledMemoriesCount: recalledMemories.length,
          memoryWindow,
        };
      }
    }
  }

  const systemPrompt = composeSystemPrompt(mode, analysis, recalledMemories, slidingWindow.compactedSummary);
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
        return {
          reply: result.content,
          model: resolvedModelId,
          tokens: result.tokens || Math.ceil(result.content.length / 2.5),
          intent: analysis.intent,
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

  return {
    reply: liveAns.text,
    model: `one-live-${liveAns.source}`,
    tokens: Math.ceil(liveAns.text.length / 2),
    intent: analysis.intent,
    savedMemories,
    recalledMemoriesCount: recalledMemories.length,
    memoryWindow,
  };
}
