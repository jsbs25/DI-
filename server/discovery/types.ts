/**
 * EARTH ONE - Global Discovery Engine & Intelligent Search
 * Core Type Definitions
 */

export type PlanetId =
  | 'sun'       // 人工智能与智能工具 (AI models, dialog, generation, coding, productivity)
  | 'earth'     // 现实生活与全球服务 (Social, travel, maps, lifestyle, transport)
  | 'moon'      // 教育与在线学习 (Universities, courses, languages, pedagogy, learning tools)
  | 'jupiter'   // 全球互联网与智能浏览 (Websites, search engines, web tools, native browser)
  | 'saturn'    // 影视与影音文化 (Movies, series, anime, documentaries, ratings, Bilibili/YouTube)
  | 'mars'      // 软件、游戏与数字应用 (Apps, desktop software, open source tools, games)
  | 'neptune'   // 全球数字图书馆与古典文献 (Books, papers, public domain, classics, literature)
  | 'venus'     // 艺术、音乐与视觉创作 (Music, art, photography, design assets, typography)
  | 'mercury'   // 全球即时资讯与宏观数据 (World news, tech news, financial data, official reports)
  | 'uranus';   // 科技前沿与开源生态 (GitHub repos, research tools, datasets, dev communities)

export type ResourceType =
  | 'website'
  | 'tool'
  | 'book'
  | 'video'
  | 'music'
  | 'course'
  | 'software'
  | 'game'
  | 'research'
  | 'dataset'
  | 'news'
  | 'art';

export type CopyrightStatus =
  | 'public_domain'   // 公版自由使用
  | 'open_access'     // 开放获取 (CC 许可、开源协议)
  | 'official'        // 官方授权/官方平台入口
  | 'fair_use'        // 元数据与摘要展示
  | 'proprietary'     // 商业专属
  | 'unknown';

export type AccessType =
  | 'open'            // 完全公开免注册
  | 'free_reg'        // 免费需注册
  | 'freemium'        // 基础免费+增值
  | 'paid'            // 付费服务
  | 'library_card'    // 需图书馆/学术账号
  | 'unknown';

export type ResourceStatus =
  | 'active'          // 正常在线
  | 'dead'            // 链接失效 (404/410/DNS失败)
  | 'pending'         // 待审核/待确认
  | 'restricted';     // 访问受限

export interface PlanetMapping {
  planetId: PlanetId;
  category: string;
  tags: string[];
  isPrimary: boolean;
}

export interface ResourceItem {
  id: string;
  canonicalUrl: string;       // 规范化 URL 唯一指纹，用于去重
  url: string;                // 原始完整链接
  domain: string;             // 域名 (如 openlibrary.org)
  name: string;               // 资源名称 / 网站标题 / 书名 / 片名
  description: string;        // 资源摘要 / 简介
  resourceType: ResourceType; // 资源形态
  primaryPlanet: PlanetId;    // 主要所属星球
  planets: PlanetId[];        // 所有映射到的星球列表
  category: string;           // 细分分类
  tags: string[];             // 关键词标签
  language: string;           // 语言 (zh, en, ar, etc.)
  country?: string;           // 来源国家或地区
  icon?: string;              // 网站 Favicon 或封面海报
  source: string;             // 采集来源标识 (如 'rss:techcrunch', 'api:openlibrary', 'manual', 'crawler:web')
  copyrightStatus: CopyrightStatus;
  accessType: AccessType;
  qualityScore: number;       // 质量评分 (0-100)
  status: ResourceStatus;     // 状态 (active, dead, pending)
  httpStatus: number;         // 最近 HTTP 状态码 (200, 404, etc.)
  lastCheckedAt: number;      // 上次健康探测时间戳
  createdAt: number;          // 收录时间戳
  updatedAt: number;          // 更新时间戳
  extraMeta?: Record<string, any>; // 扩展元数据 (如作者、年份、时长、清晰度、EPUB链接等)
}

export interface CrawlSource {
  id: string;
  name: string;
  url: string;
  sourceType: 'rss' | 'api' | 'directory' | 'web';
  targetPlanet: PlanetId;
  defaultCategory: string;
  intervalMinutes: number;    // 采集间隔 (分钟)
  lastCrawlTime?: number;
  lastStatus?: 'success' | 'failed' | 'running';
  totalCollected: number;
  enabled: boolean;
}

export interface CrawlLog {
  id: string;
  sourceId: string;
  sourceName: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'success' | 'failed';
  itemsFound: number;
  itemsAdded: number;
  itemsUpdated: number;
  errorMessage?: string;
}

export interface SearchQuery {
  q: string;
  planet?: PlanetId;
  category?: string;
  resourceType?: ResourceType;
  accessType?: AccessType;
  language?: string;
  page?: number;
  limit?: number;
  includeExternal?: boolean;  // 当本地不足时是否穿透外部搜索
  useAiIntent?: boolean;      // 是否开启本地 AI 自然语言意图理解
}

export interface AIIntentResult {
  originalQuery: string;
  targetPlanet: PlanetId;
  suggestedKeywords: string[];
  extractedCategory?: string;
  isFreePreferred?: boolean;
  languageFilter?: string;
  reasoning: string;
}

export interface SearchResponse {
  success: boolean;
  query: string;
  total: number;
  page: number;
  limit: number;
  items: ResourceItem[];
  searchLayer: 'local_fts' | 'external_open' | 'hybrid';
  aiIntent?: AIIntentResult;
  aiSummary?: string;
}
