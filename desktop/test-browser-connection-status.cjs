'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createBrowserEngine } = require('./browser-engine.cjs');

const navigationOutcomes = new Map();

class FakeWebContents extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.loading = false;
    this.url = '';
    this.title = '';
    this.zoomFactor = 1;
    this.navigationHistory = { canGoBack: () => false, canGoForward: () => false };
  }
  isDestroyed() { return this.destroyed; }
  isLoading() { return this.loading; }
  getURL() { return this.url; }
  getTitle() { return this.title; }
  setWindowOpenHandler() {}
  setZoomFactor(factor) { this.zoomFactor = factor; }
  stopFindInPage() {}
  focus() {}
  close() { this.destroyed = true; }
  async loadURL(requestedUrl) {
    this.loading = true;
    this.emit('did-start-navigation', {
      url: requestedUrl,
      isMainFrame: true,
      isSameDocument: false
    });
    const outcome = navigationOutcomes.get(requestedUrl) || {};
    if (outcome.failure) {
      this.url = requestedUrl;
      this.loading = false;
      this.emit('did-fail-load', {}, outcome.errorCode ?? -202, outcome.failure, requestedUrl, true, 1, 1);
      throw new Error(outcome.failure);
    }
    const finalUrl = outcome.redirectTo || requestedUrl;
    this.url = finalUrl;
    this.title = new URL(finalUrl).host;
    this.emit('did-navigate', {}, finalUrl, 200, 'OK');
    this.loading = false;
    this.emit('did-stop-loading');
  }
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
    defaultNewTabUrl: 'http://fixture.test/default'
  });

  try {
    engine.setActive(true);
    engine.setBounds({ x: 0, y: 0, width: 900, height: 600 });

    const httpUrl = 'http://fixture.test/start';
    assert.equal((await engine.selectTab('tab_http', httpUrl)).success, true);
    let state = states.at(-1);
    assert.equal(state.connectionStatus, 'unencrypted', 'only a successful top-level HTTP navigation is labelled unencrypted');
    assert.equal(state.certificateErrorCode, null);

    const redirectedHttps = 'https://fixture.test/accepted-after-redirect';
    navigationOutcomes.set('http://fixture.test/redirect-to-https', { redirectTo: redirectedHttps });
    assert.equal((await engine.navigate('tab_http', 'http://fixture.test/redirect-to-https')).success, true);
    state = states.at(-1);
    assert.equal(state.url, redirectedHttps, 'status follows the final top-level redirect destination');
    assert.equal(state.connectionStatus, 'encrypted', 'HTTPS is labelled encrypted only after Chromium reports a successful main-frame commit');

    const secondHttpUrl = 'http://fixture.test/second-tab';
    assert.equal((await engine.selectTab('tab_second', secondHttpUrl)).success, true);
    state = states.at(-1);
    assert.equal(state.tabId, 'tab_second');
    assert.equal(state.connectionStatus, 'unencrypted', 'a new tab starts with its own HTTP status');

    const secondContents = engine.getWebContentsForTesting('tab_second');
    secondContents.emit('did-start-navigation', { url: 'https://subframe.test/', isMainFrame: false, isSameDocument: false });
    secondContents.emit('did-fail-load', {}, -202, 'net::ERR_CERT_AUTHORITY_INVALID', 'https://subframe.test/', false, 2, 2);
    state = states.at(-1);
    assert.equal(state.connectionStatus, 'unencrypted', 'subframe navigation and certificate failure cannot alter the top-level indicator');
    assert.equal(state.certificateErrorCode, null);

    assert.equal((await engine.selectTab('tab_http')).success, true);
    assert.equal(states.at(-1).connectionStatus, 'encrypted', 'switching tabs restores the selected tab’s independent connection state');

    const rejectedUrl = 'https://fixture.test/rejected-certificate';
    navigationOutcomes.set(rejectedUrl, { failure: 'net::ERR_CERT_AUTHORITY_INVALID', errorCode: -202 });
    const rejected = await engine.navigate('tab_second', rejectedUrl);
    assert.equal(rejected.success, false, 'Chromium certificate rejection remains a failed navigation');
    state = states.at(-1);
    assert.equal(state.tabId, 'tab_second');
    assert.equal(state.connectionStatus, 'certificate-error');
    assert.equal(state.certificateErrorCode, 'ERR_CERT_AUTHORITY_INVALID');

    assert.equal((await engine.selectTab('tab_http')).success, true);
    assert.equal(states.at(-1).connectionStatus, 'encrypted', 'an inactive tab certificate error cannot leak into the active tab');

    assert.equal((await engine.navigate('tab_second', 'http://fixture.test/recovered')).success, true);
    state = states.at(-1);
    assert.equal(state.connectionStatus, 'unencrypted', 'a subsequent successful page clears the prior certificate error');
    assert.equal(state.certificateErrorCode, null);

    const secondFail = 'http://fixture.test/network-failure';
    navigationOutcomes.set(secondFail, { failure: 'net::ERR_CONNECTION_REFUSED', errorCode: -102 });
    assert.equal((await engine.navigate('tab_second', secondFail)).success, false);
    state = states.at(-1);
    assert.equal(state.connectionStatus, 'unknown', 'non-certificate load failures remain neutral');
    assert.equal(state.certificateErrorCode, null);

    const statesBeforeSubframeHash = states.length;
    secondContents.emit('did-navigate-in-page', {}, 'http://fixture.test/recovered#subframe', false, 2, 2);
    assert.equal(states.length, statesBeforeSubframeHash, 'subframe in-page navigation does not publish top-level connection state');

    engine.dispose();
    assert.equal(views.length, 0);
    console.log('BROWSER_CONNECTION_STATUS_TEST_PASS: main-frame HTTP/accepted-HTTPS status, final redirect protocol, per-tab isolation, subframe exclusion, blocked certificate error, neutral non-certificate failure, and error clearing verified.');
  } finally {
    engine.dispose();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
