# Plan: Electron 桌面套壳 + 全流程自动化测试

## Context

用户已拥有完整的离线管线（extract-tilesets → render-maps），但操作仍依赖命令行，且每切换一个游戏都要手动执行两条命令。目标是：
1. 将这组工具包装成**桌面应用**，提供图形化的项目管理（选择游戏、一键运行全流程）
2. 设计一个**自动化测试脚本**，能自主跑通完整流程并对输出做基础校验，方便后续验证新游戏兼容性

## 设计思路

### 方案：轻量 Electron 套壳

复用已有的 `feat/electron-app` 分支上的工作，但大幅简化：
- **不做** 内嵌 viewer（不把 map-viewer.html 搬进来）
- **做** 项目管理 + 脚本调度 — 选游戏目录、一键 tileset 导出 + 地图渲染
- 输出通过 `maps/projects/<项目名>/` 组织，用户可以用原来的 `docs/map-viewer.html` 或文件管理器查看结果

### 架构

```
electron/
├── main.js          — 主进程：窗口、IPC、运行脚本
├── preload.js       — 安全桥接
└── renderer/
    ├── index.html   — 项目管理界面（游戏列表、状态、一键执行）
    └── style.css
```

## 分步计划

### 第 1 步：创建分支 + 基础 Electron 壳

- 从 `feat/test-new-game` 建新分支
- 初始化 `electron/main.js`（窗口、菜单）
- 初始化 `electron/preload.js`
- 初始化 `electron/renderer/index.html`（极简管理界面）
- `package.json` 添加 `"start": "electron ."` 和 `"main": "electron/main.js"`

### 第 2 步：项目管理功能

- **项目列表**：扫描 `maps/projects/` 目录，列出已有项目
- **添加项目**：打开目录选择器 → 验证 System.json → 添加项目
- **删除项目**：移除项目数据
- **状态显示**：每个项目显示「tileset 状态 / 地图渲染状态」

### 第 3 步：一键执行管线

- 界面按钮「导出 tileset」→ 调用 `extract-tilesets.js`
- 界面按钮「渲染地图」→ 调用 `render-maps.js`
- 界面按钮「全流程」→ tileset 导出 + 地图渲染连续执行
- 子进程输出实时显示在界面日志区

### 第 4 步：自动化测试脚本 `scripts/test-pipeline.js`

功能：
1. **参数**：`node scripts/test-pipeline.js <游戏目录>`
2. **流程**：
   - 导出 tileset → 检查退出码、检查 tileset 文件数 > 0
   - 渲染地图 → 检查退出码、检查输出 PNG 数量 = MapInfos 地图数
   - 采样检查：随机抽查 5 张地图的 PNG 尺寸是否正确（与 JSON 中 width×height×48 对比）
   - 统计通过/失败，输出 JSON 报告
3. **报告格式**：

```json
{
  "game": "Dragon Conqueror",
  "timestamp": "2026-06-03T...",
  "tilesets": { "expected": 85, "exported": 85, "pass": true },
  "maps": { "expected": 73, "rendered": 73, "pass": true, "spotCheck": { "sampled": 5, "passed": 5 } },
  "duration": 123456,
  "pass": true
}
```

### 第 5 步：用选定的游戏跑测试

测试候选游戏（从探测到的 RPG Maker 游戏中选）：

| 游戏 | 地图数 | 加密 | 推荐理由 |
|------|--------|------|---------|
| **Dragon Conqueror** (巨龙征服者) | 354 | `.png_` | ✅ 已验证工作，中等规模 |
| 操心の魔導具 | 73 | `.png_` | ✅ 已验证，原项目目标 |
| 聖女エルナと堕淫の書 | 191 | `.rpgmvp` (空密钥) | 测试 `.rpgmvp` 格式兼容 |
| Amelie falls over and over | 449 | `.rpgmvp` (空密钥) | 大规模压力测试 |

## 关键文件

| 文件 | 说明 |
|------|------|
| `electron/main.js` | 主进程（窗口、菜单、IPC） |
| `electron/preload.js` | 安全桥接 |
| `electron/renderer/index.html` | 项目管理界面 |
| `electron/renderer/style.css` | 界面样式 |
| `scripts/test-pipeline.js` | 自动化测试脚本 |
| `package.json` | 添加 `main` 和 `start` |
| `.gitignore` | 可能不需改动 |

## 验证方式

1. `npm start` 启动 Electron 应用 → 能看到项目管理界面
2. 添加一个游戏目录 → 一键全流程 → tileset + 地图成功生成
3. `node scripts/test-pipeline.js` 跑测试 → 输出 JSON 报告，pass 为 true
4. 用 `Dragon Conqueror` 和 `操心の魔導具` 各跑一次全流程
