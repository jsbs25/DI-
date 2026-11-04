'use strict';

const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
let serverProcess = null;
let electronProcess = null;
let shuttingDown = false;

function findFreeLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function waitForApp(url, processRef) {
  const deadline = Date.now() + 45000;
  return new Promise((resolve, reject) => {
    const check = () => {
      if (shuttingDown) return reject(new Error('启动被取消。'));
      if (!processRef() || processRef().exitCode !== null) return reject(new Error('EARTH ONE 本地服务提前退出。'));
      const request = http.get(url, response => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { body += chunk.slice(0, 2048); });
        response.on('end', () => {
          if (response.statusCode === 200 && body.includes('<html')) return resolve();
          retry();
        });
      });
      request.setTimeout(1500, () => request.destroy());
      request.on('error', retry);
    };
    const retry = () => {
      if (Date.now() >= deadline) return reject(new Error('等待 EARTH ONE 本地服务超时。'));
      setTimeout(check, 250);
    };
    check();
  });
}

function stopChild(child, processTree = false) {
  if (!child || child.exitCode !== null) return;
  const signalTree = signal => {
    if (processTree && process.platform === 'win32' && child.pid) {
      const taskkill = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      });
      taskkill.unref();
      return;
    }
    if (processTree && process.platform !== 'win32' && child.pid) {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch {
        // Fall through to the direct child if its process group is unavailable.
      }
    }
    child.kill(signal);
  };
  signalTree('SIGTERM');
  setTimeout(() => {
    if (child.exitCode === null) signalTree('SIGKILL');
  }, 5000).unref();
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopChild(electronProcess, true);
  stopChild(serverProcess, true);
  if (!electronProcess) process.exitCode = code;
}

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

(async () => {
  const port = Number(process.env.PORT) || await findFreeLoopbackPort();
  const appUrl = `http://127.0.0.1:${port}`;
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  serverProcess = spawn(npmCommand, ['run', 'dev'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      EARTH_ONE_HOST: '127.0.0.1',
      EARTH_ONE_SKIP_BOOK_HARVEST: 'true'
    },
    stdio: 'inherit',
    detached: process.platform !== 'win32',
    shell: process.platform === 'win32'
  });
  serverProcess.once('exit', code => {
    if (!shuttingDown && electronProcess && electronProcess.exitCode === null) {
      console.error(`EARTH ONE 本地服务退出 (${code ?? 'signal'})。`);
      stopChild(electronProcess, true);
    }
  });

  await waitForApp(appUrl, () => serverProcess);
  const electronBinary = require('electron');
  const smokeTest = process.env.EARTH_ONE_BROWSER_SMOKE_TEST === '1';
  const smokeUrl = process.env.EARTH_ONE_BROWSER_TEST_URL || '';
  const testDownloadDir = process.env.EARTH_ONE_BROWSER_TEST_DOWNLOAD_DIR || '';
  const env = {
    ...process.env,
    EARTH_ONE_DESKTOP_URL: appUrl,
    EARTH_ONE_BROWSER_SMOKE_TEST: smokeTest ? '1' : '0',
    EARTH_ONE_BROWSER_TEST_URL: smokeUrl,
    EARTH_ONE_BROWSER_TEST_DOWNLOAD_DIR: testDownloadDir
  };
  const electronArgs = [];
  if (smokeTest) {
    electronArgs.push('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  }
  electronArgs.push(path.join(__dirname, 'main.cjs'));

  electronProcess = spawn(electronBinary, electronArgs, {
    cwd: root,
    env,
    stdio: 'inherit',
    detached: process.platform !== 'win32'
  });
  electronProcess.once('exit', code => {
    if (!shuttingDown) {
      shuttingDown = true;
      stopChild(serverProcess, true);
      process.exitCode = code ?? 1;
    }
  });
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  shutdown(1);
});
