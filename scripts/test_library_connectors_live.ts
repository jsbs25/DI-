import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

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
  const testDir = fs.mkdtempSync(path.join(tmpdir(), 'earth-one-library-connectors-live-'));
  const dataFile = path.join(testDir, 'server_data.json');
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let childOutput = '';
  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      EARTH_ONE_DATA_FILE: dataFile,
      EARTH_ONE_SKIP_BOOK_HARVEST: 'true',
      EARTH_ONE_LIBRARY_OPENLIBRARY_ENABLED: 'true',
      EARTH_ONE_LIBRARY_ARCHIVE_ENABLED: 'true',
      EARTH_ONE_LIBRARY_GUTENBERG_ENABLED: 'true',
      EARTH_ONE_LIBRARY_WIKISOURCE_ENABLED: 'false',
      EARTH_ONE_LIBRARY_AR_WIKISOURCE_ENABLED: 'false',
      GEMINI_API_KEY: '',
      OPENAI_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      DEEPSEEK_API_KEY: '',
      CUSTOM_API_KEY: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.on('error', error => { childOutput = `${childOutput}\n${error.message}`.slice(-12_000); });
  child.stdout?.on('data', chunk => { childOutput = (childOutput + chunk.toString()).slice(-12_000); });
  child.stderr?.on('data', chunk => { childOutput = (childOutput + chunk.toString()).slice(-12_000); });

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

  async function request(pathname: string, init?: RequestInit) {
    return fetch(new URL(pathname, baseUrl), {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(20_000)
    });
  }

  try {
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Isolated server exited early.\n${childOutput}`);
      try {
        const response = await request('/api/library/connectors');
        if (response.ok) { ready = true; break; }
      } catch {
        await sleep(250);
      }
    }
    assert.ok(ready, `Isolated server did not become ready.\n${childOutput}`);

    const discoveryUrl = new URL('/api/library/search', baseUrl);
    discoveryUrl.searchParams.set('q', 'Frankenstein');
    discoveryUrl.searchParams.set('sources', 'openlibrary,archive');
    discoveryUrl.searchParams.set('limit', '1');
    const discoveryResponse = await fetch(discoveryUrl, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
    assert.equal(discoveryResponse.status, 200);
    const discoveryBody = await discoveryResponse.json() as any;
    for (const source of ['openlibrary', 'archive']) {
      assert.ok(discoveryBody.sources?.some((status: any) => status.source === source && status.status === 'ok' && status.count > 0),
        `Real ${source} search did not return records: ${JSON.stringify(discoveryBody.sources)}`);
    }
    const openLibraryResult = discoveryBody.results?.find((record: any) => record.source === 'openlibrary');
    const archiveResult = discoveryBody.results?.find((record: any) => record.source === 'archive');
    assert.ok(openLibraryResult?.sourceUrl?.startsWith('https://openlibrary.org/'));
    assert.ok(archiveResult?.sourceUrl?.startsWith('https://archive.org/details/'));
    assert.match(`${archiveResult?.title || ''} ${archiveResult?.author || ''}`, /frankenstein/i,
      `Internet Archive field search returned an unrelated record: ${archiveResult?.title}`);

    const searchUrl = new URL('/api/library/search', baseUrl);
    searchUrl.searchParams.set('q', 'Pride and Prejudice');
    searchUrl.searchParams.set('sources', 'gutenberg');
    searchUrl.searchParams.set('limit', '1');
    const searchResponse = await fetch(searchUrl, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
    assert.equal(searchResponse.status, 200);
    const searchBody = await searchResponse.json() as any;
    const candidate = searchBody.results?.find((record: any) => record.source === 'gutenberg' && record.title === 'Pride and Prejudice');
    assert.ok(candidate, `Real Gutenberg search did not return the expected title: ${JSON.stringify(searchBody.sources)}`);
    assert.equal(candidate.rights, 'PUBLIC_DOMAIN');
    assert.equal(candidate.canImport, true);
    assert.equal(candidate.availability, 'verify-official-opds');
    assert.equal(candidate.sourceUrl, 'https://www.gutenberg.org/ebooks/1342');

    const importResponse = await request('/api/library/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'gutenberg', externalId: candidate.externalId })
    });
    assert.equal(importResponse.status, 200);
    const importBody = await importResponse.json() as any;
    const book = importBody.book;
    assert.equal(importBody.success, true);
    assert.ok(book?.id?.startsWith('gutenberg_'));
    assert.equal(book.title, 'Pride and Prejudice');
    assert.equal(book.source, 'Project Gutenberg');
    assert.equal(book.externalId, '1342');
    assert.equal(book.rightsClassification, 'PUBLIC_DOMAIN');
    assert.equal(book.copyrightStatus, 'public_domain');
    assert.equal(book.formatType, 'epub');
    assert.equal(book.epubUrl, 'https://www.gutenberg.org/ebooks/1342.epub.noimages');
    assert.equal(book.sourceUrl, 'https://www.gutenberg.org/ebooks/1342');

    const detailResponse = await request(`/api/library/books/${encodeURIComponent(book.id)}`);
    assert.equal(detailResponse.status, 200);
    const detailBody = await detailResponse.json() as any;
    assert.equal(detailBody.book?.id, book.id);
    assert.equal(detailBody.book?.rightsClassification, 'PUBLIC_DOMAIN');
    console.log('Library connector live smoke: PASS (live Open Library + Internet Archive search; official Gutenberg search → per-book OPDS → isolated EPUB book record → local detail read; EPUB not downloaded).');
  } catch (error) {
    console.error('Library connector live smoke failed:', error);
    if (childOutput) console.error('Temporary server output:\n' + childOutput);
    throw error;
  } finally {
    await stopServer();
  }
}

main().catch(() => { process.exitCode = 1; });
