/**
 * test-pipeline.js — 全流程自动化测试
 *
 * 对指定游戏目录执行完整管线（tileset 导出 → 地图渲染），
 * 验证输出正确性，生成 JSON 报告。
 *
 * 用法: node scripts/test-pipeline.js <游戏目录>
 *       node scripts/test-pipeline.js <游戏目录> --verbose
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const sharp = require('sharp');

const PROJECT_ROOT = path.resolve(__dirname, '..');

function readJSON(fp) {
  return JSON.parse(fs.readFileSync(fp, 'utf8').replace(/^﻿/, ''));
}

function runScript(scriptPath, args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 600000, // 10 min
  });
  return {
    code: result.status,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function getProjectName(gameDir) {
  const leaf = path.basename(gameDir);
  if (leaf.toLowerCase() === 'www') return path.basename(path.dirname(gameDir)).replace(/[\s_]+$/, '');
  return leaf.replace(/[\s_]+$/, '');
}

function getProjectDir(gameDir) {
  const base = path.join(PROJECT_ROOT, 'maps', 'projects');
  const name = getProjectName(gameDir);
  return { base, name, dir: path.join(base, name) };
}

async function main() {
  const args = process.argv.slice(2);
  const gameDir = args[0] || process.env.GAME_DIR;
  const verbose = args.includes('--verbose');

  if (!gameDir || !fs.existsSync(path.join(gameDir, 'data', 'System.json'))) {
    console.error('用法: node scripts/test-pipeline.js <游戏目录> [--verbose]');
    process.exit(1);
  }

  const { name, dir: projectDir } = getProjectDir(gameDir);
  const startTime = Date.now();
  const report = {
    game: name,
    gameDir,
    timestamp: new Date().toISOString(),
    tilesets: { pass: false, expected: 0, exported: 0, errors: [] },
    maps: { pass: false, expected: 0, rendered: 0, errors: [], spotCheck: { sampled: 0, passed: 0, failures: [] } },
    duration: 0,
    pass: false,
  };

  // 读取地图信息
  let mapInfos, tilesetNames;
  try {
    mapInfos = readJSON(path.join(gameDir, 'data', 'MapInfos.json'));
    const tilesets = readJSON(path.join(gameDir, 'data', 'Tilesets.json'));
    const names = new Set();
    for (const ts of tilesets) {
      if (ts && ts.tilesetNames) {
        for (const n of ts.tilesetNames) {
          if (n && n.length > 0) names.add(n);
        }
      }
    }
    tilesetNames = Array.from(names);

    const ids = [];
    for (let i = 1; i < mapInfos.length; i++) {
      if (mapInfos[i]) ids.push(i);
    }
    report.maps.expected = ids.length;
    report.tilesets.expected = tilesetNames.length;

    if (verbose) {
      console.log(`游戏: ${name}`);
      console.log(`地图: ${report.maps.expected}`);
      console.log(`Tilesets: ${report.tilesets.expected}`);
      console.log('');
    }
  } catch (e) {
    console.error('读取游戏数据失败:', e.message);
    process.exit(1);
  }

  // ─── Step 1: tileset 导出 ────────────────────────────────────
  if (verbose) console.log('▶ 导出 tileset...');
  const tsResult = runScript(
    path.join(PROJECT_ROOT, 'scripts', 'extract-tilesets.js'),
    [gameDir]
  );

  if (tsResult.code !== 0) {
    report.tilesets.errors.push(`退出码 ${tsResult.code}: ${tsResult.stderr || tsResult.stdout}`);
  }

  // 检查实际导出的文件数
  function countPngRecursive(dir) {
    let count = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) count += countPngRecursive(path.join(dir, entry.name));
      else if (entry.name.endsWith('.png')) count++;
    }
    return count;
  }
  const tsDir = path.join(projectDir, 'tilesets');
  if (fs.existsSync(tsDir)) {
    report.tilesets.exported = countPngRecursive(tsDir);
    report.tilesets.pass = report.tilesets.exported > 0 && tsResult.code === 0;

    if (verbose) {
      console.log(`  导出: ${report.tilesets.exported}/${report.tilesets.expected}`);
    }
  } else {
    report.tilesets.pass = false;
    report.tilesets.errors.push('tileset 输出目录不存在');
  }

  // ─── Step 2: 渲染地图 ───────────────────────────────────────
  if (verbose) console.log('▶ 渲染地图...');
  const mapResult = runScript(
    path.join(PROJECT_ROOT, 'scripts', 'render-maps.js'),
    [gameDir]
  );

  if (mapResult.code !== 0) {
    report.maps.errors.push(`退出码 ${mapResult.code}`);
  }

  // 解析输出获取成功/失败数
  const doneMatch = mapResult.stdout.match(/完成!\s*(\d+)\s*成功,\s*(\d+)\s*失败/);
  if (doneMatch) {
    report.maps.rendered = parseInt(doneMatch[1]);
    const failed = parseInt(doneMatch[2]);
    report.maps.pass = failed === 0 && report.maps.rendered > 0;
    if (failed > 0) report.maps.errors.push(`${failed} 张地图渲染失败`);
  } else {
    report.maps.pass = false;
    report.maps.errors.push('无法解析渲染结果');
  }

  if (verbose) {
    console.log(`  渲染: ${report.maps.rendered}/${report.maps.expected}`);
  }

  // ─── Step 3: 抽样检查 PNG 尺寸 ──────────────────────────────
  if (report.maps.pass && report.maps.expected > 0) {
    if (verbose) console.log('▶ 抽样检查...');
    const mapIds = [];
    for (let i = 1; i < mapInfos.length; i++) {
      if (mapInfos[i]) mapIds.push(i);
    }

    // 随机抽最多 5 张
    const sampleSize = Math.min(5, mapIds.length);
      const shuffled = [...mapIds];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor((i * 7 + 13) % (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
    const sampled = [];
    const seed = mapIds.length;
    for (let i = 0; i < sampleSize; i++) {
      const idx = (seed * (i + 1) * 7) % mapIds.length;
      sampled.push(mapIds[idx]);
    }

    for (const id of sampled) {
      const padded = String(id).padStart(4, '0');
      const pngPath = path.join(projectDir, 'maps', `Map${padded}.png`);

      if (!fs.existsSync(pngPath)) {
        report.maps.spotCheck.failures.push(`Map${id}: 文件不存在`);
        continue;
      }

      try {
        const mapData = readJSON(
          path.join(gameDir, 'data', `Map${String(id).padStart(3, '0')}.json`)
        );
        const expectedW = mapData.width * 48;
        const expectedH = mapData.height * 48;
        const meta = await sharp(pngPath).metadata();

        if (meta.width !== expectedW || meta.height !== expectedH) {
          report.maps.spotCheck.failures.push(
            `Map${id}: 期望 ${expectedW}×${expectedH}, 实际 ${meta.width}×${meta.height}`
          );
        } else {
          report.maps.spotCheck.passed++;
        }
      } catch (e) {
        report.maps.spotCheck.failures.push(`Map${id}: ${e.message}`);
      }
    }
    report.maps.spotCheck.sampled = sampled.length;
  }

  // ─── 汇总 ────────────────────────────────────────────────────
  report.duration = Date.now() - startTime;
  report.pass = report.tilesets.pass && report.maps.pass
    && report.maps.spotCheck.failures.length === 0;

  // 输出 JSON 报告
  const reportStr = JSON.stringify(report, null, 2);
  const reportPath = path.join(projectDir, 'test-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, reportStr);

  if (verbose) {
    console.log('');
    console.log(reportStr);
  }

  // 控制台简短摘要
  const status = report.pass ? '✅ 通过' : '❌ 失败';
  console.log(`\n${status}  |  ${name}  |  tileset ${report.tilesets.exported}/${report.tilesets.expected}  |  地图 ${report.maps.rendered}/${report.maps.expected}  |  ${(report.duration / 1000).toFixed(1)}s`);
  console.log(`报告: ${reportPath}`);

  // 注册到 projects.json
  registerProject(name, gameDir);

  process.exit(report.pass ? 0 : 1);
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

main().catch(e => {
  console.error('测试异常:', e.message);
  process.exit(1);
});
