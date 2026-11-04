import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

const ALLOWED_ENDPOINTS = new Set(['/api/ai/models', '/api/ai/stats']);

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
  const testDir = fs.mkdtempSync(path.join(tmpdir(), 'earth-one-ai-api-test-'));
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
    let modelResponse: Awaited<ReturnType<typeof get>> | undefined;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Isolated API server exited early.\n${childOutput}`);
      try {
        modelResponse = await get('/api/ai/models');
        if (modelResponse.status === 200) break;
      } catch {
        await sleep(250);
      }
    }

    check(
      modelResponse?.status === 200 && modelResponse.body.success === true,
      'AI model catalog becomes ready from the isolated server'
    );
    const models = modelResponse?.body.models;
    check(Array.isArray(models) && models.length > 0, 'AI model catalog returns a non-empty collection');
    check(
      Array.isArray(models) && models.every((model: any) =>
        typeof model.id === 'string' && model.id.length > 0 &&
        typeof model.name === 'string' && model.name.length > 0 &&
        typeof model.provider === 'string' && model.provider.length > 0 &&
        typeof model.category === 'string' && model.category.length > 0 &&
        typeof model.status === 'string' &&
        typeof model.isDefault === 'boolean' &&
        Number.isFinite(model.totalCalls) && model.totalCalls >= 0 &&
        Number.isFinite(model.totalTokens) && model.totalTokens >= 0 &&
        Number.isFinite(model.averageLatencyMs) && model.averageLatencyMs >= 0 &&
        typeof model.apiKeyMasked === 'string'
      ),
      'AI model catalog entries preserve their metadata and usage field types'
    );
    check(
      Array.isArray(models) && new Set(models.map((model: any) => model.id)).size === models.length,
      'AI model catalog identifiers are unique'
    );
    check(
      Array.isArray(models) && models.every((model: any) =>
        model.status === 'unconfigured' && model.apiKeyMasked === 'Not Configured'
      ),
      'AI credentials remain disabled and masked in the isolated test process'
    );

    const stats = await get('/api/ai/stats');
    check(
      stats.status === 200 && stats.body.success === true &&
      Number.isFinite(stats.body.totalCalls) && stats.body.totalCalls >= 0 &&
      Number.isFinite(stats.body.totalTokens) && stats.body.totalTokens >= 0 &&
      Array.isArray(stats.body.models),
      'AI statistics expose numeric usage totals and model metadata'
    );
    check(
      Array.isArray(models) && Array.isArray(stats.body.models) &&
      stats.body.totalCalls === models.reduce((total: number, model: any) => total + model.totalCalls, 0) &&
      stats.body.totalTokens === models.reduce((total: number, model: any) => total + model.totalTokens, 0),
      'AI statistics totals match the per-model counters'
    );
    check(
      Array.isArray(models) && Array.isArray(stats.body.models) &&
      stats.body.models.length === models.length &&
      stats.body.models.every((model: any, index: number) =>
        model.id === models[index].id &&
        model.totalCalls === models[index].totalCalls &&
        model.totalTokens === models[index].totalTokens
      ),
      'AI statistics and model catalog report consistent model counters'
    );
    check(
      requested.length >= 2 &&
      requested.some(request => request.endpoint === '/api/ai/models') &&
      requested.some(request => request.endpoint === '/api/ai/stats') &&
      requested.every(request => ALLOWED_ENDPOINTS.has(request.endpoint) && request.method === 'GET'),
      'Test requested only the two allowlisted AI metadata endpoints with GET'
    );
    console.log(`AI API regression: ${passed} passed, 0 failed (GET only; no model calls; isolated temporary storage).`);
  } catch (error) {
    console.error('AI API regression failed:', error);
    if (childOutput) console.error('Temporary server output:\n' + childOutput);
    throw error;
  } finally {
    await stopServer();
  }
}

main().catch(() => { process.exitCode = 1; });
