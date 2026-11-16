import React, { useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  Flame,
  GraduationCap,
  Headphones,
  Mic,
  MicOff,
  RotateCcw,
  Search,
  Sparkles,
  Volume2,
  Globe,
  RefreshCw,
} from 'lucide-react';
import type { Language } from '../../types/index.ts';
import { readAIStream } from '../../utils/aiStream.ts';
import { getStudyStreak, localDayKey } from './arabicLearning.ts';
import {
  createEnglishDailyQueue,
  EMPTY_ENGLISH_STUDY_STATE,
  ENGLISH_CORE_WORDS,
  ENGLISH_PHONEMES,
  ENGLISH_READING_PASSAGES,
  ENGLISH_SHADOWING_SENTENCES,
  evaluateShadowingMatch,
  parseEnglishStudyState,
  scheduleEnglishCard,
  type EnglishAccent,
  type EnglishLookupResult,
  type EnglishReviewRating,
  type EnglishStudyState,
} from './englishEngine.ts';

const EN_STORAGE_KEY = 'earth_one_english_learning_v1';
const DAILY_EN_NEW_LIMIT = 5;
const DAILY_EN_GOAL = 5;

function readSavedEnglishState(): EnglishStudyState {
  if (typeof window === 'undefined') return { ...EMPTY_ENGLISH_STUDY_STATE, cards: {}, studyDays: [] };
  try {
    return parseEnglishStudyState(window.localStorage.getItem(EN_STORAGE_KEY));
  } catch {
    return { ...EMPTY_ENGLISH_STUDY_STATE, cards: {}, studyDays: [] };
  }
}

export const EnglishLearningSection: React.FC<{ lang: Language }> = ({ lang }) => {
  const isZh = lang === 'zh';
  const [accent, setAccent] = useState<EnglishAccent>('en-US');
  const [study, setStudy] = useState<EnglishStudyState>(readSavedEnglishState);
  const [subMode, setSubMode] = useState<'engine' | 'practice' | 'phonetics' | 'reading'>('engine');

  // Dictionary & Phonetics Engine state
  const [lookupInput, setLookupInput] = useState('resilient');
  const [lookupResult, setLookupResult] = useState<EnglishLookupResult | null>(() => {
    const core = ENGLISH_CORE_WORDS[0];
    return {
      word: core.word,
      phonetic: core.ipaUs,
      meanings: [
        {
          partOfSpeech: core.pos,
          definitions: [{ definition: `${core.meaningEn} (${core.meaningZh})`, example: core.exampleEn }],
        },
      ],
      related: core.collocations,
      source: 'fallback',
    };
  });
  const [lookupLoading, setLookupLoading] = useState(false);

  // AI Syntax / Expression Coach Engine state
  const [coachInput, setCoachInput] = useState('How do we keep systems resilient under pressure?');
  const [coachOutput, setCoachOutput] = useState('');
  const [coachLoading, setCoachLoading] = useState(false);

  // Shadowing / Pronunciation Evaluation Engine state
  const [shadowIdx, setShadowIdx] = useState(0);
  const [isListeningShadow, setIsListeningShadow] = useState(false);
  const [shadowTranscript, setShadowTranscript] = useState('');
  const [shadowResult, setShadowResult] = useState<{
    score: number;
    matchedWords: string[];
    missedWords: string[];
  } | null>(null);
  const shadowRecRef = useRef<any>(null);

  // Vocabulary Spaced-Repetition Practice state
  const [queue, setQueue] = useState<string[]>(() =>
    createEnglishDailyQueue(readSavedEnglishState(), Date.now(), DAILY_EN_NEW_LIMIT)
  );
  const [queueIndex, setQueueIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);

  // Live Wikipedia Corpus Reader state
  const [selectedPassageIdx, setSelectedPassageIdx] = useState(0);
  const [liveWikiArticle, setLiveWikiArticle] = useState<{
    title: string;
    description: string;
    extract: string;
    sourceUrl?: string;
  } | null>(null);
  const [wikiTopic, setWikiTopic] = useState('Cosmology');
  const [wikiLoading, setWikiLoading] = useState(false);

  const persistStudy = (updater: (prev: EnglishStudyState) => EnglishStudyState) => {
    setStudy((prev) => {
      const next = updater(prev);
      try {
        window.localStorage.setItem(EN_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const speakEnglish = (text: string, audioUrl?: string) => {
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
      utt.rate = 0.96;
      const voices = window.speechSynthesis.getVoices();
      const match =
        voices.find((v) => v.lang.toLowerCase() === accent.toLowerCase()) ||
        voices.find((v) => /^en([_-]|$)/i.test(v.lang));
      if (match) utt.voice = match;
      window.speechSynthesis.speak(utt);
    } catch {}
  };

  const runWordLookup = async (rawTerm?: string) => {
    const term = (rawTerm ?? lookupInput).trim().toLowerCase().replace(/[^a-z'-]/g, '');
    if (!term) return;
    setLookupInput(term);
    setLookupLoading(true);
    try {
      const res = await fetch(`/api/learning/english/lookup?word=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (data?.success && data.entry) {
        const entry = data.entry as EnglishLookupResult;
        if (entry.meanings.length === 0) {
          const localMatch = ENGLISH_CORE_WORDS.find((w) => w.word.toLowerCase() === term);
          if (localMatch) {
            setLookupResult({
              word: localMatch.word,
              phonetic: accent === 'en-GB' ? localMatch.ipaUk : localMatch.ipaUs,
              meanings: [
                {
                  partOfSpeech: localMatch.pos,
                  definitions: [
                    {
                      definition: `${localMatch.meaningEn}（${localMatch.meaningZh}）`,
                      example: localMatch.exampleEn,
                    },
                  ],
                },
              ],
              related: localMatch.collocations,
              source: 'fallback',
            });
            return;
          }
        }
        setLookupResult(entry);
      }
    } catch {
      const localMatch = ENGLISH_CORE_WORDS.find((w) => w.word.toLowerCase() === term);
      if (localMatch) {
        setLookupResult({
          word: localMatch.word,
          phonetic: accent === 'en-GB' ? localMatch.ipaUk : localMatch.ipaUs,
          meanings: [
            {
              partOfSpeech: localMatch.pos,
              definitions: [
                {
                  definition: `${localMatch.meaningEn}（${localMatch.meaningZh}）`,
                  example: localMatch.exampleEn,
                },
              ],
            },
          ],
          related: localMatch.collocations,
          source: 'fallback',
        });
      }
    } finally {
      setLookupLoading(false);
    }
  };

  const runCoachAnalysis = async (modeType: 'syntax' | 'rewrite' | 'dialogue') => {
    const input = coachInput.trim();
    if (!input || coachLoading) return;
    setCoachLoading(true);
    setCoachOutput('');

    const promptByType: Record<typeof modeType, string> = {
      syntax: isZh
        ? `请作为专业英语语言引擎，剖析这句话的语法结构、核心词组、音标重音与自然中文释义：「${input}」`
        : `Analyze the grammar structure, key collocations, and natural nuance of: "${input}"`,
      rewrite: isZh
        ? `请将下面内容改写为 3 种更地道的英语表达（日常、学术、商务），并附简明中文解析：「${input}」`
        : `Rewrite the following into 3 natural English registers (casual, academic, executive) with concise notes: "${input}"`,
      dialogue: isZh
        ? `请基于这句话发起一段两轮纯正英语情境对话，并在每句英文后给出精简中文翻译：「${input}」`
        : `Continue a concise, natural two-turn English dialogue based on: "${input}"`,
    };

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptByType[modeType],
          mode: 'tutor',
          stream: true,
        }),
      });
      let acc = '';
      await readAIStream(res, (delta) => {
        acc += delta;
        setCoachOutput(acc);
      });
      if (!acc.trim()) {
        setCoachOutput(isZh ? '已收到内容，请稍后再试一次。' : 'Analysis unavailable, please retry.');
      }
    } catch {
      setCoachOutput(isZh ? '英语解析引擎连接波动，请再试一次。' : 'Engine connection interrupted.');
    } finally {
      setCoachLoading(false);
    }
  };

  const toggleShadowingMic = () => {
    if (isListeningShadow) {
      try {
        shadowRecRef.current?.stop?.();
      } catch {}
      setIsListeningShadow(false);
      return;
    }

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setShadowTranscript(
        isZh ? '当前浏览器不支持英语语音评测识别（建议使用 Chrome / Safari）。' : 'Speech recognition unsupported in this browser.'
      );
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = accent;
      rec.continuous = false;
      rec.interimResults = true;
      setShadowTranscript('');
      setShadowResult(null);
      setIsListeningShadow(true);

      const target = ENGLISH_SHADOWING_SENTENCES[shadowIdx].en;

      rec.onresult = (e: any) => {
        let text = '';
        for (let i = 0; i < e.results.length; i++) {
          text += e.results[i][0].transcript + ' ';
        }
        const cleaned = text.trim();
        setShadowTranscript(cleaned);
        if (cleaned) {
          setShadowResult(evaluateShadowingMatch(target, cleaned));
        }
      };

      rec.onerror = () => {
        setIsListeningShadow(false);
      };

      rec.onend = () => {
        setIsListeningShadow(false);
      };

      shadowRecRef.current = rec;
      rec.start();
    } catch {
      setIsListeningShadow(false);
    }
  };

  const fetchWikiArticle = async () => {
    const topic = wikiTopic.trim() || 'Astronomy';
    setWikiLoading(true);
    try {
      const res = await fetch(`/api/learning/english/reading?topic=${encodeURIComponent(topic)}`);
      const data = await res.json();
      if (data?.success && data.article) {
        setLiveWikiArticle(data.article);
      }
    } catch {
    } finally {
      setWikiLoading(false);
    }
  };

  const now = new Date();
  const today = localDayKey(now);
  const practicedToday = Object.values(study.cards).filter(
    (card) => card.lastReviewedAt?.slice(0, 10) === today
  ).length;
  const masteredCount = Object.values(study.cards).filter((c) => c.repetitions >= 2).length;
  const dueCount = Object.values(study.cards).filter((c) => c.dueAt <= Date.now()).length;
  const streak = getStudyStreak(study.studyDays, now);
  const goalProgress = Math.min(100, Math.round((practicedToday / DAILY_EN_GOAL) * 100));

  const activeWord = useMemo(
    () => ENGLISH_CORE_WORDS.find((w) => w.id === queue[queueIndex]) || ENGLISH_CORE_WORDS[0],
    [queue, queueIndex]
  );

  const startVocabularyPractice = () => {
    const nextQueue = createEnglishDailyQueue(study, Date.now(), DAILY_EN_NEW_LIMIT);
    setQueue(nextQueue);
    setQueueIndex(0);
    setRevealed(false);
    setSessionDone(false);
    setSubMode('practice');
  };

  const rateEnglishWord = (rating: EnglishReviewRating) => {
    if (!activeWord) return;
    const timestamp = Date.now();
    persistStudy((prev) => {
      const updatedCard = scheduleEnglishCard(prev.cards[activeWord.id], rating, timestamp);
      const nextDays = new Set([...prev.studyDays, localDayKey(new Date(timestamp))]);
      return {
        version: 1,
        cards: { ...prev.cards, [activeWord.id]: updatedCard },
        studyDays: [...nextDays].sort(),
      };
    });
    if (queueIndex + 1 < queue.length) {
      setQueueIndex((i) => i + 1);
      setRevealed(false);
    } else {
      setSessionDone(true);
    }
  };

  const currentPassage = ENGLISH_READING_PASSAGES[selectedPassageIdx];

  return (
    <div className="space-y-5">
      {/* Top Engine Sub-navigation + Accent Toggle */}
      <div className="one-surface flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'engine', label: isZh ? '实时英语引擎 (词典 / 句法 / 跟读)' : 'Live English Engine' },
            { id: 'practice', label: isZh ? '核心词汇间隔记忆' : 'Vocabulary SRS' },
            { id: 'phonetics', label: isZh ? '国际音标发音矩阵' : 'IPA Phonetics' },
            { id: 'reading', label: isZh ? '双语精读与点词查义' : 'Parallel Reading' },
          ].map((item) => {
            const active = subMode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSubMode(item.id as any)}
                className="rounded-xl px-3.5 py-2 text-xs font-medium transition-all cursor-pointer"
                style={
                  active
                    ? {
                        color: 'var(--color-one-accent)',
                        background: 'rgba(127,212,255,0.14)',
                        border: '1px solid rgba(127,212,255,0.32)',
                      }
                    : {
                        color: 'var(--color-one-text-muted)',
                        background: 'transparent',
                        border: '1px solid transparent',
                      }
                }
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="text-[11px] text-[color:var(--color-one-text-dim)]">
            {isZh ? '发音引擎' : 'Accent'}
          </span>
          <div className="inline-flex rounded-xl border p-0.5" style={{ borderColor: 'var(--color-one-border)' }}>
            {([
              ['en-US', 'US 美式'],
              ['en-GB', 'UK 英式'],
            ] as const).map(([code, label]) => (
              <button
                key={code}
                type="button"
                onClick={() => setAccent(code)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                  accent === code
                    ? 'bg-[#8ECFFF]/20 text-[#8ECFFF]'
                    : 'text-[color:var(--color-one-text-dim)] hover:text-[color:var(--color-one-text)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MODE 1: LIVE ENGLISH ENGINE */}
      {subMode === 'engine' && (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Left: Real Online Dictionary + Phonetics + Shadowing Speech Engine */}
          <div className="space-y-5">
            <section className="one-surface p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--color-one-accent)' }}>
                    LEXICON & PHONETICS ENGINE
                  </p>
                  <h2 className="mt-0.5 text-lg font-semibold text-[color:var(--color-one-text)]">
                    {isZh ? '实时英语词典与真人发音引擎' : 'Live English Dictionary & Phonetics'}
                  </h2>
                </div>
                <BookOpen className="h-5 w-5" style={{ color: 'var(--color-one-accent)' }} />
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-one-text-dim)]" />
                  <input
                    type="text"
                    value={lookupInput}
                    onChange={(e) => setLookupInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void runWordLookup();
                    }}
                    placeholder={isZh ? '输入英文单词查询音标、释义与联想词...' : 'Look up any English word...'}
                    className="w-full rounded-xl border bg-[color:var(--color-one-surface-soft)] py-2.5 pl-9 pr-3 text-sm text-[color:var(--color-one-text)] focus:border-[#8ECFFF]/60 focus:outline-none"
                    style={{ borderColor: 'var(--color-one-border)' }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void runWordLookup()}
                  disabled={lookupLoading}
                  className="one-btn one-btn-md one-btn-primary shrink-0"
                >
                  {lookupLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <span>{isZh ? '查询' : 'Lookup'}</span>}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {['resilient', 'serendipity', 'articulate', 'synthesis', 'equilibrium', 'ubiquitous'].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => void runWordLookup(sample)}
                    className="rounded-lg border px-2 py-1 text-[11px] text-[color:var(--color-one-text-muted)] hover:border-[#8ECFFF]/45 hover:text-[#8ECFFF] cursor-pointer"
                    style={{ borderColor: 'var(--color-one-border)' }}
                  >
                    {sample}
                  </button>
                ))}
              </div>

              {lookupResult && (
                <div className="mt-4 rounded-xl border p-4" style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.02)' }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-baseline gap-3">
                      <span className="text-xl font-semibold text-[color:var(--color-one-text)]">{lookupResult.word}</span>
                      {lookupResult.phonetic && (
                        <span className="font-mono text-xs text-[#8ECFFF]">{lookupResult.phonetic}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => speakEnglish(lookupResult.word, lookupResult.audioUrl)}
                      className="one-btn one-btn-sm one-btn-secondary"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                      <span>{accent === 'en-GB' ? 'UK 朗读' : 'US 朗读'}</span>
                    </button>
                  </div>

                  {lookupResult.meanings.length > 0 ? (
                    <div className="mt-3 space-y-2.5 text-xs">
                      {lookupResult.meanings.map((m, idx) => (
                        <div key={idx} className="space-y-1">
                          <span className="inline-block rounded bg-[#C4A876]/15 px-1.5 py-0.5 font-mono text-[10px] text-[#E5C17D]">
                            {m.partOfSpeech}
                          </span>
                          {m.definitions.map((d, dIdx) => (
                            <div key={dIdx} className="pl-1">
                              <p className="text-[color:var(--color-one-text-muted)] leading-relaxed">• {d.definition}</p>
                              {d.example && (
                                <p className="mt-0.5 italic text-[color:var(--color-one-text-dim)]">“{d.example}”</p>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-[color:var(--color-one-text-dim)]">
                      {isZh ? '未检索到该词标准词条，可点击下方关联词或使用右侧 AI 引擎解析。' : 'No exact lexicon entry found.'}
                    </p>
                  )}

                  {lookupResult.related.length > 0 && (
                    <div className="mt-3 border-t pt-2.5" style={{ borderColor: 'var(--color-one-border)' }}>
                      <span className="text-[10px] uppercase tracking-wider text-[color:var(--color-one-text-dim)]">
                        {isZh ? '关联拓展词：' : 'Related: '}
                      </span>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {lookupResult.related.map((rel) => (
                          <button
                            key={rel}
                            type="button"
                            onClick={() => void runWordLookup(rel)}
                            className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[11px] text-[#B8E2FF] hover:bg-[#8ECFFF]/20 cursor-pointer"
                          >
                            {rel}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Oral Shadowing & Pronunciation Scoring Engine */}
            <section className="one-surface p-5 sm:p-6">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--color-one-success)' }}>
                    ORAL SHADOWING ENGINE
                  </p>
                  <h2 className="mt-0.5 text-lg font-semibold text-[color:var(--color-one-text)]">
                    {isZh ? '英语听力跟读与发音匹配评测' : 'English Shadowing & Speech Scoring'}
                  </h2>
                </div>
                <Headphones className="h-5 w-5" style={{ color: 'var(--color-one-success)' }} />
              </div>

              <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.02)' }}>
                <p className="text-sm font-medium leading-relaxed text-[color:var(--color-one-text)]">
                  {ENGLISH_SHADOWING_SENTENCES[shadowIdx].en}
                </p>
                <p className="mt-1.5 text-xs text-[color:var(--color-one-text-dim)]">
                  {ENGLISH_SHADOWING_SENTENCES[shadowIdx].zh}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => speakEnglish(ENGLISH_SHADOWING_SENTENCES[shadowIdx].en)}
                    className="one-btn one-btn-sm one-btn-secondary"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                    <span>{isZh ? '示范朗读' : 'Play Model'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={toggleShadowingMic}
                    className={`one-btn one-btn-sm ${isListeningShadow ? 'bg-rose-500/20 border border-rose-500/45 text-rose-300' : 'one-btn-primary'}`}
                  >
                    {isListeningShadow ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                    <span>{isListeningShadow ? (isZh ? '停止识别' : 'Stop') : (isZh ? '跟读评测' : 'Speak & Score')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShadowIdx((i) => (i + 1) % ENGLISH_SHADOWING_SENTENCES.length);
                      setShadowTranscript('');
                      setShadowResult(null);
                    }}
                    className="one-btn one-btn-sm one-btn-ghost ml-auto"
                  >
                    <span>{isZh ? '换一句' : 'Next'}</span>
                  </button>
                </div>

                {shadowTranscript && (
                  <div className="mt-3 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--color-one-border)' }}>
                    <p className="text-[color:var(--color-one-text-muted)]">
                      {isZh ? '识别结果：' : 'Recognized: '}
                      <span className="text-[color:var(--color-one-text)]">{shadowTranscript}</span>
                    </p>
                    {shadowResult && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-3">
                        <span className="font-semibold text-[#4CC38A]">
                          {isZh ? `完整匹配度：${shadowResult.score}%` : `Match Score: ${shadowResult.score}%`}
                        </span>
                        {shadowResult.missedWords.length > 0 && (
                          <span className="text-[11px] text-[#E5C17D]">
                            {isZh ? '可加强重读：' : 'Practice: '}
                            {shadowResult.missedWords.slice(0, 5).join(', ')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Right: AI Syntax, Natural Rewrite & Bilingual Coach Engine */}
          <section className="one-surface-elevated flex flex-col justify-between p-5 sm:p-6">
            <div>
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--color-one-gold)' }}>
                    AI ENGLISH COACH ENGINE
                  </p>
                  <h2 className="mt-0.5 text-lg font-semibold text-[color:var(--color-one-text)]">
                    {isZh ? '英语语法精析、地道改写与场景对话引擎' : 'Syntax Analyzer, Rewrite & Dialogue Engine'}
                  </h2>
                </div>
                <Sparkles className="h-5 w-5" style={{ color: 'var(--color-one-gold)' }} />
              </div>

              <textarea
                rows={4}
                value={coachInput}
                onChange={(e) => setCoachInput(e.target.value)}
                placeholder={isZh ? '输入英文长难句或中文想法，由英语引擎进行语法剖析或地道改写...' : 'Enter English text or an idea to analyze...'}
                className="w-full rounded-xl border bg-[color:var(--color-one-surface-soft)] p-3.5 text-sm text-[color:var(--color-one-text)] focus:border-[rgba(215,182,118,0.5)] focus:outline-none"
                style={{ borderColor: 'var(--color-one-border)' }}
              />

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={coachLoading}
                  onClick={() => void runCoachAnalysis('syntax')}
                  className="one-btn one-btn-sm one-btn-primary"
                >
                  <span>{isZh ? '句法与重音精析' : 'Syntax Breakdown'}</span>
                </button>
                <button
                  type="button"
                  disabled={coachLoading}
                  onClick={() => void runCoachAnalysis('rewrite')}
                  className="one-btn one-btn-sm one-btn-secondary"
                >
                  <span>{isZh ? '地道分级改写' : 'Native Rewrite'}</span>
                </button>
                <button
                  type="button"
                  disabled={coachLoading}
                  onClick={() => void runCoachAnalysis('dialogue')}
                  className="one-btn one-btn-sm one-btn-secondary"
                >
                  <span>{isZh ? '情境英语对练' : 'Dialogue Practice'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => speakEnglish(coachInput)}
                  className="one-btn one-btn-sm one-btn-ghost ml-auto"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  <span>{isZh ? '朗读输入' : 'Speak'}</span>
                </button>
              </div>
            </div>

            <div
              className="mt-4 min-h-[220px] flex-1 rounded-xl border p-4 text-xs leading-relaxed text-[color:var(--color-one-text-muted)] whitespace-pre-wrap"
              style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.02)' }}
            >
              {coachLoading && !coachOutput ? (
                <span className="inline-flex items-center gap-2 text-[#8ECFFF]">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  {isZh ? '英语学习引擎正在深度解析中…' : 'Analyzing with English Engine…'}
                </span>
              ) : coachOutput ? (
                coachOutput
              ) : (
                isZh
                  ? '点击上方「句法与重音精析」、「地道分级改写」或「情境英语对练」，即可启动英语深度学习引擎。'
                  : 'Select Syntax Breakdown, Native Rewrite, or Dialogue Practice to run the English learning engine.'
              )}
            </div>
          </section>
        </div>
      )}

      {/* MODE 2: VOCABULARY SPACED REPETITION */}
      {subMode === 'practice' && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="one-surface p-4">
              <div className="mb-2 flex items-center gap-2 text-xs text-[color:var(--color-one-text-dim)]">
                <GraduationCap className="h-4 w-4 text-[#8ECFFF]" />
                <span>{isZh ? '核心词库' : 'Core Deck'}</span>
              </div>
              <div className="text-2xl font-semibold tabular-nums">{Object.keys(study.cards).length}/{ENGLISH_CORE_WORDS.length}</div>
            </div>
            <div className="one-surface p-4">
              <div className="mb-2 flex items-center gap-2 text-xs text-[color:var(--color-one-text-dim)]">
                <RotateCcw className="h-4 w-4 text-[#E5C17D]" />
                <span>{isZh ? '待复习' : 'Due'}</span>
              </div>
              <div className="text-2xl font-semibold tabular-nums">{dueCount}</div>
            </div>
            <div className="one-surface p-4">
              <div className="mb-2 flex items-center gap-2 text-xs text-[color:var(--color-one-text-dim)]">
                <Flame className="h-4 w-4 text-amber-400" />
                <span>{isZh ? '连续学习' : 'Streak'}</span>
              </div>
              <div className="text-2xl font-semibold tabular-nums">{streak}</div>
            </div>
            <div className="one-surface p-4">
              <div className="mb-2 flex items-center gap-2 text-xs text-[color:var(--color-one-text-dim)]">
                <Check className="h-4 w-4 text-emerald-400" />
                <span>{isZh ? '已掌握' : 'Mastered'}</span>
              </div>
              <div className="text-2xl font-semibold tabular-nums">{masteredCount}/{ENGLISH_CORE_WORDS.length}</div>
            </div>
          </div>

          <section className="one-surface-elevated mx-auto max-w-2xl overflow-hidden p-6 text-center sm:p-8">
            <div className="mb-4 flex items-center justify-between text-xs text-[color:var(--color-one-text-dim)]">
              <span>{isZh ? `今日目标 ${practicedToday}/${DAILY_EN_GOAL} (${goalProgress}%)` : `Daily Goal ${practicedToday}/${DAILY_EN_GOAL}`}</span>
              <span>{queueIndex + 1} / {queue.length}</span>
            </div>

            {sessionDone ? (
              <div className="py-6">
                <h3 className="text-xl font-semibold text-[color:var(--color-one-text)]">
                  {isZh ? '本轮英语记忆复习已完成' : 'English Review Complete'}
                </h3>
                <p className="mt-2 text-xs text-[color:var(--color-one-text-muted)]">
                  {isZh ? '遗忘曲线已自动更新下次最佳复习时间。' : 'Spaced repetition intervals saved locally.'}
                </p>
                <button type="button" onClick={startVocabularyPractice} className="one-btn one-btn-md one-btn-primary mt-5">
                  {isZh ? '再巩固一轮' : 'Review Another Round'}
                </button>
              </div>
            ) : (
              <div>
                <span className="one-badge one-badge-gold">{activeWord.level} · {activeWord.pos}</span>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-[color:var(--color-one-text)] sm:text-3xl">
                  {activeWord.word}
                </h3>
                <p className="mt-1.5 font-mono text-sm text-[#8ECFFF]">
                  {accent === 'en-GB' ? activeWord.ipaUk : activeWord.ipaUs}
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => speakEnglish(activeWord.word)}
                    className="one-btn one-btn-sm one-btn-secondary"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                    <span>{isZh ? '听发音' : 'Pronounce'}</span>
                  </button>
                  {!revealed && (
                    <button
                      type="button"
                      onClick={() => setRevealed(true)}
                      className="one-btn one-btn-sm one-btn-primary"
                    >
                      {isZh ? '显示释义与例句' : 'Reveal Meaning'}
                    </button>
                  )}
                </div>

                {revealed && (
                  <div className="mt-6 space-y-4 text-left border-t pt-5" style={{ borderColor: 'var(--color-one-border)' }}>
                    <div>
                      <p className="text-base font-medium text-[color:var(--color-one-text)]">{activeWord.meaningZh}</p>
                      <p className="mt-1 text-xs text-[color:var(--color-one-text-muted)]">{activeWord.meaningEn}</p>
                    </div>
                    <div className="rounded-xl border p-3 text-xs" style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.02)' }}>
                      <p className="text-[color:var(--color-one-text)]">{activeWord.exampleEn}</p>
                      <p className="mt-1 text-[color:var(--color-one-text-dim)]">{activeWord.exampleZh}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {activeWord.collocations.map((col) => (
                        <span key={col} className="rounded-md bg-white/[0.05] px-2 py-1 text-[11px] text-[#B8E2FF]">
                          {col}
                        </span>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-4">
                      {([
                        ['again', isZh ? '忘记了' : 'Again', 'border-rose-400/35 bg-rose-500/12 text-rose-300'],
                        ['hard', isZh ? '模糊' : 'Hard', 'border-amber-400/35 bg-amber-500/12 text-amber-300'],
                        ['good', isZh ? '记住了' : 'Good', 'border-sky-400/35 bg-sky-500/12 text-sky-300'],
                        ['easy', isZh ? '很熟练' : 'Easy', 'border-emerald-400/35 bg-emerald-500/12 text-emerald-300'],
                      ] as const).map(([rating, label, cls]) => (
                        <button
                          key={rating}
                          type="button"
                          onClick={() => rateEnglishWord(rating)}
                          className={`min-h-10 rounded-xl border px-2 py-2 text-xs font-semibold cursor-pointer hover:opacity-90 ${cls}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {/* MODE 3: IPA PHONETICS */}
      {subMode === 'phonetics' && (
        <section className="one-surface p-5 sm:p-6">
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--color-one-accent)' }}>
              IPA PHONETIC ENGINE
            </p>
            <h2 className="mt-0.5 text-lg font-semibold text-[color:var(--color-one-text)]">
              {isZh ? '英语核心音标发音矩阵（点击例词即时示范）' : 'English IPA Phonetics Matrix'}
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ENGLISH_PHONEMES.map((ph) => (
              <button
                key={ph.symbol}
                type="button"
                onClick={() => speakEnglish(ph.example)}
                className="flex flex-col items-start justify-between rounded-xl border p-4 text-left transition hover:border-[#8ECFFF]/55 cursor-pointer"
                style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.02)' }}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="font-mono text-2xl font-semibold text-[#8ECFFF]">{ph.symbol}</span>
                  <span className="inline-flex items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1 text-xs text-[#E5C17D]">
                    <Volume2 className="h-3 w-3" />
                    {ph.example}
                  </span>
                </div>
                <p className="mt-2.5 text-xs text-[color:var(--color-one-text-muted)]">
                  {isZh ? ph.tipZh : ph.tipEn}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* MODE 4: PARALLEL READING & CLICK-TO-LOOKUP */}
      {subMode === 'reading' && (
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="one-surface p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {ENGLISH_READING_PASSAGES.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPassageIdx(idx)}
                    className={`rounded-lg border px-3 py-1.5 text-xs cursor-pointer ${
                      selectedPassageIdx === idx
                        ? 'border-[#C4A876]/55 bg-[#C4A876]/15 text-[#E5C17D]'
                        : 'border-white/10 text-[color:var(--color-one-text-muted)]'
                    }`}
                  >
                    {p.topic}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => speakEnglish(currentPassage.bodyEn)}
                className="one-btn one-btn-sm one-btn-secondary"
              >
                <Volume2 className="h-3.5 w-3.5" />
                <span>{isZh ? '全文朗读' : 'Read Aloud'}</span>
              </button>
            </div>

            <div>
              <span className="one-badge one-badge-neutral">{currentPassage.level}</span>
              <h3 className="mt-2 text-xl font-semibold text-[color:var(--color-one-text)]">{currentPassage.titleEn}</h3>
              <p className="mt-1 text-xs text-[color:var(--color-one-text-dim)]">{currentPassage.titleZh}</p>
            </div>

            <div className="rounded-xl border p-4 text-sm leading-7 text-[color:var(--color-one-text)]" style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.02)' }}>
              {currentPassage.bodyEn.split(/\s+/).map((token, idx) => {
                const cleanWord = token.replace(/[^a-zA-Z'-]/g, '');
                return (
                  <React.Fragment key={idx}>
                    <button
                      type="button"
                      onClick={() => {
                        if (cleanWord) {
                          setSubMode('reading');
                          void runWordLookup(cleanWord);
                          speakEnglish(cleanWord);
                        }
                      }}
                      className="rounded px-0.5 hover:bg-[#8ECFFF]/20 hover:text-[#8ECFFF] transition-colors cursor-pointer"
                    >
                      {token}
                    </button>{' '}
                  </React.Fragment>
                );
              })}
            </div>

            <p className="text-xs leading-relaxed text-[color:var(--color-one-text-muted)]">
              {currentPassage.translationZh}
            </p>
            <p className="text-[11px] text-[#8ECFFF]">
              {isZh ? '提示：点击文章中任意英文单词，即可在右侧即时查音标、释义并发音。' : 'Click any word above to look up phonetics and meaning.'}
            </p>
          </section>

          <section className="one-surface p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[color:var(--color-one-text)]">
                {isZh ? '点词即时词典 & 百科语料抓取' : 'Instant Word Inspector & Corpus Fetch'}
              </h3>
              <Globe className="h-4 w-4 text-[#8ECFFF]" />
            </div>

            {lookupResult && (
              <div className="rounded-xl border p-3.5 text-xs" style={{ borderColor: 'var(--color-one-border)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-base font-semibold text-[color:var(--color-one-text)]">{lookupResult.word}</span>
                    {lookupResult.phonetic && (
                      <span className="ml-2 font-mono text-[#8ECFFF]">{lookupResult.phonetic}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => speakEnglish(lookupResult.word, lookupResult.audioUrl)}
                    className="rounded-lg p-1.5 hover:bg-white/10 text-[#8ECFFF] cursor-pointer"
                  >
                    <Volume2 className="h-4 w-4" />
                  </button>
                </div>
                {lookupResult.meanings[0]?.definitions[0]?.definition && (
                  <p className="mt-2 text-[color:var(--color-one-text-muted)]">
                    {lookupResult.meanings[0].definitions[0].definition}
                  </p>
                )}
              </div>
            )}

            <div className="border-t pt-4 space-y-3" style={{ borderColor: 'var(--color-one-border)' }}>
              <p className="text-xs font-medium text-[color:var(--color-one-text)]">
                {isZh ? '抓取英文百科真实语料阅读' : 'Fetch Real English Wikipedia Passage'}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={wikiTopic}
                  onChange={(e) => setWikiTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void fetchWikiArticle();
                  }}
                  placeholder="Topic (e.g. Cosmology, Artificial_intelligence)..."
                  className="flex-1 rounded-xl border bg-[color:var(--color-one-surface-soft)] px-3 py-2 text-xs text-[color:var(--color-one-text)] focus:outline-none"
                  style={{ borderColor: 'var(--color-one-border)' }}
                />
                <button
                  type="button"
                  onClick={() => void fetchWikiArticle()}
                  disabled={wikiLoading}
                  className="one-btn one-btn-sm one-btn-primary"
                >
                  {wikiLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <span>{isZh ? '抓取' : 'Fetch'}</span>}
                </button>
              </div>

              {liveWikiArticle && (
                <div className="rounded-xl border p-3.5 text-xs space-y-2" style={{ borderColor: 'var(--color-one-border)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#E5C17D]">{liveWikiArticle.title}</span>
                    <button
                      type="button"
                      onClick={() => speakEnglish(liveWikiArticle.extract)}
                      className="rounded-lg p-1 hover:bg-white/10 text-[#8ECFFF] cursor-pointer"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="leading-relaxed text-[color:var(--color-one-text-muted)]">{liveWikiArticle.extract}</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
