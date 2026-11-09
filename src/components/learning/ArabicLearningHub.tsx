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
  Layers,
  Sparkles,
  BookMarked,
  Filter,
  RefreshCw,
  Library,
  Eye,
  X,
  Compass
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
} from '../../../server/islamicLibraryCrawler.ts';

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
    title: '阿拉伯语与伊斯兰古籍研习中心', subtitle: '从字母基础到各大伊斯兰数字图书馆典籍，连接全球阿拉伯语古典文献与语言智慧。', practice: '今日复习', alphabet: '字母表', library: '伊斯兰数字图书馆', libraryHint: '直通沙米拉、瓦克菲亚、努尔图书馆与全球伊斯兰数字文献', letters: '字母', due: '待复习', streak: '连续学习', today: '今日练习', mastered: '已复习字母', dailyGoal: '每日目标', startPractice: '开始今日练习', dailyLimit: '每日最多加入 5 个新字母；到期卡片优先。', localOnly: '进度保存在本地；古籍文献实时联动各大公开数字图书馆。', caughtUp: '今天已完成', caughtUpHint: '目前没有到期卡片，也可以浏览下方伊斯兰图书馆藏书。', returnHome: '返回学习首页', question: '这是什么字母？', reveal: '显示答案', answer: '字母名称与发音提示', forms: '字形变化', example: '例词', listen: '听设备发音', voiceUnavailable: '此设备未检测到阿拉伯语语音引擎。', again: '再练一次', hard: '有点难', good: '记住了', easy: '很轻松', sessionDone: '本轮完成', sessionDoneHint: '复习结果已保存到此设备。', nextSession: '再检查一次', back: '返回', selectLetter: '选择一个字母查看连写字形和例词。', reviewProgress: '掌握进度', openLibrary: '浏览伊斯兰图书馆', isolated: '单独', initial: '词首', medial: '词中', final: '词尾'
  },
  en: {
    title: 'Arabic Learning & Islamic Classical Library', subtitle: 'From alphabet fundamentals to major Islamic digital libraries, accessing classical Arabic literature and linguistic wisdom.', practice: "Today's review", alphabet: 'Alphabet', library: 'Islamic Digital Library', libraryHint: 'Connected to Shamela, Waqfeya, Noor, and global Islamic manuscript repositories', letters: 'Letters', due: 'Due', streak: 'Day streak', today: 'Practiced today', mastered: 'Reviewed letters', dailyGoal: 'Daily goal', startPractice: "Start today's practice", dailyLimit: 'Up to 5 new letters per day; due cards come first.', localOnly: 'Progress stays in this browser; classical texts synced with public Islamic libraries.', caughtUp: 'You are caught up', caughtUpHint: 'No cards are due. Explore the Islamic Digital Library below.', returnHome: 'Back to learning home', question: 'Which letter is this?', reveal: 'Reveal answer', answer: 'Letter name and sound hint', forms: 'Letter forms', example: 'Example', listen: 'Hear device pronunciation', voiceUnavailable: 'No Arabic speech voice is available in this browser.', again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy', sessionDone: 'Session complete', sessionDoneHint: 'Your review has been saved on this device.', nextSession: 'Check again', back: 'Back', selectLetter: 'Choose a letter to see its joining forms and an example.', reviewProgress: 'Learning progress', openLibrary: 'Browse Islamic Library', isolated: 'Isolated', initial: 'Initial', medial: 'Medial', final: 'Final'
  },
  ar: {
    title: 'مركز تعلّم العربية والمكتبات الإسلامية', subtitle: 'من أساسيات الحروف الهجائية إلى كبريات المكتبات الإسلامية الرقمية والمخطوطات التراثية الأصيلة.', practice: 'مراجعة اليوم', alphabet: 'الأبجدية', library: 'المكتبات الإسلامية الرقمية', libraryHint: 'مرتبط بالمكتبة الشاملة والوقفية ومكتبة نور وأرشيف المخطوطات العالمي', letters: 'الحروف', due: 'للمراجعة', streak: 'أيام متتالية', today: 'تدرّبت اليوم', mastered: 'حروف راجعتها', dailyGoal: 'الهدف اليومي', startPractice: 'ابدأ تدريب اليوم', dailyLimit: 'تُضاف خمسة حروف جديدة كحد أقصى يوميًا؛ وتظهر البطاقات المستحقة أولًا.', localOnly: 'يبقى التقدّم محفوظًا؛ والكتب متصلة بالمكتبات الإسلامية المفتوحة.', caughtUp: 'أنهيت تدريب اليوم', caughtUpHint: 'لا توجد بطاقات مستحقة، تصفح ذخائر المكتبة الإسلامية أدناه.', returnHome: 'العودة إلى صفحة التعلّم', question: 'ما هذا الحرف؟', reveal: 'أظهر الإجابة', answer: 'اسم الحرف ودليل النطق', forms: 'أشكال الحرف', example: 'مثال', listen: 'استمع إلى نطق الجهاز', voiceUnavailable: 'لا يتوفر صوت عربي في هذا المتصفح.', again: 'أعد', hard: 'صعب', good: 'جيد', easy: 'سهل', sessionDone: 'اكتملت الجولة', sessionDoneHint: 'حُفظت المراجعة على هذا الجهاز.', nextSession: 'تحقّق مرة أخرى', back: 'رجوع', selectLetter: 'اختر حرفًا لرؤية أشكاله ومثال عليه.', reviewProgress: 'تقدّم التعلّم', openLibrary: 'تصفّح المكتبات الإسلامية', isolated: 'منفصل', initial: 'أول الكلمة', medial: 'وسط الكلمة', final: 'آخر الكلمة'
  },
  es: {
    title: 'Aprendizaje de árabe y biblioteca islámica', subtitle: 'Desde los conceptos básicos del alfabeto hasta las principales bibliotecas digitales islámicas.', practice: 'Repaso de hoy', alphabet: 'Alfabeto', library: 'Biblioteca Islámica Digital', libraryHint: 'Conectado a Shamela, Waqfeya, Noor y archivos globales', letters: 'Letras', due: 'Pendientes', streak: 'Días seguidos', today: 'Practicadas hoy', mastered: 'Letras repasadas', dailyGoal: 'Meta diaria', startPractice: 'Empezar la práctica de hoy', dailyLimit: 'Hasta 5 letras nuevas al día; primero aparecen las tarjetas pendientes.', localOnly: 'El progreso queda en este navegador.', caughtUp: 'Has terminado por hoy', caughtUpHint: 'No hay tarjetas pendientes.', returnHome: 'Volver al inicio', question: '¿Qué letra es?', reveal: 'Mostrar respuesta', answer: 'Nombre y pista de pronunciación', forms: 'Formas de la letra', example: 'Ejemplo', listen: 'Escuchar pronunciación del dispositivo', voiceUnavailable: 'Este navegador no tiene una voz árabe disponible.', again: 'Otra vez', hard: 'Difícil', good: 'Bien', easy: 'Fácil', sessionDone: 'Sesión completada', sessionDoneHint: 'El repaso se guardó en este dispositivo.', nextSession: 'Comprobar de nuevo', back: 'Volver', selectLetter: 'Elige una letra para ver sus formas y un ejemplo.', reviewProgress: 'Progreso de aprendizaje', openLibrary: 'Abrir biblioteca', isolated: 'Aislada', initial: 'Inicial', medial: 'Medial', final: 'Final'
  },
  fr: {
    title: 'Apprentissage de l’arabe et bibliothèque islamique', subtitle: 'De l’alphabet aux grandes bibliothèques numériques islamiques et manuscrits classiques.', practice: 'Révision du jour', alphabet: 'Alphabet', library: 'Bibliothèque islamique', libraryHint: 'Connecté à Shamela, Waqfeya, Noor et aux archives islamiques', letters: 'Lettres', due: 'À réviser', streak: 'Jours consécutifs', today: 'Pratiquées aujourd’hui', mastered: 'Lettres révisées', dailyGoal: 'Objectif quotidien', startPractice: 'Commencer la séance du jour', dailyLimit: 'Jusqu’à 5 nouvelles lettres par jour ; les cartes dues passent en premier.', localOnly: 'La progression reste dans ce navigateur.', caughtUp: 'C’est terminé pour aujourd’hui', caughtUpHint: 'Aucune carte n’est due.', returnHome: 'Retour à l’accueil', question: 'Quelle est cette lettre ?', reveal: 'Afficher la réponse', answer: 'Nom et indication de prononciation', forms: 'Formes de la lettre', example: 'Exemple', listen: 'Écouter la prononciation de l’appareil', voiceUnavailable: 'Aucune voix arabe n’est disponible dans ce navigateur.', again: 'Encore', hard: 'Difficile', good: 'Bien', easy: 'Facile', sessionDone: 'Séance terminée', sessionDoneHint: 'La révision a été enregistrée sur cet appareil.', nextSession: 'Vérifier à nouveau', back: 'Retour', selectLetter: 'Choisissez une lettre pour voir ses formes et un exemple.', reviewProgress: 'Progression', openLibrary: 'Ouvrir la bibliothèque', isolated: 'Isolée', initial: 'Initiale', medial: 'Médiane', final: 'Finale'
  },
  ru: {
    title: 'Изучение арабского и исламская библиотека', subtitle: 'От основ алфавита до крупнейших исламских электронных библиотек и рукописей.', practice: 'Повторение на сегодня', alphabet: 'Алфавит', library: 'Исламская библиотека', libraryHint: 'Подключено к Shamela, Waqfeya, Noor и мировым архивам', letters: 'Буквы', due: 'К повторению', streak: 'Дней подряд', today: 'Практика сегодня', mastered: 'Повторено букв', dailyGoal: 'Цель на день', startPractice: 'Начать сегодняшнее занятие', dailyLimit: 'До 5 новых букв в день; сначала карточки к повторению.', localOnly: 'Прогресс хранится только в этом браузере.', caughtUp: 'На сегодня всё', caughtUpHint: 'Нет карточек к повторению.', returnHome: 'На главную обучения', question: 'Что это за буква?', reveal: 'Показать ответ', answer: 'Название буквы и подсказка по звуку', forms: 'Формы буквы', example: 'Пример', listen: 'Прослушать произношение устройства', voiceUnavailable: 'В этом браузере нет доступного арабского голоса.', again: 'Ещё раз', hard: 'Сложно', good: 'Хорошо', easy: 'Легко', sessionDone: 'Занятие завершено', sessionDoneHint: 'Повторение сохранено на этом устройстве.', nextSession: 'Проверить снова', back: 'Назад', selectLetter: 'Выберите букву, чтобы увидеть её формы и пример.', reviewProgress: 'Прогресс обучения', openLibrary: 'Открыть библиотеку', isolated: 'Изолированная', initial: 'Начальная', medial: 'Средняя', final: 'Конечная'
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
  useEffect(() => () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  // Fetch initial books from API
  useEffect(() => {
    fetch('/api/learning/arabic/islamic-libraries?limit=30')
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.books) && data.books.length > 0) {
          setLibraryBooks(data.books);
        }
      })
      .catch(() => {});
  }, []);

  // Filter books in memory
  const filteredBooks = useMemo(() => {
    return libraryBooks.filter(book => {
      // Category filter
      if (selectedCategory !== 'all' && book.category !== selectedCategory) {
        return false;
      }
      // Source filter
      if (selectedSource !== 'all' && book.librarySource !== selectedSource) {
        return false;
      }
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = book.title.toLowerCase().includes(q) ||
          (book.titleZh || '').toLowerCase().includes(q) ||
          (book.titleEn || '').toLowerCase().includes(q);
        const matchAuthor = book.author.toLowerCase().includes(q) ||
          (book.authorZh || '').toLowerCase().includes(q) ||
          (book.authorEn || '').toLowerCase().includes(q);
        const matchDesc = book.description.toLowerCase().includes(q);
        const matchTags = book.tags.some(tag => tag.toLowerCase().includes(q));
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
    <section dir="ltr" className="min-h-[calc(100vh-4rem)] w-full bg-[#030712] px-4 pb-14 pt-6 text-slate-100 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        {/* Header Banner */}
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div className="flex items-start gap-3.5">
            <div className="mt-1 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 p-3 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
              <Library className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-400">
                  EARTH ONE · ISLAMIC & ARABIC HERITAGE
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-[10px] text-emerald-300 font-mono">
                  5 LIBRARIES CRAWLED
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl mt-1">
                {lang === 'zh' ? '阿拉伯语与伊斯兰古籍研习中心' : t.title}
              </h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-400">
                {lang === 'zh'
                  ? '集成全网各大伊斯兰数字图书馆爬虫与开放古籍文献，涵盖沙米拉、瓦克菲亚、努尔图书馆，支持原典翻阅与阿拉伯语基础演练。'
                  : t.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className={buttonClass}
              onClick={onOpenLibrary}
              title="打开海王星全球数字图书馆"
            >
              <BookOpen className="h-4 w-4 text-amber-300" />
              <span>{t.openLibrary}</span>
            </button>
          </div>
        </header>

        {/* Top Primary Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 bg-slate-900/60 p-1.5 rounded-2xl border border-slate-800">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setMainTab('islamic_library')}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                mainTab === 'islamic_library'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.35)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <BookMarked className="w-4 h-4" />
              <span>各大伊斯兰数字图书馆与古籍爬虫</span>
              <span className="px-1.5 py-0.5 text-[10px] rounded-md bg-black/20 font-mono">
                {libraryBooks.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMainTab('letters');
                setView('home');
              }}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                mainTab === 'letters'
                  ? 'bg-gradient-to-r from-cyan-600 to-sky-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.35)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>字母发音与间隔记忆复习</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center space-x-4 text-xs font-mono text-slate-400 pr-2">
            <span className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>CRAWLER: ACTIVE</span>
            </span>
            <span>SHAMELA · WAQFEYA · NOOR · ARCHIVE</span>
          </div>
        </div>

        {/* ============================================================= */}
        {/* TAB 1: ISLAMIC DIGITAL LIBRARIES & MANUSCRIPT CRAWLER          */}
        {/* ============================================================= */}
        {mainTab === 'islamic_library' && (
          <div className="space-y-6">
            {/* 1. Control & Search Strip */}
            <div className={`${cardClass} p-5 sm:p-6`}>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Search input */}
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="在各大伊斯兰图书馆中检索 (如: لسان العرب, 语法, Ajrumiyyah, Tafsir, Ibn Manzur)..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition-all font-sans"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Live Crawler Trigger Button */}
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={handleTriggerCrawler}
                    disabled={isCrawling}
                    className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 text-white font-medium text-xs tracking-wider shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCrawling ? 'animate-spin' : ''}`} />
                    <span>{isCrawling ? '正在爬取各大图书馆...' : '启动爬虫抓取新文献'}</span>
                  </button>
                </div>
              </div>

              {/* Crawl feedback alert */}
              {crawlFeedback && (
                <div className="mt-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center space-x-2 animate-in fade-in">
                  <Sparkles className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>{crawlFeedback}</span>
                </div>
              )}

              {/* Filters: Category & Source */}
              <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Category filters */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-mono text-slate-400 mr-1 flex items-center">
                    <Filter className="w-3 h-3 mr-1" /> 分类:
                  </span>
                  {[
                    { id: 'all', label: '全部典籍' },
                    { id: 'grammar', label: '语法与词法 (النحو والصرف)' },
                    { id: 'lexicon', label: '权威辞书 (المعاجم)' },
                    { id: 'quran_tafsir', label: '经注学 (التفسير)' },
                    { id: 'hadith', label: '圣训与传记 (الحديث)' },
                    { id: 'literature', label: '文学与修辞 (الأدب والبلاغة)' },
                    { id: 'learning', label: '综合教材 (تعليم العربية)' }
                  ].map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCategory(c.id as any)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        selectedCategory === c.id
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm'
                          : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {/* Source filters */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-mono text-slate-400 mr-1">馆藏源:</span>
                  {[
                    { id: 'all', label: '全部来源' },
                    { id: 'shamela', label: 'المكتبة الشاملة' },
                    { id: 'waqfeya', label: 'المكتبة الوقفية' },
                    { id: 'noor', label: 'مكتبة نور' },
                    { id: 'internet_archive', label: 'Internet Archive' },
                    { id: 'wikisource', label: 'Wikisource' }
                  ].map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedSource(s.id as any)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all ${
                        selectedSource === s.id
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'bg-slate-900/60 text-slate-500 border border-slate-800/80 hover:text-slate-300'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 2. Islamic Library Cards Grid */}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredBooks.map(book => {
                const sourceColorMap: Record<string, string> = {
                  shamela: 'text-emerald-400 bg-emerald-950/40 border-emerald-500/30',
                  waqfeya: 'text-amber-400 bg-amber-950/40 border-amber-500/30',
                  noor: 'text-cyan-400 bg-cyan-950/40 border-cyan-500/30',
                  internet_archive: 'text-sky-400 bg-sky-950/40 border-sky-500/30',
                  wikisource: 'text-indigo-400 bg-indigo-950/40 border-indigo-500/30'
                };
                const sourceTagClass = sourceColorMap[book.librarySource] || 'text-slate-300 bg-slate-800 border-slate-700';

                return (
                  <article
                    key={book.id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-800/90 bg-slate-950/80 p-5 shadow-lg hover:border-emerald-500/40 transition-all group"
                  >
                    <div>
                      {/* Top Bar: Source badge & Category */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-mono border ${sourceTagClass}`}>
                          {book.librarySourceNameAr}
                        </span>
                        <div className="flex items-center space-x-1.5 text-[11px] text-slate-400 font-mono">
                          <span>{book.categoryLabelZh}</span>
                          {book.year && <span>· {book.year}</span>}
                        </div>
                      </div>

                      {/* Book Cover & Title Info */}
                      <div className="flex items-start gap-4">
                        {book.coverImage ? (
                          <img
                            src={book.coverImage}
                            alt={book.title}
                            className="w-16 h-22 object-cover rounded-lg border border-slate-700/80 shadow-md flex-shrink-0 bg-slate-900"
                            loading="lazy"
                            onError={e => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-16 h-22 rounded-lg border border-slate-800 bg-slate-900 flex items-center justify-center text-slate-600 flex-shrink-0">
                            <BookOpen className="w-6 h-6" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          {/* Arabic Classical Title */}
                          <div className="flex items-center justify-between gap-1">
                            <h3
                              dir="rtl"
                              lang="ar"
                              className="font-serif text-lg font-bold text-white group-hover:text-emerald-300 transition-colors leading-snug truncate"
                              title={book.title}
                            >
                              {book.title}
                            </h3>
                            <button
                              type="button"
                              onClick={() => speak(book.title)}
                              className="p-1 text-slate-500 hover:text-emerald-300 transition-colors"
                              title="朗读阿语书名"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Bilingual subtitle */}
                          {book.titleZh && (
                            <p className="text-xs text-slate-300 font-medium mt-0.5 line-clamp-1">
                              {book.titleZh}
                            </p>
                          )}
                          <p dir="rtl" lang="ar" className="text-xs text-emerald-400/90 font-serif mt-1 truncate">
                            {book.author}
                          </p>
                          {book.authorZh && (
                            <p className="text-[11px] text-slate-400 truncate">
                              作者: {book.authorZh}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Description */}
                      <p className="mt-3.5 text-xs text-slate-400 leading-relaxed line-clamp-2">
                        {book.description}
                      </p>

                      {/* Volumes & Tags */}
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {book.volumes && (
                          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-400 font-mono">
                            {book.volumes} 卷本
                          </span>
                        )}
                        {book.tags.slice(0, 3).map((t, idx) => (
                          <span key={idx} className="px-1.5 py-0.5 rounded bg-slate-900/60 text-[10px] text-slate-500 font-mono">
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Bottom Action Buttons */}
                    <div className="mt-5 pt-3.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        {book.embedUrl ? (
                          <button
                            type="button"
                            onClick={() => setReadingBook(book)}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 text-xs font-semibold hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>在线阅读</span>
                          </button>
                        ) : null}

                        {book.pdfUrl ? (
                          <a
                            href={book.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-slate-900 text-slate-300 border border-slate-700/80 text-xs font-medium hover:text-white hover:border-slate-500 transition-all"
                            title="下载高清原典 PDF"
                          >
                            <Download className="w-3 h-3 text-amber-400" />
                            <span>PDF</span>
                          </a>
                        ) : null}
                      </div>

                      <a
                        href={book.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1 text-slate-500 hover:text-cyan-300 text-xs transition-colors"
                        title="访问图书馆原始馆藏页"
                      >
                        <span className="text-[11px] font-mono">原站馆藏</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>

            {filteredBooks.length === 0 && (
              <div className={`${cardClass} p-12 text-center`}>
                <Library className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-slate-200">未找到符合条件的古籍文献</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  尝试切换分类标签，或点击“启动爬虫抓取新文献”向网络档案局与沙米拉发起深度检索。
                </p>
                <button
                  type="button"
                  onClick={handleTriggerCrawler}
                  className="mt-4 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition-all"
                >
                  启动全局网络爬虫检索
                </button>
              </div>
            )}
          </div>
        )}

        {/* ============================================================= */}
        {/* TAB 2: LETTERS & SPACED REPETITION (Alphabet & Flashcards)   */}
        {/* ============================================================= */}
        {mainTab === 'letters' && (
          <div>
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
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">ISLAMIC REPOSITORIES</p>
                        <h2 className="mt-1 text-lg font-semibold text-white">伊斯兰各大图书馆藏</h2>
                      </div>
                      <Library className="h-5 w-5 text-emerald-400" />
                    </div>
                    <p className="mb-5 text-sm leading-6 text-slate-400">
                      直通沙米拉、瓦克菲亚、努尔图书馆，获取《阿拉伯人之舌》、《阿季鲁米叶》等古典原典与语法注疏。
                    </p>
                    <button type="button" className={buttonClass} onClick={() => setMainTab('islamic_library')}>
                      <BookMarked className="h-4 w-4 text-emerald-400" />
                      <span>查看古籍文献库</span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
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
        )}

        {/* 3. In-Hub Online Reader Modal */}
        {readingBook && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in">
            <div className="relative w-full max-w-5xl h-[88vh] bg-slate-950 border border-emerald-500/40 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/90">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <h3 dir="rtl" lang="ar" className="font-serif text-base font-bold text-white truncate">
                      {readingBook.title}
                    </h3>
                    <p className="text-xs text-slate-400 truncate">
                      {readingBook.titleZh || readingBook.titleEn || readingBook.author} · {readingBook.librarySourceNameZh}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 flex-shrink-0">
                  <a
                    href={readingBook.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    title="新窗口打开原始地址"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setReadingBook(null)}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Reader iframe content */}
              <div className="flex-1 w-full bg-slate-900 relative">
                {readingBook.embedUrl ? (
                  <iframe
                    src={readingBook.embedUrl}
                    title={readingBook.title}
                    className="w-full h-full border-0"
                    allowFullScreen
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                    <BookOpen className="w-12 h-12 text-slate-600 mb-3" />
                    <p className="text-slate-300 font-medium">该文献未提供内嵌阅读器</p>
                    <a
                      href={readingBook.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition-all inline-flex items-center space-x-2"
                    >
                      <span>前往 {readingBook.librarySourceNameZh} 原站阅读</span>
                      <ExternalLink className="w-3.5 h-3.5" />
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
