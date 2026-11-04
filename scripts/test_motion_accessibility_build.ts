import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const assetsDirectory = fileURLToPath(new URL('../dist/assets/', import.meta.url));
const cssFiles = readdirSync(assetsDirectory).filter((file) => file.endsWith('.css'));
assert.ok(cssFiles.length > 0, 'No built CSS found; run npm run build first');

const productionCss = cssFiles
  .map((file) => readFileSync(new URL(`../dist/assets/${file}`, import.meta.url), 'utf8'))
  .join('\n');
const mediaQuery = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/;
const start = productionCss.search(mediaQuery);
assert.notEqual(start, -1, 'The production CSS must retain the reduced-motion media query');

const openingBrace = productionCss.indexOf('{', start);
assert.notEqual(openingBrace, -1, 'The reduced-motion media query must open');
let depth = 0;
let end = -1;
for (let index = openingBrace; index < productionCss.length; index += 1) {
  if (productionCss[index] === '{') depth += 1;
  if (productionCss[index] === '}') {
    depth -= 1;
    if (depth === 0) {
      end = index + 1;
      break;
    }
  }
}
assert.notEqual(end, -1, 'The production reduced-motion media query must be balanced');
const reducedMotionRules = productionCss.slice(start, end);

const checks: Array<[string, RegExp]> = [
  ['covers elements and pseudo-elements', /\*,\s*::?before,\s*::?after\s*\{/],
  ['minimizes animation duration', /animation-duration:\s*(?:0?\.)?01ms\s*!important;/],
  ['limits animation iteration count', /animation-iteration-count:\s*1\s*!important;?/],
  ['minimizes transition duration', /transition-duration:\s*(?:0?\.)?01ms\s*!important;/],
  ['disables smooth scrolling', /scroll-behavior:\s*auto\s*!important;/],
];

for (const [description, pattern] of checks) {
  assert.match(reducedMotionRules, pattern, description);
}

console.log(`Reduced-motion production CSS regression: ${checks.length + 4} assertions passed across ${cssFiles.length} built stylesheet(s).`);
