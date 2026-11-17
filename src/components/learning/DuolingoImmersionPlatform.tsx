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
  MessageSquare,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import type { Language } from '../../types/index.ts';
import { readAIStream } from '../../utils/aiStream.ts';

type CourseLangId = 'en' | 'zh' | 'ko' | 'ar' | 'es' | 'fr' | 'ja';

type ChallengeKind = 'tile-build' | 'listen-choice' | 'context-choice' | 'speak-repeat';

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
  tutorGreetingZh: string;
  tutorGreetingEn: string;
  scenarios: Array<{ labelZh: string; labelEn: string; prompt: string }>;
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
    tutorGreetingZh: 'Hi! 我是你的英语沉浸导师。选一个场景，或直接用英文/中文和我对话练习。',
    tutorGreetingEn: "Hi! I'm your English Immersion Coach. Pick a scenario or message me to practice.",
    scenarios: [
      { labelZh: '机场与出行', labelEn: 'Travel', prompt: "Let's roleplay checking in at an international airport in natural English." },
      { labelZh: '咖啡馆点单', labelEn: 'Café', prompt: "Let's practice ordering specialty coffee and making polite small talk in English." },
      { labelZh: '商务表达', labelEn: 'Work', prompt: 'Coach me on giving a clear 2-sentence project update in fluent English.' },
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
            promptZh: '点击发音并跟读这句高频句型（支持实时语音评测）',
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
        topicZh: '讨论协作、习惯养成与长远视角',
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
    id: 'zh',
    nativeName: '中文',
    zhName: '中文',
    enName: 'Mandarin Chinese',
    code: 'ZH',
    speechLang: 'zh-CN',
    accentColor: '#059669',
    tutorGreetingZh: '你好！我可以陪你练习汉语拼音、声调、日常地道表达与古今词汇。',
    tutorGreetingEn: 'Nǐ hǎo! Let us practice Mandarin tones, sentence flow, and everyday expressions.',
    scenarios: [
      { labelZh: '点餐与茶饮', labelEn: 'Dining', prompt: '请用中文带我练习在茶馆点茶和礼貌交流的句子，并附上拼音。' },
      { labelZh: '声调对比', labelEn: 'Tones', prompt: '帮我出 3 组容易混淆声调的中文词组，附上拼音和例句。' },
      { labelZh: '城市问路', labelEn: 'Transit', prompt: '我们模拟一次在北京地铁站问路的实用中文对话，附拼音。' },
    ],
    units: [
      {
        id: 'zh_u1',
        order: 1,
        titleZh: 'Unit 1 · 声调礼仪与自然寒暄',
        titleEn: 'Unit 1 · Tones & Warm Greetings',
        topicZh: '“你好”“请多关照”与声调辨析',
        topicEn: 'Polite greetings & tone awareness',
        xpReward: 25,
        challenges: [
          {
            id: 'zh_1_1',
            kind: 'tile-build',
            promptZh: '组合礼貌问候句：“请问您贵姓？”',
            promptEn: 'Build: "May I ask your surname?" (Qǐng wèn nín guì xìng)',
            targetText: '请问 您 贵姓',
            romanization: 'Qǐng wèn nín guì xìng?',
            translationZh: '请问您贵姓？',
            translationEn: 'May I ask your surname politely?',
            speechLang: 'zh-CN',
            expectedTokens: ['请问', '您', '贵姓'],
            distractorTokens: ['昨天', '高兴'],
          },
          {
            id: 'zh_1_2',
            kind: 'listen-choice',
            promptZh: '听中文普通话发音，选出对应英文含义',
            promptEn: 'Listen to Mandarin and match its English meaning',
            targetText: '很高兴在这里认识你',
            romanization: 'Hěn gāoxìng zài zhèlǐ rènshi nǐ',
            translationZh: '很高兴在这里认识你。',
            translationEn: 'Very glad to meet you here.',
            speechLang: 'zh-CN',
            choices: [
              { id: 'a', text: 'Very glad to meet you here.', correct: true },
              { id: 'b', text: 'Where is the nearest library?' },
              { id: 'c', text: 'Would you like a cup of green tea?' },
            ],
          },
          {
            id: 'zh_1_3',
            kind: 'speak-repeat',
            promptZh: '听标准读音并跟读：“我想学习流利的中文对话”',
            promptEn: 'Listen and repeat: "I want to learn fluent Chinese conversation"',
            targetText: '我想学习流利的中文对话',
            romanization: 'Wǒ xiǎng xuéxí liúlì de Zhōngwén duìhuà',
            translationZh: '我想学习流利的中文对话。',
            translationEn: 'I want to practice fluent Mandarin conversation.',
            speechLang: 'zh-CN',
          },
        ],
      },
      {
        id: 'zh_u2',
        order: 2,
        titleZh: 'Unit 2 · 生活点单与方向指引',
        titleEn: 'Unit 2 · Ordering & Getting Around',
        topicZh: '点单、付款礼仪与地铁乘车用语',
        topicEn: 'Tea shop orders & city transit',
        xpReward: 30,
        challenges: [
          {
            id: 'zh_2_1',
            kind: 'context-choice',
            promptZh: '在茶馆想点“一杯少糖的温乌龙茶”，最自然地说：',
            promptEn: 'Choose the natural way to order a warm oolong tea with less sugar',
            targetText: '你好，请给我一杯温的乌龙茶，少糖。',
            romanization: 'Nǐ hǎo, qǐng gěi wǒ yì bēi wēn de wūlóngchá, shǎo táng.',
            translationZh: '你好，请给我一杯温的乌龙茶，少糖。',
            translationEn: 'Hello, one warm oolong tea with less sugar, please.',
            speechLang: 'zh-CN',
            choices: [
              { id: 'a', text: '你好，请给我一杯温的乌龙茶，少糖。', note: '礼貌且自然', correct: true },
              { id: 'b', text: '请问这辆列车什么时候到茶馆？' },
              { id: 'c', text: '我的电脑昨天没有喝茶。' },
            ],
          },
          {
            id: 'zh_2_2',
            kind: 'tile-build',
            promptZh: '拼出问路句子：“请问去图书馆怎么走？”',
            promptEn: 'Build: "Excuse me, how do I get to the library?"',
            targetText: '请问 去 图书馆 怎么走',
            romanization: 'Qǐngwèn qù túshūguǎn zěnme zǒu?',
            translationZh: '请问去图书馆怎么走？',
            translationEn: 'Excuse me, how do I get to the library?',
            speechLang: 'zh-CN',
            expectedTokens: ['请问', '去', '图书馆', '怎么走'],
            distractorTokens: ['多少', '颜色'],
          },
        ],
      },
    ],
  },
  {
    id: 'ko',
    nativeName: '한국어',
    zhName: '韩语',
    enName: 'Korean',
    code: 'KO',
    speechLang: 'ko-KR',
    accentColor: '#7c3aed',
    tutorGreetingZh: '안녕하세요! 我可以带你从敬语问候、韩文字母拼读到首尔日常交流实战。',
    tutorGreetingEn: "Annyeonghaseyo! Let's practice polite Korean, Hangul, and daily expressions.",
    scenarios: [
      { labelZh: '首尔咖啡店', labelEn: 'Café', prompt: "Let's roleplay ordering an iced americano politely in Korean with romanization." },
      { labelZh: '敬语区分', labelEn: 'Polite forms', prompt: 'Explain polite -요 endings vs formal -습니다 endings with 3 easy examples.' },
    ],
    units: [
      {
        id: 'ko_u1',
        order: 1,
        titleZh: 'Unit 1 · 礼貌敬语与初次见面',
        titleEn: 'Unit 1 · Polite Greetings',
        topicZh: '안녕하세요、감사합니다 与自我介绍',
        topicEn: 'Polite greetings & warm thanks',
        xpReward: 25,
        challenges: [
          {
            id: 'ko_1_1',
            kind: 'context-choice',
            promptZh: '在首尔与人初次见面时，最礼貌的“见到您很高兴”是：',
            promptEn: 'Select "Nice to meet you" in polite Korean',
            targetText: '만나서 반갑습니다',
            romanization: 'Mannaseo bangapseumnida',
            translationZh: '见到您很高兴。',
            translationEn: 'Nice to meet you.',
            speechLang: 'ko-KR',
            choices: [
              { id: 'a', text: '만나서 반갑습니다', note: 'Mannaseo bangapseumnida', correct: true },
              { id: 'b', text: '여기가 어디예요?', note: 'Where is this place?' },
              { id: 'c', text: '잠시만 기다려 주세요', note: 'Please wait a moment' },
            ],
          },
          {
            id: 'ko_1_2',
            kind: 'tile-build',
            promptZh: '按正确韩语语序拼出：“不好意思，请问地铁站在哪里？”',
            promptEn: 'Build: "Excuse me, where is the subway station?"',
            targetText: '실례지만 지하철역이 어디예요',
            romanization: 'Sillyejiman jihacheoryeogi eodiyeyo?',
            translationZh: '不好意思，请问地铁站在哪里？',
            translationEn: 'Excuse me, where is the subway station?',
            speechLang: 'ko-KR',
            expectedTokens: ['실례지만', '지하철역이', '어디예요'],
            distractorTokens: ['감사합니다', '커피'],
          },
          {
            id: 'ko_1_3',
            kind: 'speak-repeat',
            promptZh: '跟读敬语致谢：“진심으로 감사합니다”',
            promptEn: 'Listen and repeat aloud',
            targetText: '진심으로 감사합니다',
            romanization: 'Jinsimeuro gamsahamnida',
            translationZh: '衷心感谢您。',
            translationEn: 'Thank you sincerely.',
            speechLang: 'ko-KR',
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
    tutorGreetingZh: 'السلام عليكم! 我是你的阿拉伯语导师，随时带读标准阿语、练习词根与日常对话。',
    tutorGreetingEn: 'As-salāmu ʿalaykum! Practice Modern Standard Arabic vocabulary, roots, and dialogue with me.',
    scenarios: [
      { labelZh: '经典问候礼仪', labelEn: 'Greetings', prompt: 'Teach me 3 authentic Arabic greetings and warm replies with transliteration.' },
      { labelZh: '书城与图书馆', labelEn: 'Library', prompt: 'Help me practice asking for a grammar book in Arabic with English/Chinese notes.' },
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
    accentColor: '#0f766e',
    tutorGreetingZh: '¡Hola! 我是你的西班牙语沉浸陪练，一起来练习流利清晰的日常表达吧！',
    tutorGreetingEn: '¡Hola! Let us practice warm, expressive everyday Spanish together.',
    scenarios: [
      { labelZh: '马德里点餐', labelEn: 'Tapas & Coffee', prompt: 'Let us practice ordering coffee and breakfast politely in Spanish.' },
      { labelZh: '日常寒暄', labelEn: 'Small Talk', prompt: 'Start a friendly Spanish conversation asking how my week is going.' },
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
            promptZh: '组合句子：“早上好，请来一杯咖啡。”',
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
        titleZh: 'Unit 2 · 旅途问路与礼貌致谢',
        titleEn: 'Unit 2 · Directions & Courtesy',
        topicZh: '博物馆、火车站问路与时间表达',
        topicEn: 'Asking directions politely',
        xpReward: 30,
        challenges: [
          {
            id: 'es_2_1',
            kind: 'speak-repeat',
            promptZh: '跟读高频问路句：“Disculpe, ¿dónde está el museo?”',
            promptEn: 'Repeat aloud: "Excuse me, where is the museum?"',
            targetText: 'Disculpe, ¿dónde está el museo?',
            translationZh: '打扰一下，请问博物馆在哪里？',
            translationEn: 'Excuse me, where is the museum?',
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
    accentColor: '#4f46e5',
    tutorGreetingZh: 'Bonjour ! 我是你的法语连诵与口语教练，随时开始法式日常交流。',
    tutorGreetingEn: 'Bonjour ! Practice smooth French liaison, café etiquette, and natural phrasing.',
    scenarios: [
      { labelZh: '巴黎咖啡馆', labelEn: 'Paris Café', prompt: 'Simulate ordering a croissant and café crème politely in French.' },
      { labelZh: '连诵发音技巧', labelEn: 'Pronunciation', prompt: 'Give me 3 everyday French sentences highlighting natural liaison.' },
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
            promptZh: '拼出句子：“您好，您今天过得怎么样？”',
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
    tutorGreetingZh: 'こんにちは！我可以陪你练习敬语寒暄、五十音词组与东京日常会话。',
    tutorGreetingEn: 'Konnichiwa! Practice polite Japanese, travel phrases, and natural cadence with me.',
    scenarios: [
      { labelZh: '东京问路', labelEn: 'Directions', prompt: 'Practice asking how to reach Shinjuku station in polite Japanese with romaji.' },
      { labelZh: '餐厅点餐', labelEn: 'Dining', prompt: 'Roleplay ordering ramen and saying thank you naturally in Japanese.' },
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
          {
            id: 'ja_1_3',
            kind: 'speak-repeat',
            promptZh: '跟读实用感谢句：“ありがとうございます”',
            promptEn: 'Repeat aloud: "Thank you very much"',
            targetText: 'ありがとうございます',
            romanization: 'Arigatou gozaimasu',
            translationZh: '非常感谢。',
            translationEn: 'Thank you very much.',
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
  activeCourse: CourseLangId;
  completedUnitIds: string[];
  lastStudyDate: string;
}

interface TutorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const PROGRESS_KEY = 'earth_one_duolingo_immersion_v1';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadProgress(): ProgressState {
  const fallback: ProgressState = {
    xp: 40,
    streak: 1,
    hearts: 5,
    activeCourse: 'en',
    completedUnitIds: [],
    lastStudyDate: todayStr(),
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      xp: Number.isFinite(parsed?.xp) ? parsed.xp : 40,
      streak: Number.isFinite(parsed?.streak) ? Math.max(1, parsed.streak) : 1,
      hearts: Number.isFinite(parsed?.hearts) ? Math.max(1, Math.min(5, parsed.hearts)) : 5,
      activeCourse: ['en', 'zh', 'ko', 'ar', 'es', 'fr', 'ja'].includes(parsed?.activeCourse)
        ? parsed.activeCourse
        : 'en',
      completedUnitIds: Array.isArray(parsed?.completedUnitIds) ? parsed.completedUnitIds : [],
      lastStudyDate: typeof parsed?.lastStudyDate === 'string' ? parsed.lastStudyDate : todayStr(),
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

function playFeedbackTone(kind: 'correct' | 'wrong' | 'complete') {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const freqs =
      kind === 'complete'
        ? [523.25, 659.25, 783.99, 1046.5]
        : kind === 'correct'
          ? [523.25, 659.25]
          : [280, 210];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === 'wrong' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f, now + idx * 0.08);
      gain.gain.setValueAtTime(0.001, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.09, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.19);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.21);
    });
    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 900);
  } catch {}
}

export const DuolingoImmersionPlatform: React.FC<{
  lang: Language;
  onOpenEnglishEngine?: () => void;
}> = ({ lang, onOpenEnglishEngine }) => {
  const isZh = lang === 'zh';
  const [progress, setProgress] = useState<ProgressState>(loadProgress);
  const [platformMode, setPlatformMode] = useState<'path' | 'coach'>('path');
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

  // Embedded DeepSeek Language Tutor state
  const [tutorInput, setTutorInput] = useState('');
  const [tutorLoading, setTutorLoading] = useState(false);
  const [tutorMessagesByCourse, setTutorMessagesByCourse] = useState<Record<string, TutorMessage[]>>({});
  const [tutorMicActive, setTutorMicActive] = useState(false);
  const tutorRecRef = useRef<any>(null);
  const tutorEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch {}
  }, [progress]);

  const course = useMemo(
    () => IMMERSION_COURSES.find((c) => c.id === progress.activeCourse) || IMMERSION_COURSES[0],
    [progress.activeCourse]
  );

  const tutorMessages = useMemo<TutorMessage[]>(() => {
    const existing = tutorMessagesByCourse[course.id];
    if (existing && existing.length > 0) return existing;
    return [
      {
        id: `init_${course.id}`,
        role: 'assistant',
        content: isZh ? course.tutorGreetingZh : course.tutorGreetingEn,
      },
    ];
  }, [course, isZh, tutorMessagesByCourse]);

  useEffect(() => {
    if (platformMode === 'coach') {
      tutorEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [tutorMessages, platformMode]);

  const speakPhrase = (text: string, speechLang: string, slow = false) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const cleaned = text.replace(/[*_`#>]/g, '').trim();
      const utt = new SpeechSynthesisUtterance(cleaned.slice(0, 320));
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

  const startUnit = (unit: CourseUnit) => {
    setPlatformMode('path');
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
        const expectedNorm = currentChallenge.targetText.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        const spokenNorm = cleanSpoken.replace(/[^\p{L}\p{N}]/gu, '');
        if (spokenNorm && expectedNorm && (expectedNorm.includes(spokenNorm.slice(0, 3)) || spokenNorm.includes(expectedNorm.slice(0, 3)))) {
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
    }

    if (isRight) {
      setCheckState('correct');
      playFeedbackTone('correct');
      speakPhrase(currentChallenge.targetText, currentChallenge.speechLang);
      setProgress((prev) => ({ ...prev, xp: prev.xp + 10 }));
    } else {
      setCheckState('wrong');
      playFeedbackTone('wrong');
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
      playFeedbackTone('complete');
      const today = todayStr();
      setProgress((prev) => {
        const completed = prev.completedUnitIds.includes(activeUnit.id)
          ? prev.completedUnitIds
          : [...prev.completedUnitIds, activeUnit.id];
        return {
          ...prev,
          xp: prev.xp + activeUnit.xpReward,
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

  const sendTutorPrompt = async (overrideText?: string) => {
    const clean = (overrideText ?? tutorInput).trim();
    if (!clean || tutorLoading) return;
    if (!overrideText) setTutorInput('');

    const cid = course.id;
    const userMsg: TutorMessage = { id: `u_${Date.now()}`, role: 'user', content: clean };
    const aiMsgId = `a_${Date.now()}`;
    const currentMsgs = tutorMessages;

    setTutorMessagesByCourse((prev) => ({
      ...prev,
      [cid]: [...currentMsgs, userMsg, { id: aiMsgId, role: 'assistant', content: '' }],
    }));
    setTutorLoading(true);

    const tutorPrompt = `Active course language: ${course.enName} (${course.nativeName}, code: ${course.code}). User UI language: ${isZh ? 'Chinese' : 'English'}. Help the user practice ${course.nativeName} naturally in 2-4 clear lines with pronunciation/romanization notes when helpful. User input: ${clean}`;

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: tutorPrompt,
          modelId: 'deepseek-v3',
          mode: 'tutor',
          maxTokens: 320,
          stream: true,
          history: currentMsgs.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      let acc = '';
      await readAIStream(res, (delta) => {
        acc += delta;
        setTutorMessagesByCourse((prev) => ({
          ...prev,
          [cid]: (prev[cid] || []).map((m) => (m.id === aiMsgId ? { ...m, content: acc } : m)),
        }));
      });
      if (acc.trim()) {
        setProgress((prev) => ({ ...prev, xp: prev.xp + 5 }));
      }
    } catch (err) {
      const errText = err instanceof Error && /401|503|API Key|DEEPSEEK_API_KEY/i.test(err.message)
        ? isZh
          ? `DeepSeek 口语导师暂未配置服务端密钥（请前往 AI 工作台设置填入 DeepSeek Key）。你现在可以先点选「课程闯关」进行词块、听力与跟读训练。`
          : `DeepSeek Coach needs an API key in AI Hub settings. Meanwhile, all interactive Skill Path lessons work offline!`
        : isZh
          ? '网络连接暂时波动，请重试或切换课程闯关继续学习。'
          : 'Temporary connection issue — please retry or practice Skill Path lessons.';
      setTutorMessagesByCourse((prev) => ({
        ...prev,
        [cid]: (prev[cid] || []).map((m) => (m.id === aiMsgId ? { ...m, content: errText } : m)),
      }));
    } finally {
      setTutorLoading(false);
    }
  };

  const toggleTutorMic = () => {
    if (tutorMicActive) {
      try {
        tutorRecRef.current?.stop?.();
      } catch {}
      setTutorMicActive(false);
      return;
    }
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;
    try {
      const rec = new SpeechRec();
      rec.lang = course.speechLang;
      rec.continuous = false;
      rec.interimResults = false;
      setTutorMicActive(true);
      rec.onresult = (e: any) => {
        const transcript = e.results?.[0]?.[0]?.transcript || '';
        if (transcript.trim()) setTutorInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      };
      rec.onerror = () => setTutorMicActive(false);
      rec.onend = () => setTutorMicActive(false);
      tutorRecRef.current = rec;
      rec.start();
    } catch {
      setTutorMicActive(false);
    }
  };

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
            <p className="mt-2 text-sm text-[color:var(--color-one-text-muted)] tabular-nums">
              {isZh ? activeUnit.titleZh : activeUnit.titleEn} · +{activeUnit.xpReward} XP
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
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold tabular-nums text-[color:var(--color-one-text-dim)]" style={{ borderColor: 'var(--color-one-border)' }}>
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <div dir={course.dir || 'ltr'} className="text-sm font-medium text-[color:var(--color-one-text)]">
                              {c.text}
                            </div>
                            {c.note && (
                              <div className="mt-0.5 text-xs text-[color:var(--color-one-text-dim)]">{c.note}</div>
                            )}
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
                            ? '点击开口跟读'
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
                          ? '回答正确 · +10 XP'
                          : 'Correct · +10 XP'
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

  return (
    <div className="space-y-5">
      {/* Platform Overview Strip: Deployed 100% natively in Learning Center (Zero external redirects) */}
      <div className="one-surface flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[color:var(--color-one-text-dim)]">
            <span>{isZh ? '多邻国 · 多语言沉浸学习系统' : 'Multi-Language Immersion Studio'}</span>
            <span aria-hidden="true">·</span>
            <span>{isZh ? '站内直连实训' : 'Native In-App Learning'}</span>
          </div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--color-one-text)]">
            {isZh
              ? `当前语种：${course.zhName} (${course.nativeName})`
              : `Active Course: ${course.enName} (${course.nativeName})`}
          </h2>
          <p className="mt-1 text-xs text-[color:var(--color-one-text-muted)]">
            {isZh
              ? '内置 7 大语种交互课程路径、慢速原声精听、口语语音评测与 DeepSeek 一对一沉浸口语导师。'
              : 'Interactive multi-language skill trees, slow/normal native audio, speech checks & DeepSeek live tutor.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-4 text-sm font-semibold tabular-nums">
            <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400" title={isZh ? '连胜天数' : 'Streak'}>
              <Flame className="h-4 w-4" />
              {progress.streak}d
            </span>
            <span className="inline-flex items-center gap-1.5 text-sky-600 dark:text-sky-400" title={isZh ? '经验值' : 'XP'}>
              <Gem className="h-4 w-4" />
              {progress.xp} XP
            </span>
            <span className="inline-flex items-center gap-1.5 text-rose-500" title={isZh ? '生命值' : 'Hearts'}>
              <Heart className="h-4 w-4 fill-current" />
              {progress.hearts}
            </span>
          </div>

          <div className="inline-flex items-center rounded-xl bg-[color:var(--color-one-surface-soft)] p-1 border" style={{ borderColor: 'var(--color-one-border)' }}>
            <button
              type="button"
              onClick={() => setPlatformMode('path')}
              className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold transition whitespace-nowrap ${
                platformMode === 'path'
                  ? 'bg-[color:var(--color-one-surface)] text-[color:var(--color-one-text)] shadow-2xs'
                  : 'text-[color:var(--color-one-text-muted)] hover:text-[color:var(--color-one-text)]'
              }`}
            >
              {isZh ? '课程闯关' : 'Skill Path'}
            </button>
            <button
              type="button"
              onClick={() => setPlatformMode('coach')}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition whitespace-nowrap ${
                platformMode === 'coach'
                  ? 'bg-[color:var(--color-one-surface)] text-[color:var(--color-one-accent)] shadow-2xs'
                  : 'text-[color:var(--color-one-text-muted)] hover:text-[color:var(--color-one-text)]'
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>{isZh ? 'DeepSeek 对话陪练' : 'AI Coach'}</span>
            </button>
          </div>

          {onOpenEnglishEngine && (
            <button
              type="button"
              onClick={onOpenEnglishEngine}
              className="one-btn one-btn-sm one-btn-secondary whitespace-nowrap shrink-0"
            >
              <Sparkles className="h-3.5 w-3.5 text-[color:var(--color-one-accent)]" />
              <span>{isZh ? '英语词典引擎' : 'English Engine'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Multi-Language Switcher (7 languages directly inside Learning Center) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:pb-0">
        {IMMERSION_COURSES.map((c) => {
          const active = c.id === progress.activeCourse;
          const completedInCourse = c.units.filter((u) => progress.completedUnitIds.includes(u.id)).length;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setProgress((prev) => ({ ...prev, activeCourse: c.id }))}
              className={`flex min-h-[44px] shrink-0 items-center gap-2.5 rounded-xl border px-3.5 py-2 text-left transition cursor-pointer ${
                active
                  ? 'border-[color:var(--color-one-accent)] bg-[color:var(--color-one-accent-soft)]'
                  : 'border-[color:var(--color-one-border)] bg-[color:var(--color-one-surface)] hover:bg-[color:var(--color-one-surface-soft)]'
              }`}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                style={{ background: c.accentColor }}
              >
                {c.code}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[color:var(--color-one-text)] whitespace-nowrap">
                  {isZh ? c.zhName : c.enName}
                </div>
                <div className="text-[11px] tabular-nums text-[color:var(--color-one-text-dim)] whitespace-nowrap">
                  {c.nativeName} · {completedInCourse}/{c.units.length}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {platformMode === 'path' ? (
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
                    <span className="tabular-nums">
                      {done ? (isZh ? '已掌握' : 'Mastered') : `+${unit.xpReward} XP`}
                    </span>
                  </div>

                  <h3 className="mt-2.5 text-base font-semibold text-[color:var(--color-one-text)]">
                    {isZh ? unit.titleZh : unit.titleEn}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--color-one-text-muted)]">
                    {isZh ? unit.topicZh : unit.topicEn}
                  </p>

                  <div className="mt-3 text-[11px] tabular-nums text-[color:var(--color-one-text-dim)] truncate">
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
                  <span>{done ? (isZh ? '巩固重温' : 'Review Unit') : isZh ? '开始沉浸挑战' : 'Start Lesson'}</span>
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        /* Embedded DeepSeek Live Language Tutor */
        <div className="one-surface-elevated overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--color-one-border)' }}>
            <div>
              <h3 className="text-base font-semibold text-[color:var(--color-one-text)]">
                {isZh ? `${course.zhName} DeepSeek 沉浸对话陪练` : `${course.enName} DeepSeek Live Coach`}
              </h3>
              <p className="mt-0.5 text-xs text-[color:var(--color-one-text-dim)]">
                {isZh ? '支持语音输入、母语声线朗读、句型纠错与场景实战（每次交互 +5 XP）' : 'Voice input, native speech playback, corrections & roleplay (+5 XP)'}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {course.scenarios.map((sc, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => void sendTutorPrompt(sc.prompt)}
                  className="rounded-lg border px-3 py-1.5 text-xs font-medium text-[color:var(--color-one-text-muted)] transition hover:border-[color:var(--color-one-accent)] hover:text-[color:var(--color-one-text)] whitespace-nowrap"
                  style={{ borderColor: 'var(--color-one-border)', background: 'var(--color-one-surface-soft)' }}
                >
                  {isZh ? sc.labelZh : sc.labelEn}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[420px] space-y-4 overflow-y-auto p-5">
            {tutorMessages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      isUser
                        ? 'bg-sky-600 text-white'
                        : 'border bg-[color:var(--color-one-surface-soft)] text-[color:var(--color-one-text)]'
                    }`}
                    style={!isUser ? { borderColor: 'var(--color-one-border)' } : undefined}
                  >
                    <div dir={course.dir || 'ltr'} className="whitespace-pre-wrap break-words">
                      {msg.content || (tutorLoading ? '…' : '')}
                    </div>
                    {!isUser && msg.content && (
                      <div className="mt-2 flex items-center justify-end border-t pt-1.5" style={{ borderColor: 'var(--color-one-border)' }}>
                        <button
                          type="button"
                          onClick={() => speakPhrase(msg.content, course.speechLang)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--color-one-text-dim)] hover:text-[color:var(--color-one-accent)]"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                          <span>{isZh ? '母语朗读' : 'Listen'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={tutorEndRef} />
          </div>

          <div className="border-t p-4" style={{ borderColor: 'var(--color-one-border)', background: 'var(--color-one-surface-soft)' }}>
            <div className="flex items-center gap-2 rounded-xl border bg-[color:var(--color-one-surface)] p-1.5" style={{ borderColor: 'var(--color-one-border)' }}>
              <button
                type="button"
                onClick={toggleTutorMic}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition ${
                  tutorMicActive ? 'bg-rose-500/15 text-rose-500' : 'text-[color:var(--color-one-text-muted)] hover:text-[color:var(--color-one-text)]'
                }`}
                title={isZh ? `用 ${course.nativeName} 语音输入` : `Speak in ${course.nativeName}`}
              >
                {tutorMicActive ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <input
                type="text"
                value={tutorInput}
                onChange={(e) => setTutorInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void sendTutorPrompt();
                }}
                placeholder={isZh ? `输入${course.zhName}句子或用中文提问…` : `Type in ${course.enName} or ask anything…`}
                className="min-w-0 flex-1 bg-transparent px-2 text-sm text-[color:var(--color-one-text)] placeholder:text-[color:var(--color-one-text-dim)] outline-none"
              />
              <button
                type="button"
                disabled={!tutorInput.trim() || tutorLoading}
                onClick={() => void sendTutorPrompt()}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-sky-600 px-4 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:opacity-40 whitespace-nowrap"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{isZh ? '发送' : 'Send'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DuolingoImmersionPlatform;
