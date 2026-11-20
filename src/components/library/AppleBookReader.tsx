import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  BookOpen,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  List,
  Search,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  X,
  Maximize2,
  Minimize2,
  StickyNote,
  ExternalLink,
  Check,
  Languages,
  Loader2,
  Send,
  CheckCircle2,
} from 'lucide-react';
import type { Book, BookAnnotation, Language } from '../../types/index.ts';
import { isRtlLanguage } from './bookEmbedUrl.ts';
import { speakSpiritReply, stopSpiritSpeech } from '../../agent/agentClient.ts';

import { loadBookProgress, saveBookProgress, TEXT_COLOR_PRESETS } from '../../utils/readerPreferences.ts';
import { containsArabic, isArabicHeavyText, normalizeArabicProse } from '../../utils/arabicTextNormalize.ts';

export type AppleThemeId = 'original' | 'quiet' | 'paper' | 'calm' | 'midnight' | 'custom';
export type AppleFontId = 'serif' | 'sans' | 'kai' | 'georgia' | 'amiri' | 'naskh';
export type AppleLayoutMode = 'spread' | 'single' | 'scroll';
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

interface AppleReaderPrefs {
  theme: AppleThemeId;
  font: AppleFontId;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  pageMargin: number;
  maxWidth: number;
  textAlign: 'justify' | 'left';
  customTextColor: string | null;
  customBgColor: string;
  layout: AppleLayoutMode;
}

const PREFS_STORAGE_KEY = 'one_apple_books_prefs_v2';

const DEFAULT_PREFS: AppleReaderPrefs = {
  theme: 'quiet',
  font: 'serif',
  fontSize: 19,
  lineHeight: 1.9,
  paragraphSpacing: 20,
  pageMargin: 36,
  maxWidth: 740,
  textAlign: 'justify',
  customTextColor: null,
  customBgColor: '#F6F3EC',
  layout: 'spread',
};

const THEME_TOKENS: Record<
  AppleThemeId,
  {
    label: string;
    bg: string;
    pageBg: string;
    chromeBg: string;
    popoverBg: string;
    ink: string;
    muted: string;
    border: string;
    accent: string;
    swatch: string;
    swatchRing: string;
    isDark: boolean;
  }
> = {
  original: {
    label: '原始白',
    bg: '#F5F5F7',
    pageBg: '#FFFFFF',
    chromeBg: 'rgba(255, 255, 255, 0.94)',
    popoverBg: '#FFFFFF',
    ink: '#1D1D1F',
    muted: '#6E6E73',
    border: '#E5E5EA',
    accent: '#0071E3',
    swatch: '#FFFFFF',
    swatchRing: '#D2D2D7',
    isDark: false,
  },
  quiet: {
    label: '典籍纸张',
    bg: '#EDE6D8',
    paper: '#FCF9F2',
    pageBg: '#FCF9F2',
    chromeBg: 'rgba(252, 249, 242, 0.94)',
    popoverBg: '#FCF9F2',
    ink: '#1B1713',
    muted: '#8B7557',
    border: '#DDD4C0',
    accent: '#8B6F47',
    swatch: '#FCF9F2',
    swatchRing: '#D4C7AF',
    isDark: false,
  } as any,
  paper: {
    label: '纸韵暖',
    bg: '#E8DEC8',
    pageBg: '#F1E9D6',
    chromeBg: 'rgba(241, 233, 214, 0.94)',
    popoverBg: '#F7F0E1',
    ink: '#2E261C',
    muted: '#7B6E5C',
    border: '#DACDB4',
    accent: '#8B5A2B',
    swatch: '#F1E9D6',
    swatchRing: '#C6B496',
    isDark: false,
  },
  calm: {
    label: '沉静灰',
    bg: '#262629',
    pageBg: '#323236',
    chromeBg: 'rgba(42, 42, 46, 0.94)',
    popoverBg: '#3A3A3E',
    ink: '#EBEBF0',
    muted: '#A1A1A6',
    border: '#48484D',
    accent: '#64D2FF',
    swatch: '#3A3A3E',
    swatchRing: '#636366',
    isDark: true,
  },
  midnight: {
    label: '深邃夜',
    bg: '#000000',
    pageBg: '#0E0E11',
    chromeBg: 'rgba(16, 16, 20, 0.94)',
    popoverBg: '#1C1C1F',
    ink: '#E5E5EA',
    muted: '#8E8E93',
    border: '#2C2C2E',
    accent: '#52B798',
    swatch: '#0E0E11',
    swatchRing: '#48484A',
    isDark: true,
  },
  custom: {
    label: '自定义',
    bg: '#F2EFE8',
    pageBg: '#F6F3EC',
    chromeBg: 'rgba(246, 243, 236, 0.94)',
    popoverBg: '#FAF8F3',
    ink: '#1E2421',
    muted: '#66716B',
    border: '#DFD8C8',
    accent: '#247864',
    swatch: '#E6DFCE',
    swatchRing: '#B9AE96',
    isDark: false,
  },
};

const FONT_STACKS: Record<AppleFontId, { label: string; sample: string; family: string }> = {
  serif: {
    label: '典雅宋体',
    sample: '宋',
    family: '"Songti SC", "Noto Serif SC", "Source Han Serif SC", Georgia, "Times New Roman", serif',
  },
  sans: {
    label: '黑体无衬线',
    sample: '黑',
    family: '-apple-system, BlinkMacSystemFont, "PingFang SC", "SF Pro Text", "Helvetica Neue", sans-serif',
  },
  kai: {
    label: '书卷楷体',
    sample: '楷',
    family: '"Kaiti SC", "STKaiti", "LXGW WenKai", "BiauKai", Georgia, serif',
  },
  georgia: {
    label: 'Georgia',
    sample: 'Aa',
    family: 'Georgia, "Iowan Old Style", "Palatino Linotype", "Songti SC", serif',
  },
  amiri: {
    label: '典籍纳斯赫',
    sample: 'ع',
    family: '"Scheherazade New", "Amiri", "Noto Naskh Arabic", "Traditional Arabic", serif',
  },
  naskh: {
    label: 'Naskh 阿语清晰',
    sample: 'ن',
    family: '"Noto Naskh Arabic", "Amiri", "Geeza Pro", "Segoe UI", sans-serif',
  },
};

const HIGHLIGHT_SWATCHES: Array<{ id: HighlightColor; label: string; dot: string; lightBg: string; darkBg: string }> = [
  { id: 'yellow', label: '琥珀黄', dot: '#F7C948', lightBg: 'rgba(252, 224, 120, 0.48)', darkBg: 'rgba(234, 179, 8, 0.30)' },
  { id: 'green', label: '青苔绿', dot: '#6FCF97', lightBg: 'rgba(134, 226, 168, 0.42)', darkBg: 'rgba(34, 197, 94, 0.28)' },
  { id: 'blue', label: '晴空蓝', dot: '#60A5FA', lightBg: 'rgba(147, 197, 253, 0.45)', darkBg: 'rgba(59, 130, 246, 0.30)' },
  { id: 'pink', label: '樱花粉', dot: '#F472B6', lightBg: 'rgba(249, 168, 212, 0.45)', darkBg: 'rgba(236, 72, 153, 0.30)' },
  { id: 'purple', label: '暮霞紫', dot: '#C084FC', lightBg: 'rgba(216, 180, 254, 0.45)', darkBg: 'rgba(168, 85, 247, 0.30)' },
];

interface PaginatedPage {
  index: number;
  isChapterStart: boolean;
  paragraphs: string[];
}

function paginateChapter(
  content: string,
  fontSize: number,
  lineHeight: number,
  compact: boolean
): PaginatedPage[] {
  const rawParagraphs = content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (rawParagraphs.length === 0) {
    return [{ index: 0, isChapterStart: true, paragraphs: [''] }];
  }

  // Estimate weighted visual character capacity per page dynamically from typography settings
  const sizeScale = (19 / fontSize) * (1.85 / lineHeight);
  const baseCapacity = compact ? 360 : 470;
  const maxUnits = Math.max(180, Math.round(baseCapacity * sizeScale));

  const measureUnits = (para: string): number => {
    // CJK chars count ~1.35 units, Latin chars ~0.7 units, plus paragraph gap cost
    let units = 28;
    for (let i = 0; i < para.length; i++) {
      units += para.charCodeAt(i) > 255 ? 1.35 : 0.68;
    }
    return units;
  };

  // Split overly long single paragraphs at sentence boundaries so no single page ever overflows or gets stuck at 1 page
  const normalizedParagraphs: string[] = [];
  for (const para of rawParagraphs) {
    if (measureUnits(para) <= maxUnits * 0.92) {
      normalizedParagraphs.push(para);
      continue;
    }
    const sentences = para
      .split(/(?<=[。！？.!؟؛\n])\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length <= 1) {
      // Hard chunk very long unbroken text safely
      const chunkLen = Math.max(140, Math.round(maxUnits * 0.62));
      for (let i = 0; i < para.length; i += chunkLen) {
        normalizedParagraphs.push(para.slice(i, i + chunkLen));
      }
      continue;
    }
    let buf = '';
    for (const sent of sentences) {
      const candidate = buf ? `${buf} ${sent}` : sent;
      if (buf && measureUnits(candidate) > maxUnits * 0.85) {
        normalizedParagraphs.push(buf);
        buf = sent;
      } else {
        buf = candidate;
      }
    }
    if (buf) normalizedParagraphs.push(buf);
  }

  const pages: PaginatedPage[] = [];
  let current: string[] = [];
  let used = 0;
  let isFirst = true;

  for (const para of normalizedParagraphs) {
    const cap = isFirst ? Math.round(maxUnits * 0.78) : maxUnits;
    const cost = measureUnits(para);

    if (current.length > 0 && used + cost > cap) {
      pages.push({ index: pages.length, isChapterStart: isFirst, paragraphs: current });
      current = [para];
      used = cost;
      isFirst = false;
    } else {
      current.push(para);
      used += cost;
    }
  }

  if (current.length > 0) {
    pages.push({ index: pages.length, isChapterStart: isFirst, paragraphs: current });
  }

  return pages;
}

function loadPrefs(): AppleReaderPrefs {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY) || localStorage.getItem('one_apple_books_prefs_v1');
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return {
      theme: parsed.theme in THEME_TOKENS ? parsed.theme : DEFAULT_PREFS.theme,
      font: parsed.font in FONT_STACKS ? parsed.font : DEFAULT_PREFS.font,
      fontSize: typeof parsed.fontSize === 'number' ? Math.min(30, Math.max(13, parsed.fontSize)) : DEFAULT_PREFS.fontSize,
      lineHeight: typeof parsed.lineHeight === 'number' ? Math.min(2.5, Math.max(1.4, parsed.lineHeight)) : DEFAULT_PREFS.lineHeight,
      paragraphSpacing: typeof parsed.paragraphSpacing === 'number' ? Math.min(40, Math.max(8, parsed.paragraphSpacing)) : DEFAULT_PREFS.paragraphSpacing,
      pageMargin: typeof parsed.pageMargin === 'number' ? Math.min(72, Math.max(16, parsed.pageMargin)) : DEFAULT_PREFS.pageMargin,
      maxWidth: typeof parsed.maxWidth === 'number' ? Math.min(980, Math.max(540, parsed.maxWidth)) : DEFAULT_PREFS.maxWidth,
      textAlign: parsed.textAlign === 'left' ? 'left' : 'justify',
      customTextColor: typeof parsed.customTextColor === 'string' ? parsed.customTextColor : null,
      customBgColor: typeof parsed.customBgColor === 'string' ? parsed.customBgColor : DEFAULT_PREFS.customBgColor,
      layout: ['spread', 'single', 'scroll'].includes(parsed.layout) ? parsed.layout : DEFAULT_PREFS.layout,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function renderParagraphWithHighlights(
  text: string,
  highlights: BookAnnotation[],
  isDark: boolean
): React.ReactNode {
  if (!highlights.length || !text) return text;
  // Find first matching highlight phrase cleanly (non-overlapping simple pass)
  let match: { start: number; end: number; ann: BookAnnotation } | null = null;
  for (const ann of highlights) {
    if (ann.kind === 'bookmark') continue;
    const needle = ann.selectedText?.trim();
    if (!needle || needle.length < 2) continue;
    const pos = text.indexOf(needle);
    if (pos !== -1 && (!match || pos < match.start)) {
      match = { start: pos, end: pos + needle.length, ann };
    }
  }
  if (!match) return text;

  const swatch = HIGHLIGHT_SWATCHES.find((s) => s.id === (match!.ann.color || 'yellow')) || HIGHLIGHT_SWATCHES[0];
  const bg = isDark ? swatch.darkBg : swatch.lightBg;
  const before = text.slice(0, match.start);
  const hit = text.slice(match.start, match.end);
  const after = text.slice(match.end);

  return (
    <>
      {before}
      <mark
        style={{ backgroundColor: bg, color: 'inherit' }}
        className="rounded-[3px] px-0.5 py-0.5"
        title={match.ann.note || undefined}
      >
        {hit}
      </mark>
      {after ? renderParagraphWithHighlights(after, highlights, isDark) : null}
    </>
  );
}

export interface AppleBookReaderProps {
  book: Book;
  lang: Language;
  initialChapterIndex?: number;
  initialAnnotations?: BookAnnotation[];
  onClose: () => void;
  onSaveProgress: (progressPercent: number, chapterId?: string, chapterTitle?: string) => void;
  onAnnotationsChange?: (annotations: BookAnnotation[]) => void;
}

export const AppleBookReader: React.FC<AppleBookReaderProps> = ({
  book,
  lang,
  initialChapterIndex = 0,
  initialAnnotations = [],
  onClose,
  onSaveProgress,
  onAnnotationsChange,
}) => {
  const isZh = lang === 'zh';
  const [prefs, setPrefs] = useState<AppleReaderPrefs>(loadPrefs);
  const [chapterIndex, setChapterIndex] = useState<number>(
    Math.min(Math.max(0, initialChapterIndex), Math.max(0, (book.chapters?.length || 1) - 1))
  );
  const [pageIndex, setPageIndex] = useState<number>(0);
  const [isDesktopWide, setIsDesktopWide] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Panels & Popovers
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'toc' | 'bookmarks' | 'notes'>('toc');
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Annotations, Bookmarks & AI Companion
  const [annotations, setAnnotations] = useState<BookAnnotation[]>(initialAnnotations);
  const [selectedText, setSelectedText] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [showNoteComposer, setShowNoteComposer] = useState(false);
  const [activeHighlightColor, setActiveHighlightColor] = useState<HighlightColor>('yellow');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiCitation, setAiCitation] = useState<BookAnnotation['citation'] | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  // Unified ONE AI Panel ("AI 精讲 / 全书问答 / AI 总结")
  const [pageAiOpen, setPageAiOpen] = useState(false);
  const [pageAiTab, setPageAiTab] = useState<'explain' | 'qa' | 'summary'>('explain');
  const [pageAiLoading, setPageAiLoading] = useState(false);
  const [pageAiAnswer, setPageAiAnswer] = useState('');
  const [pageAiError, setPageAiError] = useState('');
  const [pageAiQuestion, setPageAiQuestion] = useState('');
  const [pageAiKey, setPageAiKey] = useState('');
  const [bookQaHistory, setBookQaHistory] = useState<Array<{ q: string; a: string }>>([]);
  const [summaryText, setSummaryText] = useState('');
  const [inlineTranslation, setInlineTranslation] = useState<{ loading: boolean; text: string } | null>(null);
  const [vocabSavedWord, setVocabSavedWord] = useState<string | null>(null);

  // Tap-Any-Word AI Dictionary Card ("点一个不会的单词点开自动查")
  const [lookupWord, setLookupWord] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [lookupEntry, setLookupEntry] = useState<{
    word: string;
    lemma?: string;
    reading: string;
    ukPhonetic?: string;
    usPhonetic?: string;
    audioUrl?: string;
    ukAudioUrl?: string;
    usAudioUrl?: string;
    cefrLevel?: string;
    partOfSpeech: string;
    root: string;
    meaning: string;
    usage?: string;
    contextMeaning: string;
    example: string;
  } | null>(null);

  // Read-Aloud
  const [isSpeaking, setIsSpeaking] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  const chapters = book.chapters && book.chapters.length > 0 ? book.chapters : [{ id: 'ch1', title: book.title, content: book.description || '' }];
  const activeChapter = chapters[chapterIndex] || chapters[0];
  const baseTheme = THEME_TOKENS[prefs.theme];
  const theme = useMemo(() => {
    const resolvedBg = prefs.theme === 'custom' ? prefs.customBgColor : baseTheme.bg;
    const resolvedPageBg = prefs.theme === 'custom' ? prefs.customBgColor : baseTheme.pageBg;
    const resolvedInk = prefs.customTextColor || baseTheme.ink;
    return {
      ...baseTheme,
      bg: resolvedBg,
      pageBg: resolvedPageBg,
      ink: resolvedInk,
    };
  }, [baseTheme, prefs.theme, prefs.customBgColor, prefs.customTextColor]);
  const fontMeta = FONT_STACKS[prefs.font];
  const rtl = useMemo(
    () =>
      isRtlLanguage(book.language) ||
      isArabicHeavyText(activeChapter.content || '') ||
      isArabicHeavyText(book.title || ''),
    [activeChapter.content, book.language, book.title]
  );

  const effectiveLayout: AppleLayoutMode =
    prefs.layout === 'spread' && !isDesktopWide ? 'single' : prefs.layout;

  // Persist user typography preferences
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
    } catch {}
  }, [prefs]);

  useEffect(() => {
    const onResize = () => setIsDesktopWide(window.innerWidth >= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Load fresh annotations from backend when book opens
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/library/books/${encodeURIComponent(book.id)}/annotations`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.success && Array.isArray(d.annotations)) {
          setAnnotations(d.annotations);
          onAnnotationsChange?.(d.annotations);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  // Paginate ALL chapters into a unified whole-book page map so readers never get stuck at "1 / 1" on short chapters
  const allChaptersPages = useMemo(
    () =>
      chapters.map((ch) =>
        paginateChapter(ch.content || '', prefs.fontSize, prefs.lineHeight, effectiveLayout === 'spread')
      ),
    [chapters, prefs.fontSize, prefs.lineHeight, effectiveLayout]
  );

  const flatBookPages = useMemo(() => {
    const flat: Array<{ chapterIndex: number; pageIndex: number }> = [];
    allChaptersPages.forEach((chPages, cIdx) => {
      chPages.forEach((_, pIdx) => {
        flat.push({ chapterIndex: cIdx, pageIndex: pIdx });
      });
    });
    return flat.length > 0 ? flat : [{ chapterIndex: 0, pageIndex: 0 }];
  }, [allChaptersPages]);

  const pages = allChaptersPages[chapterIndex] || [{ index: 0, isChapterStart: true, paragraphs: [''] }];

  // Clamp page index when chapter or font changes
  useEffect(() => {
    if (pageIndex >= pages.length) {
      setPageIndex(Math.max(0, pages.length - 1));
    }
  }, [pages.length, pageIndex]);

  // Snap spread index to even page number
  const spreadLeftIdx = effectiveLayout === 'spread' ? pageIndex - (pageIndex % 2) : pageIndex;
  const spreadRightIdx = effectiveLayout === 'spread' ? spreadLeftIdx + 1 : -1;
  const leftPage = pages[spreadLeftIdx] || pages[0];
  const rightPage = spreadRightIdx >= 0 && spreadRightIdx < pages.length ? pages[spreadRightIdx] : null;

  const globalPageIndex = useMemo(() => {
    const idx = flatBookPages.findIndex(
      (entry) => entry.chapterIndex === chapterIndex && entry.pageIndex === spreadLeftIdx
    );
    return idx >= 0 ? idx : 0;
  }, [flatBookPages, chapterIndex, spreadLeftIdx]);

  const jumpToGlobalPage = useCallback(
    (gIdx: number) => {
      const clamped = Math.max(0, Math.min(flatBookPages.length - 1, gIdx));
      const target = flatBookPages[clamped];
      if (!target) return;
      setChapterIndex(target.chapterIndex);
      setPageIndex(target.pageIndex);
    },
    [flatBookPages]
  );

  // Overall reading progress percentage across book
  const progressPercent = useMemo(() => {
    const total = ((globalPageIndex + 1) / Math.max(1, flatBookPages.length)) * 100;
    return Math.min(100, Math.max(1, Math.round(total)));
  }, [globalPageIndex, flatBookPages.length]);

  const minutesLeftInChapter = useMemo(() => {
    const remainingPages = Math.max(0, pages.length - (effectiveLayout === 'spread' ? spreadLeftIdx + 2 : pageIndex + 1));
    const remainingChars = pages
      .slice(pages.length - remainingPages)
      .reduce((acc, p) => acc + p.paragraphs.join('').length, 0);
    return Math.max(1, Math.ceil(remainingChars / 380));
  }, [pages, pageIndex, spreadLeftIdx, effectiveLayout]);

  // Debounced automatic progress persistence to backend + local reading history
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onSaveProgress(progressPercent, activeChapter.id, activeChapter.title);
      const existing = loadBookProgress(book.id);
      saveBookProgress({
        bookKey: book.id,
        title: book.title,
        pageNumber: chapterIndex + 1,
        totalPages: chapters.length,
        scrollRatio: Math.max(0, Math.min(1, progressPercent / 100)),
        progressPct: progressPercent,
        bookmarks: existing?.bookmarks || [],
        updatedAt: new Date().toISOString(),
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [progressPercent, activeChapter.id, activeChapter.title, book.id, book.title, chapterIndex, chapters.length]);

  // Stop voice on unmount
  useEffect(() => {
    return () => {
      stopSpiritSpeech();
    };
  }, []);

  const flashToast = useCallback((msg: string) => {
    setStatusToast(msg);
    window.setTimeout(() => {
      setStatusToast((prev) => (prev === msg ? null : prev));
    }, 2400);
  }, []);

  const goNextPage = useCallback(() => {
    const step = effectiveLayout === 'spread' ? 2 : 1;
    if (spreadLeftIdx + step < pages.length) {
      setPageIndex(spreadLeftIdx + step);
    } else if (chapterIndex < chapters.length - 1) {
      setChapterIndex((c) => c + 1);
      setPageIndex(0);
    }
  }, [effectiveLayout, spreadLeftIdx, pages.length, chapterIndex, chapters.length]);

  const goPrevPage = useCallback(() => {
    const step = effectiveLayout === 'spread' ? 2 : 1;
    if (spreadLeftIdx - step >= 0) {
      setPageIndex(spreadLeftIdx - step);
    } else if (chapterIndex > 0) {
      const prevChPages = allChaptersPages[chapterIndex - 1] || [];
      setChapterIndex((c) => c - 1);
      setPageIndex(Math.max(0, prevChPages.length - 1));
    }
  }, [effectiveLayout, spreadLeftIdx, chapterIndex, allChaptersPages]);

  // Keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        if (lookupWord || pageAiOpen || appearanceOpen || drawerOpen || searchOpen || aiOpen || selectedText) {
          setLookupWord(null);
          setPageAiOpen(false);
          setAppearanceOpen(false);
          setDrawerOpen(false);
          setSearchOpen(false);
          setAiOpen(false);
          setSelectedText('');
          setShowNoteComposer(false);
        } else {
          stopSpiritSpeech();
          onClose();
        }
      } else if (effectiveLayout !== 'scroll') {
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
          e.preventDefault();
          if (rtl) goPrevPage();
          else goNextPage();
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
          e.preventDefault();
          if (rtl) goNextPage();
          else goPrevPage();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lookupWord, pageAiOpen, appearanceOpen, drawerOpen, searchOpen, aiOpen, selectedText, effectiveLayout, rtl, goNextPage, goPrevPage, onClose]);

  const currentChapterAnnotations = useMemo(
    () => annotations.filter((a) => a.chapterId === activeChapter.id),
    [annotations, activeChapter.id]
  );

  const bookmarks = useMemo(
    () => annotations.filter((a) => a.kind === 'bookmark' || a.selectedText?.startsWith('书签：')),
    [annotations]
  );

  const highlightsAndNotes = useMemo(
    () => annotations.filter((a) => a.kind !== 'bookmark' && !a.selectedText?.startsWith('书签：')),
    [annotations]
  );

  const activeBookmark = useMemo(
    () =>
      bookmarks.find(
        (b) =>
          b.chapterId === activeChapter.id &&
          (typeof b.pageIndex !== 'number' || b.pageIndex === spreadLeftIdx)
      ) || null,
    [bookmarks, activeChapter.id, spreadLeftIdx]
  );

  const toggleBookmark = async () => {
    if (activeBookmark) {
      try {
        await fetch(`/api/library/books/${encodeURIComponent(book.id)}/annotations/${encodeURIComponent(activeBookmark.id)}`, {
          method: 'DELETE',
        });
      } catch {}
      const next = annotations.filter((a) => a.id !== activeBookmark.id);
      setAnnotations(next);
      onAnnotationsChange?.(next);
      flashToast(isZh ? '已移除本页书签' : 'Bookmark removed');
      return;
    }

    const snippet = leftPage?.paragraphs[0]?.slice(0, 42) || activeChapter.title;
    try {
      const res = await fetch(`/api/library/books/${encodeURIComponent(book.id)}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId: activeChapter.id,
          selectedText: `书签：${activeChapter.title}`,
          note: `第 ${spreadLeftIdx + 1} 页 · ${snippet}…`,
          kind: 'bookmark',
          pageIndex: spreadLeftIdx,
        }),
      });
      const data = await res.json();
      if (data?.success && data.annotation) {
        const next = [data.annotation, ...annotations];
        setAnnotations(next);
        onAnnotationsChange?.(next);
        flashToast(isZh ? '已添加 Apple 书签' : 'Bookmark added');
      }
    } catch {
      flashToast(isZh ? '书签保存失败' : 'Failed to save bookmark');
    }
  };

  const handleSaveHighlight = async (color: HighlightColor, customNote = '', explanation?: string) => {
    const clean = selectedText.trim();
    if (!clean) return;
    try {
      const res = await fetch(`/api/library/books/${encodeURIComponent(book.id)}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId: activeChapter.id,
          selectedText: clean,
          note: customNote.trim(),
          aiExplanation: explanation,
          color,
          kind: customNote.trim() ? 'note' : 'highlight',
          pageIndex: spreadLeftIdx,
        }),
      });
      const data = await res.json();
      if (data?.success && data.annotation) {
        const next = [data.annotation, ...annotations];
        setAnnotations(next);
        onAnnotationsChange?.(next);
        setNoteDraft('');
        setShowNoteComposer(false);
        if (!aiOpen) setSelectedText('');
        window.getSelection()?.removeAllRanges();
        flashToast(customNote.trim() ? (isZh ? '已保存笔记与高亮' : 'Note & highlight saved') : isZh ? '已高亮标注' : 'Highlighted');
      }
    } catch {
      flashToast(isZh ? '标注保存失败' : 'Failed to save highlight');
    }
  };

  const handleDeleteAnnotation = async (annId: string) => {
    try {
      await fetch(`/api/library/books/${encodeURIComponent(book.id)}/annotations/${encodeURIComponent(annId)}`, {
        method: 'DELETE',
      });
    } catch {}
    const next = annotations.filter((a) => a.id !== annId);
    setAnnotations(next);
    onAnnotationsChange?.(next);
  };

  const handleAiExplain = async () => {
    const passage = selectedText.trim() || leftPage?.paragraphs[0] || activeChapter.title;
    if (!passage) return;
    setAiOpen(true);
    setAiLoading(true);
    setAiAnswer(null);
    setAiCitation(null);
    try {
      const res = await fetch(`/api/library/books/${encodeURIComponent(book.id)}/ai-reading`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId: activeChapter.id,
          selectedText: passage,
          mode: 'explain',
        }),
      });
      const data = await res.json();
      if (data?.success && data.answer) {
        setAiAnswer(data.answer);
        setAiCitation(data.citation || null);
      } else {
        setAiAnswer(data?.error || (isZh ? '暂时未能生成 AI 伴读解析，请稍后再试。' : 'Could not generate AI insight right now.'));
      }
    } catch {
      setAiAnswer(isZh ? '网络暂时波动，请稍后重试。' : 'Network error, please retry.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleToggleReadAloud = async (overrideText?: string) => {
    if (isSpeaking && !overrideText) {
      stopSpiritSpeech();
      setIsSpeaking(false);
      return;
    }
    const textToRead =
      overrideText?.trim() ||
      (effectiveLayout === 'scroll'
        ? activeChapter.content.slice(0, 620)
        : [
            ...(leftPage?.paragraphs || []),
            ...(rightPage?.paragraphs || []),
          ]
            .join('\n')
            .slice(0, 620));
    if (!textToRead) return;
    setIsSpeaking(true);
    try {
      await speakSpiritReply(textToRead, book.language || lang);
    } finally {
      setIsSpeaking(false);
    }
  };

  const currentVisiblePageText = useMemo(() => {
    if (effectiveLayout === 'scroll') {
      return (activeChapter.content || '').slice(0, 5200);
    }
    return [...(leftPage?.paragraphs || []), ...(rightPage?.paragraphs || [])].join('\n\n');
  }, [effectiveLayout, activeChapter.content, leftPage, rightPage]);

  const currentPageKey = `${chapterIndex}_${spreadLeftIdx}`;
  const isAtEndOfBook =
    chapterIndex >= chapters.length - 1 &&
    (effectiveLayout === 'scroll' || spreadLeftIdx + (effectiveLayout === 'spread' ? 2 : 1) >= pages.length);

  const handleExplainCurrentPage = useCallback(
    async (customQuestion?: string, overridePassage?: string) => {
      const pageContent = (overridePassage || currentVisiblePageText).trim() || activeChapter.title;
      setPageAiOpen(true);
      setPageAiTab('explain');
      setPageAiLoading(true);
      setPageAiError('');
      const q = typeof customQuestion === 'string' ? customQuestion.trim() : '';

      try {
        const res = await fetch('/api/library/ai/deep-explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `${book.title} · ${activeChapter.title}`,
            passage: pageContent,
            pageNumber: spreadLeftIdx + 1,
            question: q || undefined,
            lang: isZh ? 'zh' : 'en',
          }),
        });
        const data = await res.json();
        if (data?.success && data.explanation) {
          setPageAiAnswer(data.explanation);
          setPageAiKey(currentPageKey);
          if (q) setPageAiQuestion('');
        } else {
          setPageAiError(data?.error || (isZh ? 'AI 精讲暂时不可用，请稍后重试。' : 'Could not explain this page.'));
        }
      } catch {
        setPageAiError(isZh ? '网络波动，请稍后重试。' : 'Network error.');
      } finally {
        setPageAiLoading(false);
      }
    },
    [activeChapter.title, book.title, currentPageKey, currentVisiblePageText, isZh, spreadLeftIdx]
  );

  const handleBookQa = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q) return;
      setPageAiOpen(true);
      setPageAiTab('qa');
      setPageAiLoading(true);
      setPageAiError('');
      try {
        const allChunks = chapters.map((ch, idx) => ({
          page: idx + 1,
          text: `${ch.title}\n${(ch.content || '').slice(0, 2600)}`,
        }));
        const res = await fetch('/api/library/ai/book-qa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: book.title,
            question: q,
            currentPage: chapterIndex + 1,
            currentPageText: currentVisiblePageText,
            bookChunks: allChunks,
            lang: isZh ? 'zh' : 'en',
          }),
        });
        const data = await res.json();
        if (data?.success && data.answer) {
          setBookQaHistory((prev) => [...prev, { q, a: data.answer }]);
          setPageAiQuestion('');
        } else {
          setPageAiError(data?.error || '全书问答暂时不可用。');
        }
      } catch {
        setPageAiError('网络波动，请稍后重试。');
      } finally {
        setPageAiLoading(false);
      }
    },
    [book.title, chapterIndex, chapters, currentVisiblePageText, isZh]
  );

  const handleSummarize = useCallback(
    async (scope: 'paragraph' | 'chapter' | 'book') => {
      setPageAiOpen(true);
      setPageAiTab('summary');
      setPageAiLoading(true);
      setPageAiError('');
      const content =
        scope === 'paragraph'
          ? (selectedText.trim() || currentVisiblePageText)
          : scope === 'chapter'
            ? `${activeChapter.title}\n${activeChapter.content || ''}`
            : chapters.map((ch) => `【${ch.title}】\n${(ch.content || '').slice(0, 900)}`).join('\n\n');
      try {
        const res = await fetch('/api/library/ai/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: book.title,
            scope,
            content: content.slice(0, 14000),
            lang: isZh ? 'zh' : 'en',
          }),
        });
        const data = await res.json();
        if (data?.success && data.summary) {
          setSummaryText(data.summary);
        } else {
          setPageAiError(data?.error || '总结生成失败。');
        }
      } catch {
        setPageAiError('网络波动，请稍后重试。');
      } finally {
        setPageAiLoading(false);
      }
    },
    [activeChapter.content, activeChapter.title, book.title, chapters, currentVisiblePageText, isZh, selectedText]
  );

  const handleInlineTranslate = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      setInlineTranslation({ loading: true, text: '' });
      try {
        const res = await fetch('/api/library/ai/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: clean,
            targetLang: isZh ? 'zh' : 'en',
            bookTitle: book.title,
          }),
        });
        const data = await res.json();
        setInlineTranslation({
          loading: false,
          text: data?.success && data.translation ? data.translation : data?.error || '翻译失败，请重试。',
        });
      } catch {
        setInlineTranslation({ loading: false, text: '网络波动，请稍后重试。' });
      }
    },
    [book.title, isZh]
  );

  const handleSaveToVocabulary = useCallback(async () => {
    if (!lookupEntry) return;
    try {
      const res = await fetch('/api/library/vocabulary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...lookupEntry,
          bookTitle: book.title,
        }),
      });
      const data = await res.json();
      if (data?.success) {
        setVocabSavedWord(lookupEntry.word);
        flashToast(isZh ? `已将「${lookupEntry.word}」收入生词本` : `Saved "${lookupEntry.word}"`);
      }
    } catch {}
  }, [book.title, flashToast, isZh, lookupEntry]);

  const handleLookupWord = useCallback(
    async (rawWord: string, contextSentence?: string) => {
      const cleaned = rawWord
        .replace(/^[\s.,;:!?()[\]{}"'«»„“”‘’—–\-_/\\•·،؛؟。，、！？（）【】《》]+/, '')
        .replace(/[\s.,;:!?()[\]{}"'«»„“”‘’—–\-_/\\•·،؛؟。，、！？（）【】《》]+$/, '')
        .trim();
      if (!cleaned) return;
      setLookupWord(cleaned);
      setLookupLoading(true);
      setLookupError('');
      setLookupEntry(null);

      try {
        const res = await fetch('/api/library/ai/lookup-word', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            word: cleaned,
            contextSentence: (contextSentence || currentVisiblePageText).slice(0, 320),
            bookTitle: book.title,
            lang: isZh ? 'zh' : 'en',
          }),
        });
        const data = await res.json();
        if (data?.success && data.entry) {
          setLookupEntry(data.entry);
        } else {
          setLookupError(data?.error || (isZh ? '暂时未能查出该词释义。' : 'Could not look up word.'));
        }
      } catch {
        setLookupError(isZh ? '网络波动，请稍后重试。' : 'Network error.');
      } finally {
        setLookupLoading(false);
      }
    },
    [book.title, currentVisiblePageText, isZh]
  );

  const handleTapWordLookup = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const activeSel = window.getSelection()?.toString().trim() || '';
      if (activeSel.length >= 2) return; // Let drag-selection toolbar handle multi-char selection

      let textNode: Node | null = null;
      let offset = 0;

      const docAny = document as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
      };

      if (typeof docAny.caretPositionFromPoint === 'function') {
        const pos = docAny.caretPositionFromPoint(e.clientX, e.clientY);
        if (pos) {
          textNode = pos.offsetNode;
          offset = pos.offset;
        }
      } else if (typeof docAny.caretRangeFromPoint === 'function') {
        const range = docAny.caretRangeFromPoint(e.clientX, e.clientY);
        if (range) {
          textNode = range.startContainer;
          offset = range.startOffset;
        }
      }

      if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
      const content = textNode.textContent || '';
      if (!content.trim() || offset < 0 || offset > content.length) return;

      const idx = Math.min(offset, Math.max(0, content.length - 1));
      const ch = content[idx] || '';
      const wordCharRe = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFFA-Za-z0-9'-]/;
      const cjkRe = /[\u4e00-\u9fff]/;

      let picked = '';
      if (wordCharRe.test(ch)) {
        let start = idx;
        let end = idx + 1;
        while (start > 0 && wordCharRe.test(content[start - 1])) start -= 1;
        while (end < content.length && wordCharRe.test(content[end])) end += 1;
        picked = content.slice(start, end);
      } else if (cjkRe.test(ch)) {
        // Grab a natural 2-char Chinese word around tap
        const start = idx > 0 && cjkRe.test(content[idx - 1]) && (idx + 1 >= content.length || !cjkRe.test(content[idx + 1])) ? idx - 1 : idx;
        const end = Math.min(content.length, start + 2);
        picked = content.slice(start, end).replace(/[^\u4e00-\u9fff]/g, '');
      }

      if (picked.length >= 1) {
        const snippet = content.slice(Math.max(0, idx - 80), Math.min(content.length, idx + 120));
        void handleLookupWord(picked, snippet);
      }
    },
    [handleLookupWord]
  );

  const handleTextSelection = () => {
    const sel = window.getSelection()?.toString().trim() || '';
    if (sel.length >= 2) {
      setSelectedText(sel.slice(0, 800));
      setAppearanceOpen(false);
    } else if (!showNoteComposer && !aiOpen) {
      setSelectedText('');
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      rootRef.current?.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Search across all chapters
  const searchMatches = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (q.length < 1) return [];
    const hits: Array<{ chapterIdx: number; chapterTitle: string; snippet: string }> = [];
    chapters.forEach((ch, idx) => {
      const content = ch.content || '';
      const pos = content.toLowerCase().indexOf(q);
      if (pos !== -1) {
        const start = Math.max(0, pos - 24);
        const end = Math.min(content.length, pos + q.length + 52);
        hits.push({
          chapterIdx: idx,
          chapterTitle: ch.title,
          snippet: `${start > 0 ? '…' : ''}${content.slice(start, end)}${end < content.length ? '…' : ''}`,
        });
      }
    });
    return hits.slice(0, 12);
  }, [searchTerm, chapters]);

  const renderPageColumn = (page: PaginatedPage, pageNumLabel: number, runningHeader: string) => (
    <div
      className={`flex h-full flex-col justify-between px-6 py-7 sm:px-11 sm:py-9 lg:px-12 lg:py-10 ${rtl ? 'notranslate' : ''}`}
      dir={rtl ? 'rtl' : 'ltr'}
      lang={rtl ? 'ar' : book.language || undefined}
      translate={rtl ? 'no' : undefined}
    >
      {/* Classical 3-column Sepia Running Header matching physical book spread */}
      <div
        className="mb-5 grid grid-cols-3 items-center text-[11px] tracking-wide select-none"
        style={{ color: theme.muted }}
      >
        <span className="truncate text-start">{runningHeader}</span>
        <span className="text-center font-mono text-[10.5px] opacity-85">{pageNumLabel}</span>
        <span className="truncate text-end font-mono text-[10.5px] opacity-85">
          {isZh ? `第 ${chapterIndex + 1} 章` : `Ch. ${chapterIndex + 1}`}
        </span>
      </div>

      {/* Main Book Prose (single-click any word for instant AI dictionary lookup) */}
      <div
        onMouseUp={handleTextSelection}
        onTouchEnd={handleTextSelection}
        onClick={handleTapWordLookup}
        className="flex-1 overflow-y-auto pr-1 cursor-text"
        style={{
          fontFamily:
            rtl && prefs.font !== 'amiri' && prefs.font !== 'naskh'
              ? '"Scheherazade New", "Amiri", "Noto Naskh Arabic", serif'
              : fontMeta.family,
          fontSize: `${rtl ? Math.max(prefs.fontSize + 4, 22) : prefs.fontSize}px`,
          lineHeight: rtl ? Math.max(prefs.lineHeight, 2.3) : prefs.lineHeight,
          wordSpacing: rtl ? '0.05em' : undefined,
          letterSpacing: rtl ? '0' : undefined,
          fontFeatureSettings: rtl ? '"liga" 1, "calt" 1, "mark" 1, "mkmk" 1' : undefined,
          unicodeBidi: rtl ? 'plaintext' : undefined,
          color: theme.ink,
        }}
      >
        {page.isChapterStart && (
          <header className="mb-7 pb-5" style={{ borderBottom: `1px solid ${theme.border}` }}>
            <div
              className="mb-1.5 text-[11px] uppercase tracking-[0.16em]"
              style={{ color: theme.muted }}
            >
              {isZh ? `第 ${chapterIndex + 1} 章` : `Chapter ${chapterIndex + 1}`}
            </div>
            <h1
              className="text-2xl sm:text-[26px] font-semibold tracking-tight leading-snug"
              style={{ color: theme.ink }}
            >
              {containsArabic(activeChapter.title) ? normalizeArabicProse(activeChapter.title) : activeChapter.title}
            </h1>
          </header>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: `${prefs.paragraphSpacing}px` }}>
          {page.paragraphs.map((rawPara, idx) => {
            const para = rtl || containsArabic(rawPara) ? normalizeArabicProse(rawPara) : rawPara;
            const paraIsArabic = rtl || isArabicHeavyText(para);
            return (
              <p
                key={`${activeChapter.id}_${page.index}_${idx}`}
                dir={paraIsArabic ? 'rtl' : 'ltr'}
                lang={paraIsArabic ? 'ar' : undefined}
                className={`${
                  prefs.textAlign === 'justify'
                    ? 'text-justify'
                    : paraIsArabic
                      ? 'text-right'
                      : 'text-left'
                } ${paraIsArabic ? '' : 'tracking-[0.01em]'} break-words`}
                style={{
                  textIndent:
                    !paraIsArabic && !para.startsWith('"') && !para.startsWith('【') && !/^[A-Za-z]/.test(para)
                      ? '2em'
                      : undefined,
                  unicodeBidi: paraIsArabic ? 'plaintext' : undefined,
                  fontFeatureSettings: paraIsArabic ? '"liga" 1, "calt" 1, "mark" 1, "mkmk" 1' : undefined,
                }}
              >
                {renderParagraphWithHighlights(para, currentChapterAnnotations, theme.isDark)}
              </p>
            );
          })}
        </div>

        {/* End-of-book return banner in single-page mode on final page of final chapter */}
        {effectiveLayout === 'single' && chapterIndex >= chapters.length - 1 && page.index >= pages.length - 1 && (
          <div
            className="mt-8 rounded-2xl p-5 text-center select-none"
            style={{ backgroundColor: theme.bg, border: `1px solid ${theme.border}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-emerald-500" />
            <div className="text-sm font-semibold">{isZh ? '全书已读完' : 'Finished Reading'}</div>
            <button
              type="button"
              onClick={() => {
                stopSpiritSpeech();
                onClose();
              }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-semibold text-white cursor-pointer"
              style={{ backgroundColor: theme.accent }}
            >
              <ChevronLeft className="h-4 w-4" />
              <span>{isZh ? '返回书架' : 'Back to Library'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Quiet Apple Books Page Folio */}
      <div
        className="mt-5 flex items-center justify-center text-[11px] font-medium select-none"
        style={{ color: theme.muted }}
      >
        <span>{pageNumLabel}</span>
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={book.title}
      className="fixed inset-0 z-[70] flex flex-col overflow-hidden transition-colors duration-300 select-text"
      style={{ backgroundColor: theme.bg, color: theme.ink }}
      onTouchStart={(e) => {
        touchStartXRef.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (effectiveLayout === 'scroll' || touchStartXRef.current === null) return;
        const endX = e.changedTouches[0]?.clientX ?? touchStartXRef.current;
        const delta = endX - touchStartXRef.current;
        touchStartXRef.current = null;
        if (Math.abs(delta) > 54) {
          if (delta < 0) goNextPage();
          else goPrevPage();
        }
      }}
    >
      {/* ================================================================= */}
      {/* APPLE BOOKS TOP NAVIGATION BAR                                    */}
      {/* ================================================================= */}
      <header
        className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-2 px-3 sm:px-6 select-none transition-colors"
        style={{
          backgroundColor: theme.chromeBg,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        {/* Left: Back to Bookshelf + Contents Drawer */}
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              stopSpiritSpeech();
              onClose();
            }}
            className="inline-flex h-9 items-center gap-1 rounded-xl px-3 text-xs font-semibold transition-opacity hover:opacity-80 cursor-pointer"
            style={{
              backgroundColor: theme.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
              color: theme.ink,
            }}
          >
            <ChevronLeft className="h-4 w-4" />
            <span>{isZh ? '返回' : 'Back'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setDrawerOpen((v) => !v);
              setAppearanceOpen(false);
              setSearchOpen(false);
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl transition-opacity hover:opacity-75 cursor-pointer"
            style={{
              backgroundColor: drawerOpen ? (theme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)') : 'transparent',
              color: theme.ink,
            }}
            title={isZh ? '目录、书签与笔记' : 'Contents & Bookmarks'}
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        {/* Center: Clean Book Title */}
        <div className="min-w-0 flex-1 text-center px-2">
          <div className="truncate text-xs sm:text-[13px] font-semibold tracking-tight">{book.title}</div>
          <div className="truncate text-[10px]" style={{ color: theme.muted }}>
            {activeChapter.title} · {isZh ? '点任意单词可查词' : 'Tap any word to look up'}
          </div>
        </div>

        {/* Right: AI Explain Page, Read Aloud, Search, aA Typography, Bookmark Ribbon, Fullscreen */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (pageAiOpen && pageAiKey === currentPageKey && pageAiAnswer) {
                setPageAiOpen(false);
              } else {
                void handleExplainCurrentPage();
              }
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-500 cursor-pointer"
            title={isZh ? 'AI 分析本页大意与讲解思路' : 'AI explain current page'}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{isZh ? 'AI 讲解本页' : 'AI Explain'}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleToggleReadAloud()}
            className="inline-flex h-9 items-center gap-1 rounded-xl px-2.5 text-xs font-medium transition-opacity hover:opacity-80 cursor-pointer"
            style={{
              backgroundColor: isSpeaking ? theme.accent : 'transparent',
              color: isSpeaking ? '#FFFFFF' : theme.ink,
            }}
            title={isSpeaking ? (isZh ? '停止朗读' : 'Stop listening') : isZh ? '真人语音朗读本页' : 'Read aloud'}
          >
            {isSpeaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            <span className="hidden lg:inline">{isSpeaking ? (isZh ? '停止' : 'Stop') : isZh ? '朗读' : 'Listen'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSearchOpen((v) => !v);
              setAppearanceOpen(false);
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl transition-opacity hover:opacity-75 cursor-pointer"
            style={{
              backgroundColor: searchOpen ? (theme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)') : 'transparent',
              color: theme.ink,
            }}
            title={isZh ? '书内搜索' : 'Search in book'}
          >
            <Search className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setAppearanceOpen((v) => !v);
              setSearchOpen(false);
            }}
            className="inline-flex h-9 items-center justify-center rounded-xl px-2.5 text-sm font-serif font-semibold tracking-tight transition-opacity hover:opacity-75 cursor-pointer"
            style={{
              backgroundColor: appearanceOpen ? (theme.isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.07)') : 'transparent',
              color: theme.ink,
            }}
            title={isZh ? '字体、主题与排版' : 'Themes & Settings'}
          >
            aA
          </button>

          <button
            type="button"
            onClick={() => void toggleBookmark()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl transition-transform active:scale-95 cursor-pointer"
            style={{ color: activeBookmark ? '#E5484D' : theme.ink }}
            title={activeBookmark ? (isZh ? '取消本页书签' : 'Remove bookmark') : isZh ? '添加书签' : 'Bookmark page'}
          >
            <Bookmark className="h-4 w-4" fill={activeBookmark ? '#E5484D' : 'none'} />
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-xl transition-opacity hover:opacity-75 cursor-pointer"
            style={{ color: theme.muted }}
            title={isFullscreen ? (isZh ? '退出全屏' : 'Exit fullscreen') : isZh ? '全屏阅读' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>

        {/* =============================================================== */}
        {/* APPLE BOOKS "aA" THEMES & TYPOGRAPHY POPOVER                    */}
        {/* =============================================================== */}
        {appearanceOpen && (
          <div
            className="absolute right-3 sm:right-6 top-16 z-50 max-h-[80vh] w-[min(92vw,348px)] overflow-y-auto rounded-2xl p-4 shadow-2xl"
            style={{
              backgroundColor: theme.popoverBg,
              border: `1px solid ${theme.border}`,
              color: theme.ink,
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold tracking-tight">{isZh ? '阅读与排版设置' : 'Themes & Typography'}</span>
              <button
                type="button"
                onClick={() => setAppearanceOpen(false)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-lg cursor-pointer opacity-70 hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Reading Background Presets + Custom Background */}
            <div className="grid grid-cols-6 gap-1.5 pb-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
              {(Object.keys(THEME_TOKENS) as AppleThemeId[]).map((tid) => {
                const t = THEME_TOKENS[tid];
                const active = prefs.theme === tid;
                return (
                  <button
                    key={tid}
                    type="button"
                    onClick={() => setPrefs((p) => ({ ...p, theme: tid }))}
                    className="flex flex-col items-center gap-1 cursor-pointer group"
                  >
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-serif font-semibold transition-transform group-hover:scale-105"
                      style={{
                        backgroundColor: tid === 'custom' ? prefs.customBgColor : t.swatch,
                        color: t.ink,
                        border: active ? `2.5px solid ${theme.accent}` : `1.5px solid ${t.swatchRing}`,
                      }}
                    >
                      Aa
                    </span>
                    <span className="text-[10px]" style={{ color: active ? theme.accent : theme.muted }}>
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {prefs.theme === 'custom' && (
              <div className="flex items-center justify-between py-2.5 text-[11px]" style={{ borderBottom: `1px solid ${theme.border}` }}>
                <span style={{ color: theme.muted }}>自定义背景色</span>
                <input
                  type="color"
                  value={prefs.customBgColor}
                  onChange={(e) => setPrefs((p) => ({ ...p, customBgColor: e.target.value }))}
                  className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent"
                />
              </div>
            )}

            {/* Font Size Stepper */}
            <div className="py-3" style={{ borderBottom: `1px solid ${theme.border}` }}>
              <div className="mb-2 flex items-center justify-between text-[11px]" style={{ color: theme.muted }}>
                <span>{isZh ? '字号大小' : 'Font Size'}</span>
                <span className="font-mono">{prefs.fontSize} px</span>
              </div>
              <div className="grid grid-cols-2 overflow-hidden rounded-xl" style={{ border: `1px solid ${theme.border}` }}>
                <button
                  type="button"
                  onClick={() => setPrefs((p) => ({ ...p, fontSize: Math.max(13, p.fontSize - 1) }))}
                  className="py-2 text-xs font-medium hover:opacity-75 cursor-pointer"
                  style={{ borderRight: `1px solid ${theme.border}` }}
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={() => setPrefs((p) => ({ ...p, fontSize: Math.min(30, p.fontSize + 1) }))}
                  className="py-2 text-base font-medium hover:opacity-75 cursor-pointer"
                >
                  A+
                </button>
              </div>
            </div>

            {/* Font Family (Chinese / Arabic / English) */}
            <div className="py-3" style={{ borderBottom: `1px solid ${theme.border}` }}>
              <div className="mb-2 text-[11px]" style={{ color: theme.muted }}>
                {isZh ? '字体类型（中 / 阿 / 英）' : 'Typeface'}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(FONT_STACKS) as AppleFontId[]).map((fid) => {
                  const f = FONT_STACKS[fid];
                  const active = prefs.font === fid;
                  return (
                    <button
                      key={fid}
                      type="button"
                      onClick={() => setPrefs((p) => ({ ...p, font: fid }))}
                      className="flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs transition-colors cursor-pointer"
                      style={{
                        fontFamily: f.family,
                        border: `1px solid ${active ? theme.accent : theme.border}`,
                        color: active ? theme.accent : theme.ink,
                      }}
                    >
                      <span className="truncate">{f.label}</span>
                      {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Text Color + Reset */}
            <div className="py-3" style={{ borderBottom: `1px solid ${theme.border}` }}>
              <div className="mb-2 flex items-center justify-between text-[11px]" style={{ color: theme.muted }}>
                <span>{isZh ? '文字颜色' : 'Text Color'}</span>
                {prefs.customTextColor && (
                  <button
                    type="button"
                    onClick={() => setPrefs((p) => ({ ...p, customTextColor: null }))}
                    className="cursor-pointer text-[11px] font-medium hover:underline"
                    style={{ color: theme.accent }}
                  >
                    恢复默认
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {TEXT_COLOR_PRESETS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => setPrefs((p) => ({ ...p, customTextColor: c.value || null }))}
                    className="h-6 w-6 cursor-pointer rounded-full border transition hover:scale-110"
                    style={{
                      backgroundColor: c.value || baseTheme.ink,
                      borderColor: (prefs.customTextColor || '') === c.value ? theme.accent : theme.border,
                      borderWidth: (prefs.customTextColor || '') === c.value ? 2 : 1,
                    }}
                    title={c.label}
                  />
                ))}
                <input
                  type="color"
                  value={prefs.customTextColor || baseTheme.ink}
                  onChange={(e) => setPrefs((p) => ({ ...p, customTextColor: e.target.value }))}
                  className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent"
                  title="自定义文字色"
                />
              </div>
            </div>

            {/* Spacing, Margins, Width, Alignment & Layout */}
            <div className="pt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px]" style={{ color: theme.muted }}>
                  <span className="flex justify-between"><span>行距</span><span className="font-mono">{prefs.lineHeight.toFixed(1)}</span></span>
                  <input type="range" min={1.4} max={2.4} step={0.1} value={prefs.lineHeight} onChange={(e) => setPrefs((p) => ({ ...p, lineHeight: Number(e.target.value) }))} className="mt-1 w-full" style={{ accentColor: theme.accent }} />
                </label>
                <label className="text-[11px]" style={{ color: theme.muted }}>
                  <span className="flex justify-between"><span>段距</span><span className="font-mono">{prefs.paragraphSpacing}px</span></span>
                  <input type="range" min={10} max={36} step={2} value={prefs.paragraphSpacing} onChange={(e) => setPrefs((p) => ({ ...p, paragraphSpacing: Number(e.target.value) }))} className="mt-1 w-full" style={{ accentColor: theme.accent }} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px]" style={{ color: theme.muted }}>
                  <span className="flex justify-between"><span>页边距</span><span className="font-mono">{prefs.pageMargin}px</span></span>
                  <input type="range" min={16} max={64} step={4} value={prefs.pageMargin} onChange={(e) => setPrefs((p) => ({ ...p, pageMargin: Number(e.target.value) }))} className="mt-1 w-full" style={{ accentColor: theme.accent }} />
                </label>
                <label className="text-[11px]" style={{ color: theme.muted }}>
                  <span className="flex justify-between"><span>版心宽度</span><span className="font-mono">{prefs.maxWidth}px</span></span>
                  <input type="range" min={560} max={940} step={20} value={prefs.maxWidth} onChange={(e) => setPrefs((p) => ({ ...p, maxWidth: Number(e.target.value) }))} className="mt-1 w-full" style={{ accentColor: theme.accent }} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {(['justify', 'left'] as const).map((al) => (
                  <button
                    key={al}
                    type="button"
                    onClick={() => setPrefs((p) => ({ ...p, textAlign: al }))}
                    className="rounded-xl py-1.5 text-xs font-medium cursor-pointer"
                    style={{
                      border: `1px solid ${prefs.textAlign === al ? theme.accent : theme.border}`,
                      color: prefs.textAlign === al ? theme.accent : theme.ink,
                    }}
                  >
                    {al === 'justify' ? '两端对齐' : '左对齐'}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'spread' as AppleLayoutMode, label: '双页摊开' },
                  { id: 'single' as AppleLayoutMode, label: '单页翻阅' },
                  { id: 'scroll' as AppleLayoutMode, label: '连续滚动' },
                ].map((opt) => {
                  const active = prefs.layout === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPrefs((p) => ({ ...p, layout: opt.id }))}
                      className="rounded-xl py-1.5 text-xs font-medium cursor-pointer"
                      style={{
                        border: `1px solid ${active ? theme.accent : theme.border}`,
                        color: active ? theme.accent : theme.ink,
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* =============================================================== */}
        {/* IN-BOOK SEARCH POPOVER                                          */}
        {/* =============================================================== */}
        {searchOpen && (
          <div
            className="absolute right-3 sm:right-6 top-16 z-50 w-[min(92vw,340px)] rounded-2xl p-3.5 shadow-2xl"
            style={{
              backgroundColor: theme.popoverBg,
              border: `1px solid ${theme.border}`,
              color: theme.ink,
            }}
          >
            <div className="flex items-center gap-2 rounded-xl px-2.5 py-2" style={{ border: `1px solid ${theme.border}` }}>
              <Search className="h-3.5 w-3.5 shrink-0 opacity-60" />
              <input
                type="text"
                autoFocus
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={isZh ? '在全书章节中搜索关键词…' : 'Search inside this book…'}
                className="w-full bg-transparent text-xs focus:outline-none"
                style={{ color: theme.ink }}
              />
              {searchTerm && (
                <button type="button" onClick={() => setSearchTerm('')} className="cursor-pointer opacity-60 hover:opacity-100">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-2.5 max-h-64 overflow-y-auto space-y-1.5">
              {searchTerm.trim() && searchMatches.length === 0 && (
                <div className="py-5 text-center text-xs" style={{ color: theme.muted }}>
                  {isZh ? '未找到匹配片段' : 'No matches found'}
                </div>
              )}
              {searchMatches.map((m, idx) => (
                <button
                  key={`${m.chapterIdx}_${idx}`}
                  type="button"
                  onClick={() => {
                    setChapterIndex(m.chapterIdx);
                    setPageIndex(0);
                    setSearchOpen(false);
                  }}
                  className="w-full rounded-xl p-2.5 text-left transition-opacity hover:opacity-80 cursor-pointer"
                  style={{ border: `1px solid ${theme.border}` }}
                >
                  <div className="text-[11px] font-semibold" style={{ color: theme.accent }}>
                    {m.chapterTitle}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed line-clamp-2" style={{ color: theme.muted }}>
                    {m.snippet}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* ================================================================= */}
      {/* MAIN READING STAGE                                                */}
      {/* ================================================================= */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {/* Slide-Over Left Contents / Bookmarks / Highlights Drawer */}
        {drawerOpen && (
          <aside
            className="absolute inset-y-0 left-0 z-40 flex w-[min(86vw,320px)] flex-col shadow-2xl"
            style={{
              backgroundColor: theme.popoverBg,
              borderRight: `1px solid ${theme.border}`,
              color: theme.ink,
            }}
          >
            {/* Book mini header */}
            <div className="flex items-center gap-3 p-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
              {book.coverImage ? (
                <img
                  src={book.coverImage}
                  alt={book.title}
                  className="h-14 w-10 shrink-0 rounded-md object-cover shadow-sm"
                />
              ) : (
                <div
                  className="flex h-14 w-10 shrink-0 items-center justify-center rounded-md"
                  style={{ backgroundColor: theme.border }}
                >
                  <BookOpen className="h-4 w-4" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold">{book.title}</div>
                <div className="truncate text-[11px] mt-0.5" style={{ color: theme.muted }}>
                  {book.author}
                </div>
                <div className="mt-1 text-[10px] font-medium" style={{ color: theme.accent }}>
                  {isZh ? `已读 ${progressPercent}% · 共 ${chapters.length} 章` : `${progressPercent}% · ${chapters.length} chapters`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg cursor-pointer opacity-70 hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Segmented Tab Control */}
            <div className="grid grid-cols-3 gap-1 p-2.5" style={{ borderBottom: `1px solid ${theme.border}` }}>
              {[
                { id: 'toc' as const, label: `目录 (${chapters.length})` },
                { id: 'bookmarks' as const, label: `书签 (${bookmarks.length})` },
                { id: 'notes' as const, label: `笔记 (${highlightsAndNotes.length})` },
              ].map((t) => {
                const active = drawerTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDrawerTab(t.id)}
                    className="rounded-lg py-1.5 text-[11px] font-medium transition-colors cursor-pointer"
                    style={{
                      backgroundColor: active
                        ? theme.isDark
                          ? 'rgba(255,255,255,0.14)'
                          : 'rgba(0,0,0,0.07)'
                        : 'transparent',
                      color: active ? theme.ink : theme.muted,
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {drawerTab === 'toc' &&
                chapters.map((ch, idx) => {
                  const active = idx === chapterIndex;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => {
                        setChapterIndex(idx);
                        setPageIndex(0);
                        setDrawerOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-xs transition-colors cursor-pointer"
                      style={{
                        backgroundColor: active
                          ? theme.isDark
                            ? 'rgba(100,210,255,0.14)'
                            : 'rgba(0,113,227,0.08)'
                          : 'transparent',
                        color: active ? theme.accent : theme.ink,
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      <span className="line-clamp-2">{ch.title}</span>
                      <span className="shrink-0 font-mono text-[10px] opacity-60">{idx + 1}</span>
                    </button>
                  );
                })}

              {drawerTab === 'bookmarks' &&
                (bookmarks.length === 0 ? (
                  <div className="py-12 text-center text-xs" style={{ color: theme.muted }}>
                    {isZh ? '点击右上角书签图标，随时收藏当前页。' : 'Tap the top-right bookmark icon to save any page.'}
                  </div>
                ) : (
                  bookmarks.map((bm) => {
                    const chIdx = Math.max(0, chapters.findIndex((c) => c.id === bm.chapterId));
                    return (
                      <div
                        key={bm.id}
                        className="flex items-start justify-between gap-2 rounded-xl p-2.5"
                        style={{ border: `1px solid ${theme.border}` }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setChapterIndex(chIdx);
                            setPageIndex(typeof bm.pageIndex === 'number' ? bm.pageIndex : 0);
                            setDrawerOpen(false);
                          }}
                          className="min-w-0 flex-1 text-left cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5 text-xs font-semibold">
                            <Bookmark className="h-3 w-3 shrink-0 text-[#E5484D]" fill="#E5484D" />
                            <span className="truncate">{bm.selectedText.replace(/^书签：/, '')}</span>
                          </div>
                          {bm.note && (
                            <div className="mt-1 text-[11px] line-clamp-2" style={{ color: theme.muted }}>
                              {bm.note}
                            </div>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteAnnotation(bm.id)}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg cursor-pointer opacity-50 hover:opacity-100"
                          title={isZh ? '删除书签' : 'Delete bookmark'}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })
                ))}

              {drawerTab === 'notes' &&
                (highlightsAndNotes.length === 0 ? (
                  <div className="py-12 text-center text-xs" style={{ color: theme.muted }}>
                    {isZh ? '划选书中任意句子，即可高亮标注、写下感悟或呼唤 AI 伴读。' : 'Select any text to highlight, add a note, or ask AI.'}
                  </div>
                ) : (
                  highlightsAndNotes.map((ann) => {
                    const chIdx = Math.max(0, chapters.findIndex((c) => c.id === ann.chapterId));
                    const swatch = HIGHLIGHT_SWATCHES.find((s) => s.id === (ann.color || 'yellow')) || HIGHLIGHT_SWATCHES[0];
                    return (
                      <div
                        key={ann.id}
                        className="rounded-xl p-3 space-y-1.5"
                        style={{ border: `1px solid ${theme.border}` }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setChapterIndex(chIdx);
                              setPageIndex(typeof ann.pageIndex === 'number' ? ann.pageIndex : 0);
                              setDrawerOpen(false);
                            }}
                            className="flex-1 text-left cursor-pointer"
                          >
                            <div
                              className="border-l-2 pl-2 text-xs italic leading-relaxed line-clamp-3"
                              style={{ borderColor: swatch.dot }}
                            >
                              “{ann.selectedText}”
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteAnnotation(ann.id)}
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg cursor-pointer opacity-50 hover:opacity-100"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        {ann.note && <div className="text-xs leading-relaxed">{ann.note}</div>}
                        {ann.aiExplanation && (
                          <div className="text-[11px] leading-relaxed line-clamp-3" style={{ color: theme.muted }}>
                            AI 伴读：{ann.aiExplanation}
                          </div>
                        )}
                      </div>
                    );
                  })
                ))}
            </div>
          </aside>
        )}

        {/* =============================================================== */}
        {/* BOOK PAGES CANVAS (SPREAD / SINGLE / CONTINUOUS SCROLL)         */}
        {/* =============================================================== */}
        <main
          className="relative flex flex-1 min-h-0 items-center justify-center overflow-hidden px-2 py-3 sm:px-6 sm:py-5"
          onClick={() => {
            if (appearanceOpen) setAppearanceOpen(false);
            if (searchOpen) setSearchOpen(false);
          }}
        >
          {effectiveLayout === 'scroll' ? (
            <div
              className="h-full w-full overflow-y-auto overflow-x-hidden rounded-2xl py-8 sm:py-12 shadow-sm"
              style={{
                maxWidth: `${prefs.maxWidth}px`,
                paddingLeft: `${prefs.pageMargin}px`,
                paddingRight: `${prefs.pageMargin}px`,
                backgroundColor: theme.pageBg,
                border: `1px solid ${theme.border}`,
              }}
              dir={rtl ? 'rtl' : 'ltr'}
              onMouseUp={handleTextSelection}
              onTouchEnd={handleTextSelection}
              onClick={handleTapWordLookup}
            >
              <header className="mb-8 pb-6" style={{ borderBottom: `1px solid ${theme.border}` }}>
                <div className="text-[11px] uppercase tracking-[0.16em]" style={{ color: theme.muted }}>
                  {isZh ? `第 ${chapterIndex + 1} 章 / 共 ${chapters.length} 章` : `Chapter ${chapterIndex + 1} of ${chapters.length}`}
                </div>
                <h1 className="mt-1.5 text-2xl sm:text-3xl font-semibold tracking-tight">{activeChapter.title}</h1>
              </header>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: `${prefs.paragraphSpacing}px`,
                  fontFamily:
                    rtl && prefs.font !== 'amiri' && prefs.font !== 'naskh'
                      ? '"Scheherazade New", "Amiri", "Noto Naskh Arabic", serif'
                      : fontMeta.family,
                  fontSize: `${rtl ? Math.max(prefs.fontSize + 4, 22) : prefs.fontSize}px`,
                  lineHeight: rtl ? Math.max(prefs.lineHeight, 2.3) : prefs.lineHeight,
                  wordSpacing: rtl ? '0.05em' : undefined,
                  letterSpacing: rtl ? '0' : undefined,
                  fontFeatureSettings: rtl ? '"liga" 1, "calt" 1, "mark" 1, "mkmk" 1' : undefined,
                  unicodeBidi: rtl ? 'plaintext' : undefined,
                  color: theme.ink,
                }}
              >
                {activeChapter.content
                  .split(/\n{2,}/)
                  .map((p) => p.trim())
                  .filter(Boolean)
                  .map((rawPara, idx) => {
                    const para = rtl || containsArabic(rawPara) ? normalizeArabicProse(rawPara) : rawPara;
                    const paraIsArabic = rtl || isArabicHeavyText(para);
                    return (
                      <p
                        key={idx}
                        dir={paraIsArabic ? 'rtl' : 'ltr'}
                        lang={paraIsArabic ? 'ar' : undefined}
                        className={`${
                          prefs.textAlign === 'justify'
                            ? 'text-justify'
                            : paraIsArabic
                              ? 'text-right'
                              : 'text-left'
                        } break-words`}
                        style={{
                          textIndent:
                            !paraIsArabic && !para.startsWith('"') && !para.startsWith('【') && !/^[A-Za-z]/.test(para)
                              ? '2em'
                              : undefined,
                          unicodeBidi: paraIsArabic ? 'plaintext' : undefined,
                          fontFeatureSettings: paraIsArabic ? '"liga" 1, "calt" 1, "mark" 1, "mkmk" 1' : undefined,
                        }}
                      >
                        {renderParagraphWithHighlights(para, currentChapterAnnotations, theme.isDark)}
                      </p>
                    );
                  })}
              </div>

              <div
                className="mt-14 pt-6 flex items-center justify-between text-xs"
                style={{ borderTop: `1px solid ${theme.border}` }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  disabled={chapterIndex === 0}
                  onClick={() => {
                    setChapterIndex((c) => Math.max(0, c - 1));
                    setPageIndex(0);
                  }}
                  className="inline-flex items-center gap-1 rounded-xl px-3 py-2 font-medium disabled:opacity-30 cursor-pointer"
                  style={{ color: theme.accent }}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>{isZh ? '上一章' : 'Previous'}</span>
                </button>
                {chapterIndex >= chapters.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      stopSpiritSpeech();
                      onClose();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full px-5 py-2 font-semibold text-white cursor-pointer"
                    style={{ backgroundColor: theme.accent }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span>{isZh ? '全书已读完 · 返回书架' : 'Finished · Back to Library'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setChapterIndex((c) => Math.min(chapters.length - 1, c + 1));
                      setPageIndex(0);
                    }}
                    className="inline-flex items-center gap-1 rounded-xl px-3 py-2 font-medium cursor-pointer"
                    style={{ color: theme.accent }}
                  >
                    <span>{isZh ? '下一章' : 'Next'}</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="relative flex h-full w-full max-w-[1160px] items-center justify-center">
              {/* Left Page Turn Trigger */}
              <button
                type="button"
                onClick={rtl ? goNextPage : goPrevPage}
                disabled={rtl ? chapterIndex >= chapters.length - 1 && spreadLeftIdx + (effectiveLayout === 'spread' ? 2 : 1) >= pages.length : chapterIndex === 0 && spreadLeftIdx === 0}
                aria-label={isZh ? '上一页' : 'Previous page'}
                className="hidden sm:flex h-12 w-10 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80 disabled:opacity-15 cursor-pointer"
                style={{ color: theme.muted }}
              >
                <ChevronLeft className="h-6 w-6" />
              </button>

              {/* Open Book Paper Surface with authentic stacked page edges & warm center spine */}
              {/* In RTL Arabic books, dir="rtl" puts Page N on the RIGHT column and Page N+1 on the LEFT column — matching physical Arabic books */}
              <div
                dir={effectiveLayout === 'spread' && rtl ? 'rtl' : 'ltr'}
                className={`relative flex h-full w-full overflow-hidden rounded-[14px] transition-colors duration-300 ${
                  effectiveLayout === 'spread' ? 'max-w-[1080px] grid grid-cols-2' : 'max-w-[700px] flex-col'
                }`}
                style={{
                  backgroundColor: theme.pageBg,
                  border: `1px solid ${theme.border}`,
                  boxShadow: theme.isDark
                    ? '0 24px 60px rgba(0, 0, 0, 0.55), -5px 0 0 -1px #1d212b, 5px 0 0 -1px #1d212b'
                    : '0 22px 54px rgba(48, 36, 20, 0.12), -5px 0 0 -1px #f6f0e3, -6px 0 0 -1px #d6cbb4, -10px 0 0 -2px #efe7d6, -11px 0 0 -2px #cfc2a7, 5px 0 0 -1px #f6f0e3, 6px 0 0 -1px #d6cbb4, 10px 0 0 -2px #efe7d6, 11px 0 0 -2px #cfc2a7',
                }}
              >
                {/* Primary Page (Left in LTR, Right in RTL Arabic open book) */}
                <div className="h-full min-h-0 overflow-y-auto">
                  {renderPageColumn(leftPage, globalPageIndex + 1, book.title)}
                </div>

                {/* Center Spine Shadow + Next Page in Two-Page Spread */}
                {effectiveLayout === 'spread' && (
                  <>
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 left-1/2 w-12 -translate-x-1/2 z-10"
                      style={{
                        background: theme.isDark
                          ? 'linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.42) 48%, rgba(255,255,255,0.05) 52%, rgba(0,0,0,0) 100%)'
                          : 'linear-gradient(90deg, rgba(64,48,26,0) 0%, rgba(64,48,26,0.09) 46%, rgba(42,30,16,0.16) 50%, rgba(255,252,244,0.34) 53%, rgba(64,48,26,0) 100%)',
                      }}
                    />
                    <div
                      className="h-full min-h-0 overflow-y-auto"
                      style={rtl ? { borderRight: `1px solid ${theme.border}` } : { borderLeft: `1px solid ${theme.border}` }}
                    >
                      {rightPage ? (
                        renderPageColumn(rightPage, globalPageIndex + 2, activeChapter.title)
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center px-10 text-center select-none" style={{ color: theme.muted }}>
                          <BookOpen className="h-7 w-7 mb-3 opacity-35" />
                          <div className="text-xs font-medium">
                            {chapterIndex < chapters.length - 1
                              ? isZh
                                ? `本章阅读完毕`
                                : 'End of Chapter'
                              : isZh
                                ? '全书阅读完毕'
                                : 'End of Book'}
                          </div>
                          {chapterIndex < chapters.length - 1 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setChapterIndex((c) => c + 1);
                                setPageIndex(0);
                              }}
                              className="mt-4 inline-flex items-center gap-1 rounded-full px-4 py-2 text-xs font-medium cursor-pointer"
                              style={{ backgroundColor: theme.accent, color: '#FFFFFF' }}
                            >
                              <span>{isZh ? '进入下一章' : 'Next Chapter'}</span>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                stopSpiritSpeech();
                                onClose();
                              }}
                              className="mt-4 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-xs font-semibold cursor-pointer"
                              style={{ backgroundColor: theme.accent, color: '#FFFFFF' }}
                            >
                              <ChevronLeft className="h-4 w-4" />
                              <span>{isZh ? '返回书架' : 'Back to Library'}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Right Page Turn Trigger */}
              <button
                type="button"
                onClick={rtl ? goPrevPage : goNextPage}
                disabled={rtl ? chapterIndex === 0 && spreadLeftIdx === 0 : chapterIndex >= chapters.length - 1 && spreadLeftIdx + (effectiveLayout === 'spread' ? 2 : 1) >= pages.length}
                aria-label={isZh ? '下一页' : 'Next page'}
                className="hidden sm:flex h-12 w-10 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80 disabled:opacity-15 cursor-pointer"
                style={{ color: theme.muted }}
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </div>
          )}

          {/* =============================================================== */}
          {/* FLOATING APPLE TEXT-SELECTION TOOLBAR (HIGHLIGHT / NOTE / AI)   */}
          {/* =============================================================== */}
          {selectedText && (
            <div
              className="absolute bottom-5 left-1/2 z-40 w-[min(94vw,460px)] -translate-x-1/2 rounded-2xl p-3 shadow-2xl"
              style={{
                backgroundColor: theme.popoverBg,
                border: `1px solid ${theme.border}`,
                color: theme.ink,
              }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="truncate text-[11px] italic" style={{ color: theme.muted }}>
                  “{selectedText}”
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedText('');
                    setShowNoteComposer(false);
                    setAiOpen(false);
                  }}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg cursor-pointer opacity-60 hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                {/* 5 Apple Highlight Color Dots */}
                <div className="flex items-center gap-1.5">
                  {HIGHLIGHT_SWATCHES.map((sw) => (
                    <button
                      key={sw.id}
                      type="button"
                      onClick={() => {
                        setActiveHighlightColor(sw.id);
                        void handleSaveHighlight(sw.id);
                      }}
                      className="h-6 w-6 rounded-full transition-transform hover:scale-110 cursor-pointer"
                      style={{
                        backgroundColor: sw.dot,
                        border: activeHighlightColor === sw.id ? `2px solid ${theme.ink}` : '1.5px solid rgba(0,0,0,0.12)',
                      }}
                      title={`${isZh ? '高亮：' : 'Highlight: '}${sw.label}`}
                    />
                  ))}
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleInlineTranslate(selectedText)}
                    className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-medium cursor-pointer"
                    style={{ border: `1px solid ${theme.border}` }}
                  >
                    <Languages className="h-3.5 w-3.5" />
                    <span>{isZh ? '翻译段落' : 'Translate'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleLookupWord(selectedText.slice(0, 60))}
                    className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-medium cursor-pointer"
                    style={{ border: `1px solid ${theme.border}` }}
                  >
                    <span>{isZh ? '查词' : 'Lookup'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNoteComposer((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-medium cursor-pointer"
                    style={{ border: `1px solid ${theme.border}` }}
                  >
                    <StickyNote className="h-3.5 w-3.5" />
                    <span>{isZh ? '笔记' : 'Note'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExplainCurrentPage(undefined, selectedText)}
                    className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-medium cursor-pointer"
                    style={{ backgroundColor: theme.accent, color: '#FFFFFF' }}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{isZh ? 'AI 精讲' : 'Deep Explain'}</span>
                  </button>
                </div>
              </div>

              {inlineTranslation && (
                <div className="mt-2.5 rounded-xl p-2.5 text-xs leading-relaxed" style={{ backgroundColor: theme.bg, border: `1px solid ${theme.border}` }}>
                  <div className="mb-1 flex items-center justify-between text-[11px] font-semibold" style={{ color: theme.accent }}>
                    <span>段落翻译</span>
                    <button type="button" onClick={() => setInlineTranslation(null)} className="cursor-pointer opacity-70 hover:opacity-100"><X className="h-3 w-3" /></button>
                  </div>
                  {inlineTranslation.loading ? (
                    <div className="flex items-center gap-1.5 py-1 opacity-75"><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>正在翻译…</span></div>
                  ) : (
                    <div className="whitespace-pre-wrap">{inlineTranslation.text}</div>
                  )}
                </div>
              )}

              {showNoteComposer && (
                <div className="mt-2.5 space-y-2 pt-2.5" style={{ borderTop: `1px solid ${theme.border}` }}>
                  <textarea
                    rows={2}
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder={isZh ? '写下你的读书想法与批注…' : 'Write your reading note…'}
                    className="w-full rounded-xl p-2 text-xs focus:outline-none"
                    style={{
                      backgroundColor: theme.bg,
                      border: `1px solid ${theme.border}`,
                      color: theme.ink,
                    }}
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => void handleSaveHighlight(activeHighlightColor, noteDraft, aiAnswer || undefined)}
                      className="rounded-xl px-3.5 py-1.5 text-xs font-medium cursor-pointer"
                      style={{ backgroundColor: theme.accent, color: '#FFFFFF' }}
                    >
                      {isZh ? '保存批注' : 'Save Note'}
                    </button>
                  </div>
                </div>
              )}

              {aiOpen && (
                <div className="mt-2.5 max-h-48 overflow-y-auto rounded-xl p-3 text-xs leading-relaxed" style={{ backgroundColor: theme.bg, border: `1px solid ${theme.border}` }}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 font-semibold" style={{ color: theme.accent }}>
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{isZh ? 'AI 伴读解读' : 'AI Reading Companion'}</span>
                    </span>
                    {aiAnswer && (
                      <button
                        type="button"
                        onClick={() => void handleSaveHighlight(activeHighlightColor, noteDraft || 'AI 伴读笔记', aiAnswer)}
                        className="text-[11px] font-medium underline cursor-pointer"
                        style={{ color: theme.accent }}
                      >
                        {isZh ? '存入笔记' : 'Save to Notes'}
                      </button>
                    )}
                  </div>
                  {aiLoading ? (
                    <div className="py-2 opacity-75">{isZh ? '正在精读解析这段文字…' : 'Analyzing passage…'}</div>
                  ) : (
                    <div className="whitespace-pre-line">{aiAnswer}</div>
                  )}
                  {aiCitation?.sourceUrl && (
                    <a
                      href={aiCitation.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[10px] opacity-75 hover:opacity-100"
                    >
                      <span>{aiCitation.location}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tap-Any-Word Floating AI Dictionary Card */}
          {lookupWord && (
            <div
              role="dialog"
              aria-label="AI 查词卡"
              className="absolute bottom-5 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl p-4 shadow-2xl sm:left-6 sm:right-auto sm:mx-0 sm:w-[370px]"
              style={{
                backgroundColor: theme.popoverBg,
                border: `1px solid ${theme.border}`,
                color: theme.ink,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold">{lookupEntry?.word || lookupWord}</span>
                    {lookupEntry?.cefrLevel && (
                      <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                        {lookupEntry.cefrLevel}
                      </span>
                    )}
                    {lookupEntry?.partOfSpeech && (
                      <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                        {lookupEntry.partOfSpeech}
                      </span>
                    )}
                  </div>
                  {lookupEntry?.reading && (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono font-medium" style={{ color: theme.muted }}>
                        {lookupEntry.reading}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const url = lookupEntry.usAudioUrl || lookupEntry.ukAudioUrl || lookupEntry.audioUrl;
                          if (url) {
                            const audio = new Audio(url);
                            void audio.play().catch(() => {});
                            return;
                          }
                          if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                            window.speechSynthesis.cancel();
                            const utt = new SpeechSynthesisUtterance(lookupEntry.word);
                            utt.lang = /[\u0600-\u06FF]/.test(utt.text) ? 'ar-SA' : 'en-US';
                            window.speechSynthesis.speak(utt);
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium cursor-pointer"
                        style={{ backgroundColor: theme.bg, color: theme.accent }}
                        title={isZh ? '朗读发音' : 'Pronounce'}
                      >
                        <Volume2 className="h-3 w-3" />
                        <span>{isZh ? '发音' : 'Listen'}</span>
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setLookupWord(null)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg cursor-pointer opacity-65 hover:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2.5 text-xs leading-relaxed">
                {lookupLoading ? (
                  <div className="flex items-center gap-2 py-3" style={{ color: theme.muted }}>
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                    <span>{isZh ? `AI 正在查询「${lookupWord}」…` : `Looking up "${lookupWord}"…`}</span>
                  </div>
                ) : lookupError ? (
                  <div className="text-rose-500">{lookupError}</div>
                ) : lookupEntry ? (
                  <div className="space-y-2">
                    {lookupEntry.lemma && lookupEntry.lemma !== lookupEntry.word && (
                      <div className="text-[11px]" style={{ color: theme.muted }}>
                        <span className="font-semibold">原形：</span>
                        <span>{lookupEntry.lemma}</span>
                      </div>
                    )}
                    <div>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {isZh ? '释义：' : 'Meaning: '}
                      </span>
                      <span>{lookupEntry.meaning}</span>
                    </div>
                    {lookupEntry.usage && (
                      <div className="text-[11px]" style={{ color: theme.muted }}>
                        <span className="font-semibold">常见用法：</span>
                        <span>{lookupEntry.usage}</span>
                      </div>
                    )}
                    {lookupEntry.root && (
                      <div className="text-[11px]" style={{ color: theme.muted }}>
                        <span className="font-semibold">{isZh ? '词根 / 词源：' : 'Root: '}</span>
                        <span>{lookupEntry.root}</span>
                      </div>
                    )}
                    {lookupEntry.contextMeaning && (
                      <div className="rounded-xl p-2 text-[11px]" style={{ backgroundColor: theme.bg }}>
                        <span className="font-semibold">{isZh ? '本页语境：' : 'Context: '}</span>
                        <span>{lookupEntry.contextMeaning}</span>
                      </div>
                    )}
                    {lookupEntry.example && (
                      <div className="text-[11px] italic" style={{ color: theme.muted }}>
                        {isZh ? '例句：' : 'Example: '}
                        {lookupEntry.example}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 pt-2.5 text-[11px]" style={{ borderTop: `1px solid ${theme.border}` }}>
                {lookupEntry ? (
                  <button
                    type="button"
                    onClick={() => void handleSaveToVocabulary()}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 font-medium"
                    style={{ border: `1px solid ${theme.border}`, color: vocabSavedWord === lookupEntry.word ? theme.accent : theme.ink }}
                  >
                    <Check className="h-3 w-3" />
                    <span>{vocabSavedWord === lookupEntry.word ? '已存生词本' : '存生词本'}</span>
                  </button>
                ) : (
                  <span style={{ color: theme.muted }}>{isZh ? '轻点任意单词即查' : 'Tap any word'}</span>
                )}
                <button
                  type="button"
                  onClick={() => void handleExplainCurrentPage(`请结合本页讲解词条「${lookupWord}」以及所在段落的含义。`)}
                  className="inline-flex items-center gap-1 font-semibold text-emerald-600 hover:underline dark:text-emerald-400 cursor-pointer"
                >
                  <Sparkles className="h-3 w-3" />
                  <span>{isZh ? 'AI 精讲本页' : 'Explain page'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Subtle Toast */}
          {statusToast && (
            <div
              className="pointer-events-none absolute top-4 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-1.5 text-xs font-medium shadow-lg"
              style={{
                backgroundColor: theme.isDark ? '#2C2C2E' : '#1D1D1F',
                color: '#FFFFFF',
              }}
            >
              {statusToast}
            </div>
          )}
        </main>

        {/* Right-Side Unified ONE AI Side Sheet (AI 精讲 / 全书问答 / AI 总结) */}
        {pageAiOpen && (
          <aside
            className="absolute inset-y-0 right-0 z-40 flex w-[min(94vw,400px)] flex-col shadow-2xl lg:static lg:w-[390px] lg:shadow-none"
            style={{
              backgroundColor: theme.popoverBg,
              borderLeft: `1px solid ${theme.border}`,
              color: theme.ink,
            }}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${theme.border}` }}>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-500" />
                <div className="text-xs font-semibold">ONE AI 智能阅读</div>
              </div>
              <button
                type="button"
                onClick={() => setPageAiOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg cursor-pointer opacity-70 hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 3-Tab Switcher */}
            <div className="grid grid-cols-3 gap-1 px-3 py-2" style={{ borderBottom: `1px solid ${theme.border}` }}>
              {[
                { id: 'explain' as const, label: 'AI 精讲' },
                { id: 'qa' as const, label: '全书问答' },
                { id: 'summary' as const, label: 'AI 总结' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPageAiTab(t.id)}
                  className="cursor-pointer rounded-lg py-1.5 text-[11px] font-medium transition"
                  style={{
                    backgroundColor: pageAiTab === t.id ? theme.accent : 'transparent',
                    color: pageAiTab === t.id ? '#FFFFFF' : theme.muted,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3.5 text-xs leading-relaxed">
              {pageAiTab === 'summary' && (
                <div className="mb-3 grid grid-cols-3 gap-1.5">
                  <button type="button" disabled={pageAiLoading} onClick={() => void handleSummarize('paragraph')} className="cursor-pointer rounded-lg py-1.5 text-[11px] font-medium disabled:opacity-40" style={{ border: `1px solid ${theme.border}` }}>本段总结</button>
                  <button type="button" disabled={pageAiLoading} onClick={() => void handleSummarize('chapter')} className="cursor-pointer rounded-lg py-1.5 text-[11px] font-medium disabled:opacity-40" style={{ border: `1px solid ${theme.border}` }}>本章总结</button>
                  <button type="button" disabled={pageAiLoading} onClick={() => void handleSummarize('book')} className="cursor-pointer rounded-lg py-1.5 text-[11px] font-medium disabled:opacity-40" style={{ border: `1px solid ${theme.border}` }}>全书总结</button>
                </div>
              )}

              {pageAiLoading ? (
                <div className="flex flex-col items-center justify-center gap-2.5 py-12 text-center" style={{ color: theme.muted }}>
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                  <div>ONE AI 正在深入研读全书上下文…</div>
                </div>
              ) : pageAiError ? (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-rose-500">
                  <div>{pageAiError}</div>
                </div>
              ) : pageAiTab === 'explain' ? (
                <div className="whitespace-pre-wrap leading-7">
                  {pageAiAnswer || '点击下方按钮或选中段落，获取内容背景、核心观点、重点词汇、句式结构与难点精讲。'}
                </div>
              ) : pageAiTab === 'qa' ? (
                <div className="space-y-3">
                  {bookQaHistory.length === 0 && (
                    <p style={{ color: theme.muted }}>输入关于整本书的任意问题，ONE AI 将结合全书章节上下文作答。</p>
                  )}
                  {bookQaHistory.map((turn, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="rounded-xl px-3 py-2 font-medium" style={{ backgroundColor: theme.bg }}>问：{turn.q}</div>
                      <div className="whitespace-pre-wrap px-1 leading-7">{turn.a}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="whitespace-pre-wrap leading-7">
                  {summaryText || '选择上方「本段总结 / 本章总结 / 全书总结」一键生成结构化提要。'}
                </div>
              )}
            </div>

            {pageAiTab !== 'summary' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (pageAiLoading) return;
                  if (pageAiTab === 'qa') void handleBookQa(pageAiQuestion);
                  else void handleExplainCurrentPage(pageAiQuestion);
                }}
                className="p-3"
                style={{ borderTop: `1px solid ${theme.border}` }}
              >
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={pageAiQuestion}
                    onChange={(e) => setPageAiQuestion(e.target.value)}
                    placeholder={pageAiTab === 'qa' ? '结合全书向 ONE AI 提问…' : '针对当前内容继续追问…'}
                    className="h-9 flex-1 rounded-xl bg-transparent px-3 text-xs focus:outline-none"
                    style={{ border: `1px solid ${theme.border}`, color: theme.ink }}
                  />
                  <button
                    type="submit"
                    disabled={pageAiLoading}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white cursor-pointer hover:bg-emerald-500 disabled:opacity-40"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </form>
            )}
          </aside>
        )}
      </div>

      {/* ================================================================= */}
      {/* APPLE BOOKS BOTTOM SCRUBBER & PROGRESS BAR                        */}
      {/* ================================================================= */}
      <footer
        className="shrink-0 select-none px-4 py-2.5 sm:px-8"
        style={{
          backgroundColor: theme.chromeBg,
          borderTop: `1px solid ${theme.border}`,
          paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="mx-auto flex max-w-[1060px] flex-col gap-1.5">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <button
              type="button"
              disabled={effectiveLayout === 'scroll' ? chapterIndex === 0 : globalPageIndex <= 0}
              onClick={() => {
                if (effectiveLayout === 'scroll') {
                  setChapterIndex((c) => Math.max(0, c - 1));
                  setPageIndex(0);
                } else {
                  goPrevPage();
                }
              }}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium disabled:opacity-30 cursor-pointer shrink-0 transition hover:opacity-80"
              style={{ color: theme.ink }}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>{effectiveLayout === 'scroll' ? (isZh ? '上一章' : 'Prev Ch') : isZh ? '上一页' : 'Prev'}</span>
            </button>

            <input
              type="range"
              min={0}
              max={Math.max(0, flatBookPages.length - 1)}
              value={Math.min(globalPageIndex, Math.max(0, flatBookPages.length - 1))}
              onChange={(e) => jumpToGlobalPage(Number(e.target.value))}
              aria-label={isZh ? '全书翻页进度条' : 'Book page scrubber'}
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full"
              style={{
                accentColor: theme.accent,
                backgroundColor: theme.border,
              }}
            />

            {isAtEndOfBook ? (
              <button
                type="button"
                onClick={() => {
                  stopSpiritSpeech();
                  onClose();
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white cursor-pointer shrink-0 hover:bg-emerald-500"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>{isZh ? '读完返回' : 'Finish'}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={effectiveLayout === 'scroll' ? chapterIndex >= chapters.length - 1 : globalPageIndex >= flatBookPages.length - 1}
                onClick={() => {
                  if (effectiveLayout === 'scroll') {
                    setChapterIndex((c) => Math.min(chapters.length - 1, c + 1));
                    setPageIndex(0);
                  } else {
                    goNextPage();
                  }
                }}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium disabled:opacity-30 cursor-pointer shrink-0 transition hover:opacity-80"
                style={{ color: theme.ink }}
              >
                <span>{effectiveLayout === 'scroll' ? (isZh ? '下一章' : 'Next Ch') : isZh ? '下一页' : 'Next'}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div
            className="flex items-center justify-between text-[11px]"
            style={{ color: theme.muted }}
          >
            <span>
              {effectiveLayout === 'scroll'
                ? isZh
                  ? `第 ${chapterIndex + 1} / ${chapters.length} 章`
                  : `Chapter ${chapterIndex + 1} of ${chapters.length}`
                : isZh
                  ? `全书第 ${globalPageIndex + 1}${rightPage ? `–${Math.min(flatBookPages.length, globalPageIndex + 2)}` : ''} / ${flatBookPages.length} 页 · 第 ${chapterIndex + 1}/${chapters.length} 章`
                  : `Page ${globalPageIndex + 1}${rightPage ? `–${Math.min(flatBookPages.length, globalPageIndex + 2)}` : ''} of ${flatBookPages.length} · Ch ${chapterIndex + 1}/${chapters.length}`}
            </span>
            <span className="hidden sm:inline">
              {isZh ? `本章约剩 ${minutesLeftInChapter} 分钟` : `~${minutesLeftInChapter} min left in chapter`}
            </span>
            <span className="font-mono">{progressPercent}%</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default AppleBookReader;
