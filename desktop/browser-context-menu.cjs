'use strict';
const { normalizePopupTarget } = require('./browser-popup-security.cjs');
const MAX_CONTEXT_TEXT_LENGTH = 1024 * 1024;

function canNavigateHistory(contents, method) {
  try {
    return contents.navigationHistory[method]() === true;
  } catch {
    return false;
  }
}

function createBrowserContextMenuTemplate({
  params,
  contents,
  isTargetActive,
  clipboard,
  openLinkInNewTab,
  appOrigin = null
}) {
  if (!params || typeof params !== 'object' || !contents ||
      typeof isTargetActive !== 'function' || !clipboard ||
      typeof clipboard.writeText !== 'function' || typeof openLinkInNewTab !== 'function') return [];

  const isCurrentTarget = () => {
    try {
      return !contents.isDestroyed() && isTargetActive(contents) === true;
    } catch {
      return false;
    }
  };
  const items = [];
  const navigation = [];
  if (canNavigateHistory(contents, 'canGoBack')) {
    navigation.push({
      label: '后退',
      click: () => {
        if (!isCurrentTarget() || !canNavigateHistory(contents, 'canGoBack')) return;
        try { contents.navigationHistory.goBack(); } catch {}
      }
    });
  }
  if (canNavigateHistory(contents, 'canGoForward')) {
    navigation.push({
      label: '前进',
      click: () => {
        if (!isCurrentTarget() || !canNavigateHistory(contents, 'canGoForward')) return;
        try { contents.navigationHistory.goForward(); } catch {}
      }
    });
  }
  navigation.push({
    label: '重新加载',
    click: () => {
      if (!isCurrentTarget()) return;
      try { contents.reload(); } catch {}
    }
  });
  items.push(...navigation);

  const safeLink = normalizePopupTarget(params.linkURL, appOrigin);
  if (safeLink) {
    items.push({ type: 'separator' });
    items.push({
      label: '在新标签页中打开链接',
      click: () => {
        if (!isCurrentTarget()) return;
        try { void Promise.resolve(openLinkInNewTab(safeLink)).catch(() => {}); } catch {}
      }
    });
    items.push({
      label: '复制链接地址',
      click: () => {
        if (!isCurrentTarget()) return;
        try { clipboard.writeText(safeLink); } catch {}
      }
    });
  }

  const selectionText = typeof params.selectionText === 'string' &&
    params.selectionText.length > 0 && params.selectionText.length <= MAX_CONTEXT_TEXT_LENGTH
    ? params.selectionText
    : '';
  const editFlags = params.editFlags && typeof params.editFlags === 'object' ? params.editFlags : {};
  const editable = params.isEditable === true;
  if (!editable && selectionText) {
    items.push({ type: 'separator' });
    items.push({
      label: '复制所选文字',
      click: () => {
        if (!isCurrentTarget()) return;
        try { clipboard.writeText(selectionText); } catch {}
      }
    });
  }

  if (editable) {
    const editItems = [];
    if (editFlags.canCut === true) {
      editItems.push({
        label: '剪切',
        click: () => {
          if (!isCurrentTarget()) return;
          try { contents.cut(); } catch {}
        }
      });
    }
    if (editFlags.canCopy === true && selectionText) {
      editItems.push({
        label: '复制',
        click: () => {
          if (!isCurrentTarget()) return;
          try { clipboard.writeText(selectionText); } catch {}
        }
      });
    }
    if (editFlags.canPaste === true) {
      editItems.push({
        label: '粘贴',
        click: () => {
          if (!isCurrentTarget()) return;
          try { contents.paste(); } catch {}
        }
      });
    }
    if (editFlags.canSelectAll === true) {
      editItems.push({
        label: '全选',
        click: () => {
          if (!isCurrentTarget()) return;
          try { contents.selectAll(); } catch {}
        }
      });
    }
    if (editItems.length) {
      items.push({ type: 'separator' });
      items.push(...editItems);
    }
  }

  return items;
}

module.exports = { createBrowserContextMenuTemplate };
