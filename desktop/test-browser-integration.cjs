'use strict';

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { MAX_SESSION_STORE_BYTES, MAX_SESSION_TABS } = require('./session-store.cjs');
const { isAllowedNavigation, normalizeBrowserUrl } = require('./browser-engine.cjs');

const root = path.resolve(__dirname, '..');
const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'earth-one-browser-smoke-'));
const profileDir = path.join(downloadDir, 'electron-profile');
fs.mkdirSync(profileDir, { recursive: true });
assert.equal(normalizeBrowserUrl('example.com'), 'https://example.com/');
assert.equal(normalizeBrowserUrl('localhost:3000'), 'https://localhost:3000/');
assert.equal(normalizeBrowserUrl('devbox:3000'), 'https://devbox:3000/');
assert.equal(normalizeBrowserUrl('example.com:8080/path'), 'https://example.com:8080/path');
assert.equal(normalizeBrowserUrl('127.0.0.1:3000/fixture'), 'https://127.0.0.1:3000/fixture');
assert.equal(normalizeBrowserUrl('[::1]:3000/fixture'), 'https://[::1]:3000/fixture');
assert.equal(isAllowedNavigation('http://127.0.0.1:3000/fixture'), true);
for (const unsafe of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,blocked', 'ftp://example.com/file', 'https://user:pass@example.com']) {
  assert.throws(() => normalizeBrowserUrl(unsafe), `unsafe URL should be rejected: ${unsafe}`);
}
assert.equal(isAllowedNavigation('javascript:alert(1)'), false);

let activeRun = null;
let finished = false;
const activeFixtureResponses = new Set();
const activeFixtureSockets = new Set();
const sessionRequestAudit = [];
let sessionOneRequestCount = 0;
let alternateFixtureOrigin = null;
function handleFixtureRequest(request, response) {
  const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
  if (pathname.startsWith('/session-')) {
    sessionRequestAudit.push({ pathname, cookie: request.headers.cookie || '' });
  }
  if (pathname === '/session-one' || pathname === '/session-two') {
    const shouldSetSessionCookie = pathname === '/session-one' && sessionOneRequestCount === 0;
    if (pathname === '/session-one') sessionOneRequestCount += 1;
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      ...(shouldSetSessionCookie ? { 'Set-Cookie': 'earth-one-ephemeral=synthetic-cookie-secret; Path=/; HttpOnly; SameSite=Lax' } : {})
    });
    response.end(`<!doctype html><html><head><title>${pathname === '/session-one' ? 'Session Fixture One' : 'Session Fixture Two'}</title></head><body><h1>${pathname}</h1><form><input id="session-email" type="email"><input id="session-password" type="password"></form></body></html>`);
    return;
  }
  if (pathname === '/session-fail') {
    request.socket.destroy();
    return;
  }
  if (pathname === '/popup-test') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html><head><title>Popup Source Fixture</title></head><body><h1>Popup Source Fixture</h1><a id="popup-link" target="_blank" href="/popup-target?source=anchor" onclick="window.__popupLinkClicks = (window.__popupLinkClicks || 0) + 1; window.__popupLinkTrusted = event.isTrusted">Open safe link in new tab</a><p id="popup-result"></p><button id="script-popup" type="button" onclick="window.__popupResult = window.open(\'/popup-target?source=window-open\', \'_blank\')">Call window.open</button></body></html>');
    return;
  }
  if (pathname === '/popup-target') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html><head><title>Popup Target Fixture</title></head><body><h1>Popup Target Fixture</h1><p id="popup-context">Synthetic new-tab destination</p></body></html>');
    return;
  }
  if (pathname === '/one') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html><head><title>EARTH ONE Fixture One</title></head><body><h1>Local fixture one</h1><a href="/two">Next page</a></body></html>');
    return;
  }
  if (pathname === '/print') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html><head><title>Local Print Fixture</title><style>@page{size:A4;margin:20mm}body{font:18px sans-serif}.page-two{break-before:page;page-break-before:always}</style></head><body><h1>EARTH ONE PDF page 1</h1><section class="page-two"><h1>EARTH ONE PDF page 2</h1></section></body></html>');
    return;
  }
  if (pathname === '/shortcuts' || pathname === '/shortcuts-default') {
    const title = pathname === '/shortcuts' ? 'Browser Keyboard Fixture' : 'Safe Default Fixture';
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1><input id="fixture-input" aria-label="Synthetic webpage input"><script>
      window.__earthOneShortcutEvents = [];
      document.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && ['t', 'w', 'tab', 'f', 'l', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(event.key.toLowerCase())) {
          window.__earthOneShortcutEvents.push({ key: event.key, ctrl: event.ctrlKey, meta: event.metaKey });
        }
      }, true);
    </script></body></html>`);
    return;
  }
  if (pathname === '/two') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html><head><title>EARTH ONE Fixture Two</title></head><body><h1>Local fixture two</h1></body></html>');
    return;
  }
  if (pathname === '/permission-frame') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html><head><title>Permission Frame Fixture</title></head><body><iframe id="permission-child" title="cross-origin location fixture" allow="geolocation" src="${alternateFixtureOrigin}/permission-child"></iframe></body></html>`);
    return;
  }
  if (pathname === '/permission-child') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html><head><title>Cross-Origin Permission Child</title></head><body><script>
      window.addEventListener('message', event => {
        if (event.data === 'permission-ping') {
          window.parent.postMessage('permission-child-ready', '*');
          return;
        }
        if (event.data !== 'request-location') return;
        navigator.geolocation.getCurrentPosition(
          () => window.parent.postMessage({ type: 'location-result', code: 0 }, '*'),
          error => window.parent.postMessage({ type: 'location-result', code: error.code }, '*'),
          { timeout: 2000 }
        );
      });
    </script></body></html>`);
    return;
  }
  if (pathname === '/find') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html><head><title>EARTH ONE Find Fixture</title></head><body><p>EARTHONE_FIND_FIXTURE alpha EARTHONE_FIND_FIXTURE beta EARTHONE_FIND_FIXTURE</p><script>window.__earthOneSawControlFind = false; document.addEventListener("keydown", event => { if (event.ctrlKey && event.key.toLowerCase() === "f") window.__earthOneSawControlFind = true; }, true);</script></body></html>');
    return;
  }
  if (pathname === '/download') {
    response.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename="earth-one-fixture.txt"'
    });
    response.end('EARTH ONE local download fixture\n');
    return;
  }
  if (pathname === '/slow-download') {
    const totalBytes = 2 * 1024 * 1024;
    const chunk = Buffer.alloc(64 * 1024, 0x45);
    let sentBytes = 0;
    let timer = null;
    response.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="earth-one-interrupted.txt"',
      'Content-Length': String(totalBytes)
    });
    activeFixtureResponses.add(response);
    response.on('close', () => {
      if (timer) clearInterval(timer);
      activeFixtureResponses.delete(response);
    });
    timer = setInterval(() => {
      if (response.destroyed) {
        clearInterval(timer);
        return;
      }
      response.write(chunk);
      sentBytes += chunk.length;
      if (sentBytes >= totalBytes) {
        clearInterval(timer);
        response.end();
      }
    }, 250);
    return;
  }
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
}
const fixtureServer = http.createServer(handleFixtureRequest);
const alternateFixtureServer = http.createServer(handleFixtureRequest);
fixtureServer.on('connection', socket => {
  activeFixtureSockets.add(socket);
  socket.once('close', () => activeFixtureSockets.delete(socket));
});

function launchSmoke(phase, options = {}) {
  let output = '';
  const runProfileDir = options.profileDir || profileDir;
  const startUrl = options.startUrl || `http://127.0.0.1:${fixtureServer.address().port}/one`;
  const child = spawn(process.execPath, [path.join(root, 'desktop', 'launcher.cjs')], {
    cwd: root,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      EARTH_ONE_BROWSER_SMOKE_TEST: '1',
      EARTH_ONE_BROWSER_SESSION_SMOKE_TEST: options.sessionSmoke ? '1' : '0',
      EARTH_ONE_BROWSER_TEST_PHASE: phase,
      EARTH_ONE_BROWSER_TEST_URL: startUrl,
      EARTH_ONE_BROWSER_TEST_NEW_TAB_URL: phase === 'shortcuts'
        ? `${new URL(startUrl).origin}/shortcuts-default`
        : '',
      EARTH_ONE_BROWSER_TEST_ALT_URL: options.altUrl || `${alternateFixtureOrigin}/one`,
      EARTH_ONE_BROWSER_TEST_POPUP_DECISION: options.popupDecision || 'deny',
      EARTH_ONE_BROWSER_TEST_DOWNLOAD_DIR: downloadDir,
      EARTH_ONE_BROWSER_PRINT_SMOKE_TEST: phase === 'restart' ? '1' : '0',
      EARTH_ONE_BROWSER_TEST_PDF_PATH: path.join(downloadDir, 'earth-one-browser-print.pdf'),
      EARTH_ONE_BROWSER_TEST_PROFILE_DIR: runProfileDir,
      EARTH_ONE_DATA_FILE: path.join(downloadDir, 'server_data.json'),
      EARTH_ONE_SKIP_BOOK_HARVEST: 'true'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);
  });
  child.stderr.on('data', chunk => {
    const text = chunk.toString();
    output += text;
    process.stderr.write(text);
  });
  const closed = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  return {
    child,
    closed,
    getOutput: () => output,
    async waitForMarker(pattern, timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const match = output.match(pattern);
        if (match) return match;
        const result = await Promise.race([
          closed.then(close => ({ close })),
          new Promise(resolve => setTimeout(() => resolve(null), 50))
        ]);
        if (result?.close) throw new Error(`Electron smoke 在标记出现前退出 (${JSON.stringify(result.close)}):\n${output}`);
      }
      throw new Error(`等待 Electron smoke 标记超时：${pattern}\n${output}`);
    }
  };
}

function signalChildTree(child, signal) {
  if (!child || child.exitCode !== null) return;
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to the launcher process if its group is unavailable.
    }
  }
  try { child.kill(signal); } catch {}
}

function killElectronProcess(pid) {
  assert.ok(Number.isSafeInteger(pid) && pid > 1 && pid !== process.pid, 'smoke emitted an invalid Electron PID');
  try {
    process.kill(pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

async function stopRun(run) {
  if (!run) return;
  signalChildTree(run.child, 'SIGTERM');
  const result = await Promise.race([
    run.closed,
    new Promise(resolve => setTimeout(() => resolve(null), 8000))
  ]);
  if (!result) {
    signalChildTree(run.child, 'SIGKILL');
    await Promise.race([run.closed, new Promise(resolve => setTimeout(resolve, 3000))]);
  }
}

async function cleanup() {
  if (activeRun) await stopRun(activeRun);
  for (const response of activeFixtureResponses) response.destroy();
  for (const server of [fixtureServer, alternateFixtureServer]) {
    if (!server.listening) continue;
    const closed = new Promise(resolve => server.close(() => resolve()));
    for (const response of activeFixtureResponses) response.destroy();
    for (const socket of activeFixtureSockets) socket.destroy();
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    await closed;
  }
  try { fs.rmSync(downloadDir, { recursive: true, force: true }); } catch {}
}

async function finish(code, reason) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  if (reason) console.error(reason);
  try {
    await cleanup();
  } catch (error) {
    console.error(`清理临时 Electron smoke 资源失败：${error.stack || error}`);
    code = 1;
  }
  if (code === 0) console.log('BROWSER_TEST_DRIVER_CLEANUP_DONE');
  process.exitCode = code;
}

const timeout = setTimeout(() => {
  void finish(1, `Browser 引擎跨进程集成测试超时。`);
}, 180000);

async function main() {
  await new Promise((resolve, reject) => {
    fixtureServer.once('error', reject);
    fixtureServer.listen(0, '127.0.0.1', resolve);
  });
  await new Promise((resolve, reject) => {
    alternateFixtureServer.once('error', reject);
    alternateFixtureServer.listen(0, '127.0.0.1', resolve);
  });
  alternateFixtureOrigin = `http://127.0.0.1:${alternateFixtureServer.address().port}`;
  const fixtureOrigin = `http://127.0.0.1:${fixtureServer.address().port}`;

  const shortcutsRun = launchSmoke('shortcuts', { startUrl: `${fixtureOrigin}/shortcuts` });
  activeRun = shortcutsRun;
  await shortcutsRun.waitForMarker(/BROWSER_SHORTCUTS_SMOKE_PASS:/, 50000);
  const shortcutsClose = await Promise.race([
    shortcutsRun.closed,
    new Promise((_, reject) => setTimeout(() => reject(new Error('shortcut Electron smoke did not exit cleanly')), 12000))
  ]);
  assert.equal(shortcutsClose.code, 0, `shortcut Electron smoke failed: ${shortcutsRun.getOutput()}`);
  console.log('BROWSER_TEST_DRIVER_SHORTCUTS_PASSED');
  activeRun = null;
  if (process.env.EARTH_ONE_BROWSER_SHORTCUTS_ONLY === '1') return;

  const firstRun = launchSmoke('initial');
  activeRun = firstRun;
  const restartMarker = await firstRun.waitForMarker(/BROWSER_SMOKE_RESTART_READY:(\d+)/, 80000);
  assert.match(firstRun.getOutput(), /BROWSER_PERMISSION_SESSION_READY:/, 'first process must hold an in-memory grant immediately before restart');
  console.log('BROWSER_TEST_DRIVER_FIRST_PROCESS_READY');
  const defaultSessionPath = path.join(profileDir, 'earth-one-browser-session.json');
  assert.equal(fs.existsSync(defaultSessionPath), false, 'default-off profile must not persist a tab snapshot');
  const electronPid = Number(restartMarker[1]);
  const storePath = path.join(profileDir, 'earth-one-downloads.json');
  const persisted = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  const completedBeforeRestart = persisted.records.find(record => record.filename === 'earth-one-fixture.txt');
  const interruptedBeforeRestart = persisted.records.find(record => record.filename === 'earth-one-interrupted.txt');
  assert.ok(completedBeforeRestart, 'first Electron process must persist the completed synthetic download');
  assert.equal(completedBeforeRestart.state, 'completed');
  assert.equal(completedBeforeRestart.savePath, path.join(downloadDir, 'earth-one-fixture.txt'));
  assert.equal(fs.readFileSync(completedBeforeRestart.savePath, 'utf8'), 'EARTH ONE local download fixture\n');
  assert.ok(interruptedBeforeRestart, 'first Electron process must persist an active synthetic download');
  assert.equal(interruptedBeforeRestart.state, 'progressing');
  assert.ok(interruptedBeforeRestart.receivedBytes > 0, 'the interrupted fixture must have real partial progress');
  assert.equal(interruptedBeforeRestart.savePath, path.join(downloadDir, 'earth-one-interrupted.txt'));

  // Deliberately hard-stop the first Electron main process so the active record is not finalized by dispose().
  killElectronProcess(electronPid);
  const firstClose = await Promise.race([
    firstRun.closed,
    new Promise((_, reject) => setTimeout(() => reject(new Error('first Electron launcher did not exit after its main process was terminated')), 12000))
  ]);
  assert.notEqual(firstClose.code, 0, 'the first launcher should report the intentionally terminated Electron process');
  console.log('BROWSER_TEST_DRIVER_FIRST_PROCESS_EXITED');
  activeRun = null;

  const secondRun = launchSmoke('restart');
  activeRun = secondRun;
  await secondRun.waitForMarker(/BROWSER_SMOKE_PASS:/, 80000);
  assert.match(secondRun.getOutput(), /BROWSER_PERMISSION_RESTART_RESET_PASS:/, 'new process must start with no previous site grants');
  assert.match(secondRun.getOutput(), /BROWSER_PERMISSION_SMOKE_PASS:/, 'restarted process must re-run the local permission flow');
  assert.match(secondRun.getOutput(), /BROWSER_PRINT_SMOKE_PASS:/, 'restarted process must save a synthetic local Chromium page as PDF');
  const printedPdfPath = path.join(downloadDir, 'earth-one-browser-print.pdf');
  const printedPdf = fs.readFileSync(printedPdfPath);
  assert.equal(printedPdf.subarray(0, 5).toString('ascii'), '%PDF-', 'Chromium output must have a PDF header');
  const pdfInfo = spawnSync('pdfinfo', [printedPdfPath], { encoding: 'utf8' });
  let printedPageCount = pdfInfo.status === 0 ? Number(pdfInfo.stdout.match(/^Pages:\s+(\d+)/m)?.[1]) : NaN;
  if (!Number.isFinite(printedPageCount)) {
    const pageTree = printedPdf.toString('latin1').match(/\/Type\s*\/Pages\b[\s\S]{0,256}?\/Count\s+(\d+)/);
    printedPageCount = Number(pageTree?.[1]);
  }
  assert.equal(printedPageCount, 2, 'synthetic Chromium fixture must yield exactly two PDF pages');
  assert.equal(fs.readdirSync(downloadDir).some(name => name.endsWith('.tmp')), false, 'PDF export must leave no atomic-write temporary file');
  console.log('BROWSER_TEST_DRIVER_RESTART_PHASE_PASSED');
  const secondClose = await Promise.race([
    secondRun.closed,
    new Promise((_, reject) => setTimeout(() => reject(new Error('restarted Electron smoke did not exit cleanly')), 12000))
  ]);
  assert.equal(secondClose.code, 0, `restarted Electron launcher failed: ${secondRun.getOutput()}`);
  console.log('BROWSER_TEST_DRIVER_LAUNCHER_EXITED_CLEANLY');
  activeRun = null;

  const sessionProfileDir = path.join(downloadDir, 'electron-session-profile');
  fs.mkdirSync(sessionProfileDir, { recursive: true });
  const sessionStorePath = path.join(sessionProfileDir, 'earth-one-browser-session.json');
  const cookieAuditBeforeSave = sessionRequestAudit.length;
  const sessionSaveRun = launchSmoke('session-save', {
    profileDir: sessionProfileDir,
    startUrl: `${fixtureOrigin}/session-one`,
    sessionSmoke: true
  });
  activeRun = sessionSaveRun;
  const sessionSaveMarker = await sessionSaveRun.waitForMarker(/BROWSER_SESSION_SAVE_READY:(\d+)/, 80000);
  const sessionPid = Number(sessionSaveMarker[1]);
  const savedSessionText = fs.readFileSync(sessionStorePath, 'utf8');
  const savedSession = JSON.parse(savedSessionText);
  assert.ok(Buffer.byteLength(savedSessionText, 'utf8') <= MAX_SESSION_STORE_BYTES, 'session file stays within its byte bound');
  assert.equal(savedSession.tabs.length, MAX_SESSION_TABS > 3 ? 3 : MAX_SESSION_TABS);
  const firstProcessRequests = sessionRequestAudit.slice(cookieAuditBeforeSave);
  assert.ok(firstProcessRequests.some(request => request.pathname === '/session-two' && request.cookie.includes('earth-one-ephemeral=synthetic-cookie-secret')),
    'first Electron process uses its in-memory fixture cookie across tabs');

  killElectronProcess(sessionPid);
  const sessionSaveClose = await Promise.race([
    sessionSaveRun.closed,
    new Promise((_, reject) => setTimeout(() => reject(new Error('first session Electron launcher did not exit after its main process was terminated')), 12000))
  ]);
  assert.notEqual(sessionSaveClose.code, 0, 'the session-save process is deliberately hard-stopped to model a crash/restart');
  activeRun = null;

  const cookieAuditBeforeRestore = sessionRequestAudit.length;
  const initialPageRequestsBeforeRestore = sessionRequestAudit.filter(request => request.pathname === '/one').length;
  const sessionRestoreRun = launchSmoke('session-restore', {
    profileDir: sessionProfileDir,
    startUrl: `${fixtureOrigin}/one`,
    sessionSmoke: true
  });
  activeRun = sessionRestoreRun;
  await sessionRestoreRun.waitForMarker(/BROWSER_SESSION_RESTORE_PASS:/, 80000);
  const sessionRestoreClose = await Promise.race([
    sessionRestoreRun.closed,
    new Promise((_, reject) => setTimeout(() => reject(new Error('session restore Electron launcher did not exit cleanly')), 12000))
  ]);
  assert.equal(sessionRestoreClose.code, 0, `second session Electron process failed: ${sessionRestoreRun.getOutput()}`);
  const optedOutStore = JSON.parse(fs.readFileSync(sessionStorePath, 'utf8'));
  assert.equal(optedOutStore.enabled, false, 'turning the setting off clears the saved session');
  assert.deepEqual(optedOutStore.tabs, []);
  const requestsAfterRestart = sessionRequestAudit.slice(cookieAuditBeforeRestore);
  assert.ok(requestsAfterRestart.some(request => request.pathname === '/session-one'));
  assert.ok(requestsAfterRestart.some(request => request.pathname === '/session-two'));
  assert.ok(requestsAfterRestart.every(request => !request.cookie.includes('earth-one-ephemeral=synthetic-cookie-secret')),
    'the in-memory fixture cookie must not be sent by the second Electron process');
  assert.equal(sessionRequestAudit.filter(request => request.pathname === '/one').length, initialPageRequestsBeforeRestore,
    'an enabled session must not load the default browserUrl in the background');
  console.log('BROWSER_TEST_DRIVER_SESSION_RESTART_PASSED');
  activeRun = null;

  const sessionOptOutRun = launchSmoke('session-optout', {
    profileDir: sessionProfileDir,
    startUrl: `${fixtureOrigin}/one`,
    sessionSmoke: true
  });
  activeRun = sessionOptOutRun;
  await sessionOptOutRun.waitForMarker(/BROWSER_SESSION_OPTOUT_PASS:/, 80000);
  const sessionOptOutClose = await Promise.race([
    sessionOptOutRun.closed,
    new Promise((_, reject) => setTimeout(() => reject(new Error('session opt-out Electron launcher did not exit cleanly')), 12000))
  ]);
  assert.equal(sessionOptOutClose.code, 0, `session opt-out Electron process failed: ${sessionOptOutRun.getOutput()}`);
  console.log('BROWSER_TEST_DRIVER_SESSION_OPTOUT_PASSED');
  activeRun = null;
}

process.on('SIGINT', () => { void finish(130, '测试已中止。'); });
process.on('SIGTERM', () => { void finish(143, '测试已终止。'); });

main().then(() => {
  void finish(0, '');
}).catch(error => {
  void finish(1, error && error.stack ? error.stack : String(error));
});
