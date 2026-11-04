# WORLD LIBRARY — External Library Connector Register

Updated: 2026-11-04

## Connector design record

The first integration milestone is limited to the brief’s Phase 1–2: a normalized provider interface and real search for Open Library, Internet Archive, and Project Gutenberg, while preserving the existing Chinese and Arabic Wikisource sources. A searchable record is not evidence of a reading or download right. Every record must retain its canonical source page and an explicit rights classification; unknown rights must remain unknown. Full-text access must be revalidated server-side before import.

## Official source references verified

### Open Library

- [Open Library Search API documentation](https://openlibrary.org/dev/docs/api/search): the official endpoint is `https://openlibrary.org/search.json`; supports query/title/author search, fields, pagination, work-level records and edition information. The documented fields include work key/title/author, first publication year, cover ID, edition keys, and edition-level title/language/ISBN/publisher/publication date/ebook access. The documentation cautions that the Solr schema is not guaranteed stable.
- [Open Library APIs](https://openlibrary.org/developers/api): official API index. Work and edition JSON records use `/works/{work-id}.json` and `/books/{edition-id}.json`.
- Cover IDs can be rendered via the official Covers service, e.g. `https://covers.openlibrary.org/b/id/{cover_i}-M.jpg`.
- `ebook_access` describes access through Open Library; it is not itself a copyright or redistribution license. A public online record must not automatically be labeled public-domain or downloadable.

### Internet Archive

- [Internet Archive API index](https://archive.org/developers/index-apis.html): official API catalog, including the [Item Metadata API](https://archive.org/developers/metadata.html), item metadata read documentation, and a page for [bots and automated access](https://archive.org/developers/bots.html).
- Public metadata is available from `https://archive.org/metadata/{identifier}`; the API uses a single item identifier. Search uses the official Advanced Search endpoint at `https://archive.org/advancedsearch.php`.
- A text/OCR file, `mediatype:texts`, or the presence of an Internet Archive viewer does not establish public-domain status, borrowing availability, or a right to redistribute. Records with absent or ambiguous rights metadata must link to the official item page and expose no locally imported full text or direct download link unless rights are confirmed.

### Project Gutenberg

- [Official Offline Catalogs and Feeds](https://www.gutenberg.org/ebooks/offline_catalogs.html): identifies the OPDS catalog at `https://www.gutenberg.org/ebooks/search.opds/` for machine-to-machine discovery and provides machine-readable catalog feeds.
- [Official Robot Access Policy](https://www.gutenberg.org/policy/robot_access.html): the website is intended for human users; automated access should use the catalog feeds and not crawl pages. It warns that perceived automated website use may be blocked.
- [Official OpenSearch descriptor](https://www.gutenberg.org/catalog/osd-books.xml): its Atom template uses `query={searchTerms}` (the equivalent host path is `/ebooks/search.opds/?query=...`). Do not use `search_term`; a bounded live sample showed that it can return non-matching popular records before the desired title.
- Gutenberg public-domain statements must carry the source/jurisdiction caveat; they are not a blanket statement that each work is public domain in every reader’s country.

## Bounded connectivity checks performed during implementation

- Open Library’s official Search API returned a JSON search response for `Frankenstein` in one read-only request.
- Gutenberg’s official OPDS feed, called using the descriptor’s `query=Frankenstein`, returned matching Frankenstein entries in one read-only request. No bulk catalog or full-text download was performed.
- Internet Archive Advanced Search returned a JSON response for a one-row `mediatype:texts` query. Its record fields did not justify assuming a license; rights must be assessed per item.

## Implementation status

This register is updated alongside the implementation and test report. Provider capabilities and any sources still not integrated must be listed explicitly below after verification.


## Implemented provider milestone — 2026-11-04

The initial real connector milestone exposed five independently switchable sources through `server/integrations/libraries/`. Phase 3 added Google Books and Europeana, and Phase 4 added five no-key scholarly sources; the current registry has twelve sources through the existing `/api/library/*` surface:

- **Open Library** — official Search API (`/search.json`) plus Work/Edition JSON. Search maps available authors, language codes, first publication year, ISBN, publisher/edition metadata, and official Covers URLs. Search/record data is always classified `UNKNOWN` for rights; `ebook_access` is not treated as a license, and local full-text import, download links, and borrowability are explicitly unsupported.
- **Internet Archive** — official Advanced Search and Item Metadata APIs. Search is constrained to title, creator, or identifier plus `mediatype:texts`, following the official [Advanced Search query guidance](https://archive.org/advancedsearch.php) that field-specific search is more relevant and faster. Each item is rechecked through `/metadata/{identifier}` before a local copy; import requires recognized public-domain/open-license evidence and a listed OCR text file. Restricted, missing-rights, open-access-only, and otherwise ambiguous items are not copied. This integration does not bypass loans/DRM or claim that an item can be borrowed.
- **Project Gutenberg** — official OPDS/OpenSearch catalog (`/ebooks/search.opds/?query=...`) and per-book OPDS for revalidation. Plain text can be read when the official feed supplies it; EPUB records retain the official EPUB URL for the existing reader. The server does not download the EPUB during discovery/import. Gutenberg's public-domain label is shown with its U.S.-jurisdiction caveat; it is not presented as a worldwide legal guarantee.
- **Europeana** — official Search and Record APIs for multilingual cultural-heritage metadata, including books, manuscripts, images and archival records. `edm:rights` is mapped per object; Europeana metadata CC0 is never used as a substitute for media rights. Rights-unknown items remain official-link-only; local import and direct downloads are disabled.
- **Chinese Wikisource** and **Arabic Wikisource** — existing search capabilities are preserved and registered as connectors. Results link to their official pages and remain `UNKNOWN` for reuse until page-specific rights are established; unverified pages cannot be copied locally.

The connector interface provides `search`, `getBook`, `getMetadata`, `getAvailability`, `getFullText`, `getDownloadLinks`, and `getSourceInformation`; unsupported operations return an explicit `unsupported` status. `/api/library/connectors` is a read-only registry; `/api/library/search` reports each provider's `ok`/`error`/`disabled` status and keeps one provider's outage from failing the others. Search results are normalized with source and official-page links, rights, availability, and metadata where supplied. Cross-source deduplication uses exact normalized ISBN or DOI only; similar titles are not merged. Each source uses the shared serialized request queue (at least one second; arXiv uses at least three seconds) and 60-second response cache.

### Configuration

Open Library, Internet Archive, Project Gutenberg, Chinese Wikisource, Arabic Wikisource, OpenAlex basic search, Crossref, arXiv, Europe PMC, and PubMed Central need no API key. Google Books requires the server-side `GOOGLE_BOOKS_API_KEY`; Europeana requires the server-side `EUROPEANA_API_KEY`. Both are fail-closed when the corresponding key is absent. `.env.example` documents these keys, the optional `EARTH_ONE_LIBRARY_CONTACT_EMAIL`, and independent source switches. A source is enabled by default unless its switch is explicitly set false/off/disabled; key-backed sources additionally require their key. Keep credentials in server-side secret configuration, never in this register or client code. Europeana's official terms describe personal keys as non-production and project keys for production-scale services; use the appropriate key type for deployment.

### Still not integrated

Direct PMC BioC/OAI full-text retrieval, DOAB keyword search, Waqfeya, Shamela, Qatar Digital Library, additional Arabic repositories, richer cross-source filters, language/year/category filters, catalog refresh/new-release feeds, and an editable administration console remain future work. The PMC connector currently performs keyless E-utilities search/metadata lookup and links to the official article page; it does not retrieve full text. DOAB publishes CC0 metadata and OAI-PMH feeds, but a stable, bounded keyword-search endpoint was not verified here; the directory's candidate REST paths returned HTTP 403/429, so no bulk harvest or undocumented scraping was added. The current source registry is environment-configured and read-only, not a full sync-log/cache-health/data-review administration system. Search over the twelve registered sources is available where each source is enabled and its required credentials are present, but the brief's full multi-database academic and cultural-heritage acceptance criteria are not complete.


### Search relevance evidence

The official [Internet Archive Advanced Search page](https://archive.org/advancedsearch.php) documents Lucene-like syntax, field-specific queries, boolean grouping, and explains that restricting searches to a field is faster and more relevant. The connector uses grouped `title`, `creator`, and `identifier` phrase clauses with `mediatype:texts`; a bounded live regression confirms a `Frankenstein` query returns matching Open Library and Archive records. The live script performs only one limited query per source and does not enumerate catalogs.


The WORLD LIBRARY result and detail views display provider rights notes and a license link only when it is a valid HTTPS URL. The local-import button is fail-closed: the client requires an explicit provider `canImport: true`, and the server independently rechecks the official record and rights before saving.


## Google Books connector — Phase 3 (2026-11-04)

### Official references reviewed

- [Google Books API: Using the API](https://developers.google.com/books/docs/v1/using) documents Volume searches through `GET https://www.googleapis.com/books/v1/volumes`, the `q` search syntax (including ISBN and author fields), pagination, and API key usage/quota guidance.
- [Google Books Volumes resource](https://developers.google.com/books/docs/v1/reference/volumes) defines `volumeInfo` and `accessInfo`, including `country`, `viewability`, `accessViewStatus`, `publicDomain`, `webReaderLink`, `epub`, `pdf`, and `downloadAccess` fields used by the adapter.

### Implementation and access boundaries

`GoogleBooksConnector` uses the official Volumes API from the server. Search supports ordinary title/query text, maps `author:` to Google's `inauthor:` field, and recognizes 10/13-character ISBNs. It requests a bounded page (`maxResults` is clamped by the shared connector limit), selects only needed fields, uses the shared per-provider serialized rate limit and short cache, and removes the API key from the cache key. `GOOGLE_BOOKS_API_KEY` is server-only; `EARTH_ONE_LIBRARY_GOOGLEBOOKS_ENABLED` is an independent on/off switch. Without a configured key the source reports disabled and sends no provider request.

The adapter treats Google's fields as service-access signals, not a general reuse license. `publicDomain: true` is shown with the returned country when available and an explicit jurisdiction caveat; `PARTIAL` maps to preview-only, `NO_PAGES` to metadata-only, and ambiguous states remain unknown. It only surfaces Google-hosted EPUB/PDF links when the volume is explicitly reported public-domain, the format is available, `downloadAccess.restricted` is explicitly `false`, and the link host passes the HTTPS Google-domain allowlist. These links remain provider links: the connector does not fetch/copy the preview or full text, and `canImport` stays false for every Google Books result. `/api/library/ingest` independently refuses Google Books imports.

### Verification status

Offline tests use mocked responses for the Volume API and cover metadata/ISBN/author queries, viewability classifications, restricted/preview download gating, source information, invalid IDs, and the missing-key no-request behavior. The isolated API suite passes 21 checks and explicitly rejects local Google Books ingestion. TypeScript and production build pass. A live Google Books smoke has **not** been performed because no server API key is configured; official documentation was reviewed, but mocked responses are not evidence of current online API availability.

The source registry now exposes seven providers, including Europeana (documented below). OpenAlex, Crossref, arXiv, PubMed Central, DOAB, Waqfeya, Shamela, Qatar Digital Library and other Arabic repositories remain future work; these connectors do not complete the full WORLD LIBRARY brief.

## Europeana connector — Phase 3 (2026-11-04)

### Official references reviewed

- [Europeana Search API documentation](https://europeana.atlassian.net/wiki/spaces/EF/pages/2385739812/Search+API+Documentation) documents `GET https://api.europeana.eu/record/v2/search.json`, the `query` and `rows` parameters, metadata results, and the `edm:rights`/`edmPreview` concepts.
- [Europeana Record API documentation](https://europeana.atlassian.net/wiki/spaces/EF/pages/2385674279/Record+API+Documentation) documents `GET https://api.europeana.eu/record/v2/{dataset}/{local_id}.json?wskey=...` for one Europeana ID.
- [Accepted rights statements and URIs](https://europeana.atlassian.net/wiki/spaces/EF/pages/1503756289/Accepted+rights+statements+and+URIs) lists CC licenses/tools and Rights Statements used by providers. [Europeana Terms of Use](https://www.europeana.eu/en/rights/terms-of-use) distinguish CC0 metadata from digital-object media, whose use follows the item's rights statement.
- [Get an API key](https://pro.europeana.eu/page/get-api) explains account-based API key management. Europeana's terms say personal keys are intended for non-production use and project keys for production-scale applications.

### Implementation and rights boundaries

`EuropeanaConnector` uses the official Search API for multilingual free-text search and maps `author:` to `proxy_dc_creator`. It maps official record identifiers, titles, creators, language, year, item type, provider, descriptions, ISBN/DOI when supplied, record pages and recognized rights URLs. `/api/library/search` includes Europeana in the same parallel source registry as the existing providers, preserving per-source status/outage isolation, rate limiting, caching and exact ISBN/DOI deduplication.

Rights classification is based only on the individual digital object's `edm:rights` URI: CC0/Public Domain Mark → `PUBLIC_DOMAIN`; recognized CC licenses → `OPEN_LICENSE`; known InC/NoC restrictions → `COPYRIGHT_RESTRICTED`; unrecognized, missing, conflicting and CNE statements → `UNKNOWN`. The generic category `OPEN_LICENSE` does not erase license restrictions: the rights note keeps item-level terms visible, and thumbnails are only returned for PDM/CC0 or CC BY/CC BY-SA records with a trusted HTTPS Europeana host. Europeana metadata's CC0 status is never treated as proof that the underlying image, manuscript or text is reusable.

Every Europeana record has `canImport: false`. Full text and direct download links return explicit `unsupported`; the client displays only the official Europeana record page and any eligible thumbnail, and `/api/library/ingest` independently returns 403 for Europeana when enabled (503 while disabled). This first connector does not claim reading, borrowing, download or redistribution access.

### Configuration and verification

Set `EUROPEANA_API_KEY` only in the server environment and leave `EARTH_ONE_LIBRARY_EUROPEANA_ENABLED` enabled to activate the provider. Without a non-empty key, the registry reports `enabled: false`, unified search reports a `disabled` source reason, and no Europeana request is sent. The official API accepts `wskey`; the adapter removes it from the shared cache key and sanitizes the API response's echoed `apikey` field before caching/returning data. A real key is not configured in the current environment; the `.env.example` entry is blank, not a usable credential.

Offline mock tests cover Search/Record API mapping, multilingual/author query construction, rights-status categories, object-thumbnail eligibility and host allowlisting, unsupported reading/download operations, identifier validation, exact ISBN deduplication, and missing-key no-request behavior. TypeScript, connector tests, isolated library API tests (23 checks), general API tests (85 checks), and production build pass. No live Europeana smoke was run because no key is configured; mock success does not prove live API or quota availability.


The shared WORLD LIBRARY result card now surfaces each provider's availability/error/disabled reason, item type and identifiers when supplied, reading/availability label, download-link status, rights note and official record URL. This is a functional metadata/status integration, not a replacement for live connectors; no browser visual regression was run for this UI change.


### No-key scholarly sources (implemented 2026-11-04)

Five independent scholarly discovery connectors are now registered and included in the default unified search. They use no user-provided key or account, have independent environment switches, and can be disabled individually. Their public APIs remain subject to provider terms, fair-use limits, and availability.

- **OpenAlex** uses the official [OpenAlex API](https://help.openalex.org/api/). Basic HTTP queries are free and do not require a key; OpenAlex metadata is CC0, but the underlying article is not thereby cleared for copying. The connector labels `is_oa` only as `OPEN_ACCESS`, provides the OpenAlex work page and a provider landing link only when supplied over HTTPS, and never imports article text.
- **Crossref** uses its [public REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) and [access guidance](https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/). No sign-up or key is required. An already-configured `EARTH_ONE_LIBRARY_CONTACT_EMAIL` is sent as `mailto` when available; no setup is requested. Publisher `license[]` fields are retained as provenance metadata, not asserted as reuse rights; records stay metadata-only.
- **arXiv** uses the [official Atom API](https://info.arxiv.org/help/api/user-manual.html), supports ordinary, author, title, and abstract query prefixes, and preserves versions, DOI, and categories. The shared request queue waits at least three seconds between arXiv requests. An HTTPS PDF link is surfaced only if the API explicitly returns an arXiv-hosted PDF link; it is a provider reading link, not a local download or import grant.
- **Europe PMC** uses the [official REST service](https://europepmc.org/RestfulWebService). Search is keyless. A reported open-access item with a validated PMCID may link to its official Europe PMC article page. The OA flag indicates access, not permission to reuse; no full text is copied locally.
- **PubMed Central (PMC)** uses official NCBI E-utilities [`ESearch`](https://www.ncbi.nlm.nih.gov/books/NBK25499/) and `ESummary` without an API key. Searches return PMC bibliographic records and official PMC article-page links; rights stay `UNKNOWN` unless an item-level license is independently verified. The official page controls reading access; this connector does not copy article text or provide local downloads. The shared serialized source queue spaces requests by at least one second, below NCBI's recommended maximum of three requests per second.

All five connectors explicitly return `canImport: false`, no `downloadLinks`, and `unsupported` for connector-side full-text extraction/download operations. The API independently rejects local imports from these sources with HTTP 403. The UI displays official provider reading links separately from downloads and shows that reuse rights must be checked at item level. DOI deduplication remains exact-match only. The switches are `EARTH_ONE_LIBRARY_OPENALEX_ENABLED`, `EARTH_ONE_LIBRARY_CROSSREF_ENABLED`, `EARTH_ONE_LIBRARY_ARXIV_ENABLED`, `EARTH_ONE_LIBRARY_EUROPEPMC_ENABLED`, and `EARTH_ONE_LIBRARY_PMC_ENABLED`; all default to enabled and require no key.

A bounded live smoke on 2026-11-04 returned at least one record from each of the five APIs. The reusable `npm run test:library-connectors:live` script checks these sources together with the existing Open Library, Internet Archive, and Project Gutenberg flow. An older PMC `free fulltext[filter]` example documented by NCBI returned zero records in the current live endpoint, so the connector does not rely on that filter; it conservatively marks PMC article rights `UNKNOWN`. This does not imply exhaustive catalog coverage or that every record has an accessible full-text page. PMC BioC/OAI full-text retrieval, DOAB keyword search, and additional Arabic/cultural-heritage repositories remain future work.


### Phase 4 follow-up: PMC integrated; DOAB official interfaces reviewed

- **PubMed Central:** [PMC developer tools](https://pmc.ncbi.nlm.nih.gov/tools/developers/) documents E-utilities, OAI-PMH, BioC, and the ID Converter. The [PMC OAI-PMH guide](https://pmc.ncbi.nlm.nih.gov/tools/oai/) states that full text is exposed only for articles whose licenses/usage rights allow reuse, identifies `set=pmc-open`, limits requests to 3 requests per second, and advises against concurrent/high-volume retrieval. The [BioC PMC guide](https://www.ncbi.nlm.nih.gov/research/bionlp/APIs/BioC-PMC/) covers OA-subset full text in XML/JSON and warns that not all PMC articles are in that subset. [NCBI E-utilities guidance](https://www.ncbi.nlm.nih.gov/books/NBK25497/) documents no-key access and request limits. The implemented adapter uses official `ESearch` and `ESummary` for bounded search/metadata and links to the provider page; it does not use bulk/full-text retrieval. Live smoke returned PMC records without a key. The documented legacy `free fulltext[filter]` query returned zero in the current endpoint, so results are marked rights `UNKNOWN` and require item-level review.
- **DOAB:** its [official metadata page](https://www.doabooks.org/en/librarians/doab-metadata) says metadata is CC0 and documents OAI-PMH (`https://directory.doabooks.org/oai/request`), full metadata records, downloadable feeds, and a book/publisher-specific PRISM REST API. The OAI-PMH record endpoint is paged (the guide limits ListRecords batches and uses resumption tokens), not a per-query title search. Attempts to validate the directory search/REST paths from this environment received HTTP 403/429. The source is therefore not added via undocumented scraping or bulk harvesting; a stable, bounded official keyword-search API still needs to be verified. This is an integration limitation, not a user key/setup requirement.
