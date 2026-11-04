import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

const ALLOWED_ENDPOINTS = new Set(['/api/crawler/tasks', '/api/crawler/pages']);
const TASK_STATUSES = new Set(['idle', 'running', 'completed', 'error']);
const PAGE_STATUSES = new Set(['pending_review', 'approved', 'rejected']);

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
  const testDir = fs.mkdtempSync(path.join(tmpdir(), 'earth-one-crawler-api-test-'));
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
    let tasksResponse: Awaited<ReturnType<typeof get>> | undefined;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Isolated API server exited early.\n${childOutput}`);
      try {
        tasksResponse = await get('/api/crawler/tasks');
        if (tasksResponse.status === 200) break;
      } catch {
        await sleep(250);
      }
    }

    check(
      tasksResponse?.status === 200 && tasksResponse.body.success === true,
      'Crawler task list becomes ready from isolated storage'
    );
    const tasks = tasksResponse?.body.tasks;
    check(Array.isArray(tasks) && tasks.length > 0, 'Crawler task list returns a non-empty collection');
    check(
      Array.isArray(tasks) && tasks.every((task: any) =>
        typeof task.id === 'string' && task.id.length > 0 &&
        typeof task.name === 'string' && task.name.length > 0 &&
        typeof task.targetDomain === 'string' && task.targetDomain.length > 0 &&
        typeof task.startUrl === 'string' && /^https?:\/\//.test(task.startUrl) &&
        Number.isInteger(task.maxPages) && task.maxPages > 0 &&
        TASK_STATUSES.has(task.status) &&
        Number.isInteger(task.pagesCrawled) && task.pagesCrawled >= 0 &&
        typeof task.respectsRobotsTxt === 'boolean'
      ),
      'Every task preserves its display, target, progress, status, and robots-policy fields'
    );
    const taskIds = new Set<string>((tasks || []).map((task: any) => task.id));
    check(taskIds.size === (tasks?.length || 0), 'Crawler task identifiers are unique');
    const repeatedTasksResponse = await get('/api/crawler/tasks');
    check(
      repeatedTasksResponse.status === 200 &&
      JSON.stringify(repeatedTasksResponse.body) === JSON.stringify(tasksResponse?.body),
      'Repeated crawler-task list GETs do not change task progress or status'
    );
    check(
      taskIds.has('task_nasa') && taskIds.has('task_gutenberg'),
      'Existing seeded public-source tasks remain present in the isolated catalog'
    );

    const pagesResponse = await get('/api/crawler/pages');
    check(
      pagesResponse.status === 200 && pagesResponse.body.success === true,
      'Crawled-page list returns a successful response'
    );
    const pages = pagesResponse.body.pages;
    check(Array.isArray(pages) && pages.length > 0, 'Crawled-page list returns a non-empty collection');
    check(
      Array.isArray(pages) && pages.every((page: any) =>
        typeof page.id === 'string' && page.id.length > 0 &&
        typeof page.taskId === 'string' &&
        typeof page.url === 'string' && /^https?:\/\//.test(page.url) &&
        typeof page.title === 'string' && page.title.length > 0 &&
        typeof page.author === 'string' &&
        typeof page.cleanContent === 'string' && page.cleanContent.length > 0 &&
        Number.isFinite(Date.parse(page.crawledAt)) &&
        PAGE_STATUSES.has(page.status)
      ),
      'Every stored page preserves its source, content, timestamp, and review status fields'
    );
    const pageIds = new Set<string>((pages || []).map((page: any) => page.id));
    check(pageIds.size === (pages?.length || 0), 'Crawled-page identifiers are unique');
    check(
      pages.every((page: any) => taskIds.has(page.taskId)),
      'Every listed page references an existing crawler task'
    );
    check(
      pages.some((page: any) => page.id === 'page_nasa_01' && page.taskId === 'task_nasa' &&
        page.status === 'pending_review'),
      'Existing pending-review sample remains linked to its source task without approving or changing it'
    );
    const repeatedPagesResponse = await get('/api/crawler/pages');
    check(
      repeatedPagesResponse.status === 200 &&
      JSON.stringify(repeatedPagesResponse.body) === JSON.stringify(pagesResponse.body),
      'Repeated crawled-page list GETs do not change stored page or review state'
    );
    check(
      [...ALLOWED_ENDPOINTS].every(endpoint => requested.some(request => request.endpoint === endpoint)) &&
      requested.every(request => ALLOWED_ENDPOINTS.has(request.endpoint) && request.method === 'GET'),
      'Test issued only GET requests to the allowlisted crawler task/page endpoints'
    );

    console.log(`Crawler API regression: ${passed} passed, 0 failed (task/page lists only; GET only; isolated temporary storage).`);
  } catch (error) {
    console.error('Crawler API regression failed:', error);
    if (childOutput) console.error('Temporary server output:\n' + childOutput);
    throw error;
  } finally {
    await stopServer();
  }
}

main().catch(() => { process.exitCode = 1; });
