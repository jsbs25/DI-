'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STORE_VERSION = 1;
const MAX_DOWNLOAD_RECORDS = 50;
const MAX_STORE_BYTES = 1024 * 1024;
const DOWNLOAD_ID_PATTERN = /^[a-f0-9-]{36}$/i;
const PERSISTED_STATES = new Set(['progressing', 'cancelling', 'completed', 'cancelled', 'interrupted']);

function sanitizeFilename(value) {
  if (typeof value !== 'string') return null;
  const filename = value.replace(/[\\/]+/g, '/').split('/').pop()
    .replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255);
  return filename && filename !== '.' && filename !== '..' ? filename : null;
}

function sanitizeSource(value) {
  if (typeof value !== 'string' || value.length > 8192) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname || url.username || url.password) return null;
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return null;
  }
}

function sanitizeStoredRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = value.id;
  const filename = sanitizeFilename(value.filename);
  const source = sanitizeSource(value.source);
  const state = value.state;
  const savePath = value.savePath;
  const startedAt = value.startedAt;
  const receivedBytes = value.receivedBytes;
  const totalBytes = value.totalBytes;
  if (typeof id !== 'string' || !DOWNLOAD_ID_PATTERN.test(id) || !filename || !source ||
      !PERSISTED_STATES.has(state) || typeof savePath !== 'string' || savePath.length > 4096 ||
      savePath.includes('\u0000') || !path.isAbsolute(savePath) || typeof startedAt !== 'string' ||
      !Number.isFinite(Date.parse(startedAt)) || !Number.isSafeInteger(receivedBytes) || receivedBytes < 0 ||
      !Number.isSafeInteger(totalBytes) || totalBytes < 0) return null;
  return { id, filename, source, state, receivedBytes, totalBytes, savePath, startedAt };
}

function normalizeStore(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== STORE_VERSION ||
      !Array.isArray(value.records) || value.records.length > MAX_DOWNLOAD_RECORDS) {
    throw new TypeError('本机下载记录文件格式无效。');
  }
  const records = value.records.map(sanitizeStoredRecord);
  if (records.some(record => !record) || new Set(records.map(record => record.id)).size !== records.length) {
    throw new TypeError('本机下载记录包含无法验证的条目。');
  }
  return records.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

function createDownloadStore(filePath) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
    throw new TypeError('下载记录文件必须位于绝对本机路径。');
  }
  let readOnly = false;

  function load() {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_STORE_BYTES) throw new Error('本机下载记录文件超出大小限制。');
      const records = normalizeStore(JSON.parse(fs.readFileSync(filePath, 'utf8')));
      readOnly = false;
      return { records, readOnly: false, warning: null };
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        readOnly = false;
        return { records: [], readOnly: false, warning: null };
      }
      readOnly = true;
      return {
        records: [],
        readOnly: true,
        warning: '本机下载记录无法读取；为避免覆盖原文件，当前不会写入或清除下载记录。'
      };
    }
  }

  function save(input) {
    if (readOnly) return { success: false, error: '本机下载记录只读，拒绝覆盖。' };
    if (!Array.isArray(input)) return { success: false, error: '本机下载记录格式无效。' };
    const unique = new Map();
    for (const record of input) {
      const safe = sanitizeStoredRecord(record);
      if (!safe) return { success: false, error: '本机下载记录包含无法验证的条目。' };
      unique.set(safe.id, safe);
    }
    const records = [...unique.values()]
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
      .slice(0, MAX_DOWNLOAD_RECORDS);
    const serialized = JSON.stringify({ version: STORE_VERSION, records });
    if (Buffer.byteLength(serialized, 'utf8') > MAX_STORE_BYTES) {
      return { success: false, error: '本机下载记录超出大小限制。' };
    }

    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    let handle;
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
      handle = fs.openSync(temporaryPath, 'wx', 0o600);
      fs.writeFileSync(handle, serialized, 'utf8');
      fs.fsyncSync(handle);
      fs.closeSync(handle);
      handle = undefined;
      fs.renameSync(temporaryPath, filePath);
      return { success: true };
    } catch {
      if (handle !== undefined) {
        try { fs.closeSync(handle); } catch {}
      }
      try { fs.rmSync(temporaryPath, { force: true }); } catch {}
      return { success: false, error: '无法将下载记录保存到此设备。' };
    }
  }

  return { load, save };
}

module.exports = {
  MAX_DOWNLOAD_RECORDS,
  createDownloadStore,
  sanitizeStoredRecord
};
