export interface OpenAICompatibleMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface OpenAICompatibleRequest {
  baseUrl: string;
  apiKey?: string;
  model: string;
  messages: OpenAICompatibleMessage[];
  temperature?: number;
  timeoutMs?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onToken?: (token: string) => void;
}

export interface OpenAICompatibleResponse {
  content: string;
  tokens?: number;
  model?: string;
}

export class OpenAICompatibleProvider {
  private readonly defaultBaseUrl = 'http://localhost:11434/v1';
  private readonly defaultTimeoutMs = 30_000;

  private normalizeBaseUrl(baseUrl?: string): string {
    const raw = (baseUrl || this.defaultBaseUrl).trim();
    if (!raw) throw new Error('OpenAI 兼容接口 Base URL 不能为空。');

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error('OpenAI 兼容接口 Base URL 无效，请填写完整的 http(s) URL。');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('OpenAI 兼容接口只支持 http:// 或 https:// Base URL。');
    }

    const pathname = parsed.pathname.replace(/\/+$/, '');
    if (pathname.endsWith('/chat/completions')) return parsed.toString().replace(/\/+$/, '');
    if (pathname.endsWith('/v1')) return `${parsed.toString().replace(/\/+$/, '')}/chat/completions`;
    if (!pathname || pathname === '/') return `${parsed.toString().replace(/\/+$/, '')}/v1/chat/completions`;
    return `${parsed.toString().replace(/\/+$/, '')}/chat/completions`;
  }

  private extractText(data: any): string {
    const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text;
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
      return content
        .map(part => typeof part === 'string' ? part : part?.text)
        .filter((part): part is string => Boolean(part))
        .join('')
        .trim();
    }
    return '';
  }

  async generate(request: OpenAICompatibleRequest): Promise<OpenAICompatibleResponse> {
    const endpoint = this.normalizeBaseUrl(request.baseUrl);
    const model = request.model.trim();
    if (!model) throw new Error('OpenAI 兼容接口的模型名称不能为空。');
    if (!request.messages.length) throw new Error('至少需要一条对话消息。');

    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    if (request.signal) {
      if (request.signal.aborted) controller.abort();
      else request.signal.addEventListener('abort', onExternalAbort, { once: true });
    }
    const timeout = setTimeout(
      () => controller.abort(),
      Math.max(1_000, request.timeoutMs ?? this.defaultTimeoutMs)
    );

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: request.onToken ? 'text/event-stream, application/json' : 'application/json'
      };
      const apiKey = request.apiKey?.trim();
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

      const useStream = Boolean(request.onToken);
      const bodyPayload: Record<string, any> = {
        model,
        messages: request.messages.map(({ role, content }) => ({ role, content })),
        temperature: request.temperature ?? 0.7,
        stream: useStream
      };
      if (typeof request.maxTokens === 'number' && request.maxTokens > 0) {
        bodyPayload.max_tokens = request.maxTokens;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyPayload),
        signal: controller.signal
      });

      if (!response.ok) {
        const rawErr = await response.text().catch(() => '');
        let data: any = null;
        try { data = rawErr ? JSON.parse(rawErr) : null; } catch {}
        const providerMessage = data?.error?.message || data?.error || rawErr;
        throw new Error(`OpenAI 兼容接口 HTTP ${response.status}: ${String(providerMessage).slice(0, 500)}`);
      }

      if (useStream && response.body && response.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              const parsed = JSON.parse(payload);
              const delta = parsed?.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullText += delta;
                request.onToken?.(delta);
              }
            } catch {}
          }
          if (done) break;
        }
        if (fullText.trim()) {
          return {
            content: fullText.trim(),
            tokens: Math.ceil(fullText.length / 2.5),
            model
          };
        }
      }

      const rawBody = await response.text();
      let data: any = null;
      try {
        data = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        data = null;
      }

      const content = this.extractText(data);
      if (!content) throw new Error('OpenAI 兼容接口返回了空响应。');

      request.onToken?.(content);
      return {
        content,
        tokens: Number.isFinite(data?.usage?.total_tokens) ? data.usage.total_tokens : undefined,
        model: typeof data?.model === 'string' ? data.model : model
      };
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        if (request.signal?.aborted) throw error;
        throw new Error(`OpenAI 兼容接口请求超时（${Math.max(1_000, request.timeoutMs ?? this.defaultTimeoutMs)}ms）。`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      if (request.signal) request.signal.removeEventListener('abort', onExternalAbort);
    }
  }

  async listModels(baseUrl?: string, apiKey?: string): Promise<string[]> {
    const endpoint = this.normalizeBaseUrl(baseUrl).replace(/\/chat\/completions$/, '/models');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey?.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;

    const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(10_000) });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`OpenAI 兼容模型列表 HTTP ${response.status}: ${String(data?.error?.message || '请求失败').slice(0, 300)}`);
    }
    return Array.isArray(data?.data)
      ? data.data.map((item: any) => item?.id).filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      : [];
  }
}
