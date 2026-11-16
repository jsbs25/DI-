import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Flame,
  Gem,
  Heart,
  Layers,
  Loader2,
  MessageCircle,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Sparkles,
  Trophy,
  Volume2,
  X,
} from 'lucide-react';
import type { Language } from '../../types/index.ts';
import { readAIStream } from '../../utils/aiStream.ts';

type CourseLangId = 'en' | 'ar' | 'es' | 'fr' | 'ja';
type ChallengeKind = 'tile-build' | 'listen-choice' | 'context-choice' | 'speak-repeat';
type SubMode = 'path' | 'ai_coach' | 'phrasebook';

interface ImmersionChallenge {
  id: string;
  kind: ChallengeKind;
  promptZh: string;
  promptEn: string;
  targetText: string;
  romanization?: string;
  translationZh: string;
  translationEn: string;
  speechLang: string;
  expectedTokens?: string[];
  distractorTokens?: string[];
  choices?: Array<{ id: string; text: string; note?: string; correct?: boolean }>;
}

interface CourseUnit {
  id: string;
  order: number;
  titleZh: string;
  titleEn: string;
  topicZh: string;
  topicEn: string;
  xpReward: number;
  challenges: ImmersionChallenge[];
}

interface LanguageCourse {
  id: CourseLangId;
  nativeName: string;
  zhName: string;
  enName: string;
  code: string;
  speechLang: string;
  dir?: 'rtl' | 'ltr';
  accentColor: string;
  scenarios: Array<{
    id: string;
    titleZh: string;
    titleEn: string;
    starterPrompt: string;
    starterTranslationZh: string;
  }>;
  units: CourseUnit[];
}

const IMMERSION_COURSES: LanguageCourse[] = [
  {
    id: 'en',
    nativeName: 'English',
    zhName: '英语',
    enName: 'English',
    code: 'EN',
    speechLang: 'en-US',
    accentColor: '#0284c7',
    scenarios: [
      {
        id: 'en_cafe',
        titleZh: '伦敦咖啡馆点单',
        titleEn: 'Ordering at a London Café',
        starterPrompt: 'Good morning! What can I get started for you today?',
        starterTranslationZh: '早上好！请问今天想喝点什么？',
      },
      {
        id: 'en_airport',
        titleZh: '国际机场值机与转机',
        titleEn: 'Airport Check-In & Transit',
        starterPrompt: 'Hello! Where are you flying to today? May I see your passport?',
        starterTranslationZh: '您好！您今天飞往哪里？请出示一下您的护照。',
      },
      {
        id: 'en_tech',
        titleZh: '硅谷科技交流讨论',
        titleEn: 'Tech Meetup Discussion',
        starterPrompt: 'Great to meet you! What kind of AI project are you working on?',
        starterTranslationZh: '很高兴认识你！你最近在做什么 AI 项目？',
      },
    ],
    units: [
      {
        id: 'en_u1',
        order: 1,
        titleZh: 'Unit 1 · 问候与破冰交流',
        titleEn: 'Unit 1 · Greetings & Openers',
        topicZh: '自然打招呼、自我介绍与倾听回应',
        topicEn: 'Natural greetings and introductions',
        xpReward: 25,
        challenges: [
          {
            id: 'en_1_1',
            kind: 'tile-build',
            promptZh: '点击词块，组成地道的英文表达：“很高兴在这里见到你。”',
            promptEn: 'Arrange the tiles to say: "Nice to meet you here."',
            targetText: 'Nice to meet you here',
            translationZh: '很高兴在这里见到你。',
            translationEn: 'Nice to meet you here.',
            speechLang: 'en-US',
            expectedTokens: ['Nice', 'to', 'meet', 'you', 'here'],
            distractorTokens: ['is', 'very', 'now'],
          },
          {
            id: 'en_1_2',
            kind: 'listen-choice',
            promptZh: '聆听英文发音，选出正确的中文含义',
            promptEn: 'Listen and choose the matching meaning',
            targetText: 'Could you speak a bit more slowly please?',
            translationZh: '请问您可以说得稍微慢一点吗？',
            translationEn: 'Could you speak a bit more slowly please?',
            speechLang: 'en-US',
            choices: [
              { id: 'a', text: '请问您可以说得稍微慢一点吗？', correct: true },
              { id: 'b', text: '请问最近的地铁站怎么走？' },
              { id: 'c', text: '我们明天早上九点见面吧。' },
            ],
          },
          {
            id: 'en_1_3',
            kind: 'speak-repeat',
            promptZh: '点击发音并跟读这句高频句型（支持语音评测）',
            promptEn: 'Listen and repeat aloud',
            targetText: 'I would love to learn more about your culture',
            translationZh: '我很想多了解一些你们的文化。',
            translationEn: 'I would love to learn more about your culture.',
            speechLang: 'en-US',
          },
        ],
      },
      {
        id: 'en_u2',
        order: 2,
        titleZh: 'Unit 2 · 旅行导航与日常求助',
        titleEn: 'Unit 2 · Travel & Navigation',
        topicZh: '问路、订票、点单与时间确认',
        topicEn: 'Directions, booking and timing',
        xpReward: 30,
        challenges: [
          {
            id: 'en_2_1',
            kind: 'context-choice',
            promptZh: '你在机场想询问“下一班列车几点出发？”，应选择：',
            promptEn: 'How do you ask when the next train departs?',
            targetText: 'What time does the next train depart?',
            translationZh: '下一班列车几点出发？',
            translationEn: 'What time does the next train depart?',
            speechLang: 'en-US',
            choices: [
              { id: 'a', text: 'What time does the next train depart?', note: '地道自然', correct: true },
              { id: 'b', text: 'Where is the train color today?' },
              { id: 'c', text: 'I am eating dinner on the ticket.' },
            ],
          },
          {
            id: 'en_2_2',
            kind: 'tile-build',
            promptZh: '拼出完整句子：“我想预订一个靠窗的座位。”',
            promptEn: 'Build: "I would like a window seat"',
            targetText: 'I would like a window seat',
            translationZh: '我想要一个靠窗的座位。',
            translationEn: 'I would like a window seat.',
            speechLang: 'en-US',
            expectedTokens: ['I', 'would', 'like', 'a', 'window', 'seat'],
            distractorTokens: ['door', 'am', 'under'],
          },
          {
            id: 'en_2_3',
            kind: 'listen-choice',
            promptZh: '听录音，判断说话人的需求',
            promptEn: 'Listen to the audio and select the right response',
            targetText: 'Is Wi-Fi available in this lounge?',
            translationZh: '这个休息室里有无线网络吗？',
            translationEn: 'Is Wi-Fi available in this lounge?',
            speechLang: 'en-US',
            choices: [
              { id: 'a', text: '询问休息室是否提供 Wi-Fi', correct: true },
              { id: 'b', text: '询问行李提取处在哪里' },
              { id: 'c', text: '确认登机口是否变更' },
            ],
          },
        ],
      },
      {
        id: 'en_u3',
        order: 3,
        titleZh: 'Unit 3 · 深度观点与逻辑表达',
        titleEn: 'Unit 3 · Clear Thinking & Nuance',
        topicZh: '讨论协作、技术与长期主义观点',
        topicEn: 'Expressing clear perspectives',
        xpReward: 40,
        challenges: [
          {
            id: 'en_3_1',
            kind: 'tile-build',
            promptZh: '组合进阶句型：“持续练习带来真正的流利。”',
            promptEn: 'Build: "Consistent practice leads to real fluency"',
            targetText: 'Consistent practice leads to real fluency',
            translationZh: '持续练习带来真正的流利。',
            translationEn: 'Consistent practice leads to real fluency.',
            speechLang: 'en-US',
            expectedTokens: ['Consistent', 'practice', 'leads', 'to', 'real', 'fluency'],
            distractorTokens: ['never', 'from', 'delay'],
          },
          {
            id: 'en_3_2',
            kind: 'speak-repeat',
            promptZh: '跟读巩固：“Every language opens a new window onto the world”',
            promptEn: 'Speak aloud cleanly',
            targetText: 'Every language opens a new window onto the world',
            translationZh: '每一门语言都为我们推开一扇观察世界的新窗口。',
            translationEn: 'Every language opens a new window onto the world.',
            speechLang: 'en-US',
          },
        ],
      },
    ],
  },
  {
    id: 'ar',
    nativeName: 'العربية',
    zhName: '阿拉伯语',
    enName: 'Arabic',
    code: 'AR',
    speechLang: 'ar-SA',
    dir: 'rtl',
    accentColor: '#d97706',
    scenarios: [
      {
        id: 'ar_greet',
        titleZh: '开罗街头寒暄与问路',
        titleEn: 'Greetings & Directions in Cairo',
        starterPrompt: 'أَهْلًا وَسَهْلًا! كَيْفَ حَالُكَ الْيَوْمَ؟',
        starterTranslationZh: '欢迎光临！你今天过得怎么样？',
      },
      {
        id: 'ar_market',
        titleZh: '香料市集选购与致谢',
        titleEn: 'Souq Market & Courtesy',
        starterPrompt: 'مَسَاءُ الْخَيْرِ! مَاذَا تُحِبُّ أَنْ تَشْرَبَ؟ شَايٌ أَمْ قَهْوَةٌ؟',
        starterTranslationZh: '晚上好！您想喝点什么？茶还是咖啡？',
      },
    ],
    units: [
      {
        id: 'ar_u1',
        order: 1,
        titleZh: 'Unit 1 · 阿语核心问候 (التحيات)',
        titleEn: 'Unit 1 · Essential Greetings',
        topicZh: '和平祝安、早安问候与基础应答',
        topicEn: 'Peace greetings & warm replies',
        xpReward: 30,
        challenges: [
          {
            id: 'ar_1_1',
            kind: 'context-choice',
            promptZh: '阿拉伯语中最经典通用的问候语“愿你平安”是哪一句？',
            promptEn: 'Select the classic greeting meaning "Peace be upon you"',
            targetText: 'السلام عليكم',
            romanization: 'As-salāmu ʿalaykum',
            translationZh: '愿你平安（你好）',
            translationEn: 'Peace be upon you',
            speechLang: 'ar-SA',
            choices: [
              { id: 'a', text: 'السلام عليكم', note: 'As-salāmu ʿalaykum', correct: true },
              { id: 'b', text: 'شُكْرًا جَزِيلًا', note: 'Shukran jazīlan' },
              { id: 'c', text: 'مَعَ السَّلَامَة', note: 'Maʿa s-salāmah' },
            ],
          },
          {
            id: 'ar_1_2',
            kind: 'tile-build',
            promptZh: '按从右到左的语序拼出：“早安，你好吗？”',
            promptEn: 'Build: "Good morning, how are you?"',
            targetText: 'صباح الخير كيف حالك',
            romanization: 'Ṣabāḥ al-khayr, kayfa ḥāluka',
            translationZh: '早上好，你好吗？',
            translationEn: 'Good morning, how are you?',
            speechLang: 'ar-SA',
            expectedTokens: ['صباح', 'الخير', 'كيف', 'حالك'],
            distractorTokens: ['مساء', 'أين'],
          },
          {
            id: 'ar_1_3',
            kind: 'listen-choice',
            promptZh: '聆听阿拉伯语语音，判断句意',
            promptEn: 'Listen and match meaning',
            targetText: 'أَنَا بِخَيْرٍ شُكْرًا',
            romanization: 'Anā bi-khayr, shukran',
            translationZh: '我很好，谢谢。',
            translationEn: 'I am fine, thank you.',
            speechLang: 'ar-SA',
            choices: [
              { id: 'a', text: '我很好，谢谢。', correct: true },
              { id: 'b', text: '对不起，我不明白。' },
              { id: 'c', text: '请给我一杯水。' },
            ],
          },
        ],
      },
      {
        id: 'ar_u2',
        order: 2,
        titleZh: 'Unit 2 · 自我介绍与文化交流',
        titleEn: 'Unit 2 · Self Introduction',
        topicZh: '姓名介绍、语言学习与礼貌辞令',
        topicEn: 'Name, origin & polite dialogue',
        xpReward: 35,
        challenges: [
          {
            id: 'ar_2_1',
            kind: 'context-choice',
            promptZh: '表达“我正在学习阿拉伯语”应该用：',
            promptEn: 'Which sentence means "I am learning Arabic"?',
            targetText: 'أَنَا أَتَعَلَّمُ اللُّغَةَ الْعَرَبِيَّةَ',
            romanization: 'Anā ataʿallamu l-lughata l-ʿarabiyyah',
            translationZh: '我正在学习阿拉伯语。',
            translationEn: 'I am learning Arabic.',
            speechLang: 'ar-SA',
            choices: [
              { id: 'a', text: 'أَنَا أَتَعَلَّمُ اللُّغَةَ الْعَرَبِيَّةَ', note: '我正在学阿拉伯语', correct: true },
              { id: 'b', text: 'أَيْنَ الْمَكْتَبَةُ الْقَرِيبَةُ', note: '图书馆在哪里' },
            ],
          },
          {
            id: 'ar_2_2',
            kind: 'speak-repeat',
            promptZh: '朗读礼貌致谢句：“شُكْرًا جَزِيلًا”',
            promptEn: 'Repeat aloud',
            targetText: 'شُكْرًا جَزِيلًا',
            romanization: 'Shukran jazīlan',
            translationZh: '非常感谢！',
            translationEn: 'Thank you very much!',
            speechLang: 'ar-SA',
          },
        ],
      },
    ],
  },
  {
    id: 'es',
    nativeName: 'Español',
    zhName: '西班牙语',
    enName: 'Spanish',
    code: 'ES',
    speechLang: 'es-ES',
    accentColor: '#059669',
    scenarios: [
      {
        id: 'es_cafe',
        titleZh: '马德里广场咖啡点单',
        titleEn: 'Ordering Coffee in Madrid',
        starterPrompt: '¡Hola! Buenos días. ¿Qué desea tomar hoy?',
        starterTranslationZh: '你好！早上好，今天想喝点什么？',
      },
    ],
    units: [
      {
        id: 'es_u1',
        order: 1,
        titleZh: 'Unit 1 · 西语活力日常',
        titleEn: 'Unit 1 · Everyday Spanish',
        topicZh: '地道打招呼、点咖啡与礼貌告别',
        topicEn: 'Greetings, café & farewells',
        xpReward: 25,
        challenges: [
          {
            id: 'es_1_1',
            kind: 'tile-build',
            promptZh: '组合句子：“早上好，请问来一杯咖啡。”',
            promptEn: 'Build: "Buenos días, un café por favor"',
            targetText: 'Buenos días un café por favor',
            translationZh: '早上好，请来一杯咖啡。',
            translationEn: 'Good morning, a coffee please.',
            speechLang: 'es-ES',
            expectedTokens: ['Buenos', 'días', 'un', 'café', 'por', 'favor'],
            distractorTokens: ['noches', 'agua'],
          },
          {
            id: 'es_1_2',
            kind: 'listen-choice',
            promptZh: '聆听发音，选出对应翻译',
            promptEn: 'Listen and choose meaning',
            targetText: 'Mucho gusto en conocerte',
            translationZh: '很高兴认识你。',
            translationEn: 'Very nice to meet you.',
            speechLang: 'es-ES',
            choices: [
              { id: 'a', text: '很高兴认识你。', correct: true },
              { id: 'b', text: '请问这里可以刷卡吗？' },
              { id: 'c', text: '明天见。' },
            ],
          },
        ],
      },
      {
        id: 'es_u2',
        order: 2,
        titleZh: 'Unit 2 · 巴塞罗那问路与交流',
        titleEn: 'Unit 2 · Getting Around',
        topicZh: '问路、买票与地道赞美',
        topicEn: 'Navigation & social expressions',
        xpReward: 30,
        challenges: [
          {
            id: 'es_2_1',
            kind: 'context-choice',
            promptZh: '礼貌询问“请问地铁站在哪里？”应选择：',
            promptEn: 'Choose "Excuse me, where is the metro station?"',
            targetText: 'Disculpa, ¿dónde está la estación de metro?',
            translationZh: '不好意思，请问地铁站在哪里？',
            translationEn: 'Excuse me, where is the metro station?',
            speechLang: 'es-ES',
            choices: [
              { id: 'a', text: 'Disculpa, ¿dónde está la estación de metro?', correct: true },
              { id: 'b', text: 'La cuenta por favor, muchas gracias' },
            ],
          },
          {
            id: 'es_2_2',
            kind: 'speak-repeat',
            promptZh: '跟读高频表达：“¿Hablas inglés o chino?”',
            promptEn: 'Repeat aloud',
            targetText: 'Hablas inglés o chino',
            translationZh: '你会说英语还是中文？',
            translationEn: 'Do you speak English or Chinese?',
            speechLang: 'es-ES',
          },
        ],
      },
    ],
  },
  {
    id: 'fr',
    nativeName: 'Français',
    zhName: '法语',
    enName: 'French',
    code: 'FR',
    speechLang: 'fr-FR',
    accentColor: '#6366f1',
    scenarios: [
      {
        id: 'fr_paris',
        titleZh: '巴黎左岸书店与咖啡交流',
        titleEn: 'Paris Left Bank Café & Bookshop',
        starterPrompt: 'Bonjour ! Bienvenue à Paris. Comment puis-je vous aider ?',
        starterTranslationZh: '你好！欢迎来到巴黎，有什么可以帮您？',
      },
    ],
    units: [
      {
        id: 'fr_u1',
        order: 1,
        titleZh: 'Unit 1 · 法语优雅交流',
        titleEn: 'Unit 1 · French Essentials',
        topicZh: '法式问候、点餐礼仪与道别',
        topicEn: 'French etiquette & dialogue',
        xpReward: 25,
        challenges: [
          {
            id: 'fr_1_1',
            kind: 'tile-build',
            promptZh: '拼出句子：“你好，今天过得怎么样？”',
            promptEn: 'Build: "Bonjour, comment allez-vous aujourd’hui"',
            targetText: 'Bonjour comment allez-vous aujourd’hui',
            translationZh: '您好，您今天过得怎么样？',
            translationEn: 'Hello, how are you today?',
            speechLang: 'fr-FR',
            expectedTokens: ['Bonjour', 'comment', 'allez-vous', 'aujourd’hui'],
            distractorTokens: ['merci', 'demain'],
          },
          {
            id: 'fr_1_2',
            kind: 'context-choice',
            promptZh: '在巴黎咖啡馆向店员表达“非常感谢，祝您愉快”：',
            promptEn: 'Choose "Thank you very much, have a good day"',
            targetText: 'Merci beaucoup, bonne journée',
            translationZh: '非常感谢，祝您今天愉快。',
            translationEn: 'Thank you very much, have a great day.',
            speechLang: 'fr-FR',
            choices: [
              { id: 'a', text: 'Merci beaucoup, bonne journée', correct: true },
              { id: 'b', text: 'Où est la gare centrale' },
            ],
          },
        ],
      },
      {
        id: 'fr_u2',
        order: 2,
        titleZh: 'Unit 2 · 塞纳河漫步与文化对话',
        titleEn: 'Unit 2 · Culture & City Walk',
        topicZh: '点单结账、问路与表达喜爱',
        topicEn: 'Ordering, directions & preferences',
        xpReward: 30,
        challenges: [
          {
            id: 'fr_2_1',
            kind: 'speak-repeat',
            promptZh: '朗读常用句：“Je voudrais un croissant et un café, s’il vous plaît”',
            promptEn: 'Repeat politely',
            targetText: 'Je voudrais un croissant et un café',
            translationZh: '我想要一个可颂和一杯咖啡。',
            translationEn: 'I would like a croissant and a coffee.',
            speechLang: 'fr-FR',
          },
        ],
      },
    ],
  },
  {
    id: 'ja',
    nativeName: '日本語',
    zhName: '日语',
    enName: 'Japanese',
    code: 'JA',
    speechLang: 'ja-JP',
    accentColor: '#e11d48',
    scenarios: [
      {
        id: 'ja_tokyo',
        titleZh: '东京电车问路与餐厅点单',
        titleEn: 'Tokyo Station & Dining',
        starterPrompt: 'いらっしゃいませ！何名様でしょうか？',
        starterTranslationZh: '欢迎光临！请问一共几位？',
      },
    ],
    units: [
      {
        id: 'ja_u1',
        order: 1,
        titleZh: 'Unit 1 · 日语基础会话',
        titleEn: 'Unit 1 · Japanese Basics',
        topicZh: '初见寒暄、致谢与东京出行实用表达',
        topicEn: 'Greetings, thanks & travel',
        xpReward: 25,
        challenges: [
          {
            id: 'ja_1_1',
            kind: 'context-choice',
            promptZh: '在东京初次见面时，最标准的“请多多关照”是：',
            promptEn: 'Select "Nice to meet you / Please treat me well"',
            targetText: 'よろしくお願いします',
            romanization: 'Yoroshiku onegaishimasu',
            translationZh: '请多多关照',
            translationEn: 'Nice to meet you',
            speechLang: 'ja-JP',
            choices: [
              { id: 'a', text: 'よろしくお願いします', note: 'Yoroshiku onegaishimasu', correct: true },
              { id: 'b', text: 'すみません、駅はどこですか', note: 'Excuse me, where is the station?' },
              { id: 'c', text: 'おやすみなさい', note: 'Good night' },
            ],
          },
          {
            id: 'ja_1_2',
            kind: 'tile-build',
            promptZh: '按正确语序拼出：“打扰一下，请问车站在哪里？”',
            promptEn: 'Build: "Sumimasen eki wa doko desu ka"',
            targetText: 'すみません 駅は どこ ですか',
            romanization: 'Sumimasen, eki wa doko desu ka?',
            translationZh: '不好意思，请问车站在哪里？',
            translationEn: 'Excuse me, where is the station?',
            speechLang: 'ja-JP',
            expectedTokens: ['すみません', '駅は', 'どこ', 'ですか'],
            distractorTokens: ['ありがとう', 'ここ'],
          },
        ],
      },
      {
        id: 'ja_u2',
        order: 2,
        titleZh: 'Unit 2 · 日本居酒屋与日常点餐',
        titleEn: 'Unit 2 · Café & Dining',
        topicZh: '点餐确认、推荐询问与礼貌结账',
        topicEn: 'Ordering & polite requests',
        xpReward: 30,
        challenges: [
          {
            id: 'ja_2_1',
            kind: 'speak-repeat',
            promptZh: '跟读点餐经典句：“すみません、おすすめは何ですか”',
            promptEn: 'Repeat aloud',
            targetText: 'おすすめは何ですか',
            romanization: 'Osusume wa nan desu ka',
            translationZh: '请问有什么推荐吗？',
            translationEn: 'What do you recommend?',
            speechLang: 'ja-JP',
          },
        ],
      },
    ],
  },
];

interface ProgressState {
  xp: number;
  streak: number;
  hearts: number;
  dailyXp: number;
  activeCourse: CourseLangId;
  completedUnitIds: string[];
  lastStudyDate: string;
}

const PROGRESS_KEY = 'earth_one_duolingo_immersion_v2';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadProgress(): ProgressState {
  const today = todayStr();
  const fallback: ProgressState = {
    xp: 40,
    streak: 1,
    hearts: 5,
    dailyXp: 0,
    activeCourse: 'en',
    completedUnitIds: [],
    lastStudyDate: today,
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(PROGRESS_KEY) || localStorage.getItem('earth_one_duolingo_immersion_v1');
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const sameDay = parsed?.lastStudyDate === today;
    return {
      xp: Number.isFinite(parsed?.xp) ? parsed.xp : 40,
      streak: Number.isFinite(parsed?.streak) ? Math.max(1, parsed.streak) : 1,
      hearts: Number.isFinite(parsed?.hearts) ? Math.max(1, Math.min(5, parsed.hearts)) : 5,
      dailyXp: sameDay && Number.isFinite(parsed?.dailyXp) ? parsed.dailyXp : 0,
      activeCourse: ['en', 'ar', 'es', 'fr', 'ja'].includes(parsed?.activeCourse) ? parsed.activeCourse : 'en',
      completedUnitIds: Array.isArray(parsed?.completedUnitIds) ? parsed.completedUnitIds : [],
      lastStudyDate: typeof parsed?.lastStudyDate === 'string' ? parsed.lastStudyDate : today,
    };
  } catch {
    return fallback;
  }
}

function shuffleWithSeed<T>(arr: T[], seedStr: string): T[] {
  const copy = [...arr];
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  for (let i = copy.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const DuolingoImmersionPlatform: React.FC<{
  lang: Language;
  onOpenEnglishEngine?: () => void;
}> = ({ lang, onOpenEnglishEngine }) => {
  const isZh = lang === 'zh';
  const [progress, setProgress] = useState<ProgressState>(loadProgress);
  const [subMode, setSubMode] = useState<SubMode>('path');

  // Interactive lesson state
  const [activeUnit, setActiveUnit] = useState<CourseUnit | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [builtTiles, setBuiltTiles] = useState<Array<{ key: string; label: string }>>([]);
  const [checkState, setCheckState] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [unitDone, setUnitDone] = useState(false);

  // Speaking challenge state
  const [listeningSpeak, setListeningSpeak] = useState(false);
  const [spokenText, setSpokenText] = useState('');
  const speakRecRef = useRef<any>(null);

  // In-app AI Immersion Coach state
  const [selectedScenarioIdx, setSelectedScenarioIdx] = useState(0);
  const [coachMessages, setCoachMessages] = useState<
    Array<{ role: 'tutor' | 'user'; text: string; note?: string }>
  >([]);
  const [coachInput, setCoachInput] = useState('');
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachListening, setCoachListening] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch {}
  }, [progress]);

  const course = useMemo(
    () => IMMERSION_COURSES.find((c) => c.id === progress.activeCourse) || IMMERSION_COURSES[0],
    [progress.activeCourse]
  );

  // Initialize / reset AI Coach greeting when active language or scenario changes
  const activeScenario = course.scenarios[selectedScenarioIdx] || course.scenarios[0];
  useEffect(() => {
    if (!activeScenario) return;
    setCoachMessages([
      {
        role: 'tutor',
        text: activeScenario.starterPrompt,
        note: isZh ? activeScenario.starterTranslationZh : activeScenario.titleEn,
      },
    ]);
  }, [activeScenario, isZh]);

  const speakPhrase = (text: string, speechLang: string, slow = false) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = speechLang;
      utt.rate = slow ? 0.68 : 0.96;
      const prefix = speechLang.split('-')[0].toLowerCase();
      const voices = window.speechSynthesis.getVoices();
      const match =
        voices.find((v) => v.lang.toLowerCase() === speechLang.toLowerCase()) ||
        voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
      if (match) utt.voice = match;
      window.speechSynthesis.speak(utt);
    } catch {}
  };

  const addXp = (amount: number) => {
    const today = todayStr();
    setProgress((prev) => ({
      ...prev,
      xp: prev.xp + amount,
      dailyXp: (prev.lastStudyDate === today ? prev.dailyXp : 0) + amount,
      lastStudyDate: today,
    }));
  };

  const startUnit = (unit: CourseUnit) => {
    setActiveUnit(unit);
    setStepIdx(0);
    setSelectedChoice(null);
    setBuiltTiles([]);
    setCheckState('idle');
    setUnitDone(false);
    setSpokenText('');
    const first = unit.challenges[0];
    if (first && (first.kind === 'listen-choice' || first.kind === 'speak-repeat')) {
      setTimeout(() => speakPhrase(first.targetText, first.speechLang), 180);
    }
  };

  const currentChallenge = activeUnit?.challenges[stepIdx] || null;

  const tileBank = useMemo(() => {
    if (!currentChallenge || currentChallenge.kind !== 'tile-build') return [];
    const all = [
      ...(currentChallenge.expectedTokens || []),
      ...(currentChallenge.distractorTokens || []),
    ].map((label, idx) => ({ key: `${currentChallenge.id}_${idx}_${label}`, label }));
    return shuffleWithSeed(all, currentChallenge.id);
  }, [currentChallenge]);

  const checkAnswer = () => {
    if (!currentChallenge || checkState !== 'idle') return;
    let isRight = false;

    if (currentChallenge.kind === 'tile-build') {
      const expected = (currentChallenge.expectedTokens || []).join(' ');
      const actual = builtTiles.map((t) => t.label).join(' ');
      isRight = actual === expected;
    } else if (currentChallenge.kind === 'listen-choice' || currentChallenge.kind === 'context-choice') {
      const picked = currentChallenge.choices?.find((c) => c.id === selectedChoice);
      isRight = Boolean(picked?.correct);
    } else if (currentChallenge.kind === 'speak-repeat') {
      const cleanSpoken = spokenText.trim().toLowerCase();
      if (!cleanSpoken) {
        isRight = true;
      } else {
        const expectedWords = currentChallenge.targetText
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s]/gu, '')
          .split(/\s+/)
          .filter(Boolean);
        const hits = expectedWords.filter((w) => cleanSpoken.includes(w));
        isRight = hits.length >= Math.max(1, Math.floor(expectedWords.length * 0.45));
      }
    }

    if (isRight) {
      setCheckState('correct');
      speakPhrase(currentChallenge.targetText, currentChallenge.speechLang);
      addXp(10);
    } else {
      setCheckState('wrong');
      setProgress((prev) => ({
        ...prev,
        hearts: Math.max(1, prev.hearts - 1),
      }));
    }
  };

  const advanceStep = () => {
    if (!activeUnit) return;
    if (checkState === 'wrong') {
      setCheckState('idle');
      setSelectedChoice(null);
      setBuiltTiles([]);
      return;
    }
    const nextIdx = stepIdx + 1;
    if (nextIdx >= activeUnit.challenges.length) {
      setUnitDone(true);
      const today = todayStr();
      setProgress((prev) => {
        const completed = prev.completedUnitIds.includes(activeUnit.id)
          ? prev.completedUnitIds
          : [...prev.completedUnitIds, activeUnit.id];
        return {
          ...prev,
          xp: prev.xp + activeUnit.xpReward,
          dailyXp: (prev.lastStudyDate === today ? prev.dailyXp : 0) + activeUnit.xpReward,
          hearts: 5,
          completedUnitIds: completed,
          lastStudyDate: today,
        };
      });
      return;
    }
    setStepIdx(nextIdx);
    setSelectedChoice(null);
    setBuiltTiles([]);
    setCheckState('idle');
    setSpokenText('');
    const nextCh = activeUnit.challenges[nextIdx];
    if (nextCh && (nextCh.kind === 'listen-choice' || nextCh.kind === 'speak-repeat')) {
      setTimeout(() => speakPhrase(nextCh.targetText, nextCh.speechLang), 180);
    }
  };

  const toggleSpeakChallengeMic = () => {
    if (!currentChallenge) return;
    if (listeningSpeak) {
      try {
        speakRecRef.current?.stop?.();
      } catch {}
      setListeningSpeak(false);
      return;
    }
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setSpokenText(currentChallenge.targetText);
      return;
    }
    try {
      const rec = new SpeechRec();
      rec.lang = currentChallenge.speechLang;
      rec.continuous = false;
      rec.interimResults = true;
      setSpokenText('');
      setListeningSpeak(true);
      rec.onresult = (e: any) => {
        let acc = '';
        for (let i = 0; i < e.results.length; i++) acc += e.results[i][0].transcript + ' ';
        setSpokenText(acc.trim());
      };
      rec.onerror = () => setListeningSpeak(false);
      rec.onend = () => setListeningSpeak(false);
      speakRecRef.current = rec;
      rec.start();
    } catch {
      setListeningSpeak(false);
    }
  };

  // In-app AI Immersion Coach turn (zero external jump)
  const sendCoachTurn = async (overrideText?: string) => {
    const text = (overrideText ?? coachInput).trim();
    if (!text || coachLoading) return;
    setCoachInput('');
    const nextHistory = [...coachMessages, { role: 'user' as const, text }];
    setCoachMessages(nextHistory);
    setCoachLoading(true);

    try {
      const scenarioLabel = activeScenario ? `${activeScenario.titleZh} (${activeScenario.titleEn})` : course.nativeName;
      const prompt = [
        `你现在是站内沉浸式语言学习导师，当前课程语言是【${course.zhName} / ${course.nativeName}】，场景：【${scenarioLabel}】。`,
        `学生刚才说：“${text}”。`,
        `请严格按如下格式回复，保持简短生动（最多2行）：`,
        `第1行：用自然地道的【${course.nativeName}】接着场景继续对话一句（不要带括号翻译）。`,
        `第2行：用${isZh ? '中文' : '英文'}给出这句的翻译和1句温和的地道表达点评（如果学生用中文问怎么说，直接教他地道的${course.nativeName}句子）。`,
      ].join('\n');

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          mode: 'companion',
          stream: true,
          history: nextHistory.slice(-6).map((m) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.text,
          })),
        }),
      });

      let full = '';
      await readAIStream(res, (delta) => {
        full += delta;
      });
      const lines = full
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const replyMain = lines[0] || activeScenario?.starterPrompt || 'Great! Keep practicing!';
      const replyNote = lines.slice(1).join(' ');

      setCoachMessages((prev) => [...prev, { role: 'tutor', text: replyMain, note: replyNote }]);
      speakPhrase(replyMain, course.speechLang, false);
      addXp(15);
    } catch {
      setCoachMessages((prev) => [
        ...prev,
        {
          role: 'tutor',
          text: activeScenario?.starterPrompt || 'Let us continue practicing!',
          note: isZh ? '网络短暂波动，已继续保持练习模式。' : 'Brief connection blip — continuing local drill.',
        },
      ]);
    } finally {
      setCoachLoading(false);
    }
  };

  const toggleCoachVoiceMic = () => {
    if (coachListening) {
      try {
        speakRecRef.current?.stop?.();
      } catch {}
      setCoachListening(false);
      return;
    }
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;
    try {
      const rec = new SpeechRec();
      rec.lang = course.speechLang;
      rec.continuous = false;
      rec.interimResults = false;
      setCoachListening(true);
      rec.onresult = (e: any) => {
        const transcript = e.results?.[0]?.[0]?.transcript?.trim();
        if (transcript) {
          void sendCoachTurn(transcript);
        }
      };
      rec.onerror = () => setCoachListening(false);
      rec.onend = () => setCoachListening(false);
      speakRecRef.current = rec;
      rec.start();
    } catch {
      setCoachListening(false);
    }
  };

  // All phrases inside active course for the built-in Phrasebook tab
  const coursePhrases = useMemo(() => {
    return course.units.flatMap((u) =>
      u.challenges.map((ch) => ({
        id: ch.id,
        unitTitle: isZh ? u.titleZh : u.titleEn,
        targetText: ch.targetText,
        romanization: ch.romanization,
        translation: isZh ? ch.translationZh : ch.translationEn,
        speechLang: ch.speechLang,
      }))
    );
  }, [course, isZh]);

  // Interactive Lesson Stage View
  if (activeUnit) {
    const totalSteps = activeUnit.challenges.length;
    const pct = unitDone ? 100 : Math.round(((stepIdx + (checkState === 'correct' ? 1 : 0)) / totalSteps) * 100);

    return (
      <div className="one-surface-elevated mx-auto max-w-3xl overflow-hidden">
        <div className="flex items-center gap-4 border-b px-5 py-4" style={{ borderColor: 'var(--color-one-border)' }}>
          <button
            type="button"
            onClick={() => setActiveUnit(null)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--color-one-text-muted)] transition hover:bg-[color:var(--color-one-surface-soft)] hover:text-[color:var(--color-one-text)]"
            aria-label={isZh ? '退出课程' : 'Exit lesson'}
          >
            <X className="h-4.5 w-4.5" />
          </button>

          <div
            className="h-2.5 flex-1 overflow-hidden rounded-full"
            style={{ background: 'var(--color-one-surface-soft)' }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${pct}%`, background: course.accentColor }}
            />
          </div>

          <div className="flex items-center gap-1.5 text-sm font-semibold tabular-nums text-rose-500">
            <Heart className="h-4 w-4 fill-current" />
            <span>{progress.hearts}</span>
          </div>
        </div>

        {unitDone ? (
          <div className="px-6 py-12 text-center sm:px-10">
            <div
              className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border"
              style={{
                borderColor: 'rgba(5, 150, 105, 0.3)',
                background: 'rgba(5, 150, 105, 0.12)',
                color: 'var(--color-one-success)',
              }}
            >
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h3 className="text-2xl font-semibold text-[color:var(--color-one-text)]">
              {isZh ? '本单元沉浸通关！' : 'Unit Complete!'}
            </h3>
            <p className="mt-2 text-sm text-[color:var(--color-one-text-muted)]">
              {isZh ? activeUnit.titleZh : activeUnit.titleEn} · +{activeUnit.xpReward} XP ·{' '}
              {isZh ? '生命值已自动补满' : 'Hearts restored'}
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => startUnit(activeUnit)} className="one-btn one-btn-md one-btn-secondary">
                <RotateCcw className="h-4 w-4" />
                <span>{isZh ? '再练一次' : 'Practice Again'}</span>
              </button>
              <button type="button" onClick={() => setActiveUnit(null)} className="one-btn one-btn-md one-btn-primary">
                <span>{isZh ? '返回多语言课程路径' : 'Back to Path'}</span>
              </button>
            </div>
          </div>
        ) : currentChallenge ? (
          <div className="p-5 sm:p-8">
            <div className="mb-1 text-xs font-medium text-[color:var(--color-one-text-dim)] tabular-nums">
              {course.nativeName} · {isZh ? `第 ${stepIdx + 1} / ${totalSteps} 题` : `Step ${stepIdx + 1} of ${totalSteps}`}
            </div>
            <h3 className="text-lg font-semibold leading-snug text-[color:var(--color-one-text)] sm:text-xl">
              {isZh ? currentChallenge.promptZh : currentChallenge.promptEn}
            </h3>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => speakPhrase(currentChallenge.targetText, currentChallenge.speechLang, false)}
                className="inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium text-[color:var(--color-one-text)] transition hover:border-[color:var(--color-one-accent)]"
                style={{ borderColor: 'var(--color-one-border)', background: 'var(--color-one-surface-soft)' }}
              >
                <Volume2 className="h-4 w-4 text-[color:var(--color-one-accent)]" />
                <span>{isZh ? '正常语速播放' : 'Listen 1.0x'}</span>
              </button>
              <button
                type="button"
                onClick={() => speakPhrase(currentChallenge.targetText, currentChallenge.speechLang, true)}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium text-[color:var(--color-one-text-muted)] transition hover:text-[color:var(--color-one-text)]"
                style={{ borderColor: 'var(--color-one-border)' }}
              >
                <span>{isZh ? '0.7x 慢速精听' : '0.7x Slow'}</span>
              </button>
            </div>

            <div className="mt-6">
              {currentChallenge.kind === 'tile-build' && (
                <div className="space-y-5">
                  <div
                    dir={course.dir || 'ltr'}
                    className="min-h-[68px] flex flex-wrap items-center gap-2 rounded-2xl border p-3.5"
                    style={{
                      borderColor: 'var(--color-one-border-strong)',
                      background: 'var(--color-one-surface-soft)',
                    }}
                  >
                    {builtTiles.length === 0 ? (
                      <span className="text-xs text-[color:var(--color-one-text-dim)]">
                        {isZh ? '请按顺序点击下方词块拼出句子…' : 'Tap word tiles below in order…'}
                      </span>
                    ) : (
                      builtTiles.map((tile) => (
                        <button
                          key={tile.key}
                          type="button"
                          disabled={checkState !== 'idle'}
                          onClick={() => setBuiltTiles((prev) => prev.filter((x) => x.key !== tile.key))}
                          className="rounded-xl border bg-[color:var(--color-one-surface)] px-3.5 py-2 text-sm font-medium text-[color:var(--color-one-text)] shadow-2xs transition hover:border-rose-400"
                          style={{ borderColor: 'var(--color-one-border)' }}
                        >
                          {tile.label}
                        </button>
                      ))
                    )}
                  </div>

                  <div dir={course.dir || 'ltr'} className="flex flex-wrap gap-2">
                    {tileBank.map((tile) => {
                      const used = builtTiles.some((b) => b.key === tile.key);
                      return (
                        <button
                          key={tile.key}
                          type="button"
                          disabled={used || checkState !== 'idle'}
                          onClick={() => setBuiltTiles((prev) => [...prev, tile])}
                          className={`rounded-xl border px-3.5 py-2 text-sm font-medium transition ${
                            used
                              ? 'opacity-30 cursor-default'
                              : 'bg-[color:var(--color-one-surface)] text-[color:var(--color-one-text)] hover:border-[color:var(--color-one-accent)]'
                          }`}
                          style={{ borderColor: 'var(--color-one-border)' }}
                        >
                          {tile.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {(currentChallenge.kind === 'listen-choice' || currentChallenge.kind === 'context-choice') && (
                <div className="space-y-2.5">
                  {(currentChallenge.choices || []).map((c, idx) => {
                    const picked = selectedChoice === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={checkState !== 'idle'}
                        onClick={() => {
                          setSelectedChoice(c.id);
                          if (currentChallenge.kind === 'context-choice') {
                            speakPhrase(c.text, currentChallenge.speechLang);
                          }
                        }}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left transition ${
                          picked
                            ? 'border-[color:var(--color-one-accent)] bg-[color:var(--color-one-accent-soft)]'
                            : 'hover:bg-[color:var(--color-one-surface-soft)]'
                        }`}
                        style={!picked ? { borderColor: 'var(--color-one-border)' } : undefined}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold tabular-nums text-[color:var(--color-one-text-dim)]"
                            style={{ borderColor: 'var(--color-one-border)' }}
                          >
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <div dir={course.dir || 'ltr'} className="text-sm font-medium text-[color:var(--color-one-text)]">
                              {c.text}
                            </div>
                            {c.note && <div className="mt-0.5 text-xs text-[color:var(--color-one-text-dim)]">{c.note}</div>}
                          </div>
                        </div>
                        {picked && <Check className="h-4 w-4 shrink-0 text-[color:var(--color-one-accent)]" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {currentChallenge.kind === 'speak-repeat' && (
                <div
                  className="rounded-2xl border p-5 text-center"
                  style={{ borderColor: 'var(--color-one-border)', background: 'var(--color-one-surface-soft)' }}
                >
                  <p dir={course.dir || 'ltr'} className="text-xl font-semibold text-[color:var(--color-one-text)]">
                    {currentChallenge.targetText}
                  </p>
                  {currentChallenge.romanization && (
                    <p className="mt-1 text-xs text-[color:var(--color-one-text-dim)]">{currentChallenge.romanization}</p>
                  )}
                  <p className="mt-2 text-sm text-[color:var(--color-one-text-muted)]">
                    {isZh ? currentChallenge.translationZh : currentChallenge.translationEn}
                  </p>

                  <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={toggleSpeakChallengeMic}
                      className={`inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white transition ${
                        listeningSpeak ? 'bg-rose-600 hover:bg-rose-500' : 'bg-sky-600 hover:bg-sky-500'
                      }`}
                    >
                      {listeningSpeak ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      <span>
                        {listeningSpeak
                          ? isZh
                            ? '正在收音，点击结束'
                            : 'Listening…'
                          : isZh
                          ? '按住 / 点击开口跟读'
                          : 'Speak Now'}
                      </span>
                    </button>
                  </div>

                  {spokenText && (
                    <p className="mt-3 text-xs text-[color:var(--color-one-text-muted)]">
                      {isZh ? `识别结果：「${spokenText}」` : `Heard: "${spokenText}"`}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-7 border-t pt-5" style={{ borderColor: 'var(--color-one-border)' }}>
              {checkState === 'idle' ? (
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveUnit(null)}
                    className="inline-flex h-10 items-center gap-1.5 text-xs font-medium text-[color:var(--color-one-text-dim)] hover:text-[color:var(--color-one-text)]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>{isZh ? '返回课程树' : 'Exit'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={checkAnswer}
                    disabled={
                      (currentChallenge.kind === 'tile-build' && builtTiles.length === 0) ||
                      ((currentChallenge.kind === 'listen-choice' || currentChallenge.kind === 'context-choice') &&
                        !selectedChoice)
                    }
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
                  >
                    <span>{isZh ? '检查答案' : 'Check'}</span>
                  </button>
                </div>
              ) : (
                <div
                  className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                    checkState === 'correct'
                      ? 'border-emerald-500/35 bg-emerald-500/10'
                      : 'border-rose-500/35 bg-rose-500/10'
                  }`}
                >
                  <div>
                    <div
                      className={`text-sm font-semibold ${
                        checkState === 'correct' ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'
                      }`}
                    >
                      {checkState === 'correct'
                        ? isZh
                          ? '回答正确！ +10 XP'
                          : 'Great job! +10 XP'
                        : isZh
                        ? '再试一次，对照标准例句看看'
                        : 'Not quite — review the phrase'}
                    </div>
                    <div dir={course.dir || 'ltr'} className="mt-1 text-xs text-[color:var(--color-one-text-muted)]">
                      {currentChallenge.targetText} · {isZh ? currentChallenge.translationZh : currentChallenge.translationEn}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={advanceStep}
                    className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-5 text-sm font-semibold text-white ${
                      checkState === 'correct' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                    }`}
                  >
                    <span>
                      {checkState === 'wrong'
                        ? isZh
                          ? '重新作答'
                          : 'Retry'
                        : stepIdx + 1 >= totalSteps
                        ? isZh
                          ? '完成单元'
                          : 'Finish'
                        : isZh
                        ? '继续下一题'
                        : 'Continue'}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  const dailyGoalPct = Math.min(100, Math.round((progress.dailyXp / 50) * 100));

  return (
    <div className="space-y-5">
      {/* Embedded Native Duolingo Header Strip — ZERO External Redirects */}
      <div className="one-surface flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-500">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{isZh ? '站内原生部署 · 多邻国多语言沉浸系统' : 'Built-In Duolingo Multi-Language Immersion Engine'}</span>
          </div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--color-one-text)]">
            {isZh ? `当前修习：${course.zhName} (${course.nativeName})` : `Active Course: ${course.enName} (${course.nativeName})`}
          </h2>
          <p className="mt-1 text-xs text-[color:var(--color-one-text-muted)]">
            {isZh
              ? '全流程直接在站内运行：互动词块、原声慢速精听、跟读口语与 AI 情景对练，无需跳转外部网页。'
              : 'Runs completely inside ONE: interactive lessons, native audio, speaking drills, and live AI roleplay.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Daily XP Quest Progress */}
          <div
            className="flex items-center gap-2.5 rounded-xl border px-3 py-2"
            style={{ borderColor: 'var(--color-one-border)', background: 'var(--color-one-surface-soft)' }}
          >
            <Trophy className="h-4 w-4 text-amber-500" />
            <div className="min-w-[96px]">
              <div className="flex items-center justify-between text-[10px] text-[color:var(--color-one-text-dim)] tabular-nums">
                <span>{isZh ? '今日目标' : 'Daily Quest'}</span>
                <span>{Math.min(50, progress.dailyXp)}/50 XP</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${dailyGoalPct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3.5 text-sm font-semibold tabular-nums">
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400" title="连胜">
              <Flame className="h-4 w-4" />
              {progress.streak}d
            </span>
            <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400" title="经验值">
              <Gem className="h-4 w-4" />
              {progress.xp} XP
            </span>
            <button
              type="button"
              onClick={() => setProgress((p) => ({ ...p, hearts: 5 }))}
              title={isZh ? '点击补充生命值至 5 颗心' : 'Tap to refill hearts'}
              className="inline-flex items-center gap-1 text-rose-500 hover:opacity-80 cursor-pointer"
            >
              <Heart className="h-4 w-4 fill-current" />
              {progress.hearts}
            </button>
          </div>

          {onOpenEnglishEngine && (
            <button type="button" onClick={onOpenEnglishEngine} className="one-btn one-btn-sm one-btn-secondary">
              <Sparkles className="h-3.5 w-3.5 text-[color:var(--color-one-accent)]" />
              <span>{isZh ? '英语词典引擎' : 'English Engine'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Multi-Language Switcher + Built-In Mode Tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:pb-0">
          {IMMERSION_COURSES.map((c) => {
            const active = c.id === progress.activeCourse;
            const completedInCourse = c.units.filter((u) => progress.completedUnitIds.includes(u.id)).length;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setProgress((prev) => ({ ...prev, activeCourse: c.id }));
                  setSelectedScenarioIdx(0);
                }}
                className={`flex min-h-[44px] shrink-0 items-center gap-2.5 rounded-xl border px-3.5 py-2 text-left transition cursor-pointer ${
                  active
                    ? 'border-[color:var(--color-one-accent)] bg-[color:var(--color-one-accent-soft)]'
                    : 'border-[color:var(--color-one-border)] bg-[color:var(--color-one-surface)] hover:bg-[color:var(--color-one-surface-soft)]'
                }`}
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white"
                  style={{ background: c.accentColor }}
                >
                  {c.code}
                </span>
                <div>
                  <div className="text-sm font-semibold text-[color:var(--color-one-text)]">
                    {isZh ? c.zhName : c.enName}
                  </div>
                  <div className="text-[11px] tabular-nums text-[color:var(--color-one-text-dim)]">
                    {c.nativeName} · {completedInCourse}/{c.units.length}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="inline-flex rounded-xl border p-1 self-start sm:self-auto" style={{ borderColor: 'var(--color-one-border)', background: 'var(--color-one-surface)' }}>
          {([
            { id: 'path' as const, zh: '闯关路径', en: 'Course Path', icon: Layers },
            { id: 'ai_coach' as const, zh: 'AI 对练', en: 'AI Roleplay', icon: MessageCircle },
            { id: 'phrasebook' as const, zh: '句库精听', en: 'Phrasebook', icon: Volume2 },
          ]).map((tab) => {
            const Icon = tab.icon;
            const active = subMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubMode(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                  active
                    ? 'bg-emerald-600 text-white'
                    : 'text-[color:var(--color-one-text-muted)] hover:text-[color:var(--color-one-text)]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{isZh ? tab.zh : tab.en}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode 1: Course Path Units */}
      {subMode === 'path' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {course.units.map((unit) => {
            const done = progress.completedUnitIds.includes(unit.id);
            return (
              <article
                key={unit.id}
                className="one-surface flex flex-col justify-between p-5 transition hover:-translate-y-0.5"
                style={{ borderColor: done ? 'rgba(5, 150, 105, 0.35)' : 'var(--color-one-border)' }}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs text-[color:var(--color-one-text-dim)]">
                    <span className="inline-flex items-center gap-1.5 font-medium tabular-nums">
                      <Layers className="h-3.5 w-3.5" style={{ color: course.accentColor }} />
                      {isZh ? `第 ${unit.order} 单元` : `Unit ${unit.order}`}
                    </span>
                    <span className="tabular-nums">{done ? (isZh ? '已掌握' : 'Mastered') : `+${unit.xpReward} XP`}</span>
                  </div>

                  <h3 className="mt-2.5 text-base font-semibold text-[color:var(--color-one-text)]">
                    {isZh ? unit.titleZh : unit.titleEn}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--color-one-text-muted)]">
                    {isZh ? unit.topicZh : unit.topicEn}
                  </p>

                  <div className="mt-3 text-[11px] tabular-nums text-[color:var(--color-one-text-dim)]">
                    {unit.challenges.length} {isZh ? '个互动关卡' : 'challenges'} · {unit.challenges[0]?.targetText}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => startUnit(unit)}
                  className={`mt-5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition ${
                    done
                      ? 'border border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15'
                      : 'text-white hover:opacity-95'
                  }`}
                  style={!done ? { background: course.accentColor } : undefined}
                >
                  <BookOpen className="h-4 w-4" />
                  <span>{done ? (isZh ? '巩固重温' : 'Review Unit') : isZh ? '开始站内闯关' : 'Start Lesson'}</span>
                </button>
              </article>
            );
          })}
        </div>
      )}

      {/* Mode 2: Built-In AI Immersion Scenario Roleplay */}
      {subMode === 'ai_coach' && (
        <div className="one-surface-elevated overflow-hidden">
          <div
            className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"
            style={{ borderColor: 'var(--color-one-border)' }}
          >
            <div>
              <h3 className="text-base font-semibold text-[color:var(--color-one-text)]">
                {isZh ? `${course.zhName} · AI 情景沉浸对练 (+15 XP/轮)` : `${course.enName} AI Immersion Roleplay`}
              </h3>
              <p className="mt-0.5 text-xs text-[color:var(--color-one-text-muted)]">
                {isZh ? '用语音或文字直接与站内 AI 导师全外语实战对话，自动朗读并即时纠音点评。' : 'Practice live scenario roleplay inside ONE with instant voice playback.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {course.scenarios.map((sc, idx) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => setSelectedScenarioIdx(idx)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                    idx === selectedScenarioIdx
                      ? 'border-[color:var(--color-one-accent)] bg-[color:var(--color-one-accent-soft)] text-[color:var(--color-one-accent)]'
                      : 'border-[color:var(--color-one-border)] text-[color:var(--color-one-text-muted)]'
                  }`}
                >
                  {isZh ? sc.titleZh : sc.titleEn}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[340px] space-y-3 overflow-y-auto p-5">
            {coachMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-sky-600 text-white'
                      : 'border border-[color:var(--color-one-border)] bg-[color:var(--color-one-surface-soft)] text-[color:var(--color-one-text)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p dir={course.dir || 'ltr'} className="font-medium leading-relaxed">
                      {msg.text}
                    </p>
                    {msg.role === 'tutor' && (
                      <button
                        type="button"
                        onClick={() => speakPhrase(msg.text, course.speechLang)}
                        className="shrink-0 rounded-full p-1 text-[color:var(--color-one-accent)] hover:bg-black/5 dark:hover:bg-white/10"
                        title={isZh ? '朗读原声' : 'Speak'}
                      >
                        <Volume2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {msg.note && (
                    <p className="mt-1.5 text-xs opacity-80 leading-relaxed">{msg.note}</p>
                  )}
                </div>
              </div>
            ))}
            {coachLoading && (
              <div className="flex items-center gap-2 text-xs text-[color:var(--color-one-text-dim)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{isZh ? 'AI 导师正在组织地道回应…' : 'Tutor replying…'}</span>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendCoachTurn();
            }}
            className="flex items-center gap-2 border-t p-4"
            style={{ borderColor: 'var(--color-one-border)' }}
          >
            <button
              type="button"
              onClick={toggleCoachVoiceMic}
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition ${
                coachListening
                  ? 'border-rose-400 bg-rose-500 text-white'
                  : 'border-[color:var(--color-one-border)] bg-[color:var(--color-one-surface-soft)] text-[color:var(--color-one-text)]'
              }`}
              title={isZh ? '语音输入对练' : 'Voice input'}
            >
              {coachListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <input
              value={coachInput}
              onChange={(e) => setCoachInput(e.target.value)}
              placeholder={
                isZh
                  ? `试着用${course.zhName}或中文询问导师，例如“我要一杯拿铁谢谢”…`
                  : `Reply in ${course.enName} or ask how to say a phrase…`
              }
              className="h-10 flex-1 rounded-xl border bg-[color:var(--color-one-surface-soft)] px-3.5 text-sm text-[color:var(--color-one-text)] placeholder-[color:var(--color-one-text-dim)] focus:border-[color:var(--color-one-accent)] focus:outline-none"
              style={{ borderColor: 'var(--color-one-border)' }}
            />
            <button
              type="submit"
              disabled={!coachInput.trim() || coachLoading}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-45"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{isZh ? '发送' : 'Send'}</span>
            </button>
          </form>
        </div>
      )}

      {/* Mode 3: Built-In Phrasebook & Audio Drill */}
      {subMode === 'phrasebook' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {coursePhrases.map((item) => (
            <div
              key={item.id}
              className="one-surface flex items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <div className="text-[11px] text-[color:var(--color-one-text-dim)]">{item.unitTitle}</div>
                <div dir={course.dir || 'ltr'} className="mt-1 text-base font-semibold text-[color:var(--color-one-text)]">
                  {item.targetText}
                </div>
                {item.romanization && (
                  <div className="text-[11px] text-[color:var(--color-one-text-dim)]">{item.romanization}</div>
                )}
                <div className="mt-1 text-xs text-[color:var(--color-one-text-muted)]">{item.translation}</div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => speakPhrase(item.targetText, item.speechLang, false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border text-[color:var(--color-one-accent)] hover:bg-[color:var(--color-one-surface-soft)]"
                  style={{ borderColor: 'var(--color-one-border)' }}
                  title="1.0x"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => speakPhrase(item.targetText, item.speechLang, true)}
                  className="inline-flex h-9 items-center justify-center rounded-xl border px-2 text-[11px] font-medium text-[color:var(--color-one-text-muted)] hover:text-[color:var(--color-one-text)]"
                  style={{ borderColor: 'var(--color-one-border)' }}
                  title="0.7x Slow"
                >
                  0.7x
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DuolingoImmersionPlatform;
