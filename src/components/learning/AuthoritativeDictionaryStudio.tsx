import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  BookmarkPlus,
  Check,
  History,
  Loader2,
  Search,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import type { Language } from '../../types/index.ts';

export interface DictionarySense {
  partOfSpeech: string;
  cefr?: string;
  guideword?: string;
  definitionEn: string;
  definitionZh?: string;
  examples: Array<{ en: string; zh?: string }>;
}

export interface DictionaryEntry {
  word: string;
  lemma: string;
  language: 'en' | 'ar' | 'zh' | 'other';
  cefrLevel?: string;
  ukPhonetic?: string;
  usPhonetic?: string;
  reading?: string;
  ukAudioUrl?: string;
  usAudioUrl?: string;
  audioUrl?: string;
  wordForms: string[];
  root?: string;
  etymology?: string;
  usageNote?: string;
  contextMeaning?: string;
  senses: DictionarySense[];
  collocations: Array<{ phrase: string; zh?: string }>;
  synonyms: string[];
  antonyms: string[];
  related: string[];
  sources: string[];
}

const HISTORY_KEY = 'earth_one_dict_history_v1';

const FEATURED_WORDS = [
  { word: 'serendipity', tag: 'C2 · 英语' },
  { word: 'resilient', tag: 'B2 · 英语' },
  { word: 'articulate', tag: 'C1 · 英语' },
  { word: 'eloquence', tag: 'C1 · 英语' },
  { word: 'حكمة', tag: '阿拉伯语 · 智慧' },
  { word: 'معرفة', tag: '阿拉伯语 · 知识' },
];

export const AuthoritativeDictionaryStudio: React.FC<{ lang: Language }> = ({ lang }) => {
  const isZh = lang === 'zh';
  const [query, setQuery] = useState('serendipity');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedWord, setSavedWord] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
    } catch {
      return [];
    }
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  const lookupWord = useCallback(async (rawTerm: string) => {
    const term = rawTerm.trim();
    if (!term) return;
    setQuery(term);
    setShowSuggestions(false);
    setLoading(true);
    setError(null);
    setSavedWord(null);
    try {
      const res = await fetch(`/api/dictionary/lookup?word=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (!res.ok || !data?.success || !data.entry) {
        throw new Error(data?.error || (isZh ? '词典查询失败，请重试。' : 'Lookup failed.'));
      }
      setEntry(data.entry as DictionaryEntry);
      setHistory((prev) => {
        const next = [term, ...prev.filter((w) => w.toLowerCase() !== term.toLowerCase())].slice(0, 12);
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    } catch (err: any) {
      setError(err?.message || (isZh ? '词典暂时无法连接，请稍后重试。' : 'Dictionary unavailable.'));
    } finally {
      setLoading(false);
    }
  }, [isZh]);

  // Initial load for immediate live dictionary richness
  useEffect(() => {
    void lookupWord('serendipity');
  }, [lookupWord]);

  // Instant autocomplete for English inputs
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2 || !/^[a-zA-Z'-]+$/.test(trimmed)) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/dictionary/suggest?q=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        if (data?.success && Array.isArray(data.suggestions)) {
          setSuggestions(data.suggestions);
        }
      } catch {
        setSuggestions([]);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onOutside = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, []);

  const playPronunciation = (text: string, audioUrl?: string, accent: 'en-GB' | 'en-US' | 'ar-SA' = 'en-US') => {
    if (audioUrl) {
      try {
        const audio = new Audio(audioUrl);
        void audio.play();
        return;
      } catch {}
    }
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = accent;
      utt.rate = 0.94;
      const voices = window.speechSynthesis.getVoices();
      const matched =
        voices.find((v) => v.lang.toLowerCase() === accent.toLowerCase()) ||
        voices.find((v) => v.lang.toLowerCase().startsWith(accent.slice(0, 2).toLowerCase()));
      if (matched) utt.voice = matched;
      window.speechSynthesis.speak(utt);
    } catch {}
  };

  const saveToVocabBank = async () => {
    if (!entry || saving) return;
    setSaving(true);
    try {
      const topSense = entry.senses[0];
      const meaning = [topSense?.definitionZh, topSense?.definitionEn].filter(Boolean).join(' · ') || entry.word;
      const example = topSense?.examples?.[0]
        ? `${topSense.examples[0].en}${topSense.examples[0].zh ? ` — ${topSense.examples[0].zh}` : ''}`
        : '';
      const res = await fetch('/api/library/vocabulary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: entry.word,
          lemma: entry.lemma,
          reading: entry.usPhonetic || entry.ukPhonetic || entry.reading || '',
          partOfSpeech: topSense?.partOfSpeech || '',
          meaning,
          usage: entry.usageNote || entry.collocations.map((c) => c.phrase).slice(0, 3).join(' / '),
          example,
          bookTitle: isZh ? '权威双解词典' : 'Cambridge Bilingual Dictionary',
        }),
      });
      if (res.ok) setSavedWord(entry.word);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Search Bar Card */}
      <section className="one-surface-elevated p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-one-accent)]">
              CAMBRIDGE BILINGUAL · MULTILINGUAL LEXICON API
            </p>
            <h2 className="mt-1 font-serif text-xl font-semibold text-[var(--color-one-text)]">
              {isZh ? '权威英汉 / 阿汉双解词典（剑桥标准）' : 'Authoritative Cambridge-Standard Dictionary'}
            </h2>
            <p className="mt-1 text-xs text-[var(--color-one-text-muted)]">
              {isZh
                ? '实时整合英美真人发音、CEFR 分级、词形变化、高频搭配、双语例句与词源解析，支持一键收入生词本。'
                : 'Live UK/US audio phonetics, CEFR levels, word forms, collocations, bilingual examples, and etymology.'}
            </p>
          </div>
        </div>

        <div ref={wrapRef} className="relative mt-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-one-text-dim)]" />
              <input
                type="text"
                value={query}
                onFocus={() => setShowSuggestions(true)}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void lookupWord(query);
                }}
                placeholder={isZh ? '输入英文单词、短语或阿拉伯语词汇（如 serendipity、eloquent、حكمة）…' : 'Search any English or Arabic word…'}
                className="w-full rounded-xl border border-[var(--color-one-border-strong)] bg-[var(--color-one-bg)] py-3 pl-10 pr-10 text-sm text-[var(--color-one-text)] placeholder:text-[var(--color-one-text-dim)] focus:border-[var(--color-one-accent)] focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setSuggestions([]);
                  }}
                  aria-label="Clear"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-one-text-dim)] hover:text-[var(--color-one-text)]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => void lookupWord(query)}
              disabled={loading || !query.trim()}
              className="inline-flex min-h-[46px] shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-[var(--color-one-accent)] px-5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-45"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span>{isZh ? '查词' : 'Lookup'}</span>
            </button>
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-xl border border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)] p-1.5 shadow-xl">
              {suggestions.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => void lookupWord(sug)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[var(--color-one-text)] hover:bg-[var(--color-one-surface-soft)]"
                >
                  <Search className="h-3.5 w-3.5 text-[var(--color-one-text-dim)]" />
                  <span>{sug}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick featured chips & recent history */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium text-[var(--color-one-text-dim)]">
            {isZh ? '精选词条' : 'Featured'}
          </span>
          {FEATURED_WORDS.map((item) => (
            <button
              key={item.word}
              type="button"
              onClick={() => void lookupWord(item.word)}
              className="cursor-pointer rounded-lg border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)] px-2.5 py-1 text-xs text-[var(--color-one-text)] transition hover:border-[var(--color-one-accent)] hover:text-[var(--color-one-accent)]"
            >
              <span className="font-medium">{item.word}</span>
              <span className="ml-1.5 text-[10px] text-[var(--color-one-text-dim)]">{item.tag}</span>
            </button>
          ))}
        </div>

        {history.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-one-text-dim)]">
              <History className="h-3 w-3" />
              {isZh ? '最近查询' : 'Recent'}
            </span>
            {history.slice(0, 8).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => void lookupWord(w)}
                className="cursor-pointer rounded-md px-2 py-0.5 text-[11px] text-[var(--color-one-text-muted)] hover:bg-[var(--color-one-surface-soft)] hover:text-[var(--color-one-text)]"
              >
                {w}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Error / Loading / Rich Dictionary Entry */}
      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-700 dark:text-rose-200">
          {error}
        </div>
      )}

      {loading && (
        <div className="one-surface flex items-center justify-center gap-2.5 py-14 text-sm text-[var(--color-one-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--color-one-accent)]" />
          <span>{isZh ? `正在查询权威词典「${query}」…` : `Looking up "${query}"…`}</span>
        </div>
      )}

      {!loading && entry && (
        <article className="one-surface overflow-hidden">
          {/* Headword & Phonetics Banner */}
          <div className="border-b border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)]/60 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3
                    dir={entry.language === 'ar' ? 'rtl' : 'ltr'}
                    className={`font-serif text-3xl font-bold tracking-tight text-[var(--color-one-text)] ${
                      entry.language === 'ar' ? 'text-4xl' : ''
                    }`}
                  >
                    {entry.word}
                  </h3>
                  {entry.cefrLevel && (
                    <span className="rounded-md border border-[var(--color-one-accent)]/35 bg-[var(--color-one-accent)]/12 px-2 py-0.5 text-[11px] font-bold tracking-wider text-[var(--color-one-accent)]">
                      CEFR {entry.cefrLevel}
                    </span>
                  )}
                  {entry.root && (
                    <span className="rounded-md border border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)] px-2 py-0.5 text-xs text-[var(--color-one-text-muted)]">
                      {isZh ? `词根 ${entry.root}` : `Root ${entry.root}`}
                    </span>
                  )}
                </div>

                {/* UK / US Pronunciation Controls */}
                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                  {entry.language === 'en' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => playPronunciation(entry.word, entry.ukAudioUrl || entry.audioUrl, 'en-GB')}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)] px-3 py-1.5 text-xs text-[var(--color-one-text)] transition hover:border-[var(--color-one-accent)]"
                      >
                        <Volume2 className="h-3.5 w-3.5 text-[var(--color-one-accent)]" />
                        <span className="font-semibold">UK</span>
                        <span className="font-mono text-[var(--color-one-text-muted)]">{entry.ukPhonetic || entry.reading || '/.../'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => playPronunciation(entry.word, entry.usAudioUrl || entry.audioUrl, 'en-US')}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)] px-3 py-1.5 text-xs text-[var(--color-one-text)] transition hover:border-[var(--color-one-accent)]"
                      >
                        <Volume2 className="h-3.5 w-3.5 text-[var(--color-one-accent)]" />
                        <span className="font-semibold">US</span>
                        <span className="font-mono text-[var(--color-one-text-muted)]">{entry.usPhonetic || entry.reading || '/.../'}</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => playPronunciation(entry.word, undefined, entry.language === 'ar' ? 'ar-SA' : 'en-US')}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)] px-3 py-1.5 text-xs text-[var(--color-one-text)] transition hover:border-[var(--color-one-accent)]"
                    >
                      <Volume2 className="h-3.5 w-3.5 text-[var(--color-one-accent)]" />
                      <span>{entry.reading || (isZh ? '朗读发音' : 'Listen')}</span>
                    </button>
                  )}
                </div>

                {entry.wordForms.length > 0 && (
                  <p className="mt-2.5 text-xs text-[var(--color-one-text-muted)]">
                    <span className="font-medium text-[var(--color-one-text-dim)]">{isZh ? '词形变化：' : 'Word forms: '}</span>
                    {entry.wordForms.join(' · ')}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => void saveToVocabBank()}
                disabled={saving}
                className={`inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold transition ${
                  savedWord === entry.word
                    ? 'bg-emerald-600 text-white'
                    : 'border border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)] text-[var(--color-one-text)] hover:border-[var(--color-one-accent)] hover:text-[var(--color-one-accent)]'
                }`}
              >
                {savedWord === entry.word ? <Check className="h-3.5 w-3.5" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
                <span>{savedWord === entry.word ? (isZh ? '已加入生词本' : 'Saved') : isZh ? '收入个人生词本' : 'Save Word'}</span>
              </button>
            </div>
          </div>

          {/* Senses + Side Info Grid */}
          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.45fr_0.85fr]">
            {/* Left: Numbered Cambridge-Style Bilingual Senses */}
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-one-text-dim)]">
                <BookOpen className="h-3.5 w-3.5 text-[var(--color-one-accent)]" />
                <span>{isZh ? '双解义项与地道例句' : 'Bilingual Definitions & Examples'}</span>
              </div>

              {entry.senses.length > 0 ? (
                <ol className="space-y-4">
                  {entry.senses.map((sense, idx) => (
                    <li
                      key={idx}
                      className="rounded-2xl border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)]/50 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-[var(--color-one-accent)]/15 text-[11px] font-bold text-[var(--color-one-accent)]">
                          {idx + 1}
                        </span>
                        <span className="rounded bg-[var(--color-one-accent)]/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--color-one-accent)]">
                          {sense.partOfSpeech}
                        </span>
                        {sense.cefr && (
                          <span className="rounded border border-[var(--color-one-border-strong)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-one-text-muted)]">
                            {sense.cefr}
                          </span>
                        )}
                        {sense.guideword && (
                          <span className="text-xs font-semibold text-[var(--color-one-text)]">
                            【{sense.guideword}】
                          </span>
                        )}
                      </div>

                      {sense.definitionZh && (
                        <p className="mt-2.5 text-[15px] font-medium leading-relaxed text-[var(--color-one-text)]">
                          {sense.definitionZh}
                        </p>
                      )}
                      {sense.definitionEn && (
                        <p className="mt-1 text-xs leading-relaxed text-[var(--color-one-text-muted)]">
                          {sense.definitionEn}
                        </p>
                      )}

                      {sense.examples.length > 0 && (
                        <div className="mt-3 space-y-2 border-l-2 border-[var(--color-one-accent)]/40 pl-3">
                          {sense.examples.map((ex, exIdx) => (
                            <div key={exIdx} className="group flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p
                                  dir={entry.language === 'ar' ? 'rtl' : 'ltr'}
                                  className="text-xs leading-relaxed text-[var(--color-one-text)]"
                                >
                                  {ex.en}
                                </p>
                                {ex.zh && (
                                  <p className="mt-0.5 text-[11px] text-[var(--color-one-text-muted)]">
                                    {ex.zh}
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  playPronunciation(
                                    ex.en,
                                    undefined,
                                    entry.language === 'ar' ? 'ar-SA' : 'en-US'
                                  )
                                }
                                title={isZh ? '朗读例句' : 'Listen to example'}
                                className="shrink-0 cursor-pointer rounded-lg p-1 text-[var(--color-one-text-dim)] hover:bg-[var(--color-one-surface)] hover:text-[var(--color-one-accent)]"
                              >
                                <Volume2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-[var(--color-one-text-muted)]">
                  {isZh ? '未找到精确释义，请检查拼写后重试。' : 'No definitions found.'}
                </p>
              )}
            </div>

            {/* Right: Collocations, Usage Note, Etymology, Synonyms/Antonyms */}
            <div className="space-y-4">
              {entry.collocations.length > 0 && (
                <div className="rounded-2xl border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)]/50 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-one-accent)]">
                    {isZh ? '高频搭配 Collocations' : 'Collocations'}
                  </h4>
                  <ul className="mt-2.5 space-y-2 text-xs">
                    {entry.collocations.map((col, idx) => (
                      <li key={idx} className="flex items-start justify-between gap-2">
                        <span className="font-medium text-[var(--color-one-text)]">{col.phrase}</span>
                        {col.zh && <span className="shrink-0 text-[var(--color-one-text-muted)]">{col.zh}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {entry.usageNote && (
                <div className="rounded-2xl border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)]/50 p-4">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-one-text)]">
                    <Sparkles className="h-3.5 w-3.5 text-[var(--color-one-accent)]" />
                    <span>{isZh ? '用法与语域辨析' : 'Usage Note'}</span>
                  </h4>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--color-one-text-muted)]">
                    {entry.usageNote}
                  </p>
                </div>
              )}

              {entry.etymology && (
                <div className="rounded-2xl border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)]/50 p-4">
                  <h4 className="text-xs font-semibold text-[var(--color-one-text)]">
                    {isZh ? '词源解析 Etymology' : 'Etymology'}
                  </h4>
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-one-text-muted)]">
                    {entry.etymology}
                  </p>
                </div>
              )}

              {(entry.synonyms.length > 0 || entry.antonyms.length > 0 || entry.related.length > 0) && (
                <div className="rounded-2xl border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)]/50 p-4 space-y-3">
                  {entry.synonyms.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--color-one-text-dim)]">
                        {isZh ? '近义词 Synonyms' : 'Synonyms'}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {entry.synonyms.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => void lookupWord(s)}
                            className="cursor-pointer rounded-lg border border-[var(--color-one-border)] bg-[var(--color-one-surface)] px-2 py-0.5 text-[11px] text-[var(--color-one-text)] hover:border-[var(--color-one-accent)] hover:text-[var(--color-one-accent)]"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {entry.antonyms.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--color-one-text-dim)]">
                        {isZh ? '反义词 Antonyms' : 'Antonyms'}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {entry.antonyms.map((a) => (
                          <button
                            key={a}
                            type="button"
                            onClick={() => void lookupWord(a)}
                            className="cursor-pointer rounded-lg border border-[var(--color-one-border)] bg-[var(--color-one-surface)] px-2 py-0.5 text-[11px] text-[var(--color-one-text-muted)] hover:border-rose-400 hover:text-rose-500"
                          >
                            {a}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {entry.related.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--color-one-text-dim)]">
                        {isZh ? '联想拓展词汇' : 'Related Terms'}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {entry.related.map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => void lookupWord(r)}
                            className="cursor-pointer rounded-lg border border-[var(--color-one-border)] bg-[var(--color-one-surface)] px-2 py-0.5 text-[11px] text-[var(--color-one-text-muted)] hover:border-[var(--color-one-accent)] hover:text-[var(--color-one-accent)]"
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </article>
      )}
    </div>
  );
};
