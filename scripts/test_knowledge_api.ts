import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

const ALLOWED_FIXED_ENDPOINTS = new Set([
  '/api/knowledge/nodes',
  '/api/knowledge/nodes?country=sa',
  '/api/knowledge/search?q=Avicenna',
  '/api/knowledge/search?q=Islamic&category=civilization',
  '/api/knowledge/search?q=no-such-earth-one-node-9f31',
  '/api/knowledge/nodes/not-a-real-node'
]);
const ALLOWED_NODE_TYPES = new Set([
  'civilization', 'historical_period', 'person', 'place', 'language', 'book',
  'scientific_concept', 'thought', 'artwork', 'historical_event'
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
  const testDir = fs.mkdtempSync(path.join(tmpdir(), 'earth-one-knowledge-api-test-'));
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
  const allowedNodeIds = new Set<string>();
  const requested: Array<{ endpoint: string; method: string }> = [];
  function check(condition: unknown, label: string) {
    assert.ok(condition, label);
    passed += 1;
  }

  async function get(endpoint: string) {
    const url = new URL(endpoint, baseUrl);
    const fixedEndpoint = `${url.pathname}${url.search}`;
    const isKnownNodeDetail = /^\/api\/knowledge\/nodes\/[A-Za-z0-9_-]+$/.test(url.pathname) &&
      !url.search && allowedNodeIds.has(decodeURIComponent(url.pathname.split('/').at(-1) || ''));
    assert.ok(
      ALLOWED_FIXED_ENDPOINTS.has(fixedEndpoint) || isKnownNodeDetail,
      `Unexpected endpoint blocked by test: ${fixedEndpoint}`
    );
    requested.push({ endpoint: fixedEndpoint, method: 'GET' });
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(5000)
    });
    return { status: response.status, body: await response.json() as any };
  }

  try {
    let catalog: Awaited<ReturnType<typeof get>> | undefined;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Isolated API server exited early.\n${childOutput}`);
      try {
        catalog = await get('/api/knowledge/nodes');
        if (catalog.status === 200) break;
      } catch {
        await sleep(250);
      }
    }

    check(catalog?.status === 200 && catalog.body.success === true, 'Knowledge graph catalog becomes ready from isolated storage');
    const nodes = catalog?.body.nodes;
    check(Array.isArray(nodes) && nodes.length > 0, 'Knowledge graph returns a non-empty node collection');
    check(
      Array.isArray(nodes) && nodes.every((node: any) =>
        typeof node.id === 'string' && node.id.length > 0 &&
        typeof node.title === 'string' && node.title.length > 0 &&
        typeof node.description === 'string' && node.description.length > 0 &&
        ALLOWED_NODE_TYPES.has(node.type) && Array.isArray(node.relatedIds)
      ),
      'Every node preserves its identifier, display fields, supported type, and relation list'
    );
    const nodeIds = new Set<string>((nodes || []).map((node: any) => node.id));
    for (const id of nodeIds) allowedNodeIds.add(id);
    check(nodeIds.size === (nodes?.length || 0), 'Knowledge graph node identifiers are unique');
    check(
      Array.isArray(nodes) && nodes.every((node: any) =>
        node.relatedIds.every((relatedId: string) => nodeIds.has(relatedId)) &&
        new Set(node.relatedIds).size === node.relatedIds.length
      ),
      'Every relation points to one unique node in the published graph'
    );

    const detailResponses = await Promise.all(
      (nodes || []).map((node: any) => get(`/api/knowledge/nodes/${encodeURIComponent(node.id)}`))
    );
    check(
      detailResponses.length === nodes.length && detailResponses.every((detail, index) => {
        const expected = nodes[index];
        const relatedIds = detail.body.related?.map((related: any) => related.id);
        const relatedBookIds = detail.body.relatedBooks?.map((book: any) => book.id);
        return detail.status === 200 && detail.body.success === true &&
          detail.body.node?.id === expected.id &&
          JSON.stringify(relatedIds) === JSON.stringify(expected.relatedIds) &&
          JSON.stringify(relatedBookIds) === JSON.stringify(expected.bookIds || []);
      }),
      'Every node detail resolves all declared graph edges and linked seeded books in order'
    );

    const aliasSearch = await get('/api/knowledge/search?q=Avicenna');
    check(
      aliasSearch.status === 200 && aliasSearch.body.success === true &&
      aliasSearch.body.nodes.some((node: any) => node.id === 'per_ibn_sina'),
      'Knowledge search matches the Avicenna alias'
    );
    const filteredSearch = await get('/api/knowledge/search?q=Islamic&category=civilization');
    check(
      filteredSearch.status === 200 && filteredSearch.body.nodes.some((node: any) => node.id === 'civ_islamic') &&
      filteredSearch.body.nodes.every((node: any) => node.type === 'civilization'),
      'Knowledge search combines text and category filters'
    );
    const noMatchSearch = await get('/api/knowledge/search?q=no-such-earth-one-node-9f31');
    check(
      noMatchSearch.status === 200 && noMatchSearch.body.success === true &&
      noMatchSearch.body.query === 'no-such-earth-one-node-9f31' &&
      Array.isArray(noMatchSearch.body.nodes) && noMatchSearch.body.nodes.length === 0,
      'Knowledge search returns a successful structured empty collection when no node matches'
    );
    const countryFilter = await get('/api/knowledge/nodes?country=sa');
    check(
      countryFilter.status === 200 && countryFilter.body.success === true &&
      countryFilter.body.nodes.some((node: any) => node.id === 'civ_islamic') &&
      countryFilter.body.nodes.every((node: any) => node.countryCode?.toUpperCase() === 'SA'),
      'Knowledge country filter is case-insensitive and returns only matching nodes'
    );
    const missingNode = await get('/api/knowledge/nodes/not-a-real-node');
    check(
      missingNode.status === 404 && missingNode.body.success === false &&
      typeof missingNode.body.error === 'string',
      'Unknown knowledge node returns a structured 404'
    );
    check(
      [...ALLOWED_FIXED_ENDPOINTS].every(endpoint => requested.some(request => request.endpoint === endpoint)) &&
      requested.filter(request => /^\/api\/knowledge\/nodes\/[A-Za-z0-9_-]+$/.test(request.endpoint) &&
        allowedNodeIds.has(decodeURIComponent(request.endpoint.split('/').at(-1) || ''))).length === detailResponses.length &&
      requested.every(request => request.method === 'GET' && (
        ALLOWED_FIXED_ENDPOINTS.has(request.endpoint) ||
        (/^\/api\/knowledge\/nodes\/[A-Za-z0-9_-]+$/.test(request.endpoint) &&
          allowedNodeIds.has(decodeURIComponent(request.endpoint.split('/').at(-1) || '')))
      )),
      'Test issued only GET requests to the allowlisted knowledge graph endpoints'
    );

    console.log(`Knowledge API regression: ${passed} passed, 0 failed (${detailResponses.length} node details; GET only; isolated temporary storage).`);
  } catch (error) {
    console.error('Knowledge API regression failed:', error);
    if (childOutput) console.error('Temporary server output:\n' + childOutput);
    throw error;
  } finally {
    await stopServer();
  }
}

main().catch(() => { process.exitCode = 1; });
