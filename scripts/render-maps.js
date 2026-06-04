/**
 * render-maps.js — 离线地图渲染器
 *
 * 直接从地图 JSON + tileset PNG 渲染，不依赖游戏进程/CDP/PIXI。
 * 使用 sharp 进行像素级合成，支持所有 tile 类型（A1-A5, B-E）。
 *
 * 用法: node scripts/render-maps.js [地图ID ...]
 *   不带参数则渲染所有地图
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// 读取 JSON 文件，自动去除 UTF-8 BOM
function readJSON(fp) {
  return JSON.parse(fs.readFileSync(fp, 'utf8').replace(/^﻿/, ''));
}

// ─── 常量 ───────────────────────────────────────────────────────
const TILE = 48;
const HALF = 24;

const TILE_ID_B  = 0;
const TILE_ID_C  = 256;
const TILE_ID_D  = 512;
const TILE_ID_E  = 768;
const TILE_ID_A5 = 1536;
const TILE_ID_A1 = 2048;
const TILE_ID_A2 = 2816;
const TILE_ID_A3 = 4352;
const TILE_ID_A4 = 5888;
const TILE_ID_MAX = 8192;

// 游戏目录：优先用命令行参数 > 环境变量 > 默认值
const GAME_DIR = (() => {
  const args = process.argv.slice(2);
  // 第一个不以数字开头的参数视为游戏目录路径
  const dirArg = args.find(a => isNaN(parseInt(a)));
  if (dirArg) return dirArg;
  if (process.env.GAME_DIR) return process.env.GAME_DIR;
  return 'E:/hhh/ce/操心の魔導具-ver1.3.0_';
})();

// 项目目录：按项目名分开放，避免混杂
const PROJECT_DIR = (() => {
  const base = path.resolve(__dirname, '..', 'maps', 'projects');
  const name = path.basename(GAME_DIR).replace(/[\s_]+$/, '');
  return path.join(base, name);
})();
const TS_DIR        = PROJECT_DIR + '/tilesets/';
const OUT_DIR       = PROJECT_DIR + '/maps/';
const PARALLAX_DIR  = PROJECT_DIR + '/parallax/';

const PARALLAX_IMG_DIR = GAME_DIR + '/img/parallaxes/';

// 加密密钥（来自 System.json）
const ENC_KEY_BYTES = (() => {
  try {
    const sys = readJSON(GAME_DIR + '/data/System.json');
    const key = sys.encryptionKey || '';
    return key.length >= 32 ? key.match(/.{2}/g).map(h => parseInt(h, 16)) : [];
  } catch (e) {
    return [];
  }
})();

// ─── Tile 类型判定 ─────────────────────────────────────────────
const isA1   = id => id >= TILE_ID_A1  && id < TILE_ID_A2;
const isA2   = id => id >= TILE_ID_A2  && id < TILE_ID_A3;
const isA3   = id => id >= TILE_ID_A3  && id < TILE_ID_A4;
const isA4   = id => id >= TILE_ID_A4  && id < TILE_ID_MAX;
const isA5   = id => id >= TILE_ID_A5  && id < TILE_ID_A1;
const isAuto = id => id >= TILE_ID_A1;
const isVis  = id => id > 0 && id < TILE_ID_MAX;

const autotileKind  = id => Math.floor((id - TILE_ID_A1) / 48);
const autotileShape = id => (id - TILE_ID_A1) % 48;

// ─── Autotile 表格（来自 rmmz_core.js）────────────────────────
const FLOOR_AUTOTILE_TABLE = [
 [[2,4],[1,4],[2,3],[1,3]], [[2,0],[1,4],[2,3],[1,3]], [[2,4],[3,0],[2,3],[1,3]], [[2,0],[3,0],[2,3],[1,3]],
 [[2,4],[1,4],[2,3],[3,1]], [[2,0],[1,4],[2,3],[3,1]], [[2,4],[3,0],[2,3],[3,1]], [[2,0],[3,0],[2,3],[3,1]],
 [[2,4],[1,4],[2,1],[1,3]], [[2,0],[1,4],[2,1],[1,3]], [[2,4],[3,0],[2,1],[1,3]], [[2,0],[3,0],[2,1],[1,3]],
 [[2,4],[1,4],[2,1],[3,1]], [[2,0],[1,4],[2,1],[3,1]], [[2,4],[3,0],[2,1],[3,1]], [[2,0],[3,0],[2,1],[3,1]],
 [[0,4],[1,4],[0,3],[1,3]], [[0,4],[3,0],[0,3],[1,3]], [[0,4],[1,4],[0,3],[3,1]], [[0,4],[3,0],[0,3],[3,1]],
 [[2,2],[1,2],[2,3],[1,3]], [[2,2],[1,2],[2,3],[3,1]], [[2,2],[1,2],[2,1],[1,3]], [[2,2],[1,2],[2,1],[3,1]],
 [[2,4],[3,4],[2,3],[3,3]], [[2,4],[3,4],[2,1],[3,3]], [[2,0],[3,4],[2,3],[3,3]], [[2,0],[3,4],[2,1],[3,3]],
 [[2,4],[1,4],[2,5],[1,5]], [[2,0],[1,4],[2,5],[1,5]], [[2,4],[3,0],[2,5],[1,5]], [[2,0],[3,0],[2,5],[1,5]],
 [[0,4],[3,4],[0,3],[3,3]], [[2,2],[1,2],[2,5],[1,5]], [[0,2],[1,2],[0,3],[1,3]], [[0,2],[1,2],[0,3],[3,1]],
 [[2,2],[3,2],[2,3],[3,3]], [[2,2],[3,2],[2,1],[3,3]], [[2,4],[3,4],[2,5],[3,5]], [[2,0],[3,4],[2,5],[3,5]],
 [[0,4],[1,4],[0,5],[1,5]], [[0,4],[3,0],[0,5],[1,5]], [[0,2],[3,2],[0,3],[3,3]], [[0,2],[1,2],[0,5],[1,5]],
 [[0,4],[3,4],[0,5],[3,5]], [[2,2],[3,2],[2,5],[3,5]], [[0,2],[3,2],[0,5],[3,5]], [[0,0],[1,0],[0,1],[1,1]]
];

const WALL_AUTOTILE_TABLE = [
 [[2,2],[1,2],[2,1],[1,1]], [[0,2],[1,2],[0,1],[1,1]], [[2,0],[1,0],[2,1],[1,1]], [[0,0],[1,0],[0,1],[1,1]],
 [[2,2],[3,2],[2,1],[3,1]], [[0,2],[3,2],[0,1],[3,1]], [[2,0],[3,0],[2,1],[3,1]], [[0,0],[3,0],[0,1],[3,1]],
 [[2,2],[1,2],[2,3],[1,3]], [[0,2],[1,2],[0,3],[1,3]], [[2,0],[1,0],[2,3],[1,3]], [[0,0],[1,0],[0,3],[1,3]],
 [[2,2],[3,2],[2,3],[3,3]], [[0,2],[3,2],[0,3],[3,3]], [[2,0],[3,0],[2,3],[3,3]], [[0,0],[3,0],[0,3],[3,3]]
];

const WATERFALL_AUTOTILE_TABLE = [
 [[2,0],[1,0],[2,1],[1,1]], [[0,0],[1,0],[0,1],[1,1]],
 [[2,0],[3,0],[2,1],[3,1]], [[0,0],[3,0],[0,1],[3,1]]
];

// ─── tileset 图片缓存 ──────────────────────────────────────────
const tsCache = {};

async function loadTS(name) {
  if (tsCache[name]) return tsCache[name];
  const fp = TS_DIR + name + '.png';
  if (!fs.existsSync(fp)) return null;
  const meta = await sharp(fp).metadata();
  const buf = await sharp(fp).ensureAlpha().raw().toBuffer();
  tsCache[name] = { buf, width: meta.width, height: meta.height };
  return tsCache[name];
}

// ─── 视差图解密 ────────────────────────────────────────────────
function decryptParallaxImage(name) {
  const filePath = PARALLAX_IMG_DIR + name + '.png_';
  if (!fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);
  // 验证文件头: RPGMV + 12 字节头
  const header = Array.from(new Uint8Array(buf.slice(0, 16)));
  const expected = [0x52,0x50,0x47,0x4d,0x56,0,0,0,0,0x03,0x01,0,0,0,0,0];
  if (!header.every((b, i) => b === expected[i])) return null;
  // 解密: 对 body 前 16 字节做 XOR
  const body = Buffer.from(buf.slice(16));
  for (let i = 0; i < 16 && i < body.length; i++) {
    body[i] ^= ENC_KEY_BYTES[i];
  }
  return body;
}

// 检查地图是否完全无 tile（纯视差地图）
function hasNoTiles(map) {
  for (let z = 0; z < 4; z++) {
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if ((map.data[(z * map.height + y) * map.width + x] || 0) > 0) return false;
      }
    }
  }
  return true;
}

// ─── 像素级 alpha blend ────────────────────────────────────────
function blendRect(src, sw, sx, sy, dst, dw, dx, dy, w, h) {
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const si = ((sy + row) * sw + (sx + col)) * 4;
      const di = ((dy + row) * dw + (dx + col)) * 4;
      const sa = src[si + 3];
      if (sa === 0) continue;
      if (sa === 255 || dst[di + 3] === 0) {
        dst[di]   = src[si];
        dst[di+1] = src[si+1];
        dst[di+2] = src[si+2];
        dst[di+3] = 255;
      } else {
        const a = sa / 255, ia = 1 - a;
        const da = dst[di+3] / 255;
        dst[di]   = Math.round(src[si] * a + dst[di] * ia);
        dst[di+1] = Math.round(src[si+1] * a + dst[di+1] * ia);
        dst[di+2] = Math.round(src[si+2] * a + dst[di+2] * ia);
        dst[di+3] = Math.round(Math.min(255, dst[di+3] + sa * (1 - dst[di+3] / 255)));
      }
    }
  }
}

// ─── 合成 upper 层到 lower 层 ─────────────────────────────────
function compositeLayer(upper, lower, len) {
  for (let i = 0; i < len; i += 4) {
    const sa = upper[i+3];
    if (sa === 0) continue;
    if (sa === 255 || lower[i+3] === 0) {
      lower[i]   = upper[i];
      lower[i+1] = upper[i+1];
      lower[i+2] = upper[i+2];
      lower[i+3] = 255;
    } else {
      const a = sa / 255, ia = 1 - a;
      lower[i]   = Math.round(upper[i] * a + lower[i] * ia);
      lower[i+1] = Math.round(upper[i+1] * a + lower[i+1] * ia);
      lower[i+2] = Math.round(upper[i+2] * a + lower[i+2] * ia);
      lower[i+3] = Math.min(255, lower[i+3] + sa);
    }
  }
}

// ─── 阴影 (半透黑 overlay) ────────────────────────────────────
function blendShadow(dst, dw, dx, dy, w, h) {
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const di = ((dy + row) * dw + (dx + col)) * 4;
      const a = dst[di+3] / 255;
      const sa = 0.35 * a;
      dst[di]   = Math.round(dst[di] * (1 - sa));
      dst[di+1] = Math.round(dst[di+1] * (1 - sa));
      dst[di+2] = Math.round(dst[di+2] * (1 - sa));
    }
  }
}

// ─── 读取地图数据 ──────────────────────────────────────────────
function readMapData(data, w, h, z, x, y) {
  if (x < 0 || x >= w || y < 0 || y >= h) return 0;
  return data[(z * h + y) * w + x] || 0;
}

// ─── 渲染普通 tile (B-E, A5) ──────────────────────────────────
function renderNormal(layer, tileId, dx, dy, tsNames, tsImgs, flags) {
  let setNum;
  if (isA5(tileId)) {
    setNum = 4;
  } else {
    setNum = 5 + Math.floor(tileId / 256);
  }

  const name = tsNames[setNum];
  if (!name || !tsImgs[name]) return;

  const ts = tsImgs[name];
  let sx, sy;
  if (isA5(tileId)) {
    const a5 = tileId - TILE_ID_A5;
    sx = (a5 % 8) * TILE;
    sy = Math.floor(a5 / 8) * TILE;
  } else {
    sx = ((Math.floor(tileId / 128) % 2) * 8 + (tileId % 8)) * TILE;
    sy = (Math.floor((tileId % 256) / 8) % 16) * TILE;
  }

  layer.push({ ts, sx, sy, dx, dy, w: TILE, h: TILE });
}

// ─── 渲染 autotile (A1-A4) ────────────────────────────────────
function renderAutotile(layer, tileId, dx, dy, tsNames, tsImgs, flags, animFrame) {
  const kind = autotileKind(tileId);
  const shape = autotileShape(tileId);
  const tx = kind % 8;
  const ty = Math.floor(kind / 8);

  let setNum = 0, bx = 0, by = 0, isTable = false;
  let autotileTable = FLOOR_AUTOTILE_TABLE;

  if (isA1(tileId)) {
    const waterIdx = [0, 1, 2, 1][animFrame % 4];
    setNum = 0;
    if (kind === 0) {
      bx = waterIdx * 2; by = 0;
    } else if (kind === 1) {
      bx = waterIdx * 2; by = 3;
    } else if (kind === 2) {
      bx = 6; by = 0;
    } else if (kind === 3) {
      bx = 6; by = 3;
    } else {
      bx = Math.floor(tx / 4) * 8;
      by = ty * 6 + (Math.floor(tx / 2) % 2) * 3;
      if (kind % 2 === 0) {
        bx += waterIdx * 2;
      } else {
        bx += 6;
        autotileTable = WATERFALL_AUTOTILE_TABLE;
        by += animFrame % 3;
      }
    }
  } else if (isA2(tileId)) {
    setNum = 1;
    bx = tx * 2;
    by = (ty - 2) * 3;
    isTable = (flags[tileId] || 0) & 0x80;
  } else if (isA3(tileId)) {
    setNum = 2;
    bx = tx * 2;
    by = (ty - 6) * 2;
    autotileTable = WALL_AUTOTILE_TABLE;
  } else if (isA4(tileId)) {
    setNum = 3;
    bx = tx * 2;
    by = Math.floor((ty - 10) * 2.5 + (ty % 2 === 1 ? 0.5 : 0));
    if (ty % 2 === 1) autotileTable = WALL_AUTOTILE_TABLE;
  }

  const name = tsNames[setNum];
  if (!name || !tsImgs[name]) return;
  const ts = tsImgs[name];

  const table = autotileTable[shape] || autotileTable[0];
  for (let i = 0; i < 4; i++) {
    const qsx = table[i][0], qsy = table[i][1];
    const sx1 = (bx * 2 + qsx) * HALF;
    const sy1 = (by * 2 + qsy) * HALF;
    const dx1 = dx + (i % 2) * HALF;
    const dy1 = dy + Math.floor(i / 2) * HALF;
    if (isTable && (qsy === 1 || qsy === 5)) {
      const qsx2 = qsy === 1 ? (4 - qsx) % 4 : qsx;
      const qsy2 = 3;
      const sx2 = (bx * 2 + qsx2) * HALF;
      const sy2 = (by * 2 + qsy2) * HALF;
      layer.push({ ts, sx: sx2, sy: sy2, dx: dx1, dy: dy1, w: HALF, h: HALF });
      layer.push({ ts, sx: sx1, sy: sy1 + HALF / 2, dx: dx1, dy: dy1 + HALF / 2, w: HALF, h: HALF / 2 });
    } else {
      layer.push({ ts, sx: sx1, sy: sy1, dx: dx1, dy: dy1, w: HALF, h: HALF });
    }
  }
}

// ─── 添加单个 tile ────────────────────────────────────────────
function addTile(tileId, dx, dy, lower, upper, tsNames, tsImgs, flags, animFrame) {
  if (!isVis(tileId)) return;

  const isHigher = (flags[tileId] || 0) & 0x10;
  const targetLayer = isHigher ? upper : lower;

  if (isAuto(tileId)) {
    renderAutotile(targetLayer, tileId, dx, dy, tsNames, tsImgs, flags, animFrame);
  } else {
    renderNormal(targetLayer, tileId, dx, dy, tsNames, tsImgs, flags);
  }
}

// ─── 渲染单张地图 ──────────────────────────────────────────────
async function renderMap(mapId, tilesets, allMapIds, total) {
  const padded = String(mapId).padStart(3, '0');
  const mapPath = GAME_DIR + '/data/Map' + padded + '.json';
  if (!fs.existsSync(mapPath)) {
    console.log(`[${mapId}] ✗ 文件不存在`);
    return false;
  }

  const map = readJSON(mapPath);
  if (!map || !map.data) {
    console.log(`[${mapId}] ✗ 无数据`);
    return false;
  }

  // 视差图处理：若地图有 parallax 且无 tile，直接用视差图
  if (map.parallaxName && map.parallaxName.length > 0) {
    return await renderParallaxMap(map, mapId, tilesets);
  }

  const w = map.width, h = map.height;
  const ts = tilesets[map.tilesetId];
  if (!ts || !ts.tilesetNames) {
    console.log(`[${mapId}] ✗ 无 tileset (id=${map.tilesetId})`);
    return false;
  }

  const tsNames = ts.tilesetNames;
  const flags = ts.flags || {};

  // 确定需要加载的 tileset 图片
  const needed = new Set();
  for (const name of tsNames) {
    if (name && name.length > 0) needed.add(name);
  }
  const tsImgs = {};
  let loadErr = false;
  for (const name of needed) {
    const img = await loadTS(name);
    if (!img) { loadErr = true; break; }
    tsImgs[name] = img;
  }
  if (loadErr) {
    console.log(`[${mapId}] ✗ tileset 图片缺失`);
    return false;
  }

  const outW = w * TILE, outH = h * TILE;
  if (outW === 0 || outH === 0) {
    console.log(`[${mapId}] ✗ 尺寸无效`);
    return false;
  }

  // 预扫描：找出最常见的背景 tile
  // map.data 布局为层主序: [z0全部, z1全部, z2全部, z3全部, z4全部]
  const bgFreq = {};
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const t0 = readMapData(map.data, w, h, 0, px, py);
      const t1 = readMapData(map.data, w, h, 1, px, py);
      const t2 = readMapData(map.data, w, h, 2, px, py);
      const t3 = readMapData(map.data, w, h, 3, px, py);
      const t4 = readMapData(map.data, w, h, 4, px, py);
      const bk = t0 + ',' + t1 + ',' + t2 + ',' + t3 + ',' + t4;
      bgFreq[bk] = (bgFreq[bk] || 0) + 1;
    }
  }
  const bgKey = Object.keys(bgFreq).reduce((a, b) => bgFreq[a] > bgFreq[b] ? a : b);
  const bgVals = bgKey.split(',').map(Number);

  // 两个缓冲区: lower 层先绘制, upper 层后合成上去
  const lowerBuf = Buffer.alloc(outW * outH * 4, 0);
  const upperBuf = Buffer.alloc(outW * outH * 4, 0);

  // 背景/内容分离的指令队列
  const bgLower = [], bgUpper = [];
  const cLower = [], cUpper = [];
  const tilemap = [];    // 每个格子 5 个数字: z0,z1,z2,z3,shadowBits
  const shadowPos = [];  // { x, y, bits, isBg }

  // 遍历所有 tile 位置
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x * TILE, dy = y * TILE;

      const tileId0 = readMapData(map.data, w, h, 0, x, y);
      const tileId1 = readMapData(map.data, w, h, 1, x, y);
      const tileId2 = readMapData(map.data, w, h, 2, x, y);
      const tileId3 = readMapData(map.data, w, h, 3, x, y);
      const shadowBits = readMapData(map.data, w, h, 4, x, y);
      const isBg = tileId0 === bgVals[0] && tileId1 === bgVals[1] && tileId2 === bgVals[2] && tileId3 === bgVals[3] && shadowBits === bgVals[4];

      const l = isBg ? bgLower : cLower;
      const u = isBg ? bgUpper : cUpper;
      addTile(tileId0, dx, dy, l, u, tsNames, tsImgs, flags, 0);
      addTile(tileId1, dx, dy, l, u, tsNames, tsImgs, flags, 0);
      addTile(tileId2, dx, dy, l, u, tsNames, tsImgs, flags, 0);
      addTile(tileId3, dx, dy, l, u, tsNames, tsImgs, flags, 0);

      tilemap.push(tileId0, tileId1, tileId2, tileId3, shadowBits);
      if (shadowBits & 0x0f) shadowPos.push({ x, y, bits: shadowBits, isBg });
    }
  }

  // 输出前景层（不含背景 tile）
  if (cLower.length > 0 || cUpper.length > 0) {
    const cBuf = Buffer.alloc(outW * outH * 4, 0);
    const cUpperBuf = Buffer.alloc(outW * outH * 4, 0);
    for (const c of cLower) blendRect(c.ts.buf, c.ts.width, c.sx, c.sy, cBuf, outW, c.dx, c.dy, c.w, c.h);
    for (const c of cUpper) blendRect(c.ts.buf, c.ts.width, c.sx, c.sy, cUpperBuf, outW, c.dx, c.dy, c.w, c.h);
    compositeLayer(cUpperBuf, cBuf, outW * outH * 4);
    // 前景阴影
    for (const sp of shadowPos) {
      if (!sp.isBg) {
        const sdx = sp.x * TILE, sdy = sp.y * TILE;
        for (let i = 0; i < 4; i++) { if (sp.bits & (1 << i)) blendShadow(cBuf, outW, sdx + (i % 2) * HALF, sdy + Math.floor(i / 2) * HALF, HALF, HALF); }
      }
    }
    const outNameC = 'Map' + String(mapId).padStart(4, '0') + '.png';
    const outPathC = OUT_DIR + '/' + outNameC;
    await sharp(cBuf, { raw: { width: outW, height: outH, channels: 4 } }).png().toFile(outPathC.replace('.png', '_content.png'));
  }

  // 执行所有 lower 绘制（合拼用）
  for (const c of bgLower) blendRect(c.ts.buf, c.ts.width, c.sx, c.sy, lowerBuf, outW, c.dx, c.dy, c.w, c.h);
  for (const c of cLower) blendRect(c.ts.buf, c.ts.width, c.sx, c.sy, lowerBuf, outW, c.dx, c.dy, c.w, c.h);
  // 执行所有 upper 绘制（合拼用）
  for (const c of bgUpper) blendRect(c.ts.buf, c.ts.width, c.sx, c.sy, upperBuf, outW, c.dx, c.dy, c.w, c.h);
  for (const c of cUpper) blendRect(c.ts.buf, c.ts.width, c.sx, c.sy, upperBuf, outW, c.dx, c.dy, c.w, c.h);

  // 阴影: 在合拼 lowerBuf 上画
  for (const sp of shadowPos) {
    const dx = sp.x * TILE, dy = sp.y * TILE;
    for (let i = 0; i < 4; i++) {
      if (sp.bits & (1 << i)) blendShadow(lowerBuf, outW, dx + (i % 2) * HALF, dy + Math.floor(i / 2) * HALF, HALF, HALF);
    }
  }

  // 合成 upper 到 lower（合拼）
  compositeLayer(upperBuf, lowerBuf, outW * outH * 4);

  // 输出合拼 PNG
  const outName = 'Map' + String(mapId).padStart(4, '0') + '.png';
  const outPath = OUT_DIR + '/' + outName;
  await sharp(lowerBuf, { raw: { width: outW, height: outH, channels: 4 } }).png().toFile(outPath);

  // 输出 tilemap sidecar
  const tilemapPath = outPath.replace('.png', '.tilemap.json');
  fs.writeFileSync(tilemapPath, JSON.stringify({ w, h, data: tilemap }), 'utf8');

  const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(0);
  process.stdout.write(`  ${outName}  ${w}×${h} tiles  ${outW}×${outH}px  ${sizeKB}KB\n`);
  return true;
}

// ─── 渲染视差地图 ──────────────────────────────────────────────
async function renderParallaxMap(map, mapId, tilesets) {
  const pName = map.parallaxName;
  const outName = 'Map' + String(mapId).padStart(4, '0') + '.png';

  // 解密视差图
  const data = decryptParallaxImage(pName);
  if (!data) {
    console.log(`✗ parallax 解密失败: ${pName}`);
    return false;
  }

  // 输出到 docs/parallax/（供 viewer 加载）
  fs.mkdirSync(PARALLAX_DIR, { recursive: true });
  const safeName = pName.replace(/[\/:*?"<>|]/g, '_');
  const paraOut = PARALLAX_DIR + '/parallax_' + safeName + '.png';
  fs.writeFileSync(paraOut, data);

  // 检查是否有 tile（有的话需要复合 tiles + parallax）
  const hasTiles = !hasNoTiles(map);
  if (hasTiles) {
    const ts = tilesets[map.tilesetId];
    if (!ts || !ts.tilesetNames) {
      console.log("  tileset data missing (id=" + map.tilesetId + ")");
      return false;
    }
    // 有 tile 的地图 — 先渲染 parallax 背景再叠加 tiles
    const meta = await sharp(data).metadata();
    const outW = map.width * TILE, outH = map.height * TILE;

    // 创建背景缓冲区：用 parallax 图填满
    const bgBuf = Buffer.alloc(outW * outH * 4, 0);

    // 将 parallax 图缩放到地图尺寸
    const resized = await sharp(data)
      .resize(outW, outH, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer();
    resized.copy(bgBuf);

    // 在上面渲染 tiles（用原有逻辑）
    const w = map.width, h = map.height;
    const tsNames = ts.tilesetNames;
    const flags = ts.flags || {};

    const needed = new Set();
    for (const n of tsNames) { if (n && n.length > 0) needed.add(n); }
    const tsImgs = {};
    for (const n of needed) {
      const img = await loadTS(n);
      if (!img) { console.log('  tileset 缺失: ' + n); continue; }
      tsImgs[n] = img;
    }

    const upperBuf = Buffer.alloc(outW * outH * 4, 0);
    const lowerCmds = [], upperCmds = [];
    const tilemap = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x * TILE, dy = y * TILE;
        for (let z = 0; z < 4; z++) {
          const tid = readMapData(map.data, w, h, z, x, y);
          addTile(tid, dx, dy, lowerCmds, upperCmds, tsNames, tsImgs, flags, 0);
        }
        // 也收集阴影层
        const shadowBits = readMapData(map.data, w, h, 4, x, y);
        const t0 = readMapData(map.data, w, h, 0, x, y);
        const t1 = readMapData(map.data, w, h, 1, x, y);
        const t2 = readMapData(map.data, w, h, 2, x, y);
        const t3 = readMapData(map.data, w, h, 3, x, y);
        tilemap.push(t0, t1, t2, t3, shadowBits);
      }
    }

    for (const c of lowerCmds) blendRect(c.ts.buf, c.ts.width, c.sx, c.sy, bgBuf, outW, c.dx, c.dy, c.w, c.h);
    for (const c of upperCmds) blendRect(c.ts.buf, c.ts.width, c.sx, c.sy, upperBuf, outW, c.dx, c.dy, c.w, c.h);
    compositeLayer(upperBuf, bgBuf, outW * outH * 4);

    const outPath = OUT_DIR + '/' + outName;
    await sharp(bgBuf, { raw: { width: outW, height: outH, channels: 4 } }).png().toFile(outPath);

    // 输出 tilemap sidecar
    const tilemapPath = outPath.replace('.png', '.tilemap.json');
    fs.writeFileSync(tilemapPath, JSON.stringify({ w, h, data: tilemap }), 'utf8');

    const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(0);
    process.stdout.write(`  ${outName}  parallax+${tilesets[map.tilesetId].name}  ${outW}×${outH}px  ${sizeKB}KB\n`);
  } else {
    // 纯视差图（无 tile）— 直接输出原图
    const outPath = OUT_DIR + '/' + outName;
    fs.writeFileSync(outPath, data);
    const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(0);
    const meta = await sharp(data).metadata();
    process.stdout.write(`  ${outName}  parallax  ${meta.width}×${meta.height}px  ${sizeKB}KB\n`);
  }

  return true;
}

// ─── 主流程 ────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const specificIds = args.length > 0 ? args.map(Number).filter(n => !isNaN(n)) : null;

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 加载 tilesets 索引
  const tilesetsPath = GAME_DIR + '/data/Tilesets.json';
  if (!fs.existsSync(tilesetsPath)) {
    console.error('✗ 找不到 Tilesets.json');
    process.exit(1);
  }
  const allTilesets = readJSON(tilesetsPath);
  // 转换为以 id 为 key 的 map
  const tilesets = {};
  for (const ts of allTilesets) {
    if (ts && ts.id != null) tilesets[ts.id] = ts;
  }

  // 获取所有地图 ID
  const mapInfosPath = GAME_DIR + '/data/MapInfos.json';
  if (!fs.existsSync(mapInfosPath)) {
    console.error('✗ 找不到 MapInfos.json');
    process.exit(1);
  }
  const mapInfos = readJSON(mapInfosPath);
  const allIds = [];
  for (let i = 1; i < mapInfos.length; i++) {
    if (mapInfos[i]) allIds.push(i);
  }

  const ids = (specificIds && specificIds.length > 0) ? specificIds : allIds;
  console.log(`共 ${ids.length} 张地图\n`);

  let ok = 0, fail = 0;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    process.stdout.write(`[${i+1}/${ids.length}] Map${id} `);
    try {
      const r = await renderMap(id, tilesets, allIds, ids.length);
      if (r) ok++; else fail++;
    } catch (e) {
      console.log(`✗ 错误: ${e.message}`);
      fail++;
    }
  }

  console.log(`\n完成! ${ok} 成功, ${fail} 失败`);
}

main().catch(e => { console.error(e); process.exit(1); });
