import assert from 'node:assert/strict';
import {
  clearLibraryConnectorCache,
  getLibraryConnector,
  GutenbergConnector,
  InternetArchiveConnector,
  GoogleBooksConnector,
  EuropeanaConnector,
  OpenAlexConnector,
  CrossrefConnector,
  ArxivConnector,
  EuropePmcConnector,
  PmcConnector,
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

const googlePublicDomain = {
  id: 'pd-volume',
  volumeInfo: {
    title: 'Public Domain Fixture', authors: ['Test Author'], publisher: 'Fixture Press', publishedDate: '1890-01-01',
    description: 'Fixture metadata', language: 'en',
    industryIdentifiers: [{ type: 'ISBN_13', identifier: '9781234567890' }],
    imageLinks: { thumbnail: 'http://books.google.com/books/content?id=pd-volume' },
    canonicalVolumeLink: 'https://books.google.com/books?id=pd-volume',
    previewLink: 'https://books.google.com/books?id=pd-volume&pg=PA1'
  },
  accessInfo: {
    country: 'US', viewability: 'ALL_PAGES', accessViewStatus: 'FULL_PUBLIC_DOMAIN', publicDomain: true,
    webReaderLink: 'https://books.google.com/books?id=pd-volume',
    epub: { isAvailable: true, downloadLink: 'https://books.google.com/books/download?id=pd-volume&format=epub' },
    pdf: { isAvailable: true, downloadLink: 'https://books.google.com/books/download?id=pd-volume&format=pdf' },
    downloadAccess: { restricted: false }
  }
};
const googlePreview = {
  id: 'preview-volume',
  volumeInfo: { title: 'Preview Fixture', authors: ['Preview Author'], language: 'fr', publishedDate: '2020', previewLink: 'https://books.google.com/books?id=preview-volume' },
  accessInfo: { country: 'FR', viewability: 'PARTIAL', accessViewStatus: 'SAMPLE', publicDomain: false, epub: { isAvailable: true, downloadLink: 'https://books.google.com/books/download?id=preview-volume&format=epub' } }
};
const googleNoPages = {
  id: 'metadata-volume',
  volumeInfo: { title: 'Metadata Fixture', authors: ['Metadata Author'] },
  accessInfo: { country: 'US', viewability: 'NO_PAGES', accessViewStatus: 'NONE', publicDomain: false }
};
const googleRestrictedDownload = {
  id: 'restricted-volume',
  volumeInfo: { title: 'Restricted download fixture' },
  accessInfo: { country: 'US', viewability: 'ALL_PAGES', accessViewStatus: 'FULL_PUBLIC_DOMAIN', publicDomain: true, epub: { isAvailable: true, downloadLink: 'https://books.google.com/books/download?id=restricted-volume&format=epub' }, downloadAccess: { restricted: true, deviceAllowed: true } }
};
const googleUnknownDownload = {
  id: 'unknown-download-volume',
  volumeInfo: { title: 'Unknown download fixture' },
  accessInfo: { country: 'US', viewability: 'ALL_PAGES', accessViewStatus: 'FULL_PUBLIC_DOMAIN', publicDomain: true, epub: { isAvailable: true, downloadLink: 'https://books.google.com/books/download?id=unknown-download-volume&format=epub' } }
};
const europeanaItems = [
  {
    id: '/12345/pdm-item', title: ['Illuminated Manuscript'], dcCreator: ['A. Scribe'], dcDescription: ['A manuscript fixture.'],
    year: ['1450'], language: ['eng'], type: 'TEXT', dataProvider: ['Fixture Museum'], isbn: ['9781234567890'],
    edmPreview: ['https://api.europeana.eu/thumbnail/v2/12345/pdm-item.jpg'], edmIsShownAt: ['https://museum.example.org/item/1'],
    edmRights: ['http://creativecommons.org/publicdomain/mark/1.0/']
  },
  {
    id: '/12345/cc-by', title: ['Open Print'], dcCreator: ['B. Artist'], year: ['1901'], language: ['fre'], type: 'IMAGE',
    edmPreview: ['https://api.europeana.eu/thumbnail/v2/12345/cc-by.jpg'], edmRights: ['https://creativecommons.org/licenses/by/4.0/']
  },
  {
    id: '/12345/cc-by-nc', title: ['Non-commercial Photograph'], year: ['1975'],
    edmPreview: ['https://api.europeana.eu/thumbnail/v2/12345/cc-by-nc.jpg'], edmRights: ['https://creativecommons.org/licenses/by-nc/4.0/']
  },
  {
    id: '/12345/inc', title: ['Protected Archive'], type: 'TEXT',
    edmPreview: ['https://api.europeana.eu/thumbnail/v2/12345/inc.jpg'], edmRights: ['http://rightsstatements.org/vocab/InC/1.0/']
  },
  {
    id: '/12345/unknown', title: ['Unknown Rights Object'], edmPreview: ['https://images.example.invalid/private.jpg']
  }
];
const sharedAcademicDoi = '10.5555/shared-paper';
const openAlexWorks = [{
  id: 'https://openalex.org/W1234567890', doi: `https://doi.org/${sharedAcademicDoi}`,
  title: 'Open Research Fixture', publication_year: 2024, language: 'en', type: 'article',
  authorships: [{ author: { display_name: 'A. Researcher' } }],
  primary_location: { source: { display_name: 'Fixture Journal' } },
  open_access: { is_oa: true, oa_status: 'gold' },
  best_oa_location: { landing_page_url: 'https://publisher.example.org/open-paper', license: 'cc-by' }
}];
const crossrefWork = {
  DOI: sharedAcademicDoi, title: ['Crossref Scholarly Fixture'], author: [{ given: 'B.', family: 'Scholar' }],
  publisher: 'Fixture Publisher', type: 'journal-article', language: 'en',
  'published-print': { 'date-parts': [[2023, 4, 1]] }, 'container-title': ['Fixture Journal'],
  abstract: '<jats:p>Crossref abstract fixture.</jats:p>', license: [{ URL: 'https://publisher.example.org/license', 'content-version': 'vor', start: { 'date-parts': [[2023, 4, 1]] } }]
};
const arxivFeed = `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom"><entry><id>http://arxiv.org/abs/2401.12345v2</id><title> A Fixture Paper on Open Systems </title><summary>A public abstract fixture.</summary><published>2024-01-05T00:00:00Z</published><updated>2024-02-01T00:00:00Z</updated><author><name>Jane Doe</name></author><author><name>Ali Example</name></author><arxiv:doi>10.5555/shared-paper</arxiv:doi><arxiv:journal_ref>Fixture Proceedings</arxiv:journal_ref><arxiv:primary_category term="cs.AI"/><category term="cs.LG"/><link href="http://arxiv.org/pdf/2401.12345v2" title="pdf" type="application/pdf"/></entry></feed>`;
const europePmcResults = [
  { id: '9876543', source: 'MED', pmid: '9876543', pmcid: 'PMC9876543', doi: '10.5555/biomed', title: 'Europe PMC Open Article', authorString: 'M. Biologist', journalTitle: 'Open Biology Fixture', pubYear: '2022', isOpenAccess: 'Y', abstractText: 'A biomedical abstract fixture.' },
  { id: '12345678', source: 'MED', pmid: '12345678', title: 'Metadata Only Article', isOpenAccess: 'N' }
];
const pmcSummary = {
  uid: '2468', pubdate: '2021', epubdate: '2021 Sep 3', source: 'Fixture Biology',
  fulljournalname: 'Journal of Fixture Biology', title: 'A PMC Open Article Fixture',
  authors: [{ name: 'T. Scientist', authtype: 'Author' }],
  articleids: [
    { idtype: 'pmcid', value: 'PMC2468' },
    { idtype: 'pmid', value: '12345678' },
    { idtype: 'doi', value: '10.5555/pmc-article' }
  ]
};

async function testGoogleBooks() {
  const oldGoogleKey = process.env.GOOGLE_BOOKS_API_KEY;
  const oldGoogleEnabled = process.env.EARTH_ONE_LIBRARY_GOOGLEBOOKS_ENABLED;
  process.env.GOOGLE_BOOKS_API_KEY = 'connector-test-key-not-a-real-secret';
  process.env.EARTH_ONE_LIBRARY_GOOGLEBOOKS_ENABLED = 'true';
  try {
    const googleBooks = new GoogleBooksConnector();
    const googleResults = await googleBooks.search('world literature', 3);
    assert.equal(googleResults.status, 'ok');
    assert.equal(googleResults.data?.length, 3);
    const googlePD = googleResults.data?.[0];
    assert.equal(googlePD?.title, 'Public Domain Fixture');
    assert.equal(googlePD?.author, 'Test Author');
    assert.equal(googlePD?.publisher, 'Fixture Press');
    assert.equal(googlePD?.year, '1890');
    assert.deepEqual(googlePD?.isbn, ['9781234567890']);
    assert.equal(googlePD?.rights, RightsCategory.PUBLIC_DOMAIN);
    assert.match(googlePD?.rightsNote || '', /US/);
    assert.equal(googlePD?.availability, 'provider-download');
    assert.equal(googlePD?.canImport, false, 'Google Books data is never imported as local full text');
    assert.ok(googlePD?.coverImage?.startsWith('https://books.google.com/'), 'insecure image URLs are upgraded to HTTPS');
    assert.equal(googleResults.data?.[1].rights, RightsCategory.PREVIEW_ONLY);
    assert.equal(googleResults.data?.[1].availability, 'provider-preview');
    assert.equal(googleResults.data?.[1].downloadLinks?.length, 0, 'preview-only downloads are not exposed');
    assert.equal(googleResults.data?.[2].rights, RightsCategory.METADATA_ONLY);

    const isbnSearch = await googleBooks.search('978-123-456-7890', 1);
    assert.equal(isbnSearch.status, 'ok');
    const isbnRequest = requests.filter(url => url.includes('www.googleapis.com/books/v1/volumes?')).at(-1)!;
    assert.equal(new URL(isbnRequest).searchParams.get('q'), 'isbn:9781234567890');
    assert.equal((await googleBooks.search('author:Test Author', 1)).status, 'ok');
    const authorRequest = requests.filter(url => url.includes('www.googleapis.com/books/v1/volumes?')).at(-1)!;
    assert.equal(new URL(authorRequest).searchParams.get('q'), 'inauthor:Test Author');
    assert.equal(new URL(authorRequest).searchParams.get('maxResults'), '1');
    assert.equal(new URL(authorRequest).searchParams.has('key'), true, 'API key is attached only to the server-side request');
    assert.equal(googleBooks.getSourceInformation().data?.authentication, 'api-key');
    assert.equal((await googleBooks.getBook({ id: '../pd-volume' })).status, 'error');

    const googleDetails = await googleBooks.getBook({ id: 'pd-volume' });
    assert.equal(googleDetails.status, 'ok');
    assert.equal(googleDetails.data?.sourceUrl, 'https://books.google.com/books?id=pd-volume');
    const googleAvailability = await googleBooks.getAvailability({ id: 'pd-volume' });
    assert.equal(googleAvailability.status, 'ok');
    assert.equal((googleAvailability.data as any).viewability, 'ALL_PAGES');
    assert.equal((googleAvailability.data as any).downloadAvailable, true);
    const googleDownloads = await googleBooks.getDownloadLinks({ id: 'pd-volume' });
    assert.equal(googleDownloads.status, 'ok');
    assert.equal(googleDownloads.data?.length, 2);
    assertUnsupported(await googleBooks.getFullText({ id: 'pd-volume' }));
    assertUnsupported(await googleBooks.getDownloadLinks({ id: 'preview-volume' }));
    assert.deepEqual((await googleBooks.getDownloadLinks({ id: 'restricted-volume' })).data, [], 'downloads restricted by Google are withheld');
    assert.deepEqual((await googleBooks.getDownloadLinks({ id: 'unknown-download-volume' })).data, [], 'missing download restriction status fails closed');

    delete process.env.GOOGLE_BOOKS_API_KEY;
    assert.equal(isLibraryConnectorEnabled('googlebooks'), false, 'Google Books stays disabled without an API key');
    const beforeNoKey = requests.length;
    assert.equal((await googleBooks.search('not called', 1)).status, 'error');
    assert.equal(requests.length, beforeNoKey, 'missing API keys never produce external requests');
  } finally {
    if (oldGoogleKey === undefined) delete process.env.GOOGLE_BOOKS_API_KEY;
    else process.env.GOOGLE_BOOKS_API_KEY = oldGoogleKey;
    if (oldGoogleEnabled === undefined) delete process.env.EARTH_ONE_LIBRARY_GOOGLEBOOKS_ENABLED;
    else process.env.EARTH_ONE_LIBRARY_GOOGLEBOOKS_ENABLED = oldGoogleEnabled;
  }
}

async function testEuropeana() {
  const oldKey = process.env.EUROPEANA_API_KEY;
  const oldEnabled = process.env.EARTH_ONE_LIBRARY_EUROPEANA_ENABLED;
  const testKey = 'connector-test-key-not-a-real-secret';
  process.env.EUROPEANA_API_KEY = testKey;
  process.env.EARTH_ONE_LIBRARY_EUROPEANA_ENABLED = 'true';
  clearLibraryConnectorCache();
  try {
    const europeana = new EuropeanaConnector();
    const response = await europeana.search('manuscript', 10);
    assert.equal(response.status, 'ok');
    assert.equal(response.data?.length, 5);

    const pdm = response.data?.[0];
    assert.equal(pdm?.title, 'Illuminated Manuscript');
    assert.equal(pdm?.author, 'A. Scribe');
    assert.equal(pdm?.language, 'eng');
    assert.equal(pdm?.year, '1450');
    assert.deepEqual(pdm?.isbn, ['9781234567890']);
    assert.equal(pdm?.rights, RightsCategory.PUBLIC_DOMAIN);
    assert.equal(pdm?.rightsStatement, 'http://creativecommons.org/publicdomain/mark/1.0/');
    assert.equal(pdm?.licenseUrl, 'https://creativecommons.org/publicdomain/mark/1.0/');
    assert.equal(pdm?.sourceUrl, 'https://www.europeana.eu/item/12345/pdm-item');
    assert.equal(pdm?.sourceName, 'Europeana');
    assert.equal(pdm?.canImport, false, 'Europeana records are never locally imported');
    assert.deepEqual(pdm?.downloadLinks, [], 'media downloads are withheld even for public-domain records');
    assert.equal(pdm?.coverImage, 'https://api.europeana.eu/thumbnail/v2/12345/pdm-item.jpg');
    assert.equal((pdm?.metadata as any)?.resourceType, 'TEXT');
    assert.equal((pdm?.metadata as any)?.provider, 'Fixture Museum');

    const ccBy = response.data?.[1];
    assert.equal(ccBy?.rights, RightsCategory.OPEN_LICENSE);
    assert.ok(ccBy?.coverImage, 'CC BY thumbnail is allowed from a trusted Europeana host');
    assert.equal(ccBy?.licenseUrl, 'https://creativecommons.org/licenses/by/4.0/');
    const nonCommercial = response.data?.[2];
    assert.equal(nonCommercial?.rights, RightsCategory.OPEN_LICENSE);
    assert.equal(nonCommercial?.coverImage, undefined, 'non-commercial license is not assumed safe for display');
    const restricted = response.data?.[3];
    assert.equal(restricted?.rights, RightsCategory.COPYRIGHT_RESTRICTED);
    assert.equal(restricted?.coverImage, undefined);
    const unknown = response.data?.[4];
    assert.equal(unknown?.rights, RightsCategory.UNKNOWN);
    assert.equal(unknown?.coverImage, undefined, 'unknown rights and untrusted image URLs fail closed');
    assert.ok(response.data?.every(record => record.canImport === false && (record.downloadLinks || []).length === 0));
    assert.equal(JSON.stringify(response.data).includes(testKey), false, 'API key is not returned in normalized search records');

    const searchUrl = new URL(requests.find(url => url.includes('api.europeana.eu/record/v2/search.json'))!);
    assert.equal(searchUrl.searchParams.get('query'), 'manuscript');
    assert.equal(searchUrl.searchParams.get('rows'), '10');
    assert.equal(searchUrl.searchParams.get('wskey'), testKey, 'the key is sent only with the server-side API request');

    assert.equal((await europeana.search('author:Mary Shelley', 3)).status, 'ok');
    const authorUrl = new URL(requests.filter(url => url.includes('api.europeana.eu/record/v2/search.json')).at(-1)!);
    assert.equal(authorUrl.searchParams.get('query'), 'proxy_dc_creator:"Mary Shelley"');
    assert.equal(authorUrl.searchParams.get('rows'), '3');

    const detail = await europeana.getBook({ id: 'europeana:/12345/pdm-item' });
    assert.equal(detail.status, 'ok');
    assert.equal(detail.data?.title, 'Record API Manuscript');
    assert.equal(detail.data?.author, 'Record Detail Scribe');
    assert.equal(detail.data?.rights, RightsCategory.PUBLIC_DOMAIN, 'Record API aggregation rights are used');
    assert.equal((await europeana.getMetadata({ identifier: '/12345/pdm-item' })).status, 'ok');
    const availability = await europeana.getAvailability({ identifier: '/12345/pdm-item' });
    assert.equal(availability.status, 'ok');
    assert.equal((availability.data as any)?.fullText, 'unsupported');
    assertUnsupported(await europeana.getFullText({ identifier: '/12345/pdm-item' }));
    assertUnsupported(await europeana.getDownloadLinks({ identifier: '/12345/pdm-item' }));
    assert.equal((await europeana.getBook({ id: '/../unsafe' })).status, 'error', 'invalid record IDs are rejected before requests');

    const duplicate = await searchLibrary('same', { sources: ['openlibrary', 'europeana'], limit: 5 });
    assert.equal(duplicate.results.length, 1, 'exact ISBN matches are deduplicated across Europeana and existing sources');
    assert.equal(duplicate.results[0].alternateSources?.[0].source, 'europeana');
    const europeanaOnly = await searchLibrary('same', { sources: ['europeana'], limit: 5 });
    assert.equal(europeanaOnly.sources[0].status, 'ok');
    assert.equal(europeana.getSourceInformation().data?.authentication, 'api-key');
    assert.equal(JSON.stringify(europeana.getSourceInformation()).includes(testKey), false);

    process.env.EARTH_ONE_LIBRARY_EUROPEANA_ENABLED = 'false';
    assert.equal(isLibraryConnectorEnabled('europeana'), false, 'Europeana has an independent environment switch');
  } finally {
    if (oldKey === undefined) delete process.env.EUROPEANA_API_KEY;
    else process.env.EUROPEANA_API_KEY = oldKey;
    if (oldEnabled === undefined) delete process.env.EARTH_ONE_LIBRARY_EUROPEANA_ENABLED;
    else process.env.EARTH_ONE_LIBRARY_EUROPEANA_ENABLED = oldEnabled;
  }

  delete process.env.EUROPEANA_API_KEY;
  process.env.EARTH_ONE_LIBRARY_EUROPEANA_ENABLED = 'true';
  clearLibraryConnectorCache();
  try {
    assert.equal(isLibraryConnectorEnabled('europeana'), false, 'Europeana remains disabled without a server key');
    const before = requests.length;
    assert.equal((await new EuropeanaConnector().search('no key', 1)).status, 'error');
    const disabled = await searchLibrary('no key', { sources: ['europeana'] });
    assert.equal(disabled.results.length, 0);
    assert.equal(disabled.sources[0].status, 'disabled');
    assert.match(disabled.sources[0].reason || '', /EUROPEANA_API_KEY/);
    assert.equal(requests.length, before, 'no-key searches do not call Europeana');
  } finally {
    if (oldKey === undefined) delete process.env.EUROPEANA_API_KEY;
    else process.env.EUROPEANA_API_KEY = oldKey;
    if (oldEnabled === undefined) delete process.env.EARTH_ONE_LIBRARY_EUROPEANA_ENABLED;
    else process.env.EARTH_ONE_LIBRARY_EUROPEANA_ENABLED = oldEnabled;
    clearLibraryConnectorCache();
  }
}

async function testFreeAcademicConnectors() {
  clearLibraryConnectorCache();
  const openAlex = new OpenAlexConnector();
  const openAlexResponse = await openAlex.search('artificial intelligence', 2);
  assert.equal(openAlexResponse.status, 'ok', 'OpenAlex basic search works without an API key');
  const openAlexRecord = openAlexResponse.data?.[0];
  assert.equal(openAlexRecord?.title, 'Open Research Fixture');
  assert.equal(openAlexRecord?.author, 'A. Researcher');
  assert.equal(openAlexRecord?.rights, RightsCategory.OPEN_ACCESS);
  assert.equal(openAlexRecord?.canImport, false, 'OpenAlex access signals never authorize local import');
  assert.equal(openAlexRecord?.providerFullTextUrl, 'https://publisher.example.org/open-paper');
  assert.equal(openAlex.getSourceInformation().data?.authentication, 'none');
  const openAlexSearchUrl = new URL(requests.filter(url => url.includes('api.openalex.org/works?')).at(-1)!);
  assert.equal(openAlexSearchUrl.searchParams.get('search'), 'artificial intelligence');
  assert.equal(openAlexSearchUrl.searchParams.has('api_key'), false);
  const openAlexDetail = await openAlex.getBook({ id: 'W1234567890' });
  assert.equal(openAlexDetail.status, 'ok');
  assert.equal((await openAlex.getAvailability({ id: 'W1234567890' })).status, 'ok');
  assertUnsupported(await openAlex.getFullText({ id: 'W1234567890' }));
  assertUnsupported(await openAlex.getDownloadLinks({ id: 'W1234567890' }));
  assert.equal((await openAlex.getBook({ id: '../unsafe' })).status, 'error');

  const crossref = new CrossrefConnector();
  const crossrefResponse = await crossref.search('author:Fixture Scholar', 3);
  assert.equal(crossrefResponse.status, 'ok', 'Crossref public REST API works without credentials');
  const crossrefRecord = crossrefResponse.data?.[0];
  assert.equal(crossrefRecord?.title, 'Crossref Scholarly Fixture');
  assert.equal(crossrefRecord?.author, 'B. Scholar');
  assert.equal(crossrefRecord?.year, '2023');
  assert.equal(crossrefRecord?.rights, RightsCategory.METADATA_ONLY);
  assert.equal(crossrefRecord?.canImport, false);
  assert.equal(crossrefRecord?.licenseUrl, undefined, 'reported publisher license metadata is not silently asserted as reuse permission');
  assert.equal((crossrefRecord?.metadata as any)?.licenses?.[0]?.contentVersion, 'vor');
  assert.equal(crossref.getSourceInformation().data?.authentication, 'none');
  const crossrefSearchUrl = new URL(requests.filter(url => url.includes('api.crossref.org/works?')).at(-1)!);
  assert.equal(crossrefSearchUrl.searchParams.get('query.author'), 'Fixture Scholar');
  const crossrefDetail = await crossref.getBook({ doi: sharedAcademicDoi });
  assert.equal(crossrefDetail.status, 'ok');
  assert.equal(crossrefDetail.data?.sourceUrl, `https://doi.org/${sharedAcademicDoi}`);
  assert.equal((await crossref.getAvailability({ doi: sharedAcademicDoi })).status, 'ok');
  assertUnsupported(await crossref.getFullText({ doi: sharedAcademicDoi }));
  assertUnsupported(await crossref.getDownloadLinks({ doi: sharedAcademicDoi }));

  const arxiv = new ArxivConnector();
  const arxivResponse = await arxiv.search('author:Jane Doe', 4);
  assert.equal(arxivResponse.status, 'ok', 'arXiv Atom API is queried without credentials');
  const arxivRecord = arxivResponse.data?.[0];
  assert.equal(arxivRecord?.title, 'A Fixture Paper on Open Systems');
  assert.deepEqual(arxivRecord?.authors, ['Jane Doe', 'Ali Example']);
  assert.equal(arxivRecord?.year, '2024');
  assert.equal(arxivRecord?.doi, sharedAcademicDoi);
  assert.equal(arxivRecord?.sourceUrl, 'https://arxiv.org/abs/2401.12345v2');
  assert.equal(arxivRecord?.providerFullTextUrl, 'https://arxiv.org/pdf/2401.12345v2');
  assert.equal(arxivRecord?.rights, RightsCategory.OPEN_ACCESS);
  assert.equal(arxivRecord?.canImport, false);
  assert.deepEqual((arxivRecord?.metadata as any)?.categories, ['cs.AI', 'cs.LG']);
  assert.equal(arxiv.getSourceInformation().data?.authentication, 'none');
  const arxivSearchUrl = new URL(requests.filter(url => url.includes('export.arxiv.org/api/query')).at(-1)!);
  assert.equal(arxivSearchUrl.searchParams.get('search_query'), 'au:"Jane Doe"');
  assertUnsupported(await arxiv.getFullText({ id: '2401.12345v2' }));
  assertUnsupported(await arxiv.getDownloadLinks({ id: '2401.12345v2' }));
  assert.equal((await arxiv.getBook({ id: '../unsafe' })).status, 'error');

  const europePmc = new EuropePmcConnector();
  const europePmcResponse = await europePmc.search('cancer', 5);
  assert.equal(europePmcResponse.status, 'ok', 'Europe PMC search requires no API key');
  const openArticle = europePmcResponse.data?.[0];
  assert.equal(openArticle?.title, 'Europe PMC Open Article');
  assert.equal(openArticle?.rights, RightsCategory.OPEN_ACCESS);
  assert.equal(openArticle?.sourceUrl, 'https://europepmc.org/articles/PMC9876543');
  assert.equal(openArticle?.providerFullTextUrl, 'https://europepmc.org/articles/PMC9876543');
  assert.equal(openArticle?.canImport, false);
  assert.equal(europePmcResponse.data?.[1].rights, RightsCategory.METADATA_ONLY);
  assert.equal(europePmc.getSourceInformation().data?.authentication, 'none');
  const europePmcUrl = new URL(requests.filter(url => url.includes('europepmc/webservices/rest/search?')).at(-1)!);
  assert.equal(europePmcUrl.searchParams.get('query'), 'cancer');
  assertUnsupported(await europePmc.getFullText({ identifier: 'PMCID:PMC9876543' }));
  assertUnsupported(await europePmc.getDownloadLinks({ identifier: 'PMCID:PMC9876543' }));
  assert.equal((await europePmc.getBook({ id: '../unsafe' })).status, 'error');

  const pmc = new PmcConnector();
  const pmcResponse = await pmc.search('author:T. Scientist', 2);
  assert.equal(pmcResponse.status, 'ok', 'PubMed Central E-utilities search needs no API key');
  const pmcRecord = pmcResponse.data?.[0];
  assert.equal(pmcRecord?.title, 'A PMC Open Article Fixture');
  assert.equal(pmcRecord?.author, 'T. Scientist');
  assert.equal(pmcRecord?.year, '2021');
  assert.equal(pmcRecord?.doi, '10.5555/pmc-article');
  assert.equal(pmcRecord?.identifier, 'PMCID:PMC2468');
  assert.equal(pmcRecord?.rights, RightsCategory.UNKNOWN);
  assert.equal(pmcRecord?.canImport, false, 'free reading access never authorizes a local copy');
  assert.equal(pmcRecord?.sourceUrl, 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2468/');
  assert.equal(pmcRecord?.providerFullTextUrl, 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2468/');
  assert.match(pmcRecord?.rightsNote || '', /item-level license must be checked/i);
  assert.equal(pmc.getSourceInformation().data?.authentication, 'none');
  const pmcSearchUrl = new URL(requests.filter(url => url.includes('eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi')).at(-1)!);
  assert.equal(pmcSearchUrl.searchParams.get('db'), 'pmc');
  assert.match(pmcSearchUrl.searchParams.get('term') || '', /\[Author\]/);
  assert.doesNotMatch(pmcSearchUrl.searchParams.get('term') || '', /free fulltext\[filter\]/i);
  assert.equal(pmcSearchUrl.searchParams.has('api_key'), false);
  const pmcSummaryUrl = new URL(requests.filter(url => url.includes('eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi')).at(-1)!);
  assert.equal(pmcSummaryUrl.searchParams.get('id'), '2468');
  assert.equal(pmcSummaryUrl.searchParams.has('api_key'), false);
  const pmcDetail = await pmc.getBook({ id: 'pmc:2468' });
  assert.equal(pmcDetail.status, 'ok', 'PMC UID lookup returns a provider-backed record');
  assertUnsupported(await pmc.getFullText({ identifier: 'PMCID:PMC2468' }));
  assertUnsupported(await pmc.getDownloadLinks({ identifier: 'PMCID:PMC2468' }));

  clearLibraryConnectorCache();
  const duplicate = await searchLibrary('same', { sources: ['openalex', 'crossref'], limit: 3 });
  assert.equal(duplicate.results.length, 1, 'academic records merge only on an exact DOI');
  assert.equal(duplicate.results[0].alternateSources?.[0].source, 'crossref');
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
  if (url.hostname === 'www.googleapis.com' && /^\/books\/v1\/volumes\/[A-Za-z0-9_-]+$/.test(url.pathname)) {
    const id = url.pathname.split('/').at(-1);
    return json(id === 'pd-volume' ? googlePublicDomain : id === 'preview-volume' ? googlePreview : id === 'restricted-volume' ? googleRestrictedDownload : id === 'unknown-download-volume' ? googleUnknownDownload : googleNoPages);
  }
  if (url.hostname === 'www.googleapis.com' && url.pathname === '/books/v1/volumes') {
    const q = url.searchParams.get('q') || '';
    const items = q.startsWith('isbn:') ? [googlePublicDomain] : [googlePublicDomain, googlePreview, googleNoPages];
    return json({ totalItems: items.length, items });
  }
  if (url.hostname === 'api.europeana.eu' && url.pathname === '/record/v2/search.json') {
    const query = url.searchParams.get('query') || '';
    const sameBook = {
      id: '/12345/same-isbn', title: ['Same Book in Europeana'], isbn: [sameIsbn],
      edmRights: ['http://creativecommons.org/publicdomain/zero/1.0/']
    };
    return json({ success: true, apikey: 'fixture-key-echo-must-not-leak', items: query === 'same' ? [sameBook] : europeanaItems });
  }
  if (url.hostname === 'api.europeana.eu' && url.pathname === '/record/v2/12345/pdm-item.json') {
    return json({
      success: true,
      apikey: 'fixture-key-echo-must-not-leak',
      object: {
        about: '/12345/pdm-item', title: ['Record API Manuscript'], language: ['eng'], year: ['1450'], type: 'TEXT',
        proxies: [{ dcCreator: ['Record Detail Scribe'] }],
        aggregations: [{ edmRights: ['http://creativecommons.org/publicdomain/mark/1.0/'], edmPreview: ['https://api.europeana.eu/thumbnail/v2/12345/pdm-item.jpg'] }]
      }
    });
  }
  if (url.hostname === 'api.openalex.org' && /^\/works(?:\/W\d+)?$/.test(url.pathname)) {
    return json(url.pathname.endsWith('/W1234567890') ? openAlexWorks[0] : { results: openAlexWorks });
  }
  if (url.hostname === 'api.crossref.org' && /^\/works(?:\/10\.5555\/shared-paper)?$/.test(url.pathname)) {
    return json(url.pathname === '/works' ? { message: { items: [crossrefWork] } } : { message: crossrefWork });
  }
  if (url.hostname === 'export.arxiv.org' && url.pathname === '/api/query') {
    return new Response(arxivFeed, { status: 200, headers: { 'Content-Type': 'application/atom+xml' } });
  }
  if (url.hostname === 'www.ebi.ac.uk' && url.pathname === '/europepmc/webservices/rest/search') {
    return json({ resultList: { result: europePmcResults } });
  }
  if (url.hostname === 'eutils.ncbi.nlm.nih.gov' && url.pathname.endsWith('/esearch.fcgi')) {
    return json({ esearchresult: { idlist: ['2468'] } });
  }
  if (url.hostname === 'eutils.ncbi.nlm.nih.gov' && url.pathname.endsWith('/esummary.fcgi')) {
    return json({ result: { uids: ['2468'], '2468': pmcSummary } });
  }

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
  await testGoogleBooks();
  await testEuropeana();
  await testFreeAcademicConnectors();

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

  for (const id of ['openlibrary', 'archive', 'gutenberg', 'googlebooks', 'europeana', 'wikisource', 'ar_wikisource', 'openalex', 'crossref', 'arxiv', 'europepmc', 'pmc'] as const) {
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
