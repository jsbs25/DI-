// ONE / EARTH ONE Desktop Shell (Electron Main Process)
// Implements:
// - ONE Core UI window on default isolated session (auth, messenger, LiveKit/WebRTC calls)
// - Built-in Browser tabs via WebContentsView on strictly isolated session partition ('persist:one-browser')
// - Mode A Built-in Browser Proxy (setProxy + closeAllConnections + socks5h remote DNS + main-process proxy auth)
// - Native OS desktop notifications forwarding click events back into ONE Messenger

import fs from 'node:fs';
import path from 'node:path';
import {
  ONE_BROWSER_SESSION_PARTITION,
  validateProxyInput,
  buildElectronProxyConfig,
  toPublicProxyStatus,
  type ValidatedBrowserProxy,
} from './proxyConfig.ts';


const electron = require('electron');
const { app, BrowserWindow, WebContentsView, session, ipcMain, dialog, shell, Notification } = electron;

const ONE_APP_URL = (process.env.ONE_APP_URL || 'http://127.0.0.1:3000').trim();
let oneAppOrigin = '';
try {
  oneAppOrigin = new URL(ONE_APP_URL).origin;
} catch {}

interface TabEntry {
  tabId: string;
  view: any;
  url: string;
  title: string;
  favicon: string;
  loading: boolean;
  navigated: boolean;
  canStop: boolean;
  zoomPercent: number;
  connectionStatus: 'unknown' | 'unencrypted' | 'encrypted' | 'certificate-error';
  certificateErrorCode: string | null;
}

const tabs = new Map<string, TabEntry>();
let tabOrder: string[] = [];
let activeTabId: string | null = null;
let browserViewActive = false;
let browserViewBounds: { x: number; y: number; width: number; height: number } | null = null;
const closedTabsStack: Array<{ tabId: string; url: string; title: string }> = [];

let mainWindow: any = null;
let browserSession: any = null;
let activeProxy: ValidatedBrowserProxy = { mode: 'direct', bypassHosts: [] };
let lastProxyError: string | undefined;

const downloadsMap = new Map<string, any>();
const downloadItems = new Map<string, any>();
const pendingPermissions = new Map<string, { requestId: string; origin: string; permission: 'notifications' | 'geolocation'; callback: (allow: boolean) => void }>();
const sessionPermissionGrants = new Map<string, Set<'notifications' | 'geolocation'>>();

function getStoragePaths() {
  const baseDir = path.join(app.getPath('userData'), 'one-browser-data');
  try { fs.mkdirSync(baseDir, { recursive: true }); } catch {}
  return {
    localDataFile: path.join(baseDir, 'bookmarks-history.json'),
    sessionFile: path.join(baseDir, 'session-restore.json'),
  };
}

function readJsonSafe<T>(file: string, fallback: T): { data: T; readOnly: boolean; warning?: string } {
  try {
    if (!fs.existsSync(file)) return { data: fallback, readOnly: false };
    const raw = fs.readFileSync(file, 'utf8');
    return { data: JSON.parse(raw) as T, readOnly: false };
  } catch (err: any) {
    return { data: fallback, readOnly: true, warning: err?.message || 'Read error' };
  }
}

function writeJsonSafe(file: string, payload: unknown): { success: boolean; error?: string } {
  try {
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Write failed' };
  }
}

function sendToMain(channel: string, payload: unknown) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  } catch {}
}

function emitTabState(tab: TabEntry) {
  const wc = tab.view?.webContents;
  if (!wc || wc.isDestroyed()) return;
  const url = wc.getURL() || tab.url;
  const conn =
    tab.certificateErrorCode
      ? 'certificate-error'
      : url.startsWith('https://')
        ? 'encrypted'
        : url.startsWith('http://')
          ? 'unencrypted'
          : 'unknown';
  sendToMain('browser:state', {
    tabId: tab.tabId,
    active: tab.tabId === activeTabId,
    url,
    title: tab.title || url,
    favicon: tab.favicon || '',
    loading: tab.loading,
    canStop: tab.canStop || tab.loading,
    navigated: tab.navigated,
    canGoBack: wc.canGoBack(),
    canGoForward: wc.canGoForward(),
    zoomPercent: tab.zoomPercent,
    connectionStatus: conn,
    certificateErrorCode: tab.certificateErrorCode,
  });
}

function emitPermissionsSnapshot() {
  const grants = Array.from(sessionPermissionGrants.entries()).map(([origin, perms]) => ({
    origin,
    permissions: Array.from(perms),
  }));
  const pending = Array.from(pendingPermissions.values()).map((p) => ({
    requestId: p.requestId,
    origin: p.origin,
    permission: p.permission,
  }));
  sendToMain('browser:permissions', { pending, grants });
}

function emitDownloadsSnapshot() {
  const list = Array.from(downloadsMap.values());
  sendToMain('browser:downloads', {
    downloads: list,
    status: { readOnly: false, warning: null },
  });
}

function syncActiveViewLayout() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  for (const [id, tab] of tabs.entries()) {
    const visible = browserViewActive && id === activeTabId && !!browserViewBounds && browserViewBounds.width > 10 && browserViewBounds.height > 10;
    try {
      tab.view.setVisible(visible);
      if (visible && browserViewBounds) {
        tab.view.setBounds({
          x: Math.round(browserViewBounds.x),
          y: Math.round(browserViewBounds.y),
          width: Math.round(browserViewBounds.width),
          height: Math.round(browserViewBounds.height),
        });
      }
    } catch {}
  }
}

function persistSessionSnapshot() {
  const { sessionFile } = getStoragePaths();
  const current = readJsonSafe<{ enabled: boolean; activeTabId: string | null; tabs: any[] }>(sessionFile, {
    enabled: false,
    activeTabId: null,
    tabs: [],
  });
  if (!current.data.enabled || current.readOnly) return;
  const serializedTabs = tabOrder
    .map((id) => tabs.get(id))
    .filter((t): t is TabEntry => !!t && /^https?:\/\//i.test(t.url))
    .slice(0, 20)
    .map((t) => ({ id: t.tabId, url: t.url, title: t.title || t.url }));
  writeJsonSafe(sessionFile, {
    enabled: true,
    activeTabId,
    tabs: serializedTabs,
  });
}

function isAllowedWebUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function createOrGetTab(tabId: string, initialUrl?: string): TabEntry {
  const existing = tabs.get(tabId);
  if (existing) return existing;

  const view = new WebContentsView({
    webPreferences: {
      session: browserSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  const entry: TabEntry = {
    tabId,
    view,
    url: initialUrl || 'about:blank',
    title: 'New Tab',
    favicon: '',
    loading: false,
    navigated: false,
    canStop: false,
    zoomPercent: 100,
    connectionStatus: 'unknown',
    certificateErrorCode: null,
  };
  tabs.set(tabId, entry);
  if (!tabOrder.includes(tabId)) tabOrder.push(tabId);

  try {
    mainWindow?.contentView?.addChildView(view);
    view.setVisible(false);
  } catch {}

  const wc = view.webContents;
  const findTabByWc = (id: number) => Array.from(tabs.values()).find(t => t.view?.webContents?.id === id) || null;

  wc.on('render-process-gone', (_ev: unknown, details: any) => {
    const reason = details?.reason || 'unknown';
    console.error('[browser-tab] render-process-gone', { tabId, reason, details });
    entry.loading = false;
    entry.canStop = false;
    entry.certificateErrorCode = null;
    sendToMain('browser:tab-crashed', {
      tabId,
      active: tabId === activeTabId,
      reason,
      exitCode: details?.exitCode ?? null,
      url: entry.url || '',
      title: entry.title || '',
      canReload: true,
    });
    emitTabState(entry);
  });

  wc.on('unresponsive', () => {
    console.warn('[browser-tab] unresponsive', { tabId, url: entry.url });
    sendToMain('browser:tab-unresponsive', { tabId, url: entry.url || '', title: entry.title || '' });
  });
  wc.on('responsive', () => {
    sendToMain('browser:tab-responsive', { tabId, url: entry.url || '' });
  });

  wc.on('did-start-loading', () => {
    entry.loading = true;
    entry.canStop = true;
    emitTabState(entry);
  });
  wc.on('did-stop-loading', () => {
    entry.loading = false;
    entry.canStop = false;
    emitTabState(entry);
  });
  wc.on('did-fail-load', (_ev: unknown, errorCode: number, errorDescription: string, validatedURL: string, isMainFrame: boolean) => {
    if (!isMainFrame || errorCode === -3) return; // ignore subframes and aborted loads
    entry.loading = false;
    entry.canStop = false;
    entry.title = entry.title || validatedURL || entry.url;
    emitTabState(entry);
  });
  wc.on('page-title-updated', (_ev: unknown, title: string) => {
    entry.title = title || entry.url;
    emitTabState(entry);
    persistSessionSnapshot();
  });
  wc.on('page-favicon-updated', (_ev: unknown, favicons: string[]) => {
    entry.favicon = Array.isArray(favicons) && favicons[0] ? favicons[0] : '';
    emitTabState(entry);
  });
  wc.on('did-navigate', (_ev: unknown, url: string) => {
    entry.url = url;
    entry.navigated = true;
    entry.certificateErrorCode = null;
    emitTabState(entry);
    persistSessionSnapshot();
  });
  wc.on('did-navigate-in-page', (_ev: unknown, url: string) => {
    entry.url = url;
    entry.navigated = true;
    emitTabState(entry);
  });
  wc.on('certificate-error', (ev: any, _url: string, error: string, _cert: unknown, callback: (trust: boolean) => void) => {
    ev.preventDefault?.();
    entry.certificateErrorCode = error || 'CERT_ERROR';
    entry.connectionStatus = 'certificate-error';
    callback(false);
    emitTabState(entry);
  });
  wc.on('found-in-page', (_ev: unknown, res: any) => {
    sendToMain('browser:find-result', {
      tabId,
      requestId: res.requestId ?? null,
      activeMatchOrdinal: res.activeMatchOrdinal ?? 0,
      matches: res.matches ?? 0,
      finalUpdate: !!res.finalUpdate,
    });
  });
  wc.setWindowOpenHandler(({ url }: { url: string }) => {
    if (isAllowedWebUrl(url)) {
      const nextId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      createOrGetTab(nextId, url);
      activeTabId = nextId;
      void wcLoadUrlSafe(tabs.get(nextId)!, url);
      sendToMain('browser:new-tab', { tabId: nextId, url, title: url });
      syncActiveViewLayout();
    }
    return { action: 'deny' };
  });

  if (initialUrl && isAllowedWebUrl(initialUrl)) {
    void wcLoadUrlSafe(entry, initialUrl);
  }
  return entry;
}

async function wcLoadUrlSafe(tab: TabEntry, url: string) {
  if (!isAllowedWebUrl(url)) return { success: false, error: 'Only http/https URLs are supported' };
  tab.certificateErrorCode = null;
  tab.url = url;
  try {
    await tab.view.webContents.loadURL(url);
    return { success: true, url };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Navigation failed' };
  }
}

async function applyBrowserProxy(nextProxy: ValidatedBrowserProxy) {
  if (!browserSession) return;
  const electronProxy = buildElectronProxyConfig(nextProxy, oneAppOrigin);
  await browserSession.setProxy(electronProxy);
  if (typeof browserSession.closeAllConnections === 'function') {
    await browserSession.closeAllConnections();
  }
  activeProxy = nextProxy;
  lastProxyError = undefined;
  sendToMain('browser:proxy-status', toPublicProxyStatus(activeProxy, oneAppOrigin));
}

function registerIpcHandlers() {
  ipcMain.handle('browser:getLocalData', () => {
    const { localDataFile } = getStoragePaths();
    const res = readJsonSafe<{ bookmarks: any[]; history: any[] }>(localDataFile, { bookmarks: [], history: [] });
    return {
      initialized: fs.existsSync(localDataFile),
      readOnly: res.readOnly,
      bookmarks: Array.isArray(res.data.bookmarks) ? res.data.bookmarks : [],
      history: Array.isArray(res.data.history) ? res.data.history : [],
      warning: res.warning,
    };
  });

  ipcMain.handle('browser:saveLocalData', (_ev: unknown, payload: { bookmarks: any[]; history: any[] }) => {
    const { localDataFile } = getStoragePaths();
    return writeJsonSafe(localDataFile, {
      bookmarks: Array.isArray(payload?.bookmarks) ? payload.bookmarks : [],
      history: Array.isArray(payload?.history) ? payload.history : [],
    });
  });

  ipcMain.handle('browser:clearBrowsingData', async (_ev: unknown, selection: any) => {
    const results: Record<string, any> = {};
    const { localDataFile, sessionFile } = getStoragePaths();
    if (selection?.history || selection?.bookmarks) {
      const cur = readJsonSafe<{ bookmarks: any[]; history: any[] }>(localDataFile, { bookmarks: [], history: [] });
      const next = {
        bookmarks: selection.bookmarks ? [] : cur.data.bookmarks,
        history: selection.history ? [] : cur.data.history,
      };
      const wr = writeJsonSafe(localDataFile, next);
      results.localData = { success: wr.success, error: wr.error };
    }
    if (selection?.siteData && browserSession) {
      // Clears ONLY isolated 'persist:one-browser' storage — NEVER touches ONE Core auth/chat session
      await browserSession.clearStorageData();
      await browserSession.clearCache();
      results.siteData = { success: true, cleared: true };
    }
    if (selection?.permissions) {
      sessionPermissionGrants.clear();
      emitPermissionsSnapshot();
      results.permissions = { success: true, cleared: true };
    }
    if (selection?.sessionRestore) {
      writeJsonSafe(sessionFile, { enabled: false, activeTabId: null, tabs: [] });
      results.sessionRestore = { success: true, cleared: true };
    }
    return { success: true, changed: true, results };
  });

  ipcMain.handle('browser:getSessionState', () => {
    const { sessionFile } = getStoragePaths();
    const res = readJsonSafe<{ enabled: boolean; activeTabId: string | null; tabs: any[] }>(sessionFile, {
      enabled: false,
      activeTabId: null,
      tabs: [],
    });
    return { ...res.data, readOnly: res.readOnly, warning: res.warning || null };
  });

  ipcMain.handle('browser:setSessionEnabled', (_ev: unknown, enabled: boolean) => {
    const { sessionFile } = getStoragePaths();
    const res = readJsonSafe<{ enabled: boolean; activeTabId: string | null; tabs: any[] }>(sessionFile, {
      enabled: false,
      activeTabId: null,
      tabs: [],
    });
    const wr = writeJsonSafe(sessionFile, { ...res.data, enabled: !!enabled });
    if (enabled) persistSessionSnapshot();
    return { success: wr.success, enabled: !!enabled, error: wr.error };
  });

  ipcMain.handle('browser:restoreSession', () => {
    const { sessionFile } = getStoragePaths();
    const res = readJsonSafe<{ enabled: boolean; activeTabId: string | null; tabs: any[] }>(sessionFile, {
      enabled: false,
      activeTabId: null,
      tabs: [],
    });
    const results: Array<{ tabId: string; success: boolean; error?: string }> = [];
    for (const t of res.data.tabs || []) {
      if (t?.id && isAllowedWebUrl(t.url)) {
        createOrGetTab(t.id, t.url);
        results.push({ tabId: t.id, success: true });
      }
    }
    if (res.data.activeTabId && tabs.has(res.data.activeTabId)) {
      activeTabId = res.data.activeTabId;
    }
    syncActiveViewLayout();
    return { success: true, activeTabId, tabs: results };
  });

  ipcMain.handle('browser:getPermissionState', () => ({
    pending: Array.from(pendingPermissions.values()).map((p) => ({
      requestId: p.requestId,
      origin: p.origin,
      permission: p.permission,
    })),
    grants: Array.from(sessionPermissionGrants.entries()).map(([origin, perms]) => ({
      origin,
      permissions: Array.from(perms),
    })),
  }));

  ipcMain.handle('browser:resolvePermissionRequest', (_ev: unknown, requestId: string, decision: 'allow' | 'deny') => {
    const p = pendingPermissions.get(requestId);
    if (!p) return { success: false, error: 'Permission request expired' };
    pendingPermissions.delete(requestId);
    const granted = decision === 'allow';
    if (granted) {
      if (!sessionPermissionGrants.has(p.origin)) sessionPermissionGrants.set(p.origin, new Set());
      sessionPermissionGrants.get(p.origin)!.add(p.permission);
    }
    p.callback(granted);
    emitPermissionsSnapshot();
    return { success: true, granted };
  });

  ipcMain.handle('browser:revokePermission', (_ev: unknown, origin: string, permission: 'notifications' | 'geolocation') => {
    sessionPermissionGrants.get(origin)?.delete(permission);
    emitPermissionsSnapshot();
    return { success: true };
  });

  ipcMain.handle('browser:revokeAllPermissions', () => {
    sessionPermissionGrants.clear();
    emitPermissionsSnapshot();
    return { success: true, revoked: true };
  });

  ipcMain.handle('browser:getDownloads', () => Array.from(downloadsMap.values()));
  ipcMain.handle('browser:getDownloadStorageStatus', () => ({ readOnly: false, warning: null }));
  ipcMain.handle('browser:cancelDownload', (_ev: unknown, id: string) => {
    try { downloadItems.get(id)?.cancel(); } catch {}
    return { success: true };
  });
  ipcMain.handle('browser:removeDownload', (_ev: unknown, id: string) => {
    downloadsMap.delete(id);
    downloadItems.delete(id);
    emitDownloadsSnapshot();
    return { success: true };
  });
  ipcMain.handle('browser:clearDownloadRecords', () => {
    let cleared = 0;
    for (const [id, d] of downloadsMap.entries()) {
      if (['completed', 'cancelled', 'interrupted'].includes(d.state)) {
        downloadsMap.delete(id);
        cleared++;
      }
    }
    emitDownloadsSnapshot();
    return { success: true, cleared };
  });
  ipcMain.handle('browser:showDownloadInFolder', (_ev: unknown, id: string) => {
    const d = downloadsMap.get(id);
    if (d?.savePath && fs.existsSync(d.savePath)) {
      shell.showItemInFolder(d.savePath);
      return { success: true };
    }
    return { success: false, error: 'File unavailable' };
  });

  ipcMain.handle('browser:printToPdf', async () => {
    const tab = activeTabId ? tabs.get(activeTabId) : null;
    if (!tab) return { success: false, error: 'No active tab' };
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${(tab.title || 'one-page').replace(/[^\w\u4e00-\u9fa5-]+/g, '_')}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { success: false, cancelled: true };
    const buf = await tab.view.webContents.printToPDF({});
    fs.writeFileSync(filePath, buf);
    return { success: true };
  });

  ipcMain.handle('browser:setActive', (_ev: unknown, active: boolean) => {
    browserViewActive = !!active;
    syncActiveViewLayout();
  });

  ipcMain.handle('browser:setBounds', (_ev: unknown, bounds: any) => {
    browserViewBounds = bounds && typeof bounds.width === 'number' ? bounds : null;
    syncActiveViewLayout();
  });

  ipcMain.handle('browser:getCanRestoreClosedTab', () => closedTabsStack.length > 0);
  ipcMain.handle('browser:restoreLastClosedTab', () => {
    const last = closedTabsStack.pop();
    sendToMain('browser:restore-availability', closedTabsStack.length > 0);
    if (!last) return { success: false, restored: false };
    createOrGetTab(last.tabId, last.url);
    activeTabId = last.tabId;
    syncActiveViewLayout();
    sendToMain('browser:new-tab', last);
    return { success: true, restored: true, tabId: last.tabId, url: last.url };
  });

  ipcMain.handle('browser:reorderTabs', (_ev: unknown, ids: string[]) => {
    if (Array.isArray(ids)) tabOrder = ids.filter((id) => tabs.has(id));
    persistSessionSnapshot();
    return { success: true, tabIds: tabOrder };
  });

  ipcMain.handle('browser:selectTab', (_ev: unknown, tabId: string, url: string) => {
    const isInternal = url === 'jupiter://home' || url === 'about:blank';
    const tab = createOrGetTab(tabId, isAllowedWebUrl(url) ? url : (isInternal ? url : undefined));
    if (isInternal) {
      tab.url = url;
      tab.title = 'JUPITER';
      tab.loading = false;
      tab.navigated = false;
      try { if (tab.view?.webContents && !tab.view.webContents.isDestroyed()) tab.view.webContents.stop(); } catch {}
    }
    activeTabId = tab.tabId;
    syncActiveViewLayout();
    emitTabState(tab);
    return { success: true };
  });

  ipcMain.handle('browser:closeTab', (_ev: unknown, tabId: string) => {
    const tab = tabs.get(tabId);
    if (!tab) return { success: true, closed: false, activeTabId };
    if (isAllowedWebUrl(tab.url)) {
      closedTabsStack.push({ tabId, url: tab.url, title: tab.title });
      sendToMain('browser:restore-availability', true);
    }
    try { mainWindow?.contentView?.removeChildView(tab.view); } catch {}
    try { tab.view.webContents.close?.(); } catch {}
    tabs.delete(tabId);
    tabOrder = tabOrder.filter((id) => id !== tabId);
    if (activeTabId === tabId) activeTabId = tabOrder[0] || null;
    syncActiveViewLayout();
    return { success: true, closed: true, activeTabId };
  });

  ipcMain.handle('browser:navigate', async (_ev: unknown, tabId: string, url: string) => {
    const tab = createOrGetTab(tabId);
    activeTabId = tabId;
    syncActiveViewLayout();
    return wcLoadUrlSafe(tab, url);
  });

  ipcMain.handle('browser:goBack', (_ev: unknown, tabId: string) => {
    const tab = tabs.get(tabId);
    if (tab?.view?.webContents?.canGoBack()) tab.view.webContents.goBack();
  });
  ipcMain.handle('browser:goForward', (_ev: unknown, tabId: string) => {
    const tab = tabs.get(tabId);
    if (tab?.view?.webContents?.canGoForward()) tab.view.webContents.goForward();
  });
  ipcMain.handle('browser:recoverTab', async (_ev: unknown, tabId: string) => {
    const tab = tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };
    try {
      const wc = tab.view?.webContents;
      if (wc && !wc.isDestroyed()) {
        await wc.loadURL(tab.url || 'about:blank');
      } else {
        // recreate view if destroyed
        const url = tab.url || 'about:blank';
        try { mainWindow?.contentView?.removeChildView(tab.view); } catch {}
        tabs.delete(tabId);
        tabOrder = tabOrder.filter(id => id !== tabId);
        const recreated = createOrGetTab(tabId, isAllowedWebUrl(url) ? url : undefined);
        activeTabId = tabId;
        syncActiveViewLayout();
        emitTabState(recreated);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Recover failed' };
    }
  });
  ipcMain.handle('browser:reload', (_ev: unknown, tabId: string) => {
    const tab = tabs.get(tabId);
    if (!tab?.view?.webContents || tab.view.webContents.isDestroyed()) return;
    tab.view.webContents.reload();
  });
  ipcMain.handle('browser:stop', (_ev: unknown, tabId: string) => {
    const tab = tabs.get(tabId);
    if (!tab?.view?.webContents || tab.view.webContents.isDestroyed()) return;
    tab.view.webContents.stop();
    tab.loading = false;
    tab.canStop = false;
    emitTabState(tab);
  });
  ipcMain.handle('browser:openDevTools', (_ev: unknown, tabId?: string) => {
    const id = tabId || activeTabId;
    const tab = id ? tabs.get(id) : null;
    if (tab?.view?.webContents && !tab.view.webContents.isDestroyed()) {
      tab.view.webContents.openDevTools({ mode: 'detach' });
    }
  });
  ipcMain.handle('browser:toggleDevTools', (_ev: unknown, tabId?: string) => {
    const id = tabId || activeTabId;
    const tab = id ? tabs.get(id) : null;
    if (tab?.view?.webContents && !tab.view.webContents.isDestroyed()) {
      tab.view.webContents.toggleDevTools();
    }
  });

  ipcMain.handle('browser:changeZoom', (_ev: unknown, action: 'in' | 'out' | 'reset') => {
    const tab = activeTabId ? tabs.get(activeTabId) : null;
    if (!tab) return { success: false, error: 'No active tab' };
    const next = action === 'reset' ? 100 : action === 'in' ? Math.min(200, tab.zoomPercent + 10) : Math.max(50, tab.zoomPercent - 10);
    tab.zoomPercent = next;
    tab.view.webContents.setZoomFactor(next / 100);
    emitTabState(tab);
    return { success: true, zoomPercent: next };
  });

  ipcMain.handle('browser:findInPage', (_ev: unknown, query: string, direction: 'new' | 'next' | 'previous') => {
    const tab = activeTabId ? tabs.get(activeTabId) : null;
    if (!tab || !query) return { success: false };
    tab.view.webContents.findInPage(query, {
      findNext: direction !== 'new',
      forward: direction !== 'previous',
    });
    return { success: true };
  });

  ipcMain.handle('browser:stopFindInPage', (_ev: unknown, returnFocus = true) => {
    const tab = activeTabId ? tabs.get(activeTabId) : null;
    if (!tab) return { success: false };
    tab.view.webContents.stopFindInPage(returnFocus ? 'activateSelection' : 'clearSelection');
    return { success: true };
  });

  // --- Mode A: Isolated Browser Proxy IPC ---
  ipcMain.handle('browser:proxy:getStatus', () => toPublicProxyStatus(activeProxy, oneAppOrigin, lastProxyError));

  ipcMain.handle('browser:proxy:set', async (_ev: unknown, rawInput: any) => {
    const validated = validateProxyInput(rawInput);
    if (!validated.ok) {
      return { success: false, error: validated.error, status: toPublicProxyStatus(activeProxy, oneAppOrigin, validated.error) };
    }
    try {
      await applyBrowserProxy(validated.value);
      return { success: true, status: toPublicProxyStatus(activeProxy, oneAppOrigin) };
    } catch (err: any) {
      lastProxyError = err?.message || 'Failed to apply browser proxy';
      return { success: false, error: lastProxyError, status: toPublicProxyStatus(activeProxy, oneAppOrigin, lastProxyError) };
    }
  });

  ipcMain.handle('browser:proxy:clear', async () => {
    await applyBrowserProxy({ mode: 'direct', bypassHosts: [] });
    return { success: true, status: toPublicProxyStatus(activeProxy, oneAppOrigin) };
  });

  ipcMain.handle('browser:proxy:test', async (_ev: unknown, probeUrl = 'https://www.cloudflare.com/cdn-cgi/trace') => {
    const started = Date.now();
    try {
      const target = isAllowedWebUrl(probeUrl) ? probeUrl : 'https://www.cloudflare.com/cdn-cgi/trace';
      const fetchFn = browserSession?.fetch ? browserSession.fetch.bind(browserSession) : fetch;
      const res = await fetchFn(target, { method: 'GET', signal: AbortSignal.timeout(7000) });
      return {
        ok: res.ok,
        status: res.status,
        latencyMs: Date.now() - started,
        partition: ONE_BROWSER_SESSION_PARTITION,
        proxied: activeProxy.mode !== 'direct',
      };
    } catch (err: any) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        partition: ONE_BROWSER_SESSION_PARTITION,
        proxied: activeProxy.mode !== 'direct',
        error: err?.message || 'Proxy probe failed',
      };
    }
  });

  // --- Desktop Notification Bridge ---
  ipcMain.handle('desktop:getNotificationPermission', () => ({
    supported: Notification.isSupported(),
    permission: Notification.isSupported() ? 'granted' : 'denied',
  }));

  ipcMain.handle('desktop:showNotification', (_ev: unknown, payload: any) => {
    if (!Notification.isSupported()) return { ok: false, error: 'Unsupported' };
    const n = new Notification({
      title: String(payload?.title || 'ONE'),
      body: String(payload?.body || ''),
    });
    n.on('click', () => {
      try { mainWindow?.show(); mainWindow?.focus(); } catch {}
      sendToMain('desktop:notification-click', {
        id: payload?.id || null,
        conversationId: payload?.conversationId || null,
        type: payload?.type || null,
      });
    });
    n.show();
    return { ok: true };
  });
}

function createApplicationMenu() {
  const { Menu } = require('electron');
  const template: any[] = [
    ...(process.platform === 'darwin' ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => sendToMain('browser:shortcut', { action: 'new-tab' }) },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => sendToMain('browser:shortcut', { action: 'close-tab' }) },
        { label: 'Restore Closed Tab', accelerator: 'CmdOrCtrl+Shift+T', click: () => sendToMain('browser:shortcut', { action: 'restore-tab' }) },
        { type: 'separator' },
        { role: process.platform === 'darwin' ? 'close' : 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find in Page', accelerator: 'CmdOrCtrl+F', click: () => sendToMain('browser:shortcut', { action: 'find' }) },
        { label: 'Focus Address Bar', accelerator: 'CmdOrCtrl+L', click: () => sendToMain('browser:shortcut', { action: 'focus-address' }) }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => sendToMain('browser:shortcut', { action: 'reload' }) },
        { label: 'Stop', accelerator: 'Escape', click: () => sendToMain('browser:shortcut', { action: 'stop' }) },
        { type: 'separator' },
        { label: 'Back', accelerator: process.platform === 'darwin' ? 'Cmd+[' : 'Alt+Left', click: () => sendToMain('browser:shortcut', { action: 'back' }) },
        { label: 'Forward', accelerator: process.platform === 'darwin' ? 'Cmd+]' : 'Alt+Right', click: () => sendToMain('browser:shortcut', { action: 'forward' }) },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: () => sendToMain('browser:shortcut', { action: 'zoom-in' }) },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => sendToMain('browser:shortcut', { action: 'zoom-out' }) },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => sendToMain('browser:shortcut', { action: 'zoom-reset' }) },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { label: 'Toggle Developer Tools', accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I', click: () => sendToMain('browser:shortcut', { action: 'devtools' }) }
      ]
    },
    { role: 'windowMenu' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  createApplicationMenu();
  // Strictly isolated persistent Chromium session partition ONLY for ONE Built-in Browser tabs
  browserSession = session.fromPartition(ONE_BROWSER_SESSION_PARTITION);

  app.on('child-process-gone', (_ev: unknown, details: any) => {
    console.error('[app] child-process-gone', details);
    try { sendToMain('browser:child-process-gone', { type: details?.type, reason: details?.reason, serviceName: details?.serviceName }); } catch {}
  });
  app.on('render-process-gone', (_ev: unknown, contents: any, details: any) => {
    try {
      const wcId = contents?.id;
      const tab = Array.from(tabs.values()).find(t => t.view?.webContents?.id === wcId);
      if (!tab) return;
      console.error('[app] render-process-gone(tab)', { tabId: tab.tabId, reason: details?.reason, details });
      tab.loading = false; tab.canStop = false;
      sendToMain('browser:tab-crashed', { tabId: tab.tabId, active: tab.tabId === activeTabId, reason: details?.reason || 'unknown', exitCode: details?.exitCode ?? null, url: tab.url || '', title: tab.title || '', canReload: true });
      emitTabState(tab);
    } catch (e) { console.error(e); }
  });

  // Runtime permission isolation on browserSession
  browserSession.setPermissionRequestHandler((_wc: unknown, permission: string, callback: (allow: boolean) => void, details: any) => {
    if (permission !== 'notifications' && permission !== 'geolocation') {
      callback(false);
      return;
    }
    let origin = '';
    try { origin = new URL(details?.requestingUrl || '').origin; } catch {}
    if (!origin) {
      callback(false);
      return;
    }
    if (sessionPermissionGrants.get(origin)?.has(permission)) {
      callback(true);
      return;
    }
    const requestId = `perm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    pendingPermissions.set(requestId, { requestId, origin, permission, callback });
    emitPermissionsSnapshot();
  });

  // Download tracking scoped strictly to browserSession
  browserSession.on('will-download', (_ev: unknown, item: any) => {
    const id = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    downloadItems.set(id, item);
    downloadsMap.set(id, {
      id,
      filename: item.getFilename(),
      source: item.getURL(),
      state: 'progressing',
      receivedBytes: 0,
      totalBytes: item.getTotalBytes(),
      progress: null,
      savePath: null,
      fileAvailable: false,
      startedAt: new Date().toISOString(),
    });
    emitDownloadsSnapshot();
    item.on('updated', () => {
      const total = item.getTotalBytes();
      const got = item.getReceivedBytes();
      const rec = downloadsMap.get(id);
      if (rec) {
        rec.receivedBytes = got;
        rec.totalBytes = total;
        rec.progress = total > 0 ? Math.round((got / total) * 100) : null;
        rec.savePath = item.getSavePath() || null;
        emitDownloadsSnapshot();
      }
    });
    item.once('done', (_e: unknown, state: string) => {
      const rec = downloadsMap.get(id);
      if (rec) {
        rec.state = state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted';
        rec.savePath = item.getSavePath() || null;
        rec.fileAvailable = state === 'completed' && !!rec.savePath;
        emitDownloadsSnapshot();
      }
      downloadItems.delete(id);
    });
  });

  // Proxy HTTP 407 credential handling inside main process ONLY — credentials never re-enter renderer
  app.on('login', (event: any, _wc: unknown, _req: unknown, authInfo: any, callback: (u?: string, p?: string) => void) => {
    if (!authInfo?.isProxy) return;
    if (activeProxy.mode === 'direct' || !activeProxy.username) return;
    if (authInfo.host && activeProxy.host && authInfo.host !== activeProxy.host) return;
    event.preventDefault();
    callback(activeProxy.username, activeProxy.password || '');
  });

  registerIpcHandlers();

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#04070e',
    title: 'ONE · EARTH ONE',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  void mainWindow.loadURL(ONE_APP_URL);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
