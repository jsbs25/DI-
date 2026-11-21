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
  /** 'fast' optimizes for low latency; 'deep' allocates deeper reasoning */
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

export const UNIFIED_PRIMARY_MODEL = 'gemini-4-hydrogen';
export const UNIFIED_LITE_MODEL = 'gemini-3.1-flash-lite';

// In-memory per-model cooldowns so 429 RESOURCE_EXHAUSTED or 404 NOT_FOUND models
// are skipped gracefully instead of spamming upstream errors on every turn.
const modelCooldownUntil = new Map<string, number>();

export function isGeminiModelInCooldown(model: string): boolean {
  const until = modelCooldownUntil.get(model);
  if (!until) return false;
  if (Date.now() >= until) {
    modelCooldownUntil.delete(model);
    return false;
  }
  return true;
}

export function recordGeminiModelFailure(model: string, err: any): { isQuotaError: boolean; isNotFound: boolean } {
  const msg = String(err?.message || err || '');
  const status = Number(err?.status || err?.code || 0);
  const isQuotaError =
    status === 429 ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('"code":429') ||
    msg.toLowerCase().includes('quota exceeded');
  const isNotFound =
    status === 404 ||
    msg.includes('NOT_FOUND') ||
    msg.includes('"code":404') ||
    msg.includes('is no longer available');

  if (isQuotaError) {
    // Parse retryDelay if provided, capped between 60s and 20m so key upgrades recover quickly
    const retryMatch = msg.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
    const parsedSec = retryMatch ? Number(retryMatch[1]) : 900;
    const cooldownMs = Math.min(20 * 60 * 1000, Math.max(60 * 1000, parsedSec * 1000));
    modelCooldownUntil.set(model, Date.now() + cooldownMs);
  } else if (isNotFound) {
    modelCooldownUntil.set(model, Date.now() + 60 * 60 * 1000);
  }

  return { isQuotaError, isNotFound };
}

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

function buildModelConfig(
  model: string,
  req: UnifiedAiRequest,
  maxOutputTokens: number,
  abortSignal?: AbortSignal
): Record<string, any> {
  const isGemini4 = model.startsWith('gemini-4-');
  const config: Record<string, any> = {};
  if (req.systemInstruction) {
    config.systemInstruction = req.systemInstruction;
  }
  if (abortSignal) {
    config.abortSignal = abortSignal;
  }

  if (isGemini4) {
    // Gemini 4 includes thinking tokens inside maxOutputTokens; omit maxOutputTokens & sampling params
    config.thinkingConfig = {
      thinkingLevel: req.speed === 'deep' ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW,
    };
  } else {
    // gemini-3.1-flash-lite supports ThinkingLevel.MINIMAL for ultra-fast responses
    config.maxOutputTokens = Math.min(4096, Math.max(256, maxOutputTokens));
    config.thinkingConfig = {
      thinkingLevel: req.speed === 'deep' ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL,
    };
    if (typeof req.temperature === 'number') {
      config.temperature = req.temperature;
    }
  }

  return config;
}

/**
 * EARTH ONE Unified AI Core.
 * Powers Home Spirit, World Library Reader, Search, Browser, and General Chat
 * with one consistent identity, valid Gemini 3.1/4 model configs, and quota-aware failover.
 */
export async function runUnifiedAiTurn(req: UnifiedAiRequest): Promise<UnifiedAiResponse> {
  const gemini = getGeminiClient();
  const hasVisualInput = Boolean(
    req.imageBase64 || (Array.isArray(req.attachments) && req.attachments.length > 0)
  );
  const maxOutputTokens = req.maxTokens ?? (req.speed === 'deep' ? 2000 : 1200);
  // Generous timeouts so Vision OCR/translation and Gemini 4 thinking never abort prematurely at 14s
  const perAttemptTimeoutMs = hasVisualInput
    ? 48_000
    : req.speed === 'deep'
      ? 42_000
      : 30_000;
  let sawQuotaExhausted = false;

  if (gemini) {
    const contents = buildGeminiContents(req);
    // Prefer gemini-3.1-flash-lite first for fast interactive/vision requests (lowest latency),
    // and use gemini-4-hydrogen first for deep/general reasoning tasks.
    const preferredOrder =
      req.speed === 'fast' || hasVisualInput
        ? [UNIFIED_LITE_MODEL, UNIFIED_PRIMARY_MODEL]
        : [UNIFIED_PRIMARY_MODEL, UNIFIED_LITE_MODEL];

    const availableModels = preferredOrder.filter((m) => !isGeminiModelInCooldown(m));
    const modelsToTry = availableModels.length > 0 ? availableModels : [UNIFIED_LITE_MODEL];

    for (const model of modelsToTry) {
      if (req.signal?.aborted) {
        const abortErr = new Error('Aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      const attemptController = new AbortController();
      const onParentAbort = () => attemptController.abort();
      if (req.signal) {
        req.signal.addEventListener('abort', onParentAbort, { once: true });
      }
      const timeoutHandle = setTimeout(() => attemptController.abort(), perAttemptTimeoutMs);

      try {
        const config = buildModelConfig(model, req, maxOutputTokens, attemptController.signal);

        if (req.onDelta) {
          const stream = await gemini.models.generateContentStream({
            model,
            contents,
            config,
          });
          let fullText = '';
          for await (const chunk of stream) {
            if (req.signal?.aborted) break;
            if (attemptController.signal.aborted) {
              throw new Error(`Gemini timeout (${perAttemptTimeoutMs}ms)`);
            }
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
          const resp = await gemini.models.generateContent({
            model,
            contents,
            config,
          });
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
        if (req.signal?.aborted) {
          const abortErr = new Error('Aborted');
          abortErr.name = 'AbortError';
          throw abortErr;
        }
        const effectiveErr = attemptController.signal.aborted
          ? new Error(`Gemini timeout (${perAttemptTimeoutMs}ms)`)
          : err;
        const { isQuotaError } = recordGeminiModelFailure(model, effectiveErr);
        if (isQuotaError) sawQuotaExhausted = true;
        const isLast = model === modelsToTry[modelsToTry.length - 1];
        if (isLast) {
          console.warn(
            `[UnifiedAI:${model}] failover (${isQuotaError ? 'quota-cooldown' : 'error'}):`,
            effectiveErr?.message || effectiveErr
          );
        }
      } finally {
        clearTimeout(timeoutHandle);
        if (req.signal) {
          req.signal.removeEventListener('abort', onParentAbort);
        }
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
    errorMessage: sawQuotaExhausted
      ? '当前 Gemini API 配额已达上限，请稍后再试或在 Settings > Secrets 中配置支持计费的 API Key 以提升配额。'
      : 'ONE AI 核心暂忙，请稍后重试。',
  };
}
