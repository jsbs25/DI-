import type { AiTaskType, PrivacyMode, TaskClassification, UnifiedMessage } from './types.ts';

export function estimateMessagesTokens(messages: UnifiedMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    if (typeof m.content === 'string') {
      chars += m.content.length;
    } else {
      for (const p of m.content) {
        if (p.type === 'text') chars += p.text.length;
        else chars += 600; // conservative image token placeholder
      }
    }
  }
  return Math.max(16, Math.ceil(chars / 2.6));
}

export function hasVisionAttachment(messages: UnifiedMessage[]): boolean {
  return messages.some(
    (m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url' && Boolean(p.imageUrl))
  );
}

export function classifyAiTask(input: {
  prompt: string;
  messages: UnifiedMessage[];
  mode?: string;
  explicitPrivacyMode?: PrivacyMode;
  requiresTools?: boolean;
  requiresStructuredOutput?: boolean;
  userAuthenticated: boolean;
  hasPrivateMemoryContext?: boolean;
}): TaskClassification {
  const prompt = (input.prompt || '').trim();
  const lower = prompt.toLowerCase();
  const mode = (input.mode || 'general').toLowerCase();
  const hasImages = hasVisionAttachment(input.messages);
  const estimatedInputTokens = estimateMessagesTokens(input.messages);

  // Privacy level resolution
  let privacyMode: PrivacyMode = input.explicitPrivacyMode || (input.userAuthenticated ? 'no_training' : 'standard');
  if (
    input.explicitPrivacyMode === 'strict_zdr' ||
    input.hasPrivateMemoryContext ||
    /(?:密码|密钥|token|身份证|银行卡|私人|私密|日记|源码|源代码|合同|confidential|private|secret)/i.test(prompt)
  ) {
    privacyMode = 'strict_zdr';
  }

  let taskType: AiTaskType = 'B';
  let confidence = 0.82;
  let reason = 'General concise query';

  if (hasImages) {
    taskType = 'I';
    confidence = 0.98;
    reason = 'Multimodal image input detected';
    privacyMode = 'strict_zdr';
  } else if (mode === 'crawler' || mode === 'internal-digest') {
    taskType = 'O';
    confidence = 0.98;
    reason = 'Internal crawler / memory digest pipeline';
  } else if (mode === 'translate' || /^(?:请帮我)?(?:翻译|translate)\b/i.test(lower) || /翻译成|译成|translate\s+to\b/i.test(lower)) {
    taskType = 'E';
    confidence = 0.95;
    reason = 'Multilingual translation request';
  } else if (mode === 'library-reading' || estimatedInputTokens > 4500 || /(?:总结|归纳|提炼|概括).{0,12}(?:文章|全文|书籍|网页|报告|长文)|summarize\s+(?:this|the)\s+(?:article|book|document)/i.test(lower)) {
    taskType = 'H';
    confidence = 0.92;
    reason = 'Long-context reading / document summarization';
  } else if (input.requiresStructuredOutput || /(?:输出\s*json|返回\s*json|json\s*schema|结构化提取)/i.test(lower)) {
    taskType = 'K';
    confidence = 0.93;
    reason = 'Structured JSON extraction requested';
  } else if (input.requiresTools || mode === 'agent-command') {
    taskType = 'N';
    confidence = 0.95;
    reason = 'Site agent command / tool planning';
  } else if (mode === 'voice-agent' || mode === 'live-voice') {
    taskType = /(?:打开|播放|暂停|切换|去|飞往)/.test(prompt) ? 'N' : 'A';
    confidence = 0.9;
    reason = 'Interactive voice / companion dialogue';
  } else if (mode === 'language-learning' || /(?:学英语|学阿拉伯语|语法怎么用|造句|发音|单词|ielts|toefl|arabic\s+grammar)/i.test(lower)) {
    taskType = 'F';
    confidence = 0.9;
    reason = 'Language learning & tutoring';
  } else if (/(?:```|\b(?:typescript|javascript|python|rust|golang|sql|react|docker|bug|stack trace|refactor|函数|报错|调试|代码|架构)\b)/i.test(lower)) {
    taskType = 'D';
    confidence = 0.93;
    reason = 'Software engineering / code task';
    if (!input.explicitPrivacyMode) privacyMode = 'strict_zdr';
  } else if (/(?:推导|证明|微积分|线性代数|概率论|物理公式|方程式|calculate|integral|derivative|theorem|proof)/i.test(lower)) {
    taskType = 'M';
    confidence = 0.9;
    reason = 'Math & scientific derivation';
  } else if (/(?:今天|最新|刚刚|新闻|股价|天气|2026年|现在几点|谁赢了|current|latest\s+news|today)/i.test(lower)) {
    taskType = 'G';
    confidence = 0.88;
    reason = 'Real-time / live factual lookup';
  } else if (/(?:写一篇|创作|故事|散文|诗歌|脚本|演讲稿|润色|文案|write\s+a\s+story|poem|essay)/i.test(lower)) {
    taskType = 'L';
    confidence = 0.88;
    reason = 'Creative & cultural writing';
  } else if (prompt.length > 260 || /(?:深度分析|权衡|利弊|系统设计|方案对比|为什么会|底层原理|tradeoff|architecture)/i.test(lower)) {
    taskType = 'C';
    confidence = 0.87;
    reason = 'Complex multi-step reasoning';
  } else if (/(?:你好|嗨|早安|晚安|累了|难过|开心|陪我聊聊|烦死了|哈哈|hello|hi\b|tired|stressed)/i.test(lower)) {
    taskType = 'A';
    confidence = 0.88;
    reason = 'Conversational & emotional companion';
  }

  return {
    taskType,
    confidence,
    privacyMode,
    estimatedInputTokens,
    hasImages,
    requiresTools: Boolean(input.requiresTools || taskType === 'N'),
    requiresStructuredOutput: Boolean(input.requiresStructuredOutput || taskType === 'K' || taskType === 'N'),
    reason,
  };
}
