'use strict';
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createBrowserEngine } = require('./browser-engine.cjs');
const { createBrowserContextMenuTemplate } = require('./browser-context-menu.cjs');

class FakeWebContents extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.url = '';
    this.calls = [];
    this.history = { back: false, forward: false };
    this.navigationHistory = {
      canGoBack: () => this.history.back,
      canGoForward: () => this.history.forward,
      goBack: () => this.calls.push('back'),
      goForward: () => this.calls.push('forward')
    };
  }
  isDestroyed() { return this.destroyed; }
  getURL() { return this.url; }
  getTitle() { return 'Synthetic Context Menu Fixture'; }
  isLoading() { return false; }
  setWindowOpenHandler(handler) { this.windowOpenHandler = handler; }
  async loadURL(url) { this.url = url; }
  reload() { this.calls.push('reload'); }
  cut() { this.calls.push('cut'); }
  paste() { this.calls.push('paste'); }
  selectAll() { this.calls.push('selectAll'); }
  focus() { this.calls.push('focus'); }
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

function findItem(items, label) {
  return items.find(item => item.label === label);
}
function labels(items) {
  return items.filter(item => item.label).map(item => item.label);
}

async function main() {
  const views = [];
  const requests = [];
  const contextEvents = [];
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
    appOrigin: 'https://earth-one.test',
    onContextMenu: context => contextEvents.push(context)
  });
  engine.setActive(true);
  engine.setBounds({ x: 0, y: 0, width: 900, height: 600 });
  assert.equal((await engine.selectTab('tab_A', 'https://source.test/one')).success, true);
  const contentsA = engine.getWebContentsForTesting('tab_A');
  const viewA = views[0];
  assert.equal(viewA.visible, true);
  contentsA.calls.length = 0;
  assert.equal(viewA.options.webPreferences.nodeIntegration, false);
  assert.equal(viewA.options.webPreferences.contextIsolation, true);
  assert.equal(viewA.options.webPreferences.sandbox, true);
  assert.equal(Object.hasOwn(viewA.options.webPreferences, 'preload'), false);

  const eventState = { prevented: false, preventDefault() { this.prevented = true; } };
  const trustedParams = {
    linkURL: 'https://target.test/path?q=1',
    selectionText: '',
    isEditable: false,
    editFlags: {}
  };
  contentsA.emit('context-menu', eventState, trustedParams);
  assert.equal(eventState.prevented, true, 'the engine suppresses the uncontrolled default context menu');
  assert.equal(contextEvents.length, 1);
  assert.equal(contextEvents[0].contents, contentsA, 'the source WebContents is supplied only by the main-process listener');
  assert.equal(contextEvents[0].params, trustedParams, 'the Electron context event params are passed directly from the trusted event');

  contentsA.history.back = true;
  contentsA.history.forward = true;
  const clipboardWrites = [];
  const linkRequests = [];
  const template = createBrowserContextMenuTemplate({
    params: trustedParams,
    contents: contentsA,
    isTargetActive: contents => engine.isActiveWebContents(contents),
    clipboard: { writeText: text => clipboardWrites.push(text) },
    openLinkInNewTab: url => linkRequests.push(url),
    appOrigin: 'https://earth-one.test'
  });
  assert.deepEqual(labels(template), ['后退', '前进', '重新加载', '在新标签页中打开链接', '复制链接地址']);
  findItem(template, '后退').click();
  findItem(template, '前进').click();
  findItem(template, '重新加载').click();
  assert.deepEqual(contentsA.calls, ['back', 'forward', 'reload']);
  findItem(template, '复制链接地址').click();
  assert.deepEqual(clipboardWrites, ['https://target.test/path?q=1'], 'copy-link uses only the Electron event linkURL snapshot');
  findItem(template, '在新标签页中打开链接').click();
  assert.deepEqual(linkRequests, ['https://target.test/path?q=1'], 'open-link uses only the validated event linkURL snapshot');

  const selectedParams = { isEditable: false, linkURL: '', selectionText: 'captured text from Electron params', editFlags: {} };
  const selectedTemplate = createBrowserContextMenuTemplate({
    params: selectedParams,
    contents: contentsA,
    isTargetActive: contents => engine.isActiveWebContents(contents),
    clipboard: { writeText: text => clipboardWrites.push(text) },
    openLinkInNewTab: url => linkRequests.push(url),
    appOrigin: 'https://earth-one.test'
  });
  selectedParams.selectionText = 'renderer-style later mutation must not change the captured value';
  findItem(selectedTemplate, '复制所选文字').click();
  assert.equal(clipboardWrites.at(-1), 'captured text from Electron params', 'copy-selection uses the trusted event snapshot, not a later supplied value');

  const editableParams = {
    isEditable: true,
    linkURL: '',
    selectionText: 'editable selection',
    editFlags: { canCut: false, canCopy: true, canPaste: true, canSelectAll: false }
  };
  const editableTemplate = createBrowserContextMenuTemplate({
    params: editableParams,
    contents: contentsA,
    isTargetActive: contents => engine.isActiveWebContents(contents),
    clipboard: { writeText: text => clipboardWrites.push(text) },
    openLinkInNewTab: url => linkRequests.push(url)
  });
  assert.deepEqual(labels(editableTemplate), ['后退', '前进', '重新加载', '复制', '粘贴']);
  findItem(editableTemplate, '复制').click();
  findItem(editableTemplate, '粘贴').click();
  assert.equal(clipboardWrites.at(-1), 'editable selection');
  assert.equal(contentsA.calls.at(-1), 'paste');

  const fullyEditableTemplate = createBrowserContextMenuTemplate({
    params: { isEditable: true, selectionText: 'selected', editFlags: { canCut: true, canCopy: true, canPaste: true, canSelectAll: true } },
    contents: contentsA,
    isTargetActive: contents => engine.isActiveWebContents(contents),
    clipboard: { writeText: text => clipboardWrites.push(text) },
    openLinkInNewTab: url => linkRequests.push(url)
  });
  assert.deepEqual(labels(fullyEditableTemplate), ['后退', '前进', '重新加载', '剪切', '复制', '粘贴', '全选']);
  findItem(fullyEditableTemplate, '剪切').click();
  findItem(fullyEditableTemplate, '全选').click();
  assert.deepEqual(contentsA.calls.slice(-2), ['cut', 'selectAll']);
  const deniedEditingTemplate = createBrowserContextMenuTemplate({
    params: { isEditable: false, selectionText: '', editFlags: { canCut: true, canCopy: true, canPaste: true, canSelectAll: true } },
    contents: contentsA,
    isTargetActive: contents => engine.isActiveWebContents(contents),
    clipboard: { writeText: text => clipboardWrites.push(text) },
    openLinkInNewTab: url => linkRequests.push(url)
  });
  assert.deepEqual(labels(deniedEditingTemplate), ['后退', '前进', '重新加载'], 'edit roles require Electron to mark the target editable');

  for (const unsafeLink of [
    'javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,bad', 'ftp://target.test/file',
    'https://user:pass@target.test/', 'https://earth-one.test/?module=library'
  ]) {
    const unsafeTemplate = createBrowserContextMenuTemplate({
      params: { linkURL: unsafeLink, selectionText: '', isEditable: false, editFlags: {} },
      contents: contentsA,
      isTargetActive: contents => engine.isActiveWebContents(contents),
      clipboard: { writeText: text => clipboardWrites.push(text) },
      openLinkInNewTab: url => linkRequests.push(url),
      appOrigin: 'https://earth-one.test'
    });
    assert.equal(unsafeTemplate.some(item => ['在新标签页中打开链接', '复制链接地址'].includes(item.label)), false,
      `unsafe and app-route links must not be actionable: ${unsafeLink}`);
  }

  assert.equal((await engine.selectTab('tab_B', 'https://other.test/two')).success, true);
  const contentsB = engine.getWebContentsForTesting('tab_B');
  const inactiveEvent = { prevented: false, preventDefault() { this.prevented = true; } };
  contentsA.emit('context-menu', inactiveEvent, trustedParams);
  assert.equal(inactiveEvent.prevented, true);
  assert.equal(contextEvents.length, 1, 'inactive tab events must never produce a menu');
  findItem(template, '在新标签页中打开链接').click();
  findItem(template, '复制链接地址').click();
  findItem(template, '重新加载').click();
  findItem(findContextMenuTemplate({
    params: { isEditable: false, selectionText: 'stale selection', editFlags: {} },
    contents: contentsA,
    engine,
    clipboardWrites,
    linkRequests
  }), '复制所选文字').click();
  assert.deepEqual(linkRequests, ['https://target.test/path?q=1'], 'a stale menu cannot open a link after active-tab change');
  assert.deepEqual(clipboardWrites, ['https://target.test/path?q=1', 'captured text from Electron params', 'editable selection'],
    'stale menu actions cannot copy data from an inactive tab');
  assert.equal(contentsA.calls.length, 6, 'a stale menu cannot reload or edit a previous tab');
  assert.equal(engine.isActiveWebContents(contentsB), true);
  engine.setBounds(null);
  assert.equal(engine.isActiveWebContents(contentsB), false, 'a hidden Browser viewport is not an active context-menu target');
  engine.setBounds({ x: 0, y: 0, width: 900, height: 600 });
  engine.setActive(false);
  assert.equal(engine.isActiveWebContents(contentsB), false, 'an inactive Browser module cannot execute context-menu actions');
  engine.dispose();
  console.log('BROWSER_CONTEXT_MENU_TEST_PASS: trusted Electron params, link/text snapshots, editFlags gating, unsafe-link rejection, visible active-WebContents isolation, and remote no-preload/no-Node isolation verified.');
}

function findContextMenuTemplate({ params, contents, engine, clipboardWrites, linkRequests }) {
  return createBrowserContextMenuTemplate({
    params,
    contents,
    isTargetActive: target => engine.isActiveWebContents(target),
    clipboard: { writeText: text => clipboardWrites.push(text) },
    openLinkInNewTab: url => linkRequests.push(url),
    appOrigin: 'https://earth-one.test'
  });
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
