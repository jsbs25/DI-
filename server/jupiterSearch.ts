import type { SearchResult } from './webFetcher.ts';

export type JupiterContentKind = 'web' | 'article' | 'video' | 'book' | 'post';
export type JupiterResult = Omit<SearchResult, 'source'> & {
  id: string;
  source: 'web' | 'github' | 'earth';
  kind: JupiterContentKind;
  domain: string;
  content?: string;
};

interface SearchableRecord {
  id: string;
  title: string;
  content: string;
  kind: Extract<JupiterContentKind, 'article' | 'video' | 'book' | 'post'>;
  url?: string;
}

export interface SearchableStore {
  articles: Array<{ id: string; title: string; summary?: string; content?: string }>;
  videos: Array<{ id: string; title: string; description?: string; videoUrl?: string; thumbnailUrl?: string; duration?: string; creator?: { displayName?: string; username?: string } }>;
  books: Array<{ id: string; title: string; author?: string; description?: string; content?: string; chapters?: Array<{ title?: string; content?: string }> }>;
  posts: Array<{ id: string; content: string; mediaUrl?: string; mediaType?: string; author?: { displayName?: string; username?: string }; createdAt?: string }>;
}

export interface JupiterEarthContent {
  id: string;
  kind: Exclude<JupiterContentKind, 'web'>;
  title: string;
  content: string;
  summary?: string;
  author?: string;
  mediaUrl?: string;
  mediaType?: string;
  thumbnailUrl?: string;
  duration?: string;
  chapters?: Array<{ title: string; content: string }>;
  createdAt?: string;
}

const DEMO_RECORD_IDS = new Set([
  'art_1', 'art_2',
  'vid_1', 'vid_2',
  'post_1', 'post_2', 'post_3', 'post_4',
  'book_republic', 'book_copernicus', 'book_pride', 'book_daodejing'
]);
const SEARCH_CACHE_TTL_MS = 60_000;
const SEARCH_CACHE_MAX_ENTRIES = 100;
const searchCache = new Map<string, { expiresAt: number; results: JupiterResult[] }>();

function normalizedUrlKey(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|gclid|fbclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

function tokenize(value: string): string[] {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
}

function relevanceScore(result: JupiterResult, queryTokens: Set<string>): number {
  const titleTokens = new Set(tokenize(result.title));
  const snippetTokens = new Set(tokenize(result.snippet));
  let score = result.source === 'earth' ? 8 : 0;
  for (const token of queryTokens) {
    if (titleTokens.has(token)) score += 4;
    if (snippetTokens.has(token)) score += 1;
  }
  return score;
}

export function mergeAndRankJupiterResults(query: string, inputs: JupiterResult[], limit = 20): JupiterResult[] {
  const queryTokens = new Set(tokenize(query));
  const deduped = new Map<string, JupiterResult>();

  for (const result of inputs) {
    if (!result.url || !result.title) continue;
    const key = normalizedUrlKey(result.url);
    const current = deduped.get(key);
    if (!current || (result.source === 'earth' && current.source !== 'earth')) deduped.set(key, result);
  }

  return [...deduped.values()]
    .map((result, index) => ({ result, index, score: relevanceScore(result, queryTokens) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ result }) => result);
}

export function searchEarthIndex(query: string, store: SearchableStore, limit = 10): JupiterResult[] {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const records: SearchableRecord[] = [
    ...store.articles.filter(article => !DEMO_RECORD_IDS.has(article.id)).map(article => ({
      id: article.id,
      title: article.title,
      content: `${article.summary || ''}\n${article.content || ''}`,
      kind: 'article' as const,
      url: `/jupiter/read/article/${encodeURIComponent(article.id)}`
    })),
    ...store.videos.filter(video => !DEMO_RECORD_IDS.has(video.id)).map(video => ({
      id: video.id,
      title: video.title,
      content: `${video.description || ''}\n${video.videoUrl || ''}`,
      kind: 'video' as const,
      url: `/jupiter/watch/${encodeURIComponent(video.id)}`
    })),
    ...store.books.filter(book => !DEMO_RECORD_IDS.has(book.id)).map(book => ({
      id: book.id,
      title: book.title,
      content: `${book.author || ''}\n${book.description || ''}\n${book.content || ''}\n${book.chapters?.map(chapter => `${chapter.title || ''}\n${chapter.content || ''}`).join('\n') || ''}`,
      kind: 'book' as const,
      url: `/jupiter/read/book/${encodeURIComponent(book.id)}`
    })),
    ...store.posts.filter(post => !DEMO_RECORD_IDS.has(post.id)).map(post => ({
      id: post.id,
      title: post.content.slice(0, 100),
      content: `${post.content}\n${post.mediaUrl || ''}`,
      kind: 'post' as const,
      url: `/jupiter/read/post/${encodeURIComponent(post.id)}`
    }))
  ];

  return records
    .map(record => {
      const titleTerms = new Set(tokenize(record.title));
      const contentTerms = new Set(tokenize(record.content));
      const matched = terms.filter(term => titleTerms.has(term) || contentTerms.has(term)).length;
      const titleMatches = terms.filter(term => titleTerms.has(term)).length;
      return { record, score: matched / terms.length + titleMatches * 0.5 };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ record }) => ({
      id: `earth:${record.kind}:${record.id}`,
      title: record.title,
      url: record.url || `/jupiter/read/${encodeURIComponent(record.id)}`,
      snippet: record.content.replace(/\s+/g, ' ').trim().slice(0, 280),
      source: 'earth',
      kind: record.kind,
      domain: 'EARTH',
      content: record.content.trim().slice(0, 20_000)
    }));
}

export function getJupiterEarthContent(
  kind: JupiterEarthContent['kind'],
  id: string,
  store: SearchableStore
): JupiterEarthContent | null {
  if (DEMO_RECORD_IDS.has(id)) return null;

  if (kind === 'article') {
    const article = store.articles.find(item => item.id === id);
    if (!article) return null;
    return { id, kind, title: article.title, content: article.content || '', summary: article.summary };
  }
  if (kind === 'video') {
    const video = store.videos.find(item => item.id === id);
    if (!video) return null;
    return {
      id, kind, title: video.title, content: video.description || '',
      author: video.creator?.displayName || video.creator?.username,
      mediaUrl: video.videoUrl, thumbnailUrl: video.thumbnailUrl, duration: video.duration
    };
  }
  if (kind === 'book') {
    const book = store.books.find(item => item.id === id);
    if (!book) return null;
    return {
      id, kind, title: book.title, content: book.description || book.content || '',
      author: book.author,
      chapters: book.chapters?.map(chapter => ({ title: chapter.title || 'Chapter', content: chapter.content || '' }))
    };
  }
  const post = store.posts.find(item => item.id === id);
  if (!post) return null;
  return {
    id, kind, title: post.content.slice(0, 100), content: post.content,
    author: post.author?.displayName || post.author?.username,
    mediaUrl: post.mediaUrl, mediaType: post.mediaType, createdAt: post.createdAt
  };
}

export function getCachedJupiterSearch(key: string, now = Date.now()): JupiterResult[] | null {
  const cached = searchCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= now) {
    searchCache.delete(key);
    return null;
  }
  return cached.results.map(result => ({ ...result }));
}

export function cacheJupiterSearch(key: string, results: JupiterResult[], now = Date.now()): void {
  if (searchCache.size >= SEARCH_CACHE_MAX_ENTRIES && !searchCache.has(key)) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) searchCache.delete(oldestKey);
  }
  searchCache.set(key, { expiresAt: now + SEARCH_CACHE_TTL_MS, results: results.map(result => ({ ...result })) });
}
