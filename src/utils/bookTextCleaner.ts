/**
 * Shared text cleaner for all imported books (PDF, TXT, Markdown, Wikisource, Gutenberg, Archive).
 * Strips formatting tokens, stray OCR symbols, box/dingbat glyphs, TOC dot leaders,
 * footnote citation brackets/superscripts, and standalone/marginal page numbers
 * while keeping real multilingual prose intact.
 */

export function sanitizeImportedBookText(
  raw: string,
  options?: { preserveBlankLines?: boolean }
): string {
  if (!raw) return '';
  const preserveBlankLines = options?.preserveBlankLines !== false;

  let text = String(raw)
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/\(cid:\d+\)/gi, ' ')
    .replace(/\bcid:\d+\b/gi, ' ')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\uFFFD\uFFFC\u20DD-\u20E0]/g, '')
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .replace(/[\uE000-\uF8FF]/g, '');

  // Strip PDF wingdings / dingbats / box-drawing / geometric ornaments & pictographs
  text = text
    .replace(/[\u2500-\u25FF\u2600-\u27BF\u2B00-\u2BFF]/g, ' ')
    .replace(/[•‣◦⁃∙⋅※†‡§¶◊■□◆◇▪▫●○★☆❖❥❦❧→←↑↓↔]/g, ' ');
  try {
    text = text.replace(/\p{Extended_Pictographic}/gu, ' ');
  } catch {
    // Ignore on older runtimes
  }

  // Strip Markdown & wiki markup tokens
  text = text
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?=[^\w*]|$)/g, '$1$2')
    .replace(/\*{2,}/g, ' ')
    .replace(/`+/g, '');

  // Unwrap synthetic bracketed headings and strip citation / edit markers
  text = text
    .replace(/【([^】\n]+)】/g, '$1')
    .replace(/\[(edit|编辑|تعديل|citation needed|note\s*\d*|ref\s*\d*|注\s*\d*|p\.?\s*\d+)\]/gi, ' ')
    .replace(/\[[\d٠-٩]{1,4}\]/g, '')
    .replace(/\{[\d٠-٩]{1,4}\}/g, '')
    .replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰₀₁₂₃₄₅₆₇₈₉⁽⁾]+/g, '')
    // Inline footnote markers directly hugging words/punctuation: word(12) or 。(٣)
    // Preserve spaced 4-digit years like "(1998)" or "(2024)"
    .replace(/([\p{L}.,;:!?。，、；：！？،؛؟])\(\s*[\d٠-٩]{1,3}\s*\)/gu, '$1');

  const cleanedLines: string[] = [];
  for (const rawLine of text.split('\n')) {
    let line = rawLine.trim();
    if (!line) {
      if (preserveBlankLines) cleanedLines.push('');
      continue;
    }

    // Strip markdown heading / blockquote / bullet prefixes
    line = line
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s{0,3}>\s?/, '')
      .replace(/^\s*[-*+]\s+(?=\S)/, '');

    // Drop pure separator/ornament lines (---, ===, ***, ___, ~~~, .....)
    if (/^[-=*_~·•.\s\\/|+]{3,}$/.test(line)) {
      continue;
    }

    // Drop standalone page number / folio lines anywhere in imported documents
    if (
      /^[-–—()[\]\s]*(?:第\s*[\d一二三四五六七八九十百千万]+\s*页|page\s*[\d]+|p\.?\s*\d+|صفحة\s*[\d٠-٩]+|ص\s*[:.]?\s*[\d٠-٩]+|[\d٠-٩]{1,4}|[ivxlcdm]{2,6})[-–—()[\]\s]*$/i.test(
        line
      )
    ) {
      continue;
    }

    // Drop lines composed solely of digits, separators, and stray symbols (zero linguistic letters)
    if (/^[\d٠-٩\s.,;:/\-+*=()[\]{}<>~|!?]{4,}$/.test(line) && !/[A-Za-z\u0621-\u064A\u4E00-\u9FFF]/.test(line)) {
      continue;
    }

    // Strip TOC dot/dash leaders and trailing page numbers ("Chapter 1 ...... 14" -> "Chapter 1")
    line = line.replace(
      /\s*(?:\.{3,}|·{3,}|…{2,}|-{4,}|_{3,})\s*[\d٠-٩ivxlcdmIVXLCDM]{1,5}\s*$/,
      ''
    );

    // Strip leading or trailing page-margin numbers separated by tabs / wide whitespace
    if (/[A-Za-z\u0621-\u064A\u4E00-\u9FFF]/.test(line)) {
      line = line
        .replace(/(?:\t|\s{3,})[\d٠-٩]{1,4}\s*$/, '')
        .replace(/^[\d٠-٩]{1,4}(?:\t|\s{3,})/, '');
    }

    // Collapse repeated non-ellipsis symbol bursts (e.g., "!!!", "???", "---") cleanly
    line = line
      .replace(/!{2,}/g, '!')
      .replace(/\?{2,}/g, '?')
      .replace(/\.{4,}/g, '...')
      .replace(/-{3,}/g, '—')
      .replace(/_{2,}/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();

    if (line) {
      cleanedLines.push(line);
    }
  }

  return cleanedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sanitizeImportedChapterTitle(rawTitle: string, fallback: string): string {
  let cleaned = sanitizeImportedBookText(rawTitle || '', { preserveBlankLines: false })
    .replace(/\s+/g, ' ')
    .trim();
  // Strip trailing TOC/header page number suffixes like " — 12", " · 12", " | 12"
  if (/[A-Za-z\u0621-\u064A\u4E00-\u9FFF]/.test(cleaned)) {
    cleaned = cleaned.replace(/\s*(?:[—–\-|·…]|\.{2,})\s*[\d٠-٩]{1,4}\s*$/, '').trim();
  }
  return cleaned || fallback;
}
