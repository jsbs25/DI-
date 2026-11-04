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

The first real connector milestone now exposes five independently switchable sources through `server/integrations/libraries/` and the existing `/api/library/*` surface:

- **Open Library** — official Search API (`/search.json`) plus Work/Edition JSON. Search maps available authors, language codes, first publication year, ISBN, publisher/edition metadata, and official Covers URLs. Search/record data is always classified `UNKNOWN` for rights; `ebook_access` is not treated as a license, and local full-text import, download links, and borrowability are explicitly unsupported.
- **Internet Archive** — official Advanced Search and Item Metadata APIs. Search is constrained to title, creator, or identifier plus `mediatype:texts`, following the official [Advanced Search query guidance](https://archive.org/advancedsearch.php) that field-specific search is more relevant and faster. Each item is rechecked through `/metadata/{identifier}` before a local copy; import requires recognized public-domain/open-license evidence and a listed OCR text file. Restricted, missing-rights, open-access-only, and otherwise ambiguous items are not copied. This integration does not bypass loans/DRM or claim that an item can be borrowed.
- **Project Gutenberg** — official OPDS/OpenSearch catalog (`/ebooks/search.opds/?query=...`) and per-book OPDS for revalidation. Plain text can be read when the official feed supplies it; EPUB records retain the official EPUB URL for the existing reader. The server does not download the EPUB during discovery/import. Gutenberg's public-domain label is shown with its U.S.-jurisdiction caveat; it is not presented as a worldwide legal guarantee.
- **Chinese Wikisource** and **Arabic Wikisource** — existing search capabilities are preserved and registered as connectors. Results link to their official pages and remain `UNKNOWN` for reuse until page-specific rights are established; unverified pages cannot be copied locally.

The connector interface provides `search`, `getBook`, `getMetadata`, `getAvailability`, `getFullText`, `getDownloadLinks`, and `getSourceInformation`; unsupported operations return an explicit `unsupported` status. `/api/library/connectors` is a read-only registry; `/api/library/search` reports each provider's `ok`/`error`/`disabled` status and keeps one provider's outage from failing the others. Search results are normalized with source and official-page links, rights, availability, and metadata where supplied. Cross-source deduplication uses exact normalized ISBN or DOI only; similar titles are not merged. Each source has a serialized minimum one-second request interval and a 60-second response cache.

### Configuration

No API key is required for these five current connectors. `.env.example` documents the optional `EARTH_ONE_LIBRARY_CONTACT_EMAIL` and independent switches `EARTH_ONE_LIBRARY_OPENLIBRARY_ENABLED`, `EARTH_ONE_LIBRARY_ARCHIVE_ENABLED`, `EARTH_ONE_LIBRARY_GUTENBERG_ENABLED`, `EARTH_ONE_LIBRARY_WIKISOURCE_ENABLED`, and `EARTH_ONE_LIBRARY_AR_WIKISOURCE_ENABLED`. A source is enabled by default unless its switch is explicitly set false/off/disabled. Keep any future paid or key-backed source credentials in server-side secret configuration, never in this register or client code.

### Still not integrated

Google Books, Europeana, OpenAlex, Crossref, arXiv, PubMed Central, DOAB, Waqfeya, Shamela, Qatar Digital Library, additional Arabic repositories, separate author/ISBN/DOI filters, language/year/category filters, catalog refresh/new-release feeds, and an editable administration console remain future work. The current source registry is environment-configured and read-only, not a full sync-log/cache-health/data-review administration system. Search over the five sources is real, but the brief's full multi-database academic and cultural-heritage acceptance criteria are not complete.


### Search relevance evidence

The official [Internet Archive Advanced Search page](https://archive.org/advancedsearch.php) documents Lucene-like syntax, field-specific queries, boolean grouping, and explains that restricting searches to a field is faster and more relevant. The connector uses grouped `title`, `creator`, and `identifier` phrase clauses with `mediatype:texts`; a bounded live regression confirms a `Frankenstein` query returns matching Open Library and Archive records. The live script performs only one limited query per source and does not enumerate catalogs.


The WORLD LIBRARY result and detail views display provider rights notes and a license link only when it is a valid HTTPS URL. The local-import button is fail-closed: the client requires an explicit provider `canImport: true`, and the server independently rechecks the official record and rights before saving.
