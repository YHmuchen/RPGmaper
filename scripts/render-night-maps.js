/**
 * render-night-maps.js — 自动检测并渲染夜间版地图
 *
 * 扫描游戏目录中所有地图，找出包含夜间元素（蜡烛、窗户、辉光）
 * 的地图，只对这些地图渲染夜间版本（MapXXXX_night.png）。
 *
 * 用法: node scripts/render-night-maps.js <游戏目录>
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// 夜间元素检测关键词
const NIGHT_TAGS = [
  'INSIDE_WINDOW', 'INSIDE_WINDOWLIGHT', 'TE上書き',
  'Candle', 'RitualCandle', 'WallCandle', 'CandleStand',
  'CandleLittle', 'CandleOver', 'DeskCandle',
];

function hasNightElements(mapData) {
  if (!mapData || !mapData.events) return false;
  for (const eid in mapData.events) {
    const ev = mapData.events[eid];
    if (!ev || !ev.note) continue;
    for (const tag of NIGHT_TAGS) {
      if (ev.note.indexOf(tag) >= 0) return true;
    }
  }
  return false;
}

function main() {
  const args = process.argv.slice(2);
  const gameDir = args[0] || process.env.GAME_DIR;
  if (!gameDir || !fs.existsSync(path.join(gameDir, 'data', 'System.json'))) {
    console.error('用法: node scripts/render-night-maps.js <游戏目录>');
    process.exit(1);
  }

  // 扫描所有地图 JSON
  const dataDir = path.join(gameDir, 'data');
  const mapFiles = fs.readdirSync(dataDir).filter(f => /^Map\d+\.json$/.test(f));
  const nightMapIds = [];

  for (const f of mapFiles) {
    try {
      const mapId = parseInt(f.match(/Map(\d+)\./)[1], 10);
      const raw = fs.readFileSync(path.join(dataDir, f), 'utf8').replace(/^﻿/, '');
      const mapData = JSON.parse(raw);
      if (hasNightElements(mapData)) {
        nightMapIds.push(mapId);
      }
    } catch (e) {
      // 跳过无法解析的地图
    }
  }

  if (nightMapIds.length === 0) {
    console.log('没有地图需要夜间渲染');
    return;
  }

  console.log(`检测到 ${nightMapIds.length} 张地图含夜间元素，正在渲染夜间版...`);

  // 分批渲染（避免单次参数过长）
  const BATCH = 20;
  for (let i = 0; i < nightMapIds.length; i += BATCH) {
    const batch = nightMapIds.slice(i, i + BATCH);
    const result = spawnSync('node', [
      path.join(__dirname, 'render-maps.js'),
      gameDir,
      ...batch.map(String),
    ], {
      env: Object.assign({}, process.env, { TIME_VAR_31: '3' }),
      stdio: 'inherit',
    });
    if (result.status !== 0) {
      console.error(`❌ 夜间渲染失败 (地图 ${batch[0]}-${batch[batch.length-1]})`);
      process.exitCode = 1;
    }
  }

  if (process.exitCode) {
    console.log(`⚠️ 夜间渲染部分失败: ${nightMapIds.length} 张地图`);
  } else {
    console.log(`✅ 夜间渲染完成: ${nightMapIds.length} 张地图`);
  }
}

main();
