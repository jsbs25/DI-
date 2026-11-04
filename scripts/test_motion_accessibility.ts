import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

const checks: Array<[string, RegExp]> = [
  ['covers elements and pseudo-elements', /\*,\s*\*::before,\s*\*::after\s*\{/],
  ['reduces animation duration', /animation-duration:\s*0\.01ms\s*!important;/],
  ['prevents repeated animation cycles', /animation-iteration-count:\s*1\s*!important;/],
  ['reduces transition duration', /transition-duration:\s*0\.01ms\s*!important;/],
  ['disables smooth scrolling', /scroll-behavior:\s*auto\s*!important;/],
];

for (const [description, pattern] of checks) {
  assert.match(reducedMotionRules, pattern, description);
}

console.log(`Reduced-motion stylesheet regression: ${checks.length + 1} passed, 0 failed (static CSS contract; not a browser assistive-technology test).`);
