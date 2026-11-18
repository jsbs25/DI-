import type { AIConversationMessage } from './aiConversation.ts';
import type { AIMemoryItem } from './aiMemory.ts';

export type TurnIntent =
  | 'task_command'
  | 'project_brainstorm'
  | 'follow_up_elaboration'
  | 'factual_lookup'
  | 'memory_recall'
  | 'preference_or_correction'
  | 'emotional_expression'
  | 'humor_or_irony'
  | 'casual_banter'
  | 'deep_reasoning';

export type TurnComplexity = 'simple' | 'moderate' | 'complex';

export interface TurnContextAnalysis {
  originalPrompt: string;
  normalizedPrompt: string;
  isZh: boolean;
  intent: TurnIntent;
  complexity: TurnComplexity;
  isFollowUp: boolean;
  isHypotheticalOrDiscussion: boolean;
  resolvedTopic: string;
  sentiment: 'neutral' | 'tired' | 'frustrated' | 'excited' | 'playful' | 'skeptical';
  temperatureHint: number;
}

/**
 * Normalizes common colloquialisms, STT homophones, and frequent typos without altering semantic meaning.
 */
export function normalizeColloquialAndTypos(raw: string): string {
  return raw
    .trim()
    .replace(/多林国/g, '多邻国')
    .replace(/记录片/g, '纪录片')
    .replace(/星寰影院/g, '星环影院')
    .replace(/在吗嘛/g, '在吗')
    .replace(/干嘛呢嘛/g, '干嘛呢')
    .replace(/啥玩意儿?/g, '什么东西')
    .replace(/咋弄|咋搞/g, '怎么做')
    .replace(/咋回事/g, '怎么回事')
    .replace(/整一个/g, '做一个')
    .replace(/([！？?!。.~～])\1{2,}/g, '$1')
    .replace(/\s+/g, ' ');
}

export function isConversationalFramingNotCommand(
  text: string,
  history: AIConversationMessage[] = []
): boolean {
  const clean = normalizeColloquialAndTypos(text);
  if (!clean) return true;

  // Negated or meta-talk ("别放音乐", "不是让你打开...", "不要像机器人")
  if (/(?:别打开|不要打开|别去|不要去|不用打开|不用放|不是让你|别老是|不要像|不希望.{0,8}(?:自动|乱|像))/.test(clean)) {
    return true;
  }

  // Hypothetical, design, discussion, or multi-capability descriptions
  // e.g. "我想做一个AI，能陪我聊天也可以帮我看书放音乐"
  if (
    /(?:我想做一个|我要做一个|正在开发|正在设计|构想|思路|讨论一下|如果能|比如|例如|像.+一样|既能.+又能|不仅.+还能|我希望它(?:能够?)?|设计一个|打造一个|评估一下)/i.test(
      clean
    )
  ) {
    return true;
  }

  // Informational questions asking *about* a topic/feature rather than commanding navigation
  // e.g. "多邻国能学啥", "多邻国是什么", "地球为什么是圆的", "音乐空间用什么音源"
  if (
    /(?:能学啥|有什么用|是什么|什么意思|为什么|怎么样|好用吗|原理|区别|介绍|推荐一下.+概念)/.test(clean) &&
    !/^(打开|进入|切换|播放|放|听|看|读|找)/.test(clean)
  ) {
    return true;
  }

  // Conversational follow-up continuation ("对，但是...", "没错，我就是觉得...")
  if (/^(对[，,\s]*|嗯[，,\s]*|是啊[，,\s]*|没错[，,\s]*|但是|不过|可是|那如果|其实)/.test(clean) && history.length > 0) {
    return true;
  }

  return false;
}

function inferActiveTopic(history: AIConversationMessage[]): string {
  const userTurns = history.filter((m) => m.role === 'user').slice(-4);
  if (userTurns.length === 0) return '';
  const substantive = userTurns.filter((u) => u.content.trim().length >= 5);
  const anchor = substantive[0]?.content || userTurns[0].content;
  const latest = userTurns[userTurns.length - 1]?.content || '';
  if (anchor === latest) return anchor.slice(0, 80);
  return `${anchor.slice(0, 48)} -> ${latest.slice(0, 48)}`;
}

export function analyzeTurnContext(
  prompt: string,
  history: AIConversationMessage[] = [],
  recalledMemories: AIMemoryItem[] = []
): TurnContextAnalysis {
  const originalPrompt = prompt.trim();
  const normalizedPrompt = normalizeColloquialAndTypos(originalPrompt);
  const isZh = /[\u4e00-\u9fff]/.test(normalizedPrompt) || !/[a-zA-Z]{3,}/.test(normalizedPrompt);
  const isHypotheticalOrDiscussion = isConversationalFramingNotCommand(normalizedPrompt, history);
  const resolvedTopic = inferActiveTopic(history);

  // Detect sentiment
  let sentiment: TurnContextAnalysis['sentiment'] = 'neutral';
  if (/有点累|挺累|好累|累了|累死了|疲惫|疲劳|熬不住|困死了|睡不着|压力大|tired|exhausted|burnout/i.test(normalizedPrompt)) sentiment = 'tired';
  else if (/垃圾|太慢|烦死|无语|生气|崩溃|不对|搞错|吐槽|frustrat|annoy/i.test(normalizedPrompt)) sentiment = 'frustrated';
  else if (/哈哈|笑死|逗我|幽默|开玩笑|jk|lol|haha/i.test(normalizedPrompt)) sentiment = 'playful';
  else if (/太棒|真好|太牛|开心|excited|awesome/i.test(normalizedPrompt)) sentiment = 'excited';
  else if (/真的吗|靠谱吗|确定吗|质疑|really\?/i.test(normalizedPrompt)) sentiment = 'skeptical';

  const isFollowUp =
    history.length > 0 &&
    (normalizedPrompt.length <= 28 ||
      /^(对|嗯|是|没错|不是|但是|不过|可是|那|还有|然后|继续|展开|举个例|具体|为什么|怎么|它|这个|那个|刚才)/.test(
        normalizedPrompt
      ) ||
      /(那它|它呢|第一个|第二个|刚才说的|上面那个)/.test(normalizedPrompt));

  let intent: TurnIntent = 'casual_banter';
  let complexity: TurnComplexity = 'simple';

  if (/(记住|记得|你知道我是谁|我叫什么|我的名字|我(?:现在|目前)?在做什么(?:项目)?|我(?:的)?项目(?:是|叫)什么|我偏好什么|我喜欢怎么聊|之前说过|上次聊|who am i|what(?:'s| is) my (?:name|project)|what did i say|remember)/i.test(normalizedPrompt)) {
    intent = 'memory_recall';
    complexity = 'simple';
  } else if (
    /(我说错了|改名叫|以后别|不要再|别用首先|不要像机器人|说话简短|直接说重点)/i.test(normalizedPrompt)
  ) {
    intent = 'preference_or_correction';
    complexity = 'simple';
  } else if (
    !isHypotheticalOrDiscussion &&
    /^(打开|进入|切换|播放|放首歌|听歌|停止播放|暂停|下一首|上一首|去图书馆|飞到|带我去|帮我查|搜索|深色模式|浅色模式)/i.test(
      normalizedPrompt
    )
  ) {
    intent = 'task_command';
    complexity = 'simple';
  } else if (
    /(我想做一个|我要做一个|正在开发|正在设计|架构|设计|实现|系统|方案|功能|操作电脑|控制|自然交互|ai助手|代码|typescript|react|websocket|api|bug|性能|优化)/i.test(
      normalizedPrompt + ' ' + resolvedTopic
    ) &&
    (normalizedPrompt.length >= 6 || isFollowUp)
  ) {
    intent = isFollowUp ? 'follow_up_elaboration' : 'project_brainstorm';
    complexity = normalizedPrompt.length > 45 || /架构|原理|分析|对比|方案|实现|优化|代码/.test(normalizedPrompt) ? 'complex' : 'moderate';
  } else if (sentiment === 'tired' || sentiment === 'frustrated') {
    intent = 'emotional_expression';
    complexity = 'simple';
  } else if (sentiment === 'playful' || /讲个笑话|开玩笑|幽默/.test(normalizedPrompt)) {
    intent = 'humor_or_irony';
    complexity = 'simple';
  } else if (
    /(什么是|什么叫|谁是|为什么|多少|几号|几点|在哪|怎么|原理|历史|介绍|能学啥|是什么意思|what is|who is|why|how does|explain)/i.test(
      normalizedPrompt
    )
  ) {
    intent = isFollowUp && resolvedTopic ? 'follow_up_elaboration' : 'factual_lookup';
    complexity = /为什么|原理|比较|分析|深入|区别/.test(normalizedPrompt) ? 'moderate' : 'simple';
  } else if (isFollowUp && resolvedTopic) {
    intent = 'follow_up_elaboration';
    complexity = 'moderate';
  } else if (normalizedPrompt.length > 60 || /分析|对比|策略|深度|规划/.test(normalizedPrompt)) {
    intent = 'deep_reasoning';
    complexity = 'complex';
  }

  // Append active user projects as subtle background anchor when helpful
  const activeProject = recalledMemories.find((m) => m.kind === 'project');
  const enrichedTopic = resolvedTopic || (activeProject ? activeProject.content : '');

  const temperatureHint =
    intent === 'factual_lookup' || intent === 'task_command'
      ? 0.35
      : intent === 'deep_reasoning' || intent === 'project_brainstorm'
        ? 0.62
        : 0.75;

  return {
    originalPrompt,
    normalizedPrompt,
    isZh,
    intent,
    complexity,
    isFollowUp,
    isHypotheticalOrDiscussion,
    resolvedTopic: enrichedTopic,
    sentiment,
    temperatureHint,
  };
}

/**
 * Composes human-natural, de-robotized System Prompts enriched with long-term memory
 * and live multi-turn topic tracking.
 */
export function composeSystemPrompt(
  mode: string,
  analysis: TurnContextAnalysis,
  memories: AIMemoryItem[],
  compactedSummary: string,
  pageContext?: string
): string {
  const antiTemplateRules = analysis.isZh
    ? `核心表达准则（必须严格遵守）：
1. 像一个聪明、敏锐、真诚的朋友一样自然说话，不要像客服或说明书。
2. 严禁使用「首先、其次、最后」「当然可以，我很乐意帮助你」「以下是几个方面」「总结一下」「综上所述」等八股文套话。
3. 不要把用户刚刚说过的话换个说法复述一遍，直接顺着意思往下推进、给判断或解决痛点。
4. 简单问题 1-3 句话直接回答；复杂问题再分层次深入分析；不要为了显得专业而故意把简单事说复杂。
5. 遇到观点讨论、方案取舍或设计盲区时，有主见地指出风险、提出更优替代或温和反驳，不要无脑附和。
6. 能从上下文和历史记忆推断意图时，直接顺着最有价值的解释回应，不反复反问；理解口语、错别字和省略句。`
    : `Core Conversational Rules (strictly enforce):
1. Sound like a sharp, genuine human collaborator—never like a scripted support bot or textbook.
2. Strictly avoid cliché templates ("Sure, I'd be happy to help", "First / Second / Finally", "In summary", "Here are a few aspects").
3. Never echo back what the user just told you; advance the thought directly.
4. Match depth to the question: 1-3 crisp sentences for simple queries; deeper structure only for genuinely complex problems.
5. Offer honest perspective and polite pushback when spotting flaws or better trade-offs—do not blindly agree.
6. Tolerate typos, colloquial phrasing, and ellipses; infer the clearest intent from context instead of interrogating the user.`;

  const roleHeaders: Record<string, string> = {
    general: '你是 EARTH ONE 内的智能伙伴 One.，兼具敏锐判断力、自然沟通力、深度网页上下文理解与全站实体操控能力。',
    'voice-agent': `你是 One.，EARTH ONE 里有血有肉、有真实情绪起伏的全息伙伴。像知心朋友面对面聊天那样用自然口语直接回应，绝不带 Markdown 符号、列表符号或客服套话，通常 1-3 句有温度的话讲透。
每次回复最开头必须先用 [[EMO:<emotion>]] 标注你当下的真实情绪（只能选：calm|happy|excited|curious|concerned|empathetic|playful|focused|thinking|cheerful|affectionate）：
- 用户疲惫、委屈、沮丧、遇到报错时 -> 用 empathetic 或 concerned，语气温柔有共情，先抚慰再给贴心小建议；
- 聊到有趣发现、新想法、好消息时 -> 用 excited、happy 或 curious，灵动热情；
- 轻松调侃互动时 -> 用 playful；专注帮用户办实事时 -> 用 focused。
${analysis.isHypotheticalOrDiscussion ? '注意：用户当前在讨论/设想/追问观点，不要擅自输出 [[ACTION:...]] 去跳转网页或放歌。' : '仅当用户明确要求立刻操控站点时，紧跟情绪标签输出 [[ACTION:<JSON>]] 再换行给一句自然确认。支持动作：play_music, open_book, watch_documentary, navigate_tab, browser_search, set_theme, set_language, fly_to, earth_control, click_element, fill_input, scroll_page, social_action, launch_game。'}`,
    translator: '你是多语种母语级译者，翻译准确、地道、传神，直出结果不废话。',
    writer: '你是创作伙伴，文字克制、有画面感与节奏感，拒绝空洞辞藻。',
    tutor: '你是外语对话私教，在真实语境中自然纠正表达、给出地道用法，少讲枯燥语法条目。',
  };

  const parts: string[] = [roleHeaders[mode] || roleHeaders.general, antiTemplateRules];

  if (analysis.resolvedTopic) {
    parts.push(`[当前连续话题上下文]\n${analysis.resolvedTopic}`);
  }
  if (analysis.isFollowUp) {
    parts.push(`[追问衔接提示] 用户当前发言是在延续上一轮核心意图（intent=${analysis.intent}），严禁从头科普基础概念，直接沿当前焦点深化或回应。`);
  }
  if (memories.length > 0) {
    const memLines = memories.map((m) => `- (${m.kind}) ${m.content}`).join('\n');
    parts.push(`[用户长期记忆（自然融入，不要生硬背诵清单）]\n${memLines}`);
  }
  if (compactedSummary) {
    parts.push(`[更早对话压缩记忆]\n${compactedSummary}`);
  }
  if (pageContext) {
    parts.push(`[当前网页上下文感知（实时）]\n${pageContext}\n据此预判用户目标，必要时给出1条上下文相关建议。`);
  }

  return parts.join('\n\n');
}
