# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 1. 动手前先想清楚（Think Before Coding）

**不假设、不藏糊涂、把权衡摊开来说。**

实现之前：
- 把你的假设明确说出来，不确定就问。
- 有多种理解时，把所有可能列出来——别擅自挑一个就闷头干。
- 如果有更简单的方案，说出来，必要时反驳我。
- 哪里不清楚，就停下来，指出哪里让你困惑，然后问我。

## 2. 最小化原则（Simplicity First）

**只写解决问题的最小代码，不要任何"以防万一"。**

- 不写需求里没要求的功能。
- 不为一次性使用的代码做抽象。
- 不加未要求的"灵活性"或"可配置性"。
- 不为不可能发生的场景写 error handling。
- 如果你写了 200 行而 50 行就够，请重写。

自问一句："资深工程师会觉得这写得太复杂了吗？"如果是，请简化。

## 3. 外科手术式改动（Surgical Changes）

**只动该动的，只清自己的烂摊子。**

修改现有代码时：
- 别"顺手改进"周边代码、注释或格式。
- 别重构没坏的东西。
- 配合现有的代码风格，哪怕你不喜欢。
- 看到无关的死代码——告诉我，但别删。

如果你的改动产生了孤儿代码：
- 删掉因你改动而失去用途的 import / 变量 / 函数。
- 不要删原本就存在的死代码，除非我让你删。

判断标准：每一行改动都能追溯到我的需求。

## 4. 目标驱动执行（Goal-Driven Execution）

**定义成功标准，然后循环到通过为止。**

把任务转换成可验证的目标：
- "加个校验" → "写无效输入的测试，然后让它们通过"
- "修这个 bug" → "写能复现这个 bug 的测试，然后让它通过"
- "重构 X" → "保证重构前后测试都通过"

多步任务，给一个简短的计划：

1. [步骤] → 验证：[检查项]
2. [步骤] → 验证：[检查项]
3. [步骤] → 验证：[检查项]

---

## 项目架构

RPGmaper 是一个从 RPG Maker MZ/MV 游戏离线提取 tileset、渲染地图、分析传送点的工具。

### 目录结构

```
RPGmaper/
├── rpgmaper.bat                    # 启动 Electron 桌面管理器
├── scripts/
│   ├── render-maps.js              # [核心] 离线地图渲染器（sharp 像素合成）
│   ├── extract-tilesets.js         # [核心] tileset 导出（含解密）
│   ├── extract-transfers.js        # [核心] 传送点提取
│   ├── test-pipeline.js            # 全流程自动化测试
│   ├── api-server.js               # HTTP API 服务
│   ├── stitch-maps.js              # 无缝世界图拼接
│   └── plugins/                    # 渲染管线插件
│       ├── TileTime.js             # 时段 tile 替换（project:3）
│       ├── TemplateEvent.js        # TE 模板事件（project:3）
│       ├── ParallaxLayer.js        # PLM 视差图层（project:3）
│       ├── MapTone.js              # 色调系统标记（查看器端执行）
│       ├── NightRender.js          # 夜间渲染脚本注册（global）
│       └── CGShift.js              # CG 偏移校正（project:3）
├── electron/
│   ├── main.js                     # 主进程：项目管理、IPC、菜单
│   ├── preload.js                  # contextBridge API
│   └── renderer/
│       ├── index.html              # 桌面 GUI（项目卡片、全流程、插件管理）
│       ├── viewer.html             # 地图查看器（canvas 渲染、PLM 合成、色调）
│       └── viewer-plugins/         # 查看器插件（UI 控件注册）
├── docs/
│   ├── transfers_data.js           # [自动生成] 传送点数据
│   └── map22_*.png                 # README 展示图
└── maps/
    └── projects/
        ├── projects.json           # [自动生成] 项目 ID 索引
        └── <projectName>/          # 按项目组织
            ├── tilesets/           # 导出的 tileset PNG
            ├── maps/               # 渲染的地图 + tilemap sidecar
            ├── parallax/           # 视差背景图
            └── transfers_data.js   # 传送点数据
```

### 核心概念

- **插件归属**：`scripts/plugins/` 统一存放，通过 `tags` 区分。`global` 表示全局加载，`project:<ID>` 表示仅该项目加载。无标签视为全局。
- **projects.json**：在 `maps/projects/` 下自动生成，映射数字 ID → 项目名 → gameDir。所有 IPC 传 ID。
- **渲染管线**：`render-maps.js` 先输出纯 tile PNG，然后在 postRender 钩子中由 ParallaxLayer 插件处理 `--bake`（合入 PLM + 色调）。
- **查看器**：`viewer.html` 通过 `drawFx()` 叠加 PLM 图层和色调，可开关。

### 渲染管线数据流

1. **`extract-tilesets.js`** → 解密 `.png_` → `maps/projects/<name>/tilesets/`
2. **`render-maps.js`** → 读取 Map JSON + tileset PNG → sharp 逐像素合成（A1-A5, B-E, 阴影层）→ `maps/projects/<name>/maps/`
3. **`extract-transfers.js`** → 扫描 code=201 传送指令，递归解析公共事件 → `transfers_data.js`

### 插件钩子系统

| 钩子 | 时机 | 用途 |
|------|------|------|
| `mapStart` | 渲染开始前 | 修改 map.data、事件 tile |
| `beforeSprite` | 每个事件精灵渲染前 | 替换/跳过精灵 |
| `eventSprite` | 事件精灵渲染后 | 后处理精灵 |
| `postRender` | 整张地图输出后 | 叠加图层、色调（--bake） |
| `mapEnd` | 所有输出完成后 | 收尾 |

### --bake 模式

`node scripts/render-maps.js --bake <gameDir> <mapId>` 在渲染时合入 PLM 图层和 MapTone 色调，用于出展示图。默认不加 `--bake` 时输出纯净 tile PNG（供查看器用）。

---

## 常用命令

### 渲染管线

```bash
# 1. 导出 tileset（必须先执行）
node scripts/extract-tilesets.js <游戏目录>

# 2. 渲染地图（默认模式，供查看器用）
node scripts/render-maps.js <游戏目录>
node scripts/render-maps.js <游戏目录> 1 5 10 15

# 3. 带 PLM+色调 渲染（--bake 模式，出展示图用）
TIME_VAR_31=3 node scripts/render-maps.js --bake <游戏目录> 22

# 4. 指定时段
TIME_VAR_31=0 node scripts/render-maps.js <游戏目录> 22  # 朝
TIME_VAR_31=1 node scripts/render-maps.js <游戏目录> 22  # 昼
TIME_VAR_31=2 node scripts/render-maps.js <游戏目录> 22  # 夕
TIME_VAR_31=3 node scripts/render-maps.js <游戏目录> 22  # 夜

# 5. 全流程测试
node scripts/test-pipeline.js <游戏目录>
node scripts/test-pipeline.js <游戏目录> --verbose

# 6. 提取传送点
node scripts/extract-transfers.js <游戏目录>
```

### Electron 桌面应用

```bash
npm start
# 或
rpgmaper.bat
```

### API 服务

```bash
node scripts/api-server.js
node scripts/api-server.js 8080
```

---

## 关键实现细节

- **Tile 尺寸**: 48×48px，autotile 子块 24×24px
- **地图数据布局**: 4 层 tile (z=0,1,2,3) + 1 层阴影 (z=4)，`(z * h + y) * w + x`
- **Autotile**: 48 种形状表（`FLOOR_AUTOTILE_TABLE` / `WALL_AUTOTILE_TABLE` / `WATERFALL_AUTOTILE_TABLE`）
- **阴影层**: 半透黑 overlay（alpha 0.35），`dst = dst * (1 - 0.35 * dst.alpha)`
- **RPGMV 加密**: 16 字节头 `RPGMV\0…\x03\x01` + body 前 16 字节与 key XOR
- **大片地图**: 分 strip 渲染（`MAX_H=3800px`），sharp composite 合成
- **时段变量**: Variable 31（0=朝 1=昼 2=夕 3=夜），插件 TileTime 使用
- **PLM 视差图层**: 事件 note 中的 `<PLM:file>` 标签，插件 ParallaxLayer 处理
- **色调**: 查看器端 `drawFx()` 按 `<MAPTYPE>` 和时段叠加
