'use strict';

const TAB_ID_PATTERN = /^tab_[a-zA-Z0-9_-]{1,64}$/;
const MAX_URL_LENGTH = 4096;
const BARE_HTTP_HOST_PATTERN = /^(?:localhost(?::\d+)?|(?:[\w-]+\.)+[\w-]+(?::\d+)?|[\w-]+:\d+|\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?|\[[\da-f:]+\](?::\d+)?)(?:[/?#]|$)/i;
const { randomUUID } = require('node:crypto');
const { createDownloadManager } = require('./download-manager.cjs');
const { createDownloadStore } = require('./download-store.cjs');
const { sanitizeSessionUrl } = require('./session-store.cjs');
const { normalizePopupTarget, requiresPopupConfirmation } = require('./browser-popup-security.cjs');
const { getBrowserShortcut } = require('./browser-shortcuts.cjs');

const DEFAULT_BROWSER_NEW_TAB_URL = 'https://en.wikipedia.org/wiki/Earth';
const MIN_ZOOM_PERCENT = 50;
const MAX_ZOOM_PERCENT = 200;
const ZOOM_STEP_PERCENT = 10;
const BROWSER_SITE_DATA_TYPES = Object.freeze([
  'backgroundFetch',
  'cache',
  'cookies',
  'fileSystems',
  'indexedDB',
  'localStorage',
  'serviceWorkers',
  'webSQL'
]);

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

function getConnectionStatus(url) {
  try {
    const protocol = new URL(url).protocol;
    if (protocol === 'https:') return 'encrypted';
    if (protocol === 'http:') return 'unencrypted';
  } catch {
    // A URL without a confirmed HTTP(S) main-frame navigation is neutral.
  }
  return 'unknown';
}

function getCertificateErrorCode(description) {
  if (typeof description !== 'string') return null;
  return description.match(/\bERR_CERT_[A-Z0-9_]+\b/)?.[0] || null;
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
  onOpenTabRequest = () => {},
  onContextMenu = () => {},
  onNewTab = () => {},
  onTabClosed = () => {},
  onRestoreAvailability = () => {},
  defaultNewTabUrl = DEFAULT_BROWSER_NEW_TAB_URL,
  appOrigin = null,
  downloadStorePath = null,
  getTestApprovalPath = null
}) {
  const safeDefaultNewTabUrl = normalizeBrowserUrl(defaultNewTabUrl);
  const tabs = new Map();
  let activeTabId = null;
  let lastClosedTab = null;
  let browserActive = false;
  let viewportBounds = null;
  let disposed = false;
  let privacyClearInProgress = false;
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

  function isActiveTab(tabId) {
    const entry = tabs.get(tabId);
    return Boolean(browserActive && viewportBounds && activeTabId === tabId &&
      entry && !entry.view.webContents.isDestroyed());
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
      active: isActiveTab(tabId),
      url: isAllowedNavigation(contents.getURL()) ? contents.getURL() : entry.lastUrl || '',
      title: contents.getTitle() || entry.lastTitle || '',
      loading: contents.isLoading(),
      navigated: false,
      canGoBack,
      canGoForward,
      zoomPercent: entry.zoomPercent,
      connectionStatus: entry.connectionStatus,
      certificateErrorCode: entry.certificateErrorCode
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

  function applyZoomForEntry(entry) {
    if (!entry || entry.view.webContents.isDestroyed()) return false;
    try {
      entry.view.webContents.setZoomFactor(entry.zoomPercent / 100);
      return true;
    } catch {
      return false;
    }
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
    const validateNavigation = (event, url, isRedirect = false) => {
      onPermissionContextChange(contents);
      if (privacyClearInProgress) {
        if (entry.privacyUnloading && (url === 'about:blank' || url === entry.privacyRestoreUrl)) return;
        // Preserve ordinary server redirects during restore, but validate every hop as credential-free HTTP(S).
        if (isRedirect && entry.privacyRestoring && isAllowedNavigation(url)) return;
        event.preventDefault();
        return;
      }
      if (!isAllowedNavigation(url)) event.preventDefault();
    };

    contents.on('will-navigate', (event, url) => validateNavigation(event, url));
    contents.on('will-redirect', (event, url) => validateNavigation(event, url, true));
    contents.on('did-start-navigation', details => {
      if (details?.isMainFrame !== true || details.isSameDocument) return;
      entry.connectionStatus = 'unknown';
      entry.certificateErrorCode = null;
      publish(tabId, entry);
    });
    contents.setWindowOpenHandler(details => {
      const url = normalizePopupTarget(details?.url, appOrigin);
      if (!url || details?.postBody != null || !isActiveTab(tabId)) return { action: 'deny' };
      try {
        onOpenTabRequest({
          url,
          sourceTabId: tabId,
          requiresConfirmation: requiresPopupConfirmation(details)
        });
      } catch {
        // A failed app-side handoff must never fall back to an Electron window.
      }
      // Electron-created windows are always denied. EARTH ONE creates a separate,
      // isolated WebContentsView only after its popup policy has accepted the URL.
      return { action: 'deny' };
    });
    contents.on('context-menu', (event, params) => {
      event?.preventDefault?.();
      if (!params || typeof params !== 'object' || !isActiveTab(tabId)) return;
      try {
        onContextMenu({ contents, params });
      } catch {
        // A context-menu failure must not expose a default or unmanaged menu.
      }
    });
    contents.on('before-input-event', (event, input) => {
      const shortcut = getBrowserShortcut(input);
      if (!isActiveTab(tabId) || !shortcut) return;
      event.preventDefault();
      if (shortcut.action === 'zoom') {
        changeZoom(shortcut.direction);
        return;
      }
      if (shortcut.action === 'focus-address' || shortcut.action === 'find') {
        if (!window.isDestroyed()) window.webContents.focus();
        if (shortcut.action === 'focus-address') onFocusAddressBar(tabId);
        if (shortcut.action === 'find') onFocusFind(tabId);
        return;
      }
      if (shortcut.action === 'new-tab') {
        void openNewTab(safeDefaultNewTabUrl);
        return;
      }
      if (shortcut.action === 'close-tab') {
        closeTab(tabId);
        return;
      }
      if (shortcut.action === 'restore-closed-tab') {
        void restoreLastClosedTab();
        return;
      }
      if (shortcut.action === 'cycle-tab') {
        const tabIds = [...tabs.keys()];
        const currentIndex = tabIds.indexOf(activeTabId);
        if (currentIndex < 0 || tabIds.length < 2) return;
        const nextIndex = (currentIndex + shortcut.direction + tabIds.length) % tabIds.length;
        void selectTab(tabIds[nextIndex]).catch(() => {});
        return;
      }
      if (shortcut.action === 'select-tab') {
        const tabIdAtIndex = shortcut.index === 9
          ? [...tabs.keys()].at(-1)
          : [...tabs.keys()][shortcut.index - 1];
        if (tabIdAtIndex) void selectTab(tabIdAtIndex).catch(() => {});
      }
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
      'render-process-gone'
    ]) {
      contents.on(eventName, () => publish(tabId, entry));
    }
    contents.on('did-fail-load', (_event, _errorCode, errorDescription, _validatedUrl, isMainFrame) => {
      if (isMainFrame !== true) return;
      entry.certificateErrorCode = getCertificateErrorCode(errorDescription);
      entry.connectionStatus = entry.certificateErrorCode ? 'certificate-error' : 'unknown';
      publish(tabId, entry);
    });
    contents.on('did-navigate', (_event, url) => {
      entry.connectionStatus = getConnectionStatus(url);
      entry.certificateErrorCode = null;
      applyZoomForEntry(entry);
      publish(tabId, entry, !entry.privacyUnloading);
    });
    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (isMainFrame !== true) return;
      entry.connectionStatus = getConnectionStatus(url);
      entry.certificateErrorCode = null;
      onPermissionContextChange(contents);
      applyZoomForEntry(entry);
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
    const entry = {
      view,
      lastUrl: '',
      lastTitle: '',
      zoomPercent: 100,
      findQuery: '',
      findRequestId: null,
      initialLoadPromise: null,
      connectionStatus: 'unknown',
      certificateErrorCode: null,
      privacyUnloading: false,
      privacyRestoring: false,
      privacyRestoreUrl: ''
    };
    tabs.set(tabId, entry);
    window.contentView.addChildView(view);
    attachEvents(tabId, entry);
    view.setVisible(false);
    return entry;
  }

  async function selectTab(tabId, initialUrl) {
    if (privacyClearInProgress) return { success: false, error: '正在清除此浏览器会话的数据，请稍后重试。' };
    if (!validTabId(tabId)) return { success: false, error: '浏览器标签 ID 无效。' };
    let safeInitialUrl = null;
    if (initialUrl !== undefined) {
      try {
        safeInitialUrl = normalizeBrowserUrl(initialUrl);
      } catch (error) {
        return { success: false, error: error.message || '网页地址无效。' };
      }
    }
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

    if (isNew && safeInitialUrl) {
      try {
        entry.lastUrl = safeInitialUrl;
        await entry.view.webContents.loadURL(safeInitialUrl);
      } catch (error) {
        return { success: false, error: error.message || '网页无法打开。' };
      }
    } else if (!entry.view.webContents.getURL() && safeInitialUrl) {
      if (entry.initialLoadPromise) {
        try {
          await entry.initialLoadPromise;
        } catch (error) {
          return { success: false, error: error.message || '网页无法打开。' };
        }
      } else {
        try {
          entry.lastUrl = safeInitialUrl;
          await entry.view.webContents.loadURL(safeInitialUrl);
        } catch (error) {
          return { success: false, error: error.message || '网页无法打开。' };
        }
      }
    }

    applyZoomForEntry(entry);
    applyVisibility();
    if (browserActive && viewportBounds) entry.view.webContents.focus();
    publish(tabId, entry);
    return { success: true };
  }

  async function openNewTab(target, allowAppOrigin = false) {
    if (privacyClearInProgress) return { success: false, error: '正在清除此浏览器会话的数据，请稍后重试。' };
    let url = null;
    if (allowAppOrigin) {
      try { url = normalizeBrowserUrl(target); } catch {}
    } else {
      url = normalizePopupTarget(target, appOrigin);
    }
    if (!url || disposed) return { success: false, error: '新标签页地址无效。' };

    if (activeTabId) {
      const previousEntry = tabs.get(activeTabId);
      if (previousEntry) {
        onPermissionContextChange(previousEntry.view.webContents);
        stopFindForEntry(activeTabId, previousEntry);
      }
    }

    const tabId = `tab_${randomUUID()}`;
    const entry = createTab(tabId);
    activeTabId = tabId;
    entry.lastUrl = url;
    entry.lastTitle = new URL(url).hostname;
    applyVisibility();
    if (browserActive && viewportBounds) entry.view.webContents.focus();

    try {
      onNewTab({ tabId, url, title: entry.lastTitle });
    } catch {
      // The native page still stays in the isolated Browser engine if UI sync fails.
    }

    try {
      entry.initialLoadPromise = Promise.resolve(entry.view.webContents.loadURL(url));
      await entry.initialLoadPromise;
      return { success: true, tabId, url };
    } catch (error) {
      return { success: false, tabId, url, error: error.message || '网页无法打开。' };
    } finally {
      entry.initialLoadPromise = null;
      if (!disposed && !entry.view.webContents.isDestroyed()) {
        applyZoomForEntry(entry);
        applyVisibility();
        if (browserActive && viewportBounds && activeTabId === tabId) entry.view.webContents.focus();
        publish(tabId, entry);
      }
    }
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
        applyZoomForEntry(candidate.entry);
        return { tabId: candidate.tabId, success: true };
      } catch {
        return { tabId: candidate.tabId, success: false, error: '页面未能加载。' };
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }));

    if (disposed) return { success: false, tabs: results };
    if (activeCandidate) applyZoomForEntry(activeCandidate.entry);
    applyVisibility();
    if (browserActive && viewportBounds) activeCandidate?.entry.view.webContents.focus();
    for (const candidate of entries) publish(candidate.tabId, candidate.entry);
    return { success: true, activeTabId: activeTabId, tabs: results };
  }

  async function navigate(tabId, target) {
    if (privacyClearInProgress) return { success: false, error: '正在清除此浏览器会话的数据，请稍后重试。' };
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
      applyZoomForEntry(entry);
      return { success: true, url };
    } catch (error) {
      return { success: false, error: error.message || '网页无法打开。' };
    }
  }

  function closeTab(tabId) {
    if (privacyClearInProgress) return { success: false, closed: false, error: '正在清除此浏览器会话的数据，请稍后重试。' };
    const entry = tabs.get(tabId);
    if (!entry) return { success: false, closed: false };
    if (tabs.size === 1) {
      entry.lastUrl = safeDefaultNewTabUrl;
      entry.lastTitle = new URL(safeDefaultNewTabUrl).hostname;
      void navigate(tabId, safeDefaultNewTabUrl);
      return { success: true, closed: false, replaced: true, activeTabId: tabId };
    }
    const closedState = snapshot(tabId, entry);
    const restorableUrl = sanitizeRestoredUrl(closedState.url);
    lastClosedTab = restorableUrl ? { url: restorableUrl } : null;
    const wasActive = activeTabId === tabId;
    stopFindForEntry(tabId, entry);
    onPermissionContextChange(entry.view.webContents);
    tabs.delete(tabId);
    window.contentView.removeChildView(entry.view);
    if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close();
    if (wasActive) activeTabId = tabs.keys().next().value || null;
    if (wasActive && activeTabId) applyZoomForEntry(tabs.get(activeTabId));
    applyVisibility();
    if (wasActive && browserActive && viewportBounds && activeTabId) {
      const nextEntry = tabs.get(activeTabId);
      if (nextEntry && !nextEntry.view.webContents.isDestroyed()) {
        nextEntry.view.webContents.focus();
        publish(activeTabId, nextEntry);
      }
    }
    try {
      const activeEntry = tabs.get(activeTabId);
      onTabClosed({
        tabId,
        activeTabId,
        activeTab: activeEntry ? snapshot(activeTabId, activeEntry) : null
      });
    } catch {
      // UI synchronization is best effort; closing the native tab is already complete.
    }
    try {
      onRestoreAvailability(Boolean(lastClosedTab));
    } catch {
      // The in-memory restore state remains authoritative if UI notification fails.
    }
    return { success: true, closed: true, activeTabId };
  }

  function reorderTabs(tabIds) {
    if (!Array.isArray(tabIds) || tabIds.length !== tabs.size) {
      return { success: false, error: '浏览器标签顺序无效。' };
    }
    const seen = new Set();
    for (const tabId of tabIds) {
      if (!validTabId(tabId) || !tabs.has(tabId) || seen.has(tabId)) {
        return { success: false, error: '浏览器标签顺序包含未知或重复标签。' };
      }
      seen.add(tabId);
    }
    const orderedEntries = tabIds.map(tabId => [tabId, tabs.get(tabId)]);
    tabs.clear();
    for (const [tabId, entry] of orderedEntries) tabs.set(tabId, entry);
    return { success: true, tabIds: [...tabs.keys()] };
  }

  async function restoreLastClosedTab() {
    if (privacyClearInProgress) return { success: false, restored: false, error: '正在清除此浏览器会话的数据，请稍后重试。' };
    const candidate = lastClosedTab;
    const url = sanitizeRestoredUrl(candidate?.url);
    if (!candidate || !url) {
      lastClosedTab = null;
      try { onRestoreAvailability(false); } catch {}
      return { success: false, restored: false, error: '没有可恢复的已关闭标签页。' };
    }

    // Consume the URL-only snapshot before opening, so duplicate shortcut/IPC calls
    // cannot create multiple tabs or supply their own tab IDs or destinations.
    lastClosedTab = null;
    try { onRestoreAvailability(false); } catch {}
    const result = await openNewTab(url, true);
    return { ...result, restored: Boolean(result.success) };
  }

  function canRestoreClosedTab() {
    return Boolean(lastClosedTab && sanitizeRestoredUrl(lastClosedTab.url));
  }

  function setActive(active) {
    browserActive = Boolean(active);
    if (browserActive && activeTabId) applyZoomForEntry(tabs.get(activeTabId));
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
    const wasViewportVisible = Boolean(viewportBounds);
    viewportBounds = {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height)
    };
    if (!wasViewportVisible && activeTabId) applyZoomForEntry(tabs.get(activeTabId));
    applyVisibility();
    if (!wasViewportVisible && browserActive && activeTabId) {
      const entry = tabs.get(activeTabId);
      if (entry && !entry.view.webContents.isDestroyed()) entry.view.webContents.focus();
    }
  }

  function historyMethod(tabId, method) {
    if (privacyClearInProgress) return;
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

  function isActiveWebContents(contents) {
    const active = getActiveEntry();
    return Boolean(active && active.entry.view.webContents === contents);
  }

  function changeZoom(action) {
    if (!['in', 'out', 'reset'].includes(action)) {
      return { success: false, error: '网页缩放操作无效。' };
    }
    const active = getActiveEntry();
    if (!active) return { success: false, error: '当前没有可用的活动 Chromium 页面。' };
    const { entry } = active;
    const currentPercent = entry.zoomPercent;
    const nextPercent = action === 'reset'
      ? 100
      : action === 'in'
        ? Math.min(MAX_ZOOM_PERCENT, currentPercent + ZOOM_STEP_PERCENT)
        : Math.max(MIN_ZOOM_PERCENT, currentPercent - ZOOM_STEP_PERCENT);
    try {
      entry.view.webContents.setZoomFactor(nextPercent / 100);
      entry.zoomPercent = nextPercent;
      publish(active.tabId, entry);
      return { success: true, zoomPercent: nextPercent };
    } catch {
      return { success: false, error: '当前网页无法调整缩放比例。' };
    }
  }

  function getActivePrintTarget() {
    const active = getActiveEntry();
    if (!active || !isAllowedNavigation(active.entry.view.webContents.getURL())) return null;
    return { tabId: active.tabId, contents: active.entry.view.webContents };
  }

  function isActivePrintTarget(target) {
    if (!target || typeof target.tabId !== 'string' || !target.contents) return false;
    const active = getActiveEntry();
    return Boolean(active && active.tabId === target.tabId &&
      active.entry.view.webContents === target.contents &&
      isAllowedNavigation(target.contents.getURL()));
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
    if (privacyClearInProgress) return { success: false, error: '正在清除此浏览器会话的数据，请稍后重试。' };
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

  async function clearSiteDataAndReload(siteSession) {
    if (privacyClearInProgress) return { success: false, cleared: false, error: '浏览器数据清除正在进行。' };
    if (!siteSession || typeof siteSession.clearData !== 'function') {
      return { success: false, cleared: false, error: '当前 Chromium 会话不支持清除网站数据。' };
    }

    const targets = [];
    for (const [tabId, entry] of tabs) {
      const contents = entry.view.webContents;
      if (contents.isDestroyed()) continue;
      let url = '';
      try { url = contents.getURL(); } catch {}
      if (!isAllowedNavigation(url) && isAllowedNavigation(entry.lastUrl)) url = entry.lastUrl;
      if (!isAllowedNavigation(url)) {
        return { success: false, cleared: false, error: '有标签网址无法安全验证，未清除网站数据。' };
      }
      targets.push({ tabId, entry, contents, url, unloaded: false });
    }

    privacyClearInProgress = true;
    let dataCleared = false;
    let clearError = null;
    let authCacheCleared = false;
    try {
      for (const target of targets) {
        const { tabId, entry, contents } = target;
        stopFindForEntry(tabId, entry);
        onPermissionContextChange(contents);
        try { contents.stop(); } catch {}
        entry.privacyUnloading = true;
        entry.privacyRestoreUrl = target.url;
        try {
          await contents.loadURL('about:blank');
          target.unloaded = true;
        } catch (error) {
          try { target.unloaded = contents.getURL() === 'about:blank'; } catch {}
          throw error;
        }
      }

      await siteSession.clearData({ dataTypes: [...BROWSER_SITE_DATA_TYPES] });
      dataCleared = true;
      if (typeof siteSession.clearAuthCache === 'function') {
        try {
          await siteSession.clearAuthCache();
          authCacheCleared = true;
        } catch (error) {
          clearError = `网站数据已清除，但 HTTP 身份验证缓存清除失败${error?.message ? `：${error.message}` : '。'}`;
        }
      } else {
        authCacheCleared = true;
      }
    } catch (error) {
      clearError = error?.message || '无法清除此浏览器会话的网站数据。';
    }

    let reloadedTabs = 0;
    const reloadFailedTabs = [];
    try {
      for (const target of targets) {
        const { tabId, entry, contents, url } = target;
        if (!target.unloaded && !dataCleared) {
          entry.privacyUnloading = false;
          entry.privacyRestoreUrl = '';
          continue;
        }
        if (contents.isDestroyed()) {
          reloadFailedTabs.push(tabId);
          continue;
        }
        try {
          entry.privacyUnloading = true;
          entry.privacyRestoring = true;
          entry.privacyRestoreUrl = url;
          await contents.loadURL(url);
          const restoredUrl = contents.getURL();
          if (!isAllowedNavigation(restoredUrl)) throw new Error('恢复后的标签网址不在安全 HTTP(S) 范围内。');
          entry.lastUrl = restoredUrl;
          reloadedTabs += 1;
        } catch {
          reloadFailedTabs.push(tabId);
        } finally {
          entry.privacyUnloading = false;
          entry.privacyRestoring = false;
          entry.privacyRestoreUrl = '';
        }
        if (!contents.isDestroyed()) {
          applyZoomForEntry(entry);
          publish(tabId, entry);
        }
      }
    } finally {
      privacyClearInProgress = false;
      for (const target of targets) {
        target.entry.privacyUnloading = false;
        target.entry.privacyRestoring = false;
        target.entry.privacyRestoreUrl = '';
      }
    }
    applyVisibility();
    if (browserActive && viewportBounds && activeTabId) {
      try { tabs.get(activeTabId)?.view.webContents.focus(); } catch {}
    }

    const allTabsRestored = reloadFailedTabs.length === 0 && reloadedTabs === targets.length;
    const success = dataCleared && authCacheCleared && allTabsRestored;
    return {
      success,
      cleared: dataCleared,
      reloadedTabs,
      reloadFailedTabs,
      error: clearError || (dataCleared && !authCacheCleared
        ? '网站数据已清除，但 HTTP 身份验证缓存清除失败。'
        : (dataCleared && !allTabsRestored ? '网站数据已清除，但部分标签未能安全恢复。' : undefined))
    };
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
    lastClosedTab = null;
  }

  return {
    setActive,
    setBounds,
    selectTab,
    openNewTab,
    restoreTabs,
    closeTab,
    reorderTabs,
    restoreLastClosedTab,
    canRestoreClosedTab,
    navigate,
    goBack: tabId => historyMethod(tabId, 'back'),
    goForward: tabId => historyMethod(tabId, 'forward'),
    reload: tabId => historyMethod(tabId, 'reload'),
    getDownloads: () => downloadManager.list(),
    cancelDownload: id => downloadManager.cancel(id),
    removeDownload: id => downloadManager.remove(id),
    clearDownloadRecords: () => downloadManager.clearTerminal(),
    clearDownloadRecordsSince: since => downloadManager.clearTerminalSince(since),
    getDownloadStorageStatus: () => downloadManager.getStorageStatus(),
    findInPage,
    stopFindInPage,
    changeZoom,
    getActivePrintTarget,
    isActivePrintTarget,
    isPermissionContext,
    isActiveTab,
    isActiveWebContents,
    getSessionSnapshot,
    clearSiteDataAndReload,
    dispose,
    getWebContentsForTesting,
    getTabIdsForTesting,
    getViewBoundsForTesting
  };
}

module.exports = {
  BROWSER_SITE_DATA_TYPES,
  DEFAULT_BROWSER_NEW_TAB_URL,
  createBrowserEngine,
  isAllowedNavigation,
  normalizeBrowserUrl
};
