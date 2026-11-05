'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createBrowserEngine } = require('./browser-engine.cjs');

class FakeWebContents extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.url = '';
    this.title = 'Synthetic Browser Tab';
    this.zoomFactor = 1;
    this.focused = false;
    this.navigationHistory = { canGoBack: () => false, canGoForward: () => false };
  }
  isDestroyed() { return this.destroyed; }
  getURL() { return this.url; }
  getTitle() { return this.title; }
  isLoading() { return false; }
  setWindowOpenHandler() {}
  async loadURL(url) { this.url = url; }
  setZoomFactor(factor) { this.zoomFactor = factor; }
  stopFindInPage() {}
  focus() { this.focused = true; }
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
}

async function main() {
  const views = [];
  const restoreAvailability = [];
  const window = {
    contentView: {
      addChildView(view) { views.push(view); },
      removeChildView(view) { const index = views.indexOf(view); if (index >= 0) views.splice(index, 1); }
    },
    webContents: { focus() {} },
    isDestroyed: () => false
  };
  const engine = createBrowserEngine({
    window,
    WebContentsView: FakeView,
    browserSession: new EventEmitter(),
    onRestoreAvailability: available => restoreAvailability.push(available),
    appOrigin: 'https://example.test',
    defaultNewTabUrl: 'http://127.0.0.1:43127/default'
  });

  engine.setActive(true);
  engine.setBounds({ x: 0, y: 0, width: 900, height: 600 });
  assert.equal((await engine.selectTab('tab_A', 'https://example.test/one?view=article#first')).success, true);
  assert.equal((await engine.selectTab('tab_B', 'https://example.test/two?topic=space#private-fragment')).success, true);
  const tabB = engine.getWebContentsForTesting('tab_B');
  tabB.title = 'Synthetic Space Article';
  engine.changeZoom('in');
  assert.equal(tabB.zoomFactor, 1.1);

  assert.deepEqual(engine.reorderTabs(['tab_B', 'tab_A']), { success: true, tabIds: ['tab_B', 'tab_A'] });
  assert.deepEqual(engine.getTabIdsForTesting(), ['tab_B', 'tab_A']);
  assert.equal(engine.getSessionSnapshot().activeTabId, 'tab_B', 'reordering must not change active-tab focus');
  assert.deepEqual(engine.getSessionSnapshot().tabs.map(tab => tab.id), ['tab_B', 'tab_A'], 'opt-in session snapshots follow visual tab order');
  for (const invalidOrder of [
    ['tab_B', 'tab_B'],
    ['tab_B', 'tab_forged'],
    ['tab_B'],
    ['tab_A', 'tab_B', 'tab_extra'],
    'tab_B,tab_A'
  ]) {
    assert.equal(engine.reorderTabs(invalidOrder).success, false, `invalid reorder should be rejected: ${JSON.stringify(invalidOrder)}`);
    assert.deepEqual(engine.getTabIdsForTesting(), ['tab_B', 'tab_A'], 'invalid reorder must leave the authoritative order unchanged');
  }

  const closed = engine.closeTab('tab_B');
  assert.equal(closed.success, true);
  assert.equal(closed.closed, true);
  assert.equal(engine.getSessionSnapshot().activeTabId, 'tab_A', 'closing the selected tab focuses the next tab in visual order');
  assert.equal(engine.canRestoreClosedTab(), true);
  assert.deepEqual(restoreAvailability, [true]);
  const restored = await engine.restoreLastClosedTab('tab_forged', 'javascript:alert(1)');
  assert.equal(restored.success, true, 'restore accepts no caller-supplied identity or URL');
  assert.equal(restored.restored, true);
  assert.match(restored.tabId, /^tab_[a-f0-9-]{36}$/i);
  assert.notEqual(restored.tabId, 'tab_B', 'restoration creates a fresh app-issued tab identity');
  assert.equal(engine.getSessionSnapshot().activeTabId, restored.tabId);
  assert.equal(engine.getWebContentsForTesting(restored.tabId).getURL(), 'https://example.test/two?topic=space');
  assert.equal(engine.getWebContentsForTesting(restored.tabId).zoomFactor, 1, 'restored tab starts at 100% rather than restoring zoom');
  assert.equal(engine.canRestoreClosedTab(), false, 'the latest-close snapshot is consumed once');
  assert.deepEqual(restoreAvailability, [true, false]);
  const duplicateRestore = await engine.restoreLastClosedTab();
  assert.equal(duplicateRestore.success, false);
  assert.equal(engine.getTabIdsForTesting().length, 2, 'a second restore cannot duplicate the closed tab');

  assert.equal((await engine.selectTab('tab_sensitive', 'https://example.test/callback?access_token=synthetic-secret')).success, true);
  assert.equal(engine.closeTab('tab_sensitive').closed, true);
  assert.equal(engine.canRestoreClosedTab(), false, 'sensitive-query URLs are not retained even in the in-memory undo snapshot');
  const beforeUnsafeRestore = engine.getTabIdsForTesting();
  assert.equal((await engine.restoreLastClosedTab()).success, false);
  assert.deepEqual(engine.getTabIdsForTesting(), beforeUnsafeRestore);
  assert.equal((await engine.selectTab('tab_forbidden', 'javascript:alert(1)')).success, false, 'only HTTP(S) pages can be restored or selected');
  assert.equal(engine.getTabIdsForTesting().includes('tab_forbidden'), false);

  const remaining = engine.getTabIdsForTesting();
  for (const tabId of remaining.slice(1)) engine.closeTab(tabId);
  assert.equal(engine.getTabIdsForTesting().length, 1);
  const lastTabId = engine.getTabIdsForTesting()[0];
  const lastClose = engine.closeTab(lastTabId);
  assert.equal(lastClose.success, true);
  assert.equal(lastClose.closed, false);
  assert.equal(lastClose.replaced, true, 'the last tab is replaced in place instead of closing the app');
  assert.equal(engine.getTabIdsForTesting().length, 1);
  assert.equal(engine.getWebContentsForTesting(lastTabId).getURL(), 'http://127.0.0.1:43127/default');
  assert.equal(engine.canRestoreClosedTab(), true, 'replacing the last tab leaves the previous undo snapshot untouched');
  const restoreAfterLastTab = await engine.restoreLastClosedTab();
  assert.equal(restoreAfterLastTab.success, true);
  assert.equal(engine.getWebContentsForTesting(restoreAfterLastTab.tabId).getURL(), 'https://example.test/two?topic=space', 'the last tab replacement itself is not recorded as a closed page');

  engine.dispose();
  console.log('BROWSER_TABS_ENGINE_TEST_PASS: validated visual reorder, ordered session snapshots, URL-only one-shot restore with privacy sanitization, fresh IDs/no zoom restore, forged target rejection, and last-tab replacement verified.');
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
