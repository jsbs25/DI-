export type ReaderBgPresetId = 'white' | 'warm' | 'cream' | 'night' | 'custom';
export type ReaderFontFamilyId = 'serif_zh' | 'sans_zh' | 'kai_zh' | 'scheherazade_ar' | 'amiri_ar' | 'tajawal_ar' | 'georgia_en' | 'sf_en';
export type ReaderAlignMode = 'left' | 'justify';
export type ReaderMarginMode = 'compact' | 'standard' | 'generous';
export type ReaderWidthMode = 'narrow' | 'standard' | 'wide';
export type ReaderLayoutMode = 'scroll' | 'paged';

export interface ReaderPreferences {
  fontSize: number; // 14..34
  fontFamily: ReaderFontFamilyId;
  textColor: string; // '' means preset default
  bgPreset: ReaderBgPresetId;
  customBgColor: string;
  lineHeight: number; // 1.4..2.4
  paragraphSpacing: number; // 0.6..2.2 (em)
  marginMode: ReaderMarginMode;
  widthMode: ReaderWidthMode;
  align: ReaderAlignMode;
  layoutMode: ReaderLayoutMode;
}

export interface BookBookmarkItem {
  id: string;
  pageNumber: number;
  label: string;
  excerpt: string;
  createdAt: string;
}

export interface BookProgressRecord {
  bookKey: string;
  title: string;
  sourceUrl?: string;
  pageNumber: number;
  totalPages: number;
  scrollRatio: number; // 0..1 within current section/document
  progressPct: number; // 0..100
  bookmarks: BookBookmarkItem[];
  updatedAt: string;
}

export const READER_BG_PRESETS: Record<
  Exclude<ReaderBgPresetId, 'custom'>,
  { label: string; bg: string; paper: string; surface: string; ink: string; muted: string; border: string; isDark: boolean }
> = {
  white: {
    label: '纯白',
    bg: '#F3F3F5',
    paper: '#FFFFFF',
    surface: '#F7F7F8',
    ink: '#1A1C1E',
    muted: '#6E7178',
    border: 'rgba(28, 30, 33, 0.1)',
    isDark: false,
  },
  warm: {
    label: '典籍纸张',
    bg: '#EDE6D8',
    paper: '#FCF9F2',
    surface: '#F3EDE0',
    ink: '#1B1713',
    muted: '#8B7557',
    border: '#DDD4C0',
    isDark: false,
  },
  cream: {
    label: '米黄护眼',
    bg: '#E5DAC2',
    paper: '#F5EEDB',
    surface: '#EBE1C9',
    ink: '#261E14',
    muted: '#816D51',
    border: '#D4C5A6',
    isDark: false,
  },
  night: {
    label: '深色夜间',
    bg: '#0E1117',
    paper: '#151A23',
    surface: '#1C222E',
    ink: '#E7E4DC',
    muted: '#949CA8',
    border: 'rgba(231, 228, 220, 0.12)',
    isDark: true,
  },
};

export const READER_FONT_FAMILIES: Array<{
  id: ReaderFontFamilyId;
  label: string;
  langTag: string;
  css: string;
}> = [
  {
    id: 'serif_zh',
    label: '人文宋体',
    langTag: '中文',
    css: '"Songti SC", "Noto Serif SC", "Source Han Serif SC", STSong, Georgia, serif',
  },
  {
    id: 'sans_zh',
    label: '苹方黑体',
    langTag: '中文',
    css: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans CJK SC", "Hiragino Sans GB", sans-serif',
  },
  {
    id: 'kai_zh',
    label: '书卷楷体',
    langTag: '中文',
    css: '"Kaiti SC", STKaiti, "FangSong", "Noto Serif SC", serif',
  },
  {
    id: 'scheherazade_ar',
    label: '典籍纳斯赫',
    langTag: 'العربية',
    css: '"Scheherazade New", "Amiri", "Noto Naskh Arabic", "Traditional Arabic", serif',
  },
  {
    id: 'amiri_ar',
    label: 'Amiri 古典阿语',
    langTag: 'العربية',
    css: '"Amiri", "Scheherazade New", "Noto Naskh Arabic", "Traditional Arabic", serif',
  },
  {
    id: 'tajawal_ar',
    label: 'Noto Naskh 清晰',
    langTag: 'العربية',
    css: '"Noto Naskh Arabic", "Geeza Pro", "Segoe UI", sans-serif',
  },
  {
    id: 'georgia_en',
    label: 'Georgia Serif',
    langTag: 'EN',
    css: 'Georgia, "Iowan Old Style", "New York", "Times New Roman", serif',
  },
  {
    id: 'sf_en',
    label: 'SF Pro Clean',
    langTag: 'EN',
    css: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Plus Jakarta Sans", system-ui, sans-serif',
  },
];

export const TEXT_COLOR_PRESETS: Array<{ label: string; value: string }> = [
  { label: '默认', value: '' },
  { label: '墨黑', value: '#1B1D20' },
  { label: '深褐', value: '#382B1E' },
  { label: '松墨', value: '#1E352B' },
  { label: '柔白', value: '#EAE7DF' },
  { label: '暖沙', value: '#D8C7A8' },
];

export const DEFAULT_READER_PREFS: ReaderPreferences = {
  fontSize: 20,
  fontFamily: 'serif_zh',
  textColor: '',
  bgPreset: 'warm',
  customBgColor: '#FCF9F2',
  lineHeight: 1.95,
  paragraphSpacing: 1.1,
  marginMode: 'standard',
  widthMode: 'standard',
  align: 'justify',
  layoutMode: 'scroll',
};

const PREFS_KEY = 'earth_one_reader_prefs:v2';
const PROGRESS_KEY = 'earth_one_reader_progress:v2';

export function loadReaderPreferences(): ReaderPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_READER_PREFS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_READER_PREFS,
      ...parsed,
      fontSize: Math.min(34, Math.max(14, Number(parsed?.fontSize || DEFAULT_READER_PREFS.fontSize))),
      lineHeight: Math.min(2.4, Math.max(1.4, Number(parsed?.lineHeight || DEFAULT_READER_PREFS.lineHeight))),
      paragraphSpacing: Math.min(2.2, Math.max(0.5, Number(parsed?.paragraphSpacing || DEFAULT_READER_PREFS.paragraphSpacing))),
    };
  } catch {
    return { ...DEFAULT_READER_PREFS };
  }
}

export function saveReaderPreferences(prefs: ReaderPreferences): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage quota errors
  }
}

export function isHexColorDark(hex: string): boolean {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return false;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum < 0.45;
}

export function resolveReaderPalette(prefs: ReaderPreferences) {
  if (prefs.bgPreset === 'custom') {
    const paper = /^#[0-9a-fA-F]{6}$/.test(prefs.customBgColor) ? prefs.customBgColor : '#FCF9F2';
    const isDark = isHexColorDark(paper);
    return {
      bg: isDark ? '#0E1117' : '#EDE6D8',
      paper,
      surface: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
      ink: prefs.textColor || (isDark ? '#ECEAE2' : '#1B1713'),
      muted: isDark ? '#A0A7B0' : '#8B7557',
      border: isDark ? 'rgba(255,255,255,0.12)' : '#DDD4C0',
      isDark,
    };
  }
  const base = READER_BG_PRESETS[prefs.bgPreset] || READER_BG_PRESETS.warm;
  return {
    ...base,
    ink: prefs.textColor || base.ink,
  };
}

export function resolveFontCss(fontId: ReaderFontFamilyId): string {
  return READER_FONT_FAMILIES.find((f) => f.id === fontId)?.css || READER_FONT_FAMILIES[0].css;
}

export function resolveColumnMaxWidth(mode: ReaderWidthMode): string {
  switch (mode) {
    case 'narrow':
      return '600px';
    case 'wide':
      return '860px';
    default:
      return '720px';
  }
}

export function resolveHorizontalPadding(mode: ReaderMarginMode): string {
  switch (mode) {
    case 'compact':
      return 'clamp(14px, 3vw, 24px)';
    case 'generous':
      return 'clamp(28px, 7vw, 64px)';
    default:
      return 'clamp(20px, 5vw, 44px)';
  }
}

function readAllProgressMap(): Record<string, BookProgressRecord> {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function loadBookProgress(bookKey: string): BookProgressRecord | null {
  const map = readAllProgressMap();
  return map[bookKey] || null;
}

export function saveBookProgress(record: BookProgressRecord): void {
  try {
    const map = readAllProgressMap();
    map[record.bookKey] = record;
    // Keep most recent 80 books
    const entries = Object.entries(map)
      .sort((a, b) => (b[1].updatedAt || '').localeCompare(a[1].updatedAt || ''))
      .slice(0, 80);
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // ignore
  }
}

export function listRecentReadingHistory(limit = 12): BookProgressRecord[] {
  const map = readAllProgressMap();
  return Object.values(map)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .slice(0, limit);
}
