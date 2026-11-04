'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('earthOneBrowser', {
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
  }
});
