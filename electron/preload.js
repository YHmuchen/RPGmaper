const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 项目管理
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  setProjectGameDir: (id) => ipcRenderer.invoke('set-project-game-dir', id),
  scanProjects: () => ipcRenderer.invoke('scan-projects'),
  addProject: () => ipcRenderer.invoke('add-project'),
  getProjectById: (id) => ipcRenderer.invoke('get-project-by-id', id),
  runScript: (script, projectId) => ipcRenderer.invoke('run-script', script, projectId),
  deleteProject: (id) => ipcRenderer.invoke('delete-project', id),
  clearMaps: (id) => ipcRenderer.invoke('clear-maps', id),

  // 查看器
  openViewer: (id) => ipcRenderer.invoke('open-viewer', id),
  loadMapInfos: (gameDir) => ipcRenderer.invoke('load-map-infos', gameDir),
  getMapDimensions: (gameDir, mapId) => ipcRenderer.invoke('get-map-dimensions', gameDir, mapId),
  readDataFile: (path) => ipcRenderer.invoke('read-data-file', path),
  getParallaxMaps: (gameDir) => ipcRenderer.invoke('get-parallax-maps', gameDir),
  loadMapData: (gameDir, mapId) => ipcRenderer.invoke('load-map-data', gameDir, mapId),
  loadSwitches: (gameDir) => ipcRenderer.invoke('load-switches', gameDir),
  loadViewerPlugins: (projectDir) => ipcRenderer.invoke('load-viewer-plugins', projectDir),

  // 事件
  onProjectAdded: (cb) => ipcRenderer.on('project-added', (e, d) => cb(d)),
  onScriptOutput: (cb) => ipcRenderer.on('script-output', (e, d) => cb(d)),
  onScriptDone: (cb) => ipcRenderer.on('script-done', (e, d) => cb(d)),

  // 插件
  getPlugins: () => ipcRenderer.invoke('get-plugins'),
  getPipeline: () => ipcRenderer.invoke('get-pipeline'),
  importPlugin: () => ipcRenderer.invoke('import-plugin'),
  onPluginOpen: (cb) => { ipcRenderer.removeAllListeners('menu-plugin-open'); ipcRenderer.on('menu-plugin-open', () => cb()); },
  onPluginHelp: (cb) => { ipcRenderer.removeAllListeners('menu-plugin-help'); ipcRenderer.on('menu-plugin-help', () => cb()); },
});
