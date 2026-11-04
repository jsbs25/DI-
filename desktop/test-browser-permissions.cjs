'use strict';

const assert = require('node:assert/strict');
const {
  createBrowserPermissionManager,
  getSecureHttpOrigin
} = require('./browser-permissions.cjs');

function makeContents(url) {
  return {
    url,
    destroyed: false,
    mainFrame: { url },
    getURL() { return this.url; },
    isDestroyed() { return this.destroyed; }
  };
}

function makeDetails(url, overrides = {}) {
  return { isMainFrame: true, requestingUrl: url, ...overrides };
}

async function main() {
const originA = 'http://127.0.0.1:43127';
const originB = 'http://localhost:43127';
const contentsA = makeContents(`${originA}/one`);
const contentsB = makeContents(`${originB}/two`);
const active = new Set([contentsA, contentsB]);
const emitted = [];
const manager = createBrowserPermissionManager({
  isActiveContext: contents => active.has(contents),
  onChange: state => emitted.push(state),
  requestTimeoutMs: 25
});

assert.equal(getSecureHttpOrigin(`${originA}/path`), originA);
assert.equal(getSecureHttpOrigin('https://example.test/path'), 'https://example.test');
for (const insecure of [
  'http://example.test/',
  'file:///etc/passwd',
  'data:text/html,hello',
  'javascript:alert(1)',
  'ftp://example.test/',
  'http://user:pass@127.0.0.1/',
  'not a url'
]) assert.equal(getSecureHttpOrigin(insecure), null, `must reject untrusted origin: ${insecure}`);
assert.equal(getSecureHttpOrigin('http://127.0.0.2/'), 'http://127.0.0.2', 'loopback HTTP remains usable for local synthetic fixtures');
assert.equal(getSecureHttpOrigin('http://127.0.0.1.evil.test/'), null);

let defaultDecision = null;
const defaultRequest = manager.request(contentsA, 'notifications', value => { defaultDecision = value; }, makeDetails(`${originA}/one`));
assert.equal(typeof defaultRequest, 'string', 'a valid, ungranted top-level request must create an explicit prompt');
assert.equal(defaultDecision, null, 'no permission is granted before an explicit user choice');
assert.deepEqual(manager.getState().grants, [], 'permission state starts with default deny');
assert.equal(manager.getState().pending[0].origin, originA);
assert.equal(manager.getState().pending[0].permission, 'notifications');
assert.equal('tabId' in manager.getState().pending[0], false, 'renderer receives no arbitrary tab ID');
assert.equal(manager.resolve(defaultRequest, 'deny').success, true);
assert.equal(defaultDecision, false, 'explicit deny reaches Chromium');
assert.equal(manager.getState().grants.length, 0, 'denial is not a grant and is not persisted');
assert.equal(manager.resolve(defaultRequest, 'allow').success, false, 'a consumed request cannot be replayed');

for (const unsupported of ['camera', 'microphone', 'clipboard-read', 'usb', 'midi']) {
  let decision = null;
  assert.equal(manager.request(contentsA, unsupported, value => { decision = value; }, makeDetails(`${originA}/one`)), false);
  assert.equal(decision, false, `unsupported permission must fail closed: ${unsupported}`);
}

for (const invalid of [
  { permission: 'notifications', details: makeDetails('http://example.test/') },
  { permission: 'geolocation', details: makeDetails('file:///tmp/site') },
  { permission: 'notifications', details: makeDetails(`${originA}/frame`, { isMainFrame: false }) },
  { permission: 'notifications', details: makeDetails(`${originB}/spoofed-origin`) },
  { permission: 'notifications', details: makeDetails(`${originA}/one`, { securityOrigin: originB }) }
]) {
  let decision = null;
  assert.equal(manager.request(contentsA, invalid.permission, value => { decision = value; }, invalid.details), false);
  assert.equal(decision, false, 'insecure, mismatched, and subframe requests must be rejected without prompting');
}

let allowedNotification = null;
const notificationPrompt = manager.request(
  contentsA,
  'notifications',
  value => { allowedNotification = value; },
  makeDetails(`${originA}/one`, { securityOrigin: originA })
);
assert.equal(manager.resolve('tab_1', 'allow').success, false, 'a renderer cannot substitute a tab ID for a request token');
assert.equal(manager.resolve(notificationPrompt, 'allow').granted, true);
assert.equal(allowedNotification, true);
assert.deepEqual(manager.getState().grants, [{ origin: originA, permissions: ['notifications'] }]);
assert.equal(manager.check(contentsA, 'notifications', originA, makeDetails(`${originA}/one`)), true);
assert.equal(manager.check(contentsB, 'notifications', originB, makeDetails(`${originB}/two`)), false, 'a grant never crosses origins');
assert.equal(manager.check(contentsA, 'geolocation', originA, makeDetails(`${originA}/one`)), false, 'a grant never crosses capabilities');

let automaticSameOrigin = null;
assert.equal(manager.request(contentsA, 'notifications', value => { automaticSameOrigin = value; }, makeDetails(`${originA}/next`)), true);
assert.equal(automaticSameOrigin, true, 'an explicit session grant is reused for the same origin and capability');
let isolatedPromptDecision = null;
const isolatedPrompt = manager.request(contentsB, 'notifications', value => { isolatedPromptDecision = value; }, makeDetails(`${originB}/two`));
assert.equal(typeof isolatedPrompt, 'string', 'another origin must receive its own prompt');
assert.equal(manager.resolve(isolatedPrompt, 'deny').success, true);
assert.equal(isolatedPromptDecision, false);

let geoDecision = null;
const geoPrompt = manager.request(contentsA, 'geolocation', value => { geoDecision = value; }, makeDetails(`${originA}/one`));
assert.equal(manager.resolve(geoPrompt, 'allow').granted, true, 'geolocation requires its own explicit allow');
assert.equal(geoDecision, true);
assert.equal(manager.revoke(originA, 'notifications').success, true);
assert.equal(manager.check(contentsA, 'notifications', originA, makeDetails(`${originA}/one`)), false, 'revoked permission check is denied');
assert.equal(manager.getState().grants[0].permissions.includes('geolocation'), true, 'revoking one capability preserves the other');
assert.equal(manager.revokeAll().revoked, true);
assert.deepEqual(manager.getState().grants, []);

let subframeCheckDecision = null;
assert.equal(manager.request(contentsA, 'geolocation', value => { subframeCheckDecision = value; }, makeDetails(`${originA}/one`, { isMainFrame: false })), false);
assert.equal(subframeCheckDecision, false);
assert.equal(manager.resolve(geoPrompt, 'allow').success, false, 'a request token can be consumed only once');

let timedOutDecision = null;
manager.request(contentsA, 'notifications', value => { timedOutDecision = value; }, makeDetails(`${originA}/one`));
await new Promise(resolve => setTimeout(resolve, 60));
assert.equal(timedOutDecision, false, 'unanswered permission prompts time out to deny');
assert.equal(manager.getState().pending.length, 0);

let staleDecision = null;
const stalePrompt = manager.request(contentsA, 'notifications', value => { staleDecision = value; }, makeDetails(`${originA}/one`));
contentsA.url = `${originB}/changed`;
contentsA.mainFrame.url = contentsA.url;
assert.equal(manager.resolve(stalePrompt, 'allow').granted, false, 'navigation invalidates an outstanding request');
assert.equal(staleDecision, false);
contentsA.url = `${originA}/one`;
contentsA.mainFrame.url = contentsA.url;

let sessionDecision = null;
const sessionPrompt = manager.request(contentsA, 'notifications', value => { sessionDecision = value; }, makeDetails(`${originA}/one`));
assert.equal(manager.resolve(sessionPrompt, 'allow').granted, true);
assert.equal(sessionDecision, true);
manager.dispose();
assert.deepEqual(manager.getState().grants, [], 'disposing the app session clears in-memory grants');
const afterRestart = createBrowserPermissionManager({ isActiveContext: contents => active.has(contents) });
assert.deepEqual(afterRestart.getState(), { pending: [], grants: [] }, 'a new app session begins without persisted permissions');
assert.equal(afterRestart.check(contentsA, 'notifications', originA, makeDetails(`${originA}/one`)), false);
afterRestart.dispose();

assert.ok(emitted.length >= 8, 'permission UI state is published after requests and user decisions');
console.log('BROWSER_PERMISSIONS_TEST_PASS: secure origins, default deny, explicit decision, capability/origin isolation, revoke, timeout, navigation invalidation, and session-only grants verified; no network access is performed.');
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
