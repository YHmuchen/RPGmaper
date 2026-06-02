# RPGmaper

从运行中的 RPG Maker MZ/MV 游戏提取地图、tileset 和视差背景的工具。

通过 CDP 远程调试连接游戏进程，使用游戏自身的 PIXI 渲染引擎导出地图，保留原始贴图效果。

## 截图

Map0003 (61x101) | Map0016 (35x52) | Map0120 (70x50)
:---:|:---:|:---:
![Map3](docs/sample_Map0003.jpg) | ![Map16](docs/sample_Map0016.jpg) | ![Map120](docs/sample_Map0120.jpg)

## 使用方法

### 1. 启动游戏

用带参数的方式启动游戏：

```
游戏.exe --remote-debugging-port=9222
```

也可以在 Steam 属性 → 启动选项中添加 `--remote-debugging-port=9222`。

### 2. 安装依赖

```bash
npm install chrome-remote-interface
```

### 3. 运行脚本

双击对应的 `.bat` 文件，或在命令行执行：

```bash
# 导出所有地图（全图 tile 渲染）
node scripts/export-maps.js

# 导出 tileset 图块素材
node scripts/extract-tilesets.js

# 导出视差背景图（CG场景用）
node scripts/extract-parallax.js
```

### 4. 输出

| 输出 | 位置 |
|------|------|
| 地图 PNG | `maps/Map0001.png` ~ `maps/Map0281.png` |
| tileset 图片 | `maps/tilesets/*.png` |
| 视差背景图 | `maps/parallax_*.png` |
| 地图数据 | `maps/mapdata_with_names.json` |
| tileset 定义 | `maps/tilesets.json` |

## 工作原理

```
┌─ 游戏进程 (NW.js) ─────────────┐
│  $dataMap / $gamePlayer / PIXI  │
│            ▲                    │
│  CDP (9222)│                    │
└────────────┼────────────────────┘
             │
┌────────────┴────────────────────┐
│  RPGmaper (Node.js)             │
│  → chrome-remote-interface      │
│  → Runtime.evaluate()           │
│  → 新建 PIXI Application        │
│  → 加载 tilemap + tileset 图片  │
│  → 离屏渲染 → 保存 PNG          │
└─────────────────────────────────┘
```

对加密游戏（如 `mrd.min.bin`）也能生效，因为数据已经在游戏进程内存中解密完毕，CDP 直接读取不绕加密层。

## 输出说明

- **Tile 地图**：有实际 tile 数据的普通地图
- **视差地图**：无 tile，使用全屏背景图 + 事件的过场场景（如旅馆、公会、剧情 CG）
- 输出的地图尺寸 = 地图宽高 × 48px（RPG Maker 标准 tile 尺寸）
