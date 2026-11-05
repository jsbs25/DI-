'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createBrowserEngine } = require('./browser-engine.cjs');

class FakeWebContents extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.url = '';
    this.findCalls = [];
    this.stopCalls = [];
    this.focusCalls = 0;
    this.nextRequestId = 0;
    this.navigationHistory = { canGoBack: () => false, canGoForward: () => false };
  }
  isDestroyed() { return this.destroyed; }
  getURL() { return this.url; }
  getTitle() { return 'Synthetic Browser Fixture'; }
  isLoading() { return false; }
  setWindowOpenHandler() {}
  async loadURL(url) { this.url = url; }
  findInPage(text, options) {
    const requestId = ++this.nextRequestId;
    this.findCalls.push({ text, options, requestId });
    return requestId;
  }
  stopFindInPage(action) { this.stopCalls.push(action); }
  focus() { this.focusCalls += 1; }
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

async function main() {
  const views = [];
  const windowFocusCalls = { count: 0 };
  const contentView = {
    addChildView(view) { views.push(view); },
    removeChildView(view) { const index = views.indexOf(view); if (index >= 0) views.splice(index, 1); }
  };
  const window = {
    contentView,
    webContents: { focus() { windowFocusCalls.count += 1; } },
    isDestroyed: () => false
  };
  const emittedResults = [];
  const focusRequests = [];
  const engine = createBrowserEngine({
    window,
    WebContentsView: FakeView,
    browserSession: new EventEmitter(),
    onFindResult: result => emittedResults.push(result),
    onFocusFind: tabId => focusRequests.push(tabId)
  });

  engine.setActive(true);
  engine.setBounds({ x: 0, y: 0, width: 800, height: 500 });
  assert.equal((await engine.findInPage('fixture', 'new')).success, false, 'no active tab must fail closed');

  assert.equal((await engine.selectTab('tab_A', 'http://127.0.0.1:43127/one')).success, true);
  const viewA = views.at(-1);
  assert.equal(viewA.visible, true);
  const printTargetA = engine.getActivePrintTarget();
  assert.equal(printTargetA.tabId, 'tab_A', 'PDF target comes from the engine active-tab state');
  assert.equal(printTargetA.contents, viewA.webContents);
  assert.equal(engine.isActivePrintTarget(printTargetA), true);
  const first = await engine.findInPage('synthetic phrase', 'new');
  assert.equal(first.success, true);
  assert.deepEqual(viewA.webContents.findCalls.at(-1), {
    text: 'synthetic phrase', options: { forward: true, findNext: false }, requestId: 1
  });
  assert.equal((await engine.findInPage('synthetic phrase', 'next')).success, true);
  assert.deepEqual(viewA.webContents.findCalls.at(-1).options, { forward: true, findNext: true });
  assert.equal((await engine.findInPage('synthetic phrase', 'previous')).success, true);
  assert.deepEqual(viewA.webContents.findCalls.at(-1).options, { forward: false, findNext: true });

  assert.equal((await engine.findInPage({ toString: () => 'synthetic phrase' }, 'new')).success, false, 'objects must not be coerced into queries');
  assert.equal((await engine.findInPage('x'.repeat(513), 'new')).success, false, 'oversized queries must be rejected');
  assert.equal((await engine.findInPage('synthetic phrase', 'jump')).success, false, 'directions are an allowlist');

  const latestRequestId = viewA.webContents.findCalls.at(-1).requestId;
  viewA.webContents.emit('found-in-page', {}, {
    requestId: latestRequestId, activeMatchOrdinal: 2, matches: 3, finalUpdate: true
  });
  assert.equal(emittedResults.at(-1).activeMatchOrdinal, 2);
  assert.equal(emittedResults.at(-1).matches, 3);
  viewA.webContents.emit('found-in-page', {}, {
    requestId: latestRequestId - 1, activeMatchOrdinal: 1, matches: 99, finalUpdate: true
  });
  assert.equal(emittedResults.at(-1).matches, 3, 'stale find results must be ignored');

  const keyEvent = { prevented: false, preventDefault() { this.prevented = true; } };
  viewA.webContents.emit('before-input-event', keyEvent, { type: 'keyDown', keyCode: 'F', modifiers: ['control'] });
  assert.equal(keyEvent.prevented, true);
  assert.equal(windowFocusCalls.count, 1);
  assert.deepEqual(focusRequests, ['tab_A']);
  const metaKeyEvent = { prevented: false, preventDefault() { this.prevented = true; } };
  viewA.webContents.emit('before-input-event', metaKeyEvent, { type: 'keyDown', keyCode: 'F', modifiers: ['meta'] });
  assert.equal(metaKeyEvent.prevented, true);
  assert.equal(windowFocusCalls.count, 2);
  assert.deepEqual(focusRequests, ['tab_A', 'tab_A']);
  const plainF = { prevented: false, preventDefault() { this.prevented = true; } };
  viewA.webContents.emit('before-input-event', plainF, { type: 'keyDown', keyCode: 'F', modifiers: [] });
  assert.equal(plainF.prevented, false);
  const altF = { prevented: false, preventDefault() { this.prevented = true; } };
  viewA.webContents.emit('before-input-event', altF, { type: 'keyDown', keyCode: 'F', modifiers: ['control', 'alt'] });
  assert.equal(altF.prevented, false);
  const keyUp = { prevented: false, preventDefault() { this.prevented = true; } };
  viewA.webContents.emit('before-input-event', keyUp, { type: 'keyUp', keyCode: 'F', modifiers: ['control'] });
  assert.equal(keyUp.prevented, false);

  assert.equal((await engine.selectTab('tab_B', 'http://127.0.0.1:43127/two')).success, true);
  const viewB = views.at(-1);
  const printTargetB = engine.getActivePrintTarget();
  assert.equal(printTargetB.tabId, 'tab_B');
  assert.equal(engine.isActivePrintTarget(printTargetA), false, 'a previous tab cannot remain a PDF target after switching');
  assert.equal(engine.isActivePrintTarget(printTargetB), true);
  assert.equal(viewA.webContents.stopCalls.at(-1), 'clearSelection', 'switching tabs clears old highlights');
  const callsOnAAfterSwitch = viewA.webContents.findCalls.length;
  assert.equal((await engine.findInPage('synthetic phrase', 'new')).success, true);
  assert.equal(viewA.webContents.findCalls.length, callsOnAAfterSwitch, 'a stale renderer target cannot search the previous tab');
  assert.equal(viewB.webContents.findCalls.length, 1, 'find targets only the active tab');
  assert.equal(viewB.webContents.focusCalls, 1, 'selecting a tab gives focus to its active page');
  assert.equal((await engine.stopFindInPage(true)).success, true);
  assert.equal(viewB.webContents.stopCalls.at(-1), 'clearSelection');
  assert.equal(viewB.webContents.focusCalls, 2, 'closing find can return focus to the active page');

  engine.setBounds(null);
  assert.equal((await engine.findInPage('hidden', 'new')).success, false, 'hidden browser views cannot be targeted');
  assert.equal(engine.getActivePrintTarget(), null, 'hidden Chromium viewport cannot be printed');
  engine.setBounds({ x: 0, y: 0, width: 800, height: 500 });
  engine.setActive(false);
  assert.equal((await engine.findInPage('inactive', 'new')).success, false, 'inactive Browser module cannot be targeted');
  assert.equal(engine.getActivePrintTarget(), null, 'inactive Browser module cannot be printed');
  engine.setActive(true);
  engine.setBounds({ x: 0, y: 0, width: 800, height: 500 });
  viewB.webContents.destroyed = true;
  assert.equal((await engine.findInPage('destroyed', 'new')).success, false, 'destroyed contents cannot be targeted');
  assert.equal(engine.getActivePrintTarget(), null, 'destroyed Chromium contents cannot be printed');
  assert.equal(engine.isActivePrintTarget(printTargetB), false);

  engine.dispose();
  console.log('BROWSER_FIND_ENGINE_TEST_PASS: active-target isolation, direction, validation, stale-result rejection, clear, focus, shortcut routing, and hidden/destroyed find/print guards verified.');
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
