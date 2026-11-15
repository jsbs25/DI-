// Electron preload bridge exposing strictly scoped IPC APIs for ONE Built-in Browser (Mode A) & Desktop Notifications
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { contextBridge, ipcRenderer } = require('electron');

function onChannel<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: unknown, payload: T) => {
    try {
      listener(payload);
    } catch {}
  };
  ipcRenderer.on(channel, handler);
  return () => {
    try {
      ipcRenderer.removeListener(channel, handler);
    } catch {}
  };
}

contextBridge.exposeInMainWorld('earthOneBrowser', {
  getLocalData: () => ipcRenderer.invoke('browser:getLocalData'),
  saveLocalData: (data: unknown) => ipcRenderer.invoke('browser:saveLocalData', data),
  clearBrowsingData: (selection: unknown, timeRange: unknown) =>
    ipcRenderer.invoke('browser:clearBrowsingData', selection, timeRange),
  getSessionState: () => ipcRenderer.invoke('browser:getSessionState'),
  setSessionEnabled: (enabled: boolean) => ipcRenderer.invoke('browser:setSessionEnabled', enabled),
  restoreSession: () => ipcRenderer.invoke('browser:restoreSession'),
  getPermissionState: () => ipcRenderer.invoke('browser:getPermissionState'),
  resolvePermissionRequest: (requestId: string, decision: 'allow' | 'deny') =>
    ipcRenderer.invoke('browser:resolvePermissionRequest', requestId, decision),
  revokePermission: (origin: string, permission: string) =>
    ipcRenderer.invoke('browser:revokePermission', origin, permission),
  revokeAllPermissions: () => ipcRenderer.invoke('browser:revokeAllPermissions'),
  getDownloads: () => ipcRenderer.invoke('browser:getDownloads'),
  cancelDownload: (id: string) => ipcRenderer.invoke('browser:cancelDownload', id),
  removeDownload: (id: string) => ipcRenderer.invoke('browser:removeDownload', id),
  clearDownloadRecords: () => ipcRenderer.invoke('browser:clearDownloadRecords'),
  getDownloadStorageStatus: () => ipcRenderer.invoke('browser:getDownloadStorageStatus'),
  showDownloadInFolder: (id: string) => ipcRenderer.invoke('browser:showDownloadInFolder', id),
  printToPdf: () => ipcRenderer.invoke('browser:printToPdf'),
  setActive: (active: boolean) => ipcRenderer.invoke('browser:setActive', active),
  setBounds: (bounds: unknown) => ipcRenderer.invoke('browser:setBounds', bounds),
  getCanRestoreClosedTab: () => ipcRenderer.invoke('browser:getCanRestoreClosedTab'),
  restoreLastClosedTab: () => ipcRenderer.invoke('browser:restoreLastClosedTab'),
  reorderTabs: (tabIds: string[]) => ipcRenderer.invoke('browser:reorderTabs', tabIds),
  selectTab: (tabId: string, url: string) => ipcRenderer.invoke('browser:selectTab', tabId, url),
  closeTab: (tabId: string) => ipcRenderer.invoke('browser:closeTab', tabId),
  navigate: (tabId: string, url: string) => ipcRenderer.invoke('browser:navigate', tabId, url),
  goBack: (tabId: string) => ipcRenderer.invoke('browser:goBack', tabId),
  goForward: (tabId: string) => ipcRenderer.invoke('browser:goForward', tabId),
  reload: (tabId: string) => ipcRenderer.invoke('browser:reload', tabId),
  changeZoom: (action: string) => ipcRenderer.invoke('browser:changeZoom', action),
  findInPage: (query: string, direction: string) => ipcRenderer.invoke('browser:findInPage', query, direction),
  stopFindInPage: (returnFocus?: boolean) => ipcRenderer.invoke('browser:stopFindInPage', returnFocus),

  // Mode A: Isolated Built-in Browser Proxy (persist:one-browser only)
  getProxyStatus: () => ipcRenderer.invoke('browser:proxy:getStatus'),
  setProxy: (config: unknown) => ipcRenderer.invoke('browser:proxy:set', config),
  clearProxy: () => ipcRenderer.invoke('browser:proxy:clear'),
  testProxy: (probeUrl?: string) => ipcRenderer.invoke('browser:proxy:test', probeUrl),

  onNewTab: (listener: (tab: unknown) => void) => onChannel('browser:new-tab', listener),
  onTabClosed: (listener: (tab: unknown) => void) => onChannel('browser:tab-closed', listener),
  onRestoreAvailability: (listener: (available: boolean) => void) =>
    onChannel('browser:restore-availability', listener),
  onState: (listener: (state: unknown) => void) => onChannel('browser:state', listener),
  onDownloads: (listener: (downloads: unknown, status: unknown) => void) => {
    const handler = (_event: unknown, payload: { downloads: unknown; status: unknown }) => {
      try {
        listener(payload.downloads, payload.status);
      } catch {}
    };
    ipcRenderer.on('browser:downloads', handler);
    return () => {
      try {
        ipcRenderer.removeListener('browser:downloads', handler);
      } catch {}
    };
  },
  onPermissions: (listener: (state: unknown) => void) => onChannel('browser:permissions', listener),
  onFocusAddressBar: (listener: (tabId: string) => void) => onChannel('browser:focus-address-bar', listener),
  onFocusFind: (listener: (tabId: string) => void) => onChannel('browser:focus-find', listener),
  onFindResult: (listener: (result: unknown) => void) => onChannel('browser:find-result', listener),
  onProxyStatus: (listener: (status: unknown) => void) => onChannel('browser:proxy-status', listener),
});

contextBridge.exposeInMainWorld('earthOneDesktop', {
  getNotificationPermission: () => ipcRenderer.invoke('desktop:getNotificationPermission'),
  showNotification: (payload: unknown) => ipcRenderer.invoke('desktop:showNotification', payload),
  onNotificationClick: (listener: (data: unknown) => void) => onChannel('desktop:notification-click', listener),
});
