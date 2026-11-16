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
  Volume2,
  Search,
  Download,
  ExternalLink,
  Sparkles,
  BookMarked,
  Filter,
  RefreshCw,
  Library,
  Eye,
  X
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
import {
  CANONICAL_ISLAMIC_BOOKS,
  type IslamicLibraryBook,
  type IslamicLibraryCategory,
  type IslamicLibrarySource
} from './islamicLibraryData.ts';

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
    title: '阿拉伯语与伊斯兰古籍研习',
    subtitle: '从字母基础到各大伊斯兰数字图书馆典籍，连接全球阿拉伯语古典文献与语言智慧。',
    practice: '今日复习',
    alphabet: '字母表',
    library: '伊斯兰数字图书馆',
    libraryHint: '直通沙米拉、瓦克菲亚、努尔图书馆与全球伊斯兰数字文献',
    letters: '字母',
    due: '待复习',
    streak: '连续学习',
    today: '今日练习',
    mastered: '已复习字母',
    dailyGoal: '每日目标',
    startPractice: '开始今日练习',
    dailyLimit: '每日最多加入 5 个新字母；到期卡片优先。',
    localOnly: '进度保存在本地；古籍文献实时联动各大公开数字图书馆。',
    caughtUp: '今天已完成',
    caughtUpHint: '目前没有到期卡片，也可以浏览下方伊斯兰图书馆藏书。',
    returnHome: '返回学习首页',
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
    reviewProgress: '掌握进度',
    openLibrary: '浏览全球图书馆',
    isolated: '单独',
    initial: '词首',
    medial: '词中',
    final: '词尾'
  },
  en: {
    title: 'Arabic Learning & Islamic Library',
    subtitle:
      'From alphabet fundamentals to major Islamic digital libraries, accessing classical Arabic literature and linguistic wisdom.',
    practice: "Today's review",
    alphabet: 'Alphabet',
    library: 'Islamic Digital Library',
    libraryHint: 'Connected to Shamela, Waqfeya, Noor, and global Islamic manuscript repositories',
    letters: 'Letters',
    due: 'Due',
    streak: 'Day streak',
    today: 'Practiced today',
    mastered: 'Reviewed letters',
    dailyGoal: 'Daily goal',
    startPractice: "Start today's practice",
    dailyLimit: 'Up to 5 new letters per day; due cards come first.',
    localOnly: 'Progress stays in this browser; classical texts sync with public Islamic libraries.',
    caughtUp: 'You are caught up',
    caughtUpHint: 'No cards are due. Explore the Islamic Digital Library below.',
    returnHome: 'Back to learning home',
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
    reviewProgress: 'Learning progress',
    openLibrary: 'Browse global library',
    isolated: 'Isolated',
    initial: 'Initial',
    medial: 'Medial',
    final: 'Final'
  },
  ar: {
    title: 'تعلّم العربية والمكتبات الإسلامية',
    subtitle: 'من أساسيات الحروف الهجائية إلى كبريات المكتبات الإسلامية الرقمية والمخطوطات التراثية الأصيلة.',
    practice: 'مراجعة اليوم',
    alphabet: 'الأبجدية',
    library: 'المكتبات الإسلامية الرقمية',
    libraryHint: 'مرتبط بالمكتبة الشاملة والوقفية ومكتبة نور وأرشيف المخطوطات العالمي',
    letters: 'الحروف',
    due: 'للمراجعة',
    streak: 'أيام متتالية',
    today: 'تدرّبت اليوم',
    mastered: 'حروف راجعتها',
    dailyGoal: 'الهدف اليومي',
    startPractice: 'ابدأ تدريب اليوم',
    dailyLimit: 'تُضاف خمسة حروف جديدة كحد أقصى يوميًا؛ وتظهر البطاقات المستحقة أولًا.',
    localOnly: 'يبقى التقدّم محفوظًا؛ والكتب متصلة بالمكتبات الإسلامية المفتوحة.',
    caughtUp: 'أنهيت تدريب اليوم',
    caughtUpHint: 'لا توجد بطاقات مستحقة، تصفح ذخائر المكتبة الإسلامية أدناه.',
    returnHome: 'العودة إلى صفحة التعلّم',
    question: 'ما هذا الحرف؟',
    reveal: 'أظهر الإجابة',
    answer: 'اسم الحرف ودليل النطق',
    forms: 'أشكال الحرف',
    example: 'مثال',
    listen: 'استمع إلى نطق الجهاز',
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
    reviewProgress: 'تقدّم التعلّم',
    openLibrary: 'تصفّح المكتبة العالمية',
    isolated: 'منفصل',
    initial: 'أول الكلمة',
    medial: 'وسط الكلمة',
    final: 'آخر الكلمة'
  },
  es: {
    title: 'Aprendizaje de árabe y biblioteca islámica',
    subtitle: 'Desde los conceptos básicos del alfabeto hasta las principales bibliotecas digitales islámicas.',
    practice: 'Repaso de hoy',
    alphabet: 'Alfabeto',
    library: 'Biblioteca Islámica Digital',
    libraryHint: 'Conectado a Shamela, Waqfeya, Noor y archivos globales',
    letters: 'Letras',
    due: 'Pendientes',
    streak: 'Días seguidos',
    today: 'Practicadas hoy',
    mastered: 'Letras repasadas',
    dailyGoal: 'Meta diaria',
    startPractice: 'Empezar la práctica de hoy',
    dailyLimit: 'Hasta 5 letras nuevas al día; primero aparecen las tarjetas pendientes.',
    localOnly: 'El progreso queda en este navegador.',
    caughtUp: 'Has terminado por hoy',
    caughtUpHint: 'No hay tarjetas pendientes.',
    returnHome: 'Volver al inicio',
    question: '¿Qué letra es?',
    reveal: 'Mostrar respuesta',
    answer: 'Nombre y pista de pronunciación',
    forms: 'Formas de la letra',
    example: 'Ejemplo',
    listen: 'Escuchar pronunciación del dispositivo',
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
    reviewProgress: 'Progreso de aprendizaje',
    openLibrary: 'Abrir biblioteca global',
    isolated: 'Aislada',
    initial: 'Inicial',
    medial: 'Medial',
    final: 'Final'
  },
  fr: {
    title: 'Apprentissage de l’arabe et bibliothèque islamique',
    subtitle: 'De l’alphabet aux grandes bibliothèques numériques islamiques et manuscrits classiques.',
    practice: 'Révision du jour',
    alphabet: 'Alphabet',
    library: 'Bibliothèque islamique',
    libraryHint: 'Connecté à Shamela, Waqfeya, Noor et aux archives islamiques',
    letters: 'Lettres',
    due: 'À réviser',
    streak: 'Jours consécutifs',
    today: 'Pratiquées aujourd’hui',
    mastered: 'Lettres révisées',
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
    listen: 'Écouter la prononciation de l’appareil',
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
    reviewProgress: 'Progression',
    openLibrary: 'Ouvrir la bibliothèque globale',
    isolated: 'Isolée',
    initial: 'Initiale',
    medial: 'Médiane',
    final: 'Finale'
  },
  ru: {
    title: 'Изучение арабского и исламская библиотека',
    subtitle: 'От основ алфавита до крупнейших исламских электронных библиотек и рукописей.',
    practice: 'Повторение на сегодня',
    alphabet: 'Алфавит',
    library: 'Исламская библиотека',
    libraryHint: 'Подключено к Shamela, Waqfeya, Noor и мировым архивам',
    letters: 'Буквы',
    due: 'К повторению',
    streak: 'Дней подряд',
    today: 'Практика сегодня',
    mastered: 'Повторено букв',
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
    listen: 'Прослушать произношение устройства',
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
    reviewProgress: 'Прогресс обучения',
    openLibrary: 'Открыть мировую библиотеку',
    isolated: 'Изолированная',
    initial: 'Начальная',
    medial: 'Средняя',
    final: 'Конечная'
  }
};

interface ArabicLearningHubProps {
  lang: Language;
  onOpenLibrary: () => void;
}

type MainTab = 'letters' | 'islamic_library';
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
  const isRtl = lang === 'ar';

  // Navigation state
  const [mainTab, setMainTab] = useState<MainTab>('islamic_library');
  const [study, setStudy] = useState<ArabicStudyState>(readSavedProgress);
  const [view, setView] = useState<View>('home');
  const [selectedLetterId, setSelectedLetterId] = useState<string>(ARABIC_LETTERS[0].id);
  const [queue, setQueue] = useState<string[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState('');

  // Islamic Library Crawler state
  const [libraryBooks, setLibraryBooks] = useState<IslamicLibraryBook[]>(CANONICAL_ISLAMIC_BOOKS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<IslamicLibraryCategory | 'all'>('all');
  const [selectedSource, setSelectedSource] = useState<IslamicLibrarySource | 'all'>('all');
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlFeedback, setCrawlFeedback] = useState<string | null>(null);
  const [readingBook, setReadingBook] = useState<IslamicLibraryBook | null>(null);

  // Save progress locally
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(study));
    } catch {}
  }, [study]);

  // Clean voice synth on unmount
  useEffect(
    () => () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    },
    []
  );

  // Fetch initial books from API
  useEffect(() => {
    fetch('/api/learning/arabic/islamic-libraries?limit=30')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.books) && data.books.length > 0) {
          setLibraryBooks(data.books);
        }
      })
      .catch(() => {});
  }, []);

  // Filter books in memory
  const filteredBooks = useMemo(() => {
    return libraryBooks.filter((book) => {
      if (selectedCategory !== 'all' && book.category !== selectedCategory) {
        return false;
      }
      if (selectedSource !== 'all' && book.librarySource !== selectedSource) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle =
          book.title.toLowerCase().includes(q) ||
          (book.titleZh || '').toLowerCase().includes(q) ||
          (book.titleEn || '').toLowerCase().includes(q);
        const matchAuthor =
          book.author.toLowerCase().includes(q) ||
          (book.authorZh || '').toLowerCase().includes(q) ||
          (book.authorEn || '').toLowerCase().includes(q);
        const matchDesc = book.description.toLowerCase().includes(q);
        const matchTags = book.tags.some((tag) => tag.toLowerCase().includes(q));
        if (!matchTitle && !matchAuthor && !matchDesc && !matchTags) return false;
      }
      return true;
    });
  }, [libraryBooks, selectedCategory, selectedSource, searchQuery]);

  // Run Real Live Crawler Action
  const handleTriggerCrawler = async () => {
    setIsCrawling(true);
    setCrawlFeedback('正在发起多源爬虫：连接沙米拉、瓦克菲亚、努尔图书馆与网络档案局...');

    try {
      const res = await fetch('/api/learning/arabic/islamic-libraries/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery.trim() || 'grammar',
          category: selectedCategory === 'all' ? undefined : selectedCategory
        })
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.books)) {
        setLibraryBooks(data.books);
        setCrawlFeedback(data.message || `爬取成功！已聚合 ${data.books.length} 部经典文献与手稿。`);
      } else {
        setCrawlFeedback('爬虫执行完毕，已同步最新馆藏。');
      }
    } catch {
      setCrawlFeedback('网络爬取异常，已加载预置的高精经典典籍。');
    } finally {
      setIsCrawling(false);
      setTimeout(() => setCrawlFeedback(null), 5000);
    }
  };

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
        studyDays: [...nextDays].sort()
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
        {/* Hero / Header */}
        <header className="one-surface-elevated relative overflow-hidden px-5 py-6 sm:px-7 sm:py-7">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-30 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(215,182,118,0.35), transparent 70%)' }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -left-20 bottom-0 h-48 w-48 rounded-full opacity-20 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(127,212,255,0.35), transparent 70%)' }}
          />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex max-w-3xl items-start gap-4">
              <div
                className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border"
                style={{
                  borderColor: 'rgba(215,182,118,0.28)',
                  background: 'rgba(215,182,118,0.1)',
                  color: 'var(--color-one-gold)'
                }}
              >
                <Library className="h-6 w-6" />
              </div>
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="one-badge one-badge-gold">ONE · LEARNING</span>
                  <span className="one-badge one-badge-neutral">5 LIBRARIES</span>
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--color-one-text)] sm:text-3xl">
                  {t.title}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--color-one-text-muted)]">
                  {t.subtitle}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="one-btn one-btn-md one-btn-secondary" onClick={onOpenLibrary}>
                <BookOpen className="h-4 w-4" style={{ color: 'var(--color-one-gold)' }} />
                <span>{t.openLibrary}</span>
              </button>
            </div>
          </div>
        </header>

        {/* Primary tabs */}
        <div className="one-surface-subtle flex flex-col gap-3 p-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMainTab('islamic_library')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                mainTab === 'islamic_library'
                  ? 'text-[color:var(--color-one-text)]'
                  : 'text-[color:var(--color-one-text-muted)] hover:text-[color:var(--color-one-text)] hover:bg-[rgba(244,243,238,0.04)]'
              }`}
              style={
                mainTab === 'islamic_library'
                  ? {
                      background: 'rgba(215,182,118,0.14)',
                      border: '1px solid rgba(215,182,118,0.28)',
                      color: 'var(--color-one-gold)'
                    }
                  : { border: '1px solid transparent' }
              }
            >
              <BookMarked className="h-4 w-4" />
              <span>{lang === 'zh' ? '各大伊斯兰数字图书馆与古籍爬虫' : t.library}</span>
              <span className="rounded-md px-1.5 py-0.5 text-[11px] font-mono" style={{ background: 'rgba(244,243,238,0.08)' }}>
                {libraryBooks.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMainTab('letters');
                setView('home');
              }}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                mainTab === 'letters'
                  ? ''
                  : 'text-[color:var(--color-one-text-muted)] hover:text-[color:var(--color-one-text)] hover:bg-[rgba(244,243,238,0.04)]'
              }`}
              style={
                mainTab === 'letters'
                  ? {
                      background: 'rgba(127,212,255,0.14)',
                      border: '1px solid rgba(127,212,255,0.28)',
                      color: 'var(--color-one-accent)'
                    }
                  : { border: '1px solid transparent' }
              }
            >
              <GraduationCap className="h-4 w-4" />
              <span>{lang === 'zh' ? '字母发音与间隔记忆复习' : `${t.alphabet} · ${t.practice}`}</span>
            </button>
          </div>

          <div className="hidden items-center gap-3 pr-2 text-xs text-[color:var(--color-one-text-dim)] sm:flex">
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-one-success)]" />
              <span>CRAWLER ACTIVE</span>
            </span>
            <span className="font-mono tracking-wide">SHAMELA · WAQFEYA · NOOR · ARCHIVE</span>
          </div>
        </div>

        {/* ============================================================= */}
        {/* TAB 1: ISLAMIC DIGITAL LIBRARIES & MANUSCRIPT CRAWLER          */}
        {/* ============================================================= */}
        {mainTab === 'islamic_library' && (
          <div className="space-y-5">
            <div className="one-surface p-5 sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative flex-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[color:var(--color-one-text-dim)]">
                    <Search className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="在各大伊斯兰图书馆中检索 (如: لسان العرب, 语法, Ajrumiyyah, Tafsir, Ibn Manzur)..."
                    className="w-full rounded-xl border bg-[color:var(--color-one-surface-soft)] py-2.5 pl-10 pr-10 text-sm text-[color:var(--color-one-text)] placeholder-[color:var(--color-one-text-dim)] transition focus:border-[rgba(215,182,118,0.45)] focus:outline-none focus:ring-1 focus:ring-[rgba(215,182,118,0.35)]"
                    style={{ borderColor: 'var(--color-one-border)' }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-[color:var(--color-one-text-dim)] hover:text-[color:var(--color-one-text)]"
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleTriggerCrawler}
                    disabled={isCrawling}
                    className="one-btn one-btn-md one-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw className={`h-4 w-4 ${isCrawling ? 'animate-spin' : ''}`} />
                    <span>{isCrawling ? '正在爬取各大图书馆...' : '启动爬虫抓取新文献'}</span>
                  </button>
                </div>
              </div>

              {crawlFeedback && (
                <div
                  className="mt-4 flex items-start gap-2 rounded-xl border px-3.5 py-3 text-sm"
                  style={{
                    borderColor: 'rgba(215,182,118,0.28)',
                    background: 'rgba(215,182,118,0.08)',
                    color: 'var(--color-one-text)'
                  }}
                  role="status"
                >
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--color-one-gold)' }} />
                  <span className="text-[color:var(--color-one-text-muted)]">{crawlFeedback}</span>
                </div>
              )}

              <div className="mt-5 flex flex-col gap-4 border-t pt-4" style={{ borderColor: 'var(--color-one-border)' }}>
                <div className="flex flex-col gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-one-text-dim)]">
                    <Filter className="h-3.5 w-3.5" /> 分类
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: 'all', label: '全部典籍' },
                      { id: 'grammar', label: '语法与词法 (النحو والصرف)' },
                      { id: 'lexicon', label: '权威辞书 (المعاجم)' },
                      { id: 'quran_tafsir', label: '经注学 (التفسير)' },
                      { id: 'hadith', label: '圣训与传记 (الحديث)' },
                      { id: 'literature', label: '文学与修辞 (الأدب والبلاغة)' },
                      { id: 'learning', label: '综合教材 (تعليم العربية)' }
                    ].map((c) => {
                      const active = selectedCategory === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedCategory(c.id as any)}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                          style={
                            active
                              ? {
                                  color: 'var(--color-one-gold)',
                                  background: 'rgba(215,182,118,0.14)',
                                  border: '1px solid rgba(215,182,118,0.28)'
                                }
                              : {
                                  color: 'var(--color-one-text-muted)',
                                  background: 'rgba(244,243,238,0.03)',
                                  border: '1px solid var(--color-one-border)'
                                }
                          }
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-one-text-dim)]">
                    馆藏源
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: 'all', label: '全部来源' },
                      { id: 'shamela', label: 'المكتبة الشاملة' },
                      { id: 'waqfeya', label: 'المكتبة الوقفية' },
                      { id: 'noor', label: 'مكتبة نور' },
                      { id: 'internet_archive', label: 'Internet Archive' },
                      { id: 'wikisource', label: 'Wikisource' }
                    ].map((s) => {
                      const active = selectedSource === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSelectedSource(s.id as any)}
                          className="rounded-lg px-2.5 py-1.5 text-[11px] font-mono transition-all"
                          style={
                            active
                              ? {
                                  color: 'var(--color-one-accent)',
                                  background: 'rgba(127,212,255,0.12)',
                                  border: '1px solid rgba(127,212,255,0.26)'
                                }
                              : {
                                  color: 'var(--color-one-text-dim)',
                                  background: 'rgba(244,243,238,0.02)',
                                  border: '1px solid var(--color-one-border)'
                                }
                          }
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {filteredBooks.length === 0 ? (
              <div className="one-surface flex flex-col items-center justify-center px-6 py-14 text-center">
                <div
                  className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border"
                  style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.03)' }}
                >
                  <Library className="h-7 w-7 text-[color:var(--color-one-text-dim)]" />
                </div>
                <h3 className="text-base font-semibold text-[color:var(--color-one-text)]">未找到符合条件的古籍文献</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-[color:var(--color-one-text-muted)]">
                  尝试切换分类或来源，或点击“启动爬虫抓取新文献”向网络档案与数字图书馆发起检索。
                </p>
                <button type="button" onClick={handleTriggerCrawler} className="one-btn one-btn-md one-btn-secondary mt-5">
                  <RefreshCw className={`h-4 w-4 ${isCrawling ? 'animate-spin' : ''}`} />
                  启动全局网络爬虫检索
                </button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredBooks.map((book) => {
                  const sourceTone: Record<string, { color: string; bg: string; border: string }> = {
                    shamela: { color: 'var(--color-one-gold)', bg: 'rgba(215,182,118,0.12)', border: 'rgba(215,182,118,0.26)' },
                    waqfeya: { color: 'var(--color-one-accent)', bg: 'rgba(127,212,255,0.12)', border: 'rgba(127,212,255,0.26)' },
                    noor: { color: 'var(--color-one-success)', bg: 'rgba(76,195,138,0.12)', border: 'rgba(76,195,138,0.26)' },
                    internet_archive: { color: 'var(--color-one-text)', bg: 'rgba(244,243,238,0.08)', border: 'rgba(244,243,238,0.18)' },
                    wikisource: { color: 'var(--color-one-text-muted)', bg: 'rgba(244,243,238,0.06)', border: 'var(--color-one-border)' }
                  };
                  const tone = sourceTone[book.librarySource] || sourceTone.wikisource;

                  return (
                    <article
                      key={book.id}
                      className="one-surface group flex flex-col justify-between p-5 transition-all hover:-translate-y-0.5"
                      style={{ borderColor: 'var(--color-one-border)' }}
                    >
                      <div>
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <span
                            className="rounded-md px-2.5 py-1 text-[10px] font-mono"
                            style={{ color: tone.color, background: tone.bg, border: `1px solid ${tone.border}` }}
                          >
                            {book.librarySourceNameAr}
                          </span>
                          <div className="flex items-center gap-1.5 text-[11px] text-[color:var(--color-one-text-dim)]">
                            <span>{book.categoryLabelZh}</span>
                            {book.year && <span>· {book.year}</span>}
                          </div>
                        </div>

                        <div className="flex items-start gap-4">
                          {book.coverImage ? (
                            <img
                              src={book.coverImage}
                              alt={book.title}
                              className="h-24 w-16 shrink-0 rounded-lg border object-cover"
                              style={{ borderColor: 'var(--color-one-border)', background: 'var(--color-one-surface-soft)' }}
                              loading="lazy"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div
                              className="flex h-24 w-16 shrink-0 items-center justify-center rounded-lg border"
                              style={{ borderColor: 'var(--color-one-border)', background: 'var(--color-one-surface-soft)' }}
                            >
                              <BookOpen className="h-6 w-6 text-[color:var(--color-one-text-dim)]" />
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <h3
                                dir="rtl"
                                lang="ar"
                                className="truncate font-serif text-lg font-semibold leading-snug text-[color:var(--color-one-text)]"
                                title={book.title}
                              >
                                {book.title}
                              </h3>
                              <button
                                type="button"
                                onClick={() => speak(book.title)}
                                className="rounded-md p-1.5 text-[color:var(--color-one-text-dim)] transition hover:bg-[rgba(244,243,238,0.06)] hover:text-[color:var(--color-one-accent)]"
                                title="朗读阿语书名"
                              >
                                <Volume2 className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {book.titleZh && (
                              <p className="mt-0.5 line-clamp-1 text-xs font-medium text-[color:var(--color-one-text-muted)]">
                                {book.titleZh}
                              </p>
                            )}
                            <p dir="rtl" lang="ar" className="mt-1 truncate text-xs" style={{ color: 'var(--color-one-gold)' }}>
                              {book.author}
                            </p>
                            {book.authorZh && (
                              <p className="truncate text-[11px] text-[color:var(--color-one-text-dim)]">作者: {book.authorZh}</p>
                            )}
                          </div>
                        </div>

                        <p className="mt-3.5 line-clamp-2 text-xs leading-relaxed text-[color:var(--color-one-text-muted)]">
                          {book.description}
                        </p>

                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          {book.volumes && (
                            <span className="one-badge one-badge-neutral font-mono normal-case tracking-normal">{book.volumes} 卷本</span>
                          )}
                          {book.tags.slice(0, 3).map((tag, idx) => (
                            <span
                              key={idx}
                              className="rounded-md px-1.5 py-0.5 text-[10px]"
                              style={{ color: 'var(--color-one-text-dim)', background: 'rgba(244,243,238,0.04)' }}
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="mt-5 flex items-center justify-between gap-2 border-t pt-3.5" style={{ borderColor: 'var(--color-one-border)' }}>
                        <div className="flex items-center gap-2">
                          {book.embedUrl ? (
                            <button
                              type="button"
                              onClick={() => setReadingBook(book)}
                              className="one-btn one-btn-sm one-btn-secondary"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>在线阅读</span>
                            </button>
                          ) : null}
                          {book.pdfUrl ? (
                            <a
                              href={book.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="one-btn one-btn-sm one-btn-ghost"
                              title="下载高清原典 PDF"
                            >
                              <Download className="h-3.5 w-3.5" style={{ color: 'var(--color-one-gold)' }} />
                              <span>PDF</span>
                            </a>
                          ) : null}
                        </div>

                        <a
                          href={book.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-[color:var(--color-one-text-dim)] transition hover:text-[color:var(--color-one-accent)]"
                          title="访问图书馆原始馆藏页"
                        >
                          <span className="font-mono text-[11px]">原站馆藏</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============================================================= */}
        {/* TAB 2: LETTERS & SPACED REPETITION                            */}
        {/* ============================================================= */}
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

                <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
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
                            background: 'linear-gradient(90deg, var(--color-one-accent), var(--color-one-gold))'
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
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-one-gold)' }}>
                          ISLAMIC REPOSITORIES
                        </p>
                        <h2 className="mt-1 text-lg font-semibold text-[color:var(--color-one-text)]">伊斯兰各大图书馆藏</h2>
                      </div>
                      <Library className="h-5 w-5" style={{ color: 'var(--color-one-gold)' }} />
                    </div>
                    <p className="mb-5 text-sm leading-6 text-[color:var(--color-one-text-muted)]">
                      直通沙米拉、瓦克菲亚、努尔图书馆，获取《阿拉伯人之舌》、《阿季鲁米叶》等古典原典与语法注疏。
                    </p>
                    <button type="button" className="one-btn one-btn-md one-btn-secondary w-full justify-between" onClick={() => setMainTab('islamic_library')}>
                      <span className="inline-flex items-center gap-2">
                        <BookMarked className="h-4 w-4" style={{ color: 'var(--color-one-gold)' }} />
                        <span>查看古籍文献库</span>
                      </span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </section>
                </div>

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
                      className="text-xs font-semibold transition hover:opacity-80"
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
                  className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--color-one-text-muted)] hover:text-[color:var(--color-one-text)]"
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
                  className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--color-one-text-muted)] hover:text-[color:var(--color-one-text)]"
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
                        color: 'var(--color-one-success)'
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

        {/* In-Hub Online Reader Modal */}
        {readingBook && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
            style={{ background: 'rgba(5,7,11,0.82)', backdropFilter: 'blur(10px)' }}
            role="dialog"
            aria-modal="true"
            aria-label={readingBook.title}
          >
            <div className="one-surface-elevated relative flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden">
              <div
                className="flex items-center justify-between gap-3 border-b px-4 py-3.5 sm:px-5"
                style={{ borderColor: 'var(--color-one-border)', background: 'rgba(21,27,38,0.6)' }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
                    style={{
                      borderColor: 'rgba(215,182,118,0.28)',
                      background: 'rgba(215,182,118,0.1)',
                      color: 'var(--color-one-gold)'
                    }}
                  >
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 dir="rtl" lang="ar" className="truncate font-serif text-base font-semibold text-[color:var(--color-one-text)]">
                      {readingBook.title}
                    </h3>
                    <p className="truncate text-xs text-[color:var(--color-one-text-muted)]">
                      {readingBook.titleZh || readingBook.titleEn || readingBook.author} · {readingBook.librarySourceNameZh}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <a
                    href={readingBook.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="one-btn one-btn-sm one-btn-ghost"
                    title="新窗口打开原始地址"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setReadingBook(null)}
                    className="one-btn one-btn-sm one-btn-ghost"
                    aria-label="Close reader"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="relative flex-1" style={{ background: 'var(--color-one-bg-deep)' }}>
                {readingBook.embedUrl ? (
                  <iframe src={readingBook.embedUrl} title={readingBook.title} className="h-full w-full border-0" allowFullScreen />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                    <BookOpen className="mb-3 h-12 w-12 text-[color:var(--color-one-text-dim)]" />
                    <p className="font-medium text-[color:var(--color-one-text)]">该文献未提供内嵌阅读器</p>
                    <a
                      href={readingBook.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="one-btn one-btn-md one-btn-secondary mt-4"
                    >
                      <span>前往 {readingBook.librarySourceNameZh} 原站阅读</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </div>
            </div>
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
  accent
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
            className="flex aspect-square flex-col items-center justify-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2"
            style={
              active
                ? {
                    borderColor: 'rgba(127,212,255,0.45)',
                    background: 'rgba(127,212,255,0.12)',
                    color: 'var(--color-one-accent)'
                  }
                : {
                    borderColor: 'var(--color-one-border)',
                    background: 'rgba(244,243,238,0.02)',
                    color: 'var(--color-one-text)'
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
  compact = false
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
            ['final', t.final, letter.forms.final]
          ] as const).map(([key, label, form]) => (
            <div
              key={key}
              className="rounded-xl border p-2 text-center"
              style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.02)' }}
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
        style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.02)' }}
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
  onClick
}: {
  label: string;
  tone: 'danger' | 'warning' | 'accent' | 'success';
  onClick: () => void;
}) {
  const tones = {
    danger: { border: 'rgba(224,122,122,0.32)', bg: 'rgba(224,122,122,0.12)', color: 'var(--color-one-danger)' },
    warning: { border: 'rgba(227,179,65,0.32)', bg: 'rgba(227,179,65,0.12)', color: 'var(--color-one-warning)' },
    accent: { border: 'rgba(127,212,255,0.32)', bg: 'rgba(127,212,255,0.12)', color: 'var(--color-one-accent)' },
    success: { border: 'rgba(76,195,138,0.32)', bg: 'rgba(76,195,138,0.12)', color: 'var(--color-one-success)' }
  } as const;
  const t = tones[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 rounded-xl border px-2 py-2 text-xs font-semibold transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
      style={{ borderColor: t.border, background: t.bg, color: t.color }}
    >
      {label}
    </button>
  );
}
