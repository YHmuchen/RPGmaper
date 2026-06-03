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

  // 确定项目名（从游戏目录名）
  const projectName = path.basename(gameDir).replace(/[\s_]+$/, '');
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

  let ok = 0, fail = 0;
  const names = Array.from(neededNames).sort();

  console.log(`项目: ${projectName}`);
  console.log(`游戏: ${gameDir}`);
  console.log(`输出: ${outDir}`);
  console.log(`需要导出 ${names.length} 张 tileset 图片\n`);

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    process.stdout.write(`[${i + 1}/${names.length}] ${name} `);

    // 尝试加密文件 (.png_) 和未加密文件 (.png)
    const encPath = tilesetDir + name + '.png_';
    const plainPath = tilesetDir + name + '.png';

    let data = decryptRPGMVFile(encPath, keyBytes);
    if (!data) {
      data = decryptRPGMVFile(plainPath, keyBytes);
    }
    if (!data) {
      // 可能是 Overlay 或其他格式
      data = decryptRPGMVFile(tilesetDir + name, keyBytes);
    }

    if (data) {
      const outPath = path.join(outDir, name + '.png');
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
}

main();
