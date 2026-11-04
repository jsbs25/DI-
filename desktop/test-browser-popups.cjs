'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createBrowserEngine } = require('./browser-engine.cjs');
const { normalizePopupTarget, requiresPopupConfirmation } = require('./browser-popup-security.cjs');

assert.equal(normalizePopupTarget('https://example.test/path?q=1'), 'https://example.test/path?q=1');
assert.equal(normalizePopupTarget('http://127.0.0.1:43127/fixture'), 'http://127.0.0.1:43127/fixture');
for (const unsafe of [
  'javascript:alert(1)',
  'file:///etc/passwd',
  'data:text/html,<h1>bad</h1>',
  'ftp://example.test/file',
  'https://user:pass@example.test/',
  'https://',
  'http://example.test:invalid/',
  'x'.repeat(4097)
]) {
  assert.equal(normalizePopupTarget(unsafe), null, `popup target must be rejected: ${unsafe.slice(0, 80)}`);
}
assert.equal(normalizePopupTarget('http://earth-one.test/?module=library', 'http://earth-one.test'), null,
  'a popup must not cross into an EARTH ONE application route');
assert.equal(normalizePopupTarget('http://earth-one.test.evil.test/', 'http://earth-one.test'),
  'http://earth-one.test.evil.test/', 'origin checks must not use hostname suffix matching');
assert.equal(normalizePopupTarget('https://example.test/', 'not an origin'), null,
  'an invalid application origin must fail closed');
for (const disposition of ['foreground-tab', 'background-tab', 'new-window', 'default', 'other']) {
  assert.equal(requiresPopupConfirmation({ disposition }), true,
    `${disposition} does not prove a real user gesture and must be confirmed`);
}
assert.equal(requiresPopupConfirmation(null), true);

class FakeWebContents extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.url = '';
    this.focused = false;
    this.navigationHistory = { canGoBack: () => false, canGoForward: () => false };
  }
  isDestroyed() { return this.destroyed; }
  getURL() { return this.url; }
  getTitle() { return 'Synthetic Popup Fixture'; }
  isLoading() { return false; }
  setWindowOpenHandler(handler) { this.windowOpenHandler = handler; }
  async loadURL(url) { this.url = url; }
  focus() { this.focused = true; }
  close() { this.destroyed = true; }
}

class FakeView {
  constructor(options) {
    this.options = options;
    this.webContents = new FakeWebContents();
    this.visible = false;
    this.bounds = null;
  }
  setVisible(value) { this.visible = value; }
  setBounds(bounds) { this.bounds = bounds; }
  getBounds() { return this.bounds; }
}

async function testEnginePopupRouting() {
  const views = [];
  const session = new EventEmitter();
  const popupRequests = [];
  const contextLinks = [];
  const contentView = {
    addChildView(view) { views.push(view); },
    removeChildView(view) { const index = views.indexOf(view); if (index >= 0) views.splice(index, 1); }
  };
  const window = {
    contentView,
    webContents: { focus() {} },
    isDestroyed: () => false
  };
  const engine = createBrowserEngine({
    window,
    WebContentsView: FakeView,
    browserSession: session,
    appOrigin: 'http://earth-one.test',
    onOpenTabRequest: request => popupRequests.push(request),
    onContextMenuLink: request => contextLinks.push(request)
  });
  engine.setActive(true);
  engine.setBounds({ x: 0, y: 0, width: 900, height: 600 });
  assert.equal((await engine.selectTab('tab_source', 'http://source.test/start')).success, true);

  const source = engine.getWebContentsForTesting('tab_source');
  assert.equal(source.windowOpenHandler({
    url: 'https://target.test/from-link', disposition: 'foreground-tab', postBody: null
  }).action, 'deny', 'Electron-managed windows must always be denied');
  assert.deepEqual(popupRequests.at(-1), {
    url: 'https://target.test/from-link', sourceTabId: 'tab_source', requiresConfirmation: true
  });

  source.windowOpenHandler({ url: 'https://target.test/from-script', disposition: 'default', postBody: null });
  assert.deepEqual(popupRequests.at(-1), {
    url: 'https://target.test/from-script', sourceTabId: 'tab_source', requiresConfirmation: true
  });
  const requestCount = popupRequests.length;
  for (const url of [
    'javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,bad', 'ftp://target.test/',
    'https://user:pass@target.test/', 'http://earth-one.test/?module=library', 'https://'
  ]) {
    assert.equal(source.windowOpenHandler({ url, disposition: 'foreground-tab', postBody: null }).action, 'deny');
  }
  source.windowOpenHandler({
    url: 'https://target.test/form', disposition: 'foreground-tab', postBody: { data: Buffer.from('synthetic') }
  });
  assert.equal(popupRequests.length, requestCount, 'unsafe targets and popup form submissions must not be routed');

  source.emit('context-menu', {}, { linkURL: 'https://target.test/context-link' });
  assert.deepEqual(contextLinks.at(-1), { url: 'https://target.test/context-link', sourceTabId: 'tab_source' });
  const contextCount = contextLinks.length;
  source.emit('context-menu', {}, { linkURL: 'javascript:alert(1)' });
  source.emit('context-menu', {}, { linkURL: 'http://earth-one.test/?module=library' });
  assert.equal(contextLinks.length, contextCount, 'unsafe and app-route context links must be omitted');

  const opened = await engine.openNewTab('https://target.test/opened-from-confirmation');
  assert.equal(opened.success, true);
  assert.match(opened.tabId, /^tab_[a-f0-9-]{36}$/i);
  const openedContents = engine.getWebContentsForTesting(opened.tabId);
  const openedView = views.at(-1);
  assert.equal(openedContents.getURL(), 'https://target.test/opened-from-confirmation');
  assert.equal(engine.getSessionSnapshot().activeTabId, opened.tabId, 'the new tab must be active');
  assert.equal(openedView.visible, true, 'the active new tab must be visible');
  assert.equal(openedContents.focused, true, 'the new tab web contents must receive focus');
  assert.equal(openedView.options.webPreferences.session, session, 'new tabs must use the dedicated Browser session');
  assert.equal(openedView.options.webPreferences.nodeIntegration, false);
  assert.equal(openedView.options.webPreferences.contextIsolation, true);
  assert.equal(openedView.options.webPreferences.sandbox, true);
  assert.equal(Object.hasOwn(openedView.options.webPreferences, 'preload'), false,
    'remote tabs must not inherit a privileged preload');
  assert.equal(views[0].visible, false, 'opening a new tab must hide the prior active page');

  engine.closeTab(opened.tabId);
  assert.equal(engine.getSessionSnapshot().activeTabId, 'tab_source', 'closing the active popup must select the first remaining Browser tab');
  assert.equal(views[0].visible, true, 'the remaining active Browser tab must become visible after popup close');
  assert.equal(source.focused, true, 'the remaining active Browser tab must regain focus after popup close');

  engine.dispose();
}

testEnginePopupRouting().then(() => {
  console.log('BROWSER_POPUP_SECURITY_TEST_PASS: HTTP(S) allowlist, invalid/app-origin rejection, disposition confirmation, POST rejection, context-menu routing, active focus, Browser session reuse, and preload/Node isolation verified.');
}).catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
