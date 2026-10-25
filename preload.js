const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('portal', {
  // mode 'cache': answer from the disk copy only, as { at, data }
  get: (path, mode) => ipcRenderer.invoke('get', path, mode),
  post: (path, fields) => ipcRenderer.invoke('post', path, fields),
  file: (url) => ipcRenderer.invoke('file', url),
  download: (url, name) => ipcRenderer.invoke('download', url, name),
  upload: (args) => ipcRenderer.invoke('upload', args),
  ajax: (method, args, mode) => ipcRenderer.invoke('ajax', method, args, mode),
  open: (url) => ipcRenderer.invoke('open', url),
  logout: () => ipcRenderer.invoke('logout'),
  theme: (mode) => ipcRenderer.invoke('theme', mode),
  setLang: (lang) => ipcRenderer.invoke('lang', lang),
  about: () => ipcRenderer.invoke('about'),
  doc: (name) => ipcRenderer.invoke('doc', name),
  clearCache: () => ipcRenderer.invoke('clearCache'),
  openData: () => ipcRenderer.invoke('openData'),
  poll: () => ipcRenderer.invoke('poll'),
  // Only these main->renderer events are exposed.
  onUnread: (cb) => ipcRenderer.on('unread', (_e, counts) => cb(counts)),
  onNavigate: (cb) => ipcRenderer.on('navigate', (_e, view) => cb(view)),
});
