const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('poeAPI', {
    fetchPoeData: (url, cookie) => ipcRenderer.invoke('fetch-poe-data', url, cookie),
    fetchNinjaData: (url) => ipcRenderer.invoke('fetch-ninja-data', url),
    openExternal: (url) => ipcRenderer.invoke('open-external', url)
});
