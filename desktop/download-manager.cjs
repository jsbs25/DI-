'use strict';

const { randomUUID } = require('node:crypto');

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
    // Do not expose query parameters or fragments, which can contain access tokens.
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
  getTestApprovalPath = null
}) {
  if (!browserSession || typeof browserSession.on !== 'function') {
    throw new TypeError('下载管理器需要有效的浏览器会话。');
  }
  if (typeof isOwnedContents !== 'function') {
    throw new TypeError('下载管理器需要验证浏览器标签来源。');
  }

  const records = new Map();
  const items = new Map();
  let disposed = false;

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
        savePath: record.savePath,
        startedAt: record.startedAt
      }));
  }

  function notify() {
    try {
      onChange(snapshot());
    } catch {
      // A detached renderer must not interrupt a Chromium download.
    }
  }

  function pruneOldTerminalRecords() {
    if (records.size <= MAX_DOWNLOADS) return;
    const terminal = [...records.values()]
      .filter(record => TERMINAL_STATES.has(record.state))
      .sort((a, b) => a.createdAt - b.createdAt);
    while (records.size > MAX_DOWNLOADS && terminal.length) {
      records.delete(terminal.shift().id);
    }
  }

  function updateFromItem(record, item, state) {
    try {
      const received = Number(item.getReceivedBytes());
      const total = Number(item.getTotalBytes());
      record.receivedBytes = Number.isFinite(received) && received > 0 ? received : 0;
      record.totalBytes = Number.isFinite(total) && total > 0 ? total : 0;
    } catch {
      record.receivedBytes = 0;
      record.totalBytes = 0;
    }

    if (state === 'progressing') record.state = 'progressing';
    else if (state === 'interrupted') record.state = 'interrupted';

    const hasApprovedPath = state === 'progressing' || state === 'completed' ||
      (state === 'interrupted' && record.receivedBytes > 0);
    if (hasApprovedPath) {
      try {
        const savePath = item.getSavePath();
        record.savePath = typeof savePath === 'string' && savePath ? savePath : null;
      } catch {
        record.savePath = null;
      }
    }
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
      // Not setting a save path lets Electron ask the user to choose where to save.
      item.setSaveDialogOptions({
        title: '保存网页下载',
        defaultPath: record.filename
      });

      // The integration smoke test may supply a path to emulate an explicit
      // approval in its disposable profile. Production never provides this hook.
      if (typeof getTestApprovalPath === 'function') {
        const approvedTestPath = getTestApprovalPath({
          id: record.id,
          filename: record.filename,
          source: record.source
        });
        if (typeof approvedTestPath === 'string' && approvedTestPath) {
          item.setSavePath(approvedTestPath);
        }
      }
    } catch {
      rejectItem(item);
    }
  }

  browserSession.on('will-download', handleWillDownload);

  function list() {
    return snapshot();
  }

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
    const record = records.get(id);
    if (!record || !TERMINAL_STATES.has(record.state)) return { success: false };
    records.delete(id);
    items.delete(id);
    notify();
    return { success: true };
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
  }

  return { list, cancel, remove, dispose };
}

module.exports = {
  createDownloadManager,
  sanitizeDownloadFilename,
  sanitizeDownloadSource
};
