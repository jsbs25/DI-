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
  const prompt = [
    `请用${replyLanguage}解释用户从书中选出的段落。`,
    '请给出：必要时的翻译、关键词/难点、句法或表达说明，以及仅由所给原文支持的段落含义。',
    '如果所给内容不足以回答某个部分，请直接说明不足；不要补造页码、章节、版本、引文或事实。',
    '所选原文（来自服务器保存的正文）：',
    JSON.stringify(evidence.selectedPassage),
    '服务器核验的邻近上下文（同一章节）：',
    JSON.stringify(evidence.context),
    `章节定位：${evidence.chapter.title}`
  ].join('\n');
  const systemInstruction = [
    'You are an evidence-grounded reading assistant.',
    'Use only the supplied source passage and its adjacent context as evidence for claims about this book.',
    'Do not claim to have read the whole book. Do not infer missing text, page numbers, editions, or citations.',
    'Clearly distinguish any optional general background from what the supplied text itself says; omit background if it cannot be stated reliably.',
    `Answer in ${replyLanguage}.`
  ].join(' ');
  return { prompt, systemInstruction };
}
