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
      EARTH_ONE_LIBRARY_OPENALEX_ENABLED: 'true',
      EARTH_ONE_LIBRARY_CROSSREF_ENABLED: 'true',
      EARTH_ONE_LIBRARY_ARXIV_ENABLED: 'true',
      EARTH_ONE_LIBRARY_EUROPEPMC_ENABLED: 'true',
      EARTH_ONE_LIBRARY_PMC_ENABLED: 'true',
      EARTH_ONE_LIBRARY_PUBMED_ENABLED: 'true',
      EARTH_ONE_LIBRARY_SHAMELA_ENABLED: 'true',
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

    const academicCases: Array<[string, string, string]> = [
      ['openalex', 'artificial intelligence', 'https://openalex.org/'],
      ['crossref', 'climate change', 'https://doi.org/'],
      ['arxiv', 'machine learning', 'https://arxiv.org/abs/'],
      ['europepmc', 'cancer', 'https://europepmc.org/'],
      ['pmc', 'cancer', 'https://pmc.ncbi.nlm.nih.gov/articles/'],
      ['pubmed', 'cancer', 'https://pubmed.ncbi.nlm.nih.gov/']
    ];
    const academicChecks = await Promise.all(academicCases.map(async ([source, query, sourcePrefix]) => {
      const academicUrl = new URL('/api/library/search', baseUrl);
      academicUrl.searchParams.set('q', query);
      academicUrl.searchParams.set('source', source);
      academicUrl.searchParams.set('limit', '1');
      const response = await fetch(academicUrl, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
      assert.equal(response.status, 200, `Live ${source} search endpoint returned HTTP ${response.status}`);
      const body = await response.json() as any;
      const status = body.sources?.find((item: any) => item.source === source);
      const record = body.results?.find((item: any) => item.source === source);
      assert.ok(status?.status === 'ok' && status.count > 0, `Live ${source} search returned no records: ${JSON.stringify(body.sources)}`);
      assert.ok(record?.sourceUrl?.startsWith(sourcePrefix), `Live ${source} result did not preserve its official source URL`);
      assert.equal(record.canImport, false, `${source} records cannot be locally imported`);
      if (record.providerFullTextUrl) assert.ok(record.providerFullTextUrl.startsWith('https://'), `${source} full-text links must be HTTPS`);
      if (source === 'pubmed') {
        assert.ok(typeof record.doi === 'string' && record.doi.length > 0, 'Live PubMed record should expose a DOI for the identifier lookup check');
        const doiUrl = new URL('/api/library/search', baseUrl);
        doiUrl.searchParams.set('q', record.doi);
        doiUrl.searchParams.set('source', 'pubmed');
        doiUrl.searchParams.set('limit', '1');
        const doiResponse = await fetch(doiUrl, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
        assert.equal(doiResponse.status, 200, 'Live PubMed DOI search should return successfully');
        const doiBody = await doiResponse.json() as any;
        const doiRecord = doiBody.results?.find((item: any) => item.source === 'pubmed');
        assert.equal(doiRecord?.doi?.toLowerCase(), record.doi.toLowerCase(), 'Live PubMed DOI lookup should resolve the same record');
      }
      return source;
    }));

    const shamelaUrl = new URL('/api/library/search', baseUrl);
    shamelaUrl.searchParams.set('q', 'ابن خلدون');
    shamelaUrl.searchParams.set('source', 'shamela');
    shamelaUrl.searchParams.set('limit', '2');
    const shamelaResponse = await fetch(shamelaUrl, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
    assert.equal(shamelaResponse.status, 200);
    const shamelaBody = await shamelaResponse.json() as any;
    const shamelaStatus = shamelaBody.sources?.find((item: any) => item.source === 'shamela');
    const shamelaRecord = shamelaBody.results?.find((item: any) => item.source === 'shamela');
    assert.ok(shamelaStatus?.status === 'ok' && shamelaStatus.count > 0, `Live Shamela Arabic search returned no records: ${JSON.stringify(shamelaBody.sources)}`);
    assert.match(shamelaRecord?.sourceUrl || '', /^https:\/\/shamela\.ws\/book\/\d+\/\d+$/);
    assert.equal(shamelaRecord.rightsClassification, 'UNKNOWN');
    assert.equal(shamelaRecord.canImport, false);
    assert.equal(shamelaRecord.textUrl, undefined);
    assert.equal(shamelaRecord.providerFullTextUrl, undefined);

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
    console.log(`Library connector live smoke: PASS (live Open Library + Internet Archive, ${academicChecks.join(', ')}, Shamela Arabic search; official-source-only rights preserved; official Gutenberg search → per-book OPDS → isolated EPUB book record → local detail read; EPUB not downloaded).`);
  } catch (error) {
    console.error('Library connector live smoke failed:', error);
    if (childOutput) console.error('Temporary server output:\n' + childOutput);
    throw error;
  } finally {
    await stopServer();
  }
}

main().catch(() => { process.exitCode = 1; });
