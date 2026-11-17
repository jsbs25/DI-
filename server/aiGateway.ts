import dotenv from 'dotenv';
import { OpenAICompatibleProvider, type OpenAICompatibleMessage } from './ai/providers/openAICompatibleProvider.ts';
import { getOllamaContextWindow, getOllamaTokenBudget, type AIConversationMessage } from './aiConversation.ts';

// Load .env here as well — ESM imports are hoisted above `dotenv.config()`
// in server.ts, so the gateway (instantiated at import time) must load env itself.
dotenv.config();

export interface AIModelMeta {
  id: string;
  name: string;
  provider: 'DeepSeek' | 'Custom';
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
  ollamaRole?: 'chat' | 'crawler' | 'both';
  parameterSize?: string;
  sizeBytes?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface OllamaModelInfo {
  name: string;
  id: string;
  sizeBytes: number;
  parameterSize: string;
  estBillion: number;
  role: 'chat' | 'crawler' | 'both';
  displayName: string;
}

/**
 * Local Ollama models (especially 20B/32B/70B reasoning models) can take longer
 * to complete deep crawler extraction or first token reasoning.
 */
const LOCAL_OLLAMA_TIMEOUT_MS = 300_000;
const LOCAL_OLLAMA_BASE_URL = 'http://127.0.0.1:11434/v1';

/**
 * Ollama's default bind is IPv4 127.0.0.1:11434; `localhost` can resolve to ::1
 * on some hosts, so try IPv4 first and fall back to localhost.
 */
const OLLAMA_HOSTS = ['http://127.0.0.1:11434', 'http://localhost:11434'];

/**
 * Parse an estimated parameter count in Billions (B) to distinguish large models (for crawler)
 * from smaller models (for fast interactive chat/speech).
 */
function parseParameterBillion(m: any): number {
  if (m?.details?.parameter_size) {
    const raw = String(m.details.parameter_size).trim().toUpperCase();
    const match = raw.match(/([\d.]+)\s*([BMK]?)/);
    if (match) {
      const num = parseFloat(match[1]);
      const unit = match[2];
      if (unit === 'B') return num;
      if (unit === 'M') return num / 1000;
      if (unit === 'K') return num / 1_000_000;
      return num;
    }
  }
  // Try pattern from name: e.g. deepseek-r1:14b, qwen2.5:7b, gpt-oss:20b, llama3.2:3b
  const nameMatch = String(m?.name || '').match(/[:\-_](\d+(\.\d+)?)b/i);
  if (nameMatch) {
    return parseFloat(nameMatch[1]);
  }
  // Fallback to byte size: 1B ~ 0.7 GB
  if (typeof m?.size === 'number' && m.size > 0) {
    return m.size / (700 * 1024 * 1024);
  }
  return 1;
}

/**
 * Produce a human-friendly display name and a sensible model category for an
 * auto-detected local Ollama model (the /api/tags name, e.g. "gpt-oss:20b").
 */
function describeOllamaModel(
  name: string,
  role?: 'chat' | 'crawler' | 'both'
): { displayName: string; category: AIModelMeta['category'] } {
  const lower = name.toLowerCase();
  const tag = name.includes(':') ? name.slice(name.indexOf(':') + 1) : '';
  const roleSuffix = role === 'crawler'
    ? ' · 🕷️ [爬虫深度抽取大模型]'
    : role === 'chat'
      ? ' · ⚡ [交互对话小模型 · 推荐]'
      : ' · ⚡ [本地模型]';

  if (lower.startsWith('gpt-oss')) {
    return {
      displayName: `GPT-OSS ${tag.toUpperCase()} · OpenAI 本地推理${roleSuffix}`,
      category: 'reasoning'
    };
  }
  if (lower.startsWith('qwen3')) {
    return { displayName: `通义千问 Qwen3 ${tag}${roleSuffix}`, category: role === 'crawler' ? 'reasoning' : 'text' };
  }
  if (lower.startsWith('qwen')) {
    return { displayName: `通义千问 Qwen ${tag}${roleSuffix}`, category: role === 'crawler' ? 'reasoning' : 'text' };
  }
  if (lower.startsWith('deepseek-r1')) {
    return { displayName: `DeepSeek-R1 ${tag}${roleSuffix}`, category: 'reasoning' };
  }
  if (lower.startsWith('llama')) {
    return { displayName: `Llama ${tag}${roleSuffix}`, category: role === 'crawler' ? 'reasoning' : 'text' };
  }
  if (lower.startsWith('gemma')) {
    return { displayName: `Gemma ${tag}${roleSuffix}`, category: 'text' };
  }
  return { displayName: `本地 Ollama · ${name}${roleSuffix}`, category: role === 'crawler' ? 'reasoning' : 'text' };
}

class AIGateway {
  private models: AIModelMeta[] = [];
  private readonly openAICompatibleProvider = new OpenAICompatibleProvider();
  private deepseekKey: string = '';
  private customKey: string = '';
  private customBaseUrl: string = process.env.CUSTOM_BASE_URL || 'https://api.deepseek.com/v1';
  private customModel: string = process.env.CUSTOM_MODEL || 'deepseek-chat';
  private ollamaChatModel: string | null = process.env.OLLAMA_CHAT_MODEL || null;
  private ollamaCrawlerModel: string | null = process.env.OLLAMA_CRAWLER_MODEL || null;
  private localOllamaModels: string[] = [];
  private localOllamaInfoList: OllamaModelInfo[] = [];
  private ollamaDetected: boolean = false;
  private localOllamaWarmup: Promise<void> | null = null;

  constructor() {
    this.initProviders();
    this.detectLocalOllama().catch(() => {});
    // 每 10 秒主动探测本地 Ollama，在完全离线或延迟启动时自愈
    setInterval(() => {
      this.detectLocalOllama().catch(() => {});
    }, 10000);
  }

  private isUsableKey(key: string | undefined): boolean {
    const k = (key || '').trim();
    if (!k || k.length < 12) return false;
    if (/^(x|test|demo|none|null|undefined|placeholder|changeme|MY_API_KEY)$/i.test(k)) return false;
    return true;
  }

  private maskKey(key: string | undefined): string {
    if (!this.isUsableKey(key)) return '未配置 (请设置 DEEPSEEK_API_KEY 或在 AI 工作台填入)';
    const k = String(key).trim();
    return `${k.slice(0, 4)}...${k.slice(-4)}`;
  }

  private initProviders() {
    const rawDs = (process.env.DEEPSEEK_API_KEY || '').trim();
    this.deepseekKey = this.isUsableKey(rawDs) ? rawDs : '';
    const rawCustom = (process.env.CUSTOM_API_KEY || '').trim();
    this.customKey = this.isUsableKey(rawCustom) ? rawCustom : '';

    this.models = [
      {
        id: 'deepseek-v3',
        name: 'DeepSeek-V3 (极速对话 · 全站语音默认)',
        provider: 'DeepSeek',
        category: 'text',
        status: 'active',
        isDefault: true,
        totalCalls: 0,
        totalTokens: 0,
        averageLatencyMs: 140,
        apiKeyMasked: this.deepseekKey ? this.maskKey(this.deepseekKey) : '未配置密钥',
        isFree: !this.deepseekKey
      },
      {
        id: 'deepseek-r1-open',
        name: 'DeepSeek-R1 (深度推理 · 复杂分析)',
        provider: 'DeepSeek',
        category: 'reasoning',
        status: 'active',
        isDefault: false,
        totalCalls: 0,
        totalTokens: 0,
        averageLatencyMs: 320,
        apiKeyMasked: this.deepseekKey ? this.maskKey(this.deepseekKey) : '未配置密钥',
        isFree: !this.deepseekKey
      },
      {
        id: 'custom',
        name: '自定义 DeepSeek / 本地 Ollama 接口',
        provider: 'Custom',
        category: 'text',
        status: 'active',
        isDefault: false,
        totalCalls: 0,
        totalTokens: 0,
        averageLatencyMs: 0,
        apiKeyMasked: '支持 api.deepseek.com 或 localhost:11434',
        isFree: true
      }
    ];
  }

  public hasLiveEngine(): boolean {
    return (
      this.isUsableKey(this.deepseekKey) ||
      this.isUsableKey(this.customKey) ||
      this.localOllamaModels.length > 0
    );
  }

  public getModels(): AIModelMeta[] {
    return this.models;
  }

  public getModel(id: string): AIModelMeta | undefined {
    const exact = this.models.find(m => m.id === id);
    if (exact) return exact;
    // Redirect any legacy non-DeepSeek model IDs strictly to DeepSeek
    if (id && !id.startsWith('ollama:')) {
      return this.models.find(m => m.id === this.getChatModelId()) || this.models[0];
    }
    return undefined;
  }

  /**
   * Register or update a user-supplied DeepSeek / OpenAI-compatible or Ollama provider.
   */
  public registerCustomProvider(apiKey: string, baseUrl?: string, model?: string): void {
    const cleanKey = (apiKey || '').trim();
    const cleanUrl = (baseUrl || 'https://api.deepseek.com/v1').trim();
    this.customKey = cleanKey;
    this.customBaseUrl = cleanUrl;
    this.customModel = (model || 'deepseek-chat').trim();

    if (this.isUsableKey(cleanKey) && cleanUrl.toLowerCase().includes('deepseek.com')) {
      this.deepseekKey = cleanKey;
      for (const m of this.models) {
        if (m.id === 'deepseek-v3' || m.id === 'deepseek-r1-open') {
          m.status = 'active';
          m.apiKeyMasked = this.maskKey(cleanKey);
          m.errorMessage = undefined;
        }
      }
    }

    const entry = this.models.find(m => m.id === 'custom');
    if (entry) {
      entry.status = 'active';
      entry.apiKeyMasked = this.customKey ? this.maskKey(this.customKey) : '本地免密模式 (localhost:11434)';
    }
  }

  /**
   * 自动探测本地 Ollama (localhost:11434) 正在运行的模型，并根据模型尺寸自动划分职责：
   * - 大模型（参数更大、深度理解力强）：专用于网络爬虫抽取、长文提炼与知识图谱
   * - 小模型（轻量、低延迟）：专用于实时对话、语音交互与全息地球伴侣
   */
  public async detectLocalOllama(): Promise<void> {
    if (process.env.EARTH_ONE_SKIP_OLLAMA_DETECTION === 'true') return;

    let data: any = null;
    for (const host of OLLAMA_HOSTS) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      try {
        const res = await fetch(`${host}/api/tags`, { signal: controller.signal });
        if (!res.ok) continue;
        data = await res.json();
        break;
      } catch {
        // Ollama not reachable on this host; try the next one.
      } finally {
        clearTimeout(timer);
      }
    }

    this.ollamaDetected = true;
    const tags: any[] = Array.isArray(data?.models) ? data.models : [];
    if (tags.length === 0) return;

    // 按模型参数/体积从大到小排序
    const sorted = [...tags].sort((a, b) => parseParameterBillion(b) - parseParameterBillion(a));
    const names = sorted.map((m: any) => m?.name).filter((n: any): n is string => typeof n === 'string' && n.length > 0);
    this.localOllamaModels = names;
    this.models = this.models.filter(model =>
      !model.id.startsWith('ollama:') || names.includes(model.id.slice('ollama:'.length))
    );

    // 智能职责分配：有 2 个或以上模型时，最大的给爬虫，较小（或响应更快）的给交互对话
    let crawlerTarget = this.ollamaCrawlerModel;
    let chatTarget = this.ollamaChatModel;

    if (!crawlerTarget || !names.includes(crawlerTarget)) {
      crawlerTarget = names[0]; // 最大的模型
    }
    if (!chatTarget || !names.includes(chatTarget)) {
      chatTarget = names.length > 1 ? names[names.length - 1] : names[0]; // 较小模型
    }

    this.ollamaCrawlerModel = crawlerTarget;
    this.ollamaChatModel = chatTarget;

    this.localOllamaInfoList = sorted.map(m => {
      const isCrawler = m.name === this.ollamaCrawlerModel;
      const isChat = m.name === this.ollamaChatModel;
      const role: 'chat' | 'crawler' | 'both' = (isCrawler && isChat) ? 'both' : isCrawler ? 'crawler' : isChat ? 'chat' : 'both';
      const { displayName } = describeOllamaModel(m.name, role);
      return {
        name: m.name,
        id: `ollama:${m.name}`,
        sizeBytes: typeof m.size === 'number' ? m.size : 0,
        parameterSize: m.details?.parameter_size || `${parseParameterBillion(m).toFixed(1)}B`,
        estBillion: parseParameterBillion(m),
        role,
        displayName
      };
    });

    // 注册或更新到模型列表中（保留 DeepSeek 为全局默认引擎）
    const defaultDeepSeekId = this.getChatModelId();
    for (const info of this.localOllamaInfoList) {
      const id = info.id;
      const existing = this.models.find(m => m.id === id);
      const isDeepSeekOllama = info.name.toLowerCase().includes('deepseek');
      if (existing) {
        existing.name = info.displayName;
        existing.category = info.role === 'crawler' ? 'reasoning' : 'text';
        existing.ollamaRole = info.role;
        existing.parameterSize = info.parameterSize;
        existing.sizeBytes = info.sizeBytes;
        existing.isDefault = false;
      } else {
        this.models.push({
          id,
          name: info.displayName,
          provider: isDeepSeekOllama ? 'DeepSeek' : 'Custom',
          category: info.role === 'crawler' ? 'reasoning' : 'text',
          status: 'active',
          isDefault: false,
          totalCalls: 0,
          totalTokens: 0,
          averageLatencyMs: 0,
          apiKeyMasked: '本地免密直连 (localhost:11434)',
          isFree: true,
          ollamaRole: info.role,
          parameterSize: info.parameterSize,
          sizeBytes: info.sizeBytes
        });
      }
    }

    for (const m of this.models) {
      m.isDefault = m.id === defaultDeepSeekId;
    }

    const preferredLocalDeepSeek = names.find(n => n.toLowerCase().includes('deepseek'));
    if (preferredLocalDeepSeek && !this.localOllamaWarmup) {
      this.localOllamaWarmup = this.warmLocalOllamaModel(preferredLocalDeepSeek).catch(error => {
        console.warn('Unable to warm local Ollama model:', error);
        this.localOllamaWarmup = null;
      });
    }
  }

  /**
   * 获取双 Ollama 角色配置信息
   */
  public getOllamaRoleAssignment() {
    return {
      running: this.ollamaDetected,
      chatModel: this.ollamaChatModel,
      crawlerModel: this.ollamaCrawlerModel,
      chatModelId: this.ollamaChatModel ? `ollama:${this.ollamaChatModel}` : null,
      crawlerModelId: this.ollamaCrawlerModel ? `ollama:${this.ollamaCrawlerModel}` : null,
      models: this.localOllamaInfoList
    };
  }

  /**
   * 用户手动切换/指派双模型角色
   */
  public setOllamaRoles(chatModel: string, crawlerModel: string) {
    if (chatModel) this.ollamaChatModel = chatModel;
    if (crawlerModel) this.ollamaCrawlerModel = crawlerModel;

    const defaultDeepSeekId = this.getChatModelId();
    for (const m of this.models) {
      if (m.id.startsWith('ollama:')) {
        const name = m.id.slice('ollama:'.length);
        const isCrawler = name === this.ollamaCrawlerModel;
        const isChat = name === this.ollamaChatModel;
        const role: 'chat' | 'crawler' | 'both' = (isCrawler && isChat) ? 'both' : isCrawler ? 'crawler' : isChat ? 'chat' : 'both';
        m.name = describeOllamaModel(name, role).displayName;
        m.ollamaRole = role;
        m.isDefault = false;
      } else {
        m.isDefault = m.id === defaultDeepSeekId;
      }
    }
    return this.getOllamaRoleAssignment();
  }

  public getChatModelId(): string {
    return 'deepseek-v3';
  }

  public getCrawlerModelId(): string {
    return 'deepseek-v3';
  }

  /**
   * 使用爬虫专用大模型进行网页正文深度知识抽取与总结
   */
  public async runCrawlerExtraction(page: { title: string; content: string; url: string }) {
    const targetModelId = this.getCrawlerModelId();
    const prompt = `你是地球计划全球知识库与智能爬虫解析核心。请对以下抓取到的页面进行深度结构化知识抽取：

网页标题: ${page.title}
网页来源: ${page.url}
提取正文:
${page.content.slice(0, 4500)}

请输出：
1. 【核心知识摘要】(200字以内，提炼主旨与关键论据)
2. 【关键学术/地理/历史实体】(逗号隔开)
3. 【学科知识图谱标签】(3-5个高价值分类标签)
4. 【收录评级】(A级推荐/B级参考/C级待考)`;

    const sys = '你作为地球计划核心爬虫抽取引擎，请提供准确、结构化、高信息密度的专业学术分析。';
    const result = await this.generateContent(targetModelId, prompt, sys);
    return {
      success: result.success,
      modelUsed: targetModelId,
      extraction: result.content,
      error: result.errorMessage
    };
  }

  /**
   * Main entry point for generating content.
   */
  public async generateContent(
    modelId: string,
    prompt: string,
    systemInstruction?: string,
    onToken?: (token: string) => void,
    history?: AIConversationMessage[],
    maxTokens?: number,
    options?: { temperature?: number; signal?: AbortSignal }
  ): Promise<{ success: boolean; content: string; errorMessage?: string; tokens?: number }> {
    let targetModel = this.getModel(modelId);
    if (modelId.startsWith('ollama:') && !targetModel) {
      await this.detectLocalOllama();
      targetModel = this.getModel(modelId);
      if (!targetModel) {
        return {
          success: false,
          content: '',
          errorMessage: `本地 Ollama 模型 ${modelId.slice('ollama:'.length)} 尚未检测到，请确认 Ollama 正在运行且模型已安装。`
        };
      }
    }
    targetModel = targetModel || this.models.find(m => m.isDefault) || this.models[0];
    const startTime = Date.now();

    // 1. ALL CLOUD & BUILT-IN REQUESTS ROUTE STRICTLY TO DEEPSEEK (deepseek-v3 / deepseek-r1-open)
    if (targetModel.id === 'deepseek-r1-open' || targetModel.id === 'deepseek-v3') {
      try {
        const result = await this.runDeepSeekEngine(
          targetModel.id,
          prompt,
          systemInstruction,
          onToken,
          history,
          maxTokens,
          options
        );
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
        if (err?.name !== 'AbortError') {
          targetModel.status = 'error';
          targetModel.errorMessage = message;
        }
        return { success: false, content: '', errorMessage: message };
      }
    }

    // 2. 本地 Ollama 模型（仅当用户显式选择 ollama:* 模型或离线兜底）
    if (targetModel.id.startsWith('ollama:')) {
      const modelName = targetModel.id.slice('ollama:'.length);
      if (modelName.toLowerCase().startsWith('qwen3') || modelName.toLowerCase().includes('deepseek')) {
        try {
          const result = await this.runFastOllamaModel(
            modelName,
            prompt,
            systemInstruction,
            onToken,
            history,
            options
          );
          const latency = Date.now() - startTime;
          const tokens = result.tokens || Math.ceil((prompt.length + result.content.length) / 3.5);
          targetModel.status = 'active';
          targetModel.totalCalls += 1;
          targetModel.totalTokens += tokens;
          targetModel.averageLatencyMs = Math.round(
            (targetModel.averageLatencyMs * (targetModel.totalCalls - 1) + latency) / targetModel.totalCalls
          );
          targetModel.lastUsedAt = new Date().toISOString();
          targetModel.errorMessage = undefined;
          return { success: true, content: result.content, tokens };
        } catch (error: any) {
          const message = String(error?.message || error);
          targetModel.status = 'error';
          targetModel.errorMessage = message;
          return { success: false, content: '', errorMessage: message };
        }
      }

      const res = await this.callOpenAICompatible({
        baseUrl: LOCAL_OLLAMA_BASE_URL,
        model: modelName,
        prompt,
        systemInstruction,
        history,
        onToken,
        maxTokens,
        temperature: options?.temperature,
        signal: options?.signal
      });
      return res;
    }

    // 3. Custom DeepSeek / OpenAI-compatible or Ollama providers
    if (targetModel.provider === 'Custom' && targetModel.id === 'custom') {
      const res = await this.callOpenAICompatible({
        baseUrl: this.customBaseUrl || 'https://api.deepseek.com/v1',
        apiKey: this.customKey || this.deepseekKey,
        model: this.customModel || 'deepseek-chat',
        prompt,
        systemInstruction,
        history,
        onToken,
        maxTokens,
        temperature: options?.temperature,
        signal: options?.signal
      });
      return res;
    }

    return {
      success: false,
      content: '',
      errorMessage: '当前模型请求已重路由至 DeepSeek 引擎，但服务暂不可用，请稍后重试。'
    };
  }

  /**
   * Unified DeepSeek Execution Engine.
   * Uses official DeepSeek API (deepseek-chat / deepseek-reasoner) when DEEPSEEK_API_KEY is configured,
   * and seamlessly executes via DeepSeek open relay otherwise, with streaming and offline local DeepSeek fallback.
   */
  private async runDeepSeekEngine(
    modelId: string,
    prompt: string,
    systemInstruction?: string,
    onToken?: (token: string) => void,
    history: AIConversationMessage[] = [],
    maxTokens?: number,
    options?: { temperature?: number; signal?: AbortSignal }
  ): Promise<{ content: string; tokens?: number }> {
    const messages: ChatMessage[] = [];
    if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
    for (const turn of history) {
      if (turn?.content) {
        messages.push({ role: turn.role, content: turn.content });
      }
    }
    messages.push({ role: 'user', content: prompt });

    // Primary path: Official DeepSeek API when valid DEEPSEEK_API_KEY is present
    if (this.isUsableKey(this.deepseekKey)) {
      const dsModel = modelId === 'deepseek-r1-open' ? 'deepseek-reasoner' : 'deepseek-chat';
      const controller = new AbortController();
      const onExternalAbort = () => controller.abort();
      if (options?.signal) {
        if (options.signal.aborted) controller.abort();
        else options.signal.addEventListener('abort', onExternalAbort, { once: true });
      }
      const timer = setTimeout(() => controller.abort(), 22000);
      try {
        const useStream = Boolean(onToken);
        const requestBody: Record<string, any> = {
          model: dsModel,
          messages,
          temperature: dsModel === 'deepseek-reasoner' ? undefined : (options?.temperature ?? 0.68),
          stream: useStream
        };
        if (typeof maxTokens === 'number' && maxTokens > 0) {
          requestBody.max_tokens = maxTokens;
        }
        const response = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.deepseekKey}`
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`DeepSeek HTTP ${response.status}: ${errText.slice(0, 300)}`);
        }

        if (useStream && response.body) {
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
                  onToken?.(delta);
                }
              } catch {}
            }
            if (done) break;
          }
          if (fullText.trim()) return { content: fullText };
        } else {
          const data = await response.json();
          const text = data?.choices?.[0]?.message?.content || '';
          const tokens = data?.usage?.total_tokens || Math.ceil((prompt.length + text.length) / 3.5);
          if (text) {
            onToken?.(text);
            return { content: text, tokens };
          }
        }
      } catch (err) {
        console.warn('[DeepSeek Official API error]:', err instanceof Error ? err.message : err);
        throw err instanceof Error ? err : new Error(String(err));
      } finally {
        clearTimeout(timer);
        if (options?.signal) options.signal.removeEventListener('abort', onExternalAbort);
      }
    }

    // Secondary path: Local Ollama DeepSeek model (completely offline / private)
    const localDeepSeek =
      this.localOllamaModels.find(n => n.toLowerCase().includes('deepseek')) ||
      this.ollamaChatModel ||
      (this.localOllamaModels.length > 0 ? this.localOllamaModels[0] : null);
    if (localDeepSeek) {
      const fallbackRes = await this.callOllamaNative(localDeepSeek, prompt, systemInstruction, history, options?.signal);
      if (fallbackRes.success) {
        onToken?.(fallbackRes.content);
        return { content: fallbackRes.content, tokens: fallbackRes.tokens };
      }
    }

    throw new Error('DeepSeek 尚未配置服务端密钥（DEEPSEEK_API_KEY），且本地未检测到运行中的 DeepSeek Ollama 模型。');
  }

  private async runFastOllamaModel(
    model: string,
    prompt: string,
    systemInstruction?: string,
    onToken?: (token: string) => void,
    history: AIConversationMessage[] = [],
    options?: { temperature?: number; signal?: AbortSignal }
  ): Promise<{ content: string; tokens?: number }> {
    await this.localOllamaWarmup;
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    if (options?.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener('abort', onExternalAbort, { once: true });
    }
    const timeout = setTimeout(() => controller.abort(), LOCAL_OLLAMA_TIMEOUT_MS);

    try {
      const response = await fetch(`${OLLAMA_HOSTS[0]}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
            ...history,
            { role: 'user', content: prompt }
          ],
          stream: Boolean(onToken),
          think: false,
          keep_alive: -1,
          options: {
            temperature: options?.temperature ?? 0.5,
            num_predict: getOllamaTokenBudget(prompt, history),
            num_ctx: getOllamaContextWindow(prompt, systemInstruction, history)
          }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(`本地 Ollama 请求失败（HTTP ${response.status}）：${String(errorBody?.error || '未知错误').slice(0, 300)}`);
      }

      let data: any;
      let content = '';
      if (onToken) {
        if (!response.body) throw new Error('本地 Ollama 未提供流式响应。');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            const chunk = JSON.parse(line);
            if (chunk.error) throw new Error(String(chunk.error));
            const token = typeof chunk.message?.content === 'string' ? chunk.message.content : '';
            if (token) {
              content += token;
              onToken(token);
            }
            if (chunk.done) data = chunk;
          }
          if (done) break;
        }
        if (buffer.trim()) {
          const chunk = JSON.parse(buffer);
          if (chunk.error) throw new Error(String(chunk.error));
          const token = typeof chunk.message?.content === 'string' ? chunk.message.content : '';
          if (token) {
            content += token;
            onToken(token);
          }
          if (chunk.done) data = chunk;
        }
      } else {
        data = await response.json().catch(() => null);
        content = typeof data?.message?.content === 'string' ? data.message.content.trim() : '';
      }
      if (!content) throw new Error('本地 Ollama 返回了空响应。');
      return {
        content,
        tokens: Number.isFinite(data?.eval_count) ? data.eval_count : undefined
      };
    } catch (error: any) {
      if (error?.name === 'AbortError') throw new Error('本地 Ollama 请求超时，请稍后重试。');
      if (error instanceof TypeError) {
        throw new Error('未能连接到本地 Ollama 服务（127.0.0.1:11434），请确认 Ollama 正在运行。');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async warmLocalOllamaModel(model: string): Promise<void> {
    const response = await fetch(`${OLLAMA_HOSTS[0]}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: -1, options: { num_predict: 0 } }),
      signal: AbortSignal.timeout(LOCAL_OLLAMA_TIMEOUT_MS)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`Ollama warm-up failed (HTTP ${response.status}): ${String(data?.error || 'unknown error').slice(0, 300)}`);
    }
  }

  /**
   * 原生直接调用本地电脑 Ollama (http://127.0.0.1:11434/api/chat)
   * 100% 离线免外网、零外部服务依赖
   */
  public async callOllamaNative(
    modelName: string,
    prompt: string,
    systemInstruction?: string,
    history: AIConversationMessage[] = [],
    signal?: AbortSignal
  ): Promise<{ success: boolean; content: string; errorMessage?: string; tokens?: number }> {
    const messages: Array<{ role: string; content: string }> = [];
    if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
    for (const turn of history) {
      if (turn?.content) messages.push({ role: turn.role, content: turn.content });
    }
    messages.push({ role: 'user', content: prompt });

    for (const host of OLLAMA_HOSTS) {
      try {
        const controller = new AbortController();
        const onExternalAbort = () => controller.abort();
        if (signal) {
          if (signal.aborted) controller.abort();
          else signal.addEventListener('abort', onExternalAbort, { once: true });
        }
        const timer = setTimeout(() => controller.abort(), LOCAL_OLLAMA_TIMEOUT_MS);
        const res = await fetch(`${host}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelName,
            messages,
            stream: false
          }),
          signal: controller.signal
        });
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onExternalAbort);
        if (res.ok) {
          const data = await res.json();
          const content = data?.message?.content || data?.response || '';
          if (content) {
            return {
              success: true,
              content,
              tokens: data?.eval_count || Math.ceil((prompt.length + content.length) / 3.5)
            };
          }
        }
      } catch {
        // try next host
      }
    }
    return {
      success: false,
      content: '',
      errorMessage: '本地电脑 Ollama (127.0.0.1:11434) 离线无响应。请在本地终端运行 `ollama serve` 启动双模型引擎。'
    };
  }

  /**
   * Generic OpenAI-compatible chat completion call with Ollama Native priority.
   */
  public async callOpenAICompatible(opts: {
    baseUrl: string;
    apiKey?: string;
    model: string;
    prompt: string;
    systemInstruction?: string;
    history?: AIConversationMessage[];
    onToken?: (token: string) => void;
    maxTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
  }): Promise<{ success: boolean; content: string; errorMessage?: string; tokens?: number }> {
    const isLocalOllama = opts.baseUrl.includes('localhost:11434') || opts.baseUrl.includes('127.0.0.1:11434');
    if (isLocalOllama) {
      // 优先走本地 Ollama 原生端点，完全免外网
      const nativeRes = await this.callOllamaNative(opts.model, opts.prompt, opts.systemInstruction, opts.history, opts.signal);
      if (nativeRes.success) {
        opts.onToken?.(nativeRes.content);
        return nativeRes;
      }
    }

    const messages: ChatMessage[] = [];
    if (opts.systemInstruction) messages.push({ role: 'system', content: opts.systemInstruction });
    for (const turn of opts.history || []) {
      if (turn?.content) messages.push({ role: turn.role, content: turn.content });
    }
    messages.push({ role: 'user', content: opts.prompt });

    try {
      const result = await this.openAICompatibleProvider.generate({
        baseUrl: opts.baseUrl,
        apiKey: opts.apiKey,
        model: opts.model,
        messages: messages as OpenAICompatibleMessage[],
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        signal: opts.signal,
        onToken: opts.onToken,
        timeoutMs: isLocalOllama ? LOCAL_OLLAMA_TIMEOUT_MS : undefined
      });
      return {
        success: true,
        content: result.content,
        tokens: result.tokens || Math.ceil((opts.prompt.length + result.content.length) / 3.5)
      };
    } catch (err: any) {
      const errorMsg = String(err?.message || err);
      if (isLocalOllama || errorMsg.includes('ECONNREFUSED')) {
        return {
          success: false,
          content: '',
          errorMessage: '未能连接到本地 Ollama 服务 (127.0.0.1:11434)。当前为无网络离线状态，请在本地电脑启动 `ollama serve`。'
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
