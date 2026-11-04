'use strict';

const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, WebContentsView, ipcMain, session, shell } = require('electron');
const { createBrowserEngine, isAllowedNavigation } = require('./browser-engine.cjs');

app.setName('EARTH ONE');
if (process.env.EARTH_ONE_BROWSER_SMOKE_TEST === '1' && process.env.EARTH_ONE_BROWSER_TEST_PROFILE_DIR) {
  const profileDir = process.env.EARTH_ONE_BROWSER_TEST_PROFILE_DIR;
  app.setPath('userData', profileDir);
  app.setPath('sessionData', path.join(profileDir, 'session-data'));
}

let mainWindow = null;
let browserEngine = null;
let appOrigin = null;
let testDownloadDir = null;
let browserBookmarkApiRequests = 0;
let localBrowserDataReadOnly = false;
let localBrowserDataWriteQueue = Promise.resolve();

const MAX_LOCAL_BOOKMARKS = 200;
const MAX_LOCAL_HISTORY = 500;
const MAX_LOCAL_BROWSER_DATA_BYTES = 2 * 1024 * 1024;

function assertTrustedAppSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || !event.senderFrame) {
    throw new Error('拒绝来自非 EARTH ONE 界面的浏览器控制请求。');
  }
  if (event.senderFrame.top !== event.senderFrame) {
    throw new Error('拒绝来自嵌入式框架的浏览器控制请求。');
  }
  let senderOrigin;
  try {
    senderOrigin = new URL(event.senderFrame.url).origin;
  } catch {
    throw new Error('无法验证浏览器控制请求来源。');
  }
  if (senderOrigin !== appOrigin) {
    throw new Error('拒绝来自非 EARTH ONE 来源的浏览器控制请求。');
  }
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
    return path.join(realDownloadDir, 'earth-one-fixture.txt');
  } catch {
    return null;
  }
}

function getLocalBrowserDataPath() {
  return path.join(app.getPath('userData'), 'earth-one-browser-data.json');
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
    'browser:set-active': (_event, active) => browserEngine.setActive(Boolean(active)),
    'browser:set-bounds': (_event, bounds) => browserEngine.setBounds(bounds),
    'browser:select-tab': (_event, tabId, url) => browserEngine.selectTab(tabId, url),
    'browser:close-tab': (_event, tabId) => browserEngine.closeTab(tabId),
    'browser:navigate': (_event, tabId, url) => browserEngine.navigate(tabId, url),
    'browser:back': (_event, tabId) => browserEngine.goBack(tabId),
    'browser:forward': (_event, tabId) => browserEngine.goForward(tabId),
    'browser:reload': (_event, tabId) => browserEngine.reload(tabId)
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
      const pageReady = await appContents.executeJavaScript(
        `Boolean(window.earthOneBrowser && document.querySelector('[data-browser-engine-viewport]'))`
      );
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
        root: (document.getElementById('root')?.innerHTML || '').slice(0, 900),
        scripts: Array.from(document.scripts).map(script => script.src),
        body: (document.body?.innerText || '').slice(0, 700)
      })`);
      throw new Error(`EARTH ONE Browser 模块或 Chromium 视图启动超时：${JSON.stringify(diagnostic)}`);
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

    await waitForPage('/one', 'EARTH ONE Fixture One');

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

    const deniedPermission = await testContents.executeJavaScript(
      `new Promise(resolve => Notification.requestPermission().then(resolve))`
    );
    if (deniedPermission !== 'denied') {
      throw new Error(`通知权限应默认拒绝，实际结果为 ${String(deniedPermission)}。`);
    }

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
    await appContents.executeJavaScript(`document.querySelector('button[aria-label="从列表移除下载 earth-one-fixture.txt"]').click()`);
    const removalDeadline = Date.now() + 3000;
    let downloadRemoved = false;
    while (Date.now() < removalDeadline) {
      const records = await appContents.executeJavaScript('window.earthOneBrowser.getDownloads()');
      downloadRemoved = !records.some(record => record.id === completedDownload.id);
      if (downloadRemoved) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const afterRemoveStore = JSON.parse(fs.readFileSync(downloadStorePath, 'utf8'));
    if (!downloadRemoved || !fs.existsSync(expectedDownload) ||
        afterRemoveStore.records.some(record => record.id === completedDownload.id)) {
      throw new Error('从列表移除已完成记录应保留下载文件本身。');
    }
    await appContents.executeJavaScript(`document.querySelector('button[aria-label="关闭下载管理器"]').click()`);

    console.log('BROWSER_SMOKE_PASS: Chromium navigation, local-only bookmark/history persistence and clear controls, zero bookmark API requests, Ctrl+L address focus, URL guards, default-deny permissions, visible download progress/completion and list-only removal, and responsive bounds verified.');
    app.quit();
  } catch (error) {
    console.error('BROWSER_SMOKE_FAIL:', error && error.stack ? error.stack : error);
    app.exit(1);
  }
}

app.whenReady().then(async () => {
  const baseUrl = process.env.EARTH_ONE_DESKTOP_URL || 'http://127.0.0.1:3000';
  const smokeTest = process.env.EARTH_ONE_BROWSER_SMOKE_TEST === '1';
  const smokeUrl = process.env.EARTH_ONE_BROWSER_TEST_URL;
  testDownloadDir = process.env.EARTH_ONE_BROWSER_TEST_DOWNLOAD_DIR || null;
  const testApprovalPath = getSafeSmokeApprovalPath(smokeTest, smokeUrl, testDownloadDir);
  if (smokeTest && !testApprovalPath) {
    throw new Error('smoke 下载批准仅支持 127.0.0.1 夹具和系统临时目录。');
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
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  browserSession.setPermissionCheckHandler(() => false);

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
    onState: state => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('browser:state', state);
    },
    onFocusAddressBar: tabId => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('browser:focus-address-bar', tabId);
    },
    onDownloads: (downloads, storageStatus) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('browser:downloads-state', downloads, storageStatus);
    },
    downloadStorePath: path.join(app.getPath('userData'), 'earth-one-downloads.json'),
    getTestApprovalPath: testApprovalPath ? () => testApprovalPath : null
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
    browserEngine?.dispose();
    browserEngine = null;
    mainWindow = null;
  });

  await mainWindow.loadURL(targetUrl.href);
  if (smokeTest) {
    if (!smokeUrl || !testDownloadDir) throw new Error('集成测试缺少本地夹具配置。');
    await runBrowserIntegrationSmokeTest(smokeUrl);
  }
});

app.on('before-quit', () => browserEngine?.dispose());
app.on('window-all-closed', () => app.quit());
