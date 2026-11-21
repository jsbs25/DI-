/**
 * Arabic Typography & PDF Text Normalization Engine
 *
 * Zero-tolerance protection against broken Arabic in digital books & PDFs:
 *  1. Detects Word / Acrobat / Shamela PDF /ToUnicode reversed-ligature corruption
 *     (e.g., الله -> هللا, لله -> هلل, الإسلام -> اإلسالم, السلام -> السالم, لامية -> المية)
 *     so corrupted Arabic is NEVER displayed as book text (renders authentic HiDPI PDF glyphs instead).
 *  2. Normalizes Arabic Presentation Forms-A/B (U+FB50–U+FDFF, U+FE70–U+FEFF) & Lam-Alef ligatures.
 *  3. Detects & repairs full-line visually-reversed LTR-encoded Arabic strings.
 *  4. Re-attaches detached Harakat / Tashkeel diacritics & strips broken ornament/PUA boxes.
 */

const ARABIC_BASE_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const ARABIC_GLOBAL_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const ARABIC_MARK_RE = /^[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF]$/;

// Presentation Forms-B positional sets (Initial/Medial vs Final) for visual-order detection
const PRES_INITIAL_OR_MEDIAL_RE =
  /[\uFE8B\uFE8C\uFE91\uFE92\uFE97\uFE98\uFE9B\uFE9C\uFE9F\uFEA0\uFEA3\uFEA4\uFEA7\uFEA8\uFEB3\uFEB4\uFEB7\uFEB8\uFEBB\uFEBC\uFEBF\uFEC0\uFEC3\uFEC4\uFEC7\uFEC8\uFECB\uFECC\uFECF\uFED0\uFED3\uFED4\uFED7\uFED8\uFEDB\uFEDC\uFEDF\uFEE0\uFEE3\uFEE4\uFEE7\uFEE8\uFEEB\uFEEC\uFEF3\uFEF4]/;
const PRES_FINAL_ONLY_RE =
  /[\uFE82\uFE84\uFE86\uFE88\uFE8A\uFE8E\uFE90\uFE94\uFE96\uFE9A\uFE9E\uFEA2\uFEA6\uFEAA\uFEAC\uFEAE\uFEB0\uFEB2\uFEB6\uFEBA\uFEBE\uFEC2\uFEC6\uFECA\uFECE\uFED2\uFED6\uFEDA\uFEDE\uFEE2\uFEE6\uFEEA\uFEEE\uFEF0\uFEF2\uFEF6\uFEF8\uFEFA\uFEFC]/;

// High-frequency logical Arabic words vs their exact visual reversals
const NORMAL_ARABIC_WORDS = new Set([
  'في', 'من', 'على', 'إلى', 'الى', 'عن', 'الله', 'قال', 'بن', 'هذا', 'هذه',
  'التي', 'الذي', 'كان', 'كانت', 'إن', 'ان', 'أن', 'لا', 'ما', 'لم', 'قد',
  'هو', 'هي', 'كل', 'أو', 'او', 'ثم', 'مع', 'بين', 'بعد', 'قبل', 'حتى',
  'إذا', 'اذا', 'كتاب', 'باب', 'فصل', 'سورة', 'آية', 'بسم', 'الرحمن', 'الرحيم',
  'عليه', 'وسلم', 'رضي', 'تعالى', 'الكتاب', 'الإسلام', 'القرآن', 'العلم', 'الناس',
  'والله', 'ولم', 'وهو', 'وهي', 'ومن', 'وفي', 'وعلى', 'فإن', 'لأن', 'كما',
]);

const REVERSED_ARABIC_WORDS = new Set([
  'يف', 'نم', 'ىلع', 'ىلإ', 'ىلا', 'نع', 'هللا', 'لاق', 'نب', 'اذه', 'هذه',
  'يتلا', 'يذلا', 'ناك', 'تناک', 'تناك', 'نإ', 'نا', 'نأ', 'ال', 'ام', 'مل', 'دق',
  'وه', 'يه', 'لك', 'وأ', 'وا', 'مث', 'عم', 'نيب', 'دعب', 'لبق', 'ىتح',
  'اذإ', 'اذا', 'باتك', 'لصف', 'ةروس', 'ةيآ', 'مسب', 'نمحرلا', 'ميحرلا',
  'هيلع', 'ملسو', 'يضر', 'ىلاعت', 'باتكلا', 'مالسإلا', 'نآرقلا', 'ملعلا', 'سانلا',
  'هللاو', 'ملو', 'وهو', 'يهو', 'نمو', 'يفو', 'ىلعو', 'نإف', 'نأل', 'امك',
]);

// Valid 1-letter Arabic words (conjunctions/prepositions)
const VALID_SINGLE_ARABIC_WORDS = new Set(['و', 'ف', 'ب', 'ل', 'ك', 'أ', 'م', 'ه']);

// Mirror brackets when flipping a visually-reversed Arabic line back to logical order
const MIRROR_BRACKET_MAP: Record<string, string> = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '«': '»',
  '»': '«',
  '﴿': '﴾',
  '﴾': '﴿',
  '<': '>',
  '>': '<',
};

export function isArabicChar(ch: string): boolean {
  return Boolean(ch && ARABIC_BASE_RE.test(ch));
}

export function isArabicCombiningMark(ch: string): boolean {
  return Boolean(ch && ARABIC_MARK_RE.test(ch));
}

export function containsArabic(text: string): boolean {
  return Boolean(text && ARABIC_BASE_RE.test(text));
}

export function isArabicHeavyText(text: string): boolean {
  if (!text) return false;
  const arCount = (text.match(ARABIC_GLOBAL_RE) || []).length;
  const latinCjkCount = (text.match(/[A-Za-z\u4e00-\u9fff]/g) || []).length;
  return arCount >= 6 && arCount >= latinCjkCount * 0.4;
}

function stripArabicDiacritics(word: string): string {
  return word.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640]/g, '');
}

function splitArabicClusters(segment: string): string[] {
  const clusters: string[] = [];
  for (const ch of Array.from(segment)) {
    if (isArabicCombiningMark(ch) && clusters.length > 0) {
      clusters[clusters.length - 1] += ch;
    } else {
      clusters.push(ch);
    }
  }
  return clusters;
}

/**
 * Detects Word / Acrobat / Shamela Arabic PDF /ToUnicode reversed-ligature corruption,
 * where standard Arabic letters are logical, but multi-letter ligatures are reversed:
 *  - الله  -> هللا
 *  - لله   -> هلل (e.g. الحمد هلل)
 *  - الإ   -> اإل (e.g. اإلسالم)
 *  - الأ   -> األ (e.g. األول)
 *  - الآ   -> اآل (e.g. اآلخرة)
 *  - لا    -> ال  (e.g. السالم عليكم، المية، إال، كالم، صالة، فال، وال)
 *  - Ornamental PDF glyph boxes (enclosing square \u20DE, PUA, Wingdings, etc.)
 *
 * Because corrupted ligatures silently alter sacred & scholarly Arabic words (e.g. السالم vs السلام),
 * any page triggering this detector MUST render authentic HiDPI PDF glyphs instead of flawed text!
 */
export function detectArabicPdfLigatureCorruption(text: string): boolean {
  if (!text || !containsArabic(text)) return false;

  const nfkc = text.normalize('NFKC');
  const plain = stripArabicDiacritics(nfkc);

  // 1. Unmistakable impossible Arabic sequences caused ONLY by reversed PDF ligature CMaps:
  //    - "هللا" (reversed الله)
  //    - "اإل" / "األ" / "اآل" (reversed الإ / الأ / الآ — Alef can NEVER precede Hamza-Alef + Lam in Arabic!)
  //    - "إال" / "أال" / "آال" (reversed إلا / ألا / آلا)
  //    - "بإال" / "لإل"->ok, "هّللا", "هلل" after الحمد / سبحان / الشكر / المنة / تبارك / وصلى
  const definiteCorruptRe =
    /(?:هللا|اإل|األ|اآل|إال|أال|آال|بأال|فأال|والإ|اإلسالم|اإليمان|اإلمام|اإلنسان|الحمد\s+هلل|فالحمد\s+هلل|سبحان\s+هلل|الشكر\s+هلل|المنة\s+هلل|ورحمة\s+هللا|وصلى\s+هللا|بسم\s+هللا|السالم\s+عليكم|عليه\s+السالم|وعليكم\s+السالم|باسالم|صالة\s+الله)/;
  if (definiteCorruptRe.test(plain)) {
    return true;
  }

  // 2. Check combinations of multiple suspect reversed Lam-Alef forms on the same page
  const suspectTokens = [
    /(?:^|\s)هلل(?:\s|[،؛:.]|$)/,
    /(?:^|\s)فال(?:\s)/,
    /(?:^|\s)وال(?:\s)/,
    /(?:^|\s)كالم(?:\s|[،؛:.]|$)/,
    /(?:^|\s)خالف(?:\s|[،؛:.]|$)/,
    /(?:^|\s)صالة(?:\s|[،؛:.]|$)/,
    /(?:^|\s)المية(?:\s|[،؛:.]|$)/,
    /(?:^|\s)ماليين(?:\s|[،؛:.]|$)/,
    /(?:^|\s)إعالم(?:\s|[،؛:.]|$)/,
    /(?:^|\s)أعالم(?:\s|[،؛:.]|$)/,
    /(?:^|\s)تالميذ(?:\s|[،؛:.]|$)/,
    /(?:^|\s)مالحظ/,
    /(?:^|\s)عالمات(?:\s|[،؛:.]|$)/,
  ];
  let suspectHits = 0;
  for (const re of suspectTokens) {
    if (re.test(plain)) suspectHits += 1;
  }
  if (suspectHits >= 2) {
    return true;
  }

  // 3. Enclosed box / ornamental glyph leakage (e.g., [ش][ش] from U+20DE or custom Arabesque fonts)
  if (/[\u20DD-\u20E0\uFFFC\uF000-\uF0FF]/.test(text)) {
    return true;
  }

  return false;
}

/**
 * Safely repairs unambiguous reversed-ligature artifacts in short metadata strings
 * (such as PDF Table of Contents entries) where full-page canvas fallback is not applicable.
 */
export function repairUnambiguousArabicLigatures(text: string): string {
  if (!text || !containsArabic(text)) return text;
  return text
    .replace(/[\u20DD-\u20E0\uFFFC\uF000-\uF0FF]/g, '')
    .replace(/هللا/g, 'الله')
    .replace(/اإلسالم/g, 'الإسلام')
    .replace(/اإل/g, 'الإ')
    .replace(/الإسالم/g, 'الإسلام')
    .replace(/األ/g, 'الأ')
    .replace(/اآل/g, 'الآ')
    .replace(/إال/g, 'إلا')
    .replace(/أال/g, 'ألا')
    .replace(/السالم(?=\s+عليكم)/g, 'السلام')
    .replace(/(?<=الحمد\s+)هلل/g, 'لله')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Detects whether a raw Arabic text sample (preferably BEFORE NFKC) is stored in
 * full-line reversed visual LTR order (common in older Arabic PDF exporters).
 */
export function detectArabicVisualReversal(rawText: string): boolean {
  if (!rawText || !containsArabic(rawText)) return false;

  let normalScore = 0;
  let reversedScore = 0;

  // 1. Check Arabic Presentation Forms-B positional clues BEFORE NFKC strips them
  const rawTokens = rawText.split(/\s+/).filter(Boolean);
  for (const tok of rawTokens) {
    const letters = Array.from(tok).filter((ch) => isArabicChar(ch) && !isArabicCombiningMark(ch));
    if (letters.length < 2) continue;
    const first = letters[0];
    const last = letters[letters.length - 1];

    if (PRES_FINAL_ONLY_RE.test(first)) reversedScore += 3;
    if (PRES_INITIAL_OR_MEDIAL_RE.test(last)) reversedScore += 3;
    if (PRES_INITIAL_OR_MEDIAL_RE.test(first)) normalScore += 2;
    if (PRES_FINAL_ONLY_RE.test(last)) normalScore += 2;
  }

  // 2. Linguistic structural checks on NFKC-normalized Arabic words
  const nfkc = rawText.normalize('NFKC');
  const arWords = nfkc.match(/[\u0621-\u064A\u0671\u064B-\u065F\u0670]{2,}/g) || [];
  for (const w of arWords) {
    const base = stripArabicDiacritics(w);
    if (base.length < 2) continue;

    if (NORMAL_ARABIC_WORDS.has(base)) normalScore += 4;
    if (REVERSED_ARABIC_WORDS.has(base)) reversedScore += 4;

    if (base.startsWith('ال') && base.length >= 4) normalScore += 2;
    if (base.endsWith('لا') && base.length >= 4 && !base.startsWith('ال')) reversedScore += 2;

    if (base.endsWith('ة')) normalScore += 3;
    if (base.startsWith('ة')) reversedScore += 5;

    if (base.endsWith('ى') && base.length >= 3) normalScore += 2;
    if (base.startsWith('ى') && base.length >= 3) reversedScore += 4;
  }

  return reversedScore >= 6 && reversedScore > normalScore * 1.45;
}

/**
 * Reverses visually-reversed Arabic runs inside a single line while preserving
 * embedded Latin words, numbers, and mirroring paired brackets.
 */
export function reverseArabicLine(line: string): string {
  const tokens = line.split(/([A-Za-z0-9]+(?:[._:/-][A-Za-z0-9]+)*)/);
  const reversedTokens = tokens.reverse().map((tok) => {
    if (!tok) return '';
    if (/^[A-Za-z0-9]+(?:[._:/-][A-Za-z0-9]+)*$/.test(tok)) {
      return tok;
    }
    const clusters = splitArabicClusters(tok)
      .reverse()
      .map((cluster) => (cluster.length === 1 && MIRROR_BRACKET_MAP[cluster] ? MIRROR_BRACKET_MAP[cluster] : cluster));
    return clusters.join('');
  });
  return reversedTokens.join('');
}

/**
 * Normalizes Arabic prose for crisp HarfBuzz / CoreText cursive shaping & diacritics.
 */
export function normalizeArabicProse(
  raw: string,
  options?: { forceReverse?: boolean; skipReverseCheck?: boolean }
): string {
  if (!raw) return '';

  let text = raw
    .replace(/\u0000/g, '')
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u20DD-\u20E0\uFFFC]/g, '');

  const shouldReverse =
    options?.forceReverse === true ||
    (!options?.skipReverseCheck && detectArabicVisualReversal(text));

  if (shouldReverse) {
    text = text
      .split('\n')
      .map((line) => (containsArabic(line) ? reverseArabicLine(line) : line))
      .join('\n');
  }

  text = text.normalize('NFKC');

  // Re-attach combining Harakat / Tashkeel marks separated by accidental whitespace
  text = text.replace(/[ \t]+([\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]+)/g, '$1');

  // Clean spacing around Arabic punctuation without collapsing paragraph breaks
  text = text
    .replace(/[ \t]+([،؛؟.!])/g, '$1')
    .replace(/([،؛؟])([^\s»”’)\]}0-9٠-٩])/g, '$1 $2')
    .replace(/[ \t]{2,}/g, ' ');

  return text.trim();
}

/**
 * Zero-tolerance broken Arabic detector for PDF extraction.
 * Returns true if the extracted Arabic text has ANY of:
 *  - Reversed PDF ligature CMap corruption (هللا, اإلسالم, هلل, المية, السالم عليكم, etc.)
 *  - Private Use Area glyphs (\uE000-\uF8FF) or Replacement Chars (\uFFFD)
 *  - Windows-1256-as-Latin1 mojibake
 *  - Shattered single-letter runs
 *
 * When true, PdfDocumentViewer seamlessly renders the authentic HiDPI PDF page onto the
 * classical book paper so ZERO wrong Arabic letters are ever shown!
 */
export function detectBrokenArabicEncoding(text: string): boolean {
  if (!text) return false;
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 10) return false;

  // 1. Word / Acrobat / Shamela reversed-ligature CMap corruption (ZERO TOLERANCE!)
  if (detectArabicPdfLigatureCorruption(text)) {
    return true;
  }

  // 2. Replacement chars or Private Use Area glyph mappings
  const puaOrBroken = (compact.match(/[\uFFFD\uE000-\uF8FF]/g) || []).length;
  if (puaOrBroken >= 2 && (puaOrBroken >= 4 || puaOrBroken / compact.length >= 0.03)) {
    return true;
  }

  // 3. Classic Windows-1256 Arabic mis-decoded as Windows-1252 / Latin-1
  const win1256MojibakeHits = (
    text.match(/(?:Çá|ÊÇ|íÉ|ãä|Ýí|Úáì|Åáì|ßÊÇ|Çááå|ÑÓæá|ÈÓã|ÇáÑÍãä)/g) || []
  ).length;
  if (win1256MojibakeHits >= 3) {
    return true;
  }

  // 4. Shattered single-letter Arabic runs (e.g., "ا ل ك ت ا ب")
  const arTokens = text.match(/[\u0621-\u064A\u0671\u064B-\u065F\u0670]+/g) || [];
  if (arTokens.length >= 12) {
    let singleCharCount = 0;
    for (const tok of arTokens) {
      const base = stripArabicDiacritics(tok);
      if (base.length === 1 && !VALID_SINGLE_ARABIC_WORDS.has(base)) {
        singleCharCount += 1;
      }
    }
    if (singleCharCount / arTokens.length >= 0.42) {
      return true;
    }
  }

  return false;
}

/**
 * Cleans stray PDF extraction artifacts (CID codes, NUL/control bytes, box ornaments)
 * without altering valid Arabic, Chinese, or Latin prose.
 */
export function sanitizePdfExtractedText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\(cid:\d+\)/gi, ' ')
    .replace(/\bcid:\d+\b/gi, ' ')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\uFFFD\uFFFC\u20DD-\u20E0\uF000-\uF0FF]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Comprehensive detector for PDF pages whose embedded text layer is corrupted:
 *  - Broken Arabic ligatures / Windows-1256 mojibake / PUA glyphs
 *  - Custom font /ToUnicode failures that dump raw glyph numbers ("123 45 678 90 ...")
 *  - CID glyph-index dumps ("(cid:42) (cid:108) ...")
 *  - ASCII symbol-mapped Arabic fonts ("!@# 456 $%^ ...")
 *  - Invisible OCR noise consisting mostly of page/footnote numbers
 *
 * Returning true guarantees those gibberish digits are NEVER shown to the reader
 * and NEVER sent as plain text to the translator.
 */
export function detectGarbledOrNumericPdfText(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  // 1. Existing zero-tolerance Arabic corruption checks
  if (detectBrokenArabicEncoding(trimmed)) {
    return true;
  }

  // 2. Explicit CID / glyph-code leakage or control characters
  if (/(?:\(cid:\d+\)|\bcid:\d+\b)/i.test(trimmed)) {
    return true;
  }
  const controlChars = (trimmed.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g) || []).length;
  if (controlChars >= 3) {
    return true;
  }

  const compact = trimmed.replace(/\s+/g, '');
  if (compact.length < 12) return false;

  // 3. Count real linguistic letters vs digits & non-prose symbols
  const arLetters = (compact.match(/[\u0621-\u064A\u0671-\u06D3]/g) || []).length;
  const cjkLetters = (compact.match(/[\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u30FF\uAC00-\uD7AF]/g) || []).length;
  const latinLetters = (compact.match(/[A-Za-z\u00C0-\u024F\u0400-\u04FF]/g) || []).length;
  const realLetters = arLetters + cjkLetters + latinLetters;

  const digits = (compact.match(/[0-9\u0660-\u0669\u06F0-\u06F9]/g) || []).length;
  const weirdSymbols = (compact.match(/[^\p{L}\p{N}.,;:!?'"()\[\]{}\-–—/\\،؛؟。，、！？：《》「」『』（）·•%$€£¥+*=]/gu) || []).length;

  const digitRatio = digits / compact.length;
  const realLetterRatio = realLetters / compact.length;
  const weirdSymbolRatio = weirdSymbols / compact.length;

  // If the page is mostly digits/numbers (e.g. broken ToUnicode CMap dumping glyph indices like "142 89 31 504...")
  if (compact.length >= 16 && digitRatio >= 0.42 && realLetterRatio < 0.45) {
    return true;
  }

  // If almost half the extracted characters aren't real letters of any script
  if (compact.length >= 24 && realLetterRatio < 0.38) {
    return true;
  }

  // High concentration of non-standard symbol glyphs (Symbol/Wingdings/custom font encoding)
  if (compact.length >= 20 && weirdSymbolRatio >= 0.16) {
    return true;
  }

  // 4. Token-level numeric flood check (e.g., many standalone number tokens like "12 34 56 78 90 ...")
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length >= 8) {
    let numericTokens = 0;
    let mixedDigitGarbageTokens = 0;
    for (const tok of tokens) {
      const stripped = tok.replace(/^[.,;:!?()[\]{}"'«»\-–—]+|[.,;:!?()[\]{}"'«»\-–—]+$/g, '');
      if (!stripped) continue;
      if (/^[0-9\u0660-\u0669\u06F0-\u06F9]+(?:[./,:;\-][0-9\u0660-\u0669\u06F0-\u06F9]+)*$/.test(stripped)) {
        numericTokens += 1;
      } else if (/[0-9]/.test(stripped) && /[A-Za-z\u0621-\u064A]/.test(stripped) && stripped.length >= 3) {
        mixedDigitGarbageTokens += 1;
      }
    }
    if (numericTokens / tokens.length >= 0.42 && realLetterRatio < 0.55) {
      return true;
    }
    if (mixedDigitGarbageTokens / tokens.length >= 0.25) {
      return true;
    }
  }

  // 5. Custom Arabic font mapped to ASCII Latin gibberish (many Latin words with zero vowels or weird casing like "kJhG fDsA qWrT")
  if (arLetters === 0 && cjkLetters === 0 && latinLetters >= 30) {
    const latinWords = trimmed.match(/[A-Za-z]{3,}/g) || [];
    if (latinWords.length >= 10) {
      let vowellessOrWeirdCase = 0;
      for (const w of latinWords) {
        const hasVowel = /[aeiouyAEIOUY]/.test(w);
        const weirdInternalCaps = /[a-z][A-Z][a-z]/.test(w);
        if (!hasVowel || weirdInternalCaps) {
          vowellessOrWeirdCase += 1;
        }
      }
      if (vowellessOrWeirdCase / latinWords.length >= 0.45) {
        return true;
      }
    }
  }

  return false;
}
