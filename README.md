# RPGmaper

从 RPG Maker MZ/MV 游戏提取 tileset、渲染地图、查看和传送点分析的工具。

支持 **离线管线**：直接读取游戏文件（含加密），无需运行游戏即可导出地图。

## 截图

Map0003 (61x101) | Map0016 (35x52) | Map0120 (70x50)
:---:|:---:|:---:
![Map3](docs/sample_Map0003.jpg) | ![Map16](docs/sample_Map0016.jpg) | ![Map120](docs/sample_Map0120.jpg)

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 导出 tileset

```bash
node scripts/extract-tilesets.js <游戏目录>
```

从游戏 `img/tilesets/` 读取（自动解密 RPG MV 加密的 `.png_` 文件），输出到 `maps/projects/<项目名>/tilesets/`。

### 3. 渲染地图

```bash
# 渲染所有地图
node scripts/render-maps.js <游戏目录>

# 渲染指定地图
node scripts/render-maps.js <游戏目录> 1 5 10 15
```

按 RPG Maker 的 tile 系统（A1-A5, B-E, 阴影层）逐像素合成，输出到 `maps/projects/<项目名>/maps/`。

### 4. 提取传送点

```bash
node scripts/extract-transfers.js <游戏目录>
```

扫描地图事件中的 Transfer Player 指令（code=201），递归解析公共事件调用链（code=117），输出到 `docs/transfers_data.js`。

### 5. 一键全流程

```bash
node scripts/test-pipeline.js <游戏目录>
node scripts/test-pipeline.js <游戏目录> --verbose
```

自动执行 tileset 导出 → 地图渲染 → 抽样检查。

## 桌面应用（Electron）

```bash
npm start
```

或双击 `rpgmaper.bat`。

功能：
- **项目管理**：添加/删除游戏项目，自动扫描输出状态
- **全流程按钮**：一键运行 tileset 导出 → 地图渲染 → 传送点提取
- **地图查看器**：浏览已渲染的地图，传送点高亮导航，昼夜切换
- **插件管理**：启用/禁用渲染插件

### 地图查看器

在 Electron 中点击「查看地图」打开。支持：

| 功能 | 说明 |
|------|------|
| 地图浏览 | 下拉选择地图，滚轮缩放，拖拽平移 |
| 传送点导航 | 彩色高亮（绿=地图传送，蓝=公共事件，黄=可返回），点击跳转 |
| 昼夜切换 | 下拉切换昼/夕方/夜，图像即时切换（不重载），色调同步 |
| 视差图层 | PLM 图层开关（加算/阴影/乗算），逐像素合成 |
| 格子选择 | 点选格子，复制事件/坐标数据 |
| 内容适配 | 自动裁剪空白边距，居中适配 |

## 插件系统

插件放在 `scripts/plugins/` 目录，通过钩子介入渲染管线。

### 现有插件

| 插件 | 钩子 | 功能 |
|------|------|------|
| **TileTime** | `mapStart` | 按 Variable 31（時間帯）替换 tile，窗户/辉光昼夜切换 |
| **TemplateEvent** | `beforeSprite` | 解析 `<TE上書き>` 标签，支持注释模板，蜡烛昼夜分页 |
| **ParallaxLayer** | `postRender` | 从事件 note 的 `<PLM:file>` 标签提取视差图层，输出到 `MapXXXX_plm/` |
| **MapTone** | — | 查看器中按地图 `<MAPTYPE>` 标签应用色调（昼/夕方/夜） |
| **NightRender** | — | 注册 CLI 脚本，渲染夜间版本地图（`_night.png`） |
| **CGShift** | — | CG 场景偏移校正 |

### 创建插件

```javascript
// scripts/plugins/MyPlugin.js
module.exports = {
  name: 'MyPlugin',
  description: '插件功能描述',
  hook: 'mapStart',           // 钩子点：mapStart / beforeSprite / eventSprite / postRender / mapEnd
  tags: ['tag1', 'tag2'],

  process: function(ctx) {
    // ctx.map       — 当前地图数据
    // ctx.gameDir   — 游戏目录
    // ctx.outDir    — 输出目录
    // ctx.mapId     — 地图 ID
    // global.TIME_VARIABLE_31 — 时段变量
    // global.PLUGIN_ENC_KEY   — 加密密钥
  }
};
```

查看器插件放在 `electron/renderer/viewer-plugins/`，通过 UI 声明系统注册控件（下拉框、按钮、复选框）。

### 兼容性

**操心の魔導具**（无任何插件）全流程不受影响：空 `scripts/plugins/` 目录 → 零 HOOKS → 零运行时开销。

## 输出目录结构

```
maps/projects/<项目名>/
├── tilesets/           # 导出的 tileset PNG
├── maps/               # 渲染的地图 PNG
│   ├── Map0001.png     # 白天地图
│   ├── Map0001_night.png  # 夜间地图（可选）
│   ├── tilemaps_data.js   # tilemap 数据（供查看器）
│   └── Map0001_plm/       # 视差图层（可选）
├── parallax/           # 视差背景图
├── transfers_data.js   # 传送点数据
└── test-report.json    # 测试报告
```

## 技术细节

- **Tile 尺寸**：48×48px，autotile 子块 24×24px
- **地图数据布局**：4 层 tile (z=0,1,2,3) + 1 层阴影 (z=4)，扁平数组 `(z * h + y) * w + x`
- **Autotile 渲染**：48 种形状表（地板/墙壁/瀑布），每格拆 4 子块合成
- **阴影层**：半透黑 overlay（alpha 0.35）
- **RPG MV 加密**：16 字节头 `RPGMV\0…\x03\x01` + body 前 16 字节与 key XOR
- **时段系统**：Variable 31，0=朝 1=昼 2=夕 3=夜
- **大片地图**：支持分 strip 渲染（`MAX_H=3800px`），sharp composite 合成
