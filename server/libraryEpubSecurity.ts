import { createRequire } from 'node:module';

export const MAX_EPUB_PROXY_BYTES = 64 * 1024 * 1024;

export type EpubArchiveErrorCode = 'EPUB_TOO_LARGE' | 'EPUB_INVALID_ARCHIVE' | 'EPUB_SOURCE_NOT_ALLOWED' | 'EPUB_REDIRECT_BLOCKED';

export class EpubArchiveError extends Error {
  constructor(public readonly code: EpubArchiveErrorCode, message: string) {
    super(message);
    this.name = 'EpubArchiveError';
  }
}

const ALLOWED_EPUB_HOSTS = ['gutenberg.org', 'archive.org', 'openlibrary.org'];
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function validateEpubSource(value: URL): URL {
  const host = value.hostname.toLowerCase();
  const allowed = value.protocol === 'https:' && (!value.port || value.port === '443') && !value.username && !value.password &&
    ALLOWED_EPUB_HOSTS.some(domain => host === domain || host.endsWith(`.${domain}`));
  if (!allowed) throw new EpubArchiveError('EPUB_SOURCE_NOT_ALLOWED', 'Only credential-free HTTPS URLs on approved library hosts are allowed');
  return value;
}

/** Fetch only from approved library hosts and validate every redirect hop. */
export async function fetchAllowedEpubResponse(
  source: URL,
  fetcher: typeof fetch = fetch,
  maxRedirects = 5
): Promise<Response> {
  if (!Number.isSafeInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 10) {
    throw new RangeError('EPUB redirect limit must be an integer between 0 and 10');
  }
  let current = validateEpubSource(source);
  const visited = new Set<string>();
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    if (visited.has(current.href)) throw new EpubArchiveError('EPUB_REDIRECT_BLOCKED', 'EPUB source returned a redirect loop');
    visited.add(current.href);
    const response = await fetcher(current, {
      redirect: 'manual',
      headers: { 'User-Agent': 'EARTH-ONE-Library/1.0' }
    });
    if (!REDIRECT_STATUSES.has(response.status)) return response;
    const location = response.headers.get('location');
    try { await response.body?.cancel(); } catch { /* best-effort response cleanup */ }
    if (!location || redirects === maxRedirects) {
      throw new EpubArchiveError('EPUB_REDIRECT_BLOCKED', 'EPUB source exceeded the safe redirect limit');
    }
    let next: URL;
    try { next = new URL(location, current); }
    catch { throw new EpubArchiveError('EPUB_REDIRECT_BLOCKED', 'EPUB source returned an invalid redirect target'); }
    try { current = validateEpubSource(next); }
    catch { throw new EpubArchiveError('EPUB_REDIRECT_BLOCKED', 'EPUB source redirected to a non-approved URL'); }
  }
  throw new EpubArchiveError('EPUB_REDIRECT_BLOCKED', 'EPUB source exceeded the safe redirect limit');
}

/**
 * Read an EPUB proxy response into a bounded buffer before returning it to the
 * browser. EPUB is a ZIP-based format and the OCF spec requires a local-file
 * ZIP header first. This deliberately checks only the envelope prefix; it is
 * not a ZIP/EPUB parser and must never be used as text or locator provenance.
 */
export async function readBoundedEpubArchive(
  body: ReadableStream<Uint8Array> | null,
  contentLength?: string | null,
  maxBytes = MAX_EPUB_PROXY_BYTES
): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 4) {
    throw new RangeError('EPUB size limit must be a safe integer of at least 4 bytes');
  }

  const declaredLength = contentLength?.trim();
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) {
    try { await body?.cancel(); } catch { /* best-effort upstream cancellation */ }
    throw new EpubArchiveError('EPUB_TOO_LARGE', `EPUB exceeds the ${maxBytes}-byte proxy limit`);
  }
  if (!body) throw new EpubArchiveError('EPUB_INVALID_ARCHIVE', 'EPUB response has no archive body');

  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let prefix = Buffer.alloc(0);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch { /* best-effort upstream cancellation */ }
        throw new EpubArchiveError('EPUB_TOO_LARGE', `EPUB exceeds the ${maxBytes}-byte proxy limit`);
      }
      if (prefix.length < 4) prefix = Buffer.concat([prefix, chunk.subarray(0, 4 - prefix.length)]);
      if (prefix.length === 4 && !prefix.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
        try { await reader.cancel(); } catch { /* best-effort upstream cancellation */ }
        throw new EpubArchiveError('EPUB_INVALID_ARCHIVE', 'EPUB does not begin with the required ZIP local-file header');
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  if (total < 4 || prefix.length !== 4 || !prefix.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    throw new EpubArchiveError('EPUB_INVALID_ARCHIVE', 'EPUB archive header is missing or truncated');
  }
  return Buffer.concat(chunks, total);
}

// epub.js ships the same CFI parser used by the reader. This validates CFI
// syntax only; without the exact EPUB package/spine it cannot prove the target
// belongs to a specific edition and is never used as AI evidence.
const require = createRequire(import.meta.url);
const EpubCfiParser = require('epubjs/lib/epubcfi.js').default as new (value: string) => {
  spinePos: number;
  base: { steps?: Array<{ index: number }>; terminal?: { offset: number | null } };
  path: { steps?: Array<{ index: number }>; terminal?: { offset: number | null } };
  range: boolean;
  start?: { steps?: Array<{ index: number }>; terminal?: { offset: number | null } } | null;
  end?: { steps?: Array<{ index: number }>; terminal?: { offset: number | null } } | null;
};

function validComponent(component: { steps?: Array<{ index: number }>; terminal?: { offset: number | null } } | null | undefined): boolean {
  if (!component || !Array.isArray(component.steps) || component.steps.length === 0) return false;
  if (!component.steps.every(step => Number.isSafeInteger(step.index) && step.index >= 0)) return false;
  const offset = component.terminal?.offset;
  return offset === undefined || offset === null || (Number.isSafeInteger(offset) && offset >= 0);
}

function hasInvalidCharacterOffset(value: string): boolean {
  let inAssertion = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) { escaped = false; continue; }
    if (character === '^') { escaped = true; continue; }
    if (character === '[') { inAssertion = true; continue; }
    if (character === ']') { inAssertion = false; continue; }
    if (character === ':' && !inAssertion && !/[0-9]/.test(value[index + 1] || '')) return true;
  }
  return false;
}

/** Syntax validation for personal resume state only, not edition/CFI verification. */
export function isSyntacticallyValidEpubCfi(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048 || value.length < 12 || /[\u0000-\u0020\u007f]/.test(value)) return false;
  if (!value.startsWith('epubcfi(') || !value.endsWith(')')) return false;
  if (hasInvalidCharacterOffset(value)) return false;
  try {
    const parsed = new EpubCfiParser(value);
    if (!Number.isSafeInteger(parsed.spinePos) || parsed.spinePos < 0 || !validComponent(parsed.base) || !validComponent(parsed.path)) return false;
    if (parsed.range && (!validComponent(parsed.start) || !validComponent(parsed.end))) return false;
    return true;
  } catch {
    return false;
  }
}
