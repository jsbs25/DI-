'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('earthOneBrowser', {
  getLocalData: () => ipcRenderer.invoke('browser:get-local-data'),
  saveLocalData: data => ipcRenderer.invoke('browser:save-local-data', data),
  getSessionState: () => ipcRenderer.invoke('browser:get-session-state'),
  setSessionEnabled: enabled => ipcRenderer.invoke('browser:set-session-enabled', Boolean(enabled)),
  restoreSession: () => ipcRenderer.invoke('browser:restore-session'),
  getPermissionState: () => ipcRenderer.invoke('browser:get-permission-state'),
  resolvePermissionRequest: (requestId, decision) => ipcRenderer.invoke('browser:resolve-permission-request', requestId, decision),
  revokePermission: (origin, permission) => ipcRenderer.invoke('browser:revoke-permission', origin, permission),
  revokeAllPermissions: () => ipcRenderer.invoke('browser:revoke-all-permissions'),
  getDownloads: () => ipcRenderer.invoke('browser:get-downloads'),
  cancelDownload: id => ipcRenderer.invoke('browser:cancel-download', id),
  removeDownload: id => ipcRenderer.invoke('browser:remove-download', id),
  clearDownloadRecords: () => ipcRenderer.invoke('browser:clear-download-records'),
  getDownloadStorageStatus: () => ipcRenderer.invoke('browser:get-download-storage-status'),
  showDownloadInFolder: id => ipcRenderer.invoke('browser:show-download-in-folder', id),
  printToPdf: () => ipcRenderer.invoke('browser:print-to-pdf'),
  setActive: active => ipcRenderer.invoke('browser:set-active', Boolean(active)),
  setBounds: bounds => ipcRenderer.invoke('browser:set-bounds', bounds),
  getCanRestoreClosedTab: () => ipcRenderer.invoke('browser:get-can-restore-closed-tab'),
  restoreLastClosedTab: () => ipcRenderer.invoke('browser:restore-last-closed-tab'),
  reorderTabs: tabIds => ipcRenderer.invoke('browser:reorder-tabs', tabIds),
  selectTab: (tabId, url) => ipcRenderer.invoke('browser:select-tab', tabId, url),
  closeTab: tabId => ipcRenderer.invoke('browser:close-tab', tabId),
  onNewTab: listener => {
    const wrapped = (_event, tab) => listener(tab);
    ipcRenderer.on('browser:new-tab', wrapped);
    return () => ipcRenderer.removeListener('browser:new-tab', wrapped);
  },
  onTabClosed: listener => {
    const wrapped = (_event, tab) => listener(tab);
    ipcRenderer.on('browser:tab-closed', wrapped);
    return () => ipcRenderer.removeListener('browser:tab-closed', wrapped);
  },
  onRestoreAvailability: listener => {
    const wrapped = (_event, available) => listener(Boolean(available));
    ipcRenderer.on('browser:restore-availability', wrapped);
    return () => ipcRenderer.removeListener('browser:restore-availability', wrapped);
  },
  navigate: (tabId, url) => ipcRenderer.invoke('browser:navigate', tabId, url),
  goBack: tabId => ipcRenderer.invoke('browser:back', tabId),
  goForward: tabId => ipcRenderer.invoke('browser:forward', tabId),
  reload: tabId => ipcRenderer.invoke('browser:reload', tabId),
  changeZoom: action => ipcRenderer.invoke('browser:change-zoom', action),
  findInPage: (query, direction) => ipcRenderer.invoke('browser:find-in-page', query, direction),
  stopFindInPage: returnFocus => ipcRenderer.invoke('browser:stop-find-in-page', Boolean(returnFocus)),
  onState: listener => {
    const wrapped = (_event, state) => listener(state);
    ipcRenderer.on('browser:state', wrapped);
    return () => ipcRenderer.removeListener('browser:state', wrapped);
  },
  onDownloads: listener => {
    const wrapped = (_event, downloads, storageStatus) => listener(downloads, storageStatus);
    ipcRenderer.on('browser:downloads-state', wrapped);
    return () => ipcRenderer.removeListener('browser:downloads-state', wrapped);
  },
  onPermissions: listener => {
    const wrapped = (_event, state) => listener(state);
    ipcRenderer.on('browser:permissions-state', wrapped);
    return () => ipcRenderer.removeListener('browser:permissions-state', wrapped);
  },
  onFocusAddressBar: listener => {
    const wrapped = (_event, tabId) => listener(tabId);
    ipcRenderer.on('browser:focus-address-bar', wrapped);
    return () => ipcRenderer.removeListener('browser:focus-address-bar', wrapped);
  },
  onFocusFind: listener => {
    const wrapped = (_event, tabId) => listener(tabId);
    ipcRenderer.on('browser:focus-find', wrapped);
    return () => ipcRenderer.removeListener('browser:focus-find', wrapped);
  },
  onFindResult: listener => {
    const wrapped = (_event, result) => listener(result);
    ipcRenderer.on('browser:find-result', wrapped);
    return () => ipcRenderer.removeListener('browser:find-result', wrapped);
  }
});
