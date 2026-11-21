/**
 * Shared plain-text sanitizer for ONE AI replies.
 * Ensures normal AI replies read like crisp, clean human language without Markdown symbols,
 * decorative brackets, bullet glyphs, or emojis (preserving code fences only in code mode).
 */

export function sanitizeAiPlainReply(
  raw: string,
  options?: { preserveCodeBlocks?: boolean }
): string {
  if (!raw) return '';
  const preserveCodeBlocks = Boolean(options?.preserveCodeBlocks);

  // Strip internal control / thought tags first
  let text = String(raw)
    .replace(/\r\n/g, '\n')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<(?:think|thought)>[\s\S]*$/i, '')
    .replace(/\[\[(?:EMO|EMOTION):[^\]]*\]\]\s*/gi, '')
    .replace(/\[\[ACTION:[\s\S]*?\]\]\s*/gi, '')
    .replace(/\[\[(?:EMO|EMOTION)(?::[a-z_-]*)?\]?\]?$/i, '')
    .replace(/\[\[ACTION:[\s\S]*$/i, '');

  const codeBlocks: string[] = [];
  if (preserveCodeBlocks) {
    text = text.replace(/```[\s\S]*?```/g, (block) => {
      const idx = codeBlocks.length;
      codeBlocks.push(block);
      return `__ONE_CODE_BLOCK_${idx}__`;
    });
  } else {
    // Strip code fence markers while keeping inner lines cleanly readable
    text = text.replace(/```[a-zA-Z0-9_+-]*\n?/g, '').replace(/```/g, '');
  }

  // Convert markdown links & images into plain labels
  text = text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1 ($2)')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Unwrap inline markdown styling (**bold**, *italic*, __underline__, `code`, ~~strike~~)
  text = text
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?=[^\w*]|$)/g, '$1$2');

  // Unwrap decorative CJK brackets & stray formatting symbols
  text = text
    .replace(/【([^】\n]+)】/g, '$1')
    .replace(/「([^」\n]+)」/g, '$1')
    .replace(/『([^』\n]+)』/g, '$1')
    .replace(/〖([^〗\n]+)〗/g, '$1')
    .replace(/〔([^〕\n]+)〕/g, '$1');

  // Strip emojis, pictographs, variation selectors, ZWJ, box drawing & dingbat glyphs
  try {
    text = text.replace(/\p{Extended_Pictographic}/gu, '');
  } catch {
    // Fallback for engines without Extended_Pictographic
    text = text.replace(/[\uD83C-\uDBFF\uDC00-\uDFFF]+/g, '');
  }
  text = text
    .replace(/[\u2600-\u27BF\u2500-\u25FF\u2B00-\u2BFF\uFE0E\uFE0F\u200D]/g, '')
    .replace(/[•‣◦⁃∙⋅※†‡§¶◆◇★☆■□▲▼►◄👉💡📌🎯🔥✨🌟🎉🚀✅✔✕✖➤➔➜➡🔹🔸🔺🔻]/g, '');

  // Clean line-level markdown structures (# headings, HR lines, > quotes, - / * bullets)
  const cleanedLines = text
    .split('\n')
    .map((line) => {
      if (/^\s*(?:[-*_]){3,}\s*$/.test(line)) return '';
      return line
        .replace(/^\s{0,3}#{1,6}\s+/, '')
        .replace(/^\s{0,3}>\s?/, '')
        .replace(/^\s*[-*+]\s+/, '')
        .replace(/\*{2,}/g, '')
        .replace(/`+/g, '')
        .replace(/[ \t]{2,}/g, ' ')
        .trimEnd();
    });

  text = cleanedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (preserveCodeBlocks && codeBlocks.length > 0) {
    text = text.replace(/__ONE_CODE_BLOCK_(\d+)__/g, (_m, idxStr) => codeBlocks[Number(idxStr)] || '');
  }

  return text;
}
