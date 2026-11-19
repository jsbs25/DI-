// electron/preload.ts
var { contextBridge, ipcRenderer } = require("electron");
function onChannel(channel, listener) {
  const handler = (_event, payload) => {
    try {
      listener(payload);
    } catch {
    }
  };
  ipcRenderer.on(channel, handler);
  return () => {
    try {
      ipcRenderer.removeListener(channel, handler);
    } catch {
    }
  };
}
contextBridge.exposeInMainWorld("earthOneBrowser", {
  getLocalData: () => ipcRenderer.invoke("browser:getLocalData"),
  saveLocalData: (data) => ipcRenderer.invoke("browser:saveLocalData", data),
  clearBrowsingData: (selection, timeRange) => ipcRenderer.invoke("browser:clearBrowsingData", selection, timeRange),
  getSessionState: () => ipcRenderer.invoke("browser:getSessionState"),
  setSessionEnabled: (enabled) => ipcRenderer.invoke("browser:setSessionEnabled", enabled),
  restoreSession: () => ipcRenderer.invoke("browser:restoreSession"),
  getPermissionState: () => ipcRenderer.invoke("browser:getPermissionState"),
  resolvePermissionRequest: (requestId, decision) => ipcRenderer.invoke("browser:resolvePermissionRequest", requestId, decision),
  revokePermission: (origin, permission) => ipcRenderer.invoke("browser:revokePermission", origin, permission),
  revokeAllPermissions: () => ipcRenderer.invoke("browser:revokeAllPermissions"),
  getDownloads: () => ipcRenderer.invoke("browser:getDownloads"),
  cancelDownload: (id) => ipcRenderer.invoke("browser:cancelDownload", id),
  removeDownload: (id) => ipcRenderer.invoke("browser:removeDownload", id),
  clearDownloadRecords: () => ipcRenderer.invoke("browser:clearDownloadRecords"),
  getDownloadStorageStatus: () => ipcRenderer.invoke("browser:getDownloadStorageStatus"),
  showDownloadInFolder: (id) => ipcRenderer.invoke("browser:showDownloadInFolder", id),
  printToPdf: () => ipcRenderer.invoke("browser:printToPdf"),
  setActive: (active) => ipcRenderer.invoke("browser:setActive", active),
  setBounds: (bounds) => ipcRenderer.invoke("browser:setBounds", bounds),
  getCanRestoreClosedTab: () => ipcRenderer.invoke("browser:getCanRestoreClosedTab"),
  restoreLastClosedTab: () => ipcRenderer.invoke("browser:restoreLastClosedTab"),
  reorderTabs: (tabIds) => ipcRenderer.invoke("browser:reorderTabs", tabIds),
  selectTab: (tabId, url) => ipcRenderer.invoke("browser:selectTab", tabId, url),
  closeTab: (tabId) => ipcRenderer.invoke("browser:closeTab", tabId),
  navigate: (tabId, url) => ipcRenderer.invoke("browser:navigate", tabId, url),
  goBack: (tabId) => ipcRenderer.invoke("browser:goBack", tabId),
  goForward: (tabId) => ipcRenderer.invoke("browser:goForward", tabId),
  reload: (tabId) => ipcRenderer.invoke("browser:reload", tabId),
  recoverTab: (tabId) => ipcRenderer.invoke("browser:recoverTab", tabId),
  stop: (tabId) => ipcRenderer.invoke("browser:stop", tabId),
  openDevTools: (tabId) => ipcRenderer.invoke("browser:openDevTools", tabId),
  toggleDevTools: (tabId) => ipcRenderer.invoke("browser:toggleDevTools", tabId),
  changeZoom: (action) => ipcRenderer.invoke("browser:changeZoom", action),
  findInPage: (query, direction) => ipcRenderer.invoke("browser:findInPage", query, direction),
  stopFindInPage: (returnFocus) => ipcRenderer.invoke("browser:stopFindInPage", returnFocus),
  // Mode A: Isolated Built-in Browser Proxy (persist:one-browser only)
  getProxyStatus: () => ipcRenderer.invoke("browser:proxy:getStatus"),
  setProxy: (config) => ipcRenderer.invoke("browser:proxy:set", config),
  clearProxy: () => ipcRenderer.invoke("browser:proxy:clear"),
  testProxy: (probeUrl) => ipcRenderer.invoke("browser:proxy:test", probeUrl),
  onNewTab: (listener) => onChannel("browser:new-tab", listener),
  onTabClosed: (listener) => onChannel("browser:tab-closed", listener),
  onRestoreAvailability: (listener) => onChannel("browser:restore-availability", listener),
  onState: (listener) => onChannel("browser:state", listener),
  onDownloads: (listener) => {
    const handler = (_event, payload) => {
      try {
        listener(payload.downloads, payload.status);
      } catch {
      }
    };
    ipcRenderer.on("browser:downloads", handler);
    return () => {
      try {
        ipcRenderer.removeListener("browser:downloads", handler);
      } catch {
      }
    };
  },
  onPermissions: (listener) => onChannel("browser:permissions", listener),
  onFocusAddressBar: (listener) => onChannel("browser:focus-address-bar", listener),
  onFocusFind: (listener) => onChannel("browser:focus-find", listener),
  onFindResult: (listener) => onChannel("browser:find-result", listener),
  onProxyStatus: (listener) => onChannel("browser:proxy-status", listener),
  onShortcut: (listener) => onChannel("browser:shortcut", listener),
  onTabCrashed: (listener) => onChannel("browser:tab-crashed", listener),
  onTabUnresponsive: (listener) => onChannel("browser:tab-unresponsive", listener),
  onTabResponsive: (listener) => onChannel("browser:tab-responsive", listener),
  onChildProcessGone: (listener) => onChannel("browser:child-process-gone", listener)
});
contextBridge.exposeInMainWorld("earthOneDesktop", {
  getNotificationPermission: () => ipcRenderer.invoke("desktop:getNotificationPermission"),
  showNotification: (payload) => ipcRenderer.invoke("desktop:showNotification", payload),
  onNotificationClick: (listener) => onChannel("desktop:notification-click", listener)
});
