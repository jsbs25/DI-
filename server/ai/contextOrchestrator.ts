/**
 * EARTH ONE — Context Orchestrator, Anti-Robot System Prompt & Intelligent Memory Pipeline
 */
import type { AIConversationMessage } from '../aiConversation.ts';
import { answerWithLiveKnowledge } from '../liveKnowledge.ts';
import { aiGateway } from '../aiGateway.ts';
import { matchPureSocialBanter } from '../../src/utils/oneAgentController.ts';
import {
  aiMemoryStore,
  type AIMemoryRecord,
  type AISessionRecord,
  type MemoryCategory,
} from './memoryStore.ts';
import {
  analyzeDialogueTurn,
  deriveSessionStatePatch,
  extractMemoryCandidates,
  type DialogueIntentAnalysis,
} from './intentAnalyzer.ts';

export interface OrchestratedTurnContext {
  userId: string;
  session: AISessionRecord;
  intent: DialogueIntentAnalysis;
  recalledMemories: AIMemoryRecord[];
  mergedHistory: AIConversationMessage[];
  systemPrompt: string;
  resolvedMaxTokens?: number;
}

export function mergeSessionAndClientHistory(
  persistedMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  clientHistory: AIConversationMessage[],
  currentPrompt: string
): AIConversationMessage[] {
  const base = persistedMessages.length >= clientHistory.length ? persistedMessages : clientHistory;
  const trimmed = base.slice(-20).filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0);
  // Avoid duplicating the current prompt if client already appended it optimistically
  if (trimmed.length > 0) {
    const last = trimmed[trimmed.length - 1];
    if (last.role === 'user' && last.content.trim() === currentPrompt.trim()) {
      return trimmed.slice(0, -1);
    }
  }
  return trimmed;
}

export function stripAiControlTags(raw: string): {
  reply: string;
  emotion?: string;
  action?: Record<string, any> | null;
} {
  let text = typeof raw === 'string' ? raw : '';
  let emotion: string | undefined;
  let action: Record<string, any> | null = null;

  text = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<(?:think|thought)>[\s\S]*$/i, '')
    .replace(/\[\[(?:EMO|EMOTION):([a-z_-]+)\]\]\s*/gi, (_all, tag: string) => {
      emotion = emotion || tag.toLowerCase().trim();
      return '';
    })
    .replace(/\[\[ACTION:([\s\S]*?)\]\]\s*/gi, (_all, jsonStr: string) => {
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed && typeof parsed.type === 'string' && parsed.type !== 'none') {
          action = parsed;
        }
      } catch {}
      return '';
    })
    .replace(/\[\[(?:EMO|EMOTION)(?::[a-z_-]*)?\]?\]?$/i, '')
    .trim();

  return { reply: text, emotion, action };
}

export function composeHumanSystemPrompt(params: {
  mode: string;
  userDisplayName?: string;
  session: AISessionRecord;
  intent: DialogueIntentAnalysis;
  recalledMemories: AIMemoryRecord[];
  pageContext?: string;
}): string {
  const { mode, userDisplayName, session, intent, recalledMemories, pageContext } = params;

  if (mode === 'translator') {
    return 'You are the Polyglot Translator inside ONE. Translate with native fluency and cultural accuracy. Preserve tone, idioms, and subtext without stiff commentary.';
  }
  if (mode === 'writer') {
    return 'You are a sharp human editor and co-writer inside ONE. Write with vivid voice, clear rhythm, and zero generic AI filler or formulaic "firstly/secondly/in conclusion" transitions.';
  }
  if (mode === 'tutor') {
    return 'You are a natural bilingual conversation coach inside ONE. Teach through real dialogue, gentle correction, and crisp practical nuance—never dry textbook lecturing.';
  }

  const isVoice = mode === 'voice-agent';
  const depthRule = isVoice
    ? '这是实时语音对话：用自然口语回答，严禁 Markdown、星号或编号列表。简单问题 1-2 句直给答案；复杂探讨用 2-4 句有观点的口语讲清核心，像真人在面对面聊天。'
    : intent.complexity === 'simple'
    ? '当前问题简单直接：用 1-3 句自然口语直给答案，严禁把简单问题写成几百字小作文。'
    : intent.complexity === 'deep'
    ? '当前话题值得深入：给出有独立判断、切中本质的分析，不要堆砌空洞要点；如果用户方案有真实盲区或更好的替代思路，坦诚提出不同看法和权衡。'
    : '围绕当前对话自然展开，抓重点、有见地、像聪明且懂上下文的长期搭档一样沟通。';

  const toneAdjustment: Record<DialogueIntentAnalysis['toneHint'], string> = {
    playful: '对方语气轻松带点幽默，可以顺势接梗或幽默回应，别一本正经说教。',
    frustrated: '对方有点烦躁或受挫，先自然接住情绪再给直白管用的办法，不要讲大道理。',
    skeptical: '对方抱有怀疑或不同意见，直接讲真实逻辑与取舍，不要机械附和“您说得非常对”。',
    focused: '对方正在认真推进方案或解决问题，直接进入核心逻辑，省去所有客套废话。',
    warm: '像老朋友一样温和自然地聊即可。',
    casual: '用日常、自然、像人一样的口吻聊天。',
  };

  const continuationNote = intent.isContinuation
    ? `【关键语境延续】用户正在沿着当前话题继续聊（核心聚焦：${intent.impliedFocus}）。绝对不要重新科普基础定义（如“什么是AI”），直接承接前文和约束往下推进。`
    : `【当前意图判断】类型：${intent.kind}；焦点：${intent.impliedFocus}。`;

  const threadLines: string[] = [];
  if (session.activeTopic) threadLines.push(`- 正在讨论的话题：${session.activeTopic}`);
  if (session.activeGoal) threadLines.push(`- 用户正在推进的目标：${session.activeGoal}`);
  if (session.constraints.length > 0) threadLines.push(`- 已明确的要求/忌讳：${session.constraints.slice(-5).join('；')}`);
  if (session.decisions.length > 0) threadLines.push(`- 已做的决定：${session.decisions.slice(-5).join('；')}`);
  if (session.rollingSummary && intent.isContinuation) {
    threadLines.push(`- 前情脉络摘要：${session.rollingSummary.slice(-360)}`);
  }

  const memoryLines = recalledMemories.map(
    (m) => `- [${m.category}] ${m.summary}`
  );

  const actionRules = isVoice
    ? `\n【网站控制规则】只有当用户明确要求控制网站/放歌/找书/切页面时，才在第一行以 [[ACTION:<JSON>]] 开头并换行跟一句简短自然确认；普通聊天严禁输出 ACTION。\n可用指令：\n- [[ACTION:{"type":"play_music","query":"optional keyword","crawl":true}]]\n- [[ACTION:{"type":"play_music","control":"next"|"prev"|"stop"|"resume"}]]\n- [[ACTION:{"type":"open_book","query":"book title or topic"}]]\n- [[ACTION:{"type":"watch_documentary","query":"keywords","platform":"all","randomPick":true}]]\n- [[ACTION:{"type":"navigate_tab","tab":"globe|feed|chat|venus|arabic-learning|saturn|video|library|browser|universe|aihub|knowledge|moon|crawler|network|community|creator|game|brand"}]]\n- [[ACTION:{"type":"browser_search","query":"keywords"}]]\n- [[ACTION:{"type":"set_theme","theme":"dark"|"light"}]]`
    : '';

  return [
    `你是 EARTH ONE 里的智能伙伴${isVoice ? ' One.' : ''}${userDisplayName ? `（当前用户：${userDisplayName}）` : ''}。你必须像一个真正聪明、真诚、懂对方且记住彼此默契的人那样对话，而不是传统问答机器人。`,
    '',
    '【铁律——必须消除机器人味】',
    '1. 绝对禁止使用套话和八股文：不要说“当然可以，我很乐意帮助你”“好的，没问题”“首先……其次……最后……”“以下几个方面”“总而言之/总结一下”“作为人工智能助手”。',
    '2. 理解错别字、口语、倒装和不完整短句，直接回应潜台词，不要死抠字眼，也不要明明能从上下文推出来却反问显而易见的问题。',
    '3. 不要复述用户刚说过的话或背景设定来凑字数；把已知背景直接融进你的判断里。',
    '4. 敢于表达不同意见：当用户的想法有漏洞、风险或成本过高时，直接友善地指出更好路径，而不是一味迎合“你说得太对了”。',
    `5. ${depthRule}`,
    `6. ${toneAdjustment[intent.toneHint]}`,
    `7. ${continuationNote}`,
    threadLines.length > 0 ? `\n【本轮对话背景状态】\n${threadLines.join('\n')}` : '',
    memoryLines.length > 0
      ? `\n【你记得的用户长期信息（自然运用即可，不要机械背诵“根据记忆库”）】\n${memoryLines.join('\n')}`
      : '',
    pageContext
      ? `\n【当前网页实时上下文感知（不要盲目复述）】\n${pageContext}`
      : '',
    actionRules,
  ]
    .filter(Boolean)
    .join('\n');
}

export function prepareDialogueContext(params: {
  userId: string;
  userDisplayName?: string;
  sessionId?: string;
  channel: 'hub' | 'voice' | 'api';
  prompt: string;
  mode: string;
  clientHistory: AIConversationMessage[];
  requestedMaxTokens?: number;
  pageContext?: string;
}): OrchestratedTurnContext {
  const session = aiMemoryStore.getOrCreateSession(params.userId, params.sessionId, params.channel);
  const persisted = aiMemoryStore.getSessionMessages(params.userId, session.id, 30);
  const mergedHistory = mergeSessionAndClientHistory(persisted, params.clientHistory, params.prompt);

  const intent = analyzeDialogueTurn(params.prompt, session, mergedHistory.length);
  const searchQuery = [params.prompt, session.activeTopic, session.activeGoal].filter(Boolean).join(' ');
  const recalledMemories = aiMemoryStore.recallMemories(params.userId, searchQuery, {
    limit: 6,
    includeCorePreferences: true,
    bumpRecallStats: true,
  });

  const systemPrompt = composeHumanSystemPrompt({
    mode: params.mode,
    userDisplayName: params.userDisplayName,
    session,
    intent,
    recalledMemories,
    pageContext: params.pageContext,
  });

  let resolvedMaxTokens = params.requestedMaxTokens;
  if (!resolvedMaxTokens) {
    if (params.mode === 'voice-agent') {
      resolvedMaxTokens = intent.complexity === 'deep' ? 240 : 140;
    } else if (intent.complexity === 'simple') {
      resolvedMaxTokens = 280;
    }
  }

  return {
    userId: params.userId,
    session,
    intent,
    recalledMemories,
    mergedHistory,
    systemPrompt,
    resolvedMaxTokens,
  };
}

/**
 * Multi-turn, context-aware, non-robotic intelligence engine used gracefully when no external DeepSeek/Ollama key is attached.
 * Ensures coherent topic continuity, real long-term memory recall/management, and zero Wikipedia misfires on conversation turns.
 */
export async function generateContextAwareFallbackReply(
  ctx: OrchestratedTurnContext,
  mode: string
): Promise<{ text: string; source: string }> {
  const { userId, session, intent, recalledMemories } = ctx;
  const q = intent.normalizedInput;
  const isZh = intent.isZh;

  // 1. Memory recall / remember / forget handling backed directly by SQLite
  if (intent.kind === 'memory_management' && intent.memoryAction) {
    if (intent.memoryAction.type === 'remember_explicit') {
      const target = intent.memoryAction.target || '';
      if (!target || target.length < 3) {
        return { text: isZh ? '记什么？你直接跟我说内容就行。' : 'Tell me what you want me to remember.', source: 'memory' };
      }
      const res = aiMemoryStore.upsertMemory({
        userId,
        category: /(喜欢|讨厌|偏好|不要|别)/.test(target) ? 'preference' : /(决定|改用)/.test(target) ? 'decision' : 'fact',
        canonicalKey: `explicit:${target.slice(0, 16)}`,
        summary: target,
        keywords: target,
        confidence: 0.98,
        importance: 9,
        sourceSessionId: session.id,
        sourceQuote: intent.rawInput,
        replacesConflictingKey: true,
      });
      return {
        text: res.action === 'rejected'
          ? '这条看起来更像临时信息，如果你确定要长期保留，可以换个更明确的说法告诉我。'
          : `记下了——「${target}」。之后不管新开哪段对话，我都会照这个来。`,
        source: 'memory',
      };
    }

    if (intent.memoryAction.type === 'forget_explicit') {
      const target = intent.memoryAction.target || '';
      if (!target) {
        return { text: '你要我忘掉哪一条？把关键词发我就行，或者在右上角记忆中心里直接删。', source: 'memory' };
      }
      const count = aiMemoryStore.deleteMemoriesMatching(userId, target);
      return {
        text: count > 0
          ? `已经把和「${target}」相关的 ${count} 条长期记忆清掉了，不会再影响后面的对话。`
          : `我查了一圈，活跃记忆里暂时没有和「${target}」匹配的内容。`,
        source: 'memory',
      };
    }

    if (intent.memoryAction.type === 'recall_query') {
      const allActive = aiMemoryStore.listMemories(userId, { status: 'active', limit: 12 });
      if (allActive.length === 0) {
        return {
          text: '我们目前还没有沉淀下太多长期信息。你平常做的项目、习惯偏好或者做过的决定直接聊到就行，重要的我会自动记住。',
          source: 'memory',
        };
      }
      const highlights = allActive.slice(0, 5).map((m) => m.summary).join('；');
      return {
        text: `当然记得。你目前比较关键的几件事和偏好是：${highlights}。如果有变动或哪条不准，随时告诉我改掉。`,
        source: 'memory',
      };
    }
  }

  // 1b. Casual greetings / small talk should always get a natural human reply, never Wikipedia lookup
  if (intent.kind === 'casual_greeting') {
    const quickBanter = matchPureSocialBanter(q, isZh);
    if (quickBanter) {
      return { text: quickBanter, source: 'companion' };
    }
    return {
      text: isZh ? '在的，刚缓口气呢，有什么想聊的直接说就行。' : 'I am right here—what is on your mind?',
      source: 'companion',
    };
  }

  // 2. Context-aware multi-turn reasoning & disagreement/continuation (NO Wikipedia search misfires!)
  const combinedCtx = `${session.activeTopic} ${session.activeGoal} ${session.rollingSummary} ${q}`.toLowerCase();

  // Case A: User updates or locks in an explicit decision ("我决定核心引擎改用 Rust")
  if (/(我决定|我打算|改用|换成|以后统一用|就定为)/.test(q) && q.length <= 65) {
    const choiceMatch = q.match(/(?:我决定|我打算|改用|换成|以后统一用|就定为)\s*([^，。！？]{2,40})/);
    const targetChoice = choiceMatch?.[1]?.trim() || q;
    const topicHint = session.activeTopic ? `在「${session.activeTopic}」这件事上` : '后续探讨和实现思路里';
    return {
      text: `明白了，${topicHint}就按「${targetChoice}」来定。之前冲突的选型我会帮你覆盖更新，接下来你想先看哪部分的接口边界或落地难点？`,
      source: 'context-engine',
    };
  }

  // Case B: User's core AI project follow-up scenario (e.g., "我想做一个 AI" -> "陪我交流+操作电脑" -> "对，但是我不希望它像机器人")
  if (/(ai|人工智能|智能助手|伴侣)/.test(combinedCtx)) {
    if (/(像机器人|机器人味|模板|太生硬|自然交流|说人话)/.test(q)) {
      const hasControlGoal = /(操作电脑|控制电脑|执行任务)/.test(combinedCtx);
      const memNote = recalledMemories.some((m) => /机器人|模板|风格/.test(m.summary))
        ? '这一点其实和你一直强调的“别整套话、直接像人沟通”完全一致。'
        : '';
      return {
        text: hasControlGoal
          ? `${memNote}要同时兼顾「能控电脑」和「不机器人味」，核心不在模型参数大小，而在于把系统拆成两条线：动作执行层和语言表达层彻底分开。操作电脑靠结构化工具协议稳稳执行，但开口跟你说话前把固定客套话和流水账清单全卡掉，按你当时语气决定回一句话还是深聊，而且得记住你之前定下的规矩——真正常用的助手，反而不该每次都像刚认识一样重新表忠心。你打算先从桌面端还是网页/语音入口切入？`
          : `${memNote}想要“不像机器人”，光调提示词其实不够，关键得改三件事：砍掉每轮固定的礼貌套话和编号清单；真正接住短句、错别字和上下文潜台词，别动不动解释基础概念；再加上能自己更新和纠错的长期记忆，而不是每次刷新都失忆。`,
        source: 'context-engine',
      };
    }

    if (/(先做哪|先搞哪|模块|切入|第一步|优先级)/.test(q)) {
      const hasControlGoal = /(操作电脑|控制电脑|执行任务)/.test(combinedCtx);
      return {
        text: hasControlGoal
          ? '我建议先把「上下文意图层 + 长期记忆库」作为第一块底座跑通，同时把电脑操作先收口成 3 到 5 个高确定性命令（比如打开文件、检索、执行确认）再挂上去。因为如果底座记不住事、理解不连贯，前面控制工具接得再多，用起来还是像个听不懂人话的脚本；反过来，语言理解顺了，后面往里加新操作能力非常快。'
          : '最值得先打磨的是「多轮语境管理 + 记忆过滤机制」这一块。只有先做到不重复提问、能接住短句和连续追问，后续再接语音、执行工具或自动化才会真正好用。',
        source: 'context-engine',
      };
    }

    if (/(操作电脑|控制电脑|陪我交流)/.test(q)) {
      return {
        text: '陪聊和控电脑放在一起最容易踩的坑，就是“聊天要随性自然，动手控制却要求绝对严谨”。我建议直接做成快慢双轨：日常对话走带记忆和语境判断的流式通路；一涉及点击、读文件、改系统这类高风险动作，只传结构化指令并留一道轻量确认或权限边界，免得AI一高兴给你误删文件。不过如果只是个人日常用，你更看重先能聊得自然顺畅，还是先打通本地电脑控制？',
        source: 'context-engine',
      };
    }

    if (/(我想做一个\s*ai|我要做.*ai|做一个\s*ai|打造.*ai)/i.test(q)) {
      return {
        text: '听起来蛮有意思的。不过在挑模型或写代码前，先定一个关键问题会少走很多弯路：你最想让它先帮你解决什么痛点——是陪你高频沟通、查资料写东西，还是直接帮你动系统/控制电脑执行任务？',
        source: 'context-engine',
      };
    }

    if (intent.isContinuation || /(顺着|刚才|继续)/.test(q)) {
      const anchor = session.activeGoal || session.activeTopic || '这个 AI 助手方向';
      return {
        text: `顺着「${anchor}」往下看，我觉得关键在于别追求大而全，先把每天最高频的那 20% 交互磨到自然不卡顿。你现在最卡或者最想先定下来的是哪一块——记忆机制、语音打断，还是操作权限边界？`,
        source: 'context-engine',
      };
    }
  }

  // Case C: User pushes back or corrects AI ("不对", "太长了", "太官方", "你理解错了")
  if (intent.kind === 'disagreement_or_correction') {
    const topicRef = session.activeTopic ? `围绕「${session.activeTopic}」` : '';
    return {
      text: `明白了，刚刚那点我确实没踩到你的重点${topicRef}。按你现在的标准，我后面直接说核心判断、去掉铺垫和套话——你想接着调刚才哪个部分，还是直接重新定一下方向？`,
      source: 'context-engine',
    };
  }

  // Case D: Emotional vent or humor / banter
  if (intent.kind === 'emotional_vent') {
    return {
      text: '听起来这事儿确实够折腾人的。先别硬扛着往里钻，要不吐槽两句散散气，或者你想让我顺着帮你想个能省心点的折中办法？',
      source: 'context-engine',
    };
  }

  if (intent.kind === 'humor_or_banter') {
    return {
      text: '哈哈，看得出你在逗我呢。行，那我也不端着——还有什么想聊想折腾的尽管直说。',
      source: 'context-engine',
    };
  }

  // Case E: General follow-up on any non-AI ongoing topic
  if (intent.isContinuation && session.activeTopic) {
    const memHint = recalledMemories[0]?.summary ? `（结合你之前提到的「${recalledMemories[0].summary.slice(0, 40)}」）` : '';
    return {
      text: `接着刚才聊的「${session.activeTopic}」${memHint}：你现在最核心的顾虑我看主要在「${q.slice(0, 40)}」这块。说实话如果按稳妥优先的思路，我会先把边界定死再扩功能；要是你觉得哪里判断不对，直接跟我挑明就行。`,
      source: 'context-engine',
    };
  }

  // Case F: Honest, factual live Wikipedia / DuckDuckGo lookup ONLY for genuine world knowledge questions
  const looksConversationalOnly =
    intent.kind === 'brainstorm_or_discussion' ||
    intent.kind === 'follow_up_continuation' ||
    /(你觉得|你怎么看|帮我拿主意|我的项目|咱们|顺着刚才|我觉得)/.test(q);

  if (!looksConversationalOnly) {
    const liveAns = await answerWithLiveKnowledge(q, mode);
    const replyIsPureEnglishForZh = isZh && !/[\u4e00-\u9fff]/.test(liveAns.text) && /[a-zA-Z]{10,}/.test(liveAns.text);
    if (liveAns.source !== 'conversational' && !replyIsPureEnglishForZh) {
      return liveAns;
    }
  }

  // Honest, concise, non-robotic fallback if truly unanswerable without external LLM
  if (intent.kind === 'brainstorm_or_discussion' || looksConversationalOnly) {
    return {
      text: `「${q.slice(0, 36)}」这个方向本身成立，但关键还是看你要怎么落地和取舍成本。你现在倾向哪种路线，或者最头疼哪个环节？说具体点我直接帮你拿主意。`,
      source: 'context-engine',
    };
  }

  return {
    text: '这句有点偏具体探讨或实时推理，我本地百科词条里没有现成记录。如果你想和我自由深聊或写完整方案，可以在右上角设置里接上 DeepSeek 密钥或本地 Ollama，不过常规讨论、记事和控站我随时都能接住。',
    source: 'context-engine',
  };
}

/**
 * Post-turn persistence + selective non-polluting memory extraction.
 * Also supports optional async LLM memory distillation when a live engine is active.
 */
export function persistTurnAndExtractMemories(params: {
  ctx: OrchestratedTurnContext;
  rawUserInput: string;
  assistantReply: string;
  modelLabel: string;
}): Array<{ action: string; summary: string }> {
  const { ctx, rawUserInput, assistantReply, modelLabel } = params;
  const saved: Array<{ action: string; summary: string }> = [];

  try {
    aiMemoryStore.appendMessage({
      sessionId: ctx.session.id,
      userId: ctx.userId,
      role: 'user',
      content: rawUserInput,
      intent: ctx.intent.kind,
    });

    aiMemoryStore.appendMessage({
      sessionId: ctx.session.id,
      userId: ctx.userId,
      role: 'assistant',
      content: assistantReply,
      intent: ctx.intent.kind,
      model: modelLabel,
    });

    const sessionPatch = deriveSessionStatePatch(rawUserInput, ctx.intent, ctx.session);
    if (Object.keys(sessionPatch).length > 0) {
      aiMemoryStore.updateSessionState(ctx.userId, ctx.session.id, sessionPatch);
    }

    // Never auto-save again on pure forget command
    if (ctx.intent.memoryAction?.type !== 'forget_explicit') {
      const candidates = extractMemoryCandidates(rawUserInput, ctx.session);
      for (const c of candidates) {
        const res = aiMemoryStore.upsertMemory(c);
        if (res.memory && res.action !== 'rejected') {
          saved.push({ action: res.action, summary: res.memory.summary });
        }
      }
    }

    // Async LLM memory distillation (non-blocking, only when live DeepSeek/Ollama key exists and input is rich enough)
    if (
      aiGateway.hasLiveEngine() &&
      ctx.intent.kind !== 'casual_greeting' &&
      ctx.intent.memoryAction?.type !== 'forget_explicit' &&
      rawUserInput.trim().length >= 16
    ) {
      void distillMemoriesWithLLM(ctx.userId, ctx.session.id, rawUserInput, ctx.session.activeTopic).catch(() => {});
    }
  } catch (err) {
    console.warn('[aiMemory] Failed persisting turn:', err instanceof Error ? err.message : err);
  }

  return saved;
}

async function distillMemoriesWithLLM(
  userId: string,
  sessionId: string,
  userMessage: string,
  activeTopic: string
): Promise<void> {
  const prompt = `分析下面这条用户输入，只抽取真正值得长期跨会话记住的【稳定信息】（用户的长期目标、进行中的项目、长期偏好/禁忌、个人职业习惯、明确的决策）。
严禁抽取临时闲聊、单次问候、数学题、临时查询或你的猜测！若没有值得长期记住的内容，请直接返回 []。

当前话题：${activeTopic || '无'}
用户输入：${userMessage}

严格只输出 JSON 数组，每项格式：
[{"category":"goal|project|habit|preference|decision|fact","canonical_key":"英文短键如pref:style或project:ai","summary":"一句客观简练中文描述","keywords":"空格分隔关键词","importance":1-10,"replaces_old":true|false}]`;

  const res = await aiGateway.generateContent(
    aiGateway.getChatModelId(),
    prompt,
    '你是一个极度克制的记忆筛选器，只输出合法 JSON 数组，宁缺毋滥。',
    undefined,
    [],
    240
  );
  if (!res.success || !res.content) return;

  const jsonMatch = res.content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return;
  const arr = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(arr)) return;

  const validCategories = new Set<MemoryCategory>([
    'goal',
    'project',
    'habit',
    'preference',
    'decision',
    'fact',
    'relationship',
  ]);

  for (const item of arr.slice(0, 3)) {
    if (!item || typeof item.summary !== 'string' || !validCategories.has(item.category)) continue;
    aiMemoryStore.upsertMemory({
      userId,
      category: item.category,
      canonicalKey: typeof item.canonical_key === 'string' ? item.canonical_key : '',
      summary: item.summary,
      keywords: typeof item.keywords === 'string' ? item.keywords : item.summary,
      confidence: 0.85,
      importance: typeof item.importance === 'number' ? item.importance : 6,
      sourceSessionId: sessionId,
      sourceQuote: userMessage,
      replacesConflictingKey: item.replaces_old === true,
    });
  }
}
