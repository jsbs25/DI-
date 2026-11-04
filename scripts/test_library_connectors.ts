import assert from 'node:assert/strict';
import {
  clearLibraryConnectorCache,
  getLibraryConnector,
  GutenbergConnector,
  InternetArchiveConnector,
  isLibraryConnectorEnabled,
  OpenLibraryConnector,
  RightsCategory,
  searchLibrary
} from '../server/integrations/libraries/index.ts';

const originalFetch = globalThis.fetch;
const requests: string[] = [];
const sameIsbn = '9781234567890';
const gutenbergFeed = (title = 'Alice Fixture', withFiles = true, useUrnId = false) => `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/"><entry><title>${title}</title><author><name>Lewis Carroll</name></author><dc:language>en</dc:language><id>${useUrnId ? 'urn:gutenberg:11:2' : 'https://www.gutenberg.org/ebooks/11'}</id>${withFiles ? '<link href="https://www.gutenberg.org/files/11/11-0.txt" type="text/plain"/><link href="https://www.gutenberg.org/ebooks/11.epub.images" type="application/epub+zip"/>' : ''}</entry></feed>`;
const gutenbergText = `Title: Alice Fixture\nAuthor: Lewis Carroll\n\n*** START OF THE PROJECT GUTENBERG EBOOK ALICE FIXTURE ***\n\nCHAPTER I\n\nAlice was beginning to get very tired of sitting by her sister on the bank.\n\n*** END OF THE PROJECT GUTENBERG EBOOK ALICE FIXTURE ***`;

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function archiveDoc(query: string) {
  if (query.includes('same')) return [{ identifier: 'item-same', title: 'Same Book — Archive Edition', isbn: [sameIsbn], rights: '', restricted: false, format: ['DjVuTXT'] }];
  if (query.includes('open')) return [{ identifier: 'item-open', title: 'Open Rights', rights: 'CC BY 4.0', restricted: false, format: ['DjVuTXT'] }];
  return [{ identifier: 'item-unknown', title: 'Unknown Rights', rights: '', restricted: false, format: ['DjVuTXT'] }];
}

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input));
  requests.push(url.toString());

  if (url.hostname === 'openlibrary.org' && url.pathname === '/search.json') {
    const q = url.searchParams.get('q') || '';
    if (q === 'same') {
      return json({ docs: [{ key: '/works/OL3W', title: 'Same Book', author_name: ['A. Author'], isbn: [sameIsbn], language: ['eng'] }] });
    }
    return json({ docs: [
      { key: '/works/OL1W', title: 'Example Book', author_name: ['A. Author'], first_publish_year: 1900, cover_i: 42, language: ['eng'], isbn: ['1111111111'], editions: { docs: [{ publisher: ['Example Press'], ebook_access: 'public' }] } },
      { key: '/works/OL2W', title: 'Example Book: A Similar Title', author_name: ['B. Author'], isbn: ['2222222222'] }
    ] });
  }
  if (url.hostname === 'openlibrary.org' && url.pathname === '/works/OL1W.json') return json({ title: 'Example Book', description: 'Metadata only' });

  if (url.hostname === 'archive.org' && url.pathname === '/advancedsearch.php') {
    return json({ response: { docs: archiveDoc(url.searchParams.get('q') || '') } });
  }
  if (url.hostname === 'archive.org' && url.pathname === '/metadata/item-unknown') {
    return json({ metadata: { title: 'Unknown Rights', restricted: false }, files: [{ name: 'item-unknown_djvu.txt' }] });
  }
  if (url.hostname === 'archive.org' && url.pathname === '/metadata/item-restricted') {
    return json({ metadata: { title: 'Restricted Rights', rights: 'CC BY 4.0', licenseurl: 'https://creativecommons.org/licenses/by/4.0/', restricted: ' TrUe ' }, files: [{ name: 'item-restricted_djvu.txt' }] });
  }
  if (url.hostname === 'archive.org' && url.pathname === '/metadata/item-access-restricted') {
    return json({ metadata: { title: 'Access Restricted', rights: 'CC BY 4.0', 'access-restricted-item': 'TRUE' }, files: [{ name: 'item-access-restricted_djvu.txt' }] });
  }
  if (url.hostname === 'archive.org' && url.pathname === '/metadata/item-open') {
    return json({ metadata: { title: 'Open Rights', rights: 'CC BY 4.0', licenseurl: 'https://creativecommons.org/licenses/by/4.0/' }, files: [{ name: 'item-open_djvu.txt' }] });
  }
  if (url.hostname === 'archive.org' && url.pathname === '/download/item-open/item-open_djvu.txt') {
    return new Response('Title: Open Rights\nAuthor: Test Author\n\nThis is a sufficiently long paragraph of licensed OCR text for an offline integration test.', { status: 200 });
  }

  if (url.hostname === 'www.gutenberg.org' && url.pathname === '/ebooks/search.opds/') {
    assert.equal(url.searchParams.get('query'), 'alice');
    assert.equal(url.searchParams.has('search_term'), false);
    return new Response(gutenbergFeed('Alice Fixture', false), { status: 200, headers: { 'Content-Type': 'application/atom+xml' } });
  }
  if (url.hostname === 'www.gutenberg.org' && url.pathname === '/ebooks/11.opds') {
    return new Response(gutenbergFeed('Alice Fixture', true, true), { status: 200, headers: { 'Content-Type': 'application/atom+xml' } });
  }
  if (url.hostname === 'www.gutenberg.org' && url.pathname === '/files/11/11-0.txt') {
    return new Response(gutenbergText, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return new Response('unmocked network request blocked by test', { status: 599 });
}) as typeof fetch;

function assertUnsupported(response: { status: string; reason?: string }) {
  assert.equal(response.status, 'unsupported');
  assert.ok(response.reason);
}

async function main() {
  clearLibraryConnectorCache();
  const openLibrary = new OpenLibraryConnector();
  const olResults = await openLibrary.search('example');
  assert.equal(olResults.status, 'ok');
  assert.equal(olResults.data?.length, 2, 'similar titles with distinct identifiers remain separate');
  assert.equal(olResults.data?.[0].rightsClassification, RightsCategory.UNKNOWN);
  assert.equal(olResults.data?.[0].canImport, false);
  assert.equal(olResults.data?.[0].sourceUrl, 'https://openlibrary.org/works/OL1W');
  assert.match(requests.find(url => url.includes('openlibrary.org/search.json')) || '', /fields=/, 'explicit Open Library schema fields are requested');
  assertUnsupported(await openLibrary.getAvailability({}));
  assertUnsupported(await openLibrary.getFullText({ id: '/works/OL1W' }));
  assertUnsupported(await openLibrary.getDownloadLinks({}));

  const gutenberg = new GutenbergConnector();
    const gutenbergResults = await gutenberg.search('alice');
    assert.equal(gutenbergResults.status, 'ok');
    assert.equal(gutenbergResults.data?.[0].rights, RightsCategory.PUBLIC_DOMAIN);
    assert.equal(gutenbergResults.data?.[0].externalId, '11');
    assert.equal(gutenbergResults.data?.[0].language, 'en', 'Gutenberg language is read from a namespaced OPDS field');
    assert.equal(gutenbergResults.data?.[0].textUrl, undefined, 'search feed may only include metadata and a book ID');
  assert.equal(gutenbergResults.data?.[0].canImport, true);
  assert.equal(gutenbergResults.data?.[0].availability, 'verify-official-opds');
  assert.match(gutenbergResults.data?.[0].rightsNote || '', /U\.S\./);
  const gutenbergMetadata = await gutenberg.getMetadata({ id: '11' });
  assert.equal(gutenbergMetadata.status, 'ok');
  assert.equal(gutenbergMetadata.data?.title, 'Alice Fixture');
  assert.equal(gutenbergMetadata.data?.textUrl, 'https://www.gutenberg.org/files/11/11-0.txt');
  assert.equal(gutenbergMetadata.data?.epubUrl, 'https://www.gutenberg.org/ebooks/11.epub.images');
  const gutenbergFullText = await gutenberg.getFullText({ id: '11' });
  assert.equal(gutenbergFullText.status, 'ok');
  assert.ok((gutenbergFullText.data?.chapters.length ?? 0) >= 1);
  assert.equal((await gutenberg.getFullText({ id: '../11' })).status, 'error');

  const archive = new InternetArchiveConnector();
  const unknown = await archive.getBook({ identifier: 'item-unknown' });
  assert.equal(unknown.status, 'ok');
  assert.equal(unknown.data?.rights, RightsCategory.UNKNOWN);
  assert.equal(unknown.data?.canImport, false);
  assertUnsupported(await archive.getFullText({ identifier: 'item-unknown' }));
  assertUnsupported(await archive.getDownloadLinks({ identifier: 'item-unknown' }));
  for (const identifier of ['item-restricted', 'item-access-restricted']) {
    const restricted = await archive.getBook({ identifier });
    assert.equal(restricted.data?.rights, RightsCategory.UNKNOWN, `${identifier} rights remain unknown despite a CC license when restricted`);
    assert.equal(restricted.data?.canImport, false, `${identifier} cannot be imported`);
    assertUnsupported(await archive.getFullText({ identifier }));
  }
  const openRecord = await archive.getBook({ identifier: 'item-open' });
  assert.equal(openRecord.data?.licenseUrl, 'https://creativecommons.org/licenses/by/4.0/');
  const openText = await archive.getFullText({ identifier: 'item-open' });
  assert.equal(openText.status, 'ok');
  assert.ok((openText.data?.chapters.length ?? 0) >= 1);
  const openLinks = await archive.getDownloadLinks({ identifier: 'item-open' });
  assert.equal(openLinks.status, 'ok');
  assert.equal(openLinks.data?.length, 1);
  assert.equal((await archive.getFullText({ identifier: '../item-open' })).status, 'error');

  const exactDuplicate = await searchLibrary('same', { sources: ['openlibrary', 'archive'], limit: 10 });
  assert.equal(exactDuplicate.results.length, 1, 'exact ISBN duplicates are merged');
  assert.equal(exactDuplicate.results[0].alternateSources?.[0].source, 'archive');
  const archiveSearchUrl = new URL(requests.find(url => url.includes('archive.org/advancedsearch.php'))!);
  assert.equal(archiveSearchUrl.searchParams.get('q'), '(title:"same" OR creator:"same" OR identifier:"same") AND mediatype:texts');
  const similar = await searchLibrary('example', { sources: ['openlibrary'], limit: 10 });
  assert.equal(similar.results.length, 2, 'similar titles are not fuzzy-merged');

  const oldToggle = process.env.EARTH_ONE_LIBRARY_OPENLIBRARY_ENABLED;
  process.env.EARTH_ONE_LIBRARY_OPENLIBRARY_ENABLED = 'false';
  assert.equal(isLibraryConnectorEnabled('openlibrary'), false);
  const disabled = await searchLibrary('example', { sources: ['openlibrary'] });
  assert.equal(disabled.results.length, 0);
  assert.equal(disabled.sources[0].status, 'disabled');
  if (oldToggle === undefined) delete process.env.EARTH_ONE_LIBRARY_OPENLIBRARY_ENABLED;
  else process.env.EARTH_ONE_LIBRARY_OPENLIBRARY_ENABLED = oldToggle;

  for (const id of ['openlibrary', 'archive', 'gutenberg', 'wikisource', 'ar_wikisource'] as const) {
    assert.ok(getLibraryConnector(id));
  }
  console.log('library connector offline tests: PASS');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  globalThis.fetch = originalFetch;
});
