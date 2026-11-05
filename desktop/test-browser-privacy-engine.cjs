'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { BROWSER_SITE_DATA_TYPES, createBrowserEngine } = require('./browser-engine.cjs');

const START_URL = 'https://origin.example.test/privacy-fixture';

function cancelableEvent() {
  return {
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }
  };
}

class FakeWebContents extends EventEmitter {
  constructor() {
    super();
    this.url = '';
    this.destroyed = false;
    this.redirectOnNextLoad = null;
    this.redirects = [];
    this.failRestore = false;
    this.navigationHistory = { canGoBack: () => false, canGoForward: () => false };
  }

  isDestroyed() { return this.destroyed; }
  getURL() { return this.url; }
  getTitle() { return 'Privacy restore fixture'; }
  isLoading() { return false; }
  setWindowOpenHandler() {}
  stop() {}
  stopFindInPage() {}
  setZoomFactor() {}
  focus() {}

  async loadURL(url) {
    const navigation = cancelableEvent();
    this.emit('will-navigate', navigation, url);
    if (navigation.defaultPrevented) throw new Error(`navigation blocked: ${url}`);

    if (url === START_URL && this.url === 'about:blank' && this.failRestore) {
      throw new Error('synthetic tab restore failure');
    }

    this.url = url;
    if (url === 'about:blank' || !this.redirectOnNextLoad) return;

    const redirectUrl = this.redirectOnNextLoad;
    this.redirectOnNextLoad = null;
    const redirect = cancelableEvent();
    this.emit('will-redirect', redirect, redirectUrl);
    this.redirects.push({ url: redirectUrl, blocked: redirect.defaultPrevented });
    if (!redirect.defaultPrevented) this.url = redirectUrl;
  }

  close() { this.destroyed = true; }
}

class FakeView {
  constructor() {
    this.webContents = new FakeWebContents();
    this.visible = false;
    this.bounds = null;
  }
  setVisible(value) { this.visible = value; }
  setBounds(bounds) { this.bounds = bounds; }
  getBounds() { return this.bounds; }
}

async function createHarness({ clearDataFailure = false, clearAuthCacheFailure = false, failRestore = false } = {}) {
  const views = [];
  const clearDataCalls = [];
  let clearAuthCacheCalls = 0;
  const browserSession = new EventEmitter();
  browserSession.clearData = async options => {
    clearDataCalls.push(options);
    if (clearDataFailure) throw new Error('synthetic clearData failure');
  };
  browserSession.clearAuthCache = async () => {
    clearAuthCacheCalls += 1;
    if (clearAuthCacheFailure) throw new Error('synthetic auth cache failure');
  };
  const window = {
    contentView: {
      addChildView(view) { views.push(view); },
      removeChildView(view) { const index = views.indexOf(view); if (index >= 0) views.splice(index, 1); }
    },
    webContents: { focus() {} },
    isDestroyed: () => false
  };
  const engine = createBrowserEngine({ window, WebContentsView: FakeView, browserSession });
  engine.setActive(true);
  engine.setBounds({ x: 0, y: 0, width: 800, height: 500 });
  const selected = await engine.selectTab('tab_privacy', START_URL);
  assert.equal(selected.success, true);
  const contents = views[0].webContents;
  contents.failRestore = failRestore;
  return { engine, browserSession, contents, clearDataCalls, getClearAuthCacheCalls: () => clearAuthCacheCalls };
}

async function main() {
  const crossOriginSafe = await createHarness();
  crossOriginSafe.contents.redirectOnNextLoad = 'https://redirect.example.test/final';
  const safeResult = await crossOriginSafe.engine.clearSiteDataAndReload(crossOriginSafe.browserSession);
  assert.equal(safeResult.success, true, 'a valid cross-origin HTTP(S) server redirect remains ordinary Browser navigation');
  assert.equal(safeResult.cleared, true);
  assert.equal(safeResult.reloadedTabs, 1);
  assert.deepEqual(safeResult.reloadFailedTabs, []);
  assert.deepEqual(crossOriginSafe.clearDataCalls, [{ dataTypes: [...BROWSER_SITE_DATA_TYPES] }]);
  assert.equal(crossOriginSafe.getClearAuthCacheCalls(), 1);
  assert.deepEqual(crossOriginSafe.contents.redirects, [{ url: 'https://redirect.example.test/final', blocked: false }]);
  assert.equal(crossOriginSafe.contents.getURL(), 'https://redirect.example.test/final');
  assert.equal(crossOriginSafe.engine.getSessionSnapshot().tabs[0].url, 'https://redirect.example.test/final', 'session snapshot reflects the validated final URL');
  crossOriginSafe.engine.dispose();

  for (const unsafeUrl of ['file:///etc/passwd', 'javascript:alert(1)', 'https://user:secret@redirect.example.test/']) {
    const unsafe = await createHarness();
    unsafe.contents.redirectOnNextLoad = unsafeUrl;
    const result = await unsafe.engine.clearSiteDataAndReload(unsafe.browserSession);
    assert.equal(result.success, true, `the safe original page remains restored after blocking ${unsafeUrl}`);
    assert.deepEqual(unsafe.contents.redirects, [{ url: unsafeUrl, blocked: true }]);
    assert.equal(unsafe.contents.getURL(), START_URL, 'an unsafe redirect must not replace the validated restore URL');
    assert.equal(unsafe.engine.getSessionSnapshot().tabs[0].url, START_URL);
    unsafe.engine.dispose();
  }

  const clearFailure = await createHarness({ clearDataFailure: true });
  const failedClearResult = await clearFailure.engine.clearSiteDataAndReload(clearFailure.browserSession);
  assert.equal(failedClearResult.success, false, 'a failed clear must not be reported as successful');
  assert.equal(failedClearResult.cleared, false);
  assert.equal(failedClearResult.reloadedTabs, 1, 'an unloaded tab is restored when data clearing fails');
  assert.equal(clearFailure.contents.getURL(), START_URL);
  clearFailure.engine.dispose();

  const authCacheFailure = await createHarness({ clearAuthCacheFailure: true });
  const failedAuthResult = await authCacheFailure.engine.clearSiteDataAndReload(authCacheFailure.browserSession);
  assert.equal(failedAuthResult.success, false, 'an authentication-cache failure is reported as partial');
  assert.equal(failedAuthResult.cleared, true, 'the main site-data clear remains reflected accurately');
  assert.match(failedAuthResult.error, /身份验证缓存/);
  assert.equal(authCacheFailure.contents.getURL(), START_URL);
  authCacheFailure.engine.dispose();

  const reloadFailure = await createHarness({ failRestore: true });
  const failedRestoreResult = await reloadFailure.engine.clearSiteDataAndReload(reloadFailure.browserSession);
  assert.equal(failedRestoreResult.success, false, 'a failed tab restoration must not be reported as a complete success');
  assert.equal(failedRestoreResult.cleared, true);
  assert.deepEqual(failedRestoreResult.reloadFailedTabs, ['tab_privacy']);
  assert.match(failedRestoreResult.error, /部分标签/);
  reloadFailure.engine.dispose();

  console.log('BROWSER_PRIVACY_ENGINE_TEST_PASS: final safe URL validation, ordinary cross-origin HTTP(S) redirects, unsafe/credential redirect blocking, clear/auth failure reporting, and tab restore recovery verified.');
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
