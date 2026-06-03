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

强的成功标准让你能独立闭环；弱的（比如"让它跑起来"）会让你不停回来问我。

---

## 项目架构

RPGmaper 是一个从 RPG Maker MZ/MV 游戏提取地图、tileset 和视差背景的工具。

### 目录结构

```
RPGmaper/
│

### 入口方式

- **Desktop GUI**: `rpgmaper.bat` → Electron 桌面管理器，项目化管理多个游戏
- **CLI 脚本**: `render-maps.bat` / `node scripts/render-maps.js` 直接运行

### 目录结构

RPGmaper/
├── *.bat                          # Windows 便捷入口
│   ├── rpgmaper.bat               # 启动 Electron 桌面管理器
│   ├── render-maps.bat            # 直接运行 render-maps.js
│   ├── extract-tilesets.bat       # 导出 tileset
├── scripts/                       # CLI 脚本 (Node.js)
│   ├── render-maps.js             # [核心] 离线地图渲染器（sharp 像素合成）
│   ├── extract-tilesets.js        # [核心] 从游戏目录导出 tileset 图片（含解密）
│   ├── extract-transfers.js       # [核心] 提取所有地图传送点（可解析公共事件链）
│   ├── test-pipeline.js           # 全流程自动化测试（tileset→渲染→抽样检查）
│   ├── api-server.js              # HTTP API 服务（地图关系/布局数据）
│   ├── stitch-maps.js             # 将地图按传送关系拼合成无缝世界图
├── electron/                      # Electron 桌面管理器
│   ├── main.js                    # 主进程：项目管理、运行脚本、菜单
│   ├── preload.js                 # contextBridge：暴露 scanProjects/runScript 等 API
│   └── renderer/index.html        # GUI：项目卡片、日志面板、按钮触发 tileset/地图/全流程
├── docs/                          # 文档与查看器
│   ├── map-viewer.html            # 地图关系查看器（加载 transfers_data.js）
│   ├── transfers_data.js          # [自动生成] 传送点数据
│   └── sample_*.jpg/png           # 示例输出
└── maps/                          # 输出目录
    └── projects/                  # 按游戏项目组织
        └── <projectName>/
            ├── tilesets/          # 导出的 tileset PNG
            ├── maps/              # 渲染的地图 PNG
            ├── parallax/          # 视差背景图
            ├── test-report.json   # 测试报告
            └── transfers_data.js  # 传送点数据（从 docs 复制）
```

### 核心数据流（离线管线）

1. **`extract-tilesets.js`** → 从游戏 `img/tilesets/` 读取加密 `.png_` 文件，用 System.json 中的 `encryptionKey` 解密（RPGMV 格式：16 字节头 `RPGMV\0\0\0\0\0\x03\x01\0\0\0\0\0` + body 前 16 字节与 key XOR），输出 PNG 到 `maps/projects/<name>/tilesets/`
2. **`render-maps.js`** → 读取 `data/Map*.json`，加载 tileset PNG，按 RPG Maker tile 系统（A1-A5, B-E, 阴影层）逐像素合成，输出到 `maps/projects/<name>/maps/`
3. **`extract-transfers.js`** → 扫描 Map JSON 中的 Transfer Player 指令（code=201），递归解析公共事件调用链（code=117），输出 `docs/transfers_data.js`

### 关键实现细节

- **Tile 尺寸**: 48×48px，autotile 子块 24×24px
- **地图数据布局**: 4 层 tile (z=0,1,2,3) + 1 层阴影 (z=4)，扁平数组索引公式 `(z * h + y) * w + x`
- **Autotile 类型**: A1 (流水/动画), A2 (地板), A3 (墙壁), A4 (墙壁/屋顶), A5 (普通)
- **Autotile 渲染**: 使用 RPG Maker 的 48 种形状表（`FLOOR_AUTOTILE_TABLE` / `WALL_AUTOTILE_TABLE` / `WATERFALL_AUTOTILE_TABLE`），每格拆 4 个子块
- **阴影层**: 半透黑 overlay（alpha 0.35），公式 `dst = dst * (1 - 0.35 * dst.alpha)`
- **RPGMV 加密**: 文件头 16 字节签名校验，body 前 16 字节与 `encryptionKey` XOR；key 从 System.json 读取（32 hex→16 bytes）
- **大片地图**: 支持分 strip 渲染（`MAX_H=3800px`），用 sharp 的 composite 合成
- **视差地图**: 先解密 `img/parallaxes/*.png_`，缩放填满地图尺寸，再在其上叠加 tile

### 杂项

- **加密密钥**: `System.json` 中 `encryptionKey` 字段，32 位 hex 字符串

## 常用命令

### 离线渲染管线

```bash
# 1. tileset 导出（必须先执行）
node scripts/extract-tilesets.js <游戏目录>

# 2. 渲染所有地图
node scripts/render-maps.js <游戏目录>

# 3. 渲染指定地图（支持多个 ID）
node scripts/render-maps.js <游戏目录> 1 5 10 15

# 4. 全流程测试（tileset 导出 → 渲染 → 抽样检查 PNG 尺寸）
node scripts/test-pipeline.js <游戏目录>
node scripts/test-pipeline.js <游戏目录> --verbose

# 5. 提取传送点
node scripts/extract-transfers.js <游戏目录>
```

### API 服务

```bash
# 启动地图关系 API（默认端口 3456）
node scripts/api-server.js
node scripts/api-server.js 8080
```

### Electron 桌面应用

```bash
npm start
# 或
rpgmaper.bat
```


