import assert from 'node:assert/strict';
import {
  cacheJupiterSearch,
  getJupiterEarthContent,
  getCachedJupiterSearch,
  mergeAndRankJupiterResults,
  searchEarthAudio,
  searchEarthImages,
  searchEarthIndex
} from '../server/jupiterSearch.ts';
import { parseGoogleCategoryResults, parseGoogleImageResults } from '../server/webFetcher.ts';
import { buildJupiterSearchRoute, parseJupiterSearchRoute } from '../src/components/browser/jupiterSearchRoute.ts';

const searchRoute = buildJupiterSearchRoute('climate change NASA', 'duckduckgo', 'zh');
assert.equal(searchRoute, '/jupiter/search?q=climate+change+NASA&engine=duckduckgo&lang=zh');
assert.deepEqual(parseJupiterSearchRoute(searchRoute), {
  query: 'climate change NASA', engine: 'duckduckgo', lang: 'zh', category: 'all', page: 1
});
assert.deepEqual(
  parseJupiterSearchRoute(buildJupiterSearchRoute('aurora', 'auto', 'en', 'images', 2)),
  { query: 'aurora', engine: 'auto', lang: 'en', category: 'images', page: 2 }
);
assert.deepEqual(parseJupiterSearchRoute('/jupiter/search?q=space+weather&engine=unknown&lang=xx'), {
  query: 'space weather', engine: 'auto', lang: 'en', category: 'all', page: 1
});
assert.equal(parseJupiterSearchRoute('/jupiter/search?q=aurora&page=0')?.page, 1);
assert.equal(parseJupiterSearchRoute('/jupiter/search'), null);
assert.equal(parseJupiterSearchRoute('/jupiter/watch/video-1'), null);
assert.equal(parseJupiterSearchRoute('/jupiter/search?q=aurora&type=academic')?.category, 'academic');
const parsedImages = parseGoogleImageResults({
  images: [
    { title: 'Aurora over Earth', imageUrl: 'https://images.example/aurora?id=1', link: 'https://photos.example/aurora', thumbnailUrl: 'https://thumbs.example/aurora', imageWidth: 1200, imageHeight: 800 },
    { title: 'Invalid source', imageUrl: 'javascript:alert(1)', link: 'https://photos.example/invalid' }
  ]
});
assert.equal(parsedImages.length, 1, 'Image search should reject non-HTTP media and preserve source metadata.');
assert.equal(parsedImages[0].url, 'https://images.example/aurora?id=1');
assert.equal(parsedImages[0].sourceUrl, 'https://photos.example/aurora');
assert.equal(parsedImages[0].category, 'images');

const earthImages = searchEarthImages('aurora', {
  articles: [], videos: [], books: [],
  posts: [
    { id: 'public-image', content: 'Aurora over the northern horizon', mediaUrl: 'https://earth.example/aurora.jpg', mediaType: 'image/jpeg' },
    { id: 'not-image', content: 'Aurora video', mediaUrl: 'https://earth.example/aurora.mp4', mediaType: 'video/mp4' }
  ]
});
assert.equal(earthImages.length, 1, 'Image search should only include actual indexed image media.');
assert.equal(earthImages[0].url, 'https://earth.example/aurora.jpg');
const earthAudio = searchEarthAudio('podcast', {
  articles: [], videos: [], books: [],
  posts: [
    { id: 'public-audio', content: 'Climate podcast interview', mediaUrl: 'https://earth.example/episode.mp3', mediaType: 'audio/mpeg' },
    { id: 'not-audio', content: 'Climate article', mediaUrl: 'https://earth.example/article', mediaType: 'text/html' }
  ]
});
assert.equal(earthAudio.length, 1, 'Audio search should only include actual indexed audio media.');
assert.equal(earthAudio[0].url, 'https://earth.example/episode.mp3');

const videoResults = parseGoogleCategoryResults({
  videos: [
    { title: 'Aurora documentary', link: 'https://video.example/watch/1', description: 'Aurora from orbit', imageUrl: 'https://thumb.example/video.jpg', duration: '8:20' },
    { title: 'Unsafe', link: 'javascript:alert(1)' }
  ]
}, 'videos');
assert.equal(videoResults.length, 1);
assert.equal(videoResults[0].category, 'videos');
assert.equal(videoResults[0].thumbnailUrl, 'https://thumb.example/video.jpg');
assert.equal(videoResults[0].duration, '8:20');
const newsResults = parseGoogleCategoryResults({ news: [{ title: 'Climate update', link: 'https://news.example/story', snippet: 'Latest report', date: 'Today' }] }, 'news');
assert.equal(newsResults[0].date, 'Today');
assert.equal(parseGoogleCategoryResults({ organic: [{ title: 'PDF', link: 'https://docs.example/report.pdf' }, { title: 'HTML', link: 'https://docs.example/page' }] }, 'pdf').length, 1);
assert.equal(parseGoogleCategoryResults({ organic: [{ title: 'Audio', link: 'https://media.example/episode.mp3' }] }, 'audio').length, 1);
assert.equal(parseGoogleCategoryResults({ organic: [{ title: 'Open book', link: 'https://openlibrary.org/works/1' }, { title: 'Other', link: 'https://unknown.example/book' }] }, 'books').length, 1);
assert.equal(parseGoogleCategoryResults({ organic: [{ title: 'Paper', link: 'https://papers.example/research', publicationInfo: 'Journal of Science' }] }, 'academic')[0].category, 'academic');

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
console.log('JUPITER search index, media categories, route state, content lookup, demo-data exclusion, dedupe, ranking and cache: 38 passed, 0 failed.');
