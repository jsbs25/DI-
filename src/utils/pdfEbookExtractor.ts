import { Util, type PDFDocumentProxy } from 'pdfjs-dist';
import {
  containsArabic,
  detectArabicVisualReversal,
  detectBrokenArabicEncoding,
  isArabicChar,
  isArabicCombiningMark,
  isArabicHeavyText,
  normalizeArabicProse,
  repairUnambiguousArabicLigatures,
} from './arabicTextNormalize.ts';

export type EbookBlockKind = 'h1' | 'h2' | 'paragraph' | 'footnote' | 'table';

export interface EbookBlock {
  id: string;
  kind: EbookBlockKind;
  text: string;
  rows?: string[][];
}

export interface ExtractedEbookPage {
  pageNumber: number;
  dir: 'rtl' | 'ltr';
  blocks: EbookBlock[];
  plainText: string;
  isLikelyScanned: boolean;
  extractionIssue?: 'scanned' | 'garbled_arabic';
  ocrApplied?: boolean;
}

export interface PdfTocItem {
  title: string;
  pageNumber: number;
  level: number;
}

interface TextSpanItem {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

function isCjkChar(ch: string): boolean {
  return /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch);
}

/**
 * Detects text-layer extraction that is structurally present but unreadable due to
 * broken PDF /ToUnicode / CMap mappings (common with externally imported Arabic PDFs
 * that render as random Latin letters, digits, or symbols). In that case we must
 * render the authentic PDF page canvas instead of showing corrupted reflow text.
 */
function detectGarbledPdfTextExtraction(text: string, rawItemCount: number): boolean {
  if (!text) return false;
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 40) return false;

  const letters = (text.match(/\p{L}/gu) || []).length;
  const marks = (text.match(/\p{M}/gu) || []).length;
  const digits = (text.match(/\p{N}/gu) || []).length;
  const total = compact.length;
  const letterish = letters + marks;

  // Very low proportion of letters vs digits/symbols => typical broken cmap garbage
  if (letterish < total * 0.38 && total > 60) {
    return true;
  }

  // Many tiny tokens (single chars) with few real words => glyph-id-like noise
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length >= 18) {
    const singleCharTokens = tokens.filter((t) => Array.from(t).length === 1).length;
    const shortTokens = tokens.filter((t) => Array.from(t).length <= 2).length;
    if (singleCharTokens / tokens.length > 0.5) return true;
    if (shortTokens / tokens.length > 0.72 && letterish < total * 0.55) return true;
  }

  // PDF had many text items but produced mostly numbers/punctuation noise
  if (rawItemCount >= 20 && digits > letterish * 1.2 && letterish < total * 0.5) {
    return true;
  }

  // Excessive replacement/control-like artifacts missed by other checks
  const weird = (text.match(/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
  if (weird >= 3 && weird / Math.max(1, total) > 0.02) {
    return true;
  }

  return false;
}

/**
 * Geometry-aware line joiner: uses actual horizontal PDF point gaps so adjacent
 * Arabic glyph runs (e.g., separate PDF text operators forming one cursive word
 * or diacritic mark) concatenate WITHOUT inserting spurious spaces.
 */
function joinVisualLineItems(items: TextSpanItem[], isRtl: boolean, avgFontSize: number): string {
  let out = '';
  let prevItem: TextSpanItem | null = null;

  for (const item of items) {
    const part = item.str.replace(/[\r\n]+/g, ' ');
    if (!part || !part.replace(/\s+/g, '')) {
      if (out && !out.endsWith(' ')) {
        out += ' ';
      }
      prevItem = item;
      continue;
    }

    if (!out) {
      out = part;
      prevItem = item;
      continue;
    }

    const prevLast = out[out.length - 1];
    const nextFirst = part[0];

    // Calculate true visual gap between adjacent PDF glyph spans
    const gap = prevItem
      ? isRtl
        ? prevItem.x - (item.x + item.width)
        : item.x - (prevItem.x + prevItem.width)
      : avgFontSize;

    const spaceThreshold = isRtl
      ? Math.max(1.4, avgFontSize * 0.17)
      : Math.max(1.2, avgFontSize * 0.14);

    if (prevLast === ' ' || nextFirst === ' ') {
      out += part;
    } else if (isArabicCombiningMark(nextFirst)) {
      // Never put a space before an Arabic Harakat / Tashkeel diacritic
      out += part;
    } else if (isRtl && isArabicChar(prevLast) && isArabicChar(nextFirst) && gap < spaceThreshold) {
      // Adjacent Arabic glyph runs inside the same cursive word
      out += part;
    } else if (!isRtl && isCjkChar(prevLast) && isCjkChar(nextFirst) && gap < avgFontSize * 0.45) {
      out += part;
    } else if (!isRtl && prevLast === '-' && /[a-z]/.test(nextFirst)) {
      out = out.slice(0, -1) + part;
    } else if (gap < Math.max(0.6, avgFontSize * 0.06)) {
      // Overlapping or directly touching glyph spans
      out += part;
    } else {
      out += ' ' + part;
    }

    prevItem = item;
  }

  return out.replace(/[ \t]{2,}/g, ' ').trim();
}

function joinWrappedLines(lines: string[], isRtl: boolean): string {
  let out = '';
  for (const raw of lines) {
    const part = raw.replace(/\s+/g, ' ').trim();
    if (!part) continue;
    if (!out) {
      out = part;
      continue;
    }
    const prevLast = out[out.length - 1];
    const nextFirst = part[0];
    if (!isRtl && isCjkChar(prevLast) && isCjkChar(nextFirst)) {
      out += part;
    } else if (!isRtl && prevLast === '-' && /[a-z]/.test(nextFirst)) {
      out = out.slice(0, -1) + part;
    } else {
      out += ' ' + part;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function parseOcrMarkdownToBlocks(ocrText: string, pageNumber: number): EbookBlock[] {
  const blocks: EbookBlock[] = [];
  const rawSections = ocrText
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);

  rawSections.forEach((sec, idx) => {
    const cleanText = (val: string) => (containsArabic(val) ? normalizeArabicProse(val) : val);
    if (sec.startsWith('## ')) {
      blocks.push({ id: `p${pageNumber}_ocr_${idx}`, kind: 'h1', text: cleanText(sec.replace(/^##\s+/, '').trim()) });
    } else if (sec.startsWith('### ')) {
      blocks.push({ id: `p${pageNumber}_ocr_${idx}`, kind: 'h2', text: cleanText(sec.replace(/^###\s+/, '').trim()) });
    } else if (sec.startsWith('[脚注]') || sec.startsWith('[Footnote]')) {
      blocks.push({
        id: `p${pageNumber}_ocr_${idx}`,
        kind: 'footnote',
        text: cleanText(sec.replace(/^\[(脚注|Footnote)\]\s*/, '').trim()),
      });
    } else {
      blocks.push({
        id: `p${pageNumber}_ocr_${idx}`,
        kind: 'paragraph',
        text: cleanText(sec.replace(/\n+/g, ' ').trim()),
      });
    }
  });
  return blocks;
}

/**
 * Extracts structured, reflowable ebook content (headings, paragraphs, footnotes, tables)
 * from any PDF page via pdfjs-dist geometry, with full Arabic cursive & RTL normalization.
 */
export async function extractStructuredPdfPage(
  pdf: PDFDocumentProxy,
  pageNumber: number
): Promise<ExtractedEbookPage> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const textContent = await page.getTextContent();

  const rawItems: TextSpanItem[] = [];
  const fontSizes: number[] = [];

  for (const item of textContent.items as any[]) {
    if (!item || typeof item.str !== 'string') continue;
    const str = item.str.replace(/\u0000/g, '');
    if (!str.trim()) continue;
    const tx = Util.transform(viewport.transform, item.transform);
    const fontSize = Math.max(6, Math.hypot(tx[0], tx[1]) || Math.abs(item.height) || 12);
    const x = tx[4];
    const y = tx[5];
    const width = Math.max(0.5, Number(item.width || 0));
    rawItems.push({ str, x, y, width, fontSize });
    if (str.trim().length >= 2) fontSizes.push(fontSize);
  }

  if (rawItems.length === 0) {
    return {
      pageNumber,
      dir: 'ltr',
      blocks: [],
      plainText: '',
      isLikelyScanned: true,
      extractionIssue: 'scanned',
    };
  }

  const fullRawSample = rawItems.map((i) => i.str).join(' ');
  const isRtl = isArabicHeavyText(fullRawSample);

  const sortedSizes = [...fontSizes].sort((a, b) => a - b);
  const medianFontSize = sortedSizes[Math.floor(sortedSizes.length * 0.5)] || 12;

  // Group items into visual horizontal lines by y-coordinate proximity
  rawItems.sort((a, b) => a.y - b.y);
  interface VisualLine {
    y: number;
    avgFontSize: number;
    minX: number;
    maxX: number;
    items: TextSpanItem[];
    rawText: string;
    text: string;
    columnSegments: string[];
  }

  const lines: VisualLine[] = [];
  for (const it of rawItems) {
    const tol = Math.max(4, it.fontSize * 0.55);
    const existing = lines.find((l) => Math.abs(l.y - it.y) <= tol);
    if (existing) {
      existing.items.push(it);
      existing.y = (existing.y * (existing.items.length - 1) + it.y) / existing.items.length;
    } else {
      lines.push({
        y: it.y,
        avgFontSize: it.fontSize,
        minX: it.x,
        maxX: it.x + it.width,
        items: [it],
        rawText: '',
        text: '',
        columnSegments: [],
      });
    }
  }

  lines.sort((a, b) => a.y - b.y);

  // First pass: sort spans spatially and assemble raw line text (keeping Presentation Forms intact for reversal check)
  for (const line of lines) {
    // For RTL, sort by right edge descending so spans flow right-to-left naturally
    line.items.sort((a, b) => (isRtl ? (b.x + b.width) - (a.x + a.width) : a.x - b.x));
    line.avgFontSize = line.items.reduce((acc, i) => acc + i.fontSize, 0) / line.items.length;
    line.minX = Math.min(...line.items.map((i) => i.x));
    line.maxX = Math.max(...line.items.map((i) => i.x + i.width));
    line.rawText = joinVisualLineItems(line.items, isRtl, line.avgFontSize);
  }

  // Detect page-level visually-reversed Arabic BEFORE NFKC normalization
  const pageRawLinesSample = lines.map((l) => l.rawText).join('\n');
  const pageIsVisuallyReversed = isRtl && detectArabicVisualReversal(pageRawLinesSample);

  const normalizeTextForPage = (raw: string): string => {
    if (!containsArabic(raw)) return raw.replace(/\s+/g, ' ').trim();
    return normalizeArabicProse(raw, {
      forceReverse: pageIsVisuallyReversed,
      skipReverseCheck: pageIsVisuallyReversed,
    });
  };

  // Second pass: normalize each line & detect tabular columns
  for (const line of lines) {
    line.text = normalizeTextForPage(line.rawText);

    const cols: string[] = [];
    let currentCol: TextSpanItem[] = [];
    for (let i = 0; i < line.items.length; i++) {
      const cur = line.items[i];
      if (i > 0) {
        const prev = line.items[i - 1];
        const gap = isRtl ? prev.x - (cur.x + cur.width) : cur.x - (prev.x + prev.width);
        if (gap > Math.max(26, line.avgFontSize * 2.4)) {
          const joined = normalizeTextForPage(joinVisualLineItems(currentCol, isRtl, line.avgFontSize));
          if (joined) cols.push(joined);
          currentCol = [];
        }
      }
      currentCol.push(cur);
    }
    const lastCol = normalizeTextForPage(joinVisualLineItems(currentCol, isRtl, line.avgFontSize));
    if (lastCol) cols.push(lastCol);
    line.columnSegments = cols;
  }

  // Filter out standalone header/footer page numbers at extreme top/bottom margins
  const filteredLines = lines.filter((line) => {
    const trimmed = line.text.trim();
    if (!trimmed) return false;
    const isStandaloneNum = /^[-–—\s]*[\d٠-٩]{1,4}[-–—\s]*$/.test(trimmed);
    const nearEdge = line.y < viewport.height * 0.08 || line.y > viewport.height * 0.92;
    if (isStandaloneNum && nearEdge) return false;
    return true;
  });

  // Reconstruct structured blocks (headings, paragraphs, tables, footnotes)
  const blocks: EbookBlock[] = [];
  let paraBuffer: string[] = [];
  let footnoteBuffer: string[] = [];
  let tableRows: string[][] = [];
  let prevLine: VisualLine | null = null;

  const flushParagraph = () => {
    if (paraBuffer.length === 0) return;
    const text = joinWrappedLines(paraBuffer, isRtl);
    if (text) {
      blocks.push({ id: `p${pageNumber}_b${blocks.length}`, kind: 'paragraph', text });
    }
    paraBuffer = [];
  };

  const flushFootnote = () => {
    if (footnoteBuffer.length === 0) return;
    const text = joinWrappedLines(footnoteBuffer, isRtl);
    if (text) {
      blocks.push({ id: `p${pageNumber}_fn${blocks.length}`, kind: 'footnote', text });
    }
    footnoteBuffer = [];
  };

  const flushTable = () => {
    if (tableRows.length === 0) return;
    if (tableRows.length >= 2) {
      blocks.push({
        id: `p${pageNumber}_tb${blocks.length}`,
        kind: 'table',
        text: tableRows.map((r) => r.join(' | ')).join('\n'),
        rows: tableRows,
      });
    } else {
      paraBuffer.push(tableRows[0].join('  '));
      flushParagraph();
    }
    tableRows = [];
  };

  const lineGaps: number[] = [];
  for (let i = 1; i < filteredLines.length; i++) {
    const g = filteredLines[i].y - filteredLines[i - 1].y;
    if (g > 2 && g < medianFontSize * 4) lineGaps.push(g);
  }
  lineGaps.sort((a, b) => a - b);
  const medianGap = lineGaps[Math.floor(lineGaps.length * 0.5)] || medianFontSize * 1.45;

  for (const line of filteredLines) {
    const isFootnote = line.y > viewport.height * 0.78 && line.avgFontSize <= medianFontSize * 0.86;
    const isH1 = !isFootnote && line.avgFontSize >= medianFontSize * 1.38 && line.text.length <= 120;
    const isH2 = !isFootnote && !isH1 && line.avgFontSize >= medianFontSize * 1.18 && line.text.length <= 120;
    const isTableRow = !isFootnote && !isH1 && !isH2 && line.columnSegments.length >= 3;

    if (isTableRow) {
      flushParagraph();
      flushFootnote();
      tableRows.push(line.columnSegments);
      prevLine = line;
      continue;
    } else if (tableRows.length > 0) {
      flushTable();
    }

    if (isFootnote) {
      flushParagraph();
      footnoteBuffer.push(line.text);
      prevLine = line;
      continue;
    } else if (footnoteBuffer.length > 0) {
      flushFootnote();
    }

    if (isH1 || isH2) {
      flushParagraph();
      blocks.push({
        id: `p${pageNumber}_h${blocks.length}`,
        kind: isH1 ? 'h1' : 'h2',
        text: line.text,
      });
      prevLine = line;
      continue;
    }

    // Decide whether to start a new paragraph based on vertical spacing or sentence end + indent
    if (prevLine && paraBuffer.length > 0) {
      const yGap = line.y - prevLine.y;
      const endsSentence = /[.!?。？！؛؟:：»”’]$/.test(prevLine.text);
      const isParagraphGap = yGap > medianGap * 1.42;
      const indentShift = isRtl
        ? prevLine.maxX - line.maxX > medianFontSize * 1.1
        : line.minX - prevLine.minX > medianFontSize * 1.1;
      if (isParagraphGap || (endsSentence && indentShift)) {
        flushParagraph();
      }
    }

    paraBuffer.push(line.text);
    prevLine = line;
  }

  flushTable();
  flushParagraph();
  flushFootnote();

  const plainText = blocks.map((b) => b.text).join('\n\n').trim();
  const nonSpaceChars = plainText.replace(/\s+/g, '').length;
  const hasBrokenArabic =
    detectBrokenArabicEncoding(plainText) || detectBrokenArabicEncoding(pageRawLinesSample);
  const isScanned = nonSpaceChars < 30;
  const isGarbledExtraction =
    !isScanned &&
    !hasBrokenArabic &&
    detectGarbledPdfTextExtraction(plainText, rawItems.length);
  const unreadableExtraction = hasBrokenArabic || isGarbledExtraction;

  return {
    pageNumber,
    dir: isRtl ? 'rtl' : 'ltr',
    blocks: unreadableExtraction ? [] : blocks,
    plainText: unreadableExtraction ? '' : plainText,
    isLikelyScanned: isScanned || unreadableExtraction,
    extractionIssue: unreadableExtraction ? 'garbled_arabic' : isScanned ? 'scanned' : undefined,
  };
}

/**
 * Extracts real embedded PDF outline / chapters into a flat TOC list.
 */
export async function extractPdfToc(pdf: PDFDocumentProxy): Promise<PdfTocItem[]> {
  try {
    const outline = await pdf.getOutline();
    if (!Array.isArray(outline) || outline.length === 0) return [];
    const items: PdfTocItem[] = [];

    const walk = async (nodes: any[], level: number) => {
      for (const node of nodes) {
        if (items.length >= 160) return;
        const rawTitle = String(node?.title || '').trim();
        const title = containsArabic(rawTitle)
          ? repairUnambiguousArabicLigatures(normalizeArabicProse(rawTitle))
          : rawTitle;
        let pageNumber = 1;
        try {
          let dest = node.dest;
          if (typeof dest === 'string') {
            dest = await pdf.getDestination(dest);
          }
          if (Array.isArray(dest) && dest[0]) {
            const idx = await pdf.getPageIndex(dest[0]);
            if (Number.isFinite(idx)) pageNumber = idx + 1;
          }
        } catch {
          // fallback page 1
        }
        if (title) {
          items.push({ title, pageNumber, level });
        }
        if (Array.isArray(node.items) && node.items.length > 0) {
          await walk(node.items, level + 1);
        }
      }
    };

    await walk(outline, 0);
    return items;
  } catch {
    return [];
  }
}

/**
 * Renders a PDF page into a compact JPEG data URL offscreen for Gemini Vision OCR (scanned PDFs).
 */
export async function renderPdfPageToJpegDataUrl(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  scale = 1.65
): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
  canvas.width = 0;
  canvas.height = 0;
  return dataUrl;
}
