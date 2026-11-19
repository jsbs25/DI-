/**
 * Unified Library AI Service for EARTH ONE.
 * - All library reading AI features route through this service.
 * - Uses Google Gemini when configured (GEMINI_API_KEY / GOOGLE_API_KEY / oneAiDb gemini creds),
 *   with fallback to existing gateway/router only when Gemini is unavailable.
 * - Frontend must not call Gemini directly.
 */

import type { Request } from 'express';
import { getGeminiApiKey, getGeminiClient } from './geminiClient.ts';
import { aiGateway } from './aiGateway.ts';
import { oneAiRouter } from './oneAi/router.ts';

export type LibraryAiAction = 'explain' | 'translate' | 'dictionary' | 'analyze' | 'summarize' | 'ask' | 'ocr';

export interface LibraryAiContext {
  bookId?: string;
  bookTitle?: string;
  author?: string;
  chapterId?: string;
  chapterTitle?: string;
  pageNumber?: number;
  totalPages?: number;
  language?: string; // content language (ar/zh/en etc)
  selectedText?: string;
  pageText?: string;
  surroundingContext?: string;
  question?: string;
  targetLanguage?: 'zh' | 'en' | 'ar';
  uiLanguage?: 'zh' | 'en' | 'ar';
  pageImageBase64?: string; // data URL or raw base64
  mode?: string; // e.g. paragraph/sentence/word/page/chapter
}

export interface LibraryAiResult {
  success: boolean;
  action: LibraryAiAction;
  provider: 'gemini' | 'fallback' | 'none';
  model?: string;
  content?: string;
  data?: Record<string, unknown>;
  error?: string;
  errorCode?: string;
  contextUsed?: {
    bookTitle?: string;
    chapterTitle?: string;
    pageNumber?: number;
    hasSelection: boolean;
    hasPageText: boolean;
    hasImage: boolean;
    analyzedScope: string;
  };
}

const FLASH_MODEL = process.env.GEMINI_FLASH_MODEL || 'gemini-2.5-flash';
const PRO_MODEL = process.env.GEMINI_PRO_MODEL || 'gemini-2.5-pro';

function cleanBase64(img?: string): string | null {
  if (!img || typeof img !== 'string') return null;
  const trimmed = img.trim();
  if (trimmed.length < 80) return null;
  return trimmed.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, '');
}

function detectImageMime(img?: string): string {
  if (!img) return 'image/jpeg';
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/i.exec(img.trim());
  return m?.[1] || 'image/jpeg';
}

function uiLang(ctx: LibraryAiContext): 'zh' | 'en' | 'ar' {
  if (ctx.uiLanguage === 'en' || ctx.uiLanguage === 'ar' || ctx.uiLanguage === 'zh') return ctx.uiLanguage;
  if (ctx.targetLanguage === 'en' || ctx.targetLanguage === 'ar' || ctx.targetLanguage === 'zh') return ctx.targetLanguage;
  return 'zh';
}

function langName(code?: string): string {
  const map: Record<string, string> = { ar: '阿拉伯语', zh: '中文', en: '英语', es: '西班牙语', fr: '法语', ru: '俄语' };
  return map[code || ''] || (code || '未知语言');
}

function clampText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function buildBookContextHeader(ctx: LibraryAiContext): string {
  const parts: string[] = [];
  if (ctx.bookTitle) parts.push(`书名：《${ctx.bookTitle}》`);
  if (ctx.author) parts.push(`作者：${ctx.author}`);
  if (ctx.chapterTitle) parts.push(`章节：${ctx.chapterTitle}`);
  if (typeof ctx.pageNumber === 'number') parts.push(`页码：第 ${ctx.pageNumber} 页${ctx.totalPages ? ` / 共 ${ctx.totalPages} 页` : ''}`);
  if (ctx.language) parts.push(`原文语言：${langName(ctx.language)} (${ctx.language})`);
  return parts.join('\n');
}

function analyzedScope(ctx: LibraryAiContext): string {
  if (cleanBase64(ctx.pageImageBase64) && !clampText(ctx.pageText, 20) && !clampText(ctx.selectedText, 1)) return '当前页扫描图像（视觉识别）';
  if (ctx.selectedText) return '用户选中文本及其提供的上下文';
  if (ctx.pageText) return '当前页/当前视图可提取文本';
  if (ctx.surroundingContext) return '提供的章节/上下文片段';
  return '有限上下文';
}

function commonRules(reply: 'zh' | 'en' | 'ar'): string {
  const base = [
    '你是 EARTH ONE 伊斯兰世界图书馆的专业阅读助手。',
    '必须严格基于提供的书籍上下文、选中文本、页码与原文作答；不要脱离当前书籍胡乱解释。',
    '区分：原文内容、你的解释、翻译、以及（如必要的）补充背景知识。补充知识必须明确标注为“背景补充/一般性知识”，不得冒充书中原文。',
    '如果上下文不足、无法确认词根/学术观点/原文含义，必须明确说明“不确定/无法从当前内容确认”，不要编造页码、引文、学者观点或原文。',
    '涉及伊斯兰经典（教法、经注、圣训、阿语语法修辞、历史思想等）时，结合语境与学科背景谨慎解释；存在不同观点时如实指出，不把争议说成定论。',
    '对于阿拉伯语词语/句子，优先结合当前句子语境给出含义，不要只给脱离上下文的普通词典释义。',
  ];
  if (reply === 'en') {
    base.push('Reply in clear English unless the user explicitly asks for another language.');
  } else if (reply === 'ar') {
    base.push('أجب باللغة العربية الواضحة ما لم يطلب المستخدم لغة أخرى.');
  } else {
    base.push('除非用户明确要求其他语言，否则请用清晰、易懂、准确的中文回答。');
  }
  return base.join('\n');
}

async function callGeminiText(prompt: string, system: string, image?: { mimeType: string; data: string } | null, preferPro = false): Promise<{ text: string; model: string }> {
  const client = getGeminiClient();
  if (!client) throw new Error('GOOGLE_API_KEY/GEMINI_API_KEY 未配置或不可用。请在服务端环境变量中配置后重启服务。');

  const models = preferPro ? [PRO_MODEL, FLASH_MODEL] : [FLASH_MODEL, PRO_MODEL];
  let lastErr: unknown;
  for (const model of models) {
    try {
      const parts: any[] = [{ text: `${system}\n\n${prompt}` }];
      if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
      const resp = await client.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
      });
      const text = String((resp as any)?.text || '').trim();
      if (text) return { text, model };
      lastErr = new Error('Gemini 返回空内容');
    } catch (e) {
      lastErr = e;
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr || 'Gemini 调用失败');
  throw new Error(msg);
}

async function fallbackText(prompt: string, system: string, req?: Request): Promise<string> {
  if (oneAiRouter.hasAnyUsableEngine()) {
    const routed = await oneAiRouter.executeUnifiedTurn({
      requestId: `libai_${Date.now().toString(36)}`,
      userId: null,
      subjectKey: `ip:${(req as any)?.ip || 'unknown'}`,
      userTier: 'free',
      prompt,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      mode: 'library-reading',
      maxTokens: 1200,
      stream: false,
    });
    if (routed.success && routed.content.trim()) return routed.content.trim();
  }
  if (aiGateway.hasLiveEngine()) {
    const res = await aiGateway.generateContent('one-ai', prompt, system, undefined, undefined, undefined, { mode: 'library-reading' });
    if (res.success && res.content.trim()) return res.content.trim();
    throw new Error(res.errorMessage || 'AI 引擎暂时不可用');
  }
  throw new Error('未配置可用的 AI 引擎（Gemini/网关/Ollama 均不可用）。');
}

async function runTextAction(action: LibraryAiAction, ctx: LibraryAiContext, req?: Request, preferPro = false): Promise<LibraryAiResult> {
  const reply = uiLang(ctx);
  const header = buildBookContextHeader(ctx);
  const selected = clampText(ctx.selectedText, 6000);
  const pageText = clampText(ctx.pageText, 7000);
  const surrounding = clampText(ctx.surroundingContext, 4000);
  const question = clampText(ctx.question, 800);
  const b64 = cleanBase64(ctx.pageImageBase64);
  const mime = detectImageMime(ctx.pageImageBase64);
  const hasImage = !!b64;

  let taskPrompt = '';
  let extra = '';

  if (action === 'explain') {
    taskPrompt = reply === 'zh'
      ? `请解释用户当前不理解的内容。输出结构：\n1) 原文/本页在说什么（概述）\n2) 关键句或关键内容逐点解释\n3) 难词/术语解释（阿语词请给出词义与必要的读音/词形提示；不确定则说明）\n4) 上下文与作者意图（仅基于提供内容）\n5) 如有必要的背景补充请单独标注“背景补充”，并说明不确定性\n${question ? `\n用户具体问题：${question}` : ''}`
      : `Explain the selected/presented content clearly with: overview, key points, difficult terms (for Arabic include contextual meaning; note uncertainty), context/intent, and clearly labeled background notes if needed. ${question ? `User question: ${question}` : ''}`;
  } else if (action === 'translate') {
    const target = ctx.targetLanguage || 'zh';
    const targetName = target === 'ar' ? '阿拉伯语' : target === 'en' ? '英语' : '中文';
    taskPrompt = `请将提供的原文翻译为${targetName}。要求：\n- 保持忠实原意，不擅自改写经典原文含义\n- 尽量按句/段对应保留原文与译文关系（可用“原文：”“译文：”分段）\n- 专有名词或难以确定处请保留并注明\n- 若内容为扫描图像，先识读可见文字再翻译，并说明识读范围/不确定性`;
  } else if (action === 'dictionary') {
    const word = selected || question;
    taskPrompt = reply === 'zh'
      ? `请对以下词语进行“结合当前书籍与句子语境”的专业释义（尤其重视阿拉伯语）。请优先返回严格 JSON（无 markdown 代码块）字段：{"word":"原词","reading":"读音/标音/音标","partOfSpeech":"词性","root":"词根/词源(可确认时)","forms":"相关词形/动词形式/单复数等(适用时)","basicMeaning":"基本词义","contextMeaning":"当前句子/语境中的具体含义","zh":"中文解释","en":"英文解释","example":"简短例句与翻译","notes":"不确定性或多义说明"}。若无法可靠识别词根或词形，对应字段写“无法从当前内容确认”。查询词：${word}`
      : `Provide a context-aware dictionary entry for the word in this book context. Prefer strict JSON with fields: word, reading, partOfSpeech, root, forms, basicMeaning, contextMeaning, zh, en, example, notes. Word: ${word}`;
  } else if (action === 'analyze') {
    taskPrompt = reply === 'zh'
      ? `请对当前内容/章节片段进行深度分析。输出：1) 主要内容与核心观点 2) 重要术语与概念 3) 难点解释 4) 逻辑关系/论证结构 5) 重点总结。必须注明你实际分析的文本范围；若提供内容不完整，不要假装分析了整章。${question ? `\n用户问题：${question}` : ''}`
      : `Analyze the provided content: main ideas, key terms, difficult parts, logical structure, and summary. State the actual analyzed scope clearly. ${question ? `User question: ${question}` : ''}`;
  } else if (action === 'summarize') {
    taskPrompt = reply === 'zh'
      ? `请总结当前提供的章节/页面内容。输出：1) 本章/本页主要内容 2) 核心观点 3) 重要术语 4) 难懂部分提示 5) 简要总结。必须明确“实际总结范围”（例如仅当前页或所提供片段），不要声称总结了未提供的内容。`
      : `Summarize the provided chapter/page content with main points, key ideas, important terms, difficult parts, and a brief conclusion. Clearly state the actual summarized scope.`;
  } else if (action === 'ask') {
    taskPrompt = reply === 'zh'
      ? `请回答用户关于当前书籍内容的问题。优先依据提供的原文/页码/上下文回答；每次尽可能注明书名、章节、页码与对应原文依据。若当前书籍内容不足以回答，必须明确说明，并将“书中依据”与“背景补充知识”分开。用户问题：${question || '（未提供具体问题，请概述当前内容可回答的问题）'}`
      : `Answer the user's question based primarily on the provided book content. Cite book title/chapter/page and relevant text when possible. If insufficient, say so and separate book evidence from background knowledge. Question: ${question || '(none provided)'}`;
  } else if (action === 'ocr') {
    taskPrompt = reply === 'zh'
      ? `请对提供的扫描书页图像进行 OCR 文字识别。要求：\n- 尽可能准确识别阿拉伯语/中文/英文原文，保留段落与换行\n- 对无法辨认处用【不清】标注，不要猜测\n- 输出 JSON：{"text":"识别文本","languageGuess":"ar|zh|en|mixed|unknown","confidenceNote":"对识别质量的说明","warnings":["..."]}`
      : `Perform OCR on the provided scanned book page image for Arabic/Chinese/English. Preserve paragraphs, mark illegible parts as [illegible], do not guess. Return JSON: {"text":"...","languageGuess":"ar|zh|en|mixed|unknown","confidenceNote":"...","warnings":["..."]}`;
  }

  const prompt = [
    header ? `【当前阅读上下文】\n${header}` : '',
    selected ? `【用户选中文本/查询词】\n${selected}` : '',
    surrounding ? `【前后文/补充上下文】\n${surrounding}` : '',
    pageText ? `【当前页/当前视图文本】\n${pageText}` : '',
    hasImage ? '【附加信息】已提供当前页图像（可能为扫描版或文字层不足）。' : '',
    taskPrompt,
    extra,
  ].filter(Boolean).join('\n\n');

  const system = commonRules(reply);
  const usePro = preferPro || action === 'analyze' || action === 'summarize' || (pageText.length + surrounding.length + selected.length > 5000);
  const ctxUsed = {
    bookTitle: ctx.bookTitle,
    chapterTitle: ctx.chapterTitle,
    pageNumber: ctx.pageNumber,
    hasSelection: !!selected,
    hasPageText: !!pageText,
    hasImage,
    analyzedScope: analyzedScope(ctx),
  };

  try {
    if (hasImage || getGeminiApiKey()) {
      const img = b64 ? { mimeType: mime, data: b64 } : null;
      const out = await callGeminiText(prompt, system, img, usePro);
      let data: Record<string, unknown> | undefined;
      if (action === 'dictionary' || action === 'ocr') {
        try {
          const cleaned = out.text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
          const jm = cleaned.match(/\{[\s\S]*\}/);
          if (jm) data = JSON.parse(jm[0]);
        } catch {}
      }
      return { success: true, action, provider: 'gemini', model: out.model, content: out.text, data, contextUsed: ctxUsed };
    }
  } catch (e: any) {
    // fall through to fallback only for non-key/explicit Gemini failures? keep transparent
    const msg = String(e?.message || e);
    if (/未配置|GOOGLE_API_KEY|GEMINI_API_KEY|401|403|API key/i.test(msg)) {
      return { success: false, action, provider: 'none', error: msg, errorCode: 'GEMINI_UNAVAILABLE', contextUsed: ctxUsed };
    }
    // try fallback
    try {
      const text = await fallbackText(prompt, system, req);
      return { success: true, action, provider: 'fallback', model: 'fallback', content: text, contextUsed: { ...ctxUsed, analyzedScope: ctxUsed.analyzedScope + '（非 Gemini 回退模型）' } };
    } catch (e2: any) {
      return { success: false, action, provider: 'none', error: msg, errorCode: 'GEMINI_ERROR', contextUsed: ctxUsed };
    }
  }

  // no Gemini key: try fallback
  try {
    const text = await fallbackText(prompt, system, req);
    return { success: true, action, provider: 'fallback', model: 'fallback', content: text, contextUsed: { ...ctxUsed, analyzedScope: ctxUsed.analyzedScope + '（Gemini 未配置，使用回退模型）' } };
  } catch (e: any) {
    return { success: false, action, provider: 'none', error: String(e?.message || e), errorCode: 'NO_AI_ENGINE', contextUsed: ctxUsed };
  }
}

export async function libraryAiExplain(ctx: LibraryAiContext, req?: Request) { return runTextAction('explain', ctx, req, false); }
export async function libraryAiTranslate(ctx: LibraryAiContext, req?: Request) { return runTextAction('translate', ctx, req, false); }
export async function libraryAiDictionary(ctx: LibraryAiContext, req?: Request) { return runTextAction('dictionary', ctx, req, false); }
export async function libraryAiAnalyze(ctx: LibraryAiContext, req?: Request) { return runTextAction('analyze', ctx, req, true); }
export async function libraryAiSummarize(ctx: LibraryAiContext, req?: Request) { return runTextAction('summarize', ctx, req, true); }
export async function libraryAiAsk(ctx: LibraryAiContext, req?: Request) { return runTextAction('ask', ctx, req, false); }
export async function libraryAiOcr(ctx: LibraryAiContext, req?: Request) { return runTextAction('ocr', ctx, req, false); }

export function getGeminiStatus() {
  const key = getGeminiApiKey();
  return {
    configured: !!key,
    models: { flash: FLASH_MODEL, pro: PRO_MODEL },
    keyMasked: key ? `${key.slice(0, 6)}...${key.slice(-4)}` : null,
  };
}
