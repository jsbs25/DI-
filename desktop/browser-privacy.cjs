'use strict';

const CATEGORY_KEYS = Object.freeze([
  'history',
  'bookmarks',
  'downloadRecords',
  'sessionRestore',
  'permissions',
  'siteData'
]);

const TIME_RANGE_MS = Object.freeze({
  all: null,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  fourWeeks: 28 * 24 * 60 * 60 * 1000
});

function normalizeSelection(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (Object.keys(input).some(key => !CATEGORY_KEYS.includes(key))) return null;
  const selection = {};
  for (const key of CATEGORY_KEYS) {
    const value = input[key] ?? false;
    if (typeof value !== 'boolean') return null;
    selection[key] = value;
  }
  return selection;
}

function getCutoff(timeRange, now = Date.now()) {
  if (!Object.prototype.hasOwnProperty.call(TIME_RANGE_MS, timeRange) || !Number.isFinite(now)) return null;
  const duration = TIME_RANGE_MS[timeRange];
  return duration === null ? 0 : Math.max(0, now - duration);
}

function retainHistoryBeforeCutoff(history, since) {
  if (!Array.isArray(history) || !Number.isFinite(since) || since < 0) return null;
  if (since === 0) return [];
  return history.filter(item => Date.parse(item.visitedAt) < since);
}

function createBrowserPrivacyController({
  clearLocalData,
  clearDownloadRecords,
  clearSessionRestore,
  clearPermissions,
  clearSiteData
} = {}) {
  const operations = {
    history: typeof clearLocalData === 'function' ? clearLocalData : null,
    bookmarks: typeof clearLocalData === 'function' ? clearLocalData : null,
    downloadRecords: typeof clearDownloadRecords === 'function' ? clearDownloadRecords : null,
    sessionRestore: typeof clearSessionRestore === 'function' ? clearSessionRestore : null,
    permissions: typeof clearPermissions === 'function' ? clearPermissions : null,
    siteData: typeof clearSiteData === 'function' ? clearSiteData : null
  };

  async function clear(selectionInput, timeRange = 'all', now = Date.now()) {
    const selection = normalizeSelection(selectionInput);
    const since = getCutoff(timeRange, now);
    if (!selection || since === null) {
      return { success: false, changed: false, error: '浏览器数据清除选项无效。', results: {} };
    }
    if (!CATEGORY_KEYS.some(key => selection[key])) {
      return { success: true, changed: false, skipped: true, results: {} };
    }

    const results = {};
    let success = true;
    const run = async (key, operation, argument) => {
      if (!selection[key]) return;
      if (!operation) {
        results[key] = { success: false, error: '此类本机浏览数据清除功能不可用。' };
        success = false;
        return;
      }
      try {
        const result = await operation(argument);
        results[key] = result && typeof result === 'object'
          ? result
          : { success: result !== false };
        if (results[key].success !== true) success = false;
      } catch (error) {
        results[key] = { success: false, error: error?.message || '无法清除此类浏览数据。' };
        success = false;
      }
    };

    if (selection.history || selection.bookmarks) {
      const operation = operations.history || operations.bookmarks;
      let localResult;
      if (!operation) {
        localResult = { success: false, error: '此类本机浏览数据清除功能不可用。' };
      } else {
        try {
          localResult = await operation({
            history: selection.history,
            bookmarks: selection.bookmarks,
            since
          });
        } catch (error) {
          localResult = { success: false, error: error?.message || '无法清除本机浏览记录。' };
        }
      }
      localResult = localResult && typeof localResult === 'object'
        ? localResult
        : { success: localResult !== false };
      results.localData = localResult;
      if (localResult.success !== true) success = false;
      for (const key of ['history', 'bookmarks']) {
        if (!selection[key]) continue;
        results[key] = {
          success: localResult.success === true,
          cleared: localResult.cleared?.[key] ?? 0,
          error: localResult.error
        };
      }
    }
    await run('downloadRecords', operations.downloadRecords, since);
    await run('sessionRestore', operations.sessionRestore);
    await run('permissions', operations.permissions);
    await run('siteData', operations.siteData);

    return { success, changed: true, since, timeRange, results };
  }

  return { clear };
}

module.exports = {
  CATEGORY_KEYS,
  TIME_RANGE_MS,
  createBrowserPrivacyController,
  getCutoff,
  normalizeSelection,
  retainHistoryBeforeCutoff
};
