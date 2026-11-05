'use strict';

const assert = require('node:assert/strict');
const {
  createBrowserPrivacyController,
  getCutoff,
  retainHistoryBeforeCutoff
} = require('./browser-privacy.cjs');
const { BROWSER_SITE_DATA_TYPES } = require('./browser-engine.cjs');

const NOW = Date.parse('2026-11-05T06:00:00.000Z');

function createHarness(overrides = {}) {
  const calls = [];
  const controller = createBrowserPrivacyController({
    clearLocalData: async input => {
      calls.push(['localData', input]);
      return { success: true, cleared: { history: input.history ? 2 : 0, bookmarks: input.bookmarks ? 1 : 0 }, data: { bookmarks: [], history: [] } };
    },
    clearDownloadRecords: async since => {
      calls.push(['downloadRecords', since]);
      return { success: true, cleared: 3, retainedActive: 1 };
    },
    clearSessionRestore: async () => {
      calls.push(['sessionRestore']);
      return { success: true, cleared: 2, enabled: false };
    },
    clearPermissions: async () => {
      calls.push(['permissions']);
      return { success: true, cleared: 2, deniedPending: 1 };
    },
    clearSiteData: async () => {
      calls.push(['siteData']);
      return { success: true, cleared: true, reloadedTabs: 2 };
    },
    ...overrides
  });
  return { controller, calls };
}

async function main() {
  assert.deepEqual(BROWSER_SITE_DATA_TYPES, [
    'backgroundFetch', 'cache', 'cookies', 'fileSystems', 'indexedDB', 'localStorage', 'serviceWorkers', 'webSQL'
  ], 'site-data clearing uses an explicit Chromium storage allowlist and excludes unrelated app/account data');
  assert.equal(getCutoff('all', NOW), 0, 'all time uses the explicit zero sentinel, interpreted by each store as no cutoff');
  assert.equal(getCutoff('hour', NOW), NOW - 60 * 60 * 1000);
  assert.equal(getCutoff('day', NOW), NOW - 24 * 60 * 60 * 1000);
  assert.equal(getCutoff('week', NOW), NOW - 7 * 24 * 60 * 60 * 1000);
  assert.equal(getCutoff('fourWeeks', NOW), NOW - 28 * 24 * 60 * 60 * 1000);
  assert.equal(getCutoff('unsupported', NOW), null);
  const dayCutoff = NOW - 24 * 60 * 60 * 1000;
  const historyFixture = [
    { id: 'older', visitedAt: new Date(dayCutoff - 1).toISOString() },
    { id: 'exact', visitedAt: new Date(dayCutoff).toISOString() },
    { id: 'newer', visitedAt: new Date(dayCutoff + 1).toISOString() }
  ];
  assert.deepEqual(retainHistoryBeforeCutoff(historyFixture, dayCutoff).map(item => item.id), ['older'],
    'bounded clearing removes records exactly at or newer than the cutoff');
  assert.deepEqual(retainHistoryBeforeCutoff(historyFixture, 0), [], 'all-time clearing removes every dated history entry');
  assert.equal(retainHistoryBeforeCutoff(historyFixture, -1), null, 'invalid history cutoff is rejected instead of clearing');

  const noOp = createHarness();
  const noSelection = await noOp.controller.clear({}, 'all', NOW);
  assert.deepEqual(noSelection, { success: true, changed: false, skipped: true, results: {} }, 'cancelling before confirmation is a no-op');
  assert.deepEqual(noOp.calls, [], 'a no-op must not touch any data store');

  const historyOnly = createHarness();
  const historyResult = await historyOnly.controller.clear({ history: true }, 'day', NOW);
  assert.deepEqual(historyOnly.calls, [['localData', { history: true, bookmarks: false, since: NOW - 24 * 60 * 60 * 1000 }]], 'history selection uses its supported time cutoff and does not clear bookmarks');
  assert.deepEqual(historyResult.results.history, { success: true, cleared: 2, error: undefined });
  assert.equal('bookmarks' in historyResult.results, false);
  assert.equal('downloadRecords' in historyResult.results, false);

  const bookmarksOnly = createHarness();
  const bookmarksResult = await bookmarksOnly.controller.clear({ bookmarks: true }, 'week', NOW);
  assert.deepEqual(bookmarksOnly.calls, [['localData', { history: false, bookmarks: true, since: NOW - 7 * 24 * 60 * 60 * 1000 }]], 'bookmark-only clearing does not clear history despite the selected time range');
  assert.deepEqual(bookmarksResult.results.bookmarks, { success: true, cleared: 1, error: undefined });
  assert.equal('history' in bookmarksResult.results, false);

  const downloadsOnly = createHarness();
  const downloadsResult = await downloadsOnly.controller.clear({ downloadRecords: true }, 'fourWeeks', NOW);
  assert.deepEqual(downloadsOnly.calls, [['downloadRecords', NOW - 28 * 24 * 60 * 60 * 1000]], 'download-history clearing receives only the selected cutoff');
  assert.deepEqual(downloadsResult.results.downloadRecords, { success: true, cleared: 3, retainedActive: 1 });

  const allTime = createHarness();
  const allTimeResult = await allTime.controller.clear({ history: true, downloadRecords: true }, 'all', NOW);
  assert.deepEqual(allTime.calls, [
    ['localData', { history: true, bookmarks: false, since: 0 }],
    ['downloadRecords', 0]
  ], 'all-time clearing must pass the explicit zero sentinel to both timestamped stores');
  assert.equal(allTimeResult.success, true);

  for (const [category, expectedCall] of [
    ['sessionRestore', ['sessionRestore']],
    ['permissions', ['permissions']],
    ['siteData', ['siteData']]
  ]) {
    const isolated = createHarness();
    const result = await isolated.controller.clear({ [category]: true }, 'all', NOW);
    assert.deepEqual(isolated.calls, [expectedCall], `${category} selection must not invoke unrelated stores`);
    assert.equal(result.results[category].success, true);
    for (const other of ['history', 'bookmarks', 'downloadRecords', 'sessionRestore', 'permissions', 'siteData']) {
      if (other !== category) assert.equal(other in result.results, false, `${category} must leave ${other} unselected`);
    }
  }

  const allSelected = createHarness();
  const allResult = await allSelected.controller.clear({
    history: true,
    bookmarks: true,
    downloadRecords: true,
    sessionRestore: true,
    permissions: true,
    siteData: true
  }, 'hour', NOW);
  assert.deepEqual(allSelected.calls.map(call => call[0]), ['localData', 'downloadRecords', 'sessionRestore', 'permissions', 'siteData']);
  assert.equal(allSelected.calls[0][1].history, true);
  assert.equal(allSelected.calls[0][1].bookmarks, true);
  assert.equal(allSelected.calls[1][1], NOW - 60 * 60 * 1000);
  assert.equal(allResult.success, true);
  assert.equal(allResult.changed, true);
  assert.equal(allResult.results.localData.data.bookmarks.length, 0, 'local data may be returned to the app renderer only to update local state');

  const invalid = createHarness();
  assert.equal((await invalid.controller.clear({ siteData: 'true' }, 'all', NOW)).success, false);
  assert.equal((await invalid.controller.clear({ unknownCategory: true }, 'all', NOW)).success, false);
  assert.equal((await invalid.controller.clear({ siteData: true }, 'unsupported', NOW)).success, false);
  assert.deepEqual(invalid.calls, [], 'invalid requests must not invoke any data operation');

  const partial = createHarness({ clearSiteData: async () => { throw new Error('synthetic site-data failure'); } });
  const partialResult = await partial.controller.clear({ history: true, siteData: true }, 'all', NOW);
  assert.equal(partialResult.success, false, 'partial failure must never be reported as full success');
  assert.equal(partialResult.results.history.success, true);
  assert.equal(partialResult.results.siteData.success, false);
  assert.match(partialResult.results.siteData.error, /synthetic site-data failure/);

  console.log('BROWSER_PRIVACY_TEST_PASS: category isolation, all supported time cutoffs, no-op/cancellation, invalid input, and partial failures verified.');
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
