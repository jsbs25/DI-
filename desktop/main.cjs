'use strict';

const path = require('node:path');
const { app, BrowserWindow, WebContentsView, ipcMain, session } = require('electron');
const { createBrowserEngine } = require('./browser-engine.cjs');

app.setName('EARTH ONE');

let mainWindow = null;
let browserEngine = null;
let appOrigin = null;
let testDownloadDir = null;

function assertTrustedAppSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || !event.senderFrame) {
    throw new Error('拒绝来自非 EARTH ONE 界面的浏览器控制请求。');
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

function registerBrowserIpc() {
  const handlers = {
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
    const downloadUrl = new URL('/download', testUrl).href;
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

    console.log('BROWSER_SMOKE_PASS: Chromium view, address-bar navigation without server preview fetch, back history, URL guards, default-deny permissions, downloads, and responsive bounds verified.');
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
  const targetUrl = new URL(baseUrl);
  appOrigin = targetUrl.origin;
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
    onDownload: item => {
      if (smokeTest && testDownloadDir) return path.join(testDownloadDir, 'earth-one-fixture.txt');
      return null;
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
