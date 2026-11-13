import assert from 'node:assert/strict';
import {
  clearLibraryConnectorCache,
  getLibraryConnector,
  RightsCategory,
  searchLibrary
} from '../server/integrations/libraries/index.ts';

const originalFetch = globalThis.fetch;
const envKeys = [
  'EARTH_ONE_LIBRARY_OPENLIBRARY_ENABLED',
  'EARTH_ONE_LIBRARY_ARCHIVE_ENABLED',
  'EARTH_ONE_LIBRARY_CROSSREF_ENABLED',
  'EARTH_ONE_LIBRARY_EUROPEPMC_ENABLED',
  'EARTH_ONE_LIBRARY_GUTENBERG_ENABLED'
] as const;
const originalEnv = new Map(envKeys.map(key => [key, process.env[key]]));
const requests: string[] = [];

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function sourceStatus(result: Awaited<ReturnType<typeof searchLibrary>>, source: string) {
  const status = result.sources.find(item => item.source === source);
  assert.ok(status, `missing source status for ${source}`);
  return status;
}

async function main() {
  try {
    process.env.EARTH_ONE_LIBRARY_OPENLIBRARY_ENABLED = 'true';
    process.env.EARTH_ONE_LIBRARY_ARCHIVE_ENABLED = 'true';
    process.env.EARTH_ONE_LIBRARY_CROSSREF_ENABLED = 'true';
    process.env.EARTH_ONE_LIBRARY_EUROPEPMC_ENABLED = 'true';
    process.env.EARTH_ONE_LIBRARY_GUTENBERG_ENABLED = 'false';

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      requests.push(url.toString());

      if (url.hostname === 'openlibrary.org' && url.pathname === '/search.json') {
        throw new DOMException('Provider request timed out in offline fixture', 'TimeoutError');
      }
      if (url.hostname === 'archive.org' && url.pathname === '/advancedsearch.php') {
        return new Response('forbidden fixture', { status: 403 });
      }
      if (url.hostname === 'api.crossref.org' && url.pathname === '/works') {
        return new Response('rate-limited fixture', { status: 429 });
      }
      if (url.hostname === 'www.ebi.ac.uk' && url.pathname === '/europepmc/webservices/rest/search') {
        return json({
          resultList: {
            result: [{
              source: 'MED',
              id: 'RESILIENCE-1',
              title: 'Synthetic Open Biomedical Record',
              authorString: 'Test Author',
              pubYear: '2024',
              journalTitle: 'Synthetic Journal',
              pmcid: 'PMC1234567',
              pmid: '12345678',
              doi: '10.5555/resilience-fixture',
              isOpenAccess: 'Y',
              abstractText: 'Synthetic abstract for the isolated resilience test.'
            }]
          }
        });
      }
      throw new Error(`Unexpected network request blocked by isolated test: ${url.hostname}${url.pathname}`);
    }) as typeof fetch;

    clearLibraryConnectorCache();
    const result = await searchLibrary('resilience fixture', {
      sources: ['openlibrary', 'archive', 'crossref', 'europepmc', 'gutenberg'],
      limit: 3
    });

    const timeout = sourceStatus(result, 'openlibrary');
    assert.equal(timeout.status, 'error');
    assert.equal(timeout.count, 0);
    assert.match(timeout.reason || '', /timeout|timed out/i, 'timeout is reported as a source error');

    const forbidden = sourceStatus(result, 'archive');
    assert.equal(forbidden.status, 'error');
    assert.equal(forbidden.count, 0);
    assert.match(forbidden.reason || '', /HTTP 403/);

    const rateLimited = sourceStatus(result, 'crossref');
    assert.equal(rateLimited.status, 'error');
    assert.equal(rateLimited.count, 0);
    assert.match(rateLimited.reason || '', /HTTP 429/);

    const disabled = sourceStatus(result, 'gutenberg');
    assert.equal(disabled.status, 'disabled');
    assert.equal(disabled.count, 0);
    assert.match(disabled.reason || '', /Disabled by environment configuration/);

    const available = sourceStatus(result, 'europepmc');
    assert.equal(available.status, 'ok');
    assert.equal(available.count, 1);
    assert.equal(result.results.length, 1, 'successful providers still contribute results despite peer outages');
    assert.equal(result.results[0].source, 'europepmc');
    assert.equal(result.results[0].title, 'Synthetic Open Biomedical Record');
    assert.equal(result.results[0].author, 'Test Author');
    assert.equal(result.results[0].year, '2024');
    assert.equal(result.results[0].doi, '10.5555/resilience-fixture');
    assert.equal(result.results[0].sourceUrl, 'https://europepmc.org/articles/PMC1234567');
    assert.equal(result.results[0].rights, RightsCategory.OPEN_ACCESS);
    assert.equal(result.results[0].canImport, false);
    assert.equal(requests.length, 4, 'disabled providers make no request');
    assert.equal(requests.some(url => url.includes('gutenberg.org')), false);

    // Guard the aggregator itself too: an adapter that unexpectedly rejects must
    // become one source's error status, not a whole-search HTTP 502 condition.
    clearLibraryConnectorCache();
    const openLibrary = getLibraryConnector('openlibrary');
    assert.ok(openLibrary);
    const originalSearch = openLibrary.search;
    openLibrary.search = async () => {
      throw new Error('simulated unexpected connector rejection');
    };
    try {
      const rejectedAdapter = await searchLibrary('unexpected rejection fixture', {
        sources: ['openlibrary', 'europepmc'],
        limit: 2
      });
      const failedAdapterStatus = sourceStatus(rejectedAdapter, 'openlibrary');
      assert.equal(failedAdapterStatus.status, 'error');
      assert.equal(failedAdapterStatus.count, 0);
      assert.match(failedAdapterStatus.reason || '', /simulated unexpected connector rejection/);
      assert.equal(sourceStatus(rejectedAdapter, 'europepmc').status, 'ok');
      assert.equal(rejectedAdapter.results.length, 1);
    } finally {
      openLibrary.search = originalSearch;
    }

    console.log('library connector isolation tests: PASS (all provider calls mocked; no external requests)');
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of envKeys) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    clearLibraryConnectorCache();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
