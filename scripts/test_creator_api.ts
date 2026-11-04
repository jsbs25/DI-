import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

const ALLOWED_ENDPOINTS = new Set(['/api/articles', '/api/videos']);

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
  const testDir = fs.mkdtempSync(path.join(tmpdir(), 'earth-one-creator-api-test-'));
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
    let articlesResponse: Awaited<ReturnType<typeof get>> | undefined;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Isolated API server exited early.\n${childOutput}`);
      try {
        articlesResponse = await get('/api/articles');
        if (articlesResponse.status === 200) break;
      } catch {
        await sleep(250);
      }
    }

    check(
      articlesResponse?.status === 200 && articlesResponse.body.success === true,
      'Article catalog becomes ready and returns a successful response from isolated storage'
    );
    const articles = articlesResponse?.body.articles;
    check(Array.isArray(articles) && articles.length > 0, 'Article catalog returns a non-empty collection');
    check(
      Array.isArray(articles) && articles.every((article: any) =>
        typeof article.id === 'string' && article.id.length > 0 &&
        typeof article.authorId === 'string' &&
        typeof article.author?.displayName === 'string' &&
        typeof article.author?.username === 'string' &&
        typeof article.title === 'string' && article.title.length > 0 &&
        typeof article.summary === 'string' &&
        typeof article.content === 'string' && article.content.length > 0 &&
        typeof article.coverUrl === 'string' && /^https?:\/\//.test(article.coverUrl) &&
        typeof article.category === 'string' &&
        typeof article.readTime === 'string' &&
        Number.isFinite(article.clapsCount) &&
        Number.isFinite(article.tipsTotal) &&
        Number.isFinite(Date.parse(article.createdAt))
      ),
      'Every article preserves its author, content, display, engagement, and timestamp fields'
    );
    const articleIds = new Set<string>((articles || []).map((article: any) => article.id));
    check(articleIds.size === (articles?.length || 0), 'Article identifiers are unique');
    check(
      articleIds.has('art_1') && articleIds.has('art_2'),
      'Existing seeded creator articles remain present in the isolated catalog'
    );
    const repeatedArticlesResponse = await get('/api/articles');
    check(
      repeatedArticlesResponse.status === 200 && isDeepStrictEqual(repeatedArticlesResponse.body, articlesResponse?.body),
      'Repeated article catalog GET returns the same response without changing article data'
    );

    const videosResponse = await get('/api/videos');
    check(
      videosResponse.status === 200 && videosResponse.body.success === true,
      'Video catalog returns a successful response'
    );
    const videos = videosResponse.body.videos;
    check(Array.isArray(videos) && videos.length > 0, 'Video catalog returns a non-empty collection');
    check(
      Array.isArray(videos) && videos.every((video: any) =>
        typeof video.id === 'string' && video.id.length > 0 &&
        typeof video.creatorId === 'string' &&
        typeof video.creator?.displayName === 'string' &&
        typeof video.creator?.username === 'string' &&
        typeof video.title === 'string' && video.title.length > 0 &&
        typeof video.description === 'string' &&
        typeof video.videoUrl === 'string' && /^https?:\/\//.test(video.videoUrl) &&
        typeof video.thumbnailUrl === 'string' && /^https?:\/\//.test(video.thumbnailUrl) &&
        typeof video.duration === 'string' &&
        Number.isFinite(video.viewsCount) &&
        Number.isFinite(video.likesCount) &&
        typeof video.category === 'string' &&
        typeof video.countryName === 'string' &&
        Number.isFinite(Date.parse(video.createdAt))
      ),
      'Every video preserves its creator, media references, display, engagement, and timestamp fields without fetching media'
    );
    const videoIds = new Set<string>((videos || []).map((video: any) => video.id));
    check(videoIds.size === (videos?.length || 0), 'Video identifiers are unique');
    check(
      videoIds.has('vid_1') && videoIds.has('vid_2'),
      'Existing seeded video catalog entries remain present'
    );
    const repeatedVideosResponse = await get('/api/videos');
    check(
      repeatedVideosResponse.status === 200 && isDeepStrictEqual(repeatedVideosResponse.body, videosResponse.body),
      'Repeated video catalog GET returns the same response without changing video data'
    );
    check(
      [...ALLOWED_ENDPOINTS].every(endpoint => requested.some(request => request.endpoint === endpoint)) &&
      requested.every(request => ALLOWED_ENDPOINTS.has(request.endpoint) && request.method === 'GET'),
      'Test issued only GET requests to the allowlisted article/video catalog endpoints'
    );

    console.log(`Creator API regression: ${passed} passed, 0 failed (article/video catalogs only; GET only; isolated temporary storage).`);
  } catch (error) {
    console.error('Creator API regression failed:', error);
    if (childOutput) console.error('Temporary server output:\n' + childOutput);
    throw error;
  } finally {
    await stopServer();
  }
}

main().catch(() => { process.exitCode = 1; });
