export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export interface ArabicLetter {
  id: string;
  nameArabic: string;
  nameLatin: string;
  soundZh: string;
  soundEn: string;
  forms: { isolated: string; initial: string; medial: string; final: string };
  exampleArabic: string;
  exampleLatin: string;
  meaningZh: string;
  meaningEn: string;
}

export interface LetterProgress {
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  dueAt: number;
  introducedAt: string;
  lastReviewedAt: string;
}

export interface ArabicStudyState {
  version: 1;
  cards: Record<string, LetterProgress>;
  studyDays: string[];
}

/** Original, compact reference content for the 28 basic Arabic letters. */
export const ARABIC_LETTERS: ArabicLetter[] = [
  { id: 'ا', nameArabic: 'أَلِف', nameLatin: 'alif', soundZh: '短元音承载字母；长音 ā。', soundEn: 'Often a carrier for short vowels; long ā.', forms: { isolated: 'ا', initial: 'ا', medial: 'ـا', final: 'ـا' }, exampleArabic: 'أَسَد', exampleLatin: 'asad', meaningZh: '狮子', meaningEn: 'lion' },
  { id: 'ب', nameArabic: 'بَاء', nameLatin: 'bāʾ', soundZh: '双唇音 b，像“巴”的声母。', soundEn: 'A two-lip b, as in “book”.', forms: { isolated: 'ب', initial: 'بـ', medial: 'ـبـ', final: 'ـب' }, exampleArabic: 'بَيْت', exampleLatin: 'bayt', meaningZh: '房子', meaningEn: 'house' },
  { id: 'ت', nameArabic: 'تَاء', nameLatin: 'tāʾ', soundZh: '清辅音 t，舌尖抵上齿龈。', soundEn: 'An unvoiced t, as in “tea”.', forms: { isolated: 'ت', initial: 'تـ', medial: 'ـتـ', final: 'ـت' }, exampleArabic: 'تَمْر', exampleLatin: 'tamr', meaningZh: '椰枣', meaningEn: 'dates' },
  { id: 'ث', nameArabic: 'ثَاء', nameLatin: 'thāʾ', soundZh: '类似英语 think 中的 th。', soundEn: 'Like th in “think”.', forms: { isolated: 'ث', initial: 'ثـ', medial: 'ـثـ', final: 'ـث' }, exampleArabic: 'ثَوْب', exampleLatin: 'thawb', meaningZh: '衣袍', meaningEn: 'garment' },
  { id: 'ج', nameArabic: 'جِيم', nameLatin: 'jīm', soundZh: '常见读音近似英语 jam 的 j；方言会有差异。', soundEn: 'Often like j in “jam”; pronunciation varies by dialect.', forms: { isolated: 'ج', initial: 'جـ', medial: 'ـجـ', final: 'ـج' }, exampleArabic: 'جَبَل', exampleLatin: 'jabal', meaningZh: '山', meaningEn: 'mountain' },
  { id: 'ح', nameArabic: 'حَاء', nameLatin: 'ḥāʾ', soundZh: '喉部发出的清擦音；普通话没有完全对应音。', soundEn: 'A voiceless pharyngeal sound with no exact English equivalent.', forms: { isolated: 'ح', initial: 'حـ', medial: 'ـحـ', final: 'ـح' }, exampleArabic: 'حُبّ', exampleLatin: 'ḥubb', meaningZh: '爱', meaningEn: 'love' },
  { id: 'خ', nameArabic: 'خَاء', nameLatin: 'khāʾ', soundZh: '类似德语 Bach 或苏格兰语 loch 的擦音。', soundEn: 'Like the ch in German “Bach”.', forms: { isolated: 'خ', initial: 'خـ', medial: 'ـخـ', final: 'ـخ' }, exampleArabic: 'خُبْز', exampleLatin: 'khubz', meaningZh: '面包', meaningEn: 'bread' },
  { id: 'د', nameArabic: 'دَال', nameLatin: 'dāl', soundZh: '清晰的 d 音；不与后面的字母连写。', soundEn: 'A clear d; it does not connect to the following letter.', forms: { isolated: 'د', initial: 'د', medial: 'ـد', final: 'ـد' }, exampleArabic: 'دَار', exampleLatin: 'dār', meaningZh: '家、住所', meaningEn: 'home' },
  { id: 'ذ', nameArabic: 'ذَال', nameLatin: 'dhāl', soundZh: '类似英语 this 中的 th；不与后面的字母连写。', soundEn: 'Like th in “this”; it does not connect to the following letter.', forms: { isolated: 'ذ', initial: 'ذ', medial: 'ـذ', final: 'ـذ' }, exampleArabic: 'ذَهَب', exampleLatin: 'dhahab', meaningZh: '金子', meaningEn: 'gold' },
  { id: 'ر', nameArabic: 'رَاء', nameLatin: 'rāʾ', soundZh: '舌尖轻弹的 r；不与后面的字母连写。', soundEn: 'A tapped r; it does not connect to the following letter.', forms: { isolated: 'ر', initial: 'ر', medial: 'ـر', final: 'ـر' }, exampleArabic: 'رَجُل', exampleLatin: 'rajul', meaningZh: '男人', meaningEn: 'man' },
  { id: 'ز', nameArabic: 'زَاي', nameLatin: 'zāy', soundZh: '浊音 z，像“字”的声母；不与后面的字母连写。', soundEn: 'A voiced z; it does not connect to the following letter.', forms: { isolated: 'ز', initial: 'ز', medial: 'ـز', final: 'ـز' }, exampleArabic: 'زَيْت', exampleLatin: 'zayt', meaningZh: '油', meaningEn: 'oil' },
  { id: 'س', nameArabic: 'سِين', nameLatin: 'sīn', soundZh: '清辅音 s，像“丝”的声母。', soundEn: 'An unvoiced s, as in “sun”.', forms: { isolated: 'س', initial: 'سـ', medial: 'ـسـ', final: 'ـس' }, exampleArabic: 'سَلَام', exampleLatin: 'salām', meaningZh: '和平', meaningEn: 'peace' },
  { id: 'ش', nameArabic: 'شِين', nameLatin: 'shīn', soundZh: '类似英语 ship 中的 sh。', soundEn: 'Like sh in “ship”.', forms: { isolated: 'ش', initial: 'شـ', medial: 'ـشـ', final: 'ـش' }, exampleArabic: 'شَمْس', exampleLatin: 'shams', meaningZh: '太阳', meaningEn: 'sun' },
  { id: 'ص', nameArabic: 'صَاد', nameLatin: 'ṣād', soundZh: '带喉部后缩的重音 s。', soundEn: 'An emphatic s, articulated with a retracted tongue root.', forms: { isolated: 'ص', initial: 'صـ', medial: 'ـصـ', final: 'ـص' }, exampleArabic: 'صَبَاح', exampleLatin: 'ṣabāḥ', meaningZh: '早晨', meaningEn: 'morning' },
  { id: 'ض', nameArabic: 'ضَاد', nameLatin: 'ḍād', soundZh: '带喉部后缩的重音 d。', soundEn: 'An emphatic d.', forms: { isolated: 'ض', initial: 'ضـ', medial: 'ـضـ', final: 'ـض' }, exampleArabic: 'ضَوْء', exampleLatin: 'ḍawʾ', meaningZh: '光', meaningEn: 'light' },
  { id: 'ط', nameArabic: 'طَاء', nameLatin: 'ṭāʾ', soundZh: '带喉部后缩的重音 t。', soundEn: 'An emphatic t.', forms: { isolated: 'ط', initial: 'طـ', medial: 'ـطـ', final: 'ـط' }, exampleArabic: 'طَالِب', exampleLatin: 'ṭālib', meaningZh: '学生', meaningEn: 'student' },
  { id: 'ظ', nameArabic: 'ظَاء', nameLatin: 'ẓāʾ', soundZh: '带喉部后缩的浊擦音；各地区读音不同。', soundEn: 'An emphatic voiced fricative; pronunciation varies by region.', forms: { isolated: 'ظ', initial: 'ظـ', medial: 'ـظـ', final: 'ـظ' }, exampleArabic: 'ظِلّ', exampleLatin: 'ẓill', meaningZh: '阴影', meaningEn: 'shade' },
  { id: 'ع', nameArabic: 'عَيْن', nameLatin: 'ʿayn', soundZh: '喉部浊音；普通话没有完全对应音。', soundEn: 'A voiced pharyngeal sound with no exact English equivalent.', forms: { isolated: 'ع', initial: 'عـ', medial: 'ـعـ', final: 'ـع' }, exampleArabic: 'عَيْن', exampleLatin: 'ʿayn', meaningZh: '眼睛', meaningEn: 'eye' },
  { id: 'غ', nameArabic: 'غَيْن', nameLatin: 'ghayn', soundZh: '类似法语 r 的浊擦音。', soundEn: 'A voiced fricative somewhat like French r.', forms: { isolated: 'غ', initial: 'غـ', medial: 'ـغـ', final: 'ـغ' }, exampleArabic: 'غُرْفَة', exampleLatin: 'ghurfa', meaningZh: '房间', meaningEn: 'room' },
  { id: 'ف', nameArabic: 'فَاء', nameLatin: 'fāʾ', soundZh: '清辅音 f，像“风”的声母。', soundEn: 'An unvoiced f, as in “fish”.', forms: { isolated: 'ف', initial: 'فـ', medial: 'ـفـ', final: 'ـف' }, exampleArabic: 'فِكْر', exampleLatin: 'fikr', meaningZh: '思想', meaningEn: 'thought' },
  { id: 'ق', nameArabic: 'قَاف', nameLatin: 'qāf', soundZh: '舌根后部发出的 q；方言实现有差异。', soundEn: 'A uvular q; pronunciation varies by dialect.', forms: { isolated: 'ق', initial: 'قـ', medial: 'ـقـ', final: 'ـق' }, exampleArabic: 'قَلْب', exampleLatin: 'qalb', meaningZh: '心', meaningEn: 'heart' },
  { id: 'ك', nameArabic: 'كَاف', nameLatin: 'kāf', soundZh: '清辅音 k，像“卡”的声母。', soundEn: 'An unvoiced k, as in “key”.', forms: { isolated: 'ك', initial: 'كـ', medial: 'ـكـ', final: 'ـك' }, exampleArabic: 'كِتَاب', exampleLatin: 'kitāb', meaningZh: '书', meaningEn: 'book' },
  { id: 'ل', nameArabic: 'لَام', nameLatin: 'lām', soundZh: '舌尖 l，像“来”的声母。', soundEn: 'An l sound, as in “lamp”.', forms: { isolated: 'ل', initial: 'لـ', medial: 'ـلـ', final: 'ـل' }, exampleArabic: 'لَيْل', exampleLatin: 'layl', meaningZh: '夜晚', meaningEn: 'night' },
  { id: 'م', nameArabic: 'مِيم', nameLatin: 'mīm', soundZh: '双唇鼻音 m，像“妈”的声母。', soundEn: 'A two-lip m, as in “moon”.', forms: { isolated: 'م', initial: 'مـ', medial: 'ـمـ', final: 'ـم' }, exampleArabic: 'مَاء', exampleLatin: 'māʾ', meaningZh: '水', meaningEn: 'water' },
  { id: 'ن', nameArabic: 'نُون', nameLatin: 'nūn', soundZh: '舌尖鼻音 n，像“你”的声母。', soundEn: 'An n sound, as in “name”.', forms: { isolated: 'ن', initial: 'نـ', medial: 'ـنـ', final: 'ـن' }, exampleArabic: 'نُور', exampleLatin: 'nūr', meaningZh: '光', meaningEn: 'light' },
  { id: 'ه', nameArabic: 'هَاء', nameLatin: 'hāʾ', soundZh: '轻柔的 h 气音。', soundEn: 'A light h breath.', forms: { isolated: 'ه', initial: 'هـ', medial: 'ـهـ', final: 'ـه' }, exampleArabic: 'هِلَال', exampleLatin: 'hilāl', meaningZh: '新月', meaningEn: 'crescent' },
  { id: 'و', nameArabic: 'وَاو', nameLatin: 'wāw', soundZh: '辅音 w，也可承载长音 ū。', soundEn: 'A consonant w; it can also mark long ū.', forms: { isolated: 'و', initial: 'و', medial: 'ـو', final: 'ـو' }, exampleArabic: 'وَرْد', exampleLatin: 'ward', meaningZh: '玫瑰', meaningEn: 'roses' },
  { id: 'ي', nameArabic: 'يَاء', nameLatin: 'yāʾ', soundZh: '辅音 y，也可承载长音 ī。', soundEn: 'A consonant y; it can also mark long ī.', forms: { isolated: 'ي', initial: 'يـ', medial: 'ـيـ', final: 'ـي' }, exampleArabic: 'يَد', exampleLatin: 'yad', meaningZh: '手', meaningEn: 'hand' }
];

export const EMPTY_ARABIC_STUDY_STATE: ArabicStudyState = {
  version: 1,
  cards: {},
  studyDays: []
};

export function parseArabicStudyState(raw: string | null): ArabicStudyState {
  if (!raw) return { version: 1, cards: {}, studyDays: [] };
  try {
    const value = JSON.parse(raw) as Partial<ArabicStudyState>;
    if (value.version !== 1 || !value.cards || typeof value.cards !== 'object') {
      return { version: 1, cards: {}, studyDays: [] };
    }
    const knownLetters = new Set(ARABIC_LETTERS.map(letter => letter.id));
    const cards = Object.fromEntries(
      Object.entries(value.cards).filter(([id, progress]) => {
        if (!knownLetters.has(id) || !progress || typeof progress !== 'object') return false;
        const card = progress as Partial<LetterProgress>;
        return Number.isFinite(card.repetitions) && Number.isFinite(card.dueAt);
      })
    ) as Record<string, LetterProgress>;
    const studyDays = Array.isArray(value.studyDays)
      ? value.studyDays.filter((day): day is string => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day))
      : [];
    return { version: 1, cards, studyDays: [...new Set(studyDays)] };
  } catch {
    return { version: 1, cards: {}, studyDays: [] };
  }
}

export function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getStudyStreak(studyDays: string[], now = new Date()): number {
  const completed = new Set(studyDays);
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!completed.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (completed.has(localDayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function createDailyReviewQueue(
  state: ArabicStudyState,
  now = Date.now(),
  dailyNewLimit = 5
): string[] {
  const today = localDayKey(new Date(now));
  const due = ARABIC_LETTERS
    .filter(letter => {
      const card = state.cards[letter.id];
      return Boolean(card?.introducedAt) && card.dueAt <= now;
    })
    .sort((a, b) => (state.cards[a.id]?.dueAt ?? 0) - (state.cards[b.id]?.dueAt ?? 0))
    .map(letter => letter.id);
  const introducedToday = Object.values(state.cards).filter(card => card.introducedAt === today).length;
  const remainingNew = Math.max(0, dailyNewLimit - introducedToday);
  const unseen = ARABIC_LETTERS
    .filter(letter => !state.cards[letter.id]?.introducedAt)
    .slice(0, remainingNew)
    .map(letter => letter.id);
  return [...due, ...unseen];
}

export function scheduleLetterReview(
  previous: LetterProgress | undefined,
  rating: ReviewRating,
  now = Date.now()
): LetterProgress {
  const oldRepetitions = previous?.repetitions ?? 0;
  const oldInterval = previous?.intervalDays ?? 0;
  const oldEase = previous?.easeFactor ?? 2.3;
  let repetitions: number;
  let intervalDays: number;
  let easeFactor: number;
  let dueAt: number;

  if (rating === 'again') {
    repetitions = 0;
    intervalDays = 0;
    easeFactor = Math.max(1.3, oldEase - 0.2);
    dueAt = now + 60_000;
  } else if (rating === 'hard') {
    repetitions = oldRepetitions + 1;
    intervalDays = oldRepetitions === 0 ? 1 : Math.max(1, Math.round(oldInterval * 1.2));
    easeFactor = Math.max(1.3, oldEase - 0.15);
    dueAt = now + intervalDays * 86_400_000;
  } else if (rating === 'easy') {
    repetitions = oldRepetitions + 1;
    intervalDays = oldRepetitions === 0 ? 3 : oldRepetitions === 1 ? 8 : Math.min(365, Math.round(oldInterval * oldEase * 1.3));
    easeFactor = Math.min(3.0, oldEase + 0.15);
    dueAt = now + intervalDays * 86_400_000;
  } else {
    repetitions = oldRepetitions + 1;
    intervalDays = oldRepetitions === 0 ? 1 : oldRepetitions === 1 ? 6 : Math.min(365, Math.round(oldInterval * oldEase));
    easeFactor = oldEase;
    dueAt = now + intervalDays * 86_400_000;
  }

  return {
    repetitions,
    intervalDays,
    easeFactor,
    dueAt,
    introducedAt: previous?.introducedAt || localDayKey(new Date(now)),
    lastReviewedAt: new Date(now).toISOString()
  };
}
