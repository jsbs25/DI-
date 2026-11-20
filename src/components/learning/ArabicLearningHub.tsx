import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  BookMarked,
  Check,
  Flame,
  GraduationCap,
  Headphones,
  Languages,
  RotateCcw,
  Sparkles,
  Volume2,
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
  type ReviewRating,
} from './arabicLearning.ts';
import { AuthoritativeDictionaryStudio } from './AuthoritativeDictionaryStudio.tsx';
import { EnglishLearningSection } from './EnglishLearningSection.tsx';
import { DuolingoImmersionPlatform } from './DuolingoImmersionPlatform.tsx';
import { LiveLanguageStudio } from './LiveLanguageStudio.tsx';
import type { LearningAgentAction } from '../../agent/agentClient.ts';

const STORAGE_KEY = 'earth_one_arabic_learning_v1';
const DAILY_NEW_LIMIT = 5;
const DAILY_GOAL = 5;

type Copy = {
  title: string;
  subtitle: string;
  practice: string;
  alphabet: string;
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
  isolated: string;
  initial: string;
  medial: string;
  final: string;
};

const COPY: Record<Language, Copy> = {
  zh: {
    title: '语言学习中心',
    subtitle: '专注语言研习：内置剑桥/牛津标准双解词典 API、AI 实景口语对练、英语精研引擎、多语沉浸课程与阿拉伯语字母系统。',
    practice: '今日复习',
    alphabet: '字母表',
    letters: '字母',
    due: '待复习',
    streak: '连续学习',
    today: '今日练习',
    mastered: '已掌握字母',
    dailyGoal: '每日目标',
    startPractice: '开始今日练习',
    dailyLimit: '每日最多加入 5 个新字母；到期卡片优先。',
    localOnly: '所有学习进度与间隔记忆曲线保存在本地设备。',
    caughtUp: '今天已完成',
    caughtUpHint: '目前没有到期卡片，可以前往字母表巩固连写字形或切换权威词典查词。',
    returnHome: '返回阿语复习首页',
    question: '这是什么字母？',
    reveal: '显示答案',
    answer: '字母名称与发音提示',
    forms: '字形变化',
    example: '例词',
    listen: '听设备发音',
    voiceUnavailable: '此设备未检测到阿拉伯语语音引擎。',
    again: '再练一次',
    hard: '有点难',
    good: '记住了',
    easy: '很轻松',
    sessionDone: '本轮完成',
    sessionDoneHint: '复习结果已保存到此设备。',
    nextSession: '再检查一次',
    back: '返回',
    selectLetter: '选择一个字母查看连写字形和例词。',
    isolated: '单独',
    initial: '词首',
    medial: '词中',
    final: '词尾',
  },
  en: {
    title: 'Language Learning Center',
    subtitle:
      'Pure language mastery: Cambridge/Oxford-standard bilingual dictionary API, live AI spoken roleplay, English engine, multi-language immersion, and Arabic script.',
    practice: "Today's review",
    alphabet: 'Alphabet',
    letters: 'Letters',
    due: 'Due',
    streak: 'Day streak',
    today: 'Practiced today',
    mastered: 'Mastered letters',
    dailyGoal: 'Daily goal',
    startPractice: "Start today's practice",
    dailyLimit: 'Up to 5 new letters per day; due cards come first.',
    localOnly: 'Study progress and spaced repetition schedules stay on this device.',
    caughtUp: 'You are caught up',
    caughtUpHint: 'No cards are due right now. Review letter forms or explore the dictionary.',
    returnHome: 'Back to Arabic home',
    question: 'Which letter is this?',
    reveal: 'Reveal answer',
    answer: 'Letter name and sound hint',
    forms: 'Letter forms',
    example: 'Example',
    listen: 'Hear device pronunciation',
    voiceUnavailable: 'No Arabic speech voice is available in this browser.',
    again: 'Again',
    hard: 'Hard',
    good: 'Good',
    easy: 'Easy',
    sessionDone: 'Session complete',
    sessionDoneHint: 'Your review has been saved on this device.',
    nextSession: 'Check again',
    back: 'Back',
    selectLetter: 'Choose a letter to see its joining forms and an example.',
    isolated: 'Isolated',
    initial: 'Initial',
    medial: 'Medial',
    final: 'Final',
  },
  ar: {
    title: 'مركز تعلّم اللغات',
    subtitle: 'مركز مخصّص لإتقان اللغات: قاموس كامبريدج وأكسفورد ثنائي اللغة، محادثة ذكية، محرك الإنجليزية، دورات متعددة اللغات، وأساسيات العربية.',
    practice: 'مراجعة اليوم',
    alphabet: 'الأبجدية',
    letters: 'الحروف',
    due: 'للمراجعة',
    streak: 'أيام متتالية',
    today: 'تدرّبت اليوم',
    mastered: 'حروف متقنة',
    dailyGoal: 'الهدف اليومي',
    startPractice: 'ابدأ تدريب اليوم',
    dailyLimit: 'تُضاف خمسة حروف جديدة كحد أقصى يوميًا؛ وتظهر البطاقات المستحقة أولًا.',
    localOnly: 'يبقى التقدّم محفوظًا على هذا الجهاز.',
    caughtUp: 'أنهيت تدريب اليوم',
    caughtUpHint: 'لا توجد بطاقات مستحقة حاليًا.',
    returnHome: 'العودة إلى صفحة العربية',
    question: 'ما هذا الحرف؟',
    reveal: 'أظهر الإجابة',
    answer: 'اسم الحرف ودليل النطق',
    forms: 'أشكال الحرف',
    example: 'مثال',
    listen: 'استمع إلى النطق',
    voiceUnavailable: 'لا يتوفر صوت عربي في هذا المتصفح.',
    again: 'أعد',
    hard: 'صعب',
    good: 'جيد',
    easy: 'سهل',
    sessionDone: 'اكتملت الجولة',
    sessionDoneHint: 'حُفظت المراجعة على هذا الجهاز.',
    nextSession: 'تحقّق مرة أخرى',
    back: 'رجوع',
    selectLetter: 'اختر حرفًا لرؤية أشكاله ومثال عليه.',
    isolated: 'منفصل',
    initial: 'أول الكلمة',
    medial: 'وسط الكلمة',
    final: 'آخر الكلمة',
  },
  es: {
    title: 'Centro de Aprendizaje de Idiomas',
    subtitle: 'Enfoque 100% idiomas: diccionario bilingüe estándar Cambridge, práctica oral con IA, motor de inglés, inmersión multilingüe y alfabeto árabe.',
    practice: 'Repaso de hoy',
    alphabet: 'Alfabeto',
    letters: 'Letras',
    due: 'Pendientes',
    streak: 'Días seguidos',
    today: 'Practicadas hoy',
    mastered: 'Letras dominadas',
    dailyGoal: 'Meta diaria',
    startPractice: 'Empezar la práctica de hoy',
    dailyLimit: 'Hasta 5 letras nuevas al día; primero aparecen las tarjetas pendientes.',
    localOnly: 'El progreso queda guardado en este navegador.',
    caughtUp: 'Has terminado por hoy',
    caughtUpHint: 'No hay tarjetas pendientes.',
    returnHome: 'Volver al inicio',
    question: '¿Qué letra es?',
    reveal: 'Mostrar respuesta',
    answer: 'Nombre y pista de pronunciación',
    forms: 'Formas de la letra',
    example: 'Ejemplo',
    listen: 'Escuchar pronunciación',
    voiceUnavailable: 'Este navegador no tiene una voz árabe disponible.',
    again: 'Otra vez',
    hard: 'Difícil',
    good: 'Bien',
    easy: 'Fácil',
    sessionDone: 'Sesión completada',
    sessionDoneHint: 'El repaso se guardó en este dispositivo.',
    nextSession: 'Comprobar de nuevo',
    back: 'Volver',
    selectLetter: 'Elige una letra para ver sus formas y un ejemplo.',
    isolated: 'Aislada',
    initial: 'Inicial',
    medial: 'Medial',
    final: 'Final',
  },
  fr: {
    title: 'Centre d’apprentissage des langues',
    subtitle: '100% dédié aux langues : dictionnaire bilingue standard Cambridge, pratique orale IA, moteur d’anglais, immersion multilingue et alphabet arabe.',
    practice: 'Révision du jour',
    alphabet: 'Alphabet',
    letters: 'Lettres',
    due: 'À réviser',
    streak: 'Jours consécutifs',
    today: 'Pratiquées aujourd’hui',
    mastered: 'Lettres maîtrisées',
    dailyGoal: 'Objectif quotidien',
    startPractice: 'Commencer la séance du jour',
    dailyLimit: 'Jusqu’à 5 nouvelles lettres par jour ; les cartes dues passent en premier.',
    localOnly: 'La progression reste dans ce navigateur.',
    caughtUp: 'C’est terminé pour aujourd’hui',
    caughtUpHint: 'Aucune carte n’est due.',
    returnHome: 'Retour à l’accueil',
    question: 'Quelle est cette lettre ?',
    reveal: 'Afficher la réponse',
    answer: 'Nom et indication de prononciation',
    forms: 'Formes de la lettre',
    example: 'Exemple',
    listen: 'Écouter la prononciation',
    voiceUnavailable: 'Aucune voix arabe n’est disponible dans ce navigateur.',
    again: 'Encore',
    hard: 'Difficile',
    good: 'Bien',
    easy: 'Facile',
    sessionDone: 'Séance terminée',
    sessionDoneHint: 'La révision a été enregistrée sur cet appareil.',
    nextSession: 'Vérifier à nouveau',
    back: 'Retour',
    selectLetter: 'Choisissez une lettre pour voir ses formes et un exemple.',
    isolated: 'Isolée',
    initial: 'Initiale',
    medial: 'Médiane',
    final: 'Finale',
  },
  ru: {
    title: 'Центр изучения языков',
    subtitle: 'Только языки: двуязычный словарь стандарта Cambridge, разговорная практика с ИИ, движок английского, мультиязычное погружение и арабский алфавит.',
    practice: 'Повторение на сегодня',
    alphabet: 'Алфавит',
    letters: 'Буквы',
    due: 'К повторению',
    streak: 'Дней подряд',
    today: 'Практика сегодня',
    mastered: 'Освоено букв',
    dailyGoal: 'Цель на день',
    startPractice: 'Начать сегодняшнее занятие',
    dailyLimit: 'До 5 новых букв в день; сначала карточки к повторению.',
    localOnly: 'Прогресс хранится только в этом браузере.',
    caughtUp: 'На сегодня всё',
    caughtUpHint: 'Нет карточек к повторению.',
    returnHome: 'На главную обучения',
    question: 'Что это за буква?',
    reveal: 'Показать ответ',
    answer: 'Название буквы и подсказка по звуку',
    forms: 'Формы буквы',
    example: 'Пример',
    listen: 'Прослушать произношение',
    voiceUnavailable: 'В этом браузере нет доступного арабского голоса.',
    again: 'Ещё раз',
    hard: 'Сложно',
    good: 'Хорошо',
    easy: 'Легко',
    sessionDone: 'Занятие завершено',
    sessionDoneHint: 'Повторение сохранено на этом устройстве.',
    nextSession: 'Проверить снова',
    back: 'Назад',
    selectLetter: 'Выберите букву, чтобы увидеть её формы и пример.',
    isolated: 'Изолированная',
    initial: 'Начальная',
    medial: 'Средняя',
    final: 'Конечная',
  },
};

interface ArabicLearningHubProps {
  lang: Language;
  onOpenLibrary?: () => void;
  quickAction?: LearningAgentAction | null;
}

type MainTab = 'dictionary' | 'live_studio' | 'english_engine' | 'duolingo_platform' | 'letters';
type View = 'home' | 'alphabet' | 'practice';

function readSavedProgress(): ArabicStudyState {
  if (typeof window === 'undefined') return { ...EMPTY_ARABIC_STUDY_STATE, cards: {}, studyDays: [] };
  try {
    return parseArabicStudyState(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...EMPTY_ARABIC_STUDY_STATE, cards: {}, studyDays: [] };
  }
}

export const ArabicLearningHub: React.FC<ArabicLearningHubProps> = ({ lang, quickAction }) => {
  const t = COPY[lang] || COPY.en;
  const isRtl = lang === 'ar';

  const [mainTab, setMainTab] = useState<MainTab>('dictionary');
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
    } catch {}
  }, [study]);

  useEffect(
    () => () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    },
    []
  );

  useEffect(() => {
    if (!quickAction) return;
    if (quickAction.language === 'en' || quickAction.tab === 'english') {
      setMainTab('english_engine');
      return;
    }
    if (quickAction.tab === 'duolingo_platform') {
      setMainTab('duolingo_platform');
      return;
    }
    if (quickAction.tab === 'practice' || quickAction.tab === 'alphabet') {
      setMainTab('letters');
      if (quickAction.tab === 'practice') {
        const nextQueue = createDailyReviewQueue(study, Date.now(), DAILY_NEW_LIMIT);
        setQueue(nextQueue);
        setQueueIndex(0);
        setRevealed(false);
        setSessionDone(nextQueue.length === 0);
        setView('practice');
      } else {
        setView('alphabet');
      }
      return;
    }
    setMainTab('dictionary');
  }, [quickAction?.seq]);

  const now = new Date();
  const today = localDayKey(now);
  const practicedToday = Object.values(study.cards).filter(
    (card) => card.lastReviewedAt?.slice(0, 10) === today
  ).length;
  const introducedCount = Object.values(study.cards).filter((card) => Boolean(card.introducedAt)).length;
  const masteredCount = Object.values(study.cards).filter((card) => card.repetitions >= 2).length;
  const dueCount = Object.values(study.cards).filter(
    (card) => Boolean(card.introducedAt) && card.dueAt <= Date.now()
  ).length;
  const streak = getStudyStreak(study.studyDays, now);
  const goalProgress = Math.min(100, Math.round((practicedToday / DAILY_GOAL) * 100));

  const selectedLetter = useMemo(
    () => ARABIC_LETTERS.find((letter) => letter.id === selectedLetterId) || ARABIC_LETTERS[0],
    [selectedLetterId]
  );
  const activeLetter = useMemo(
    () => ARABIC_LETTERS.find((letter) => letter.id === queue[queueIndex]),
    [queue, queueIndex]
  );

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
      const arabicVoice = window.speechSynthesis.getVoices().find((voice) => /^ar([_-]|$)/i.test(voice.lang));
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
    setStudy((previous) => {
      const nextProgress = scheduleLetterReview(previous.cards[activeLetter.id], rating, timestamp);
      const nextDays = new Set([...previous.studyDays, localDayKey(new Date(timestamp))]);
      return {
        version: 1,
        cards: { ...previous.cards, [activeLetter.id]: nextProgress },
        studyDays: [...nextDays].sort(),
      };
    });
    if (queueIndex + 1 < queue.length) {
      setQueueIndex((index) => index + 1);
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

  return (
    <section
      dir={isRtl ? 'rtl' : 'ltr'}
      className="min-h-[calc(100vh-4rem)] w-full px-4 pb-16 pt-6 text-[color:var(--color-one-text)] sm:px-6 lg:px-10"
      style={{ background: 'transparent' }}
    >
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6">
        {/* Clean Pure Language Center Header */}
        <header className="one-surface-elevated relative overflow-hidden px-5 py-6 sm:px-7 sm:py-7">
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex max-w-3xl items-start gap-4">
              <div
                className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border"
                style={{
                  borderColor: 'rgba(127,212,255,0.28)',
                  background: 'rgba(127,212,255,0.1)',
                  color: 'var(--color-one-accent)',
                }}
              >
                <Languages className="h-6 w-6" />
              </div>
              <div>
                <div className="mb-1 flex items-center gap-2 text-xs font-medium text-[color:var(--color-one-gold)]">
                  <span>{lang === 'zh' ? 'EARTH ONE · 纯净语言精研中心' : 'EARTH ONE · LANGUAGE STUDIO'}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[color:var(--color-one-text-dim)]">Cambridge · Oxford · EN / AR / 中文 / ES / FR / JA / KO</span>
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--color-one-text)] sm:text-3xl">
                  {t.title}
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[color:var(--color-one-text-muted)]">
                  {t.subtitle}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Pure Language Center Tabs (Zero Library Tabs) */}
        <div className="one-surface-subtle flex flex-col gap-3 p-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:pb-0">
            <button
              type="button"
              onClick={() => setMainTab('dictionary')}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                mainTab === 'dictionary'
                  ? ''
                  : 'text-[color:var(--color-one-text-muted)] hover:text-[color:var(--color-one-text)] hover:bg-[rgba(244,243,238,0.04)]'
              }`}
              style={
                mainTab === 'dictionary'
                  ? {
                      background: 'rgba(215, 182, 118, 0.16)',
                      border: '1px solid rgba(215, 182, 118, 0.38)',
                      color: 'var(--color-one-gold)',
                    }
                  : { border: '1px solid transparent' }
              }
            >
              <BookMarked className="h-4 w-4" />
              <span>{lang === 'zh' ? '剑桥双解权威词典' : 'Cambridge Dictionary'}</span>
            </button>

            <button
              type="button"
              onClick={() => setMainTab('live_studio')}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                mainTab === 'live_studio'
                  ? ''
                  : 'text-[color:var(--color-one-text-muted)] hover:text-[color:var(--color-one-text)] hover:bg-[rgba(244,243,238,0.04)]'
              }`}
              style={
                mainTab === 'live_studio'
                  ? {
                      background: 'rgba(127, 212, 255, 0.15)',
                      border: '1px solid rgba(127, 212, 255, 0.36)',
                      color: 'var(--color-one-accent)',
                    }
                  : { border: '1px solid transparent' }
              }
            >
              <Sparkles className="h-4 w-4" />
              <span>{lang === 'zh' ? 'AI 实景口语与出题' : 'Live Spoken Roleplay & Quiz'}</span>
            </button>

            <button
              type="button"
              onClick={() => setMainTab('english_engine')}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                mainTab === 'english_engine'
                  ? ''
                  : 'text-[color:var(--color-one-text-muted)] hover:text-[color:var(--color-one-text)] hover:bg-[rgba(244,243,238,0.04)]'
              }`}
              style={
                mainTab === 'english_engine'
                  ? {
                      background: 'rgba(127,212,255,0.14)',
                      border: '1px solid rgba(127,212,255,0.32)',
                      color: 'var(--color-one-accent)',
                    }
                  : { border: '1px solid transparent' }
              }
            >
              <Headphones className="h-4 w-4" />
              <span>{lang === 'zh' ? '英语精研引擎' : 'English Engine'}</span>
            </button>

            <button
              type="button"
              onClick={() => setMainTab('duolingo_platform')}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                mainTab === 'duolingo_platform'
                  ? ''
                  : 'text-[color:var(--color-one-text-muted)] hover:text-[color:var(--color-one-text)] hover:bg-[rgba(244,243,238,0.04)]'
              }`}
              style={
                mainTab === 'duolingo_platform'
                  ? {
                      background: 'rgba(16, 185, 129, 0.14)',
                      border: '1px solid rgba(16, 185, 129, 0.34)',
                      color: 'var(--color-one-success)',
                    }
                  : { border: '1px solid transparent' }
              }
            >
              <GraduationCap className="h-4 w-4" />
              <span>{lang === 'zh' ? '多语沉浸课程' : 'Multi-Language Immersion'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMainTab('letters');
                setView('home');
              }}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                mainTab === 'letters'
                  ? ''
                  : 'text-[color:var(--color-one-text-muted)] hover:text-[color:var(--color-one-text)] hover:bg-[rgba(244,243,238,0.04)]'
              }`}
              style={
                mainTab === 'letters'
                  ? {
                      background: 'rgba(215,182,118,0.14)',
                      border: '1px solid rgba(215,182,118,0.32)',
                      color: 'var(--color-one-gold)',
                    }
                  : { border: '1px solid transparent' }
              }
            >
              <BookOpen className="h-4 w-4" />
              <span>{lang === 'zh' ? '阿语字母与复习' : `${t.alphabet} · ${t.practice}`}</span>
            </button>
          </div>
        </div>

        {/* TAB 0: AUTHORITATIVE CAMBRIDGE / OXFORD BILINGUAL DICTIONARY */}
        {mainTab === 'dictionary' && <AuthoritativeDictionaryStudio lang={lang} />}

        {/* TAB 1: AI LIVE SPOKEN ROLEPLAY & QUIZ STUDIO */}
        {mainTab === 'live_studio' && (
          <LiveLanguageStudio lang={lang} variant="embedded" initialTargetLang="en" initialMode="roleplay" />
        )}

        {/* TAB 2: ENGLISH LEARNING ENGINE */}
        {mainTab === 'english_engine' && <EnglishLearningSection lang={lang} />}

        {/* TAB 3: MULTI-LANGUAGE IMMERSION PLATFORM */}
        {mainTab === 'duolingo_platform' && (
          <DuolingoImmersionPlatform
            lang={lang}
            onOpenEnglishEngine={() => setMainTab('english_engine')}
          />
        )}

        {/* TAB 4: ARABIC LETTERS & SPACED REPETITION */}
        {mainTab === 'letters' && (
          <div className="space-y-5">
            {view === 'home' && (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard icon={<GraduationCap className="h-4 w-4" />} label={t.letters} value={`${introducedCount}/${ARABIC_LETTERS.length}`} />
                  <StatCard icon={<RotateCcw className="h-4 w-4" />} label={t.due} value={String(dueCount)} accent="var(--color-one-gold)" />
                  <StatCard icon={<Flame className="h-4 w-4" />} label={t.streak} value={String(streak)} accent="var(--color-one-warning)" />
                  <StatCard icon={<Check className="h-4 w-4" />} label={t.mastered} value={`${masteredCount}/${ARABIC_LETTERS.length}`} accent="var(--color-one-success)" />
                </div>

                <section className="one-surface-elevated overflow-hidden">
                  <div className="border-b px-5 py-5 sm:px-6" style={{ borderColor: 'var(--color-one-border)' }}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-one-accent)' }}>
                          {t.practice}
                        </p>
                        <h2 className="mt-1 text-xl font-semibold text-[color:var(--color-one-text)]">{t.dailyGoal}</h2>
                      </div>
                      <span className="one-badge one-badge-neutral font-mono normal-case tracking-normal">
                        {practicedToday} / {DAILY_GOAL}
                      </span>
                    </div>
                    <div
                      className="mt-4 h-2 overflow-hidden rounded-full"
                      style={{ background: 'rgba(244,243,238,0.08)' }}
                      role="progressbar"
                      aria-label={t.dailyGoal}
                      aria-valuenow={practicedToday}
                      aria-valuemin={0}
                      aria-valuemax={DAILY_GOAL}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${goalProgress}%`,
                          background: 'linear-gradient(90deg, var(--color-one-accent), var(--color-one-gold))',
                        }}
                      />
                    </div>
                    <p className="mt-3 text-xs leading-5 text-[color:var(--color-one-text-dim)]">{t.dailyLimit}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 px-5 py-5 sm:px-6">
                    <button type="button" className="one-btn one-btn-md one-btn-primary" onClick={startPractice}>
                      <Headphones className="h-4 w-4" />
                      {t.startPractice}
                    </button>
                    <button type="button" className="one-btn one-btn-md one-btn-secondary" onClick={openAlphabet}>
                      {t.alphabet}
                    </button>
                  </div>
                  <p className="px-5 pb-5 text-xs text-[color:var(--color-one-text-dim)] sm:px-6">{t.localOnly}</p>
                </section>

                <section className="one-surface p-5 sm:p-6">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-one-text-dim)]">
                        28 · ARABIC LETTERS
                      </p>
                      <h2 className="mt-1 text-lg font-semibold text-[color:var(--color-one-text)]">{t.alphabet}</h2>
                    </div>
                    <button
                      type="button"
                      className="text-xs font-semibold transition hover:opacity-80 cursor-pointer"
                      style={{ color: 'var(--color-one-accent)' }}
                      onClick={openAlphabet}
                    >
                      {t.selectLetter}
                    </button>
                  </div>
                  <LetterGrid
                    selectedId={selectedLetterId}
                    onSelect={(id) => {
                      setSelectedLetterId(id);
                      openAlphabet();
                    }}
                  />
                </section>
              </>
            )}

            {view === 'alphabet' && (
              <>
                <button
                  type="button"
                  className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--color-one-text-muted)] hover:text-[color:var(--color-one-text)] cursor-pointer"
                  onClick={returnHome}
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t.back}
                </button>
                <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                  <section className="one-surface p-5 sm:p-6">
                    <h2 className="mb-4 text-lg font-semibold text-[color:var(--color-one-text)]">{t.alphabet}</h2>
                    <LetterGrid selectedId={selectedLetterId} onSelect={setSelectedLetterId} />
                  </section>
                  <LetterDetail letter={selectedLetter} t={t} lang={lang} onSpeak={speak} voiceMessage={voiceMessage} />
                </div>
              </>
            )}

            {view === 'practice' && (
              <>
                <button
                  type="button"
                  className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--color-one-text-muted)] hover:text-[color:var(--color-one-text)] cursor-pointer"
                  onClick={returnHome}
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t.returnHome}
                </button>
                {sessionDone ? (
                  <section className="one-surface-elevated mx-auto max-w-2xl p-6 text-center sm:p-10">
                    <div
                      className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border"
                      style={{
                        borderColor: 'rgba(76,195,138,0.3)',
                        background: 'rgba(76,195,138,0.1)',
                        color: 'var(--color-one-success)',
                      }}
                    >
                      <Check className="h-7 w-7" />
                    </div>
                    <h2 className="text-2xl font-semibold text-[color:var(--color-one-text)]">
                      {queue.length ? t.sessionDone : t.caughtUp}
                    </h2>
                    <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[color:var(--color-one-text-muted)]">
                      {queue.length ? t.sessionDoneHint : t.caughtUpHint}
                    </p>
                    <div className="mt-6 flex flex-wrap justify-center gap-3">
                      {queue.length > 0 && (
                        <button type="button" className="one-btn one-btn-md one-btn-primary" onClick={startPractice}>
                          {t.nextSession}
                        </button>
                      )}
                      <button type="button" className="one-btn one-btn-md one-btn-secondary" onClick={openAlphabet}>
                        {t.alphabet}
                      </button>
                      <button type="button" className="one-btn one-btn-md one-btn-ghost" onClick={returnHome}>
                        {t.returnHome}
                      </button>
                    </div>
                  </section>
                ) : activeLetter ? (
                  <section className="one-surface-elevated mx-auto max-w-2xl overflow-hidden">
                    <div
                      className="flex items-center justify-between border-b px-5 py-4 sm:px-7"
                      style={{ borderColor: 'var(--color-one-border)' }}
                    >
                      <span className="text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: 'var(--color-one-accent)' }}>
                        {t.practice}
                      </span>
                      <span className="text-xs tabular-nums text-[color:var(--color-one-text-dim)]">
                        {queueIndex + 1} / {queue.length}
                      </span>
                    </div>
                    <div className="px-5 py-8 text-center sm:px-8 sm:py-10">
                      <p className="text-xs text-[color:var(--color-one-text-dim)]">{t.question}</p>
                      <div
                        dir="rtl"
                        lang="ar"
                        className="my-5 font-serif text-8xl leading-none text-[color:var(--color-one-text)] sm:text-9xl"
                      >
                        {activeLetter.id}
                      </div>
                      {!revealed ? (
                        <button
                          type="button"
                          className="one-btn one-btn-md one-btn-primary"
                          onClick={() => setRevealed(true)}
                        >
                          {t.reveal}
                        </button>
                      ) : (
                        <div className="mx-auto max-w-xl text-left">
                          <p
                            className="mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.15em]"
                            style={{ color: 'var(--color-one-accent)' }}
                          >
                            {t.answer}
                          </p>
                          <LetterDetail
                            letter={activeLetter}
                            t={t}
                            lang={lang}
                            onSpeak={speak}
                            voiceMessage={voiceMessage}
                            compact
                          />
                          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <RatingButton label={t.again} tone="danger" onClick={() => rateCurrentCard('again')} />
                            <RatingButton label={t.hard} tone="warning" onClick={() => rateCurrentCard('hard')} />
                            <RatingButton label={t.good} tone="accent" onClick={() => rateCurrentCard('good')} />
                            <RatingButton label={t.easy} tone="success" onClick={() => rateCurrentCard('easy')} />
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="one-surface p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium text-[color:var(--color-one-text-dim)]">
        <span style={accent ? { color: accent } : undefined}>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums text-[color:var(--color-one-text)]">{value}</div>
    </div>
  );
}

function LetterGrid({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
      {ARABIC_LETTERS.map((letter) => {
        const active = selectedId === letter.id;
        return (
          <button
            key={letter.id}
            type="button"
            onClick={() => onSelect(letter.id)}
            aria-label={`${letter.id} ${letter.nameLatin}`}
            aria-pressed={active}
            className="flex aspect-square flex-col items-center justify-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 cursor-pointer"
            style={
              active
                ? {
                    borderColor: 'rgba(127,212,255,0.45)',
                    background: 'rgba(127,212,255,0.12)',
                    color: 'var(--color-one-accent)',
                  }
                : {
                    borderColor: 'var(--color-one-border)',
                    background: 'var(--color-one-surface-soft)',
                    color: 'var(--color-one-text)',
                  }
            }
          >
            <span dir="rtl" lang="ar" className="font-serif text-3xl leading-none">
              {letter.id}
            </span>
            <span className="mt-1 text-[9px] text-[color:var(--color-one-text-dim)]">{letter.nameLatin}</span>
          </button>
        );
      })}
    </div>
  );
}

function LetterDetail({
  letter,
  t,
  lang,
  onSpeak,
  voiceMessage,
  compact = false,
}: {
  letter: ArabicLetter;
  t: Copy;
  lang: Language;
  onSpeak: (text: string) => void;
  voiceMessage: string;
  compact?: boolean;
}) {
  const soundHint = lang === 'zh' ? letter.soundZh : letter.soundEn;
  const meaning = lang === 'zh' ? letter.meaningZh : letter.meaningEn;
  return (
    <div className={`one-surface ${compact ? 'p-4' : 'p-5 sm:p-6'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <span
            dir="rtl"
            lang="ar"
            className={`font-serif leading-none text-[color:var(--color-one-text)] ${compact ? 'text-5xl' : 'text-6xl'}`}
          >
            {letter.id}
          </span>
          <div>
            <p dir="rtl" lang="ar" className="text-xl font-semibold text-[color:var(--color-one-text)]">
              {letter.nameArabic}
            </p>
            <p className="mt-1 text-xs text-[color:var(--color-one-text-dim)]">{letter.nameLatin}</p>
          </div>
        </div>
        <button type="button" className="one-btn one-btn-sm one-btn-secondary" onClick={() => onSpeak(letter.id)}>
          <Volume2 className="h-4 w-4" />
          {t.listen}
        </button>
      </div>
      <p className="mt-4 text-sm leading-6 text-[color:var(--color-one-text-muted)]">{soundHint}</p>
      <div className="mt-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-one-text-dim)]">
          {t.forms}
        </p>
        <div className="grid grid-cols-4 gap-2">
          {([
            ['isolated', t.isolated, letter.forms.isolated],
            ['initial', t.initial, letter.forms.initial],
            ['medial', t.medial, letter.forms.medial],
            ['final', t.final, letter.forms.final],
          ] as const).map(([key, label, form]) => (
            <div
              key={key}
              className="rounded-xl border p-2 text-center"
              style={{ borderColor: 'var(--color-one-border)', background: 'var(--color-one-surface-soft)' }}
            >
              <span className="block text-[9px] text-[color:var(--color-one-text-dim)]">{label}</span>
              <span dir="rtl" lang="ar" className="mt-1 block font-serif text-2xl text-[color:var(--color-one-text)]">
                {form}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div
        className="mt-4 rounded-xl border p-3"
        style={{ borderColor: 'var(--color-one-border)', background: 'var(--color-one-surface-soft)' }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-one-text-dim)]">
          {t.example}
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span dir="rtl" lang="ar" className="font-serif text-2xl" style={{ color: 'var(--color-one-accent)' }}>
            {letter.exampleArabic}
          </span>
          <span className="text-xs text-[color:var(--color-one-text-dim)]">{letter.exampleLatin}</span>
          <span className="text-sm text-[color:var(--color-one-text)]">{meaning}</span>
        </div>
      </div>
      {voiceMessage && (
        <p role="status" className="mt-3 text-xs" style={{ color: 'var(--color-one-warning)' }}>
          {voiceMessage}
        </p>
      )}
    </div>
  );
}

function RatingButton({
  label,
  tone,
  onClick,
}: {
  label: string;
  tone: 'danger' | 'warning' | 'accent' | 'success';
  onClick: () => void;
}) {
  const tones = {
    danger: { border: 'rgba(224,122,122,0.32)', bg: 'rgba(224,122,122,0.12)', color: 'var(--color-one-danger)' },
    warning: { border: 'rgba(227,179,65,0.32)', bg: 'rgba(227,179,65,0.12)', color: 'var(--color-one-warning)' },
    accent: { border: 'rgba(127,212,255,0.32)', bg: 'rgba(127,212,255,0.12)', color: 'var(--color-one-accent)' },
    success: { border: 'rgba(76,195,138,0.32)', bg: 'rgba(76,195,138,0.12)', color: 'var(--color-one-success)' },
  } as const;
  const t = tones[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 rounded-xl border px-2 py-2 text-xs font-semibold transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 cursor-pointer"
      style={{ borderColor: t.border, background: t.bg, color: t.color }}
    >
      {label}
    </button>
  );
}
