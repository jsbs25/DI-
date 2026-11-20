export type EnglishReviewRating = 'again' | 'hard' | 'good' | 'easy';
export type EnglishAccent = 'en-US' | 'en-GB';

export interface EnglishWordCard {
  id: string;
  word: string;
  ipaUs: string;
  ipaUk: string;
  pos: string;
  level: 'CET-4' | 'IELTS' | 'TOEFL' | 'Core';
  meaningZh: string;
  meaningEn: string;
  collocations: string[];
  exampleEn: string;
  exampleZh: string;
}

export interface EnglishPhoneme {
  symbol: string;
  category: 'vowel' | 'diphthong' | 'consonant';
  example: string;
  tipZh: string;
  tipEn: string;
}

export interface EnglishReadingPassage {
  id: string;
  topic: string;
  titleEn: string;
  titleZh: string;
  level: string;
  bodyEn: string;
  translationZh: string;
}

export interface EnglishCardProgress {
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  dueAt: number;
  introducedAt: string;
  lastReviewedAt: string;
}

export interface EnglishStudyState {
  version: 1;
  cards: Record<string, EnglishCardProgress>;
  studyDays: string[];
}

export interface EnglishLookupResult {
  word: string;
  phonetic?: string;
  ukPhonetic?: string;
  usPhonetic?: string;
  audioUrl?: string;
  ukAudioUrl?: string;
  usAudioUrl?: string;
  cefrLevel?: string;
  usageNote?: string;
  collocations?: Array<{ phrase: string; zh?: string }>;
  meanings: Array<{
    partOfSpeech: string;
    cefr?: string;
    guideword?: string;
    definitions: Array<{
      definition: string;
      definitionZh?: string;
      example?: string;
      exampleZh?: string;
    }>;
  }>;
  related: string[];
  source: 'live' | 'fallback';
}

export const ENGLISH_CORE_WORDS: EnglishWordCard[] = [
  {
    id: 'resilient',
    word: 'resilient',
    ipaUs: '/rɪˈzɪljənt/',
    ipaUk: '/rɪˈzɪliənt/',
    pos: 'adj.',
    level: 'IELTS',
    meaningZh: '有韧性的；能迅速恢复的',
    meaningEn: 'Able to withstand or recover quickly from difficult conditions.',
    collocations: ['resilient ecosystem', 'economically resilient', 'remain resilient'],
    exampleEn: 'Humanity builds resilient systems when knowledge flows freely across borders.',
    exampleZh: '当知识跨越边界自由流动时，人类就能建立更具韧性的体系。',
  },
  {
    id: 'serendipity',
    word: 'serendipity',
    ipaUs: '/ˌserənˈdɪpəti/',
    ipaUk: '/ˌserənˈdɪpəti/',
    pos: 'n.',
    level: 'TOEFL',
    meaningZh: '意外发现珍奇事物的运气；机缘巧合',
    meaningEn: 'The occurrence of finding valuable or pleasant things by chance.',
    collocations: ['pure serendipity', 'scientific serendipity'],
    exampleEn: 'Many breakthroughs in physics began with curiosity paired with serendipity.',
    exampleZh: '物理学中的许多重大突破都始于好奇心与机缘巧合的相遇。',
  },
  {
    id: 'articulate',
    word: 'articulate',
    ipaUs: '/ɑːrˈtɪkjuleɪt/',
    ipaUk: '/ɑːˈtɪkjʊleɪt/',
    pos: 'v. / adj.',
    level: 'IELTS',
    meaningZh: '清晰表达；口齿伶俐的',
    meaningEn: 'To express an idea or feeling clearly and coherently.',
    collocations: ['articulate a vision', 'highly articulate'],
    exampleEn: 'Good thinkers learn how to articulate complex ideas in simple words.',
    exampleZh: '善于思考的人懂得如何用简洁的语言清晰表达复杂的思想。',
  },
  {
    id: 'ephemeral',
    word: 'ephemeral',
    ipaUs: '/ɪˈfemərəl/',
    ipaUk: '/ɪˈfemərəl/',
    pos: 'adj.',
    level: 'TOEFL',
    meaningZh: '短暂的；瞬息即逝的',
    meaningEn: 'Lasting for a very short time.',
    collocations: ['ephemeral beauty', 'ephemeral phenomena'],
    exampleEn: 'Unlike ephemeral trends, classical literature endures for centuries.',
    exampleZh: '与转瞬即逝的潮流不同，经典文学能够流传数个世纪。',
  },
  {
    id: 'synthesis',
    word: 'synthesis',
    ipaUs: '/ˈsɪnθəsɪs/',
    ipaUk: '/ˈsɪnθəsɪs/',
    pos: 'n.',
    level: 'TOEFL',
    meaningZh: '综合；合成；融合',
    meaningEn: 'The combination of ideas or elements to form a connected whole.',
    collocations: ['creative synthesis', 'cultural synthesis'],
    exampleEn: 'Modern science is a synthesis of empirical observation and mathematical precision.',
    exampleZh: '现代科学是经验观察与数学精确性的融合结晶。',
  },
  {
    id: 'nuance',
    word: 'nuance',
    ipaUs: '/ˈnuːɑːns/',
    ipaUk: '/ˈnjuːɑːns/',
    pos: 'n.',
    level: 'IELTS',
    meaningZh: '细微差别；微妙之处',
    meaningEn: 'A subtle difference in meaning, expression, or sound.',
    collocations: ['subtle nuance', 'linguistic nuance'],
    exampleEn: 'Mastering a foreign language means hearing the nuance behind every sentence.',
    exampleZh: '掌握一门外语，意味着能听出每句话背后的微妙含义。',
  },
  {
    id: 'paradigm',
    word: 'paradigm',
    ipaUs: '/ˈpærədaɪm/',
    ipaUk: '/ˈpærədaɪm/',
    pos: 'n.',
    level: 'TOEFL',
    meaningZh: '范式；典范；思维模式',
    meaningEn: 'A typical example, pattern, or framework of thinking.',
    collocations: ['paradigm shift', 'dominant paradigm'],
    exampleEn: 'Clean spatial interfaces introduced a new paradigm for human-computer interaction.',
    exampleZh: '简洁的空间交互界面为人机交互带来了全新的范式。',
  },
  {
    id: 'eloquent',
    word: 'eloquent',
    ipaUs: '/ˈeləkwənt/',
    ipaUk: '/ˈeləkwənt/',
    pos: 'adj.',
    level: 'IELTS',
    meaningZh: '雄辩的；富有感染力的',
    meaningEn: 'Fluent, persuasive, and expressive in speaking or writing.',
    collocations: ['eloquent speech', 'eloquent silence'],
    exampleEn: 'An eloquent silence can sometimes speak louder than a thousand words.',
    exampleZh: '富有深意的沉默有时比千言万语更有力量。',
  },
  {
    id: 'equilibrium',
    word: 'equilibrium',
    ipaUs: '/ˌiːkwɪˈlɪbriəm/',
    ipaUk: '/ˌekwɪˈlɪbriəm/',
    pos: 'n.',
    level: 'TOEFL',
    meaningZh: '平衡；均衡状态',
    meaningEn: 'A state in which opposing forces or influences are balanced.',
    collocations: ['dynamic equilibrium', 'restore equilibrium'],
    exampleEn: 'Planetary orbits maintain a delicate gravitational equilibrium across cosmic time.',
    exampleZh: '行星轨道在漫长的宇宙时间中保持着精妙的引力平衡。',
  },
  {
    id: 'pragmatic',
    word: 'pragmatic',
    ipaUs: '/præɡˈmætɪk/',
    ipaUk: '/præɡˈmætɪk/',
    pos: 'adj.',
    level: 'CET-4',
    meaningZh: '务实的；注重实效的',
    meaningEn: 'Dealing with things sensibly and realistically in a practical way.',
    collocations: ['pragmatic approach', 'pragmatic solution'],
    exampleEn: 'A pragmatic engineering plan turns ambitious vision into reliable software.',
    exampleZh: '务实的工程规划能把宏伟愿景转化为可靠的软件产品。',
  },
  {
    id: 'lucid',
    word: 'lucid',
    ipaUs: '/ˈluːsɪd/',
    ipaUk: '/ˈluːsɪd/',
    pos: 'adj.',
    level: 'IELTS',
    meaningZh: '清晰的；明了易懂的',
    meaningEn: 'Expressed clearly; easy to understand.',
    collocations: ['lucid explanation', 'lucid prose'],
    exampleEn: 'Her lucid explanation turned quantum mechanics into an intuitive story.',
    exampleZh: '她清晰透彻的讲解将量子力学化作了直观动人的故事。',
  },
  {
    id: 'ubiquitous',
    word: 'ubiquitous',
    ipaUs: '/juːˈbɪkwɪtəs/',
    ipaUk: '/juːˈbɪkwɪtəs/',
    pos: 'adj.',
    level: 'TOEFL',
    meaningZh: '无处不在的；普遍存在的',
    meaningEn: 'Present, appearing, or found everywhere.',
    collocations: ['ubiquitous computing', 'become ubiquitous'],
    exampleEn: 'Voice interfaces have become ubiquitous across modern mobile devices.',
    exampleZh: '语音交互界面在现代移动设备中已无处不在。',
  },
];

export const ENGLISH_PHONEMES: EnglishPhoneme[] = [
  { symbol: '/iː/', category: 'vowel', example: 'see', tipZh: '长元音，嘴角向两边微展，如“衣”拉长', tipEn: 'Long front high vowel, lips spread' },
  { symbol: '/ɪ/', category: 'vowel', example: 'sit', tipZh: '短促松弛，舌位略低于 /iː/', tipEn: 'Short relaxed high vowel' },
  { symbol: '/æ/', category: 'vowel', example: 'map', tipZh: '开口度大，舌尖抵下齿，梅花音', tipEn: 'Open front vowel, jaw lowered' },
  { symbol: '/ɑː/', category: 'vowel', example: 'star', tipZh: '后长元音，口腔充分打开，如看牙医“啊”', tipEn: 'Long open back vowel' },
  { symbol: '/uː/', category: 'vowel', example: 'moon', tipZh: '圆唇长音，双唇向前突出成小圆', tipEn: 'Long rounded back vowel' },
  { symbol: '/ə/', category: 'vowel', example: 'about', tipZh: '中央弱读元音（Schwa），完全放松轻吐', tipEn: 'Unstressed neutral mid vowel' },
  { symbol: '/eɪ/', category: 'diphthong', example: 'space', tipZh: '双元音，由 /e/ 自然滑向 /ɪ/', tipEn: 'Glide from /e/ to /ɪ/' },
  { symbol: '/aɪ/', category: 'diphthong', example: 'light', tipZh: '开口大到小，由 /a/ 滑向 /ɪ/', tipEn: 'Glide from /a/ to /ɪ/' },
  { symbol: '/oʊ/', category: 'diphthong', example: 'globe', tipZh: '圆唇滑动，由中元音滑向 /ʊ/', tipEn: 'Rounded back glide' },
  { symbol: '/θ/', category: 'consonant', example: 'think', tipZh: '清齿擦音，舌尖轻触上下齿间送气', tipEn: 'Voiceless dental fricative' },
  { symbol: '/ð/', category: 'consonant', example: 'this', tipZh: '浊齿擦音，舌位同 /θ/ 但声带振动', tipEn: 'Voiced dental fricative' },
  { symbol: '/ʃ/', category: 'consonant', example: 'ocean', tipZh: '清腭龈擦音，双唇微撅轻吹气', tipEn: 'Voiceless postalveolar fricative' },
];

export const ENGLISH_READING_PASSAGES: EnglishReadingPassage[] = [
  {
    id: 'cosmos-lang',
    topic: 'Space & Language',
    titleEn: 'Language as the Architecture of Human Thought',
    titleZh: '语言：人类思维的空间架构',
    level: 'IELTS · Academic',
    bodyEn:
      'Every language maps the universe differently. When we learn English alongside Arabic or Chinese, we do not merely memorize vocabulary; we acquire a second geometry for perceiving time, nuance, and human connection.',
    translationZh:
      '每一种语言都以独特的方式绘制宇宙图景。当我们在阿拉伯语与汉语之外学习英语时，我们不只是在记忆词汇，而是在获得一套感知时间、微妙语义与人类联结的全新几何。',
  },
  {
    id: 'orbital-earth',
    topic: 'Planetary Science',
    titleEn: 'A Fragile Blue Sphere in Deep Obsidian Space',
    titleZh: '深邃黑曜石太空中脆弱的蔚蓝星球',
    level: 'TOEFL · Science',
    bodyEn:
      'Seen from lunar orbit, Earth appears as a quiet oasis suspended in endless darkness. Thin layers of atmosphere scatter sunlight into electric sapphire along the horizon, reminding every observer how precious planetary equilibrium truly is.',
    translationZh:
      '从月球轨道回望，地球宛如悬浮在无尽黑暗中的静谧绿洲。纤薄的大气层将阳光沿地平线散射为澄澈的蔚蓝，提醒着每一位凝望者地球生态平衡的珍贵。',
  },
];

export const ENGLISH_SHADOWING_SENTENCES = [
  {
    en: 'The universe is not a silent void, but an open invitation to curiosity.',
    zh: '宇宙并非寂静的虚空，而是向好奇心发出的永恒邀约。',
  },
  {
    en: 'Clear articulation turns fleeting intuition into enduring wisdom.',
    zh: '清晰的表达能将转瞬即逝的直觉化为持久的智慧。',
  },
  {
    en: 'Precision and restraint define timeless spatial design.',
    zh: '精准与克制成就历久弥新的空间设计。',
  },
];

export const EMPTY_ENGLISH_STUDY_STATE: EnglishStudyState = {
  version: 1,
  cards: {},
  studyDays: [],
};

export function parseEnglishStudyState(raw: string | null): EnglishStudyState {
  if (!raw) return { version: 1, cards: {}, studyDays: [] };
  try {
    const val = JSON.parse(raw) as Partial<EnglishStudyState>;
    if (val.version !== 1 || !val.cards || typeof val.cards !== 'object') {
      return { version: 1, cards: {}, studyDays: [] };
    }
    const known = new Set(ENGLISH_CORE_WORDS.map((w) => w.id));
    const cards = Object.fromEntries(
      Object.entries(val.cards).filter(([id, prog]) => {
        if (!known.has(id) || !prog || typeof prog !== 'object') return false;
        const p = prog as Partial<EnglishCardProgress>;
        return Number.isFinite(p.repetitions) && Number.isFinite(p.dueAt);
      })
    ) as Record<string, EnglishCardProgress>;
    const studyDays = Array.isArray(val.studyDays)
      ? val.studyDays.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
      : [];
    return { version: 1, cards, studyDays: [...new Set(studyDays)] };
  } catch {
    return { version: 1, cards: {}, studyDays: [] };
  }
}

export function createEnglishDailyQueue(state: EnglishStudyState, now = Date.now(), newLimit = 5): string[] {
  const due = ENGLISH_CORE_WORDS.filter((w) => state.cards[w.id] && state.cards[w.id].dueAt <= now).map((w) => w.id);
  const fresh = ENGLISH_CORE_WORDS.filter((w) => !state.cards[w.id])
    .slice(0, newLimit)
    .map((w) => w.id);
  const combined = [...due, ...fresh];
  if (combined.length > 0) return combined;
  return ENGLISH_CORE_WORDS.slice(0, newLimit).map((w) => w.id);
}

export function scheduleEnglishCard(
  existing: EnglishCardProgress | undefined,
  rating: EnglishReviewRating,
  now = Date.now()
): EnglishCardProgress {
  const prevReps = existing?.repetitions ?? 0;
  let ease = existing?.easeFactor ?? 2.5;
  let reps = prevReps;
  let intervalDays = 1;

  if (rating === 'again') {
    reps = 0;
    intervalDays = 0;
    ease = Math.max(1.3, ease - 0.2);
  } else if (rating === 'hard') {
    reps = Math.max(1, prevReps + 1);
    intervalDays = prevReps === 0 ? 1 : Math.max(1, Math.round((existing?.intervalDays ?? 1) * 1.2));
    ease = Math.max(1.3, ease - 0.12);
  } else if (rating === 'good') {
    reps = prevReps + 1;
    intervalDays = reps === 1 ? 1 : reps === 2 ? 3 : Math.round((existing?.intervalDays ?? 3) * ease);
  } else {
    reps = prevReps + 1;
    ease = Math.min(3.0, ease + 0.15);
    intervalDays = reps === 1 ? 3 : Math.round((existing?.intervalDays ?? 4) * ease * 1.25);
  }

  const isoNow = new Date(now).toISOString();
  return {
    repetitions: reps,
    intervalDays,
    easeFactor: ease,
    dueAt: now + intervalDays * 24 * 60 * 60 * 1000,
    introducedAt: existing?.introducedAt ?? isoNow,
    lastReviewedAt: isoNow,
  };
}

export function evaluateShadowingMatch(targetSentence: string, spokenTranscript: string): {
  score: number;
  matchedWords: string[];
  missedWords: string[];
} {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9'\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

  const targetWords = normalize(targetSentence);
  const spokenSet = new Set(normalize(spokenTranscript));
  const matchedWords: string[] = [];
  const missedWords: string[] = [];

  for (const w of targetWords) {
    if (spokenSet.has(w)) matchedWords.push(w);
    else missedWords.push(w);
  }
  const score = targetWords.length ? Math.round((matchedWords.length / targetWords.length) * 100) : 0;
  return { score, matchedWords, missedWords };
}
