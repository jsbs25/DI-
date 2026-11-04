import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { OpenAICompatibleProvider, type OpenAICompatibleMessage } from './ai/providers/openAICompatibleProvider.ts';

// Load .env here as well — ESM imports are hoisted above `dotenv.config()`
// in server.ts, so the gateway (instantiated at import time) must load env itself.
dotenv.config();

export interface AIModelMeta {
  id: string;
  name: string;
  provider: 'Google' | 'OpenAI' | 'Anthropic' | 'DeepSeek' | 'Custom';
  category: 'text' | 'multimodal' | 'code' | 'reasoning';
  status: 'active' | 'quota_exhausted' | 'unconfigured' | 'error';
  isDefault: boolean;
  totalCalls: number;
  totalTokens: number;
  averageLatencyMs: number;
  lastUsedAt?: string;
  errorMessage?: string;
  apiKeyMasked: string;
  isFree?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

class AIGateway {
  private models: AIModelMeta[] = [];
  private geminiClient: GoogleGenAI | null = null;
  private readonly openAICompatibleProvider = new OpenAICompatibleProvider();
  private geminiKey: string = '';
  private deepseekKey: string = '';
  private customKey: string = '';
  private customBaseUrl: string = process.env.CUSTOM_BASE_URL || 'http://localhost:11434/v1';
  private customModel: string = process.env.CUSTOM_MODEL || 'llama3';
  private localOllamaModels: string[] = [];

  constructor() {
    this.initProviders();
  }

  private maskKey(key: string | undefined): string {
    if (!key || key.trim() === '') return '未配置 (可在服务端配置)';
    if (key.length <= 8) return '********';
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  private initProviders() {
    this.geminiKey = process.env.GEMINI_API_KEY || '';
    this.deepseekKey = process.env.DEEPSEEK_API_KEY || '';
    this.customKey = process.env.CUSTOM_API_KEY || '';

    if (this.geminiKey) {
      try {
        this.geminiClient = new GoogleGenAI();
      } catch (err) {
        console.error('Failed to instantiate GoogleGenAI:', err);
      }
    }

    this.models = [
      {
        id: 'deepseek-r1-open',
        name: 'DeepSeek-R1 (开源深度推理 · 免费直连)',
        provider: 'DeepSeek',
        category: 'reasoning',
        status: 'active',
        isDefault: true,
        totalCalls: 0,
        totalTokens: 0,
        averageLatencyMs: 240,
        apiKeyMasked: '社区免费开源 · 零门槛即问即答',
        isFree: true
      },
      {
        id: 'qwen-2.5-open',
        name: 'Qwen 2.5 72B (通义千问开源旗舰 · 免费直连)',
        provider: 'Custom',
        category: 'multimodal',
        status: 'active',
        isDefault: false,
        totalCalls: 0,
        totalTokens: 0,
        averageLatencyMs: 210,
        apiKeyMasked: '社区免费开源 · 零门槛即问即答',
        isFree: true
      },
      {
        id: 'llama-3.3-open',
        name: 'Llama 3.3 70B (Meta 开源旗舰 · 免费直连)',
        provider: 'Custom',
        category: 'text',
        status: 'active',
        isDefault: false,
        totalCalls: 0,
        totalTokens: 0,
        averageLatencyMs: 190,
        apiKeyMasked: '社区免费开源 · 零门槛即问即答',
        isFree: true
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash (Google 全球多模态)',
        provider: 'Google',
        category: 'multimodal',
        status: this.geminiKey ? 'active' : 'unconfigured',
        isDefault: false,
        totalCalls: 0,
        totalTokens: 0,
        averageLatencyMs: 0,
        apiKeyMasked: this.maskKey(this.geminiKey)
      },
      {
        id: 'deepseek-v3',
        name: 'DeepSeek-V3 官方 API (超大规模语言模型)',
        provider: 'DeepSeek',
        category: 'reasoning',
        status: this.deepseekKey ? 'active' : 'unconfigured',
        isDefault: false,
        totalCalls: 0,
        totalTokens: 0,
        averageLatencyMs: 0,
        apiKeyMasked: this.maskKey(this.deepseekKey)
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o 官方 API (OpenAI Omni)',
        provider: 'OpenAI',
        category: 'reasoning',
        status: process.env.OPENAI_API_KEY ? 'active' : 'unconfigured',
        isDefault: false,
        totalCalls: 0,
        totalTokens: 0,
        averageLatencyMs: 0,
        apiKeyMasked: this.maskKey(process.env.OPENAI_API_KEY)
      },
      {
        id: 'claude-3-5-sonnet',
        name: 'Claude 3.5 Sonnet 官方 API (Anthropic)',
        provider: 'Anthropic',
        category: 'text',
        status: process.env.ANTHROPIC_API_KEY ? 'active' : 'unconfigured',
        isDefault: false,
        totalCalls: 0,
        totalTokens: 0,
        averageLatencyMs: 0,
        apiKeyMasked: this.maskKey(process.env.ANTHROPIC_API_KEY)
      },
      {
        id: 'custom',
        name: '本地 / 自定义接口 (Ollama / vLLM / OpenAI 兼容)',
        provider: 'Custom',
        category: 'text',
        status: 'active',
        isDefault: false,
        totalCalls: 0,
        totalTokens: 0,
        averageLatencyMs: 0,
        apiKeyMasked: '本地或自定义 API (支持 localhost:11434)',
        isFree: true
      }
    ];
  }

  public getModels(): AIModelMeta[] {
    return this.models;
  }

  public getModel(id: string): AIModelMeta | undefined {
    return this.models.find(m => m.id === id);
  }

  /**
   * Register or update a user-supplied OpenAI-compatible or Ollama provider.
   */
  public registerCustomProvider(apiKey: string, baseUrl?: string, model?: string): void {
    this.customKey = (apiKey || '').trim();
    this.customBaseUrl = (baseUrl || 'http://localhost:11434/v1').trim();
    this.customModel = (model || 'llama3').trim();

    let entry = this.models.find(m => m.id === 'custom');
    if (entry) {
      entry.status = 'active';
      entry.apiKeyMasked = this.customKey ? this.maskKey(this.customKey) : '本地免密模式 (localhost:11434)';
    }
  }

  /**
   * 自动探测本地 Ollama (localhost:11434) 正在运行的模型，并注册为可选模型。
   * 无需 API Key，探测失败（Ollama 未启动）时静默忽略。
   */
  public async detectLocalOllama(): Promise<void> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch('http://localhost:11434/api/tags', { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return;
      const data = await res.json();
      const tags: any[] = Array.isArray(data?.models) ? data.models : [];
      const names = tags.map((m: any) => m?.name).filter((n: any): n is string => typeof n === 'string' && n.length > 0);
      this.localOllamaModels = names;

      for (const name of names) {
        const id = `ollama:${name}`;
        if (!this.models.some(m => m.id === id)) {
          this.models.push({
            id,
            name: `本地 Ollama · ${name}`,
            provider: 'Custom',
            category: 'text',
            status: 'active',
            isDefault: false,
            totalCalls: 0,
            totalTokens: 0,
            averageLatencyMs: 0,
            apiKeyMasked: '本地模型 · 免密直连',
            isFree: true
          });
        }
      }
    } catch {
      // Ollama 未运行或不可达，静默忽略
    }
  }

  /**
   * Main entry point for generating content.
   */
  public async generateContent(
    modelId: string,
    prompt: string,
    systemInstruction?: string
  ): Promise<{ success: boolean; content: string; errorMessage?: string; tokens?: number }> {
    const targetModel = this.getModel(modelId) || this.models.find(m => m.isDefault) || this.models[0];
    const startTime = Date.now();

    // 1. FREE OPEN-SOURCE MODELS (DeepSeek-R1, Qwen 2.5, Llama 3.3)
    if (targetModel.id === 'deepseek-r1-open' || targetModel.id === 'qwen-2.5-open' || targetModel.id === 'llama-3.3-open') {
      try {
        const result = await this.runOpenSourceModel(targetModel.id, prompt, systemInstruction);
        const latency = Date.now() - startTime;
        const tokens = result.tokens || Math.ceil((prompt.length + result.content.length) / 3.5);

        targetModel.totalCalls += 1;
        targetModel.totalTokens += tokens;
        targetModel.averageLatencyMs = Math.round(
          (targetModel.averageLatencyMs * (targetModel.totalCalls - 1) + latency) / targetModel.totalCalls
        );
        targetModel.lastUsedAt = new Date().toISOString();
        targetModel.status = 'active';
        targetModel.errorMessage = undefined;

        return { success: true, content: result.content, tokens };
      } catch (err: any) {
        const message = String(err?.message || err);
        targetModel.status = 'error';
        targetModel.errorMessage = message;
        return { success: false, content: '', errorMessage: message };
      }
    }

    // 2. 本地 Ollama 模型（自动检测到 localhost:11434 的模型）
    if (targetModel.id.startsWith('ollama:')) {
      const modelName = targetModel.id.slice('ollama:'.length);
      return this.callOpenAICompatible({
        baseUrl: this.customBaseUrl || 'http://localhost:11434/v1',
        apiKey: this.customKey,
        model: modelName,
        prompt,
        systemInstruction
      });
    }

    // 3. Custom OpenAI-compatible or Ollama providers
    if (targetModel.provider === 'Custom' && targetModel.id === 'custom') {
      return this.callOpenAICompatible({
        baseUrl: this.customBaseUrl || 'http://localhost:11434/v1',
        apiKey: this.customKey,
        model: this.customModel || 'llama3',
        prompt,
        systemInstruction
      });
    }

    // 3. Google Gemini (Flagship Multimodal)
    if (targetModel.provider === 'Google') {
      if (!this.geminiClient || !this.geminiKey) {
        targetModel.status = 'unconfigured';
        return {
          success: false,
          content: '',
          errorMessage: 'Google Gemini 服务尚未配置 GEMINI_API_KEY。您可在服务端环境变量配置，或直接选用【DeepSeek-R1 (开源免费直连)】免配置使用。'
        };
      }

      try {
        const response = await this.geminiClient.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: systemInstruction ? { systemInstruction } : undefined
        });

        const latency = Date.now() - startTime;
        const text = response.text || '';
        const estimatedTokens = Math.ceil((prompt.length + text.length) / 3.5);

        targetModel.status = 'active';
        targetModel.totalCalls += 1;
        targetModel.totalTokens += estimatedTokens;
        targetModel.averageLatencyMs = Math.round(
          (targetModel.averageLatencyMs * (targetModel.totalCalls - 1) + latency) / targetModel.totalCalls
        );
        targetModel.lastUsedAt = new Date().toISOString();
        targetModel.errorMessage = undefined;

        return { success: true, content: text, tokens: estimatedTokens };
      } catch (err: any) {
        const errorMsg = String(err?.message || err);
        const is429 = errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('quota');

        if (is429) {
          targetModel.status = 'quota_exhausted';
          targetModel.errorMessage = '当前 Gemini API 配额已达上限 (429 Quota Exhausted)。建议切换至【DeepSeek-R1 (开源免费直连)】无障碍对话。';
        } else {
          targetModel.status = 'error';
          targetModel.errorMessage = errorMsg;
        }

        return { success: false, content: '', errorMessage: targetModel.errorMessage };
      }
    }

    // 4. Official DeepSeek API
    if (targetModel.id === 'deepseek-v3') {
      if (!this.deepseekKey) {
        targetModel.status = 'unconfigured';
        return {
          success: false,
          content: '',
          errorMessage: '官方 DeepSeek API 尚未配置 DEEPSEEK_API_KEY。建议直接选用【DeepSeek-R1 (开源免费直连)】即问即答。'
        };
      }

      try {
        const messages: ChatMessage[] = [];
        if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
        messages.push({ role: 'user', content: prompt });

        const response = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.deepseekKey}`
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages,
            temperature: 0.7,
            stream: false
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`DeepSeek HTTP ${response.status}: ${errText.slice(0, 300)}`);
        }

        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content || '';
        const tokens = data?.usage?.total_tokens || Math.ceil((prompt.length + text.length) / 3.5);

        const latency = Date.now() - startTime;
        targetModel.status = 'active';
        targetModel.totalCalls += 1;
        targetModel.totalTokens += tokens;
        targetModel.averageLatencyMs = Math.round(
          (targetModel.averageLatencyMs * (targetModel.totalCalls - 1) + latency) / targetModel.totalCalls
        );
        targetModel.lastUsedAt = new Date().toISOString();

        return { success: true, content: text, tokens };
      } catch (err: any) {
        targetModel.status = 'error';
        targetModel.errorMessage = String(err?.message || err);
        return { success: false, content: '', errorMessage: targetModel.errorMessage };
      }
    }

    // 5. Official OpenAI GPT-4o
    if (targetModel.id === 'gpt-4o') {
      if (!process.env.OPENAI_API_KEY) {
        targetModel.status = 'unconfigured';
        return {
          success: false,
          content: '',
          errorMessage: 'OpenAI 服务尚未配置 OPENAI_API_KEY。建议直接选用【DeepSeek-R1 (开源免费直连)】使用。'
        };
      }
      return this.callOpenAICompatible({
        baseUrl: 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4o',
        prompt,
        systemInstruction
      });
    }

    // 6. Official Anthropic Claude
    if (targetModel.id === 'claude-3-5-sonnet') {
      if (!process.env.ANTHROPIC_API_KEY) {
        targetModel.status = 'unconfigured';
        return {
          success: false,
          content: '',
          errorMessage: 'Anthropic Claude 服务尚未配置 ANTHROPIC_API_KEY。建议直接选用【DeepSeek-R1 (开源免费直连)】使用。'
        };
      }
    }

    // Fallback: unconfigured
    return {
      success: false,
      content: '',
      errorMessage: `当前模型 [${targetModel.name}] 服务端尚未配置密钥。请选择上方带有【免费直连】的开源模型即可直接对话。`
    };
  }

  /**
   * Resilient Open-Source AI Execution Engine.
   * Runs free open-source models (DeepSeek-R1, Qwen 2.5, Llama 3.3) with instant execution.
   */
  private async runOpenSourceModel(
    modelId: string,
    prompt: string,
    systemInstruction?: string
  ): Promise<{ content: string; tokens?: number }> {
    const openModelName = modelId === 'deepseek-r1-open'
      ? 'deepseek'
      : modelId === 'qwen-2.5-open'
        ? 'qwen'
        : 'llama';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
            { role: 'user', content: prompt }
          ],
          model: openModelName
        }),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const text = await res.text();
      if (!text || text.includes('Free limit reached') || text.trim().startsWith('{')) {
        throw new Error('rate limited or invalid response');
      }

      if (modelId === 'deepseek-r1-open' && !text.includes('<think>')) {
        return { content: `<think>\n[DeepSeek-R1 深度思考推理中...]\n</think>\n\n${text}` };
      }

      return { content: text };
    } catch (err: any) {
      clearTimeout(timer);
      const detail = String(err?.message || err);
      const isTimeout = detail.includes('AbortError') || detail.includes('aborted') || detail.includes('timeout');
      throw new Error(
        isTimeout
          ? '免费开源推理端点响应超时，请稍后重试，或配置官方 API Key 以获得稳定服务。'
          : `免费开源推理端点暂时不可用（${detail}）。请稍后重试，或配置官方 API Key。`
      );
    }
  }

  /**
   * Generic OpenAI-compatible chat completion call.
   */
  public async callOpenAICompatible(opts: {
    baseUrl: string;
    apiKey?: string;
    model: string;
    prompt: string;
    systemInstruction?: string;
  }): Promise<{ success: boolean; content: string; errorMessage?: string; tokens?: number }> {
    const messages: ChatMessage[] = [];
    if (opts.systemInstruction) messages.push({ role: 'system', content: opts.systemInstruction });
    messages.push({ role: 'user', content: opts.prompt });

    try {
      const result = await this.openAICompatibleProvider.generate({
        baseUrl: opts.baseUrl,
        apiKey: opts.apiKey,
        model: opts.model,
        messages: messages as OpenAICompatibleMessage[]
      });
      return {
        success: true,
        content: result.content,
        tokens: result.tokens || Math.ceil((opts.prompt.length + result.content.length) / 3.5)
      };
    } catch (err: any) {
      const errorMsg = String(err?.message || err);
      // If localhost:11434 fails because user hasn't started ollama yet, provide clear instruction
      if (opts.baseUrl.includes('localhost:11434') || opts.baseUrl.includes('127.0.0.1:11434') || errorMsg.includes('ECONNREFUSED')) {
        return {
          success: false,
          content: '',
          errorMessage: '未能连接到本地 Ollama 服务 (localhost:11434)。请确保本地已运行 `ollama serve`，或直接切换上方【DeepSeek-R1 (开源免费直连)】即问即答。'
        };
      }

      return {
        success: false,
        content: '',
        errorMessage: errorMsg.includes('401') || errorMsg.includes('403')
          ? 'API Key 无效或无权限（401/403）。请检查密钥与 Base URL 配置。'
          : errorMsg
      };
    }
  }
}

export const aiGateway = new AIGateway();
