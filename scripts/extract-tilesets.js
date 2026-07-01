/**
 * extract-tilesets.js — 离线导出 tileset 图片
 *
 * 直接从游戏目录的 img/tilesets/ 读取（加密或未加密）tileset PNG，
 * 输出到指定项目的 tileset 目录。
 *
 * 用法: node scripts/extract-tilesets.js <游戏目录> [输出目录]
 */

const fs = require('fs');
const path = require('path');

// ─── 解密 ──────────────────────────────────────────────────────
function loadEncryptionKey(gameDir) {
  try {
    const sys = JSON.parse(
      fs.readFileSync(gameDir + '/data/System.json', 'utf8').replace(/^﻿/, '')
    );
    const key = sys.encryptionKey || '';
    return key.length >= 32 ? key.match(/.{2}/g).map(h => parseInt(h, 16)) : [];
  } catch (e) {
    return [];
  }
}

function decryptRPGMVFile(filePath, keyBytes) {
  if (!fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);

  // RPGMV 加密格式：16 字节头 + XOR 加密数据
  const header = Array.from(new Uint8Array(buf.slice(0, 16)));
  const expected = [0x52, 0x50, 0x47, 0x4d, 0x56, 0, 0, 0, 0, 0x03, 0x01, 0, 0, 0, 0, 0];
  const isRPGMV = header.every((b, i) => b === expected[i]);

  if (isRPGMV) {
    if (!keyBytes || keyBytes.length === 0) return null;
    const body = Buffer.from(buf.slice(16));
    for (let i = 0; i < 16 && i < body.length; i++) {
      body[i] ^= keyBytes[i % keyBytes.length];
    }
        const pngSig = [0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A];
    if (!pngSig.every((b,i) => body[i] === b)) return null;
    return body;
  }

  // 可能是未加密的 PNG
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return buf;
  }

  return null;
}

// ─── 主流程 ────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const gameDir = args[0] || (process.env.GAME_DIR || '').replace(/\\/g, '/');
  if (!gameDir || !fs.existsSync(gameDir + '/data/System.json')) {
    console.error('用法: node scripts/extract-tilesets.js <游戏目录> [输出目录]');
    process.exit(1);
  }

  // 确定项目名（从游戏目录名，www 时回退到上级目录）
  const projectName = (function() {
    const leaf = path.basename(gameDir);
    if (leaf.toLowerCase() === 'www') return path.basename(path.dirname(gameDir)).replace(/[\s_]+$/, '');
    return leaf.replace(/[\s_]+$/, '');
  })();
  const outDir = args[1] || path.resolve(__dirname, '..', 'maps', 'projects', projectName, 'tilesets');

  // 加载 tilesets 索引
  const allTilesets = JSON.parse(
    fs.readFileSync(gameDir + '/data/Tilesets.json', 'utf8').replace(/^﻿/, '')
  );

  // 收集所有 tilesetNames
  const neededNames = new Set();
  for (const ts of allTilesets) {
    if (!ts || !ts.tilesetNames) continue;
    for (const name of ts.tilesetNames) {
      if (name && name.length > 0) neededNames.add(name);
    }
  }

  // 加密密钥
  const keyBytes = loadEncryptionKey(gameDir);
  const tilesetDir = gameDir + '/img/tilesets/';

  fs.mkdirSync(outDir, { recursive: true });

  // 预扫描 tileset 目录，建立精确匹配失败时的模糊查找表
  var fuzzyMap = null;
  function buildFuzzyMap() {
    if (fuzzyMap) return fuzzyMap;
    fuzzyMap = {};
    try {
      var files = fs.readdirSync(tilesetDir);
      files = files.filter(function(f) { return f !== '.' && f !== '..'; });
      for (var fi = 0; fi < files.length; fi++) {
        var f = files[fi];
        var base = f.replace(/\.(png_|rpgmvp|png)$/i, '').toLowerCase();
        fuzzyMap[base] = tilesetDir + f;
      }
    } catch(e) {}
    return fuzzyMap;
  }

  function fuzzyMatch(name) {
    var map = buildFuzzyMap();
    var nl = name.toLowerCase();
    // 精确匹配（忽略大小写）
    if (map[nl]) return map[nl];
    // 请求名是某个文件名的子串
    var keys = Object.keys(map);
    for (var ki = 0; ki < keys.length; ki++) {
      if (keys[ki].indexOf(nl) !== -1) return map[keys[ki]];
    }
    // 文件名是请求名的子串
    for (var kj = 0; kj < keys.length; kj++) {
      if (nl.indexOf(keys[kj]) !== -1) return map[keys[kj]];
    }
    return null;
  }

  let ok = 0, fail = 0;
  const names = Array.from(neededNames).sort();

  console.log(`项目: ${projectName}`);
  console.log(`游戏: ${gameDir}`);
  console.log(`输出: ${outDir}`);
  console.log(`需要导出 ${names.length} 张 tileset 图片\n`);

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    process.stdout.write(`[${i + 1}/${names.length}] ${name} `);

    // 尝试加密文件 (.png_ / .rpgmvp) 和未加密文件 (.png)
    const encPath = tilesetDir + name + '.png_';
    const rpgmvpPath = tilesetDir + name + '.rpgmvp';
    const plainPath = tilesetDir + name + '.png';

    let data = decryptRPGMVFile(encPath, keyBytes);
    if (!data) {
      data = decryptRPGMVFile(rpgmvpPath, keyBytes);
    }
    if (!data) {
      data = decryptRPGMVFile(plainPath, keyBytes);
    }
    if (!data) {
      // 可能是 Overlay 或其他格式
      data = decryptRPGMVFile(tilesetDir + name, keyBytes);
    }
    if (!data) {
      // 模糊匹配：文件名与 Tilesets.json 不完全一致
      var fuzzyPath = fuzzyMatch(name);
      if (fuzzyPath) {
        process.stdout.write('→ 模糊匹配 ');
        data = decryptRPGMVFile(fuzzyPath, keyBytes);
      }
    }

    if (data) {
      const outPath = path.resolve(outDir, name + '.png');
      // 防止路径穿越：确保输出在 outDir 内
      const resolvedOut = path.resolve(outDir) + path.sep;
      if (!outPath.startsWith(resolvedOut)) {
        process.stdout.write('✗ 路径越界\n');
        fail++;
        continue;
      }
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, data);
      const size = (fs.statSync(outPath).size / 1024).toFixed(0);
      process.stdout.write(`${size}KB ✓\n`);
      ok++;
    } else {
      process.stdout.write('✗ 未找到\n');
      fail++;
    }
  }

  console.log(`\n完成! ${ok} 成功, ${fail} 失败`);
  if (fail > 0) process.exit(1);

  // 注册到 projects.json
  registerProject(projectName, gameDir);
}

function registerProject(projectName, gameDir) {
  const pjPath = path.resolve(__dirname, '..', 'maps', 'projects', 'projects.json');
  var idx = {};
  try { idx = JSON.parse(fs.readFileSync(pjPath, 'utf8')); } catch(e) {}
  var key = Object.keys(idx).find(k => idx[k].name === projectName);
  if (key) {
    if (!idx[key].gameDir) { idx[key].gameDir = gameDir; fs.writeFileSync(pjPath, JSON.stringify(idx, null, 2), 'utf8'); }
  } else {
    var maxId = Object.keys(idx).reduce(function(m, k) { var n = parseInt(k, 10); return n > m ? n : m; }, 0);
    idx[String(maxId + 1)] = { name: projectName, gameDir: gameDir };
    fs.writeFileSync(pjPath, JSON.stringify(idx, null, 2), 'utf8');
  }
}

main();
