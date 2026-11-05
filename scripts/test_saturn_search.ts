import assert from 'node:assert/strict';
import { parseSaturnVideoResults } from '../src/universe/saturnSearch.ts';

const results = parseSaturnVideoResults({
  results: [
    {
      title: '  Public space documentary  ',
      url: 'https://video.example/watch?id=7',
      domain: 'video.example',
      snippet: 'A documentary from the publisher.',
      thumbnailUrl: 'https://images.example/thumbnail.jpg',
      date: '2025-03-01'
    },
    { title: 'Duplicate', url: 'https://video.example/watch?id=7' },
    { title: 'Unsafe scheme', url: 'javascript:alert(1)' },
    { title: 'Credential URL', url: 'https://user:pass@video.example/watch' },
    { title: 'Relative URL', url: '/watch/2' },
    { title: 'Invalid thumbnail', url: 'https://video.example/watch/3', thumbnailUrl: 'data:image/png;base64,abc' },
    null
  ]
});

assert.equal(results.length, 2);
assert.equal(results[0].title, 'Public space documentary');
assert.equal(results[0].domain, 'video.example');
assert.equal(results[0].thumbnailUrl, 'https://images.example/thumbnail.jpg');
assert.equal(results[0].date, '2025-03-01');
assert.equal(results[1].thumbnailUrl, undefined);
assert.equal(parseSaturnVideoResults({ results: 'not-an-array' }).length, 0);
assert.equal(parseSaturnVideoResults(null).length, 0);

console.log('Saturn JUPITER-source parsing: 8 passed, 0 failed.');
