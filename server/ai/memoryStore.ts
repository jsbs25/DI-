/**
 * EARTH ONE — Persistent AI Long-Term Memory & Multi-Turn Context Store
 * Uses Node native `node:sqlite` (DatabaseSync) with WAL mode and FTS5 hybrid search.
 * Scoped cleanly per user_id, with contradiction resolution & anti-pollution hygiene guards.
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

export type MemoryCategory =
  | 'goal'
  | 'project'
  | 'habit'
  | 'preference'
  | 'decision'
  | 'fact'
  | 'relationship';

export type MemoryStatus = 'active' | 'superseded' | 'archived';

export interface AIMemoryRecord {
  id: string;
  userId: string;
  category: MemoryCategory;
  summary: string;
  canonicalKey: string;
  keywords: string;
  confidence: number;
  importance: number;
  status: MemoryStatus;
  supersededBy: string | null;
  sourceSessionId: string;
  sourceQuote: string;
  timesRecalled: number;
  lastRecalledAt: number;
  createdAt: number;
  updatedAt: number;
  score?: number;
}

export interface AISessionRecord {
  id: string;
  userId: string;
  channel: 'hub' | 'voice' | 'api';
  title: string;
  activeTopic: string;
  activeGoal: string;
  constraints: string[];
  decisions: string[];
  rollingSummary: string;
  turnCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface AIMessageRecord {
  id: string;
  sessionId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  intent: string;
  model: string;
  createdAt: number;
}

export interface UpsertMemoryInput {
  userId: string;
  category: MemoryCategory;
  summary: string;
  canonicalKey?: string;
  keywords?: string;
  confidence?: number;
  importance?: number;
  sourceSessionId?: string;
  sourceQuote?: string;
  replacesConflictingKey?: boolean;
}

const DB_DIR = path.resolve(process.env.EARTH_ONE_DATA_DIR || path.join(process.cwd(), 'server_data'));
const DB_PATH = process.env.EARTH_ONE_AI_MEMORY_DB_FILE || path.join(DB_DIR, 'ai_memory.db');

function safeParseJsonArray(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function buildTextBigrams(text: string): Set<string> {
  const clean = text.toLowerCase().replace(/[\s，。！？、,.!?;；:"'“”‘’()（）\[\]【】]/g, '');
  const tokens = new Set<string>();
  const words = text.toLowerCase().match(/[a-z0-9_+-]{2,}/g) || [];
  for (const w of words) tokens.add(w);
  for (let i = 0; i < clean.length - 1; i++) {
    tokens.add(clean.slice(i, i + 2));
  }
  return tokens;
}

function jaccardSimilarity(a: string, b: string): number {
  const sa = buildTextBigrams(a);
  const sb = buildTextBigrams(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const item of sa) {
    if (sb.has(item)) inter++;
  }
  return inter / (sa.size + sb.size - inter);
}

/**
 * Ephemeral chatter / calculations / single-use commands should never pollute long-term memory.
 */
export function isTransientOrPollutingSummary(summary: string): boolean {
  const s = summary.trim();
  if (s.length < 5 || s.length > 260) return true;
  if (/^(你好|在吗|干嘛|吃饭了吗|早安|晚安|谢谢|好的|ok|yes|no|hello|hi)[。！!]?$/i.test(s)) return true;
  if (/^(用户)?(问了|询问|查询|计算)?\s*(\d+\s*[+\-*/]|今天几号|现在几点|天气|放首歌|下一首|停止播放)/i.test(s)) {
    return true;
  }
  if (/(可能只是随便聊聊|或许|大概|猜想|不确定用户)/i.test(s)) return true;
  return false;
}

export class AIMemoryDatabase {
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
  }

  private initPragmas() {
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'hub',
        title TEXT NOT NULL DEFAULT '新对话',
        active_topic TEXT NOT NULL DEFAULT '',
        active_goal TEXT NOT NULL DEFAULT '',
        constraints_json TEXT NOT NULL DEFAULT '[]',
        decisions_json TEXT NOT NULL DEFAULT '[]',
        rolling_summary TEXT NOT NULL DEFAULT '',
        turn_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ai_sessions_user_updated
        ON ai_sessions (user_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS ai_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        intent TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ai_messages_session_time
        ON ai_messages (session_id, created_at ASC);

      CREATE TABLE IF NOT EXISTS ai_memories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        category TEXT NOT NULL,
        summary TEXT NOT NULL,
        canonical_key TEXT NOT NULL DEFAULT '',
        keywords TEXT NOT NULL DEFAULT '',
        confidence REAL NOT NULL DEFAULT 0.85,
        importance INTEGER NOT NULL DEFAULT 5,
        status TEXT NOT NULL DEFAULT 'active',
        superseded_by TEXT DEFAULT NULL,
        source_session_id TEXT NOT NULL DEFAULT '',
        source_quote TEXT NOT NULL DEFAULT '',
        times_recalled INTEGER NOT NULL DEFAULT 0,
        last_recalled_at INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ai_memories_user_status
        ON ai_memories (user_id, status, importance DESC, updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_ai_memories_canonical
        ON ai_memories (user_id, canonical_key, status);

      CREATE VIRTUAL TABLE IF NOT EXISTS ai_memories_fts USING fts5(
        memory_id UNINDEXED,
        user_id UNINDEXED,
        summary,
        keywords,
        category
      );
    `);
  }

  private mapSession(row: any): AISessionRecord {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      channel: (row.channel as any) || 'hub',
      title: String(row.title || '新对话'),
      activeTopic: String(row.active_topic || ''),
      activeGoal: String(row.active_goal || ''),
      constraints: safeParseJsonArray(row.constraints_json),
      decisions: safeParseJsonArray(row.decisions_json),
      rollingSummary: String(row.rolling_summary || ''),
      turnCount: Number(row.turn_count || 0),
      createdAt: Number(row.created_at || 0),
      updatedAt: Number(row.updated_at || 0),
    };
  }

  private mapMemory(row: any, score?: number): AIMemoryRecord {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      category: (row.category as MemoryCategory) || 'fact',
      summary: String(row.summary),
      canonicalKey: String(row.canonical_key || ''),
      keywords: String(row.keywords || ''),
      confidence: Number(row.confidence ?? 0.85),
      importance: Number(row.importance ?? 5),
      status: (row.status as MemoryStatus) || 'active',
      supersededBy: row.superseded_by ? String(row.superseded_by) : null,
      sourceSessionId: String(row.source_session_id || ''),
      sourceQuote: String(row.source_quote || ''),
      timesRecalled: Number(row.times_recalled || 0),
      lastRecalledAt: Number(row.last_recalled_at || 0),
      createdAt: Number(row.created_at || 0),
      updatedAt: Number(row.updated_at || 0),
      ...(score !== undefined ? { score } : {}),
    };
  }

  public getOrCreateSession(
    userId: string,
    sessionId?: string,
    channel: 'hub' | 'voice' | 'api' = 'hub'
  ): AISessionRecord {
    const uid = (userId || 'guest').trim() || 'guest';
    const cleanId = typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim().slice(0, 96) : '';
    if (cleanId) {
      const existing = this.db
        .prepare('SELECT * FROM ai_sessions WHERE id = ? AND user_id = ? LIMIT 1')
        .get(cleanId, uid);
      if (existing) return this.mapSession(existing);
    }

    const now = Date.now();
    const id = cleanId || `aisess_${crypto.randomUUID().slice(0, 12)}`;
    const defaultTitle = channel === 'voice' ? '语音实时对话' : '新对话';
    this.db
      .prepare(
        `INSERT INTO ai_sessions (id, user_id, channel, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, uid, channel, defaultTitle, now, now);

    const created = this.db.prepare('SELECT * FROM ai_sessions WHERE id = ? LIMIT 1').get(id);
    return this.mapSession(created);
  }

  public getSession(userId: string, sessionId: string): AISessionRecord | null {
    const row = this.db
      .prepare('SELECT * FROM ai_sessions WHERE id = ? AND user_id = ? LIMIT 1')
      .get(sessionId, userId);
    return row ? this.mapSession(row) : null;
  }

  public listSessions(userId: string, channel?: 'hub' | 'voice' | 'api', limit = 30): AISessionRecord[] {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = channel
      ? this.db
          .prepare(
            'SELECT * FROM ai_sessions WHERE user_id = ? AND channel = ? ORDER BY updated_at DESC LIMIT ?'
          )
          .all(userId, channel, safeLimit)
      : this.db
          .prepare('SELECT * FROM ai_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?')
          .all(userId, safeLimit);
    return rows.map((r) => this.mapSession(r));
  }

  public deleteSession(userId: string, sessionId: string): boolean {
    const info = this.db
      .prepare('DELETE FROM ai_sessions WHERE id = ? AND user_id = ?')
      .run(sessionId, userId);
    return Number(info.changes || 0) > 0;
  }

  public updateSessionState(
    userId: string,
    sessionId: string,
    patch: {
      title?: string;
      activeTopic?: string;
      activeGoal?: string;
      constraints?: string[];
      decisions?: string[];
      rollingSummary?: string;
    }
  ): AISessionRecord | null {
    const cur = this.getSession(userId, sessionId);
    if (!cur) return null;

    const dedupeCap = (arr: string[], cap = 12) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const item of arr) {
        const clean = item.trim();
        if (!clean || seen.has(clean)) continue;
        seen.add(clean);
        out.push(clean);
      }
      return out.slice(-cap);
    };

    const nextTitle = patch.title !== undefined ? patch.title.trim().slice(0, 80) : cur.title;
    const nextTopic = patch.activeTopic !== undefined ? patch.activeTopic.trim().slice(0, 140) : cur.activeTopic;
    const nextGoal = patch.activeGoal !== undefined ? patch.activeGoal.trim().slice(0, 220) : cur.activeGoal;
    const nextConstraints = patch.constraints ? dedupeCap(patch.constraints, 10) : cur.constraints;
    const nextDecisions = patch.decisions ? dedupeCap(patch.decisions, 12) : cur.decisions;
    const nextSummary = patch.rollingSummary !== undefined ? patch.rollingSummary.trim().slice(0, 1200) : cur.rollingSummary;
    const now = Date.now();

    this.db
      .prepare(
        `UPDATE ai_sessions
         SET title = ?, active_topic = ?, active_goal = ?, constraints_json = ?, decisions_json = ?, rolling_summary = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`
      )
      .run(
        nextTitle || cur.title,
        nextTopic,
        nextGoal,
        JSON.stringify(nextConstraints),
        JSON.stringify(nextDecisions),
        nextSummary,
        now,
        sessionId,
        userId
      );

    return this.getSession(userId, sessionId);
  }

  public getSessionMessages(userId: string, sessionId: string, limit = 40): AIMessageRecord[] {
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const rows = this.db
      .prepare(
        `SELECT * FROM (
           SELECT * FROM ai_messages WHERE session_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT ?
         ) ORDER BY created_at ASC`
      )
      .all(sessionId, userId, safeLimit);

    return rows.map((r: any) => ({
      id: String(r.id),
      sessionId: String(r.session_id),
      userId: String(r.user_id),
      role: r.role === 'assistant' ? 'assistant' : 'user',
      content: String(r.content),
      intent: String(r.intent || ''),
      model: String(r.model || ''),
      createdAt: Number(r.created_at || 0),
    }));
  }

  public appendMessage(input: {
    sessionId: string;
    userId: string;
    role: 'user' | 'assistant';
    content: string;
    intent?: string;
    model?: string;
  }): AIMessageRecord {
    const id = `aimsg_${crypto.randomUUID().slice(0, 12)}`;
    const now = Date.now();
    const content = input.content.trim().slice(0, 12000);

    this.db
      .prepare(
        `INSERT INTO ai_messages (id, session_id, user_id, role, content, intent, model, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.sessionId,
        input.userId,
        input.role,
        content,
        input.intent || '',
        input.model || '',
        now
      );

    this.db
      .prepare('UPDATE ai_sessions SET turn_count = turn_count + 1, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(now, input.sessionId, input.userId);

    return {
      id,
      sessionId: input.sessionId,
      userId: input.userId,
      role: input.role,
      content,
      intent: input.intent || '',
      model: input.model || '',
      createdAt: now,
    };
  }

  private syncMemoryFts(memory: {
    id: string;
    userId: string;
    summary: string;
    keywords: string;
    category: string;
    status: string;
  }) {
    this.db.prepare('DELETE FROM ai_memories_fts WHERE memory_id = ?').run(memory.id);
    if (memory.status === 'active') {
      this.db
        .prepare(
          'INSERT INTO ai_memories_fts (memory_id, user_id, summary, keywords, category) VALUES (?, ?, ?, ?, ?)'
        )
        .run(memory.id, memory.userId, memory.summary, memory.keywords, memory.category);
    }
  }

  /**
   * Inserts or merges a long-term memory with contradiction detection and deduplication.
   */
  public upsertMemory(input: UpsertMemoryInput): { action: 'inserted' | 'merged' | 'superseded' | 'rejected'; memory?: AIMemoryRecord } {
    const uid = (input.userId || 'guest').trim() || 'guest';
    const summary = input.summary.trim().slice(0, 300);
    const confidence = Math.max(0.1, Math.min(1, input.confidence ?? 0.85));
    const importance = Math.max(1, Math.min(10, Math.round(input.importance ?? 5)));
    const canonicalKey = (input.canonicalKey || '').trim().slice(0, 96);
    const keywords = (input.keywords || '').trim().slice(0, 220);

    // Hygiene Gate 1: Reject low-confidence speculation & transient chatter
    if (confidence < 0.6 || isTransientOrPollutingSummary(summary)) {
      return { action: 'rejected' };
    }

    const now = Date.now();
    const activeRows = this.db
      .prepare(`SELECT * FROM ai_memories WHERE user_id = ? AND status = 'active'`)
      .all(uid)
      .map((r) => this.mapMemory(r));

    // Check near-duplicate active memories (same idea phrased slightly differently)
    for (const existing of activeRows) {
      const sim = jaccardSimilarity(existing.summary, summary);
      const exactSameKeyAndSimilar =
        canonicalKey &&
        existing.canonicalKey === canonicalKey &&
        sim >= 0.45 &&
        !input.replacesConflictingKey;

      if (sim >= 0.72 || exactSameKeyAndSimilar) {
        const nextSummary = summary.length > existing.summary.length ? summary : existing.summary;
        const nextConf = Math.min(1, Math.max(existing.confidence, confidence) + 0.05);
        const nextImp = Math.max(existing.importance, importance);
        const nextKeywords = Array.from(
          new Set(`${existing.keywords} ${keywords}`.split(/[\s,，]+/).filter(Boolean))
        )
          .slice(0, 18)
          .join(' ');

        this.db
          .prepare(
            `UPDATE ai_memories
             SET summary = ?, keywords = ?, confidence = ?, importance = ?, updated_at = ?
             WHERE id = ? AND user_id = ?`
          )
          .run(nextSummary, nextKeywords, nextConf, nextImp, now, existing.id, uid);

        const updatedRow = this.db.prepare('SELECT * FROM ai_memories WHERE id = ?').get(existing.id);
        const updated = this.mapMemory(updatedRow);
        this.syncMemoryFts(updated);
        return { action: 'merged', memory: updated };
      }
    }

    const newId = `aimem_${crypto.randomUUID().slice(0, 12)}`;
    let supersededAny = false;

    // Contradiction Guard: supersede old conflicting memory sharing the same canonicalKey
    if (canonicalKey && input.replacesConflictingKey !== false) {
      const conflicting = activeRows.filter(
        (m) => m.canonicalKey === canonicalKey && m.canonicalKey !== 'general:fact'
      );
      for (const oldMem of conflicting) {
        this.db
          .prepare(`UPDATE ai_memories SET status = 'superseded', superseded_by = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
          .run(newId, now, oldMem.id, uid);
        this.db.prepare('DELETE FROM ai_memories_fts WHERE memory_id = ?').run(oldMem.id);
        supersededAny = true;
      }
    }

    this.db
      .prepare(
        `INSERT INTO ai_memories (
          id, user_id, category, summary, canonical_key, keywords, confidence, importance,
          status, superseded_by, source_session_id, source_quote, times_recalled, last_recalled_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, 0, 0, ?, ?)`
      )
      .run(
        newId,
        uid,
        input.category,
        summary,
        canonicalKey,
        keywords,
        confidence,
        importance,
        input.sourceSessionId || '',
        (input.sourceQuote || '').trim().slice(0, 240),
        now,
        now
      );

    const createdRow = this.db.prepare('SELECT * FROM ai_memories WHERE id = ?').get(newId);
    const created = this.mapMemory(createdRow);
    this.syncMemoryFts(created);

    // Prevent unbounded growth per user: archive lowest-importance stale memories past 180 active records
    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS cnt FROM ai_memories WHERE user_id = ? AND status = 'active'`)
      .get(uid) as { cnt: number };
    if ((countRow?.cnt || 0) > 180) {
      const pruneRows = this.db
        .prepare(
          `SELECT id FROM ai_memories
           WHERE user_id = ? AND status = 'active' AND importance <= 5
           ORDER BY times_recalled ASC, updated_at ASC
           LIMIT ?`
        )
        .all(uid, countRow.cnt - 180) as Array<{ id: string }>;
      for (const p of pruneRows) {
        this.db.prepare(`UPDATE ai_memories SET status = 'archived', updated_at = ? WHERE id = ?`).run(now, p.id);
        this.db.prepare('DELETE FROM ai_memories_fts WHERE memory_id = ?').run(p.id);
      }
    }

    return { action: supersededAny ? 'superseded' : 'inserted', memory: created };
  }

  /**
   * Hybrid retrieval: combines FTS5 match, CJK bigram & keyword overlap, category importance, confidence, and recency.
   */
  public recallMemories(
    userId: string,
    query: string,
    options: { limit?: number; includeCorePreferences?: boolean; bumpRecallStats?: boolean } = {}
  ): AIMemoryRecord[] {
    const uid = (userId || 'guest').trim() || 'guest';
    const limit = Math.max(1, Math.min(20, options.limit ?? 6));
    const includeCore = options.includeCorePreferences !== false;
    const rows = this.db
      .prepare(
        `SELECT * FROM ai_memories
         WHERE user_id = ? AND status = 'active' AND confidence >= 0.6
         ORDER BY importance DESC, updated_at DESC
         LIMIT 120`
      )
      .all(uid)
      .map((r) => this.mapMemory(r));

    if (rows.length === 0) return [];

    // Optional FTS5 boost for Latin/tokenized keywords
    const ftsMatchIds = new Set<string>();
    const latinWords = (query.match(/[a-zA-Z0-9_\u4e00-\u9fff]{2,}/g) || [])
      .map((w) => `"${w.replace(/"/g, '')}"`)
      .slice(0, 6);
    if (latinWords.length > 0) {
      try {
        const ftsRows = this.db
          .prepare(`SELECT memory_id FROM ai_memories_fts WHERE ai_memories_fts MATCH ? AND user_id = ? LIMIT 30`)
          .all(latinWords.join(' OR '), uid) as Array<{ memory_id: string }>;
        for (const r of ftsRows) ftsMatchIds.add(r.memory_id);
      } catch {
        // Ignore FTS syntax edge cases
      }
    }

    const queryBigrams = buildTextBigrams(query);
    const now = Date.now();
    const scored: AIMemoryRecord[] = [];

    for (const mem of rows) {
      const memText = `${mem.summary} ${mem.keywords}`;
      const memBigrams = buildTextBigrams(memText);
      let overlap = 0;
      for (const bg of queryBigrams) {
        if (memBigrams.has(bg)) overlap++;
      }
      const lexicalScore =
        queryBigrams.size > 0 ? Math.min(1, overlap / Math.max(2, Math.min(queryBigrams.size, 8))) : 0;
      const ftsBoost = ftsMatchIds.has(mem.id) ? 0.35 : 0;
      const isCorePreference =
        includeCore &&
        (mem.category === 'preference' ||
          mem.category === 'habit' ||
          (mem.category === 'goal' && mem.importance >= 7) ||
          (mem.category === 'project' && mem.importance >= 7) ||
          mem.importance >= 8);
      const coreFloor = isCorePreference ? 0.28 : 0;

      const ageDays = Math.max(0, (now - mem.updatedAt) / (1000 * 60 * 60 * 24));
      const recencyScore = Math.exp(-ageDays / 45);
      const importanceScore = mem.importance / 10;

      const totalScore =
        Math.max(lexicalScore + ftsBoost, coreFloor) * 0.56 +
        importanceScore * 0.24 +
        mem.confidence * 0.12 +
        recencyScore * 0.08;

      if (lexicalScore > 0.08 || ftsBoost > 0 || isCorePreference) {
        scored.push({ ...mem, score: Number(totalScore.toFixed(4)) });
      }
    }

    scored.sort((a, b) => (b.score || 0) - (a.score || 0));
    const selected = scored.slice(0, limit);

    if (options.bumpRecallStats !== false && selected.length > 0) {
      const stmt = this.db.prepare(
        'UPDATE ai_memories SET times_recalled = times_recalled + 1, last_recalled_at = ? WHERE id = ?'
      );
      for (const item of selected) {
        stmt.run(now, item.id);
      }
    }

    return selected;
  }

  public listMemories(
    userId: string,
    options: { status?: MemoryStatus | 'all'; category?: MemoryCategory; limit?: number } = {}
  ): AIMemoryRecord[] {
    const uid = (userId || 'guest').trim() || 'guest';
    const limit = Math.max(1, Math.min(200, options.limit ?? 100));
    const conditions: string[] = ['user_id = ?'];
    const params: any[] = [uid];

    if (options.status && options.status !== 'all') {
      conditions.push('status = ?');
      params.push(options.status);
    } else if (!options.status) {
      conditions.push(`status = 'active'`);
    }
    if (options.category) {
      conditions.push('category = ?');
      params.push(options.category);
    }
    params.push(limit);

    const rows = this.db
      .prepare(
        `SELECT * FROM ai_memories
         WHERE ${conditions.join(' AND ')}
         ORDER BY importance DESC, updated_at DESC
         LIMIT ?`
      )
      .all(...params);
    return rows.map((r) => this.mapMemory(r));
  }

  public updateMemory(
    userId: string,
    memoryId: string,
    patch: {
      summary?: string;
      category?: MemoryCategory;
      importance?: number;
      confidence?: number;
      status?: MemoryStatus;
    }
  ): AIMemoryRecord | null {
    const row = this.db
      .prepare('SELECT * FROM ai_memories WHERE id = ? AND user_id = ? LIMIT 1')
      .get(memoryId, userId);
    if (!row) return null;
    const cur = this.mapMemory(row);

    const nextSummary =
      patch.summary !== undefined ? patch.summary.trim().slice(0, 300) || cur.summary : cur.summary;
    const nextCategory = patch.category || cur.category;
    const nextImportance =
      patch.importance !== undefined ? Math.max(1, Math.min(10, Math.round(patch.importance))) : cur.importance;
    const nextConfidence =
      patch.confidence !== undefined ? Math.max(0.1, Math.min(1, patch.confidence)) : cur.confidence;
    const nextStatus = patch.status || cur.status;
    const now = Date.now();

    if (patch.summary !== undefined && isTransientOrPollutingSummary(nextSummary)) {
      return null;
    }

    this.db
      .prepare(
        `UPDATE ai_memories
         SET summary = ?, category = ?, importance = ?, confidence = ?, status = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`
      )
      .run(nextSummary, nextCategory, nextImportance, nextConfidence, nextStatus, now, memoryId, userId);

    const updatedRow = this.db.prepare('SELECT * FROM ai_memories WHERE id = ?').get(memoryId);
    const updated = this.mapMemory(updatedRow);
    this.syncMemoryFts(updated);
    return updated;
  }

  public deleteMemory(userId: string, memoryId: string): boolean {
    this.db.prepare('DELETE FROM ai_memories_fts WHERE memory_id = ? AND user_id = ?').run(memoryId, userId);
    const info = this.db
      .prepare('DELETE FROM ai_memories WHERE id = ? AND user_id = ?')
      .run(memoryId, userId);
    return Number(info.changes || 0) > 0;
  }

  public deleteMemoriesMatching(userId: string, keyword: string): number {
    const clean = keyword.trim();
    if (!clean) return 0;
    const all = this.listMemories(userId, { status: 'active', limit: 200 });
    const bg = buildTextBigrams(clean);
    let removed = 0;
    for (const m of all) {
      if (
        m.summary.toLowerCase().includes(clean.toLowerCase()) ||
        (bg.size >= 2 && jaccardSimilarity(m.summary, clean) >= 0.28)
      ) {
        if (this.deleteMemory(userId, m.id)) removed++;
      }
    }
    return removed;
  }
}

export const aiMemoryStore = new AIMemoryDatabase();
