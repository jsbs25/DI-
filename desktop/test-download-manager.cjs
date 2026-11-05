'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const {
  createDownloadManager,
  sanitizeDownloadFilename,
  sanitizeDownloadSource
} = require('./download-manager.cjs');
const { MAX_DOWNLOAD_RECORDS, createDownloadStore } = require('./download-store.cjs');

class SyntheticDownloadItem extends EventEmitter {
  constructor(url, filename) {
    super();
    this.url = url;
    this.filename = filename;
    this.savePath = '';
    this.receivedBytes = 0;
    this.totalBytes = 0;
    this.dialogOptions = null;
    this.savePathCalls = [];
    this.cancelled = false;
  }

  getURL() { return this.url; }
  getFilename() { return this.filename; }
  getSavePath() { return this.savePath; }
  getReceivedBytes() { return this.receivedBytes; }
  getTotalBytes() { return this.totalBytes; }
  setSaveDialogOptions(options) { this.dialogOptions = options; }
  setSavePath(value) { this.savePathCalls.push(value); this.savePath = value; }
  cancel() { this.cancelled = true; this.emit('done', {}, 'cancelled'); }
}

function createHarness({ store = null, isSavePathAvailable } = {}) {
  const browserSession = new EventEmitter();
  const ownedContents = { kind: 'synthetic-browser-tab' };
  const changes = [];
  const manager = createDownloadManager({
    browserSession,
    isOwnedContents: contents => contents === ownedContents,
    onChange: downloads => changes.push(downloads),
    store,
    isSavePathAvailable
  });
  return {
    browserSession,
    ownedContents,
    changes,
    manager,
    start(item, contents = ownedContents) {
      browserSession.emit('will-download', { preventDefault() {} }, item, contents);
    }
  };
}

function findOnlyDownload(manager) {
  const downloads = manager.list();
  assert.equal(downloads.length, 1, 'expected exactly one download record');
  return downloads[0];
}

function createStoredRecord(index, startedAt = new Date(Date.now() - index * 1000).toISOString()) {
  return {
    id: randomUUID(),
    filename: `fixture-${index}.txt`,
    source: `https://fixture.test/files/${index}.txt?token=not-stored`,
    state: 'completed',
    receivedBytes: 10,
    totalBytes: 10,
    savePath: path.join(os.tmpdir(), `earth-one-fixture-${index}.txt`),
    startedAt
  };
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'earth-one-download-manager-test-'));
  try {
    assert.equal(sanitizeDownloadFilename('../../private\\fixture.txt'), 'fixture.txt');
    assert.equal(sanitizeDownloadFilename('..'), '未命名下载');
    assert.equal(sanitizeDownloadSource('https://fixture.test/files/book.pdf?token=private#part'), 'https://fixture.test/files/book.pdf');
    assert.equal(sanitizeDownloadSource('file:///tmp/fixture'), null);
    assert.equal(sanitizeDownloadSource('https://user:secret@fixture.test/file'), null);

    // Downloads remain pending until the native save dialog supplies an approved absolute path.
    const storePath = path.join(tempRoot, 'profile', 'earth-one-downloads.json');
    const store = createDownloadStore(storePath);
    assert.deepEqual(store.load(), { records: [], readOnly: false, warning: null });
    const permissionHarness = createHarness({ store });
    const permissionItem = new SyntheticDownloadItem(
      'http://127.0.0.1:4177/download?token=synthetic-only',
      'folder\\approved-fixture.txt'
    );
    permissionHarness.start(permissionItem);
    const awaiting = findOnlyDownload(permissionHarness.manager);
    assert.equal(awaiting.state, 'awaiting-save');
    assert.equal(awaiting.filename, 'approved-fixture.txt');
    assert.equal(awaiting.source, 'http://127.0.0.1:4177/download');
    assert.equal(awaiting.savePath, null);
    assert.equal(awaiting.fileAvailable, false);
    assert.deepEqual(permissionItem.dialogOptions, {
      title: '保存网页下载',
      defaultPath: 'approved-fixture.txt'
    });
    assert.deepEqual(permissionItem.savePathCalls, [], 'production flow must not assign a path before user approval');
    assert.equal(permissionHarness.manager.cancel('/tmp/not-a-download-id').success, false);
    assert.equal(permissionHarness.manager.remove('/tmp/not-a-download-id').success, false);
    assert.equal(permissionHarness.manager.cancel(awaiting.id).success, true);
    assert.equal(findOnlyDownload(permissionHarness.manager).savePath, null, 'cancelled save dialog must not reveal a path');
    assert.deepEqual(store.load().records, [], 'unapproved/cancelled downloads must not be persisted');
    permissionHarness.manager.dispose();

    // A user-approved path is stored locally and restored as interrupted if the app restarts mid-download.
    const approvedPath = path.join(tempRoot, 'approved', 'fixture-progress.txt');
    fs.mkdirSync(path.dirname(approvedPath), { recursive: true });
    fs.writeFileSync(approvedPath, 'synthetic partial file\n');
    const restoreStore = createDownloadStore(storePath);
    const firstRun = createHarness({ store: restoreStore });
    const approvedItem = new SyntheticDownloadItem('https://fixture.test/download/progress?token=private', 'fixture-progress.txt');
    firstRun.start(approvedItem);
    const approvedId = findOnlyDownload(firstRun.manager).id;
    approvedItem.setSavePath(approvedPath);
    approvedItem.receivedBytes = 4;
    approvedItem.totalBytes = 8;
    approvedItem.emit('updated', {}, 'progressing');
    assert.equal(findOnlyDownload(firstRun.manager).savePath, approvedPath);
    assert.equal(findOnlyDownload(firstRun.manager).fileAvailable, true);
    const storedText = fs.readFileSync(storePath, 'utf8');
    assert.ok(storedText.includes(approvedPath), 'only approved local save path is stored in the user-data file');
    assert.ok(!storedText.includes('token=private'), 'download query tokens must be stripped before local persistence');
    assert.ok(!storedText.includes('synthetic-only'), 'cancelled save dialog metadata must not be persisted');

    const restarted = createHarness({ store: createDownloadStore(storePath) });
    const restored = findOnlyDownload(restarted.manager);
    assert.equal(restored.id, approvedId);
    assert.equal(restored.state, 'interrupted', 'an active transfer must not appear completed after restart');
    assert.equal(restored.fileAvailable, true);
    restarted.manager.dispose();
    firstRun.manager.dispose();

    // Completed records can be removed or cleared without deleting their files.
    const clearStorePath = path.join(tempRoot, 'clear-profile', 'earth-one-downloads.json');
    const clearHarness = createHarness({ store: createDownloadStore(clearStorePath) });
    const completedPath = path.join(tempRoot, 'completed.txt');
    fs.writeFileSync(completedPath, 'keep this file\n');
    const completedItem = new SyntheticDownloadItem('https://fixture.test/download/success?token=synthetic-only', 'fixture-success.txt');
    clearHarness.start(completedItem);
    const completedId = findOnlyDownload(clearHarness.manager).id;
    completedItem.setSavePath(completedPath);
    completedItem.receivedBytes = 512;
    completedItem.totalBytes = 512;
    completedItem.emit('updated', {}, 'progressing');
    completedItem.emit('done', {}, 'completed');
    const completed = findOnlyDownload(clearHarness.manager);
    assert.equal(completed.state, 'completed');
    assert.equal(completed.progress, 100);
    assert.equal(clearHarness.manager.remove(completedId).success, true);
    assert.equal(clearHarness.manager.list().length, 0);
    assert.equal(fs.existsSync(completedPath), true, 'removing a record must not delete the file');

    // Clear removes only terminal metadata and leaves live transfers and files untouched.
    const keepPath = path.join(tempRoot, 'clear-keeps-file.txt');
    fs.writeFileSync(keepPath, 'still here\n');
    const clearAgainItem = new SyntheticDownloadItem('https://fixture.test/download/clear', 'clear.txt');
    clearHarness.start(clearAgainItem);
    clearAgainItem.setSavePath(keepPath);
    clearAgainItem.receivedBytes = 1;
    clearAgainItem.totalBytes = 2;
    clearAgainItem.emit('updated', {}, 'progressing');
    clearAgainItem.emit('done', {}, 'completed');
    const activePath = path.join(tempRoot, 'active-file.txt');
    fs.writeFileSync(activePath, 'partial but user-approved\n');
    const activeItem = new SyntheticDownloadItem('https://fixture.test/download/active', 'active.txt');
    clearHarness.start(activeItem);
    const activeId = clearHarness.manager.list().find(record => record.filename === 'active.txt').id;
    activeItem.setSavePath(activePath);
    activeItem.receivedBytes = 1;
    activeItem.totalBytes = 4;
    activeItem.emit('updated', {}, 'progressing');
    assert.equal(clearHarness.manager.clearTerminal().success, true);
    assert.equal(clearHarness.manager.list().length, 1, 'clearing finished history must preserve a live transfer');
    assert.equal(findOnlyDownload(clearHarness.manager).state, 'progressing');
    assert.equal(activeItem.cancelled, false, 'clearing history must not cancel active transfers');
    assert.equal(fs.existsSync(keepPath), true, 'clearing history must not delete downloaded files');
    assert.equal(clearHarness.manager.cancel(activeId).success, true);
    assert.equal(fs.existsSync(activePath), true, 'cancelling a transfer must not delete its partial file');
    clearHarness.manager.dispose();

    const scopedStorePath = path.join(tempRoot, 'scoped-profile', 'earth-one-downloads.json');
    const scopedStore = createDownloadStore(scopedStorePath);
    const scopedNow = Date.now();
    const scopedCutoff = scopedNow - 24 * 60 * 60 * 1000;
    const recentRecordPath = path.join(tempRoot, 'recent-record-file.txt');
    const olderRecordPath = path.join(tempRoot, 'older-record-file.txt');
    const activeRecordPath = path.join(tempRoot, 'active-record-file.txt');
    fs.writeFileSync(recentRecordPath, 'recent file remains\n');
    fs.writeFileSync(olderRecordPath, 'older file remains\n');
    fs.writeFileSync(activeRecordPath, 'active file remains\n');
    const recentRecord = { ...createStoredRecord(11, new Date(scopedNow - 60 * 60 * 1000).toISOString()), savePath: recentRecordPath };
    const olderRecord = { ...createStoredRecord(12, new Date(scopedNow - 3 * 24 * 60 * 60 * 1000).toISOString()), savePath: olderRecordPath };
    const exactlyAtCutoff = createStoredRecord(13, new Date(scopedCutoff).toISOString());
    const oneMillisecondBeforeCutoff = createStoredRecord(14, new Date(scopedCutoff - 1).toISOString());
    const oneMillisecondAfterCutoff = createStoredRecord(15, new Date(scopedCutoff + 1).toISOString());
    assert.equal(scopedStore.save([recentRecord, olderRecord, exactlyAtCutoff, oneMillisecondBeforeCutoff, oneMillisecondAfterCutoff]).success, true);
    const scopedHarness = createHarness({ store: createDownloadStore(scopedStorePath) });
    const scopedActiveItem = new SyntheticDownloadItem('https://fixture.test/active-scope', 'active-record.txt');
    scopedHarness.start(scopedActiveItem);
    scopedActiveItem.setSavePath(activeRecordPath);
    scopedActiveItem.receivedBytes = 4;
    scopedActiveItem.totalBytes = 10;
    scopedActiveItem.emit('updated', {}, 'progressing');
    const scopedActiveRecord = scopedHarness.manager.list().find(record => record.state === 'progressing');
    assert.ok(scopedActiveRecord, 'fixture includes a genuine in-progress download record');
    const scopedClear = scopedHarness.manager.clearTerminalSince(scopedCutoff);
    assert.deepEqual(scopedClear, { success: true, cleared: 3 }, 'the cutoff itself and newer terminal records are included');
    assert.deepEqual(new Set(scopedHarness.manager.list().map(record => record.id)),
      new Set([olderRecord.id, oneMillisecondBeforeCutoff.id, scopedActiveRecord.id]), 'only older records and the active download are retained');
    assert.equal(fs.existsSync(recentRecordPath), true, 'time-scoped clearing never deletes the recent downloaded file');
    assert.equal(fs.existsSync(olderRecordPath), true, 'time-scoped clearing never deletes the older downloaded file');
    const allTimeClear = scopedHarness.manager.clearTerminalSince(0);
    assert.deepEqual(allTimeClear, { success: true, cleared: 2 }, 'zero cutoff removes every remaining terminal record');
    assert.deepEqual(scopedHarness.manager.list().map(record => record.id), [scopedActiveRecord.id], 'all-time clearing still retains an active download record');
    assert.equal(fs.existsSync(recentRecordPath), true, 'all-time record clearing never deletes the recent downloaded file');
    assert.equal(fs.existsSync(olderRecordPath), true, 'all-time record clearing never deletes the older downloaded file');
    assert.equal(fs.existsSync(activeRecordPath), true, 'clearing history never deletes an active download file');
    assert.equal(scopedHarness.manager.clearTerminalSince(-1).success, false, 'invalid cutoff is rejected without clearing records');
    scopedHarness.manager.dispose();

    // A path that was approved but later disappears is retained as unavailable history.
    const missingStorePath = path.join(tempRoot, 'missing-profile', 'earth-one-downloads.json');
    const missingPath = path.join(tempRoot, 'deleted-after-download.txt');
    fs.writeFileSync(missingPath, 'present after approval\n');
    const missingHarness = createHarness({ store: createDownloadStore(missingStorePath) });
    const missingItem = new SyntheticDownloadItem('https://fixture.test/download/missing', 'missing.txt');
    missingHarness.start(missingItem);
    missingItem.setSavePath(missingPath);
    missingItem.receivedBytes = 3;
    missingItem.totalBytes = 3;
    missingItem.emit('updated', {}, 'progressing');
    missingItem.emit('done', {}, 'completed');
    assert.equal(findOnlyDownload(missingHarness.manager).fileAvailable, true);
    fs.rmSync(missingPath);
    assert.equal(findOnlyDownload(missingHarness.manager).fileAvailable, false);
    missingHarness.manager.dispose();

    // Corrupt stores fail closed and are never overwritten by clear/save operations.
    const corruptPath = path.join(tempRoot, 'corrupt-profile', 'earth-one-downloads.json');
    fs.mkdirSync(path.dirname(corruptPath), { recursive: true });
    fs.writeFileSync(corruptPath, '{broken json', 'utf8');
    const corruptBefore = fs.readFileSync(corruptPath, 'utf8');
    const corruptStore = createDownloadStore(corruptPath);
    const corruptLoad = corruptStore.load();
    assert.equal(corruptLoad.readOnly, true);
    assert.deepEqual(corruptLoad.records, []);
    assert.equal(corruptStore.save([]).success, false);
    const corruptHarness = createHarness({ store: createDownloadStore(corruptPath) });
    assert.equal(corruptHarness.manager.getStorageStatus().readOnly, true);
    assert.equal(corruptHarness.manager.clearTerminal().success, false);
    assert.equal(fs.readFileSync(corruptPath, 'utf8'), corruptBefore, 'corrupt source file must remain unchanged');
    corruptHarness.manager.dispose();

    // Failed writes must roll back UI changes rather than make records disappear until restart.
    const writeFailurePath = path.join(tempRoot, 'write-failure-profile', 'earth-one-downloads.json');
    const writeFailureBase = createDownloadStore(writeFailurePath);
    const rollbackFileOne = path.join(tempRoot, 'rollback-one.txt');
    const rollbackFileTwo = path.join(tempRoot, 'rollback-two.txt');
    fs.writeFileSync(rollbackFileOne, 'keep one\n');
    fs.writeFileSync(rollbackFileTwo, 'keep two\n');
    const seededRecords = [
      { ...createStoredRecord(1), savePath: rollbackFileOne },
      { ...createStoredRecord(2), savePath: rollbackFileTwo }
    ];
    assert.equal(writeFailureBase.save(seededRecords).success, true);
    const diskBeforeFailure = fs.readFileSync(writeFailurePath, 'utf8');
    const failingStore = () => ({
      load: () => writeFailureBase.load(),
      save: () => ({ success: false, error: 'synthetic disk write failure' })
    });
    const removeFailureHarness = createHarness({ store: failingStore() });
    const removeFailureId = removeFailureHarness.manager.list()[0].id;
    const failedRemove = removeFailureHarness.manager.remove(removeFailureId);
    assert.equal(failedRemove.success, false);
    assert.equal(removeFailureHarness.manager.list().length, 2, 'failed remove must restore the in-memory record');
    assert.match(removeFailureHarness.manager.getStorageStatus().warning, /synthetic disk write failure/);
    assert.equal(fs.readFileSync(writeFailurePath, 'utf8'), diskBeforeFailure, 'failed atomic save leaves prior store intact');
    assert.equal(fs.existsSync(rollbackFileOne) && fs.existsSync(rollbackFileTwo), true, 'failed metadata operations never delete files');
    removeFailureHarness.manager.dispose();

    const clearFailureHarness = createHarness({ store: failingStore() });
    const failedClear = clearFailureHarness.manager.clearTerminal();
    assert.equal(failedClear.success, false);
    assert.equal(failedClear.cleared, 0);
    assert.equal(clearFailureHarness.manager.list().length, 2, 'failed clear must restore all in-memory records');
    assert.equal(fs.readFileSync(writeFailurePath, 'utf8'), diskBeforeFailure);
    assert.equal(fs.existsSync(rollbackFileOne) && fs.existsSync(rollbackFileTwo), true);
    clearFailureHarness.manager.dispose();

    // Store bounds and malformed-entry rejection.
    const boundedPath = path.join(tempRoot, 'bounded-profile', 'earth-one-downloads.json');
    const boundedStore = createDownloadStore(boundedPath);
    const manyRecords = Array.from({ length: MAX_DOWNLOAD_RECORDS + 8 }, (_, index) => createStoredRecord(index));
    assert.equal(boundedStore.save(manyRecords).success, true);
    assert.equal(boundedStore.load().records.length, MAX_DOWNLOAD_RECORDS, 'only the latest 50 records are kept');
    const malformedPath = path.join(tempRoot, 'malformed-profile', 'earth-one-downloads.json');
    const malformedStore = createDownloadStore(malformedPath);
    assert.equal(malformedStore.save([{ ...createStoredRecord(1), savePath: 'relative/path.txt' }]).success, false);

    // Unsupported protocols, credentials, and foreign WebContents are rejected before a dialog is shown.
    for (const invalidUrl of [
      'file:///tmp/should-not-save',
      'javascript:alert(1)',
      'https://user:secret@fixture.test/private'
    ]) {
      const invalidHarness = createHarness();
      const invalidItem = new SyntheticDownloadItem(invalidUrl, 'blocked.txt');
      invalidHarness.start(invalidItem);
      assert.equal(invalidItem.cancelled, true, `invalid URL should be cancelled: ${invalidUrl}`);
      assert.equal(invalidItem.dialogOptions, null);
      assert.equal(invalidHarness.manager.list().length, 0);
      invalidHarness.manager.dispose();
    }

    const foreignHarness = createHarness();
    const foreignItem = new SyntheticDownloadItem('https://fixture.test/foreign', 'foreign.txt');
    foreignHarness.start(foreignItem, { kind: 'not-a-browser-tab' });
    assert.equal(foreignItem.cancelled, true);
    assert.equal(foreignHarness.manager.list().length, 0);
    foreignHarness.manager.dispose();

    console.log('DOWNLOAD_MANAGER_TEST_PASS: local-only restart restore, explicit path approval, corrupt-store protection, 50-record bound, missing-file validation, list-only remove/clear, URL guard, source isolation, and token sanitization verified.');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error('DOWNLOAD_MANAGER_TEST_FAIL:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
