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

The initial real connector milestone exposed five independently switchable sources through `server/integrations/libraries/`. Phase 3 added Google Books and Europeana, Phase 4 added five no-key scholarly sources, and a Phase 4 follow-up added PubMed, bringing the registry to thirteen at that checkpoint. Phase 5 below adds Shamela as source 14 through the existing `/api/library/*` surface:

- **Open Library** — official Search API (`/search.json`) plus Work/Edition JSON. Search maps available authors, language codes, first publication year, ISBN, publisher/edition metadata, official Covers URLs, and the edition-level `ebook_access` signal. Exact `public` maps to `OPEN_ACCESS` and exact `borrowable` to `BORROWABLE`; other or missing values stay `UNKNOWN`. These describe provider access, not copyright/reuse permission; `canImport` is always false. No direct download or local full-text import is enabled, and live `getAvailability` remains explicitly unsupported.
- **Internet Archive** — official Advanced Search and Item Metadata APIs. Search is constrained to title, creator, or identifier plus `mediatype:texts`, following the official [Advanced Search query guidance](https://archive.org/advancedsearch.php) that field-specific search is more relevant and faster. Each item is rechecked through `/metadata/{identifier}` before a local copy; import requires recognized public-domain/open-license evidence and a listed OCR text file. Restricted, missing-rights, open-access-only, and otherwise ambiguous items are not copied. This integration does not bypass loans/DRM or claim that an item can be borrowed.
- **Project Gutenberg** — official OPDS/OpenSearch catalog (`/ebooks/search.opds/?query=...`) and per-book OPDS for revalidation. Plain text can be read when the official feed supplies it; EPUB records retain the official EPUB URL for the existing reader. The server does not download the EPUB during discovery/import. Gutenberg's public-domain label is shown with its U.S.-jurisdiction caveat; it is not presented as a worldwide legal guarantee.
- **Europeana** — official Search and Record APIs for multilingual cultural-heritage metadata, including books, manuscripts, images and archival records. `edm:rights` is mapped per object; Europeana metadata CC0 is never used as a substitute for media rights. Rights-unknown items remain official-link-only; local import and direct downloads are disabled.
- **Chinese Wikisource** and **Arabic Wikisource** — existing search capabilities are preserved and registered as connectors. Results link to their official pages and remain `UNKNOWN` for reuse until page-specific rights are established; unverified pages cannot be copied locally.

The connector interface provides `search`, `getBook`, `getMetadata`, `getAvailability`, `getFullText`, `getDownloadLinks`, and `getSourceInformation`; unsupported operations return an explicit `unsupported` status. `/api/library/connectors` is a read-only registry; `/api/library/search` reports each provider's `ok`/`error`/`disabled`/`unsupported` status and keeps one provider's outage from failing the others. Search results are normalized with source and official-page links, rights, availability, and metadata where supplied. Exact-match deduplication uses checksum-valid ISBN identities (ISBN-10 canonicalized to its equivalent ISBN-13), normalized DOI, or an exact source ID scoped to its provider. Conflicting DOI identities and disjoint valid ISBN sets block a merge; distinct editions and titles that merely look alike remain separate. The primary record's rights are not inferred from its alternate links. Most sources use the shared serialized request queue and 60-second response cache (arXiv requests are at least three seconds apart). Shamela uses the same per-source serialized lane with a two-second minimum interval, but its MCP response is deliberately excluded from caching because it may include book text.

### Configuration

Open Library, Internet Archive, Project Gutenberg, Chinese Wikisource, Arabic Wikisource, OpenAlex basic search, Crossref, arXiv, Europe PMC, PubMed Central, PubMed, and Shamela need no API key. Shamela uses its official free, read-only MCP service and needs no Shamela account. Google Books requires the server-side `GOOGLE_BOOKS_API_KEY`; Europeana requires the server-side `EUROPEANA_API_KEY`. Both are fail-closed when the corresponding key is absent. `.env.example` documents these keys, the optional `EARTH_ONE_LIBRARY_CONTACT_EMAIL`, and independent source switches. A source is enabled by default unless its switch is explicitly set false/off/disabled; key-backed sources additionally require their key. Keep credentials in server-side secret configuration, never in this register or client code. Europeana's official terms describe personal keys as non-production and project keys for production-scale services; use the appropriate key type for deployment.

### Still not integrated

Direct PMC BioC/OAI full-text retrieval, DOAB keyword search, additional Arabic repositories, richer cross-source filters, language/year/category filters, catalog refresh/new-release feeds, and an editable administration console remain future work. Shamela is now integrated; Waqfeya and Qatar Digital Library are verified official link-only portals because a supported machine-search API was not confirmed. PMC and PubMed use bounded, keyless E-utilities search/metadata lookup and official provider pages; neither retrieves article text locally. DOAB publishes CC0 metadata and OAI-PMH feeds, but a stable, bounded keyword-search endpoint was not verified here; the directory's candidate REST paths returned HTTP 403/429, so no bulk harvest or undocumented scraping was added. The current 14-source registry is environment-configured and read-only, not a full sync-log/cache-health/data-review administration system. Search over the 14 registered sources is available where each source is enabled and its required credentials are present, but the brief's full multi-database academic and cultural-heritage acceptance criteria are not complete.


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

At the end of the earlier Europeana phase, the source registry exposed seven providers. The later Phase 4 sections below document OpenAlex, Crossref, arXiv, Europe PMC, PubMed Central and PubMed. At that earlier checkpoint, DOAB and the Arabic/cultural-heritage sources remained future work. Phase 5 later adds Shamela as a connector; Waqfeya and Qatar Digital Library now have official link-only entries, not machine-search integrations. Current connectors still do not complete the full WORLD LIBRARY brief.

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

Six independent scholarly discovery connectors are now registered and included in the default unified search. They use no user-provided key or account, have independent environment switches, and can be disabled individually. Their public APIs remain subject to provider terms, fair-use limits, and availability.

- **OpenAlex** uses the official [OpenAlex API](https://help.openalex.org/api/). Basic HTTP queries are free and do not require a key; OpenAlex metadata is CC0, but the underlying article is not thereby cleared for copying. The connector supports ordinary/DOI Works searches plus explicit `author:<name>` and `institution:<name>` profile discovery through the official Authors and Institutions endpoints. Work results retain the existing `is_oa` mapping; author/institution records are `METADATA_ONLY`. All records link to OpenAlex profiles and never import article text.
- **Crossref** uses its [public REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) and [access guidance](https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/). No sign-up or key is required. An already-configured `EARTH_ONE_LIBRARY_CONTACT_EMAIL` is sent as `mailto` when available; no setup is requested. Publisher `license[]` fields are retained as provenance metadata, not asserted as reuse rights; records stay metadata-only.
- **arXiv** uses the [official Atom API](https://info.arxiv.org/help/api/user-manual.html), supports ordinary, author, title, and abstract query prefixes, and preserves versions, DOI, and categories. The shared request queue waits at least three seconds between arXiv requests. An HTTPS PDF link is surfaced only if the API explicitly returns an arXiv-hosted PDF link; it is a provider reading link, not a local download or import grant.
- **Europe PMC** uses the [official REST service](https://europepmc.org/RestfulWebService). Search is keyless. A reported open-access item with a validated PMCID may link to its official Europe PMC article page. The OA flag indicates access, not permission to reuse; no full text is copied locally.
- **PubMed Central (PMC)** uses official NCBI E-utilities [`ESearch`](https://www.ncbi.nlm.nih.gov/books/NBK25499/) and `ESummary` without an API key. Searches return PMC bibliographic records and official PMC article-page links; rights stay `UNKNOWN` unless an item-level license is independently verified. The official page controls reading access; this connector does not copy article text or provide local downloads. The shared serialized source queue spaces requests by at least one second, below NCBI's recommended maximum of three requests per second.
- **PubMed** uses the same official NCBI E-utilities [`ESearch`](https://www.ncbi.nlm.nih.gov/books/NBK25499/) and `ESummary` endpoints against the separate `pubmed` database; the public [PubMed index](https://pubmed.ncbi.nlm.nih.gov/) needs no account or API key for bounded searches. It supports ordinary term, `author:`, `title:`, PMID, PMCID and DOI queries; the official [PubMed field-tag guide](https://www.ncbi.nlm.nih.gov/books/NBK3827/) documents the `[AU]`, `[TI]`, `[PMC]` and `[AID]` tags used by the adapter (DOIs are Article Identifiers). Results are bibliographic records linked to the official PubMed page, classified `METADATA_ONLY`; a linked PMCID is not treated as proof of full-text access. The visible rights note warns that abstracts may contain copyrighted material and links to the [NCBI/NLM disclaimer](https://www.ncbi.nlm.nih.gov/About/disclaimer.html). Full-text extraction, downloads and local import remain unsupported. PubMed and PMC share one serialized NCBI request queue with a minimum one-second interval.

All six connectors explicitly return `canImport: false`, no `downloadLinks`, and `unsupported` for connector-side full-text extraction/download operations. The API independently rejects local imports from these sources with HTTP 403. The UI displays official provider reading links separately from downloads and shows that reuse rights must be checked at item level. DOI deduplication remains exact-match only, including across PubMed and other indexes. The switches are `EARTH_ONE_LIBRARY_OPENALEX_ENABLED`, `EARTH_ONE_LIBRARY_CROSSREF_ENABLED`, `EARTH_ONE_LIBRARY_ARXIV_ENABLED`, `EARTH_ONE_LIBRARY_EUROPEPMC_ENABLED`, `EARTH_ONE_LIBRARY_PMC_ENABLED`, and `EARTH_ONE_LIBRARY_PUBMED_ENABLED`; all default to enabled and require no key.

A bounded live smoke on 2026-11-04 returned at least one record from each of the six APIs. The reusable `npm run test:library-connectors:live` script checks these sources together with the existing Open Library, Internet Archive, and Project Gutenberg flow. An older PMC `free fulltext[filter]` example documented by NCBI returned zero records in the current live endpoint, so the PMC connector does not rely on that filter; it conservatively marks PMC article rights `UNKNOWN`. PubMed results remain bibliographic metadata and do not imply an accessible full-text page. This does not imply exhaustive catalog coverage. PMC BioC/OAI full-text retrieval, DOAB keyword search, and additional Arabic/cultural-heritage repositories remain future work.


### Phase 4 follow-up: PMC and PubMed integrated; DOAB official interfaces reviewed

- **PubMed Central:** [PMC developer tools](https://pmc.ncbi.nlm.nih.gov/tools/developers/) documents E-utilities, OAI-PMH, BioC, and the ID Converter. The [PMC OAI-PMH guide](https://pmc.ncbi.nlm.nih.gov/tools/oai/) states that full text is exposed only for articles whose licenses/usage rights allow reuse, identifies `set=pmc-open`, limits requests to 3 requests per second, and advises against concurrent/high-volume retrieval. The [BioC PMC guide](https://www.ncbi.nlm.nih.gov/research/bionlp/APIs/BioC-PMC/) covers OA-subset full text in XML/JSON and warns that not all PMC articles are in that subset. [NCBI E-utilities guidance](https://www.ncbi.nlm.nih.gov/books/NBK25497/) documents no-key access and request limits. The implemented adapter uses official `ESearch` and `ESummary` for bounded search/metadata and links to the provider page; it does not use bulk/full-text retrieval. Live smoke returned PMC records without a key. The documented legacy `free fulltext[filter]` query returned zero in the current endpoint, so results are marked rights `UNKNOWN` and require item-level review.
- **PubMed:** NCBI's [E-utilities documentation](https://www.ncbi.nlm.nih.gov/books/NBK25497/) describes the official Entrez programmatic interface. The adapter queries `db=pubmed` with ESearch, then retrieves bounded bibliographic details with ESummary; this is separate from PMC (`db=pmc`) and requires no user key. PMID, PMCID and DOI lookups resolve to the official [PubMed record page](https://pubmed.ncbi.nlm.nih.gov/). PubMed and PMC share a serialized request lane to keep combined calls below the documented request rate. PubMed is not an article-full-text feed: rights remain `METADATA_ONLY`, and the connector never copies article text.
- **DOAB:** its [official metadata page](https://www.doabooks.org/en/librarians/doab-metadata) says metadata is CC0 and documents OAI-PMH (`https://directory.doabooks.org/oai/request`), full metadata records, downloadable feeds, and a book/publisher-specific PRISM REST API. The OAI-PMH record endpoint is paged (the guide limits ListRecords batches and uses resumption tokens), not a per-query title search. Attempts to validate the directory search/REST paths from this environment received HTTP 403/429. The source is therefore not added via undocumented scraping or bulk harvesting; a stable, bounded official keyword-search API still needs to be verified. This is an integration limitation, not a user key/setup requirement.


## Phase 5：阿拉伯语馆藏（2026-11-04）

### Official source references verified
- [Shamela 官方网站](https://shamela.ws/)说明网站提供阿拉伯语书籍内容搜索；[官方搜索页](https://shamela.ws/search)可以按书籍内容、书名和作者搜索。
- [Shamela 官方 MCP 连接指南](https://shamela.ws/mcp-guide/)公开服务器 `https://mcp.shamela.ws`，标明免费只读接入、不需 API key 或 Shamela 账号；指南示例连接该 MCP 服务。当前在线 `tools/list` 确认了 `shamela_find` 等只读工具，连接器仅调用 `shamela_find`。
- [Waqfeya 官方书目目录](https://waqfeya.net/books)和[官网](https://waqfeya.net/)显示其为扫描书及目录馆藏。定向核验未找到公开的正式搜索 API 或开发者授权文档；EARTH ONE 仅提供上述官方目录入口，不模拟接口、不抓取页面或复制书籍。
- [Qatar Digital Library 官方首页](https://www.qdl.qa/en)声明馆藏免费使用与复用；[About](https://www.qdl.qa/en/about)介绍档案、地图、手稿、录音与图像等藏品，[官方检索页](https://www.qdl.qa/en/search/site/)用于站内查找。此次未发现由 QDL 发布、可确认用于机器查询的官方 API 文档，因此只提供该官方检索入口；免费复用的一般说明不替代单件资源权利审核。

### Shamela adapter and rights
`ShamelaConnector` 使用已发布的远程 MCP `tools/call` 请求 `shamela_find`，无需 key/账号。查询含阿拉伯文字时搜索；不含阿拉伯文的查询返回 `unsupported` 并说明此源暂不适用，避免未授权转译和误导结果。结果从官方搜索的排名层提取书名、作者及 `book_id/page_id`，按书去重后链接到 `https://shamela.ws/book/{book_id}/{page_id}`。不解析或向用户输出预览/证据正文，不缓存 MCP 响应，不存储全文；进程只保留标准化书目字段。权利统一标为 `UNKNOWN`，`canImport=false`；阅读器全文方法、下载方法明确 `unsupported`，`POST /api/library/ingest` 对 Shamela 另行返回 403。来源最短本地请求间隔为 2 秒并按源串行；服务器不替用户下载、绕过登录或复用控制。

Shamela 的环境开关为 `EARTH_ONE_LIBRARY_SHAMELA_ENABLED`，默认启用、可在服务端设为 `false` 关闭；`authentication: none`。连接状态、搜索结果与来源页面由现有统一 connector/search 接口提供。Waqfeya 和 QDL 是首页上的官方外链，不列作已接入 API connector，也不会因搜索结果为空而假报已检索。

### Verification and limits
`npm run lint`、`npm run test:library-connectors`、隔离图书馆 API 回归（31 项）、全站 API 回归（85 项）、`npm run build` 与 `npm run test:library-connectors:live` 均通过；实时 smoke 对 Shamela 使用阿语查询并验证官方记录 URL 和全文禁用。生产构建仍有既有 Three.js chunk size 提示。未做浏览器视觉/手机回归；Waqfeya/QDL 尚无机器查询接入；当前 Shamela 连接器不把中文、英文或拉丁转写自动翻译为阿语。


## Phase 6：OpenAlex 作者与机构发现（2026-11-04）

### Official API references
- [OpenAlex API overview](https://help.openalex.org/api/) documents entity endpoints, list/search patterns, selective fields, public HTTP access, and that basic use is free without an account.
- The official [Authors search guide](https://github.com/ourresearch/openalex-docs/blob/main/api-entities/authors/search-authors.md) documents `/authors?search=` over author names and alternatives; the official [Institutions search guide](https://github.com/ourresearch/openalex-docs/blob/main/api-entities/institutions/search-institutions.md) documents `/institutions?search=` over institution names and alternatives.

### Implementation and rights
The existing OpenAlex connector now interprets only explicit `author:<name>` and `institution:<name>` prefixes as profile searches. Ordinary free-text queries and DOI lookup remain Works searches. The adapter uses source-local search queues and bounded `per_page` values, selects only profile fields needed for display, maps author name/ORCID/works and citation counts/recent institution names, and maps institution type/country/works and citation counts/homepage/ROR. OpenAlex `A…` and `I…` identifiers are validated against their entity type before `getBook`/`getMetadata` detail requests. The UI indicates record type and shows the syntax beside the global search field.

Author and institution cards carry `METADATA_ONLY`, `canImport: false`, and no download links. The provider profile URL is the official OpenAlex record; this does not imply any access or reuse right for linked papers. Full-text extraction and downloads remain explicitly unsupported; no API key or user setup is needed for basic searches.

### Verification and limits
Offline tests cover both endpoint paths, provider fields, profile links, A/I detail IDs, missing-key behavior, metadata-only rights, and denied import/download. Live smoke verifies `author:Carl Sagan` and `institution:University of Jordan` return current OpenAlex profiles. TypeScript, connector offline tests, library API (31), general API (85), production build, and the multi-provider live smoke pass. No browser or mobile visual regression was run. Profile search is deliberately opt-in by prefix; advanced author–work browsing, facet filters, and institutional relationship maps remain future work.


## Phase 6：统一搜索、精确去重与版权识别（2026-11-04）

### Official references reviewed
- The [Open Library Search API guide](https://openlibrary.org/dev/docs/api/search) documents work-level results with edition-level fields, including `editions.ebook_access`; its example shows `public` for a readable edition and the guide warns that the Solr schema is not guaranteed stable.
- [Open Library API usage guidance](https://openlibrary.org/developers/api) asks clients to identify requests, cache responses, and stay within published rate limits (one request per second by default; three per second for identified clients). The connector remains bounded and serialized with its existing cache/rate controls.

### Exact identity and edition safety
Unified deduplication now accepts only exact, normalized identifiers: a DOI, a checksum-valid ISBN, or an exact provider-local source ID. DOI labels and `doi.org`/`dx.doi.org` URLs normalize to lowercase DOI strings. Valid ISBN-10 values convert to their equivalent 978 ISBN-13; ISBN-13 checksum errors, arbitrary 10/13-digit strings, and other malformed values are ignored. A source ID is namespaced by connector, so the same raw ID from two different providers does not merge records by itself.

A matching DOI or source ID is not enough to collapse two records when both carry valid ISBNs that are disjoint: that is treated as a different edition and remains separate. Explicit DOI conflicts also prevent ISBN-based merging. When records do merge, the primary record retains its rights and provider identity, valid source ISBN variants are preserved, and unique alternate official source links are added. Similar titles are never compared for merging, and rights are not inferred from an alternate link.

### Access labels and rights conflicts
Open Library's exact edition-level `ebook_access` value `public` maps to `OPEN_ACCESS`; `borrowable` maps to `BORROWABLE`; unrecognized/missing values remain `UNKNOWN`. These are provider access states, not copyright or reuse licenses: every Open Library result remains `canImport: false`, no download/full-text copy is enabled, and live `getAvailability` remains unsupported. Internet Archive rights parsing now fails closed to `UNKNOWN` when an item combines a recognized permissive/public-domain statement with a restrictive statement such as “All rights reserved” or “In Copyright”; contradictory Public Domain and open-license claims also remain unknown. Existing restricted-item flags continue to override permissive license text. A consistent, recognized CC license or public-domain statement retains its existing classification.

### Verification and limits
Offline tests cover valid ISBN-10/13 equivalence, invalid checksums, same-provider ID duplicates, cross-provider ID collisions, same-title/different-edition records, a repeated work ID with disjoint edition ISBNs, DOI URL/case variants, Open Library public/borrowable/unknown access states, Internet Archive rights conflicts, and the no-title-fuzzy-merge rule. The final run passed `npm run lint`, `npm run test:library-connectors`, `npm run test:library-api` (31/31), `npm run test:api` (85/85), `npm run build`, and `npm run test:library-connectors:live`. The live smoke remained bounded and keyless; it did not download EPUB or article text. The existing Three.js chunk-size warning remains non-blocking. No browser/mobile visual regression was run; provider rights/access can still be incomplete or stale, so item-level official records remain authoritative.

## Phase 7 阅读器续读边界（2026-11-04）
Phase 7 的本次增量只为个人书架中的本地章节文本保存用户自己的 `lastReadChapterId` 与阅读百分比；它复用既有书架持久化，不增加、启用或修改任何外部资源连接器，也不需要 API key。读取外部来源时仍遵循各连接器的原权利与访问限制：官方站点阅读入口不会因此变成本地全文；EPUB 既有官方来源流程保持不变。本轮未执行外部连接器实时 smoke。


### Phase 7 follow-up：EPUB 个人书架续读（2026-11-04）
本次没有新增或修改外部连接器。既有 EPUB 入口、来源归属、许可和下载限制保持不变；只对阅读器已经合法取得并打开的 EPUB 位置保存 CFI。CFI 与百分比仅写入当前有效会话用户自己的书架，服务端要求请求账户 ID 与会话身份匹配；未登录用户不保存，服务端不代理新的 EPUB 下载、不复制正文。隔离 API 回归验证 CFI 格式校验、登录/账户身份校验及两个合成账户之间的状态隔离。真实 EPUB 网络访问与设备间同步仍未实测。


## Phase 8：AI 正文证据与连接器边界（2026-11-04）
本阶段没有新增外部连接器或对现有 API 做额外请求。AI 解读只消费已通过既有来源/许可流程进入本地书籍记录的章节正文；`Book.textAvailability` 对导入全文、有限摘录、metadata-only 与未知旧记录作显式区分。仅元数据、Open Library 自动收录预览、无已解析章节的 EPUB，以及没有可核实来源/版本的记录不会被伪装成可引用全文。未知或旧记录 fail-closed。

新 AI 路由依据本地 `bookId` 和 `chapterId` 服务端读取章节，在调用现有 AI 网关前核验客户端选文确实存在于正文；模型只收到原文选段及有限邻近上下文。引用由本地书目字段构造，至少含书名、作者、版本标识、章节定位及 HTTPS 官方来源页。模型不得自行生成页码或版本。摘录引用明确标成摘录、禁止外推为全书；缺少来源/版本时不发送模型请求。保存的带来源 AI 读书笔记须登录并按账户私有保存。

这条 AI 路径依赖部署方现有 AI 网关配置，代码未加入新的收费模型、连接器或 key，也未要求读者创建外部账号。若部署中没有可用模型，服务明确报告未生成答案；本轮自动化测试禁用了模型凭证，没有进行实际模型调用。EPUB.js 仍按原官方来源/访问方式阅读，但服务器暂未提取其正文供可核查 AI 证据使用。


### Phase 8 follow-up：EPUB AI 正文定位明确不支持（2026-11-04）
EPUB-only 导入仍保留既有官方书目、权利信息和阅读 URL，不新增 connector 能力。现有 `/api/library/epub-proxy` 只流式转发到浏览器；epub.js 在客户端解析正文/目录，服务器没有章节正文副本或章节内容哈希。个人书架上的 CFI/百分比用于恢复位置，并未被服务端解析核验为章节锚点，百分比也不是页码。因此 `EPUB_TEXT_UNAVAILABLE`（409）拒绝 EPUB AI 解读，阅读器显示这一限制；不生成虚构页码/引用，不发模型请求。服务器已保存且带来源/版本 provenance 的文本书 AI 解读仍保持可用。本阶段未访问真实 EPUB、未读取用户书架、未新增外部请求、连接器、API key 或其他配置；合成回归及检查结果见 `TEST_REPORT.md`。


## Phase 9 mobile/browser regression (2026-11-04)

Phase 9 did not change connector registration, provider requests, caching, rights mapping, imports, or credentials. A local headless Chromium run exercised the current WORLD LIBRARY UI at 320, 360, 375, and 390 CSS-pixel widths using synthetic API responses only. The unauthenticated `/api/auth/me` stub returned signed-out state, external network requests were blocked, and the EPUB proxy returned a local synthetic EPUB fixture. No real shelf, reading history, annotation, provider record, external EPUB, or AI model was accessed.

The regression covered disabled-source reporting, empty/no-result plus provider-error reporting, successful synthetic results, and unknown/restricted/provider-declared public-domain rights. Unknown/restricted results never exposed a local-import action; only the explicitly importable synthetic record did. It also measured search/source actions, Arabic-catalog shortcuts, shelf filters/back navigation, text reader controls, annotation drawer controls, EPUB toolbar and table-of-contents entries. All tested touch targets were at least 44px and the page had no horizontal document overflow at tested widths. Keyboard Escape, Tab/Shift+Tab focus cycling and return focus were exercised for text and EPUB readers; the browser reported no page errors.

These are front-end mock/viewport results, not live connector availability or physical-device/real-account validation. Rights and access remain source-record-specific; Phase 8's EPUB AI restriction is unchanged: the server still lacks verified EPUB chapter text/provenance, so reading/resume remain available but EPUB excerpts are not sent to AI and no CFI is presented as a verified page citation. See the Phase 9 rows in `TEST_REPORT.md` for the test matrix and limits.


## EPUB AI and proxy boundary review (2026-11-04)

Project Gutenberg EPUB imports continue to be revalidated against the provider's OPDS record and explicit item rights before the catalogue stores an official EPUB URL. The current record does not bind the downloaded bytes to a content hash, OPF/manifest/spine snapshot, extracted chapter hashes, or a CFI-to-edition map. A provider book ID and a permissive rights statement alone do not prove that a subsequently fetched EPUB is the exact edition whose text the AI would cite. EPUB-only records therefore remain `metadata_only`; `/api/library/books/:id/ai-reading` continues to reject them before any model call with `EPUB_TEXT_UNAVAILABLE`. This also applies when a rights field says `PUBLIC_DOMAIN`/`OPEN_LICENSE` or an unverified chapter/CFI is supplied. Existing browser reading and account-scoped resume are preserved.

The current `epubjs` dependency is used by the browser reader; its CFI parser is reused server-side only for bounded **syntax** validation of resume state. That check does not resolve a CFI against the target package or prove a chapter/edition. The proxy now caps responses at 64 MiB, rejects absent/truncated/non-ZIP local-file headers, disables automatic redirects, and rechecks HTTPS/credentials/approved library hosts at each bounded redirect hop. It does not pin DNS results or block private IPs after hostname resolution, so this remains a narrowly allowlisted proxy rather than general-purpose SSRF protection. This is an envelope and fetch-boundary check only: no server-side ZIP/EPUB extraction, central-directory/CRC validation, decompression-bomb defense, XML/XHTML sanitation, chapter text, or AI evidence is implemented here. Do not treat the proxy or CFI syntax check as a secure parser or provenance chain.

Safe EPUB AI would require item-rights/provenance bound to the actual downloaded file, stored byte and chapter hashes, constrained/sandboxed package validation and text extraction, and verification of the selected text and CFI against that same edition's package/spine mapping. Until those checks and adversarial tests for central-directory corruption, compression bombs, traversal, active content, and edition replacement exist, EPUB AI remains unsupported; no additional user key, account, or configuration is required for existing functionality.
