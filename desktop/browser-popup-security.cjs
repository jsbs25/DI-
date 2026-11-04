'use strict';

const MAX_POPUP_URL_LENGTH = 4096;

function normalizePopupTarget(input, appOrigin = null) {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_POPUP_URL_LENGTH) return null;

  let target;
  try {
    target = new URL(input);
  } catch {
    return null;
  }
  if ((target.protocol !== 'http:' && target.protocol !== 'https:') ||
      !target.hostname || target.username || target.password) return null;

  if (appOrigin !== null) {
    let trustedOrigin;
    try {
      trustedOrigin = new URL(appOrigin).origin;
    } catch {
      return null;
    }
    if (target.origin === trustedOrigin) return null;
  }

  return target.href;
}

function requiresPopupConfirmation(details) {
  // Electron does not provide a trustworthy user-gesture flag here. The
  // disposition alone is insufficient: an ungestured window.open can be
  // reported as foreground-tab on some Chromium builds.
  void details;
  return true;
}

module.exports = { normalizePopupTarget, requiresPopupConfirmation };
