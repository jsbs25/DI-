import type { Express, Request, Response } from 'express';
import { runUnifiedAiTurn } from './ai/unifiedAiCore.ts';

export interface DictionaryExample {
  en: string;
  zh?: string;
}

export interface DictionarySense {
  partOfSpeech: string;
  cefr?: string;
  guideword?: string;
  definitionEn: string;
  definitionZh?: string;
  examples: DictionaryExample[];
}

export interface DictionaryCollocation {
  phrase: string;
  zh?: string;
}

export interface AuthoritativeDictionaryEntry {
  word: string;
  lemma: string;
  language: 'en' | 'ar' | 'zh' | 'other';
  cefrLevel?: string;
  ukPhonetic?: string;
  usPhonetic?: string;
  reading?: string;
  ukAudioUrl?: string;
  usAudioUrl?: string;
  audioUrl?: string;
  wordForms: string[];
  root?: string;
  etymology?: string;
  usageNote?: string;
  contextMeaning?: string;
  senses: DictionarySense[];
  collocations: DictionaryCollocation[];
  synonyms: string[];
  antonyms: string[];
  related: string[];
  sources: string[];
}

interface CacheEntry {
  data: AuthoritativeDictionaryEntry;
  expiresAt: number;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ITEMS = 400;
const dictCache = new Map<string, CacheEntry>();

function getCached(key: string): AuthoritativeDictionaryEntry | null {
  const hit = dictCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    dictCache.delete(key);
    return null;
  }
  return hit.data;
}

function setCached(key: string, data: AuthoritativeDictionaryEntry) {
  if (dictCache.size >= MAX_CACHE_ITEMS) {
    const firstKey = dictCache.keys().next().value;
    if (firstKey) dictCache.delete(firstKey);
  }
  dictCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function detectLanguage(word: string): 'en' | 'ar' | 'zh' | 'other' {
  if (/[\u0600-\u06FF]/.test(word)) return 'ar';
  if (/[\u4E00-\u9FFF]/.test(word)) return 'zh';
  if (/^[a-zA-Z][a-zA-Z\s'-]*$/.test(word)) return 'en';
  return 'other';
}

interface FreeDictPayload {
  word?: string;
  phonetic?: string;
  ukPhonetic?: string;
  usPhonetic?: string;
  ukAudioUrl?: string;
  usAudioUrl?: string;
  audioUrl?: string;
  origin?: string;
  senses: DictionarySense[];
  synonyms: string[];
  antonyms: string[];
}

async function fetchFreeDictionaryEn(word: string): Promise<FreeDictPayload | null> {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
      signal: AbortSignal.timeout(4200),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!Array.isArray(json) || !json[0]) return null;

    const entry = json[0];
    const phonetics: any[] = Array.isArray(entry.phonetics) ? entry.phonetics : [];
    let ukPhonetic = '';
    let usPhonetic = '';
    let ukAudioUrl = '';
    let usAudioUrl = '';
    let firstPhonetic = typeof entry.phonetic === 'string' ? entry.phonetic : '';
    let firstAudio = '';

    for (const p of phonetics) {
      const text = typeof p?.text === 'string' ? p.text.trim() : '';
      const audio = typeof p?.audio === 'string' ? p.audio.trim() : '';
      if (text && !firstPhonetic) firstPhonetic = text;
      if (audio && !firstAudio) firstAudio = audio;
      const lowerAudio = audio.toLowerCase();
      if (lowerAudio.includes('-uk.') || lowerAudio.includes('_uk') || lowerAudio.includes('/uk')) {
        if (audio && !ukAudioUrl) ukAudioUrl = audio;
        if (text && !ukPhonetic) ukPhonetic = text;
      } else if (lowerAudio.includes('-us.') || lowerAudio.includes('_us') || lowerAudio.includes('/us')) {
        if (audio && !usAudioUrl) usAudioUrl = audio;
        if (text && !usPhonetic) usPhonetic = text;
      }
    }

    const senses: DictionarySense[] = [];
    const synSet = new Set<string>();
    const antSet = new Set<string>();

    if (Array.isArray(entry.meanings)) {
      for (const m of entry.meanings.slice(0, 5)) {
        const pos = String(m.partOfSpeech || 'term');
        if (Array.isArray(m.synonyms)) m.synonyms.forEach((s: any) => s && synSet.add(String(s)));
        if (Array.isArray(m.antonyms)) m.antonyms.forEach((a: any) => a && antSet.add(String(a)));
        const defs = Array.isArray(m.definitions) ? m.definitions.slice(0, 3) : [];
        for (const d of defs) {
          if (Array.isArray(d.synonyms)) d.synonyms.forEach((s: any) => s && synSet.add(String(s)));
          if (Array.isArray(d.antonyms)) d.antonyms.forEach((a: any) => a && antSet.add(String(a)));
          if (d?.definition) {
            senses.push({
              partOfSpeech: pos,
              definitionEn: String(d.definition),
              examples: d.example ? [{ en: String(d.example) }] : [],
            });
          }
        }
      }
    }

    return {
      word: String(entry.word || word),
      phonetic: firstPhonetic || undefined,
      ukPhonetic: ukPhonetic || firstPhonetic || undefined,
      usPhonetic: usPhonetic || firstPhonetic || undefined,
      ukAudioUrl: ukAudioUrl || undefined,
      usAudioUrl: usAudioUrl || undefined,
      audioUrl: usAudioUrl || ukAudioUrl || firstAudio || undefined,
      origin: typeof entry.origin === 'string' ? entry.origin : undefined,
      senses: senses.slice(0, 6),
      synonyms: Array.from(synSet).slice(0, 8),
      antonyms: Array.from(antSet).slice(0, 6),
    };
  } catch {
    return null;
  }
}

async function fetchDatamuseRelated(word: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(word)}&max=10`, {
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (!Array.isArray(json)) return [];
    return json
      .map((item: any) => String(item?.word || '').trim())
      .filter((w: string) => w && w.toLowerCase() !== word.toLowerCase())
      .slice(0, 8);
  } catch {
    return [];
  }
}

async function fetchAiCambridgeEnrichment(
  word: string,
  detectedLang: 'en' | 'ar' | 'zh' | 'other',
  contextSentence?: string
): Promise<Partial<AuthoritativeDictionaryEntry> | null> {
  const systemInstruction =
    detectedLang === 'en'
      ? `你是剑桥词典（Cambridge Dictionary）与牛津高阶英汉双解标准词典编纂引擎。请对输入的英文词条返回严格 JSON（不要加 markdown 代码块，不要解释），格式如下：
{
  "lemma": "原形",
  "cefrLevel": "A1/A2/B1/B2/C1/C2 之一",
  "ukPhonetic": "/英式IPA/",
  "usPhonetic": "/美式IPA/",
  "wordForms": ["复数/过去式/分词/派生词，最多4个"],
  "senses": [
    {
      "partOfSpeech": "noun/verb/adjective/adverb/idiom",
      "cefr": "B2",
      "guideword": "2-4字核心语义标签",
      "definitionEn": "concise Cambridge learner English definition",
      "definitionZh": "精准地道中文释义",
      "examples": [{"en": "Natural idiomatic example sentence.", "zh": "对应中文翻译。"}]
    }
  ],
  "collocations": [{"phrase": "high-frequency collocation", "zh": "中文含义"}],
  "synonyms": ["synonym1", "synonym2"],
  "antonyms": ["antonym1"],
  "usageNote": "一句精炼的用法辨析、语域或语法提醒（中文）",
  "etymology": "简明词根词源（中文，25字内）",
  "contextMeaning": "若提供上下文，说明该词在语境中的确切含义，否则留空"
}
要求：senses 返回 2-4 条最核心义项，每条附 1-2 个自然双语例句；collocations 返回 3-5 个高频搭配。`
      : `你是权威多语双解词典引擎（精通阿拉伯语古典与现代标准语、英语、汉语）。请对输入词条返回严格 JSON（不要加 markdown 代码块）：
{
  "lemma": "词典原形",
  "reading": "完整发音（阿语须带完整标音 Tashkeel + 拉丁转写；汉语给拼音；其他给 IPA）",
  "root": "词根（如阿语三母词根 ك-ت-ب）或留空",
  "wordForms": ["常见词形变化/复数/变位，最多4个"],
  "senses": [
    {
      "partOfSpeech": "词性",
      "guideword": "核心义项标签",
      "definitionEn": "concise English gloss",
      "definitionZh": "精准中文释义",
      "examples": [{"en": "原语自然例句", "zh": "中文翻译"}]
    }
  ],
  "collocations": [{"phrase": "常见搭配", "zh": "中文释义"}],
  "synonyms": ["近义词"],
  "antonyms": ["反义词"],
  "usageNote": "用法与语法要点（中文）",
  "etymology": "词源简注（中文）",
  "contextMeaning": "若提供上下文，说明在此语境下的确切含义"
}`;

  const prompt = [
    `查询词条：${word}`,
    contextSentence ? `语境句子：${contextSentence.slice(0, 320)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const result = await runUnifiedAiTurn({
      systemInstruction,
      prompt,
      speed: 'fast',
      maxTokens: 950,
      temperature: 0.25,
    });
    const raw = (result.content || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Partial<AuthoritativeDictionaryEntry>;
  } catch {
    return null;
  }
}

export async function lookupAuthoritativeDictionary(
  rawWord: string,
  contextSentence?: string
): Promise<AuthoritativeDictionaryEntry> {
  const cleaned = rawWord.trim().slice(0, 80);
  const detectedLang = detectLanguage(cleaned);
  const normalizedWord = detectedLang === 'en' ? cleaned.toLowerCase().replace(/[^a-z\s'-]/g, '').trim() : cleaned;
  const cacheKey = `${detectedLang}:${normalizedWord.toLowerCase()}:${contextSentence ? contextSentence.slice(0, 80) : ''}`;

  const cached = getCached(cacheKey);
  if (cached) return cached;

  const sources: string[] = [];

  if (detectedLang === 'en') {
    const [freeDict, related, aiRich] = await Promise.all([
      fetchFreeDictionaryEn(normalizedWord),
      fetchDatamuseRelated(normalizedWord),
      fetchAiCambridgeEnrichment(normalizedWord, 'en', contextSentence),
    ]);

    if (freeDict) sources.push('Oxford/Wiktionary Phonetics');
    if (related.length > 0) sources.push('Datamuse Lexicon');
    if (aiRich) sources.push('Cambridge Bilingual Standard');

    const aiSenses: DictionarySense[] = Array.isArray(aiRich?.senses)
      ? aiRich.senses
          .filter((s: any) => s && (s.definitionZh || s.definitionEn))
          .slice(0, 5)
          .map((s: any) => ({
            partOfSpeech: String(s.partOfSpeech || 'term'),
            cefr: typeof s.cefr === 'string' ? s.cefr : undefined,
            guideword: typeof s.guideword === 'string' ? s.guideword : undefined,
            definitionEn: String(s.definitionEn || ''),
            definitionZh: typeof s.definitionZh === 'string' ? s.definitionZh : undefined,
            examples: Array.isArray(s.examples)
              ? s.examples
                  .filter((ex: any) => ex && ex.en)
                  .slice(0, 2)
                  .map((ex: any) => ({ en: String(ex.en), zh: typeof ex.zh === 'string' ? ex.zh : undefined }))
              : [],
          }))
      : [];

    const mergedSenses: DictionarySense[] =
      aiSenses.length > 0
        ? aiSenses
        : (freeDict?.senses || []).map((s) => ({
            ...s,
            definitionZh: s.definitionZh || undefined,
          }));

    const synSet = new Set<string>([
      ...(Array.isArray(aiRich?.synonyms) ? aiRich.synonyms.map(String) : []),
      ...(freeDict?.synonyms || []),
    ]);
    const antSet = new Set<string>([
      ...(Array.isArray(aiRich?.antonyms) ? aiRich.antonyms.map(String) : []),
      ...(freeDict?.antonyms || []),
    ]);

    const ukPhonetic = freeDict?.ukPhonetic || (typeof aiRich?.ukPhonetic === 'string' ? aiRich.ukPhonetic : undefined) || freeDict?.phonetic;
    const usPhonetic = freeDict?.usPhonetic || (typeof aiRich?.usPhonetic === 'string' ? aiRich.usPhonetic : undefined) || freeDict?.phonetic;

    const entry: AuthoritativeDictionaryEntry = {
      word: freeDict?.word || normalizedWord,
      lemma: typeof aiRich?.lemma === 'string' && aiRich.lemma.trim() ? aiRich.lemma.trim() : freeDict?.word || normalizedWord,
      language: 'en',
      cefrLevel: typeof aiRich?.cefrLevel === 'string' ? aiRich.cefrLevel.trim().toUpperCase() : undefined,
      ukPhonetic,
      usPhonetic,
      reading: usPhonetic || ukPhonetic || '',
      ukAudioUrl: freeDict?.ukAudioUrl,
      usAudioUrl: freeDict?.usAudioUrl,
      audioUrl: freeDict?.audioUrl,
      wordForms: Array.isArray(aiRich?.wordForms) ? aiRich.wordForms.map(String).filter(Boolean).slice(0, 5) : [],
      etymology: (typeof aiRich?.etymology === 'string' && aiRich.etymology.trim()) || freeDict?.origin || undefined,
      usageNote: typeof aiRich?.usageNote === 'string' && aiRich.usageNote.trim() ? aiRich.usageNote.trim() : undefined,
      contextMeaning: typeof aiRich?.contextMeaning === 'string' && aiRich.contextMeaning.trim() ? aiRich.contextMeaning.trim() : undefined,
      senses: mergedSenses,
      collocations: Array.isArray(aiRich?.collocations)
        ? aiRich.collocations
            .filter((c: any) => c && c.phrase)
            .slice(0, 6)
            .map((c: any) => ({ phrase: String(c.phrase), zh: typeof c.zh === 'string' ? c.zh : undefined }))
        : [],
      synonyms: Array.from(synSet).filter(Boolean).slice(0, 8),
      antonyms: Array.from(antSet).filter(Boolean).slice(0, 6),
      related: related.slice(0, 8),
      sources: sources.length ? sources : ['EARTH ONE Lexicon'],
    };

    if (entry.senses.length > 0) setCached(cacheKey, entry);
    return entry;
  }

  // Non-English (Arabic, Chinese, etc.)
  const aiRich = await fetchAiCambridgeEnrichment(normalizedWord, detectedLang, contextSentence);
  if (aiRich) sources.push('ONE Multilingual Lexicon');

  const entry: AuthoritativeDictionaryEntry = {
    word: normalizedWord,
    lemma: typeof aiRich?.lemma === 'string' && aiRich.lemma.trim() ? aiRich.lemma.trim() : normalizedWord,
    language: detectedLang,
    reading: typeof aiRich?.reading === 'string' ? aiRich.reading.trim() : '',
    root: typeof aiRich?.root === 'string' && aiRich.root.trim() ? aiRich.root.trim() : undefined,
    wordForms: Array.isArray(aiRich?.wordForms) ? aiRich.wordForms.map(String).filter(Boolean).slice(0, 5) : [],
    etymology: typeof aiRich?.etymology === 'string' && aiRich.etymology.trim() ? aiRich.etymology.trim() : undefined,
    usageNote: typeof aiRich?.usageNote === 'string' && aiRich.usageNote.trim() ? aiRich.usageNote.trim() : undefined,
    contextMeaning: typeof aiRich?.contextMeaning === 'string' && aiRich.contextMeaning.trim() ? aiRich.contextMeaning.trim() : undefined,
    senses: Array.isArray(aiRich?.senses)
      ? aiRich.senses
          .filter((s: any) => s && (s.definitionZh || s.definitionEn))
          .slice(0, 5)
          .map((s: any) => ({
            partOfSpeech: String(s.partOfSpeech || '词条'),
            guideword: typeof s.guideword === 'string' ? s.guideword : undefined,
            definitionEn: String(s.definitionEn || ''),
            definitionZh: typeof s.definitionZh === 'string' ? s.definitionZh : undefined,
            examples: Array.isArray(s.examples)
              ? s.examples
                  .filter((ex: any) => ex && ex.en)
                  .slice(0, 2)
                  .map((ex: any) => ({ en: String(ex.en), zh: typeof ex.zh === 'string' ? ex.zh : undefined }))
              : [],
          }))
      : [],
    collocations: Array.isArray(aiRich?.collocations)
      ? aiRich.collocations
          .filter((c: any) => c && c.phrase)
          .slice(0, 6)
          .map((c: any) => ({ phrase: String(c.phrase), zh: typeof c.zh === 'string' ? c.zh : undefined }))
      : [],
    synonyms: Array.isArray(aiRich?.synonyms) ? aiRich.synonyms.map(String).filter(Boolean).slice(0, 8) : [],
    antonyms: Array.isArray(aiRich?.antonyms) ? aiRich.antonyms.map(String).filter(Boolean).slice(0, 6) : [],
    related: [],
    sources: sources.length ? sources : ['ONE Lexicon'],
  };

  if (entry.senses.length > 0) setCached(cacheKey, entry);
  return entry;
}

export function registerAuthoritativeDictionaryRoutes(app: Express) {
  const handleLookup = async (req: Request, res: Response) => {
    const rawWord =
      typeof req.query.word === 'string'
        ? req.query.word
        : typeof req.body?.word === 'string'
        ? req.body.word
        : '';
    const contextSentence =
      typeof req.query.context === 'string'
        ? req.query.context
        : typeof req.body?.contextSentence === 'string'
        ? req.body.contextSentence
        : undefined;

    if (!rawWord.trim()) {
      return res.status(400).json({ success: false, error: '请输入需要查询的词条 / Word is required' });
    }

    try {
      const entry = await lookupAuthoritativeDictionary(rawWord, contextSentence);
      return res.json({ success: true, entry });
    } catch (err: any) {
      return res.status(503).json({
        success: false,
        error: err?.message || '词典服务暂时不可用，请稍后重试。',
      });
    }
  };

  app.get('/api/dictionary/lookup', handleLookup);
  app.post('/api/dictionary/lookup', handleLookup);

  app.get('/api/dictionary/suggest', async (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q || q.length < 1 || !/^[a-zA-Z'-]+$/.test(q)) {
      return res.json({ success: true, suggestions: [] });
    }
    try {
      const r = await fetch(`https://api.datamuse.com/sug?s=${encodeURIComponent(q)}&max=8`, {
        signal: AbortSignal.timeout(2500),
      });
      if (!r.ok) return res.json({ success: true, suggestions: [] });
      const data = await r.json();
      const suggestions = Array.isArray(data)
        ? data.map((item: any) => String(item?.word || '')).filter(Boolean).slice(0, 8)
        : [];
      return res.json({ success: true, suggestions });
    } catch {
      return res.json({ success: true, suggestions: [] });
    }
  });
}
