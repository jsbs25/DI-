/**
 * EARTH ONE — Human Intent, Colloquial Normalizer & Selective Memory Extractor
 * Understands colloquialisms, typos, implicit follow-ups, emotional subtext,
 * humor, disagreements, and distinguishes durable memories from transient chatter.
 */
import type { AISessionRecord, UpsertMemoryInput } from './memoryStore.ts';

export type DialogueIntentKind =
  | 'memory_management'
  | 'task_control'
  | 'disagreement_or_correction'
  | 'follow_up_continuation'
  | 'emotional_vent'
  | 'humor_or_banter'
  | 'brainstorm_or_discussion'
  | 'deep_analysis_request'
  | 'factual_question'
  | 'casual_greeting';

export interface DialogueIntentAnalysis {
  rawInput: string;
  normalizedInput: string;
  isZh: boolean;
  kind: DialogueIntentKind;
  complexity: 'simple' | 'medium' | 'deep';
  toneHint: 'playful' | 'frustrated' | 'skeptical' | 'casual' | 'focused' | 'warm';
  isContinuation: boolean;
  asksForDirectBriefAnswer: boolean;
  memoryAction?: {
    type: 'recall_query' | 'remember_explicit' | 'forget_explicit';
    target?: string;
  };
  impliedFocus: string;
  topicHint: string;
}

const TYPO_COLLOQUIAL_MAP: Array<[RegExp, string | ((m: string) => string)]> = [
  [/机器银|机气人|机器儿/g, '机器人'],
  [/咋搞|咋弄|怎么搞定|肿么办|咋办/g, '怎么解决'],
  [/神马|啥玩意|啥东西/g, '什么'],
  [/酱紫|介样/g, '这样'],
  [/木有|没得/g, '没有'],
  [/蓝瘦/g, '难受'],
  [/别整虚的|少来虚的|别说废话|说重点/g, '直接说核心重点'],
  [/整一个|搞一个|弄一个|整点/g, '做一个'],
  [/帮我瞅瞅|帮看看/g, '帮我看看'],
  [/能不能行啊/g, '可不可行'],
  [/不咋地|不咋样/g, '不太好'],
  [/贼快|巨快|贼慢/g, (m: string) => (m.includes('慢') ? '非常慢' : '非常快')],
  [/多林国/g, '多邻国'],
  [/记录片/g, '纪录片'],
  [/星寰影院/g, '星环影院'],
];

export function normalizeColloquialInput(raw: string): string {
  let out = raw.trim().replace(/\s+/g, ' ');
  for (const [pattern, replacement] of TYPO_COLLOQUIAL_MAP) {
    out = out.replace(pattern, replacement as any);
  }
  return out;
}

export function analyzeDialogueTurn(
  rawInput: string,
  session?: AISessionRecord | null,
  historyCount = 0
): DialogueIntentAnalysis {
  const raw = rawInput.trim();
  const normalized = normalizeColloquialInput(raw);
  const isZh = /[\u4e00-\u9fff]/.test(normalized) || !/[a-zA-Z]{3,}/.test(normalized);
  const len = normalized.length;

  // 1. Explicit memory query / forget / remember command
  if (/^(记住|帮我记住|记一下|请记住|remember that|don't forget)/i.test(normalized)) {
    const target = normalized
      .replace(/^(记住|帮我记住|记一下|请记住|remember that|don't forget)[：:，,\s]*/i, '')
      .trim();
    return {
      rawInput: raw,
      normalizedInput: normalized,
      isZh,
      kind: 'memory_management',
      complexity: 'simple',
      toneHint: 'focused',
      isContinuation: false,
      asksForDirectBriefAnswer: true,
      memoryAction: { type: 'remember_explicit', target },
      impliedFocus: '持久化记住用户给出的信息并在后续对话生效',
      topicHint: session?.activeTopic || '',
    };
  }

  if (/(忘掉|忘记|删掉记忆|清除记忆|别记|forget that|delete memory)/i.test(normalized)) {
    const target = normalized
      .replace(/.*(忘掉|忘记|删掉记忆|清除记忆|别记|forget that|delete memory)\s*/i, '')
      .replace(/(这个|这条|刚才说的|那个|记录|记忆)[。！!]?$/g, '')
      .trim();
    return {
      rawInput: raw,
      normalizedInput: normalized,
      isZh,
      kind: 'memory_management',
      complexity: 'simple',
      toneHint: 'focused',
      isContinuation: false,
      asksForDirectBriefAnswer: true,
      memoryAction: { type: 'forget_explicit', target },
      impliedFocus: '清理指定错误或过期记忆',
      topicHint: session?.activeTopic || '',
    };
  }

  if (/(你还记得|记得我|我之前(跟你说过|说过|做过|选过|喜欢)|你知道我是谁|你知道我在做|what do you remember)/i.test(normalized)) {
    return {
      rawInput: raw,
      normalizedInput: normalized,
      isZh,
      kind: 'memory_management',
      complexity: 'medium',
      toneHint: 'warm',
      isContinuation: false,
      asksForDirectBriefAnswer: true,
      memoryAction: { type: 'recall_query', target: normalized },
      impliedFocus: '结合长期记忆回答对用户背景、目标与偏好的了解',
      topicHint: session?.activeTopic || '',
    };
  }

  // 2. Detect continuation / implicit reference cues
  const hasContinuationCue =
    /^(对|嗯|是啊|没错|是的|但是|不过|可是|那|还有|然后|顺便|顺着|沿着|回到|聊回|另外|如果|假设|那要是|为什么不|接着|继续|就这个|就按|关于刚才|你刚说|不对|不是的|我决定|改用|换成|but|and|so|yeah|yes|wait|also|what if)/i.test(
      normalized
    ) ||
    /(它|这个|那个|这玩意|那样|前面说的|刚才那个|刚才的|像机器人|不像人|先做哪|先搞哪)/.test(normalized);

  const hasActiveTopic = Boolean(session?.activeTopic || session?.activeGoal || historyCount > 0);
  const isContinuation = hasContinuationCue && hasActiveTopic;

  // 3. Tone & Subtext
  let toneHint: DialogueIntentAnalysis['toneHint'] = 'casual';
  if (/哈哈|嘿嘿|逗|搞笑|开玩笑|lol|haha|jk/i.test(normalized)) toneHint = 'playful';
  else if (/烦死|崩溃|受不了|无语|搞砸|难受|累死|气死|蠢|傻|听不懂人话|烂|frustrated|annoyed/i.test(normalized)) toneHint = 'frustrated';
  else if (/真的吗|骗人|吹牛|我不信|真的假的|未必|未必吧|难道|sarcasm|really\?|sure/i.test(normalized)) toneHint = 'skeptical';
  else if (/怎么|为什么|架构|方案|设计|对比|优缺点|分析|帮我写|实现|原理|explain|design|compare/i.test(normalized)) toneHint = 'focused';

  // 4. Kind classification
  let kind: DialogueIntentKind = 'factual_question';
  if (/^(你好|您好|嗨|哈喽|在吗|早安|晚安|你在干嘛|干嘛呢|在干嘛|吃饭了吗|hi|hello|hey)[!！?？。~～]*$/i.test(normalized)) {
    kind = 'casual_greeting';
  } else if (/不对|不是(这|那|这个|我说的)|你理解错了|跑偏了|太长|像机器人|太官方|模板|废话|说人话|别啰嗦|not what i meant|too robotic/i.test(normalized)) {
    kind = 'disagreement_or_correction';
  } else if (toneHint === 'frustrated' && len < 45 && !/[？?]/.test(normalized)) {
    kind = 'emotional_vent';
  } else if (toneHint === 'playful' && len < 40) {
    kind = 'humor_or_banter';
  } else if (
    /(我想做|我要做|打算做|正在做|设计一个|规划|聊聊|你怎么看|你觉得|思路|方向|构想|陪我交流|操作电脑|控制电脑|我决定|改用|换成|以后统一|长期|习惯|目标是|build an ai|want to make)/i.test(
      normalized
    )
  ) {
    kind = 'brainstorm_or_discussion';
  } else if (isContinuation) {
    kind = 'follow_up_continuation';
  } else if (
    len > 45 ||
    /(详细|深入|对比|区别|优劣|架构|原理|步骤|代码|方案|analyze|compare|architecture|implement)/i.test(normalized)
  ) {
    kind = 'deep_analysis_request';
  } else if (/(帮我|给我|打开|播放|搜索|换|停|改|整理|写一份|生成)/i.test(normalized)) {
    kind = 'task_control';
  }

  // 5. Reply complexity calibration
  let complexity: 'simple' | 'medium' | 'deep' = 'medium';
  if (kind === 'casual_greeting' || (len <= 18 && !/(为什么|怎么实现|对比|架构|区别|分析)/.test(normalized))) {
    complexity = 'simple';
  } else if (
    kind === 'deep_analysis_request' ||
    kind === 'brainstorm_or_discussion' ||
    kind === 'disagreement_or_correction' ||
    len >= 42
  ) {
    complexity = isContinuation && len < 26 ? 'medium' : 'deep';
  }
  if (kind === 'follow_up_continuation' && session?.activeTopic) {
    complexity = len < 20 ? 'medium' : 'deep';
  }

  // Extract topic hint for multi-turn continuity (never overwrite topic with transient math/time lookups)
  const isTransientLookup = /\d\s*[+\-*/×÷=等于]|几点|几号|星期几|天气/.test(normalized);
  let topicHint = session?.activeTopic || '';
  if (!isTransientLookup && (kind === 'brainstorm_or_discussion' || (!isContinuation && len >= 8 && kind !== 'casual_greeting' && kind !== 'factual_question'))) {
    const aiProject = normalized.match(/(?:做|开发|打造|设计)(?:一个|款|个)?\s*([^，。！？,.!?]{2,32})/);
    if (aiProject?.[1]) {
      topicHint = aiProject[1].trim();
    } else if (!isContinuation && normalized.length <= 42 && kind !== 'emotional_vent' && !/(我决定|改用|换成)/.test(normalized)) {
      topicHint = normalized.replace(/[？?！!。，,]/g, '').trim();
    }
  }

  // Derive implied human focus
  let impliedFocus = '直接回应核心诉求';
  if (kind === 'disagreement_or_correction') {
    impliedFocus = `纠正理解偏差并贴合用户真正想要的体验（聚焦：${session?.activeTopic || normalized}）`;
  } else if (kind === 'follow_up_continuation' && session?.activeTopic) {
    impliedFocus = `延续同一话题「${session.activeTopic}」深入探讨，不要退回基础概念解释`;
  } else if (kind === 'brainstorm_or_discussion') {
    impliedFocus = '以共创伙伴视角给出有见地、可落地的思考与取舍，适时提出关键权衡或追问';
  } else if (kind === 'emotional_vent') {
    impliedFocus = '先接住情绪、像熟人一样共情回应，再看对方愿不愿聊细节，绝不讲大道理';
  } else if (kind === 'humor_or_banter') {
    impliedFocus = '接住玩笑话和弦外之音，自然幽默互动';
  }

  const asksForDirectBriefAnswer =
    complexity === 'simple' || /(简单说|直接说|一句话|别太长|直白)/i.test(normalized);

  return {
    rawInput: raw,
    normalizedInput: normalized,
    isZh,
    kind,
    complexity,
    toneHint,
    isContinuation,
    asksForDirectBriefAnswer,
    impliedFocus,
    topicHint,
  };
}

/**
 * Extracts high-value durable facts, preferences, projects, goals, habits, and decisions.
 * Never saves temporary small talk or unverified noise.
 */
export function extractMemoryCandidates(
  rawUserInput: string,
  session?: AISessionRecord | null
): UpsertMemoryInput[] {
  const normalized = normalizeColloquialInput(rawUserInput);
  const userId = session?.userId || 'guest';
  const sessionId = session?.id || '';
  const candidates: UpsertMemoryInput[] = [];

  if (!normalized || normalized.length < 4) return candidates;
  if (/^(你好|在吗|你在干嘛|吃饭了吗|早安|晚安|谢谢|1\+1|今天几号|现在几点)/i.test(normalized)) {
    return candidates;
  }

  // A. Communication style preferences ("不要太生硬", "别像机器人", "说人话/简洁")
  if (/(不喜欢|不希望|别|不要|讨厌|反感).{0,12}(像机器人|机器人|模板|套话|首先.*其次|总结一下|官方腔|太啰嗦|长篇大论)/i.test(normalized)) {
    candidates.push({
      userId,
      category: 'preference',
      canonicalKey: 'pref:communication_style',
      summary: '用户反感模板套话与客套清单，偏好自然真人口吻、直接切入重点的交流方式',
      keywords: '交流风格 自然 真人 简洁 不像机器人 无模板',
      confidence: 0.96,
      importance: 9,
      sourceSessionId: sessionId,
      sourceQuote: rawUserInput,
      replacesConflictingKey: true,
    });
  } else if (/(我喜欢|我偏好|请用|希望你说话).{0,18}(简洁|直接|深入|幽默|冷静|客观|详细)/i.test(normalized)) {
    const match = normalized.match(/(?:我喜欢|我偏好|请用|希望你说话)([^，。！？]{2,36})/);
    if (match?.[1]) {
      candidates.push({
        userId,
        category: 'preference',
        canonicalKey: 'pref:communication_style',
        summary: `用户偏好表达风格：${match[1].trim()}`,
        keywords: `交流偏好 ${match[1].trim()}`,
        confidence: 0.9,
        importance: 8,
        sourceSessionId: sessionId,
        sourceQuote: rawUserInput,
        replacesConflictingKey: true,
      });
    }
  }

  // B. Explicit "记住..." statement
  const rememberMatch = normalized.match(/^(?:记住|帮我记住|记一下|请记住)[：:，,\s]*(.{4,180})$/i);
  if (rememberMatch?.[1]) {
    const body = rememberMatch[1].trim();
    const isPref = /(喜欢|讨厌|习惯|偏好|不要|别)/.test(body);
    const isDecision = /(决定|以后都|改用|选定|不用.*了|统一用)/.test(body);
    const isStack = /typescript|javascript|python|rust|go|react|vue|node|sqlite|postgres|deepseek|ollama/i.test(body);
    candidates.push({
      userId,
      category: isDecision ? 'decision' : isPref ? 'preference' : 'fact',
      canonicalKey: isStack ? 'decision:tech_stack' : isDecision ? 'decision:explicit' : isPref ? 'pref:explicit' : `fact:${body.slice(0, 18)}`,
      summary: body,
      keywords: body,
      confidence: 0.98,
      importance: 9,
      sourceSessionId: sessionId,
      sourceQuote: rawUserInput,
      replacesConflictingKey: true,
    });
    return candidates;
  }

  // C. Projects & Long-term Goals ("我想做一个 AI", "我在开发...", "我的目标是...")
  const projectMatch = normalized.match(/(?:我想做|我要做|打算做|准备做|正在做|在做一个|在开发|我的项目是|核心目标是)\s*([^，。！？]{2,80})/);
  if (projectMatch?.[1] && !/^(什么|个梦|顿饭|测试)/.test(projectMatch[1].trim())) {
    const proj = projectMatch[1].trim();
    const isAiProject = /ai|人工智能|助手|伴侣/i.test(proj);
    candidates.push({
      userId,
      category: 'project',
      canonicalKey: isAiProject ? 'project:ai_assistant' : `project:${proj.slice(0, 16)}`,
      summary: `用户正在推进或规划项目：${proj}`,
      keywords: `项目 目标 规划 ${proj}`,
      confidence: 0.9,
      importance: 8,
      sourceSessionId: sessionId,
      sourceQuote: rawUserInput,
      replacesConflictingKey: false,
    });
  }

  // D. Capabilities / Constraints added in follow-up ("陪我交流，也能够帮我操作电脑")
  if (
    session?.activeTopic &&
    /(陪我交流|操作电脑|控制电脑|记住我|长期记忆|自然语音|实时对话)/.test(normalized)
  ) {
    const focusBits: string[] = [];
    if (/陪我交流|自然/.test(normalized)) focusBits.push('自然陪伴交流');
    if (/操作电脑|控制电脑/.test(normalized)) focusBits.push('操作/控制电脑执行任务');
    if (/记忆|记住/.test(normalized)) focusBits.push('具备长期记忆');
    if (/语音/.test(normalized)) focusBits.push('流畅实时语音交互');
    if (focusBits.length > 0) {
      candidates.push({
        userId,
        category: 'goal',
        canonicalKey: 'goal:ai_requirements',
        summary: `围绕「${session.activeTopic}」的核心要求：${focusBits.join('、')}`,
        keywords: `目标 需求 ${session.activeTopic} ${focusBits.join(' ')}`,
        confidence: 0.92,
        importance: 8,
        sourceSessionId: sessionId,
        sourceQuote: rawUserInput,
        replacesConflictingKey: false,
      });
    }
  }

  // E. User identity, role, language, or habits ("我叫...", "我是...", "我习惯...")
  const nameMatch = normalized.match(/(?:我叫|我的名字是|叫我)\s*([^\s，。！？,.!?]{1,20})/);
  if (nameMatch?.[1] && !/什么|谁|哪位/.test(nameMatch[1])) {
    candidates.push({
      userId,
      category: 'fact',
      canonicalKey: 'identity:name',
      summary: `用户希望被称呼为：${nameMatch[1].trim()}`,
      keywords: `称呼 名字 ${nameMatch[1].trim()}`,
      confidence: 0.96,
      importance: 9,
      sourceSessionId: sessionId,
      sourceQuote: rawUserInput,
      replacesConflictingKey: true,
    });
  }

  const roleMatch = normalized.match(/(?:其实我是|我其实是|我是做|我目前是|我的工作是|我从事)\s*([^，。！？,.!?]{2,30})/);
  if (roleMatch?.[1] && !/不是|开玩笑|人类|男|女|中国人|测试/.test(roleMatch[1])) {
    candidates.push({
      userId,
      category: 'fact',
      canonicalKey: 'identity:occupation',
      summary: `用户的职业或背景方向：${roleMatch[1].trim()}`,
      keywords: `职业 背景 ${roleMatch[1].trim()}`,
      confidence: 0.88,
      importance: 8,
      sourceSessionId: sessionId,
      sourceQuote: rawUserInput,
      replacesConflictingKey: true,
    });
  }

  const habitMatch = normalized.match(/(?:我平时|我每天|我习惯|我经常|我的习惯是)\s*([^，。！？]{3,48})/);
  if (habitMatch?.[1]) {
    candidates.push({
      userId,
      category: 'habit',
      canonicalKey: `habit:${habitMatch[1].trim().slice(0, 14)}`,
      summary: `用户的日常习惯：${habitMatch[1].trim()}`,
      keywords: `习惯 ${habitMatch[1].trim()}`,
      confidence: 0.85,
      importance: 7,
      sourceSessionId: sessionId,
      sourceQuote: rawUserInput,
      replacesConflictingKey: false,
    });
  }

  // F. Explicit decisions & tech/project revisions ("改用...", "不用...了，改用...", "以后固定...")
  const decisionMatch = normalized.match(/(?:我决定|就定为|改用|换成|不再用[^，。]*改用|以后统一用)\s*([^，。！？]{2,48})/);
  if (decisionMatch?.[1]) {
    const choice = decisionMatch[1].replace(/^(?:核心引擎)?(?:改用|换成|用)\s*/, '').trim() || decisionMatch[1].trim();
    const isStack = /typescript|javascript|python|rust|go|react|vue|node|sqlite|postgres|deepseek|ollama/i.test(decisionMatch[1]);
    candidates.push({
      userId,
      category: 'decision',
      canonicalKey: isStack ? 'decision:tech_stack' : `decision:${choice.slice(0, 14)}`,
      summary: `用户做出的决策：采用 ${choice}`,
      keywords: `决定 决策 ${choice}`,
      confidence: 0.92,
      importance: 8,
      sourceSessionId: sessionId,
      sourceQuote: rawUserInput,
      replacesConflictingKey: isStack,
    });
  }

  return candidates;
}

export function deriveSessionStatePatch(
  rawUserInput: string,
  intent: DialogueIntentAnalysis,
  session: AISessionRecord
): {
  title?: string;
  activeTopic?: string;
  activeGoal?: string;
  constraints?: string[];
  decisions?: string[];
  rollingSummary?: string;
} {
  const clean = intent.normalizedInput;
  const patch: {
    title?: string;
    activeTopic?: string;
    activeGoal?: string;
    constraints?: string[];
    decisions?: string[];
    rollingSummary?: string;
  } = {};

  if ((session.title === '新对话' || session.title === '语音实时对话') && intent.kind !== 'casual_greeting' && clean.length >= 4) {
    patch.title = clean.slice(0, 26);
  }

  if (intent.topicHint && (!intent.isContinuation || !session.activeTopic)) {
    patch.activeTopic = intent.topicHint;
  }

  if (/希望它|能够|帮我|需要它|目标是/.test(clean) && clean.length >= 6) {
    const trimmedGoal = clean.replace(/^(对|但是|不过|我希望它|我希望)[，,\s]*/g, '').trim();
    if (trimmedGoal.length >= 4) {
      patch.activeGoal = session.activeGoal && intent.isContinuation && !session.activeGoal.includes(trimmedGoal.slice(0, 8))
        ? `${session.activeGoal}；${trimmedGoal}`.slice(0, 200)
        : trimmedGoal.slice(0, 200);
    }
  }

  if (/(不希望|不要|不能|必须|别)/.test(clean)) {
    const nextConstraint = clean.slice(0, 80);
    patch.constraints = [...session.constraints, nextConstraint];
  }

  if (/(决定|就按|改用|确认|采用)/.test(clean)) {
    patch.decisions = [...session.decisions, clean.slice(0, 80)];
  }

  const prevSummary = session.rollingSummary ? `${session.rollingSummary} | ` : '';
  if (intent.kind !== 'casual_greeting' && clean.length >= 4) {
    const combined = `${prevSummary}${clean.slice(0, 70)}`;
    patch.rollingSummary = combined.length > 900 ? combined.slice(-900) : combined;
  }

  return patch;
}

export function isConversationalFramingNotCommand(
  text: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): boolean {
  const clean = normalizeColloquialInput(text);
  if (!clean) return true;

  if (/(?:别打开|不要打开|别去|不要去|不用打开|不用放|不是让你|别老是|不要像|不希望.{0,8}(?:自动|乱|像))/.test(clean)) {
    return true;
  }

  if (
    /(?:我想做一个|我要做一个|正在开发|正在设计|构想|思路|讨论一下|如果能|比如|例如|像.+一样|既能.+又能|不仅.+还能|我希望它(?:能够?)?|设计一个|打造一个|评估一下)/i.test(
      clean
    )
  ) {
    return true;
  }

  if (
    /(?:能学啥|有什么用|是什么|什么意思|为什么|怎么样|好用吗|原理|区别|介绍|推荐一下.+概念)/.test(clean) &&
    !/^(打开|进入|切换|播放|放|听|看|读|找|带我去)/.test(clean)
  ) {
    return true;
  }

  if (/^(对[，,\s]*|嗯[，,\s]*|是啊[，,\s]*|没错[，,\s]*|但是|不过|可是|那如果|其实)/.test(clean) && history.length > 0) {
    return true;
  }

  return false;
}

