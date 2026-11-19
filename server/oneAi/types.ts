export type AiTaskType =
  | 'A' // 日常闲聊与情感陪伴
  | 'B' // 简单快问快答
  | 'C' // 深度分析与复杂推理
  | 'D' // 编程、调试与架构设计
  | 'E' // 多语种翻译（中/英/阿）
  | 'F' // 语言学习与口语陪练
  | 'G' // 实时联网检索问答
  | 'H' // 长文档 / 网页 / 书籍总结
  | 'I' // 图片识别与视觉理解
  | 'J' // 音频理解、TTS 与实时语音
  | 'K' // 结构化 JSON 与数据抽取
  | 'L' // 创意写作与跨文化内容
  | 'M' // 数学、科学计算与公式推导
  | 'N' // Agent 意图判断与站内控制
  | 'O'; // 系统内部摘要/爬虫/记忆提炼

export type PrivacyMode = 'strict_zdr' | 'no_training' | 'standard';

export type ApprovalStatus =
  | 'discovered'
  | 'metadata_enriched'
  | 'source_verified'
  | 'verified'
  | 'license_checked'
  | 'policy_checked'
  | 'api_ready'
  | 'probe_passed'
  | 'evaluated'
  | 'compliance_ready'
  | 'approved'
  | 'rejected'
  | 'retired';

export type HealthStatus = 'healthy' | 'degraded' | 'cooldown' | 'offline';

export type DataRetentionPolicy = 'zdr' | 'no_training_30d_log' | 'may_train' | 'unknown';

export type BillingMode = 'free_only' | 'capped_prepaid';

export type UserTier = 'guest' | 'free' | 'pro' | 'admin';

export type ProviderAdapterType =
  | 'openai_compatible'
  | 'gemini'
  | 'openrouter'
  | 'kilo'
  | 'groq'
  | 'cerebras'
  | 'deepseek'
  | 'qwen'
  | 'zhipu'
  | 'workers_ai'
  | 'huggingface';

export type ErrorCategory =
  | 'auth_invalid'
  | 'quota_exhausted'
  | 'rate_limited'
  | 'model_deprecated'
  | 'context_overflow'
  | 'content_filtered'
  | 'timeout'
  | 'upstream_5xx'
  | 'schema_invalid'
  | 'network_error';

export interface NormalizedProviderError {
  category: ErrorCategory;
  httpStatus?: number;
  retryAfterMs?: number;
  retryableBeforeFirstByte: boolean;
  rawMessage: string;
}

export interface ProviderRecord {
  id: string;
  name: string;
  adapterType: ProviderAdapterType;
  baseUrl: string;
  apiKeyMask: string;
  hasApiKey: boolean;
  billingMode: BillingMode;
  allowPaidOverflow: boolean;
  dailyUsdCap: number;
  monthlyUsdCap: number;
  currentDaySpendUsd: number;
  currentMonthSpendUsd: number;
  zdrEnabledAccount: boolean;
  status: 'active' | 'paused';
  notes: string;
  updatedAt: string;
}

export interface CanonicalModelRecord {
  canonicalId: string;
  family: string;
  displayName: string;
  modelVersion: string;
  category: 'chat' | 'reasoning' | 'code' | 'vision' | 'audio' | 'tts' | 'embedding';
  contextLength: number;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  supportsImages: boolean;
  supportsAudio: boolean;
  supportsVideo: boolean;
  supportsTools: boolean;
  supportsStructuredOutput: boolean;
  supportsCode: boolean;
  supportedLanguages: string[];
  licenseType: string;
  commercialAllowed: boolean;
  officialDocUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelEndpointRecord {
  endpointId: string;
  canonicalId: string;
  providerId: string;
  upstreamModelId: string;
  apiType: 'openai_chat' | 'gemini_generate' | 'gemini_live' | 'workers_ai';
  isFreeTier: boolean;
  freeQuotaNote: string;
  freeQuotaUpdatedAt: string;
  inputPricePer1m: number;
  outputPricePer1m: number;
  mayTrainOnPrompts: boolean;
  dataRetentionPolicy: DataRetentionPolicy;
  regionRouting: string;
  approvalStatus: ApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  healthStatus: HealthStatus;
  cooldownUntil: number;
  consecutiveFailures: number;
  avgTtftMs: number;
  avgTps: number;
  qualityScore: number;
  toolReliabilityScore: number;
  lastTestedAt: string | null;
  lastErrorCategory: ErrorCategory | null;
  lastErrorMessage: string | null;
  discoverySource: string;
  enabled: boolean;
  updatedAt: string;
}

export interface RoutingPolicyRecord {
  taskType: AiTaskType;
  labelZh: string;
  labelEn: string;
  weightQuality: number;
  weightCost: number;
  weightLatency: number;
  weightHealth: number;
  defaultPrivacyMode: PrivacyMode;
  maxFirstByteTimeoutMs: number;
  allowPaidEndpoints: boolean;
  minContextLength: number;
  requiresVision: boolean;
  requiresTools: boolean;
  requiresStructuredOutput: boolean;
  preferredFamilies: string[];
  updatedAt: string;
}

export interface UnifiedImagePart {
  type: 'image_url';
  imageUrl: string; // data:image/...;base64,... or https URL
  mimeType?: string;
}

export interface UnifiedTextPart {
  type: 'text';
  text: string;
}

export type UnifiedContentPart = UnifiedTextPart | UnifiedImagePart;

export interface UnifiedMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | UnifiedContentPart[];
}

export interface UnifiedToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface UnifiedChatRequest {
  requestId: string;
  endpointId: string;
  upstreamModelId: string;
  baseUrl: string;
  messages: UnifiedMessage[];
  tools?: UnifiedToolSpec[];
  responseFormat?: { type: 'text' | 'json_object' | 'json_schema'; schema?: unknown };
  temperature?: number;
  maxTokens?: number;
  stream: boolean;
  privacyMode: PrivacyMode;
  timeoutMs: number;
  firstByteTimeoutMs: number;
  signal?: AbortSignal;
}

export interface UnifiedStreamChunk {
  type: 'delta' | 'tool_call' | 'usage' | 'done' | 'error';
  textDelta?: string;
  toolCall?: { id: string; name: string; argumentsJson: string };
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cachedTokens?: number;
    estimatedCostUsd: number;
  };
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';
  error?: NormalizedProviderError;
}

export interface DecryptedCredentials {
  apiKey: string;
  accountId?: string;
}

export interface DiscoveredRawModel {
  providerId: string;
  upstreamModelId: string;
  displayName?: string;
  description?: string;
  contextLength?: number;
  maxOutputTokens?: number;
  supportsImages?: boolean;
  supportsAudio?: boolean;
  supportsVideo?: boolean;
  supportsTools?: boolean;
  supportsStructuredOutput?: boolean;
  inputPricePer1m?: number;
  outputPricePer1m?: number;
  isFreeTier?: boolean;
  mayTrainOnPrompts?: boolean;
  dataRetentionPolicy?: DataRetentionPolicy;
  officialDocUrl?: string;
  inferenceProviderIds?: string[];
  discoverySource: string;
}

export interface EvaluationRunRecord {
  id: string;
  endpointId: string;
  suiteVersion: string;
  overallScore: number;
  codingScore: number;
  reasoningScore: number;
  jsonSchemaScore: number;
  multilingualScore: number;
  avgTtftMs: number;
  passedCases: number;
  totalCases: number;
  runAt: string;
  reportJson: string;
}

export interface UsageLedgerRecord {
  requestId: string;
  idempotencyKey: string | null;
  userId: string | null;
  userTier: UserTier;
  taskType: AiTaskType;
  privacyMode: PrivacyMode;
  selectedEndpointId: string | null;
  fallbackChainJson: string;
  failoverCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  ttftMs: number;
  totalMs: number;
  status: 'success' | 'degraded' | 'failed' | 'aborted' | 'blocked_quota';
  errorCategory: ErrorCategory | null;
  createdAt: string;
}

export interface DiscoveryRunRecord {
  runId: string;
  sourceName: string;
  modelsFetched: number;
  newEndpointsFound: number;
  deprecatedMarked: number;
  status: 'success' | 'partial' | 'failed';
  errorLog: string | null;
  startedAt: string;
  finishedAt: string;
}

export interface TaskClassification {
  taskType: AiTaskType;
  confidence: number;
  privacyMode: PrivacyMode;
  estimatedInputTokens: number;
  hasImages: boolean;
  requiresTools: boolean;
  requiresStructuredOutput: boolean;
  reason: string;
}

export const TASK_METADATA: Record<AiTaskType, { zh: string; en: string }> = {
  A: { zh: '日常闲聊与情感陪伴', en: 'Casual Chat & Emotional Companion' },
  B: { zh: '简单快问快答', en: 'Fast Quick Q&A' },
  C: { zh: '深度分析与复杂推理', en: 'Deep Analysis & Complex Reasoning' },
  D: { zh: '编程、调试与架构设计', en: 'Coding, Debugging & Architecture' },
  E: { zh: '多语种翻译（中/英/阿）', en: 'Multilingual Translation' },
  F: { zh: '语言学习与口语陪练', en: 'Language Learning & Practice' },
  G: { zh: '实时联网检索问答', en: 'Live Web Knowledge Q&A' },
  H: { zh: '长文档 / 网页 / 书籍总结', en: 'Long Document, Web & Book Summary' },
  I: { zh: '图片识别与视觉理解', en: 'Vision & Image Understanding' },
  J: { zh: '音频理解、TTS 与实时语音', en: 'Audio, TTS & Live Voice' },
  K: { zh: '结构化 JSON 与数据抽取', en: 'Structured JSON & Extraction' },
  L: { zh: '创意写作与跨文化内容', en: 'Creative Writing & Cultural Content' },
  M: { zh: '数学、科学计算与公式推导', en: 'Math, Science & Exact Solving' },
  N: { zh: 'Agent 意图判断与站内控制', en: 'Agent Intent & Site Control' },
  O: { zh: '系统内部摘要/爬虫/记忆提炼', en: 'Internal Crawler & Memory Digest' },
};
