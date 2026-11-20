import { ThinkingLevel } from '@google/genai';
import { getGeminiApiKey, getGeminiClient } from '../geminiClient.ts';
import { oneAiRouter } from '../oneAi/router.ts';
import { aiGateway } from '../aiGateway.ts';
import type { AIConversationMessage } from '../aiConversation.ts';

export interface UnifiedAiRequest {
  prompt: string;
  systemInstruction?: string;
  history?: AIConversationMessage[];
  imageBase64?: string;
  imageMimeType?: string;
  attachments?: Array<{ imageUrl: string; mimeType?: string }>;
  maxTokens?: number;
  temperature?: number;
  /** 'fast' uses ThinkingLevel.LOW for <2s interactive replies; 'deep' uses MEDIUM for scholarly explanations */
  speed?: 'fast' | 'deep';
  mode?: string;
  subjectKey?: string;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
}

export interface UnifiedAiResponse {
  success: boolean;
  content: string;
  tokens: number;
  modelLabel: string;
  errorMessage?: string;
}

const UNIFIED_FAST_MODEL = 'gemini-4-hydrogen';
const UNIFIED_FALLBACK_MODEL = 'gemini-2.5-flash';

export function hasUnifiedLiveEngine(): boolean {
  return Boolean(getGeminiApiKey()) || oneAiRouter.hasAnyUsableEngine() || aiGateway.hasLiveEngine();
}

function parseDataUrl(url: string): { mimeType: string; data: string } | null {
  const m = url.match(/^data:([^;]+);base64,(.+)$/i);
  if (!m) return null;
  return { mimeType: m[1].trim() || 'image/jpeg', data: m[2].trim() };
}

function buildGeminiContents(req: UnifiedAiRequest): Array<{ role: 'user' | 'model'; parts: any[] }> {
  const contents: Array<{ role: 'user' | 'model'; parts: any[] }> = [];
  if (Array.isArray(req.history)) {
    for (const h of req.history.slice(-12)) {
      if (!h?.content?.trim()) continue;
      contents.push({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content.trim() }],
      });
    }
  }

  const userParts: any[] = [{ text: req.prompt }];
  if (req.imageBase64) {
    const cleanImg = req.imageBase64.replace(/^data:image\/[a-z+]+;base64,/i, '').trim();
    if (cleanImg.length > 64) {
      userParts.push({
        inlineData: {
          mimeType: req.imageMimeType || 'image/jpeg',
          data: cleanImg,
        },
      });
    }
  }
  if (Array.isArray(req.attachments)) {
    for (const att of req.attachments.slice(0, 3)) {
      const parsed = parseDataUrl(att.imageUrl);
      if (parsed) {
        userParts.push({
          inlineData: {
            mimeType: att.mimeType || parsed.mimeType,
            data: parsed.data,
          },
        });
      }
    }
  }
  contents.push({ role: 'user', parts: userParts });
  return contents;
}

/**
 * EARTH ONE Unified AI Core.
 * Powers Home Spirit, World Library Reader, Search, Browser, and General Chat
 * with one consistent identity, shared speed profile, and resilient failover.
 */
export async function runUnifiedAiTurn(req: UnifiedAiRequest): Promise<UnifiedAiResponse> {
  const gemini = getGeminiClient();
  const thinkingLevel = req.speed === 'deep' ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL;
  const maxOutputTokens = req.maxTokens ?? (req.speed === 'deep' ? 1800 : 900);
  const perAttemptTimeoutMs = req.speed === 'deep' ? 24_000 : 14_000;

  if (gemini) {
    const contents = buildGeminiContents(req);
    const modelsToTry = [UNIFIED_FAST_MODEL, UNIFIED_FALLBACK_MODEL];
    for (const model of modelsToTry) {
      if (req.signal?.aborted) {
        const abortErr = new Error('Aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      try {
        const config: Record<string, any> = {
          maxOutputTokens,
          temperature: req.temperature ?? (req.speed === 'deep' ? 0.55 : 0.45),
        };
        if (req.systemInstruction) {
          config.systemInstruction = req.systemInstruction;
        }
        if (model === UNIFIED_FAST_MODEL) {
          config.thinkingConfig = { thinkingLevel };
        }

        const withTimeout = <T,>(promise: Promise<T>): Promise<T> =>
          new Promise<T>((resolve, reject) => {
            const t = setTimeout(() => reject(new Error(`Gemini timeout (${perAttemptTimeoutMs}ms)`)), perAttemptTimeoutMs);
            promise.then(
              (v) => {
                clearTimeout(t);
                resolve(v);
              },
              (e) => {
                clearTimeout(t);
                reject(e);
              }
            );
          });

        if (req.onDelta) {
          const stream = await withTimeout(
            gemini.models.generateContentStream({
              model,
              contents,
              config,
            })
          );
          let fullText = '';
          for await (const chunk of stream) {
            if (req.signal?.aborted) break;
            const piece = chunk.text || '';
            if (piece) {
              fullText += piece;
              req.onDelta(piece);
            }
          }
          if (fullText.trim()) {
            return {
              success: true,
              content: fullText.trim(),
              tokens: Math.max(1, Math.ceil((req.prompt.length + fullText.length) / 2.8)),
              modelLabel: 'ONE AI',
            };
          }
        } else {
          const resp = await withTimeout(
            gemini.models.generateContent({
              model,
              contents,
              config,
            })
          );
          const text = (resp.text || '').trim();
          if (text) {
            const totalTokens =
              resp.usageMetadata?.totalTokenCount ||
              Math.max(1, Math.ceil((req.prompt.length + text.length) / 2.8));
            return {
              success: true,
              content: text,
              tokens: totalTokens,
              modelLabel: 'ONE AI',
            };
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || req.signal?.aborted) throw err;
        console.warn(`[UnifiedAI:${model}] failover:`, err?.message || err);
      }
    }
  }

  // Fallback 2: OneAI Router (multi-provider registry)
  if (oneAiRouter.hasAnyUsableEngine()) {
    try {
      const messages = [
        ...(req.systemInstruction ? [{ role: 'system' as const, content: req.systemInstruction }] : []),
        ...(req.history || []).slice(-10).filter((h) => h?.content).map((h) => ({ role: h.role, content: h.content })),
        { role: 'user' as const, content: req.prompt },
      ];
      const routed = await oneAiRouter.executeUnifiedTurn({
        requestId: `uai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        userId: null,
        subjectKey: req.subjectKey || 'system:unified',
        userTier: 'free',
        prompt: req.prompt,
        messages,
        mode: req.mode || 'general',
        maxTokens: maxOutputTokens,
        temperature: req.temperature,
        stream: Boolean(req.onDelta),
        signal: req.signal,
        onDelta: req.onDelta,
      });
      if (routed.success && routed.content.trim()) {
        return {
          success: true,
          content: routed.content.trim(),
          tokens: routed.totalTokens,
          modelLabel: 'ONE AI',
        };
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || req.signal?.aborted) throw err;
      console.warn('[UnifiedAI:oneAiRouter] failover:', err?.message || err);
    }
  }

  // Fallback 3: Direct AI Gateway (DeepSeek / Ollama)
  if (aiGateway.hasLiveEngine()) {
    const gw = await aiGateway.generateContent(
      'one-ai',
      req.prompt,
      req.systemInstruction,
      req.onDelta,
      req.history,
      maxOutputTokens,
      { signal: req.signal, temperature: req.temperature, mode: req.mode }
    );
    if (gw.success && gw.content.trim()) {
      return {
        success: true,
        content: gw.content.trim(),
        tokens: gw.tokens || Math.ceil(gw.content.length / 2.8),
        modelLabel: 'ONE AI',
      };
    }
  }

  return {
    success: false,
    content: '',
    tokens: 0,
    modelLabel: 'ONE AI',
    errorMessage: 'ONE AI 核心暂忙，请稍后重试。',
  };
}
