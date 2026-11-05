'use strict';

const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DOWNLOAD_ID_PATTERN = /^[a-f0-9-]{36}$/i;
const MAX_DOWNLOADS = 100;
const TERMINAL_STATES = new Set(['completed', 'cancelled', 'interrupted']);
const ACTIVE_STATES = new Set(['awaiting-save', 'progressing', 'cancelling']);

function sanitizeDownloadSource(value) {
  if (typeof value !== 'string' || value.length > 8192) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname || url.username || url.password) {
      return null;
    }
    // Query strings and fragments may contain access tokens; never retain them.
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return null;
  }
}

function sanitizeDownloadFilename(value) {
  if (typeof value !== 'string') return '未命名下载';
  const filename = value
    .replace(/[\\/]+/g, '/')
    .split('/')
    .pop()
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 255);
  return filename && filename !== '.' && filename !== '..' ? filename : '未命名下载';
}

function createDownloadManager({
  browserSession,
  isOwnedContents,
  onChange = () => {},
  getTestApprovalPath = null,
  store = null,
  isSavePathAvailable = filePath => {
    try { return fs.statSync(filePath).isFile(); } catch { return false; }
  }
}) {
  if (!browserSession || typeof browserSession.on !== 'function') {
    throw new TypeError('下载管理器需要有效的浏览器会话。');
  }
  if (typeof isOwnedContents !== 'function') {
    throw new TypeError('下载管理器需要验证浏览器标签来源。');
  }
  if (store && (typeof store.load !== 'function' || typeof store.save !== 'function')) {
    throw new TypeError('下载管理器需要有效的本机记录存储。');
  }

  const records = new Map();
  const items = new Map();
  let disposed = false;
  let persistTimer = null;
  let storageReadOnly = false;
  let storageWarning = null;

  if (store) {
    const restored = store.load();
    storageReadOnly = Boolean(restored.readOnly);
    storageWarning = restored.warning || null;
    for (const saved of restored.records || []) {
      const restoredState = ACTIVE_STATES.has(saved.state) ? 'interrupted' : saved.state;
      const createdAt = Date.parse(saved.startedAt);
      const record = {
        ...saved,
        state: restoredState,
        createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
        approved: true
      };
      records.set(record.id, record);
    }
  }

  function pathIsAvailable(filePath) {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) return false;
    try { return Boolean(isSavePathAvailable(filePath)); } catch { return false; }
  }

  function snapshot() {
    return [...records.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(record => ({
        id: record.id,
        filename: record.filename,
        source: record.source,
        state: record.state,
        receivedBytes: record.receivedBytes,
        totalBytes: record.totalBytes,
        progress: record.totalBytes > 0
          ? Math.min(100, Math.max(0, Math.round((record.receivedBytes / record.totalBytes) * 100)))
          : null,
        savePath: record.approved ? record.savePath : null,
        fileAvailable: Boolean(record.approved && record.savePath && pathIsAvailable(record.savePath)),
        startedAt: record.startedAt
      }));
  }

  function writePersistedRecords() {
    if (!store) return { success: true };
    if (storageReadOnly) return { success: false, error: storageWarning || '本机下载记录只读。' };
    const approvedRecords = [...records.values()]
      .filter(record => record.approved && typeof record.savePath === 'string' && path.isAbsolute(record.savePath))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
      .map(record => ({
        id: record.id,
        filename: record.filename,
        source: record.source,
        state: record.state,
        receivedBytes: Number.isSafeInteger(record.receivedBytes) ? record.receivedBytes : 0,
        totalBytes: Number.isSafeInteger(record.totalBytes) ? record.totalBytes : 0,
        savePath: record.savePath,
        startedAt: record.startedAt
      }));
    let result;
    try { result = store.save(approvedRecords) || { success: false, error: '无法将下载记录保存到此设备。' }; } catch {
      result = { success: false, error: '无法将下载记录保存到此设备。' };
    }
    if (!result.success) {
      storageReadOnly = true;
      storageWarning = result.error || '本机下载记录保存失败；本次不会继续覆盖记录文件。';
    }
    return result;
  }

  function persist(immediate = false) {
    if (!store) return { success: true };
    if (storageReadOnly) return { success: false, error: storageWarning || '本机下载记录只读。' };
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    if (immediate) {
      return writePersistedRecords();
    }
    persistTimer = setTimeout(() => {
      persistTimer = null;
      const result = writePersistedRecords();
      if (!result.success) notify();
    }, 250);
    if (typeof persistTimer.unref === 'function') persistTimer.unref();
    return { success: true };
  }

  function notify() {
    try { onChange(snapshot(), getStorageStatus()); } catch {
      // A detached renderer must not interrupt a Chromium download.
    }
  }

  function pruneOldTerminalRecords() {
    if (records.size <= MAX_DOWNLOADS) return;
    const before = [...records.entries()];
    const terminal = [...records.values()]
      .filter(record => TERMINAL_STATES.has(record.state))
      .sort((a, b) => a.createdAt - b.createdAt);
    while (records.size > MAX_DOWNLOADS && terminal.length) records.delete(terminal.shift().id);
    if (!persist(true).success) {
      records.clear();
      for (const [id, record] of before) records.set(id, record);
    }
  }

  function updateFromItem(record, item, state) {
    try {
      const received = Number(item.getReceivedBytes());
      const total = Number(item.getTotalBytes());
      record.receivedBytes = Number.isFinite(received) && received > 0 ? Math.floor(received) : 0;
      record.totalBytes = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
    } catch {
      record.receivedBytes = 0;
      record.totalBytes = 0;
    }

    if (state === 'progressing') record.state = 'progressing';
    else if (state === 'interrupted') record.state = 'interrupted';

    const wasApproved = record.approved;
    const pathMayHaveBeenApproved = state === 'progressing' || state === 'completed' ||
      (state === 'interrupted' && record.receivedBytes > 0);
    if (pathMayHaveBeenApproved) {
      try {
        const candidate = item.getSavePath();
        if (typeof candidate === 'string' && candidate && path.isAbsolute(candidate)) {
          record.savePath = path.normalize(candidate);
          record.approved = true;
        }
      } catch {
        // A save path is only visible after Electron supplies an approved absolute path.
      }
    }
    if (!record.approved) record.savePath = null;
    persist((!wasApproved && record.approved) || TERMINAL_STATES.has(record.state));
    notify();
  }

  function rejectItem(item) {
    try { item.cancel(); } catch {}
  }

  function handleWillDownload(_event, item, contents) {
    if (disposed) return rejectItem(item);

    let owned = false;
    try { owned = Boolean(isOwnedContents(contents)); } catch {}
    const source = sanitizeDownloadSource(item.getURL());
    if (!owned || !source) return rejectItem(item);

    const record = {
      id: randomUUID(),
      filename: sanitizeDownloadFilename(item.getFilename()),
      source,
      state: 'awaiting-save',
      receivedBytes: 0,
      totalBytes: 0,
      savePath: null,
      approved: false,
      createdAt: Date.now(),
      startedAt: new Date().toISOString()
    };
    records.set(record.id, record);
    items.set(record.id, item);
    notify();

    item.on('updated', (_updateEvent, state) => updateFromItem(record, item, state));
    item.once('done', (_doneEvent, state) => {
      record.state = state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted';
      updateFromItem(record, item, record.state);
      items.delete(record.id);
      pruneOldTerminalRecords();
      notify();
    });

    try {
      // Not setting a save path keeps Electron's explicit save-location dialog in control.
      item.setSaveDialogOptions({ title: '保存网页下载', defaultPath: record.filename });

      // Test-only approval is restricted by main.cjs to a synthetic loopback fixture and temp folder.
      if (typeof getTestApprovalPath === 'function') {
        const approvedTestPath = getTestApprovalPath({ id: record.id, filename: record.filename, source: record.source });
        if (typeof approvedTestPath === 'string' && approvedTestPath) item.setSavePath(approvedTestPath);
      }
    } catch {
      rejectItem(item);
    }
  }

  browserSession.on('will-download', handleWillDownload);

  function list() { return snapshot(); }

  function cancel(id) {
    if (typeof id !== 'string' || !DOWNLOAD_ID_PATTERN.test(id)) return { success: false };
    const record = records.get(id);
    const item = items.get(id);
    if (!record || !item || !ACTIVE_STATES.has(record.state)) return { success: false };
    const previousState = record.state;
    record.state = 'cancelling';
    notify();
    try {
      item.cancel();
      return { success: true };
    } catch {
      record.state = previousState;
      notify();
      return { success: false };
    }
  }

  function remove(id) {
    if (typeof id !== 'string' || !DOWNLOAD_ID_PATTERN.test(id)) return { success: false };
    if (storageReadOnly) return { success: false };
    const record = records.get(id);
    if (!record || !TERMINAL_STATES.has(record.state)) return { success: false };
    records.delete(id);
    const result = persist(true);
    if (!result.success) {
      records.set(id, record);
      notify();
      return { success: false, error: result.error };
    }
    notify();
    return { success: true };
  }

  function clearTerminalSince(since = 0) {
    if (!Number.isFinite(since) || since < 0) return { success: false, cleared: 0, error: '下载记录时间范围无效。' };
    if (storageReadOnly) return { success: false, cleared: 0 };
    const before = [...records.entries()];
    let cleared = 0;
    for (const [id, record] of records) {
      if (!TERMINAL_STATES.has(record.state) || (since !== 0 && record.createdAt < since)) continue;
      records.delete(id);
      cleared += 1;
    }
    if (cleared) {
      const result = persist(true);
      if (!result.success) {
        records.clear();
        for (const [id, record] of before) records.set(id, record);
        notify();
        return { success: false, cleared: 0, error: result.error };
      }
      notify();
    }
    return { success: true, cleared };
  }

  function clearTerminal() {
    return clearTerminalSince(0);
  }

  function getStorageStatus() {
    return { readOnly: storageReadOnly, warning: storageWarning };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    browserSession.removeListener('will-download', handleWillDownload);
    for (const [id, item] of items) {
      const record = records.get(id);
      if (!record || !ACTIVE_STATES.has(record.state)) continue;
      try { item.cancel(); } catch {}
    }
    items.clear();
    persist(true);
  }

  return { list, cancel, remove, clearTerminal, clearTerminalSince, getStorageStatus, dispose };
}

module.exports = {
  createDownloadManager,
  sanitizeDownloadFilename,
  sanitizeDownloadSource
};
