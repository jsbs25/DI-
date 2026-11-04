import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  Flame,
  GraduationCap,
  Headphones,
  RotateCcw,
  Volume2
} from 'lucide-react';
import type { Language } from '../../types/index.ts';
import {
  ARABIC_LETTERS,
  EMPTY_ARABIC_STUDY_STATE,
  createDailyReviewQueue,
  getStudyStreak,
  localDayKey,
  parseArabicStudyState,
  scheduleLetterReview,
  type ArabicLetter,
  type ArabicStudyState,
  type ReviewRating
} from './arabicLearning.ts';

const STORAGE_KEY = 'earth_one_arabic_learning_v1';
const DAILY_NEW_LIMIT = 5;
const DAILY_GOAL = 5;

type Copy = {
  title: string;
  subtitle: string;
  practice: string;
  alphabet: string;
  library: string;
  libraryHint: string;
  letters: string;
  due: string;
  streak: string;
  today: string;
  mastered: string;
  dailyGoal: string;
  startPractice: string;
  dailyLimit: string;
  localOnly: string;
  caughtUp: string;
  caughtUpHint: string;
  returnHome: string;
  question: string;
  reveal: string;
  answer: string;
  forms: string;
  example: string;
  listen: string;
  voiceUnavailable: string;
  again: string;
  hard: string;
  good: string;
  easy: string;
  sessionDone: string;
  sessionDoneHint: string;
  nextSession: string;
  back: string;
  selectLetter: string;
  reviewProgress: string;
  openLibrary: string;
  isolated: string;
  initial: string;
  medial: string;
  final: string;
};

const COPY: Record<Language, Copy> = {
  zh: {
    title: '阿拉伯语学习', subtitle: '从字母开始，循序练习；今天学一点，明天记得更久。', practice: '今日复习', alphabet: '字母表', library: '阿拉伯语图书馆', libraryHint: '沿用 EARTH ONE 现有书库与版权标记', letters: '字母', due: '待复习', streak: '连续学习', today: '今日练习', mastered: '已复习字母', dailyGoal: '每日目标', startPractice: '开始今日练习', dailyLimit: '每日最多加入 5 个新字母；到期卡片优先。', localOnly: '进度只保存在此浏览器，不会上传。', caughtUp: '今天已完成', caughtUpHint: '目前没有到期卡片，也没有更多今日新卡。可以浏览字母表，或明天继续。', returnHome: '返回学习首页', question: '这是什么字母？', reveal: '显示答案', answer: '字母名称与发音提示', forms: '字形变化', example: '例词', listen: '听设备发音', voiceUnavailable: '此浏览器没有可用的阿拉伯语语音。', again: '再练一次', hard: '有点难', good: '记住了', easy: '很轻松', sessionDone: '本轮完成', sessionDoneHint: '复习结果已保存到此设备。', nextSession: '再检查一次', back: '返回', selectLetter: '选择一个字母查看连写字形和例词。', reviewProgress: '掌握进度', openLibrary: '打开图书馆', isolated: '单独', initial: '词首', medial: '词中', final: '词尾'
  },
  en: {
    title: 'Arabic learning', subtitle: 'Start with the letters. A little practice today helps them stay with you tomorrow.', practice: "Today's review", alphabet: 'Alphabet', library: 'Arabic library', libraryHint: 'Uses EARTH ONE’s existing library and rights labels', letters: 'Letters', due: 'Due', streak: 'Day streak', today: 'Practiced today', mastered: 'Reviewed letters', dailyGoal: 'Daily goal', startPractice: "Start today's practice", dailyLimit: 'Up to 5 new letters per day; due cards come first.', localOnly: 'Progress stays in this browser and is not uploaded.', caughtUp: 'You are caught up', caughtUpHint: 'No cards are due and today’s new-card limit is reached. Browse the alphabet or return tomorrow.', returnHome: 'Back to learning home', question: 'Which letter is this?', reveal: 'Reveal answer', answer: 'Letter name and sound hint', forms: 'Letter forms', example: 'Example', listen: 'Hear device pronunciation', voiceUnavailable: 'No Arabic speech voice is available in this browser.', again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy', sessionDone: 'Session complete', sessionDoneHint: 'Your review has been saved on this device.', nextSession: 'Check again', back: 'Back', selectLetter: 'Choose a letter to see its joining forms and an example.', reviewProgress: 'Learning progress', openLibrary: 'Open library', isolated: 'Isolated', initial: 'Initial', medial: 'Medial', final: 'Final'
  },
  ar: {
    title: 'تعلّم العربية', subtitle: 'ابدأ بالحروف. قليل من التدريب اليوم يساعدك على تذكّرها غدًا.', practice: 'مراجعة اليوم', alphabet: 'الأبجدية', library: 'مكتبة العربية', libraryHint: 'تستخدم المكتبة الحالية في EARTH ONE مع بيان الحقوق', letters: 'الحروف', due: 'للمراجعة', streak: 'أيام متتالية', today: 'تدرّبت اليوم', mastered: 'حروف راجعتها', dailyGoal: 'الهدف اليومي', startPractice: 'ابدأ تدريب اليوم', dailyLimit: 'تُضاف خمسة حروف جديدة كحد أقصى يوميًا؛ وتظهر البطاقات المستحقة أولًا.', localOnly: 'يبقى التقدّم في هذا المتصفح ولا يُرفع إلى الخادم.', caughtUp: 'أنهيت تدريب اليوم', caughtUpHint: 'لا توجد بطاقات مستحقة وقد وصلت إلى حد الحروف الجديدة اليوم. تصفّح الأبجدية أو عُد غدًا.', returnHome: 'العودة إلى صفحة التعلّم', question: 'ما هذا الحرف؟', reveal: 'أظهر الإجابة', answer: 'اسم الحرف ودليل النطق', forms: 'أشكال الحرف', example: 'مثال', listen: 'استمع إلى نطق الجهاز', voiceUnavailable: 'لا يتوفر صوت عربي في هذا المتصفح.', again: 'أعد', hard: 'صعب', good: 'جيد', easy: 'سهل', sessionDone: 'اكتملت الجولة', sessionDoneHint: 'حُفظت المراجعة على هذا الجهاز.', nextSession: 'تحقّق مرة أخرى', back: 'رجوع', selectLetter: 'اختر حرفًا لرؤية أشكاله ومثال عليه.', reviewProgress: 'تقدّم التعلّم', openLibrary: 'افتح المكتبة', isolated: 'منفصل', initial: 'أول الكلمة', medial: 'وسط الكلمة', final: 'آخر الكلمة'
  },
  es: {
    title: 'Aprender árabe', subtitle: 'Empieza por las letras. Un poco de práctica hoy ayuda a recordarlas mañana.', practice: 'Repaso de hoy', alphabet: 'Alfabeto', library: 'Biblioteca árabe', libraryHint: 'Usa la biblioteca existente de EARTH ONE y sus avisos de derechos', letters: 'Letras', due: 'Pendientes', streak: 'Días seguidos', today: 'Practicadas hoy', mastered: 'Letras repasadas', dailyGoal: 'Meta diaria', startPractice: 'Empezar la práctica de hoy', dailyLimit: 'Hasta 5 letras nuevas al día; primero aparecen las tarjetas pendientes.', localOnly: 'El progreso queda en este navegador y no se sube.', caughtUp: 'Has terminado por hoy', caughtUpHint: 'No hay tarjetas pendientes y alcanzaste el límite de letras nuevas. Explora el alfabeto o vuelve mañana.', returnHome: 'Volver al inicio', question: '¿Qué letra es?', reveal: 'Mostrar respuesta', answer: 'Nombre y pista de pronunciación', forms: 'Formas de la letra', example: 'Ejemplo', listen: 'Escuchar pronunciación del dispositivo', voiceUnavailable: 'Este navegador no tiene una voz árabe disponible.', again: 'Otra vez', hard: 'Difícil', good: 'Bien', easy: 'Fácil', sessionDone: 'Sesión completada', sessionDoneHint: 'El repaso se guardó en este dispositivo.', nextSession: 'Comprobar de nuevo', back: 'Volver', selectLetter: 'Elige una letra para ver sus formas y un ejemplo.', reviewProgress: 'Progreso de aprendizaje', openLibrary: 'Abrir biblioteca', isolated: 'Aislada', initial: 'Inicial', medial: 'Medial', final: 'Final'
  },
  fr: {
    title: 'Apprendre l’arabe', subtitle: 'Commencez par les lettres. Un peu de pratique aujourd’hui aide à mieux les retenir demain.', practice: 'Révision du jour', alphabet: 'Alphabet', library: 'Bibliothèque arabe', libraryHint: 'Utilise la bibliothèque EARTH ONE existante et ses mentions de droits', letters: 'Lettres', due: 'À réviser', streak: 'Jours consécutifs', today: 'Pratiquées aujourd’hui', mastered: 'Lettres révisées', dailyGoal: 'Objectif quotidien', startPractice: 'Commencer la séance du jour', dailyLimit: 'Jusqu’à 5 nouvelles lettres par jour ; les cartes dues passent en premier.', localOnly: 'La progression reste dans ce navigateur et n’est pas envoyée.', caughtUp: 'C’est terminé pour aujourd’hui', caughtUpHint: 'Aucune carte n’est due et la limite de nouvelles lettres est atteinte. Parcourez l’alphabet ou revenez demain.', returnHome: 'Retour à l’accueil', question: 'Quelle est cette lettre ?', reveal: 'Afficher la réponse', answer: 'Nom et indication de prononciation', forms: 'Formes de la lettre', example: 'Exemple', listen: 'Écouter la prononciation de l’appareil', voiceUnavailable: 'Aucune voix arabe n’est disponible dans ce navigateur.', again: 'Encore', hard: 'Difficile', good: 'Bien', easy: 'Facile', sessionDone: 'Séance terminée', sessionDoneHint: 'La révision a été enregistrée sur cet appareil.', nextSession: 'Vérifier à nouveau', back: 'Retour', selectLetter: 'Choisissez une lettre pour voir ses formes et un exemple.', reviewProgress: 'Progression', openLibrary: 'Ouvrir la bibliothèque', isolated: 'Isolée', initial: 'Initiale', medial: 'Médiane', final: 'Finale'
  },
  ru: {
    title: 'Изучение арабского', subtitle: 'Начните с букв. Небольшая практика сегодня поможет запомнить их завтра.', practice: 'Повторение на сегодня', alphabet: 'Алфавит', library: 'Арабская библиотека', libraryHint: 'Использует существующую библиотеку EARTH ONE с указанием прав', letters: 'Буквы', due: 'К повторению', streak: 'Дней подряд', today: 'Практика сегодня', mastered: 'Повторено букв', dailyGoal: 'Цель на день', startPractice: 'Начать сегодняшнее занятие', dailyLimit: 'До 5 новых букв в день; сначала карточки к повторению.', localOnly: 'Прогресс хранится только в этом браузере и не отправляется.', caughtUp: 'На сегодня всё', caughtUpHint: 'Нет карточек к повторению, а дневной лимит новых букв достигнут. Просмотрите алфавит или возвращайтесь завтра.', returnHome: 'На главную обучения', question: 'Что это за буква?', reveal: 'Показать ответ', answer: 'Название буквы и подсказка по звуку', forms: 'Формы буквы', example: 'Пример', listen: 'Прослушать произношение устройства', voiceUnavailable: 'В этом браузере нет доступного арабского голоса.', again: 'Ещё раз', hard: 'Сложно', good: 'Хорошо', easy: 'Легко', sessionDone: 'Занятие завершено', sessionDoneHint: 'Повторение сохранено на этом устройстве.', nextSession: 'Проверить снова', back: 'Назад', selectLetter: 'Выберите букву, чтобы увидеть её формы и пример.', reviewProgress: 'Прогресс обучения', openLibrary: 'Открыть библиотеку', isolated: 'Изолированная', initial: 'Начальная', medial: 'Средняя', final: 'Конечная'
  }
};

interface ArabicLearningHubProps {
  lang: Language;
  onOpenLibrary: () => void;
}

type View = 'home' | 'alphabet' | 'practice';

function readSavedProgress(): ArabicStudyState {
  if (typeof window === 'undefined') return { ...EMPTY_ARABIC_STUDY_STATE, cards: {}, studyDays: [] };
  try {
    return parseArabicStudyState(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...EMPTY_ARABIC_STUDY_STATE, cards: {}, studyDays: [] };
  }
}

export const ArabicLearningHub: React.FC<ArabicLearningHubProps> = ({ lang, onOpenLibrary }) => {
  const t = COPY[lang] || COPY.en;
  const [study, setStudy] = useState<ArabicStudyState>(readSavedProgress);
  const [view, setView] = useState<View>('home');
  const [selectedLetterId, setSelectedLetterId] = useState<string>(ARABIC_LETTERS[0].id);
  const [queue, setQueue] = useState<string[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState('');

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(study));
    } catch {
      // Keep the current session usable when storage is disabled or full.
    }
  }, [study]);

  useEffect(() => () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const now = new Date();
  const today = localDayKey(now);
  const practicedToday = Object.values(study.cards).filter(card => card.lastReviewedAt?.slice(0, 10) === today).length;
  const introducedCount = Object.values(study.cards).filter(card => Boolean(card.introducedAt)).length;
  const masteredCount = Object.values(study.cards).filter(card => card.repetitions >= 2).length;
  const dueCount = Object.values(study.cards).filter(card => Boolean(card.introducedAt) && card.dueAt <= Date.now()).length;
  const streak = getStudyStreak(study.studyDays, now);
  const goalProgress = Math.min(100, Math.round((practicedToday / DAILY_GOAL) * 100));
  const selectedLetter = useMemo(() => ARABIC_LETTERS.find(letter => letter.id === selectedLetterId) || ARABIC_LETTERS[0], [selectedLetterId]);
  const activeLetter = useMemo(() => ARABIC_LETTERS.find(letter => letter.id === queue[queueIndex]), [queue, queueIndex]);

  const startPractice = () => {
    const nextQueue = createDailyReviewQueue(study, Date.now(), DAILY_NEW_LIMIT);
    setQueue(nextQueue);
    setQueueIndex(0);
    setRevealed(false);
    setSessionDone(nextQueue.length === 0);
    setView('practice');
  };

  const speak = (text: string) => {
    setVoiceMessage('');
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      setVoiceMessage(t.voiceUnavailable);
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ar-SA';
      const arabicVoice = window.speechSynthesis.getVoices().find(voice => /^ar([_-]|$)/i.test(voice.lang));
      if (arabicVoice) utterance.voice = arabicVoice;
      utterance.onerror = () => setVoiceMessage(t.voiceUnavailable);
      window.speechSynthesis.speak(utterance);
    } catch {
      setVoiceMessage(t.voiceUnavailable);
    }
  };

  const rateCurrentCard = (rating: ReviewRating) => {
    if (!activeLetter) return;
    const timestamp = Date.now();
    setStudy(previous => {
      const nextProgress = scheduleLetterReview(previous.cards[activeLetter.id], rating, timestamp);
      const nextDays = new Set([...previous.studyDays, localDayKey(new Date(timestamp))]);
      return {
        version: 1,
        cards: { ...previous.cards, [activeLetter.id]: nextProgress },
        studyDays: [...nextDays].sort()
      };
    });
    if (queueIndex + 1 < queue.length) {
      setQueueIndex(index => index + 1);
      setRevealed(false);
    } else {
      setSessionDone(true);
    }
  };

  const openAlphabet = () => {
    setView('alphabet');
    setVoiceMessage('');
  };

  const returnHome = () => {
    setView('home');
    setVoiceMessage('');
  };

  const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-cyan-500/50 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400';
  const cardClass = 'rounded-2xl border border-slate-800 bg-slate-950/75 shadow-xl shadow-black/20';

  return (
    <section dir="ltr" className="min-h-[calc(100vh-4rem)] w-full bg-[#030712] px-4 pb-12 pt-6 text-slate-100 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-1 rounded-2xl border border-cyan-500/25 bg-cyan-950/50 p-3 text-cyan-300"><GraduationCap className="h-6 w-6" /></div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">EARTH ONE · LEARNING</p>
              <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{t.title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{t.subtitle}</p>
            </div>
          </div>
          <button type="button" className={buttonClass} onClick={onOpenLibrary}>
            <BookOpen className="h-4 w-4 text-amber-300" />{t.openLibrary}
          </button>
        </header>

        {view === 'home' && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard icon={<GraduationCap className="h-4 w-4" />} label={t.letters} value={`${introducedCount}/${ARABIC_LETTERS.length}`} accent="text-cyan-300" />
              <StatCard icon={<RotateCcw className="h-4 w-4" />} label={t.due} value={String(dueCount)} accent="text-amber-300" />
              <StatCard icon={<Flame className="h-4 w-4" />} label={t.streak} value={String(streak)} accent="text-orange-300" />
              <StatCard icon={<Check className="h-4 w-4" />} label={t.mastered} value={`${masteredCount}/${ARABIC_LETTERS.length}`} accent="text-emerald-300" />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <section className={`${cardClass} overflow-hidden`}>
                <div className="border-b border-slate-800 px-5 py-5 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">{t.practice}</p>
                      <h2 className="mt-1 text-xl font-semibold text-white">{t.dailyGoal}</h2>
                    </div>
                    <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300">{practicedToday} / {DAILY_GOAL}</span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-label={t.dailyGoal} aria-valuenow={practicedToday} aria-valuemin={0} aria-valuemax={DAILY_GOAL}>
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all" style={{ width: `${goalProgress}%` }} />
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-400">{t.dailyLimit}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 px-5 py-5 sm:px-6">
                  <button type="button" className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-950/40 transition hover:bg-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200" onClick={startPractice}>
                    <Headphones className="h-4 w-4" />{t.startPractice}
                  </button>
                  <button type="button" className={buttonClass} onClick={openAlphabet}>{t.alphabet}</button>
                </div>
                <p className="px-5 pb-5 text-xs text-slate-500 sm:px-6">{t.localOnly}</p>
              </section>

              <section className={`${cardClass} p-5 sm:p-6`}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">{t.library}</p>
                    <h2 className="mt-1 text-lg font-semibold text-white">{t.library}</h2>
                  </div>
                  <BookOpen className="h-5 w-5 text-amber-300" />
                </div>
                <p className="mb-5 text-sm leading-6 text-slate-400">{t.libraryHint}</p>
                <button type="button" className={buttonClass} onClick={onOpenLibrary}>{t.openLibrary}<ChevronRight className="h-4 w-4" /></button>
              </section>
            </div>

            <section className={`${cardClass} mt-5 p-5 sm:p-6`}>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">28 · ARABIC LETTERS</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">{t.alphabet}</h2>
                </div>
                <button type="button" className="text-xs font-semibold text-cyan-300 hover:text-cyan-200" onClick={openAlphabet}>{t.selectLetter}</button>
              </div>
              <LetterGrid selectedId={selectedLetterId} onSelect={id => { setSelectedLetterId(id); openAlphabet(); }} />
            </section>
          </>
        )}

        {view === 'alphabet' && (
          <>
            <button type="button" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white" onClick={returnHome}><ArrowLeft className="h-4 w-4" />{t.back}</button>
            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <section className={`${cardClass} p-5 sm:p-6`}>
                <h2 className="mb-4 text-lg font-semibold text-white">{t.alphabet}</h2>
                <LetterGrid selectedId={selectedLetterId} onSelect={setSelectedLetterId} />
              </section>
              <LetterDetail letter={selectedLetter} t={t} lang={lang} onSpeak={speak} voiceMessage={voiceMessage} />
            </div>
          </>
        )}

        {view === 'practice' && (
          <>
            <button type="button" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white" onClick={returnHome}><ArrowLeft className="h-4 w-4" />{t.returnHome}</button>
            {sessionDone ? (
              <section className={`${cardClass} mx-auto max-w-2xl p-6 text-center sm:p-10`}>
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-950/60 text-emerald-300"><Check className="h-7 w-7" /></div>
                <h2 className="text-2xl font-semibold text-white">{queue.length ? t.sessionDone : t.caughtUp}</h2>
                <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-400">{queue.length ? t.sessionDoneHint : t.caughtUpHint}</p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  {queue.length > 0 && <button type="button" className={buttonClass} onClick={startPractice}>{t.nextSession}</button>}
                  <button type="button" className={buttonClass} onClick={openAlphabet}>{t.alphabet}</button>
                  <button type="button" className={buttonClass} onClick={returnHome}>{t.returnHome}</button>
                </div>
              </section>
            ) : activeLetter ? (
              <section className={`${cardClass} mx-auto max-w-2xl overflow-hidden`}>
                <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4 sm:px-7">
                  <span className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">{t.practice}</span>
                  <span className="text-xs tabular-nums text-slate-400">{queueIndex + 1} / {queue.length}</span>
                </div>
                <div className="px-5 py-8 text-center sm:px-8 sm:py-10">
                  <p className="text-xs text-slate-500">{t.question}</p>
                  <div dir="rtl" lang="ar" className="my-5 font-serif text-8xl leading-none text-white sm:text-9xl">{activeLetter.id}</div>
                  {!revealed ? (
                    <button type="button" className="rounded-xl bg-cyan-500 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200" onClick={() => setRevealed(true)}>{t.reveal}</button>
                  ) : (
                    <div className="mx-auto max-w-xl text-left">
                      <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-cyan-300">{t.answer}</p>
                      <LetterDetail letter={activeLetter} t={t} lang={lang} onSpeak={speak} voiceMessage={voiceMessage} compact />
                      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <RatingButton label={t.again} tone="rose" onClick={() => rateCurrentCard('again')} />
                        <RatingButton label={t.hard} tone="amber" onClick={() => rateCurrentCard('hard')} />
                        <RatingButton label={t.good} tone="cyan" onClick={() => rateCurrentCard('good')} />
                        <RatingButton label={t.easy} tone="emerald" onClick={() => rateCurrentCard('easy')} />
                      </div>
                    </div>
                  )}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
};

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/75 p-4">
      <div className={`mb-3 flex items-center gap-2 text-xs font-medium text-slate-400 ${accent}`}>{icon}<span className="text-slate-400">{label}</span></div>
      <div className="text-2xl font-semibold tabular-nums text-white">{value}</div>
    </div>
  );
}

function LetterGrid({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
      {ARABIC_LETTERS.map(letter => (
        <button
          key={letter.id}
          type="button"
          onClick={() => onSelect(letter.id)}
          aria-label={`${letter.id} ${letter.nameLatin}`}
          aria-pressed={selectedId === letter.id}
          className={`flex aspect-square flex-col items-center justify-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${selectedId === letter.id ? 'border-cyan-400/70 bg-cyan-950/60 text-cyan-200' : 'border-slate-800 bg-slate-900/55 text-slate-200 hover:border-slate-600 hover:bg-slate-800'}`}
        >
          <span dir="rtl" lang="ar" className="font-serif text-3xl leading-none">{letter.id}</span>
          <span className="mt-1 text-[9px] text-slate-500">{letter.nameLatin}</span>
        </button>
      ))}
    </div>
  );
}

function LetterDetail({ letter, t, lang, onSpeak, voiceMessage, compact = false }: { letter: ArabicLetter; t: Copy; lang: Language; onSpeak: (text: string) => void; voiceMessage: string; compact?: boolean }) {
  const soundHint = lang === 'zh' ? letter.soundZh : letter.soundEn;
  const meaning = lang === 'zh' ? letter.meaningZh : letter.meaningEn;
  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-900/55 ${compact ? 'p-4' : 'p-5 sm:p-6'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <span dir="rtl" lang="ar" className={`font-serif leading-none text-white ${compact ? 'text-5xl' : 'text-6xl'}`}>{letter.id}</span>
          <div>
            <p dir="rtl" lang="ar" className="text-xl font-semibold text-slate-100">{letter.nameArabic}</p>
            <p className="mt-1 text-xs text-slate-400">{letter.nameLatin}</p>
          </div>
        </div>
        <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-500/60 hover:text-cyan-200" onClick={() => onSpeak(letter.id)}>
          <Volume2 className="h-4 w-4" />{t.listen}
        </button>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-300">{soundHint}</p>
      <div className="mt-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t.forms}</p>
        <div className="grid grid-cols-4 gap-2">
          {([
            ['isolated', t.isolated, letter.forms.isolated],
            ['initial', t.initial, letter.forms.initial],
            ['medial', t.medial, letter.forms.medial],
            ['final', t.final, letter.forms.final]
          ] as const).map(([key, label, form]) => (
            <div key={key} className="rounded-xl border border-slate-800 bg-slate-950/75 p-2 text-center">
              <span className="block text-[9px] text-slate-500">{label}</span>
              <span dir="rtl" lang="ar" className="mt-1 block font-serif text-2xl text-slate-100">{form}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/65 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t.example}</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span dir="rtl" lang="ar" className="font-serif text-2xl text-cyan-100">{letter.exampleArabic}</span>
          <span className="text-xs text-slate-400">{letter.exampleLatin}</span>
          <span className="text-sm text-slate-200">{meaning}</span>
        </div>
      </div>
      {voiceMessage && <p role="status" className="mt-3 text-xs text-amber-300">{voiceMessage}</p>}
    </div>
  );
}

function RatingButton({ label, tone, onClick }: { label: string; tone: 'rose' | 'amber' | 'cyan' | 'emerald'; onClick: () => void }) {
  const tones = {
    rose: 'border-rose-500/30 bg-rose-950/35 text-rose-200 hover:bg-rose-900/45',
    amber: 'border-amber-500/30 bg-amber-950/35 text-amber-200 hover:bg-amber-900/45',
    cyan: 'border-cyan-500/30 bg-cyan-950/35 text-cyan-200 hover:bg-cyan-900/45',
    emerald: 'border-emerald-500/30 bg-emerald-950/35 text-emerald-200 hover:bg-emerald-900/45'
  };
  return <button type="button" onClick={onClick} className={`min-h-11 rounded-xl border px-2 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${tones[tone]}`}>{label}</button>;
}
