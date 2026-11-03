import { GoogleGenAI } from '@google/genai';

export interface AIModelMeta {
  id: string;
  name: string;
  provider: 'Google' | 'OpenAI' | 'Anthropic' | 'DeepSeek';
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
        isDefault: true,
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
        name: 'DeepSeek-V3 / R1 (Open Deep Reasoning)',
        provider: 'DeepSeek',
        category: 'reasoning',
        status: process.env.DEEPSEEK_API_KEY ? 'active' : 'unconfigured',
        isDefault: false,
        totalCalls: 0,
        totalTokens: 0,
        averageLatencyMs: 0,
        apiKeyMasked: this.maskKey(process.env.DEEPSEEK_API_KEY)
      }
    ];
  }

  public getModels(): AIModelMeta[] {
    return this.models;
  }

  public getModel(id: string): AIModelMeta | undefined {
    return this.models.find(m => m.id === id);
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

    // Other providers
    return {
      success: false,
      content: '',
      errorMessage: `AI 服务 [${targetModel.provider}] 尚未配置服务端 API 密钥。请在环境变量中设置对应的密钥。`
    };
  }
}

export const aiGateway = new AIGateway();
