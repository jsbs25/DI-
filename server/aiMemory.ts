import crypto from 'node:crypto';
import type { AIConversationMessage } from './aiConversation.ts';

export type MemoryKind =
  | 'identity'
  | 'goal'
  | 'project'
  | 'preference'
  | 'decision'
  | 'fact'
  | 'episode';

export type MemoryStatus = 'active' | 'superseded' | 'archived' | 'rejected';

export type MemorySource = 'user_explicit' | 'inferred' | 'corrected';

export interface AIMemoryItem {
  id: string;
  profileKey: string;
  kind: MemoryKind;
  normalizedKey: string;
  content: string;
  keywords: string[];
  confidence: number; // 0.0 - 1.0
  salience: number; // 0.0 - 1.0
  source: MemorySource;
  status: MemoryStatus;
  createdAt: string;
  updatedAt: string;
  lastRecalledAt?: string;
  recallCount: number;
}

export interface MemoryCandidate {
  kind: MemoryKind;
  normalizedKey: string;
  content: string;
  confidence: number;
  salience: number;
  source: MemorySource;
  supersedesQuery?: string;
}

export interface MemoryStoreBackend {
  aiMemories: AIMemoryItem[];
  saveToDisk: () => void;
}

const MAX_MEMORIES_PER_PROFILE = 120;

const TRANSIENT_NOISE_PATTERNS: RegExp[] = [
  /^(你好|您好|哈喽|嗨|在吗|在不在|早安|晚安|谢谢|感谢|拜拜|再见|嗯|哦|好的|好吧|行吧|可以|是的|对|没错|hello|hi|hey|ok|okay|thanks|thank you|bye)[!！?？。~～\s]*$/i,
  /^(播放|暂停|停止|下一首|上一首|换一首|打开|关闭|切换|调高|调低)/,
  /(几点了|今天几号|星期几|天气怎么样|\d+\s*[+\-*/×÷]\s*\d+)/,
];

function cleanContent(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^[，。、,.;；:：\s]+|[，。、,.;；:：\s]+$/g, '')
    .trim();
}

export function extractKeywords(text: string): string[] {
  const tokens = new Set<string>();
  const lower = text.toLowerCase();

  // Latin/alphanumeric words
  for (const m of lower.matchAll(/[a-z0-9_.-]{2,}/g)) {
    tokens.add(m[0]);
  }

  // CJK segments -> unigrams + bigrams for robust Chinese retrieval
  for (const seg of lower.matchAll(/[\u4e00-\u9fff]{2,}/g)) {
    const s = seg[0];
    if (s.length <= 6) tokens.add(s);
    for (let i = 0; i < s.length - 1; i++) {
      tokens.add(s.slice(i, i + 2));
    }
  }

  return Array.from(tokens).slice(0, 32);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) {
    if (setB.has(t)) inter += 1;
  }
  const union = setA.size + setB.size - inter;
  return union > 0 ? inter / union : 0;
}

export function normalizeProfileKey(rawKey?: string | null, userId?: string | null): string {
  if (userId && userId.trim()) return `user:${userId.trim()}`;
  const clean = (rawKey || '').trim().replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 64);
  return clean || 'default';
}

export function isTransientOrPollutingText(text: string): boolean {
  const clean = cleanContent(text);
  if (!clean || clean.length < 3) return true;
  if (TRANSIENT_NOISE_PATTERNS.some((re) => re.test(clean))) return true;
  // Pure tentative questions without self-disclosure are usually transient queries, not durable memory
  if (/[?？]$/.test(clean) && !/(记住|以后|我叫|我是|我正在|我的项目|我喜欢|我习惯)/.test(clean)) {
    return true;
  }
  return false;
}

export function listMemories(
  store: MemoryStoreBackend,
  profileKey: string,
  includeInactive = false
): AIMemoryItem[] {
  const key = normalizeProfileKey(profileKey);
  return store.aiMemories
    .filter((m) => m.profileKey === key && (includeInactive || m.status === 'active'))
    .sort((a, b) => {
      if (b.salience !== a.salience) return b.salience - a.salience;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
}

export function upsertMemory(
  store: MemoryStoreBackend,
  profileKey: string,
  candidate: MemoryCandidate
): { item: AIMemoryItem; action: 'created' | 'updated' | 'superseded_and_created' } {
  const key = normalizeProfileKey(profileKey);
  const content = cleanContent(candidate.content).slice(0, 260);
  const keywords = extractKeywords(content);
  const now = new Date().toISOString();
  const normKey = (candidate.normalizedKey || `${candidate.kind}:${keywords.slice(0, 3).join('_')}`).slice(0, 80);

  let supersededAny = false;
  const activeForProfile = store.aiMemories.filter((m) => m.profileKey === key && m.status === 'active');

  // 1. Check exact / near-duplicate active item first
  for (const existing of activeForProfile) {
    const sim = jaccardSimilarity(existing.keywords, keywords);
    const sameNormKey = existing.normalizedKey === normKey && !normKey.endsWith(':general');
    const isSingularKey = /^(identity\.name|identity\.role|project\.primary|style\.tone|style\.length|style\.anti_template|language\.preference)$/.test(
      normKey
    );

    if (sim >= 0.78 || (existing.content.toLowerCase() === content.toLowerCase())) {
      existing.content = content;
      existing.keywords = keywords;
      existing.confidence = Math.max(existing.confidence, candidate.confidence);
      existing.salience = Math.max(existing.salience, candidate.salience);
      existing.source = candidate.source === 'corrected' ? 'corrected' : existing.source;
      existing.updatedAt = now;
      store.saveToDisk();
      return { item: existing, action: 'updated' };
    }

    if (sameNormKey && isSingularKey) {
      existing.status = 'superseded';
      existing.updatedAt = now;
      supersededAny = true;
    } else if (candidate.supersedesQuery) {
      const qKw = extractKeywords(candidate.supersedesQuery);
      if (jaccardSimilarity(existing.keywords, qKw) >= 0.35 || existing.content.includes(candidate.supersedesQuery)) {
        existing.status = 'superseded';
        existing.updatedAt = now;
        supersededAny = true;
      }
    }
  }

  const created: AIMemoryItem = {
    id: `mem_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    profileKey: key,
    kind: candidate.kind,
    normalizedKey: normKey,
    content,
    keywords,
    confidence: Math.min(1, Math.max(0.2, candidate.confidence)),
    salience: Math.min(1, Math.max(0.2, candidate.salience)),
    source: candidate.source,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    recallCount: 0,
  };

  store.aiMemories.unshift(created);

  // Prune overflow for this profile (archive lowest-salience inactive/old items first)
  const profileItems = store.aiMemories.filter((m) => m.profileKey === key);
  if (profileItems.length > MAX_MEMORIES_PER_PROFILE) {
    const dropSet = new Set(
      profileItems
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
          return b.salience - a.salience || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        })
        .slice(MAX_MEMORIES_PER_PROFILE)
        .map((m) => m.id)
    );
    store.aiMemories = store.aiMemories.filter((m) => !dropSet.has(m.id));
  }

  store.saveToDisk();
  return { item: created, action: supersededAny ? 'superseded_and_created' : 'created' };
}

export function updateMemoryItem(
  store: MemoryStoreBackend,
  profileKey: string,
  id: string,
  patch: Partial<Pick<AIMemoryItem, 'content' | 'kind' | 'status' | 'salience' | 'confidence'>>
): AIMemoryItem | null {
  const key = normalizeProfileKey(profileKey);
  const item = store.aiMemories.find((m) => m.id === id && m.profileKey === key);
  if (!item) return null;

  if (typeof patch.content === 'string' && cleanContent(patch.content)) {
    item.content = cleanContent(patch.content).slice(0, 260);
    item.keywords = extractKeywords(item.content);
    item.source = 'corrected';
  }
  if (patch.kind) item.kind = patch.kind;
  if (patch.status) item.status = patch.status;
  if (typeof patch.salience === 'number') item.salience = Math.min(1, Math.max(0.1, patch.salience));
  if (typeof patch.confidence === 'number') item.confidence = Math.min(1, Math.max(0.1, patch.confidence));
  item.updatedAt = new Date().toISOString();
  store.saveToDisk();
  return item;
}

export function deleteMemoryItem(
  store: MemoryStoreBackend,
  profileKey: string,
  id?: string,
  clearAll = false
): number {
  const key = normalizeProfileKey(profileKey);
  const before = store.aiMemories.length;
  if (clearAll) {
    store.aiMemories = store.aiMemories.filter((m) => m.profileKey !== key);
  } else if (id) {
    store.aiMemories = store.aiMemories.filter((m) => !(m.id === id && m.profileKey === key));
  }
  const removed = before - store.aiMemories.length;
  if (removed > 0) store.saveToDisk();
  return removed;
}

/**
 * Retrieves the highest-value active memories for the current turn within a strict character budget.
 * Always includes durable identity & style preferences, plus top semantically overlapping project/goal/fact items.
 */
export function retrieveRelevantMemories(
  store: MemoryStoreBackend,
  profileKey: string,
  prompt: string,
  recentHistory: AIConversationMessage[] = [],
  maxChars = 540
): AIMemoryItem[] {
  const active = listMemories(store, profileKey, false);
  if (active.length === 0) return [];

  const contextText = [prompt, ...recentHistory.slice(-4).map((m) => m.content)].join(' ');
  const queryKeywords = extractKeywords(contextText);
  const nowMs = Date.now();

  const scored = active.map((item) => {
    const overlap = jaccardSimilarity(item.keywords, queryKeywords);
    const ageDays = Math.max(0, (nowMs - new Date(item.updatedAt).getTime()) / 86_400_000);
    const recencyBoost = Math.exp(-ageDays / 21) * 0.18;
    const coreBoost =
      item.kind === 'identity' || item.kind === 'preference'
        ? 0.42
        : item.kind === 'project' || item.kind === 'goal'
          ? 0.28
          : 0.12;
    const score = item.salience * 0.45 + item.confidence * 0.15 + overlap * 0.9 + recencyBoost + coreBoost;
    return { item, score, overlap };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected: AIMemoryItem[] = [];
  let usedChars = 0;
  for (const entry of scored) {
    // Skip low-relevance episodes/facts when there is zero overlap unless user asks about history/memory
    const asksRecall = /(记住|记得|我叫什么|我是谁|之前|上次|项目|背景|偏好|习惯|remember|recall|who am i|my project)/i.test(prompt);
    if (
      !asksRecall &&
      (entry.item.kind === 'episode' || entry.item.kind === 'fact') &&
      entry.overlap < 0.08 &&
      entry.item.salience < 0.85
    ) {
      continue;
    }

    const len = entry.item.content.length + 18;
    if (selected.length > 0 && usedChars + len > maxChars) continue;
    selected.push(entry.item);
    usedChars += len;
    if (selected.length >= 8) break;
  }

  // Record recall stats in-memory (persisted opportunistically on next write to avoid disk churn on reads)
  const nowIso = new Date().toISOString();
  for (const s of selected) {
    s.lastRecalledAt = nowIso;
    s.recallCount = (s.recallCount || 0) + 1;
  }

  return selected;
}

/**
 * Strict, Anti-Pollution Memory Extractor from a user message (+ optional recent context).
 * Extracts durable identity, active projects/goals, style preferences, explicit "remember" directives,
 * and handles explicit corrections ("我说错了/改名叫/不是X而是Y").
 */
export function extractMemoryCandidatesFromTurn(
  userPrompt: string,
  history: AIConversationMessage[] = []
): MemoryCandidate[] {
  const raw = cleanContent(userPrompt);
  if (!raw || isTransientOrPollutingText(raw)) return [];

  const candidates: MemoryCandidate[] = [];

  // 1. Explicit correction / superseding statements ("我刚才说错了...", "改名叫...", "不是 X，是 Y")
  const renameMatch = raw.match(
    /(?:其实|刚才说错了[,，]?|更正一下[,，]?|现在|已经)?(?:项目)?(?:改名叫?|换成了?|不是[^，。,]+[,，]?(?:而)?是)\s*[「《"']?([\u4e00-\u9fffA-Za-z0-9_\-\s]{2,28})[」》"']?/
  );
  if (renameMatch) {
    const correctedName = cleanContent(renameMatch[1]);
    const oldMatch = raw.match(/不是\s*[「《"']?([\u4e00-\u9fffA-Za-z0-9_\-\s]{2,24})[」》"']?/);
    if (correctedName && !/^(这样|那样|什么|怎么)/.test(correctedName)) {
      const aboutProject = /项目|产品|应用|app|系统|平台|earth\s*one/i.test(raw) ||
        history.slice(-4).some((h) => /项目|earth\s*one|开发|做一个/i.test(h.content));
      candidates.push({
        kind: aboutProject ? 'project' : 'fact',
        normalizedKey: aboutProject ? 'project.primary' : 'fact.corrected',
        content: aboutProject ? `当前核心项目名称为「${correctedName}」` : `已更正信息：${correctedName}`,
        confidence: 0.96,
        salience: 0.96,
        source: 'corrected',
        supersedesQuery: oldMatch?.[1]?.trim(),
      });
    }
  }

  // 2. Explicit "记住 / remember" instruction (can contain multiple clauses like name + project + style)
  const rememberMatch = raw.match(/^(?:请)?(?:帮我)?(?:记住|记一下|记下来|remember(?:\s+that)?)[：:,，\s]*(.+)$/i);
  if (rememberMatch) {
    const body = cleanContent(rememberMatch[1]);
    const clauses = body.split(/[，,；;。]+/).map(cleanContent).filter((c) => c.length >= 3);
    for (const clause of clauses) {
      if (/^(我叫|我是|叫我|my name is)/i.test(clause)) {
        const nameVal = clause.replace(/^(我叫|我是|叫我|请叫我|my name is)\s*/i, '').trim();
        if (nameVal && nameVal.length <= 24) {
          candidates.push({
            kind: 'identity',
            normalizedKey: 'identity.name',
            content: `用户的名字是「${nameVal}」`,
            confidence: 0.98,
            salience: 0.98,
            source: 'user_explicit',
          });
          continue;
        }
      }
      if (/(?:正在|在)(?:开发|做|构建|写|搭建)|项目/.test(clause)) {
        candidates.push({
          kind: 'project',
          normalizedKey: 'project.primary',
          content: clause,
          confidence: 0.95,
          salience: 0.95,
          source: 'user_explicit',
        });
        continue;
      }
      if (/(?:别|不要|不喜欢|尽量|习惯|以后回答|说话|简短|直接|客套|模板)/.test(clause)) {
        candidates.push({
          kind: 'preference',
          normalizedKey: 'style.anti_template',
          content: `交流偏好：${clause}`,
          confidence: 0.95,
          salience: 0.95,
          source: 'user_explicit',
        });
        continue;
      }
      candidates.push({
        kind: 'fact',
        normalizedKey: `fact.explicit_${extractKeywords(clause).slice(0, 2).join('_') || 'note'}`,
        content: clause,
        confidence: 0.92,
        salience: 0.9,
        source: 'user_explicit',
      });
    }
  }

  // 3. Name self-disclosure ("我叫星河" / "叫我 Alex")
  const nameMatch = raw.match(/(?:^|[，,。\s])(?:我叫|叫我|请叫我|my name is|call me)\s*([\u4e00-\u9fffA-Za-z0-9_-]{1,20})(?:$|[，,。！!\s])/i);
  if (nameMatch) {
    const nameVal = cleanContent(nameMatch[1]);
    if (nameVal && !/^(什么|谁|做|去|看)/.test(nameVal) && !candidates.some((c) => c.normalizedKey === 'identity.name')) {
      candidates.push({
        kind: 'identity',
        normalizedKey: 'identity.name',
        content: `用户的名字是「${nameVal}」`,
        confidence: 0.95,
        salience: 0.96,
        source: 'inferred',
      });
    }
  }

  // 4. Ongoing project or long-term goal ("我正在开发 X" / "，正在开发 EARTH ONE 项目")
  const projMatch = raw.match(
    /(?:^|[，,。\s])((?:(?:我)?(?:目前|现在)?(?:正在|在)(?:开发|构建|打造|设计|维护)|我(?:目前|现在)?(?:正在|在)?(?:开发|做|构建|打造|设计|写|维护)|我的项目是)\s*[\u4e00-\u9fffA-Za-z0-9\s_.-]{2,48})/
  );
  if (projMatch && !/测试一下|随便问问|玩一玩/.test(raw) && !candidates.some((c) => c.kind === 'project')) {
    const projClause = cleanContent(projMatch[1]);
    if (projClause.length >= 6 && projClause.length <= 80 && !renameMatch) {
      candidates.push({
        kind: 'project',
        normalizedKey: 'project.primary',
        content: projClause,
        confidence: 0.88,
        salience: 0.9,
        source: 'inferred',
      });
    }
  }

  const goalMatch = raw.match(/^(我想做一个\s*[\u4e00-\u9fffA-Za-z0-9\s]{2,28}|我希望它能够?.{4,40})$/);
  if (goalMatch && !/放歌|听歌|看书|看电影/.test(raw)) {
    candidates.push({
      kind: 'goal',
      normalizedKey: `goal.${extractKeywords(goalMatch[1]).slice(0, 2).join('_') || 'ai'}`,
      content: `用户目标：${cleanContent(goalMatch[1])}`,
      confidence: 0.84,
      salience: 0.85,
      source: 'inferred',
    });
  }

  // 5. Communication style & anti-robot preference ("我不希望它像机器人" / "别用首先其次" / "回答简短点")
  if (
    /(?:不要|别|不喜欢|讨厌|不希望|避免).{0,16}(?:机器人|机械|模板|客套|官方|啰嗦|首先|其次|最后|说明书|套话|长篇大论)/i.test(raw) ||
    /(?:直接说重点|简短一点|说话自然|像正常人|自然交流|说人话)/i.test(raw)
  ) {
    candidates.push({
      kind: 'preference',
      normalizedKey: 'style.anti_template',
      content: '交流风格偏好：像真人一样自然直接交流，去掉客套模板、说教感与长篇啰嗦。',
      confidence: 0.94,
      salience: 0.95,
      source: 'inferred',
    });
  }

  // 6. Explicit architectural/product decision ("就按这个方案" / "决定用 X")
  const decisionMatch = raw.match(/(?:我决定|就定|定下来|采用|确认使用|优先使用)\s*([^，。！？]{4,50})/);
  if (decisionMatch) {
    candidates.push({
      kind: 'decision',
      normalizedKey: `decision.${extractKeywords(decisionMatch[1]).slice(0, 2).join('_') || 'arch'}`,
      content: `已确认决定：${cleanContent(decisionMatch[1])}`,
      confidence: 0.86,
      salience: 0.84,
      source: 'inferred',
    });
  }

  return candidates;
}

export function commitMemoriesFromTurn(
  store: MemoryStoreBackend,
  profileKey: string,
  userPrompt: string,
  history: AIConversationMessage[] = []
): AIMemoryItem[] {
  const candidates = extractMemoryCandidatesFromTurn(userPrompt, history);
  if (candidates.length === 0) return [];

  const saved: AIMemoryItem[] = [];
  for (const cand of candidates) {
    const res = upsertMemory(store, profileKey, cand);
    saved.push(res.item);
  }
  return saved;
}
