export interface EnglishLearningItem {
  id: string;
  phrase: string;
  meaningZh: string;
  meaningEn: string;
  meaningAr: string;
  example: string;
  exampleZh: string;
  exampleAr: string;
  category: 'greetings' | 'daily' | 'travel' | 'work' | 'study' | 'emergency';
}

export const ENGLISH_LEARNING_ITEMS: EnglishLearningItem[] = [
  { id: 'en_greet_1', phrase: 'Hello, how are you?', meaningZh: '你好，你怎么样？', meaningEn: 'A common greeting asking about someone’s well-being.', meaningAr: 'مرحبًا، كيف حالك؟', example: 'Hello, how are you today?', exampleZh: '你好，你今天怎么样？', exampleAr: 'مرحبًا، كيف حالك اليوم؟', category: 'greetings' },
  { id: 'en_greet_2', phrase: 'Nice to meet you.', meaningZh: '很高兴认识你。', meaningEn: 'Used when meeting someone for the first time.', meaningAr: 'سعيد بلقائك.', example: 'Nice to meet you, I’m Li Ming.', exampleZh: '很高兴认识你，我是李明。', exampleAr: 'سعيد بلقائك، أنا لي مينغ.', category: 'greetings' },
  { id: 'en_greet_3', phrase: 'Good morning.', meaningZh: '早上好。', meaningEn: 'A greeting used in the morning.', meaningAr: 'صباح الخير.', example: 'Good morning, everyone.', exampleZh: '大家早上好。', exampleAr: 'صباح الخير جميعًا.', category: 'greetings' },
  { id: 'en_greet_4', phrase: 'Good evening.', meaningZh: '晚上好。', meaningEn: 'A greeting used in the evening.', meaningAr: 'مساء الخير.', example: 'Good evening, welcome to our home.', exampleZh: '晚上好，欢迎来到我们家。', exampleAr: 'مساء الخير، مرحبًا بكم في بيتنا.', category: 'greetings' },
  { id: 'en_greet_5', phrase: 'Thank you very much.', meaningZh: '非常感谢你。', meaningEn: 'A polite way to express strong thanks.', meaningAr: 'شكرًا جزيلًا لك.', example: 'Thank you very much for your help.', exampleZh: '非常感谢你的帮助。', exampleAr: 'شكرًا جزيلًا لك على مساعدتك.', category: 'greetings' },
  { id: 'en_greet_6', phrase: 'You’re welcome.', meaningZh: '不客气。', meaningEn: 'A polite response to thanks.', meaningAr: 'على الرحب والسعة.', example: 'You’re welcome, anytime.', exampleZh: '不客气，随时为你效劳。', exampleAr: 'على الرحب والسعة، في أي وقت.', category: 'greetings' },
  { id: 'en_greet_7', phrase: 'Excuse me.', meaningZh: '打扰一下 / 不好意思。', meaningEn: 'Used to get attention politely or apologize for a small interruption.', meaningAr: 'عذرًا / لو سمحت.', example: 'Excuse me, where is the station?', exampleZh: '打扰一下，请问车站在哪里？', exampleAr: 'عذرًا، أين المحطة؟', category: 'greetings' },
  { id: 'en_greet_8', phrase: 'I’m sorry.', meaningZh: '对不起。', meaningEn: 'Used to apologize.', meaningAr: 'أنا آسف.', example: 'I’m sorry, I made a mistake.', exampleZh: '对不起，我犯了个错误。', exampleAr: 'أنا آسف، لقد ارتكبت خطأ.', category: 'greetings' },

  { id: 'en_daily_1', phrase: 'My name is...', meaningZh: '我的名字是……', meaningEn: 'Used to introduce yourself.', meaningAr: 'اسمي...', example: 'My name is Sara.', exampleZh: '我的名字是萨拉。', exampleAr: 'اسمي سارة.', category: 'daily' },
  { id: 'en_daily_2', phrase: 'I don’t understand.', meaningZh: '我不明白。', meaningEn: 'Used when something is not clear.', meaningAr: 'لا أفهم.', example: 'I don’t understand, could you repeat that?', exampleZh: '我不明白，你能再说一遍吗？', exampleAr: 'لا أفهم، هل يمكنك تكرار ذلك؟', category: 'daily' },
  { id: 'en_daily_3', phrase: 'Could you speak slowly, please?', meaningZh: '请你说慢一点好吗？', meaningEn: 'A polite request to speak more slowly.', meaningAr: 'هل يمكنك التحدث ببطء من فضلك؟', example: 'Could you speak slowly, please? I’m learning English.', exampleZh: '请你说慢一点好吗？我正在学英语。', exampleAr: 'هل يمكنك التحدث ببطء من فضلك؟ أنا أتعلم الإنجليزية.', category: 'daily' },
  { id: 'en_daily_4', phrase: 'What does this mean?', meaningZh: '这是什么意思？', meaningEn: 'Used to ask for the meaning of something.', meaningAr: 'ماذا يعني هذا؟', example: 'What does this word mean?', exampleZh: '这个词是什么意思？', exampleAr: 'ماذا تعني هذه الكلمة؟', category: 'daily' },
  { id: 'en_daily_5', phrase: 'How much does this cost?', meaningZh: '这个多少钱？', meaningEn: 'Used to ask about price.', meaningAr: 'كم سعر هذا؟', example: 'How much does this cost?', exampleZh: '这个多少钱？', exampleAr: 'كم سعر هذا؟', category: 'daily' },
  { id: 'en_daily_6', phrase: 'I would like...', meaningZh: '我想要……', meaningEn: 'A polite way to express what you want.', meaningAr: 'أود...', example: 'I would like a cup of tea, please.', exampleZh: '请给我一杯茶。', exampleAr: 'أود كوبًا من الشاي من فضلك.', category: 'daily' },
  { id: 'en_daily_7', phrase: 'Where is the bathroom?', meaningZh: '洗手间在哪里？', meaningEn: 'Used to ask for the restroom location.', meaningAr: 'أين الحمام؟', example: 'Excuse me, where is the bathroom?', exampleZh: '打扰一下，洗手间在哪里？', exampleAr: 'عذرًا، أين الحمام؟', category: 'daily' },
  { id: 'en_daily_8', phrase: 'I need help.', meaningZh: '我需要帮助。', meaningEn: 'Used to ask for assistance.', meaningAr: 'أحتاج إلى مساعدة.', example: 'I need help with this form.', exampleZh: '我需要有人帮我填这份表。', exampleAr: 'أحتاج إلى مساعدة في هذا النموذج.', category: 'daily' },

  { id: 'en_travel_1', phrase: 'Where is the airport?', meaningZh: '机场在哪里？', meaningEn: 'Used to ask for the airport location.', meaningAr: 'أين المطار؟', example: 'Where is the airport, please?', exampleZh: '请问机场在哪里？', exampleAr: 'أين المطار من فضلك؟', category: 'travel' },
  { id: 'en_travel_2', phrase: 'I have a reservation.', meaningZh: '我有预订。', meaningEn: 'Used at hotels, restaurants, etc.', meaningAr: 'لدي حجز.', example: 'I have a reservation under the name Ahmed.', exampleZh: '我用艾哈迈德的名字订了位。', exampleAr: 'لدي حجز باسم أحمد.', category: 'travel' },
  { id: 'en_travel_3', phrase: 'How do I get to...?', meaningZh: '我怎么去……？', meaningEn: 'Used to ask for directions.', meaningAr: 'كيف أصل إلى...؟', example: 'How do I get to the train station?', exampleZh: '我怎么去火车站？', exampleAr: 'كيف أصل إلى محطة القطار؟', category: 'travel' },
  { id: 'en_travel_4', phrase: 'A ticket to..., please.', meaningZh: '请给我一张去……的票。', meaningEn: 'Used to buy a ticket.', meaningAr: 'تذكرة إلى... من فضلك.', example: 'A ticket to London, please.', exampleZh: '请给我一张去伦敦的票。', exampleAr: 'تذكرة إلى لندن من فضلك.', category: 'travel' },
  { id: 'en_travel_5', phrase: 'Can I pay by card?', meaningZh: '我可以刷卡吗？', meaningEn: 'Used to ask if card payment is accepted.', meaningAr: 'هل يمكنني الدفع بالبطاقة؟', example: 'Can I pay by card here?', exampleZh: '这里可以刷卡吗？', exampleAr: 'هل يمكنني الدفع بالبطاقة هنا؟', category: 'travel' },

  { id: 'en_work_1', phrase: 'I work as a...', meaningZh: '我的职业是……', meaningEn: 'Used to describe your job.', meaningAr: 'أعمل كـ...', example: 'I work as a teacher.', exampleZh: '我是一名教师。', exampleAr: 'أعمل كمعلم.', category: 'work' },
  { id: 'en_work_2', phrase: 'Let’s schedule a meeting.', meaningZh: '我们安排一次会议吧。', meaningEn: 'Used to propose a meeting time.', meaningAr: 'لنحدد موعدًا للاجتماع.', example: 'Let’s schedule a meeting for tomorrow.', exampleZh: '我们安排明天开个会吧。', exampleAr: 'لنحدد موعدًا للاجتماع غدًا.', category: 'work' },
  { id: 'en_work_3', phrase: 'Could you send me the file?', meaningZh: '你能把文件发给我吗？', meaningEn: 'A polite request to share a file.', meaningAr: 'هل يمكنك إرسال الملف لي؟', example: 'Could you send me the file by email?', exampleZh: '你能把文件通过邮件发给我吗？', exampleAr: 'هل يمكنك إرسال الملف لي عبر البريد الإلكتروني؟', category: 'work' },
  { id: 'en_work_4', phrase: 'I’ll get back to you.', meaningZh: '我稍后回复你。', meaningEn: 'Used to promise a later response.', meaningAr: 'سأعود إليك لاحقًا.', example: 'I’ll get back to you this afternoon.', exampleZh: '我今天下午回复你。', exampleAr: 'سأعود إليك بعد ظهر اليوم.', category: 'work' },

  { id: 'en_study_1', phrase: 'I am learning English.', meaningZh: '我正在学习英语。', meaningEn: 'States that you are studying English.', meaningAr: 'أنا أتعلم اللغة الإنجليزية.', example: 'I am learning English every day.', exampleZh: '我每天都在学习英语。', exampleAr: 'أنا أتعلم اللغة الإنجليزية كل يوم.', category: 'study' },
  { id: 'en_study_2', phrase: 'How do you pronounce this?', meaningZh: '这个怎么发音？', meaningEn: 'Used to ask about pronunciation.', meaningAr: 'كيف تُنطق هذه؟', example: 'How do you pronounce this word?', exampleZh: '这个单词怎么发音？', exampleAr: 'كيف تُنطق هذه الكلمة؟', category: 'study' },
  { id: 'en_study_3', phrase: 'Can you give me an example?', meaningZh: '你能给我举个例子吗？', meaningEn: 'Used to ask for an example.', meaningAr: 'هل يمكنك أن تعطيني مثالًا؟', example: 'Can you give me an example sentence?', exampleZh: '你能给我举个例句吗？', exampleAr: 'هل يمكنك أن تعطيني جملة كمثال؟', category: 'study' },
  { id: 'en_study_4', phrase: 'I want to improve my speaking.', meaningZh: '我想提高我的口语。', meaningEn: 'Expresses a goal to speak better.', meaningAr: 'أريد تحسين مهارة التحدث لدي.', example: 'I want to improve my speaking and listening.', exampleZh: '我想提高我的口语和听力。', exampleAr: 'أريد تحسين مهارتي في التحدث والاستماع.', category: 'study' },
  { id: 'en_study_5', phrase: 'Let’s practice together.', meaningZh: '我们一起练习吧。', meaningEn: 'Suggests practicing with someone.', meaningAr: 'لنتدرب معًا.', example: 'Let’s practice English together.', exampleZh: '我们一起练习英语吧。', exampleAr: 'لنتدرب على الإنجليزية معًا.', category: 'study' },

  { id: 'en_emerg_1', phrase: 'I need a doctor.', meaningZh: '我需要医生。', meaningEn: 'Used in a medical emergency.', meaningAr: 'أحتاج إلى طبيب.', example: 'Please help, I need a doctor.', exampleZh: '请帮忙，我需要医生。', exampleAr: 'أرجو المساعدة، أحتاج إلى طبيب.', category: 'emergency' },
  { id: 'en_emerg_2', phrase: 'Call the police, please.', meaningZh: '请报警。', meaningEn: 'Used to request police help.', meaningAr: 'اتصل بالشرطة من فضلك.', example: 'Call the police, please!', exampleZh: '请报警！', exampleAr: 'اتصل بالشرطة من فضلك!', category: 'emergency' },
  { id: 'en_emerg_3', phrase: 'I lost my passport.', meaningZh: '我的护照丢了。', meaningEn: 'Used to report a lost passport.', meaningAr: 'لقد فقدت جواز سفري.', example: 'I lost my passport at the hotel.', exampleZh: '我在酒店把护照弄丢了。', exampleAr: 'لقد فقدت جواز سفري في الفندق.', category: 'emergency' },
  { id: 'en_emerg_4', phrase: 'Can you help me?', meaningZh: '你能帮帮我吗？', meaningEn: 'A direct request for help.', meaningAr: 'هل يمكنك مساعدتي؟', example: 'Can you help me find this address?', exampleZh: '你能帮我找到这个地址吗？', exampleAr: 'هل يمكنك مساعدتي في العثور على هذا العنوان؟', category: 'emergency' },
];

export const ENGLISH_CATEGORIES: { id: EnglishLearningItem['category']; zh: string; en: string; ar: string }[] = [
  { id: 'greetings', zh: '问候与礼貌', en: 'Greetings & Politeness', ar: 'التحيات واللباقة' },
  { id: 'daily', zh: '日常交流', en: 'Daily Communication', ar: 'التواصل اليومي' },
  { id: 'travel', zh: '旅行出行', en: 'Travel', ar: 'السفر' },
  { id: 'work', zh: '工作职场', en: 'Work', ar: 'العمل' },
  { id: 'study', zh: '学习进阶', en: 'Study & Improvement', ar: 'الدراسة والتطور' },
  { id: 'emergency', zh: '紧急求助', en: 'Emergency', ar: 'الطوارئ' },
];

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

export const EMPTY_ENGLISH_STUDY_STATE: EnglishStudyState = { version: 1, cards: {}, studyDays: [] };

export function localDayKeyEn(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseEnglishStudyState(raw: string | null): EnglishStudyState {
  if (!raw) return { ...EMPTY_ENGLISH_STUDY_STATE, cards: {}, studyDays: [] };
  try {
    const value = JSON.parse(raw) as Partial<EnglishStudyState>;
    if (value.version !== 1 || !value.cards || typeof value.cards !== 'object') {
      return { ...EMPTY_ENGLISH_STUDY_STATE, cards: {}, studyDays: [] };
    }
    const known = new Set(ENGLISH_LEARNING_ITEMS.map(i => i.id));
    const cards = Object.fromEntries(
      Object.entries(value.cards).filter(([id, progress]) => {
        if (!known.has(id) || !progress || typeof progress !== 'object') return false;
        const c = progress as Partial<EnglishCardProgress>;
        return Number.isFinite(c.repetitions) && Number.isFinite(c.dueAt);
      })
    ) as Record<string, EnglishCardProgress>;
    const studyDays = Array.isArray(value.studyDays)
      ? value.studyDays.filter((day): day is string => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day))
      : [];
    return { version: 1, cards, studyDays: [...new Set(studyDays)] };
  } catch {
    return { ...EMPTY_ENGLISH_STUDY_STATE, cards: {}, studyDays: [] };
  }
}

export function getEnglishStudyStreak(studyDays: string[], now = new Date()): number {
  const completed = new Set(studyDays);
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!completed.has(localDayKeyEn(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (completed.has(localDayKeyEn(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function createEnglishDailyQueue(state: EnglishStudyState, now = Date.now(), dailyNewLimit = 5): string[] {
  const today = localDayKeyEn(new Date(now));
  const due = ENGLISH_LEARNING_ITEMS
    .filter(item => {
      const card = state.cards[item.id];
      return Boolean(card?.introducedAt) && card.dueAt <= now;
    })
    .sort((a, b) => (state.cards[a.id]?.dueAt ?? 0) - (state.cards[b.id]?.dueAt ?? 0))
    .map(item => item.id);
  const introducedToday = Object.values(state.cards).filter(card => card.introducedAt === today).length;
  const remainingNew = Math.max(0, dailyNewLimit - introducedToday);
  const unseen = ENGLISH_LEARNING_ITEMS
    .filter(item => !state.cards[item.id]?.introducedAt)
    .slice(0, remainingNew)
    .map(item => item.id);
  return [...due, ...unseen];
}

export type EnglishReviewRating = 'again' | 'hard' | 'good' | 'easy';

export function scheduleEnglishReview(previous: EnglishCardProgress | undefined, rating: EnglishReviewRating, now = Date.now()): EnglishCardProgress {
  const oldRepetitions = previous?.repetitions ?? 0;
  const oldInterval = previous?.intervalDays ?? 0;
  const oldEase = previous?.easeFactor ?? 2.3;
  let repetitions: number;
  let intervalDays: number;
  let easeFactor: number;
  let dueAt: number;

  if (rating === 'again') {
    repetitions = 0; intervalDays = 0; easeFactor = Math.max(1.3, oldEase - 0.2); dueAt = now + 60_000;
  } else if (rating === 'hard') {
    repetitions = oldRepetitions + 1; intervalDays = oldRepetitions === 0 ? 1 : Math.max(1, Math.round(oldInterval * 1.2)); easeFactor = Math.max(1.3, oldEase - 0.15); dueAt = now + intervalDays * 86_400_000;
  } else if (rating === 'easy') {
    repetitions = oldRepetitions + 1; intervalDays = oldRepetitions === 0 ? 3 : oldRepetitions === 1 ? 8 : Math.min(365, Math.round(oldInterval * oldEase * 1.3)); easeFactor = Math.min(3.0, oldEase + 0.15); dueAt = now + intervalDays * 86_400_000;
  } else {
    repetitions = oldRepetitions + 1; intervalDays = oldRepetitions === 0 ? 1 : oldRepetitions === 1 ? 6 : Math.min(365, Math.round(oldInterval * oldEase)); easeFactor = oldEase; dueAt = now + intervalDays * 86_400_000;
  }

  return {
    repetitions, intervalDays, easeFactor, dueAt,
    introducedAt: previous?.introducedAt || localDayKeyEn(new Date(now)),
    lastReviewedAt: new Date(now).toISOString()
  };
}
