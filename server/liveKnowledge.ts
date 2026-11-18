/**
 * Context-Aware Multi-Turn Dialogue & Live Knowledge Engine
 * Combines deterministic precision solving, long-term memory recall, multi-turn intent reasoning,
 * natural non-robotic dialogue generation, and live Wikipedia/DuckDuckGo/Web lookups ONLY when genuinely factual.
 */
import { solvePrecisionQuery } from '../src/utils/precisionSolver.ts';
import { matchPureSocialBanter } from '../src/utils/oneAgentController.ts';
import type { AIConversationMessage } from './aiConversation.ts';
import type { AIMemoryItem } from './aiMemory.ts';
import { analyzeTurnContext, normalizeColloquialAndTypos, type TurnContextAnalysis } from './aiIntent.ts';
import { searchWeb } from './webFetcher.ts';

interface CachedAnswer {
  expiresAt: number;
  text: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const knowledgeCache = new Map<string, CachedAnswer>();

export interface LiveDialogueContext {
  history?: AIConversationMessage[];
  memories?: AIMemoryItem[];
  savedMemories?: AIMemoryItem[];
  analysis?: TurnContextAnalysis;
  signal?: AbortSignal;
}

function buildFetchSignal(timeoutMs: number, externalSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!externalSignal) return timeoutSignal;
  if (typeof (AbortSignal as any).any === 'function') {
    return (AbortSignal as any).any([timeoutSignal, externalSignal]);
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (externalSignal.aborted) {
    controller.abort();
  } else {
    externalSignal.addEventListener('abort', abort, { once: true });
    timeoutSignal.addEventListener('abort', abort, { once: true });
  }
  return controller.signal;
}

function cleanQuestionToTopic(raw: string): string {
  return normalizeColloquialAndTypos(raw)
    .replace(
      /^(请问一下|请问|帮我查一下|帮我查查|查一下|搜一下|我想知道|你知道|能不能告诉我|能告诉我|介绍一下|讲讲|说说|解释一下|什么是|什么叫|谁是|哪里是|为什么|怎么解释|那个|who is|what is|what are|tell me about|explain)\s*/i,
      ''
    )
    .replace(
      /(能学啥|有什么用|怎么玩|好玩吗|是谁写的|是哪个朝代的|是哪一年的|有多高|有多大|有多长|有多远|是什么意思|是什么|是谁|在哪里|在哪|哪里|吗|呢|呀|啊|吧|[？?！!。，,《》"'])/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeExtract(rawExtract: string, maxSentences = 2, maxChars = 210): string {
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

async function queryWikipediaSingleTrip(
  topic: string,
  lang: 'zh' | 'en',
  isVoice: boolean,
  externalSignal?: AbortSignal
): Promise<string | null> {
  if (!topic || externalSignal?.aborted) return null;
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
      signal: buildFetchSignal(2200, externalSignal),
    });
    if (!res.ok) return null;
    const data: any = await res.json().catch(() => null);
    const pagesObj = data?.query?.pages;
    if (!pagesObj || typeof pagesObj !== 'object') return null;

    const pages = Object.values(pagesObj as Record<string, any>)
      .filter((p) => typeof p?.extract === 'string' && p.extract.trim().length > 12)
      .sort((a, b) => (a.index ?? 99) - (b.index ?? 99));

    const best =
      pages.find((p) => !/(可以指|may refer to|消歧义)/i.test(p.extract.slice(0, 80))) ||
      pages[0];
    if (!best?.extract) return null;

    return summarizeExtract(best.extract, isVoice ? 2 : 3, isVoice ? 165 : 340);
  } catch {
    return null;
  }
}

async function queryDuckDuckGoInstant(
  topic: string,
  isVoice: boolean,
  externalSignal?: AbortSignal
): Promise<string | null> {
  if (!topic || externalSignal?.aborted) return null;
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(topic)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'EarthOnePlatform/1.0' },
      signal: buildFetchSignal(1800, externalSignal),
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
      return s.length > 18 && !/Nearby places|Gas stations|Map details|Hotels Restaurants|Directions/i.test(s);
    });
    if (!usable) return null;
    return summarizeExtract(usable.snippet, isVoice ? 2 : 3, isVoice ? 165 : 320);
  } catch {
    return null;
  }
}

function buildMemoryRecallReply(
  prompt: string,
  memories: AIMemoryItem[],
  history: AIConversationMessage[],
  isZh: boolean
): string {
  const cleanMemories = memories.filter((m) => m.status === 'active');
  if (cleanMemories.length === 0) {
    if (history.length > 0) {
      const recentUser = history.filter((m) => m.role === 'user').map((m) => m.content).slice(-3);
      return isZh
        ? `这次我们主要聊了：${recentUser.join('、')}。跨会话的长期档案里你还没让我记下固定信息，如果有名字、项目或沟通偏好想让我一直带着，直接告诉我一声就行。`
        : `So far in this chat we talked about ${recentUser.join('; ')}. I don't have persistent personal notes saved yet—let me know anything you'd like me to remember.`;
    }
    return isZh
      ? '我目前还没存过你的专属长期档案。你可以直接告诉我你叫什么、在做什么项目，或者偏好的说话方式，之后开新对话我也都会记得。'
      : 'I do not have any long-term personal notes stored yet. Tell me your name, current project, or preferred tone anytime and I will carry it forward.';
  }

  const identity = cleanMemories.find((m) => m.kind === 'identity');
  const project = cleanMemories.find((m) => m.kind === 'project');
  const prefs = cleanMemories.filter((m) => m.kind === 'preference');
  const others = cleanMemories.filter((m) => m !== identity && m !== project && !prefs.includes(m));

  if (!isZh) {
    const bits: string[] = [];
    if (identity) bits.push(identity.content);
    if (project) bits.push(`your current focus is ${project.content}`);
    if (prefs.length > 0) bits.push(`your communication preference (${prefs[0].content})`);
    if (others.length > 0) bits.push(others.slice(0, 2).map((o) => o.content).join('; '));
    return `Here is what I have on file: ${bits.join(', ')}. Let me know if anything changed.`;
  }

  const parts: string[] = [];
  if (identity) parts.push(identity.content.replace(/^用户的名字是/, '你是'));
  if (project) parts.push(project.content.replace(/^当前核心项目名称为/, '你现在主推的项目是'));
  if (prefs.length > 0) parts.push(prefs[0].content.replace(/^交流风格偏好：/, '你喜欢'));
  if (others.length > 0 && /所有|全部|还有什么|记住什么|清单/.test(prompt)) {
    parts.push(`另外还记着：${others.slice(0, 3).map((o) => o.content).join('；')}`);
  }
  return `记得，${parts.join('，')}。如果有变动随时跟我说一声我就更新。`;
}

function buildContextualDialogueReply(
  analysis: TurnContextAnalysis,
  history: AIConversationMessage[],
  memories: AIMemoryItem[],
  savedMemories: AIMemoryItem[],
  isVoice: boolean
): string | null {
  const norm = analysis.normalizedPrompt;
  const recentText = history.slice(-6).map((m) => m.content).join('\n');
  const nameMem = memories.find((m) => m.normalizedKey === 'identity.name');
  const namePrefix = nameMem ? `${nameMem.content.replace(/.*「([^」]+)」.*/, '$1')}，` : '';

  // 1. Explicit correction or preference confirmation
  if (analysis.intent === 'preference_or_correction' || savedMemories.some((m) => m.source === 'corrected')) {
    if (savedMemories.length > 0) {
      const updated = savedMemories[savedMemories.length - 1];
      if (updated.kind === 'project') {
        return `明白，我把项目名称更新成「${updated.content.replace(/.*「([^」]+)」.*/, '$1')}」了，后面就按这个名字接着往下聊。`;
      }
      if (updated.kind === 'preference') {
        return '没问题，后面就按这个节奏来——直接说重点，不端架子也不套模板。';
      }
      return `收到，我已经更正记下了：${updated.content}。`;
    }
  }

  // 2. Memory recall question
  if (analysis.intent === 'memory_recall') {
    return buildMemoryRecallReply(norm, memories, history, analysis.isZh);
  }

  // 3. Domain-aware handling of EARTH ONE built-in features asked conversationally (e.g. "那个多林国能学啥")
  if (/多邻国/.test(norm) && /学啥|学什么|怎么|能干|有用|介绍/.test(norm)) {
    return '多邻国核心是把语言拆成高频短练习，覆盖英语、日语、韩语、西班牙语、法语和阿拉伯语这些语种，适合每天花几分钟练听说读写；如果只是想直接练真实口语，也能跟我用对话模式练习。';
  }

  // 4. Multi-turn Project Brainstorm & Follow-Up Continuity (e.g., AI companion architecture scenario)
  const isBuildingAiThread =
    /做.{0,6}ai|ai助手|语音助手|像机器人|自然交流|操作电脑|控制电脑/i.test(norm + '\n' + recentText);

  if (isBuildingAiThread && (analysis.intent === 'project_brainstorm' || analysis.intent === 'follow_up_elaboration')) {
    // Stage 3 / Focus on de-robotizing natural interaction
    if (/不像机器人|不希望.{0,6}机器人|像人一样|自然/.test(norm)) {
      if (isVoice) {
        return `${namePrefix}那重点就放在三件事：少用固定套话、接住上下文省略句、再把动作触发收紧，免得聊着天突然乱跳页面。`;
      }
      return `${namePrefix}既然你最在意「不希望像机器人」，核心其实不在换更大的模型，而是把体验理顺：把「动作触发」和「闲聊讨论」彻底拆开，日常顺口提到功能时绝不抢着跳页面；说话去掉说明书式的公式腔调，简单问题直接给核心答案，遇到省略句也能顺着上一轮语境接着聊；同时打通跨会话长期记忆，让你的项目、习惯和改口纠正一直带着走。

你现在最让你出戏的，是回答腔调太公式化，还是经常答非所问、记不住前面聊过什么？`;
    }

    // Stage 2: Clarified dual goals (chat + computer control)
    if (/(陪我聊天|陪我交流|操作电脑|控制电脑|操控)/.test(norm) && history.length > 0) {
      if (isVoice) {
        return '两条线合在一起时，关键是分清聊天和控制边界：平时顺着语气接话，有明确指令再调操作，这样才不会互相打架。';
      }
      return '把「自然陪聊」和「操控电脑」揉到同一个助手里，最容易翻车的地方就是边界打架——聊个思路时它突然弹窗或切页面，真的要执行操作时它又在长篇大论解释原理。\n\n我的建议是把「对话理解层」和「动作调度层」分开：日常交流走低延迟意图理解，只有确认是明确指令才放行给桌面/网页控制。你更看重它先帮你搞定哪类操作？';
    }

    // Stage 1: Initial broad goal ("我想做一个 AI")
    if (history.length === 0 || norm.length < 22) {
      if (isVoice) {
        return '好呀，你想让它偏哪一块——日常陪聊解闷、写代码做工具，还是帮你操作应用？';
      }
      return '可以聊聊。不过「做一个 AI」落到具体体验上差别很大——你最想让它帮你解决哪一类场景？比如是日常深度交流、帮写代码，还是直接接管电脑或网站操作？';
    }
  }

  // 5. General follow-up elaboration when we have recent context
  if (analysis.isFollowUp && history.length > 0) {
    const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content || '';
    const lastAssistant = [...history].reverse().find((m) => m.role === 'assistant')?.content || '';
    if (/为什么|原因|展开|具体|举个例/.test(norm) && lastAssistant) {
      return `接着刚才聊的「${lastUser.slice(0, 26)}」往下说：关键还是看具体使用场景——只要把触发边界、上下文衔接和记忆纠错这几处打磨顺，体感会立刻从「问答机」变成「顺手搭档」。你现在最想先深挖哪一环？`;
    }
    if (/对|没错|是的|确实/.test(norm) && norm.length < 12) {
      return `行，那咱们就沿着「${analysis.resolvedTopic.slice(0, 32)}」这条线继续推进，你接下来想动哪一块？`;
    }
  }

  // 6. Emotional & Humor & Casual turns (warm, non-cliché, respects brevity)
  if (analysis.sentiment === 'frustrated') {
    return isVoice
      ? '听出来确实被折腾得够呛，先别急，咱们挑最卡住的那一个点直接改顺。'
      : '确实容易让人火大。别整虚的，你直接告诉我现在最卡、最别扭的是哪一处，咱们一个个掰直。';
  }
  if (analysis.sentiment === 'tired') {
    return '先喘口气歇几分钟，不急着马上处理，想安静听首舒缓点的音乐或者随便聊两句我都陪着。';
  }
  if (analysis.intent === 'humor_or_irony') {
    return '哈哈你这吐槽太真实了，我尽量少说废话、多办正事，免得也被你归进人工智障行列。';
  }

  // 7. Remember confirmation alone
  if (savedMemories.length > 0 && /^(记住|记一下|以后|我叫|我是)/.test(norm)) {
    return `记住了，后面我会一直带着这条信息：${savedMemories.map((m) => m.content).join('；')}。`;
  }

  return null;
}

export async function answerWithLiveKnowledge(
  prompt: string,
  mode: string,
  context: LiveDialogueContext = {}
): Promise<{ text: string; source: 'precision' | 'wikipedia' | 'duckduckgo' | 'web' | 'conversational' | 'memory' }> {
  const clean = prompt.trim();
  const history = context.history || [];
  const memories = context.memories || [];
  const savedMemories = context.savedMemories || [];
  const analysis = context.analysis || analyzeTurnContext(clean, history, memories);
  const isZh = analysis.isZh;
  const isVoice = mode === 'voice-agent';

  // 1. Exact deterministic math, date, unit & core knowledge (<1ms, 100% exact)
  const precision = solvePrecisionQuery(analysis.normalizedPrompt, isZh);
  if (precision) {
    return {
      text: precision.answer,
      source: 'precision',
    };
  }

  // 2. Social banter when clearly casual greeting
  if (analysis.intent === 'casual_banter') {
    const banter = matchPureSocialBanter(analysis.normalizedPrompt, isZh);
    if (banter) {
      return { text: banter, source: 'conversational' };
    }
  }

  // 3. Context-aware multi-turn dialogue, memory recall & colloquial reasoning
  const contextualReply = buildContextualDialogueReply(analysis, history, memories, savedMemories, isVoice);
  if (contextualReply) {
    return {
      text: contextualReply,
      source: analysis.intent === 'memory_recall' ? 'memory' : 'conversational',
    };
  }

  // 4. Only perform external encyclopedia/web lookup when user genuinely wants factual lookup
  const shouldLookupExternal =
    analysis.intent === 'factual_lookup' ||
    analysis.intent === 'deep_reasoning';

  if (shouldLookupExternal) {
    const topic = cleanQuestionToTopic(clean);
    const cacheKey = `${isZh ? 'zh' : 'en'}:${isVoice ? 'v' : 'g'}:${topic.toLowerCase()}`;
    const cached = knowledgeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { text: cached.text, source: 'wikipedia' };
    }

    if (topic.length >= 2) {
      const [zhWiki, enWiki, ddg] = await Promise.all([
        isZh ? queryWikipediaSingleTrip(topic, 'zh', isVoice, context.signal) : Promise.resolve(null),
        queryWikipediaSingleTrip(topic, 'en', isVoice, context.signal),
        queryDuckDuckGoInstant(topic, isVoice, context.signal),
      ]);

      if (context.signal?.aborted) {
        const abortErr = new Error('Turn aborted');
        (abortErr as any).name = 'AbortError';
        throw abortErr;
      }

      const bestFact = (isZh ? zhWiki : enWiki) || ddg || zhWiki || enWiki;
      if (bestFact) {
        knowledgeCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, text: bestFact });
        return {
          text: bestFact,
          source: ddg && bestFact === ddg ? 'duckduckgo' : 'wikipedia',
        };
      }

      const webFact = await queryWebSnippetFallback(topic, isZh ? 'zh' : 'en', isVoice);
      if (context.signal?.aborted) {
        const abortErr = new Error('Turn aborted');
        (abortErr as any).name = 'AbortError';
        throw abortErr;
      }
      if (webFact) {
        knowledgeCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, text: webFact });
        return { text: webFact, source: 'web' };
      }
    }
  }

  // 5. Natural transparent conversational response (never cold "encyclopedia lookup failed" boilerplate)
  const fallbackNatural = isZh
    ? isVoice
      ? '我明白你的意思，如果你想针对具体细节深入讨论，可以多说一点背景，我随时接着聊。'
      : '我跟上你的意思了。你可以把具体的场景或卡点再补充一两句，我顺着当前上下文帮你一起梳理。'
    : 'I follow what you mean—share a bit more context or the specific tradeoff you are weighing and we can work right through it.';

  return { text: fallbackNatural, source: 'conversational' };
}
