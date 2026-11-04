'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('earthOneBrowser', {
  getLocalData: () => ipcRenderer.invoke('browser:get-local-data'),
  saveLocalData: data => ipcRenderer.invoke('browser:save-local-data', data),
  getSessionState: () => ipcRenderer.invoke('browser:get-session-state'),
  setSessionEnabled: enabled => ipcRenderer.invoke('browser:set-session-enabled', Boolean(enabled)),
  restoreSession: () => ipcRenderer.invoke('browser:restore-session'),
  getDownloads: () => ipcRenderer.invoke('browser:get-downloads'),
  cancelDownload: id => ipcRenderer.invoke('browser:cancel-download', id),
  removeDownload: id => ipcRenderer.invoke('browser:remove-download', id),
  clearDownloadRecords: () => ipcRenderer.invoke('browser:clear-download-records'),
  getDownloadStorageStatus: () => ipcRenderer.invoke('browser:get-download-storage-status'),
  showDownloadInFolder: id => ipcRenderer.invoke('browser:show-download-in-folder', id),
  setActive: active => ipcRenderer.invoke('browser:set-active', Boolean(active)),
  setBounds: bounds => ipcRenderer.invoke('browser:set-bounds', bounds),
  selectTab: (tabId, url) => ipcRenderer.invoke('browser:select-tab', tabId, url),
  closeTab: tabId => ipcRenderer.invoke('browser:close-tab', tabId),
  navigate: (tabId, url) => ipcRenderer.invoke('browser:navigate', tabId, url),
  goBack: tabId => ipcRenderer.invoke('browser:back', tabId),
  goForward: tabId => ipcRenderer.invoke('browser:forward', tabId),
  reload: tabId => ipcRenderer.invoke('browser:reload', tabId),
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
  onFocusAddressBar: listener => {
    const wrapped = (_event, tabId) => listener(tabId);
    ipcRenderer.on('browser:focus-address-bar', wrapped);
    return () => ipcRenderer.removeListener('browser:focus-address-bar', wrapped);
  }
});
