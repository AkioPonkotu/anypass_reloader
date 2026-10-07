const { contextBridge, ipcRenderer } = require('electron');

// 外部サイトを表示する WebContents と設定 UI を分離し、レンダラーには必要な
// 操作だけを公開する。Node API や設定ファイルへの直接アクセスは公開しない。
contextBridge.exposeInMainWorld('watcher', {
  getState: () => ipcRenderer.invoke('watcher:get-state'),
  getConfig: () => ipcRenderer.invoke('watcher:get-config'),
  saveConfig: (patch) => ipcRenderer.invoke('watcher:save-config', patch),
  start: (payment) => ipcRenderer.invoke('watcher:start', payment),
  stop: () => ipcRenderer.invoke('watcher:stop'),
  refreshSearchOptions: () => ipcRenderer.invoke('watcher:refresh-search-options'),
  showResaleList: () => ipcRenderer.invoke('watcher:show-resale-list'),
});
