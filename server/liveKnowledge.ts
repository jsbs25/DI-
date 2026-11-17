/**
 * Real-Time Precision Knowledge & Encyclopedic Answerer
 * Powers accurate factual replies when cloud LLM keys are absent or offline,
 * combining exact deterministic math/time/fact evaluation with live
 * Simplified Chinese / English Wikipedia single-trip extracts and DuckDuckGo Instant Answers.
 */
import { solvePrecisionQuery } from '../src/utils/precisionSolver.ts';
import { searchWeb } from './webFetcher.ts';

interface CachedAnswer {
  expiresAt: number;
  text: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const knowledgeCache = new Map<string, CachedAnswer>();

function cleanQuestionToTopic(raw: string): string {
  return raw
    .trim()
    .replace(
      /^(请问一下|请问|帮我查一下|帮我查查|查一下|搜一下|我想知道|你知道|能不能告诉我|能告诉我|介绍一下|讲讲|说说|解释一下|什么是|什么叫|谁是|哪里是|为什么|怎么解释|who is|what is|what are|tell me about|explain)\s*/i,
      ''
    )
    .replace(
      /(是谁写的|是哪个朝代的|是哪一年的|有多高|有多大|有多长|有多远|是什么意思|是什么|是谁|在哪里|在哪|哪里|吗|呢|呀|啊|吧|[？?！!。，,《》"'])/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeExtract(rawExtract: string, maxSentences = 2, maxChars = 190): string {
  const cleaned = rawExtract
    .replace(/\s+/g, ' ')
    .replace(/\[注\s*\d+\]|\[\d+\]/g, '')
    .trim();
  if (!cleaned) return '';

  const parts = cleaned.split(/(?<=[。！？.!?])\s*/).filter(Boolean);
  let out = '';
  for (let i = 0; i < Math.min(maxSentences, parts.length); i++) {
    const candidate = out ? `${out} ${parts[i]}` : parts[i];
    if (candidate.length > maxChars && out) break;
    out = candidate;
  }
  return out || cleaned.slice(0, maxChars);
}

async function queryWikipediaSingleTrip(topic: string, lang: 'zh' | 'en', isVoice: boolean): Promise<string | null> {
  if (!topic) return null;
  const host = lang === 'zh' ? 'zh.wikipedia.org' : 'en.wikipedia.org';
  const variantParam = lang === 'zh' ? '&variant=zh-cn' : '';
  const url =
    `https://${host}/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(topic)}` +
    `&gsrlimit=3&prop=extracts&exintro=1&explaintext=1&redirects=1${variantParam}&utf8=1&format=json`;

  try {
    const res = await fetch(url, {
      headers: {
        'Api-User-Agent': 'EarthOnePlatform/1.0 (https://earthone.world; library-qa)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(2200),
    });
    if (!res.ok) return null;
    const data: any = await res.json().catch(() => null);
    const pagesObj = data?.query?.pages;
    if (!pagesObj || typeof pagesObj !== 'object') return null;

    const pages = Object.values(pagesObj as Record<string, any>)
      .filter((p) => typeof p?.extract === 'string' && p.extract.trim().length > 12)
      .sort((a, b) => (a.index ?? 99) - (b.index ?? 99));

    // Skip disambiguation pages ("可以指：" / "may refer to:")
    const best =
      pages.find((p) => !/(可以指|may refer to|消歧义)/i.test(p.extract.slice(0, 80))) ||
      pages[0];
    if (!best?.extract) return null;

    return summarizeExtract(best.extract, isVoice ? 2 : 3, isVoice ? 165 : 340);
  } catch {
    return null;
  }
}

async function queryDuckDuckGoInstant(topic: string, isVoice: boolean): Promise<string | null> {
  if (!topic) return null;
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(topic)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'EarthOnePlatform/1.0' },
      signal: AbortSignal.timeout(1800),
    });
    if (!res.ok) return null;
    const data: any = await res.json().catch(() => null);
    const abs = String(data?.AbstractText || data?.Answer || '').trim();
    if (!abs) return null;
    return summarizeExtract(abs, isVoice ? 2 : 3, isVoice ? 170 : 340);
  } catch {
    return null;
  }
}

async function queryWebSnippetFallback(query: string, lang: 'zh' | 'en', isVoice: boolean): Promise<string | null> {
  try {
    const hits = await Promise.race([
      searchWeb(query, 4, 'auto', lang),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2200)),
    ]);
    if (!Array.isArray(hits) || hits.length === 0) return null;
    const usable = hits.find((h) => {
      const s = (h.snippet || '').trim();
      return s.length > 18 && !/Nearby places|Gas stations|Map details|Hotels Restaurants/i.test(s);
    });
    if (!usable) return null;
    return summarizeExtract(usable.snippet, isVoice ? 2 : 3, isVoice ? 165 : 320);
  } catch {
    return null;
  }
}

export async function answerWithLiveKnowledge(
  prompt: string,
  mode: string
): Promise<{ text: string; source: 'precision' | 'wikipedia' | 'duckduckgo' | 'web' | 'conversational' }> {
  const clean = prompt.trim();
  const hasCjk = /[\u4e00-\u9fff]/.test(clean);
  const isZh = hasCjk || !/[a-zA-Z]{3,}/.test(clean);
  const isVoice = mode === 'voice-agent';

  // 1. Exact deterministic math, date, unit & core knowledge (<1ms, 100% exact)
  const precision = solvePrecisionQuery(clean, isZh);
  if (precision) {
    return {
      text: precision.answer,
      source: 'precision',
    };
  }

  const topic = cleanQuestionToTopic(clean);
  const cacheKey = `${isZh ? 'zh' : 'en'}:${isVoice ? 'v' : 'g'}:${topic.toLowerCase()}`;
  const cached = knowledgeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { text: cached.text, source: 'wikipedia' };
  }

  // 2. Live Single-Trip Wikipedia + DuckDuckGo Instant Answer in parallel
  if (topic.length >= 2) {
    const [zhWiki, enWiki, ddg] = await Promise.all([
      isZh ? queryWikipediaSingleTrip(topic, 'zh', isVoice) : Promise.resolve(null),
      queryWikipediaSingleTrip(topic, 'en', isVoice),
      queryDuckDuckGoInstant(topic, isVoice),
    ]);

    const bestFact = (isZh ? zhWiki : enWiki) || ddg || zhWiki || enWiki;
    if (bestFact) {
      knowledgeCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, text: bestFact });
      return {
        text: bestFact,
        source: ddg && bestFact === ddg ? 'duckduckgo' : 'wikipedia',
      };
    }

    // 3. Web search snippet fallback
    const webFact = await queryWebSnippetFallback(topic, isZh ? 'zh' : 'en', isVoice);
    if (webFact) {
      knowledgeCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, text: webFact });
      return { text: webFact, source: 'web' };
    }
  }

  // 4. Sincere transparent fallback if offline/unrecognized
  const transparent = isZh
    ? isVoice
      ? '这个问题我现在没查到直接的百科词条，你可以换个关键词问我，或者在 AI 工作台配置 DeepSeek 密钥来解锁完整对话。'
      : '未能从实时百科检索到该问题的直接词条。您可以换用更明确的关键词，或在 DeepSeek 工作台填入 API 密钥以开启完整深度推理。'
    : isVoice
      ? 'I could not find a direct entry for that just now. Try a more specific keyword, or add a DeepSeek key in the AI Hub for open reasoning.'
      : 'No direct live encyclopedic entry matched that query. Try a more specific topic or add a DeepSeek key in the AI Hub for full open reasoning.';

  return { text: transparent, source: 'conversational' };
}
