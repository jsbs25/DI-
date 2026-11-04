import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

const ALLOWED_FIXED_ENDPOINTS = new Set([
  '/api/library/connectors',
  '/api/library/search?q=valid&source=gutenberg',
  '/api/library/search?q=valid&source=europeana',
  '/api/library/search?q=valid&source=openalex,not-a-real-source',
  '/api/library/search?q=valid&source=pmc,not-a-real-source',
  '/api/library/search?q=valid&source=pubmed,not-a-real-source',
  '/api/library/search?q=valid&source=shamela,not-a-real-source',
  '/api/library/search?q=&source=gutenberg',
  '/api/library/search?q=valid&source=not-a-real-source',
  '/api/library/books',
  '/api/library/shelf',
  '/api/library/books?category=philosophy',
  '/api/library/books?category=not-a-real-category',
  '/api/library/books?search=Plato',
  '/api/library/books/not-a-real-book'
]);
const ALLOWED_BOOK_DETAILS = new Set(['book_republic']);
const ALLOWED_POST_ENDPOINTS = new Set(['/api/library/ingest', '/api/library/shelf', '/api/auth/register']);
function isAllowedPostEndpoint(endpoint: string): boolean {
  return ALLOWED_POST_ENDPOINTS.has(endpoint) ||
    /^\/api\/library\/shelf\/[A-Za-z0-9_-]+\/(?:reading-state|epub-reading-state)$/.test(endpoint) ||
    /^\/api\/library\/books\/[A-Za-z0-9_-]+\/(?:ai-reading|knowledge-notes)$/.test(endpoint);
}

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
  const testDir = fs.mkdtempSync(path.join(tmpdir(), 'earth-one-library-api-test-'));
  const dataFile = path.join(testDir, 'server_data.json');
  let childOutput = '';
  let port = await getAvailablePort();
  let baseUrl = `http://127.0.0.1:${port}`;
  function spawnIsolatedServer(serverPort: number) {
    const server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(serverPort),
        EARTH_ONE_DATA_FILE: dataFile,
        EARTH_ONE_SKIP_BOOK_HARVEST: 'true',
        EARTH_ONE_LIBRARY_OPENLIBRARY_ENABLED: 'true',
        EARTH_ONE_LIBRARY_ARCHIVE_ENABLED: 'false',
        EARTH_ONE_LIBRARY_GUTENBERG_ENABLED: 'false',
        EARTH_ONE_LIBRARY_WIKISOURCE_ENABLED: 'false',
        EARTH_ONE_LIBRARY_AR_WIKISOURCE_ENABLED: 'false',
        EARTH_ONE_LIBRARY_GOOGLEBOOKS_ENABLED: 'true',
        EARTH_ONE_LIBRARY_EUROPEANA_ENABLED: 'true',
        EARTH_ONE_LIBRARY_OPENALEX_ENABLED: 'true',
        EARTH_ONE_LIBRARY_CROSSREF_ENABLED: 'true',
        EARTH_ONE_LIBRARY_ARXIV_ENABLED: 'true',
        EARTH_ONE_LIBRARY_EUROPEPMC_ENABLED: 'true',
        EARTH_ONE_LIBRARY_PMC_ENABLED: 'true',
        EARTH_ONE_LIBRARY_PUBMED_ENABLED: 'true',
        EARTH_ONE_LIBRARY_SHAMELA_ENABLED: 'true',
        GOOGLE_BOOKS_API_KEY: 'api-test-key-not-a-real-secret',
        EUROPEANA_API_KEY: '',
        GEMINI_API_KEY: '',
        OPENAI_API_KEY: '',
        ANTHROPIC_API_KEY: '',
        DEEPSEEK_API_KEY: '',
        CUSTOM_API_KEY: ''
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    server.on('error', error => { childOutput = `${childOutput}\n${error.message}`.slice(-12000); });
    server.stdout?.on('data', chunk => { childOutput = (childOutput + chunk.toString()).slice(-12000); });
    server.stderr?.on('data', chunk => { childOutput = (childOutput + chunk.toString()).slice(-12000); });
    return server;
  }
  let child = spawnIsolatedServer(port);

  async function stopCurrentServer() {
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
  }

  async function restartServer() {
    await stopCurrentServer();
    childOutput = '';
    port = await getAvailablePort();
    baseUrl = `http://127.0.0.1:${port}`;
    child = spawnIsolatedServer(port);
  }

  async function stopServer() {
    await stopCurrentServer();
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  let passed = 0;
  const requested: Array<{ endpoint: string; method: string }> = [];
  function check(condition: unknown, label: string) {
    assert.ok(condition, label);
    passed += 1;
  }

  async function get(endpoint: string, token?: string) {
    const url = new URL(endpoint, baseUrl);
    const fixedEndpoint = `${url.pathname}${url.search}`;
    const isKnownBookDetail = /^\/api\/library\/books\/[A-Za-z0-9_-]+$/.test(url.pathname) &&
      !url.search && ALLOWED_BOOK_DETAILS.has(decodeURIComponent(url.pathname.split('/').at(-1) || ''));
    assert.ok(
      ALLOWED_FIXED_ENDPOINTS.has(fixedEndpoint) || isKnownBookDetail,
      `Unexpected endpoint blocked by test: ${fixedEndpoint}`
    );
    requested.push({ endpoint: fixedEndpoint, method: 'GET' });
    const response = await fetch(url, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(5000)
    });
    return { status: response.status, body: await response.json() as any };
  }

  async function post(endpoint: string, body: unknown, token?: string) {
    assert.ok(isAllowedPostEndpoint(endpoint), `Unexpected POST endpoint blocked by test: ${endpoint}`);
    requested.push({ endpoint, method: 'POST' });
    const response = await fetch(new URL(endpoint, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body),
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
        catalog = await get('/api/library/books');
        if (catalog.status === 200) break;
      } catch {
        await sleep(250);
      }
    }

    check(catalog?.status === 200 && catalog.body.success === true, 'Library catalog becomes ready from isolated storage');
    const connectors = await get('/api/library/connectors');
    check(
      connectors.status === 200 && connectors.body.success === true && Array.isArray(connectors.body.sources) &&
      connectors.body.sources.length === 14 && connectors.body.sources.filter((source: any) => source.enabled).length === 9 &&
      connectors.body.sources.find((source: any) => source.name === 'Open Library')?.enabled === true &&
      connectors.body.sources.find((source: any) => source.name === 'Google Books')?.authentication === 'api-key' &&
      connectors.body.sources.find((source: any) => source.name === 'Google Books')?.enabled === true &&
      connectors.body.sources.find((source: any) => source.name === 'Europeana')?.authentication === 'api-key' &&
      connectors.body.sources.find((source: any) => source.name === 'Europeana')?.enabled === false &&
      ['OpenAlex', 'Crossref', 'arXiv', 'Europe PMC', 'PubMed Central', 'PubMed', 'Shamela'].every(name => {
        const source = connectors.body.sources.find((item: any) => item.name === name);
        return source?.authentication === 'none' && source?.enabled === true;
      }),
      'Connector registry reports all sources and honors per-source environment flags'
    );
    const disabledSearch = await get('/api/library/search?q=valid&source=gutenberg');
    check(
      disabledSearch.status === 200 && disabledSearch.body.success === true && disabledSearch.body.results.length === 0 &&
      disabledSearch.body.sources.length === 1 && disabledSearch.body.sources[0].status === 'disabled',
      'Unified search returns a clear disabled status without calling external services'
    );
    const europeanaSearch = await get('/api/library/search?q=valid&source=europeana');
    check(
      europeanaSearch.status === 200 && europeanaSearch.body.success === true && europeanaSearch.body.results.length === 0 &&
      europeanaSearch.body.sources.length === 1 && europeanaSearch.body.sources[0].status === 'disabled' &&
      /EUROPEANA_API_KEY/.test(europeanaSearch.body.sources[0].reason || ''),
      'Europeana stays fail-closed with a clear missing-key status and no provider request'
    );
    const blankSearch = await get('/api/library/search?q=&source=gutenberg');
    check(blankSearch.status === 400 && blankSearch.body.success === false, 'Blank global search is rejected');
    const invalidSource = await get('/api/library/search?q=valid&source=not-a-real-source');
    check(invalidSource.status === 400 && invalidSource.body.success === false, 'Unknown connector names are rejected');
    const academicSourceValidation = await get('/api/library/search?q=valid&source=openalex,not-a-real-source');
    check(academicSourceValidation.status === 400 && academicSourceValidation.body.success === false, 'New academic source IDs are accepted by the allowlist while unknown IDs are rejected');
    const pmcSourceValidation = await get('/api/library/search?q=valid&source=pmc,not-a-real-source');
    check(pmcSourceValidation.status === 400 && pmcSourceValidation.body.success === false, 'PMC is accepted by the source allowlist while unknown IDs are rejected');
    const pubmedSourceValidation = await get('/api/library/search?q=valid&source=pubmed,not-a-real-source');
    check(pubmedSourceValidation.status === 400 && pubmedSourceValidation.body.success === false, 'PubMed is accepted by the source allowlist while unknown IDs are rejected');
    const shamelaSourceValidation = await get('/api/library/search?q=valid&source=shamela,not-a-real-source');
    check(shamelaSourceValidation.status === 400 && shamelaSourceValidation.body.success === false, 'Shamela is accepted by the source allowlist while unknown IDs are rejected');
    const metadataOnlyImport = await post('/api/library/ingest', { source: 'openlibrary', externalId: '/works/OL1W' });
    check(metadataOnlyImport.status === 403 && metadataOnlyImport.body.success === false, 'Metadata-only Open Library records cannot be imported as full text');
    const googleBooksImport = await post('/api/library/ingest', { source: 'googlebooks', externalId: 'sample-volume' });
    check(googleBooksImport.status === 403 && googleBooksImport.body.success === false, 'Google Books previews and protected text cannot be imported locally');
    const europeanaImport = await post('/api/library/ingest', { source: 'europeana', externalId: '/12345/record' });
    check(europeanaImport.status === 503 && europeanaImport.body.success === false, 'Europeana import is disabled when its server API key is missing');
    const academicImport = await post('/api/library/ingest', { source: 'arxiv', externalId: '2401.12345v1' });
    check(academicImport.status === 403 && academicImport.body.success === false, 'Academic open-access records cannot bypass the no-local-copy rule');
    const pmcImport = await post('/api/library/ingest', { source: 'pmc', externalId: '2468' });
    check(pmcImport.status === 403 && pmcImport.body.success === false, 'PMC reading access does not bypass the individual article reuse-license check');
    const pubmedImport = await post('/api/library/ingest', { source: 'pubmed', externalId: '98765432' });
    check(pubmedImport.status === 403 && pubmedImport.body.success === false, 'PubMed metadata cannot be imported as article full text');
    const shamelaImport = await post('/api/library/ingest', { source: 'shamela', externalId: '123/45' });
    check(shamelaImport.status === 403 && shamelaImport.body.success === false, 'Shamela MCP discovery cannot be used to import or copy full text');
    const disabledImport = await post('/api/library/ingest', { source: 'gutenberg', externalId: '11' });
    check(disabledImport.status === 503 && disabledImport.body.success === false, 'Disabled sources cannot be used for full-text import');
    const unverifiedSeedReading = await post('/api/library/books/book_republic/ai-reading', {
      chapterId: 'ch1', selectedText: 'I went down yesterday to the Piraeus'
    });
    check(
      unverifiedSeedReading.status === 409 && unverifiedSeedReading.body.code === 'CITATION_UNVERIFIABLE',
      'AI reading refuses seed excerpts without a verifiable source edition before any model call'
    );
    const forgedPassageReading = await post('/api/library/books/book_republic/ai-reading', {
      chapterId: 'ch1', selectedText: 'A quotation invented only in the browser.'
    });
    check(
      forgedPassageReading.status === 422 && forgedPassageReading.body.code === 'SELECTION_NOT_IN_SOURCE',
      'AI reading rejects client-selected text that is absent from the server-stored chapter'
    );
    const missingBookReading = await post('/api/library/books/no-such-book/ai-reading', {
      chapterId: 'ch1', selectedText: 'anything'
    });
    check(missingBookReading.status === 404 && missingBookReading.body.success === false, 'AI reading does not use client-supplied book metadata for unknown books');
    const unauthenticatedKnowledgeNote = await post('/api/library/books/book_republic/knowledge-notes', {
      chapterId: 'ch1', selectedText: 'I went down yesterday to the Piraeus', aiExplanation: 'not saved'
    });
    check(unauthenticatedKnowledgeNote.status === 401 && unauthenticatedKnowledgeNote.body.success === false, 'Private AI reading notes require an authenticated account');

    const books = catalog?.body.books;
    check(Array.isArray(books) && books.length > 0, 'Library catalog returns a non-empty local collection');
    check(
      Array.isArray(books) && books.every((book: any) =>
        typeof book.id === 'string' && book.id.length > 0 &&
        typeof book.title === 'string' && book.title.length > 0 &&
        typeof book.author === 'string' && book.author.length > 0 &&
        typeof book.category === 'string' &&
        typeof book.language === 'string' &&
        typeof book.description === 'string' &&
        Array.isArray(book.chapters)
      ),
      'Every catalog entry preserves core display fields and a chapter collection'
    );
    const bookIds = new Set<string>((books || []).map((book: any) => book.id));
    check(bookIds.size === (books?.length || 0), 'Library catalog book identifiers are unique');
    check(
      bookIds.has('book_republic') && bookIds.has('book_daodejing'),
      'Seeded philosophy titles remain present in the local catalog'
    );
    const repeatedCatalogResponse = await get('/api/library/books');
    check(
      repeatedCatalogResponse.status === catalog?.status &&
      JSON.stringify(repeatedCatalogResponse.body) === JSON.stringify(catalog?.body),
      'Repeated local catalog GET returns an identical status and JSON response'
    );

    const philosophy = await get('/api/library/books?category=philosophy');
    check(
      philosophy.status === 200 && philosophy.body.success === true &&
      Array.isArray(philosophy.body.books) && philosophy.body.books.length > 0 &&
      philosophy.body.books.every((book: any) => book.category === 'philosophy') &&
      philosophy.body.books.some((book: any) => book.id === 'book_republic'),
      'Category filter returns only matching philosophy books'
    );

    const noMatches = await get('/api/library/books?category=not-a-real-category');
    check(
      noMatches.status === 200 && noMatches.body.success === true &&
      Array.isArray(noMatches.body.books) && noMatches.body.books.length === 0,
      'Unknown category returns a successful empty collection'
    );

    const search = await get('/api/library/books?search=Plato');
    check(
      search.status === 200 && search.body.success === true &&
      Array.isArray(search.body.books) && search.body.books.length > 0 &&
      search.body.books.some((book: any) => book.id === 'book_republic') &&
      search.body.books.every((book: any) =>
        book.title.toLowerCase().includes('plato') || book.author.toLowerCase().includes('plato')
      ),
      'Local title/author search matches Plato without using external book search'
    );

    const detail = await get('/api/library/books/book_republic');
    check(
      detail.status === 200 && detail.body.success === true && detail.body.book?.id === 'book_republic' &&
      detail.body.book.title === 'The Republic (理想国)' && Array.isArray(detail.body.book.chapters) &&
      detail.body.book.chapters.length > 0 && Array.isArray(detail.body.annotations),
      'Known book detail preserves chapter content structure and an annotations collection'
    );
    check(
      detail.body.book.chapters.every((chapter: any) =>
        typeof chapter.id === 'string' && typeof chapter.title === 'string' && typeof chapter.content === 'string'
      ),
      'Every returned book chapter includes its identifier, title, and text fields'
    );
    const repeatedDetailResponse = await get('/api/library/books/book_republic');
    check(
      repeatedDetailResponse.status === detail.status &&
      JSON.stringify(repeatedDetailResponse.body) === JSON.stringify(detail.body),
      'Repeated known-book detail GET returns an identical status and JSON response'
    );

    const testRunId = Date.now();
    const accountA = await post('/api/auth/register', {
      email: `phase7-reader-a-${testRunId}@example.invalid`,
      password: 'phase7-test-password-a',
      displayName: 'Synthetic Reader A'
    });
    const accountB = await post('/api/auth/register', {
      email: `phase7-reader-b-${testRunId}@example.invalid`,
      password: 'phase7-test-password-b',
      displayName: 'Synthetic Reader B'
    });
    check(
      accountA.status === 200 && accountA.body.success && accountA.body.token && accountA.body.user?.id &&
      accountB.status === 200 && accountB.body.success && accountB.body.token && accountB.body.user?.id &&
      accountA.body.user.id !== accountB.body.user.id,
      'Synthetic test readers receive separate authenticated identities'
    );
    const chapterToResume = detail.body.book.chapters[0];
    const addShelfA = await post('/api/library/shelf', { bookId: 'book_republic', status: 'want_to_read' }, accountA.body.token);
    const addShelfB = await post('/api/library/shelf', { bookId: 'book_republic', status: 'want_to_read' }, accountB.body.token);
    check(
      addShelfA.status === 200 && addShelfA.body.success && addShelfA.body.item.userId === accountA.body.user.id &&
      addShelfB.status === 200 && addShelfB.body.success && addShelfB.body.item.userId === accountB.body.user.id,
      'The same book can be saved to two distinct account-scoped shelves'
    );
    const savedReadingState = await post('/api/library/shelf/book_republic/reading-state', {
      chapterId: chapterToResume.id,
      progress: 40
    }, accountA.body.token);
    check(
      savedReadingState.status === 200 && savedReadingState.body.success &&
      savedReadingState.body.item.lastReadChapterId === chapterToResume.id &&
      savedReadingState.body.item.progress === 40 && savedReadingState.body.item.status === 'reading',
      'Reading-state API saves a valid chapter marker and promotes a started book to Reading'
    );
    const savedEpubCfi = 'epubcfi(/6/4[chapter01]!/4/2/18:5)';
    const savedEpubState = await post('/api/library/shelf/book_republic/epub-reading-state', {
      cfi: savedEpubCfi,
      progress: 63,
      ownerId: accountA.body.user.id
    }, accountA.body.token);
    check(
      savedEpubState.status === 200 && savedEpubState.body.success &&
      savedEpubState.body.item.lastReadEpubCfi === savedEpubCfi && savedEpubState.body.item.progress === 63,
      'EPUB reading-state API saves a bounded CFI location to the owning reader’s shelf'
    );
    const unauthenticatedEpubState = await post('/api/library/shelf/book_republic/epub-reading-state', {
      cfi: savedEpubCfi,
      progress: 63,
      ownerId: accountA.body.user.id
    });
    check(
      unauthenticatedEpubState.status === 401 && unauthenticatedEpubState.body.success === false,
      'EPUB reading-state API rejects requests without an authenticated account'
    );
    const mismatchedOwnerEpubState = await post('/api/library/shelf/book_republic/epub-reading-state', {
      cfi: savedEpubCfi,
      progress: 63,
      ownerId: accountA.body.user.id
    }, accountB.body.token);
    check(
      mismatchedOwnerEpubState.status === 403 && mismatchedOwnerEpubState.body.success === false,
      'EPUB reading-state API rejects account IDs that do not match the active session'
    );
    const invalidEpubState = await post('/api/library/shelf/book_republic/epub-reading-state', {
      cfi: 'not-a-valid-cfi',
      progress: 63,
      ownerId: accountA.body.user.id
    }, accountA.body.token);
    check(
      invalidEpubState.status === 400 && invalidEpubState.body.success === false,
      'EPUB reading-state API rejects malformed CFI locations'
    );
    const invalidParsedCfi = await post('/api/library/shelf/book_republic/epub-reading-state', {
      cfi: 'epubcfi(/6/4!/4/2:NaN)',
      progress: 63,
      ownerId: accountA.body.user.id
    }, accountA.body.token);
    check(
      invalidParsedCfi.status === 400 && invalidParsedCfi.body.success === false,
      'EPUB reading-state API parses CFI syntax and rejects invalid character offsets'
    );
    const oversizedCfi = await post('/api/library/shelf/book_republic/epub-reading-state', {
      cfi: `epubcfi(/6/4!${'/2'.repeat(1100)})`,
      progress: 63,
      ownerId: accountA.body.user.id
    }, accountA.body.token);
    check(
      oversizedCfi.status === 400 && oversizedCfi.body.success === false,
      'EPUB reading-state API rejects oversized CFI input'
    );
    const invalidEpubProgress = await post('/api/library/shelf/book_republic/epub-reading-state', {
      cfi: savedEpubCfi,
      progress: 101,
      ownerId: accountA.body.user.id
    }, accountA.body.token);
    check(
      invalidEpubProgress.status === 400 && invalidEpubProgress.body.success === false,
      'EPUB reading-state API rejects progress outside the 0–100 range'
    );
    const invalidReadingState = await post('/api/library/shelf/book_republic/reading-state', {
      chapterId: 'chapter-from-another-book',
      progress: 40
    }, accountA.body.token);
    check(
      invalidReadingState.status === 400 && invalidReadingState.body.success === false,
      'Reading-state API rejects chapter identifiers that do not belong to the book'
    );
    const shelfA = await get('/api/library/shelf', accountA.body.token);
    const shelfB = await get('/api/library/shelf', accountB.body.token);
    const shelfItemA = shelfA.body.items?.find((item: any) => item.bookId === 'book_republic');
    const shelfItemB = shelfB.body.items?.find((item: any) => item.bookId === 'book_republic');
    check(
      shelfA.status === 200 && shelfItemA?.lastReadChapterId === chapterToResume.id &&
      shelfItemA?.lastReadEpubCfi === savedEpubCfi && shelfItemA?.progress === 63 &&
      shelfB.status === 200 && shelfItemB?.lastReadChapterId === undefined &&
      shelfItemB?.lastReadEpubCfi === undefined && shelfItemB?.progress === 0,
      'Text and EPUB reading positions remain visible only to their owning account'
    );
    const persistedState = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    check(
      persistedState.bookShelf?.some((item: any) => item.userId === accountA.body.user.id &&
        item.bookId === 'book_republic' && item.lastReadChapterId === chapterToResume.id &&
        item.lastReadEpubCfi === savedEpubCfi && item.progress === 63),
      'Account-scoped chapter and EPUB CFI positions persist in the isolated data file'
    );

    await restartServer();
    let restartedShelfA: Awaited<ReturnType<typeof get>> | undefined;
    let restartedShelfB: Awaited<ReturnType<typeof get>> | undefined;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Isolated API server exited after restart.\n${childOutput}`);
      try {
        const [shelfAAfterRestart, shelfBAfterRestart] = await Promise.all([
          get('/api/library/shelf', accountA.body.token),
          get('/api/library/shelf', accountB.body.token)
        ]);
        if (shelfAAfterRestart.status === 200 && shelfBAfterRestart.status === 200) {
          restartedShelfA = shelfAAfterRestart;
          restartedShelfB = shelfBAfterRestart;
          break;
        }
      } catch {
        await sleep(250);
      }
    }
    const shelfItemAAfterRestart = restartedShelfA?.body.items?.find((item: any) => item.bookId === 'book_republic');
    const shelfItemBAfterRestart = restartedShelfB?.body.items?.find((item: any) => item.bookId === 'book_republic');
    check(
      restartedShelfA?.status === 200 && shelfItemAAfterRestart?.lastReadChapterId === chapterToResume.id &&
      shelfItemAAfterRestart?.lastReadEpubCfi === savedEpubCfi && shelfItemAAfterRestart?.progress === 63 &&
      restartedShelfB?.status === 200 && shelfItemBAfterRestart?.lastReadChapterId === undefined &&
      shelfItemBAfterRestart?.lastReadEpubCfi === undefined && shelfItemBAfterRestart?.progress === 0,
      'Fresh authenticated clients after a server restart restore both resume positions only for the owning account'
    );

    const missingBook = await get('/api/library/books/not-a-real-book');
    check(
      missingBook.status === 404 && missingBook.body.success === false &&
      typeof missingBook.body.error === 'string',
      'Unknown book detail returns a structured 404'
    );
    check(
      [...ALLOWED_FIXED_ENDPOINTS].every(endpoint => requested.some(request => request.endpoint === endpoint)) &&
      requested.every(request => (request.method === 'GET' && (
        ALLOWED_FIXED_ENDPOINTS.has(request.endpoint) ||
        (/^\/api\/library\/books\/[A-Za-z0-9_-]+$/.test(request.endpoint) &&
          ALLOWED_BOOK_DETAILS.has(decodeURIComponent(request.endpoint.split('/').at(-1) || '')))
      )) || (request.method === 'POST' && isAllowedPostEndpoint(request.endpoint))),
      'Test issued only allowlisted local GET requests and controlled import, evidence-validation, and auth-rejection POST requests'
    );

    console.log(`Library API regression: ${passed} passed, 0 failed (allowlisted local routes; isolated temporary storage).`);
  } catch (error) {
    console.error('Library API regression failed:', error);
    if (childOutput) console.error('Temporary server output:\n' + childOutput);
    throw error;
  } finally {
    await stopServer();
  }
}

main().catch(() => { process.exitCode = 1; });
