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

export type LibrarySource = 'openlibrary' | 'archive' | 'gutenberg' | 'googlebooks' | 'wikisource' | 'ar_wikisource';
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
  wikisource: 'Wikisource',
  ar_wikisource: 'Arabic Wikisource'
};
const SOURCE_CONFIG: Record<LibrarySource, { env: string; website: string; api: string }> = {
  openlibrary: { env: 'EARTH_ONE_LIBRARY_OPENLIBRARY_ENABLED', website: 'https://openlibrary.org', api: 'https://openlibrary.org/search.json' },
  archive: { env: 'EARTH_ONE_LIBRARY_ARCHIVE_ENABLED', website: 'https://archive.org', api: 'https://archive.org/advancedsearch.php' },
  gutenberg: { env: 'EARTH_ONE_LIBRARY_GUTENBERG_ENABLED', website: 'https://www.gutenberg.org', api: 'https://www.gutenberg.org/ebooks/search.opds/' },
  googlebooks: { env: 'EARTH_ONE_LIBRARY_GOOGLEBOOKS_ENABLED', website: 'https://books.google.com', api: 'https://www.googleapis.com/books/v1/volumes' },
  wikisource: { env: 'EARTH_ONE_LIBRARY_WIKISOURCE_ENABLED', website: 'https://zh.wikisource.org', api: 'https://zh.wikisource.org/w/api.php' },
  ar_wikisource: { env: 'EARTH_ONE_LIBRARY_AR_WIKISOURCE_ENABLED', website: 'https://ar.wikisource.org', api: 'https://ar.wikisource.org/w/api.php' }
};
const CACHE_TTL_MS = 60_000;
const MIN_REQUEST_INTERVAL_MS = 1_000;
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
  return !configured || !['false', '0', 'off', 'no', 'disabled'].includes(configured.trim().toLowerCase());
}

function disabledSourceReason(source: LibrarySource): string {
  if (source === 'googlebooks' && !process.env.GOOGLE_BOOKS_API_KEY?.trim()) {
    return 'Requires a server-side GOOGLE_BOOKS_API_KEY; the connector stays disabled until configured.';
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

  const previous = requestQueueBySource.get(source) || Promise.resolve();
  let releaseQueue!: () => void;
  const queueTurn = new Promise<void>(resolve => { releaseQueue = resolve; });
  const queued = previous.catch(() => undefined).then(() => queueTurn);
  requestQueueBySource.set(source, queued);
  await previous.catch(() => undefined);
  try {
    const freshCache = cache.get(cacheKey);
    if (freshCache && freshCache.expiresAt > Date.now()) return freshCache.value;
    const lastRequest = lastRequestBySource.get(source) || 0;
    const delay = Math.max(0, MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequest));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      lastRequestBySource.set(source, Date.now());
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json, application/atom+xml, application/xml, text/plain',
          'User-Agent': userAgent()
        }
      });
      if (!response.ok) throw new Error(`${SOURCE_NAMES[source]} returned HTTP ${response.status}`);
      const value = await response.text();
      cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
      return value;
    } finally {
      clearTimeout(timer);
    }
  } finally {
    releaseQueue();
    if (requestQueueBySource.get(source) === queued) requestQueueBySource.delete(source);
  }
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
  if (/publicdomain\/(?:mark|zero)|public domain|no known copyright restrictions/.test(statement)) return RightsCategory.PUBLIC_DOMAIN;
  if (/creativecommons\.org\/licenses\/(?:by|by-sa|by-nc|by-nd)|\bcc\s*(?:by|zero)(?:-sa|-nc|-nd)?\s*\d|\bmit license\b|\bgpl(?:-\d)?\b/.test(statement)) return RightsCategory.OPEN_LICENSE;
  if (/open access/.test(statement)) return RightsCategory.OPEN_ACCESS;
  if (/all rights reserved|in copyright|copyrighted/.test(statement)) return RightsCategory.COPYRIGHT_RESTRICTED;
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
          rights: RightsCategory.UNKNOWN,
          rightsNote: 'Open Library record or ebook_access does not establish public-domain status or redistribution rights.',
          availability: 'official-source-only',
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
    wikisource: new WikisourceConnector(),
    ar_wikisource: new ArabicWikisourceConnector()
  };
}

export const libraryConnectors: LibraryConnector[] = Object.values(createLibraryConnectors());

export function getLibraryConnector(id: LibrarySource): LibraryConnector | undefined {
  return libraryConnectors.find(connector => connector.source === id);
}

function dedupeByExactIdentifier(records: ExternalLibraryRecord[]): ExternalLibraryRecord[] {
  const output: ExternalLibraryRecord[] = [];
  const byKey = new Map<string, ExternalLibraryRecord>();
  for (const record of records) {
    const doi = record.doi?.trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '');
    const isbn = (record.isbn || []).map(value => value.replace(/[^0-9Xx]/g, '').toUpperCase()).find(value => value.length === 10 || value.length === 13);
    const key = doi ? `doi:${doi}` : isbn ? `isbn:${isbn}` : undefined;
    if (!key) {
      output.push(record);
      continue;
    }
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, record);
      output.push(record);
      continue;
    }
    existing.alternateSources ||= [];
    if (!existing.alternateSources.some(source => source.source === record.source && source.url === record.sourceUrl)) {
      existing.alternateSources.push({ source: record.source, name: record.sourceName, url: record.sourceUrl });
    }
  }
  return output;
}

export async function searchLibrary(query: string, options: LibrarySearchOptions = {}): Promise<{ results: ExternalLibraryRecord[]; sources: SourceSearchStatus[] }> {
  const selectedIds = options.sources || ['openlibrary', 'archive', 'gutenberg', 'googlebooks', 'wikisource', 'ar_wikisource'];
  const limit = cap(options.limit || 10);
  const selected = selectedIds.map(id => getLibraryConnector(id)).filter((connector): connector is LibraryConnector => !!connector);
  const enabled = selected.filter(connector => isLibraryConnectorEnabled(connector.source));
  const disabledStatuses: SourceSearchStatus[] = selected
    .filter(connector => !isLibraryConnectorEnabled(connector.source))
    .map(connector => ({ source: connector.source, name: SOURCE_NAMES[connector.source], status: 'disabled', count: 0, reason: disabledSourceReason(connector.source) }));

  const settled = await Promise.all(enabled.map(async connector => ({ connector, response: await connector.search(query, limit) })));
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
