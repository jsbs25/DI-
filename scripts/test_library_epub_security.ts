import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EpubArchiveError, fetchAllowedEpubResponse, isSyntacticallyValidEpubCfi, MAX_EPUB_PROXY_BYTES, readBoundedEpubArchive } from '../server/libraryEpubSecurity.ts';

const fixturePath = new URL('./fixtures/synthetic-world-library.epub', import.meta.url);
const syntheticEpub = fs.readFileSync(fixturePath);
let passed = 0;
function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  passed += 1;
}

async function rejectsArchive(bytes: Buffer, expectedCode: 'EPUB_TOO_LARGE' | 'EPUB_INVALID_ARCHIVE', maxBytes = MAX_EPUB_PROXY_BYTES) {
  try {
    await readBoundedEpubArchive(streamBytes(bytes), undefined, maxBytes);
    assert.fail(`Expected ${expectedCode}`);
  } catch (error) {
    assert.ok(error instanceof EpubArchiveError, `Expected safe archive rejection; got ${String(error)}`);
    assert.equal(error.code, expectedCode);
  }
}

function streamBytes(bytes: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    }
  });
}

const accepted = await readBoundedEpubArchive(streamBytes(syntheticEpub), String(syntheticEpub.byteLength));
check(accepted.equals(syntheticEpub), 'A tiny synthetic OCF/EPUB ZIP fixture is accepted without parsing or rewriting');
check(MAX_EPUB_PROXY_BYTES === 64 * 1024 * 1024, 'EPUB proxy has an explicit 64 MiB maximum response size');

await rejectsArchive(syntheticEpub, 'EPUB_TOO_LARGE', syntheticEpub.byteLength - 1);
check(true, 'A response that crosses the configured byte cap is rejected while streaming');
try {
  await readBoundedEpubArchive(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(4)); controller.close(); } }), String(MAX_EPUB_PROXY_BYTES + 1));
  assert.fail('Expected declared oversized body to be rejected');
} catch (error) {
  assert.ok(error instanceof EpubArchiveError);
  assert.equal(error.code, 'EPUB_TOO_LARGE');
}
check(true, 'A declared oversized Content-Length is rejected before buffering');
await rejectsArchive(Buffer.from('not an epub archive'), 'EPUB_INVALID_ARCHIVE');
check(true, 'Non-ZIP input is rejected before being returned to the reader');
await rejectsArchive(Buffer.from([0x50, 0x4b, 0x03]), 'EPUB_INVALID_ARCHIVE');
check(true, 'A truncated local-file header is rejected');

let blockedRedirectCalls = 0;
try {
  await fetchAllowedEpubResponse(new URL('https://www.gutenberg.org/fixture.epub'), async (_input, init) => {
    blockedRedirectCalls += 1;
    assert.equal(init?.redirect, 'manual', 'Automatic redirects must be disabled');
    return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } });
  });
  assert.fail('Expected a redirect to a private HTTP target to be blocked');
} catch (error) {
  assert.ok(error instanceof EpubArchiveError);
  assert.equal(error.code, 'EPUB_REDIRECT_BLOCKED');
}
check(blockedRedirectCalls === 1, 'An unapproved redirect target is denied before any request is made to it');

const trustedRedirectCalls: string[] = [];
const redirectedResponse = await fetchAllowedEpubResponse(new URL('https://www.gutenberg.org/fixture.epub'), async (input, init) => {
  assert.equal(init?.redirect, 'manual');
  trustedRedirectCalls.push(String(input));
  if (trustedRedirectCalls.length === 1) return new Response(null, { status: 302, headers: { location: 'https://ia800.archive.org/fixture.epub' } });
  return new Response(Uint8Array.from(syntheticEpub));
});
check(redirectedResponse.ok && trustedRedirectCalls.length === 2, 'A bounded HTTPS redirect between approved public-library hosts remains supported');

check(isSyntacticallyValidEpubCfi('epubcfi(/6/4[chapter01]!/4/2/18:5)'), 'A CFI emitted by the existing EPUB reader remains valid');
check(isSyntacticallyValidEpubCfi('epubcfi(/6/4[chapter:part]!/4/2/18:5)'), 'A colon inside a CFI ID assertion is not mistaken for an invalid character offset');
check(isSyntacticallyValidEpubCfi('epubcfi(/6/4[chapter01]!/4/2,/1:0,/1:5)'), 'A standard CFI range remains syntactically valid');
check(!isSyntacticallyValidEpubCfi('epubcfi(malformed)'), 'A wrapped but unparsable CFI is rejected');
check(!isSyntacticallyValidEpubCfi('epubcfi(/6/4!/4/2:NaN)'), 'A non-numeric CFI character offset is rejected');
check(!isSyntacticallyValidEpubCfi(`epubcfi(/6/4!${'/2'.repeat(1100)})`), 'Oversized CFI input is rejected');
check(isSyntacticallyValidEpubCfi('epubcfi(/6/999[foreign-edition]!/4/2/18:5)'), 'A foreign-edition CFI can be syntactically valid; the validator intentionally does not claim to bind it to a book');

console.log(`Library EPUB security regression: ${passed} assertions passed (synthetic fixture only; no network, real EPUB, or user data).`);
