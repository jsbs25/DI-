import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.ok(html.includes('id="root"'), 'Root element must be present in index.html');

const introPath = new URL('../src/components/intro/CinematicIntro.tsx', import.meta.url);
assert.ok(existsSync(introPath), 'CinematicIntro.tsx must exist');

const introContent = readFileSync(introPath, 'utf8');
assert.ok(introContent.includes('hyperspace'), 'Intro must contain hyperspace scene');
assert.ok(introContent.includes('digitalEarth'), 'Intro must contain digitalEarth scene');
assert.ok(introContent.includes('cosmic'), 'Intro must contain cosmic scene');

console.log('Startup splash regression: 4 passed, 0 failed (CinematicIntro upgraded).');
