import { ThinkingLevel, Type } from '@google/genai';
import { getGeminiClient } from './geminiClient.ts';
import { oneAiRouter } from './oneAi/router.ts';

export type SupportedStudyLang = 'en' | 'ar' | 'ja' | 'fr' | 'es' | 'ko';
export type StudyLevel = 'beginner' | 'intermediate' | 'advanced';

export interface LanguageMeta {
  code: SupportedStudyLang;
  nameZh: string;
  nameEn: string;
  nativeName: string;
  speechLang: string;
  ttsLang: string;
}

export const LANGUAGE_CATALOG: LanguageMeta[] = [
  { code: 'en', nameZh: '英语', nameEn: 'English', nativeName: 'English', speechLang: 'en-US', ttsLang: 'en' },
  { code: 'ar', nameZh: '阿拉伯语', nameEn: 'Arabic', nativeName: 'العربية', speechLang: 'ar-SA', ttsLang: 'ar' },
  { code: 'ja', nameZh: '日语', nameEn: 'Japanese', nativeName: '日本語', speechLang: 'ja-JP', ttsLang: 'ja' },
  { code: 'fr', nameZh: '法语', nameEn: 'French', nativeName: 'Français', speechLang: 'fr-FR', ttsLang: 'fr' },
  { code: 'es', nameZh: '西班牙语', nameEn: 'Spanish', nativeName: 'Español', speechLang: 'es-ES', ttsLang: 'es' },
  { code: 'ko', nameZh: '韩语', nameEn: 'Korean', nativeName: '한국어', speechLang: 'ko-KR', ttsLang: 'ko' },
];

export interface RoleplayScenarioPreset {
  id: string;
  titleZh: string;
  titleEn: string;
  settingZh: string;
  settingEn: string;
  npcRoleZh: string;
  npcRoleEn: string;
  missionsZh: string[];
  missionsEn: string[];
}

export const ROLEPLAY_SCENARIOS: RoleplayScenarioPreset[] = [
  {
    id: 'cafe',
    titleZh: '精品咖啡馆点单',
    titleEn: 'Artisan Café Ordering',
    settingZh: '清晨走进街角咖啡馆，点一杯定制饮品并聊几句日常。',
    settingEn: 'A cozy corner coffee shop where you order a customized drink and pastry.',
    npcRoleZh: '热情咖啡师',
    npcRoleEn: 'Friendly Barista',
    missionsZh: ['自然打招呼并点一杯定制饮品', '说明冰量/奶类偏好或堂食外带', '礼貌询问价格并完成支付'],
    missionsEn: ['Greet and order a customized drink', 'Specify milk/ice preference or for here/to go', 'Ask about payment and thank the barista'],
  },
  {
    id: 'airport',
    titleZh: '国际机场值机与海关',
    titleEn: 'Airport Check-in & Immigration',
    settingZh: '在国际机场办理托运行李、选座以及入境边检问答。',
    settingEn: 'Checking in luggage, requesting a seat, and answering immigration questions.',
    npcRoleZh: '值机与海关专员',
    npcRoleEn: 'Airline Agent / Officer',
    missionsZh: ['说明航班目的地并请求靠窗座位', '清晰回答出行目的与停留天数', '确认登机口或行李托运信息'],
    missionsEn: ['Request a window seat and check luggage', 'Explain trip purpose and length of stay', 'Confirm boarding gate or baggage details'],
  },
  {
    id: 'hotel',
    titleZh: '精品酒店办理入住',
    titleEn: 'Boutique Hotel Check-in',
    settingZh: '抵达预订好的酒店前台，办理入住并询问早餐与 Wi-Fi。',
    settingEn: 'Arriving at a boutique hotel reception to check in and ask about amenities.',
    npcRoleZh: '酒店前台礼宾员',
    npcRoleEn: 'Hotel Receptionist',
    missionsZh: ['报出预订姓名办理入住', '询问能否安排安静房型或延迟退房', '确认早餐时间与 Wi-Fi 密码'],
    missionsEn: ['Confirm your reservation details', 'Ask about a quiet room or late checkout', 'Confirm breakfast hours and Wi-Fi'],
  },
  {
    id: 'restaurant',
    titleZh: '特色餐厅实景点餐',
    titleEn: 'Bistro Dining & Ordering',
    settingZh: '晚上在口碑餐厅用餐，请服务员推荐菜品并说明口味偏好。',
    settingEn: 'Dining at a lively bistro, asking for recommendations and dietary preferences.',
    npcRoleZh: '热情餐厅侍者',
    npcRoleEn: 'Attentive Server',
    missionsZh: ['请服务员推荐招牌主菜', '说明饮食偏好或忌口', '用餐后礼貌要求结账买单'],
    missionsEn: ['Ask for the house special recommendation', 'Mention a dietary preference or allergy', 'Politely ask for the check'],
  },
  {
    id: 'interview',
    titleZh: '国际职场求职面试',
    titleEn: 'Global Job Interview',
    settingZh: '参加国际公司面试，用目标语自我介绍并聊项目经验。',
    settingEn: 'A job interview covering your background, strengths, and a key project.',
    npcRoleZh: '专业招聘经理',
    npcRoleEn: 'Hiring Manager',
    missionsZh: ['用简洁自信的口语做自我介绍', '分享一个你的核心优势或项目成果', '向面试官提出一个高质量反问'],
    missionsEn: ['Deliver a crisp self-introduction', 'Share a key strength or project outcome', 'Ask a thoughtful question about the role'],
  },
  {
    id: 'shopping',
    titleZh: '市集购物与问路',
    titleEn: 'Market Shopping & Directions',
    settingZh: '在当地特色街区或市集挑商品、礼貌议价并询问路线。',
    settingEn: 'Browsing a local boutique or souq, asking about sizes/price, and getting directions.',
    npcRoleZh: '热情店主',
    npcRoleEn: 'Shopkeeper',
    missionsZh: ['询问款式、尺码或推荐款', '询问价格并礼貌沟通优惠', '询问前往附近地标或地铁站的路线'],
    missionsEn: ['Ask about styles, sizes, or recommendations', 'Check price and negotiate politely', 'Ask for directions to a nearby landmark'],
  },
  {
    id: 'clinic',
    titleZh: '海外药房与健康咨询',
    titleEn: 'Clinic & Pharmacy Visit',
    settingZh: '旅途中轻微感冒咳嗽，向当地药师描述症状并购药。',
    settingEn: 'Describing mild travel symptoms to a pharmacist and asking about dosage.',
    npcRoleZh: '社区药师',
    npcRoleEn: 'Community Pharmacist',
    missionsZh: ['清楚描述主要症状和持续时间', '询问温和不犯困的药物推荐', '确认服药剂量与注意事项'],
    missionsEn: ['Describe symptoms and duration clearly', 'Ask for a non-drowsy medicine option', 'Confirm dosage instructions'],
  },
  {
    id: 'friends',
    titleZh: '国际聚会自然交友',
    titleEn: 'International Social Gathering',
    settingZh: '在聚会上结识新朋友，聊彼此的城市、美食与周末计划。',
    settingEn: 'Meeting a new friend at a relaxed gathering and chatting about cities and travel.',
    npcRoleZh: '健谈新朋友',
    npcRoleEn: 'Friendly New Acquaintance',
    missionsZh: ['自然破冰寒暄并介绍自己来自哪里', '聊聊共同兴趣（音乐、美食或旅行）', '自然提出保持联系'],
    missionsEn: ['Break the ice and introduce yourself', 'Chat about shared interests', 'Naturally offer to stay in touch'],
  },
];

export interface SpokenRescueCard {
  level: 'simple' | 'natural' | 'native';
  labelZh: string;
  targetText: string;
  translationZh: string;
  phonetic: string;
  chunkGuide: string;
}

export interface QuizQuestionItem {
  id: string;
  type: 'multiple_choice' | 'fill_blank' | 'listen_choose' | 'speak_aloud';
  prompt: string;
  promptZh: string;
  contextZh: string;
  targetAudioText: string;
  phonetic: string;
  options: string[];
  correctAnswer: string;
  explanationZh: string;
  spokenTipZh: string;
}

export interface RoleplayMissionItem {
  id: string;
  labelZh: string;
  labelEn: string;
  completed: boolean;
}

export interface RoleplayTurnResponse {
  scenarioId: string;
  scenarioTitle: string;
  npcRole: string;
  targetLang: SupportedStudyLang;
  npcLine: string;
  npcTranslationZh: string;
  npcPhonetic: string;
  npcMood: 'cheerful' | 'curious' | 'empathetic' | 'playful' | 'calm';
  userFeedback?: {
    score: number;
    praiseZh: string;
    betterWay: string;
    betterWayZh: string;
    pronunciationTipZh: string;
  };
  rescueSuggestions: SpokenRescueCard[];
  missions: RoleplayMissionItem[];
}

export interface SpokenRescueResponse {
  targetLang: SupportedStudyLang;
  coachReplyZh: string;
  expressions: SpokenRescueCard[];
}

export function normalizeStudyLang(raw?: string | null): SupportedStudyLang {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'ar' || /arab|阿语|阿拉伯/.test(s)) return 'ar';
  if (s === 'ja' || s === 'jp' || /japan|日语|日文/.test(s)) return 'ja';
  if (s === 'fr' || /french|法语|法文/.test(s)) return 'fr';
  if (s === 'es' || /span|西语|西班牙/.test(s)) return 'es';
  if (s === 'ko' || s === 'kr' || /korean|韩语|韩文/.test(s)) return 'ko';
  return 'en';
}

export function getLangMeta(code: SupportedStudyLang): LanguageMeta {
  return LANGUAGE_CATALOG.find((l) => l.code === code) || LANGUAGE_CATALOG[0];
}

// ============================================================================
// INSTANT-START (<10ms) NATIVE REAL-WORLD OPENERS FOR ENGLISH & ARABIC
// ============================================================================

interface InstantOpenerSeed {
  npcLine: string;
  npcTranslationZh: string;
  npcPhonetic: string;
  npcMood: RoleplayTurnResponse['npcMood'];
  rescueSuggestions: SpokenRescueCard[];
}

const INSTANT_EN_OPENERS: Record<string, InstantOpenerSeed> = {
  cafe: {
    npcLine: "Good morning! Welcome in — what can I get started for you today?",
    npcTranslationZh: '早上好！欢迎光临——今天想来点什么饮品呢？',
    npcPhonetic: '/ɡʊd ˈmɔːrnɪŋ! ˈwelkəm ɪn — wʌt kæn aɪ ɡet ˈstɑːrtɪd fɔːr juː təˈdeɪ?/',
    npcMood: 'cheerful',
    rescueSuggestions: [
      { level: 'simple', labelZh: '新手最稳', targetText: 'Hi! Can I have an iced latte, please?', translationZh: '你好！请给我来一杯冰拿铁。', phonetic: '/haɪ! kæn aɪ hæv ən aɪst ˈlɑːteɪ, pliːz?/', chunkGuide: 'Hi! | Can I have | an iced latte, | please?' },
      { level: 'natural', labelZh: '日常自然', targetText: "Morning! I'd love a medium oat-milk latte with less ice, for here.", translationZh: '早安！我想要一杯中杯少冰燕麦拿铁，在这里喝。', phonetic: '/ˈmɔːrnɪŋ! aɪd lʌv ə ˈmiːdiəm oʊt-mɪlk ˈlɑːteɪ wɪð les aɪs/', chunkGuide: 'Morning! | I’d love a medium oat-milk latte | with less ice, | for here.' },
      { level: 'native', labelZh: '母语地道', targetText: "Hey there! Could I grab a flat white to go, and maybe a warm croissant?", translationZh: '嗨！能帮我打包一杯澳白，再来一个热可颂吗？', phonetic: '/heɪ ðer! kʊd aɪ ɡræb ə flæt waɪt tə ɡoʊ/', chunkGuide: 'Hey there! | Could I grab a flat white | to go, | and maybe a warm croissant?' },
    ],
  },
  airport: {
    npcLine: "Hello! May I see your passport and booking confirmation? Are you checking any bags today?",
    npcTranslationZh: '您好！请出示护照和预订确认单。今天有需要托运的行李吗？',
    npcPhonetic: '/həˈloʊ! meɪ aɪ siː jʊr ˈpæspɔːrt ænd ˈbʊkɪŋ ˌkɑːnfərˈmeɪʃən?/',
    npcMood: 'calm',
    rescueSuggestions: [
      { level: 'simple', labelZh: '新手最稳', targetText: 'Here is my passport. I have one suitcase to check.', translationZh: '这是我的护照，我有一个行李箱要托运。', phonetic: '/hɪr ɪz maɪ ˈpæspɔːrt. aɪ hæv wʌn ˈsuːtkeɪs tə tʃek./', chunkGuide: 'Here is my passport. | I have one suitcase | to check.' },
      { level: 'natural', labelZh: '日常自然', targetText: 'Sure, here you go. Just one checked bag — could I get a window seat if available?', translationZh: '好的给您，就托运一件行李。如果有靠窗座位能帮我安排一下吗？', phonetic: '/ʃʊr, hɪr juː ɡoʊ. kʊd aɪ ɡet ə ˈwɪndoʊ siːt?/', chunkGuide: 'Sure, here you go. | Just one checked bag — | could I get a window seat?' },
      { level: 'native', labelZh: '母语地道', targetText: "Here's my passport. I'm flying to London for a week — any chance of a window seat?", translationZh: '护照给您。我去伦敦待一周，有机会选个靠窗位吗？', phonetic: '/hɪrz maɪ ˈpæspɔːrt. ˈeni tʃæns əv ə ˈwɪndoʊ siːt?/', chunkGuide: 'Here’s my passport. | I’m flying to London for a week — | any chance of a window seat?' },
    ],
  },
  hotel: {
    npcLine: "Welcome to our hotel! Do you have a reservation with us under your name?",
    npcTranslationZh: '欢迎光临我们酒店！请问您预订登记的是哪位贵宾的姓名呢？',
    npcPhonetic: '/ˈwelkəm tuː ˈaʊər hoʊˈtel! duː juː hæv ə ˌrezərˈveɪʃən?/',
    npcMood: 'cheerful',
    rescueSuggestions: [
      { level: 'simple', labelZh: '新手最稳', targetText: 'Yes, I have a reservation for two nights.', translationZh: '是的，我预订了两晚的房间。', phonetic: '/jes, aɪ hæv ə ˌrezərˈveɪʃən fɔːr tuː naɪts./', chunkGuide: 'Yes, | I have a reservation | for two nights.' },
      { level: 'natural', labelZh: '日常自然', targetText: "Hi! I'm checking in — could we possibly get a quiet room on a higher floor?", translationZh: '你好我办理入住，请问能安排一个高楼层安静点的房间吗？', phonetic: '/aɪm ˈtʃekɪŋ ɪn — kʊd wiː ɡet ə ˈkwaɪət ruːm?/', chunkGuide: 'Hi! I’m checking in — | could we possibly get a quiet room | on a higher floor?' },
      { level: 'native', labelZh: '母语地道', targetText: "Checking in, please! Also, what time is breakfast served, and what's the Wi-Fi password?", translationZh: '麻烦办一下入住！顺便问下早餐几点开始，Wi-Fi 密码是多少？', phonetic: '/wʌt taɪm ɪz ˈbrekfəst sɜːrvd?/', chunkGuide: 'Checking in, please! | What time is breakfast served, | and what’s the Wi-Fi password?' },
    ],
  },
  restaurant: {
    npcLine: "Good evening! Welcome in — would you like to start with something to drink, or hear tonight's specials?",
    npcTranslationZh: '晚上好！欢迎光临——您想先点杯饮品，还是听我介绍一下今晚的招牌菜？',
    npcPhonetic: '/ɡʊd ˈiːvnɪŋ! wʊd juː laɪk tə hɪr təˈnaɪts ˈspeʃəlz?/',
    npcMood: 'cheerful',
    rescueSuggestions: [
      { level: 'simple', labelZh: '新手最稳', targetText: 'Yes, please! What do you recommend tonight?', translationZh: '好的谢谢！今晚你推荐什么菜？', phonetic: '/jes, pliːz! wʌt duː juː ˌrekəˈmend təˈnaɪt?/', chunkGuide: 'Yes, please! | What do you recommend | tonight?' },
      { level: 'natural', labelZh: '日常自然', targetText: "I'd love to hear the specials! Just a quick note, I'm allergic to peanuts.", translationZh: '想听听招牌菜！顺便说一下我对花生过敏。', phonetic: '/aɪd lʌv tə hɪr ðə ˈspeʃəlz! aɪm əˈlɜːrdʒɪk tə ˈpiːnʌts./', chunkGuide: 'I’d love to hear the specials! | Just a quick note, | I’m allergic to peanuts.' },
      { level: 'native', labelZh: '母语地道', targetText: "Sparkling water to start, please — and what's your personal favorite on the menu?", translationZh: '先来杯气泡水吧——菜单里你自己最喜欢哪道？', phonetic: '/ˈspɑːrklɪŋ ˈwɔːtər tə stɑːrt, wʌts jʊr ˈpɜːrsənəl ˈfeɪvərɪt?/', chunkGuide: 'Sparkling water to start, | and what’s your personal favorite | on the menu?' },
    ],
  },
  interview: {
    npcLine: "Thanks for coming in today! To kick things off, could you tell me a little bit about yourself and what excites you about this role?",
    npcTranslationZh: '感谢今天来参加面试！我们先轻松开个头，能简单介绍一下你自己，以及这个岗位最吸引你的地方吗？',
    npcPhonetic: '/θæŋks fɔːr ˈkʌmɪŋ ɪn təˈdeɪ! kʊd juː tel miː ə ˈlɪtəl bɪt əˈbaʊt jʊrˈself?/',
    npcMood: 'curious',
    rescueSuggestions: [
      { level: 'simple', labelZh: '新手最稳', targetText: "Thank you for having me! I have three years of product experience and love solving user problems.", translationZh: '谢谢邀请！我有三年产品经验，很喜欢解决用户问题。', phonetic: '/θæŋk juː fɔːr ˈhævɪŋ miː!/', chunkGuide: 'Thank you for having me! | I have three years of experience | and love solving problems.' },
      { level: 'natural', labelZh: '日常自然', targetText: "Glad to be here! Over the past few years I've led cross-functional projects, and I really admire your team's global vision.", translationZh: '很高兴来到这里！过去几年我带过跨团队项目，非常欣赏你们团队的全球视野。', phonetic: '/ɡlæd tə biː hɪr! aɪv led krɔːs-ˈfʌŋkʃənəl ˈprɑːdʒekts./', chunkGuide: 'Glad to be here! | I’ve led cross-functional projects, | and I admire your team’s vision.' },
      { level: 'native', labelZh: '母语地道', targetText: "Appreciate the opportunity! I thrive at turning complex ideas into intuitive products, and this role aligns right with my strengths.", translationZh: '感谢这次机会！我擅长把复杂想法打磨成直觉好用的产品，这个岗位正好契合我的强项。', phonetic: '/əˈpriːʃieɪt ði ˌɑːpərˈtuːnəti! aɪ θraɪv æt ˈtɜːrnɪŋ ˈkɑːmpleks aɪˈdiːəz/', chunkGuide: 'Appreciate the opportunity! | I thrive at turning complex ideas | into intuitive products.' },
    ],
  },
  shopping: {
    npcLine: "Hey! Welcome in — let me know if you're looking for a specific size or want to try anything on!",
    npcTranslationZh: '嗨欢迎光临！如果想找特定尺码或者试穿哪件，随时告诉我！',
    npcPhonetic: '/heɪ! ˈwelkəm ɪn — let miː noʊ ɪf juː wɑːnt tə traɪ ˈeniθɪŋ ɑːn!/',
    npcMood: 'cheerful',
    rescueSuggestions: [
      { level: 'simple', labelZh: '新手最稳', targetText: 'Hi! Do you have this jacket in medium?', translationZh: '你好！这件外套有中号吗？', phonetic: '/haɪ! duː juː hæv ðɪs ˈdʒækɪt ɪn ˈmiːdiəm?/', chunkGuide: 'Hi! | Do you have this jacket | in medium?' },
      { level: 'natural', labelZh: '日常自然', targetText: 'I love this style! Could I try it on in a larger size, and is it on sale today?', translationZh: '我很喜欢这个款式！能试一下大一码吗？今天有折扣吗？', phonetic: '/kʊd aɪ traɪ ɪt ɑːn ɪn ə ˈlɑːrdʒər saɪz?/', chunkGuide: 'I love this style! | Could I try it on in a larger size, | and is it on sale?' },
      { level: 'native', labelZh: '母语地道', targetText: "Just browsing for a light coat — by the way, how do I get to the nearest subway station from here?", translationZh: '随便看看轻便外套——对了，从这里去最近的地铁站怎么走？', phonetic: '/dʒʌst ˈbraʊzɪŋ — haʊ duː aɪ ɡet tə ðə ˈnɪrɪst ˈsʌbweɪ?/', chunkGuide: 'Just browsing for a light coat — | by the way, | how do I get to the nearest subway?' },
    ],
  },
  clinic: {
    npcLine: "Hello! How can I help you today? Are you picking up a prescription or looking for something over the counter?",
    npcTranslationZh: '您好！今天有什么可以帮您的？是来取处方药，还是想买点非处方常备药？',
    npcPhonetic: '/həˈloʊ! haʊ kæn aɪ help juː təˈdeɪ?/',
    npcMood: 'empathetic',
    rescueSuggestions: [
      { level: 'simple', labelZh: '新手最稳', targetText: 'I have a sore throat and a mild cough since yesterday.', translationZh: '我从昨天开始嗓子痛，还有点轻咳。', phonetic: '/aɪ hæv ə sɔːr θroʊt ænd ə maɪld kɔːf./', chunkGuide: 'I have a sore throat | and a mild cough | since yesterday.' },
      { level: 'natural', labelZh: '日常自然', targetText: "I've had a runny nose for two days. Could you recommend something gentle that won't make me sleepy?", translationZh: '我流鼻涕两天了，能推荐一款温和不犯困的药吗？', phonetic: '/kʊd juː ˌrekəˈmend ˈsʌmθɪŋ ˈdʒentəl ðæt woʊnt meɪk miː ˈsliːpi?/', chunkGuide: 'I’ve had a runny nose for two days. | Something gentle | that won’t make me sleepy?' },
      { level: 'native', labelZh: '母语地道', targetText: "I came down with a travel cold — what's the best non-drowsy remedy, and how often should I take it?", translationZh: '旅途有点着凉感冒了——有没有不嗜睡的药推荐？多久吃一次？', phonetic: '/aɪ keɪm daʊn wɪð ə ˈtrævəl koʊld — nɑːn-ˈdraʊzi ˈremədi/', chunkGuide: 'I came down with a travel cold — | best non-drowsy remedy, | and how often should I take it?' },
    ],
  },
  friends: {
    npcLine: "Hey! Great view up here, right? I'm Alex — is this your first time visiting the city?",
    npcTranslationZh: '嗨！这上面的风景真棒对吧？我叫 Alex——你是第一次来这座城市吗？',
    npcPhonetic: '/heɪ! ɡreɪt vjuː ʌp hɪr, raɪt? aɪm ˈælɪks!/',
    npcMood: 'playful',
    rescueSuggestions: [
      { level: 'simple', labelZh: '新手最稳', targetText: "Nice to meet you, Alex! Yes, it's my first time here and I love it.", translationZh: '很高兴认识你 Alex！对，我第一次来，超级喜欢这里。', phonetic: '/naɪs tə miːt juː, ˈælɪks!/', chunkGuide: 'Nice to meet you, Alex! | It’s my first time here | and I love it.' },
      { level: 'natural', labelZh: '日常自然', targetText: "Hey Alex! The view is amazing. I just arrived yesterday — any local spots or music venues you'd recommend?", translationZh: '嗨 Alex！视野太赞了。我昨天刚到——有什么当地好去处或音乐现场推荐吗？', phonetic: '/ðə vjuː ɪz əˈmeɪzɪŋ! ˈeni ˈloʊkəl spɑːts juːd ˌrekəˈmend?/', chunkGuide: 'Hey Alex! The view is amazing. | Any local spots | you’d recommend?' },
      { level: 'native', labelZh: '母语地道', targetText: "Totally! Loving the vibe so far. What kind of music are you into — we should swap contacts!", translationZh: '可不是嘛！氛围太舒服了。你平时喜欢什么音乐——咱们可以留个联系方式！', phonetic: '/ˈlʌvɪŋ ðə vaɪb soʊ fɑːr — wiː ʃʊd swɑːp ˈkɑːntækts!/', chunkGuide: 'Loving the vibe so far! | What music are you into — | we should swap contacts!' },
    ],
  },
};

const INSTANT_AR_OPENERS: Record<string, InstantOpenerSeed> = {
  cafe: {
    npcLine: 'أَهْلاً وَسَهْلاً! صَبَاحُ الخَيْرِ، مَاذَا تُحِبُّ أَنْ تَشْرَبَ اليَوْمَ؟',
    npcTranslationZh: '欢迎光临！早上好，今天想喝点什么呢？',
    npcPhonetic: 'Ahlan wa sahlan! Sabāḥ al-khayr, mādhā tuḥibbu an tashraba al-yawm?',
    npcMood: 'cheerful',
    rescueSuggestions: [
      { level: 'simple', labelZh: '新手最稳', targetText: 'صَبَاحُ النُّورِ! قَهْوَة عَرَبِيَّة مِنْ فَضْلِكَ.', translationZh: '早上好！请给我来一杯阿拉伯咖啡。', phonetic: 'Sabāḥ an-nūr! Qahwa ʿarabiyya min faḍlik.', chunkGuide: 'Sabāḥ an-nūr! | Qahwa ʿarabiyya | min faḍlik.' },
      { level: 'natural', labelZh: '日常自然', targetText: 'مَرْحَباً! أُرِيدُ لَاتِيه بَارِد مَعَ سُكَّر قَلِيل مِنْ فَضْلِكَ.', translationZh: '你好！请给我来一杯少糖冰拿铁。', phonetic: 'Marḥaban! Urīdu lātīh bārid maʿa sukkar qalīl min faḍlik.', chunkGuide: 'Marḥaban! | Urīdu lātīh bārid | maʿa sukkar qalīl.' },
      { level: 'native', labelZh: '母语地道', targetText: 'يَا هَلَا! مُمْكِن قَهْوَة مُخْتَصَّة سَاخِنَة لِلسَّفَرِ، وَكَمِ السِّعْرُ؟', translationZh: '你好呀！可以来一杯热的手冲打包吗？请问多少钱？', phonetic: 'Yā halā! Mumkin qahwa mukhtaṣṣa sākhina lis-safar, wa kam as-siʿr?', chunkGuide: 'Yā halā! | Mumkin qahwa mukhtaṣṣa | wa kam as-siʿr?' },
    ],
  },
  airport: {
    npcLine: 'مَرْحَباً بِكَ فِي المَطَارِ! مُمْكِن جَوَاز السَّفَرِ وَتَذْكِرَة الرِّحْلَةِ مِنْ فَضْلِكَ؟',
    npcTranslationZh: '欢迎来到机场！请出示一下您的护照和机票好吗？',
    npcPhonetic: 'Marḥaban bika fī al-maṭār! Mumkin jawāz as-safar wa tadhkirat ar-riḥla min faḍlik?',
    npcMood: 'calm',
    rescueSuggestions: [
      { level: 'simple', labelZh: '新手最稳', targetText: 'تَفَضَّلْ، هَذَا جَوَازُ سَفَرِي. لَدَيَّ حَقِيبَةٌ وَاحِدَةٌ.', translationZh: '请拿好，这是我的护照。我有一件行李。', phonetic: 'Tafaḍḍal, hādhā jawāzu safarī. Ladayya ḥaqība wāḥida.', chunkGuide: 'Tafaḍḍal, | hādhā jawāzu safarī. | Ladayya ḥaqība wāḥida.' },
      { level: 'natural', labelZh: '日常自然', targetText: 'تَفَضَّلْ! هَلْ يُمْكِنُنِي الحُصُولُ عَلَى مَقْعَدٍ بِجَانِبِ النَّافِذَةِ؟', translationZh: '给您！请问可以给我安排一个靠窗的座位吗？', phonetic: 'Tafaḍḍal! Hal yumkinunī al-ḥuṣūl ʿalā maqʿad bi-jānib an-nāfidha?', chunkGuide: 'Tafaḍḍal! | Hal yumkinunī | maqʿad bi-jānib an-nāfidha?' },
      { level: 'native', labelZh: '母语地道', targetText: 'أَنَا مُسَافِرٌ لِلسِّيَاحَةِ لِمُدَّةِ أُسْبُوعٍ. أَيُّ بَوَّابَةٍ لِلصُّعُودِ؟', translationZh: '我是来旅游一周的。请问是在哪个登机口登机？', phonetic: 'Anā musāfir lis-siyāḥa li-muddat usbūʿ. Ayyu bawwāba liṣ-ṣuʿūd?', chunkGuide: 'Anā musāfir lis-siyāḥa | li-muddat usbūʿ. | Ayyu bawwāba?' },
    ],
  },
  hotel: {
    npcLine: 'أَهْلاً بِكَ فِي فُنْدُقِنَا! هَلْ لَدَيْكَ حَجْزٌ مُسْبَقٌ؟ وَمَا اسْمُكَ الكَرِيمُ؟',
    npcTranslationZh: '欢迎入住我们酒店！请问您提前预订了吗？贵姓大名？',
    npcPhonetic: 'Ahlan bika fī funduqinā! Hal ladayka ḥajz musbaq? Wa mā ismuka al-karīm?',
    npcMood: 'cheerful',
    rescueSuggestions: [
      { level: 'simple', labelZh: '新手最稳', targetText: 'نَعَمْ، عِنْدِي حَجْزٌ لِثَلَاثِ لَيَالٍ.', translationZh: '是的，我预订了三晚。', phonetic: 'Naʿam, ʿindī ḥajz li-thalāth layālin.', chunkGuide: 'Naʿam, | ʿindī ḥajz | li-thalāth layālin.' },
      { level: 'natural', labelZh: '日常自然', targetText: 'مَرْحَباً! أُرِيدُ تَسْجِيلَ الدُّخُولِ، وَهَلْ الغُرْفَةُ هَادِئَةٌ؟', translationZh: '你好！我办理入住，请问房间安静吗？', phonetic: 'Marḥaban! Urīdu tasjīl ad-dukhūl, wa hal al-ghurfa hādiʾa?', chunkGuide: 'Urīdu tasjīl ad-dukhūl, | wa hal al-ghurfa hādiʾa?' },
      { level: 'native', labelZh: '母语地道', targetText: 'شُكْراً جَزِيلاً! مَتَى وَقْتُ الإِفْطَارِ، وَمَا كَلِمَةُ مَرُورِ الوَاي فَاي؟', translationZh: '非常感谢！请问早餐几点开始，Wi-Fi 密码是多少？', phonetic: 'Shukran jazīlan! Matā waqt al-ifṭār, wa mā kalimat murūr al-wāy fāy?', chunkGuide: 'Matā waqt al-ifṭār, | wa mā kalimat murūr al-wāy fāy?' },
    ],
  },
  restaurant: {
    npcLine: 'مَسَاءُ الخَيْرِ وَأَهْلاً بِكُمْ! هَلْ تُرِيدُ قَائِمَةَ الطَّعَامِ أَمْ أَقْتَرِحُ لَكَ أَشْهَرَ أَطْبَاقِنَا؟',
    npcTranslationZh: '晚上好，欢迎光临！您要先看菜单，还是我为您推荐最受欢迎的招牌菜？',
    npcPhonetic: 'Masāʾ al-khayr wa ahlan bikum! Hal turīdu qāʾimat aṭ-ṭaʿām am aqtariḥu laka ashhar aṭbāqinā?',
    npcMood: 'cheerful',
    rescueSuggestions: [
      { level: 'simple', labelZh: '新手最稳', targetText: 'مَسَاءُ النُّورِ! مَاذَا تَنْصَحُنِي أَنْ أَطْلُبَ؟', translationZh: '晚上好！你推荐我点什么菜？', phonetic: 'Masāʾ an-nūr! Mādhā tanṣaḥunī an aṭlub?', chunkGuide: 'Masāʾ an-nūr! | Mādhā tanṣaḥunī | an aṭlub?' },
      { level: 'natural', labelZh: '日常自然', targetText: 'مِنْ فَضْلِكَ أُرِيدُ مَشَاوِي مُشَكَّلَة وَعَصِير رُمَّان طَازَج.', translationZh: '请给我来一份特色混合烤肉和一杯鲜榨石榴汁。', phonetic: 'Min faḍlik urīdu mashāwī mushakkala wa ʿaṣīr rummān ṭāzaj.', chunkGuide: 'Min faḍlik | urīdu mashāwī mushakkala | wa ʿaṣīr rummān.' },
      { level: 'native', labelZh: '母语地道', targetText: 'الأَكْلُ لَذِيذٌ جِدّاً! لَا أُحِبُّ الطَّعَامَ الحَارَّ، وَبَعْدَ ذَلِكَ الحِسَابُ مِنْ فَضْلِكَ.', translationZh: '菜太香了！我不吃辣，吃完后麻烦帮我结账。', phonetic: 'Al-akl ladhīdh jiddan! Lā uḥibbu aṭ-ṭaʿām al-ḥārr, wa al-ḥisāb min faḍlik.', chunkGuide: 'Al-akl ladhīdh jiddan! | Lā uḥibbu al-ḥārr, | al-ḥisāb min faḍlik.' },
    ],
  },
  interview: {
    npcLine: 'أَهْلاً بِكَ فِي المُقَابَلَةِ! يُمْكِنُكَ أَنْ تُعَرِّفَنِي بِنَفْسِكَ وَبِخِبْرَتِكَ المِهَنِيَّةِ بِاخْتِصَارٍ؟',
    npcTranslationZh: '欢迎来参加面试！能简短介绍一下你自己和你的工作经验吗？',
    npcPhonetic: 'Ahlan bika fī al-muqābala! Yumkinuka an tuʿarrifanī bi-nafsika wa bi-khibratika bi-ikhtiṣār?',
    npcMood: 'curious',
    rescueSuggestions: [
      { level: 'simple', labelZh: '新手最稳', targetText: 'شُكْراً عَلَى الفُرْصَةِ! لَدَيَّ خِبْرَةٌ فِي العَمَلِ الجَمَاعِيِّ وَالتِّقْنِيَّةِ.', translationZh: '感谢机会！我有团队协作与技术方面的经验。', phonetic: 'Shukran ʿalā al-furṣa! Ladayya khibra fī al-ʿamal al-jamāʿī wat-tiqniyya.', chunkGuide: 'Shukran ʿalā al-furṣa! | Ladayya khibra | fī at-tiqniyya.' },
      { level: 'natural', labelZh: '日常自然', targetText: 'يُسْعِدُنِي التَّوَاجُدُ مَعَكُمْ! أُحِبُّ حَلَّ المُشْكِلَاتِ وَتَطْوِيرَ المَشَارِيعِ الدَّوْلِيَّةِ.', translationZh: '很高兴来到这里！我热爱解决问题和推进国际项目。', phonetic: 'Yusʿidunī at-tawājud maʿakum! Uḥibbu ḥall al-mushkilāt.', chunkGuide: 'Yusʿidunī at-tawājud maʿakum! | Uḥibbu ḥall al-mushkilāt.' },
      { level: 'native', labelZh: '母语地道', targetText: 'شُكْراً لِتَرْحِيبِكُمْ! مَا أَهَمُّ الأَهْدَافِ الَّتِي يَسْعَى الفَرِيقُ لِتَحْقِيقِهَا هَذَا العَامَ؟', translationZh: '感谢你们的欢迎！请问团队今年最核心的目标是什么？', phonetic: 'Mā ahamm al-ahdāf allatī yasʿā al-farīq li-taḥqīqihā hādhā al-ʿām?', chunkGuide: 'Mā ahamm al-ahdāf | allatī yasʿā al-farīq | hādhā al-ʿām?' },
    ],
  },
  shopping: {
    npcLine: 'تَفَضَّلْ! أَهْلاً بِكَ فِي السُّوقِ، هَلْ تَبْحَثُ عَنْ شَيْءٍ مُعَيَّنٍ أَوْ هَدِيَّةٍ جَمِيلَةٍ؟',
    npcTranslationZh: '请进！欢迎逛市集，您在找什么特别的东西或者礼物吗？',
    npcPhonetic: 'Tafaḍḍal! Ahlan bika fī as-sūq, hal tabḥathu ʿan shayʾ muʿayyan aw hadiyya jamīla?',
    npcMood: 'cheerful',
    rescueSuggestions: [
      { level: 'simple', labelZh: '新手最稳', targetText: 'مَرْحَباً! بِكَمْ هَذَا مِنْ فَضْلِكَ؟', translationZh: '你好！请问这个多少钱？', phonetic: 'Marḥaban! Bi-kam hādhā min faḍlik?', chunkGuide: 'Marḥaban! | Bi-kam hādhā | min faḍlik?' },
      { level: 'natural', labelZh: '日常自然', targetText: 'هَذَا جَمِيلٌ جِدّاً! هَلْ يُوجَدُ لَوْنٌ آخَرُ أَوْ تَخْفِيضٌ بَسِيطٌ؟', translationZh: '这个太好看了！有其他颜色或者能稍微优惠一点吗？', phonetic: 'Hādhā jamīl jiddan! Hal yūjad lawn ākhar aw takhfīḍ basīṭ?', chunkGuide: 'Hādhā jamīl jiddan! | Hal yūjad takhfīḍ basīṭ?' },
      { level: 'native', labelZh: '母语地道', targetText: 'شُكْراً! سَآخُذُ هَذَا، وَمِنْ فَضْلِكَ كَيْفَ أَصِلُ إِلَى أَقْرَبِ مَحَطَّةِ مِتْرُو؟', translationZh: '谢谢我就要这个了！顺便请问最近的地铁站怎么走？', phonetic: 'Sa-ākhudhu hādhā, wa kayfa aṣilu ilā aqrab maḥaṭṭat mitrū?', chunkGuide: 'Sa-ākhudhu hādhā, | kayfa aṣilu ilā | aqrab maḥaṭṭat mitrū?' },
    ],
  },
  clinic: {
    npcLine: 'سَلَامَتُكَ! كَيْفَ يُمْكِنُنِي مُسَاعَدَتُكَ اليَوْمَ فِي الصَّيْدَلِيَّةِ؟',
    npcTranslationZh: '祝您早日康复！今天在药房有什么可以帮您的？',
    npcPhonetic: 'Salāmatak! Kayfa yumkinunī musāʿadatuka al-yawm fī aṣ-ṣaydaliyya?',
    npcMood: 'empathetic',
    rescueSuggestions: [
      { level: 'simple', labelZh: '新手最稳', targetText: 'عِنْدِي صُدَاعٌ وَسُعَالٌ خَفِيفٌ مُنْذُ أَمْسِ.', translationZh: '我从昨天开始有点头痛和轻咳。', phonetic: 'ʿIndī ṣudāʿ wa suʿāl khafīf mundhu ams.', chunkGuide: 'ʿIndī ṣudāʿ | wa suʿāl khafīf | mundhu ams.' },
      { level: 'natural', labelZh: '日常自然', targetText: 'هَلْ يُوجَدُ دَوَاءٌ لِلزُّكَامِ لَا يُسَبِّبُ النُّعَاسَ؟', translationZh: '请问有不让人犯困的感冒药吗？', phonetic: 'Hal yūjad dawāʾ liz-zukām lā yusabbib an-nuʿās?', chunkGuide: 'Hal yūjad dawāʾ | liz-zukām | lā yusabbib an-nuʿās?' },
      { level: 'native', labelZh: '母语地道', targetText: 'شُكْراً جَزِيلاً! كَمْ مَرَّةً فِي اليَوْمِ يَجِبُ أَنْ أَتَنَاوَلَ هَذَا الدَّوَاءَ؟', translationZh: '非常感谢！请问这个药一天需要吃几次？', phonetic: 'Kam marratan fī al-yawm yajibu an atanāwala hādhā ad-dawāʾ?', chunkGuide: 'Kam marratan fī al-yawm | yajibu an atanāwala | hādhā ad-dawāʾ?' },
    ],
  },
  friends: {
    npcLine: 'أَهْلاً وَسَهْلاً! تَشَرَّفْنَا بِمَعْرِفَتِكَ، أَنَا كَرِيم. مِنْ أَيِّ بَلَدٍ أَنْتَ؟',
    npcTranslationZh: '你好呀！很高兴认识你，我叫卡里姆。你来自哪个国家？',
    npcPhonetic: 'Ahlan wa sahlan! Tasharrafnā bi-maʿrifatik, anā Karīm. Min ayyi balad anta?',
    npcMood: 'playful',
    rescueSuggestions: [
      { level: 'simple', labelZh: '新手最稳', targetText: 'تَشَرَّفْنَا يَا كَرِيم! أَنَا مِنَ الصِّينِ، وَسَعِيدٌ بِلِقَائِكَ.', translationZh: '很高兴认识你卡里姆！我来自中国，很开心见到你。', phonetic: 'Tasharrafnā yā Karīm! Anā min aṣ-Ṣīn, wa saʿīd bi-liqāʾik.', chunkGuide: 'Tasharrafnā yā Karīm! | Anā min aṣ-Ṣīn, | wa saʿīd bi-liqāʾik.' },
      { level: 'natural', labelZh: '日常自然', targetText: 'فُرْصَةٌ سَعِيدَةٌ! الجَوُّ هُنَا رَائِعٌ، هَلْ تُحِبُّ السَّفَرَ وَالمُوسِيقَى؟', translationZh: '很高兴遇见你！这里氛围真棒，你平时喜欢旅行和音乐吗？', phonetic: 'Furṣa saʿīda! Al-jaww hunā rāʾiʿ, hal tuḥibbu as-safar wal-mūsīqā?', chunkGuide: 'Furṣa saʿīda! | Al-jaww hunā rāʾiʿ, | hal tuḥibbu as-safar?' },
      { level: 'native', labelZh: '母语地道', targetText: 'سَعِدْتُ جِدّاً بِالحَدِيثِ مَعَكَ! لِنَبْقَ عَلَى تَوَاصُلٍ قَرِيباً.', translationZh: '和你聊天太开心了！咱们保持联系呀。', phonetic: 'Saʿidtu jiddan bil-ḥadīth maʿak! Li-nabqa ʿalā tawāṣul qarīban.', chunkGuide: 'Saʿidtu jiddan bil-ḥadīth maʿak! | Li-nabqa ʿalā tawāṣul.' },
    ],
  },
};

// ============================================================================
// INSTANT-START (<10ms) CURATED QUIZ DECKS FOR ENGLISH & ARABIC
// ============================================================================

const INSTANT_QUIZ_DECKS: Record<'en' | 'ar', { topicTitleZh: string; questions: QuizQuestionItem[] }> = {
  en: {
    topicTitleZh: '高频英语实景口语极速闯关',
    questions: [
      {
        id: 'en_q1',
        type: 'listen_choose',
        prompt: 'Listen to the barista and pick the most natural reply:',
        promptZh: '听咖啡师问话，选出最自然地道的点单回应：',
        contextZh: '在伦敦咖啡馆，咖啡师问："What can I get started for you?"',
        targetAudioText: 'Could I grab a medium iced oat latte to go, please?',
        phonetic: '/kʊd aɪ ɡræb ə ˈmiːdiəm aɪst oʊt ˈlɑːteɪ tə ɡoʊ, pliːz?/',
        options: [
          'Could I grab a medium iced oat latte to go, please?',
          'I am wanting one cold coffee taking away.',
          'Give me latte ice now please.',
          'My coffee is medium oat milk go.',
        ],
        correctAnswer: 'Could I grab a medium iced oat latte to go, please?',
        explanationZh: '英美日常点单常用 "Could I grab / get ... to go, please?"，礼貌又地道，远比直译 "I want..." 自然。',
        spokenTipZh: '把 "Could I" 连读成 /kʊdaɪ/，末尾 "please" 声调微微上扬更亲切。',
      },
      {
        id: 'en_q2',
        type: 'fill_blank',
        prompt: 'Excuse me, any ___ we could get a table by the window?',
        promptZh: '补全这句在餐厅询问靠窗座位的地道口语：',
        contextZh: '你想礼貌问服务员“有没有可能换个靠窗位”',
        targetAudioText: 'Excuse me, any chance we could get a table by the window?',
        phonetic: '/ɪkˈskjuːz miː, ˈeni tʃæns wiː kʊd ɡet ə ˈteɪbəl baɪ ðə ˈwɪndoʊ?/',
        options: ['chance', 'hope', 'maybe', 'luck'],
        correctAnswer: 'chance',
        explanationZh: '"Any chance we could...?" 是母语者最常用的礼貌请求句型，意思是“有没有可能……”。',
        spokenTipZh: '重音落在 "chance" 和 "window" 上，语速放轻松即可。',
      },
      {
        id: 'en_q3',
        type: 'speak_aloud',
        prompt: "I'm here for a five-day vacation and staying near the city center.",
        promptZh: '实景开口跟读：在机场边检流利回答出行目的与住处',
        contextZh: '入境海关问："What is the purpose of your visit?"',
        targetAudioText: "I'm here for a five-day vacation and staying near the city center.",
        phonetic: '/aɪm hɪr fɔːr ə faɪv-deɪ veɪˈkeɪʃən ænd ˈsteɪɪŋ nɪr ðə ˈsɪti ˈsentər./',
        options: [],
        correctAnswer: "I'm here for a five-day vacation and staying near the city center.",
        explanationZh: '直接交代天数（five-day vacation）+ 住宿区域，简短清晰，边检沟通一次通过。',
        spokenTipZh: '"for a" 轻读连音成 /fərə/，"five-day" 连贯不停顿。',
      },
      {
        id: 'en_q4',
        type: 'multiple_choice',
        prompt: 'How do you politely ask for the bill at a restaurant?',
        promptZh: '在国外餐厅用完餐，哪种结账表达最地道得体？',
        contextZh: '你准备结账离开，向服务员示意',
        targetAudioText: 'Could we get the check whenever you have a moment?',
        phonetic: '/kʊd wiː ɡet ðə tʃek wenˈevər juː hæv ə ˈmoʊmənt?/',
        options: [
          'Could we get the check whenever you have a moment?',
          'Pay money now please.',
          'How much money I owe you?',
          'Bring the paper of price.',
        ],
        correctAnswer: 'Could we get the check whenever you have a moment?',
        explanationZh: '美式用 "the check"，英式常用 "the bill"，加上 "whenever you have a moment" 显得格外有礼貌。',
        spokenTipZh: '"get the check" 节奏轻快，"whenever" 中间 n 与 e 自然过渡。',
      },
      {
        id: 'en_q5',
        type: 'speak_aloud',
        prompt: 'Sorry, could you say that one more time a little slower?',
        promptZh: '实景开口急救句：没听清老外说话时，优雅请对方放慢重复',
        contextZh: '对方语速太快，你想礼貌请他慢一点再说一遍',
        targetAudioText: 'Sorry, could you say that one more time a little slower?',
        phonetic: '/ˈsɑːri, kʊdʒuː seɪ ðæt wʌn mɔːr taɪm ə ˈlɪtəl ˈsloʊər?/',
        options: [],
        correctAnswer: 'Sorry, could you say that one more time a little slower?',
        explanationZh: '比生硬的 "Pardon?" 或 "I don\'t understand" 更自然友好，出国必备保命句。',
        spokenTipZh: '"could you" 自然连读为 /kʊdʒuː/，微笑着说出语气更柔和。',
      },
    ],
  },
  ar: {
    topicTitleZh: '阿拉伯语实景高频口语极速闯关',
    questions: [
      {
        id: 'ar_q1',
        type: 'listen_choose',
        prompt: 'استمع واختر الرد المناسب لصباح الخير:',
        promptZh: '听对方说「صَبَاحُ الخَيْرِ（早上好）」，最地道的阿拉伯语回应是？',
        contextZh: '在阿拉伯国家早晨走进咖啡馆，店主微笑向你问早安',
        targetAudioText: 'صَبَاحُ النُّورِ! كَيْفَ حَالُكَ؟',
        phonetic: 'Sabāḥ an-nūr! Kayfa ḥāluk?',
        options: [
          'صَبَاحُ النُّورِ! كَيْفَ حَالُكَ؟',
          'مَعَ السَّلَامَةِ الآنَ',
          'أَيْنَ المَطَارُ؟',
          'لَا أَعْرِفُ شَيْئاً',
        ],
        correctAnswer: 'صَبَاحُ النُّورِ! كَيْفَ حَالُكَ؟',
        explanationZh: '阿拉伯语经典对答礼仪：对方说 "Sabāḥ al-khayr（美好之晨）"，你回 "Sabāḥ an-nūr（光明之晨）"！',
        spokenTipZh: '注意 "Sabāḥ" 结尾的 ح 是轻柔的喉部吐气音，不要读成汉语的“哈”。',
      },
      {
        id: 'ar_q2',
        type: 'fill_blank',
        prompt: 'مِنْ ___، بِكَمْ هَذِهِ القَهْوَةُ؟',
        promptZh: '补全礼貌询问咖啡价格的阿拉伯语核心词（意为“请问 / 劳驾”）：',
        contextZh: '在市集或咖啡馆礼貌问价',
        targetAudioText: 'مِنْ فَضْلِكَ، بِكَمْ هَذِهِ القَهْوَةُ؟',
        phonetic: 'Min faḍlik, bi-kam hādhihi al-qahwa?',
        options: ['فَضْلِكَ', 'شُكْراً', 'مَسَاء', 'غَداً'],
        correctAnswer: 'فَضْلِكَ',
        explanationZh: '"مِنْ فَضْلِكَ (Min faḍlik)" 相当于英文的 "please / excuse me"，几乎所有实景对话都能用到。',
        spokenTipZh: '对男士说 min faḍlak，对女士说 min faḍlik，日常通用非常加分。',
      },
      {
        id: 'ar_q3',
        type: 'speak_aloud',
        prompt: 'أَهْلاً وَسَهْلاً! أَنَا مِنَ الصِّينِ وَتَشَرَّفْتُ بِمَعْرِفَتِكَ.',
        promptZh: '实景开口跟读：礼貌自我介绍并说“很高兴认识你”',
        contextZh: '在迪拜或利雅得结识新朋友',
        targetAudioText: 'أَهْلاً وَسَهْلاً! أَنَا مِنَ الصِّينِ وَتَشَرَّفْتُ بِمَعْرِفَتِكَ.',
        phonetic: 'Ahlan wa sahlan! Anā min aṣ-Ṣīn wa tasharraftu bi-maʿrifatik.',
        options: [],
        correctAnswer: 'أَهْلاً وَسَهْلاً! أَنَا مِنَ الصِّينِ وَتَشَرَّفْتُ بِمَعْرِفَتِكَ.',
        explanationZh: '"تَشَرَّفْتُ بِمَعْرِفَتِكَ" 意为“荣幸认识您”，是阿拉伯世界极具好感度的社交金句。',
        spokenTipZh: '分三拍读：Ahlan wa sahlan | Anā min aṣ-Ṣīn | wa tasharraftu bi-maʿrifatik。',
      },
      {
        id: 'ar_q4',
        type: 'multiple_choice',
        prompt: 'ما العبارة المناسبة لطلب الحساب في المطعم؟',
        promptZh: '在阿拉伯餐厅用完餐，礼貌要求结账应该怎么说？',
        contextZh: '向侍者示意买单',
        targetAudioText: 'الحِسَابُ مِنْ فَضْلِكَ، كَانَ الطَّعَامُ لَذِيذاً!',
        phonetic: 'Al-ḥisāb min faḍlik, kāna aṭ-ṭaʿām ladhīdhan!',
        options: [
          'الحِسَابُ مِنْ فَضْلِكَ، كَانَ الطَّعَامُ لَذِيذاً!',
          'أَيْنَ الفُنْدُقُ الكَبِيرُ؟',
          'صَبَاحُ الخَيْرِ يَا صَدِيقِي',
          'أُرِيدُ جَوَازَ السَّفَرِ',
        ],
        correctAnswer: 'الحِسَابُ مِنْ فَضْلِكَ، كَانَ الطَّعَامُ لَذِيذاً!',
        explanationZh: '"الحِسَابُ مِنْ فَضْلِكَ (Al-ḥisāb min faḍlik)" 是“请结账”，顺便夸一句 "الطَّعَامُ لَذِيذ (菜很美味)" 极受欢迎。',
        spokenTipZh: '"Al-ḥisāb" 重音在第二音节 sāb，语调温和礼貌。',
      },
      {
        id: 'ar_q5',
        type: 'speak_aloud',
        prompt: 'عَفْواً، هَلْ يُمْكِنُكَ التَّحَدُّثُ بِبُطْءٍ مِنْ فَضْلِكَ؟',
        promptZh: '实景开口急救句：请对方说慢一点',
        contextZh: '听阿拉伯语语速偏快，礼貌请求放慢速度',
        targetAudioText: 'عَفْواً، هَلْ يُمْكِنُكَ التَّحَدُّثُ بِبُطْءٍ مِنْ فَضْلِكَ؟',
        phonetic: 'ʿAfwan, hal yumkinuka at-taḥadduth bi-buṭʾin min faḍlik?',
        options: [],
        correctAnswer: 'عَفْواً، هَلْ يُمْكِنُكَ التَّحَدُّثُ بِبُطْءٍ مِنْ فَضْلِكَ؟',
        explanationZh: '用 "عَفْواً (不好意思)" 开头，再说 "بِبُطْءٍ (慢一点)"，立刻获得对方耐心放慢语速。',
        spokenTipZh: '重点清晰读出 "ʿAfwan" 和 "bi-buṭʾin" 两个关键词，对方立刻就能听懂。',
      },
    ],
  },
};

function safeJsonParse<T>(raw: string): T | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const unwrapped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(unwrapped) as T;
  } catch {
    const start = unwrapped.indexOf('{');
    const end = unwrapped.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(unwrapped.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function raceFirstValid<T>(tasks: Array<Promise<T | null>>): Promise<T | null> {
  if (tasks.length === 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    let remaining = tasks.length;
    let settled = false;
    for (const task of tasks) {
      task
        .then((res) => {
          if (!settled && res) {
            settled = true;
            resolve(res);
            return;
          }
          remaining -= 1;
          if (!settled && remaining <= 0) {
            settled = true;
            resolve(null);
          }
        })
        .catch(() => {
          remaining -= 1;
          if (!settled && remaining <= 0) {
            settled = true;
            resolve(null);
          }
        });
    }
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

/**
 * Ultra-fast zero-thinking structured JSON generator:
 * Uses gemini-3.1-flash-lite (ThinkingLevel.MINIMAL) for ~0.8-1.5s latency,
 * falling back to gemini-4-hydrogen (ThinkingLevel.LOW) and ONE AI router.
 */
async function generateStructuredJson<T>(opts: {
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, any>;
}): Promise<T> {
  const ai = getGeminiClient();

  const callGemini = (model: 'gemini-3.1-flash-lite' | 'gemini-4-hydrogen'): Promise<T | null> => {
    if (!ai) return Promise.resolve(null);
    const thinkingLevel = model === 'gemini-3.1-flash-lite' ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW;
    return withTimeout(
      ai.models
        .generateContent({
          model,
          contents: opts.prompt,
          config: {
            thinkingConfig: { thinkingLevel },
            systemInstruction: opts.systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: opts.responseSchema,
          },
        })
        .then((r) => safeJsonParse<T>(r.text ?? ''))
        .catch((err) => {
          console.warn(`[LanguageCoach] ${model} failed:`, err?.message || err);
          return null;
        }),
      18_000
    );
  };

  const routerRunner = (): Promise<T | null> =>
    withTimeout(
      oneAiRouter
        .executeUnifiedTurn({
          requestId: `lang_coach_${Date.now()}`,
          userId: null,
          subjectKey: 'language_coach',
          userTier: 'free',
          prompt: opts.prompt,
          messages: [
            {
              role: 'system',
              content: `${opts.systemInstruction}\nReturn ONLY valid compact JSON with no markdown fences.`,
            },
            { role: 'user', content: opts.prompt },
          ],
          mode: 'language-tutor',
          requiresStructuredOutput: true,
          maxTokens: 1200,
          stream: false,
        })
        .then((r) => (r.success && r.content ? safeJsonParse<T>(r.content) : null)),
      16_000
    );

  if (ai) {
    // Launch BOTH ultra-fast models in parallel at t=0ms — fastest responder wins immediately!
    const raced = await raceFirstValid([
      callGemini('gemini-3.1-flash-lite'),
      callGemini('gemini-4-hydrogen'),
    ]);
    if (raced) return raced;
    const routed = await routerRunner();
    if (routed) return routed;
  } else {
    const routed = await routerRunner();
    if (routed) return routed;
  }

  throw new Error('语言教练响应繁忙，请再试一次。');
}

const RESCUE_CARD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    level: { type: Type.STRING, description: 'One of: simple, natural, native' },
    labelZh: { type: Type.STRING, description: 'Short Chinese label like 新手最稳, 日常自然, 母语地道' },
    targetText: { type: Type.STRING, description: 'Exact spoken sentence in target language' },
    translationZh: { type: Type.STRING, description: 'Natural Chinese translation' },
    phonetic: { type: Type.STRING, description: 'IPA or clear romanized pronunciation guide' },
    chunkGuide: { type: Type.STRING, description: 'Phrase chunking with | separators for spoken rhythm' },
  },
  required: ['level', 'labelZh', 'targetText', 'translationZh', 'phonetic', 'chunkGuide'],
};

export async function generateLanguageQuizPack(params: {
  targetLang: SupportedStudyLang;
  level?: StudyLevel;
  topic?: string;
  count?: number;
  forceFresh?: boolean;
}): Promise<{
  targetLang: SupportedStudyLang;
  topicTitleZh: string;
  level: StudyLevel;
  questions: QuizQuestionItem[];
}> {
  const langMeta = getLangMeta(params.targetLang);
  const level: StudyLevel = params.level || 'intermediate';
  const count = Math.max(4, Math.min(8, params.count || 5));
  const rawTopic = (params.topic || '').trim();
  const isDefaultTopic =
    !rawTopic ||
    rawTopic === '日常实景口语与高频沟通' ||
    rawTopic === '日常高频口语与实景应答' ||
    rawTopic === '日常高频口语' ||
    rawTopic === '实景口语';

  // Instant-start (<10ms!) curated pack for English & Arabic default drills so learners start immediately!
  if (!params.forceFresh && isDefaultTopic && (params.targetLang === 'en' || params.targetLang === 'ar')) {
    const deck = INSTANT_QUIZ_DECKS[params.targetLang];
    return {
      targetLang: params.targetLang,
      topicTitleZh: deck.topicTitleZh,
      level,
      questions: deck.questions.slice(0, count),
    };
  }

  const topic = rawTopic || '日常实景口语与高频沟通';

  const systemInstruction = `You are a fast, engaging ${langMeta.nameEn} (${langMeta.nameZh}) spoken-language coach for Chinese-speaking learners.
- Create ${count} practical real-life questions mixing: "multiple_choice", "fill_blank", "listen_choose", and "speak_aloud".
- For "multiple_choice", "fill_blank", and "listen_choose": 4 distinct options, one exact match to correctAnswer.
- For "speak_aloud": options=[], correctAnswer=targetAudioText.
- Keep explanations (explanationZh) and spokenTipZh crisp and concise.`;

  const prompt = `Create ${count} ${langMeta.nameEn} (${langMeta.nativeName}) interactive exercises. Level: ${level}. Topic: ${topic}.`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      topicTitleZh: { type: Type.STRING },
      questions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            type: { type: Type.STRING },
            prompt: { type: Type.STRING },
            promptZh: { type: Type.STRING },
            contextZh: { type: Type.STRING },
            targetAudioText: { type: Type.STRING },
            phonetic: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctAnswer: { type: Type.STRING },
            explanationZh: { type: Type.STRING },
            spokenTipZh: { type: Type.STRING },
          },
          required: [
            'id',
            'type',
            'prompt',
            'promptZh',
            'contextZh',
            'targetAudioText',
            'phonetic',
            'options',
            'correctAnswer',
            'explanationZh',
            'spokenTipZh',
          ],
        },
      },
    },
    required: ['topicTitleZh', 'questions'],
  };

  let result: { topicTitleZh: string; questions: QuizQuestionItem[] } | null = null;
  try {
    result = await generateStructuredJson<{ topicTitleZh: string; questions: QuizQuestionItem[] }>({
      systemInstruction,
      prompt,
      responseSchema: schema,
    });
  } catch {
    result = null;
  }

  const validTypes = new Set(['multiple_choice', 'fill_blank', 'listen_choose', 'speak_aloud']);
  const normalizedQuestions = (result && Array.isArray(result.questions) ? result.questions : []).map((q, idx) => ({
    id: q.id || `q_${Date.now()}_${idx}`,
    type: (validTypes.has(q.type) ? q.type : 'multiple_choice') as QuizQuestionItem['type'],
    prompt: String(q.prompt || '').trim(),
    promptZh: String(q.promptZh || '').trim(),
    contextZh: String(q.contextZh || '').trim(),
    targetAudioText: String(q.targetAudioText || q.correctAnswer || q.prompt || '').trim(),
    phonetic: String(q.phonetic || '').trim(),
    options: Array.isArray(q.options) ? q.options.map((o) => String(o).trim()).filter(Boolean) : [],
    correctAnswer: String(q.correctAnswer || '').trim(),
    explanationZh: String(q.explanationZh || '').trim(),
    spokenTipZh: String(q.spokenTipZh || '').trim(),
  }));

  if (normalizedQuestions.length === 0) {
    if (params.targetLang === 'en' || params.targetLang === 'ar') {
      const deck = INSTANT_QUIZ_DECKS[params.targetLang];
      return {
        targetLang: params.targetLang,
        topicTitleZh: topic || deck.topicTitleZh,
        level,
        questions: deck.questions.slice(0, count),
      };
    }
    throw new Error('未能生成有效题目，请重试。');
  }

  return {
    targetLang: params.targetLang,
    topicTitleZh: result?.topicTitleZh || topic,
    level,
    questions: normalizedQuestions,
  };
}

export async function startRoleplaySession(params: {
  targetLang: SupportedStudyLang;
  scenarioId?: string;
  customScenario?: string;
  level?: StudyLevel;
}): Promise<RoleplayTurnResponse> {
  const langMeta = getLangMeta(params.targetLang);
  const level: StudyLevel = params.level || 'intermediate';
  const preset = ROLEPLAY_SCENARIOS.find((s) => s.id === params.scenarioId) || ROLEPLAY_SCENARIOS[0];
  const isCustom = Boolean(params.customScenario && params.customScenario.trim());

  const defaultMissions: RoleplayMissionItem[] = preset.missionsZh.map((zh, idx) => ({
    id: `m_${idx + 1}`,
    labelZh: zh,
    labelEn: preset.missionsEn[idx] || zh,
    completed: false,
  }));

  // INSTANT (<10ms!) launch for ALL 8 English & Arabic real-world scenarios!
  if (!isCustom) {
    const instantMap = params.targetLang === 'ar' ? INSTANT_AR_OPENERS : params.targetLang === 'en' ? INSTANT_EN_OPENERS : null;
    const instantSeed = instantMap?.[preset.id];
    if (instantSeed) {
      return {
        scenarioId: preset.id,
        scenarioTitle: preset.titleZh,
        npcRole: `${preset.npcRoleZh} (${preset.npcRoleEn})`,
        targetLang: params.targetLang,
        npcLine: instantSeed.npcLine,
        npcTranslationZh: instantSeed.npcTranslationZh,
        npcPhonetic: instantSeed.npcPhonetic,
        npcMood: instantSeed.npcMood,
        rescueSuggestions: instantSeed.rescueSuggestions,
        missions: defaultMissions,
      };
    }
  }

  const scenarioTitle = isCustom ? params.customScenario!.trim() : preset.titleZh;
  const scenarioSetting = isCustom
    ? `Real-world spoken scenario: ${params.customScenario!.trim()}`
    : `${preset.titleEn} — ${preset.settingEn}`;
  const npcRole = isCustom ? `Native ${langMeta.nameEn} partner` : `${preset.npcRoleEn} (${preset.npcRoleZh})`;

  const systemInstruction = `Play a lifelike ${langMeta.nameEn} (${langMeta.nativeName}) roleplay character for a Chinese learner (level: ${level}).
- Output 1-2 natural spoken sentences (npcLine), concise Chinese translation (npcTranslationZh), phonetic guide (npcPhonetic), and 3 graded rescueSuggestions (simple/natural/native) plus 3 missions. Be fast and concise.`;

  const prompt = `Start roleplay in ${langMeta.nameEn}. Scenario: ${scenarioSetting}. Role: ${npcRole}.`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      scenarioTitle: { type: Type.STRING },
      npcRole: { type: Type.STRING },
      npcLine: { type: Type.STRING },
      npcTranslationZh: { type: Type.STRING },
      npcPhonetic: { type: Type.STRING },
      npcMood: { type: Type.STRING },
      rescueSuggestions: { type: Type.ARRAY, items: RESCUE_CARD_SCHEMA },
      missions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            labelZh: { type: Type.STRING },
            labelEn: { type: Type.STRING },
            completed: { type: Type.BOOLEAN },
          },
          required: ['id', 'labelZh', 'labelEn', 'completed'],
        },
      },
    },
    required: ['scenarioTitle', 'npcRole', 'npcLine', 'npcTranslationZh', 'npcPhonetic', 'npcMood', 'rescueSuggestions', 'missions'],
  };

  const out = await generateStructuredJson<any>({
    systemInstruction,
    prompt,
    responseSchema: schema,
  });

  const moods = new Set(['cheerful', 'curious', 'empathetic', 'playful', 'calm']);
  const missions: RoleplayMissionItem[] =
    Array.isArray(out.missions) && out.missions.length > 0
      ? out.missions.slice(0, 4).map((m: any, idx: number) => ({
          id: String(m.id || `m_${idx + 1}`),
          labelZh: String(m.labelZh || preset.missionsZh[idx] || '完成自然交流'),
          labelEn: String(m.labelEn || preset.missionsEn[idx] || 'Complete exchange'),
          completed: false,
        }))
      : defaultMissions;

  return {
    scenarioId: isCustom ? 'custom' : preset.id,
    scenarioTitle: isCustom ? out.scenarioTitle || scenarioTitle : preset.titleZh,
    npcRole: out.npcRole || npcRole,
    targetLang: params.targetLang,
    npcLine: String(out.npcLine || '').trim(),
    npcTranslationZh: String(out.npcTranslationZh || '').trim(),
    npcPhonetic: String(out.npcPhonetic || '').trim(),
    npcMood: (moods.has(out.npcMood) ? out.npcMood : 'cheerful') as RoleplayTurnResponse['npcMood'],
    rescueSuggestions: normalizeRescueCards(out.rescueSuggestions),
    missions,
  };
}

export async function continueRoleplayTurn(params: {
  targetLang: SupportedStudyLang;
  scenarioId?: string;
  scenarioTitle: string;
  npcRole: string;
  level?: StudyLevel;
  history: Array<{ role: 'npc' | 'user'; text: string }>;
  userMessage: string;
  missions?: RoleplayMissionItem[];
}): Promise<RoleplayTurnResponse> {
  const langMeta = getLangMeta(params.targetLang);
  const level: StudyLevel = params.level || 'intermediate';
  const histText = params.history
    .slice(-4)
    .map((h) => `${h.role === 'npc' ? 'NPC' : 'User'}: ${h.text}`)
    .join('\n');
  const missionText = (params.missions || [])
    .map((m, idx) => `${idx}:[${m.completed ? '1' : '0'}] ${m.labelZh}`)
    .join('; ');

  const systemInstruction = `Fast, natural ${langMeta.nameEn} (${langMeta.nativeName}) roleplay as "${params.npcRole}" in "${params.scenarioTitle}" (level: ${level}).
- Reply in 1 crisp natural sentence (npcLine), short Chinese translation (npcTranslationZh), compact romanized/IPA phonetic (npcPhonetic).
- Give ultra-concise feedback (score, short praiseZh, betterWay, betterWayZh, short pronunciationTipZh).
- Provide exactly 2 graded rescueSuggestions (simple + native) and array doneMissionIndices of completed mission numbers (0-based). Keep EVERY string brief for speed.`;

  const prompt = `Missions: ${missionText || 'none'}\nHistory:\n${histText}\nUser: "${params.userMessage}"`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      npcLine: { type: Type.STRING },
      npcTranslationZh: { type: Type.STRING },
      npcPhonetic: { type: Type.STRING },
      npcMood: { type: Type.STRING },
      userFeedback: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER },
          praiseZh: { type: Type.STRING },
          betterWay: { type: Type.STRING },
          betterWayZh: { type: Type.STRING },
          pronunciationTipZh: { type: Type.STRING },
        },
        required: ['score', 'praiseZh', 'betterWay', 'betterWayZh', 'pronunciationTipZh'],
      },
      rescueSuggestions: { type: Type.ARRAY, items: RESCUE_CARD_SCHEMA },
      doneMissionIndices: { type: Type.ARRAY, items: { type: Type.NUMBER } },
    },
    required: ['npcLine', 'npcTranslationZh', 'npcPhonetic', 'npcMood', 'userFeedback', 'rescueSuggestions', 'doneMissionIndices'],
  };

  const out = await generateStructuredJson<any>({
    systemInstruction,
    prompt,
    responseSchema: schema,
  });

  const doneSet = new Set<number>(
    Array.isArray(out.doneMissionIndices) ? out.doneMissionIndices.map((n: any) => Number(n)) : []
  );
  const updatedMissions = (params.missions || []).map((m, idx) => ({
    ...m,
    completed: m.completed || doneSet.has(idx),
  }));

  const moods = new Set(['cheerful', 'curious', 'empathetic', 'playful', 'calm']);
  return {
    scenarioId: params.scenarioId || 'custom',
    scenarioTitle: params.scenarioTitle,
    npcRole: params.npcRole,
    targetLang: params.targetLang,
    npcLine: String(out.npcLine || '').trim(),
    npcTranslationZh: String(out.npcTranslationZh || '').trim(),
    npcPhonetic: String(out.npcPhonetic || '').trim(),
    npcMood: (moods.has(out.npcMood) ? out.npcMood : 'cheerful') as RoleplayTurnResponse['npcMood'],
    userFeedback: out.userFeedback
      ? {
          score: Math.max(50, Math.min(100, Math.round(Number(out.userFeedback.score) || 85))),
          praiseZh: String(out.userFeedback.praiseZh || '表达很清晰！').trim(),
          betterWay: String(out.userFeedback.betterWay || '').trim(),
          betterWayZh: String(out.userFeedback.betterWayZh || '').trim(),
          pronunciationTipZh: String(out.userFeedback.pronunciationTipZh || '').trim(),
        }
      : undefined,
    rescueSuggestions: normalizeRescueCards(out.rescueSuggestions),
    missions: updatedMissions,
  };
}

export async function generateSpokenRescue(params: {
  targetLang: SupportedStudyLang;
  situation?: string;
  lastNpcLine?: string;
  userIntentZh?: string;
  level?: StudyLevel;
}): Promise<SpokenRescueResponse> {
  const langMeta = getLangMeta(params.targetLang);
  const level: StudyLevel = params.level || 'intermediate';

  const systemInstruction = `Warm, ultra-fast spoken ${langMeta.nameEn} (${langMeta.nameZh}) coach.
Learner is stuck ("我不知道该怎么讲"). Return a 1-sentence encouraging Chinese line (coachReplyZh) + 3 ready-to-say ${langMeta.nameEn} replies (simple / natural / native) with Chinese translation, phonetic guide, and "|" chunkGuide.`;

  const prompt = `Lang: ${langMeta.nameEn} (${level}). Scene: ${params.situation || '日常口语'}. Other person said: "${params.lastNpcLine || '(greeting)'}". Learner intent: "${params.userIntentZh || '不知道怎么接话'}".`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      coachReplyZh: { type: Type.STRING },
      expressions: { type: Type.ARRAY, items: RESCUE_CARD_SCHEMA },
    },
    required: ['coachReplyZh', 'expressions'],
  };

  const out = await generateStructuredJson<any>({
    systemInstruction,
    prompt,
    responseSchema: schema,
  });

  return {
    targetLang: params.targetLang,
    coachReplyZh: String(out.coachReplyZh || '别紧张，直接选下面任意一句开口说就行，点小喇叭可以先听示范：').trim(),
    expressions: normalizeRescueCards(out.expressions),
  };
}

function normalizeRescueCards(raw: any): SpokenRescueCard[] {
  if (!Array.isArray(raw)) return [];
  const levels: Array<'simple' | 'natural' | 'native'> = ['simple', 'natural', 'native'];
  const defaultLabels = ['新手最稳', '日常自然', '母语地道'];
  return raw
    .slice(0, 3)
    .map((item, idx) => {
      const lv =
        item?.level === 'simple' || item?.level === 'natural' || item?.level === 'native'
          ? item.level
          : levels[idx] || 'natural';
      return {
        level: lv,
        labelZh: String(item?.labelZh || defaultLabels[idx] || '地道表达').trim(),
        targetText: String(item?.targetText || '').trim(),
        translationZh: String(item?.translationZh || '').trim(),
        phonetic: String(item?.phonetic || '').trim(),
        chunkGuide: String(item?.chunkGuide || item?.targetText || '').trim(),
      };
    })
    .filter((c) => Boolean(c.targetText));
}
