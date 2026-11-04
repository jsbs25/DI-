'use strict';

const { randomUUID } = require('node:crypto');
const net = require('node:net');

const SUPPORTED_PERMISSIONS = new Set(['notifications', 'geolocation']);
const MAX_ORIGIN_INPUT_LENGTH = 4096;
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

function isLoopbackHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true;
  if (net.isIP(host) === 4) return Number(host.split('.')[0]) === 127;
  return false;
}

function getSecureHttpOrigin(input) {
  if (typeof input !== 'string' || !input || input.length > MAX_ORIGIN_INPUT_LENGTH) return null;
  try {
    const url = new URL(input);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname || url.username || url.password) return null;
    if (url.protocol === 'http:' && !isLoopbackHostname(url.hostname)) return null;
    if (url.origin === 'null') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function createBrowserPermissionManager({
  isActiveContext,
  onChange = () => {},
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout
} = {}) {
  if (typeof isActiveContext !== 'function') throw new TypeError('A browser permission context validator is required.');
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs < 1) throw new TypeError('Permission request timeout must be positive.');

  const grants = new Map();
  const pending = new Map();
  let disposed = false;

  function snapshot() {
    return {
      pending: [...pending.values()].map(item => ({
        requestId: item.requestId,
        origin: item.origin,
        permission: item.permission
      })),
      grants: [...grants.entries()]
        .map(([origin, permissions]) => ({ origin, permissions: [...permissions].sort() }))
        .sort((a, b) => a.origin.localeCompare(b.origin))
    };
  }

  function publish() {
    if (!disposed) onChange(snapshot());
  }

  function safeCallback(callback, allowed) {
    try { callback(Boolean(allowed)); } catch { /* Electron callback may already be gone. */ }
  }

  function validateRequestContext(contents, permission, details, originHint = null) {
    if (disposed || !SUPPORTED_PERMISSIONS.has(permission) || !contents || contents.isDestroyed?.() === true) return null;
    if (!details || details.isMainFrame !== true) return null;

    const requestOrigin = getSecureHttpOrigin(details.requestingUrl || originHint || '');
    if (!requestOrigin) return null;
    if (originHint) {
      const hintedOrigin = getSecureHttpOrigin(originHint);
      if (!hintedOrigin || hintedOrigin !== requestOrigin) return null;
    }

    if (details.securityOrigin) {
      const securityOrigin = getSecureHttpOrigin(details.securityOrigin);
      if (!securityOrigin || securityOrigin !== requestOrigin) return null;
    }

    let currentOrigin = null;
    try { currentOrigin = getSecureHttpOrigin(contents.getURL()); } catch {}
    if (!currentOrigin || currentOrigin !== requestOrigin) return null;

    let mainFrameOrigin = null;
    try {
      const frameUrl = contents.mainFrame?.url;
      if (typeof frameUrl === 'string' && frameUrl) mainFrameOrigin = getSecureHttpOrigin(frameUrl);
    } catch {}
    if (!mainFrameOrigin || mainFrameOrigin !== requestOrigin) return null;

    try {
      if (!isActiveContext(contents, requestOrigin, details)) return null;
    } catch {
      return null;
    }
    return requestOrigin;
  }

  function hasGrant(origin, permission) {
    return grants.get(origin)?.has(permission) === true;
  }

  function removePending(item) {
    if (!pending.delete(item.requestId)) return false;
    if (item.timer) clearTimeoutFn(item.timer);
    item.timer = null;
    return true;
  }

  function settle(item, allowed) {
    if (!removePending(item)) return false;
    let granted = Boolean(allowed);
    if (granted && !validateRequestContext(item.contents, item.permission, item.details, item.origin)) granted = false;
    if (granted) {
      let permissions = grants.get(item.origin);
      if (!permissions) {
        permissions = new Set();
        grants.set(item.origin, permissions);
      }
      permissions.add(item.permission);
    }
    safeCallback(item.callback, granted);
    publish();
    return granted;
  }

  function request(contents, permission, callback, details) {
    if (typeof callback !== 'function') return false;
    const origin = validateRequestContext(contents, permission, details);
    if (!origin) {
      safeCallback(callback, false);
      return false;
    }
    if (hasGrant(origin, permission)) {
      safeCallback(callback, true);
      return true;
    }

    const requestId = randomUUID();
    const item = {
      requestId,
      origin,
      permission,
      contents,
      details: {
        isMainFrame: true,
        requestingUrl: details.requestingUrl,
        ...(details.securityOrigin ? { securityOrigin: details.securityOrigin } : {})
      },
      callback,
      timer: null
    };
    item.timer = setTimeoutFn(() => settle(item, false), requestTimeoutMs);
    item.timer?.unref?.();
    pending.set(requestId, item);
    publish();
    return requestId;
  }

  function check(contents, permission, requestingOrigin, details) {
    const origin = validateRequestContext(contents, permission, details, requestingOrigin);
    return Boolean(origin && hasGrant(origin, permission));
  }

  function resolve(requestId, decision) {
    if (typeof requestId !== 'string' || requestId.length > 80 || !['allow', 'deny'].includes(decision)) {
      return { success: false, error: '权限请求无效或已过期。' };
    }
    const item = pending.get(requestId);
    if (!item) return { success: false, error: '权限请求无效或已过期。' };
    const allowed = settle(item, decision === 'allow');
    return { success: decision === 'deny' || allowed, granted: allowed, error: allowed || decision === 'deny' ? undefined : '页面已切换或权限请求已失效。' };
  }

  function revoke(originInput, permission) {
    const origin = getSecureHttpOrigin(originInput);
    if (!origin || !SUPPORTED_PERMISSIONS.has(permission)) return { success: false };
    const permissions = grants.get(origin);
    if (!permissions || !permissions.delete(permission)) return { success: false };
    if (permissions.size === 0) grants.delete(origin);
    publish();
    return { success: true };
  }

  function revokeAll() {
    const changed = grants.size > 0;
    grants.clear();
    if (changed) publish();
    return { success: true, revoked: changed };
  }

  function cancelForContents(contents) {
    let changed = false;
    for (const item of [...pending.values()]) {
      if (item.contents !== contents) continue;
      removePending(item);
      safeCallback(item.callback, false);
      changed = true;
    }
    if (changed) publish();
    return changed;
  }

  function revalidatePending() {
    let changed = false;
    for (const item of [...pending.values()]) {
      if (!validateRequestContext(item.contents, item.permission, item.details, item.origin)) {
        removePending(item);
        safeCallback(item.callback, false);
        changed = true;
      }
    }
    if (changed) publish();
    return changed;
  }

  function dispose() {
    if (disposed) return;
    for (const item of [...pending.values()]) {
      removePending(item);
      safeCallback(item.callback, false);
    }
    grants.clear();
    disposed = true;
  }

  return {
    request,
    check,
    resolve,
    getState: snapshot,
    revoke,
    revokeAll,
    cancelForContents,
    revalidatePending,
    dispose
  };
}

module.exports = {
  SUPPORTED_PERMISSIONS,
  createBrowserPermissionManager,
  getSecureHttpOrigin,
  isLoopbackHostname
};
