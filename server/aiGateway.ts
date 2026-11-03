import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

// Load .env here as well — ESM imports are hoisted above `dotenv.config()`
// in server.ts, so the gateway (instantiated at import time) must load env itself
// or every API key would read as empty.
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
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

class AIGateway {
  private models: AIModelMeta[] = [];
  private geminiClient: GoogleGenAI | null = null;
  private geminiKey: string = '';
  private deepseekKey: string = '';
  private customKey: string = '';
  private customBaseUrl: string = '';
  private customModel: string = '';

  constructor() {
    this.initProviders();
  }

  private maskKey(key: string | undefined): string {
    if (!key || key.trim() === '') return 'Not Configured';
    if (key.length <= 8) return '********';
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  private initProviders() {
    this.geminiKey = process.env.GEMINI_API_KEY || '';
    this.deepseekKey = process.env.DEEPSEEK_API_KEY || '';
    if (this.geminiKey) {
      try {
        this.geminiClient = new GoogleGenAI();
      } catch (err) {
        console.error('Failed to instantiate GoogleGenAI:', err);
      }
    }

    this.models = [
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash (Flagship Global Multimodal)',
        provider: 'Google',
        category: 'multimodal',
        status: this.geminiKey ? 'active' : 'unconfigured',
        isDefault: !!this.geminiKey && !this.deepseekKey,
        totalCalls: 0,
        totalTokens: 0,
        averageLatencyMs: 0,
        apiKeyMasked: this.maskKey(this.geminiKey)
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o (Omni Reasoning)',
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
        name: 'Claude 3.5 Sonnet (Thoughtful Analysis)',
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
        id: 'deepseek-v3',
        name: 'DeepSeek-V3 (Open Deep Reasoning)',
        provider: 'DeepSeek',
        category: 'reasoning',
        status: this.deepseekKey ? 'active' : 'unconfigured',
        isDefault: !!this.deepseekKey,
        totalCalls: 0,
        totalTokens: 0,
        averageLatencyMs: 0,
        apiKeyMasked: this.maskKey(this.deepseekKey)
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
   * Register (or update) a user-supplied OpenAI-compatible provider at runtime.
   * This makes the AI Hub work with any service the user has a key for.
   */
  public registerCustomProvider(apiKey: string, baseUrl?: string, model?: string): void {
    this.customKey = apiKey.trim();
    this.customBaseUrl = (baseUrl || 'https://api.openai.com/v1').trim();
    this.customModel = (model || 'gpt-3.5-turbo').trim();

    let entry = this.models.find(m => m.id === 'custom');
    if (!entry) {
      entry = {
        id: 'custom',
        name: 'Custom AI (OpenAI-compatible)',
        provider: 'Custom',
        category: 'text',
        status: 'active',
        isDefault: false,
        totalCalls: 0,
        totalTokens: 0,
        averageLatencyMs: 0,
        apiKeyMasked: this.maskKey(this.customKey)
      };
      this.models.push(entry);
    } else {
      entry.status = 'active';
      entry.apiKeyMasked = this.maskKey(this.customKey);
    }
  }

  public async generateContent(
    modelId: string,
    prompt: string,
    systemInstruction?: string
  ): Promise<{ success: boolean; content: string; errorMessage?: string; tokens?: number }> {
    const targetModel = this.getModel(modelId) || this.models.find(m => m.isDefault);
    if (!targetModel) {
      return { success: false, content: '', errorMessage: 'No AI model found.' };
    }

    // Custom OpenAI-compatible providers (user-supplied key/baseUrl/model)
    if (targetModel.provider === 'Custom') {
      return this.callOpenAICompatible({
        baseUrl: this.customBaseUrl || 'https://api.openai.com/v1',
        apiKey: this.customKey,
        model: this.customModel || 'gpt-3.5-turbo',
        prompt,
        systemInstruction
      });
    }

    // Check if provider is Google Gemini
    if (targetModel.provider === 'Google') {
      if (!this.geminiClient || !this.geminiKey) {
        targetModel.status = 'unconfigured';
        return {
          success: false,
          content: '',
          errorMessage: 'AI 服务尚未配置 GEMINI_API_KEY，请在服务端环境变量中完成模型接入。'
        };
      }

      const startTime = Date.now();
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
          targetModel.errorMessage = '当前 Gemini API 免费配额已达上限 (429 Quota Exhausted)。请稍后重试或配置自定义 API 密钥。';
        } else {
          targetModel.status = 'error';
          targetModel.errorMessage = errorMsg;
        }

        return {
          success: false,
          content: '',
          errorMessage: targetModel.errorMessage
        };
      }
    }

    // DeepSeek (OpenAI-compatible chat completions API)
    if (targetModel.provider === 'DeepSeek') {
      if (!this.deepseekKey) {
        targetModel.status = 'unconfigured';
        return {
          success: false,
          content: '',
          errorMessage: 'AI 服务尚未配置 DEEPSEEK_API_KEY，请在服务端环境变量中完成模型接入。'
        };
      }

      const startTime = Date.now();
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

        if (!text) throw new Error('DeepSeek returned an empty response');

        const latency = Date.now() - startTime;
        targetModel.status = 'active';
        targetModel.totalCalls += 1;
        targetModel.totalTokens += tokens;
        targetModel.averageLatencyMs = Math.round(
          (targetModel.averageLatencyMs * (targetModel.totalCalls - 1) + latency) / targetModel.totalCalls
        );
        targetModel.lastUsedAt = new Date().toISOString();
        targetModel.errorMessage = undefined;

        return { success: true, content: text, tokens };
      } catch (err: any) {
        const errorMsg = String(err?.message || err);
        const is429 = errorMsg.includes('429') || errorMsg.includes('Insufficient Balance') || errorMsg.includes('quota');

        if (is429) {
          targetModel.status = 'quota_exhausted';
          targetModel.errorMessage = '当前 DeepSeek 余额不足或触发限流 (429)。请检查账户余额或稍后重试。';
        } else {
          targetModel.status = 'error';
          targetModel.errorMessage = errorMsg;
        }

        return { success: false, content: '', errorMessage: targetModel.errorMessage };
      }
    }

    // Other providers
    return {
      success: false,
      content: '',
      errorMessage: `AI 服务 [${targetModel.provider}] 尚未配置服务端 API 密钥。请在环境变量中设置对应的密钥。`
    };
  }

  /**
   * Generic OpenAI-compatible chat completion call. Works with OpenAI, DeepSeek,
   * Moonshot, Zhipu (GLM), Qwen, and any provider exposing the
   * `POST {baseUrl}/chat/completions` contract.
   */
  public async callOpenAICompatible(opts: {
    baseUrl: string;
    apiKey: string;
    model: string;
    prompt: string;
    systemInstruction?: string;
  }): Promise<{ success: boolean; content: string; errorMessage?: string; tokens?: number }> {
    if (!opts.apiKey) {
      return { success: false, content: '', errorMessage: '请先输入有效的 API Key。' };
    }

    // Normalize base URL: strip trailing slash, append /chat/completions
    const base = opts.baseUrl.replace(/\/+$/, '');
    const endpoint = base.endsWith('/chat/completions')
      ? base
      : `${base}/chat/completions`;

    const messages: ChatMessage[] = [];
    if (opts.systemInstruction) messages.push({ role: 'system', content: opts.systemInstruction });
    messages.push({ role: 'user', content: opts.prompt });

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.apiKey}`
        },
        body: JSON.stringify({
          model: opts.model,
          messages,
          temperature: 0.7,
          stream: false
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText.slice(0, 400)}`);
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content || '';
      const tokens = data?.usage?.total_tokens || Math.ceil((opts.prompt.length + text.length) / 3.5);

      if (!text) throw new Error('该服务返回了空响应');

      return { success: true, content: text, tokens };
    } catch (err: any) {
      const errorMsg = String(err?.message || err);
      return {
        success: false,
        content: '',
        errorMessage: errorMsg.includes('401') || errorMsg.includes('403')
          ? 'API Key 无效或无权限（401/403）。请检查密钥和 Base URL 是否正确。'
          : errorMsg
      };
    }
  }
}

export const aiGateway = new AIGateway();
