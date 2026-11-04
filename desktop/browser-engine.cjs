'use strict';

const TAB_ID_PATTERN = /^tab_[a-zA-Z0-9_-]{1,64}$/;
const MAX_URL_LENGTH = 4096;
const BARE_HTTP_HOST_PATTERN = /^(?:localhost(?::\d+)?|(?:[\w-]+\.)+[\w-]+(?::\d+)?|[\w-]+:\d+|\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?|\[[\da-f:]+\](?::\d+)?)(?:[/?#]|$)/i;
const { createDownloadManager } = require('./download-manager.cjs');
const { createDownloadStore } = require('./download-store.cjs');
const { sanitizeSessionUrl } = require('./session-store.cjs');

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

function sanitizeRestoredUrl(input) {
  return sanitizeSessionUrl(input);
}

function createBrowserEngine({
  window,
  WebContentsView,
  browserSession,
  onState = () => {},
  onFocusAddressBar = () => {},
  onFocusFind = () => {},
  onFindResult = () => {},
  onDownloads = () => {},
  onPermissionContextChange = () => {},
  downloadStorePath = null,
  getTestApprovalPath = null
}) {
  const tabs = new Map();
  let activeTabId = null;
  let browserActive = false;
  let viewportBounds = null;
  let disposed = false;
  const downloadStore = downloadStorePath ? createDownloadStore(downloadStorePath) : null;
  const downloadManager = createDownloadManager({
    browserSession,
    isOwnedContents: contents => [...tabs.values()].some(entry => entry.view.webContents === contents),
    onChange: onDownloads,
    getTestApprovalPath,
    store: downloadStore
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
      url: isAllowedNavigation(contents.getURL()) ? contents.getURL() : entry.lastUrl || '',
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
      onPermissionContextChange(contents);
      if (!isAllowedNavigation(url)) event.preventDefault();
    };

    contents.on('will-navigate', validateNavigation);
    contents.on('will-redirect', validateNavigation);
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('before-input-event', (event, input) => {
      const key = String(input.key || input.keyCode || '').toLowerCase();
      const modifiers = Array.isArray(input.modifiers) ? input.modifiers : [];
      const commandModifier = Boolean(input.control || input.meta || modifiers.includes('control') || modifiers.includes('meta'));
      const alt = Boolean(input.alt || modifiers.includes('alt'));
      const shift = Boolean(input.shift || modifiers.includes('shift'));
      if (input.type !== 'keyDown' || !commandModifier || alt || shift) return;
      if (key !== 'l' && key !== 'f') return;
      event.preventDefault();
      if (!window.isDestroyed()) window.webContents.focus();
      if (key === 'l') onFocusAddressBar(tabId);
      if (key === 'f') onFocusFind(tabId);
    });

    contents.on('found-in-page', (_event, result) => {
      if (disposed || activeTabId !== tabId || !browserActive || !viewportBounds ||
          entry.findRequestId !== result.requestId || contents.isDestroyed()) return;
      onFindResult({
        tabId,
        requestId: result.requestId,
        activeMatchOrdinal: Number.isSafeInteger(result.activeMatchOrdinal) ? Math.max(0, result.activeMatchOrdinal) : 0,
        matches: Number.isSafeInteger(result.matches) ? Math.max(0, result.matches) : 0,
        finalUpdate: Boolean(result.finalUpdate)
      });
    });

    contents.on('did-start-loading', () => stopFindForEntry(tabId, entry));

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
    contents.on('did-navigate-in-page', () => {
      onPermissionContextChange(contents);
      publish(tabId, entry, true);
    });
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
    const entry = { view, lastUrl: '', lastTitle: '', findQuery: '', findRequestId: null };
    tabs.set(tabId, entry);
    window.contentView.addChildView(view);
    attachEvents(tabId, entry);
    view.setVisible(false);
    return entry;
  }

  async function selectTab(tabId, initialUrl) {
    if (!validTabId(tabId)) return { success: false, error: '浏览器标签 ID 无效。' };
    if (activeTabId && activeTabId !== tabId) {
      const previousEntry = tabs.get(activeTabId);
      if (previousEntry) {
        onPermissionContextChange(previousEntry.view.webContents);
        stopFindForEntry(activeTabId, previousEntry);
      }
    }
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

  async function restoreTabs(savedTabs, requestedActiveTabId) {
    if (disposed || !Array.isArray(savedTabs)) return { success: false, tabs: [] };
    const candidates = [];
    const seen = new Set();
    for (const saved of savedTabs) {
      if (candidates.length >= 12) break;
      if (!saved || typeof saved !== 'object' || !validTabId(saved.id) || seen.has(saved.id)) continue;
      const url = sanitizeRestoredUrl(saved.url);
      if (!url) continue;
      seen.add(saved.id);
      candidates.push({ tabId: saved.id, url });
    }

    const entries = candidates.map(candidate => {
      const entry = createTab(candidate.tabId);
      entry.lastUrl = candidate.url;
      entry.lastTitle = new URL(candidate.url).host;
      return { ...candidate, entry };
    });
    const activeCandidate = entries.find(candidate => candidate.tabId === requestedActiveTabId) || entries[0];
    activeTabId = activeCandidate?.tabId || null;
    applyVisibility();

    const results = await Promise.all(entries.map(async candidate => {
      let timeout;
      try {
        await Promise.race([
          candidate.entry.view.webContents.loadURL(candidate.url),
          new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error('restore-timeout')), 15000);
          })
        ]);
        return { tabId: candidate.tabId, success: true };
      } catch {
        return { tabId: candidate.tabId, success: false, error: '页面未能加载。' };
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }));

    if (disposed) return { success: false, tabs: results };
    applyVisibility();
    for (const candidate of entries) publish(candidate.tabId, candidate.entry);
    return { success: true, activeTabId: activeTabId, tabs: results };
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
    stopFindForEntry(tabId, entry);
    onPermissionContextChange(entry.view.webContents);
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
    stopFindForEntry(tabId, entry);
    onPermissionContextChange(entry.view.webContents);
    tabs.delete(tabId);
    window.contentView.removeChildView(entry.view);
    if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close();
    if (activeTabId === tabId) activeTabId = null;
    applyVisibility();
  }

  function setActive(active) {
    browserActive = Boolean(active);
    if (!browserActive && activeTabId) {
      const entry = tabs.get(activeTabId);
      if (entry) stopFindForEntry(activeTabId, entry);
    }
    applyVisibility();
  }

  function setBounds(bounds) {
    if (bounds === null) {
      viewportBounds = null;
      if (activeTabId) {
        const entry = tabs.get(activeTabId);
        if (entry) stopFindForEntry(activeTabId, entry);
      }
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
    if (method === 'reload') {
      stopFindForEntry(tabId, entry);
      entry.view.webContents.reload();
    }
  }

  function stopFindForEntry(tabId, entry, focusPage = false) {
    const contents = entry?.view?.webContents;
    if (!contents || contents.isDestroyed()) return false;
    const hadFind = Boolean(entry.findQuery || entry.findRequestId !== null);
    entry.findQuery = '';
    entry.findRequestId = null;
    try {
      contents.stopFindInPage('clearSelection');
      if (focusPage && browserActive && activeTabId === tabId && viewportBounds) contents.focus();
    } catch {
      return false;
    }
    if (hadFind) onFindResult({ tabId, requestId: null, activeMatchOrdinal: 0, matches: 0, finalUpdate: true, cleared: true });
    return true;
  }

  function getActiveEntry() {
    if (disposed || !browserActive || !viewportBounds || !activeTabId) return null;
    const entry = tabs.get(activeTabId);
    if (!entry || entry.view.webContents.isDestroyed()) return null;
    return { tabId: activeTabId, entry };
  }

  function findInPage(query, direction) {
    if (typeof query !== 'string' || query.length > 512 || query.includes('\u0000')) {
      return { success: false, error: '查找内容无效或超出长度限制。' };
    }
    if (!['new', 'next', 'previous'].includes(direction)) {
      return { success: false, error: '查找方向无效。' };
    }
    if (!query.trim()) return stopFindInPage(false);
    const active = getActiveEntry();
    if (!active) return { success: false, error: '当前没有可用的活动 Chromium 页面。' };
    const { entry } = active;
    const contents = entry.view.webContents;
    const isNewSearch = direction === 'new' || entry.findQuery !== query;
    entry.findQuery = query;
    try {
      entry.findRequestId = contents.findInPage(query, {
        forward: direction !== 'previous',
        findNext: !isNewSearch
      });
      return { success: true };
    } catch {
      entry.findQuery = '';
      entry.findRequestId = null;
      return { success: false, error: '当前页面暂时无法查找。' };
    }
  }

  function stopFindInPage(focusPage = false) {
    const active = getActiveEntry();
    if (!active) return { success: false, error: '当前没有可用的活动 Chromium 页面。' };
    const success = stopFindForEntry(active.tabId, active.entry, Boolean(focusPage));
    return success ? { success: true } : { success: false, error: '当前页面无法清除查找高亮。' };
  }

  function isPermissionContext(contents, origin, details) {
    if (!contents || details?.isMainFrame !== true || !browserActive || !viewportBounds || !activeTabId) return false;
    const entry = tabs.get(activeTabId);
    if (!entry || entry.view.webContents !== contents || contents.isDestroyed()) return false;
    try {
      const current = new URL(contents.getURL());
      const frame = new URL(contents.mainFrame?.url || '');
      return current.origin === origin && frame.origin === origin &&
        (current.protocol === 'http:' || current.protocol === 'https:') &&
        (frame.protocol === 'http:' || frame.protocol === 'https:');
    } catch {
      return false;
    }
  }

  function getWebContentsForTesting(tabId) {
    return tabs.get(tabId)?.view.webContents ?? null;
  }

  function getSessionSnapshot() {
    const savedTabs = [];
    for (const [tabId, entry] of tabs) {
      if (entry.view.webContents.isDestroyed()) continue;
      const currentUrl = entry.view.webContents.getURL();
      const url = sanitizeRestoredUrl(isAllowedNavigation(currentUrl) ? currentUrl : entry.lastUrl);
      if (!url) continue;
      savedTabs.push({ id: tabId, url });
    }
    return { tabs: savedTabs, activeTabId: activeTabId && savedTabs.some(tab => tab.id === activeTabId) ? activeTabId : null };
  }

  function getTabIdsForTesting() {
    return [...tabs.keys()];
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
    restoreTabs,
    closeTab,
    navigate,
    goBack: tabId => historyMethod(tabId, 'back'),
    goForward: tabId => historyMethod(tabId, 'forward'),
    reload: tabId => historyMethod(tabId, 'reload'),
    getDownloads: () => downloadManager.list(),
    cancelDownload: id => downloadManager.cancel(id),
    removeDownload: id => downloadManager.remove(id),
    clearDownloadRecords: () => downloadManager.clearTerminal(),
    getDownloadStorageStatus: () => downloadManager.getStorageStatus(),
    findInPage,
    stopFindInPage,
    isPermissionContext,
    getSessionSnapshot,
    dispose,
    getWebContentsForTesting,
    getTabIdsForTesting,
    getViewBoundsForTesting
  };
}

module.exports = {
  createBrowserEngine,
  isAllowedNavigation,
  normalizeBrowserUrl
};
