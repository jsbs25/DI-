import assert from 'node:assert/strict';
import { normalizeCanonicalUrl } from '../server/discovery/deduplication/urlNormalizer.ts';
import { parseRssOrAtomXml } from '../server/discovery/connectors/rssConnector.ts';
import { discoveryDb } from '../server/discovery/database/db.ts';
import { executeUnifiedSearch } from '../server/discovery/search/unifiedSearchEngine.ts';

let passed = 0;
function check(condition: boolean, desc: string) {
  assert.ok(condition, desc);
  passed++;
  console.log(`PASS: ${desc}`);
}

async function runTests() {
  console.log('--- Starting Discovery Engine Regression Suite ---');

  // 1. URL Normalization
  const norm1 = normalizeCanonicalUrl('https://www.example.com/path/?utm_source=twitter&ref=abc#section');
  check(norm1.canonicalUrl === 'https://example.com/path', 'URL normalizer strips www, tracking params, and fragments');
  check(norm1.domain === 'example.com', 'URL normalizer extracts domain');

  const norm2 = normalizeCanonicalUrl('http://example.com:80/path?b=2&a=1&utm_medium=email');
  check(norm2.canonicalUrl === 'http://example.com/path?a=1&b=2', 'URL normalizer strips default port 80 and sorts clean query params');

  // 2. RSS / Atom Parser
  const sampleRss = `
    <rss version="2.0">
      <channel>
        <title>Tech News</title>
        <item>
          <title><![CDATA[Quantum Computing Milestone]]></title>
          <link>https://tech.example.com/quantum?utm_campaign=feed</link>
          <description>Researchers achieve quantum supremacy benchmark.</description>
          <category>Quantum</category>
          <pubDate>Mon, 09 Nov 2026 00:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>
  `;
  const rssItems = parseRssOrAtomXml(sampleRss);
  check(rssItems.length === 1, 'RSS parser extracts item');
  check(rssItems[0].title === 'Quantum Computing Milestone', 'RSS parser strips CDATA');
  check(rssItems[0].link === 'https://tech.example.com/quantum?utm_campaign=feed', 'RSS parser extracts link');

  // 3. Database & Deduplication
  const testId = `test_${Date.now()}`;
  const testUrl = `https://ai.example.org/${testId}?spm=123.456&utm_source=news`;
  const ins1 = discoveryDb.insertOrUpdateResource({
    url: testUrl,
    name: `Model ${testId} Super AI`,
    description: 'An advanced transformer model',
    primaryPlanet: 'sun',
    category: 'models',
    tags: ['ai', 'transformer']
  });
  check(ins1.isNew === true, 'First insert of new URL marks isNew: true');
  check(ins1.resource.canonicalUrl === `https://ai.example.org/${testId}`, 'Canonical URL is cleaned in database');

  const ins2 = discoveryDb.insertOrUpdateResource({
    url: `https://ai.example.org/${testId}?ref=friend`,
    name: `Model ${testId} Super AI (Updated Edition)`,
    primaryPlanet: 'sun',
    planets: ['sun', 'uranus'],
    tags: ['ai', 'neural']
  });
  check(ins2.isNew === false, 'Duplicate canonical URL recognized, prevents duplicate');
  check(ins2.resource.name === `Model ${testId} Super AI (Updated Edition)`, 'Updated name is recorded');
  check(ins2.resource.planets.includes('uranus'), 'Multi-planet association is merged');

  // 4. FTS5 Full Text Search
  const ftsResult = discoveryDb.searchResources({ q: 'Super AI' });
  check(ftsResult.items.some(i => i.id === ins1.resource.id), 'FTS5 matches item by full-text keyword query');

  const planetFilterResult = discoveryDb.searchResources({ planet: 'sun' });
  check(planetFilterResult.total >= 1, 'Planet filtering accurately returns resources for sun');

  // 5. Planet Stats
  const stats = discoveryDb.getPlanetStats();
  check(stats.sun >= 1 && stats.saturn >= 1, 'Planet stats counts are accurately calculated');

  // 6. Unified Search Engine Orchestration
  const searchRes = await executeUnifiedSearch({ q: '维基百科', planet: 'jupiter' });
  check(searchRes.success === true, 'Unified search succeeds');
  check(searchRes.items.length >= 1, 'Unified search returns matched encyclopedia items');

  console.log(`\nAll ${passed} Discovery Engine checks PASSED successfully!`);
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
