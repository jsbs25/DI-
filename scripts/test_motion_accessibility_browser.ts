import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const mediaQuery = '@media (prefers-reduced-motion: reduce)';
const start = css.indexOf(mediaQuery);
assert.notEqual(start, -1, 'A reduced-motion media query must exist');

const openingBrace = css.indexOf('{', start);
assert.notEqual(openingBrace, -1, 'The reduced-motion media query must open');
let depth = 0;
let end = -1;
for (let index = openingBrace; index < css.length; index += 1) {
  if (css[index] === '{') depth += 1;
  if (css[index] === '}') {
    depth -= 1;
    if (depth === 0) {
      end = index + 1;
      break;
    }
  }
}
assert.notEqual(end, -1, 'The reduced-motion media query must be balanced');
const reducedMotionRules = css.slice(start, end);

function findBrowser(): string {
  const configuredBrowser = process.env.CHROME_BIN?.trim();
  if (configuredBrowser) {
    assert.ok(existsSync(configuredBrowser), `CHROME_BIN does not exist: ${configuredBrowser}`);
    return configuredBrowser;
  }

  for (const candidate of ['chromium', 'google-chrome', 'google-chrome-stable']) {
    const lookup = spawnSync('which', [candidate], { encoding: 'utf8' });
    if (lookup.status === 0 && lookup.stdout.trim()) return lookup.stdout.trim();
  }

  throw new Error('A local Chromium/Chrome executable is required; set CHROME_BIN to its path.');
}

function readComputedStyles(browser: string, preference: 'reduce' | 'default') {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
${reducedMotionRules}
@keyframes motion-probe { from { opacity: 0.4; } to { opacity: 1; } }
.motion-probe {
  animation-name: motion-probe;
  animation-duration: 5s;
  animation-iteration-count: infinite;
  transition-property: opacity;
  transition-duration: 4s;
  scroll-behavior: smooth;
}
</style></head>
<body><div class="motion-probe" id="probe">Static status remains available</div>
<script>
const probe = document.getElementById('probe');
const style = getComputedStyle(probe);
const result = {
  prefersReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  animationDuration: style.animationDuration,
  animationIterationCount: style.animationIterationCount,
  transitionDuration: style.transitionDuration,
  scrollBehavior: style.scrollBehavior,
  statusText: probe.textContent,
};
document.body.dataset.motionTestResult = btoa(JSON.stringify(result));
</script></body></html>`;
  const dataUrl = `data:text/html;base64,${Buffer.from(html).toString('base64')}`;
  const browserArgs = [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--no-first-run',
    '--disable-sync',
    ...(preference === 'reduce' ? ['--force-prefers-reduced-motion=reduce'] : []),
    '--dump-dom',
    dataUrl,
  ];
  const run = spawnSync(browser, browserArgs, { encoding: 'utf8', timeout: 20_000, maxBuffer: 8 * 1024 * 1024 });

  assert.equal(run.error, undefined, `Chromium failed to run: ${run.error?.message ?? ''}`);
  assert.equal(run.status, 0, `Chromium exited with status ${run.status}: ${run.stderr.slice(-2000)}`);
  const encodedResult = run.stdout.match(/data-motion-test-result="([A-Za-z0-9+/=]+)"/)?.[1];
  assert.ok(encodedResult, `Chromium did not return computed styles: ${run.stdout.slice(-2000)}`);
  return JSON.parse(Buffer.from(encodedResult, 'base64').toString('utf8')) as {
    prefersReducedMotion: boolean;
    animationDuration: string;
    animationIterationCount: string;
    transitionDuration: string;
    scrollBehavior: string;
    statusText: string;
  };
}

function durationInMilliseconds(value: string): number {
  const match = value.trim().match(/^([\d.eE+-]+)(ms|s)$/);
  assert.ok(match, `Unexpected computed CSS duration: ${value}`);
  const magnitude = Number(match[1]);
  return match[2] === 's' ? magnitude * 1000 : magnitude;
}

const browser = findBrowser();
const reduced = readComputedStyles(browser, 'reduce');
assert.equal(reduced.prefersReducedMotion, true, 'Chromium must emulate reduced motion');
assert.ok(durationInMilliseconds(reduced.animationDuration) <= 0.010001, 'Reduced motion must minimize animation duration');
assert.equal(reduced.animationIterationCount, '1', 'Reduced motion must prevent repeated animation cycles');
assert.ok(durationInMilliseconds(reduced.transitionDuration) <= 0.010001, 'Reduced motion must minimize transition duration');
assert.equal(reduced.scrollBehavior, 'auto', 'Reduced motion must disable smooth scrolling');
assert.equal(reduced.statusText, 'Static status remains available', 'Static status content must remain available');

const unchanged = readComputedStyles(browser, 'default');
let assertionCount = 6;
let baselineNote = 'host default is no-preference';
if (unchanged.prefersReducedMotion) {
  baselineNote = 'host default requests reduced motion; no-preference baseline checks skipped';
} else {
  assert.equal(unchanged.prefersReducedMotion, false, 'Chromium default must report no-preference');
  assert.equal(durationInMilliseconds(unchanged.animationDuration), 5000, 'Default animation duration must remain unchanged without the preference');
  assert.equal(unchanged.animationIterationCount, 'infinite', 'Default animation iteration must remain unchanged without the preference');
  assert.equal(durationInMilliseconds(unchanged.transitionDuration), 4000, 'Default transition duration must remain unchanged without the preference');
  assert.equal(unchanged.scrollBehavior, 'smooth', 'Default scroll behavior must remain unchanged without the preference');
  assert.equal(unchanged.statusText, 'Static status remains available', 'Static status content must remain available');
  assertionCount += 6;
}

const browserVersion = spawnSync(browser, ['--version'], { encoding: 'utf8' }).stdout.trim();
console.log(`Reduced-motion browser regression: ${assertionCount} computed-style assertions passed (${browserVersion}; ${baselineNote}); isolated data URL only, no API/service access.`);
