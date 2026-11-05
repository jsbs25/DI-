import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const startupScript = html.match(/<script>\s*\(function\(\) \{[\s\S]*?\}\)\(\);\s*<\/script>/)?.[0];
assert.ok(startupScript, 'Startup script must be present');

const checks = [
  ['startup no longer waits for manual initialization or identity input', () => {
    assert.doesNotMatch(html, /boot-start-btn|boot-trigger|boot-password|IDENTITY_PASSWORD/);
    assert.match(html, /schedule\(\(\) => \{\s*stageLogo\.classList\.add\('boot-hidden'\)/);
    const startupDelay = Number(startupScript.match(/stageLogo\.classList\.add\('boot-hidden'\)[\s\S]*?\}, (\d+)\);/)?.[1]);
    const stepDelay = Number(startupScript.match(/schedule\(\(\) => runStep\(index \+ 1\), (\d+)\);/)?.[1]);
    const finishDelay = Number(startupScript.match(/schedule\(\(\) => finishBoot\(\), (\d+)\);/)?.[1]);
    const fadeDelay = Number(startupScript.match(/setTimeout\(\(\) => splash\.remove\(\), (\d+)\);/)?.[1]);
    assert.ok([startupDelay, stepDelay, finishDelay, fadeDelay].every(Number.isFinite));
    assert.ok(startupDelay + stepDelay + finishDelay + fadeDelay <= 1500, 'Main content must appear within 1.5 seconds');
  }],
  ['skip is a labeled, keyboard-accessible button', () => {
    assert.match(html, /<button id="boot-skip"[^>]*type="button"[^>]*aria-label=/);
    assert.match(html, /\.boot-skip-btn:focus-visible/);
    assert.match(html, /event\.key === 'Escape'/);
    assert.match(html, /min-width: 44px; min-height: 44px/);
  }],
  ['startup progress is exposed to assistive technology', () => {
    assert.match(html, /role="status" aria-live="polite"/);
    assert.match(html, /role="progressbar"[^>]*aria-valuemin="0" aria-valuemax="100"/);
    assert.match(html, /progress\.setAttribute\('aria-valuenow'/);
  }],
  ['reduced motion skips the splash and disables its animations', () => {
    assert.match(html, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(html, /if \(reducedMotion\) \{\s*finishBoot\(true\)/);
    assert.match(html, /animation: none !important;\s*transition: none !important;/);
  }],
  ['decorative work is reduced on mobile and startup does not play unsolicited audio', () => {
    assert.match(html, /max-width: 480px/);
    assert.match(html, /max-width: 768px/);
    assert.match(html, /for \(let i = 0; i < 18; i\+\+\)/);
    assert.doesNotMatch(html, /speechSynthesis|AudioContext|playBootHum/);
  }],
];

for (const [description, check] of checks) {
  check();
  console.log(`PASS ${description}`);
}

console.log(`Startup splash regression: ${checks.length} passed, 0 failed.`);
