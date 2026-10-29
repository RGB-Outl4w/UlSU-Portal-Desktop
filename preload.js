const { contextBridge, ipcRenderer } = require('electron');

// UI prefs from prefs.json (main.js) go into localStorage before app.js runs: the file is written at once
// on every change, localStorage only eventually, so after a forced quit the file is the newer copy.
try {
  for (const [k, v] of Object.entries(JSON.parse(ipcRenderer.sendSync('prefs-load') || '{}'))) localStorage.setItem(k, v);
} catch {}

contextBridge.exposeInMainWorld('portal', {
  platform: process.platform, // 'win32' | 'darwin' — for ⌘ vs Ctrl and window chrome
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
  checkUpdate: () => ipcRenderer.invoke('checkUpdate'),
  poll: () => ipcRenderer.invoke('poll'),
  savePrefs: (json) => ipcRenderer.send('prefs-save', json),
  // Only these main->renderer events are exposed.
  onUnread: (cb) => ipcRenderer.on('unread', (_e, counts) => cb(counts)),
  onNavigate: (cb) => ipcRenderer.on('navigate', (_e, view) => cb(view)),
  onSession: (cb) => ipcRenderer.on('session', (_e, state) => cb(state)), // 'ok' | 'expired' | 'maintenance'
});
