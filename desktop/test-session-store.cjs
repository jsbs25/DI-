'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  MAX_SESSION_STORE_BYTES,
  MAX_SESSION_TABS,
  createBrowserSessionStore
} = require('./session-store.cjs');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'earth-one-browser-session-'));

try {
  const storePath = path.join(tempDir, 'session.json');
  const store = createBrowserSessionStore(storePath);
  const initial = store.load();
  assert.equal(initial.enabled, false, 'session restore defaults off');
  assert.deepEqual(initial.tabs, []);
  assert.equal(initial.readOnly, false);
  assert.equal(fs.existsSync(storePath), false, 'default-off startup does not create a session file');

  const querySecret = 'synthetic-query-secret-DoNotPersist';
  const passwordSecret = 'synthetic-password-DoNotPersist';
  const saved = store.save({
    enabled: true,
    activeTabId: 'tab_1',
    tabs: [{
      id: 'tab_1',
      url: `http://127.0.0.1:4321/reading?q=astronomy&lang=ar#${querySecret}`,
      title: `password=${passwordSecret}`,
      formContents: passwordSecret,
      cookies: [{ value: passwordSecret }]
    }]
  });
  assert.equal(saved.success, true);
  const serialized = fs.readFileSync(storePath, 'utf8');
  const parsedSaved = JSON.parse(serialized);
  assert.deepEqual(Object.keys(parsedSaved).sort(), ['activeTabId', 'enabled', 'tabs', 'version']);
  assert.deepEqual(Object.keys(parsedSaved.tabs[0]).sort(), ['id', 'title', 'url']);
  assert.equal(parsedSaved.tabs[0].url, 'http://127.0.0.1:4321/reading?q=astronomy&lang=ar');
  assert.equal(parsedSaved.tabs[0].title, '127.0.0.1:4321', 'display metadata comes from the host, not page content');
  for (const secret of [querySecret, passwordSecret, 'formContents', 'cookies']) {
    assert.equal(serialized.includes(secret), false, `session store must not persist ${secret}`);
  }
  const roundTrip = store.load();
  assert.equal(roundTrip.enabled, true);
  assert.equal(roundTrip.tabs.length, 1);
  assert.equal(roundTrip.tabs[0].url, 'http://127.0.0.1:4321/reading?q=astronomy&lang=ar');

  for (const sensitiveKey of ['token', 'access_token', 'auth', 'code', 'key', 'password', 'session', 'credential']) {
    const sensitiveSaved = store.save({
      enabled: true,
      activeTabId: 'tab_sensitive',
      tabs: [{ id: 'tab_sensitive', url: `https://example.test/callback?${sensitiveKey}=${querySecret}` }]
    });
    assert.equal(sensitiveSaved.success, true);
    assert.equal(sensitiveSaved.tabs.length, 0, `a tab with sensitive query key ${sensitiveKey} is omitted rather than partially restored`);
    assert.equal(fs.readFileSync(storePath, 'utf8').includes(querySecret), false);
    assert.equal(fs.readFileSync(storePath, 'utf8').includes(sensitiveKey), false);
  }

  const dirtyPath = path.join(tempDir, 'dirty-session.json');
  const dirtyStore = createBrowserSessionStore(dirtyPath);
  const dirtyEntries = [
    { id: 'tab_1', url: 'https://example.test/safe?topic=space#fragment', title: 'untrusted title' },
    { id: 'tab_secret', url: 'https://example.test/callback?access_token=dirty-secret' },
    { id: 'tab_bad_scheme', url: 'javascript:alert(1)' },
    { id: 'tab_bad_credentials', url: 'https://user:pass@example.test/account' },
    { id: 'tab_too_long', url: `https://example.test/${'x'.repeat(5000)}` },
    { id: 'invalid id', url: 'https://example.test/ignored' },
    { id: 'tab_1', url: 'https://duplicate.test/' }
  ];
  for (let index = 0; index < MAX_SESSION_TABS + 6; index += 1) {
    dirtyEntries.push({ id: `tab_extra_${index}`, url: `https://example.test/page/${index}?private=${index}` });
  }
  fs.writeFileSync(dirtyPath, JSON.stringify({
    version: 1,
    enabled: true,
    activeTabId: `tab_extra_${MAX_SESSION_TABS + 5}`,
    tabs: dirtyEntries,
    cookies: [{ value: 'dirty-cookie-secret' }],
    networkLog: ['private request']
  }));
  const repaired = dirtyStore.load();
  assert.equal(repaired.readOnly, false);
  assert.equal(repaired.enabled, true);
  assert.equal(repaired.tabs.length, MAX_SESSION_TABS, 'restoration is capped after invalid entries are removed');
  assert.equal(repaired.tabs[0].url, 'https://example.test/safe?topic=space');
  assert.equal(repaired.activeTabId, `tab_extra_${MAX_SESSION_TABS + 5}`);
  assert.equal(repaired.tabs.at(-1).id, repaired.activeTabId, 'the active tab is retained within the cap');
  assert.equal(new Set(repaired.tabs.map(tab => tab.id)).size, repaired.tabs.length);
  const repairedText = fs.readFileSync(dirtyPath, 'utf8');
  for (const secret of ['dirty-secret', 'dirty-cookie-secret', 'networkLog', 'private request', 'access_token']) {
    assert.equal(repairedText.includes(secret), false, `repair must remove ${secret}`);
  }
  assert.equal(JSON.parse(repairedText).tabs.length, MAX_SESSION_TABS);

  const invalidPath = path.join(tempDir, 'invalid-session.json');
  const invalidStore = createBrowserSessionStore(invalidPath);
  const malformedText = '{"version":1,"enabled":true,"tabs":[';
  fs.writeFileSync(invalidPath, malformedText);
  const malformed = invalidStore.load();
  assert.equal(malformed.enabled, false, 'malformed stores fail closed');
  assert.deepEqual(malformed.tabs, []);
  assert.equal(malformed.readOnly, true);
  assert.equal(invalidStore.save({ enabled: false, tabs: [] }).success, false);
  assert.equal(fs.readFileSync(invalidPath, 'utf8'), malformedText, 'malformed original is not overwritten');

  const oversizedPath = path.join(tempDir, 'oversized-session.json');
  const oversizedStore = createBrowserSessionStore(oversizedPath);
  const oversizedText = 'x'.repeat(MAX_SESSION_STORE_BYTES + 1);
  fs.writeFileSync(oversizedPath, oversizedText);
  const oversized = oversizedStore.load();
  assert.equal(oversized.enabled, false, 'oversized stores fail closed');
  assert.deepEqual(oversized.tabs, []);
  assert.equal(oversized.readOnly, true);
  assert.equal(oversizedStore.save({ enabled: true, tabs: [] }).success, false);
  assert.equal(fs.readFileSync(oversizedPath, 'utf8').length, oversizedText.length, 'oversized original is not overwritten');

  console.log(`SESSION_STORE_TEST_PASS: default-off, ${MAX_SESSION_TABS}-tab cap, strict metadata allowlist, query/fragment redaction, invalid URL removal, safe repair, corrupt/oversized store preservation verified.`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
