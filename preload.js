const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Environment checks
  checkEnvironment: () => ipcRenderer.invoke('check-environment'),
  checkOpenclaw: () => ipcRenderer.invoke('check-openclaw'),

  // Installation
  installOpenclaw: () => ipcRenderer.invoke('install-openclaw'),

  // Configuration
  readOpenclawConfig: () => ipcRenderer.invoke('read-openclaw-config'),
  saveOpenclawConfig: (config) => ipcRenderer.invoke('save-openclaw-config', config),
  runOpenclawInit: (args) => ipcRenderer.invoke('run-openclaw-init', args),
  runOpenclawConfig: (key, value) => ipcRenderer.invoke('run-openclaw-config', key, value),

  // Utilities
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
  verifyOpenclaw: () => ipcRenderer.invoke('verify-openclaw'),

  // Event listeners
  onCommandOutput: (callback) => {
    ipcRenderer.on('command-output', (event, data) => callback(data));
  },
  removeCommandOutputListener: () => {
    ipcRenderer.removeAllListeners('command-output');
  },
});