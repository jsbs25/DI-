import {
  fetchBookFullText,
  fetchInternetArchiveFullText,
  fetchWikisourceFullText,
  fetchArabicWikisourceFullText,
  searchWikisource,
  searchArabicWikisource,
  type BookSearchResult
} from '../../webFetcher.ts';

export enum RightsCategory {
  PUBLIC_DOMAIN = 'PUBLIC_DOMAIN',
  OPEN_LICENSE = 'OPEN_LICENSE',
  OPEN_ACCESS = 'OPEN_ACCESS',
  BORROWABLE = 'BORROWABLE',
  PREVIEW_ONLY = 'PREVIEW_ONLY',
  METADATA_ONLY = 'METADATA_ONLY',
  COPYRIGHT_RESTRICTED = 'COPYRIGHT_RESTRICTED',
  UNKNOWN = 'UNKNOWN'
}

export type LibrarySource = 'openlibrary' | 'archive' | 'gutenberg' | 'googlebooks' | 'europeana' | 'wikisource' | 'ar_wikisource' | 'openalex' | 'crossref' | 'arxiv' | 'europepmc' | 'pmc' | 'pubmed' | 'shamela';
export type ConnectorStatus = 'ok' | 'error' | 'unsupported';
export interface ExternalLibraryRecord {
  id: string;
  externalId: string;
  source: LibrarySource;
  sourceName: string;
  sourceUrl: string;
  officialUrl: string;
  title: string;
  author: string;
  authors?: string[];
  language: string;
  year?: string;
  publisher?: string;
  isbn?: string[];
  doi?: string;
  description: string;
  coverImage?: string;
  /** Official provider-hosted full-text/reader URL; never treated as a local import or reuse license. */
  providerFullTextUrl?: string;
  textUrl?: string;
  epubUrl?: string;
  identifier?: string;
  pageTitle?: string;
  rights: RightsCategory;
  rightsClassification: RightsCategory;
  rightsStatement?: string;
  licenseUrl?: string;
  rightsNote: string;
  availability: string;
  canImport: boolean;
  downloadLinks?: string[];
  metadata?: Record<string, unknown>;
  legacy?: BookSearchResult;
  alternateSources?: Array<{ source: LibrarySource; name: string; url: string }>;
}

export interface BookLocator {
  id?: string;
  identifier?: string;
  isbn?: string;
  doi?: string;
  pageTitle?: string;
  record?: ExternalLibraryRecord;
}

export interface FullText {
  title: string;
  author: string;
  chapters: Array<{ title: string; content: string }>;
}

export interface ConnectorResponse<T> {
  status: ConnectorStatus | 'unsupported';
  data?: T;
  reason?: string;
}

export interface SourceInformation {
  source: LibrarySource;
  name: string;
  websiteUrl: string;
  apiUrl: string;
  enabled: boolean;
  authentication: 'none' | 'api-key';
  policies: string[];
}

export interface LibraryConnector {
  readonly source: LibrarySource;
  search(query: string, limit?: number): Promise<ConnectorResponse<ExternalLibraryRecord[]>>;
  getBook(locator: BookLocator): Promise<ConnectorResponse<ExternalLibraryRecord>>;
  getMetadata(locator: BookLocator): Promise<ConnectorResponse<ExternalLibraryRecord>>;
  getAvailability(locator: BookLocator): Promise<ConnectorResponse<unknown>>;
  getFullText(locator: BookLocator): Promise<ConnectorResponse<FullText>>;
  getDownloadLinks(locator: BookLocator): Promise<ConnectorResponse<string[]>>;
  getSourceInformation(): ConnectorResponse<SourceInformation>;
}

export interface SourceSearchStatus {
  source: LibrarySource;
  name: string;
  status: ConnectorStatus | 'disabled';
  count: number;
  reason?: string;
}

export interface LibrarySearchOptions {
  sources?: LibrarySource[];
  limit?: number;
}

const SOURCE_NAMES: Record<LibrarySource, string> = {
  openlibrary: 'Open Library',
  archive: 'Internet Archive',
  gutenberg: 'Project Gutenberg',
  googlebooks: 'Google Books',
  europeana: 'Europeana',
  wikisource: 'Wikisource',
  ar_wikisource: 'Arabic Wikisource',
  openalex: 'OpenAlex',
  crossref: 'Crossref',
  arxiv: 'arXiv',
  europepmc: 'Europe PMC',
  pmc: 'PubMed Central',
  pubmed: 'PubMed',
  shamela: 'Shamela'
};
const SOURCE_CONFIG: Record<LibrarySource, { env: string; website: string; api: string }> = {
  openlibrary: { env: 'EARTH_ONE_LIBRARY_OPENLIBRARY_ENABLED', website: 'https://openlibrary.org', api: 'https://openlibrary.org/search.json' },
  archive: { env: 'EARTH_ONE_LIBRARY_ARCHIVE_ENABLED', website: 'https://archive.org', api: 'https://archive.org/advancedsearch.php' },
  gutenberg: { env: 'EARTH_ONE_LIBRARY_GUTENBERG_ENABLED', website: 'https://www.gutenberg.org', api: 'https://www.gutenberg.org/ebooks/search.opds/' },
  googlebooks: { env: 'EARTH_ONE_LIBRARY_GOOGLEBOOKS_ENABLED', website: 'https://books.google.com', api: 'https://www.googleapis.com/books/v1/volumes' },
  europeana: { env: 'EARTH_ONE_LIBRARY_EUROPEANA_ENABLED', website: 'https://www.europeana.eu', api: 'https://api.europeana.eu/record/v2/search.json' },
  wikisource: { env: 'EARTH_ONE_LIBRARY_WIKISOURCE_ENABLED', website: 'https://zh.wikisource.org', api: 'https://zh.wikisource.org/w/api.php' },
  ar_wikisource: { env: 'EARTH_ONE_LIBRARY_AR_WIKISOURCE_ENABLED', website: 'https://ar.wikisource.org', api: 'https://ar.wikisource.org/w/api.php' },
  openalex: { env: 'EARTH_ONE_LIBRARY_OPENALEX_ENABLED', website: 'https://openalex.org', api: 'https://api.openalex.org/works' },
  crossref: { env: 'EARTH_ONE_LIBRARY_CROSSREF_ENABLED', website: 'https://www.crossref.org', api: 'https://api.crossref.org/works' },
  arxiv: { env: 'EARTH_ONE_LIBRARY_ARXIV_ENABLED', website: 'https://arxiv.org', api: 'https://export.arxiv.org/api/query' },
  europepmc: { env: 'EARTH_ONE_LIBRARY_EUROPEPMC_ENABLED', website: 'https://europepmc.org', api: 'https://www.ebi.ac.uk/europepmc/webservices/rest/search' },
  pmc: { env: 'EARTH_ONE_LIBRARY_PMC_ENABLED', website: 'https://pmc.ncbi.nlm.nih.gov', api: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi' },
  pubmed: { env: 'EARTH_ONE_LIBRARY_PUBMED_ENABLED', website: 'https://pubmed.ncbi.nlm.nih.gov', api: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi' },
  shamela: { env: 'EARTH_ONE_LIBRARY_SHAMELA_ENABLED', website: 'https://shamela.ws', api: 'https://mcp.shamela.ws' }
};
const CACHE_TTL_MS = 60_000;
const MIN_REQUEST_INTERVAL_MS = 1_000;
const SOURCE_MIN_REQUEST_INTERVAL_MS: Partial<Record<LibrarySource, number>> = { arxiv: 3_000, shamela: 2_000 };
const cache = new Map<string, { expiresAt: number; value: string }>();
const lastRequestBySource = new Map<string, number>();
const requestQueueBySource = new Map<string, Promise<void>>();

const ok = <T>(data: T): ConnectorResponse<T> => ({ status: 'ok', data });
const unsupported = <T = never>(reason: string): ConnectorResponse<T> => ({ status: 'unsupported', reason });
const failed = <T = never>(error: unknown): ConnectorResponse<T> => ({ status: 'error', reason: error instanceof Error ? error.message : 'Provider request failed' });
function propagateFailure<T>(response: ConnectorResponse<unknown>, fallback: string): ConnectorResponse<T> {
  if (response.status === 'unsupported') return unsupported<T>(response.reason || fallback);
  return failed<T>(response.reason || fallback);
}

function cap(value = 10): number {
  return Math.max(1, Math.min(25, Number.isFinite(value) ? Math.floor(value) : 10));
}

export function isLibraryConnectorEnabled(source: LibrarySource): boolean {
  const configured = process.env[SOURCE_CONFIG[source].env];
  if (source === 'googlebooks' && !process.env.GOOGLE_BOOKS_API_KEY?.trim()) return false;
  if (source === 'europeana' && !process.env.EUROPEANA_API_KEY?.trim()) return false;
  return !configured || !['false', '0', 'off', 'no', 'disabled'].includes(configured.trim().toLowerCase());
}

function disabledSourceReason(source: LibrarySource): string {
  if (source === 'googlebooks' && !process.env.GOOGLE_BOOKS_API_KEY?.trim()) {
    return 'Requires a server-side GOOGLE_BOOKS_API_KEY; the connector stays disabled until configured.';
  }
  if (source === 'europeana' && !process.env.EUROPEANA_API_KEY?.trim()) {
    return 'Requires a server-side EUROPEANA_API_KEY; the connector stays disabled until configured.';
  }
  return 'Disabled by environment configuration.';
}

function userAgent(): string {
  const email = process.env.EARTH_ONE_LIBRARY_CONTACT_EMAIL?.trim();
  return `EARTH-ONE-Library/1.0${email ? ` (contact: ${email})` : ''}`;
}

async function requestText(source: LibrarySource, url: string, timeoutMs = 10_000, cacheKey = url): Promise<string> {
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const queueKey = source === 'pmc' || source === 'pubmed' ? 'ncbi-eutils' : source;
  const previous = requestQueueBySource.get(queueKey) || Promise.resolve();
  let releaseQueue!: () => void;
  const queueTurn = new Promise<void>(resolve => { releaseQueue = resolve; });
  const queued = previous.catch(() => undefined).then(() => queueTurn);
  requestQueueBySource.set(queueKey, queued);
  await previous.catch(() => undefined);
  try {
    const freshCache = cache.get(cacheKey);
    if (freshCache && freshCache.expiresAt > Date.now()) return freshCache.value;
    const lastRequest = lastRequestBySource.get(queueKey) || 0;
    const minInterval = SOURCE_MIN_REQUEST_INTERVAL_MS[source] || MIN_REQUEST_INTERVAL_MS;
    const delay = Math.max(0, minInterval - (Date.now() - lastRequest));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      lastRequestBySource.set(queueKey, Date.now());
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json, application/atom+xml, application/xml, text/plain',
          'User-Agent': userAgent()
        }
      });
      if (!response.ok) throw new Error(`${SOURCE_NAMES[source]} returned HTTP ${response.status}`);
      const value = await response.text();
      let cacheSafeValue = value;
      // Europeana may echo the wskey in its JSON response's `apikey` field.
      // Never retain or return that credential in the shared response cache.
      if (source === 'europeana') {
        try {
          const payload = JSON.parse(value);
          if (payload && typeof payload === 'object') delete payload.apikey;
          cacheSafeValue = JSON.stringify(payload);
        } catch {
          cacheSafeValue = value.replace(/("apikey"\s*:\s*")[^"]*(")/gi, '$1[redacted]$2');
        }
      }
      cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: cacheSafeValue });
      return cacheSafeValue;
    } finally {
      clearTimeout(timer);
    }
  } finally {
    releaseQueue();
    if (requestQueueBySource.get(queueKey) === queued) requestQueueBySource.delete(queueKey);
  }
}

let nextMcpRequestId = 1;

/**
 * Call Shamela's documented, public, read-only MCP search without caching its
 * response: search payloads may contain book text, which this connector must
 * never retain or return to the client.
 */
async function callShamelaSearch(query: string): Promise<Record<string, any>> {
  const queueKey = 'shamela';
  const previous = requestQueueBySource.get(queueKey) || Promise.resolve();
  let releaseQueue!: () => void;
  const queueTurn = new Promise<void>(resolve => { releaseQueue = resolve; });
  const queued = previous.catch(() => undefined).then(() => queueTurn);
  requestQueueBySource.set(queueKey, queued);
  await previous.catch(() => undefined);
  try {
    const lastRequest = lastRequestBySource.get(queueKey) || 0;
    const delay = Math.max(0, (SOURCE_MIN_REQUEST_INTERVAL_MS.shamela || MIN_REQUEST_INTERVAL_MS) - (Date.now() - lastRequest));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      lastRequestBySource.set(queueKey, Date.now());
      const response = await fetch(SOURCE_CONFIG.shamela.api, {
        method: 'POST',
        signal: controller.signal,
        headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json', 'User-Agent': userAgent() },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: nextMcpRequestId++,
          method: 'tools/call',
          params: { name: 'shamela_find', arguments: { keywords: [query], difficulty: 'easy' } }
        })
      });
      if (!response.ok) throw new Error(`Shamela returned HTTP ${response.status}`);
      const raw = await response.text();
      const eventData = raw.split(/\r?\n/).filter(line => line.startsWith('data: ')).at(-1)?.slice(6);
      let envelope: any;
      try { envelope = JSON.parse(eventData || raw); }
      catch { throw new Error('Shamela MCP returned an unreadable search response.'); }
      if (envelope?.error || envelope?.result?.isError) throw new Error('Shamela MCP search request failed.');
      const result = envelope?.result;
      if (result?.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent;
      const text = Array.isArray(result?.content) ? result.content.find((item: any) => item?.type === 'text')?.text : undefined;
      if (typeof text === 'string') {
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === 'object') return parsed;
        } catch { /* Discard provider text; never expose it to the client. */ }
      }
      throw new Error('Shamela MCP returned an unsupported search response.');
    } finally {
      clearTimeout(timer);
    }
  } finally {
    releaseQueue();
    if (requestQueueBySource.get(queueKey) === queued) requestQueueBySource.delete(queueKey);
  }
}

function containsArabicScript(value: string): boolean {
  return /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u.test(value);
}

function baseRecord(source: LibrarySource, record: Partial<ExternalLibraryRecord> & Pick<ExternalLibraryRecord, 'id' | 'externalId' | 'title' | 'sourceUrl' | 'rights'>): ExternalLibraryRecord {
  const rightsNote = record.rightsNote || record.rightsStatement || 'Rights have not been independently confirmed.';
  return {
    source,
    sourceName: SOURCE_NAMES[source],
    officialUrl: record.sourceUrl,
    author: 'Unknown Author',
    language: 'und',
    description: '',
    rightsClassification: record.rights,
    rightsNote,
    availability: record.rights === RightsCategory.UNKNOWN ? 'official-source-only' : 'check-provider-record',
    canImport: record.rights === RightsCategory.PUBLIC_DOMAIN || record.rights === RightsCategory.OPEN_LICENSE,
    ...record
  };
}

function enabledSourceInformation(source: LibrarySource, policies: string[], authentication: SourceInformation['authentication'] = 'none'): ConnectorResponse<SourceInformation> {
  const config = SOURCE_CONFIG[source];
  return ok({
    source,
    name: SOURCE_NAMES[source],
    websiteUrl: config.website,
    apiUrl: config.api,
    enabled: isLibraryConnectorEnabled(source),
    authentication,
    policies
  });
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function xmlText(markup: string, tag: string): string | undefined {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markup.match(new RegExp(`<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}>`, 'i'));
  if (!match) return undefined;
  return decodeXml(match[1].replace(/<[^>]+>/g, '').trim());
}

function xmlTextByLocalName(markup: string, localName: string): string | undefined {
  const escapedTag = localName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markup.match(new RegExp(`<(?:(?:[A-Za-z0-9_.-]+):)?${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:(?:[A-Za-z0-9_.-]+):)?${escapedTag}>`, 'i'));
  if (!match) return undefined;
  return decodeXml(match[1].replace(/<[^>]+>/g, '').trim());
}

function attr(markup: string, name: string): string | undefined {
  const match = markup.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'));
  return match ? decodeXml(match[1]) : undefined;
}

function gutenbergBookId(locator: BookLocator): string | undefined {
  const candidate = locator.id || locator.identifier || locator.record?.externalId || '';
  const match = candidate.match(/^(?:gutenberg_)?(\d{1,8})$/);
  return match?.[1];
}

function trustedGutenbergUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw, 'https://www.gutenberg.org');
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;
    if (!(url.hostname === 'gutenberg.org' || url.hostname.endsWith('.gutenberg.org'))) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function parseGutenbergEntries(feed: string): ExternalLibraryRecord[] {
  const entries = [...feed.matchAll(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi)];
  const records: ExternalLibraryRecord[] = [];
  for (const match of entries) {
    const entry = match[0];
    const entryId = xmlText(entry, 'id') || '';
    const id = entryId.match(/(?:\/ebooks\/|urn:gutenberg:)(\d+)/i)?.[1] ||
      entry.match(/(?:https?:\/\/[^<"']+)?\/ebooks\/(\d+)/i)?.[1] ||
      entry.match(/urn:gutenberg:(\d+)(?::\d+)?/i)?.[1];
    if (!id) continue;

    const links = [...entry.matchAll(/<link\b[^>]*>/gi)].map(link => {
      const rawHref = attr(link[0], 'href');
      return { url: trustedGutenbergUrl(rawHref), type: (attr(link[0], 'type') || '').toLowerCase(), rel: (attr(link[0], 'rel') || '').toLowerCase() };
    }).filter(link => !!link.url);
    const textUrl = links.find(link => /text\/plain/.test(link.type) || /\.txt(?:$|\?)/i.test(link.url!))?.url;
    const epubUrl = links.find(link => /epub/.test(link.type) || /\.epub(?:$|[.?])/i.test(link.url!))?.url;
    const officialUrl = `https://www.gutenberg.org/ebooks/${id}`;
    const title = xmlText(entry, 'title') || 'Untitled';
    const authorMatch = entry.match(/<author(?:\s[^>]*)?>([\s\S]*?)<\/author>/i);
    const author = authorMatch ? xmlText(authorMatch[1], 'name') : undefined;
    records.push(baseRecord('gutenberg', {
      id: `gutenberg_${id}`,
      externalId: id,
      title,
      author: author || 'Unknown Author',
      language: xmlTextByLocalName(entry, 'language') || 'und',
      sourceUrl: officialUrl,
      textUrl,
      epubUrl,
      downloadLinks: [textUrl, epubUrl].filter((link): link is string => !!link),
      rights: RightsCategory.PUBLIC_DOMAIN,
      rightsNote: 'Project Gutenberg states public-domain status for its U.S. source/jurisdiction; verify local law before reuse.',
      availability: textUrl || epubUrl ? 'provider-download' : 'official-source-only',
      canImport: !!(textUrl || epubUrl)
    }));
  }
  return records;
}

function validIaIdentifier(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,149}$/.test(value);
}

function iaRights(record: Record<string, unknown>): RightsCategory {
  const isTrueFlag = (value: unknown) => value === true || value === 1 || (typeof value === 'string' && value.trim().toLowerCase() === 'true');
  const restricted = isTrueFlag(record.restricted) || isTrueFlag(record['access-restricted-item']);
  if (restricted) return RightsCategory.UNKNOWN;

  const licenseUrl = String(record.licenseurl || '').toLowerCase();
  const rightsText = String(record.rights || '').toLowerCase();
  const statement = `${licenseUrl} ${rightsText}`;
  const hasPublicDomain = /publicdomain\/(?:mark|zero)|public domain|no known copyright restrictions|\bcc0\b/.test(statement);
  const hasOpenLicense = /creativecommons\.org\/licenses\/(?:by|by-sa|by-nc|by-nd)|\bcc\s*by(?:-sa|-nc|-nd)?\s*\d|\bmit license\b|\bgpl(?:-\d)?\b/.test(statement);
  const hasOpenAccess = /\bopen access\b/.test(statement);
  const hasRestriction = /all rights reserved|in copyright|copyrighted|rightsstatements\.org\/vocab\/(?:inc|noc)/.test(statement);
  if (hasRestriction && (hasPublicDomain || hasOpenLicense || hasOpenAccess)) return RightsCategory.UNKNOWN;
  if (hasPublicDomain && hasOpenLicense) return RightsCategory.UNKNOWN;
  if (hasPublicDomain) return RightsCategory.PUBLIC_DOMAIN;
  if (hasOpenLicense) return RightsCategory.OPEN_LICENSE;
  if (hasOpenAccess) return RightsCategory.OPEN_ACCESS;
  if (hasRestriction) return RightsCategory.COPYRIGHT_RESTRICTED;
  return RightsCategory.UNKNOWN;
}

function textList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value) return [value];
  return [];
}

function rightsPermitLocalCopy(rights: RightsCategory): boolean {
  return rights === RightsCategory.PUBLIC_DOMAIN || rights === RightsCategory.OPEN_LICENSE;
}

function openLibraryEditionAccess(access: unknown): RightsCategory {
  const value = typeof access === 'string' ? access.trim().toLowerCase() : '';
  if (value === 'public') return RightsCategory.OPEN_ACCESS;
  if (value === 'borrowable') return RightsCategory.BORROWABLE;
  return RightsCategory.UNKNOWN;
}

export class OpenLibraryConnector implements LibraryConnector {
  readonly source = 'openlibrary' as const;

  async search(query: string, limit = 10): Promise<ConnectorResponse<ExternalLibraryRecord[]>> {
    if (!query.trim()) return ok([]);
    try {
      const fields = 'key,title,author_name,first_publish_year,cover_i,language,edition_key,editions,editions.key,editions.title,editions.ebook_access,editions.language,editions.isbn,editions.publisher,editions.publish_date,isbn';
      const params = new URLSearchParams({ q: query.trim(), limit: String(cap(limit)), fields });
      const response = JSON.parse(await requestText(this.source, `https://openlibrary.org/search.json?${params.toString()}`));
      return ok((response.docs || []).slice(0, cap(limit)).filter((doc: any) => typeof doc.key === 'string' && /^\/works\/OL\d+W$/.test(doc.key)).map((doc: any) => {
        const edition = doc.editions?.docs?.[0] || {};
        const rights = openLibraryEditionAccess(edition.ebook_access);
        return baseRecord(this.source, {
          id: `openlibrary:${doc.key}`,
          externalId: doc.key,
          title: doc.title || 'Untitled',
          author: doc.author_name?.[0] || 'Unknown Author',
          authors: doc.author_name || [],
          language: doc.language?.[0] || 'und',
          year: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
          publisher: edition.publisher?.[0],
          isbn: doc.isbn || edition.isbn || [],
          coverImage: doc.cover_i ? `https://covers.openlibrary.org/b/id/${encodeURIComponent(String(doc.cover_i))}-M.jpg` : undefined,
          sourceUrl: `https://openlibrary.org${doc.key}`,
          description: 'Open Library bibliographic record. Reading or borrowing availability and reuse rights must be checked on the provider page.',
          rights,
          rightsNote: rights === RightsCategory.BORROWABLE
            ? 'Open Library reports this edition as borrowable on its service. Borrowing is subject to provider eligibility and limits; this is not a reuse license and no local copy is enabled.'
            : rights === RightsCategory.OPEN_ACCESS
              ? 'Open Library reports this edition as publicly readable on its service. This access signal is not a reuse license; no local copy is enabled.'
              : 'Open Library record or ebook_access does not establish public-domain status or redistribution rights.',
          availability: rights === RightsCategory.BORROWABLE ? 'provider-borrowable'
            : rights === RightsCategory.OPEN_ACCESS ? 'provider-full-view' : 'official-source-only',
          canImport: false,
          metadata: { edition_key: doc.edition_key, edition_title: edition.title, publisher: edition.publisher, publish_date: edition.publish_date, ebook_access: edition.ebook_access }
        });
      }));
    } catch (error) {
      return failed(error);
    }
  }

  async getBook(locator: BookLocator): Promise<ConnectorResponse<ExternalLibraryRecord>> {
    const rawId = locator.id || locator.record?.externalId;
    let recordPath: string;
    if (rawId && /^\/(?:works\/OL\d+W|books\/OL\d+M)$/.test(rawId)) recordPath = rawId;
    else if (locator.isbn && /^[0-9Xx-]{10,20}$/.test(locator.isbn)) recordPath = `/isbn/${encodeURIComponent(locator.isbn)}`;
    else return failed(new Error('Open Library requires a valid work/edition ID or ISBN'));
    try {
      const json = JSON.parse(await requestText(this.source, `https://openlibrary.org${recordPath}.json`));
      return ok(baseRecord(this.source, {
        id: `openlibrary:${recordPath}`,
        externalId: recordPath,
        title: json.title || 'Untitled',
        author: json.by_statement || 'Unknown Author',
        sourceUrl: `https://openlibrary.org${recordPath}`,
        rights: RightsCategory.UNKNOWN,
        rightsNote: 'No explicit reuse license was supplied; use the official provider page for access information.',
        availability: 'official-source-only',
        canImport: false,
        metadata: json
      }));
    } catch (error) {
      return failed(error);
    }
  }

  getMetadata(locator: BookLocator) { return this.getBook(locator); }
  async getAvailability(_locator: BookLocator) { return unsupported('Open Library metadata does not establish borrowability or redistribution rights.'); }
  async getFullText(_locator: BookLocator) { return unsupported<FullText>('Open Library discovery metadata does not grant local full-text access.'); }
  async getDownloadLinks(_locator: BookLocator) { return unsupported<string[]>('Open Library ebook access is not itself a redistribution license.'); }
  getSourceInformation() {
    return enabledSourceInformation(this.source, ['Search API and Work/Edition JSON are used.', 'ebook_access is not treated as a copyright or redistribution license.']);
  }
}

const GOOGLE_BOOKS_FIELDS = 'items(id,volumeInfo(title,authors,publisher,publishedDate,description,industryIdentifiers,language,imageLinks,previewLink,infoLink,canonicalVolumeLink,categories),accessInfo(country,viewability,accessViewStatus,publicDomain,webReaderLink,epub,pdf,downloadAccess))';

function googleBooksId(locator: BookLocator): string | undefined {
  const candidate = locator.id || locator.identifier || locator.record?.externalId || '';
  return /^[A-Za-z0-9_-]{1,128}$/.test(candidate) ? candidate : undefined;
}

function trustedGoogleBooksUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  try {
    const url = new URL(raw);
    const hostAllowed = url.hostname === 'books.google.com' || url.hostname === 'books.googleusercontent.com' || url.hostname.endsWith('.books.googleusercontent.com');
    if (!hostAllowed || url.username || url.password || !['http:', 'https:'].includes(url.protocol)) return undefined;
    url.protocol = 'https:';
    return url.toString();
  } catch {
    return undefined;
  }
}

function googleBooksRights(access: any): RightsCategory {
  if (access?.publicDomain === true) return RightsCategory.PUBLIC_DOMAIN;
  if (access?.viewability === 'PARTIAL') return RightsCategory.PREVIEW_ONLY;
  if (access?.viewability === 'NO_PAGES') return RightsCategory.METADATA_ONLY;
  return RightsCategory.UNKNOWN;
}

function googleBooksDownloadLinks(access: any): string[] {
  if (access?.publicDomain !== true || access?.downloadAccess?.restricted !== false) return [];
  return ['epub', 'pdf'].flatMap(format => {
    const item = access?.[format];
    if (item?.isAvailable !== true) return [];
    const link = trustedGoogleBooksUrl(item.downloadLink);
    return link ? [link] : [];
  });
}

function mapGoogleBooksVolume(volume: any): ExternalLibraryRecord | undefined {
  const id = typeof volume?.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(volume.id) ? volume.id : undefined;
  if (!id) return undefined;
  const info = volume.volumeInfo || {};
  const access = volume.accessInfo || {};
  const rights = googleBooksRights(access);
  const authors = textList(info.authors);
  const isbn = (Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : [])
    .filter((identifier: any) => identifier?.type === 'ISBN_10' || identifier?.type === 'ISBN_13')
    .map((identifier: any) => String(identifier.identifier || '').trim())
    .filter(Boolean);
  const coverImage = trustedGoogleBooksUrl(info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail);
  const previewUrl = trustedGoogleBooksUrl(info.previewLink) || trustedGoogleBooksUrl(access.webReaderLink);
  const sourceUrl = trustedGoogleBooksUrl(info.canonicalVolumeLink) || trustedGoogleBooksUrl(info.infoLink) || `https://books.google.com/books?id=${encodeURIComponent(id)}`;
  const downloadLinks = googleBooksDownloadLinks(access);
  const year = typeof info.publishedDate === 'string' ? info.publishedDate.match(/^\d{4}/)?.[0] : undefined;
  const country = typeof access.country === 'string' && /^[A-Za-z]{2}$/.test(access.country) ? access.country.toUpperCase() : undefined;
  const rightsNote = rights === RightsCategory.PUBLIC_DOMAIN
    ? `Google Books reports public-domain status${country ? ` for ${country}` : ' for the returned access region'}; status varies by jurisdiction and does not itself grant redistribution permission.`
    : 'Google Books viewability describes access on its service, not a reuse license. Follow the official preview/reader restrictions; local import is not permitted.';
  const availability = downloadLinks.length ? 'provider-download' : access.viewability === 'ALL_PAGES'
    ? 'provider-full-view'
    : access.viewability === 'PARTIAL' ? 'provider-preview'
      : access.viewability === 'NO_PAGES' ? 'metadata-only' : 'access-unknown';
  return baseRecord('googlebooks', {
    id: `googlebooks:${id}`,
    externalId: id,
    title: typeof info.title === 'string' && info.title.trim() ? info.title.trim() : 'Untitled',
    author: authors[0] || 'Unknown Author',
    authors,
    language: typeof info.language === 'string' && info.language ? info.language : 'und',
    year,
    publisher: typeof info.publisher === 'string' ? info.publisher : undefined,
    isbn,
    description: typeof info.description === 'string' ? info.description.slice(0, 3000) : '',
    coverImage,
    sourceUrl,
    rights,
    rightsNote,
    availability,
    canImport: false,
    downloadLinks,
    metadata: {
      country,
      viewability: typeof access.viewability === 'string' ? access.viewability : 'UNKNOWN',
      accessViewStatus: typeof access.accessViewStatus === 'string' ? access.accessViewStatus : 'UNKNOWN',
      publicDomain: access.publicDomain === true,
      previewUrl,
      categories: textList(info.categories)
    }
  });
}

export class GoogleBooksConnector implements LibraryConnector {
  readonly source = 'googlebooks' as const;

  private apiKey(): string | undefined {
    return process.env.GOOGLE_BOOKS_API_KEY?.trim() || undefined;
  }

  private async requestVolume(url: URL): Promise<any> {
    const key = this.apiKey();
    if (!key) throw new Error('Google Books requires a server-side GOOGLE_BOOKS_API_KEY.');
    url.searchParams.set('key', key);
    const cacheUrl = new URL(url);
    cacheUrl.searchParams.delete('key');
    return JSON.parse(await requestText(this.source, url.toString(), 10_000, cacheUrl.toString()));
  }

  async search(query: string, limit = 10): Promise<ConnectorResponse<ExternalLibraryRecord[]>> {
    if (!query.trim()) return ok([]);
    if (!this.apiKey()) return failed(new Error('Google Books requires a server-side GOOGLE_BOOKS_API_KEY.'));
    try {
      const normalized = query.trim().replace(/[\s-]/g, '');
      const searchQuery = /^\d{9}[\dXx]$|^\d{13}$/.test(normalized)
        ? `isbn:${normalized}`
        : query.trim().replace(/^author\s*:/i, 'inauthor:');
      const url = new URL(SOURCE_CONFIG[this.source].api);
      url.searchParams.set('q', searchQuery);
      url.searchParams.set('maxResults', String(cap(limit)));
      url.searchParams.set('startIndex', '0');
      url.searchParams.set('printType', 'books');
      url.searchParams.set('fields', GOOGLE_BOOKS_FIELDS);
      const response = await this.requestVolume(url);
      return ok((Array.isArray(response.items) ? response.items : []).slice(0, cap(limit))
        .map(mapGoogleBooksVolume).filter((record: ExternalLibraryRecord | undefined): record is ExternalLibraryRecord => !!record));
    } catch (error) {
      return failed(error);
    }
  }

  async getBook(locator: BookLocator): Promise<ConnectorResponse<ExternalLibraryRecord>> {
    if (!this.apiKey()) return failed(new Error('Google Books requires a server-side GOOGLE_BOOKS_API_KEY.'));
    const id = googleBooksId(locator);
    if (!id && locator.isbn && /^[0-9Xx -]{10,20}$/.test(locator.isbn)) {
      const result = await this.search(locator.isbn, 1);
      if (result.status !== 'ok') return propagateFailure<ExternalLibraryRecord>(result, 'Google Books ISBN lookup failed.');
      const match = result.data?.[0];
      return match ? ok(match) : failed(new Error('Google Books ISBN record was not found.'));
    }
    if (!id) return failed(new Error('Google Books requires a valid volume ID or ISBN.'));
    try {
      const url = new URL(`${SOURCE_CONFIG[this.source].api}/${encodeURIComponent(id)}`);
      url.searchParams.set('fields', GOOGLE_BOOKS_FIELDS.replace(/^items\(/, '').replace(/\)$/, ''));
      const response = await this.requestVolume(url);
      const record = mapGoogleBooksVolume(response);
      return record ? ok(record) : failed(new Error('Google Books volume response did not include a valid volume ID.'));
    } catch (error) {
      return failed(error);
    }
  }

  getMetadata(locator: BookLocator) { return this.getBook(locator); }

  async getAvailability(locator: BookLocator): Promise<ConnectorResponse<unknown>> {
    const record = await this.getBook(locator);
    if (record.status !== 'ok' || !record.data) return propagateFailure<unknown>(record, 'Could not verify the Google Books volume.');
    const metadata = record.data.metadata || {};
    return ok({
      country: metadata.country,
      viewability: metadata.viewability,
      accessViewStatus: metadata.accessViewStatus,
      publicDomain: metadata.publicDomain,
      previewUrl: metadata.previewUrl,
      downloadAvailable: (record.data.downloadLinks || []).length > 0,
      downloadFormats: (record.data.downloadLinks || []).map(url => {
        try { return new URL(url).searchParams.get('format')?.toUpperCase() || 'UNKNOWN'; } catch { return 'UNKNOWN'; }
      })
    });
  }

  async getFullText(_locator: BookLocator) {
    return unsupported<FullText>('Google Books text must remain in the official preview/reader; full text is not copied into EARTH ONE.');
  }

  async getDownloadLinks(locator: BookLocator): Promise<ConnectorResponse<string[]>> {
    const record = await this.getBook(locator);
    if (record.status !== 'ok' || !record.data) return propagateFailure<string[]>(record, 'Could not verify Google Books download access.');
    if (record.data.rights !== RightsCategory.PUBLIC_DOMAIN) return unsupported<string[]>('Google Books did not report public-domain status for this access region.');
    return ok(record.data.downloadLinks || []);
  }

  getSourceInformation() {
    return enabledSourceInformation(this.source, [
      'Uses the official Google Books Volumes API; searches and ISBN queries run server-side.',
      'Requires GOOGLE_BOOKS_API_KEY in server environment; never expose the key to the browser.',
      'Viewability and public-domain status are country-specific; previews are not copied and all local imports are disabled.'
    ], 'api-key');
  }
}

function europeanaTextList(value: unknown, depth = 0): string[] {
  if (depth > 5 || value == null) return [];
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(item => europeanaTextList(item, depth + 1));
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const preferred = ['def', 'en', 'value', '@value'].filter(key => key in object);
    return (preferred.length ? preferred : Object.keys(object)).flatMap(key => europeanaTextList(object[key], depth + 1));
  }
  return [];
}

function europeanaFieldValues(item: any, ...fields: string[]): string[] {
  const containers = [
    item,
    ...(Array.isArray(item?.aggregations) ? item.aggregations : []),
    ...(Array.isArray(item?.proxies) ? item.proxies : [])
  ];
  return [...new Set(containers.flatMap(container => fields.flatMap(field => europeanaTextList(container?.[field]))))];
}

function normalizeEuropeanaRightsUri(raw: string): string | undefined {
  try {
    const url = new URL(raw.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    return `${url.hostname.toLowerCase()}${url.pathname.toLowerCase().replace(/\/+$/, '')}`;
  } catch {
    return undefined;
  }
}

function classifyEuropeanaRights(statements: string[]): RightsCategory {
  const unique = [...new Set(statements.map(normalizeEuropeanaRightsUri).filter((uri): uri is string => !!uri))];
  if (unique.length !== 1) return RightsCategory.UNKNOWN;
  const statement = unique[0];
  if (/creativecommons\.org\/publicdomain\/(?:mark|zero)\/1\.0$/.test(statement)) return RightsCategory.PUBLIC_DOMAIN;
  if (/creativecommons\.org\/licenses\/(?:by|by-sa|by-nd|by-nc|by-nc-sa|by-nc-nd)\/\d+(?:\.\d+)?(?:\/[a-z-]+)?$/.test(statement)) {
    return RightsCategory.OPEN_LICENSE;
  }
  if (/rightsstatements\.org\/vocab\/(?:noc-nc|noc-oklr|inc|inc-edu|inc-ow-eu)\/1\.0$/.test(statement)) {
    return RightsCategory.COPYRIGHT_RESTRICTED;
  }
  return RightsCategory.UNKNOWN;
}

function trustedEuropeanaRightsUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    const host = url.hostname.toLowerCase();
    if (host !== 'creativecommons.org' && host !== 'rightsstatements.org') return undefined;
    url.protocol = 'https:';
    return url.toString();
  } catch {
    return undefined;
  }
}

function europeanaAllowsThumbnail(statements: string[]): boolean {
  const normalized = statements.map(normalizeEuropeanaRightsUri).filter((uri): uri is string => !!uri);
  if (normalized.length !== 1) return false;
  return /creativecommons\.org\/publicdomain\/(?:mark|zero)\/1\.0$/.test(normalized[0]) ||
    /creativecommons\.org\/licenses\/by(?:-sa)?\/\d+(?:\.\d+)?(?:\/[a-z-]+)?$/.test(normalized[0]);
}

function trustedEuropeanaThumbnail(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;
    if (url.hostname !== 'europeana.eu' && !url.hostname.endsWith('.europeana.eu')) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function validEuropeanaRecordId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let candidate = raw.trim().replace(/^europeana:/i, '');
  if (/^https?:\/\/data\.europeana\.eu\/item\//i.test(candidate)) {
    try { candidate = new URL(candidate).pathname.replace(/^\/item/, ''); } catch { return undefined; }
  }
  const match = candidate.match(/^\/([A-Za-z0-9._~-]{1,80})\/([A-Za-z0-9._~:+@%-]{1,240})$/);
  if (!match || match[1] === '.' || match[1] === '..' || match[2] === '.' || match[2] === '..' || /%(?:2f|5c)/i.test(match[2])) return undefined;
  return `/${match[1]}/${match[2]}`;
}

function europeanaApiPathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%25([0-9a-f]{2})/gi, '%$1');
}

function mapEuropeanaItem(item: any): ExternalLibraryRecord | undefined {
  const recordId = validEuropeanaRecordId(typeof item?.id === 'string' ? item.id : typeof item?.about === 'string' ? item.about : undefined);
  if (!recordId) return undefined;

  const rightsStatements = europeanaFieldValues(item, 'edmRights', 'rights');
  const rights = classifyEuropeanaRights(rightsStatements);
  const title = europeanaFieldValues(item, 'title', 'dcTitle')[0] || 'Untitled cultural heritage item';
  const authors = europeanaFieldValues(item, 'dcCreator', 'creator', 'dcContributor');
  const description = europeanaFieldValues(item, 'dcDescription', 'description')[0] || '';
  const rawYear = europeanaFieldValues(item, 'year', 'dcDate')[0] || '';
  const year = rawYear.match(/(?:^|[^\d])(\d{4})(?:[^\d]|$)/)?.[1];
  const rawLanguage = europeanaFieldValues(item, 'language', 'dcLanguage')[0] || 'und';
  const rawPreview = europeanaFieldValues(item, 'edmPreview')[0];
  const coverImage = europeanaAllowsThumbnail(rightsStatements) ? trustedEuropeanaThumbnail(rawPreview) : undefined;
  const sourceUrl = `https://www.europeana.eu/item${recordId}`;
  const statement = rightsStatements[0];
  const licenseUrl = trustedEuropeanaRightsUrl(statement);
  const rightsNote = rights === RightsCategory.PUBLIC_DOMAIN
    ? 'Europeana marks this digital object as public domain. The statement applies to the provider’s object, not only its metadata; verify the source page and local law. Local import and downloads remain disabled.'
    : rights === RightsCategory.OPEN_LICENSE
      ? `Europeana reports an item-level open license${statement ? ` (${statement})` : ''}; attribution, non-commercial, share-alike or no-derivatives conditions may apply. Local import and downloads remain disabled.`
      : rights === RightsCategory.COPYRIGHT_RESTRICTED
        ? `Europeana reports a rights statement with reuse restrictions${statement ? ` (${statement})` : ''}. Follow the contributing institution’s terms; only the official record link is provided.`
        : 'No single recognized item-level reuse statement was confirmed. Europeana metadata is CC0, but that does not license this digital object; use the official record and provider page.';
  const identifiers = europeanaFieldValues(item, 'identifier', 'dcIdentifier');
  const isbn = europeanaTextList(item?.isbn).map(value => value.replace(/[^0-9Xx]/g, '').toUpperCase()).filter(value => value.length === 10 || value.length === 13);
  const doi = europeanaTextList(item?.doi).find(value => /^10\.\d{4,9}\//i.test(value));
  const providerUrl = europeanaFieldValues(item, 'edmIsShownAt')[0];
  const normalizedProviderUrl = (() => {
    if (!providerUrl) return undefined;
    try {
      const url = new URL(providerUrl);
      return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined;
    } catch { return undefined; }
  })();
  const providers = europeanaFieldValues(item, 'dataProvider', 'provider');
  const resourceType = europeanaFieldValues(item, 'type')[0] || 'Cultural heritage';

  return baseRecord('europeana', {
    id: `europeana:${recordId}`,
    externalId: recordId,
    title,
    author: authors[0] || 'Unknown Creator',
    authors,
    language: rawLanguage,
    year,
    isbn: [...new Set(isbn)],
    doi,
    identifier: identifiers[0],
    description: description.slice(0, 3000),
    coverImage,
    sourceUrl,
    rights,
    rightsStatement: statement,
    licenseUrl,
    rightsNote,
    availability: coverImage ? 'licensed-thumbnail-and-official-source' : 'official-source-only',
    canImport: false,
    downloadLinks: [],
    metadata: {
      resourceType,
      provider: providers[0],
      providerUrl: normalizedProviderUrl,
      rightsStatements: rightsStatements.slice(0, 5),
      thumbnailAvailable: !!coverImage,
      fullText: 'unsupported',
      downloads: 'unsupported'
    }
  });
}

export class EuropeanaConnector implements LibraryConnector {
  readonly source = 'europeana' as const;

  private apiKey(): string | undefined {
    return process.env.EUROPEANA_API_KEY?.trim() || undefined;
  }

  private async requestJson(url: URL): Promise<any> {
    const key = this.apiKey();
    if (!key) throw new Error('Europeana requires a server-side EUROPEANA_API_KEY.');
    url.searchParams.set('wskey', key);
    const cacheUrl = new URL(url);
    cacheUrl.searchParams.delete('wskey');
    const response = JSON.parse(await requestText(this.source, url.toString(), 10_000, cacheUrl.toString()));
    if (!response || response.success !== true) throw new Error('Europeana API did not confirm a successful request.');
    return response;
  }

  async search(query: string, limit = 10): Promise<ConnectorResponse<ExternalLibraryRecord[]>> {
    if (!query.trim()) return ok([]);
    if (!this.apiKey()) return failed(new Error('Europeana requires a server-side EUROPEANA_API_KEY.'));
    try {
      const url = new URL(SOURCE_CONFIG[this.source].api);
      const authorSearch = query.trim().match(/^author\s*:\s*(.+)$/i);
      const searchTerm = authorSearch
        ? `proxy_dc_creator:"${authorSearch[1].replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
        : query.trim();
      url.searchParams.set('query', searchTerm);
      url.searchParams.set('rows', String(cap(limit)));
      const response = await this.requestJson(url);
      if (!Array.isArray(response.items)) throw new Error('Europeana search response did not contain an items array.');
      return ok(response.items.slice(0, cap(limit))
        .map(mapEuropeanaItem)
        .filter((record: ExternalLibraryRecord | undefined): record is ExternalLibraryRecord => !!record));
    } catch (error) {
      return failed(error);
    }
  }

  async getBook(locator: BookLocator): Promise<ConnectorResponse<ExternalLibraryRecord>> {
    if (!this.apiKey()) return failed(new Error('Europeana requires a server-side EUROPEANA_API_KEY.'));
    const recordId = validEuropeanaRecordId(locator.record?.externalId || locator.identifier || locator.id);
    if (!recordId) return failed(new Error('Europeana requires a valid dataset/local record ID.'));
    try {
      const [dataset, localId] = recordId.slice(1).split('/');
      const endpoint = SOURCE_CONFIG[this.source].api.replace(/\/search\.json$/, '');
      const url = new URL(`${endpoint}/${europeanaApiPathSegment(dataset)}/${europeanaApiPathSegment(localId)}.json`);
      const response = await this.requestJson(url);
      const record = mapEuropeanaItem({ ...response.object, id: recordId });
      return record ? ok(record) : failed(new Error('Europeana record response did not contain a valid item.'));
    } catch (error) {
      return failed(error);
    }
  }

  getMetadata(locator: BookLocator) { return this.getBook(locator); }

  async getAvailability(locator: BookLocator): Promise<ConnectorResponse<unknown>> {
    const record = await this.getBook(locator);
    if (record.status !== 'ok' || !record.data) return propagateFailure<unknown>(record, 'Could not verify the Europeana record.');
    return ok({
      rights: record.data.rights,
      officialUrl: record.data.sourceUrl,
      thumbnailAvailable: !!record.data.coverImage,
      reading: 'official-provider-page-only',
      fullText: 'unsupported',
      downloads: 'unsupported'
    });
  }

  async getFullText(_locator: BookLocator) {
    return unsupported<FullText>('Europeana discovery does not establish lawful full-text access; open the official record and provider page.');
  }

  async getDownloadLinks(_locator: BookLocator) {
    return unsupported<string[]>('Europeana may expose media links with item-specific terms; direct downloads are not enabled by this connector.');
  }

  getSourceInformation() {
    return enabledSourceInformation(this.source, [
      'Uses the official Europeana Search and Record APIs for cultural heritage metadata.',
      'Requires EUROPEANA_API_KEY on the server; the wskey is removed from the cache key and never returned to clients.',
      'Europeana metadata CC0 does not license the underlying digital object; rights are mapped from the item-level edm:rights statement.',
      'Only HTTPS Europeana thumbnails under CC0/Public Domain Mark or CC BY/CC BY-SA are displayed; full-text import and downloads stay disabled.'
    ], 'api-key');
  }
}

function normalizeAcademicDoi(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  let value = raw.trim().replace(/^doi:\s*/i, '');
  value = value.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
  if (!/^10\.\d{4,9}\//i.test(value) || /[\s?#]/.test(value)) return undefined;
  return value.toLowerCase();
}

function academicHttpsUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function mapOpenAlexWork(work: any): ExternalLibraryRecord | undefined {
  const rawId = typeof work?.id === 'string' ? work.id : '';
  const workId = rawId.match(/(?:^|\/)(W\d+)$/i)?.[1]?.toUpperCase();
  if (!workId) return undefined;
  const title = typeof work.title === 'string' && work.title.trim() ? work.title.trim() : 'Untitled academic work';
  const authors = Array.isArray(work.authorships)
    ? work.authorships.map((entry: any) => entry?.author?.display_name).filter((name: unknown): name is string => typeof name === 'string' && !!name.trim())
    : [];
  const doi = normalizeAcademicDoi(work.doi || work.ids?.doi);
  const isOpenAccess = work.open_access?.is_oa === true;
  const location = work.best_oa_location || work.primary_location || {};
  const providerFullTextUrl = isOpenAccess
    ? academicHttpsUrl(location.landing_page_url || location.pdf_url || work.open_access?.oa_url)
    : undefined;
  const journal = work.primary_location?.source?.display_name || work.best_oa_location?.source?.display_name;
  return baseRecord('openalex', {
    id: `openalex:${workId}`,
    externalId: workId,
    title,
    author: authors[0] || 'Unknown Author',
    authors,
    language: typeof work.language === 'string' && work.language ? work.language : 'und',
    year: work.publication_year ? String(work.publication_year) : undefined,
    doi,
    description: '',
    sourceUrl: `https://openalex.org/${workId}`,
    providerFullTextUrl,
    rights: isOpenAccess ? RightsCategory.OPEN_ACCESS : RightsCategory.METADATA_ONLY,
    rightsNote: isOpenAccess
      ? 'OpenAlex reports an open-access location; this does not itself grant reuse or redistribution rights. Check the article version and license at the provider.'
      : 'OpenAlex provides discovery metadata only for this result; article access and reuse rights must be checked at the official record.',
    availability: providerFullTextUrl ? 'provider-full-view' : isOpenAccess ? 'official-source-only' : 'metadata-only',
    canImport: false,
    downloadLinks: [],
    metadata: { workType: work.type, journal, openAccess: isOpenAccess, oaStatus: work.open_access?.oa_status, license: location.license }
  });
}

function validOpenAlexWorkId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  const urlMatch = value.match(/^https?:\/\/(?:www\.)?openalex\.org\/(W\d+)$/i);
  const id = urlMatch?.[1] || value;
  return /^W\d+$/i.test(id) ? id.toUpperCase() : undefined;
}

function validOpenAlexEntityId(raw: string | undefined, prefix: 'A' | 'I'): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  const urlMatch = value.match(new RegExp(`^https?://(?:www\\.)?openalex\\.org/(${prefix}\\d+)$`, 'i'));
  const id = urlMatch?.[1] || value;
  return new RegExp(`^${prefix}\\d+$`, 'i').test(id) ? id.toUpperCase() : undefined;
}

function mapOpenAlexAuthor(author: any): ExternalLibraryRecord | undefined {
  const authorId = validOpenAlexEntityId(typeof author?.id === 'string' ? author.id : undefined, 'A');
  if (!authorId) return undefined;
  const name = typeof author.display_name === 'string' && author.display_name.trim() ? author.display_name.trim() : 'Unnamed OpenAlex author';
  const institutions = Array.isArray(author.last_known_institutions)
    ? author.last_known_institutions.map((item: any) => item?.display_name).filter((value: unknown): value is string => typeof value === 'string' && !!value.trim())
    : [];
  const orcid = academicHttpsUrl(author.orcid);
  const stats = [
    Number.isFinite(author.works_count) ? `${author.works_count} works` : undefined,
    Number.isFinite(author.cited_by_count) ? `${author.cited_by_count} citations` : undefined
  ].filter(Boolean);
  return baseRecord('openalex', {
    id: `openalex:${authorId}`,
    externalId: authorId,
    title: name,
    author: name,
    authors: [name],
    description: [stats.join(' · '), institutions.length ? `Affiliation: ${institutions.join(', ')}` : undefined, orcid ? `ORCID: ${orcid}` : undefined].filter(Boolean).join(' · '),
    sourceUrl: `https://openalex.org/${authorId}`,
    rights: RightsCategory.METADATA_ONLY,
    rightsNote: 'OpenAlex author profile metadata is provided for discovery only; it does not expose or authorize copying article full text.',
    availability: 'metadata-only',
    canImport: false,
    downloadLinks: [],
    metadata: {
      resourceType: 'author',
      worksCount: Number.isFinite(author.works_count) ? author.works_count : undefined,
      citedByCount: Number.isFinite(author.cited_by_count) ? author.cited_by_count : undefined,
      orcid,
      affiliations: institutions
    }
  });
}

function mapOpenAlexInstitution(institution: any): ExternalLibraryRecord | undefined {
  const institutionId = validOpenAlexEntityId(typeof institution?.id === 'string' ? institution.id : undefined, 'I');
  if (!institutionId) return undefined;
  const name = typeof institution.display_name === 'string' && institution.display_name.trim() ? institution.display_name.trim() : 'Unnamed OpenAlex institution';
  const countryCode = typeof institution.country_code === 'string' ? institution.country_code : undefined;
  const institutionType = typeof institution.type === 'string' ? institution.type : undefined;
  const stats = [
    Number.isFinite(institution.works_count) ? `${institution.works_count} works` : undefined,
    Number.isFinite(institution.cited_by_count) ? `${institution.cited_by_count} citations` : undefined
  ].filter(Boolean);
  return baseRecord('openalex', {
    id: `openalex:${institutionId}`,
    externalId: institutionId,
    title: name,
    author: [institutionType, countryCode].filter(Boolean).join(' · ') || 'Research institution',
    description: stats.join(' · '),
    sourceUrl: `https://openalex.org/${institutionId}`,
    rights: RightsCategory.METADATA_ONLY,
    rightsNote: 'OpenAlex institution profile metadata is provided for discovery only; it does not expose or authorize copying article full text.',
    availability: 'metadata-only',
    canImport: false,
    downloadLinks: [],
    metadata: {
      resourceType: 'institution',
      countryCode,
      institutionType,
      worksCount: Number.isFinite(institution.works_count) ? institution.works_count : undefined,
      citedByCount: Number.isFinite(institution.cited_by_count) ? institution.cited_by_count : undefined,
      homepageUrl: typeof institution.homepage_url === 'string' ? institution.homepage_url : undefined,
      ror: typeof institution.ror === 'string' ? institution.ror : undefined
    }
  });
}

export class OpenAlexConnector implements LibraryConnector {
  readonly source = 'openalex' as const;

  async search(query: string, limit = 10): Promise<ConnectorResponse<ExternalLibraryRecord[]>> {
    if (!query.trim()) return ok([]);
    try {
      const prefixMatch = query.trim().match(/^(author|institution):\s*(.*)$/i);
      const entity = prefixMatch?.[1].toLowerCase();
      const term = prefixMatch ? prefixMatch[2].trim() : query.trim();
      if (prefixMatch && !term) return ok([]);
      const endpoint = entity === 'author' ? 'authors' : entity === 'institution' ? 'institutions' : 'works';
      const url = new URL(SOURCE_CONFIG[this.source].api);
      url.pathname = `/${endpoint}`;
      const doi = endpoint === 'works' ? normalizeAcademicDoi(term) : undefined;
      if (doi) url.searchParams.set('filter', `doi:https://doi.org/${doi}`);
      else url.searchParams.set('search', term);
      url.searchParams.set('per_page', String(cap(limit)));
      const fields = endpoint === 'authors'
        ? 'id,display_name,orcid,works_count,cited_by_count,last_known_institutions'
        : endpoint === 'institutions'
          ? 'id,display_name,country_code,type,works_count,cited_by_count,homepage_url,ror'
          : 'id,doi,title,publication_year,language,authorships,primary_location,best_oa_location,open_access,type,ids';
      url.searchParams.set('select', fields);
      const response = JSON.parse(await requestText(this.source, url.toString()));
      if (!Array.isArray(response.results)) throw new Error('OpenAlex response did not contain a results array.');
      return ok(response.results.slice(0, cap(limit))
        .map((record: any) => endpoint === 'authors' ? mapOpenAlexAuthor(record) : endpoint === 'institutions' ? mapOpenAlexInstitution(record) : mapOpenAlexWork(record))
        .filter((record: ExternalLibraryRecord | undefined): record is ExternalLibraryRecord => !!record));
    } catch (error) {
      return failed(error);
    }
  }

  async getBook(locator: BookLocator): Promise<ConnectorResponse<ExternalLibraryRecord>> {
    const rawId = locator.record?.externalId || locator.identifier || locator.id;
    const workId = validOpenAlexWorkId(rawId);
    const authorId = validOpenAlexEntityId(rawId, 'A');
    const institutionId = validOpenAlexEntityId(rawId, 'I');
    const id = workId || authorId || institutionId;
    if (!id) return failed(new Error('OpenAlex requires a valid work (W), author (A), or institution (I) ID.'));
    try {
      const endpoint = authorId ? 'authors' : institutionId ? 'institutions' : 'works';
      const url = endpoint === 'works'
        ? `${SOURCE_CONFIG[this.source].api}/${id}`
        : `https://api.openalex.org/${endpoint}/${id}`;
      const response = JSON.parse(await requestText(this.source, url));
      const record = endpoint === 'authors' ? mapOpenAlexAuthor(response) : endpoint === 'institutions' ? mapOpenAlexInstitution(response) : mapOpenAlexWork(response);
      return record ? ok(record) : failed(new Error(`OpenAlex did not return a valid ${endpoint} record.`));
    } catch (error) {
      return failed(error);
    }
  }

  getMetadata(locator: BookLocator) { return this.getBook(locator); }
  async getAvailability(locator: BookLocator): Promise<ConnectorResponse<unknown>> {
    const result = await this.getBook(locator);
    if (result.status !== 'ok' || !result.data) return propagateFailure<unknown>(result, 'Could not verify the OpenAlex work.');
    return ok({ rights: result.data.rights, providerFullTextUrl: result.data.providerFullTextUrl, reuse: 'verify-provider-license', canImport: false });
  }
  async getFullText(_locator: BookLocator) { return unsupported<FullText>('OpenAlex does not provide an article-copy endpoint in this connector; use the verified provider link when available.'); }
  async getDownloadLinks(_locator: BookLocator) { return unsupported<string[]>('OpenAlex metadata does not authorize downloads or local copies; use the article provider link.'); }
  getSourceInformation() {
    return enabledSourceInformation(this.source, [
      'Uses the official OpenAlex Works, Authors, and Institutions APIs; basic searches are free and do not require an account or API key.',
      'Use author:<name> or institution:<name> for profile discovery; ordinary queries and DOI lookup continue to search works.',
      'OpenAlex metadata is CC0, but article access and reuse rights are assessed separately; this connector never imports article text.'
    ]);
  }
}

function crossrefDoiFromLocator(locator: BookLocator): string | undefined {
  return normalizeAcademicDoi(locator.record?.doi || locator.doi || locator.record?.externalId || locator.identifier || locator.id);
}

function mapCrossrefWork(work: any): ExternalLibraryRecord | undefined {
  const doi = normalizeAcademicDoi(work?.DOI);
  if (!doi) return undefined;
  const title = Array.isArray(work.title) && typeof work.title[0] === 'string' ? work.title[0] : 'Untitled scholarly work';
  const authors = Array.isArray(work.author)
    ? work.author.map((author: any) => [author?.given, author?.family].filter((part: unknown): part is string => typeof part === 'string' && !!part).join(' ') || author?.name)
      .filter((name: unknown): name is string => typeof name === 'string' && !!name.trim())
    : [];
  const date = work['published-print']?.['date-parts']?.[0] || work['published-online']?.['date-parts']?.[0] || work.issued?.['date-parts']?.[0];
  const year = Array.isArray(date) && date[0] ? String(date[0]) : undefined;
  const isbn = Array.isArray(work.ISBN)
    ? work.ISBN.map((value: unknown) => String(value).replace(/[^0-9Xx]/g, '').toUpperCase()).filter((value: string) => value.length === 10 || value.length === 13)
    : [];
  const abstract = typeof work.abstract === 'string' ? decodeXml(work.abstract.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 3000) : '';
  const licenses = Array.isArray(work.license) ? work.license.map((item: any) => ({ url: item?.URL, contentVersion: item?.['content-version'], start: item?.start })) : [];
  return baseRecord('crossref', {
    id: `crossref:${doi.toLowerCase()}`,
    externalId: doi,
    title,
    author: authors[0] || 'Unknown Author',
    authors,
    language: typeof work.language === 'string' && work.language ? work.language : 'und',
    year,
    publisher: typeof work.publisher === 'string' ? work.publisher : undefined,
    isbn,
    doi,
    description: abstract,
    sourceUrl: `https://doi.org/${doi}`,
    rights: RightsCategory.METADATA_ONLY,
    rightsNote: 'Crossref metadata is freely available for discovery; the article, publisher-hosted files, and reported license terms require item-level verification. No local import is allowed.',
    availability: 'metadata-only',
    canImport: false,
    downloadLinks: [],
    metadata: { workType: work.type, containerTitle: work['container-title']?.[0], licenses, publisher: work.publisher }
  });
}

export class CrossrefConnector implements LibraryConnector {
  readonly source = 'crossref' as const;

  private async requestJson(url: URL): Promise<any> {
    const email = process.env.EARTH_ONE_LIBRARY_CONTACT_EMAIL?.trim();
    if (email) url.searchParams.set('mailto', email);
    const response = JSON.parse(await requestText(this.source, url.toString()));
    if (!response?.message) throw new Error('Crossref response did not contain a message.');
    return response.message;
  }

  async search(query: string, limit = 10): Promise<ConnectorResponse<ExternalLibraryRecord[]>> {
    if (!query.trim()) return ok([]);
    try {
      const doi = normalizeAcademicDoi(query);
      if (doi) {
        const result = await this.getBook({ doi });
        return result.status === 'ok' && result.data ? ok([result.data]) : result.status === 'error' && /HTTP 404/.test(result.reason || '') ? ok([]) : propagateFailure<ExternalLibraryRecord[]>(result, 'Crossref DOI lookup failed.');
      }
      const url = new URL(SOURCE_CONFIG[this.source].api);
      const author = query.trim().match(/^author\s*:\s*(.+)$/i)?.[1];
      const title = query.trim().match(/^title\s*:\s*(.+)$/i)?.[1];
      url.searchParams.set(author ? 'query.author' : title ? 'query.title' : 'query.bibliographic', (author || title || query).trim());
      url.searchParams.set('rows', String(cap(limit)));
      const message = await this.requestJson(url);
      if (!Array.isArray(message.items)) throw new Error('Crossref response did not contain an items array.');
      return ok(message.items.slice(0, cap(limit))
        .map(mapCrossrefWork)
        .filter((record: ExternalLibraryRecord | undefined): record is ExternalLibraryRecord => !!record));
    } catch (error) {
      return failed(error);
    }
  }

  async getBook(locator: BookLocator): Promise<ConnectorResponse<ExternalLibraryRecord>> {
    const doi = crossrefDoiFromLocator(locator);
    if (!doi) return failed(new Error('Crossref requires a valid DOI.'));
    try {
      const url = new URL(`${SOURCE_CONFIG[this.source].api}/${doi}`);
      const message = await this.requestJson(url);
      const record = mapCrossrefWork(message);
      return record ? ok(record) : failed(new Error('Crossref DOI record did not contain a valid DOI.'));
    } catch (error) {
      return failed(error);
    }
  }

  getMetadata(locator: BookLocator) { return this.getBook(locator); }
  async getAvailability(locator: BookLocator): Promise<ConnectorResponse<unknown>> {
    const result = await this.getBook(locator);
    if (result.status !== 'ok' || !result.data) return propagateFailure<unknown>(result, 'Could not verify the Crossref record.');
    return ok({ rights: result.data.rights, fullText: 'not-verified', reuse: 'verify-publisher-license', canImport: false });
  }
  async getFullText(_locator: BookLocator) { return unsupported<FullText>('Crossref provides discovery metadata, not article full text through this connector.'); }
  async getDownloadLinks(_locator: BookLocator) { return unsupported<string[]>('Crossref publisher links and license metadata are not treated as download permission.'); }
  getSourceInformation() {
    return enabledSourceInformation(this.source, [
      'Uses the public Crossref REST API; no sign-up or API key is required. An optional configured contact email is sent as mailto for the polite pool.',
      'The connector exposes bibliographic metadata only; article or publisher links are never treated as reuse permission.'
    ]);
  }
}

function validArxivId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let value = raw.trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (!['arxiv.org', 'www.arxiv.org', 'export.arxiv.org'].includes(url.hostname.toLowerCase())) return undefined;
      value = url.pathname.replace(/^\/(?:abs|pdf)\//, '').replace(/\.pdf$/i, '');
    } catch { return undefined; }
  }
  return /^(?:[a-z][a-z0-9.-]*(?:\.[a-z0-9.-]+)?\/)?(?:\d{7}|\d{4}\.\d{4,5})(?:v\d+)?$/i.test(value) ? value : undefined;
}

function trustedArxivUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    if (!['arxiv.org', 'www.arxiv.org', 'export.arxiv.org'].includes(url.hostname.toLowerCase())) return undefined;
    url.protocol = 'https:';
    return url.toString();
  } catch { return undefined; }
}

function parseArxivEntries(feed: string): ExternalLibraryRecord[] {
  return [...feed.matchAll(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi)].flatMap(match => {
    const entry = match[0];
    const id = validArxivId(xmlTextByLocalName(entry, 'id'));
    if (!id) return [];
    const authors = [...entry.matchAll(/<(?:[\w.-]+:)?author(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?author>/gi)]
      .map(author => xmlTextByLocalName(author[1], 'name'))
      .filter((author): author is string => !!author);
    const links = [...entry.matchAll(/<link\b[^>]*>/gi)].map(matchLink => ({
      href: attr(matchLink[0], 'href'),
      title: (attr(matchLink[0], 'title') || '').toLowerCase(),
      type: (attr(matchLink[0], 'type') || '').toLowerCase()
    }));
    const pdf = links.find(link => link.title === 'pdf' || link.type === 'application/pdf' || /\/pdf\//i.test(link.href || ''));
    const providerFullTextUrl = trustedArxivUrl(pdf?.href);
    const absUrl = `https://arxiv.org/abs/${id}`;
    const published = xmlTextByLocalName(entry, 'published');
    const doi = normalizeAcademicDoi(xmlTextByLocalName(entry, 'doi'));
    const categories = [...entry.matchAll(/<(?:[\w.-]+:)?(?:primary_category|category)\b[^>]*>/gi)]
      .map(category => attr(category[0], 'term')).filter((category): category is string => !!category);
    const abstract = xmlTextByLocalName(entry, 'summary') || '';
    const title = (xmlTextByLocalName(entry, 'title') || 'Untitled arXiv paper').replace(/\s+/g, ' ').trim();
    return [baseRecord('arxiv', {
      id: `arxiv:${id}`,
      externalId: id,
      title,
      author: authors[0] || 'Unknown Author',
      authors,
      language: 'und',
      year: published?.match(/^\d{4}/)?.[0],
      doi,
      description: abstract.replace(/\s+/g, ' ').trim().slice(0, 3000),
      sourceUrl: absUrl,
      providerFullTextUrl,
      rights: providerFullTextUrl ? RightsCategory.OPEN_ACCESS : RightsCategory.METADATA_ONLY,
      rightsNote: 'arXiv provides free access to this preprint; the item-specific license controls reuse. Public PDF access is not permission to copy or redistribute.',
      availability: providerFullTextUrl ? 'provider-full-view' : 'metadata-only',
      canImport: false,
      downloadLinks: [],
      metadata: { categories: [...new Set(categories)], journalReference: xmlTextByLocalName(entry, 'journal_ref'), updated: xmlTextByLocalName(entry, 'updated'), fullText: providerFullTextUrl ? 'official-provider-link' : 'unsupported' }
    })];
  });
}

export class ArxivConnector implements LibraryConnector {
  readonly source = 'arxiv' as const;

  async search(query: string, limit = 10): Promise<ConnectorResponse<ExternalLibraryRecord[]>> {
    if (!query.trim()) return ok([]);
    try {
      const url = new URL(SOURCE_CONFIG[this.source].api);
      const fieldMatch = query.trim().match(/^(author|title|abstract)\s*:\s*(.+)$/i);
      const prefix = fieldMatch?.[1].toLowerCase() === 'author' ? 'au' : fieldMatch?.[1].toLowerCase() === 'title' ? 'ti' : fieldMatch?.[1].toLowerCase() === 'abstract' ? 'abs' : 'all';
      const term = (fieldMatch?.[2] || query.trim()).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      url.searchParams.set('search_query', `${prefix}:${/\s/.test(term) ? `"${term}"` : term}`);
      url.searchParams.set('start', '0');
      url.searchParams.set('max_results', String(cap(limit)));
      return ok(parseArxivEntries(await requestText(this.source, url.toString())));
    } catch (error) {
      return failed(error);
    }
  }

  async getBook(locator: BookLocator): Promise<ConnectorResponse<ExternalLibraryRecord>> {
    const id = validArxivId(locator.record?.externalId || locator.identifier || locator.id);
    if (!id) return failed(new Error('arXiv requires a valid arXiv identifier.'));
    try {
      const url = new URL(SOURCE_CONFIG[this.source].api);
      url.searchParams.set('id_list', id);
      url.searchParams.set('max_results', '1');
      const record = parseArxivEntries(await requestText(this.source, url.toString()))[0];
      return record ? ok(record) : failed(new Error('arXiv record was not found.'));
    } catch (error) {
      return failed(error);
    }
  }

  getMetadata(locator: BookLocator) { return this.getBook(locator); }
  async getAvailability(locator: BookLocator): Promise<ConnectorResponse<unknown>> {
    const result = await this.getBook(locator);
    if (result.status !== 'ok' || !result.data) return propagateFailure<unknown>(result, 'Could not verify the arXiv record.');
    return ok({ rights: result.data.rights, providerFullTextUrl: result.data.providerFullTextUrl, reuse: 'verify-item-license', canImport: false });
  }
  async getFullText(_locator: BookLocator) { return unsupported<FullText>('arXiv PDF reading remains on the official arXiv page; local text import is disabled.'); }
  async getDownloadLinks(_locator: BookLocator) { return unsupported<string[]>('arXiv PDFs are linked only as official provider reading access, not as local download permission.'); }
  getSourceInformation() {
    return enabledSourceInformation(this.source, [
      'Uses the official arXiv Atom API without an account or API key; requests are separated by at least three seconds as recommended by arXiv.',
      'Public preprint access does not establish a reuse license; PDF links stay on arxiv.org and local import is disabled.'
    ]);
  }
}

function mapEuropePmcResult(result: any): ExternalLibraryRecord | undefined {
  const source = typeof result?.source === 'string' ? result.source : '';
  const id = typeof result?.id === 'string' ? result.id : '';
  if (!/^[A-Za-z0-9_-]{1,30}$/.test(source) || !/^[A-Za-z0-9._-]{1,80}$/.test(id)) return undefined;
  const pmcid = typeof result.pmcid === 'string' && /^PMC\d+$/i.test(result.pmcid) ? result.pmcid.toUpperCase() : undefined;
  const pmid = typeof result.pmid === 'string' && /^\d+$/.test(result.pmid) ? result.pmid : undefined;
  const isOpenAccess = String(result.isOpenAccess || '').toUpperCase() === 'Y';
  const providerFullTextUrl = isOpenAccess && pmcid ? `https://europepmc.org/articles/${pmcid}` : undefined;
  const authors = Array.isArray(result.authorList?.author)
    ? result.authorList.author.map((author: any) => author?.fullName || [author?.firstName, author?.lastName].filter(Boolean).join(' '))
      .filter((name: unknown): name is string => typeof name === 'string' && !!name.trim())
    : typeof result.authorString === 'string' && result.authorString ? [result.authorString] : [];
  const doi = normalizeAcademicDoi(result.doi);
  const sourceUrl = pmcid
    ? `https://europepmc.org/articles/${pmcid}`
    : `https://europepmc.org/article/${encodeURIComponent(source)}/${encodeURIComponent(id)}`;
  return baseRecord('europepmc', {
    id: `europepmc:${source}:${id}`,
    externalId: `${source}:${id}`,
    identifier: pmid ? `PMID:${pmid}` : pmcid,
    title: typeof result.title === 'string' && result.title.trim() ? result.title.trim() : 'Untitled biomedical article',
    author: authors[0] || 'Unknown Author',
    authors,
    language: 'und',
    year: typeof result.pubYear === 'string' ? result.pubYear : undefined,
    publisher: typeof result.journalTitle === 'string' ? result.journalTitle : undefined,
    doi,
    description: typeof result.abstractText === 'string' ? result.abstractText.replace(/\s+/g, ' ').trim().slice(0, 3000) : '',
    sourceUrl,
    providerFullTextUrl,
    rights: isOpenAccess ? RightsCategory.OPEN_ACCESS : RightsCategory.METADATA_ONLY,
    rightsNote: isOpenAccess
      ? 'Europe PMC marks this article as open access; full-text access does not by itself grant reuse rights. Check the article-level license before copying or redistributing.'
      : 'Europe PMC provides bibliographic metadata only for this result; full-text and reuse rights are not confirmed.',
    availability: providerFullTextUrl ? 'provider-full-view' : isOpenAccess ? 'official-source-only' : 'metadata-only',
    canImport: false,
    downloadLinks: [],
    metadata: { pmid, pmcid, source, isOpenAccess, journalTitle: result.journalTitle, publicationType: result.pubTypeList?.pubType, fullText: providerFullTextUrl ? 'official-provider-link' : 'not-confirmed' }
  });
}

export class EuropePmcConnector implements LibraryConnector {
  readonly source = 'europepmc' as const;

  private async searchRecords(query: string, limit: number): Promise<ExternalLibraryRecord[]> {
    const url = new URL(SOURCE_CONFIG[this.source].api);
    url.searchParams.set('query', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('resultType', 'core');
    url.searchParams.set('pageSize', String(cap(limit)));
    const response = JSON.parse(await requestText(this.source, url.toString()));
    if (!Array.isArray(response?.resultList?.result)) throw new Error('Europe PMC response did not contain a result list.');
    return response.resultList.result.slice(0, cap(limit))
      .map(mapEuropePmcResult)
      .filter((record: ExternalLibraryRecord | undefined): record is ExternalLibraryRecord => !!record);
  }

  async search(query: string, limit = 10): Promise<ConnectorResponse<ExternalLibraryRecord[]>> {
    if (!query.trim()) return ok([]);
    try { return ok(await this.searchRecords(query.trim(), limit)); }
    catch (error) { return failed(error); }
  }

  async getBook(locator: BookLocator): Promise<ConnectorResponse<ExternalLibraryRecord>> {
    const raw = locator.record?.externalId || locator.doi || locator.identifier || locator.id || '';
    const doi = normalizeAcademicDoi(locator.record?.doi || locator.doi || raw);
    const id = raw.replace(/^(?:PMC|PMID|MED|PPR):/i, '');
    const query = doi ? `DOI:${doi}` : /^PMC\d+$/i.test(id) || /^\d+$/.test(id) ? `EXT_ID:${id}` : undefined;
    if (!query) return failed(new Error('Europe PMC requires a DOI, PMID, or PMCID.'));
    try {
      const record = (await this.searchRecords(query, 1))[0];
      return record ? ok(record) : failed(new Error('Europe PMC record was not found.'));
    } catch (error) { return failed(error); }
  }

  getMetadata(locator: BookLocator) { return this.getBook(locator); }
  async getAvailability(locator: BookLocator): Promise<ConnectorResponse<unknown>> {
    const result = await this.getBook(locator);
    if (result.status !== 'ok' || !result.data) return propagateFailure<unknown>(result, 'Could not verify the Europe PMC record.');
    return ok({ rights: result.data.rights, providerFullTextUrl: result.data.providerFullTextUrl, reuse: 'verify-article-license', canImport: false });
  }
  async getFullText(_locator: BookLocator) { return unsupported<FullText>('Europe PMC open full text remains on the official article page; this connector does not copy article text locally.'); }
  async getDownloadLinks(_locator: BookLocator) { return unsupported<string[]>('Europe PMC access status does not by itself authorize downloads or reuse; use the official article page.'); }
  getSourceInformation() {
    return enabledSourceInformation(this.source, [
      'Uses the official Europe PMC REST API without an account or API key for biomedical literature search.',
      'The OA flag is an access signal only; this connector links eligible PMC open-access articles to Europe PMC and never imports full text.'
    ]);
  }
}

function mapPmcSummary(summary: any): ExternalLibraryRecord | undefined {
  const uid = typeof summary?.uid === 'string' || typeof summary?.uid === 'number' ? String(summary.uid) : '';
  if (!/^\d+$/.test(uid)) return undefined;
  const articleIds = Array.isArray(summary.articleids) ? summary.articleids : [];
  const idValue = (type: string): string | undefined => {
    const item = articleIds.find((entry: any) => String(entry?.idtype || '').toLowerCase() === type);
    return typeof item?.value === 'string' ? item.value : undefined;
  };
  const pmcidRaw = idValue('pmcid') || `PMC${uid}`;
  const pmcid = /^PMC\d+$/i.test(pmcidRaw) ? pmcidRaw.toUpperCase() : undefined;
  const pmid = idValue('pmid');
  const doi = normalizeAcademicDoi(idValue('doi'));
  const providerFullTextUrl = pmcid ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/` : undefined;
  const authors = Array.isArray(summary.authors)
    ? summary.authors.map((author: any) => author?.name).filter((name: unknown): name is string => typeof name === 'string' && !!name.trim())
    : [];
  const publicationDate = [summary.pubdate, summary.epubdate, summary.printpubdate].find((value: unknown) => typeof value === 'string') || '';
  return baseRecord('pmc', {
    id: `pmc:${uid}`,
    externalId: uid,
    identifier: pmcid ? `PMCID:${pmcid}` : undefined,
    title: typeof summary.title === 'string' && summary.title.trim() ? summary.title.trim() : 'Untitled PMC article',
    author: authors[0] || 'Unknown Author',
    authors,
    language: 'und',
    year: publicationDate.match(/\b(?:19|20)\d{2}\b/)?.[0],
    publisher: typeof summary.fulljournalname === 'string' ? summary.fulljournalname : typeof summary.source === 'string' ? summary.source : undefined,
    doi,
    description: '',
    sourceUrl: providerFullTextUrl || `https://pmc.ncbi.nlm.nih.gov/articles/PMC${uid}/`,
    providerFullTextUrl,
    rights: RightsCategory.UNKNOWN,
    rightsNote: 'This PMC record links to the official article page, where reading availability and the item-level license must be checked. Inclusion in PMC does not itself grant reuse or redistribution rights.',
    availability: providerFullTextUrl ? 'provider-full-view' : 'official-source-only',
    canImport: false,
    downloadLinks: [],
    metadata: { pmcid, pmid, uid, journal: summary.fulljournalname || summary.source, volume: summary.volume, issue: summary.issue, pages: summary.pages, publicationDate, articleIds }
  });
}

export class PmcConnector implements LibraryConnector {
  readonly source = 'pmc' as const;

  private entrezTerm(query: string): string {
    const raw = query.trim();
    const doi = normalizeAcademicDoi(raw);
    const pmcid = raw.match(/^(?:pmcid\s*:\s*)?(PMC\d+)$/i)?.[1];
    const pmid = raw.match(/^pmid\s*:\s*(\d+)$/i)?.[1];
    const uid = raw.match(/^uid\s*:\s*(\d+)$/i)?.[1];
    const author = raw.match(/^author\s*:\s*(.+)$/i)?.[1];
    const title = raw.match(/^title\s*:\s*(.+)$/i)?.[1];
    const phrase = (value: string) => `"${value.replace(/"/g, '').trim()}"`;
    const expression = doi ? `${doi}[DOI]`
      : pmcid ? `${pmcid}[PMCID]`
        : pmid ? `${pmid}[PMID]`
          : uid ? `${uid}[UID]`
            : author ? `${phrase(author)}[Author]`
              : title ? `${phrase(title)}[Title]`
                : raw;
    return expression;
  }

  private async searchRecords(query: string, limit: number): Promise<ExternalLibraryRecord[]> {
    const searchUrl = new URL(SOURCE_CONFIG[this.source].api);
    searchUrl.searchParams.set('db', 'pmc');
    searchUrl.searchParams.set('term', this.entrezTerm(query));
    searchUrl.searchParams.set('retmode', 'json');
    searchUrl.searchParams.set('retmax', String(cap(limit)));
    searchUrl.searchParams.set('tool', 'earth_one_world_library');
    const searchResponse = JSON.parse(await requestText(this.source, searchUrl.toString()));
    const ids = searchResponse?.esearchresult?.idlist;
    if (!Array.isArray(ids)) throw new Error('NCBI ESearch response did not contain an ID list.');
    if (!ids.length) return [];

    const summaryUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi');
    summaryUrl.searchParams.set('db', 'pmc');
    summaryUrl.searchParams.set('id', ids.filter((id: unknown) => /^\d+$/.test(String(id))).join(','));
    summaryUrl.searchParams.set('retmode', 'json');
    summaryUrl.searchParams.set('tool', 'earth_one_world_library');
    const summaryResponse = JSON.parse(await requestText(this.source, summaryUrl.toString()));
    const result = summaryResponse?.result;
    if (!Array.isArray(result?.uids)) throw new Error('NCBI ESummary response did not contain a UID list.');
    return result.uids.slice(0, cap(limit))
      .map((uid: string) => mapPmcSummary(result[uid]))
      .filter((record: ExternalLibraryRecord | undefined): record is ExternalLibraryRecord => !!record);
  }

  async search(query: string, limit = 10): Promise<ConnectorResponse<ExternalLibraryRecord[]>> {
    if (!query.trim()) return ok([]);
    try { return ok(await this.searchRecords(query, limit)); }
    catch (error) { return failed(error); }
  }

  async getBook(locator: BookLocator): Promise<ConnectorResponse<ExternalLibraryRecord>> {
    const raw = String(locator.record?.externalId || locator.record?.identifier || locator.identifier || locator.id || '');
    const doi = normalizeAcademicDoi(locator.record?.doi || locator.doi || raw);
    const pmcid = raw.match(/PMC\d+/i)?.[0];
    const pmid = raw.match(/PMID\s*:?\s*(\d+)/i)?.[1] || (locator.record?.metadata?.pmid ? String(locator.record.metadata.pmid) : undefined);
    const uid = raw.match(/^(?:pmc:)?(\d+)$/i)?.[1];
    const query = doi ? `doi:${doi}` : pmcid || (uid ? `uid:${uid}` : undefined) || (pmid ? `pmid:${pmid}` : undefined);
    if (!query) return failed(new Error('PubMed Central requires a DOI, PMID, PMCID, or PMC UID.'));
    try {
      const record = (await this.searchRecords(query, 1))[0];
      return record ? ok(record) : failed(new Error('No free-full-text PMC record was found for this identifier.'));
    } catch (error) { return failed(error); }
  }

  getMetadata(locator: BookLocator) { return this.getBook(locator); }
  async getAvailability(locator: BookLocator): Promise<ConnectorResponse<unknown>> {
    const result = await this.getBook(locator);
    if (result.status !== 'ok' || !result.data) return propagateFailure<unknown>(result, 'Could not verify the PMC record.');
    return ok({ rights: result.data.rights, providerFullTextUrl: result.data.providerFullTextUrl, reuse: 'verify-article-license', canImport: false });
  }
  async getFullText(_locator: BookLocator) { return unsupported<FullText>('PMC articles remain on the official PMC page; this connector does not retrieve or copy full text locally.'); }
  async getDownloadLinks(_locator: BookLocator) { return unsupported<string[]>('PMC reading access does not grant local download or redistribution rights; use the official article page.'); }
  getSourceInformation() {
    return enabledSourceInformation(this.source, [
      'Uses official NCBI E-utilities ESearch and ESummary without an API key for bounded PMC bibliographic search and metadata lookup.',
      'NCBI recommends no more than three requests per second; the shared per-source serialized queue stays below that rate.',
      'Free reading access is not treated as a reuse license. Article text is not copied locally, and the individual PMC license remains authoritative.'
    ]);
  }
}

function mapPubmedSummary(summary: any): ExternalLibraryRecord | undefined {
  const pmid = typeof summary?.uid === 'string' || typeof summary?.uid === 'number' ? String(summary.uid) : '';
  if (!/^\d{1,12}$/.test(pmid)) return undefined;
  const articleIds = Array.isArray(summary.articleids) ? summary.articleids : [];
  const idValue = (type: string): string | undefined => {
    const item = articleIds.find((entry: any) => String(entry?.idtype || '').toLowerCase() === type);
    return typeof item?.value === 'string' ? item.value : undefined;
  };
  const doiFromLocation = typeof summary.elocationid === 'string' ? summary.elocationid.match(/(?:doi:\s*)?(10\.\d{4,9}\/[^\s]+)/i)?.[1] : undefined;
  const doi = normalizeAcademicDoi(idValue('doi') || doiFromLocation);
  const authors = Array.isArray(summary.authors)
    ? summary.authors.map((author: any) => author?.name).filter((name: unknown): name is string => typeof name === 'string' && !!name.trim())
    : [];
  const publicationDate = [summary.pubdate, summary.epubdate, summary.sortpubdate].find((value: unknown) => typeof value === 'string') || '';
  const title = typeof summary.title === 'string' && summary.title.trim() ? summary.title.trim() : 'Untitled PubMed article';
  const sourceUrl = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
  return baseRecord('pubmed', {
    id: `pubmed:${pmid}`,
    externalId: pmid,
    identifier: `PMID:${pmid}`,
    title,
    author: authors[0] || 'Unknown Author',
    authors,
    language: 'und',
    year: publicationDate.match(/\b(?:19|20)\d{2}\b/)?.[0],
    publisher: typeof summary.fulljournalname === 'string' ? summary.fulljournalname : typeof summary.source === 'string' ? summary.source : undefined,
    doi,
    description: '',
    sourceUrl,
    rights: RightsCategory.METADATA_ONLY,
    rightsNote: 'PubMed provides bibliographic discovery metadata, not article access or reuse permission; abstracts may contain copyrighted material. Check the official record and item-level license. NCBI/NLM does not provide legal advice: https://www.ncbi.nlm.nih.gov/About/disclaimer.html',
    availability: 'official-source-only',
    canImport: false,
    downloadLinks: [],
    metadata: { pmid, pmcid: idValue('pmcid'), journal: summary.fulljournalname || summary.source, volume: summary.volume, issue: summary.issue, pages: summary.pages, publicationDate, articleIds }
  });
}

export class PubmedConnector implements LibraryConnector {
  readonly source = 'pubmed' as const;

  private entrezTerm(query: string): string {
    const raw = query.trim();
    const doi = normalizeAcademicDoi(raw);
    const pmid = raw.match(/^(?:pmid\s*:\s*)?(\d{1,12})$/i)?.[1];
    const pmcid = raw.match(/^(?:pmcid\s*:\s*)?(PMC\d+)$/i)?.[1];
    const author = raw.match(/^author\s*:\s*(.+)$/i)?.[1];
    const title = raw.match(/^title\s*:\s*(.+)$/i)?.[1];
    const phrase = (value: string) => `"${value.replace(/"/g, '').trim()}"`;
    return doi ? `"${doi}"[AID]`
      : pmid ? `${pmid}[PMID]`
        : pmcid ? `${pmcid}[PMC]`
          : author ? `${phrase(author)}[AU]`
            : title ? `${phrase(title)}[TI]`
              : raw;
  }

  private async searchRecords(query: string, limit: number): Promise<ExternalLibraryRecord[]> {
    const searchUrl = new URL(SOURCE_CONFIG[this.source].api);
    searchUrl.searchParams.set('db', 'pubmed');
    searchUrl.searchParams.set('term', this.entrezTerm(query));
    searchUrl.searchParams.set('retmode', 'json');
    searchUrl.searchParams.set('retmax', String(cap(limit)));
    searchUrl.searchParams.set('tool', 'earth_one_world_library');
    const searchResponse = JSON.parse(await requestText(this.source, searchUrl.toString()));
    const ids = searchResponse?.esearchresult?.idlist;
    if (!Array.isArray(ids)) throw new Error('NCBI ESearch response did not contain an ID list.');
    const numericIds = ids.filter((id: unknown) => /^\d{1,12}$/.test(String(id)));
    if (!numericIds.length) return [];

    const summaryUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi');
    summaryUrl.searchParams.set('db', 'pubmed');
    summaryUrl.searchParams.set('id', numericIds.join(','));
    summaryUrl.searchParams.set('retmode', 'json');
    summaryUrl.searchParams.set('tool', 'earth_one_world_library');
    const summaryResponse = JSON.parse(await requestText(this.source, summaryUrl.toString()));
    const result = summaryResponse?.result;
    if (!Array.isArray(result?.uids)) throw new Error('NCBI ESummary response did not contain a UID list.');
    return result.uids.slice(0, cap(limit))
      .map((uid: string) => mapPubmedSummary(result[uid]))
      .filter((record: ExternalLibraryRecord | undefined): record is ExternalLibraryRecord => !!record);
  }

  async search(query: string, limit = 10): Promise<ConnectorResponse<ExternalLibraryRecord[]>> {
    if (!query.trim()) return ok([]);
    try { return ok(await this.searchRecords(query, limit)); }
    catch (error) { return failed(error); }
  }

  async getBook(locator: BookLocator): Promise<ConnectorResponse<ExternalLibraryRecord>> {
    const raw = String(locator.record?.externalId || locator.record?.identifier || locator.identifier || locator.id || '');
    const doi = normalizeAcademicDoi(locator.record?.doi || locator.doi || raw);
    const pmcid = raw.match(/^(?:PMCID\s*:?\s*)?(PMC\d+)$/i)?.[1];
    const pmid = raw.match(/^(?:pubmed\s*:\s*)?(?:PMID\s*:?\s*)?(\d{1,12})$/i)?.[1] ||
      (locator.record?.metadata?.pmid && /^\d{1,12}$/.test(String(locator.record.metadata.pmid)) ? String(locator.record.metadata.pmid) : undefined);
    const query = doi ? `doi:${doi}` : pmcid || (pmid ? `pmid:${pmid}` : undefined);
    if (!query) return failed(new Error('PubMed requires a valid PMID, PMCID, or DOI.'));
    try {
      const record = (await this.searchRecords(query, 1))[0];
      return record ? ok(record) : failed(new Error('PubMed record was not found.'));
    } catch (error) { return failed(error); }
  }

  getMetadata(locator: BookLocator) { return this.getBook(locator); }
  async getAvailability(locator: BookLocator): Promise<ConnectorResponse<unknown>> {
    const result = await this.getBook(locator);
    if (result.status !== 'ok' || !result.data) return propagateFailure<unknown>(result, 'Could not verify the PubMed record.');
    return ok({ rights: result.data.rights, officialUrl: result.data.sourceUrl, fullText: 'check-official-record', reuse: 'not-confirmed', canImport: false });
  }
  async getFullText(_locator: BookLocator) { return unsupported<FullText>('PubMed is a bibliographic index; article reading, when available, remains on the official record or linked provider.'); }
  async getDownloadLinks(_locator: BookLocator) { return unsupported<string[]>('PubMed bibliographic records do not grant article downloads; check the official record and item-level license.'); }
  getSourceInformation() {
    return enabledSourceInformation(this.source, [
      'Uses official NCBI E-utilities ESearch and ESummary for bounded PubMed metadata queries; no account or API key is required.',
      'PubMed is distinct from PubMed Central: results are bibliographic metadata with official PubMed links, not verified full text.',
      'PubMed and PMC share one serialized NCBI request queue to stay below NCBI rate guidance; no article text is copied or imported.'
    ]);
  }
}

export class GutenbergConnector implements LibraryConnector {
  readonly source = 'gutenberg' as const;

  async search(query: string, limit = 10): Promise<ConnectorResponse<ExternalLibraryRecord[]>> {
    if (!query.trim()) return ok([]);
    try {
      const url = `https://www.gutenberg.org/ebooks/search.opds/?query=${encodeURIComponent(query.trim())}`;
      const records = parseGutenbergEntries(await requestText(this.source, url)).slice(0, cap(limit));
      return ok(records.map(record => ({
        ...record,
        availability: record.textUrl || record.epubUrl ? 'provider-download' : 'verify-official-opds',
        canImport: record.rights === RightsCategory.PUBLIC_DOMAIN && /^\d{1,8}$/.test(record.externalId)
      })));
    } catch (error) {
      return failed(error);
    }
  }

  async getBook(locator: BookLocator): Promise<ConnectorResponse<ExternalLibraryRecord>> {
    const id = gutenbergBookId(locator);
    if (!id) return failed(new Error('Project Gutenberg requires a numeric ebook ID'));
    try {
      const url = `https://www.gutenberg.org/ebooks/${id}.opds`;
      const xml = await requestText(this.source, url);
      const record = parseGutenbergEntries(xml).find(item => item.externalId === id);
      if (!record) return failed(new Error('Gutenberg OPDS record was not found'));
      return ok({ ...record, metadata: { opdsUrl: url } });
    } catch (error) {
      return failed(error);
    }
  }

  getMetadata(locator: BookLocator) { return this.getBook(locator); }

  async getAvailability(locator: BookLocator) {
    const record = await this.getBook(locator);
    if (record.status !== 'ok') return record;
    return ok({ read: record.data?.textUrl || record.data?.epubUrl ? 'provider-download' : 'official-source-only', borrow: 'not-required-for-listed-public-domain-items' });
  }

  async getFullText(locator: BookLocator): Promise<ConnectorResponse<FullText>> {
    const record = await this.getBook(locator);
    if (record.status !== 'ok' || !record.data) return propagateFailure<FullText>(record, 'Could not verify the Gutenberg record.');
    if (record.data.rights !== RightsCategory.PUBLIC_DOMAIN) return unsupported('The record is not classified as public domain by the selected source.');
    if (!record.data.textUrl) return unsupported('This Gutenberg record has no plain-text link; an EPUB may still be available on the official source.');
    try {
      return ok(await fetchBookFullText(record.data.textUrl));
    } catch (error) {
      return failed(error);
    }
  }

  async getDownloadLinks(locator: BookLocator): Promise<ConnectorResponse<string[]>> {
    const record = await this.getBook(locator);
    if (record.status !== 'ok' || !record.data) return propagateFailure<string[]>(record, 'Could not verify the Gutenberg record.');
    if (record.data.rights !== RightsCategory.PUBLIC_DOMAIN) return unsupported('Download is blocked because source public-domain status was not confirmed.');
    return ok(record.data.downloadLinks || []);
  }

  getSourceInformation() {
    return enabledSourceInformation(this.source, ['Official OPDS/OpenSearch catalog only; no HTML catalog crawling.', 'Project Gutenberg public-domain statements are jurisdiction-specific, not a global guarantee.']);
  }
}

export class InternetArchiveConnector implements LibraryConnector {
  readonly source = 'archive' as const;

  async search(query: string, limit = 8): Promise<ConnectorResponse<ExternalLibraryRecord[]>> {
    if (!query.trim()) return ok([]);
    try {
      const phrase = `"${query.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      const fieldedQuery = `(title:${phrase} OR creator:${phrase} OR identifier:${phrase}) AND mediatype:texts`;
      const params = new URLSearchParams({ q: fieldedQuery, rows: String(cap(limit)), output: 'json' });
      for (const field of ['identifier', 'title', 'creator', 'language', 'year', 'licenseurl', 'rights', 'restricted', 'format', 'isbn']) params.append('fl[]', field);
      const response = JSON.parse(await requestText(this.source, `https://archive.org/advancedsearch.php?${params.toString()}`));
      return ok((response.response?.docs || []).slice(0, cap(limit)).filter((doc: any) => typeof doc.identifier === 'string' && validIaIdentifier(doc.identifier)).map((doc: any) => {
        const rights = iaRights(doc);
        const formats = textList(doc.format);
        const hasTextFile = formats.some(value => /dju?vu\s*txt|ocr|plain.?text|(^|\b)text(\b|$)/i.test(value));
        return baseRecord(this.source, {
          id: `archive_${doc.identifier}`,
          externalId: doc.identifier,
          identifier: doc.identifier,
          title: doc.title || doc.identifier,
          author: Array.isArray(doc.creator) ? doc.creator[0] : (doc.creator || 'Unknown Author'),
          language: Array.isArray(doc.language) ? doc.language[0] : (doc.language || 'und'),
          year: doc.year ? String(Array.isArray(doc.year) ? doc.year[0] : doc.year) : undefined,
          isbn: textList(doc.isbn),
          sourceUrl: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`,
          description: 'Internet Archive catalog record. Text/OCR availability and reuse rights must be verified separately.',
          rights,
          licenseUrl: typeof doc.licenseurl === 'string' ? doc.licenseurl : undefined,
          rightsNote: String(doc.licenseurl || doc.rights || 'No explicit rights statement was supplied by the catalog record.'),
          availability: rights === RightsCategory.UNKNOWN ? 'official-item-page-only' : 'provider-item-page',
          canImport: rightsPermitLocalCopy(rights) && hasTextFile,
          metadata: { formats, restricted: doc.restricted }
        });
      }));
    } catch (error) {
      return failed(error);
    }
  }

  async getBook(locator: BookLocator): Promise<ConnectorResponse<ExternalLibraryRecord>> {
    const id = locator.identifier || locator.record?.identifier || locator.id?.replace(/^archive_/, '');
    if (!id || !validIaIdentifier(id)) return failed(new Error('Internet Archive requires a valid item identifier'));
    try {
      const json = JSON.parse(await requestText(this.source, `https://archive.org/metadata/${encodeURIComponent(id)}`));
      const metadata = json.metadata || {};
      const rights = iaRights({ ...metadata, restricted: metadata.restricted, 'access-restricted-item': metadata['access-restricted-item'] });
      const files = Array.isArray(json.files) ? json.files : [];
      const hasOcr = files.some((file: any) => typeof file.name === 'string' && /_djvu\.txt$/i.test(file.name));
      return ok(baseRecord(this.source, {
        id: `archive_${id}`,
        externalId: id,
        identifier: id,
        title: metadata.title || id,
        author: Array.isArray(metadata.creator) ? metadata.creator[0] : (metadata.creator || 'Unknown Author'),
        language: Array.isArray(metadata.language) ? metadata.language[0] : (metadata.language || 'und'),
        year: metadata.year ? String(metadata.year) : undefined,
        sourceUrl: `https://archive.org/details/${encodeURIComponent(id)}`,
        description: String(metadata.description || 'Internet Archive item record.'),
        rights,
        licenseUrl: typeof metadata.licenseurl === 'string' ? metadata.licenseurl : undefined,
        rightsNote: String(metadata.licenseurl || metadata.rights || 'No explicit rights statement was supplied.'),
        availability: hasOcr ? 'ocr-file-listed' : 'official-item-page-only',
        canImport: rightsPermitLocalCopy(rights) && hasOcr,
        metadata: json
      }));
    } catch (error) {
      return failed(error);
    }
  }

  getMetadata(locator: BookLocator) { return this.getBook(locator); }

  async getAvailability(locator: BookLocator) {
    const record = await this.getBook(locator);
    if (record.status !== 'ok' || !record.data) return record;
    const metadata = record.data.metadata as any;
    return ok({ read: 'official-item-page', rights: record.data.rights, restricted: metadata?.metadata?.['access-restricted-item'] || metadata?.metadata?.restricted || false });
  }

  async getFullText(locator: BookLocator): Promise<ConnectorResponse<FullText>> {
    const record = await this.getBook(locator);
    if (record.status !== 'ok' || !record.data) return propagateFailure<FullText>(record, 'Could not verify the Internet Archive record.');
    if (!rightsPermitLocalCopy(record.data.rights)) return unsupported('Local full-text import requires explicit public-domain or open-license evidence; open-access/unknown records are not copied.');
    if (!record.data.canImport) return unsupported('The Internet Archive metadata does not list an OCR text file for this item.');
    try {
      return ok(await fetchInternetArchiveFullText(record.data.identifier!));
    } catch (error) {
      return failed(error);
    }
  }

  async getDownloadLinks(locator: BookLocator): Promise<ConnectorResponse<string[]>> {
    const record = await this.getBook(locator);
    if (record.status !== 'ok' || !record.data) return propagateFailure<string[]>(record, 'Could not verify the Internet Archive record.');
    if (!rightsPermitLocalCopy(record.data.rights)) return unsupported('Direct download links are blocked until explicit public-domain or open-license evidence is present.');
    const metadata = record.data.metadata as any;
    const files: any[] = Array.isArray(metadata?.files) ? metadata.files : [];
    const itemId = record.data.identifier!;
    const links = files
      .filter(file => typeof file.name === 'string' && (/_djvu\.txt$/i.test(file.name) || /\.pdf$/i.test(file.name)))
      .map(file => `https://archive.org/download/${encodeURIComponent(itemId)}/${encodeURIComponent(file.name)}`);
    return ok(links);
  }

  getSourceInformation() {
    return enabledSourceInformation(this.source, ['Official Advanced Search and Item Metadata APIs are used.', 'mediatype:texts, OCR, and access-restricted flags do not themselves establish rights or loan availability.', 'Local copies require explicit public-domain or open-license evidence plus a listed OCR file.']);
  }
}

export class WikisourceConnector implements LibraryConnector {
  readonly source: LibrarySource = 'wikisource';

  async search(query: string, limit = 10): Promise<ConnectorResponse<ExternalLibraryRecord[]>> {
    try {
      return ok((await searchWikisource(query, cap(limit))).map(result => mapWikisourceResult(result, this.source)));
    } catch (error) {
      return failed(error);
    }
  }

  async getBook(locator: BookLocator) { return this.getMetadata(locator); }

  async getMetadata(locator: BookLocator): Promise<ConnectorResponse<ExternalLibraryRecord>> {
    const record = locator.record;
    const pageTitle = record?.pageTitle || locator.pageTitle;
    if (!pageTitle) return failed(new Error('Wikisource requires a page title'));
    return ok(baseRecord(this.source, {
      id: record?.id || `wikisource:${pageTitle}`,
      externalId: record?.externalId || pageTitle,
      title: record?.title || pageTitle,
      author: record?.author || 'Unknown Author',
      pageTitle,
      sourceUrl: `https://zh.wikisource.org/wiki/${encodeURIComponent(pageTitle)}`,
      rights: RightsCategory.UNKNOWN,
      rightsNote: 'Wikisource hosting does not prove the underlying work’s public-domain or reuse status; check the page license before copying.',
      availability: 'official-page-only',
      canImport: false
    }));
  }

  async getAvailability(_locator: BookLocator) { return unsupported('Wikisource has no universal borrowability API.'); }

  async getFullText(locator: BookLocator): Promise<ConnectorResponse<FullText>> {
    const pageTitle = locator.record?.pageTitle || locator.pageTitle;
    if (!pageTitle) return failed(new Error('Wikisource requires a page title'));
    if (!locator.record || !rightsPermitLocalCopy(locator.record.rights)) return unsupported('Local import is disabled until this Wikisource page has an explicit public-domain/open-license classification.');
    try {
      return ok(await fetchWikisourceFullText(pageTitle));
    } catch (error) {
      return failed(error);
    }
  }

  async getDownloadLinks(_locator: BookLocator) { return unsupported<string[]>('Wikisource download links are not exposed without page-specific rights evidence.'); }

  getSourceInformation() {
    return enabledSourceInformation(this.source, ['Existing Chinese Wikisource search is preserved.', 'Search results link to the official page; local copying is disabled until page-specific rights are established.']);
  }
}

export class ArabicWikisourceConnector extends WikisourceConnector {
  readonly source = 'ar_wikisource' as const;

  async search(query: string, limit = 8): Promise<ConnectorResponse<ExternalLibraryRecord[]>> {
    try {
      return ok((await searchArabicWikisource(query, cap(limit))).map(result => mapWikisourceResult(result, this.source)));
    } catch (error) {
      return failed(error);
    }
  }

  async getMetadata(locator: BookLocator): Promise<ConnectorResponse<ExternalLibraryRecord>> {
    const record = locator.record;
    const pageTitle = record?.pageTitle || locator.pageTitle;
    if (!pageTitle) return failed(new Error('Arabic Wikisource requires a page title'));
    return ok(baseRecord(this.source, {
      id: record?.id || `ar_wikisource:${pageTitle}`,
      externalId: record?.externalId || pageTitle,
      title: record?.title || pageTitle,
      author: record?.author || 'Unknown Author',
      pageTitle,
      sourceUrl: `https://ar.wikisource.org/wiki/${encodeURIComponent(pageTitle)}`,
      rights: RightsCategory.UNKNOWN,
      rightsNote: 'Arabic Wikisource hosting does not establish the underlying work’s license; verify the page before copying.',
      availability: 'official-page-only',
      canImport: false
    }));
  }

  async getFullText(locator: BookLocator): Promise<ConnectorResponse<FullText>> {
    const pageTitle = locator.record?.pageTitle || locator.pageTitle;
    if (!pageTitle) return failed(new Error('Arabic Wikisource requires a page title'));
    if (!locator.record || !rightsPermitLocalCopy(locator.record.rights)) return unsupported('Local import is disabled until this Arabic Wikisource page has an explicit public-domain/open-license classification.');
    try {
      return ok(await fetchArabicWikisourceFullText(pageTitle));
    } catch (error) {
      return failed(error);
    }
  }

  getSourceInformation() {
    return enabledSourceInformation(this.source, ['Existing Arabic Wikisource search is preserved.', 'Search results link to the official page; local copying is disabled until page-specific rights are established.']);
  }
}

export class ShamelaConnector implements LibraryConnector {
  readonly source = 'shamela' as const;

  async search(query: string, limit = 10): Promise<ConnectorResponse<ExternalLibraryRecord[]>> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return ok([]);
    if (!containsArabicScript(normalizedQuery)) {
      return unsupported('Shamela search expects an Arabic query; this source was not queried for a non-Arabic search to avoid misleading matches.');
    }
    try {
      const payload = await callShamelaSearch(normalizedQuery);
      const hits = Array.isArray(payload.layers)
        ? payload.layers.flatMap((layer: any) => Array.isArray(layer?.results) ? layer.results : [])
        : [];
      const seenBooks = new Set<string>();
      const records: ExternalLibraryRecord[] = [];
      for (const hit of hits) {
        const bookId = Number(hit?.book_id);
        const pageId = Number(hit?.page_id);
        if (!Number.isSafeInteger(bookId) || bookId < 1 || !Number.isSafeInteger(pageId) || pageId < 1) continue;
        if (typeof hit?.title !== 'string' || !hit.title.trim() || seenBooks.has(String(bookId))) continue;
        seenBooks.add(String(bookId));
        const externalId = `${bookId}/${pageId}`;
        records.push(baseRecord(this.source, {
          id: `shamela:${bookId}:${pageId}`,
          externalId,
          identifier: externalId,
          title: hit.title.trim(),
          author: typeof hit.author === 'string' && hit.author.trim() && hit.author.trim() !== '-' ? hit.author.trim() : 'Unknown Author',
          language: 'ar',
          description: '',
          sourceUrl: `https://shamela.ws/book/${bookId}/${pageId}`,
          rights: RightsCategory.UNKNOWN,
          rightsNote: 'The official read-only MCP supports discovery, but this edition’s reuse rights are not verified. Read on the official page and check item-level terms before copying.',
          availability: 'official-source-only',
          canImport: false,
          metadata: { resourceType: 'book-page', bookId, pageId }
        }));
        if (records.length >= cap(limit)) break;
      }
      return ok(records);
    } catch (error) {
      return failed(error);
    }
  }

  async getBook(locator: BookLocator) { return this.getMetadata(locator); }

  async getMetadata(locator: BookLocator): Promise<ConnectorResponse<ExternalLibraryRecord>> {
    const existing = locator.record?.source === this.source ? locator.record : undefined;
    const rawId = existing?.externalId || locator.identifier || locator.id || '';
    const match = /^(?:shamela:)?(\d+)[:/](\d+)$/.exec(rawId);
    if (!match) return failed(new Error('Shamela requires a numeric book/page identifier from an official search result.'));
    const bookId = Number(match[1]);
    const pageId = Number(match[2]);
    if (!Number.isSafeInteger(bookId) || bookId < 1 || !Number.isSafeInteger(pageId) || pageId < 1) {
      return failed(new Error('Invalid Shamela book/page identifier.'));
    }
    const externalId = `${bookId}/${pageId}`;
    return ok(baseRecord(this.source, {
      id: existing?.id || `shamela:${bookId}:${pageId}`,
      externalId,
      identifier: externalId,
      title: existing?.title || 'Shamela book page',
      author: existing?.author || 'Unknown Author',
      language: 'ar',
      sourceUrl: `https://shamela.ws/book/${bookId}/${pageId}`,
      rights: RightsCategory.UNKNOWN,
      rightsNote: 'Metadata comes from an official search citation; reuse rights have not been verified.',
      availability: 'official-source-only',
      canImport: false,
      metadata: { resourceType: 'book-page', bookId, pageId }
    }));
  }

  async getAvailability(_locator: BookLocator) {
    return unsupported('The Shamela MCP guide does not document a borrowability or availability lookup.');
  }

  async getFullText(_locator: BookLocator) {
    return unsupported('In-app full-text retrieval and copying are not enabled; use the official Shamela page. Search responses are not retained.');
  }

  async getDownloadLinks(_locator: BookLocator) {
    return unsupported('Shamela download links are not exposed by this connector; use the official site and check its terms.');
  }

  getSourceInformation() {
    return enabledSourceInformation(this.source, [
      'Uses the official Shamela read-only MCP endpoint documented at https://shamela.ws/mcp-guide/.',
      'The official guide describes free read-only access without an API key or a Shamela account.',
      'Only book/author/page metadata and official citation URLs are returned; response bodies are not cached, retained, or imported, and item-level rights remain UNKNOWN.'
    ]);
  }
}

function mapWikisourceResult(result: BookSearchResult, source: LibrarySource): ExternalLibraryRecord {
  const host = source === 'ar_wikisource' ? 'ar.wikisource.org' : 'zh.wikisource.org';
  const pageTitle = result.pageTitle || result.title;
  return baseRecord(source, {
    id: result.id,
    externalId: result.id,
    title: result.title,
    author: result.author || 'Unknown Author',
    language: result.language || (source === 'ar_wikisource' ? 'ar' : 'zh'),
    year: result.year,
    description: result.description,
    pageTitle,
    identifier: result.identifier,
    sourceUrl: `https://${host}/wiki/${encodeURIComponent(pageTitle)}`,
    rights: RightsCategory.UNKNOWN,
    rightsNote: 'Search result/hosting does not prove the underlying work is public domain or reusable; check the page license.',
    availability: 'official-page-only',
    canImport: false,
    legacy: result
  });
}

export function createLibraryConnectors(): Record<LibrarySource, LibraryConnector> {
  return {
    openlibrary: new OpenLibraryConnector(),
    archive: new InternetArchiveConnector(),
    gutenberg: new GutenbergConnector(),
    googlebooks: new GoogleBooksConnector(),
    europeana: new EuropeanaConnector(),
    wikisource: new WikisourceConnector(),
    ar_wikisource: new ArabicWikisourceConnector(),
    openalex: new OpenAlexConnector(),
    crossref: new CrossrefConnector(),
    arxiv: new ArxivConnector(),
    europepmc: new EuropePmcConnector(),
    pmc: new PmcConnector(),
    pubmed: new PubmedConnector(),
    shamela: new ShamelaConnector()
  };
}

export const libraryConnectors: LibraryConnector[] = Object.values(createLibraryConnectors());

export function getLibraryConnector(id: LibrarySource): LibraryConnector | undefined {
  return libraryConnectors.find(connector => connector.source === id);
}

function normalizeIsbnIdentity(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.replace(/[^0-9Xx]/g, '').toUpperCase();
  if (/^\d{13}$/.test(value)) {
    const checksum = [...value].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    return checksum % 10 === 0 ? value : undefined;
  }
  if (!/^\d{9}[\dX]$/.test(value)) return undefined;
  const checksum = [...value.slice(0, 9)].reduce((sum, digit, index) => sum + Number(digit) * (10 - index), 0) + (value[9] === 'X' ? 10 : Number(value[9]));
  if (checksum % 11 !== 0) return undefined;
  const isbn13Prefix = `978${value.slice(0, 9)}`;
  const checksum13 = [...isbn13Prefix].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return `${isbn13Prefix}${(10 - checksum13 % 10) % 10}`;
}

function recordSourceIdentity(record: ExternalLibraryRecord): string | undefined {
  const id = record.externalId?.trim() || record.id?.trim();
  return id ? `${record.source}:${id}` : undefined;
}

function dedupeByExactIdentifier(records: ExternalLibraryRecord[]): ExternalLibraryRecord[] {
  const output: ExternalLibraryRecord[] = [];
  const groups: Array<{
    primary: ExternalLibraryRecord;
    records: ExternalLibraryRecord[];
    dois: Set<string>;
    isbns: Set<string>;
    sourceIds: Set<string>;
  }> = [];
  for (const record of records) {
    const doi = normalizeAcademicDoi(record.doi);
    const isbns = new Set((record.isbn || []).map(normalizeIsbnIdentity).filter((value): value is string => !!value));
    const sourceId = recordSourceIdentity(record);
    const exactDoiGroup = doi ? groups.find(group => group.dois.has(doi) && (!isbns.size || !group.isbns.size || [...isbns].some(isbn => group.isbns.has(isbn)))) : undefined;
    let match = exactDoiGroup;

    if (!match && sourceId) {
      const sourceMatches = groups.filter(group => group.sourceIds.has(sourceId)
        && (!doi || [...group.dois].every(existingDoi => existingDoi === doi))
        && (!isbns.size || !group.isbns.size || [...isbns].some(isbn => group.isbns.has(isbn))));
      if (sourceMatches.length === 1) match = sourceMatches[0];
    }

    if (!match && isbns.size) {
      const isbnMatches = groups.filter(group => {
        const doiConflict = doi !== undefined && [...group.dois].some(existingDoi => existingDoi !== doi);
        return !doiConflict && [...isbns].some(isbn => group.isbns.has(isbn));
      });
      if (isbnMatches.length === 1) match = isbnMatches[0];
      else if (isbnMatches.length > 1) {
        const candidateDois = new Set(isbnMatches.flatMap(group => [...group.dois]));
        if (doi) candidateDois.add(doi);
        if (candidateDois.size <= 1) match = isbnMatches[0];
      }
    }

    if (!match) {
      output.push(record);
      groups.push({
        primary: record,
        records: [record],
        dois: new Set(doi ? [doi] : []),
        isbns,
        sourceIds: new Set(sourceId ? [sourceId] : [])
      });
      continue;
    }

    match.records.push(record);
    if (doi) match.dois.add(doi);
    for (const isbn of isbns) match.isbns.add(isbn);
    if (sourceId) match.sourceIds.add(sourceId);

    const existing = match.primary;
    existing.isbn = [...new Set([...(existing.isbn || []), ...(record.isbn || [])])];
    if (!existing.doi && doi) existing.doi = doi;
    if (!existing.identifier && record.identifier) existing.identifier = record.identifier;
    const alternateLinks = [
      ...(record.alternateSources || []),
      { source: record.source, name: record.sourceName, url: record.sourceUrl }
    ];
    existing.alternateSources ||= [];
    for (const alternate of alternateLinks) {
      if (alternate.source === existing.source && alternate.url === existing.sourceUrl) continue;
      if (!existing.alternateSources.some(source => source.source === alternate.source && source.url === alternate.url)) {
        existing.alternateSources.push(alternate);
      }
    }
  }
  return output;
}

export async function searchLibrary(query: string, options: LibrarySearchOptions = {}): Promise<{ results: ExternalLibraryRecord[]; sources: SourceSearchStatus[] }> {
  const selectedIds = options.sources || ['openlibrary', 'archive', 'gutenberg', 'openalex', 'crossref', 'arxiv', 'europepmc', 'pmc', 'pubmed', 'googlebooks', 'europeana', 'wikisource', 'ar_wikisource', 'shamela'];
  const limit = cap(options.limit || 10);
  const selected = selectedIds.map(id => getLibraryConnector(id)).filter((connector): connector is LibraryConnector => !!connector);
  const enabled = selected.filter(connector => isLibraryConnectorEnabled(connector.source));
  const disabledStatuses: SourceSearchStatus[] = selected
    .filter(connector => !isLibraryConnectorEnabled(connector.source))
    .map(connector => ({ source: connector.source, name: SOURCE_NAMES[connector.source], status: 'disabled', count: 0, reason: disabledSourceReason(connector.source) }));

  const settled = await Promise.all(enabled.map(async connector => {
    try {
      return { connector, response: await connector.search(query, limit) };
    } catch (error) {
      // A single adapter rejection must not fail the unified search for every source.
      return { connector, response: failed<ExternalLibraryRecord[]>(error) };
    }
  }));
  const results: ExternalLibraryRecord[] = [];
  const sources: SourceSearchStatus[] = [...disabledStatuses];
  for (const { connector, response } of settled) {
    if (response.status === 'ok') results.push(...(response.data || []));
    sources.push({ source: connector.source, name: SOURCE_NAMES[connector.source], status: response.status, count: response.data?.length || 0, reason: response.reason });
  }
  return { results: dedupeByExactIdentifier(results), sources };
}

export function clearLibraryConnectorCache(): void {
  cache.clear();
  lastRequestBySource.clear();
  requestQueueBySource.clear();
}
