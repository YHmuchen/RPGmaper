const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 项目管理
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  scanProjects: () => ipcRenderer.invoke('scan-projects'),
  addProject: () => ipcRenderer.invoke('add-project'),
  runScript: (script, gameDir) => ipcRenderer.invoke('run-script', script, gameDir),
  deleteProject: (name) => ipcRenderer.invoke('delete-project', name),
  clearMaps: (name) => ipcRenderer.invoke('clear-maps', name),

  // 查看器
  openViewer: (name, gameDir, projectDir) => ipcRenderer.invoke('open-viewer', name, gameDir, projectDir),
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
