const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PROJECTS_DIR = path.join(PROJECT_ROOT, 'maps', 'projects');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: 'RPGmaper',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  const menu = Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [
        { label: '添加游戏…', accelerator: 'CmdOrCtrl+O', click: () => addProject() },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '打开输出目录', click: () => openProjectsDir() },
        { type: 'separator' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { role: 'reload', label: '重新加载' },
      ],
    },
    {
      label: '插件',
      submenu: [
        { label: '插件管理…', click: () => mainWindow.webContents.send('menu-plugin-open') },
        { type: 'separator' },
        { label: '插件开发帮助…', click: () => mainWindow.webContents.send('menu-plugin-help') },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

// ─── 项目管理 ─────────────────────────────────────────────────
function scanProjects() {
  const projects = [];
  if (!fs.existsSync(PROJECTS_DIR)) return projects;
  for (const name of fs.readdirSync(PROJECTS_DIR)) {
    const dir = path.join(PROJECTS_DIR, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const tilesets = fs.existsSync(path.join(dir, 'tilesets'))
      ? fs.readdirSync(path.join(dir, 'tilesets')).filter(f => f.endsWith('.png')).length : 0;
    const trans = fs.existsSync(path.join(dir, 'transfers_data.js')) ? true : false;
    const tilemapJS = fs.existsSync(path.join(dir, 'maps', 'tilemaps_data.js')) ? true : false;
    const maps = fs.existsSync(path.join(dir, 'maps'))
      ? fs.readdirSync(path.join(dir, 'maps')).filter(f => f.endsWith('.png')).length : 0;
    projects.push({ name, tilesets, maps, hasTransfers: trans, hasTilemaps: tilemapJS });
  }
  return projects;
}

async function addProject() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择游戏目录',
  });
  if (result.canceled) return;

  const gameDir = result.filePaths[0].replace(/\\/g, '/');
  const sysPath = path.join(gameDir, 'data', 'System.json');
  if (!fs.existsSync(sysPath)) {
    dialog.showMessageBox(mainWindow, { type: 'warning', message: '所选目录不是 RPG Maker 游戏目录（未找到 data/System.json）' });
    return;
  }

  const projectName = path.basename(gameDir).replace(/[\s_]+$/, '');
  const projectDir = path.join(PROJECTS_DIR, projectName);
  fs.mkdirSync(path.join(projectDir, 'tilesets'), { recursive: true });

  mainWindow.webContents.send('project-added', { name: projectName, gameDir, projectDir: projectDir.replace(/\\/g, '/') });
}

function openProjectsDir() {
  const target = fs.existsSync(PROJECTS_DIR) ? PROJECTS_DIR : PROJECT_ROOT;
  require('child_process').exec(`explorer "${target}"`);
}

// ─── IPC ──────────────────────────────────────────────────────
ipcMain.handle('scan-projects', () => scanProjects());

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择游戏目录',
  });
  if (result.canceled) return null;
  return result.filePaths[0].replace(/\\/g, '/');
});

ipcMain.handle('add-project', async () => {
  await addProject();
  return scanProjects();
});

ipcMain.handle('run-script', (event, scriptName, gameDir) => {
  const scripts = {
    tilesets: { file: 'scripts/extract-tilesets.js', label: '导出 tileset' },
    transfers: { file: 'scripts/extract-transfers.js', label: '提取传送点' },
    maps: { file: 'scripts/render-maps.js', label: '渲染地图' },
  };

  const s = scripts[scriptName];
  if (!s) return { ok: false, error: '未知脚本' };

  const scriptPath = path.join(PROJECT_ROOT, s.file);
  if (!fs.existsSync(scriptPath)) return { ok: false, error: '找不到' + s.file };

  return new Promise(resolve => {
    let timer = setTimeout(() => { proc.kill(); resolve({ ok: false, error: "脚本执行超时" }); }, 600000);
    const proc = spawn("node", [scriptPath, gameDir], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    proc.stdout.on("data", d => {
        const text = d.toString();
        output += text;
        try { mainWindow.webContents.send("script-output", { script: scriptName, text: text.trim() }); } catch(e) {}
      });
    proc.stderr.on('data', d => { output += d.toString(); });

    proc.on('close', code => {
      clearTimeout(timer);
      resolve({ ok: code === 0, error: code !== 0 ? output : null, output });
    });
    proc.on('error', err => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
  });
});

ipcMain.handle('delete-project', (event, name) => {
  const dir = path.resolve(PROJECTS_DIR, name);
  if (!dir.startsWith(path.resolve(PROJECTS_DIR))) return scanProjects();
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return scanProjects();
});


// ─── 查看器 IPC ──────────────────────────────────────────────
ipcMain.handle('open-viewer', (event, projectName, gameDir, projectDir) => {
  const viewer = new BrowserWindow({
    width: 1400, height: 900,
    title: 'RPGmaper - ' + projectName,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });
  const absProjectDir = path.resolve(PROJECTS_DIR, projectName);
  viewer.loadFile(path.join(__dirname, 'renderer', 'viewer.html'), {
    query: { name: projectName, gameDir: gameDir, projectDir: absProjectDir },
  });
  return true;
});

ipcMain.handle('load-map-infos', (event, gameDir) => {
  if (!gameDir) return null;
  const p = path.join(gameDir, 'data', 'MapInfos.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
});

ipcMain.handle('get-map-dimensions', (event, gameDir, mapId) => {
  if (!gameDir) return null;
  const p = path.join(gameDir, 'data', 'Map' + String(mapId).padStart(3, '0') + '.json');
  if (!fs.existsSync(p)) return null;
  try {
    const map = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
    return { w: map.width, h: map.height };
  } catch (e) { return null; }
});

ipcMain.handle('read-data-file', (event, filePath) => {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
});

ipcMain.handle('get-parallax-maps', (event, gameDir) => {
  if (!gameDir) return {};
  const result = {};
  const infosPath = path.join(gameDir, 'data', 'MapInfos.json');
  if (!fs.existsSync(infosPath)) return result;
  const infos = JSON.parse(fs.readFileSync(infosPath, 'utf8').replace(/^﻿/, ''));
  for (let i = 1; i < infos.length; i++) {
    if (!infos[i]) continue;
    const mapPath = path.join(gameDir, 'data', 'Map' + String(i).padStart(3, '0') + '.json');
    if (!fs.existsSync(mapPath)) continue;
    try {
      const map = JSON.parse(fs.readFileSync(mapPath, 'utf8').replace(/^﻿/, ''));
      if (map.parallaxName && map.parallaxName.length > 0) result[i] = map.parallaxName;
    } catch (e) {}
  }
  return result;
});

// ─── 插件 ──────────────────────────────────────────────────────
ipcMain.handle('get-plugins', () => {
  const dir = path.join(PROJECT_ROOT, 'scripts', 'plugins');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => {
    const fullPath = path.join(dir, f);
    try {
      const src = fs.readFileSync(fullPath, 'utf8');
      const val = (re, fallback) => { var m = src.match(re); return m ? m[1] : fallback; };
      const name = val(/name:\s*['"]([^'"]+)['"]/, f.replace('.js', ''));
      const desc = val(/description:\s*['"]([^'"]+)['"]/, '');
      const hook = val(/hook:\s*['"]([^'"]+)['"]/, '?');
      const tags = val(/tags:\s*\[([^\]]+)\]/, '');
      const tagList = tags ? tags.split(',').map(t => t.trim().replace(/['"]/g, '')) : [];
      const enabled = src.includes('process:') && src.includes('function');
      return { file: f, name, description: desc, hook, tags: tagList, enabled };
    } catch (e) {
      return { file: f, name: f.replace('.js', ''), description: '读取失败', hook: '?', tags: [], enabled: false };
    }
  });
});

ipcMain.handle('import-plugin', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: '插件文件', extensions: ['js'] }],
    title: '导入插件',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const srcPath = result.filePaths[0];
  const destDir = path.join(PROJECT_ROOT, 'scripts', 'plugins');
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const fileName = path.basename(srcPath);
  const destPath = path.join(destDir, fileName);

  // 检查是否重复
  if (fs.existsSync(destPath)) {
    return { file: fileName, success: false, duplicate: true };
  }

  try {
    fs.copyFileSync(srcPath, destPath);
    return { file: fileName, success: true };
  } catch (e) {
    return { file: fileName, success: false, error: e.message };
  }
});

// ─── 启动 ─────────────────────────────────────────────────────
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
