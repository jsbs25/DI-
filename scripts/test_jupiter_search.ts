import assert from 'node:assert/strict';
import {
  cacheJupiterSearch,
  getJupiterEarthContent,
  getCachedJupiterSearch,
  mergeAndRankJupiterResults,
  searchEarthIndex
} from '../server/jupiterSearch.ts';
import { buildJupiterSearchRoute, parseJupiterSearchRoute } from '../src/components/browser/jupiterSearchRoute.ts';

const searchRoute = buildJupiterSearchRoute('climate change NASA', 'duckduckgo', 'zh');
assert.equal(searchRoute, '/jupiter/search?q=climate+change+NASA&engine=duckduckgo&lang=zh');
assert.deepEqual(parseJupiterSearchRoute(searchRoute), {
  query: 'climate change NASA', engine: 'duckduckgo', lang: 'zh'
});
assert.deepEqual(parseJupiterSearchRoute('/jupiter/search?q=space+weather&engine=unknown&lang=xx'), {
  query: 'space weather', engine: 'auto', lang: 'en'
});
assert.equal(parseJupiterSearchRoute('/jupiter/search'), null);
assert.equal(parseJupiterSearchRoute('/jupiter/watch/video-1'), null);

const earthResults = searchEarthIndex('climate earth', {
  articles: [
    { id: 'a1', title: 'Earth climate science', summary: 'Climate observations and trends.' },
    { id: 'a2', title: 'Cooking notes', summary: 'A collection of recipes.' }
  ],
  videos: [{ id: 'v1', title: 'Earth climate video', description: 'Public climate explainer.' }],
  books: [{ id: 'b1', title: 'Climate and Earth', author: 'A. Writer', description: 'Open book record.' }],
  posts: [{ id: 'p1', content: 'Earth climate observations from the field.' }]
});
assert.equal(earthResults.length, 4, 'Only matching EARTH index records should be returned.');
assert.ok(earthResults.every(result => result.source === 'earth' && result.url.startsWith('/jupiter/')));
assert.ok(earthResults[0].title.includes('Earth'), 'Title relevance should rank matching records first.');

const nonDemoResults = searchEarthIndex('public climate', {
  articles: [{ id: 'art_1', title: 'Public climate report', summary: 'Demo seed content.' }],
  videos: [{ id: 'vid_1', title: 'Public climate video', description: 'Demo seed content.' }],
  books: [{ id: 'book_republic', title: 'Public climate book', description: 'Demo seed content.' }],
  posts: [{ id: 'post_1', content: 'Public climate post from demo seed content.' }]
});
assert.equal(nonDemoResults.length, 0, 'Static demonstration records must not be presented as real EARTH search results.');
assert.equal(getJupiterEarthContent('article', 'art_1', {
  articles: [{ id: 'art_1', title: 'Demo', content: 'Seed' }], videos: [], books: [], posts: []
}), null, 'Static demonstration records must not be accessible through the JUPITER content endpoint.');
assert.deepEqual(getJupiterEarthContent('article', 'article-1', {
  articles: [{ id: 'article-1', title: 'Climate update', summary: 'Summary', content: 'Full article body' }],
  videos: [], books: [], posts: []
}), {
  id: 'article-1', kind: 'article', title: 'Climate update', summary: 'Summary', content: 'Full article body'
}, 'JUPITER content lookup should return full indexed article data.');
assert.equal(getJupiterEarthContent('video', 'video-1', {
  articles: [], videos: [{ id: 'video-1', title: 'Climate film', description: 'A report', videoUrl: 'https://media.example/video.mp4' }],
  books: [], posts: []
})?.mediaUrl, 'https://media.example/video.mp4', 'Video content should expose the authorized source URL for native playback.');

const external: Parameters<typeof mergeAndRankJupiterResults>[1] = [
  { id: 'web1', title: 'Earth climate report', url: 'https://www.example.org/story?utm_source=search', snippet: 'Climate data', source: 'web', kind: 'web', domain: 'example.org' },
  { id: 'web2', title: 'Duplicate page', url: 'https://example.org/story#top', snippet: 'duplicate', source: 'web', kind: 'web', domain: 'example.org' },
  { id: 'earth1', title: 'Earth climate science', url: '/jupiter/read/article/a1', snippet: 'Climate observations', source: 'earth', kind: 'article', domain: 'EARTH', content: 'full text' },
  { id: 'irrelevant', title: 'A distant topic', url: 'https://unrelated.example/page', snippet: '', source: 'web', kind: 'web', domain: 'unrelated.example' }
];
const ranked = mergeAndRankJupiterResults('earth climate', external);
assert.equal(ranked.length, 2, 'Tracking variants and duplicate fragments should collapse, and irrelevant results should be omitted.');
assert.equal(ranked[0].source, 'earth', 'Matching EARTH index content should be prioritized.');
assert.ok(ranked.some(result => result.url.includes('example.org/story')));

cacheJupiterSearch('test-query', ranked, 1000);
const cached = getCachedJupiterSearch('test-query', 1001);
assert.deepEqual(cached, ranked);
assert.notEqual(cached, ranked, 'Cache reads should return a separate result array.');
assert.equal(getCachedJupiterSearch('test-query', 62_000), null, 'Search cache entries should expire.');
console.log('JUPITER search index, route state, content lookup, demo-data exclusion, dedupe, ranking and cache: 18 passed, 0 failed.');
