import { Util, type PDFDocumentProxy } from 'pdfjs-dist';

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
  ocrApplied?: boolean;
}

export interface PdfTocItem {
  title: string;
  pageNumber: number;
  level: number;
}

function isArabicHeavy(text: string): boolean {
  const arCount = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g) || []).length;
  const latinCjkCount = (text.match(/[A-Za-z\u4e00-\u9fff]/g) || []).length;
  return arCount > 6 && arCount >= latinCjkCount * 0.45;
}

function isCjkChar(ch: string): boolean {
  return /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch);
}

function joinLineTokens(tokens: string[], isRtl: boolean): string {
  let out = '';
  for (const raw of tokens) {
    const part = raw.replace(/\s+/g, ' ');
    if (!part) continue;
    if (!out) {
      out = part;
      continue;
    }
    const prevLast = out[out.length - 1];
    const nextFirst = part[0];
    if (prevLast === ' ' || nextFirst === ' ') {
      out += part;
    } else if (!isRtl && isCjkChar(prevLast) && isCjkChar(nextFirst)) {
      out += part;
    } else if (prevLast === '-' && /[a-z]/.test(nextFirst)) {
      // De-hyphenate wrapped English words cleanly
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
    if (sec.startsWith('## ')) {
      blocks.push({ id: `p${pageNumber}_ocr_${idx}`, kind: 'h1', text: sec.replace(/^##\s+/, '').trim() });
    } else if (sec.startsWith('### ')) {
      blocks.push({ id: `p${pageNumber}_ocr_${idx}`, kind: 'h2', text: sec.replace(/^###\s+/, '').trim() });
    } else if (sec.startsWith('[脚注]') || sec.startsWith('[Footnote]')) {
      blocks.push({ id: `p${pageNumber}_ocr_${idx}`, kind: 'footnote', text: sec.replace(/^\[(脚注|Footnote)\]\s*/, '').trim() });
    } else {
      blocks.push({ id: `p${pageNumber}_ocr_${idx}`, kind: 'paragraph', text: sec.replace(/\n+/g, ' ').trim() });
    }
  });
  return blocks;
}

/**
 * Extracts structured, reflowable ebook content (headings, paragraphs, footnotes, tables)
 * from any PDF page via pdfjs-dist geometry.
 */
export async function extractStructuredPdfPage(
  pdf: PDFDocumentProxy,
  pageNumber: number
): Promise<ExtractedEbookPage> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const textContent = await page.getTextContent();

  interface TextSpanItem {
    str: string;
    x: number;
    y: number;
    width: number;
    fontSize: number;
  }

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
    const width = Math.max(1, Number(item.width || 0));
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
    };
  }

  const fullRawSample = rawItems.map((i) => i.str).join(' ');
  const isRtl = isArabicHeavy(fullRawSample);

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
        text: '',
        columnSegments: [],
      });
    }
  }

  lines.sort((a, b) => a.y - b.y);

  for (const line of lines) {
    line.items.sort((a, b) => (isRtl ? b.x - a.x : a.x - b.x));
    line.avgFontSize = line.items.reduce((acc, i) => acc + i.fontSize, 0) / line.items.length;
    line.minX = Math.min(...line.items.map((i) => i.x));
    line.maxX = Math.max(...line.items.map((i) => i.x + i.width));
    line.text = joinLineTokens(
      line.items.map((i) => i.str),
      isRtl
    );

    // Detect wide horizontal gaps to spot simple tabular rows
    const cols: string[] = [];
    let currentCol: string[] = [];
    for (let i = 0; i < line.items.length; i++) {
      const cur = line.items[i];
      if (i > 0) {
        const prev = line.items[i - 1];
        const gap = isRtl ? prev.x - (cur.x + cur.width) : cur.x - (prev.x + prev.width);
        if (gap > Math.max(26, line.avgFontSize * 2.4)) {
          const joined = joinLineTokens(currentCol, isRtl);
          if (joined) cols.push(joined);
          currentCol = [];
        }
      }
      currentCol.push(cur.str);
    }
    const lastCol = joinLineTokens(currentCol, isRtl);
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
    const text = joinLineTokens(paraBuffer, isRtl);
    if (text) {
      blocks.push({ id: `p${pageNumber}_b${blocks.length}`, kind: 'paragraph', text });
    }
    paraBuffer = [];
  };

  const flushFootnote = () => {
    if (footnoteBuffer.length === 0) return;
    const text = joinLineTokens(footnoteBuffer, isRtl);
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
      const indentShift = isRtl ? prevLine.maxX - line.maxX > medianFontSize * 1.1 : line.minX - prevLine.minX > medianFontSize * 1.1;
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

  return {
    pageNumber,
    dir: isRtl ? 'rtl' : 'ltr',
    blocks,
    plainText,
    isLikelyScanned: nonSpaceChars < 30,
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
        const title = String(node?.title || '').trim();
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
  scale = 1.45
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
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  canvas.width = 0;
  canvas.height = 0;
  return dataUrl;
}
