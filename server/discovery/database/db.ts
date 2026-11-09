/**
 * EARTH ONE - Unified Resource Database
 * Built using native node:sqlite with WAL mode and FTS5 full-text indexing.
 * Zero external binary dependencies, high performance, single local file.
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import {
  ResourceItem,
  PlanetId,
  ResourceType,
  AccessType,
  CopyrightStatus,
  ResourceStatus,
  SearchQuery,
  CrawlSource,
  CrawlLog
} from '../types.ts';
import { normalizeCanonicalUrl, generateResourceId } from '../deduplication/urlNormalizer.ts';

const DB_DIR = path.resolve(process.cwd(), 'server_data');
const DB_PATH = path.join(DB_DIR, 'discovery.db');

export class DiscoveryDatabase {
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
    this.seedInitialResources();
  }

  private initPragmas() {
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  private initTables() {
    // 1. Core Resources Master Table (Single entity per unique website/resource)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS resources (
        id TEXT PRIMARY KEY,
        canonical_url TEXT UNIQUE NOT NULL,
        url TEXT NOT NULL,
        domain TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        resource_type TEXT NOT NULL DEFAULT 'website',
        primary_planet TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        tags_json TEXT NOT NULL DEFAULT '[]',
        language TEXT NOT NULL DEFAULT 'zh',
        country TEXT,
        icon TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        copyright_status TEXT NOT NULL DEFAULT 'open_access',
        access_type TEXT NOT NULL DEFAULT 'open',
        quality_score INTEGER NOT NULL DEFAULT 70,
        status TEXT NOT NULL DEFAULT 'active',
        http_status INTEGER NOT NULL DEFAULT 200,
        last_checked_at INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        extra_meta_json TEXT NOT NULL DEFAULT '{}'
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_resources_domain ON resources (domain);
      CREATE INDEX IF NOT EXISTS idx_resources_primary_planet ON resources (primary_planet);
      CREATE INDEX IF NOT EXISTS idx_resources_type ON resources (resource_type);
      CREATE INDEX IF NOT EXISTS idx_resources_status ON resources (status);
    `);

    // 2. Many-to-Many Planet Association Table (One resource can belong to multiple planets)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS resource_planets (
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        planet_id TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        tags_json TEXT NOT NULL DEFAULT '[]',
        is_primary INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (resource_id, planet_id)
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_rp_planet_category ON resource_planets (planet_id, category);
    `);

    // 3. FTS5 Full-Text Virtual Table (High speed matching across title, desc, domain, tags)
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS resources_fts USING fts5(
        id UNINDEXED,
        name,
        description,
        domain,
        tags,
        category,
        tokenize = 'unicode61'
      );
    `);

    // 4. Crawl Sources Table (RSS, Open APIs, Seed directories)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS crawl_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        source_type TEXT NOT NULL,
        target_planet TEXT NOT NULL,
        default_category TEXT NOT NULL,
        interval_minutes INTEGER NOT NULL DEFAULT 120,
        last_crawl_time INTEGER,
        last_status TEXT,
        total_collected INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1
      );
    `);

    // 5. Crawl Logs Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS crawl_logs (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        source_name TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        status TEXT NOT NULL,
        items_found INTEGER NOT NULL DEFAULT 0,
        items_added INTEGER NOT NULL DEFAULT 0,
        items_updated INTEGER NOT NULL DEFAULT 0,
        error_message TEXT
      );
    `);
  }

  /**
   * Insert or update a resource with strict deduplication.
   * If the canonical URL already exists, merges planet associations & updates timestamp.
   */
  public insertOrUpdateResource(data: {
    url: string;
    name: string;
    description?: string;
    resourceType?: ResourceType;
    primaryPlanet: PlanetId;
    planets?: PlanetId[];
    category?: string;
    tags?: string[];
    language?: string;
    country?: string;
    icon?: string;
    source?: string;
    copyrightStatus?: CopyrightStatus;
    accessType?: AccessType;
    qualityScore?: number;
    extraMeta?: Record<string, any>;
  }): { resource: ResourceItem; isNew: boolean } {
    const norm = normalizeCanonicalUrl(data.url);
    if (!norm.isValid) {
      throw new Error(`Invalid URL format: ${data.url}`);
    }

    const now = Date.now();
    const existing = this.getResourceByCanonicalUrl(norm.canonicalUrl);

    const resourceId = existing ? existing.id : generateResourceId(norm.canonicalUrl);
    const planets = Array.from(new Set([data.primaryPlanet, ...(data.planets || existing?.planets || [])]));
    const tags = Array.from(new Set([...(data.tags || []), ...(existing?.tags || [])]));
    const category = data.category || existing?.category || 'general';
    const description = (data.description || existing?.description || '').trim();
    const resourceType = data.resourceType || existing?.resourceType || 'website';
    const language = data.language || existing?.language || 'zh';
    const icon = data.icon || existing?.icon || norm.faviconUrl;
    const source = data.source || existing?.source || 'manual';
    const copyrightStatus = data.copyrightStatus || existing?.copyrightStatus || 'open_access';
    const accessType = data.accessType || existing?.accessType || 'open';
    const qualityScore = data.qualityScore ?? (existing?.qualityScore ?? 75);
    const extraMeta = { ...(existing?.extraMeta || {}), ...(data.extraMeta || {}) };

    if (!existing) {
      // 1. Insert master record
      const stmt = this.db.prepare(`
        INSERT INTO resources (
          id, canonical_url, url, domain, name, description,
          resource_type, primary_planet, category, tags_json,
          language, country, icon, source, copyright_status,
          access_type, quality_score, status, http_status,
          last_checked_at, created_at, updated_at, extra_meta_json
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, 'active', 200,
          ?, ?, ?, ?
        )
      `);
      stmt.run(
        resourceId,
        norm.canonicalUrl,
        data.url,
        norm.domain,
        data.name.trim(),
        description,
        resourceType,
        data.primaryPlanet,
        category,
        JSON.stringify(tags),
        language,
        data.country || null,
        icon,
        source,
        copyrightStatus,
        accessType,
        qualityScore,
        now,
        now,
        now,
        JSON.stringify(extraMeta)
      );

      // 2. Insert into FTS5
      try {
        const ftsStmt = this.db.prepare(`
          INSERT INTO resources_fts (id, name, description, domain, tags, category)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        ftsStmt.run(resourceId, data.name.trim(), description, norm.domain, tags.join(' '), category);
      } catch (err) {
        console.warn('FTS index insert failed:', err);
      }

      // 3. Insert planet associations
      for (const p of planets) {
        this.db.prepare(`
          INSERT OR REPLACE INTO resource_planets (resource_id, planet_id, category, tags_json, is_primary)
          VALUES (?, ?, ?, ?, ?)
        `).run(resourceId, p, category, JSON.stringify(tags), p === data.primaryPlanet ? 1 : 0);
      }

      return {
        resource: this.getResourceById(resourceId)!,
        isNew: true
      };
    } else {
      // Existing resource: perform non-destructive update
      const stmt = this.db.prepare(`
        UPDATE resources SET
          name = COALESCE(NULLIF(?, ''), name),
          description = COALESCE(NULLIF(?, ''), description),
          tags_json = ?,
          icon = COALESCE(NULLIF(?, ''), icon),
          quality_score = ?,
          updated_at = ?,
          extra_meta_json = ?
        WHERE id = ?
      `);
      stmt.run(
        data.name ? data.name.trim() : '',
        description,
        JSON.stringify(tags),
        icon,
        qualityScore,
        now,
        JSON.stringify(extraMeta),
        resourceId
      );

      // Update FTS
      try {
        this.db.prepare(`DELETE FROM resources_fts WHERE id = ?`).run(resourceId);
        this.db.prepare(`
          INSERT INTO resources_fts (id, name, description, domain, tags, category)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(resourceId, data.name.trim(), description, norm.domain, tags.join(' '), category);
      } catch (err) {
        console.warn('FTS index update failed:', err);
      }

      // Sync planet associations
      for (const p of planets) {
        this.db.prepare(`
          INSERT OR REPLACE INTO resource_planets (resource_id, planet_id, category, tags_json, is_primary)
          VALUES (?, ?, ?, ?, ?)
        `).run(resourceId, p, category, JSON.stringify(tags), p === existing.primaryPlanet ? 1 : 0);
      }

      return {
        resource: this.getResourceById(resourceId)!,
        isNew: false
      };
    }
  }

  public getResourceById(id: string): ResourceItem | null {
    const row: any = this.db.prepare(`SELECT * FROM resources WHERE id = ?`).get(id);
    if (!row) return null;
    return this.mapRowToResource(row);
  }

  public getResourceByCanonicalUrl(canonicalUrl: string): ResourceItem | null {
    const row: any = this.db.prepare(`SELECT * FROM resources WHERE canonical_url = ?`).get(canonicalUrl);
    if (!row) return null;
    return this.mapRowToResource(row);
  }

  /**
   * Search resources using FTS5 full text search combined with planet & type filters.
   */
  public searchResources(params: SearchQuery): { items: ResourceItem[]; total: number } {
    const {
      q,
      planet,
      category,
      resourceType,
      accessType,
      language,
      page = 1,
      limit = 20
    } = params;

    const offset = Math.max(0, (page - 1) * limit);
    const queryClean = (q || '').trim();

    let whereClauses: string[] = ["r.status != 'dead'"];
    let sqlArgs: any[] = [];

    // FTS full-text match
    if (queryClean) {
      // Escape special FTS5 characters
      const sanitizedFts = queryClean
        .replace(/['"*]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(term => `"${term}"*`)
        .join(' OR ');

      if (sanitizedFts) {
        whereClauses.push(`r.id IN (SELECT id FROM resources_fts WHERE resources_fts MATCH ?)`);
        sqlArgs.push(sanitizedFts);
      }
    }

    // Filter by Planet (via resource_planets join)
    if (planet) {
      whereClauses.push(`r.id IN (SELECT resource_id FROM resource_planets WHERE planet_id = ?)`);
      sqlArgs.push(planet);
    }

    if (category) {
      whereClauses.push(`r.category = ?`);
      sqlArgs.push(category);
    }

    if (resourceType) {
      whereClauses.push(`r.resource_type = ?`);
      sqlArgs.push(resourceType);
    }

    if (accessType) {
      whereClauses.push(`r.access_type = ?`);
      sqlArgs.push(accessType);
    }

    if (language) {
      whereClauses.push(`r.language = ?`);
      sqlArgs.push(language);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Total count
    const countRow: any = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM resources r ${whereSql}
    `).get(...sqlArgs);
    const total = Number(countRow?.cnt || 0);

    // Items query with quality score and recency ranking
    const querySql = `
      SELECT r.* FROM resources r
      ${whereSql}
      ORDER BY r.quality_score DESC, r.updated_at DESC
      LIMIT ? OFFSET ?
    `;
    const rows = this.db.prepare(querySql).all(...sqlArgs, limit, offset);

    const items = rows.map((r: any) => this.mapRowToResource(r));
    return { items, total };
  }

  public updateResourceStatus(id: string, status: ResourceStatus, httpStatus: number): void {
    const now = Date.now();
    this.db.prepare(`
      UPDATE resources
      SET status = ?, http_status = ?, last_checked_at = ?, updated_at = ?
      WHERE id = ?
    `).run(status, httpStatus, now, now, id);
  }

  public getPlanetStats(): Record<PlanetId, number> {
    const counts: Record<PlanetId, number> = {
      sun: 0,
      earth: 0,
      moon: 0,
      jupiter: 0,
      saturn: 0,
      mars: 0,
      neptune: 0,
      venus: 0,
      mercury: 0,
      uranus: 0
    };

    const rows: any[] = this.db.prepare(`
      SELECT planet_id, COUNT(DISTINCT resource_id) as cnt
      FROM resource_planets
      GROUP BY planet_id
    `).all();

    for (const r of rows) {
      const pid = r.planet_id as PlanetId;
      if (counts[pid] !== undefined) {
        counts[pid] = Number(r.cnt);
      }
    }
    return counts;
  }

  public getTotalResourceCount(): number {
    const row: any = this.db.prepare(`SELECT COUNT(*) as cnt FROM resources`).get();
    return Number(row?.cnt || 0);
  }

  public getAllSources(): CrawlSource[] {
    const rows: any[] = this.db.prepare(`SELECT * FROM crawl_sources ORDER BY enabled DESC, name ASC`).all();
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      url: r.url,
      sourceType: r.source_type,
      targetPlanet: r.target_planet as PlanetId,
      defaultCategory: r.default_category,
      intervalMinutes: r.interval_minutes,
      lastCrawlTime: r.last_crawl_time || undefined,
      lastStatus: r.last_status || undefined,
      totalCollected: r.total_collected,
      enabled: Boolean(r.enabled)
    }));
  }

  public upsertSource(source: Omit<CrawlSource, 'totalCollected'>): void {
    this.db.prepare(`
      INSERT INTO crawl_sources (id, name, url, source_type, target_planet, default_category, interval_minutes, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        url = excluded.url,
        source_type = excluded.source_type,
        target_planet = excluded.target_planet,
        default_category = excluded.default_category,
        interval_minutes = excluded.interval_minutes,
        enabled = excluded.enabled
    `).run(
      source.id,
      source.name,
      source.url,
      source.sourceType,
      source.targetPlanet,
      source.defaultCategory,
      source.intervalMinutes,
      source.enabled ? 1 : 0
    );
  }

  private mapRowToResource(row: any): ResourceItem {
    // Fetch associated planets
    const planetRows: any[] = this.db.prepare(`
      SELECT planet_id FROM resource_planets WHERE resource_id = ?
    `).all(row.id);
    const planets = planetRows.map(p => p.planet_id as PlanetId);

    let tags: string[] = [];
    try { tags = JSON.parse(row.tags_json); } catch {}

    let extraMeta: Record<string, any> = {};
    try { extraMeta = JSON.parse(row.extra_meta_json); } catch {}

    return {
      id: row.id,
      canonicalUrl: row.canonical_url,
      url: row.url,
      domain: row.domain,
      name: row.name,
      description: row.description,
      resourceType: row.resource_type as ResourceType,
      primaryPlanet: row.primary_planet as PlanetId,
      planets: planets.length > 0 ? planets : [row.primary_planet as PlanetId],
      category: row.category,
      tags,
      language: row.language,
      country: row.country || undefined,
      icon: row.icon || undefined,
      source: row.source,
      copyrightStatus: row.copyright_status as CopyrightStatus,
      accessType: row.access_type as AccessType,
      qualityScore: row.quality_score,
      status: row.status as ResourceStatus,
      httpStatus: row.http_status,
      lastCheckedAt: row.last_checked_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      extraMeta
    };
  }

  /**
   * Pre-seed verified, high-quality public domain and open resources across all 10 planets
   */
  private seedInitialResources() {
    const count = this.getTotalResourceCount();
    if (count > 0) return; // Already seeded

    const SEED_LIST = [
      // 1. SUN | 人工智能与智能工具
      {
        url: 'https://ollama.com',
        name: 'Ollama 本地大模型运行平台',
        description: '在本地极速部署与运行 Llama 3、Qwen、DeepSeek 等先进开源大模型的现代化工具框架。',
        resourceType: 'tool' as ResourceType,
        primaryPlanet: 'sun' as PlanetId,
        category: 'local_ai',
        tags: ['Ollama', '本地大模型', '开源AI', '推理框架'],
        accessType: 'open' as AccessType,
        qualityScore: 98
      },
      {
        url: 'https://huggingface.co',
        name: 'Hugging Face 全球AI开源社区',
        description: '全球顶尖的人工智能开源模型、数据集与 Spaces 演示体验聚合平台。',
        resourceType: 'website' as ResourceType,
        primaryPlanet: 'sun' as PlanetId,
        category: 'models',
        tags: ['HuggingFace', '开源模型', '数据集', 'AI社区'],
        accessType: 'open' as AccessType,
        qualityScore: 96
      },
      // 2. EARTH | 现实生活与全球服务
      {
        url: 'https://www.openstreetmap.org',
        name: 'OpenStreetMap 全球开源协同地图',
        description: '自由可编辑的世界地图数据库，由全球地图测绘志愿者共同协作维护。',
        resourceType: 'website' as ResourceType,
        primaryPlanet: 'earth' as PlanetId,
        category: 'maps',
        tags: ['地图', '地理信息', '开源', '导航'],
        accessType: 'open' as AccessType,
        qualityScore: 95
      },
      // 3. MOON | 教育与在线学习
      {
        url: 'https://ocw.mit.edu',
        name: 'MIT OpenCourseWare 麻省理工开放课程',
        description: '麻省理工学院全学科本科与研究生课程讲义、试题与视频免费开放典藏。',
        resourceType: 'course' as ResourceType,
        primaryPlanet: 'moon' as PlanetId,
        category: 'university_courses',
        tags: ['MIT', '公开课', '大学教程', '免费学习'],
        accessType: 'open' as AccessType,
        qualityScore: 99
      },
      {
        url: 'https://www.duolingo.com',
        name: '多邻国 多语言沉浸学习平台',
        description: '游戏化互动语言学习系统，支持阿拉伯语、西班牙语、日语等数十种语言基础训练。',
        resourceType: 'tool' as ResourceType,
        primaryPlanet: 'moon' as PlanetId,
        category: 'language_learning',
        tags: ['语言学习', '阿拉伯语', '英语', '多邻国'],
        accessType: 'freemium' as AccessType,
        qualityScore: 92
      },
      // 4. JUPITER | 全球互联网与智能浏览
      {
        url: 'https://en.wikipedia.org/wiki/Earth',
        name: '维基百科 · 地球百科全书条目',
        description: '多语言协同创作的自由百科全书，涵盖人类起源、行星地质与文明演化。',
        resourceType: 'website' as ResourceType,
        primaryPlanet: 'jupiter' as PlanetId,
        category: 'encyclopedia',
        tags: ['维基百科', '地球', '百科全书', '自由知识'],
        accessType: 'open' as AccessType,
        qualityScore: 96
      },
      {
        url: 'https://searx.space',
        name: 'SearXNG 开源隐私元搜索引擎公共节点',
        description: '去中心化元搜索引擎，整合全球主流搜索引擎结果，无跟踪、无广告。',
        resourceType: 'tool' as ResourceType,
        primaryPlanet: 'jupiter' as PlanetId,
        category: 'search_engine',
        tags: ['SearXNG', '隐私搜索', '元搜索', '开源搜索引擎'],
        accessType: 'open' as AccessType,
        qualityScore: 94
      },
      // 5. SATURN | 影视与影音文化 (含 Bilibili 与 YouTube 双端集成)
      {
        url: 'https://www.bilibili.com',
        name: '哔哩哔哩 弹幕视频网',
        description: '中国领先的年轻人文化与视频社区，涵盖海量纪录片、科技讲座、宇宙科普与影视资料。',
        resourceType: 'video' as ResourceType,
        primaryPlanet: 'saturn' as PlanetId,
        category: 'video_community',
        tags: ['Bilibili', 'B站', '科普视频', '弹幕', '纪录片'],
        accessType: 'open' as AccessType,
        qualityScore: 95
      },
      {
        url: 'https://www.youtube.com',
        name: 'YouTube 全球视频与影视档案',
        description: '全球规模最大的视频共享与高画质科学影视、纪录片与官方预告片检索平台。',
        resourceType: 'video' as ResourceType,
        primaryPlanet: 'saturn' as PlanetId,
        category: 'video_platform',
        tags: ['YouTube', '全球影视', '纪录片', '4K原画'],
        accessType: 'open' as AccessType,
        qualityScore: 97
      },
      {
        url: 'https://www.tvmaze.com',
        name: 'TVmaze 全球影视电视节目开放元数据库',
        description: '全球电视剧、动漫与影视节目开放数据源，提供精准的播出时间、演员表与剧集简介。',
        resourceType: 'website' as ResourceType,
        primaryPlanet: 'saturn' as PlanetId,
        category: 'cinema_metadata',
        tags: ['TVmaze', '影视元数据', '评分', '剧集排期'],
        accessType: 'open' as AccessType,
        qualityScore: 93
      },
      // 6. MARS | 软件、游戏与数字应用
      {
        url: 'https://itch.io',
        name: 'itch.io 独立游戏与创作者平台',
        description: '全球知名独立游戏开源分发平台，收录数万款实验性、创新型与免费独立游戏。',
        resourceType: 'game' as ResourceType,
        primaryPlanet: 'mars' as PlanetId,
        category: 'indie_games',
        tags: ['独立游戏', '免费游戏', 'GameJam', '游戏引擎'],
        accessType: 'open' as AccessType,
        qualityScore: 92
      },
      // 7. NEPTUNE | 全球数字图书馆与古典文献
      {
        url: 'https://openlibrary.org',
        name: 'Open Library 开放世界图书馆',
        description: '互联网档案库发起的全球开放图书项目，提供数百万册图书检索与公版图书在线翻阅借阅。',
        resourceType: 'book' as ResourceType,
        primaryPlanet: 'neptune' as PlanetId,
        category: 'digital_library',
        tags: ['OpenLibrary', '开放图书', '公版书', '借阅'],
        accessType: 'open' as AccessType,
        qualityScore: 99
      },
      {
        url: 'https://www.gutenberg.org',
        name: '古腾堡计划 Project Gutenberg',
        description: '历史最悠久的数字化公版图书宝库，收录数万种莎士比亚、荷马、但丁等古典名著完整 EPUB 与文本。',
        resourceType: 'book' as ResourceType,
        primaryPlanet: 'neptune' as PlanetId,
        category: 'classics',
        tags: ['古腾堡', '公版名著', 'EPUB', '古典文学'],
        accessType: 'open' as AccessType,
        qualityScore: 98
      },
      // 8. VENUS | 艺术、音乐与视觉创作
      {
        url: 'https://freemusicarchive.org',
        name: 'Free Music Archive 自由音乐档案馆',
        description: '高质量独立音乐与 Creative Commons 版权音频宝库，适合视频创作与背景聆赏。',
        resourceType: 'music' as ResourceType,
        primaryPlanet: 'venus' as PlanetId,
        category: 'open_music',
        tags: ['自由音乐', 'CC许可', '无版权配乐', '独立音乐'],
        accessType: 'open' as AccessType,
        qualityScore: 91
      },
      // 9. MERCURY | 全球即时资讯与宏观数据
      {
        url: 'https://data.worldbank.org',
        name: '世界银行公开数据 World Bank Open Data',
        description: '全球各国经济、人口、教育、环境与发展指数权威开放数据库。',
        resourceType: 'dataset' as ResourceType,
        primaryPlanet: 'mercury' as PlanetId,
        category: 'macro_data',
        tags: ['世界银行', '公开数据', '全球经济', '统计图表'],
        accessType: 'open' as AccessType,
        qualityScore: 97
      },
      // 10. URANUS | 科技前沿与开源生态
      {
        url: 'https://github.com/trending',
        name: 'GitHub Trending 全球开源热榜',
        description: '实时追踪全球开发者社区最具影响力的开源项目、工具库与系统软件。',
        resourceType: 'research' as ResourceType,
        primaryPlanet: 'uranus' as PlanetId,
        category: 'open_source',
        tags: ['GitHub', '开源热榜', '开发者社区', '代码仓库'],
        accessType: 'open' as AccessType,
        qualityScore: 98
      },
      {
        url: 'https://arxiv.org',
        name: 'arXiv.org 全球开放学术论文预印本库',
        description: '康奈尔大学运营的物理、数学、计算机科学与量化金融权威预印本典藏平台。',
        resourceType: 'research' as ResourceType,
        primaryPlanet: 'uranus' as PlanetId,
        category: 'academic_papers',
        tags: ['arXiv', '学术论文', '预印本', '科研文献'],
        accessType: 'open' as AccessType,
        qualityScore: 99
      }
    ];

    for (const item of SEED_LIST) {
      try {
        this.insertOrUpdateResource({
          ...item,
          source: 'seed_init',
          copyrightStatus: 'open_access'
        });
      } catch (e) {
        console.warn('Seed failed for', item.url, e);
      }
    }

    // Seed default crawl sources
    this.upsertSource({
      id: 'src_openlibrary',
      name: 'Open Library 开放图书源',
      url: 'https://openlibrary.org',
      sourceType: 'api',
      targetPlanet: 'neptune',
      defaultCategory: 'digital_library',
      intervalMinutes: 240,
      enabled: true
    });
    this.upsertSource({
      id: 'src_tvmaze',
      name: 'TVmaze 影视元数据库',
      url: 'https://api.tvmaze.com',
      sourceType: 'api',
      targetPlanet: 'saturn',
      defaultCategory: 'cinema_metadata',
      intervalMinutes: 360,
      enabled: true
    });
    this.upsertSource({
      id: 'src_hackernews_rss',
      name: 'Hacker News RSS 科技热点',
      url: 'https://news.ycombinator.com/rss',
      sourceType: 'rss',
      targetPlanet: 'uranus',
      defaultCategory: 'tech_news',
      intervalMinutes: 120,
      enabled: true
    });
  }
}

// Global Singleton Instance
export const discoveryDb = new DiscoveryDatabase();
