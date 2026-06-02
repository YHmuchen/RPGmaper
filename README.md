# RPGmaper

通过 CDP 远程调试从 RPG Maker MZ/MV 游戏中实时提取地图、tileset 和视差背景的工具。

## 用法

1. 启动游戏并开启远程调试端口：
   ```
   Game.exe --remote-debugging-port=9222
   ```

2. 提取地图：
   ```bash
   node scripts/export-maps.js
   ```
   输出到 `maps/Map*.png`

3. 提取 tileset 图片：
   ```bash
   node scripts/extract-tilesets.js
   ```
   输出到 `maps/tilesets/*.png`

4. 提取视差背景图：
   ```bash
   node scripts/extract-parallax.js
   ```
   输出到 `maps/parallax_*.png`

## 依赖

```bash
npm install chrome-remote-interface
```
