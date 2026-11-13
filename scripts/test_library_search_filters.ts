import assert from 'node:assert/strict';
import {
  filterLibrarySearchResults,
  getLibrarySearchFilterOptions,
  LIBRARY_SEARCH_UNKNOWN_FILTER
} from '../src/components/library/searchFilters.ts';

const records = [
  { id: 'a', source: 'openlibrary', sourceName: 'Open Library', rightsClassification: 'BORROWABLE', language: 'en', year: '2020' },
  { id: 'b', source: 'gutenberg', sourceName: 'Project Gutenberg', rightsClassification: 'PUBLIC_DOMAIN', language: 'en', year: '2020' },
  { id: 'c', source: 'europepmc', sourceName: 'Europe PMC', rightsClassification: 'OPEN_ACCESS', language: 'ar', year: '2019' },
  { id: 'd', source: 'openlibrary', sourceName: 'Open Library', rightsClassification: 'UNKNOWN', language: 'und' },
  { id: 'e', source: 'shamela', sourceName: 'Shamela', year: 'c. 1890' },
  { id: 'f', source: 'archive', sourceName: 'Internet Archive', rightsClassification: 'unrecognized-fixture-value', language: 'EN', year: ' ' },
  { id: 'g', source: 'crossref', sourceName: 'Crossref', language: 'fr', year: '2024' },
  { id: 'h', source: 'archive', sourceName: 'Internet Archive', rightsClassification: 'OPEN_LICENSE', language: 'unknown', year: 'und' }
] as const;
const original = structuredClone(records);

assert.deepEqual(
  filterLibrarySearchResults(records),
  records,
  'default filters preserve every result and its order'
);
assert.deepEqual(
  filterLibrarySearchResults(records, 'openlibrary').map(record => record.id),
  ['a', 'd'],
  'source filter uses the exact source identifier'
);
assert.deepEqual(
  filterLibrarySearchResults(records, 'all', 'PUBLIC_DOMAIN').map(record => record.id),
  ['b'],
  'rights filter matches only an explicitly reported rights classification'
);
assert.deepEqual(
  filterLibrarySearchResults(records, 'all', 'UNKNOWN').map(record => record.id),
  ['d', 'e', 'f', 'g'],
  'explicitly unknown, missing, and unrecognized rights classifications stay in the conservative unknown bucket'
);
assert.deepEqual(
  filterLibrarySearchResults(records, 'openlibrary', 'UNKNOWN').map(record => record.id),
  ['d'],
  'source and rights filters compose without broadening either match'
);

const options = getLibrarySearchFilterOptions(records);
assert.deepEqual(
  Object.fromEntries(options.sources.map(({ source, count }) => [source, count])),
  {
    archive: 2,
    crossref: 1,
    europepmc: 1,
    gutenberg: 1,
    openlibrary: 2,
    shamela: 1
  }
);
assert.deepEqual(options.rights.map(({ value, count }) => [value, count]), [
  ['PUBLIC_DOMAIN', 1],
  ['OPEN_LICENSE', 1],
  ['OPEN_ACCESS', 1],
  ['BORROWABLE', 1],
  ['UNKNOWN', 4]
]);
assert.deepEqual(
  Object.fromEntries(options.languages.map(({ label, count }) => [label, count])),
  { ar: 1, en: 3, fr: 1, '语言未知': 3 },
  'language facets come from returned values; case variants group together and und/unknown/missing stay unknown'
);
assert.deepEqual(
  options.years.map(({ label, count }) => [label, count]),
  [['2024', 1], ['2020', 2], ['2019', 1], ['c. 1890', 1], ['年份未知', 3]],
  'year facets preserve exact provider year strings, sort known values first, and include missing values only as unknown'
);

const english = options.languages.find(option => option.label === 'en')!.value;
const unknownLanguage = options.languages.find(option => option.value === LIBRARY_SEARCH_UNKNOWN_FILTER)!.value;
const year2020 = options.years.find(option => option.label === '2020')!.value;
const unknownYear = options.years.find(option => option.value === LIBRARY_SEARCH_UNKNOWN_FILTER)!.value;
assert.deepEqual(
  filterLibrarySearchResults(records, 'all', 'all', english).map(record => record.id),
  ['a', 'b', 'f'],
  'language filtering matches the returned language tag case-insensitively without treating und as a language'
);
assert.deepEqual(
  filterLibrarySearchResults(records, 'all', 'all', unknownLanguage).map(record => record.id),
  ['d', 'e', 'h'],
  'missing, und, and unknown language metadata can be filtered without assigning a language'
);
assert.deepEqual(
  filterLibrarySearchResults(records, 'all', 'all', 'all', year2020).map(record => record.id),
  ['a', 'b'],
  'year filtering matches the normalized year field exactly'
);
assert.deepEqual(
  filterLibrarySearchResults(records, 'all', 'all', 'all', unknownYear).map(record => record.id),
  ['d', 'f', 'h'],
  'missing, blank, and undetermined year metadata can be filtered as unknown'
);
assert.deepEqual(
  filterLibrarySearchResults(records, 'openlibrary', 'BORROWABLE', english, year2020).map(record => record.id),
  ['a'],
  'source, rights, language, and year filters compose conjunctively'
);
assert.deepEqual(records, original, 'filtering and facet generation do not mutate result records');
console.log('library search filter tests: PASS (synthetic records only)');
