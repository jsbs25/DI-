import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

const ALLOWED_ENDPOINTS = new Set([
  '/api/posts',
  '/api/posts?feed=latest',
  '/api/posts?feed=trending',
  '/api/posts?country=JO',
  '/api/posts?country=jo',
  '/api/posts?category=life',
  '/api/posts?category=all',
  '/api/posts?country=ALL',
  '/api/posts?country=RU&category=life',
  '/api/posts?search=fontanka'
]);

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
  const testDir = fs.mkdtempSync(path.join(tmpdir(), 'earth-one-social-feed-api-test-'));
  const dataFile = path.join(testDir, 'server_data.json');
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
    assert.ok(ALLOWED_ENDPOINTS.has(endpoint), `Unexpected endpoint blocked by test: ${endpoint}`);
    requested.push({ endpoint, method: 'GET' });
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(5000)
    });
    return { status: response.status, body: await response.json() as any };
  }

  try {
    let globalResponse: Awaited<ReturnType<typeof get>> | undefined;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Isolated API server exited early.\n${childOutput}`);
      try {
        globalResponse = await get('/api/posts');
        if (globalResponse.status === 200) break;
      } catch {
        await sleep(250);
      }
    }

    check(
      globalResponse?.status === 200 && globalResponse.body.success === true,
      'Public global feed becomes ready and returns a successful response'
    );
    const globalPosts = globalResponse?.body.posts;
    check(Array.isArray(globalPosts) && globalPosts.length === 4, 'Global feed returns the four isolated seed posts');
    check(
      Array.isArray(globalPosts) && globalPosts.every((post: any) =>
        typeof post.id === 'string' && post.id.length > 0 &&
        typeof post.userId === 'string' &&
        typeof post.author?.id === 'string' &&
        typeof post.author?.displayName === 'string' &&
        typeof post.author?.username === 'string' &&
        typeof post.content === 'string' && post.content.length > 0 &&
        typeof post.countryCode === 'string' &&
        typeof post.countryName === 'string' &&
        typeof post.cityName === 'string' &&
        typeof post.category === 'string' &&
        Number.isInteger(post.likesCount) && post.likesCount >= 0 &&
        Number.isInteger(post.commentsCount) && post.commentsCount >= 0 &&
        Number.isFinite(Date.parse(post.createdAt))
      ),
      'Every feed item preserves the public post, author, location, engagement, and timestamp fields'
    );
    const globalIds = globalPosts.map((post: any) => post.id);
    check(new Set(globalIds).size === globalIds.length, 'Global feed post identifiers are unique');
    check(
      ['post_1', 'post_2', 'post_3', 'post_4'].every(id => globalIds.includes(id)),
      'Existing seeded feed entries remain present'
    );

    const latestResponse = await get('/api/posts?feed=latest');
    const latestPosts = latestResponse.body.posts;
    check(latestResponse.status === 200 && latestResponse.body.success === true, 'Latest feed returns a successful response');
    check(
      latestPosts.map((post: any) => post.id).join(',') === 'post_1,post_2,post_3,post_4',
      'Latest feed orders posts by descending creation time'
    );
    check(
      latestPosts.every((post: any, index: number) =>
        index === 0 || Date.parse(latestPosts[index - 1].createdAt) >= Date.parse(post.createdAt)
      ),
      'Latest feed timestamps are monotonically non-increasing'
    );

    const trendingResponse = await get('/api/posts?feed=trending');
    const trendingPosts = trendingResponse.body.posts;
    check(trendingResponse.status === 200 && trendingResponse.body.success === true, 'Trending feed returns a successful response');
    check(
      trendingPosts.map((post: any) => post.id).join(',') === 'post_3,post_2,post_4,post_1',
      'Trending feed orders seeded posts by descending likes and comments'
    );
    check(
      trendingPosts.every((post: any, index: number) =>
        index === 0 ||
        trendingPosts[index - 1].likesCount + trendingPosts[index - 1].commentsCount >= post.likesCount + post.commentsCount
      ),
      'Trending feed engagement scores are monotonically non-increasing'
    );

    const jordanUpper = await get('/api/posts?country=JO');
    const jordanLower = await get('/api/posts?country=jo');
    check(
      jordanUpper.status === 200 && jordanUpper.body.posts.length === 1 && jordanUpper.body.posts[0].id === 'post_2',
      'Country filter returns the matching Jordan post'
    );
    check(
      jordanLower.status === 200 && jordanLower.body.posts.length === 1 && jordanLower.body.posts[0].id === 'post_2',
      'Country filter matches country codes case-insensitively'
    );

    const lifeResponse = await get('/api/posts?category=life');
    check(
      lifeResponse.status === 200 && lifeResponse.body.posts.map((post: any) => post.id).join(',') === 'post_2,post_4',
      'Category filter returns only life posts'
    );
    const allCategoryResponse = await get('/api/posts?category=all');
    const allCountryResponse = await get('/api/posts?country=ALL');
    check(
      allCategoryResponse.status === 200 && allCategoryResponse.body.posts.length === globalPosts.length,
      'The all-category option preserves the complete feed'
    );
    check(
      allCountryResponse.status === 200 && allCountryResponse.body.posts.length === globalPosts.length,
      'The ALL-country option preserves the complete feed'
    );

    const combinedResponse = await get('/api/posts?country=RU&category=life');
    check(
      combinedResponse.status === 200 && combinedResponse.body.posts.length === 1 && combinedResponse.body.posts[0].id === 'post_4',
      'Country and category filters compose without broadening the result'
    );
    const searchResponse = await get('/api/posts?search=fontanka');
    check(
      searchResponse.status === 200 && searchResponse.body.posts.length === 1 && searchResponse.body.posts[0].id === 'post_4',
      'Text search matches post content without case sensitivity'
    );
    check(
      [...ALLOWED_ENDPOINTS].every(endpoint => requested.some(request => request.endpoint === endpoint)) &&
      requested.every(request => ALLOWED_ENDPOINTS.has(request.endpoint) && request.method === 'GET'),
      'Test issued only GET requests to the allowlisted public post-feed queries'
    );

    console.log(`Social feed API regression: ${passed} passed, 0 failed (public posts only; GET only; isolated temporary storage).`);
  } catch (error) {
    console.error('Social feed API regression failed:', error);
    if (childOutput) console.error('Temporary server output:\n' + childOutput);
    throw error;
  } finally {
    await stopServer();
  }
}

main().catch(() => { process.exitCode = 1; });
