const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  scanProjects: () => ipcRenderer.invoke('scan-projects'),
  addProject: () => ipcRenderer.invoke('add-project'),
  runScript: (script, gameDir) => ipcRenderer.invoke('run-script', script, gameDir),
  deleteProject: (name) => ipcRenderer.invoke('delete-project', name),

  onProjectAdded: (cb) => ipcRenderer.on('project-added', (e, d) => cb(d)),
  onScriptOutput: (cb) => ipcRenderer.on('script-output', (e, d) => cb(d)),
  onScriptDone: (cb) => ipcRenderer.on('script-done', (e, d) => cb(d)),
});
