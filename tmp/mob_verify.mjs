import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire('/usr/local/share/bun-global/node_modules/playwright/package.json');
const { chromium } = require('playwright');

const CHROME_EXEC = '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell';
const PORT = 3110;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DATA_FILE = `/tmp/mob_verify_data_${Date.now()}.json`;

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`Server failed to respond within ${timeoutMs}ms`);
}

async function run() {
  const srv = spawn('./node_modules/.bin/tsx', ['server.ts'], {
    cwd: '/app/applet',
    env: {
      ...process.env,
      PORT: String(PORT),
      EARTH_ONE_DATA_FILE: DATA_FILE,
      EARTH_ONE_SKIP_BOOK_HARVEST: 'true',
      NODE_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let srvLogs = '';
  srv.stdout.on('data', d => { srvLogs += d.toString(); });
  srv.stderr.on('data', d => { srvLogs += d.toString(); });

  let browserFast = null;
  let browserWebgl = null;

  try {
    await waitForServer(BASE_URL, 25000);
    console.log('Test server ready on', BASE_URL);

    browserFast = await chromium.launch({
      executablePath: CHROME_EXEC,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const viewports = [
      { name: 'phone_360', width: 360, height: 740, isMobile: true, hasTouch: true },
      { name: 'phone_390', width: 390, height: 844, isMobile: true, hasTouch: true },
      { name: 'tablet_768', width: 768, height: 1024, isMobile: true, hasTouch: true },
      { name: 'tablet_1024', width: 1024, height: 768, isMobile: false, hasTouch: true },
    ];

    const report = [];

    for (let vi = 0; vi < viewports.length; vi++) {
      const vp = viewports[vi];
      const context = await browserFast.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        isMobile: vp.isMobile,
        hasTouch: vp.hasTouch,
      });

      const uname = `mobtest_${vp.name}_${Date.now()}`;
      const regRes = await context.request.post(`${BASE_URL}/api/auth/register`, {
        data: {
          username: uname,
          password: 'Password123!',
          displayName: `Tester ${vp.name}`,
          email: `${uname}@example.com`,
        },
      });
      const regJson = await regRes.json();
      assert.equal(regRes.ok(), true, `Register failed for ${vp.name}: ${JSON.stringify(regJson)}`);

      const obRes = await context.request.post(`${BASE_URL}/api/auth/onboarding`, {
        data: {
          countryCode: 'CN',
          countryName: 'China',
          cityName: 'Shanghai',
          lat: 31.23,
          lng: 121.47,
          bio: 'Mobile tablet check',
          isPublic: true,
        },
      });
      assert.equal(obRes.ok(), true, `Onboarding failed for ${vp.name}`);

      await context.addInitScript((token) => {
        localStorage.setItem('earth-one-intro-seen', '1');
        if (token) localStorage.setItem('earth_one_token', token);
      }, regJson.token || '');

      const page = await context.newPage();
      const pageErrors = [];
      const consoleErrors = [];
      page.on('pageerror', err => pageErrors.push(err.message));
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('header', { timeout: 10000 });
      await page.waitForTimeout(500);

      // 1. Test Navbar lang menu opens and closes cleanly on outside tap/click
      const langBtn = page.locator('header button[aria-haspopup="menu"]').first();
      await langBtn.click();
      await page.waitForTimeout(150);
      const langMenuVisible = await page.locator('header div[role="menu"]').first().isVisible();
      assert.equal(langMenuVisible, true, `${vp.name}: Language menu did not open`);
      await page.mouse.click(20, 320);
      await page.waitForTimeout(150);
      const langMenuAfterOutside = await page.locator('header div[role="menu"]').count();
      assert.equal(langMenuAfterOutside, 0, `${vp.name}: Language menu did not close on outside tap`);

      // Also verify navbar doesn't exceed viewport width
      const navOverflow = await page.evaluate(() => {
        const hdr = document.querySelector('header > div');
        if (!hdr) return 0;
        return hdr.scrollWidth - hdr.clientWidth;
      });
      assert.ok(navOverflow <= 1, `${vp.name}: Navbar overflows horizontally by ${navOverflow}px`);

      // Helper to navigate dock cleanly
      async function openDockTab(titles, inMore) {
        if (inMore) {
          const moreBtn = page.locator('button[title="更多"], button[title="More"], button:has-text("更多"), button:has-text("More")').filter({ visible: true }).first();
          await moreBtn.click();
          await page.waitForTimeout(220);
          for (const title of titles) {
            const item = page.locator(`button:has-text("${title}")`).filter({ visible: true }).first();
            if (await item.count()) {
              await item.click();
              await page.waitForTimeout(400);
              return;
            }
          }
          throw new Error(`Could not find More drawer item for ${titles.join('/')}`);
        } else {
          for (const title of titles) {
            const btn = page.locator(`button[title="${title}"]`).filter({ visible: true }).first();
            if (await btn.count()) {
              await btn.click();
              await page.waitForTimeout(400);
              return;
            }
          }
          throw new Error(`Could not find Dock button for ${titles.join('/')}`);
        }
      }

      const isPhoneDock = vp.width < 768;
      const tabsToCheck = [
        { key: 'globe', titles: ['首页', 'Home'], inMore: false },
        { key: 'feed', titles: ['发现', 'Discover'], inMore: false },
        { key: 'chat', titles: ['消息', 'Messages'], inMore: false },
        { key: 'venus', titles: ['音乐', 'Music'], inMore: false },
        { key: 'aihub', titles: ['智能', 'AI'], inMore: false },
        { key: 'universe', titles: ['宇宙', 'Universe'], inMore: isPhoneDock },
        { key: 'browser', titles: ['浏览器', 'Browser'], inMore: true },
        { key: 'library', titles: ['图书馆', 'Library'], inMore: true },
        { key: 'network', titles: ['网络中心', 'Network'], inMore: true },
      ];

      const tabResults = {};
      for (const tab of tabsToCheck) {
        await openDockTab(tab.titles, tab.inMore);
        const metrics = await page.evaluate(() => ({
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          overflowX: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
          metaViewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '',
        }));
        tabResults[tab.key] = metrics;
        assert.ok(metrics.overflowX <= 1, `${vp.name} [${tab.key}]: horizontal overflow ${metrics.overflowX}px (scrollWidth=${metrics.scrollWidth}, innerWidth=${metrics.innerWidth})`);

        if (tab.key === 'chat') {
          const chatMetrics = await page.evaluate(() => {
            const aside = document.querySelector('aside');
            const rect = aside?.getBoundingClientRect();
            return {
              hasAside: Boolean(aside),
              asideTop: rect ? Math.round(rect.top) : null,
              asideBottom: rect ? Math.round(rect.bottom) : null,
              asideHeight: rect ? Math.round(rect.height) : null,
              innerHeight: window.innerHeight,
            };
          });
          tabResults.chatMetrics = chatMetrics;
          if (vp.width < 1024) {
            assert.equal(chatMetrics.hasAside, true, `${vp.name} [chat]: <aside> list pane missing`);
            assert.ok(
              chatMetrics.asideBottom <= chatMetrics.innerHeight + 2,
              `${vp.name} [chat]: <aside> overflows bottom (${chatMetrics.asideBottom} > ${chatMetrics.innerHeight})`
            );
          }

          if (vp.name === 'phone_360') {
            // Test visibilitychange resume trigger in Messenger
            await page.evaluate(() => {
              Object.defineProperty(document, 'hidden', { configurable: true, value: true });
              document.dispatchEvent(new Event('visibilitychange'));
              Object.defineProperty(document, 'hidden', { configurable: true, value: false });
              document.dispatchEvent(new Event('visibilitychange'));
              window.dispatchEvent(new Event('online'));
            });
            await page.waitForTimeout(300);
          }
        }
      }

      // Filter out expected WebGL-disabled info if any (none expected as graceful fallback handles it)
      const unexpectedConsole = consoleErrors.filter(
        c => !c.includes('WebGL') && !c.includes('favicon')
      );
      assert.equal(pageErrors.length, 0, `${vp.name} pageErrors: ${pageErrors.join(' | ')}`);
      assert.equal(unexpectedConsole.length, 0, `${vp.name} consoleErrors: ${unexpectedConsole.join(' | ')}`);

      report.push({ viewport: vp.name, navOverflow, tabs: tabResults });
      await context.close();
    }

    await browserFast.close();
    browserFast = null;

    // 2. Single lightweight SwiftShader WebGL check on 390x844
    browserWebgl = await chromium.launch({
      executablePath: CHROME_EXEC,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
      ],
    });
    const wCtx = await browserWebgl.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    await wCtx.addInitScript(() => localStorage.setItem('earth-one-intro-seen', '1'));
    const wPage = await wCtx.newPage();
    const wErrors = [];
    wPage.on('pageerror', e => wErrors.push(e.message));
    await wPage.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await wPage.waitForTimeout(800);
    const globeCanvas = await wPage.evaluate(() => {
      const c = document.querySelector('#earth-engine-canvas canvas');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    assert.ok(globeCanvas && globeCanvas.w > 0 && globeCanvas.h > 0, `Globe WebGL canvas invalid: ${JSON.stringify(globeCanvas)}`);

    // Switch once to Universe inside same page
    await wPage.locator('button:has-text("更多"), button:has-text("More")').filter({ visible: true }).first().click();
    await wPage.waitForTimeout(200);
    await wPage.locator('button:has-text("宇宙"), button:has-text("Universe")').filter({ visible: true }).first().click();
    await wPage.waitForTimeout(800);
    const uniCanvas = await wPage.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    assert.ok(uniCanvas && uniCanvas.w > 0 && uniCanvas.h > 0, `Universe WebGL canvas invalid: ${JSON.stringify(uniCanvas)}`);
    assert.equal(wErrors.length, 0, `WebGL pageerrors: ${wErrors.join(' | ')}`);
    await wCtx.close();
    await browserWebgl.close();
    browserWebgl = null;

    console.log('ALL MOBILE/TABLET VERIFICATION CHECKS PASSED!');
    console.log(JSON.stringify({ globeCanvas, uniCanvas, reportCount: report.length, chatMetrics: report.map(r => ({ vp: r.viewport, chat: r.tabs.chatMetrics })) }, null, 2));
  } finally {
    if (browserFast) await browserFast.close().catch(() => {});
    if (browserWebgl) await browserWebgl.close().catch(() => {});
    srv.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 400));
    if (!srv.killed) srv.kill('SIGKILL');
  }
}

run().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
