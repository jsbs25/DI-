'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  createDownloadManager,
  sanitizeDownloadFilename,
  sanitizeDownloadSource
} = require('./download-manager.cjs');

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
  setSavePath(value) {
    this.savePathCalls.push(value);
    this.savePath = value;
  }
  cancel() {
    this.cancelled = true;
    this.emit('done', {}, 'cancelled');
  }
}

function createHarness() {
  const browserSession = new EventEmitter();
  const ownedContents = { kind: 'synthetic-browser-tab' };
  const changes = [];
  const manager = createDownloadManager({
    browserSession,
    isOwnedContents: contents => contents === ownedContents,
    onChange: downloads => changes.push(downloads)
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
  assert.equal(downloads.length, 1, 'expected exactly one active download record');
  return downloads[0];
}

async function main() {
  assert.equal(sanitizeDownloadFilename('../../private\\fixture.txt'), 'fixture.txt');
  assert.equal(sanitizeDownloadFilename('..'), '未命名下载');
  assert.equal(sanitizeDownloadSource('https://fixture.test/files/book.pdf?token=private#part'), 'https://fixture.test/files/book.pdf');
  assert.equal(sanitizeDownloadSource('file:///tmp/fixture'), null);
  assert.equal(sanitizeDownloadSource('https://user:secret@fixture.test/file'), null);

  // A valid download must remain behind Electron's save dialog by default.
  const permissionHarness = createHarness();
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
  assert.deepEqual(permissionItem.dialogOptions, {
    title: '保存网页下载',
    defaultPath: 'approved-fixture.txt'
  });
  assert.deepEqual(permissionItem.savePathCalls, [], 'production flow must not assign a path before user approval');
  assert.equal(permissionHarness.manager.cancel('/tmp/not-a-download-id').success, false);
  assert.equal(permissionHarness.manager.remove('/tmp/not-a-download-id').success, false);
  assert.equal(permissionHarness.manager.cancel(awaiting.id).success, true);
  const cancelledDialog = findOnlyDownload(permissionHarness.manager);
  assert.equal(cancelledDialog.state, 'cancelled');
  assert.equal(cancelledDialog.savePath, null, 'cancelling the save dialog must not expose an unapproved path');
  permissionHarness.manager.dispose();

  // Simulate a user choosing a location in Electron's native save dialog, then
  // verify progress, completion, and visible-list removal without opening files.
  const successHarness = createHarness();
  const successItem = new SyntheticDownloadItem(
    'https://fixture.test/download/success?token=synthetic-only',
    'fixture-success.txt'
  );
  successHarness.start(successItem);
  const successId = findOnlyDownload(successHarness.manager).id;
  successItem.setSavePath('/tmp/earth-one-test/fixture-success.txt');
  successItem.receivedBytes = 512;
  successItem.totalBytes = 1024;
  successItem.emit('updated', {}, 'progressing');
  const progress = findOnlyDownload(successHarness.manager);
  assert.equal(progress.progress, 50);
  assert.equal(progress.receivedBytes, 512);
  assert.equal(progress.savePath, '/tmp/earth-one-test/fixture-success.txt');
  successItem.receivedBytes = 1024;
  successItem.emit('updated', {}, 'progressing');
  successItem.emit('done', {}, 'completed');
  const completed = findOnlyDownload(successHarness.manager);
  assert.equal(completed.state, 'completed');
  assert.equal(completed.progress, 100);
  assert.equal(successHarness.manager.remove(successId).success, true);
  assert.equal(successHarness.manager.list().length, 0);
  successHarness.manager.dispose();

  // Cancellation accepts only the opaque in-memory ID and terminal records can
  // then be removed without deleting the user-approved file.
  const cancelHarness = createHarness();
  const cancelItem = new SyntheticDownloadItem('https://fixture.test/download/cancel', 'cancel.txt');
  cancelHarness.start(cancelItem);
  const cancelId = findOnlyDownload(cancelHarness.manager).id;
  cancelItem.receivedBytes = 128;
  cancelItem.totalBytes = 1024;
  cancelItem.emit('updated', {}, 'progressing');
  assert.equal(findOnlyDownload(cancelHarness.manager).state, 'progressing');
  assert.equal(cancelHarness.manager.cancel(cancelId).success, true);
  assert.equal(cancelItem.cancelled, true);
  assert.equal(findOnlyDownload(cancelHarness.manager).state, 'cancelled');
  assert.equal(cancelHarness.manager.remove(cancelId).success, true);
  assert.equal(cancelHarness.manager.list().length, 0);
  cancelHarness.manager.dispose();

  // Unsupported protocols, embedded credentials and non-browser WebContents
  // are cancelled before any dialog or visible record is created.
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

  console.log(`DOWNLOAD_MANAGER_TEST_PASS: dialog-default, progress/completion, cancellation, invalid URL rejection, source isolation, ID-only removal, and privacy-safe metadata verified (${permissionHarness.changes.length + successHarness.changes.length + cancelHarness.changes.length} state updates).`);
}

main().catch(error => {
  console.error('DOWNLOAD_MANAGER_TEST_FAIL:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
