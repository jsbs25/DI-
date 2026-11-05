'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createBrowserEngine } = require('./browser-engine.cjs');

class FakeWebContents extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.url = '';
    this.zoomFactor = 1;
    this.navigationHistory = { canGoBack: () => false, canGoForward: () => false };
  }
  isDestroyed() { return this.destroyed; }
  getURL() { return this.url; }
  getTitle() { return 'Synthetic Zoom Fixture'; }
  isLoading() { return false; }
  setWindowOpenHandler() {}
  async loadURL(url) { this.url = url; }
  setZoomFactor(factor) { this.zoomFactor = factor; }
  getZoomFactor() { return this.zoomFactor; }
  stopFindInPage() {}
  focus() {}
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
  const states = [];
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
    onState: state => states.push(state),
    defaultNewTabUrl: 'http://127.0.0.1:43127/default'
  });
  engine.setActive(true);
  engine.setBounds({ x: 0, y: 0, width: 900, height: 600 });
  assert.equal(engine.changeZoom('in').success, false, 'zoom fails closed without an active tab');

  assert.equal((await engine.selectTab('tab_A', 'http://127.0.0.1:43127/one')).success, true);
  const tabA = engine.getWebContentsForTesting('tab_A');
  assert.equal(states.at(-1).zoomPercent, 100);

  const plusEvent = { prevented: false, preventDefault() { this.prevented = true; } };
  tabA.emit('before-input-event', plusEvent, {
    type: 'keyDown', keyCode: '=', modifiers: ['control', 'shift']
  });
  assert.equal(plusEvent.prevented, true, 'the trusted active-page zoom shortcut is intercepted');
  assert.equal(tabA.getZoomFactor(), 1.1, 'Ctrl+Plus changes actual tab zoom');
  assert.equal(states.at(-1).zoomPercent, 110, 'zoom level is published for the visible toolbar');

  assert.deepEqual(engine.changeZoom('reset'), { success: true, zoomPercent: 100 });
  assert.equal(tabA.getZoomFactor(), 1, 'reset returns the page to its true 100% scale');
  for (let index = 0; index < 15; index += 1) engine.changeZoom('in');
  assert.equal(tabA.getZoomFactor(), 2, 'zoom is clamped at 200%');
  assert.deepEqual(engine.changeZoom('in'), { success: true, zoomPercent: 200 });
  for (let index = 0; index < 20; index += 1) engine.changeZoom('out');
  assert.equal(tabA.getZoomFactor(), 0.5, 'zoom is clamped at 50%');
  assert.deepEqual(engine.changeZoom('out'), { success: true, zoomPercent: 50 });
  assert.equal(engine.changeZoom('tab_A', 'in').success, false, 'the active-only action does not accept a caller-supplied tab ID');
  assert.equal(engine.changeZoom('arbitrary').success, false, 'zoom actions are an allowlist');

  assert.equal((await engine.selectTab('tab_B', 'http://127.0.0.1:43127/two')).success, true);
  const tabB = engine.getWebContentsForTesting('tab_B');
  assert.equal(tabB.getZoomFactor(), 1, 'a new same-origin tab begins at 100%, independent of the previous tab');
  assert.equal(engine.changeZoom('out').zoomPercent, 90);
  assert.equal(tabB.getZoomFactor(), 0.9);
  assert.equal(tabA.getZoomFactor(), 0.5, 'changing the new same-origin tab does not alter the previous one');

  assert.equal((await engine.selectTab('tab_C', 'https://different-origin.example/three')).success, true);
  const tabC = engine.getWebContentsForTesting('tab_C');
  assert.equal(tabC.getZoomFactor(), 1, 'a cross-origin tab also begins with its own 100% zoom');
  assert.equal(engine.changeZoom('in').zoomPercent, 110);
  assert.equal(tabA.getZoomFactor(), 0.5);
  assert.equal(tabB.getZoomFactor(), 0.9);

  engine.setBounds(null);
  assert.equal(engine.changeZoom('in').success, false, 'a hidden viewport cannot be zoom-targeted');
  engine.setBounds({ x: 0, y: 0, width: 900, height: 600 });
  engine.setActive(false);
  assert.equal(engine.changeZoom('in').success, false, 'an inactive Browser module cannot be zoom-targeted');
  engine.setActive(true);

  engine.closeTab('tab_A');
  engine.closeTab('tab_B');
  const lastTab = engine.closeTab('tab_C');
  assert.equal(lastTab.closed, false);
  assert.equal(lastTab.replaced, true, 'closing the last tab safely navigates its existing WebContents');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(engine.getSessionSnapshot().activeTabId, 'tab_C');
  assert.equal(tabC.getURL(), 'http://127.0.0.1:43127/default');
  assert.equal(tabC.getZoomFactor(), 1.1, 'the safe last-tab replacement remains the same tab and retains its session-only zoom');

  engine.dispose();
  console.log('BROWSER_ZOOM_ENGINE_TEST_PASS: active-tab-only bridge semantics, trusted shortcuts, 50–200% bounds, per-tab and origin isolation, hidden/inactive rejection, and safe last-tab replacement verified.');
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
