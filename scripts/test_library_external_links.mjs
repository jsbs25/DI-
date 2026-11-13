import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/library/DigitalLibrary.tsx', import.meta.url), 'utf8');

const providers = [
  {
    name: 'Open Library',
    href: /href=\{`https:\/\/openlibrary\.org\/search\?q=\$\{encodeURIComponent\(searchQuery\.trim\(\)\)\}`\}/,
    accessibleName: /aria-label="在 Open Library 官方网站搜索当前关键词（新标签页）"/,
  },
  {
    name: 'Europeana',
    href: /href=\{`https:\/\/www\.europeana\.eu\/en\/search\?query=\$\{encodeURIComponent\(searchQuery\.trim\(\)\)\}`\}/,
    accessibleName: /aria-label="在 Europeana 官方网站搜索当前关键词（新标签页）"/,
  },
];

for (const provider of providers) {
  assert.match(source, provider.href, `${provider.name} link must include the encoded current search query`);
  assert.match(source, provider.accessibleName, `${provider.name} link must be clearly labeled for assistive technology`);
}

assert.equal((source.match(/target="_blank"/g) || []).length >= 2, true, 'External source links must open separately');
assert.equal((source.match(/rel="noopener noreferrer"/g) || []).length >= 2, true, 'External source links must be isolated from the opener');

console.log(`Library external source links: ${providers.length} provider checks passed.`);
