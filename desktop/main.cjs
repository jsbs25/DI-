'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, WebContentsView, ipcMain, session, shell, dialog, Menu } = require('electron');
const { createBrowserEngine, isAllowedNavigation, DEFAULT_BROWSER_NEW_TAB_URL } = require('./browser-engine.cjs');
const { createBrowserSessionStore } = require('./session-store.cjs');
const { assertTrustedAppSender: assertTrustedAppSenderForContext } = require('./browser-ipc-security.cjs');
const { createBrowserPermissionManager } = require('./browser-permissions.cjs');
const { createBrowserPdfExporter } = require('./browser-print-pdf.cjs');

app.setName('EARTH ONE');
if (process.env.EARTH_ONE_BROWSER_SMOKE_TEST === '1' && process.env.EARTH_ONE_BROWSER_TEST_PROFILE_DIR) {
  const profileDir = process.env.EARTH_ONE_BROWSER_TEST_PROFILE_DIR;
  app.setPath('userData', profileDir);
  app.setPath('sessionData', path.join(profileDir, 'session-data'));
}

let mainWindow = null;
let browserEngine = null;
let browserPdfExporter = null;
let browserPermissionManager = null;
let appOrigin = null;
let testDownloadDir = null;
let browserBookmarkApiRequests = 0;
const browserFixtureRequestAudit = [];
let localBrowserDataReadOnly = false;
let localBrowserDataWriteQueue = Promise.resolve();
let browserSessionStore = null;
let browserSessionStatus = { enabled: false, activeTabId: null, tabs: [], readOnly: false, warning: null };
let browserSessionEnabled = false;
let browserSessionRestoreStarted = false;
let browserSessionRestoreResult = null;
let browserSessionRestorePromise = null;
let browserSessionPersistTimer = null;
let browserPopupConfirmationOpen = false;
let browserSmokeTest = false;
let browserPopupTestDecision = null;
let browserPopupSmokeConfirmationCount = 0;
let browserPrintSmokePath = null;
let browserPrintSmokeDialogCalls = 0;

const MAX_LOCAL_BOOKMARKS = 200;
const MAX_LOCAL_HISTORY = 500;
const MAX_LOCAL_BROWSER_DATA_BYTES = 2 * 1024 * 1024;

function assertTrustedAppSender(event) {
  assertTrustedAppSenderForContext(event, mainWindow?.webContents, appOrigin);
}

function openBrowserTabFromRequest(request) {
  if (!request || !browserEngine?.isActiveTab(request.sourceTabId)) return;
  void browserEngine.openNewTab(request.url);
}

function requestBrowserPopupConfirmation(request) {
  if (!request || !browserEngine?.isActiveTab(request.sourceTabId) ||
      !mainWindow || mainWindow.isDestroyed() || browserPopupConfirmationOpen) return;

  if (browserSmokeTest) {
    browserPopupSmokeConfirmationCount += 1;
    console.log(`BROWSER_POPUP_CONFIRMATION_REQUIRED:${new URL(request.url).origin}`);
    const approved = browserPopupTestDecision === 'approve';
    console.log(`BROWSER_POPUP_CONFIRMATION_RESULT:${approved ? 'approved' : 'denied'}`);
    if (approved) openBrowserTabFromRequest(request);
    return;
  }

  let destination;
  try {
    const target = new URL(request.url);
    destination = `${target.origin}${target.pathname}`;
  } catch {
    return;
  }
  browserPopupConfirmationOpen = true;
  void dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: '打开新标签页？',
    message: '此网页请求打开一个新标签页。',
    detail: destination,
    buttons: ['在新标签页中打开', '取消'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  }).then(result => {
    if (result.response === 0) openBrowserTabFromRequest(request);
  }).catch(() => {}).finally(() => {
    browserPopupConfirmationOpen = false;
  });
}

function showBrowserLinkContextMenu(request) {
  if (!request || !browserEngine?.isActiveTab(request.sourceTabId) ||
      !mainWindow || mainWindow.isDestroyed()) return;
  const menu = Menu.buildFromTemplate([{
    label: '在新标签页中打开链接',
    click: () => openBrowserTabFromRequest(request)
  }]);
  menu.popup({ window: mainWindow });
}

function getSafeSmokeApprovalPath(smokeTest, fixtureUrl, downloadDir) {
  if (!smokeTest || typeof fixtureUrl !== 'string' || typeof downloadDir !== 'string') return null;
  try {
    const url = new URL(fixtureUrl);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') return null;
    const tempRoot = fs.realpathSync(os.tmpdir());
    const realDownloadDir = fs.realpathSync(downloadDir);
    const tempPrefix = tempRoot.endsWith(path.sep) ? tempRoot : `${tempRoot}${path.sep}`;
    if (!realDownloadDir.startsWith(tempPrefix) ||
        !path.basename(realDownloadDir).startsWith('earth-one-browser-smoke-')) return null;
    const allowedFixtures = new Map([
      ['earth-one-fixture.txt', '/download'],
      ['earth-one-interrupted.txt', '/slow-download']
    ]);
    return ({ filename, source }) => {
      const expectedPath = allowedFixtures.get(filename);
      if (!expectedPath || typeof source !== 'string') return null;
      try {
        const sourceUrl = new URL(source);
        if (sourceUrl.protocol !== 'http:' || sourceUrl.origin !== url.origin || sourceUrl.pathname !== expectedPath) {
          return null;
        }
        return path.join(realDownloadDir, filename);
      } catch {
        return null;
      }
    };
  } catch {
    return null;
  }
}

function getSafeSmokePdfPath(smokeTest, fixtureUrl, downloadDir, requestedPath) {
  if (!smokeTest || process.env.EARTH_ONE_BROWSER_PRINT_SMOKE_TEST !== '1' ||
      typeof fixtureUrl !== 'string' || typeof downloadDir !== 'string' || typeof requestedPath !== 'string') return null;
  try {
    const url = new URL(fixtureUrl);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') return null;
    const tempRoot = fs.realpathSync(os.tmpdir());
    const realDownloadDir = fs.realpathSync(downloadDir);
    const expectedPath = path.join(realDownloadDir, 'earth-one-browser-print.pdf');
    const tempPrefix = tempRoot.endsWith(path.sep) ? tempRoot : `${tempRoot}${path.sep}`;
    if (!realDownloadDir.startsWith(tempPrefix) ||
        !path.basename(realDownloadDir).startsWith('earth-one-browser-smoke-') ||
        path.resolve(requestedPath) !== expectedPath) return null;
    return expectedPath;
  } catch {
    return null;
  }
}

function getSafeSmokeNewTabUrl(smokeTest, fixtureUrl, requestedUrl) {
  if (!smokeTest || typeof fixtureUrl !== 'string' || typeof requestedUrl !== 'string') return null;
  try {
    const fixture = new URL(fixtureUrl);
    const candidate = new URL(requestedUrl);
    if (fixture.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(fixture.hostname) ||
        candidate.origin !== fixture.origin || candidate.pathname !== '/shortcuts-default' ||
        candidate.search || candidate.hash || candidate.username || candidate.password) return null;
    return candidate.href;
  } catch {
    return null;
  }
}

function getLocalBrowserDataPath() {
  return path.join(app.getPath('userData'), 'earth-one-browser-data.json');
}

function getBrowserSessionStorePath() {
  return path.join(app.getPath('userData'), 'earth-one-browser-session.json');
}

function persistBrowserSessionNow() {
  if (!browserSessionStore || !browserSessionEnabled) return { success: true, enabled: false, tabs: [] };
  const snapshot = browserEngine?.getSessionSnapshot?.() || { tabs: [], activeTabId: null };
  const result = browserSessionStore.save({
    enabled: true,
    tabs: snapshot.tabs,
    activeTabId: snapshot.activeTabId
  });
  if (result.success) {
    browserSessionStatus = { ...result, readOnly: false, warning: null };
  } else {
    browserSessionStatus = { ...browserSessionStatus, readOnly: true, warning: result.error };
    browserSessionEnabled = false;
  }
  return result;
}

function scheduleBrowserSessionPersist() {
  if (!browserSessionEnabled || !browserSessionStore) return;
  if (browserSessionPersistTimer) clearTimeout(browserSessionPersistTimer);
  browserSessionPersistTimer = setTimeout(() => {
    browserSessionPersistTimer = null;
    persistBrowserSessionNow();
  }, 150);
  browserSessionPersistTimer.unref?.();
}

function setBrowserSessionEnabled(enabled) {
  if (!browserSessionStore || browserSessionStatus.readOnly) {
    return { success: false, enabled: browserSessionEnabled, error: browserSessionStatus.warning || '本机会话恢复数据只读。' };
  }
  const snapshot = enabled
    ? (browserEngine?.getSessionSnapshot?.() || { tabs: [], activeTabId: null })
    : { tabs: [], activeTabId: null };
  const result = browserSessionStore.save({
    enabled: Boolean(enabled),
    tabs: snapshot.tabs,
    activeTabId: snapshot.activeTabId
  });
  if (!result.success) return { ...result, enabled: browserSessionEnabled };

  browserSessionEnabled = Boolean(enabled);
  browserSessionStatus = { ...result, readOnly: false, warning: null };
  if (!browserSessionEnabled && browserSessionPersistTimer) {
    clearTimeout(browserSessionPersistTimer);
    browserSessionPersistTimer = null;
  }
  return { success: true, enabled: browserSessionEnabled };
}

function sanitizeLocalBookmark(value) {
  if (!value || typeof value !== 'object') return null;
  const { id, title, url, category } = value;
  if (typeof id !== 'string' || id.length > 128 || typeof title !== 'string' || title.length > 300 ||
      typeof category !== 'string' || category.length > 100 || !isAllowedNavigation(url)) return null;
  return { id, title, url, category };
}

function sanitizeLocalHistoryItem(value) {
  if (!value || typeof value !== 'object') return null;
  const { id, tabId, title, url, visitedAt } = value;
  if (typeof id !== 'string' || id.length > 160 || typeof tabId !== 'string' || tabId.length > 80 ||
      typeof title !== 'string' || title.length > 300 || typeof visitedAt !== 'string' ||
      !Number.isFinite(Date.parse(visitedAt)) || !isAllowedNavigation(url)) return null;
  return { id, tabId, title, url, visitedAt };
}

function normalizeLocalBrowserData(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.bookmarks) || !Array.isArray(value.history)) {
    throw new TypeError('本机浏览数据格式无效。');
  }
  if (value.bookmarks.length > MAX_LOCAL_BOOKMARKS || value.history.length > MAX_LOCAL_HISTORY) {
    throw new TypeError('本机浏览数据条数超出限制。');
  }
  const bookmarks = value.bookmarks.map(sanitizeLocalBookmark);
  const history = value.history.map(sanitizeLocalHistoryItem);
  if (bookmarks.some(bookmark => !bookmark) || history.some(item => !item)) {
    throw new TypeError('本机浏览数据包含无法验证的记录。');
  }
  const data = {
    bookmarks,
    history
  };
  if (Buffer.byteLength(JSON.stringify(data), 'utf8') > MAX_LOCAL_BROWSER_DATA_BYTES) {
    throw new TypeError('本机浏览数据超出大小限制。');
  }
  return data;
}

async function readLocalBrowserData() {
  const filePath = getLocalBrowserDataPath();
  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.size > MAX_LOCAL_BROWSER_DATA_BYTES) throw new Error('本机浏览数据文件超出大小限制。');
    const stored = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
    if (stored.version !== 1) throw new Error('本机浏览数据版本无法识别。');
    const data = normalizeLocalBrowserData(stored);
    localBrowserDataReadOnly = false;
    return { initialized: true, readOnly: false, ...data };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      localBrowserDataReadOnly = false;
      return { initialized: false, readOnly: false, bookmarks: [], history: [] };
    }
    localBrowserDataReadOnly = true;
    return {
      initialized: true,
      readOnly: true,
      bookmarks: [],
      history: [],
      warning: '本机浏览数据无法读取；为避免覆盖原文件，当前会话不会写入或清空它。'
    };
  }
}

async function writeLocalBrowserData(value) {
  if (localBrowserDataReadOnly) return { success: false, error: '本机浏览数据只读，拒绝覆盖。' };
  let data;
  try {
    data = normalizeLocalBrowserData(value);
  } catch (error) {
    return { success: false, error: error.message || '本机浏览数据无效。' };
  }
  const filePath = getLocalBrowserDataPath();
  const serialized = JSON.stringify({ version: 1, ...data });
  const write = localBrowserDataWriteQueue.then(async () => {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    let handle;
    try {
      handle = await fs.promises.open(temporaryPath, 'wx', 0o600);
      await handle.writeFile(serialized, 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.promises.rename(temporaryPath, filePath);
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
      throw error;
    }
  });
  localBrowserDataWriteQueue = write.catch(() => {});
  try {
    await write;
    return { success: true };
  } catch {
    return { success: false, error: '无法将浏览数据保存到此设备。' };
  }
}

function registerBrowserIpc() {
  const handlers = {
    'browser:get-local-data': () => readLocalBrowserData(),
    'browser:save-local-data': (_event, data) => writeLocalBrowserData(data),
    'browser:get-session-state': () => ({ ...browserSessionStatus, tabs: browserSessionStatus.tabs.map(tab => ({ ...tab })) }),
    'browser:get-permission-state': () => browserPermissionManager?.getState() || { pending: [], grants: [] },
    'browser:resolve-permission-request': (_event, requestId, decision) => browserPermissionManager?.resolve(requestId, decision) || { success: false },
    'browser:revoke-permission': (_event, origin, permission) => browserPermissionManager?.revoke(origin, permission) || { success: false },
    'browser:revoke-all-permissions': () => browserPermissionManager?.revokeAll() || { success: false },
    'browser:set-session-enabled': (_event, enabled) => setBrowserSessionEnabled(Boolean(enabled)),
    'browser:restore-session': async () => {
      if (browserSessionRestoreStarted) return browserSessionRestorePromise || browserSessionRestoreResult || { success: true, tabs: [] };
      browserSessionRestoreStarted = true;
      browserSessionRestorePromise = (async () => {
        if (!browserSessionEnabled || browserSessionStatus.readOnly) {
          browserSessionRestoreResult = { success: true, activeTabId: null, tabs: [] };
          return browserSessionRestoreResult;
        }
        browserSessionRestoreResult = await browserEngine.restoreTabs(browserSessionStatus.tabs, browserSessionStatus.activeTabId);
        return browserSessionRestoreResult;
      })();
      return browserSessionRestorePromise;
    },
    'browser:get-downloads': () => browserEngine.getDownloads(),
    'browser:cancel-download': (_event, id) => browserEngine.cancelDownload(id),
    'browser:remove-download': (_event, id) => browserEngine.removeDownload(id),
    'browser:clear-download-records': () => browserEngine.clearDownloadRecords(),
    'browser:get-download-storage-status': () => browserEngine.getDownloadStorageStatus(),
    'browser:show-download-in-folder': async (_event, id) => {
      if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) return { success: false };
      const record = browserEngine.getDownloads().find(download => download.id === id);
      if (!record || !record.savePath || !path.isAbsolute(record.savePath)) {
        return { success: false, error: '下载文件不可用。' };
      }
      try {
        const stat = await fs.promises.stat(record.savePath);
        if (!stat.isFile()) return { success: false, error: '下载文件不可用。' };
        shell.showItemInFolder(record.savePath);
        return { success: true };
      } catch {
        return { success: false, error: '下载文件已不存在或无法访问。' };
      }
    },
    'browser:set-active': (_event, active) => {
      browserEngine.setActive(Boolean(active));
      browserPermissionManager?.revalidatePending();
    },
    'browser:set-bounds': (_event, bounds) => {
      browserEngine.setBounds(bounds);
      browserPermissionManager?.revalidatePending();
    },
    'browser:get-can-restore-closed-tab': () => browserEngine.canRestoreClosedTab(),
    'browser:restore-last-closed-tab': async () => {
      const result = await browserEngine.restoreLastClosedTab();
      browserPermissionManager?.revalidatePending();
      if (result.success) scheduleBrowserSessionPersist();
      return result;
    },
    'browser:reorder-tabs': (_event, tabIds) => {
      const result = browserEngine.reorderTabs(tabIds);
      if (result.success) scheduleBrowserSessionPersist();
      return result;
    },
    'browser:select-tab': (_event, tabId, url) => {
      const result = browserEngine.selectTab(tabId, url);
      browserPermissionManager?.revalidatePending();
      scheduleBrowserSessionPersist();
      return result;
    },
    'browser:close-tab': (_event, tabId) => {
      const result = browserEngine.closeTab(tabId);
      browserPermissionManager?.revalidatePending();
      scheduleBrowserSessionPersist();
      return result;
    },
    'browser:navigate': (_event, tabId, url) => {
      const result = browserEngine.navigate(tabId, url);
      browserPermissionManager?.revalidatePending();
      scheduleBrowserSessionPersist();
      return result;
    },
    'browser:back': (_event, tabId) => browserEngine.goBack(tabId),
    'browser:forward': (_event, tabId) => browserEngine.goForward(tabId),
    'browser:reload': (_event, tabId) => browserEngine.reload(tabId),
    'browser:change-zoom': (_event, action) => browserEngine.changeZoom(action),
    'browser:find-in-page': (_event, query, direction) => browserEngine.findInPage(query, direction),
    'browser:stop-find-in-page': (_event, returnFocus) => browserEngine.stopFindInPage(Boolean(returnFocus)),
    'browser:print-to-pdf': () => browserPdfExporter?.saveActiveTab() || { success: false, error: 'PDF 导出暂不可用。' }
  };

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (event, ...args) => {
      assertTrustedAppSender(event);
      return handler(event, ...args);
    });
  }
}

async function runBrowserIntegrationSmokeTest(testUrl) {
  try {
    const appContents = mainWindow.webContents;
    const maxWait = Date.now() + 15000;
    let ready = false;
    while (Date.now() < maxWait) {
      const pageReady = await appContents.executeJavaScript(`(() => {
        const viewport = document.querySelector('[data-browser-engine-viewport]');
        const rect = viewport?.getBoundingClientRect();
        return Boolean(window.earthOneBrowser && viewport && rect.width >= 2 && rect.height >= 2);
      })()`);
      if (pageReady && browserEngine.getWebContentsForTesting('tab_1')) {
        ready = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) {
      const diagnostic = await appContents.executeJavaScript(`({
        url: location.href,
        title: document.title,
        readyState: document.readyState,
        bridge: typeof window.earthOneBrowser,
        viewport: Boolean(document.querySelector('[data-browser-engine-viewport]')),
        readerModeToggle: Boolean(document.querySelector('button[aria-label="切换纯净阅读模式"]')),
        root: (document.getElementById('root')?.innerHTML || '').slice(0, 900),
        scripts: Array.from(document.scripts).map(script => script.src),
        body: (document.body?.innerText || '').slice(0, 700)
      })`);
      throw new Error(`Electron Browser 必须在首次进入时直接挂载真实 Chromium；启动超时诊断：${JSON.stringify(diagnostic)}`);
    }

    const testTabId = 'tab_1';
    const testContents = browserEngine.getWebContentsForTesting(testTabId);
    if (!testContents) throw new Error('Browser 模块未创建 Chromium 内容视图。');

    const waitForPage = async (pathname, expectedTitle) => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        if (testContents.isDestroyed()) throw new Error('Chromium 页面进程已关闭。');
        try {
          const currentUrl = new URL(testContents.getURL());
          const title = await testContents.executeJavaScript('document.title');
          if (currentUrl.pathname === pathname && title === expectedTitle && !testContents.isLoading()) return;
        } catch {
          // The renderer can be between documents during navigation.
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error(`等待本地测试页超时：${pathname}`);
    };

    const waitForTabPath = async (tabId, pathname, expectedTitle = null) => {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        const contents = browserEngine.getWebContentsForTesting(tabId);
        if (contents && !contents.isDestroyed()) {
          try {
            const currentUrl = new URL(contents.getURL());
            const title = await contents.executeJavaScript('document.title');
            if (currentUrl.pathname === pathname && (!expectedTitle || title === expectedTitle) && !contents.isLoading()) return;
          } catch {
            // The renderer can be between documents or on Chromium's load-error page.
          }
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error(`等待本地标签页失败：${tabId} ${pathname}`);
    };

    const waitForPermissionPrompt = async (permission, origin) => {
      const deadline = Date.now() + 7000;
      while (Date.now() < deadline) {
        const prompt = await appContents.executeJavaScript(`(() => {
          const element = document.querySelector('[data-browser-permission-prompt]');
          return element ? { permission: element.getAttribute('data-permission'), origin: element.getAttribute('data-origin') } : null;
        })()`);
        if (prompt?.permission === permission && prompt.origin === origin) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error(`等待 ${permission} 权限提示超时或来源错误：${origin}`);
    };

    const waitForFindStatus = async (activeMatch, totalMatches) => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const status = await appContents.executeJavaScript(`(() => {
          const element = document.querySelector('[data-browser-find-count]');
          return element ? {
            active: Number(element.getAttribute('data-active-match')),
            total: Number(element.getAttribute('data-total-matches'))
          } : null;
        })()`);
        if (status?.active === activeMatch && status.total === totalMatches) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error(`等待页内查找计数 ${activeMatch}/${totalMatches} 超时。`);
    };

    const submitAddress = targetUrl => appContents.executeJavaScript(`new Promise((resolve, reject) => {
      const input = document.querySelector('input[aria-label="输入网址或搜索词"]');
      if (!input) return reject(new Error('Browser 地址栏不存在。'));
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(targetUrl)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => {
        try { input.closest('form').requestSubmit(); resolve(true); }
        catch (error) { reject(error); }
      }, 0);
    })`);

    const waitForSessionToggle = async () => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const value = await appContents.executeJavaScript(
          `document.querySelector('[data-browser-session-toggle]')?.getAttribute('aria-pressed') || ''`
        );
        if (value === 'true' || value === 'false') return value;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('等待本机标签恢复设置初始化超时。');
    };

    if (process.env.EARTH_ONE_BROWSER_SESSION_SMOKE_TEST === '1') {
      const phase = process.env.EARTH_ONE_BROWSER_TEST_PHASE;
      const sessionPath = getBrowserSessionStorePath();
      if (phase === 'session-save') {
        await waitForTabPath(testTabId, '/session-one', 'Session Fixture One');
        const defaultToggle = await waitForSessionToggle();
        const defaultState = await appContents.executeJavaScript('window.earthOneBrowser.getSessionState()');
        if (defaultState.enabled || defaultState.tabs.length !== 0 || defaultToggle !== 'false' || fs.existsSync(sessionPath)) {
          throw new Error('启动时恢复必须默认关闭，并且不能在用户启用前写入标签快照。');
        }

        await testContents.executeJavaScript(`(() => {
          document.querySelector('#session-email').value = 'synthetic-private@example.test';
          document.querySelector('#session-password').value = 'SYNTHETIC_FORM_PASSWORD_DO_NOT_PERSIST';
        })()`);
        await appContents.executeJavaScript(`document.querySelector('[data-browser-session-toggle]').click()`);
        const enabledDeadline = Date.now() + 3000;
        let enabledState = null;
        while (Date.now() < enabledDeadline) {
          enabledState = await appContents.executeJavaScript('window.earthOneBrowser.getSessionState()');
          if (enabledState.enabled) break;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (!enabledState?.enabled) throw new Error('启用恢复设置后没有写入本机偏好。');

        const firstUrl = `${new URL(testUrl).origin}/session-one?q=stars&lang=en#synthetic-fragment`;
        const firstNavigation = await browserEngine.navigate(testTabId, firstUrl);
        if (!firstNavigation.success) throw new Error('第一个合成本机标签页未能导航。');
        await waitForTabPath(testTabId, '/session-one', 'Session Fixture One');

        const createSyntheticTab = async (url, expectedPath, expectedTitle = null) => {
          const currentIds = new Set(browserEngine.getTabIdsForTesting());
          await appContents.executeJavaScript(`document.querySelector('button[aria-label="新建标签"]').click()`);
          const tabDeadline = Date.now() + 5000;
          let tabId = null;
          while (Date.now() < tabDeadline) {
            tabId = browserEngine.getTabIdsForTesting().find(id => !currentIds.has(id)) || null;
            if (tabId) break;
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          if (!tabId) throw new Error('未能创建合成测试标签。');
          const navigation = await browserEngine.navigate(tabId, url);
          if (expectedPath !== '/session-fail' && !navigation.success) throw new Error(`合成页面导航失败：${expectedPath}`);
          if (expectedPath === '/session-fail' && navigation.success) throw new Error('失败夹具本应无法加载。');
          if (expectedPath !== '/session-fail') await waitForTabPath(tabId, expectedPath, expectedTitle);
          return tabId;
        };

        const secondTabId = await createSyntheticTab(
          `${new URL(testUrl).origin}/session-two?view=article&page=2`, '/session-two', 'Session Fixture Two'
        );
        const zoomTestContents = browserEngine.getWebContentsForTesting(secondTabId);
        zoomTestContents?.setZoomFactor(1.7);
        const preRestartZoom = zoomTestContents?.getZoomFactor();
        if (Math.round((preRestartZoom || 0) * 100) !== 170) throw new Error('会话保存前的真实 Chromium 标签缩放应可达到 170%。');
        const failedTabId = await createSyntheticTab(
          `${new URL(testUrl).origin}/session-fail?attempt=1`, '/session-fail'
        );
        const failedTabSelection = await browserEngine.selectTab(failedTabId);
        if (!failedTabSelection.success || browserEngine.getSessionSnapshot().activeTabId !== failedTabId) {
          throw new Error('保存会话前未能恢复原定的失败页活动标签。');
        }
        const expectedProfileRoot = `${path.resolve(process.env.EARTH_ONE_BROWSER_TEST_PROFILE_DIR || '')}${path.sep}`;
        const sessionDeadline = Date.now() + 5000;
        let saved = null;
        while (Date.now() < sessionDeadline) {
          if (fs.existsSync(sessionPath)) {
            saved = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            if (saved.tabs?.length === 3 && saved.tabs.some(tab => tab.id === failedTabId)) break;
          }
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (!sessionPath.startsWith(expectedProfileRoot) || !saved || saved.version !== 1 || !saved.enabled ||
            saved.tabs.length !== 3 || saved.activeTabId !== failedTabId) {
          throw new Error('启用后没有在独立 Electron userData 中保存有界的活动标签快照。');
        }
        if (saved.tabs.some(tab => Object.keys(tab).some(key => key.toLowerCase().includes('zoom')))) {
          throw new Error('标签会话快照只保存 URL 元数据，不应保存个人网页缩放设置。');
        }
        const firstSaved = saved.tabs.find(tab => tab.id === testTabId);
        const secondSaved = saved.tabs.find(tab => tab.id === secondTabId);
        const failedSaved = saved.tabs.find(tab => tab.id === failedTabId);
        if (!firstSaved || firstSaved.url !== `${new URL(testUrl).origin}/session-one?q=stars&lang=en` ||
            !secondSaved || secondSaved.url !== `${new URL(testUrl).origin}/session-two?view=article&page=2` ||
            !failedSaved || failedSaved.url !== `${new URL(testUrl).origin}/session-fail?attempt=1` ||
            saved.tabs.some(tab => !['http:', 'https:'].includes(new URL(tab.url).protocol) || tab.title !== new URL(tab.url).host)) {
          throw new Error('会话快照未保留普通查询，或包含非 HTTP(S)/非安全展示元数据。');
        }
        const sessionText = fs.readFileSync(sessionPath, 'utf8');
        for (const forbidden of ['synthetic-fragment', 'SYNTHETIC_FORM_PASSWORD_DO_NOT_PERSIST', 'synthetic-private@example.test', 'synthetic-cookie-secret', 'cookies', 'headers', 'formContents', 'networkLog']) {
          if (sessionText.includes(forbidden)) throw new Error(`会话存储不应包含 ${forbidden}。`);
        }
        if (browserBookmarkApiRequests !== 0) throw new Error('会话保存请求了服务端书签 API。');
        console.log(`BROWSER_SESSION_SAVE_READY:${process.pid}`);
        await new Promise(() => {});
      }

      if (phase === 'session-restore') {
        const sessionState = await appContents.executeJavaScript('window.earthOneBrowser.getSessionState()');
        if (!sessionState.enabled || sessionState.readOnly || sessionState.tabs.length !== 3) {
          throw new Error('第二个 Electron 进程没有安全读取三个本机会话标签。');
        }
        const firstSaved = sessionState.tabs.find(tab => new URL(tab.url).pathname === '/session-one');
        const secondSaved = sessionState.tabs.find(tab => new URL(tab.url).pathname === '/session-two');
        const failedSaved = sessionState.tabs.find(tab => new URL(tab.url).pathname === '/session-fail');
        if (!firstSaved || !secondSaved || !failedSaved) throw new Error('恢复集合未保留有效本机标签 URL。');
        await waitForTabPath(firstSaved.id, '/session-one', 'Session Fixture One');
        await waitForTabPath(secondSaved.id, '/session-two', 'Session Fixture Two');
        const restoreResult = await appContents.executeJavaScript('window.earthOneBrowser.restoreSession()');
        const failedCount = restoreResult.tabs.filter(tab => !tab.success).length;
        const restoreNoticeDeadline = Date.now() + 3000;
        let notice = '';
        while (Date.now() < restoreNoticeDeadline) {
          notice = await appContents.executeJavaScript(
            `document.querySelector('[data-browser-session-restore-notice]')?.innerText || ''`
          );
          if (notice.includes('1 个页面未能加载')) break;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (!restoreResult.success || restoreResult.tabs.length !== 3 || failedCount !== 1 ||
            browserEngine.getTabIdsForTesting().length !== 3 ||
            browserEngine.getSessionSnapshot().activeTabId !== sessionState.activeTabId ||
            !notice.includes('1 个页面未能加载') || !notice.includes('地址栏重试')) {
          throw new Error('恢复后的页面失败未被保留并明确提示，或恢复的标签/活动标签不正确。');
        }
        for (const savedTab of sessionState.tabs) {
          const restoredContents = browserEngine.getWebContentsForTesting(savedTab.id);
          if (!restoredContents || Math.round(restoredContents.getZoomFactor() * 100) !== 100) {
            throw new Error('应用重启后恢复的标签缩放必须回到 100%，不得恢复个人网页缩放设置。');
          }
        }
        const sessionText = fs.readFileSync(sessionPath, 'utf8');
        for (const forbidden of ['SYNTHETIC_FORM_PASSWORD_DO_NOT_PERSIST', 'synthetic-private@example.test', 'synthetic-cookie-secret', 'cookies', 'headers', 'formContents', 'networkLog']) {
          if (sessionText.includes(forbidden)) throw new Error(`重启恢复后的会话存储不应包含 ${forbidden}。`);
        }
        if (browserBookmarkApiRequests !== 0) throw new Error('会话恢复请求了服务端书签 API。');

        await appContents.executeJavaScript(`document.querySelector('[data-browser-session-toggle]').click()`);
        const optOutDeadline = Date.now() + 3000;
        let disabledState = null;
        while (Date.now() < optOutDeadline) {
          disabledState = await appContents.executeJavaScript('window.earthOneBrowser.getSessionState()');
          if (!disabledState.enabled) break;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        const clearedSession = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
        if (disabledState?.enabled || disabledState?.tabs.length || clearedSession.enabled || clearedSession.tabs.length) {
          throw new Error('关闭恢复设置后应立即清除已保存标签快照。');
        }
        console.log('BROWSER_SESSION_RESTORE_PASS: opt-in local URL-only restore, safe query retention/redaction, ephemeral cookies, and failed-page notice verified.');
        console.log('BROWSER_SESSION_OPTOUT_READY');
        app.quit();
        return;
      }

      if (phase === 'session-optout') {
        await waitForTabPath(testTabId, '/one', 'EARTH ONE Fixture One');
        const disabledState = await appContents.executeJavaScript('window.earthOneBrowser.getSessionState()');
        const toggle = await waitForSessionToggle();
        const tabIds = browserEngine.getTabIdsForTesting();
        const persistedState = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
        if (disabledState.enabled || disabledState.tabs.length !== 0 || toggle !== 'false' ||
            tabIds.length !== 1 || tabIds[0] !== testTabId || persistedState.enabled || persistedState.tabs.length !== 0) {
          throw new Error('关闭恢复设置后的第二次启动不应打开旧标签。');
        }
        console.log('BROWSER_SESSION_OPTOUT_PASS: disabled restore clears prior tabs and starts with one default tab.');
        app.quit();
        return;
      }
      throw new Error(`未知的 Browser session smoke 阶段：${phase}`);
    }

    const initialShortcutPhase = process.env.EARTH_ONE_BROWSER_TEST_PHASE === 'shortcuts';
    const initialZoomPhase = process.env.EARTH_ONE_BROWSER_TEST_PHASE === 'zoom';
    await waitForPage(
      initialShortcutPhase ? '/shortcuts' : initialZoomPhase ? '/zoom' : '/one',
      initialShortcutPhase ? 'Browser Keyboard Fixture' : initialZoomPhase ? 'Chromium Zoom Fixture' : 'EARTH ONE Fixture One'
    );
    const defaultChromiumDeadline = Date.now() + 5000;
    let defaultChromiumReady = false;
    while (Date.now() < defaultChromiumDeadline) {
      const bounds = browserEngine.getViewBoundsForTesting(testTabId);
      const viewportVisible = await appContents.executeJavaScript(`(() => {
        const viewport = document.querySelector('[data-browser-engine-viewport]');
        const rect = viewport?.getBoundingClientRect();
        return Boolean(viewport && rect.width >= 2 && rect.height >= 2);
      })()`);
      if (viewportVisible && browserEngine.isActiveTab(testTabId) && bounds?.width >= 2 &&
          bounds?.height >= 2 && testContents.isFocused()) {
        defaultChromiumReady = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!defaultChromiumReady) throw new Error('Electron Browser 首次进入时没有默认显示并聚焦 Chromium 页面。');

    if (process.env.EARTH_ONE_BROWSER_TEST_PHASE === 'zoom') {
      const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
      const waitForTabCount = async count => {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          if (browserEngine.getTabIdsForTesting().length === count) return;
          await delay(40);
        }
        throw new Error(`缩放 smoke 标签数量错误：期待 ${count}，实际 ${browserEngine.getTabIdsForTesting().length}。`);
      };
      const waitForUiTabCount = async count => {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const actual = await appContents.executeJavaScript(`document.querySelectorAll('[role="tablist"] [role="tab"]').length`);
          if (actual === count) return;
          await delay(40);
        }
        throw new Error(`缩放 smoke 标签栏未同步到 ${count} 个标签。`);
      };
      const waitForActiveTab = async tabId => {
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          const contents = browserEngine.getWebContentsForTesting(tabId);
          if (browserEngine.getSessionSnapshot().activeTabId === tabId && browserEngine.isActiveTab(tabId) && contents?.isFocused()) return;
          await delay(30);
        }
        throw new Error(`缩放 smoke 未切换并聚焦到标签 ${tabId}。`);
      };
      const waitForZoomUi = async percent => {
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          const text = await appContents.executeJavaScript(`document.querySelector('[data-browser-zoom-reset]')?.textContent?.trim() || ''`);
          if (text === `${percent}%`) return;
          await delay(40);
        }
        throw new Error(`缩放工具栏没有显示活动页 ${percent}%。`);
      };
      const clickZoomControl = async (selector, percent) => {
        const clicked = await appContents.executeJavaScript(`(() => {
          const button = document.querySelector(${JSON.stringify(selector)});
          if (!button || button.disabled) return false;
          button.click();
          return true;
        })()`);
        if (!clicked) throw new Error(`缩放控件不可用：${selector}`);
        const activeId = browserEngine.getSessionSnapshot().activeTabId;
        const contents = browserEngine.getWebContentsForTesting(activeId);
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline && Math.round(contents.getZoomFactor() * 100) !== percent) await delay(30);
        if (Math.round(contents.getZoomFactor() * 100) !== percent) throw new Error(`工具栏操作未将页面缩放到 ${percent}%。`);
        await waitForZoomUi(percent);
      };
      const sendBrowserShortcut = async (keyCode, modifiers = ['control']) => {
        const tabId = browserEngine.getSessionSnapshot().activeTabId;
        const contents = browserEngine.getWebContentsForTesting(tabId);
        await waitForActiveTab(tabId);
        contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
        if (keyCode !== 'W') contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
        await delay(80);
      };
      const sendAppShortcut = async (keyCode, modifiers = ['control']) => {
        appContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
        appContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
        await delay(80);
      };
      const assertRealZoomScale = async (contents, percent, baselineDpr, context) => {
        const actualPercent = Math.round(contents.getZoomFactor() * 100);
        const devicePixelRatio = await contents.executeJavaScript('window.devicePixelRatio');
        const scaleRatio = devicePixelRatio / baselineDpr;
        if (actualPercent !== percent || Math.abs(scaleRatio - percent / 100) > 0.08) {
          throw new Error(`${context} 没有产生真实 Chromium 页面缩放：${JSON.stringify({ actualPercent, percent, baselineDpr, devicePixelRatio, scaleRatio })}`);
        }
      };
      const waitForTabPath = async (tabId, pathname, title) => {
        const deadline = Date.now() + 10000;
        let lastSeen = null;
        while (Date.now() < deadline) {
          const contents = browserEngine.getWebContentsForTesting(tabId);
          if (contents && !contents.isDestroyed()) {
            try {
              const page = new URL(contents.getURL());
              const pageTitle = await contents.executeJavaScript('document.title');
              lastSeen = { url: contents.getURL(), title: pageTitle, loading: contents.isLoading() };
              if (page.pathname === pathname && pageTitle === title && !contents.isLoading()) return;
            } catch {}
          }
          await delay(40);
        }
        throw new Error(`缩放 smoke 页面未加载：${tabId} ${pathname}；当前状态 ${JSON.stringify(lastSeen)}`);
      };

      const firstDpr = await testContents.executeJavaScript('window.devicePixelRatio');
      if (Math.round(testContents.getZoomFactor() * 100) !== 100 || !await appContents.executeJavaScript(`Boolean(document.querySelector('[data-browser-zoom]'))`)) {
        throw new Error('桌面 Chromium 应显示 100% 缩放控件并以默认比例启动。');
      }
      await waitForZoomUi(100);
      await clickZoomControl('[data-browser-zoom-in]', 110);
      await assertRealZoomScale(testContents, 110, firstDpr, '工具栏加号');
      await clickZoomControl('[data-browser-zoom-out]', 100);
      await clickZoomControl('[data-browser-zoom-in]', 110);
      await clickZoomControl('[data-browser-zoom-in]', 120);
      await clickZoomControl('[data-browser-zoom-reset]', 100);
      testContents.focus();
      await sendBrowserShortcut('=', ['control', 'shift']);
      await assertRealZoomScale(testContents, 110, firstDpr, 'Ctrl+Plus');
      await waitForZoomUi(110);
      await sendBrowserShortcut('-', ['meta']);
      await assertRealZoomScale(testContents, 100, firstDpr, 'Cmd+Minus');
      await sendBrowserShortcut('=', ['control', 'shift']);
      await sendBrowserShortcut('0', ['control']);
      await assertRealZoomScale(testContents, 100, firstDpr, 'Ctrl+0');

      await clickZoomControl('[data-browser-zoom-in]', 110);
      await clickZoomControl('[data-browser-zoom-in]', 120);
      mainWindow.webContents.focus();
      const addressFocused = await appContents.executeJavaScript(`(() => {
        const input = document.querySelector('input[aria-label="输入网址或搜索词"]');
        input?.focus();
        return Boolean(input && document.activeElement === input);
      })()`);
      if (!addressFocused) throw new Error('无法聚焦 EARTH ONE 地址栏进行缩放排除测试。');
      await sendAppShortcut('=', ['control', 'shift']);
      await sendAppShortcut('0', ['control']);
      const addressZoomState = {
        zoomPercent: Math.round(testContents.getZoomFactor() * 100),
        addressFocused: await appContents.executeJavaScript(`document.activeElement === document.querySelector('input[aria-label="输入网址或搜索词"]')`)
      };
      if (addressZoomState.zoomPercent !== 120 || !addressZoomState.addressFocused) {
        throw new Error(`地址栏焦点期间不得将缩放快捷键路由到远程网页：${JSON.stringify(addressZoomState)}`);
      }
      mainWindow.webContents.focus();
      await appContents.executeJavaScript(`document.querySelector('button[aria-label="在当前网页中查找"]')?.click()`);
      const findDeadline = Date.now() + 3000;
      let findFocused = false;
      while (Date.now() < findDeadline) {
        findFocused = await appContents.executeJavaScript(`document.activeElement === document.querySelector('[data-browser-find-input]')`);
        if (findFocused) break;
        await delay(30);
      }
      if (!findFocused) throw new Error('无法聚焦 EARTH ONE 页内查找输入框。');
      await sendAppShortcut('=', ['control', 'shift']);
      await sendAppShortcut('0', ['control']);
      if (Math.round(testContents.getZoomFactor() * 100) !== 120 || !await appContents.executeJavaScript(`document.activeElement === document.querySelector('[data-browser-find-input]')`)) {
        throw new Error('页内查找焦点期间不得将缩放快捷键路由到远程网页。');
      }
      await appContents.executeJavaScript(`document.querySelector('button[aria-label="关闭页内查找"]')?.click()`);
      await clickZoomControl('[data-browser-zoom-reset]', 100);

      const readerToggle = `document.querySelector('button[aria-label="切换纯净阅读模式"]')`;
      await appContents.executeJavaScript(`(${readerToggle})?.click()`);
      const readerDeadline = Date.now() + 3000;
      while (Date.now() < readerDeadline && browserEngine.isActiveTab(testTabId)) await delay(30);
      if (browserEngine.isActiveTab(testTabId) || await appContents.executeJavaScript(`Boolean(document.querySelector('[data-browser-zoom]'))`)) {
        throw new Error('Reader Mode 必须隐藏 Chromium 缩放控件并停用原生页。');
      }
      mainWindow.webContents.focus();
      await sendAppShortcut('=', ['control', 'shift']);
      await sendAppShortcut('0', ['control']);
      if (Math.round(testContents.getZoomFactor() * 100) !== 100) throw new Error('Reader Mode 中的 EARTH ONE 快捷键不得缩放隐藏的 Chromium 页面。');
      await appContents.executeJavaScript(`(${readerToggle})?.click()`);
      const restoreDeadline = Date.now() + 3000;
      while (Date.now() < restoreDeadline && !browserEngine.isActiveTab(testTabId)) await delay(30);
      if (!browserEngine.isActiveTab(testTabId)) throw new Error('Reader Mode 退出后没有恢复原生 Chromium 标签。');
      await waitForZoomUi(100);

      await clickZoomControl('[data-browser-zoom-in]', 110);
      await sendBrowserShortcut('T');
      await waitForTabCount(2);
      await waitForUiTabCount(2);
      const secondTabId = browserEngine.getSessionSnapshot().activeTabId;
      const secondContents = browserEngine.getWebContentsForTesting(secondTabId);
      await waitForTabPath(secondTabId, '/shortcuts-default', 'Safe Default Fixture');
      const secondDpr = await secondContents.executeJavaScript('window.devicePixelRatio');
      if (Math.round(secondContents.getZoomFactor() * 100) !== 100) throw new Error('同源新标签没有从独立 100% 缩放开始。');
      await waitForZoomUi(100);
      await sendBrowserShortcut('=', ['control', 'shift']);
      await sendBrowserShortcut('=', ['control', 'shift']);
      await assertRealZoomScale(secondContents, 120, secondDpr, '同源第二标签');
      await sendBrowserShortcut('1');
      await waitForActiveTab(testTabId);
      await assertRealZoomScale(testContents, 110, firstDpr, '切回同源第一标签');
      await waitForZoomUi(110);
      await sendBrowserShortcut('2');
      await waitForActiveTab(secondTabId);
      await assertRealZoomScale(secondContents, 120, secondDpr, '切回同源第二标签');
      await waitForZoomUi(120);

      const alternateUrl = process.env.EARTH_ONE_BROWSER_TEST_ALT_URL;
      if (!alternateUrl) throw new Error('跨来源缩放 smoke 缺少本机备用来源。');
      const crossUrl = `${new URL(alternateUrl).origin}/zoom`;
      if (new URL(crossUrl).origin === new URL(testUrl).origin) throw new Error('跨来源测试必须使用另一独立本机 origin。');
      const crossOpen = await browserEngine.openNewTab(crossUrl);
      if (!crossOpen.success || !crossOpen.tabId) throw new Error(`跨来源测试标签创建失败：${crossOpen.error || '未知错误'}`);
      const crossTabId = crossOpen.tabId;
      const crossContents = browserEngine.getWebContentsForTesting(crossTabId);
      await waitForTabCount(3);
      await waitForUiTabCount(3);
      await waitForTabPath(crossTabId, '/zoom', 'Chromium Zoom Fixture');
      const crossDpr = await crossContents.executeJavaScript('window.devicePixelRatio');
      if (Math.round(crossContents.getZoomFactor() * 100) !== 100) throw new Error('跨来源新标签没有从独立 100% 缩放开始。');
      await waitForZoomUi(100);
      await sendBrowserShortcut('=', ['control', 'shift']);
      await assertRealZoomScale(crossContents, 110, crossDpr, '跨来源标签');
      await sendBrowserShortcut('0', ['control']);
      await assertRealZoomScale(crossContents, 100, crossDpr, '跨来源标签重置');
      const remoteCapabilities = await crossContents.executeJavaScript(`({ bridge: typeof window.earthOneBrowser, require: typeof require, zoomShortcuts: window.__earthOneShortcutEvents.length })`);
      if (remoteCapabilities.bridge !== 'undefined' || remoteCapabilities.require !== 'undefined' || remoteCapabilities.zoomShortcuts !== 0) {
        throw new Error(`远程跨来源页面不应获得桥接、Node 或缩放快捷键：${JSON.stringify(remoteCapabilities)}`);
      }
      await sendBrowserShortcut('1');
      await waitForActiveTab(testTabId);
      await assertRealZoomScale(testContents, 110, firstDpr, '跨来源切回第一标签');
      await sendBrowserShortcut('2');
      await waitForActiveTab(secondTabId);
      await assertRealZoomScale(secondContents, 120, secondDpr, '跨来源切回第二标签');
      browserEngine.closeTab(crossTabId);
      await waitForTabCount(2);
      await waitForUiTabCount(2);

      browserEngine.closeTab(secondTabId);
      await waitForTabCount(1);
      await waitForUiTabCount(1);
      await waitForActiveTab(testTabId);
      const lastReset = browserEngine.changeZoom('reset');
      const lastZoom = browserEngine.changeZoom('in');
      if (lastReset.zoomPercent !== 100 || lastZoom.zoomPercent !== 110) {
        throw new Error(`末标签缩放设置失败：${JSON.stringify({ lastReset, lastZoom })}`);
      }
      await waitForZoomUi(110);
      await sendBrowserShortcut('W');
      await waitForTabPath(testTabId, '/shortcuts-default', 'Safe Default Fixture');
      if (Math.round(testContents.getZoomFactor() * 100) !== 110) throw new Error('安全替换最后一个标签时应保留当前应用会话中的 110% 缩放。');
      console.log('BROWSER_ZOOM_SMOKE_PASS: real Electron scaling, toolbar, trusted Ctrl/Cmd +/-/0, app-input and Reader exclusions, per-tab same-origin restoration, cross-origin isolation, remote bridge isolation, and last-tab retention verified.');
      app.quit();
      return;
    }

    if (process.env.EARTH_ONE_BROWSER_TEST_PHASE === 'shortcuts') {
      const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
      const waitForTabCount = async count => {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          if (browserEngine.getTabIdsForTesting().length === count) return;
          await delay(40);
        }
        throw new Error(`快捷键创建/关闭标签数量不正确；期待 ${count}，实际为 ${browserEngine.getTabIdsForTesting().length}，活动标签 ${browserEngine.getSessionSnapshot().activeTabId || '无'}。`);
      };
      const waitForUiTabCount = async count => {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const actual = await appContents.executeJavaScript(`document.querySelectorAll('[role="tablist"] [role="tab"]').length`);
          if (actual === count) return;
          await delay(40);
        }
        throw new Error(`快捷键关闭后 EARTH ONE 标签栏未同步到 ${count} 个标签。`);
      };
      const waitForUiActiveTab = async tabId => {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const selectedId = await appContents.executeJavaScript(`Array.from(document.querySelectorAll('[data-browser-tab-id]')).find(element => element.querySelector('[role="tab"]')?.getAttribute('aria-selected') === 'true')?.getAttribute('data-browser-tab-id') || ''`);
          if (selectedId === tabId) return;
          await delay(40);
        }
        throw new Error(`EARTH ONE 标签栏没有同步选中 Chromium 活动标签 ${tabId}。`);
      };
      const waitForActiveTab = async tabId => {
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          const contents = browserEngine.getWebContentsForTesting(tabId);
          if (browserEngine.getSessionSnapshot().activeTabId === tabId && browserEngine.isActiveTab(tabId) && contents?.isFocused()) return;
          await delay(30);
        }
        throw new Error(`快捷键未切换并聚焦到标签 ${tabId}。`);
      };
      const sendBrowserShortcut = async (keyCode, modifiers = ['control']) => {
        const tabId = browserEngine.getSessionSnapshot().activeTabId;
        const contents = browserEngine.getWebContentsForTesting(tabId);
        if (!contents || contents.isDestroyed()) throw new Error('快捷键前没有可用的活动 Chromium 页面。');
        await waitForActiveTab(tabId);
        contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
        if (keyCode !== 'W') contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
        await delay(80);
      };
      const sendAppShortcut = async keyCode => {
        appContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers: ['control'] });
        appContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers: ['control'] });
        await delay(80);
      };
      const waitForTabOrder = async expected => {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const engineOrder = browserEngine.getTabIdsForTesting();
          const uiOrder = await appContents.executeJavaScript(`Array.from(document.querySelectorAll('[data-browser-tab-id]')).map(element => element.getAttribute('data-browser-tab-id'))`);
          if (JSON.stringify(engineOrder) === JSON.stringify(expected) && JSON.stringify(uiOrder) === JSON.stringify(expected)) return;
          await delay(40);
        }
        throw new Error(`Browser 可见标签顺序与主进程不一致；期待 ${JSON.stringify(expected)}，主进程 ${JSON.stringify(browserEngine.getTabIdsForTesting())}。`);
      };
      const dragTab = async (sourceId, targetId) => {
        const beforeOrder = browserEngine.getTabIdsForTesting();
        const fromIndex = beforeOrder.indexOf(sourceId);
        const toIndex = beforeOrder.indexOf(targetId);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) throw new Error('真实 Electron 拖拽标签 ID 无效。');
        const expectedOrder = [...beforeOrder];
        const [movedTab] = expectedOrder.splice(fromIndex, 1);
        expectedOrder.splice(toIndex, 0, movedTab);
        const points = await appContents.executeJavaScript(`(() => {
          const pointFor = id => {
            const element = Array.from(document.querySelectorAll('[data-browser-tab-id]')).find(item => item.getAttribute('data-browser-tab-id') === id);
            if (!element) return null;
            const rect = element.getBoundingClientRect();
            return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
          };
          return { source: pointFor(${JSON.stringify(sourceId)}), target: pointFor(${JSON.stringify(targetId)}) };
        })()`);
        if (!points?.source || !points?.target) throw new Error('无法定位真实 Electron 标签栏拖拽目标。');
        mainWindow.webContents.focus();
        if (process.env.DISPLAY) {
          const contentBounds = mainWindow.getContentBounds();
          const sx = contentBounds.x + points.source.x;
          const sy = contentBounds.y + points.source.y;
          const tx = contentBounds.x + points.target.x;
          const ty = contentBounds.y + points.target.y;
          spawnSync('xdotool', [
            'mousemove', '--sync', String(sx), String(sy),
            'mousedown', '1', 'sleep', '0.2',
            'mousemove', '--sync', String(Math.round((sx + tx) / 2)), String(Math.round((sy + ty) / 2)),
            'mousemove', '--sync', String(tx), String(ty), 'sleep', '0.2', 'mouseup', '1'
          ], { encoding: 'utf8', timeout: 5000 });
        } else {
          appContents.sendInputEvent({ type: 'mouseMove', x: points.source.x, y: points.source.y });
          appContents.sendInputEvent({ type: 'mouseDown', x: points.source.x, y: points.source.y, button: 'left', clickCount: 1 });
          for (let step = 1; step <= 8; step += 1) {
            const x = Math.round(points.source.x + (points.target.x - points.source.x) * step / 8);
            const y = Math.round(points.source.y + (points.target.y - points.source.y) * step / 8);
            appContents.sendInputEvent({ type: 'mouseMove', x, y, movementX: x - points.source.x, movementY: y - points.source.y });
            await delay(25);
          }
          await delay(120);
          appContents.sendInputEvent({ type: 'mouseUp', x: points.target.x, y: points.target.y, button: 'left', clickCount: 1 });
        }
        await delay(300);
        let rendererEventFallback = false;
        if (JSON.stringify(browserEngine.getTabIdsForTesting()) !== JSON.stringify(expectedOrder)) {
          rendererEventFallback = true;
          await appContents.executeJavaScript(`(() => {
            const items = Array.from(document.querySelectorAll('[data-browser-tab-id]'));
            const source = items.find(item => item.getAttribute('data-browser-tab-id') === ${JSON.stringify(sourceId)});
            const target = items.find(item => item.getAttribute('data-browser-tab-id') === ${JSON.stringify(targetId)});
            if (!source || !target) return false;
            const dataTransfer = new DataTransfer();
            const dispatch = (element, type) => element.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }));
            dispatch(source, 'dragstart');
            dispatch(target, 'dragenter');
            dispatch(target, 'dragover');
            dispatch(target, 'drop');
            dispatch(source, 'dragend');
            return true;
          })()`);
        }
        await waitForTabOrder(expectedOrder);
        return rendererEventFallback ? 'electron-renderer-drag-event' : (process.env.DISPLAY ? 'xdotool-system-mouse' : 'electron-sendInputEvent');
      };
      const waitForRestoreButton = async enabled => {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const disabled = await appContents.executeJavaScript(`Boolean(document.querySelector('button[aria-label="恢复最近关闭的标签页"]')?.disabled)`);
          if (disabled === !enabled) return;
          await delay(40);
        }
        throw new Error(`恢复最近关闭标签按钮状态错误，期待 ${enabled ? '可用' : '禁用'}。`);
      };

      await waitForPage('/shortcuts', 'Browser Keyboard Fixture');
      mainWindow.webContents.focus();
      const addressFocusState = await appContents.executeJavaScript(`(() => {
        const input = document.querySelector('input[aria-label="输入网址或搜索词"]');
        input?.focus();
        return Boolean(input && document.activeElement === input);
      })()`);
      if (!addressFocusState) throw new Error('快捷键烟测无法聚焦 EARTH ONE 地址栏。');
      await sendAppShortcut('F');
      await sendAppShortcut('T');
      const ownedInputState = await appContents.executeJavaScript(`({
        addressFocused: document.activeElement === document.querySelector('input[aria-label="输入网址或搜索词"]'),
        findOpen: Boolean(document.querySelector('[data-browser-find-input]'))
      })`);
      if (!ownedInputState.addressFocused || ownedInputState.findOpen || browserEngine.getTabIdsForTesting().length !== 1) {
        throw new Error(`EARTH ONE 自有地址栏输入期间不应拦截 Ctrl+F/T：${JSON.stringify(ownedInputState)}`);
      }

      const readerToggle = `document.querySelector('button[aria-label="切换纯净阅读模式"]')`;
      await appContents.executeJavaScript(`(${readerToggle})?.click()`);
      const readerDeadline = Date.now() + 3000;
      while (Date.now() < readerDeadline && browserEngine.isActiveTab(testTabId)) await delay(30);
      if (browserEngine.isActiveTab(testTabId)) throw new Error('Reader Mode 没有停用 Chromium 快捷键目标。');
      mainWindow.webContents.focus();
      await appContents.executeJavaScript('document.activeElement?.blur(); document.body.focus();');
      await sendAppShortcut('F');
      const readerFindOpen = await appContents.executeJavaScript(`Boolean(document.querySelector('[data-browser-find-input]'))`);
      if (readerFindOpen || browserEngine.getTabIdsForTesting().length !== 1) {
        throw new Error('Reader Mode 中 Ctrl+F 不得打开 Chromium 查找或修改标签。');
      }
      await appContents.executeJavaScript(`(${readerToggle})?.click()`);
      const restoreDeadline = Date.now() + 3000;
      while (Date.now() < restoreDeadline && !browserEngine.isActiveTab(testTabId)) await delay(30);
      const initialContents = browserEngine.getWebContentsForTesting(testTabId);
      if (!browserEngine.isActiveTab(testTabId) || !initialContents?.isFocused()) {
        throw new Error('Reader Mode 退出后未恢复原 Chromium 页焦点。');
      }

      await sendBrowserShortcut('T');
      await waitForTabCount(2);
      let activeId = browserEngine.getSessionSnapshot().activeTabId;
      if (activeId === testTabId) throw new Error('Ctrl+T 没有选中新标签。');
      await waitForTabPath(activeId, '/shortcuts-default', 'Safe Default Fixture');
      await waitForActiveTab(activeId);
      await sendBrowserShortcut('T');
      await waitForTabCount(3);
      await waitForUiTabCount(3);
      const thirdTabId = browserEngine.getSessionSnapshot().activeTabId;
      await waitForUiActiveTab(thirdTabId);
      await waitForTabPath(thirdTabId, '/shortcuts-default', 'Safe Default Fixture');
      const originalThreeTabOrder = browserEngine.getTabIdsForTesting();
      const firstDragPath = await dragTab(originalThreeTabOrder[0], originalThreeTabOrder[2]);
      const draggedOrder = [originalThreeTabOrder[1], originalThreeTabOrder[2], originalThreeTabOrder[0]];
      await waitForTabOrder(draggedOrder);
      if (browserEngine.getSessionSnapshot().activeTabId !== thirdTabId) throw new Error('拖拽排序不得改变活动标签或其 Chromium 焦点。');
      const forgedReorder = await appContents.executeJavaScript(`window.earthOneBrowser.reorderTabs(["tab_forged"])`);
      if (forgedReorder.success !== false) throw new Error('主进程必须拒绝包含未签发标签 ID 的重排请求。');
      const secondDragPath = await dragTab(originalThreeTabOrder[0], originalThreeTabOrder[1]);
      await waitForTabOrder(originalThreeTabOrder);
      console.log(`BROWSER_TAB_DRAG_INPUT: ${firstDragPath}, ${secondDragPath}`);
      const activeAfterDrag = browserEngine.getSessionSnapshot().activeTabId;
      browserEngine.getWebContentsForTesting(activeAfterDrag)?.focus();
      await waitForActiveTab(activeAfterDrag);

      await sendBrowserShortcut('3');
      await waitForActiveTab(thirdTabId);
      const safeRestoreUrl = `${new URL(testUrl).origin}/shortcuts-default?topic=space#private-fragment`;
      await submitAddress(safeRestoreUrl);
      await waitForTabPath(thirdTabId, '/shortcuts-default', 'Safe Default Fixture');
      await sendBrowserShortcut('W');
      await waitForTabCount(2);
      await waitForUiTabCount(2);
      await waitForActiveTab(browserEngine.getSessionSnapshot().activeTabId);
      await waitForRestoreButton(true);
      await sendBrowserShortcut('T', ['control', 'shift']);
      await waitForTabCount(3);
      await waitForUiTabCount(3);
      const keyboardRestoredId = browserEngine.getSessionSnapshot().activeTabId;
      if (!keyboardRestoredId || originalThreeTabOrder.includes(keyboardRestoredId)) throw new Error('恢复标签必须使用新的主进程标签身份。');
      await waitForTabPath(keyboardRestoredId, '/shortcuts-default', 'Safe Default Fixture');
      const keyboardRestoredUrl = new URL(browserEngine.getWebContentsForTesting(keyboardRestoredId).getURL());
      if (keyboardRestoredUrl.searchParams.get('topic') !== 'space' || keyboardRestoredUrl.hash) {
        throw new Error(`恢复标签必须保留普通查询并移除片段：${keyboardRestoredUrl.href}`);
      }
      await waitForRestoreButton(false);
      await sendBrowserShortcut('T', ['control', 'shift']);
      await delay(120);
      if (browserEngine.getTabIdsForTesting().length !== 3) throw new Error('一次性关闭快照不得通过连续恢复快捷键重复创建标签。');

      await sendBrowserShortcut('W');
      await waitForTabCount(2);
      await waitForUiTabCount(2);
      await waitForRestoreButton(true);
      const restoreButtonClicked = await appContents.executeJavaScript(`(() => {
        const button = document.querySelector('button[aria-label="恢复最近关闭的标签页"]');
        if (!button || button.disabled) return false;
        button.click();
        return true;
      })()`);
      if (!restoreButtonClicked) throw new Error('显式恢复关闭标签按钮没有可用。');
      await waitForTabCount(3);
      await waitForUiTabCount(3);
      const toolbarRestoredId = browserEngine.getSessionSnapshot().activeTabId;
      await waitForUiActiveTab(toolbarRestoredId);
      await waitForTabPath(toolbarRestoredId, '/shortcuts-default', 'Safe Default Fixture');
      await waitForRestoreButton(false);

      const sensitiveNavigation = await browserEngine.navigate(toolbarRestoredId, `${new URL(testUrl).origin}/shortcuts-default?access_token=synthetic-secret`);
      if (!sensitiveNavigation.success) throw new Error(`敏感 URL 合成页导航失败：${sensitiveNavigation.error || '未知错误'}`);
      await waitForTabPath(toolbarRestoredId, '/shortcuts-default', 'Safe Default Fixture');
      const sensitiveClose = browserEngine.closeTab(toolbarRestoredId);
      if (!sensitiveClose.success || !sensitiveClose.closed) throw new Error('主进程未能安全关闭含敏感查询的合成标签。');
      await waitForTabCount(2);
      await waitForUiTabCount(2);
      const safeAfterSensitiveClose = browserEngine.getSessionSnapshot();
      if (browserEngine.canRestoreClosedTab() || safeAfterSensitiveClose.tabs.some(tab => tab.url.includes('synthetic-secret'))) {
        throw new Error('含 access_token 的 URL 不得进入标签恢复快照或会话 URL。');
      }
      await waitForRestoreButton(false);
      await waitForActiveTab(browserEngine.getSessionSnapshot().activeTabId);
      await sendBrowserShortcut('T', ['control', 'shift']);
      await delay(120);
      if (browserEngine.getTabIdsForTesting().length !== 2) throw new Error('敏感 URL 关闭后不得被恢复快捷键重新打开。');

      const forgedClose = await appContents.executeJavaScript(`window.earthOneBrowser.closeTab("tab_forged")`);
      if (forgedClose.success !== false || browserEngine.getTabIdsForTesting().length !== 2) {
        throw new Error('主进程必须拒绝关闭不属于当前标签集合的伪造 ID。');
      }
      const remoteAttempt = await browserEngine.getWebContentsForTesting('tab_1').executeJavaScript(`({
        bridge: typeof window.earthOneBrowser,
        require: typeof require,
        call: window.earthOneBrowser?.closeTab('tab_1') ?? 'unavailable'
      })`);
      if (remoteAttempt.bridge !== 'undefined' || remoteAttempt.require !== 'undefined' || remoteAttempt.call !== 'unavailable' ||
          browserEngine.getTabIdsForTesting().length !== 2) {
        throw new Error(`远程合成页面不应能经 IPC 选择或关闭任意标签：${JSON.stringify(remoteAttempt)}`);
      }

      while (browserEngine.getTabIdsForTesting().length < 9) {
        const targetCount = browserEngine.getTabIdsForTesting().length + 1;
        await sendBrowserShortcut('T');
        await waitForTabCount(targetCount);
        activeId = browserEngine.getSessionSnapshot().activeTabId;
        await waitForTabPath(activeId, '/shortcuts-default', 'Safe Default Fixture');
        await waitForActiveTab(activeId);
      }

      const tabIds = browserEngine.getTabIdsForTesting();
      for (let index = 0; index < 8; index += 1) {
        await sendBrowserShortcut(String(index + 1));
        await waitForActiveTab(tabIds[index]);
      }
      await sendBrowserShortcut('9');
      await waitForActiveTab(tabIds.at(-1));
      await sendBrowserShortcut('TAB');
      await waitForActiveTab(tabIds[0]);
      await sendBrowserShortcut('TAB', ['control', 'shift']);
      await waitForActiveTab(tabIds.at(-1));
      await sendBrowserShortcut('2', ['meta']);
      await waitForActiveTab(tabIds[1]);
      await sendBrowserShortcut('T', ['meta']);
      await waitForTabCount(10);
      const metaCreatedTabId = browserEngine.getSessionSnapshot().activeTabId;
      await waitForTabPath(metaCreatedTabId, '/shortcuts-default', 'Safe Default Fixture');
      await sendBrowserShortcut('W', ['meta']);
      await waitForTabCount(9);
      await waitForActiveTab(tabIds[0]);
      await waitForUiTabCount(9);

      for (const tabId of browserEngine.getTabIdsForTesting()) {
        const contents = browserEngine.getWebContentsForTesting(tabId);
        const capabilities = await contents.executeJavaScript(`({
          bridge: typeof window.earthOneBrowser,
          require: typeof require,
          keys: window.__earthOneShortcutEvents.length
        })`);
        if (capabilities.bridge !== 'undefined' || capabilities.require !== 'undefined' || capabilities.keys !== 0) {
          throw new Error(`Chromium 合成页不应收到 Browser 快捷键、preload 或 Node：${JSON.stringify({ tabId, capabilities })}`);
        }
      }

      const selectedContents = browserEngine.getWebContentsForTesting(tabIds[0]);
      const priorBounds = browserEngine.getViewBoundsForTesting(tabIds[0]);
      browserEngine.setActive(false);
      selectedContents.sendInputEvent({ type: 'keyDown', keyCode: 'T', modifiers: ['control'] });
      selectedContents.sendInputEvent({ type: 'keyUp', keyCode: 'T', modifiers: ['control'] });
      await delay(120);
      if (browserEngine.getTabIdsForTesting().length !== 9) throw new Error('非 Browser 活动状态不应响应 Ctrl+T。');
      browserEngine.setActive(true);
      browserEngine.setBounds(priorBounds);
      const activeAfterRestore = browserEngine.getSessionSnapshot().activeTabId;
      const activeContentsAfterRestore = browserEngine.getWebContentsForTesting(activeAfterRestore);
      if (!activeAfterRestore || !activeContentsAfterRestore) throw new Error('恢复 Browser 活动状态后没有当前标签。');
      activeContentsAfterRestore.focus();
      await waitForActiveTab(activeAfterRestore);

      while (browserEngine.getTabIdsForTesting().length > 2) {
        const activeIdToClose = browserEngine.getSessionSnapshot().activeTabId;
        const targetCount = browserEngine.getTabIdsForTesting().length - 1;
        const closeResult = browserEngine.closeTab(activeIdToClose);
        if (!closeResult.success || !closeResult.closed) throw new Error('快捷键 smoke 清理合成标签失败。');
        await waitForTabCount(targetCount);
        await waitForUiTabCount(targetCount);
        if (targetCount > 1) await waitForActiveTab(browserEngine.getSessionSnapshot().activeTabId);
      }
      await sendBrowserShortcut('W');
      await waitForTabCount(1);
      await waitForUiTabCount(1);
      await waitForActiveTab(browserEngine.getSessionSnapshot().activeTabId);
      const lastTabId = browserEngine.getSessionSnapshot().activeTabId;
      if (!lastTabId) throw new Error('关闭到最后一个标签时没有保留 Browser 标签。');
      await sendBrowserShortcut('W');
      await waitForTabCount(1);
      await waitForTabPath(lastTabId, '/shortcuts-default', 'Safe Default Fixture');
      const lastContents = browserEngine.getWebContentsForTesting(lastTabId);
      if (browserEngine.getSessionSnapshot().activeTabId !== lastTabId || BrowserWindow.getAllWindows().length !== 1 ||
          !lastContents?.isFocused()) {
        throw new Error('关闭最后一个标签必须将它替换为安全默认页，且不得关闭应用窗口。');
      }
      await sendBrowserShortcut('W');
      await waitForTabCount(1);
      await waitForTabPath(lastTabId, '/shortcuts-default', 'Safe Default Fixture');
      console.log('BROWSER_SHORTCUTS_SMOKE_PASS: Electron tab drag/reorder, toolbar and Ctrl/Cmd+Shift+T restore, trusted Ctrl/Cmd+T/W/Tab/1-9, active-tab focus/UI synchronization, input/Reader/inactive exclusions, sensitive-URL omission, safe last-tab replacement, and remote no-preload/no-Node/no-tab-control isolation verified.');
      app.quit();
      return;
    }

    const readerModeToggle = `document.querySelector('button[aria-label="切换纯净阅读模式"]')`;
    const toggleReaderMode = async () => {
      const clicked = await appContents.executeJavaScript(`(() => {
        const button = ${readerModeToggle};
        if (!button) return false;
        button.click();
        return true;
      })()`);
      if (!clicked) throw new Error('Electron Browser 的纯净阅读模式切换按钮不存在。');
    };
    await toggleReaderMode();
    const readerModeDeadline = Date.now() + 5000;
    let readerModeHiddenEngine = false;
    while (Date.now() < readerModeDeadline) {
      const viewportMounted = await appContents.executeJavaScript(`Boolean(document.querySelector('[data-browser-engine-viewport]'))`);
      if (!viewportMounted && !browserEngine.isActiveTab(testTabId)) {
        readerModeHiddenEngine = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!readerModeHiddenEngine) throw new Error('切换纯净阅读模式后，Chromium viewport 仍处于显示/活动状态。');

    await toggleReaderMode();
    const restoreChromiumDeadline = Date.now() + 5000;
    let restoredChromium = false;
    while (Date.now() < restoreChromiumDeadline) {
      const bounds = browserEngine.getViewBoundsForTesting(testTabId);
      const viewportVisible = await appContents.executeJavaScript(`(() => {
        const viewport = document.querySelector('[data-browser-engine-viewport]');
        const rect = viewport?.getBoundingClientRect();
        return Boolean(viewport && rect.width >= 2 && rect.height >= 2);
      })()`);
      if (viewportVisible && browserEngine.isActiveTab(testTabId) && bounds?.width >= 2 &&
          bounds?.height >= 2 && testContents.isFocused()) {
        restoredChromium = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!restoredChromium) throw new Error('关闭纯净阅读模式后，原 Chromium 页面未能重新显示并取得焦点。');
    console.log('BROWSER_READER_MODE_SMOKE_PASS: Electron opens in focused Chromium, Reader Mode hides the native view, and switching back restores the same focused page.');
    await waitForPage('/one', 'EARTH ONE Fixture One');

    const untrustedWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true
      }
    });
    try {
      await untrustedWindow.loadURL(`${new URL(testUrl).origin}/one`);
      const unauthorizedResults = await untrustedWindow.webContents.executeJavaScript(`Promise.all([
        window.earthOneBrowser.findInPage('EARTHONE_FIND_FIXTURE', 'new').then(() => false, () => true),
        window.earthOneBrowser.stopFindInPage().then(() => false, () => true),
        window.earthOneBrowser.printToPdf().then(() => false, () => true),
        window.earthOneBrowser.getPermissionState().then(() => false, () => true),
        window.earthOneBrowser.resolvePermissionRequest('forged-request', 'allow').then(() => false, () => true),
        window.earthOneBrowser.revokePermission('https://example.test', 'notifications').then(() => false, () => true),
        window.earthOneBrowser.revokeAllPermissions().then(() => false, () => true)
      ])`);
      if (!Array.isArray(unauthorizedResults) || unauthorizedResults.some(rejected => rejected !== true)) {
        throw new Error('非应用 WebContents 的查找和站点权限 IPC 调用必须被拒绝。');
      }
      const subframeBridge = await untrustedWindow.webContents.executeJavaScript(`new Promise(resolve => {
        const frame = document.createElement('iframe');
        frame.src = location.href;
        frame.onload = () => resolve(typeof frame.contentWindow.earthOneBrowser);
        document.body.appendChild(frame);
      })`);
      if (subframeBridge !== 'undefined') throw new Error('子框架不得获得 EARTH ONE preload 权限 bridge。');
    } finally {
      if (!untrustedWindow.isDestroyed()) untrustedWindow.destroy();
    }

    const remoteCapabilities = await testContents.executeJavaScript(`({
      bridge: typeof window.earthOneBrowser,
      require: typeof require,
      findBridge: typeof window.earthOneBrowser?.findInPage
    })`);
    if (remoteCapabilities.bridge !== 'undefined' || remoteCapabilities.require !== 'undefined' || remoteCapabilities.findBridge !== 'undefined') {
      throw new Error('远程合成页面不得获得 EARTH ONE preload 或 Node require。');
    }

    const fixtureOrigin = new URL(testUrl).origin;
    await submitAddress(`${fixtureOrigin}/popup-test`);
    await waitForPage('/popup-test', 'Popup Source Fixture');
    const clickSyntheticElement = async selector => {
      const point = await testContents.executeJavaScript(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
      })()`);
      if (!point) throw new Error(`Popup 合成页缺少点击目标：${selector}`);
      testContents.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 });
      testContents.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 });
      await new Promise(resolve => setTimeout(resolve, 100));
    };
    const tabCountBeforeBlockedPopups = browserEngine.getTabIdsForTesting().length;
    const confirmationsBeforeNoGesture = browserPopupSmokeConfirmationCount;
    const noGesturePopupOutcome = await testContents.executeJavaScript(`(() => {
      try {
        const popup = window.open(${JSON.stringify(`${fixtureOrigin}/popup-target?source=no-gesture`)}, '_blank');
        return { returnedNull: popup === null, handleClosed: popup ? popup.closed : null };
      } catch (error) { return { threw: String(error) }; }
    })()`);
    const nativeWindowCountAfterNoGesture = BrowserWindow.getAllWindows().length;
    if (browserEngine.getTabIdsForTesting().length !== tabCountBeforeBlockedPopups || nativeWindowCountAfterNoGesture !== 1 ||
        browserPopupSmokeConfirmationCount !== confirmationsBeforeNoGesture + 1) {
      throw new Error(`无手势 window.open 未被安全拦截：${JSON.stringify({ noGesturePopupOutcome, tabs: browserEngine.getTabIdsForTesting().length, nativeWindows: nativeWindowCountAfterNoGesture })}`);
    }

    const unsafePopupUrls = [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:text/html,<h1>blocked</h1>',
      'ftp://example.test/file',
      `http://user:pass@127.0.0.1:${new URL(testUrl).port}/popup-target`,
      'http://[invalid'
    ];
    await testContents.executeJavaScript(`(() => {
      ${JSON.stringify(unsafePopupUrls)}.forEach((url, index) => {
        const button = document.createElement('button');
        button.id = 'unsafe-popup-' + index;
        button.textContent = 'Open unsafe synthetic target ' + index;
        button.onclick = () => { try { window.open(url, '_blank'); } catch {} };
        document.body.appendChild(button);
      });
    })()`);
    for (let index = 0; index < unsafePopupUrls.length; index += 1) {
      await clickSyntheticElement(`#unsafe-popup-${index}`);
    }
    if (browserEngine.getTabIdsForTesting().length !== tabCountBeforeBlockedPopups || BrowserWindow.getAllWindows().length !== 1) {
      throw new Error('javascript:/file:/data:/非 HTTP(S)/凭据及无效 origin 弹窗必须全部拒绝。');
    }

    await testContents.executeJavaScript(`(() => {
      const button = document.createElement('button');
      button.id = 'app-route-popup';
      button.textContent = 'Open synthetic EARTH ONE route';
      button.onclick = () => { window.__appRoutePopupResult = window.open(${JSON.stringify(`${appOrigin}/?module=library`)}, '_blank'); };
      document.body.appendChild(button);
    })()`);
    await clickSyntheticElement('#app-route-popup');
    await new Promise(resolve => setTimeout(resolve, 50));
    const currentAppRoute = new URL(mainWindow.webContents.getURL());
    if (currentAppRoute.origin !== appOrigin || currentAppRoute.searchParams.get('module') !== 'browser' ||
        browserEngine.getTabIdsForTesting().length !== tabCountBeforeBlockedPopups ||
        BrowserWindow.getAllWindows().length !== 1 ||
        browserFixtureRequestAudit.some(request => request.origin === appOrigin)) {
      throw new Error('远程 popup 不得进入 EARTH ONE 自身路由，也不得改变主窗口模块。');
    }

    const confirmationsBeforeScriptPopup = browserPopupSmokeConfirmationCount;
    browserPopupTestDecision = 'approve';
    await clickSyntheticElement('#script-popup');
    browserPopupTestDecision = 'deny';
    if (browserPopupSmokeConfirmationCount !== confirmationsBeforeScriptPopup + 1) {
      throw new Error('用户点击 window.open 必须进入应用确认分支。');
    }
    let scriptPopupTabId = null;
    const scriptPopupDeadline = Date.now() + 10000;
    while (Date.now() < scriptPopupDeadline) {
      const snapshot = browserEngine.getSessionSnapshot();
      const ids = browserEngine.getTabIdsForTesting();
      if (ids.length === tabCountBeforeBlockedPopups + 1 && snapshot.activeTabId && snapshot.activeTabId !== testTabId) {
        scriptPopupTabId = snapshot.activeTabId;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!scriptPopupTabId) throw new Error('用户实际点击触发的 window.open 在 smoke 确认通过后没有成为新活动标签。');
    await waitForTabPath(scriptPopupTabId, '/popup-target', 'Popup Target Fixture');
    const scriptPopupContents = browserEngine.getWebContentsForTesting(scriptPopupTabId);
    const scriptPopupFocusDeadline = Date.now() + 3000;
    while (Date.now() < scriptPopupFocusDeadline && !scriptPopupContents.isFocused()) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const scriptPopupIsolation = await scriptPopupContents.executeJavaScript(`({
      openerIsAbsent: window.opener === null || typeof window.opener === 'undefined',
      requireType: typeof require,
      bridgeType: typeof window.earthOneBrowser
    })`);
    if (!scriptPopupIsolation.openerIsAbsent || scriptPopupIsolation.requireType !== 'undefined' ||
        scriptPopupIsolation.bridgeType !== 'undefined' || scriptPopupContents.session !== testContents.session ||
        !scriptPopupContents.isFocused()) {
      throw new Error('新标签必须无 opener/Node/preload，使用相同隔离 Browser session，并获得页面焦点。');
    }
    const selectedUiDeadline = Date.now() + 5000;
    let selectedUiTab = '';
    while (Date.now() < selectedUiDeadline && selectedUiTab !== '切换到Popup Target Fixture') {
      selectedUiTab = await appContents.executeJavaScript(`(() => {
        const selected = document.querySelector('[role="tab"][aria-selected="true"]');
        return selected?.getAttribute('aria-label') || '';
      })()`);
      if (selectedUiTab !== '切换到Popup Target Fixture') await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (selectedUiTab !== '切换到Popup Target Fixture') throw new Error('popup 新标签没有同步到 EARTH ONE 标签栏并取得活动焦点。');

    await appContents.executeJavaScript(`document.querySelector('button[aria-label="切换到Popup Source Fixture"]')?.click()`);
    const sourceFocusDeadline = Date.now() + 5000;
    let sourceReady = false;
    while (Date.now() < sourceFocusDeadline) {
      const bounds = browserEngine.getViewBoundsForTesting(testTabId);
      if (browserEngine.isActiveTab(testTabId) && bounds?.width >= 2 && bounds?.height >= 2 && testContents.isFocused()) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const settledBounds = browserEngine.getViewBoundsForTesting(testTabId);
        if (browserEngine.isActiveTab(testTabId) && settledBounds?.width >= 2 && settledBounds?.height >= 2 && testContents.isFocused()) {
          sourceReady = true;
          break;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!sourceReady || browserEngine.getSessionSnapshot().activeTabId !== testTabId) {
      throw new Error('来源标签未能恢复活动状态、视口边界和 WebContents 焦点。');
    }
    const confirmationsBeforeAnchor = browserPopupSmokeConfirmationCount;
    browserPopupTestDecision = 'approve';
    await clickSyntheticElement('#popup-link');
    browserPopupTestDecision = 'deny';
    if (browserPopupSmokeConfirmationCount !== confirmationsBeforeAnchor + 1) {
      const anchorDiagnostics = await testContents.executeJavaScript(`({
        clicked: window.__popupLinkClicks || 0,
        clickTrusted: window.__popupLinkTrusted,
        target: document.querySelector('#popup-link')?.target || '',
        href: document.querySelector('#popup-link')?.href || '',
        currentUrl: location.href
      })`);
      throw new Error(`用户点击 target=_blank 必须进入应用确认分支：${JSON.stringify({ anchorDiagnostics, confirmationsBeforeAnchor, confirmationsAfter: browserPopupSmokeConfirmationCount, tabs: browserEngine.getTabIdsForTesting(), activeTabId: browserEngine.getSessionSnapshot().activeTabId, sourceActive: browserEngine.isActiveTab(testTabId), sourceFocused: testContents.isFocused() })}`);
    }
    let anchorPopupTabId = null;
    const anchorPopupDeadline = Date.now() + 10000;
    while (Date.now() < anchorPopupDeadline) {
      const snapshot = browserEngine.getSessionSnapshot();
      const ids = browserEngine.getTabIdsForTesting();
      if (ids.length === tabCountBeforeBlockedPopups + 2 && snapshot.activeTabId && snapshot.activeTabId !== testTabId) {
        anchorPopupTabId = snapshot.activeTabId;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!anchorPopupTabId) throw new Error('用户点击的 target=_blank 链接未直接打开 EARTH ONE 前台标签。');
    await waitForTabPath(anchorPopupTabId, '/popup-target', 'Popup Target Fixture');
    const anchorContents = browserEngine.getWebContentsForTesting(anchorPopupTabId);
    const anchorFocusDeadline = Date.now() + 3000;
    while (Date.now() < anchorFocusDeadline && (!browserEngine.isActiveTab(anchorPopupTabId) || !anchorContents.isFocused())) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const anchorPopupUrl = new URL(anchorContents.getURL());
    if (anchorPopupUrl.searchParams.get('source') !== 'anchor' ||
        !browserEngine.isActiveTab(anchorPopupTabId) || !anchorContents.isFocused()) {
      throw new Error(`target=_blank 目标或焦点状态不正确：${JSON.stringify({ url: anchorPopupUrl.href, active: browserEngine.isActiveTab(anchorPopupTabId), focused: anchorContents.isFocused(), activeTabId: browserEngine.getSessionSnapshot().activeTabId })}`);
    }

    const anchorUiDeadline = Date.now() + 5000;
    let anchorUiState = null;
    while (Date.now() < anchorUiDeadline) {
      anchorUiState = await appContents.executeJavaScript(`(() => {
        const selected = document.querySelector('[role="tab"][aria-selected="true"]');
        return {
          count: document.querySelectorAll('[role="tab"]').length,
          selected: selected?.getAttribute('aria-label') || ''
        };
      })()`);
      if (anchorUiState.count === tabCountBeforeBlockedPopups + 2 &&
          anchorUiState.selected === '切换到Popup Target Fixture') break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (anchorUiState?.count !== tabCountBeforeBlockedPopups + 2 ||
        anchorUiState.selected !== '切换到Popup Target Fixture') {
      throw new Error(`target=_blank popup 未在关闭前同步到标签栏：${JSON.stringify(anchorUiState)}`);
    }

    const popupCloseDeadline = Date.now() + 10000;
    while (Date.now() < popupCloseDeadline && browserEngine.getTabIdsForTesting().length !== 1) {
      await appContents.executeJavaScript(`document.querySelector('button[aria-label="关闭Popup Target Fixture标签"]')?.click()`);
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    const returnToSourceDeadline = Date.now() + 5000;
    while (Date.now() < returnToSourceDeadline && browserEngine.getSessionSnapshot().activeTabId !== testTabId) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (browserEngine.getTabIdsForTesting().length !== 1 || browserEngine.getSessionSnapshot().activeTabId !== testTabId) {
      const uiTabs = await appContents.executeJavaScript(`(() => ({
        selected: document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('aria-label') || '',
        tabs: [...document.querySelectorAll('[role="tab"]')].map(tab => ({ label: tab.getAttribute('aria-label'), selected: tab.getAttribute('aria-selected') }))
      }))()`);
      throw new Error(`关闭合成 popup 标签后应回到原始 Browser 标签：${JSON.stringify({ engineTabs: browserEngine.getTabIdsForTesting(), activeTabId: browserEngine.getSessionSnapshot().activeTabId, expectedTabId: testTabId, sourceFocused: testContents.isFocused(), uiTabs })}`);
    }
    console.log('BROWSER_POPUP_SMOKE_PASS: user-initiated window.open confirmation, no-gesture prompt-and-deny, target=_blank foreground tab, dangerous/invalid targets, app-route boundary, active-tab focus, same Browser session, no opener/Node/preload, and tab-strip sync verified.');

    await submitAddress(`${new URL(testUrl).origin}/find`);
    await waitForPage('/find', 'EARTH ONE Find Fixture');
    testContents.focus();
    await new Promise(resolve => setTimeout(resolve, 100));
    testContents.sendInputEvent({ type: 'keyDown', keyCode: 'F', modifiers: ['control'] });
    testContents.sendInputEvent({ type: 'keyUp', keyCode: 'F', modifiers: ['control'] });
    const findFocusDeadline = Date.now() + 3000;
    let findFocused = false;
    while (Date.now() < findFocusDeadline) {
      findFocused = await appContents.executeJavaScript(`(() => {
        const input = document.querySelector('[data-browser-find-input]');
        return Boolean(input && document.activeElement === input);
      })()`);
      if (findFocused) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!findFocused) throw new Error('远程网页中的 Ctrl+F 未聚焦 EARTH ONE 页内查找框。');
    const pageSawShortcut = await testContents.executeJavaScript('window.__earthOneSawControlFind');
    if (pageSawShortcut) throw new Error('Ctrl+F 不应继续交给远程网页处理。');

    await appContents.executeJavaScript(`(() => {
      const input = document.querySelector('[data-browser-find-input]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'EARTHONE_FIND_FIXTURE');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitForFindStatus(1, 3);
    await appContents.executeJavaScript(`document.querySelector('[data-browser-find-next]').click()`);
    await waitForFindStatus(2, 3);
    await appContents.executeJavaScript(`document.querySelector('[data-browser-find-previous]').click()`);
    await waitForFindStatus(1, 3);
    await appContents.executeJavaScript(`document.querySelector('button[aria-label="关闭页内查找"]').click()`);
    const findCloseDeadline = Date.now() + 3000;
    let findClosed = false;
    while (Date.now() < findCloseDeadline) {
      findClosed = !(await appContents.executeJavaScript(`Boolean(document.querySelector('[data-browser-find-input]'))`));
      if (findClosed) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!findClosed || !testContents.isFocused()) throw new Error('关闭页内查找后应清除界面并将焦点返回 Chromium 页面。');
    const selectionAfterClear = await testContents.executeJavaScript('window.getSelection()?.toString() || ""');
    if (selectionAfterClear.includes('EARTHONE_FIND_FIXTURE')) throw new Error('关闭页内查找后不应保留文本选择高亮。');
    console.log('BROWSER_FIND_SMOKE_PASS: remote Ctrl+F routing, three synthetic matches, next/previous navigation, clear, focus return, no remote preload, and unrelated IPC rejection verified.');
    await submitAddress(`${new URL(testUrl).origin}/one`);
    await waitForPage('/one', 'EARTH ONE Fixture One');

    const defaultSessionToggle = await waitForSessionToggle();

    if (process.env.EARTH_ONE_BROWSER_PRINT_SMOKE_TEST === '1') {
      const printFixtureOrigin = new URL(testUrl).origin;
      await submitAddress(`${printFixtureOrigin}/print`);
      await waitForPage('/print', 'Local Print Fixture');
      await new Promise(resolve => setTimeout(resolve, 150));
      const printButtonDeadline = Date.now() + 5000;
      let printButtonReady = false;
      while (Date.now() < printButtonDeadline) {
        printButtonReady = await appContents.executeJavaScript(`(() => {
          const button = document.querySelector('[data-browser-print]');
          return Boolean(button && !button.disabled);
        })()`);
        if (printButtonReady) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!printButtonReady) throw new Error('已加载的活动 Chromium 标签必须显示可用的保存 PDF 操作。');

      const fixtureRequestsBeforePrint = browserFixtureRequestAudit.length;
      const apiRequestsBeforePrint = browserBookmarkApiRequests;
      const waitForPrintStatus = async expected => {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const status = await appContents.executeJavaScript(
            `document.querySelector('[data-browser-print-status]')?.innerText || ''`
          );
          if (status.includes(expected)) return status;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw new Error(`保存 PDF 状态提示超时：${expected}`);
      };

      await appContents.executeJavaScript(`document.querySelector('[data-browser-print]').click()`);
      await waitForPrintStatus('已取消保存 PDF');
      if (browserPrintSmokeDialogCalls !== 1 || fs.existsSync(browserPrintSmokePath)) {
        throw new Error('取消系统保存对话框后不得生成或写入 PDF。');
      }

      const enabledAgainDeadline = Date.now() + 3000;
      let enabledAgain = false;
      while (Date.now() < enabledAgainDeadline) {
        enabledAgain = await appContents.executeJavaScript(
          `Boolean(document.querySelector('[data-browser-print]') && !document.querySelector('[data-browser-print]').disabled)`
        );
        if (enabledAgain) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!enabledAgain) throw new Error('取消后 PDF 工具栏操作应恢复可用。');
      await appContents.executeJavaScript(`document.querySelector('[data-browser-print]').click()`);
      const savedStatus = await waitForPrintStatus('PDF 已保存');
      if (browserPrintSmokeDialogCalls !== 2 || !fs.existsSync(browserPrintSmokePath) ||
          savedStatus.includes(browserPrintSmokePath)) {
        throw new Error('成功导出应写入测试所选的本机路径，且不得将保存路径回传给 renderer。');
      }
      const generatedPdf = fs.readFileSync(browserPrintSmokePath);
      if (generatedPdf.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('Chromium printToPDF 输出缺少 PDF 文件头。');
      const pageTree = generatedPdf.toString('latin1').match(/\/Type\s*\/Pages\b[\s\S]{0,256}?\/Count\s+(\d+)/);
      if (Number(pageTree?.[1]) !== 2) throw new Error(`本地双页夹具的 PDF 页数不正确：${pageTree?.[1] || '未找到页面树'}`);
      if (browserFixtureRequestAudit.length !== fixtureRequestsBeforePrint || browserBookmarkApiRequests !== apiRequestsBeforePrint) {
        throw new Error('PDF 生成期间不得触发网页网络请求或书签服务器 API。');
      }
      console.log('BROWSER_PRINT_SMOKE_PASS: visible active Chromium only, native-dialog cancellation, local two-page PDF header/page tree, renderer receives no path, untrusted app origin rejected, and no network/API requests during export.');
    }

    const defaultSessionState = await appContents.executeJavaScript('window.earthOneBrowser.getSessionState()');
    if (defaultSessionState.enabled || defaultSessionState.tabs.length !== 0 || defaultSessionToggle !== 'false') {
      throw new Error('未启用设置时应维持单个默认浏览器标签，不恢复任何旧标签。');
    }

    if (process.env.EARTH_ONE_BROWSER_TEST_PHASE === 'restart') {
      const restartedPermissionState = browserPermissionManager.getState();
      if (restartedPermissionState.pending.length || restartedPermissionState.grants.length ||
          fs.existsSync(path.join(app.getPath('userData'), 'earth-one-browser-permissions.json'))) {
        throw new Error('Electron 重启后必须清空内存授权，并且不得从磁盘恢复站点权限。');
      }
      console.log('BROWSER_PERMISSION_RESTART_RESET_PASS: a fresh Electron process has no previous site grants.');
      const afterRestartNotification = testContents.executeJavaScript('Notification.requestPermission()');
      await waitForPermissionPrompt('notifications', new URL(testUrl).origin);
      const deniedAfterRestart = await appContents.executeJavaScript(`(() => {
        const button = document.querySelector('[data-browser-permission-deny]');
        if (!button) return false;
        button.click();
        return true;
      })()`);
      if (!deniedAfterRestart || await afterRestartNotification !== 'denied') {
        throw new Error('重启后的合成页面必须重新显示权限提示，且拒绝后不得沿用旧授权。');
      }
      console.log('BROWSER_PERMISSION_SMOKE_PASS: restarted process prompted again and denied the new synthetic request.');

      const restoredDownloads = browserEngine.getDownloads();
      const restoredCompleted = restoredDownloads.find(record => record.filename === 'earth-one-fixture.txt');
      const restoredInterrupted = restoredDownloads.find(record => record.filename === 'earth-one-interrupted.txt');
      const expectedDownload = path.join(testDownloadDir, 'earth-one-fixture.txt');
      const expectedInterruptedDownload = path.join(testDownloadDir, 'earth-one-interrupted.txt');
      if (!restoredCompleted || restoredCompleted.state !== 'completed' || !restoredCompleted.fileAvailable ||
          restoredCompleted.savePath !== expectedDownload || restoredCompleted.source !== new URL('/download', testUrl).href) {
        throw new Error('第二个 Electron 进程未恢复完成记录，或没有按真实文件存在状态重新验证文件。');
      }
      if (!restoredInterrupted || restoredInterrupted.state !== 'interrupted' ||
          restoredInterrupted.savePath !== expectedInterruptedDownload ||
          restoredInterrupted.source !== new URL('/slow-download', testUrl).href) {
        throw new Error('第二个 Electron 进程未将重启前进行中的下载恢复为“已中断”。');
      }

      await appContents.executeJavaScript(`document.querySelector('button[aria-label^="打开下载管理器"]').click()`);
      const panelDeadline = Date.now() + 5000;
      let panelText = '';
      while (Date.now() < panelDeadline) {
        panelText = await appContents.executeJavaScript(
          `document.querySelector('[data-browser-download-manager]')?.innerText || ''`
        );
        if (panelText.includes('earth-one-fixture.txt') && panelText.includes('earth-one-interrupted.txt') &&
            panelText.includes('已完成') && panelText.includes('已中断')) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const folderControlVisible = await appContents.executeJavaScript(
        `Boolean(document.querySelector('button[aria-label="在文件夹中显示 earth-one-fixture.txt"]'))`
      );
      if (!panelText.includes('earth-one-fixture.txt') || !panelText.includes('earth-one-interrupted.txt') ||
          !panelText.includes('已完成') || !panelText.includes('已中断') || !folderControlVisible) {
        throw new Error('重启后的下载管理器未显示恢复的完成/中断状态，或可用文件控制缺失。');
      }

      await appContents.executeJavaScript(
        `document.querySelector('button[aria-label="从列表移除下载 earth-one-fixture.txt"]').click()`
      );
      const removalDeadline = Date.now() + 3000;
      let completedRemoved = false;
      while (Date.now() < removalDeadline) {
        completedRemoved = !browserEngine.getDownloads().some(record => record.id === restoredCompleted.id);
        if (completedRemoved) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const afterRemoveStore = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'earth-one-downloads.json'), 'utf8'));
      if (!completedRemoved || afterRemoveStore.records.some(record => record.id === restoredCompleted.id) ||
          !fs.existsSync(expectedDownload) || fs.readFileSync(expectedDownload, 'utf8') !== 'EARTH ONE local download fixture\n' ||
          !afterRemoveStore.records.some(record => record.id === restoredInterrupted.id && record.state === 'interrupted')) {
        throw new Error('跨进程恢复后移除下载记录必须保留文件，并继续保留已中断记录。');
      }
      await appContents.executeJavaScript(`document.querySelector('button[aria-label="关闭下载管理器"]').click()`);
      console.log('BROWSER_SMOKE_PASS: completed download recovery across Electron processes, file-presence revalidation, list-only removal preserving the file, and interrupted-download recovery verified.');
      app.quit();
      return;
    }

    const invalidNavigation = await appContents.executeJavaScript(
      `window.earthOneBrowser.navigate(${JSON.stringify(testTabId)}, 'javascript:alert(1)')`
    );
    if (invalidNavigation.success) throw new Error('javascript: 地址没有被拒绝。');

    const fileNavigation = await appContents.executeJavaScript(
      `window.earthOneBrowser.navigate(${JSON.stringify(testTabId)}, 'file:///etc/passwd')`
    );
    if (fileNavigation.success) throw new Error('file: 地址没有被拒绝。');

    const secondUrl = new URL('/two', testUrl).href;
    await appContents.executeJavaScript(`(() => {
      window.__earthOnePreviewFetchCount = 0;
      const originalFetch = window.fetch.bind(window);
      window.fetch = (input, ...args) => {
        if (String(input).includes('/api/browser/fetch-preview')) window.__earthOnePreviewFetchCount += 1;
        return originalFetch(input, ...args);
      };
    })()`);
    await appContents.executeJavaScript(`new Promise((resolve, reject) => {
      const input = document.querySelector('input[aria-label="输入网址或搜索词"]');
      if (!input) return reject(new Error('Browser 地址栏不存在。'));
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(secondUrl)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => {
        try { input.closest('form').requestSubmit(); resolve(true); }
        catch (error) { reject(error); }
      }, 0);
    })`);
    await waitForPage('/two', 'EARTH ONE Fixture Two');
    const previewFetchCount = await appContents.executeJavaScript('window.__earthOnePreviewFetchCount');
    if (previewFetchCount !== 0) throw new Error('桌面 Chromium 模式不应把网址发送到服务器 fetch-preview。');

    await appContents.executeJavaScript(
      `window.earthOneBrowser.goBack(${JSON.stringify(testTabId)})`
    );
    await waitForPage('/one', 'EARTH ONE Fixture One');

    await testContents.executeJavaScript(`document.querySelector('a')?.click()`);
    await waitForPage('/two', 'EARTH ONE Fixture Two');
    const readLocalBrowserData = () => appContents.executeJavaScript('window.earthOneBrowser.getLocalData()');
    const historyDeadline = Date.now() + 5000;
    let beforeReloadData = null;
    while (Date.now() < historyDeadline) {
      beforeReloadData = await readLocalBrowserData();
      const paths = new Set((beforeReloadData.history || []).map(item => new URL(item.url).pathname));
      if (paths.has('/one') && paths.has('/two')) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!beforeReloadData?.history?.some(item => new URL(item.url).pathname === '/one') ||
        !beforeReloadData.history.some(item => new URL(item.url).pathname === '/two')) {
      throw new Error('本地浏览历史未记录合成页面导航。');
    }
    if (browserBookmarkApiRequests !== 0) throw new Error('浏览器启动期间请求了服务端书签 API。');

    await appContents.executeJavaScript(`document.querySelector('button[aria-label="收藏当前页面"]').click()`);
    const expectedBookmarkUrl = new URL('/two', testUrl).href;
    const bookmarkDeadline = Date.now() + 3000;
    let bookmarkSaved = false;
    while (Date.now() < bookmarkDeadline) {
      const data = await readLocalBrowserData();
      bookmarkSaved = Boolean(data.bookmarks?.some(item => item.url === expectedBookmarkUrl));
      if (bookmarkSaved) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!bookmarkSaved) throw new Error('收藏操作没有写入本机书签。');
    if (browserBookmarkApiRequests !== 0) throw new Error('收藏操作请求了服务端书签 API。');
    const expectedProfileRoot = `${path.resolve(process.env.EARTH_ONE_BROWSER_TEST_PROFILE_DIR || '')}${path.sep}`;
    const localDataPath = getLocalBrowserDataPath();
    if (!localDataPath.startsWith(expectedProfileRoot) || !fs.existsSync(localDataPath)) {
      throw new Error('本机浏览数据没有写入隔离的 Electron 用户数据目录。');
    }
    const diskData = JSON.parse(fs.readFileSync(localDataPath, 'utf8'));
    if (diskData.version !== 1 || !diskData.bookmarks?.some(item => item.url === new URL('/two', testUrl).href)) {
      throw new Error('本机浏览数据文件没有持久化本次收藏。');
    }

    testContents.focus();
    await new Promise(resolve => setTimeout(resolve, 100));
    testContents.sendInputEvent({ type: 'keyDown', keyCode: 'L', modifiers: ['control'] });
    testContents.sendInputEvent({ type: 'keyUp', keyCode: 'L', modifiers: ['control'] });
    const addressBarDeadline = Date.now() + 3000;
    let addressBarFocused = false;
    while (Date.now() < addressBarDeadline) {
      const focusState = await appContents.executeJavaScript(`(() => {
        const input = document.querySelector('input[aria-label="输入网址或搜索词"]');
        return input ? {
          focused: document.activeElement === input,
          selected: input.selectionStart === 0 && input.selectionEnd === input.value.length,
          value: input.value
        } : null;
      })()`);
      if (focusState?.focused && focusState.selected && focusState.value === testContents.getURL()) {
        addressBarFocused = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!addressBarFocused) throw new Error('Ctrl+L 未能聚焦 EARTH ONE 地址栏并选中完整网址。');

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('EARTH ONE 页面重载超时。')), 15000);
      appContents.once('did-finish-load', () => { clearTimeout(timeout); resolve(); });
      appContents.reload();
    });
    const persistenceDeadline = Date.now() + 5000;
    let persistedData = null;
    while (Date.now() < persistenceDeadline) {
      persistedData = await readLocalBrowserData();
      if (persistedData.bookmarks?.some(item => item.url === new URL('/two', testUrl).href) &&
          persistedData.history?.some(item => new URL(item.url).pathname === '/one') &&
          persistedData.history?.some(item => new URL(item.url).pathname === '/two')) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!persistedData?.bookmarks?.some(item => item.url === new URL('/two', testUrl).href) ||
        !persistedData.history?.some(item => new URL(item.url).pathname === '/one') ||
        !persistedData.history.some(item => new URL(item.url).pathname === '/two')) {
      throw new Error('应用页面重载后，本机书签或浏览历史没有保留。');
    }

    await appContents.executeJavaScript(`window.confirm = () => true;
      document.querySelector('button[aria-label="打开本地浏览数据"]').click();`);
    const localDataDialog = await appContents.executeJavaScript(`document.querySelector('[role="dialog"][aria-label="本地浏览数据"]')?.innerText || ''`);
    if (!localDataDialog.includes('只保存在此设备') || !localDataDialog.includes('清空书签') || !localDataDialog.includes('清空历史')) {
      throw new Error('本地浏览数据面板缺少隐私说明或可见清除控件。');
    }
    await appContents.executeJavaScript(`document.querySelector('button[aria-label="清空本地浏览历史"]').click()`);
    const historyClearDeadline = Date.now() + 3000;
    let clearedHistory = null;
    while (Date.now() < historyClearDeadline) {
      clearedHistory = await readLocalBrowserData();
      if (Array.isArray(clearedHistory.history) && clearedHistory.history.length === 0) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!Array.isArray(clearedHistory?.history) || clearedHistory.history.length !== 0 || !clearedHistory.bookmarks?.length) {
      throw new Error('清空浏览历史未生效，或错误影响了本机书签。');
    }
    await appContents.executeJavaScript(`document.querySelector('button[aria-label="清空本地书签"]').click()`);
    const bookmarksClearDeadline = Date.now() + 3000;
    let clearedBookmarks = null;
    while (Date.now() < bookmarksClearDeadline) {
      clearedBookmarks = await readLocalBrowserData();
      if (Array.isArray(clearedBookmarks.bookmarks) && clearedBookmarks.bookmarks.length === 0) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!Array.isArray(clearedBookmarks?.bookmarks) || clearedBookmarks.bookmarks.length !== 0 ||
        !Array.isArray(clearedBookmarks.history) || clearedBookmarks.history.length !== 0) {
      throw new Error('清空本机书签未生效，或错误影响了浏览历史。');
    }
    if (browserBookmarkApiRequests !== 0) throw new Error('本地记录操作请求了服务端书签 API。');
    await appContents.executeJavaScript(`document.querySelector('button[aria-label="关闭本地浏览数据"]').click()`);

    const permissionOriginA = new URL(testContents.getURL()).origin;
    const permissionOriginB = new URL(process.env.EARTH_ONE_BROWSER_TEST_ALT_URL).origin;
    const initialPermissionState = browserPermissionManager.getState();
    if (initialPermissionState.pending.length || initialPermissionState.grants.length) {
      throw new Error('每个 EARTH ONE 进程必须从无授权、无待决请求的权限默认状态开始。');
    }
    const permissionStorePath = path.join(app.getPath('userData'), 'earth-one-browser-permissions.json');
    if (fs.existsSync(permissionStorePath)) throw new Error('权限不应写入任何持久化权限文件。');
    if (process.env.EARTH_ONE_BROWSER_TEST_PHASE === 'restart') {
      console.log('BROWSER_PERMISSION_RESTART_RESET_PASS: a fresh Electron process has no prior session grants.');
    }

    const clickPermissionDecision = async decision => {
      const clicked = await appContents.executeJavaScript(`(() => {
        const button = document.querySelector('[data-browser-permission-${decision}]');
        if (!button) return false;
        button.click();
        return true;
      })()`);
      if (!clicked) throw new Error(`站点权限提示缺少 ${decision} 决策按钮。`);
    };
    const notificationRequest = () => testContents.executeJavaScript('Notification.requestPermission()');

    const deniedGeolocation = testContents.executeJavaScript(`new Promise(resolve => navigator.geolocation.getCurrentPosition(
      () => resolve('position'), error => resolve(error.code), { timeout: 20000 }
    ))`);
    await waitForPermissionPrompt('geolocation', permissionOriginA);
    await clickPermissionDecision('deny');
    const deniedGeolocationResult = await deniedGeolocation;
    const permissionStateAfterDeny = browserPermissionManager.getState();
    if (deniedGeolocationResult !== 1 || permissionStateAfterDeny.grants.length !== 0) {
      throw new Error(`明确拒绝的定位请求应得到拒绝结果且不得留下会话授权：${JSON.stringify({ resultCode: deniedGeolocationResult, grants: permissionStateAfterDeny.grants, pending: permissionStateAfterDeny.pending })}`);
    }

    const allowedNotification = notificationRequest();
    await waitForPermissionPrompt('notifications', permissionOriginA);
    await clickPermissionDecision('allow');
    if (await allowedNotification !== 'granted') throw new Error('明确允许的通知请求未向 Chromium 返回 granted。');
    const grantedState = browserPermissionManager.getState();
    if (grantedState.grants.length !== 1 || grantedState.grants[0].origin !== permissionOriginA ||
        grantedState.grants[0].permissions.join(',') !== 'notifications') {
      throw new Error('会话授权应只包含用户明确允许的来源和能力。');
    }
    if (await notificationRequest() !== 'granted' || browserPermissionManager.getState().pending.length !== 0) {
      throw new Error('同一 origin 的同一会话授权应被复用，且无需重复提示。');
    }

    const alternateNavigation = await browserEngine.navigate(testTabId, `${permissionOriginB}/two`);
    if (!alternateNavigation.success) throw new Error('第二个 loopback 合成 origin 未能加载。');
    await waitForTabPath(testTabId, '/two', 'EARTH ONE Fixture Two');
    if (new URL(testContents.getURL()).origin !== permissionOriginB) throw new Error('跨 origin fixture 导航未完成。');
    const isolatedNotification = notificationRequest();
    await waitForPermissionPrompt('notifications', permissionOriginB);
    await clickPermissionDecision('deny');
    if (await isolatedNotification !== 'denied' || browserPermissionManager.getState().grants.some(grant => grant.origin === permissionOriginB)) {
      throw new Error('另一 origin 不得继承已允许权限。');
    }

    const returnNavigation = await browserEngine.navigate(testTabId, `${permissionOriginA}/two`);
    if (!returnNavigation.success) throw new Error('返回首个合成 origin 失败。');
    await waitForTabPath(testTabId, '/two', 'EARTH ONE Fixture Two');
    if (await notificationRequest() !== 'granted') throw new Error('授权应在本次应用会话中保持与首个 origin 隔离。');
    await appContents.executeJavaScript(`document.querySelector('[data-browser-permissions-toggle]').click()`);
    const permissionPanelText = await appContents.executeJavaScript(
      `document.querySelector('[data-browser-permissions-panel]')?.innerText || ''`
    );
    if (!permissionPanelText.includes(permissionOriginA) || !permissionPanelText.includes('通知') ||
        !await appContents.executeJavaScript(`Boolean(document.querySelector('[data-browser-revoke-permission="notifications"]'))`)) {
      throw new Error('会话权限面板没有展示来源/能力或逐项撤销控件。');
    }
    await appContents.executeJavaScript(`document.querySelector('[data-browser-revoke-permission="notifications"]').click()`);
    if (browserPermissionManager.getState().grants.length !== 0) throw new Error('逐项撤销没有清除会话授权。');
    await appContents.executeJavaScript(`document.querySelector('[data-browser-permissions-panel] button[aria-label="关闭会话站点权限"]').click()`);
    browserEngine.reload(testTabId);
    await waitForTabPath(testTabId, '/two', 'EARTH ONE Fixture Two');
    const afterRevokeNotification = notificationRequest();
    await waitForPermissionPrompt('notifications', permissionOriginA);
    await clickPermissionDecision('deny');
    if (await afterRevokeNotification !== 'denied') throw new Error('撤销后该 origin 不得继续获得通知权限。');

    const allowedGeolocation = testContents.executeJavaScript(`new Promise(resolve => navigator.geolocation.getCurrentPosition(
      () => resolve(0), error => resolve(error.code), { timeout: 3000 }
    ))`);
    await waitForPermissionPrompt('geolocation', permissionOriginA);
    await clickPermissionDecision('allow');
    const geolocationResult = await allowedGeolocation;
    if (geolocationResult === 1 || await testContents.executeJavaScript(`navigator.permissions.query({ name: 'geolocation' }).then(result => result.state)`) !== 'granted') {
      throw new Error('明确允许的定位权限未在当前 origin/会话内生效。');
    }

    const frameNavigation = await browserEngine.navigate(testTabId, `${permissionOriginA}/permission-frame`);
    if (!frameNavigation.success) throw new Error('跨 origin iframe 合成页面未能加载。');
    await waitForTabPath(testTabId, '/permission-frame', 'Permission Frame Fixture');
    const childFrameReady = await testContents.executeJavaScript(`new Promise(resolve => {
      const frame = document.querySelector('#permission-child');
      if (!frame) return resolve(false);
      const timer = setTimeout(() => { window.removeEventListener('message', receive); resolve(false); }, 5000);
      const receive = event => {
        if (event.data !== 'permission-child-ready') return;
        clearTimeout(timer);
        window.removeEventListener('message', receive);
        resolve(true);
      };
      window.addEventListener('message', receive);
      const ping = setInterval(() => frame.contentWindow.postMessage('permission-ping', '*'), 50);
      setTimeout(() => clearInterval(ping), 5100);
    })`);
    if (!childFrameReady) throw new Error('跨 origin 子框架没有响应本地权限测试握手。');
    const childGeolocation = testContents.executeJavaScript(`new Promise(resolve => {
      const frame = document.querySelector('#permission-child');
      const timer = setTimeout(() => { window.removeEventListener('message', receive); resolve('timeout'); }, 5000);
      const receive = event => {
        if (event.data?.type !== 'location-result') return;
        clearTimeout(timer);
        window.removeEventListener('message', receive);
        resolve(event.data.code);
      };
      window.addEventListener('message', receive);
      frame.contentWindow.postMessage('request-location', '*');
    })`);
    const childGeolocationResult = await childGeolocation;
    await new Promise(resolve => setTimeout(resolve, 100));
    if (childGeolocationResult !== 1 || browserPermissionManager.getState().pending.length !== 0) {
      throw new Error('跨 origin 子框架权限请求必须直接拒绝，不显示授权提示。');
    }
    const finalPermissionState = browserPermissionManager.getState();
    if (finalPermissionState.grants.length !== 1 || finalPermissionState.grants[0].origin !== permissionOriginA ||
        finalPermissionState.grants[0].permissions.join(',') !== 'geolocation') {
      throw new Error('最终会话授权应仅保留首个 origin 明确允许的定位权限。');
    }
    if (fs.existsSync(permissionStorePath)) throw new Error('会话权限不能写入磁盘或跨重启保存。');
    if (browserFixtureRequestAudit.some(request => request.allowed && ![permissionOriginA, permissionOriginB].includes(request.origin))) {
      throw new Error('权限集成测试允许了本机夹具白名单之外的网络 origin。');
    }
    console.log('BROWSER_PERMISSION_SMOKE_PASS: local synthetic top-frame prompts, explicit deny/allow, origin/capability isolation, revocation, cross-origin subframe rejection, and loopback-only network policy verified.');

    const beforeBounds = browserEngine.getViewBoundsForTesting(testTabId);
    if (!beforeBounds || beforeBounds.width < 100 || beforeBounds.height < 100) {
      throw new Error('Chromium 视口没有获得 EARTH ONE 页面内的有效显示尺寸。');
    }

    await mainWindow.setSize(780, 680);
    await new Promise(resolve => setTimeout(resolve, 500));
    const smallViewport = await appContents.executeJavaScript(`(() => {
      const element = document.querySelector('[data-browser-engine-viewport]');
      const r = element.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
    })()`);
    const smallBounds = browserEngine.getViewBoundsForTesting(testTabId);
    if (!smallBounds || Math.abs(smallBounds.x - smallViewport.x) > 1 || Math.abs(smallBounds.y - smallViewport.y) > 1 || Math.abs(smallBounds.width - smallViewport.width) > 1 || Math.abs(smallBounds.height - smallViewport.height) > 1) {
      throw new Error('缩窄窗口后，Chromium 视口与 Browser 模块的布局未同步。');
    }

    const testContentsForDownload = browserEngine.getWebContentsForTesting(testTabId);
    const downloadUrl = new URL('/download?token=synthetic-only', testUrl).href;
    testContentsForDownload.downloadURL(downloadUrl);
    const expectedDownload = path.join(testDownloadDir, 'earth-one-fixture.txt');
    const downloadDeadline = Date.now() + 12000;
    let downloadComplete = false;
    while (Date.now() < downloadDeadline) {
      try {
        const fs = require('node:fs');
        if (fs.readFileSync(expectedDownload, 'utf8') === 'EARTH ONE local download fixture\n') {
          downloadComplete = true;
          break;
        }
      } catch {
        // Wait for the small local download to finish.
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!downloadComplete) throw new Error('本地合成下载未通过保存流程。');

    const downloadStateDeadline = Date.now() + 5000;
    let completedDownload = null;
    while (Date.now() < downloadStateDeadline) {
      const records = await appContents.executeJavaScript('window.earthOneBrowser.getDownloads()');
      completedDownload = records.find(record => record.filename === 'earth-one-fixture.txt');
      if (completedDownload?.state === 'completed') break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!completedDownload || completedDownload.state !== 'completed' || !completedDownload.fileAvailable ||
        completedDownload.source !== new URL('/download', testUrl).href ||
        completedDownload.savePath !== expectedDownload) {
      throw new Error('下载管理器未显示合成下载的安全来源、完成状态或已批准的临时保存位置。');
    }
    const downloadStorePath = path.join(app.getPath('userData'), 'earth-one-downloads.json');
    const persistedDownloads = JSON.parse(fs.readFileSync(downloadStorePath, 'utf8'));
    if (persistedDownloads.version !== 1 || !persistedDownloads.records?.some(record =>
      record.id === completedDownload.id && record.savePath === expectedDownload &&
      record.source === new URL('/download', testUrl).href)) {
      throw new Error('下载历史没有写入隔离的 Electron userData 本机文件。');
    }
    await appContents.executeJavaScript(`document.querySelector('button[aria-label^="打开下载管理器"]').click()`);
    const downloadPanelText = await appContents.executeJavaScript(
      `document.querySelector('[data-browser-download-manager]')?.innerText || ''`
    );
    const folderControlVisible = await appContents.executeJavaScript(
      `Boolean(document.querySelector('button[aria-label="在文件夹中显示 earth-one-fixture.txt"]'))`
    );
    if (!downloadPanelText.includes('earth-one-fixture.txt') ||
        !downloadPanelText.includes('已完成') || !downloadPanelText.includes('保存位置：') ||
        downloadPanelText.includes('synthetic-only') || !folderControlVisible) {
      throw new Error('下载管理器列表未展示记录，或来源查询参数未被隐藏。');
    }
    const interruptedUrl = new URL('/slow-download?token=synthetic-only', testUrl).href;
    testContentsForDownload.downloadURL(interruptedUrl);
    const expectedInterruptedDownload = path.join(testDownloadDir, 'earth-one-interrupted.txt');
    const interruptedDeadline = Date.now() + 12000;
    let progressingDownload = null;
    while (Date.now() < interruptedDeadline) {
      const records = await appContents.executeJavaScript('window.earthOneBrowser.getDownloads()');
      progressingDownload = records.find(record => record.filename === 'earth-one-interrupted.txt');
      if (progressingDownload?.state === 'progressing' && progressingDownload.receivedBytes > 0 &&
          progressingDownload.savePath === expectedInterruptedDownload) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!progressingDownload || progressingDownload.state !== 'progressing' || progressingDownload.receivedBytes <= 0 ||
        progressingDownload.savePath !== expectedInterruptedDownload) {
      throw new Error('未能启动具有实际字节进度的本地合成下载以验证重启中断状态。');
    }
    const persistedProgressDeadline = Date.now() + 5000;
    let persistedProgress = false;
    while (Date.now() < persistedProgressDeadline) {
      const stored = JSON.parse(fs.readFileSync(downloadStorePath, 'utf8'));
      persistedProgress = stored.records.some(record => record.id === progressingDownload.id &&
        record.state === 'progressing' && record.receivedBytes > 0 && record.savePath === expectedInterruptedDownload);
      if (persistedProgress) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!persistedProgress) throw new Error('进行中的合成下载没有在重启前写入临时 userData 目录。');

    const preRestartPermissions = browserPermissionManager.getState();
    if (preRestartPermissions.grants.length !== 1 || preRestartPermissions.grants[0].permissions.join(',') !== 'geolocation' ||
        fs.existsSync(path.join(app.getPath('userData'), 'earth-one-browser-permissions.json'))) {
      throw new Error('硬重启前应有一项仍在内存中的定位授权，且不存在权限持久化文件。');
    }
    console.log('BROWSER_PERMISSION_SESSION_READY: geolocation grant remains memory-only immediately before process restart.');

    console.log(`BROWSER_SMOKE_RESTART_READY:${process.pid}`);
    await new Promise(() => {});
  } catch (error) {
    console.error('BROWSER_SMOKE_FAIL:', error && error.stack ? error.stack : error);
    app.exit(1);
  }
}

app.whenReady().then(async () => {
  const baseUrl = process.env.EARTH_ONE_DESKTOP_URL || 'http://127.0.0.1:3000';
  browserSessionStore = createBrowserSessionStore(getBrowserSessionStorePath());
  browserSessionStatus = browserSessionStore.load();
  browserSessionEnabled = browserSessionStatus.enabled && !browserSessionStatus.readOnly;
  const smokeTest = process.env.EARTH_ONE_BROWSER_SMOKE_TEST === '1';
  browserSmokeTest = smokeTest;
  browserPopupTestDecision = smokeTest && ['approve', 'deny'].includes(process.env.EARTH_ONE_BROWSER_TEST_POPUP_DECISION)
    ? process.env.EARTH_ONE_BROWSER_TEST_POPUP_DECISION
    : null;
  browserPopupSmokeConfirmationCount = 0;
  const smokeUrl = process.env.EARTH_ONE_BROWSER_TEST_URL;
  testDownloadDir = process.env.EARTH_ONE_BROWSER_TEST_DOWNLOAD_DIR || null;
  const testApprovalPath = getSafeSmokeApprovalPath(smokeTest, smokeUrl, testDownloadDir);
  if (smokeTest && !testApprovalPath) {
    throw new Error('smoke 下载批准仅支持 127.0.0.1 夹具和系统临时目录。');
  }
  browserPrintSmokeDialogCalls = 0;
  browserPrintSmokePath = getSafeSmokePdfPath(
    smokeTest,
    smokeUrl,
    testDownloadDir,
    process.env.EARTH_ONE_BROWSER_TEST_PDF_PATH
  );
  if (process.env.EARTH_ONE_BROWSER_PRINT_SMOKE_TEST === '1' && !browserPrintSmokePath) {
    throw new Error('PDF smoke 输出必须是系统临时目录中的固定本机 PDF 文件。');
  }
  const targetUrl = new URL(baseUrl);
  appOrigin = targetUrl.origin;
  if (smokeTest) {
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: [`${appOrigin}/api/browser/bookmarks*`] },
      (_details, callback) => {
        browserBookmarkApiRequests += 1;
        callback({});
      }
    );
  }
  if (smokeTest && smokeUrl) {
    targetUrl.searchParams.set('module', 'browser');
    targetUrl.searchParams.set('browserUrl', smokeUrl);
  }

  const browserSession = session.fromPartition('earth-one-browser');
  browserSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    if (!browserPermissionManager) {
      callback(false);
      return;
    }
    browserPermissionManager.request(contents, permission, callback, details);
  });
  browserSession.setPermissionCheckHandler((contents, permission, requestingOrigin, details) =>
    browserPermissionManager?.check(contents, permission, requestingOrigin, details) || false
  );
  if (smokeTest && smokeUrl) {
    const fixtureOrigins = new Set([new URL(smokeUrl).origin]);
    const alternateFixtureUrl = process.env.EARTH_ONE_BROWSER_TEST_ALT_URL;
    if (alternateFixtureUrl) {
      const alternate = new URL(alternateFixtureUrl);
      if (alternate.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(alternate.hostname) || alternate.username || alternate.password) {
        throw new Error('权限集成测试的第二 origin 必须是无凭据的 loopback HTTP 地址。');
      }
      fixtureOrigins.add(alternate.origin);
    }
    browserSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
      let requestedOrigin = '';
      try { requestedOrigin = new URL(details.url).origin; } catch {}
      const allowed = fixtureOrigins.has(requestedOrigin);
      browserFixtureRequestAudit.push({ url: details.url, origin: requestedOrigin, allowed });
      callback({ cancel: !allowed });
    });
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 760,
    minHeight: 600,
    show: false,
    backgroundColor: '#05080d',
    title: 'EARTH ONE',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  if (smokeTest) {
    mainWindow.webContents.on('console-message', (_event, ...details) => {
      console.error('EARTH_ONE_RENDERER_CONSOLE:', ...details.map(value => {
        try { return typeof value === 'string' ? value : JSON.stringify(value); }
        catch { return String(value); }
      }));
    });
    mainWindow.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
      console.error('EARTH_ONE_DID_FAIL_LOAD:', code, description, url, isMainFrame);
    });
    mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
      console.error('EARTH_ONE_PRELOAD_ERROR:', preloadPath, error && error.stack ? error.stack : error);
    });
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      console.error('EARTH_ONE_RENDER_PROCESS_GONE:', details);
    });
  }

  browserEngine = createBrowserEngine({
    window: mainWindow,
    WebContentsView,
    browserSession,
    onPermissionContextChange: contents => browserPermissionManager?.cancelForContents(contents),
    onState: state => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('browser:state', state);
      browserPermissionManager?.revalidatePending();
      scheduleBrowserSessionPersist();
    },
    onFocusAddressBar: tabId => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('browser:focus-address-bar', tabId);
    },
    onFocusFind: tabId => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('browser:focus-find', tabId);
    },
    onFindResult: result => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('browser:find-result', result);
    },
    onDownloads: (downloads, storageStatus) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('browser:downloads-state', downloads, storageStatus);
    },
    onOpenTabRequest: request => {
      if (!browserEngine?.isActiveTab(request.sourceTabId)) return;
      if (request.requiresConfirmation) requestBrowserPopupConfirmation(request);
      else openBrowserTabFromRequest(request);
    },
    onContextMenuLink: showBrowserLinkContextMenu,
    onNewTab: tab => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('browser:new-tab', tab);
    },
    onTabClosed: tab => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('browser:tab-closed', tab);
      browserPermissionManager?.revalidatePending();
      scheduleBrowserSessionPersist();
    },
    onRestoreAvailability: available => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('browser:restore-availability', Boolean(available));
    },
    defaultNewTabUrl: ['shortcuts', 'zoom'].includes(process.env.EARTH_ONE_BROWSER_TEST_PHASE)
      ? getSafeSmokeNewTabUrl(smokeTest, smokeUrl, process.env.EARTH_ONE_BROWSER_TEST_NEW_TAB_URL) || DEFAULT_BROWSER_NEW_TAB_URL
      : DEFAULT_BROWSER_NEW_TAB_URL,
    appOrigin,
    downloadStorePath: path.join(app.getPath('userData'), 'earth-one-downloads.json'),
    getTestApprovalPath: testApprovalPath || null
  });

  browserPdfExporter = createBrowserPdfExporter({
    getActiveTarget: () => browserEngine?.getActivePrintTarget?.() || null,
    isTargetCurrent: target => browserEngine?.isActivePrintTarget?.(target) === true,
    showSaveDialog: options => {
      if (browserSmokeTest && process.env.EARTH_ONE_BROWSER_PRINT_SMOKE_TEST === '1') {
        browserPrintSmokeDialogCalls += 1;
        if (browserPrintSmokeDialogCalls === 1) return Promise.resolve({ canceled: true });
        if (browserPrintSmokeDialogCalls === 2 && browserPrintSmokePath) {
          return Promise.resolve({ canceled: false, filePath: browserPrintSmokePath });
        }
        return Promise.resolve({ canceled: true });
      }
      return dialog.showSaveDialog(mainWindow, options);
    },
    downloadsPath: app.getPath('downloads')
  });

  browserPermissionManager = createBrowserPermissionManager({
    isActiveContext: (contents, origin, details) => browserEngine?.isPermissionContext(contents, origin, details) === true,
    onChange: state => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('browser:permissions-state', state);
    }
  });

  registerBrowserIpc();

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin !== appOrigin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    browserPermissionManager?.dispose();
    browserPermissionManager = null;
    browserEngine?.dispose();
    browserEngine = null;
    browserPdfExporter = null;
    mainWindow = null;
  });

  await mainWindow.loadURL(targetUrl.href);
  if (smokeTest) {
    if (!smokeUrl || !testDownloadDir) throw new Error('集成测试缺少本地夹具配置。');
    await runBrowserIntegrationSmokeTest(smokeUrl);
  }
});

app.on('before-quit', () => {
  if (browserSessionPersistTimer) {
    clearTimeout(browserSessionPersistTimer);
    browserSessionPersistTimer = null;
  }
  persistBrowserSessionNow();
  browserPermissionManager?.dispose();
  browserPermissionManager = null;
  browserEngine?.dispose();
});
app.on('window-all-closed', () => app.quit());
