'use strict';

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { isAllowedNavigation, normalizeBrowserUrl } = require('./browser-engine.cjs');

const root = path.resolve(__dirname, '..');
const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'earth-one-browser-smoke-'));
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
let output = '';
let launcher = null;
let finished = false;

const fixtureServer = http.createServer((request, response) => {
  const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
  if (pathname === '/one') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html><head><title>EARTH ONE Fixture One</title></head><body><h1>Local fixture one</h1><a href="/two">Next page</a></body></html>');
    return;
  }
  if (pathname === '/two') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html><head><title>EARTH ONE Fixture Two</title></head><body><h1>Local fixture two</h1></body></html>');
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
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

function cleanup() {
  if (launcher && launcher.exitCode === null) launcher.kill('SIGTERM');
  try { fs.rmSync(downloadDir, { recursive: true, force: true }); } catch {}
  try { fixtureServer.close(); } catch {}
}

function finish(code, reason) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  cleanup();
  if (reason) console.error(reason);
  process.exitCode = code;
}

const timeout = setTimeout(() => {
  finish(1, `Browser 引擎集成测试超时。输出：\n${output}`);
}, 45000);

fixtureServer.listen(0, '127.0.0.1', () => {
  const address = fixtureServer.address();
  const fixtureUrl = `http://127.0.0.1:${address.port}/one`;
  launcher = spawn(process.execPath, [path.join(root, 'desktop', 'launcher.cjs')], {
    cwd: root,
    env: {
      ...process.env,
      EARTH_ONE_BROWSER_SMOKE_TEST: '1',
      EARTH_ONE_BROWSER_TEST_URL: fixtureUrl,
      EARTH_ONE_BROWSER_TEST_DOWNLOAD_DIR: downloadDir,
      EARTH_ONE_SKIP_BOOK_HARVEST: 'true'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const consume = stream => stream.on('data', chunk => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);
  });
  consume(launcher.stdout);
  consume(launcher.stderr);

  launcher.once('error', error => finish(1, `无法启动 Electron 测试：${error.message}`));
  launcher.once('close', code => {
    if (finished) return;
    const passed = code === 0 && output.includes('BROWSER_SMOKE_PASS:');
    finish(passed ? 0 : 1, passed ? '' : `Browser 引擎集成测试失败 (exit=${code})。输出：\n${output}`);
  });
});

process.on('SIGINT', () => finish(130, '测试已中止。'));
process.on('SIGTERM', () => finish(143, '测试已终止。'));
