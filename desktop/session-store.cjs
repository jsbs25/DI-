'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const STORE_VERSION = 1;
const MAX_SESSION_TABS = 12;
const MAX_SESSION_URL_LENGTH = 4096;
const MAX_SESSION_STORE_BYTES = 128 * 1024;
const TAB_ID_PATTERN = /^tab_[a-zA-Z0-9_-]{1,64}$/;
const SENSITIVE_QUERY_KEY_PARTS = new Set([
  'token', 'auth', 'authorization', 'code', 'key', 'password', 'passwd', 'pwd',
  'session', 'sessionid', 'credential', 'credentials', 'secret', 'jwt', 'bearer',
  'signature', 'sig', 'apikey', 'accesstoken', 'refreshtoken', 'idtoken', 'clientsecret'
]);

function isSensitiveQueryKey(value) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (SENSITIVE_QUERY_KEY_PARTS.has(normalized)) return true;
  const parts = value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (parts.some(part => SENSITIVE_QUERY_KEY_PARTS.has(part))) return true;
  return ['token', 'password', 'passwd', 'pwd', 'secret', 'credential', 'session', 'auth', 'code', 'jwt', 'bearer', 'signature', 'sig']
    .some(marker => normalized.length > marker.length && normalized.endsWith(marker));
}

function sanitizeSessionUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_SESSION_URL_LENGTH) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname || url.username || url.password) {
      return null;
    }
    // Ordinary page queries are useful for restoring search/article views. If a
    // query key clearly signals a credential, omit the entire URL rather than
    // guessing which part of its value is safe to keep.
    for (const key of url.searchParams.keys()) {
      if (isSensitiveQueryKey(key)) return null;
    }
    url.hash = '';
    const sanitized = url.href;
    return sanitized.length <= MAX_SESSION_URL_LENGTH ? sanitized : null;
  } catch {
    return null;
  }
}

function sanitizeSessionTab(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = value.id;
  const url = sanitizeSessionUrl(value.url);
  if (typeof id !== 'string' || !TAB_ID_PATTERN.test(id) || !url) return null;
  let title;
  try {
    title = new URL(url).host.slice(0, 255);
  } catch {
    return null;
  }
  return { id, url, title };
}

function normalizeSessionState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== STORE_VERSION ||
      typeof value.enabled !== 'boolean' || !Array.isArray(value.tabs)) {
    throw new TypeError('本机会话恢复文件格式无效。');
  }

  const tabs = [];
  const seen = new Set();
  let requestedActiveTab = null;
  if (value.enabled) {
    for (const input of value.tabs) {
      const tab = sanitizeSessionTab(input);
      if (!tab || seen.has(tab.id)) continue;
      seen.add(tab.id);
      if (tab.id === value.activeTabId) requestedActiveTab = tab;
      if (tabs.length < MAX_SESSION_TABS) tabs.push(tab);
    }
  }

  if (requestedActiveTab && !tabs.some(tab => tab.id === requestedActiveTab.id) && tabs.length === MAX_SESSION_TABS) {
    tabs[tabs.length - 1] = requestedActiveTab;
  }
  const activeTabId = requestedActiveTab?.id || tabs[0]?.id || null;
  return {
    enabled: value.enabled,
    activeTabId,
    tabs: value.enabled ? tabs : []
  };
}

function serializeState(state) {
  return JSON.stringify({ version: STORE_VERSION, ...state });
}

function writeAtomic(filePath, serialized) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = fs.openSync(temporaryPath, 'wx', 0o600);
    fs.writeFileSync(handle, serialized, 'utf8');
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = undefined;
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    if (handle !== undefined) {
      try { fs.closeSync(handle); } catch {}
    }
    try { fs.rmSync(temporaryPath, { force: true }); } catch {}
    throw error;
  }
}

function createBrowserSessionStore(filePath) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
    throw new TypeError('会话恢复文件必须位于绝对本机路径。');
  }

  let readOnly = false;
  let current = { enabled: false, activeTabId: null, tabs: [] };

  function load() {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_SESSION_STORE_BYTES) throw new Error('本机会话恢复文件超出大小限制。');
      const rawText = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(rawText);
      const normalized = normalizeSessionState(parsed);
      const canonical = serializeState(normalized);
      if (rawText !== canonical) {
        // Repair valid-but-overbroad files before exposing any saved tabs.
        // If repair fails, fail closed rather than restore from an unsafe file.
        writeAtomic(filePath, canonical);
      }
      current = normalized;
      readOnly = false;
      return { ...current, readOnly: false, warning: null };
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        current = { enabled: false, activeTabId: null, tabs: [] };
        readOnly = false;
        return { ...current, readOnly: false, warning: null };
      }
      current = { enabled: false, activeTabId: null, tabs: [] };
      readOnly = true;
      return {
        ...current,
        readOnly: true,
        warning: '本机会话恢复数据无法安全读取；为避免覆盖原文件，已关闭恢复且不会写入该文件。'
      };
    }
  }

  function save(input) {
    if (readOnly) return { success: false, error: '本机会话恢复数据只读，拒绝覆盖。' };
    let normalized;
    try {
      normalized = normalizeSessionState({ version: STORE_VERSION, ...input });
      const serialized = serializeState(normalized);
      if (Buffer.byteLength(serialized, 'utf8') > MAX_SESSION_STORE_BYTES) {
        return { success: false, error: '本机会话恢复数据超出大小限制。' };
      }
      writeAtomic(filePath, serialized);
      current = normalized;
      return { success: true, ...current };
    } catch {
      return { success: false, error: '无法安全保存本机会话恢复数据。' };
    }
  }

  return { load, save, getState: () => ({ ...current, tabs: current.tabs.map(tab => ({ ...tab })), readOnly }) };
}

module.exports = {
  MAX_SESSION_TABS,
  MAX_SESSION_STORE_BYTES,
  createBrowserSessionStore,
  sanitizeSessionTab,
  sanitizeSessionUrl
};
