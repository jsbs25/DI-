import { Util, type PDFDocumentProxy } from 'pdfjs-dist';
import {
  containsArabic,
  detectArabicVisualReversal,
  detectBrokenArabicEncoding,
  detectGarbledOrNumericPdfText,
  isArabicChar,
  isArabicCombiningMark,
  isArabicHeavyText,
  normalizeArabicProse,
  repairUnambiguousArabicLigatures,
  sanitizePdfExtractedText,
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
  extractionIssue?: 'scanned' | 'garbled_arabic' | 'garbled_numeric';
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
    const cleaned = sanitizePdfExtractedText(raw);
    if (!cleaned) return '';
    if (!containsArabic(cleaned)) return cleaned.replace(/\s+/g, ' ').trim();
    return normalizeArabicProse(cleaned, {
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

  const plainText = sanitizePdfExtractedText(blocks.map((b) => b.text).join('\n\n'));
  const nonSpaceChars = plainText.replace(/\s+/g, '').length;
  const hasBrokenArabic =
    detectBrokenArabicEncoding(plainText) || detectBrokenArabicEncoding(pageRawLinesSample);
  const hasGarbledOrNumeric =
    !hasBrokenArabic &&
    (detectGarbledOrNumericPdfText(plainText) || detectGarbledOrNumericPdfText(pageRawLinesSample));
  const isScanned = nonSpaceChars < 28;
  const isUnusableTextLayer = isScanned || hasBrokenArabic || hasGarbledOrNumeric;

  return {
    pageNumber,
    dir: isRtl ? 'rtl' : 'ltr',
    blocks: isUnusableTextLayer ? [] : blocks,
    plainText: isUnusableTextLayer ? '' : plainText,
    isLikelyScanned: isUnusableTextLayer,
    extractionIssue: hasBrokenArabic
      ? 'garbled_arabic'
      : hasGarbledOrNumeric
        ? 'garbled_numeric'
        : isScanned
          ? 'scanned'
          : undefined,
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

/**
 * Renders Page 1 of a PDF into a crisp, compact 2:3-friendly book cover JPEG data URL.
 */
export async function renderPdfCoverThumbnail(pdf: PDFDocumentProxy): Promise<string | undefined> {
  try {
    const page = await pdf.getPage(1);
    const baseVp = page.getViewport({ scale: 1 });
    const targetWidth = 360;
    const scale = Math.min(1.4, Math.max(0.4, targetWidth / Math.max(1, baseVp.width)));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return undefined;
    ctx.fillStyle = '#FAF8F4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl;
  } catch {
    return undefined;
  }
}

export interface ConvertedPdfChapter {
  id: string;
  title: string;
  content: string;
}

export interface WholePdfConversionProgress {
  stage: 'analyzing' | 'extracting' | 'ocr' | 'finalizing';
  currentPage: number;
  totalPages: number;
  cleanPages: number;
  ocrPages: number;
  message: string;
}

export interface WholePdfConversionResult {
  chapters: ConvertedPdfChapter[];
  language: 'ar' | 'zh' | 'en';
  pageCount: number;
  cleanPages: number;
  ocrPages: number;
  needsFurtherOcrPages: number[];
  coverImage?: string;
}

/**
 * Converts an ENTIRE PDF document into clean, structured electronic book chapters in one pass:
 *  - Extracts clean Unicode pages immediately across the whole book (auto-detecting chapters from PDF TOC or headings)
 *  - Detects scanned / garbled-number / broken-Arabic pages automatically (NEVER leaking raw numbers)
 *  - Optionally runs batch Vision OCR on scanned/garbled pages automatically (no manual page-by-page clicking!)
 */
export async function convertPdfDocumentToEbook(
  pdf: PDFDocumentProxy,
  bookTitle: string,
  options?: {
    maxAutoOcrPages?: number;
    onProgress?: (p: WholePdfConversionProgress) => void;
    onBatchReady?: (chapters: ConvertedPdfChapter[], donePages: number, totalPages: number) => void;
    signal?: AbortSignal;
  }
): Promise<WholePdfConversionResult> {
  const totalPages = pdf.numPages;
  const maxAutoOcrPages = options?.maxAutoOcrPages ?? 18;
  const onProgress = options?.onProgress;

  onProgress?.({
    stage: 'analyzing',
    currentPage: 0,
    totalPages,
    cleanPages: 0,
    ocrPages: 0,
    message: `正在解析目录与封面（共 ${totalPages} 页）…`,
  });

  const [toc, coverImage] = await Promise.all([
    extractPdfToc(pdf),
    renderPdfCoverThumbnail(pdf),
  ]);

  const pageTexts = new Map<number, string>();
  const scannedOrGarbledPages: number[] = [];
  let arCharTotal = 0;
  let zhCharTotal = 0;
  let enCharTotal = 0;
  let cleanPages = 0;

  // Pass 1: Fast local geometry extraction across ALL pages
  for (let p = 1; p <= totalPages; p++) {
    if (options?.signal?.aborted) break;
    const ep = await extractStructuredPdfPage(pdf, p);
    if (!ep.isLikelyScanned && ep.plainText.trim().length >= 24) {
      const formatted = ep.blocks
        .map((b) => {
          if (b.kind === 'h1') return `【${b.text}】`;
          if (b.kind === 'h2') return b.text;
          return b.text;
        })
        .join('\n\n')
        .trim();
      if (formatted) {
        pageTexts.set(p, formatted);
        cleanPages += 1;
        arCharTotal += (formatted.match(/[\u0600-\u06FF]/g) || []).length;
        zhCharTotal += (formatted.match(/[\u4E00-\u9FFF]/g) || []).length;
        enCharTotal += (formatted.match(/[A-Za-z]/g) || []).length;
      } else {
        scannedOrGarbledPages.push(p);
      }
    } else {
      scannedOrGarbledPages.push(p);
    }

    if (p === 1 || p % 5 === 0 || p === totalPages) {
      onProgress?.({
        stage: 'extracting',
        currentPage: p,
        totalPages,
        cleanPages,
        ocrPages: 0,
        message: `正在全本转为电子版：第 ${p} / ${totalPages} 页…`,
      });
    }
  }

  // Pass 2: If PDF has scanned or broken-encoding pages (e.g. Arabic PDFs with garbled numbers),
  // automatically run Vision OCR in clean batches so the user NEVER has to click page by page!
  let ocrPages = 0;
  const remainingOcrPages: number[] = [];
  if (scannedOrGarbledPages.length > 0 && !options?.signal?.aborted) {
    const pagesToOcrNow = scannedOrGarbledPages.slice(0, maxAutoOcrPages);
    remainingOcrPages.push(...scannedOrGarbledPages.slice(maxAutoOcrPages));

    const languageHint =
      arCharTotal > zhCharTotal && arCharTotal > enCharTotal
        ? 'ar'
        : /[\u0600-\u06FF]/.test(bookTitle)
          ? 'ar'
          : zhCharTotal > enCharTotal || /[\u4E00-\u9FFF]/.test(bookTitle)
            ? 'zh'
            : 'auto';

    let consecutiveErrors = 0;
    for (let i = 0; i < pagesToOcrNow.length; i++) {
      if (options?.signal?.aborted) break;
      const pNum = pagesToOcrNow[i];
      onProgress?.({
        stage: 'ocr',
        currentPage: i + 1,
        totalPages: pagesToOcrNow.length,
        cleanPages,
        ocrPages,
        message: `检测到扫描/特殊字体页，正在自动 AI 识字转电子版（第 ${pNum} 页 · ${i + 1}/${pagesToOcrNow.length}）…`,
      });
      try {
        const jpeg = await renderPdfPageToJpegDataUrl(pdf, pNum, 1.35);
        const res = await fetch('/api/library/ai/ocr-page', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pageImageBase64: jpeg,
            pageNumber: pNum,
            bookTitle,
            language: languageHint,
          }),
          signal: options?.signal,
        });
        const data = await res.json();
        if (res.ok && data?.success && typeof data.text === 'string' && data.text.trim().length > 12) {
          const blocks = parseOcrMarkdownToBlocks(data.text, pNum);
          const cleanBody = blocks.map((b) => b.text).filter(Boolean).join('\n\n').trim();
          if (cleanBody && !detectGarbledOrNumericPdfText(cleanBody)) {
            pageTexts.set(pNum, cleanBody);
            ocrPages += 1;
            consecutiveErrors = 0;
            arCharTotal += (cleanBody.match(/[\u0600-\u06FF]/g) || []).length;
            zhCharTotal += (cleanBody.match(/[\u4E00-\u9FFF]/g) || []).length;
            enCharTotal += (cleanBody.match(/[A-Za-z]/g) || []).length;
          }
        } else {
          consecutiveErrors += 1;
          remainingOcrPages.push(pNum);
        }
      } catch {
        consecutiveErrors += 1;
        remainingOcrPages.push(pNum);
      }

      // Stop early if AI OCR service is temporarily rate-limited so import never hangs
      if (consecutiveErrors >= 2) {
        remainingOcrPages.push(...pagesToOcrNow.slice(i + 1));
        break;
      }

      if (ocrPages > 0 && ocrPages % 4 === 0 && options?.onBatchReady) {
        const partialChapters = assemblePagesIntoChapters(pageTexts, toc, totalPages, bookTitle);
        options.onBatchReady(partialChapters, cleanPages + ocrPages, totalPages);
      }
    }
  }

  onProgress?.({
    stage: 'finalizing',
    currentPage: totalPages,
    totalPages,
    cleanPages,
    ocrPages,
    message: '正在整理电子书章节并保存到书架…',
  });

  const chapters = assemblePagesIntoChapters(pageTexts, toc, totalPages, bookTitle);
  const detectedLang: 'ar' | 'zh' | 'en' =
    arCharTotal >= Math.max(zhCharTotal, enCharTotal) && (arCharTotal > 20 || /[\u0600-\u06FF]/.test(bookTitle))
      ? 'ar'
      : zhCharTotal >= enCharTotal && (zhCharTotal > 20 || /[\u4E00-\u9FFF]/.test(bookTitle))
        ? 'zh'
        : 'en';

  return {
    chapters,
    language: detectedLang,
    pageCount: totalPages,
    cleanPages,
    ocrPages,
    needsFurtherOcrPages: remainingOcrPages,
    coverImage,
  };
}

function assemblePagesIntoChapters(
  pageTexts: Map<number, string>,
  toc: PdfTocItem[],
  totalPages: number,
  bookTitle: string
): ConvertedPdfChapter[] {
  const sortedPageNums = Array.from(pageTexts.keys()).sort((a, b) => a - b);
  if (sortedPageNums.length === 0) return [];

  // Use embedded PDF TOC bookmarks when they cover distinct pages
  const topToc = toc
    .filter((t) => t.level <= 1 && t.pageNumber >= 1 && t.pageNumber <= totalPages)
    .reduce<PdfTocItem[]>((acc, item) => {
      if (!acc.some((x) => x.pageNumber === item.pageNumber)) acc.push(item);
      return acc;
    }, [])
    .sort((a, b) => a.pageNumber - b.pageNumber);

  if (topToc.length >= 2) {
    const chapters: ConvertedPdfChapter[] = [];
    // Include any preface pages before first TOC entry
    const prePages = sortedPageNums.filter((p) => p < topToc[0].pageNumber);
    if (prePages.length > 0) {
      chapters.push({
        id: 'ch_preface',
        title: '前言 / 卷首',
        content: prePages.map((p) => pageTexts.get(p) || '').filter(Boolean).join('\n\n'),
      });
    }
    for (let i = 0; i < topToc.length; i++) {
      const startP = topToc[i].pageNumber;
      const endP = i + 1 < topToc.length ? topToc[i + 1].pageNumber - 1 : totalPages;
      const chPages = sortedPageNums.filter((p) => p >= startP && p <= endP);
      const body = chPages.map((p) => pageTexts.get(p) || '').filter(Boolean).join('\n\n').trim();
      if (body) {
        chapters.push({
          id: `ch_${chapters.length + 1}`,
          title: topToc[i].title.slice(0, 120),
          content: body,
        });
      }
    }
    if (chapters.length > 0) return chapters;
  }

  // Fallback: Group cleanly into well-proportioned electronic chapters (10 pages per chapter)
  const PAGES_PER_CHAPTER = sortedPageNums.length <= 16 ? 5 : 10;
  const chapters: ConvertedPdfChapter[] = [];
  for (let i = 0; i < sortedPageNums.length; i += PAGES_PER_CHAPTER) {
    const slice = sortedPageNums.slice(i, i + PAGES_PER_CHAPTER);
    const firstP = slice[0];
    const lastP = slice[slice.length - 1];
    const body = slice.map((p) => pageTexts.get(p) || '').filter(Boolean).join('\n\n').trim();
    if (!body) continue;
    // Try extracting a natural short heading from the first line if present
    const firstLine = body.split('\n')[0]?.replace(/^【|】$/g, '').trim() || '';
    const useHeading = firstLine.length >= 3 && firstLine.length <= 42 && !/[。！？.!?]$/.test(firstLine);
    const chNum = chapters.length + 1;
    chapters.push({
      id: `ch_${chNum}`,
      title: useHeading
        ? `${firstLine}`
        : firstP === lastP
          ? `${bookTitle.slice(0, 24)} · 第 ${firstP} 页`
          : `第 ${chNum} 部分（第 ${firstP}–${lastP} 页）`,
      content: body,
    });
  }
  return chapters;
}
