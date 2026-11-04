'use strict';

const TAB_ID_PATTERN = /^tab_[a-zA-Z0-9_-]{1,64}$/;
const MAX_URL_LENGTH = 4096;
const BARE_HTTP_HOST_PATTERN = /^(?:localhost(?::\d+)?|(?:[\w-]+\.)+[\w-]+(?::\d+)?|[\w-]+:\d+|\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?|\[[\da-f:]+\](?::\d+)?)(?:[/?#]|$)/i;
const { createDownloadManager } = require('./download-manager.cjs');

function normalizeBrowserUrl(input) {
  if (typeof input !== 'string') throw new TypeError('请输入有效的网址。');
  const value = input.trim();
  if (!value || value.length > MAX_URL_LENGTH) throw new TypeError('网址为空或超出长度限制。');

  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(value) && !BARE_HTTP_HOST_PATTERN.test(value);
  const candidate = hasScheme ? value : `https://${value}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new TypeError('网址格式无效。');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError('出于安全考虑，只允许打开 HTTP 或 HTTPS 网页。');
  }
  if (!parsed.hostname || parsed.username || parsed.password) {
    throw new TypeError('网址必须包含主机名，且不能嵌入用户名或密码。');
  }

  return parsed.href;
}

function isAllowedNavigation(input) {
  if (typeof input !== 'string' || input.length > MAX_URL_LENGTH) return false;
  try {
    const parsed = new URL(input);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      Boolean(parsed.hostname) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function createBrowserEngine({
  window,
  WebContentsView,
  browserSession,
  onState = () => {},
  onFocusAddressBar = () => {},
  onDownloads = () => {},
  getTestApprovalPath = null
}) {
  const tabs = new Map();
  let activeTabId = null;
  let browserActive = false;
  let viewportBounds = null;
  let disposed = false;
  const downloadManager = createDownloadManager({
    browserSession,
    isOwnedContents: contents => [...tabs.values()].some(entry => entry.view.webContents === contents),
    onChange: onDownloads,
    getTestApprovalPath
  });

  function validTabId(tabId) {
    return typeof tabId === 'string' && TAB_ID_PATTERN.test(tabId);
  }

  function snapshot(tabId, entry) {
    const contents = entry.view.webContents;
    let canGoBack = false;
    let canGoForward = false;
    try {
      canGoBack = contents.navigationHistory.canGoBack();
      canGoForward = contents.navigationHistory.canGoForward();
    } catch {
      // A just-created or closing WebContents can briefly have no history.
    }
    return {
      tabId,
      url: contents.getURL() || entry.lastUrl || '',
      title: contents.getTitle() || entry.lastTitle || '',
      loading: contents.isLoading(),
      navigated: false,
      canGoBack,
      canGoForward
    };
  }

  function publish(tabId, entry, navigated = false) {
    if (disposed || entry.view.webContents.isDestroyed()) return;
    const state = snapshot(tabId, entry);
    state.navigated = navigated;
    if (state.url) entry.lastUrl = state.url;
    if (state.title) entry.lastTitle = state.title;
    onState(state);
  }

  function applyVisibility() {
    for (const [tabId, entry] of tabs) {
      const visible = browserActive && tabId === activeTabId && Boolean(viewportBounds);
      entry.view.setVisible(visible);
      if (visible) entry.view.setBounds(viewportBounds);
    }
  }

  function attachEvents(tabId, entry) {
    const contents = entry.view.webContents;
    const validateNavigation = (event, url) => {
      if (!isAllowedNavigation(url)) event.preventDefault();
    };

    contents.on('will-navigate', validateNavigation);
    contents.on('will-redirect', validateNavigation);
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('before-input-event', (event, input) => {
      const key = String(input.key || '').toLowerCase();
      if (input.type !== 'keyDown' || key !== 'l' || !(input.control || input.meta)) return;
      event.preventDefault();
      if (!window.isDestroyed()) window.webContents.focus();
      onFocusAddressBar(tabId);
    });

    for (const eventName of [
      'did-start-loading',
      'did-stop-loading',
      'page-title-updated',
      'did-fail-load',
      'render-process-gone'
    ]) {
      contents.on(eventName, () => publish(tabId, entry));
    }
    contents.on('did-navigate', () => publish(tabId, entry, true));
    contents.on('did-navigate-in-page', () => publish(tabId, entry, true));
  }

  function createTab(tabId) {
    if (disposed) throw new Error('浏览器引擎已关闭。');
    if (!validTabId(tabId)) throw new TypeError('浏览器标签 ID 无效。');

    const view = new WebContentsView({
      webPreferences: {
        session: browserSession,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        autoplayPolicy: 'user-gesture-required'
      }
    });
    const entry = { view, lastUrl: '', lastTitle: '' };
    tabs.set(tabId, entry);
    window.contentView.addChildView(view);
    attachEvents(tabId, entry);
    view.setVisible(false);
    return entry;
  }

  async function selectTab(tabId, initialUrl) {
    if (!validTabId(tabId)) return { success: false, error: '浏览器标签 ID 无效。' };
    let entry = tabs.get(tabId);
    const isNew = !entry;
    if (!entry) entry = createTab(tabId);
    activeTabId = tabId;

    if (isNew && initialUrl) {
      try {
        const url = normalizeBrowserUrl(initialUrl);
        entry.lastUrl = url;
        await entry.view.webContents.loadURL(url);
      } catch (error) {
        return { success: false, error: error.message || '网页无法打开。' };
      }
    } else if (!entry.view.webContents.getURL() && initialUrl) {
      try {
        const url = normalizeBrowserUrl(initialUrl);
        entry.lastUrl = url;
        await entry.view.webContents.loadURL(url);
      } catch (error) {
        return { success: false, error: error.message || '网页无法打开。' };
      }
    }

    applyVisibility();
    publish(tabId, entry);
    return { success: true };
  }

  async function navigate(tabId, target) {
    if (!validTabId(tabId)) return { success: false, error: '浏览器标签 ID 无效。' };
    let url;
    try {
      url = normalizeBrowserUrl(target);
    } catch (error) {
      return { success: false, error: error.message || '网址格式无效。' };
    }

    let entry = tabs.get(tabId);
    if (!entry) {
      const selected = await selectTab(tabId, url);
      return selected.success ? { success: true, url } : selected;
    }
    activeTabId = tabId;
    applyVisibility();
    entry.lastUrl = url;
    try {
      await entry.view.webContents.loadURL(url);
      return { success: true, url };
    } catch (error) {
      return { success: false, error: error.message || '网页无法打开。' };
    }
  }

  function closeTab(tabId) {
    const entry = tabs.get(tabId);
    if (!entry) return;
    tabs.delete(tabId);
    window.contentView.removeChildView(entry.view);
    if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close();
    if (activeTabId === tabId) activeTabId = null;
    applyVisibility();
  }

  function setActive(active) {
    browserActive = Boolean(active);
    applyVisibility();
  }

  function setBounds(bounds) {
    if (bounds === null) {
      viewportBounds = null;
      applyVisibility();
      return;
    }
    if (!bounds || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(bounds[key]))) {
      throw new TypeError('浏览器视口尺寸无效。');
    }
    const { x, y, width, height } = bounds;
    if (x < 0 || y < 0 || width < 2 || height < 2 || x > 20000 || y > 20000 || width > 20000 || height > 20000) {
      viewportBounds = null;
      applyVisibility();
      return;
    }
    viewportBounds = {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height)
    };
    applyVisibility();
  }

  function historyMethod(tabId, method) {
    const entry = tabs.get(tabId);
    if (!entry) return;
    const history = entry.view.webContents.navigationHistory;
    if (method === 'back' && history.canGoBack()) history.goBack();
    if (method === 'forward' && history.canGoForward()) history.goForward();
    if (method === 'reload') entry.view.webContents.reload();
  }

  function getWebContentsForTesting(tabId) {
    return tabs.get(tabId)?.view.webContents ?? null;
  }

  function getViewBoundsForTesting(tabId) {
    const view = tabs.get(tabId)?.view;
    return view ? view.getBounds() : null;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    downloadManager.dispose();
    for (const [tabId, entry] of tabs) {
      window.contentView.removeChildView(entry.view);
      if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close();
      tabs.delete(tabId);
    }
    activeTabId = null;
    viewportBounds = null;
  }

  return {
    setActive,
    setBounds,
    selectTab,
    closeTab,
    navigate,
    goBack: tabId => historyMethod(tabId, 'back'),
    goForward: tabId => historyMethod(tabId, 'forward'),
    reload: tabId => historyMethod(tabId, 'reload'),
    getDownloads: () => downloadManager.list(),
    cancelDownload: id => downloadManager.cancel(id),
    removeDownload: id => downloadManager.remove(id),
    dispose,
    getWebContentsForTesting,
    getViewBoundsForTesting
  };
}

module.exports = {
  createBrowserEngine,
  isAllowedNavigation,
  normalizeBrowserUrl
};
