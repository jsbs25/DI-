import assert from 'node:assert/strict';
import type { Book } from '../src/types/index.ts';
import { buildReadingPrompt, resolveReadingEvidence } from '../server/libraryReadingAi.ts';

const fixture: Book = {
  id: 'fixture-public-domain-edition',
  title: 'Synthetic Open Text',
  author: 'Example Author',
  category: 'literature',
  language: 'en',
  year: '2024',
  publisher: 'Example Open Press',
  source: 'Project Gutenberg',
  sourceUrl: 'https://www.gutenberg.org/ebooks/99999',
  externalId: '99999',
  description: 'Synthetic test fixture only.',
  readProgress: 0,
  textAvailability: 'full_text',
  chapters: [{
    id: 'chapter-1',
    title: 'Chapter 1: Evidence',
    content: 'The river carried a silver leaf past the old bridge.\n\nA lantern marked the safe crossing at dusk.'
  }]
};

let passed = 0;
function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  passed += 1;
}

const valid = resolveReadingEvidence(fixture, 'chapter-1', 'The river carried a silver leaf past the old bridge.');
check(valid.ok, 'A selected passage from a server-stored full-text chapter is accepted');
if (valid.ok) {
  check(valid.evidence.selectedPassage === 'The river carried a silver leaf past the old bridge.', 'AI evidence is taken from the canonical stored body, not rewritten client text');
  check(valid.evidence.citation.title === fixture.title && valid.evidence.citation.author === fixture.author, 'Citation title and author come from the stored book record');
  check(valid.evidence.citation.version === 'Example Open Press, 2024', 'Citation carries the stored edition metadata');
  check(valid.evidence.citation.location === 'Chapter 1: Evidence' && valid.evidence.citation.sourceUrl === fixture.sourceUrl, 'Citation includes a chapter locator and a verifiable source URL');
  check(valid.evidence.coverage === 'full_text' && /不代表已分析全书/.test(valid.evidence.notice), 'Even full-text records disclose that this request only analyzes a local passage');
  const prompt = buildReadingPrompt(valid.evidence, 'zh');
  check(prompt.prompt.includes('silver leaf') && prompt.prompt.includes('safe crossing'), 'Prompt receives only the selected source passage and its nearby context');
  check(/Do not claim to have read the whole book/.test(prompt.systemInstruction) && /Do not infer missing text/.test(prompt.systemInstruction), 'Prompt forbids claiming unseen content or inventing citations');
}

const whitespaceMatch = resolveReadingEvidence(fixture, 'chapter-1', 'The river carried a silver leaf\n past the old bridge.');
check(whitespaceMatch.ok, 'Selection matching tolerates reader whitespace normalization while anchoring to the stored body');

const forgedSelection = resolveReadingEvidence(fixture, 'chapter-1', 'A different passage supplied only by the client.');
check(!forgedSelection.ok && forgedSelection.code === 'SELECTION_NOT_IN_SOURCE' && forgedSelection.status === 422, 'Client text not present in the stored chapter is rejected');

const missingChapter = resolveReadingEvidence(fixture, 'not-a-chapter', 'The river carried a silver leaf past the old bridge.');
check(!missingChapter.ok && missingChapter.code === 'BOOK_TEXT_UNAVAILABLE', 'Unknown or empty chapters are treated as unavailable text');

const metadataOnly = resolveReadingEvidence({ ...fixture, textAvailability: 'metadata_only' }, 'chapter-1', 'The river carried a silver leaf past the old bridge.');
check(!metadataOnly.ok && metadataOnly.code === 'BOOK_TEXT_UNVERIFIED', 'Metadata-only records and previews cannot be represented as full text');

const oldUnmarkedRecord = resolveReadingEvidence({ ...fixture, textAvailability: undefined }, 'chapter-1', 'The river carried a silver leaf past the old bridge.');
check(!oldUnmarkedRecord.ok && oldUnmarkedRecord.code === 'BOOK_TEXT_UNVERIFIED', 'Legacy records without a verified text-access marker fail closed');

const excerpt = resolveReadingEvidence({ ...fixture, textAvailability: 'excerpt' }, 'chapter-1', 'The river carried a silver leaf past the old bridge.');
check(excerpt.ok && excerpt.evidence.coverage === 'excerpt' && /不是全书全文/.test(excerpt.evidence.notice), 'Excerpt-only sources are labeled as excerpts and cannot be framed as whole-book reading');

const syntheticEpub: Book = {
  ...fixture,
  id: 'synthetic-epub-only',
  formatType: 'epub',
  epubUrl: 'https://www.gutenberg.org/files/99999/99999-0.epub',
  textAvailability: 'metadata_only',
  chapters: []
};
const epubAttempt = resolveReadingEvidence(syntheticEpub, 'chapter-1', 'A synthetic passage from a test EPUB.');
check(!epubAttempt.ok && epubAttempt.status === 409 && epubAttempt.code === 'EPUB_TEXT_UNAVAILABLE', 'EPUB-only content is explicitly refused because the server has no parsed source text or verified CFI locator');
if (!epubAttempt.ok) {
  check(/EPUB AI 解读暂不支持/.test(epubAttempt.error) && /未向 AI 发送请求/.test(epubAttempt.error), 'EPUB refusal explains the unsupported behavior and confirms no model request');
}

for (const rightsClassification of ['PUBLIC_DOMAIN', 'OPEN_LICENSE', 'OPEN_ACCESS', 'UNKNOWN', 'COPYRIGHT_RESTRICTED']) {
  const rightsAttempt = resolveReadingEvidence({
    ...syntheticEpub,
    rightsClassification,
    rightsNote: `Synthetic rights fixture: ${rightsClassification}`
  }, 'chapter-1', 'A synthetic passage from a test EPUB.');
  check(!rightsAttempt.ok && rightsAttempt.code === 'EPUB_TEXT_UNAVAILABLE', `EPUB AI remains unavailable for ${rightsClassification}; a rights label alone is not parsed-text provenance`);
}

const unverifiedEpubChapter = resolveReadingEvidence({
  ...syntheticEpub,
  textAvailability: 'full_text',
  chapters: [{ id: 'chapter-1', title: 'Synthetic chapter', content: 'The river carried a silver leaf past the old bridge.' }]
}, 'chapter-1', 'The river carried a silver leaf past the old bridge.');
check(!unverifiedEpubChapter.ok && unverifiedEpubChapter.code === 'EPUB_TEXT_UNAVAILABLE', 'An EPUB record cannot bypass the refusal by claiming full text or supplying an unverified chapter');

const unverifiableEdition = resolveReadingEvidence({ ...fixture, externalId: undefined, sourceUrl: undefined, publisher: undefined }, 'chapter-1', 'The river carried a silver leaf past the old bridge.');
check(!unverifiableEdition.ok && unverifiableEdition.code === 'CITATION_UNVERIFIABLE', 'Missing version/source identifiers prevent fabricated citations');

const tooLongSelection = resolveReadingEvidence(fixture, 'chapter-1', 'x'.repeat(4001));
check(!tooLongSelection.ok && tooLongSelection.code === 'SELECTION_INVALID', 'Oversized selections are rejected before an AI request');

console.log(`Library reading evidence regression: ${passed} passed, 0 failed (synthetic fixture only; no network or user data).`);
