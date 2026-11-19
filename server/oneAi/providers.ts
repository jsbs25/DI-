import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type {
  DecryptedCredentials,
  DiscoveredRawModel,
  ErrorCategory,
  ModelEndpointRecord,
  NormalizedProviderError,
  ProviderAdapterType,
  UnifiedChatRequest,
  UnifiedMessage,
  UnifiedStreamChunk,
} from './types.ts';

export interface IAiProviderAdapter {
  readonly adapterType: ProviderAdapterType;
  invokeChat(req: UnifiedChatRequest, creds: DecryptedCredentials): AsyncIterable<UnifiedStreamChunk>;
  listModels?(baseUrl: string, creds: DecryptedCredentials): Promise<DiscoveredRawModel[]>;
}

export function normalizeHttpError(
  status: number | undefined,
  rawMessage: string,
  retryAfterHeader?: string | null
): NormalizedProviderError {
  const lower = rawMessage.toLowerCase();
  let retryAfterMs: number | undefined;
  if (retryAfterHeader) {
    const sec = Number(retryAfterHeader);
    if (Number.isFinite(sec) && sec > 0) retryAfterMs = Math.min(300_000, sec * 1000);
  }

  let category: ErrorCategory = 'upstream_5xx';
  let retryable = true;

  if (status === 401 || status === 403 || /invalid api key|unauthorized|incorrect api key/i.test(lower)) {
    category = 'auth_invalid';
    retryable = true; // switch to another healthy provider
  } else if (status === 402 || /insufficient.*balance|quota.*exceeded|payment required|credit/i.test(lower)) {
    category = 'quota_exhausted';
    retryable = true;
  } else if (status === 429 || /rate limit|fleet_capacity_exhausted|too many requests/i.test(lower)) {
    category = 'rate_limited';
    retryable = true;
  } else if (status === 404 || /model.*not found|does not exist|deprecated/i.test(lower)) {
    category = 'model_deprecated';
    retryable = true;
  } else if (/context length|maximum context|too many tokens|context_length_exceeded/i.test(lower)) {
    category = 'context_overflow';
    retryable = true;
  } else if (/content_filter|safety|blocked|policy violation/i.test(lower)) {
    category = 'content_filtered';
    retryable = false;
  } else if (status && status >= 400 && status < 500) {
    category = 'schema_invalid';
    retryable = true;
  } else if (status && status >= 500) {
    category = 'upstream_5xx';
    retryable = true;
  }

  return {
    category,
    httpStatus: status,
    retryAfterMs,
    retryableBeforeFirstByte: retryable,
    rawMessage: rawMessage.slice(0, 500),
  };
}

function resolveOpenAiCompletionsUrl(baseUrl: string): string {
  const clean = baseUrl.trim().replace(/\/+$/, '');
  if (clean.endsWith('/chat/completions')) return clean;
  if (/\/v\d+$/.test(clean)) return `${clean}/chat/completions`;
  return `${clean}/v1/chat/completions`;
}

function serializeOpenAiMessages(messages: UnifiedMessage[]) {
  return messages.map((m) => {
    if (typeof m.content === 'string') {
      return { role: m.role, content: m.content };
    }
    return {
      role: m.role,
      content: m.content.map((part) => {
        if (part.type === 'text') return { type: 'text', text: part.text };
        return { type: 'image_url', image_url: { url: part.imageUrl } };
      }),
    };
  });
}

export class OpenAiStandardAdapter implements IAiProviderAdapter {
  public readonly adapterType: ProviderAdapterType;

  constructor(adapterType: ProviderAdapterType = 'openai_compatible') {
    this.adapterType = adapterType;
  }

  public async *invokeChat(
    req: UnifiedChatRequest,
    creds: DecryptedCredentials
  ): AsyncIterable<UnifiedStreamChunk> {
    const endpoint = resolveOpenAiCompletionsUrl(req.baseUrl);
    const controller = new AbortController();
    const onOuterAbort = () => controller.abort();
    req.signal?.addEventListener('abort', onOuterAbort, { once: true });

    const totalTimer = setTimeout(() => controller.abort(), Math.max(4000, req.timeoutMs));
    let firstByteTimer: ReturnType<typeof setTimeout> | null = null;
    let receivedAnyPayload = false;

    if (req.firstByteTimeoutMs > 0) {
      firstByteTimer = setTimeout(() => {
        if (!receivedAnyPayload) controller.abort();
      }, req.firstByteTimeoutMs);
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: req.stream ? 'text/event-stream, application/json' : 'application/json',
      };
      if (creds.apiKey) {
        headers.Authorization = `Bearer ${creds.apiKey}`;
      }
      if (this.adapterType === 'openrouter') {
        headers['HTTP-Referer'] = process.env.APP_URL || 'https://earthone.world';
        headers['X-Title'] = 'EARTH ONE GLOBAL AI';
      }

      const bodyPayload: Record<string, unknown> = {
        model: req.upstreamModelId,
        messages: serializeOpenAiMessages(req.messages),
        stream: req.stream,
      };
      if (req.stream) {
        bodyPayload.stream_options = { include_usage: true };
      }
      if (typeof req.maxTokens === 'number' && req.maxTokens > 0) {
        bodyPayload.max_tokens = req.maxTokens;
      }
      const isReasoning = /reasoner|-r1/i.test(req.upstreamModelId);
      if (!isReasoning && typeof req.temperature === 'number') {
        bodyPayload.temperature = req.temperature;
      }
      if (req.tools && req.tools.length > 0 && !isReasoning) {
        bodyPayload.tools = req.tools.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));
      }
      if (req.responseFormat && req.responseFormat.type === 'json_object' && !isReasoning) {
        bodyPayload.response_format = { type: 'json_object' };
      }

      if (this.adapterType === 'openrouter' && req.privacyMode === 'strict_zdr') {
        bodyPayload.provider = { zdr: true, data_collection: 'deny' };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        let errMsg = errText;
        try {
          const parsed = JSON.parse(errText);
          errMsg = parsed?.error?.message || parsed?.message || errText;
        } catch {}
        yield {
          type: 'error',
          error: normalizeHttpError(res.status, String(errMsg), res.headers.get('retry-after')),
        };
        return;
      }

      if (!req.stream || !res.body || res.headers.get('content-type')?.includes('application/json')) {
        receivedAnyPayload = true;
        if (firstByteTimer) clearTimeout(firstByteTimer);
        const data: any = await res.json().catch(() => null);
        const choice = data?.choices?.[0];
        const msgText =
          typeof choice?.message?.content === 'string'
            ? choice.message.content
            : Array.isArray(choice?.message?.content)
              ? choice.message.content.map((p: any) => p?.text || '').join('')
              : '';

        const hasTools = Array.isArray(choice?.message?.tool_calls) && choice.message.tool_calls.length > 0;
        if (hasTools) {
          for (const tc of choice.message.tool_calls) {
            yield {
              type: 'tool_call',
              toolCall: {
                id: tc.id || `tc_${Date.now()}`,
                name: tc.function?.name || '',
                argumentsJson: tc.function?.arguments || '{}',
              },
            };
          }
        }
        if (msgText) {
          yield { type: 'delta', textDelta: msgText };
        } else if (!hasTools) {
          yield {
            type: 'error',
            error: {
              category: 'upstream_5xx',
              retryableBeforeFirstByte: true,
              rawMessage: 'Empty completion content returned by upstream model.',
            },
          };
          return;
        }
        yield {
          type: 'usage',
          usage: {
            inputTokens: Number(data?.usage?.prompt_tokens || 0),
            outputTokens: Number(data?.usage?.completion_tokens || 0),
            cachedTokens: Number(data?.usage?.prompt_tokens_details?.cached_tokens || 0),
            estimatedCostUsd: 0,
          },
        };
        yield { type: 'done', finishReason: 'stop' };
        return;
      }

      // True SSE Streaming parser
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let sawContentOrTool = false;

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') {
            yield { type: 'done', finishReason: 'stop' };
            return;
          }

          let parsed: any = null;
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue;
          }

          if (parsed?.error) {
            yield {
              type: 'error',
              error: normalizeHttpError(
                parsed.error?.code ? Number(parsed.error.code) || 500 : 500,
                String(parsed.error?.message || JSON.stringify(parsed.error))
              ),
            };
            return;
          }

          const choice = parsed?.choices?.[0];
          const delta = choice?.delta;
          const reasoningDelta =
            typeof delta?.reasoning === 'string'
              ? delta.reasoning
              : typeof delta?.reasoning_content === 'string'
                ? delta.reasoning_content
                : '';
          if (reasoningDelta && !receivedAnyPayload) {
            // Reasoning models stream thinking chunks before answer tokens: treat as first-byte liveness without emitting raw chain-of-thought
            receivedAnyPayload = true;
            if (firstByteTimer) clearTimeout(firstByteTimer);
          }

          const textDelta = typeof delta?.content === 'string' ? delta.content : '';
          if (textDelta) {
            if (!receivedAnyPayload) {
              receivedAnyPayload = true;
              if (firstByteTimer) clearTimeout(firstByteTimer);
            }
            sawContentOrTool = true;
            yield { type: 'delta', textDelta };
          }

          if (Array.isArray(delta?.tool_calls)) {
            for (const tc of delta.tool_calls) {
              if (tc?.function?.name || tc?.function?.arguments) {
                if (!receivedAnyPayload) {
                  receivedAnyPayload = true;
                  if (firstByteTimer) clearTimeout(firstByteTimer);
                }
                sawContentOrTool = true;
                yield {
                  type: 'tool_call',
                  toolCall: {
                    id: tc.id || `tc_${tc.index ?? 0}`,
                    name: tc.function?.name || '',
                    argumentsJson: tc.function?.arguments || '',
                  },
                };
              }
            }
          }

          if (parsed?.usage) {
            yield {
              type: 'usage',
              usage: {
                inputTokens: Number(parsed.usage.prompt_tokens || 0),
                outputTokens: Number(parsed.usage.completion_tokens || 0),
                cachedTokens: Number(parsed.usage.prompt_tokens_details?.cached_tokens || 0),
                estimatedCostUsd: 0,
              },
            };
          }
        }
        if (done) break;
      }

      if (!sawContentOrTool) {
        yield {
          type: 'error',
          error: {
            category: 'upstream_5xx',
            retryableBeforeFirstByte: true,
            rawMessage: 'Empty stream returned by upstream provider.',
          },
        };
        return;
      }

      yield { type: 'done', finishReason: 'stop' };
    } catch (err: any) {
      if (req.signal?.aborted) {
        const abortErr = new Error('Aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      const isTimeout = err?.name === 'AbortError' || /timeout|aborted/i.test(String(err?.message));
      yield {
        type: 'error',
        error: {
          category: isTimeout ? 'timeout' : 'network_error',
          retryableBeforeFirstByte: true,
          rawMessage: isTimeout ? 'Upstream request timed out.' : String(err?.message || err),
        },
      };
    } finally {
      clearTimeout(totalTimer);
      if (firstByteTimer) clearTimeout(firstByteTimer);
      req.signal?.removeEventListener('abort', onOuterAbort);
    }
  }
}

export class GeminiUnifiedAdapter implements IAiProviderAdapter {
  public readonly adapterType: ProviderAdapterType = 'gemini';

  public async *invokeChat(
    req: UnifiedChatRequest,
    creds: DecryptedCredentials
  ): AsyncIterable<UnifiedStreamChunk> {
    if (!creds.apiKey || creds.apiKey === 'MY_GEMINI_API_KEY') {
      yield {
        type: 'error',
        error: {
          category: 'auth_invalid',
          httpStatus: 401,
          retryableBeforeFirstByte: true,
          rawMessage: 'GEMINI_API_KEY is not configured.',
        },
      };
      return;
    }

    const ai = new GoogleGenAI({ apiKey: creds.apiKey, apiVersion: 'v1beta' });
    const systemParts: string[] = [];
    const contents: any[] = [];

    for (const msg of req.messages) {
      if (msg.role === 'system') {
        if (typeof msg.content === 'string') systemParts.push(msg.content);
        continue;
      }
      const role = msg.role === 'assistant' ? 'model' : 'user';
      if (typeof msg.content === 'string') {
        contents.push({ role, parts: [{ text: msg.content }] });
      } else {
        const parts: any[] = [];
        for (const p of msg.content) {
          if (p.type === 'text') {
            parts.push({ text: p.text });
          } else if (p.type === 'image_url' && p.imageUrl.startsWith('data:')) {
            const match = p.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
            }
          }
        }
        contents.push({ role, parts: parts.length ? parts : [{ text: '' }] });
      }
    }

    const config: any = {
      temperature: req.temperature ?? 0.7,
      ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
      ...(systemParts.length ? { systemInstruction: systemParts.join('\n\n') } : {}),
    };

    if (/hydrogen|argon|carbon|neon/i.test(req.upstreamModelId)) {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
    }

    if (req.responseFormat?.type === 'json_object') {
      config.responseMimeType = 'application/json';
    }

    const timeoutAbort = new AbortController();
    const timer = setTimeout(() => timeoutAbort.abort(), Math.max(8000, req.timeoutMs));
    const onOuterAbort = () => timeoutAbort.abort();
    req.signal?.addEventListener('abort', onOuterAbort, { once: true });

    try {
      if (req.stream) {
        const fbTimeout = Math.max(req.firstByteTimeoutMs || 0, 8500);
        const streamResp = await Promise.race([
          ai.models.generateContentStream({
            model: req.upstreamModelId,
            contents,
            config,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Gemini first byte timeout')), fbTimeout)
          ),
        ]);

        let totalIn = 0;
        let totalOut = 0;
        let emitted = false;

        for await (const chunk of streamResp as any) {
          if (timeoutAbort.signal.aborted) {
            if (req.signal?.aborted) {
              const e = new Error('Aborted');
              e.name = 'AbortError';
              throw e;
            }
            yield {
              type: 'error',
              error: { category: 'timeout', retryableBeforeFirstByte: !emitted, rawMessage: 'Gemini stream timed out' },
            };
            return;
          }
          const txt = typeof chunk?.text === 'string' ? chunk.text : '';
          if (txt) {
            emitted = true;
            yield { type: 'delta', textDelta: txt };
          }
          if (chunk?.usageMetadata) {
            totalIn = Number(chunk.usageMetadata.promptTokenCount || totalIn);
            totalOut = Number(chunk.usageMetadata.candidatesTokenCount || totalOut);
          }
        }

        if (!emitted) {
          yield {
            type: 'error',
            error: { category: 'upstream_5xx', retryableBeforeFirstByte: true, rawMessage: 'Gemini returned empty stream' },
          };
          return;
        }
        yield { type: 'usage', usage: { inputTokens: totalIn, outputTokens: totalOut, estimatedCostUsd: 0 } };
        yield { type: 'done', finishReason: 'stop' };
        return;
      }

      const resp: any = await Promise.race([
        ai.models.generateContent({
          model: req.upstreamModelId,
          contents,
          config,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini request timeout')), req.timeoutMs || 15000)
        ),
      ]);

      const txt = String(resp?.text || '').trim();
      if (!txt) {
        yield {
          type: 'error',
          error: { category: 'upstream_5xx', retryableBeforeFirstByte: true, rawMessage: 'Gemini returned empty response' },
        };
        return;
      }
      yield { type: 'delta', textDelta: txt };
      yield {
        type: 'usage',
        usage: {
          inputTokens: Number(resp?.usageMetadata?.promptTokenCount || 0),
          outputTokens: Number(resp?.usageMetadata?.candidatesTokenCount || 0),
          estimatedCostUsd: 0,
        },
      };
      yield { type: 'done', finishReason: 'stop' };
    } catch (err: any) {
      if (req.signal?.aborted) throw err;
      const msg = String(err?.message || err);
      const status = typeof err?.status === 'number' ? err.status : /429|resource_exhausted/i.test(msg) ? 429 : /401|403|api_key_invalid/i.test(msg) ? 401 : undefined;
      yield {
        type: 'error',
        error: normalizeHttpError(status, msg),
      };
    } finally {
      clearTimeout(timer);
      req.signal?.removeEventListener('abort', onOuterAbort);
    }
  }
}

export class WorkersAiAdapter extends OpenAiStandardAdapter {
  public constructor() {
    super('workers_ai');
  }

  public override async *invokeChat(
    req: UnifiedChatRequest,
    creds: DecryptedCredentials
  ): AsyncIterable<UnifiedStreamChunk> {
    if (!creds.accountId) {
      yield {
        type: 'error',
        error: {
          category: 'auth_invalid',
          httpStatus: 401,
          retryableBeforeFirstByte: true,
          rawMessage: 'Cloudflare Account ID is not configured.',
        },
      };
      return;
    }
    const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${creds.accountId}/ai/v1`;
    yield* super.invokeChat({ ...req, baseUrl }, creds);
  }
}

const ADAPTER_REGISTRY: Record<ProviderAdapterType, IAiProviderAdapter> = {
  openai_compatible: new OpenAiStandardAdapter('openai_compatible'),
  gemini: new GeminiUnifiedAdapter(),
  openrouter: new OpenAiStandardAdapter('openrouter'),
  kilo: new OpenAiStandardAdapter('kilo'),
  groq: new OpenAiStandardAdapter('groq'),
  cerebras: new OpenAiStandardAdapter('cerebras'),
  deepseek: new OpenAiStandardAdapter('deepseek'),
  qwen: new OpenAiStandardAdapter('qwen'),
  zhipu: new OpenAiStandardAdapter('zhipu'),
  workers_ai: new WorkersAiAdapter(),
  huggingface: new OpenAiStandardAdapter('huggingface'),
};

export function getProviderAdapter(type: ProviderAdapterType): IAiProviderAdapter {
  return ADAPTER_REGISTRY[type] || ADAPTER_REGISTRY.openai_compatible;
}

export function estimateEndpointCostUsd(endpoint: ModelEndpointRecord, inputTokens: number, outputTokens: number): number {
  if (endpoint.isFreeTier) return 0;
  return Number(
    ((inputTokens / 1_000_000) * endpoint.inputPricePer1m + (outputTokens / 1_000_000) * endpoint.outputPricePer1m).toFixed(6)
  );
}
