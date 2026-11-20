import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AiTaskType,
  ApprovalStatus,
  BillingMode,
  CanonicalModelRecord,
  DataRetentionPolicy,
  DiscoveryRunRecord,
  ErrorCategory,
  EvaluationRunRecord,
  HealthStatus,
  ModelEndpointRecord,
  PrivacyMode,
  ProviderAdapterType,
  ProviderRecord,
  RoutingPolicyRecord,
  UsageLedgerRecord,
  UserTier,
} from './types.ts';
import { decryptSecret, encryptSecret, maskApiKey } from './crypto.ts';
import { TASK_METADATA } from './types.ts';

const DB_DIR = path.resolve(process.env.EARTH_ONE_DATA_DIR || path.join(process.cwd(), 'server_data'));
const DB_PATH = process.env.EARTH_ONE_AI_DB_FILE || path.join(DB_DIR, 'one_ai.db');

export class OneAiDatabase {
  private db: DatabaseSync;

  constructor(customPath?: string) {
    const finalPath = customPath || DB_PATH;
    const dir = path.dirname(finalPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new DatabaseSync(finalPath);
    this.initPragmas();
    this.initTables();
    this.seedDefaults();
    this.hydrateCredentialsFromEnv();
  }

  private initPragmas() {
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        adapter_type TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key_encrypted TEXT NOT NULL DEFAULT '',
        api_key_mask TEXT NOT NULL DEFAULT '未配置',
        extra_config_json TEXT NOT NULL DEFAULT '{}',
        billing_mode TEXT NOT NULL DEFAULT 'free_only',
        allow_paid_overflow INTEGER NOT NULL DEFAULT 0,
        daily_usd_cap REAL NOT NULL DEFAULT 0,
        monthly_usd_cap REAL NOT NULL DEFAULT 0,
        current_day_spend_usd REAL NOT NULL DEFAULT 0,
        current_month_spend_usd REAL NOT NULL DEFAULT 0,
        spend_day_key TEXT NOT NULL DEFAULT '',
        spend_month_key TEXT NOT NULL DEFAULT '',
        zdr_enabled_account INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        notes TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS canonical_models (
        canonical_id TEXT PRIMARY KEY,
        family TEXT NOT NULL,
        display_name TEXT NOT NULL,
        model_version TEXT NOT NULL DEFAULT 'latest',
        category TEXT NOT NULL DEFAULT 'chat',
        context_length INTEGER NOT NULL DEFAULT 32768,
        max_output_tokens INTEGER NOT NULL DEFAULT 4096,
        supports_streaming INTEGER NOT NULL DEFAULT 1,
        supports_images INTEGER NOT NULL DEFAULT 0,
        supports_audio INTEGER NOT NULL DEFAULT 0,
        supports_video INTEGER NOT NULL DEFAULT 0,
        supports_tools INTEGER NOT NULL DEFAULT 0,
        supports_structured_output INTEGER NOT NULL DEFAULT 0,
        supports_code INTEGER NOT NULL DEFAULT 1,
        supported_languages_json TEXT NOT NULL DEFAULT '["zh","en"]',
        license_type TEXT NOT NULL DEFAULT 'proprietary',
        commercial_allowed INTEGER NOT NULL DEFAULT 1,
        official_doc_url TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS model_endpoints (
        endpoint_id TEXT PRIMARY KEY,
        canonical_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        upstream_model_id TEXT NOT NULL,
        api_type TEXT NOT NULL DEFAULT 'openai_chat',
        is_free_tier INTEGER NOT NULL DEFAULT 0,
        free_quota_note TEXT NOT NULL DEFAULT '',
        free_quota_updated_at TEXT NOT NULL DEFAULT '',
        input_price_per_1m REAL NOT NULL DEFAULT 0,
        output_price_per_1m REAL NOT NULL DEFAULT 0,
        may_train_on_prompts INTEGER NOT NULL DEFAULT 0,
        data_retention_policy TEXT NOT NULL DEFAULT 'unknown',
        region_routing TEXT NOT NULL DEFAULT 'global',
        approval_status TEXT NOT NULL DEFAULT 'discovered',
        approved_by TEXT,
        approved_at TEXT,
        health_status TEXT NOT NULL DEFAULT 'healthy',
        cooldown_until INTEGER NOT NULL DEFAULT 0,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        avg_ttft_ms INTEGER NOT NULL DEFAULT 900,
        avg_tps REAL NOT NULL DEFAULT 40,
        quality_score REAL NOT NULL DEFAULT 72,
        tool_reliability_score REAL NOT NULL DEFAULT 75,
        last_tested_at TEXT,
        last_error_category TEXT,
        last_error_message TEXT,
        discovery_source TEXT NOT NULL DEFAULT 'seed',
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        UNIQUE(provider_id, upstream_model_id),
        FOREIGN KEY(canonical_id) REFERENCES canonical_models(canonical_id) ON DELETE CASCADE,
        FOREIGN KEY(provider_id) REFERENCES ai_providers(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_endpoints_lookup
        ON model_endpoints(approval_status, enabled, health_status, canonical_id);

      CREATE TABLE IF NOT EXISTS ai_routing_policies (
        task_type TEXT PRIMARY KEY,
        label_zh TEXT NOT NULL,
        label_en TEXT NOT NULL,
        weight_quality REAL NOT NULL,
        weight_cost REAL NOT NULL,
        weight_latency REAL NOT NULL,
        weight_health REAL NOT NULL,
        default_privacy_mode TEXT NOT NULL DEFAULT 'no_training',
        max_first_byte_timeout_ms INTEGER NOT NULL DEFAULT 4500,
        allow_paid_endpoints INTEGER NOT NULL DEFAULT 1,
        min_context_length INTEGER NOT NULL DEFAULT 8192,
        requires_vision INTEGER NOT NULL DEFAULT 0,
        requires_tools INTEGER NOT NULL DEFAULT 0,
        requires_structured_output INTEGER NOT NULL DEFAULT 0,
        preferred_families_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ai_model_evaluations (
        id TEXT PRIMARY KEY,
        endpoint_id TEXT NOT NULL,
        suite_version TEXT NOT NULL,
        overall_score REAL NOT NULL,
        coding_score REAL NOT NULL,
        reasoning_score REAL NOT NULL,
        json_schema_score REAL NOT NULL,
        multilingual_score REAL NOT NULL,
        avg_ttft_ms INTEGER NOT NULL,
        passed_cases INTEGER NOT NULL,
        total_cases INTEGER NOT NULL,
        run_at TEXT NOT NULL,
        report_json TEXT NOT NULL,
        FOREIGN KEY(endpoint_id) REFERENCES model_endpoints(endpoint_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ai_usage_ledger (
        request_id TEXT PRIMARY KEY,
        idempotency_key TEXT,
        user_id TEXT,
        user_tier TEXT NOT NULL,
        task_type TEXT NOT NULL,
        privacy_mode TEXT NOT NULL,
        selected_endpoint_id TEXT,
        fallback_chain_json TEXT NOT NULL DEFAULT '[]',
        failover_count INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        estimated_cost_usd REAL NOT NULL DEFAULT 0,
        ttft_ms INTEGER NOT NULL DEFAULT 0,
        total_ms INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        error_category TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ledger_user_time ON ai_usage_ledger(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_ledger_idem ON ai_usage_ledger(idempotency_key);

      CREATE TABLE IF NOT EXISTS ai_discovery_runs (
        run_id TEXT PRIMARY KEY,
        source_name TEXT NOT NULL,
        models_fetched INTEGER NOT NULL DEFAULT 0,
        new_endpoints_found INTEGER NOT NULL DEFAULT 0,
        deprecated_marked INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        error_log TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ai_admin_audit_logs (
        id TEXT PRIMARY KEY,
        admin_user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT NOT NULL,
        detail_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agent_task_sessions (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        intent_summary TEXT NOT NULL,
        module TEXT NOT NULL,
        steps_json TEXT NOT NULL DEFAULT '[]',
        payload_json TEXT NOT NULL DEFAULT '{}',
        result_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_agent_sessions_user ON agent_task_sessions(user_id, updated_at);

      CREATE TABLE IF NOT EXISTS agent_pending_confirmations (
        confirm_token TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        preview_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending',
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  private seedDefaults() {
    const now = new Date().toISOString();
    const providers: Array<{
      id: string;
      name: string;
      adapterType: ProviderAdapterType;
      baseUrl: string;
      billingMode: BillingMode;
      dailyUsdCap: number;
      monthlyUsdCap: number;
      zdr: boolean;
      notes: string;
    }> = [
      {
        id: 'gemini',
        name: 'Google Gemini API',
        adapterType: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        billingMode: 'free_only',
        dailyUsdCap: 0,
        monthlyUsdCap: 0,
        zdr: false,
        notes: '原生多模态/长上下文/实时语音引擎；Free Tier 受 Google 数据改进条款约束，Paid Tier 不用于训练。',
      },
      {
        id: 'groq',
        name: 'GroqCloud LPU',
        adapterType: 'groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        billingMode: 'free_only',
        dailyUsdCap: 0,
        monthlyUsdCap: 0,
        zdr: true,
        notes: '超低延迟免费 Developer Tier；不训练模型，可在 Console 开启 ZDR。',
      },
      {
        id: 'cerebras',
        name: 'Cerebras Inference',
        adapterType: 'cerebras',
        baseUrl: 'https://api.cerebras.ai/v1',
        billingMode: 'free_only',
        dailyUsdCap: 0,
        monthlyUsdCap: 0,
        zdr: true,
        notes: '默认 ZDR（零数据保留）+ 极速吞吐免费 Tier。',
      },
      {
        id: 'deepseek',
        name: 'DeepSeek Official API',
        adapterType: 'deepseek',
        baseUrl: 'https://api.deepseek.com/v1',
        billingMode: 'capped_prepaid',
        dailyUsdCap: 1.5,
        monthlyUsdCap: 20,
        zdr: false,
        notes: 'DeepSeek-V3 / R1 深度推理与高性价比编码主力，受预算硬上限保护。',
      },
      {
        id: 'openrouter',
        name: 'OpenRouter Gateway',
        adapterType: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        billingMode: 'capped_prepaid',
        dailyUsdCap: 1.0,
        monthlyUsdCap: 15,
        zdr: true,
        notes: '全球 480+ 模型聚合与 ZDR 兜底网关；支持 :free 渠道与 ZDR 过滤。',
      },
      {
        id: 'kilo',
        name: 'Kilo AI Gateway',
        adapterType: 'kilo',
        baseUrl: 'https://api.kilo.ai/api/gateway',
        billingMode: 'free_only',
        dailyUsdCap: 0,
        monthlyUsdCap: 0,
        zdr: false,
        notes: '零成本开箱即用共享免费池（kilo-auto/free / baidu/ernie-5.5-flash-preview:free，不传极高隐私数据；支持后台发现与 BYOK）。',
      },
      {
        id: 'qwen',
        name: '阿里云百炼 Qwen (DashScope)',
        adapterType: 'qwen',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        billingMode: 'capped_prepaid',
        dailyUsdCap: 1.0,
        monthlyUsdCap: 15,
        zdr: false,
        notes: '中文/多语种与视觉理解主力；企业商业版不用于训练。',
      },
      {
        id: 'zhipu',
        name: '智谱 AI GLM (BigModel)',
        adapterType: 'zhipu',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        billingMode: 'free_only',
        dailyUsdCap: 0,
        monthlyUsdCap: 0,
        zdr: false,
        notes: 'glm-4-flash 长期官方免费（带并发限制），中文结构化输出稳定。',
      },
      {
        id: 'workers_ai',
        name: 'Cloudflare Workers AI',
        adapterType: 'workers_ai',
        baseUrl: 'https://api.cloudflare.com/client/v4/accounts',
        billingMode: 'free_only',
        dailyUsdCap: 0,
        monthlyUsdCap: 0,
        zdr: true,
        notes: '每日 10,000 Neurons 免费额度；不用输入输出训练模型。',
      },
      {
        id: 'huggingface',
        name: 'Hugging Face Inference Providers',
        adapterType: 'huggingface',
        baseUrl: 'https://router.huggingface.co/v1',
        billingMode: 'free_only',
        dailyUsdCap: 0,
        monthlyUsdCap: 0,
        zdr: false,
        notes: '开源生态发现与长尾推理验证路由。',
      },
    ];

    const insertProvider = this.db.prepare(`
      INSERT OR IGNORE INTO ai_providers
        (id, name, adapter_type, base_url, billing_mode, allow_paid_overflow, daily_usd_cap, monthly_usd_cap, zdr_enabled_account, status, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 'active', ?, ?)
    `);
    for (const p of providers) {
      insertProvider.run(
        p.id,
        p.name,
        p.adapterType,
        p.baseUrl,
        p.billingMode,
        p.dailyUsdCap,
        p.monthlyUsdCap,
        p.zdr ? 1 : 0,
        p.notes,
        now
      );
    }

    const canonicalModels: Array<{
      canonicalId: string;
      family: string;
      displayName: string;
      version: string;
      category: CanonicalModelRecord['category'];
      ctx: number;
      maxOut: number;
      img: boolean;
      audio: boolean;
      tools: boolean;
      json: boolean;
      code: boolean;
      license: string;
      doc: string;
    }> = [
      {
        canonicalId: 'google/gemini-3-flash-preview',
        family: 'gemini',
        displayName: 'Gemini 3 Flash Preview',
        version: '3.0',
        category: 'vision',
        ctx: 1_048_576,
        maxOut: 8192,
        img: true,
        audio: true,
        tools: true,
        json: true,
        code: true,
        license: 'proprietary',
        doc: 'https://ai.google.dev/gemini-api/docs/models',
      },
      {
        canonicalId: 'google/gemini-3.8-flash',
        family: 'gemini',
        displayName: 'Gemini 3.8 Flash',
        version: '3.8',
        category: 'vision',
        ctx: 1_048_576,
        maxOut: 8192,
        img: true,
        audio: true,
        tools: true,
        json: true,
        code: true,
        license: 'proprietary',
        doc: 'https://ai.google.dev/gemini-api/docs/models',
      },
      {
        canonicalId: 'google/gemini-4-hydrogen',
        family: 'gemini',
        displayName: 'Gemini 4 Hydrogen',
        version: '4.0',
        category: 'reasoning',
        ctx: 1_048_576,
        maxOut: 8192,
        img: true,
        audio: true,
        tools: true,
        json: true,
        code: true,
        license: 'proprietary',
        doc: 'https://ai.google.dev/gemini-api/docs/models',
      },
      {
        canonicalId: 'deepseek/deepseek-v3',
        family: 'deepseek',
        displayName: 'DeepSeek-V3',
        version: 'v3',
        category: 'chat',
        ctx: 65536,
        maxOut: 8192,
        img: false,
        audio: false,
        tools: true,
        json: true,
        code: true,
        license: 'MIT (weights) / API Terms',
        doc: 'https://api-docs.deepseek.com/',
      },
      {
        canonicalId: 'deepseek/deepseek-r1',
        family: 'deepseek',
        displayName: 'DeepSeek-R1',
        version: 'r1',
        category: 'reasoning',
        ctx: 65536,
        maxOut: 8192,
        img: false,
        audio: false,
        tools: false,
        json: true,
        code: true,
        license: 'MIT',
        doc: 'https://api-docs.deepseek.com/',
      },
      {
        canonicalId: 'meta/llama-3.3-70b-instruct',
        family: 'llama',
        displayName: 'Llama 3.3 70B Instruct',
        version: '3.3',
        category: 'chat',
        ctx: 131072,
        maxOut: 8192,
        img: false,
        audio: false,
        tools: true,
        json: true,
        code: true,
        license: 'Llama 3.3 Community License',
        doc: 'https://www.llama.com/',
      },
      {
        canonicalId: 'qwen/qwen3-32b',
        family: 'qwen',
        displayName: 'Qwen3 32B',
        version: '3',
        category: 'reasoning',
        ctx: 131072,
        maxOut: 8192,
        img: false,
        audio: false,
        tools: true,
        json: true,
        code: true,
        license: 'Apache-2.0',
        doc: 'https://qwenlm.github.io/',
      },
      {
        canonicalId: 'zhipu/glm-4-flash',
        family: 'glm',
        displayName: 'GLM-4-Flash',
        version: '4',
        category: 'chat',
        ctx: 131072,
        maxOut: 4096,
        img: false,
        audio: false,
        tools: true,
        json: true,
        code: true,
        license: 'proprietary',
        doc: 'https://open.bigmodel.cn/',
      },
      {
        canonicalId: 'nvidia/nemotron-3.5-super-vl',
        family: 'nvidia',
        displayName: 'NVIDIA Nemotron 3.5 Super VL',
        version: '3.5',
        category: 'vision',
        ctx: 131072,
        maxOut: 8192,
        img: true,
        audio: false,
        tools: true,
        json: true,
        code: true,
        license: 'NVIDIA Open Model License',
        doc: 'https://build.nvidia.com/',
      },
      {
        canonicalId: 'kilo/kilo-auto-free',
        family: 'kilo',
        displayName: 'Kilo Auto Free Pool',
        version: 'free',
        category: 'chat',
        ctx: 65536,
        maxOut: 4096,
        img: false,
        audio: false,
        tools: false,
        json: false,
        code: true,
        license: 'Gateway Free Tier',
        doc: 'https://kilo.ai/',
      },
      {
        canonicalId: 'baidu/ernie-5.5-flash-preview',
        family: 'ernie',
        displayName: 'ERNIE 5.5 Flash Preview (Free)',
        version: '5.5',
        category: 'chat',
        ctx: 65536,
        maxOut: 4096,
        img: false,
        audio: false,
        tools: false,
        json: false,
        code: true,
        license: 'Gateway Free Tier',
        doc: 'https://kilo.ai/',
      },
      {
        canonicalId: 'nvidia/nemotron-3.5-lightning',
        family: 'nvidia',
        displayName: 'NVIDIA Nemotron 3.5 Lightning (Free)',
        version: '3.5',
        category: 'reasoning',
        ctx: 131072,
        maxOut: 8192,
        img: false,
        audio: false,
        tools: true,
        json: true,
        code: true,
        license: 'Gateway Free Tier',
        doc: 'https://kilo.ai/',
      },
      {
        canonicalId: 'nvidia/nemotron-3-ultra-550b-a55b',
        family: 'nvidia',
        displayName: 'NVIDIA Nemotron 3 Ultra 550B (Free)',
        version: '3.0',
        category: 'reasoning',
        ctx: 131072,
        maxOut: 8192,
        img: false,
        audio: false,
        tools: true,
        json: true,
        code: true,
        license: 'Gateway Free Tier',
        doc: 'https://kilo.ai/',
      },
      {
        canonicalId: 'cohere/north-mini-code',
        family: 'cohere',
        displayName: 'Cohere North Mini Code (Free)',
        version: '1.0',
        category: 'code',
        ctx: 65536,
        maxOut: 4096,
        img: false,
        audio: false,
        tools: false,
        json: true,
        code: true,
        license: 'Gateway Free Tier',
        doc: 'https://kilo.ai/',
      },
      {
        canonicalId: 'inclusionai/ling-3.2-flash',
        family: 'inclusionai',
        displayName: 'Ling 3.2 Flash (Free)',
        version: '3.2',
        category: 'chat',
        ctx: 65536,
        maxOut: 4096,
        img: false,
        audio: false,
        tools: false,
        json: false,
        code: true,
        license: 'Gateway Free Tier',
        doc: 'https://kilo.ai/',
      },
      {
        canonicalId: 'openrouter/free',
        family: 'openrouter',
        displayName: 'OpenRouter Free Pool (via Kilo)',
        version: 'free',
        category: 'chat',
        ctx: 65536,
        maxOut: 4096,
        img: false,
        audio: false,
        tools: false,
        json: false,
        code: true,
        license: 'Gateway Free Tier',
        doc: 'https://kilo.ai/',
      },
    ];

    const insertCanonical = this.db.prepare(`
      INSERT OR IGNORE INTO canonical_models
        (canonical_id, family, display_name, model_version, category, context_length, max_output_tokens,
         supports_streaming, supports_images, supports_audio, supports_video, supports_tools,
         supports_structured_output, supports_code, supported_languages_json, license_type,
         commercial_allowed, official_doc_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0, ?, ?, ?, '["zh","en","ar","es","fr","ru"]', ?, 1, ?, ?, ?)
    `);
    for (const m of canonicalModels) {
      insertCanonical.run(
        m.canonicalId,
        m.family,
        m.displayName,
        m.version,
        m.category,
        m.ctx,
        m.maxOut,
        m.img ? 1 : 0,
        m.audio ? 1 : 0,
        m.tools ? 1 : 0,
        m.json ? 1 : 0,
        m.code ? 1 : 0,
        m.license,
        m.doc,
        now,
        now
      );
    }

    // Core baseline endpoints: core official endpoints are pre-approved so Day-1 works as soon as API keys are set;
    // Kilo free endpoint starts as 'verified' / low-priority or 'discovered' respecting our A+C architecture decision.
    const endpoints: Array<{
      id: string;
      canonicalId: string;
      providerId: string;
      upstreamId: string;
      apiType: ModelEndpointRecord['apiType'];
      isFree: boolean;
      freeNote: string;
      inPrice: number;
      outPrice: number;
      mayTrain: boolean;
      retention: DataRetentionPolicy;
      approval: ApprovalStatus;
      ttft: number;
      tps: number;
      quality: number;
      toolRel: number;
    }> = [
      {
        id: 'ep_gemini_3_flash_preview',
        canonicalId: 'google/gemini-3-flash-preview',
        providerId: 'gemini',
        upstreamId: 'gemini-3-flash-preview',
        apiType: 'gemini_generate',
        isFree: true,
        freeNote: 'AI Studio Free/Paid Tier (低延迟高可用多模态)',
        inPrice: 0,
        outPrice: 0,
        mayTrain: false,
        retention: 'no_training_30d_log',
        approval: 'approved',
        ttft: 550,
        tps: 98,
        quality: 88,
        toolRel: 92,
      },
      {
        id: 'ep_gemini_3_8_flash',
        canonicalId: 'google/gemini-3.8-flash',
        providerId: 'gemini',
        upstreamId: 'gemini-3.8-flash',
        apiType: 'gemini_generate',
        isFree: true,
        freeNote: 'AI Studio Free/Paid Tier (多模态主力)',
        inPrice: 0,
        outPrice: 0,
        mayTrain: false,
        retention: 'no_training_30d_log',
        approval: 'approved',
        ttft: 620,
        tps: 95,
        quality: 89,
        toolRel: 93,
      },
      {
        id: 'ep_gemini_4_hydrogen',
        canonicalId: 'google/gemini-4-hydrogen',
        providerId: 'gemini',
        upstreamId: 'gemini-4-hydrogen',
        apiType: 'gemini_generate',
        isFree: true,
        freeNote: 'Gemini 4 Hydrogen 深度推理与全能档位',
        inPrice: 0,
        outPrice: 0,
        mayTrain: false,
        retention: 'no_training_30d_log',
        approval: 'approved',
        ttft: 950,
        tps: 78,
        quality: 95,
        toolRel: 95,
      },
      {
        id: 'ep_groq_llama33_70b',
        canonicalId: 'meta/llama-3.3-70b-instruct',
        providerId: 'groq',
        upstreamId: 'llama-3.3-70b-versatile',
        apiType: 'openai_chat',
        isFree: true,
        freeNote: 'Groq Developer Free Tier (约 30 RPM / 1K RPD)',
        inPrice: 0,
        outPrice: 0,
        mayTrain: false,
        retention: 'zdr',
        approval: 'approved',
        ttft: 240,
        tps: 260,
        quality: 83,
        toolRel: 84,
      },
      {
        id: 'ep_cerebras_llama33_70b',
        canonicalId: 'meta/llama-3.3-70b-instruct',
        providerId: 'cerebras',
        upstreamId: 'llama-3.3-70b',
        apiType: 'openai_chat',
        isFree: true,
        freeNote: 'Cerebras Free Tier (默认 ZDR 极速推理)',
        inPrice: 0,
        outPrice: 0,
        mayTrain: false,
        retention: 'zdr',
        approval: 'approved',
        ttft: 190,
        tps: 450,
        quality: 83,
        toolRel: 82,
      },
      {
        id: 'ep_cerebras_qwen3_32b',
        canonicalId: 'qwen/qwen3-32b',
        providerId: 'cerebras',
        upstreamId: 'qwen-3-32b',
        apiType: 'openai_chat',
        isFree: true,
        freeNote: 'Cerebras Free Tier (默认 ZDR)',
        inPrice: 0,
        outPrice: 0,
        mayTrain: false,
        retention: 'zdr',
        approval: 'approved',
        ttft: 210,
        tps: 400,
        quality: 85,
        toolRel: 85,
      },
      {
        id: 'ep_deepseek_v3_official',
        canonicalId: 'deepseek/deepseek-v3',
        providerId: 'deepseek',
        upstreamId: 'deepseek-chat',
        apiType: 'openai_chat',
        isFree: false,
        freeNote: '官方高性价比按量（缓存命中 90% 折扣）',
        inPrice: 0.27,
        outPrice: 1.1,
        mayTrain: false,
        retention: 'no_training_30d_log',
        approval: 'approved',
        ttft: 850,
        tps: 55,
        quality: 90,
        toolRel: 88,
      },
      {
        id: 'ep_deepseek_r1_official',
        canonicalId: 'deepseek/deepseek-r1',
        providerId: 'deepseek',
        upstreamId: 'deepseek-reasoner',
        apiType: 'openai_chat',
        isFree: false,
        freeNote: '官方深度推理引擎',
        inPrice: 0.55,
        outPrice: 2.19,
        mayTrain: false,
        retention: 'no_training_30d_log',
        approval: 'approved',
        ttft: 1800,
        tps: 42,
        quality: 93,
        toolRel: 75,
      },
      {
        id: 'ep_zhipu_glm4_flash',
        canonicalId: 'zhipu/glm-4-flash',
        providerId: 'zhipu',
        upstreamId: 'glm-4-flash',
        apiType: 'openai_chat',
        isFree: true,
        freeNote: '智谱官方永久免费模型（受并发与 QPS 约束）',
        inPrice: 0,
        outPrice: 0,
        mayTrain: false,
        retention: 'no_training_30d_log',
        approval: 'approved',
        ttft: 520,
        tps: 75,
        quality: 78,
        toolRel: 80,
      },
      {
        id: 'ep_openrouter_llama33_free',
        canonicalId: 'meta/llama-3.3-70b-instruct',
        providerId: 'openrouter',
        upstreamId: 'meta-llama/llama-3.3-70b-instruct:free',
        apiType: 'openai_chat',
        isFree: true,
        freeNote: 'OpenRouter Free Tier (20 RPM / 50~1000 RPD)',
        inPrice: 0,
        outPrice: 0,
        mayTrain: true,
        retention: 'may_train',
        approval: 'approved',
        ttft: 1100,
        tps: 50,
        quality: 83,
        toolRel: 80,
      },
      {
        id: 'ep_kilo_nemotron_free',
        canonicalId: 'nvidia/nemotron-3.5-super-vl',
        providerId: 'kilo',
        upstreamId: 'nvidia/nemotron-3.5-super-vl:free',
        apiType: 'openai_chat',
        isFree: true,
        freeNote: 'Kilo :free 多模态视觉理解免密钥通道（开箱即用）',
        inPrice: 0,
        outPrice: 0,
        mayTrain: true,
        retention: 'may_train',
        approval: 'approved',
        ttft: 860,
        tps: 45,
        quality: 83,
        toolRel: 78,
      },
      {
        id: 'ep_kilo_nemotron_lightning_free',
        canonicalId: 'nvidia/nemotron-3.5-lightning',
        providerId: 'kilo',
        upstreamId: 'nvidia/nemotron-3.5-lightning:free',
        apiType: 'openai_chat',
        isFree: true,
        freeNote: 'Kilo 免密钥高速闪电通道（开箱即用）',
        inPrice: 0,
        outPrice: 0,
        mayTrain: true,
        retention: 'may_train',
        approval: 'approved',
        ttft: 750,
        tps: 68,
        quality: 84,
        toolRel: 80,
      },
      {
        id: 'ep_kilo_nemotron_ultra_free',
        canonicalId: 'nvidia/nemotron-3-ultra-550b-a55b',
        providerId: 'kilo',
        upstreamId: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        apiType: 'openai_chat',
        isFree: true,
        freeNote: 'Kilo 免密钥 550B 深度推理通道（开箱即用）',
        inPrice: 0,
        outPrice: 0,
        mayTrain: true,
        retention: 'may_train',
        approval: 'approved',
        ttft: 680,
        tps: 54,
        quality: 87,
        toolRel: 82,
      },
      {
        id: 'ep_kilo_cohere_code_free',
        canonicalId: 'cohere/north-mini-code',
        providerId: 'kilo',
        upstreamId: 'cohere/north-mini-code:free',
        apiType: 'openai_chat',
        isFree: true,
        freeNote: 'Kilo 免密钥编程极速通道（开箱即用）',
        inPrice: 0,
        outPrice: 0,
        mayTrain: true,
        retention: 'may_train',
        approval: 'approved',
        ttft: 520,
        tps: 72,
        quality: 82,
        toolRel: 78,
      },
      {
        id: 'ep_kilo_ling_flash_free',
        canonicalId: 'inclusionai/ling-3.2-flash',
        providerId: 'kilo',
        upstreamId: 'inclusionai/ling-3.2-flash:free',
        apiType: 'openai_chat',
        isFree: true,
        freeNote: 'Kilo 免密钥中文/双语极速通道（开箱即用）',
        inPrice: 0,
        outPrice: 0,
        mayTrain: true,
        retention: 'may_train',
        approval: 'approved',
        ttft: 1200,
        tps: 55,
        quality: 81,
        toolRel: 76,
      },
      {
        id: 'ep_kilo_openrouter_free',
        canonicalId: 'openrouter/free',
        providerId: 'kilo',
        upstreamId: 'openrouter/free',
        apiType: 'openai_chat',
        isFree: true,
        freeNote: 'Kilo-OpenRouter 免密钥免费保底通道（开箱即用）',
        inPrice: 0,
        outPrice: 0,
        mayTrain: true,
        retention: 'may_train',
        approval: 'approved',
        ttft: 550,
        tps: 52,
        quality: 80,
        toolRel: 74,
      },
      {
        id: 'ep_kilo_auto_free',
        canonicalId: 'kilo/kilo-auto-free',
        providerId: 'kilo',
        upstreamId: 'kilo-auto/free',
        apiType: 'openai_chat',
        isFree: true,
        freeNote: 'Kilo 免费免密钥自动通道（开箱即用，非敏感对话默认保底）',
        inPrice: 0,
        outPrice: 0,
        mayTrain: true,
        retention: 'may_train',
        approval: 'approved',
        ttft: 950,
        tps: 46,
        quality: 81,
        toolRel: 74,
      },
      {
        id: 'ep_kilo_ernie_free',
        canonicalId: 'baidu/ernie-5.5-flash-preview',
        providerId: 'kilo',
        upstreamId: 'baidu/ernie-5.5-flash-preview:free',
        apiType: 'openai_chat',
        isFree: true,
        freeNote: 'Kilo 免费免密钥中文快响备选（开箱即用备用链路）',
        inPrice: 0,
        outPrice: 0,
        mayTrain: true,
        retention: 'may_train',
        approval: 'approved',
        ttft: 1100,
        tps: 44,
        quality: 79,
        toolRel: 72,
      },
    ];

    const insertEp = this.db.prepare(`
      INSERT OR IGNORE INTO model_endpoints
        (endpoint_id, canonical_id, provider_id, upstream_model_id, api_type, is_free_tier,
         free_quota_note, free_quota_updated_at, input_price_per_1m, output_price_per_1m,
         may_train_on_prompts, data_retention_policy, region_routing, approval_status,
         approved_by, approved_at, health_status, cooldown_until, consecutive_failures,
         avg_ttft_ms, avg_tps, quality_score, tool_reliability_score, discovery_source, enabled, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'global', ?, ?, ?, 'healthy', 0, 0, ?, ?, ?, ?, 'seed', 1, ?)
    `);

    for (const ep of endpoints) {
      insertEp.run(
        ep.id,
        ep.canonicalId,
        ep.providerId,
        ep.upstreamId,
        ep.apiType,
        ep.isFree ? 1 : 0,
        ep.freeNote,
        now,
        ep.inPrice,
        ep.outPrice,
        ep.mayTrain ? 1 : 0,
        ep.retention,
        ep.approval,
        ep.approval === 'approved' ? 'system_seed' : null,
        ep.approval === 'approved' ? now : null,
        ep.ttft,
        ep.tps,
        ep.quality,
        ep.toolRel,
        now
      );
    }

    // Idempotently upgrade legacy seed Kilo Nemotron row on existing local DBs
    this.db
      .prepare(
        `UPDATE model_endpoints
         SET upstream_model_id = 'nvidia/nemotron-3.5-super-vl:free',
             canonical_id = 'nvidia/nemotron-3.5-super-vl',
             approval_status = CASE WHEN approval_status = 'discovered' THEN 'approved' ELSE approval_status END,
             free_quota_note = 'Kilo :free 多模态视觉理解免密钥通道（开箱即用）',
             updated_at = ?
         WHERE endpoint_id = 'ep_kilo_nemotron_free' AND discovery_source = 'seed'`
      )
      .run(now);

    // Seed 15 Task Policies (A - O)
    const policies: Array<{
      t: AiTaskType;
      wq: number;
      wc: number;
      wl: number;
      wh: number;
      priv: PrivacyMode;
      ttftMax: number;
      paid: boolean;
      minCtx: number;
      vision: boolean;
      tools: boolean;
      json: boolean;
      fam: string[];
    }> = [
      { t: 'A', wq: 0.30, wc: 0.20, wl: 0.35, wh: 0.15, priv: 'no_training', ttftMax: 3500, paid: true, minCtx: 8192, vision: false, tools: false, json: false, fam: ['gemini', 'llama', 'deepseek'] },
      { t: 'B', wq: 0.20, wc: 0.30, wl: 0.38, wh: 0.12, priv: 'no_training', ttftMax: 2500, paid: false, minCtx: 4096, vision: false, tools: false, json: false, fam: ['llama', 'qwen', 'glm'] },
      { t: 'C', wq: 0.55, wc: 0.15, wl: 0.10, wh: 0.20, priv: 'no_training', ttftMax: 8000, paid: true, minCtx: 32768, vision: false, tools: false, json: false, fam: ['deepseek', 'gemini', 'qwen'] },
      { t: 'D', wq: 0.52, wc: 0.18, wl: 0.15, wh: 0.15, priv: 'strict_zdr', ttftMax: 6000, paid: true, minCtx: 32768, vision: false, tools: false, json: false, fam: ['deepseek', 'qwen', 'gemini'] },
      { t: 'E', wq: 0.40, wc: 0.25, wl: 0.25, wh: 0.10, priv: 'no_training', ttftMax: 3500, paid: true, minCtx: 16384, vision: false, tools: false, json: false, fam: ['qwen', 'gemini', 'llama'] },
      { t: 'F', wq: 0.38, wc: 0.22, wl: 0.28, wh: 0.12, priv: 'no_training', ttftMax: 3000, paid: true, minCtx: 16384, vision: false, tools: false, json: false, fam: ['gemini', 'qwen', 'llama'] },
      { t: 'G', wq: 0.35, wc: 0.25, wl: 0.28, wh: 0.12, priv: 'standard', ttftMax: 3500, paid: true, minCtx: 16384, vision: false, tools: false, json: false, fam: ['gemini', 'llama', 'deepseek'] },
      { t: 'H', wq: 0.38, wc: 0.32, wl: 0.15, wh: 0.15, priv: 'no_training', ttftMax: 6500, paid: true, minCtx: 65536, vision: false, tools: false, json: false, fam: ['gemini', 'qwen', 'deepseek'] },
      { t: 'I', wq: 0.50, wc: 0.15, wl: 0.20, wh: 0.15, priv: 'strict_zdr', ttftMax: 5500, paid: true, minCtx: 16384, vision: true, tools: false, json: false, fam: ['gemini', 'qwen'] },
      { t: 'J', wq: 0.35, wc: 0.20, wl: 0.35, wh: 0.10, priv: 'no_training', ttftMax: 2500, paid: true, minCtx: 8192, vision: false, tools: false, json: false, fam: ['gemini'] },
      { t: 'K', wq: 0.45, wc: 0.25, wl: 0.18, wh: 0.12, priv: 'no_training', ttftMax: 4500, paid: true, minCtx: 16384, vision: false, tools: false, json: true, fam: ['deepseek', 'gemini', 'glm'] },
      { t: 'L', wq: 0.48, wc: 0.20, wl: 0.18, wh: 0.14, priv: 'no_training', ttftMax: 5000, paid: true, minCtx: 16384, vision: false, tools: false, json: false, fam: ['deepseek', 'gemini', 'qwen'] },
      { t: 'M', wq: 0.58, wc: 0.12, wl: 0.12, wh: 0.18, priv: 'no_training', ttftMax: 8000, paid: true, minCtx: 32768, vision: false, tools: false, json: false, fam: ['deepseek', 'gemini', 'qwen'] },
      { t: 'N', wq: 0.42, wc: 0.18, wl: 0.28, wh: 0.12, priv: 'no_training', ttftMax: 3000, paid: true, minCtx: 8192, vision: false, tools: true, json: true, fam: ['gemini', 'llama', 'deepseek'] },
      { t: 'O', wq: 0.22, wc: 0.48, wl: 0.15, wh: 0.15, priv: 'strict_zdr', ttftMax: 7000, paid: false, minCtx: 16384, vision: false, tools: false, json: false, fam: ['llama', 'qwen', 'glm'] },
    ];

    const insertPolicy = this.db.prepare(`
      INSERT OR IGNORE INTO ai_routing_policies
        (task_type, label_zh, label_en, weight_quality, weight_cost, weight_latency, weight_health,
         default_privacy_mode, max_first_byte_timeout_ms, allow_paid_endpoints, min_context_length,
         requires_vision, requires_tools, requires_structured_output, preferred_families_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const pol of policies) {
      const meta = TASK_METADATA[pol.t];
      insertPolicy.run(
        pol.t,
        meta.zh,
        meta.en,
        pol.wq,
        pol.wc,
        pol.wl,
        pol.wh,
        pol.priv,
        pol.ttftMax,
        pol.paid ? 1 : 0,
        pol.minCtx,
        pol.vision ? 1 : 0,
        pol.tools ? 1 : 0,
        pol.json ? 1 : 0,
        JSON.stringify(pol.fam),
        now
      );
    }
    // Retire deprecated Gemini 2.5 baseline seeds automatically and ensure baseline Gemini 3/3.8/4 endpoints are active if discovered previously without manual rejection
    this.db.exec(`
      DELETE FROM model_endpoints WHERE endpoint_id IN ('ep_gemini_2_5_flash', 'ep_gemini_2_5_pro');
      DELETE FROM canonical_models
        WHERE canonical_id IN ('google/gemini-2.5-flash', 'google/gemini-2.5-pro')
          AND NOT EXISTS (SELECT 1 FROM model_endpoints WHERE model_endpoints.canonical_id = canonical_models.canonical_id);
      UPDATE canonical_models
        SET supports_images = 1, supports_audio = 1, supports_tools = 1, supports_structured_output = 1, supports_code = 1, context_length = MAX(context_length, 1048576)
        WHERE canonical_id IN ('google/gemini-3-flash-preview', 'google/gemini-3.8-flash', 'google/gemini-4-hydrogen');
    `);
    this.db
      .prepare(
        `UPDATE model_endpoints
         SET approval_status = 'approved',
             api_type = 'gemini_generate',
             is_free_tier = 1,
             data_retention_policy = 'no_training_30d_log',
             may_train_on_prompts = 0,
             health_status = 'healthy',
             cooldown_until = 0,
             consecutive_failures = 0,
             approved_by = 'system_seed',
             approved_at = ?,
             updated_at = ?
         WHERE provider_id = 'gemini'
           AND upstream_model_id IN ('gemini-3-flash-preview', 'gemini-3.8-flash', 'gemini-4-hydrogen')
           AND approval_status = 'discovered'
           AND approved_by IS NULL`
      )
      .run(now, now);
    // Upgrade Kilo gateway base URL on existing databases and keep approved shared free fallback endpoints ready
    this.db
      .prepare(`UPDATE ai_providers SET base_url = 'https://api.kilo.ai/api/gateway', updated_at = ? WHERE id = 'kilo' AND base_url LIKE '%ai-gateway.kilo.ai%'`)
      .run(now);
    this.db
      .prepare(`UPDATE model_endpoints SET approval_status = 'approved', enabled = 1, health_status = 'healthy', cooldown_until = 0, updated_at = ? WHERE endpoint_id IN ('ep_kilo_auto_free', 'ep_kilo_ernie_free') AND approval_status != 'rejected'`)
      .run(now);
    // Clear expired cooldowns on boot so restarted server starts fresh
    this.db.prepare(`UPDATE model_endpoints SET health_status = 'healthy', cooldown_until = 0 WHERE health_status = 'cooldown' AND cooldown_until < ?`).run(Date.now() + 120_000);
  }

  private hydrateCredentialsFromEnv() {
    const isValidEnvSecret = (val: string) =>
      val.length >= 12 && !/^(MY_|YOUR_|TEST|PLACEHOLDER|NONE|NULL|XXX|CHANGEME)/i.test(val);

    // Purge any previously hydrated short placeholder keys (e.g. "x")
    const storedProviders = this.db
      .prepare(`SELECT id, api_key_encrypted FROM ai_providers WHERE api_key_encrypted != ''`)
      .all() as Array<{ id: string; api_key_encrypted: string }>;
    for (const sp of storedProviders) {
      const dec = decryptSecret(sp.api_key_encrypted || '').trim();
      if (!isValidEnvSecret(dec)) {
        this.db
          .prepare(`UPDATE ai_providers SET api_key_encrypted = '', api_key_mask = '未配置', updated_at = ? WHERE id = ?`)
          .run(new Date().toISOString(), sp.id);
      }
    }

    const envMapping: Array<{ providerId: string; keyEnv: string[] }> = [
      { providerId: 'gemini', keyEnv: ['GEMINI_API_KEY'] },
      { providerId: 'groq', keyEnv: ['GROQ_API_KEY'] },
      { providerId: 'cerebras', keyEnv: ['CEREBRAS_API_KEY'] },
      { providerId: 'deepseek', keyEnv: ['DEEPSEEK_API_KEY', 'CUSTOM_API_KEY'] },
      { providerId: 'openrouter', keyEnv: ['OPENROUTER_API_KEY'] },
      { providerId: 'kilo', keyEnv: ['KILO_API_KEY'] },
      { providerId: 'qwen', keyEnv: ['DASHSCOPE_API_KEY', 'QWEN_API_KEY'] },
      { providerId: 'zhipu', keyEnv: ['ZHIPU_API_KEY'] },
      { providerId: 'workers_ai', keyEnv: ['CLOUDFLARE_API_TOKEN'] },
      { providerId: 'huggingface', keyEnv: ['HF_TOKEN', 'HUGGINGFACE_API_KEY'] },
    ];

    for (const item of envMapping) {
      const raw = item.keyEnv
        .map((k) => (process.env[k] || '').trim())
        .find((val) => isValidEnvSecret(val));
      if (!raw) continue;

      const row = this.db
        .prepare('SELECT api_key_encrypted FROM ai_providers WHERE id = ?')
        .get(item.providerId) as { api_key_encrypted?: string } | undefined;

      // Only hydrate from env if DB doesn't already store an admin-edited key
      if (!row?.api_key_encrypted) {
        const extra =
          item.providerId === 'workers_ai' && process.env.CLOUDFLARE_ACCOUNT_ID
            ? JSON.stringify({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID.trim() })
            : '{}';
        this.db
          .prepare(
            `UPDATE ai_providers SET api_key_encrypted = ?, api_key_mask = ?, extra_config_json = ?, updated_at = ? WHERE id = ?`
          )
          .run(encryptSecret(raw), maskApiKey(raw), extra, new Date().toISOString(), item.providerId);
      }
    }
  }

  public listProviders(): ProviderRecord[] {
    const rows = this.db.prepare('SELECT * FROM ai_providers ORDER BY id ASC').all() as any[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      adapterType: r.adapter_type,
      baseUrl: r.base_url,
      apiKeyMask: r.api_key_mask || '未配置',
      hasApiKey: Boolean(r.api_key_encrypted),
      billingMode: r.billing_mode,
      allowPaidOverflow: Boolean(r.allow_paid_overflow),
      dailyUsdCap: Number(r.daily_usd_cap || 0),
      monthlyUsdCap: Number(r.monthly_usd_cap || 0),
      currentDaySpendUsd: Number(r.current_day_spend_usd || 0),
      currentMonthSpendUsd: Number(r.current_month_spend_usd || 0),
      zdrEnabledAccount: Boolean(r.zdr_enabled_account),
      status: r.status,
      notes: r.notes || '',
      updatedAt: r.updated_at,
    }));
  }

  public getProviderWithCreds(providerId: string): (ProviderRecord & { apiKey: string; accountId?: string }) | null {
    const r = this.db.prepare('SELECT * FROM ai_providers WHERE id = ?').get(providerId) as any;
    if (!r) return null;
    let extra: any = {};
    try {
      extra = JSON.parse(r.extra_config_json || '{}');
    } catch {}
    const apiKey = decryptSecret(r.api_key_encrypted || '');
    return {
      id: r.id,
      name: r.name,
      adapterType: r.adapter_type,
      baseUrl: r.base_url,
      apiKeyMask: r.api_key_mask || '未配置',
      hasApiKey: Boolean(apiKey),
      billingMode: r.billing_mode,
      allowPaidOverflow: Boolean(r.allow_paid_overflow),
      dailyUsdCap: Number(r.daily_usd_cap || 0),
      monthlyUsdCap: Number(r.monthly_usd_cap || 0),
      currentDaySpendUsd: Number(r.current_day_spend_usd || 0),
      currentMonthSpendUsd: Number(r.current_month_spend_usd || 0),
      zdrEnabledAccount: Boolean(r.zdr_enabled_account),
      status: r.status,
      notes: r.notes || '',
      updatedAt: r.updated_at,
      apiKey,
      accountId: typeof extra.accountId === 'string' ? extra.accountId : undefined,
    };
  }

  public upsertProviderConfig(input: {
    id: string;
    name?: string;
    adapterType?: ProviderAdapterType;
    baseUrl?: string;
    apiKey?: string;
    billingMode?: BillingMode;
    allowPaidOverflow?: boolean;
    dailyUsdCap?: number;
    monthlyUsdCap?: number;
    zdrEnabledAccount?: boolean;
    status?: 'active' | 'paused';
    notes?: string;
    accountId?: string;
  }) {
    const existing = this.db.prepare('SELECT * FROM ai_providers WHERE id = ?').get(input.id) as any;
    const now = new Date().toISOString();
    if (!existing) {
      const enc = input.apiKey ? encryptSecret(input.apiKey) : '';
      const mask = input.apiKey ? maskApiKey(input.apiKey) : '未配置';
      this.db
        .prepare(
          `INSERT INTO ai_providers
            (id, name, adapter_type, base_url, api_key_encrypted, api_key_mask, extra_config_json,
             billing_mode, allow_paid_overflow, daily_usd_cap, monthly_usd_cap, zdr_enabled_account, status, notes, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.id,
          input.name || input.id,
          input.adapterType || 'openai_compatible',
          input.baseUrl || 'https://api.openai.com/v1',
          enc,
          mask,
          JSON.stringify(input.accountId ? { accountId: input.accountId } : {}),
          input.billingMode || 'free_only',
          input.allowPaidOverflow ? 1 : 0,
          Number(input.dailyUsdCap ?? 0),
          Number(input.monthlyUsdCap ?? 0),
          input.zdrEnabledAccount ? 1 : 0,
          input.status || 'active',
          input.notes || '',
          now
        );
      return;
    }

    const nextEnc = input.apiKey !== undefined ? encryptSecret(input.apiKey) : existing.api_key_encrypted;
    const nextMask = input.apiKey !== undefined ? maskApiKey(input.apiKey) : existing.api_key_mask;
    let extra: any = {};
    try {
      extra = JSON.parse(existing.extra_config_json || '{}');
    } catch {}
    if (input.accountId !== undefined) extra.accountId = input.accountId;

    this.db
      .prepare(
        `UPDATE ai_providers SET
           name = ?, adapter_type = ?, base_url = ?, api_key_encrypted = ?, api_key_mask = ?,
           extra_config_json = ?, billing_mode = ?, allow_paid_overflow = ?,
           daily_usd_cap = ?, monthly_usd_cap = ?, zdr_enabled_account = ?, status = ?, notes = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.name ?? existing.name,
        input.adapterType ?? existing.adapter_type,
        input.baseUrl ?? existing.base_url,
        nextEnc,
        nextMask,
        JSON.stringify(extra),
        input.billingMode ?? existing.billing_mode,
        input.allowPaidOverflow !== undefined ? (input.allowPaidOverflow ? 1 : 0) : existing.allow_paid_overflow,
        input.dailyUsdCap !== undefined ? Number(input.dailyUsdCap) : existing.daily_usd_cap,
        input.monthlyUsdCap !== undefined ? Number(input.monthlyUsdCap) : existing.monthly_usd_cap,
        input.zdrEnabledAccount !== undefined ? (input.zdrEnabledAccount ? 1 : 0) : existing.zdr_enabled_account,
        input.status ?? existing.status,
        input.notes ?? existing.notes,
        now,
        input.id
      );
  }

  public recordProviderSpend(providerId: string, deltaUsd: number) {
    if (!Number.isFinite(deltaUsd) || deltaUsd <= 0) return;
    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    const monthKey = now.toISOString().slice(0, 7);
    const row = this.db.prepare('SELECT spend_day_key, spend_month_key, current_day_spend_usd, current_month_spend_usd FROM ai_providers WHERE id = ?').get(providerId) as any;
    if (!row) return;
    const daySpend = row.spend_day_key === dayKey ? Number(row.current_day_spend_usd || 0) + deltaUsd : deltaUsd;
    const monthSpend = row.spend_month_key === monthKey ? Number(row.current_month_spend_usd || 0) + deltaUsd : deltaUsd;
    this.db
      .prepare(
        `UPDATE ai_providers SET spend_day_key = ?, current_day_spend_usd = ?, spend_month_key = ?, current_month_spend_usd = ?, updated_at = ? WHERE id = ?`
      )
      .run(dayKey, daySpend, monthKey, monthSpend, now.toISOString(), providerId);
  }

  public isProviderWithinBudget(providerId: string): { ok: boolean; reason?: string } {
    const p = this.db.prepare('SELECT * FROM ai_providers WHERE id = ?').get(providerId) as any;
    if (!p) return { ok: false, reason: 'Provider not found' };
    if (p.status !== 'active') return { ok: false, reason: 'Provider paused' };
    if (p.billing_mode === 'free_only' && !p.allow_paid_overflow) return { ok: true };

    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    const monthKey = now.toISOString().slice(0, 7);
    const daySpend = p.spend_day_key === dayKey ? Number(p.current_day_spend_usd || 0) : 0;
    const monthSpend = p.spend_month_key === monthKey ? Number(p.current_month_spend_usd || 0) : 0;

    if (p.daily_usd_cap > 0 && daySpend >= p.daily_usd_cap) {
      return { ok: false, reason: `Daily USD cap reached ($${p.daily_usd_cap})` };
    }
    if (p.monthly_usd_cap > 0 && monthSpend >= p.monthly_usd_cap) {
      return { ok: false, reason: `Monthly USD cap reached ($${p.monthly_usd_cap})` };
    }
    return { ok: true };
  }

  public listCanonicalModels(): CanonicalModelRecord[] {
    const rows = this.db.prepare('SELECT * FROM canonical_models ORDER BY family ASC, display_name ASC').all() as any[];
    return rows.map((r) => ({
      canonicalId: r.canonical_id,
      family: r.family,
      displayName: r.display_name,
      modelVersion: r.model_version,
      category: r.category,
      contextLength: Number(r.context_length),
      maxOutputTokens: Number(r.max_output_tokens),
      supportsStreaming: Boolean(r.supports_streaming),
      supportsImages: Boolean(r.supports_images),
      supportsAudio: Boolean(r.supports_audio),
      supportsVideo: Boolean(r.supports_video),
      supportsTools: Boolean(r.supports_tools),
      supportsStructuredOutput: Boolean(r.supports_structured_output),
      supportsCode: Boolean(r.supports_code),
      supportedLanguages: JSON.parse(r.supported_languages_json || '["zh","en"]'),
      licenseType: r.license_type,
      commercialAllowed: Boolean(r.commercial_allowed),
      officialDocUrl: r.official_doc_url,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  public upsertCanonicalModel(model: Partial<CanonicalModelRecord> & { canonicalId: string; family: string; displayName: string }) {
    const now = new Date().toISOString();
    const existing = this.db.prepare('SELECT * FROM canonical_models WHERE canonical_id = ?').get(model.canonicalId) as any;
    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO canonical_models
            (canonical_id, family, display_name, model_version, category, context_length, max_output_tokens,
             supports_streaming, supports_images, supports_audio, supports_video, supports_tools,
             supports_structured_output, supports_code, supported_languages_json, license_type,
             commercial_allowed, official_doc_url, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          model.canonicalId,
          model.family,
          model.displayName,
          model.modelVersion || 'latest',
          model.category || 'chat',
          model.contextLength || 32768,
          model.maxOutputTokens || 4096,
          model.supportsStreaming === false ? 0 : 1,
          model.supportsImages ? 1 : 0,
          model.supportsAudio ? 1 : 0,
          model.supportsVideo ? 1 : 0,
          model.supportsTools ? 1 : 0,
          model.supportsStructuredOutput ? 1 : 0,
          model.supportsCode === false ? 0 : 1,
          JSON.stringify(model.supportedLanguages || ['zh', 'en']),
          model.licenseType || 'unknown',
          model.commercialAllowed === false ? 0 : 1,
          model.officialDocUrl || '',
          now,
          now
        );
      return;
    }

    this.db
      .prepare(
        `UPDATE canonical_models SET
           context_length = MAX(context_length, ?),
           supports_images = MAX(supports_images, ?),
           supports_audio = MAX(supports_audio, ?),
           supports_tools = MAX(supports_tools, ?),
           supports_structured_output = MAX(supports_structured_output, ?),
           updated_at = ?
         WHERE canonical_id = ?`
      )
      .run(
        model.contextLength || existing.context_length,
        model.supportsImages ? 1 : 0,
        model.supportsAudio ? 1 : 0,
        model.supportsTools ? 1 : 0,
        model.supportsStructuredOutput ? 1 : 0,
        now,
        model.canonicalId
      );
  }

  private mapEndpointRow(r: any): ModelEndpointRecord {
    return {
      endpointId: r.endpoint_id,
      canonicalId: r.canonical_id,
      providerId: r.provider_id,
      upstreamModelId: r.upstream_model_id,
      apiType: r.api_type,
      isFreeTier: Boolean(r.is_free_tier),
      freeQuotaNote: r.free_quota_note || '',
      freeQuotaUpdatedAt: r.free_quota_updated_at || '',
      inputPricePer1m: Number(r.input_price_per_1m || 0),
      outputPricePer1m: Number(r.output_price_per_1m || 0),
      mayTrainOnPrompts: Boolean(r.may_train_on_prompts),
      dataRetentionPolicy: r.data_retention_policy,
      regionRouting: r.region_routing,
      approvalStatus: r.approval_status,
      approvedBy: r.approved_by,
      approvedAt: r.approved_at,
      healthStatus: r.health_status,
      cooldownUntil: Number(r.cooldown_until || 0),
      consecutiveFailures: Number(r.consecutive_failures || 0),
      avgTtftMs: Number(r.avg_ttft_ms || 900),
      avgTps: Number(r.avg_tps || 40),
      qualityScore: Number(r.quality_score || 72),
      toolReliabilityScore: Number(r.tool_reliability_score || 75),
      lastTestedAt: r.last_tested_at,
      lastErrorCategory: r.last_error_category,
      lastErrorMessage: r.last_error_message,
      discoverySource: r.discovery_source,
      enabled: Boolean(r.enabled),
      updatedAt: r.updated_at,
    };
  }

  public listEndpoints(filter?: { approvalStatus?: ApprovalStatus; providerId?: string }): ModelEndpointRecord[] {
    let sql = 'SELECT * FROM model_endpoints WHERE 1=1';
    const params: any[] = [];
    if (filter?.approvalStatus) {
      sql += ' AND approval_status = ?';
      params.push(filter.approvalStatus);
    }
    if (filter?.providerId) {
      sql += ' AND provider_id = ?';
      params.push(filter.providerId);
    }
    sql += ' ORDER BY quality_score DESC, avg_ttft_ms ASC';
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((r) => this.mapEndpointRow(r));
  }

  public getEndpoint(endpointId: string): ModelEndpointRecord | null {
    const r = this.db.prepare('SELECT * FROM model_endpoints WHERE endpoint_id = ?').get(endpointId) as any;
    return r ? this.mapEndpointRow(r) : null;
  }

  public upsertDiscoveredEndpoint(input: {
    endpointId: string;
    canonicalId: string;
    providerId: string;
    upstreamModelId: string;
    apiType?: ModelEndpointRecord['apiType'];
    isFreeTier: boolean;
    freeQuotaNote?: string;
    inputPricePer1m: number;
    outputPricePer1m: number;
    mayTrainOnPrompts: boolean;
    dataRetentionPolicy: DataRetentionPolicy;
    discoverySource: string;
  }): { inserted: boolean } {
    const existing = this.db
      .prepare('SELECT endpoint_id FROM model_endpoints WHERE provider_id = ? AND upstream_model_id = ?')
      .get(input.providerId, input.upstreamModelId) as { endpoint_id?: string } | undefined;
    const now = new Date().toISOString();

    if (!existing) {
      // Strictly 'discovered' — NEVER auto-approved into production
      this.db
        .prepare(
          `INSERT INTO model_endpoints
            (endpoint_id, canonical_id, provider_id, upstream_model_id, api_type, is_free_tier,
             free_quota_note, free_quota_updated_at, input_price_per_1m, output_price_per_1m,
             may_train_on_prompts, data_retention_policy, approval_status, health_status,
             discovery_source, enabled, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'discovered', 'healthy', ?, 1, ?)`
        )
        .run(
          input.endpointId,
          input.canonicalId,
          input.providerId,
          input.upstreamModelId,
          input.apiType || 'openai_chat',
          input.isFreeTier ? 1 : 0,
          input.freeQuotaNote || '',
          now,
          input.inputPricePer1m,
          input.outputPricePer1m,
          input.mayTrainOnPrompts ? 1 : 0,
          input.dataRetentionPolicy,
          input.discoverySource,
          now
        );
      return { inserted: true };
    }

    // Update dynamic pricing/privacy signals without touching approval_status
    this.db
      .prepare(
        `UPDATE model_endpoints SET
           is_free_tier = ?, free_quota_note = CASE WHEN ? != '' THEN ? ELSE free_quota_note END,
           free_quota_updated_at = ?, input_price_per_1m = ?, output_price_per_1m = ?,
           may_train_on_prompts = ?, data_retention_policy = ?, updated_at = ?
         WHERE endpoint_id = ?`
      )
      .run(
        input.isFreeTier ? 1 : 0,
        input.freeQuotaNote || '',
        input.freeQuotaNote || '',
        now,
        input.inputPricePer1m,
        input.outputPricePer1m,
        input.mayTrainOnPrompts ? 1 : 0,
        input.dataRetentionPolicy,
        now,
        existing.endpoint_id!
      );
    return { inserted: false };
  }

  public updateEndpointApproval(
    endpointId: string,
    status: ApprovalStatus,
    adminId: string | null,
    enabled?: boolean
  ) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE model_endpoints SET
           approval_status = ?,
           approved_by = COALESCE(?, approved_by),
           approved_at = CASE WHEN ? = 'approved' THEN ? ELSE approved_at END,
           enabled = COALESCE(?, enabled),
           updated_at = ?
         WHERE endpoint_id = ?`
      )
      .run(status, adminId, status, now, enabled === undefined ? null : enabled ? 1 : 0, now, endpointId);
  }

  public reassignEndpointCanonical(endpointId: string, canonicalId: string) {
    this.db
      .prepare('UPDATE model_endpoints SET canonical_id = ?, updated_at = ? WHERE endpoint_id = ?')
      .run(canonicalId, new Date().toISOString(), endpointId);
  }

  public recordEndpointTelemetry(
    endpointId: string,
    result: {
      ok: boolean;
      ttftMs?: number;
      tps?: number;
      errorCategory?: ErrorCategory;
      errorMessage?: string;
      cooldownMs?: number;
      markOffline?: boolean;
      toolSuccess?: boolean;
    }
  ) {
    const r = this.db.prepare('SELECT * FROM model_endpoints WHERE endpoint_id = ?').get(endpointId) as any;
    if (!r) return;
    const nowIso = new Date().toISOString();

    if (result.ok) {
      const nextTtft = result.ttftMs
        ? Math.round(Number(r.avg_ttft_ms || 800) * 0.7 + result.ttftMs * 0.3)
        : Number(r.avg_ttft_ms || 800);
      const nextTps = result.tps
        ? Math.round((Number(r.avg_tps || 40) * 0.7 + result.tps * 0.3) * 10) / 10
        : Number(r.avg_tps || 40);
      const nextTool =
        result.toolSuccess === undefined
          ? Number(r.tool_reliability_score || 75)
          : result.toolSuccess
            ? Math.min(100, Number(r.tool_reliability_score || 75) + 1)
            : Math.max(20, Number(r.tool_reliability_score || 75) - 6);

      this.db
        .prepare(
          `UPDATE model_endpoints SET
             health_status = 'healthy',
             cooldown_until = 0,
             consecutive_failures = 0,
             avg_ttft_ms = ?,
             avg_tps = ?,
             tool_reliability_score = ?,
             last_tested_at = ?,
             last_error_category = NULL,
             last_error_message = NULL,
             updated_at = ?
           WHERE endpoint_id = ?`
        )
        .run(nextTtft, nextTps, nextTool, nowIso, nowIso, endpointId);
      return;
    }

    const failures = Number(r.consecutive_failures || 0) + 1;
    const cooldownUntil = result.cooldownMs ? Date.now() + result.cooldownMs : Date.now() + Math.min(300_000, 15_000 * Math.pow(2, Math.min(4, failures - 1)));
    const nextHealth: HealthStatus = result.markOffline
      ? 'offline'
      : failures >= 3
        ? 'degraded'
        : 'cooldown';
    const nextTool =
      result.errorCategory === 'schema_invalid'
        ? Math.max(15, Number(r.tool_reliability_score || 75) - 10)
        : Number(r.tool_reliability_score || 75);

    this.db
      .prepare(
        `UPDATE model_endpoints SET
           health_status = ?,
           cooldown_until = ?,
           consecutive_failures = ?,
           tool_reliability_score = ?,
           last_tested_at = ?,
           last_error_category = ?,
           last_error_message = ?,
           updated_at = ?
         WHERE endpoint_id = ?`
      )
      .run(
        nextHealth,
        cooldownUntil,
        failures,
        nextTool,
        nowIso,
        result.errorCategory || 'network_error',
        (result.errorMessage || '').slice(0, 400),
        nowIso,
        endpointId
      );
  }

  public updateEndpointQualityScore(endpointId: string, score: number, statusOverride?: ApprovalStatus) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE model_endpoints SET
           quality_score = ?,
           last_tested_at = ?,
           approval_status = COALESCE(?, approval_status),
           updated_at = ?
         WHERE endpoint_id = ?`
      )
      .run(score, now, statusOverride || null, now, endpointId);
  }

  public listRoutingPolicies(): RoutingPolicyRecord[] {
    const rows = this.db.prepare('SELECT * FROM ai_routing_policies ORDER BY task_type ASC').all() as any[];
    return rows.map((r) => ({
      taskType: r.task_type,
      labelZh: r.label_zh,
      labelEn: r.label_en,
      weightQuality: Number(r.weight_quality),
      weightCost: Number(r.weight_cost),
      weightLatency: Number(r.weight_latency),
      weightHealth: Number(r.weight_health),
      defaultPrivacyMode: r.default_privacy_mode,
      maxFirstByteTimeoutMs: Number(r.max_first_byte_timeout_ms),
      allowPaidEndpoints: Boolean(r.allow_paid_endpoints),
      minContextLength: Number(r.min_context_length),
      requiresVision: Boolean(r.requires_vision),
      requiresTools: Boolean(r.requires_tools),
      requiresStructuredOutput: Boolean(r.requires_structured_output),
      preferredFamilies: JSON.parse(r.preferred_families_json || '[]'),
      updatedAt: r.updated_at,
    }));
  }

  public getRoutingPolicy(taskType: AiTaskType): RoutingPolicyRecord {
    const r = this.db.prepare('SELECT * FROM ai_routing_policies WHERE task_type = ?').get(taskType) as any;
    if (!r) {
      return this.listRoutingPolicies()[0];
    }
    return {
      taskType: r.task_type,
      labelZh: r.label_zh,
      labelEn: r.label_en,
      weightQuality: Number(r.weight_quality),
      weightCost: Number(r.weight_cost),
      weightLatency: Number(r.weight_latency),
      weightHealth: Number(r.weight_health),
      defaultPrivacyMode: r.default_privacy_mode,
      maxFirstByteTimeoutMs: Number(r.max_first_byte_timeout_ms),
      allowPaidEndpoints: Boolean(r.allow_paid_endpoints),
      minContextLength: Number(r.min_context_length),
      requiresVision: Boolean(r.requires_vision),
      requiresTools: Boolean(r.requires_tools),
      requiresStructuredOutput: Boolean(r.requires_structured_output),
      preferredFamilies: JSON.parse(r.preferred_families_json || '[]'),
      updatedAt: r.updated_at,
    };
  }

  public updateRoutingPolicy(
    taskType: AiTaskType,
    patch: Partial<{
      weightQuality: number;
      weightCost: number;
      weightLatency: number;
      weightHealth: number;
      defaultPrivacyMode: PrivacyMode;
      maxFirstByteTimeoutMs: number;
      allowPaidEndpoints: boolean;
    }>
  ) {
    const cur = this.getRoutingPolicy(taskType);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE ai_routing_policies SET
           weight_quality = ?, weight_cost = ?, weight_latency = ?, weight_health = ?,
           default_privacy_mode = ?, max_first_byte_timeout_ms = ?, allow_paid_endpoints = ?, updated_at = ?
         WHERE task_type = ?`
      )
      .run(
        patch.weightQuality ?? cur.weightQuality,
        patch.weightCost ?? cur.weightCost,
        patch.weightLatency ?? cur.weightLatency,
        patch.weightHealth ?? cur.weightHealth,
        patch.defaultPrivacyMode ?? cur.defaultPrivacyMode,
        patch.maxFirstByteTimeoutMs ?? cur.maxFirstByteTimeoutMs,
        patch.allowPaidEndpoints !== undefined ? (patch.allowPaidEndpoints ? 1 : 0) : cur.allowPaidEndpoints ? 1 : 0,
        now,
        taskType
      );
  }

  public recordUsageLedger(entry: UsageLedgerRecord) {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO ai_usage_ledger
          (request_id, idempotency_key, user_id, user_tier, task_type, privacy_mode,
           selected_endpoint_id, fallback_chain_json, failover_count, input_tokens,
           output_tokens, estimated_cost_usd, ttft_ms, total_ms, status, error_category, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.requestId,
        entry.idempotencyKey,
        entry.userId,
        entry.userTier,
        entry.taskType,
        entry.privacyMode,
        entry.selectedEndpointId,
        entry.fallbackChainJson,
        entry.failoverCount,
        entry.inputTokens,
        entry.outputTokens,
        entry.estimatedCostUsd,
        entry.ttftMs,
        entry.totalMs,
        entry.status,
        entry.errorCategory,
        entry.createdAt
      );
  }

  public getUserDailyUsageCount(subjectKey: string): { requestsToday: number; tokensToday: number } {
    const dayPrefix = new Date().toISOString().slice(0, 10);
    const r = this.db
      .prepare(
        `SELECT COUNT(*) AS cnt, COALESCE(SUM(input_tokens + output_tokens), 0) AS toks
         FROM ai_usage_ledger
         WHERE user_id = ? AND created_at >= ? AND status IN ('success', 'degraded')`
      )
      .get(subjectKey, `${dayPrefix}T00:00:00`) as any;
    return {
      requestsToday: Number(r?.cnt || 0),
      tokensToday: Number(r?.toks || 0),
    };
  }

  public listRecentLedger(limit = 50): UsageLedgerRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM ai_usage_ledger ORDER BY created_at DESC LIMIT ?')
      .all(limit) as any[];
    return rows.map((r) => ({
      requestId: r.request_id,
      idempotencyKey: r.idempotency_key,
      userId: r.user_id,
      userTier: r.user_tier as UserTier,
      taskType: r.task_type,
      privacyMode: r.privacy_mode,
      selectedEndpointId: r.selected_endpoint_id,
      fallbackChainJson: r.fallback_chain_json,
      failoverCount: Number(r.failover_count || 0),
      inputTokens: Number(r.input_tokens || 0),
      outputTokens: Number(r.output_tokens || 0),
      estimatedCostUsd: Number(r.estimated_cost_usd || 0),
      ttftMs: Number(r.ttft_ms || 0),
      totalMs: Number(r.total_ms || 0),
      status: r.status,
      errorCategory: r.error_category,
      createdAt: r.created_at,
    }));
  }

  public recordEvaluation(evalRec: EvaluationRunRecord) {
    this.db
      .prepare(
        `INSERT INTO ai_model_evaluations
          (id, endpoint_id, suite_version, overall_score, coding_score, reasoning_score,
           json_schema_score, multilingual_score, avg_ttft_ms, passed_cases, total_cases, run_at, report_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        evalRec.id,
        evalRec.endpointId,
        evalRec.suiteVersion,
        evalRec.overallScore,
        evalRec.codingScore,
        evalRec.reasoningScore,
        evalRec.jsonSchemaScore,
        evalRec.multilingualScore,
        evalRec.avgTtftMs,
        evalRec.passedCases,
        evalRec.totalCases,
        evalRec.runAt,
        evalRec.reportJson
      );
  }

  public listEvaluations(limit = 40): EvaluationRunRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM ai_model_evaluations ORDER BY run_at DESC LIMIT ?')
      .all(limit) as any[];
    return rows.map((r) => ({
      id: r.id,
      endpointId: r.endpoint_id,
      suiteVersion: r.suite_version,
      overallScore: Number(r.overall_score),
      codingScore: Number(r.coding_score),
      reasoningScore: Number(r.reasoning_score),
      jsonSchemaScore: Number(r.json_schema_score),
      multilingualScore: Number(r.multilingual_score),
      avgTtftMs: Number(r.avg_ttft_ms),
      passedCases: Number(r.passed_cases),
      totalCases: Number(r.total_cases),
      runAt: r.run_at,
      reportJson: r.report_json,
    }));
  }

  public recordDiscoveryRun(run: DiscoveryRunRecord) {
    this.db
      .prepare(
        `INSERT INTO ai_discovery_runs
          (run_id, source_name, models_fetched, new_endpoints_found, deprecated_marked, status, error_log, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        run.runId,
        run.sourceName,
        run.modelsFetched,
        run.newEndpointsFound,
        run.deprecatedMarked,
        run.status,
        run.errorLog,
        run.startedAt,
        run.finishedAt
      );
  }

  public listDiscoveryRuns(limit = 20): DiscoveryRunRecord[] {
    const rows = this.db.prepare('SELECT * FROM ai_discovery_runs ORDER BY started_at DESC LIMIT ?').all(limit) as any[];
    return rows.map((r) => ({
      runId: r.run_id,
      sourceName: r.source_name,
      modelsFetched: Number(r.models_fetched),
      newEndpointsFound: Number(r.new_endpoints_found),
      deprecatedMarked: Number(r.deprecated_marked),
      status: r.status,
      errorLog: r.error_log,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
    }));
  }

  public recordAdminAudit(adminUserId: string, action: string, target: string, detail: Record<string, unknown> = {}) {
    const id = `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    this.db
      .prepare('INSERT INTO ai_admin_audit_logs (id, admin_user_id, action, target, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, adminUserId, action, target, JSON.stringify(detail), new Date().toISOString());
  }

  public listAdminAuditLogs(limit = 50) {
    return this.db
      .prepare('SELECT * FROM ai_admin_audit_logs ORDER BY created_at DESC LIMIT ?')
      .all(limit) as any[];
  }

  public getOverviewMetrics() {
    const dayPrefix = new Date().toISOString().slice(0, 10);
    const todayStats = this.db
      .prepare(
        `SELECT
           COUNT(*) AS totalRequests,
           SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successCount,
           SUM(CASE WHEN failover_count > 0 THEN 1 ELSE 0 END) AS failoverCount,
           COALESCE(AVG(NULLIF(ttft_ms, 0)), 0) AS avgTtftMs,
           COALESCE(SUM(estimated_cost_usd), 0) AS todayCostUsd,
           COALESCE(SUM(input_tokens + output_tokens), 0) AS todayTokens
         FROM ai_usage_ledger WHERE created_at >= ?`
      )
      .get(`${dayPrefix}T00:00:00`) as any;

    const endpointCounts = this.db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN approval_status = 'approved' AND enabled = 1 THEN 1 ELSE 0 END) AS approved,
           SUM(CASE WHEN approval_status = 'discovered' THEN 1 ELSE 0 END) AS discovered,
           SUM(CASE WHEN approval_status = 'verified' THEN 1 ELSE 0 END) AS verified,
           SUM(CASE WHEN health_status IN ('cooldown', 'degraded', 'offline') THEN 1 ELSE 0 END) AS unhealthy
         FROM model_endpoints`
      )
      .get() as any;

    return {
      todayRequests: Number(todayStats?.totalRequests || 0),
      todaySuccess: Number(todayStats?.successCount || 0),
      todayFailovers: Number(todayStats?.failoverCount || 0),
      avgTtftMs: Math.round(Number(todayStats?.avgTtftMs || 0)),
      todayCostUsd: Number(Number(todayStats?.todayCostUsd || 0).toFixed(6)),
      todayTokens: Number(todayStats?.todayTokens || 0),
      endpoints: {
        total: Number(endpointCounts?.total || 0),
        approved: Number(endpointCounts?.approved || 0),
        discovered: Number(endpointCounts?.discovered || 0),
        verified: Number(endpointCounts?.verified || 0),
        unhealthy: Number(endpointCounts?.unhealthy || 0),
      },
    };
  }

  // ---- Unified Agent Task Session & Confirmation Gate Persistence ----
  public upsertAgentSession(session: {
    sessionId: string;
    userId: string;
    status: 'running' | 'paused' | 'awaiting_confirmation' | 'completed' | 'failed';
    intentSummary: string;
    module: string;
    steps: unknown[];
    payload?: Record<string, unknown>;
    result?: Record<string, unknown> | null;
    errorMessage?: string | null;
  }) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO agent_task_sessions
          (session_id, user_id, status, intent_summary, module, steps_json, payload_json, result_json, error_message, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
          status = excluded.status,
          intent_summary = excluded.intent_summary,
          module = excluded.module,
          steps_json = excluded.steps_json,
          payload_json = excluded.payload_json,
          result_json = excluded.result_json,
          error_message = excluded.error_message,
          updated_at = excluded.updated_at`
      )
      .run(
        session.sessionId,
        session.userId,
        session.status,
        session.intentSummary,
        session.module,
        JSON.stringify(session.steps || []),
        JSON.stringify(session.payload || {}),
        session.result ? JSON.stringify(session.result) : null,
        session.errorMessage || null,
        now,
        now
      );
  }

  public getAgentSession(sessionId: string) {
    const r = this.db.prepare('SELECT * FROM agent_task_sessions WHERE session_id = ?').get(sessionId) as any;
    if (!r) return null;
    return {
      sessionId: String(r.session_id),
      userId: String(r.user_id),
      status: String(r.status),
      intentSummary: String(r.intent_summary),
      module: String(r.module),
      steps: JSON.parse(r.steps_json || '[]'),
      payload: JSON.parse(r.payload_json || '{}'),
      result: r.result_json ? JSON.parse(r.result_json) : null,
      errorMessage: r.error_message ? String(r.error_message) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  public getLatestPausedOrActiveAgentSession(userId: string) {
    const r = this.db
      .prepare(
        `SELECT * FROM agent_task_sessions
         WHERE user_id = ? AND status IN ('paused', 'awaiting_confirmation', 'running')
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get(userId) as any;
    if (!r) return null;
    return this.getAgentSession(String(r.session_id));
  }

  public listRecentAgentSessions(userId: string, limit = 12) {
    const rows = this.db
      .prepare('SELECT * FROM agent_task_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?')
      .all(userId, limit) as any[];
    return rows.map((r) => ({
      sessionId: String(r.session_id),
      userId: String(r.user_id),
      status: String(r.status),
      intentSummary: String(r.intent_summary),
      module: String(r.module),
      steps: JSON.parse(r.steps_json || '[]'),
      payload: JSON.parse(r.payload_json || '{}'),
      result: r.result_json ? JSON.parse(r.result_json) : null,
      errorMessage: r.error_message ? String(r.error_message) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  public createPendingConfirmation(item: {
    confirmToken: string;
    sessionId: string;
    userId: string;
    actionType: string;
    targetId: string;
    summary: string;
    preview: Record<string, unknown>;
    ttlMs?: number;
  }) {
    const now = new Date();
    const exp = new Date(now.getTime() + (item.ttlMs || 15 * 60_000));
    this.db
      .prepare(
        `INSERT INTO agent_pending_confirmations
          (confirm_token, session_id, user_id, action_type, target_id, summary, preview_json, status, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
      )
      .run(
        item.confirmToken,
        item.sessionId,
        item.userId,
        item.actionType,
        item.targetId,
        item.summary,
        JSON.stringify(item.preview || {}),
        exp.toISOString(),
        now.toISOString()
      );
  }

  public getPendingConfirmation(confirmToken: string) {
    const r = this.db
      .prepare('SELECT * FROM agent_pending_confirmations WHERE confirm_token = ?')
      .get(confirmToken) as any;
    if (!r) return null;
    return {
      confirmToken: String(r.confirm_token),
      sessionId: String(r.session_id),
      userId: String(r.user_id),
      actionType: String(r.action_type),
      targetId: String(r.target_id),
      summary: String(r.summary),
      preview: JSON.parse(r.preview_json || '{}'),
      status: String(r.status),
      expiresAt: String(r.expires_at),
      createdAt: String(r.created_at),
    };
  }

  public resolvePendingConfirmation(confirmToken: string, status: 'confirmed' | 'cancelled' | 'expired') {
    this.db
      .prepare('UPDATE agent_pending_confirmations SET status = ? WHERE confirm_token = ?')
      .run(status, confirmToken);
  }
}

export const oneAiDb = new OneAiDatabase();
