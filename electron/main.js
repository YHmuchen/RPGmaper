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
    const maps = fs.existsSync(path.join(dir, 'maps'))
      ? fs.readdirSync(path.join(dir, 'maps')).filter(f => f.endsWith('.png')).length : 0;
    projects.push({ name, tilesets, maps });
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

ipcMain.handle('add-project', async () => {
  await addProject();
  return scanProjects();
});

ipcMain.handle('run-script', async (event, scriptName, gameDir) => {
  const scripts = {
    tilesets: { file: 'scripts/extract-tilesets.js', label: '导出 tileset' },
    maps: { file: 'scripts/render-maps.js', label: '渲染地图' },
  };

  const s = scripts[scriptName];
  if (!s) return { ok: false, error: '未知脚本' };

  const scriptPath = path.join(PROJECT_ROOT, s.file);
  if (!fs.existsSync(scriptPath)) return { ok: false, error: `找不到 ${s.file}` };

  try {
    await new Promise((resolve, reject) => {
      const proc = spawn(process.execPath, [scriptPath, gameDir], {
        cwd: PROJECT_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';
      proc.stdout.on('data', d => {
        const text = d.toString();
        output += text;
        mainWindow.webContents.send('script-output', {
          script: scriptName,
          text: text.trim(),
        });
      });
      proc.stderr.on('data', d => { output += d.toString(); });

      proc.on('close', code => {
        mainWindow.webContents.send('script-done', {
          script: scriptName,
          ok: code === 0,
          error: code !== 0 ? output : null,
        });
        if (code === 0) resolve();
        else reject(new Error(output));
      });
      proc.on('error', reject);
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('delete-project', (event, name) => {
  const dir = path.join(PROJECTS_DIR, name);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return scanProjects();
});

// ─── 启动 ─────────────────────────────────────────────────────
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
