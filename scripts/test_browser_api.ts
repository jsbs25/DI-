import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

const ALLOWED_ENDPOINTS = new Set([
  '/api/browser/bookmarks',
  '/api/browser/saved-articles'
]);

const syntheticUser = {
  id: 'user_browser_api_probe',
  username: 'browser_api_probe',
  displayName: 'Browser API Probe',
  avatar: 'https://example.test/avatar.png',
  bio: 'Synthetic fixture used only by the isolated browser API regression.',
  location: {
    countryCode: 'JO',
    countryName: 'Jordan',
    cityName: 'Amman',
    lat: 31.9454,
    lng: 35.9284,
    isPublic: false
  },
  interests: ['Testing'],
  followersCount: 0,
  followingCount: 0,
  tipsReceived: 0,
  isOnline: false,
  verified: false,
  joinedAt: '2026-01-01'
};

const syntheticBookmarks = [
  {
    id: 'bm_browser_probe_1',
    title: 'Synthetic Earth research bookmark',
    url: 'https://example.test/earth-research',
    category: 'Research',
    createdAt: '2026-10-01T12:00:00.000Z'
  },
  {
    id: 'bm_browser_probe_2',
    title: 'Synthetic public archive bookmark',
    url: 'https://example.test/public-archive',
    category: 'Library',
    createdAt: '2026-10-02T12:00:00.000Z'
  }
];

const syntheticSavedArticles = [
  {
    id: 'saved_browser_probe_1',
    url: 'https://example.test/field-notes',
    title: 'Synthetic field notes',
    author: 'Synthetic Researcher',
    content: 'A local fixture body; no external page is fetched.',
    aiSummary: 'Synthetic summary for read-only API contract verification.',
    savedAt: '2026-10-03T12:00:00.000Z'
  }
];

async function getAvailablePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to reserve a local port.');
  await new Promise<void>(resolve => server.close(() => resolve()));
  return address.port;
}

async function main() {
  const testDir = fs.mkdtempSync(path.join(tmpdir(), 'earth-one-browser-api-test-'));
  const dataFile = path.join(testDir, 'server_data.json');
  fs.writeFileSync(dataFile, JSON.stringify({
    users: [syntheticUser],
    currentUser: syntheticUser,
    browserBookmarks: syntheticBookmarks,
    savedArticles: syntheticSavedArticles,
    accounts: {},
    sessions: {}
  }), 'utf-8');

  let childOutput = '';
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      EARTH_ONE_DATA_FILE: dataFile,
      EARTH_ONE_SKIP_BOOK_HARVEST: 'true',
      GEMINI_API_KEY: '',
      OPENAI_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      DEEPSEEK_API_KEY: '',
      CUSTOM_API_KEY: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.on('error', error => { childOutput = `${childOutput}\n${error.message}`.slice(-12000); });
  child.stdout?.on('data', chunk => { childOutput = (childOutput + chunk.toString()).slice(-12000); });
  child.stderr?.on('data', chunk => { childOutput = (childOutput + chunk.toString()).slice(-12000); });

  async function stopServer() {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await Promise.race([exited, sleep(3000)]);
      if (child.exitCode === null && child.signalCode === null) {
        const forcedExit = once(child, 'exit');
        child.kill('SIGKILL');
        await forcedExit;
      }
    }
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  let passed = 0;
  const requested: Array<{ endpoint: string; method: string }> = [];
  function check(condition: unknown, label: string) {
    assert.ok(condition, label);
    passed += 1;
  }

  async function get(endpoint: string) {
    const url = new URL(endpoint, baseUrl);
    const route = `${url.pathname}${url.search}`;
    assert.ok(ALLOWED_ENDPOINTS.has(route), `Unexpected endpoint blocked by test: ${route}`);
    requested.push({ endpoint: route, method: 'GET' });
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(5000)
    });
    return { status: response.status, body: await response.json() as any };
  }

  try {
    let bookmarksResponse: Awaited<ReturnType<typeof get>> | undefined;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Isolated API server exited early.\n${childOutput}`);
      try {
        bookmarksResponse = await get('/api/browser/bookmarks');
        if (bookmarksResponse.status === 200) break;
      } catch {
        await sleep(250);
      }
    }

    check(
      bookmarksResponse?.status === 200 && bookmarksResponse.body.success === true,
      'Bookmark list becomes ready and returns a successful response from isolated storage'
    );
    const bookmarks = bookmarksResponse?.body.bookmarks;
    check(Array.isArray(bookmarks) && bookmarks.length === syntheticBookmarks.length,
      'Bookmark list returns the synthetic fixture collection');
    check(
      Array.isArray(bookmarks) && bookmarks.every((bookmark: any) =>
        typeof bookmark.id === 'string' && bookmark.id.length > 0 &&
        typeof bookmark.title === 'string' && bookmark.title.length > 0 &&
        typeof bookmark.url === 'string' && /^https:\/\/example\.test\//.test(bookmark.url) &&
        typeof bookmark.category === 'string' && bookmark.category.length > 0 &&
        typeof bookmark.createdAt === 'string' && Number.isFinite(Date.parse(bookmark.createdAt))
      ),
      'Every bookmark preserves its identity, display, URL, category, and timestamp fields'
    );
    const bookmarkIds = new Set<string>((bookmarks || []).map((bookmark: any) => bookmark.id));
    check(bookmarkIds.size === (bookmarks?.length || 0), 'Bookmark identifiers are unique');
    check(
      bookmarkIds.has('bm_browser_probe_1') && bookmarkIds.has('bm_browser_probe_2'),
      'Both synthetic bookmarks are returned without creating or changing bookmark state'
    );
    const repeatedBookmarksResponse = await get('/api/browser/bookmarks');
    check(
      repeatedBookmarksResponse.status === bookmarksResponse?.status &&
      JSON.stringify(repeatedBookmarksResponse.body) === JSON.stringify(bookmarksResponse?.body),
      'Repeated bookmark-list GETs return an identical status and JSON response'
    );

    const articlesResponse = await get('/api/browser/saved-articles');
    check(
      articlesResponse.status === 200 && articlesResponse.body.success === true,
      'Saved-article list returns a successful response'
    );
    const articles = articlesResponse.body.articles;
    check(Array.isArray(articles) && articles.length === syntheticSavedArticles.length,
      'Saved-article list returns the synthetic fixture collection');
    check(
      Array.isArray(articles) && articles.every((article: any) =>
        typeof article.id === 'string' && article.id.length > 0 &&
        typeof article.url === 'string' && /^https:\/\/example\.test\//.test(article.url) &&
        typeof article.title === 'string' && article.title.length > 0 &&
        typeof article.author === 'string' &&
        typeof article.content === 'string' && article.content.length > 0 &&
        typeof article.aiSummary === 'string' &&
        typeof article.savedAt === 'string' && Number.isFinite(Date.parse(article.savedAt))
      ),
      'Every saved article preserves its content, attribution, summary, URL, and saved timestamp fields'
    );
    check(
      articles[0]?.id === 'saved_browser_probe_1' && articles[0]?.title === 'Synthetic field notes',
      'Synthetic saved-article identity and title are preserved'
    );
    const repeatedArticlesResponse = await get('/api/browser/saved-articles');
    check(
      repeatedArticlesResponse.status === articlesResponse.status &&
      JSON.stringify(repeatedArticlesResponse.body) === JSON.stringify(articlesResponse.body),
      'Repeated saved-article GETs return an identical status and JSON response'
    );
    check(
      [...ALLOWED_ENDPOINTS].every(endpoint => requested.filter(request => request.endpoint === endpoint).length >= 2) &&
      requested.every(request => ALLOWED_ENDPOINTS.has(request.endpoint) && request.method === 'GET'),
      'Test issued only GET requests to the allowlisted bookmark and saved-article list endpoints'
    );

    console.log(`Browser API regression: ${passed} passed, 0 failed (synthetic temporary storage; bookmark and saved-article lists; GET only).`);
  } catch (error) {
    console.error('Browser API regression failed:', error);
    if (childOutput) console.error('Temporary server output:\n' + childOutput);
    throw error;
  } finally {
    await stopServer();
  }
}

main().catch(() => { process.exitCode = 1; });
