import type { Book, Chapter } from '../src/types/index.ts';

export interface ReadingCitation {
  title: string;
  author: string;
  version: string;
  location: string;
  sourceUrl: string;
}

export interface ReadingEvidence {
  book: Book;
  chapter: Chapter;
  selectedPassage: string;
  context: string;
  coverage: 'full_text' | 'excerpt';
  notice: string;
  citation: ReadingCitation;
}

export type ReadingEvidenceResult =
  | { ok: true; evidence: ReadingEvidence }
  | { ok: false; status: number; code: string; error: string };

const MAX_SELECTION_CHARS = 4000;
const CONTEXT_CHARS = 1200;
const SUPPORTED_REPLY_LANGUAGES: Record<string, string> = {
  zh: 'Chinese', en: 'English', ar: 'Arabic', es: 'Spanish', fr: 'French',
  ru: 'Russian', de: 'German', it: 'Italian', pt: 'Portuguese', ja: 'Japanese'
};

function normalizedWithOffsets(value: string): { text: string; starts: number[]; ends: number[] } {
  let text = '';
  const starts: number[] = [];
  const ends: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (/\s/.test(value[index])) {
      if (!text || text.endsWith(' ')) {
        if (text.endsWith(' ') && ends.length) ends[ends.length - 1] = index + 1;
        continue;
      }
      text += ' ';
      starts.push(index);
      ends.push(index + 1);
    } else {
      text += value[index];
      starts.push(index);
      ends.push(index + 1);
    }
  }
  if (text.endsWith(' ')) {
    text = text.slice(0, -1);
    starts.pop();
    ends.pop();
  }
  return { text, starts, ends };
}

function safeSourceUrl(book: Book): string | undefined {
  const raw = book.sourceUrl || book.externalReadUrl;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function editionLabel(book: Book): string | undefined {
  if (book.isbn?.trim()) return `ISBN ${book.isbn.trim()}`;
  if (book.publisher?.trim() && book.year?.trim()) return `${book.publisher.trim()}, ${book.year.trim()}`;
  if (book.externalId?.trim()) return `${book.source} record ${book.externalId.trim()}`;
  return undefined;
}

export function resolveReadingEvidence(book: Book, chapterId: unknown, selectedText: unknown): ReadingEvidenceResult {
  const isEpubOnly = book.formatType === 'epub' ||
    (!!book.epubUrl && (!Array.isArray(book.chapters) || book.chapters.length === 0));
  if (isEpubOnly) {
    return {
      ok: false,
      status: 409,
      code: 'EPUB_TEXT_UNAVAILABLE',
      error: '当前 EPUB 正文仅由浏览器阅读器呈现；服务器没有解析并保存可核验的章节文本或 EPUB CFI 定位。EPUB AI 解读暂不支持，未向 AI 发送请求。'
    };
  }
  if (typeof chapterId !== 'string' || !chapterId.trim()) {
    return { ok: false, status: 400, code: 'CHAPTER_REQUIRED', error: '请选择一个有明确章节定位的正文段落。' };
  }
  if (typeof selectedText !== 'string' || !selectedText.trim() || selectedText.trim().length > MAX_SELECTION_CHARS) {
    return { ok: false, status: 400, code: 'SELECTION_INVALID', error: `所选文字为空或过长（最多 ${MAX_SELECTION_CHARS} 个字符）。` };
  }

  const chapter = Array.isArray(book.chapters) ? book.chapters.find(item => item.id === chapterId) : undefined;
  if (!chapter || typeof chapter.content !== 'string' || !chapter.content.trim()) {
    return { ok: false, status: 409, code: 'BOOK_TEXT_UNAVAILABLE', error: '当前书目没有可供核验的章节正文；只有书目信息或外部阅读入口时，AI 不会假装读过原文。' };
  }
  if (book.textAvailability !== 'full_text' && book.textAvailability !== 'excerpt') {
    return { ok: false, status: 409, code: 'BOOK_TEXT_UNVERIFIED', error: '当前馆藏没有经过核实的全文/片段标记，或只有元数据预览；请打开来源平台阅读，AI 不会把预览当作正文。' };
  }

  const sourceText = normalizedWithOffsets(chapter.content);
  const normalizedSelection = selectedText.trim().replace(/\s+/g, ' ');
  if (!normalizedSelection || normalizedSelection.length > MAX_SELECTION_CHARS) {
    return { ok: false, status: 400, code: 'SELECTION_INVALID', error: '所选文字无法作为有效正文段落核验。' };
  }
  const matchAt = sourceText.text.indexOf(normalizedSelection);
  if (matchAt < 0) {
    return { ok: false, status: 422, code: 'SELECTION_NOT_IN_SOURCE', error: '所选文字与服务器保存的本章原文不匹配；未向 AI 发送请求。请从当前阅读器正文重新选择。' };
  }

  const sourceUrl = safeSourceUrl(book);
  const version = editionLabel(book);
  if (!sourceUrl || !version) {
    return { ok: false, status: 409, code: 'CITATION_UNVERIFIABLE', error: '这本书缺少可核查的来源页面或版本标识，因此无法生成符合要求的引用；未向 AI 发送请求。' };
  }

  const sourceStart = sourceText.starts[matchAt];
  const sourceEnd = sourceText.ends[matchAt + normalizedSelection.length - 1];
  const contextStart = Math.max(0, sourceStart - CONTEXT_CHARS);
  const contextEnd = Math.min(chapter.content.length, sourceEnd + CONTEXT_CHARS);
  const selectedPassage = chapter.content.slice(sourceStart, sourceEnd).trim();
  const context = chapter.content.slice(contextStart, contextEnd).trim();
  const coverage = book.textAvailability;
  const notice = coverage === 'full_text'
    ? '依据已存全文中的本章原文与所选段落邻近上下文生成；本次模型输入限于该段上下文，不代表已分析全书。'
    : '当前来源仅有片段，不是全书全文。回答只解释已存片段及其邻近上下文，不能据此总结或声称读过整部作品。';

  return {
    ok: true,
    evidence: {
      book,
      chapter,
      selectedPassage,
      context,
      coverage,
      notice,
      citation: {
        title: book.title,
        author: book.author,
        version,
        location: chapter.title,
        sourceUrl
      }
    }
  };
}

export function buildReadingPrompt(evidence: ReadingEvidence, replyLanguageCode = 'zh'): { prompt: string; systemInstruction: string } {
  const replyLanguage = SUPPORTED_REPLY_LANGUAGES[replyLanguageCode] || 'Chinese';
  const { book, chapter, citation } = evidence;
  const isArabic = (book.language || '').toLowerCase().startsWith('ar') || /[\u0600-\u06FF]/.test(evidence.selectedPassage.slice(0, 120));
  const prompt = [
    `请用${replyLanguage}，严格依据当前书籍与所选段落的上下文进行解读（不要脱离原文、不要只给泛泛词典释义）。`,
    `【书籍】《${citation.title}》 · ${citation.author}`,
    `【版本/来源】${citation.version}；${citation.sourceUrl}`,
    `【定位】${citation.location}${book.language ? `；原文语言：${book.language}` : ''}`,
    `【文本范围】${evidence.coverage === 'full_text' ? '已存全文（本次仅提供所选段落及邻近上下文）' : '已存片段（非全书）'}`,
    `【说明】${evidence.notice}`,
    '',
    '请按需提供（仅基于所给原文与邻近上下文能确认的部分）：',
    '1) 准确翻译/转述（如原文为阿语等外语，给出通顺译文并可对关键词逐词/词组对应说明）',
    '2) 关键词、难点词、语法/句法或修辞要点：必须结合“本句/本段”语境解释含义，不要脱离上下文',
    isArabic ? '3) 若涉及阿拉伯语经典/宗教/学术文本：结合语境说明词义、用法或可能的语法角色；无法从当前上下文确认词根、学术观点或确切判读时必须明确说明“不确定”，不要编造' : '3) 结合文体与学科背景做谨慎解释；存在歧义或不同理解时如实说明，不把不确定内容说成定论',
    '4) 仅由所给原文支持的段落含义与要点（不得声称已读全书或引用未提供内容）',
    '',
    '所选原文（服务器保存的正文，证据）：',
    JSON.stringify(evidence.selectedPassage),
    '',
    '服务器核验的邻近上下文（同一章节，证据）：',
    JSON.stringify(evidence.context),
  ].join('\n');
  const systemInstruction = [
    'You are an evidence-grounded, book-context-aware reading assistant for EARTH ONE Library.',
    'Use only the supplied source passage and its adjacent context as evidence for claims about this book/chapter.',
    'Stay grounded in the current book and selection: explain meaning in sentence and book context, not as detached dictionary-only answers.',
    'For Arabic/Islamic/classical texts, be careful with grammar, rhetoric, jurisprudence, theology, and scholarly opinions; state uncertainty when the provided context is insufficient and never fabricate roots, citations, page numbers, or scholarly claims.',
    'Do not claim to have read the whole book. Do not infer missing text, page numbers, editions, or citations beyond what is provided.',
    'Clearly distinguish translation, explanation grounded in the text, and any optional general background; label background clearly and omit it if not reliable.',
    `Reply in ${replyLanguage}.`,
  ].join(' ');
  return { prompt, systemInstruction };
}
