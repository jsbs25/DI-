import assert from 'node:assert/strict';
import {
  ARABIC_LETTERS,
  createDailyReviewQueue,
  getStudyStreak,
  localDayKey,
  parseArabicStudyState,
  scheduleLetterReview,
  type ArabicStudyState
} from '../src/components/learning/arabicLearning.ts';

const now = new Date(2026, 10, 4, 12, 0, 0).getTime();
const today = localDayKey(new Date(now));

assert.equal(ARABIC_LETTERS.length, 28, 'The basic Arabic alphabet contains 28 cards in this module.');
assert.equal(new Set(ARABIC_LETTERS.map(letter => letter.id)).size, 28, 'Letter IDs must be unique.');
assert.ok(ARABIC_LETTERS.every(letter => letter.forms.isolated && letter.forms.initial && letter.forms.medial && letter.forms.final), 'Every card needs all four display forms.');
assert.ok(ARABIC_LETTERS.every(letter => letter.exampleArabic && letter.meaningEn && letter.meaningZh), 'Every card needs a bilingual example.');

const initial = parseArabicStudyState(null);
assert.equal(createDailyReviewQueue(initial, now).length, 5, 'A first session introduces no more than five new letters.');
assert.equal(createDailyReviewQueue(initial, now).join(''), 'ابتثج', 'The first session uses stable alphabet order.');

const firstGood = scheduleLetterReview(undefined, 'good', now);
assert.equal(firstGood.repetitions, 1);
assert.equal(firstGood.intervalDays, 1);
assert.equal(firstGood.dueAt, now + 86_400_000);
assert.equal(firstGood.introducedAt, today);

const firstEasy = scheduleLetterReview(undefined, 'easy', now);
assert.equal(firstEasy.intervalDays, 3);
assert.ok(firstEasy.easeFactor > 2.3);

const firstAgain = scheduleLetterReview(undefined, 'again', now);
assert.equal(firstAgain.repetitions, 0);
assert.equal(firstAgain.dueAt, now + 60_000, 'Again cards return after one minute.');

const practicedState: ArabicStudyState = {
  version: 1,
  cards: { 'ا': firstGood },
  studyDays: [today]
};
const nextQueue = createDailyReviewQueue(practicedState, now);
assert.equal(nextQueue.length, 4, 'A reviewed new card counts toward the five-card daily introduction limit.');
assert.equal(nextQueue.includes('ا'), false, 'Tomorrow-due cards are not shown early.');
const nextDayQueue = createDailyReviewQueue(practicedState, now + 86_400_001);
assert.equal(nextDayQueue[0], 'ا', 'Due reviews are scheduled before new letters.');
assert.equal(nextDayQueue.length, 6, 'A later day includes the due card plus up to five new cards.');

const againState: ArabicStudyState = { version: 1, cards: { 'ا': firstAgain }, studyDays: [today] };
assert.equal(createDailyReviewQueue(againState, now + 59_999).includes('ا'), false);
assert.equal(createDailyReviewQueue(againState, now + 60_000)[0], 'ا');

const parsed = parseArabicStudyState(JSON.stringify({
  version: 1,
  cards: { 'ا': firstGood, bogus: firstGood, broken: { repetitions: 'x', dueAt: 0 } },
  studyDays: [today, 'bad-day', today]
}));
assert.deepEqual(Object.keys(parsed.cards), ['ا'], 'Parsing discards unknown or malformed cards.');
assert.deepEqual(parsed.studyDays, [today], 'Study-day history is validated and deduplicated.');
assert.deepEqual(parseArabicStudyState('{not json'), { version: 1, cards: {}, studyDays: [] });

const yesterdayDate = new Date(now);
yesterdayDate.setDate(yesterdayDate.getDate() - 1);
const twoDaysAgo = new Date(now);
twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
assert.equal(getStudyStreak([localDayKey(yesterdayDate), today], new Date(now)), 2);
assert.equal(getStudyStreak([localDayKey(yesterdayDate)], new Date(now)), 1, 'A streak remains active through the rest day before today.');
assert.equal(getStudyStreak([localDayKey(twoDaysAgo)], new Date(now)), 0, 'A gap ends the streak.');

console.log('Arabic learning tests passed: alphabet data, review scheduling, daily queue, progress validation, and streaks.');
