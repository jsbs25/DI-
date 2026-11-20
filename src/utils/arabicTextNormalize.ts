/**
 * Arabic Typography & PDF Text Normalization Engine
 *
 * Repairs the four most common causes of broken Arabic in digital readers & PDFs:
 *  1. Arabic Presentation Forms-A/B (U+FB50–U+FDFF, U+FE70–U+FEFF) & Lam-Alef ligatures
 *  2. Visually-reversed LTR-encoded Arabic strings from legacy PDF exporters
 *  3. Detached Harakat / Tashkeel diacritics & stray BiDi control marks
 *  4. Non-Unicode custom-encoded PDF fonts (PUA glyphs, Windows-1256 mojibake, shattered single-letter runs)
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

/**
 * Strips diacritics to inspect base Arabic consonantal word shape.
 */
function stripArabicDiacritics(word: string): string {
  return word.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640]/g, '');
}

/**
 * Splits a string into grapheme clusters where each Arabic base letter
 * stays bonded to its immediately following combining diacritics (Tashkeel).
 */
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
 * Detects whether a raw Arabic text sample (preferably BEFORE NFKC) is stored in
 * reversed visual LTR order (common in older Arabic PDF exporters).
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

    // In logical order, a word starts with Initial/Medial and ends with Final.
    // In reversed visual order, a word starts with Final and ends with Initial/Medial.
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

    // Definite article "ال" appears at the start of normal Arabic words, "لا" at the end of reversed words
    if (base.startsWith('ال') && base.length >= 4) normalScore += 2;
    if (base.endsWith('لا') && base.length >= 4 && !base.startsWith('ال')) reversedScore += 2;

    // Taa Marbuta "ة" ONLY appears at the end of normal Arabic words, never at the start!
    if (base.endsWith('ة')) normalScore += 3;
    if (base.startsWith('ة')) reversedScore += 5;

    // Alef Maksura "ى" only appears at the end of Arabic words, never at the start!
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
  // Split into tokens preserving Arabic runs vs Latin/number islands
  const tokens = line.split(/([A-Za-z0-9]+(?:[._:/-][A-Za-z0-9]+)*)/);
  const reversedTokens = tokens.reverse().map((tok) => {
    if (!tok) return '';
    // Keep pure Latin/number tokens in LTR order
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

  // Remove NULs and stray BiDi override/isolate markers that corrupt layout direction
  let text = raw
    .replace(/\u0000/g, '')
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '');

  const shouldReverse =
    options?.forceReverse === true ||
    (!options?.skipReverseCheck && detectArabicVisualReversal(text));

  if (shouldReverse) {
    text = text
      .split('\n')
      .map((line) => (containsArabic(line) ? reverseArabicLine(line) : line))
      .join('\n');
  }

  // Convert Presentation Forms-A/B & ligatures (e.g. ﻻ -> لا) to canonical logical Unicode Arabic
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
 * Detects legacy non-Unicode Arabic PDF font maps (PUA glyph encodings,
 * Windows-1256-as-Latin1 mojibake, or shattered isolated-letter runs) so the reader
 * falls back cleanly to HiDPI Original Page rendering / AI Vision OCR instead of gibberish.
 */
export function detectBrokenArabicEncoding(text: string): boolean {
  if (!text) return false;
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 12) return false;

  // 1. Replacement chars or Private Use Area glyph mappings
  const puaOrBroken = (compact.match(/[\uFFFD\uE000-\uF8FF]/g) || []).length;
  if (puaOrBroken >= 4 && puaOrBroken / compact.length >= 0.05) {
    return true;
  }

  // 2. Classic Windows-1256 Arabic mis-decoded as Windows-1252 / Latin-1 (e.g., ÇáßÊÇÈ, Ýí, Úáì)
  const win1256MojibakeHits = (
    text.match(/(?:Çá|ÊÇ|íÉ|ãä|Ýí|Úáì|Åáì|ßÊÇ|Çááå|ÑÓæá|ÈÓã|ÇáÑÍãä)/g) || []
  ).length;
  if (win1256MojibakeHits >= 4) {
    return true;
  }

  // 3. Shattered single-letter Arabic runs (e.g., "ا ل ك ت ا ب ا ل ع ر ب ي")
  const arTokens = text.match(/[\u0621-\u064A\u0671\u064B-\u065F\u0670]+/g) || [];
  if (arTokens.length >= 14) {
    let singleCharCount = 0;
    for (const tok of arTokens) {
      const base = stripArabicDiacritics(tok);
      if (base.length === 1 && !VALID_SINGLE_ARABIC_WORDS.has(base)) {
        singleCharCount += 1;
      }
    }
    if (singleCharCount / arTokens.length >= 0.44) {
      return true;
    }
  }

  return false;
}
