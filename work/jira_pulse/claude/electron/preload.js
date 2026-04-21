// Preload: expose a safe, typed-ish API to the renderer
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (data) => ipcRenderer.invoke('config:set', data),

  // Cache
  getCache: () => ipcRenderer.invoke('cache:get'),
  setCache: (data) => ipcRenderer.invoke('cache:set', data),
  clearCache: () => ipcRenderer.invoke('cache:clear'),

  // HTTP proxy (bypasses browser CORS; runs via axios in main process)
  request: (opts) => ipcRenderer.invoke('http:request', opts),

  // Env info
  platform: process.platform,
})
