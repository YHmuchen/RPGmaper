<div align="center">

# 🗺️ RPGmaper

An offline map rendering toolchain for **RPG Maker MZ/MV** — extract tilesets, render maps, and analyze transfer points without launching the game.

[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933?logo=node.js)](https://nodejs.org)
[![Sharp](https://img.shields.io/badge/Render-Sharp-99c24c)](https://sharp.pixelplumbing.com)
[![Electron](https://img.shields.io/badge/Desktop-Electron-47848f?logo=electron)](https://www.electronjs.org)
[![License](https://img.shields.io/badge/License-MIT-yellow)](../LICENSE)

Works fully **offline**: reads game files directly (including encrypted `.png_` files like `mrd.min.bin`), no game runtime required.

[中文版](../README.md)

</div>

---

## 📸 Showcase

エニシアと契約紋 ～馬蹄通りの小聖女～ Map22 (church chapel) rendered at all four time periods:

Morning (0) | Day (1) | Evening (2) | Night (3)
:---:|:---:|:---:|:---:
![Morning](map22_morning.png) | ![Day](map22_day.png) | ![Evening](map22_evening.png) | ![Night](map22_night.png)

Day/night window glow, candle pagination, and parallax layer (PLM) compositing are all handled by the plugin system.

---

## ✨ Core Features

### 🎨 Offline Rendering Pipeline

- **Headless rendering** — reads `data/Map*.json` + `img/tilesets/` directly, compositing pixel-by-pixel with Sharp; no game engine required
- **Encryption support** — auto-detects RPG Maker MV encryption (16-byte `RPGMV\0…` header + XOR body), decrypts on the fly
- **Full tile coverage** — A1 (animated water/lava) / A2 (floors) / A3-A4 (walls/roofs) / A5 / B-E / shadow layer, with 48 autotile shape tables
- **Large map support** — splits into strips (`MAX_H=3800px`) and composites them via Sharp
- **Parallax backgrounds** — auto-decrypts `img/parallaxes/*.png_`, scales to map size, composites beneath tiles
- **Transfer extraction** — scans Transfer Player event commands (code=201), recursively resolves common event call chains (code=117)

### 🖥️ Map Viewer (Electron)

- **Quick navigation** — dropdown map list, scroll-to-zoom, drag-to-pan
- **Transfer point overlays** — color-coded highlights (green = map transfer, blue = common event, yellow = returnable), click to jump with event details
- **Day/night toggle** — dropdown switches between morning/day/evening/night, instant image swap with synchronized tints
- **Parallax layers (PLM)** — extracted from event notes, supports additive/shadow/multiply blend modes, per-pixel compositing
- **Tile inspection** — click to see coordinates/tileId/events, copy to clipboard
- **Content fitting** — auto-crops blank margins, one-click center

### 🧩 Plugin System

- **5 hook points** — `mapStart` / `beforeSprite` / `eventSprite` / `postRender` / `mapEnd`
- **Zero overhead** — empty hooks when no plugins are loaded, no performance impact on the core pipeline
- **Dynamic pipeline** — plugins can register CLI scripts and declare `after` dependencies, auto-inserted into the workflow
- **Viewer plugins** — register UI controls (dropdowns, buttons, checkboxes) via a declarative system
- **Non-invasive** — any unmodified project works perfectly with zero plugins loaded

---

## 🚀 Quick Start

### Option 1: CLI

```bash
# 1. Install dependencies
npm install

# 2. Export tilesets (required first step)
node scripts/extract-tilesets.js <gameDir>

# 3. Render maps
node scripts/render-maps.js <gameDir>         # all maps
node scripts/render-maps.js <gameDir> 1 5 10  # specific map IDs

# 4. Extract transfer points
node scripts/extract-transfers.js <gameDir>

# 5. Full pipeline test
node scripts/test-pipeline.js <gameDir>
node scripts/test-pipeline.js <gameDir> --verbose
```

**Render at a specific time of day:**

```bash
TIME_VAR_31=0 node scripts/render-maps.js <gameDir> 22  # morning
TIME_VAR_31=1 node scripts/render-maps.js <gameDir> 22  # day
TIME_VAR_31=2 node scripts/render-maps.js <gameDir> 22  # evening
TIME_VAR_31=3 node scripts/render-maps.js <gameDir> 22  # night
```

**Bake PLM + tints into output (for showcase images):**

```bash
TIME_VAR_31=3 node scripts/render-maps.js --bake <gameDir> 22
```

### Option 2: Electron Desktop App

```bash
npm start
```

Or double-click `rpgmaper.bat`.

| Feature | Description |
|---------|-------------|
| 📁 **Project Management** | Add/remove game projects, auto-scan tileset/map/transfer status |
| ▶️ **Full Pipeline** | One-click tileset export → map render → transfer extraction, live progress |
| 🗺️ **Map Viewer** | Built-in viewer with navigation, transfer jump, day/night, PLM toggle |
| 🧩 **Plugin Manager** | Enable/disable render plugins, import/export plugin files |

### Option 3: HTTP API

```bash
# Start the map relationship API (default port 3456)
node scripts/api-server.js
node scripts/api-server.js 8080
```

---

## 🧩 Plugin System

### Built-in Plugins

| Plugin | Hook | Function |
|--------|------|----------|
| **TileTime** | `mapStart` | Swaps tiles based on Variable 31 (time of day) — window glow, lighting |
| **TemplateEvent** | `beforeSprite` | Parses `<TE上書き>` tags, template-based event overrides, candle pagination |
| **ParallaxLayer** | `postRender` | Extracts `<PLM:file>` layers from event notes, outputs to `MapXXXX_plm/` |
| **MapTone** | — | Applies tint via viewer based on map `<MAPTYPE>` and time of day |
| **NightRender** | — | Registers a CLI script to render night versions (`_night.png`) |
| **CGShift** | — | CG scene offset correction |

### Creating a Render Plugin

```javascript
// scripts/plugins/MyPlugin.js
module.exports = {
  name: 'MyPlugin',
  description: 'Plugin description',
  hook: 'mapStart',  // mapStart | beforeSprite | eventSprite | postRender | mapEnd
  tags: ['global'],

  process: function(ctx) {
    // ctx.map       current map data
    // ctx.gameDir   game directory path
    // ctx.outDir    output directory
    // ctx.mapId     map ID
    // global.TIME_VARIABLE_31  time of day (0=morning 1=day 2=evening 3=night)
    // global.PLUGIN_ENC_KEY    encryption key as byte array
  }
};
```

### Creating a Viewer Plugin

Viewer plugins live in `electron/renderer/viewer-plugins/` and register via `registerViewerPlugin()`:

```javascript
(function() {
  registerViewerPlugin({
    name: 'MyViewerPlugin',
    hook: 'timeChange',
    ui: [{
      type: 'select',           // select | button | checkbox
      target: 'toolbar',
      label: 'Option',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      onChange: function(val) {
        // called when user changes selection
      },
    }],
  });
})();
```

---

## 📂 Output Structure

```
maps/projects/<projectName>/
├── tilesets/                    # exported tileset PNGs
├── maps/                        # rendered maps
│   ├── Map0001.png              # daytime version
│   ├── Map0001_night.png        # nighttime version (optional)
│   ├── tilemaps_data.js         # tilemap data (for viewer)
│   └── Map0001_plm/             # parallax layers (optional)
├── parallax/                    # parallax background images
├── transfers_data.js            # transfer point data
└── test-report.json             # test report
```

---

## ⚙️ Technical Details

| Topic | Details |
|-------|---------|
| **Tile size** | 48×48px, autotile sub-tiles 24×24px |
| **Map data layout** | 4 tile layers (z=0,1,2,3) + 1 shadow layer (z=4), flat array `(z × h + y) × w + x` |
| **Autotile** | 48 shape tables (floor/wall/waterfall), each tile split into 4 sub-tiles for compositing |
| **Shadow layer** | Semi-transparent black overlay, alpha 0.35, `dst = dst × (1 - 0.35 × dst.alpha)` |
| **RPG MV encryption** | 16-byte header `RPGMV\0\0\0\0\0\x03\x01\0\0\0\0\0` + first 16 bytes of body XOR'd with key |
| **Time variable (TileTime)** | Variable 31: 0=morning 1=day 2=evening 3=night |
| **Tint system (MapTone)** | Per-`<MAPTYPE>` tint offset by time period, applied in the viewer |
| **Parallax layer (ParallaxLayer)** | Parses `<PLM:file>` from event notes, outputs to `MapXXXX_plm/` |
| **Encryption key** | `encryptionKey` field in `System.json`, 32-character hex string |

---

## 📝 License

[MIT](../LICENSE)
