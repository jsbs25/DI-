import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  Flame,
  GraduationCap,
  Headphones,
  Languages,
  RotateCcw,
  Volume2,
} from 'lucide-react';
import type { Language } from '../../types/index.ts';
import {
  ENGLISH_CATEGORIES,
  ENGLISH_LEARNING_ITEMS,
  EMPTY_ENGLISH_STUDY_STATE,
  createEnglishDailyQueue,
  getEnglishStudyStreak,
  localDayKeyEn,
  parseEnglishStudyState,
  scheduleEnglishReview,
  type EnglishLearningItem,
  type EnglishReviewRating,
  type EnglishStudyState,
} from './englishLearning.ts';

const STORAGE_KEY = 'earth_one_english_learning_v1';
const DAILY_NEW_LIMIT = 5;
const DAILY_GOAL = 5;

interface Props {
  lang: Language;
}

type View = 'home' | 'browse' | 'practice';

function readSaved(): EnglishStudyState {
  if (typeof window === 'undefined') return { ...EMPTY_ENGLISH_STUDY_STATE, cards: {}, studyDays: [] };
  try {
    return parseEnglishStudyState(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...EMPTY_ENGLISH_STUDY_STATE, cards: {}, studyDays: [] };
  }
}

export const EnglishLearningPanel: React.FC<Props> = ({ lang }) => {
  const isZh = lang === 'zh';
  const isAr = lang === 'ar';
  const tr = (zh: string, en: string, ar: string) => (isZh ? zh : isAr ? ar : en);

  const [study, setStudy] = useState<EnglishStudyState>(readSaved);
  const [view, setView] = useState<View>('home');
  const [selectedId, setSelectedId] = useState<string>(ENGLISH_LEARNING_ITEMS[0].id);
  const [queue, setQueue] = useState<string[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [voiceMsg, setVoiceMsg] = useState('');

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(study)); } catch {}
  }, [study]);

  const now = new Date();
  const today = localDayKeyEn(now);
  const practicedToday = Object.values(study.cards).filter(c => c.lastReviewedAt?.slice(0, 10) === today).length;
  const introducedCount = Object.values(study.cards).filter(c => Boolean(c.introducedAt)).length;
  const masteredCount = Object.values(study.cards).filter(c => c.repetitions >= 2).length;
  const dueCount = Object.values(study.cards).filter(c => Boolean(c.introducedAt) && c.dueAt <= Date.now()).length;
  const streak = getEnglishStudyStreak(study.studyDays, now);
  const goalProgress = Math.min(100, Math.round((practicedToday / DAILY_GOAL) * 100));

  const activeItem = useMemo(
    () => ENGLISH_LEARNING_ITEMS.find(i => i.id === queue[queueIndex]),
    [queue, queueIndex]
  );
  const selectedItem = useMemo(
    () => ENGLISH_LEARNING_ITEMS.find(i => i.id === selectedId) || ENGLISH_LEARNING_ITEMS[0],
    [selectedId]
  );

  const startPractice = () => {
    const next = createEnglishDailyQueue(study, Date.now(), DAILY_NEW_LIMIT);
    setQueue(next);
    setQueueIndex(0);
    setRevealed(false);
    setSessionDone(next.length === 0);
    setView('practice');
  };

  const speak = (text: string) => {
    setVoiceMsg('');
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      setVoiceMsg(tr('此设备不支持语音朗读。', 'Speech is unavailable on this device.', 'النطق غير متاح على هذا الجهاز.'));
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      const v = window.speechSynthesis.getVoices().find(vv => /^en([_-]|$)/i.test(vv.lang));
      if (v) u.voice = v;
      u.onerror = () => setVoiceMsg(tr('未检测到英语语音引擎。', 'No English voice engine detected.', 'لم يتم العثور على محرك صوتي إنجليزي.'));
      window.speechSynthesis.speak(u);
    } catch {
      setVoiceMsg(tr('语音播放失败。', 'Speech playback failed.', 'فشل تشغيل الصوت.'));
    }
  };

  const rate = (rating: EnglishReviewRating) => {
    if (!activeItem) return;
    const ts = Date.now();
    setStudy(prev => {
      const nextCard = scheduleEnglishReview(prev.cards[activeItem.id], rating, ts);
      const days = new Set([...prev.studyDays, localDayKeyEn(new Date(ts))]);
      return { version: 1, cards: { ...prev.cards, [activeItem.id]: nextCard }, studyDays: [...days].sort() };
    });
    if (queueIndex + 1 < queue.length) {
      setQueueIndex(i => i + 1);
      setRevealed(false);
    } else {
      setSessionDone(true);
    }
  };

  const meaningOf = (item: EnglishLearningItem) => (isZh ? item.meaningZh : isAr ? item.meaningAr : item.meaningEn);
  const exampleMeaningOf = (item: EnglishLearningItem) => (isZh ? item.exampleZh : isAr ? item.exampleAr : item.exampleEn);

  return (
    <div className="space-y-5">
      {view === 'home' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={<Languages className="h-4 w-4" />} label={tr('短语与词汇', 'Phrases & words', 'العبارات والكلمات')} value={`${introducedCount}/${ENGLISH_LEARNING_ITEMS.length}`} />
            <Stat icon={<RotateCcw className="h-4 w-4" />} label={tr('待复习', 'Due', 'للمراجعة')} value={String(dueCount)} accent="var(--color-one-gold)" />
            <Stat icon={<Flame className="h-4 w-4" />} label={tr('连续学习', 'Streak', 'أيام متتالية')} value={String(streak)} accent="var(--color-one-warning)" />
            <Stat icon={<Check className="h-4 w-4" />} label={tr('已掌握', 'Mastered', 'متقن')} value={`${masteredCount}/${ENGLISH_LEARNING_ITEMS.length}`} accent="var(--color-one-success)" />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="one-surface-elevated overflow-hidden">
              <div className="border-b px-5 py-5 sm:px-6" style={{ borderColor: 'var(--color-one-border)' }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-one-accent)' }}>{tr('今日练习', 'Practice today', 'ممارسة اليوم')}</p>
                    <h2 className="mt-1 text-xl font-semibold text-[color:var(--color-one-text)]">{tr('英语口语与常用表达', 'English speaking & everyday phrases', 'التحدث بالإنجليزية والعبارات اليومية')}</h2>
                  </div>
                  <span className="one-badge one-badge-neutral font-mono normal-case tracking-normal">{practicedToday} / {DAILY_GOAL}</span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full" style={{ background: 'rgba(244,243,238,0.08)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${goalProgress}%`, background: 'linear-gradient(90deg, var(--color-one-accent), var(--color-one-gold))' }} />
                </div>
                <p className="mt-3 text-xs leading-5 text-[color:var(--color-one-text-dim)]">{tr('每日加入 5 个新表达，优先复习到期内容。进度保存在本机。', 'Up to 5 new phrases per day; due items come first. Progress is saved locally.', 'حتى 5 عبارات جديدة يوميًا؛ العناصر المستحقة أولاً. يُحفظ التقدم محليًا.')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 px-5 py-5 sm:px-6">
                <button type="button" className="one-btn one-btn-md one-btn-primary" onClick={startPractice}>
                  <Headphones className="h-4 w-4" />{tr('开始今日练习', 'Start today’s practice', 'ابدأ ممارسة اليوم')}
                </button>
                <button type="button" className="one-btn one-btn-md one-btn-secondary" onClick={() => setView('browse')}>
                  <BookOpen className="h-4 w-4" />{tr('浏览全部表达', 'Browse all phrases', 'تصفح جميع العبارات')}
                </button>
              </div>
            </section>

            <section className="one-surface p-5 sm:p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-one-gold)' }}>{tr('学习主题', 'Topics', 'المواضيع')}</p>
              <div className="mt-3 space-y-2">
                {ENGLISH_CATEGORIES.map(cat => {
                  const count = ENGLISH_LEARNING_ITEMS.filter(i => i.category === cat.id).length;
                  return (
                    <button key={cat.id} type="button" onClick={() => { setSelectedId(ENGLISH_LEARNING_ITEMS.find(i => i.category === cat.id)?.id || selectedId); setView('browse'); }} className="flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition hover:bg-[rgba(244,243,238,0.04)]" style={{ borderColor: 'var(--color-one-border)' }}>
                      <span className="text-sm text-[color:var(--color-one-text)]">{isZh ? cat.zh : isAr ? cat.ar : cat.en}</span>
                      <span className="inline-flex items-center gap-1 text-xs text-[color:var(--color-one-text-dim)]">{count}<ChevronRight className="h-3.5 w-3.5" /></span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </>
      )}

      {view === 'browse' && (
        <>
          <button type="button" className="mb-1 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--color-one-text-muted)] hover:text-[color:var(--color-one-text)]" onClick={() => setView('home')}>
            <ArrowLeft className="h-4 w-4" />{tr('返回', 'Back', 'رجوع')}
          </button>
          <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <section className="one-surface p-4 sm:p-5">
              <h2 className="mb-3 text-lg font-semibold text-[color:var(--color-one-text)]">{tr('英语常用表达', 'Common English phrases', 'عبارات إنجليزية شائعة')}</h2>
              <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {ENGLISH_CATEGORIES.map(cat => (
                  <div key={cat.id}>
                    <p className="mb-1 mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-one-text-dim)]">{isZh ? cat.zh : isAr ? cat.ar : cat.en}</p>
                    <div className="space-y-1.5">
                      {ENGLISH_LEARNING_ITEMS.filter(i => i.category === cat.id).map(item => {
                        const active = item.id === selectedId;
                        return (
                          <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className="w-full rounded-xl border px-3 py-2 text-left transition" style={active ? { borderColor: 'rgba(127,212,255,0.45)', background: 'rgba(127,212,255,0.1)' } : { borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.02)' }}>
                            <div className="text-sm font-medium text-[color:var(--color-one-text)]">{item.phrase}</div>
                            <div className="mt-0.5 text-xs text-[color:var(--color-one-text-dim)] line-clamp-1">{meaningOf(item)}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className="one-surface p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-2xl font-semibold text-[color:var(--color-one-text)]">{selectedItem.phrase}</p>
                  <p className="mt-2 text-sm text-[color:var(--color-one-text-muted)]">{meaningOf(selectedItem)}</p>
                </div>
                <button type="button" className="one-btn one-btn-sm one-btn-secondary shrink-0" onClick={() => speak(selectedItem.phrase)}><Volume2 className="h-4 w-4" />{tr('朗读', 'Listen', 'استمع')}</button>
              </div>
              <div className="mt-5 rounded-xl border p-4" style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.02)' }}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-one-text-dim)]">{tr('例句', 'Example', 'مثال')}</p>
                <p className="mt-2 text-base text-[color:var(--color-one-text)]">{selectedItem.example}</p>
                <p className="mt-1 text-sm text-[color:var(--color-one-text-muted)]">{exampleMeaningOf(selectedItem)}</p>
                <button type="button" className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium hover:opacity-80" style={{ color: 'var(--color-one-accent)' }} onClick={() => speak(selectedItem.example)}><Volume2 className="h-3.5 w-3.5" />{tr('朗读例句', 'Listen to example', 'استمع إلى المثال')}</button>
              </div>
              {voiceMsg && <p className="mt-3 text-xs" style={{ color: 'var(--color-one-warning)' }}>{voiceMsg}</p>}
            </section>
          </div>
        </>
      )}

      {view === 'practice' && (
        <>
          <button type="button" className="mb-1 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--color-one-text-muted)] hover:text-[color:var(--color-one-text)]" onClick={() => setView('home')}>
            <ArrowLeft className="h-4 w-4" />{tr('返回', 'Back', 'رجوع')}
          </button>
          {sessionDone ? (
            <section className="one-surface-elevated mx-auto max-w-2xl p-6 text-center sm:p-10">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border" style={{ borderColor: 'rgba(76,195,138,0.3)', background: 'rgba(76,195,138,0.1)', color: 'var(--color-one-success)' }}><Check className="h-7 w-7" /></div>
              <h2 className="text-2xl font-semibold text-[color:var(--color-one-text)]">{queue.length ? tr('今日练习完成', 'Session complete', 'اكتملت الجلسة') : tr('今天已完成', 'All caught up', 'أنجزت مهام اليوم')}</h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[color:var(--color-one-text-muted)]">{queue.length ? tr('复习进度已保存到本机。', 'Your progress is saved locally.', 'تم حفظ تقدمك محليًا.') : tr('当前没有到期卡片，明天再来或浏览表达。', 'No cards are due now. Come back tomorrow or browse phrases.', 'لا توجد بطاقات مستحقة الآن. عُد غدًا أو تصفح العبارات.')}</p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {queue.length > 0 && <button type="button" className="one-btn one-btn-md one-btn-primary" onClick={startPractice}>{tr('再练一轮', 'Practice again', 'تدرب مرة أخرى')}</button>}
                <button type="button" className="one-btn one-btn-md one-btn-secondary" onClick={() => setView('browse')}>{tr('浏览表达', 'Browse phrases', 'تصفح العبارات')}</button>
                <button type="button" className="one-btn one-btn-md one-btn-ghost" onClick={() => setView('home')}>{tr('返回首页', 'Home', 'الرئيسية')}</button>
              </div>
            </section>
          ) : activeItem ? (
            <section className="one-surface-elevated mx-auto max-w-2xl overflow-hidden">
              <div className="flex items-center justify-between border-b px-5 py-4 sm:px-7" style={{ borderColor: 'var(--color-one-border)' }}>
                <span className="text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: 'var(--color-one-accent)' }}>{tr('英语练习', 'English practice', 'ممارسة الإنجليزية')}</span>
                <span className="text-xs tabular-nums text-[color:var(--color-one-text-dim)]">{queueIndex + 1} / {queue.length}</span>
              </div>
              <div className="px-5 py-8 sm:px-8 sm:py-10">
                <p className="text-center text-xs text-[color:var(--color-one-text-dim)]">{tr('看英文表达，回忆含义并跟读', 'Recall the meaning and say it aloud', 'تذكر المعنى وردده بصوت عالٍ')}</p>
                <div className="my-6 text-center">
                  <p className="text-3xl font-semibold leading-snug text-[color:var(--color-one-text)] sm:text-4xl">{activeItem.phrase}</p>
                  <button type="button" className="one-btn one-btn-sm one-btn-secondary mt-4" onClick={() => speak(activeItem.phrase)}><Volume2 className="h-4 w-4" />{tr('朗读', 'Listen', 'استمع')}</button>
                </div>
                {!revealed ? (
                  <div className="text-center"><button type="button" className="one-btn one-btn-md one-btn-primary" onClick={() => setRevealed(true)}>{tr('显示答案', 'Show answer', 'أظهر الإجابة')}</button></div>
                ) : (
                  <div className="mx-auto max-w-xl">
                    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.02)' }}>
                      <p className="text-sm text-[color:var(--color-one-text-muted)]">{meaningOf(activeItem)}</p>
                      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-one-text-dim)]">{tr('例句', 'Example', 'مثال')}</p>
                      <p className="mt-1 text-base text-[color:var(--color-one-text)]">{activeItem.example}</p>
                      <p className="mt-1 text-sm text-[color:var(--color-one-text-muted)]">{exampleMeaningOf(activeItem)}</p>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Rating label={tr('再练一次', 'Again', 'مرة أخرى')} tone="danger" onClick={() => rate('again')} />
                      <Rating label={tr('有点难', 'Hard', 'صعب')} tone="warning" onClick={() => rate('hard')} />
                      <Rating label={tr('记住了', 'Good', 'جيد')} tone="accent" onClick={() => rate('good')} />
                      <Rating label={tr('很轻松', 'Easy', 'سهل')} tone="success" onClick={() => rate('easy')} />
                    </div>
                  </div>
                )}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
};

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  return (
    <div className="one-surface p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium text-[color:var(--color-one-text-dim)]">
        <span style={accent ? { color: accent } : undefined}>{icon}</span><span>{label}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums text-[color:var(--color-one-text)]">{value}</div>
    </div>
  );
}

function Rating({ label, tone, onClick }: { label: string; tone: 'danger' | 'warning' | 'accent' | 'success'; onClick: () => void }) {
  const tones = {
    danger: { border: 'rgba(224,122,122,0.32)', bg: 'rgba(224,122,122,0.12)', color: 'var(--color-one-danger)' },
    warning: { border: 'rgba(227,179,65,0.32)', bg: 'rgba(227,179,65,0.12)', color: 'var(--color-one-warning)' },
    accent: { border: 'rgba(127,212,255,0.32)', bg: 'rgba(127,212,255,0.12)', color: 'var(--color-one-accent)' },
    success: { border: 'rgba(76,195,138,0.32)', bg: 'rgba(76,195,138,0.12)', color: 'var(--color-one-success)' }
  } as const;
  const t = tones[tone];
  return <button type="button" onClick={onClick} className="min-h-11 rounded-xl border px-2 py-2 text-xs font-semibold transition hover:opacity-90" style={{ borderColor: t.border, background: t.bg, color: t.color }}>{label}</button>;
}
