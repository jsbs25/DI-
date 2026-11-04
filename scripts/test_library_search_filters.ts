import assert from 'node:assert/strict';
import {
  filterLibrarySearchResults,
  getLibrarySearchFilterOptions
} from '../src/components/library/searchFilters.ts';

const records = [
  { id: 'a', source: 'openlibrary', sourceName: 'Open Library', rightsClassification: 'BORROWABLE' },
  { id: 'b', source: 'gutenberg', sourceName: 'Project Gutenberg', rightsClassification: 'PUBLIC_DOMAIN' },
  { id: 'c', source: 'europepmc', sourceName: 'Europe PMC', rightsClassification: 'OPEN_ACCESS' },
  { id: 'd', source: 'openlibrary', sourceName: 'Open Library', rightsClassification: 'UNKNOWN' },
  { id: 'e', source: 'shamela', sourceName: 'Shamela' },
  { id: 'f', source: 'archive', sourceName: 'Internet Archive', rightsClassification: 'unrecognized-fixture-value' }
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
  ['d', 'e', 'f'],
  'explicitly unknown, missing, and unrecognized classifications stay in the conservative unknown bucket'
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
    archive: 1,
    europepmc: 1,
    gutenberg: 1,
    openlibrary: 2,
    shamela: 1
  }
);
assert.deepEqual(options.rights.map(({ value, count }) => [value, count]), [
  ['PUBLIC_DOMAIN', 1],
  ['OPEN_ACCESS', 1],
  ['BORROWABLE', 1],
  ['UNKNOWN', 3]
]);
assert.deepEqual(records, original, 'filtering and facet generation do not mutate result records');
console.log('library search filter tests: PASS (synthetic records only)');
