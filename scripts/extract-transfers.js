/**
 * extract-transfers.js — 提取所有地图的传送点
 *
 * 从地图 JSON 中扫描 Transfer Player (code=201) 指令，
 * 同时跟踪 Common Event (code=117) 调用链，提取全部可能的传送路径。
 *
 * 用法: node scripts/extract-transfers.js [游戏目录]
 */

const fs = require('fs');
const path = require('path');

const GAME_DIR = (() => {
  const args = process.argv.slice(2);
  const dirArg = args.find(a => isNaN(parseInt(a)));
  if (dirArg) return dirArg;
  if (process.env.GAME_DIR) return process.env.GAME_DIR;
  return 'E:/hhh/ce/操心の魔導具-ver1.3.0_';
})();

const OUT_FILE = path.resolve(__dirname, '..', 'docs', 'transfers_data.js');

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// 加载全部公共事件
let commonEvents = null;
function getCommonEvents() {
  if (!commonEvents) {
    commonEvents = readJSON(GAME_DIR + '/data/CommonEvents.json');
  }
  return commonEvents;
}

// 从指令列表中提取所有 Transfer Player (code=201) 直接指定
function extractTransfersFromList(list) {
  const result = [];
  for (const cmd of list) {
    if (!cmd) continue;
    if (cmd.code === 201 && cmd.parameters[0] === 0) {
      result.push({
        tid: cmd.parameters[1],
        tx: cmd.parameters[2],
        ty: cmd.parameters[3],
      });
    }
  }
  return result;
}

// 递归解析公共事件调用链，返回所有可能的传送目标
// visitedIds: 已访问的 CE ID 集合（防循环）
function resolveCEChain(ceId, visitedIds = new Set(), depth = 0) {
  if (depth > 50 || visitedIds.has(ceId)) return [];  // 防止无限递归
  visitedIds.add(ceId);

  const ces = getCommonEvents();
  const ce = ces[ceId];
  if (!ce || !ce.list) return [];

  const results = [];

  for (const cmd of ce.list) {
    if (!cmd) continue;

    // 直接传送指令
    if (cmd.code === 201 && cmd.parameters[0] === 0) {
      results.push({
        tid: cmd.parameters[1],
        tx: cmd.parameters[2],
        ty: cmd.parameters[3],
      });
    }

    // 调用其他公共事件 → 递归解析
    if (cmd.code === 117) {
      const nested = resolveCEChain(cmd.parameters[0], new Set(visitedIds), depth + 1);
      results.push(...nested);
    }
  }

  return results;
}

function main() {
  // 加载地图信息
  const infos = readJSON(GAME_DIR + '/data/MapInfos.json');
  const mapIds = [];
  for (let i = 1; i < infos.length; i++) {
    if (infos[i]) mapIds.push(i);
  }

  // 预加载公共事件
  const commonEventsCount = getCommonEvents().length;
  console.log('公共事件数:', commonEventsCount);

  const allTransfers = {};
  let totalDirect = 0;
  let totalCE = 0;
  let mapsWithTransfers = 0;

  for (const mapId of mapIds) {
    const map = readJSON(GAME_DIR + '/data/Map' + String(mapId).padStart(3, '0') + '.json');
    if (!map || !map.events) continue;

    const mapTransfers = [];

    for (const eid in map.events) {
      const ev = map.events[eid];
      if (!ev || !ev.pages) continue;

      for (let pi = 0; pi < ev.pages.length; pi++) {
        const page = ev.pages[pi];
        if (!page || !page.list) continue;

        // 提取页面条件
        const condStr = (() => {
          if (!page.conditions) return '';
          const c = page.conditions;
          const parts = [];
          if (c.switch1Valid) parts.push('switch:' + c.switch1Id);
          if (c.switch2Valid) parts.push('switch:' + c.switch2Id);
          if (c.variableValid) parts.push('var:' + c.variableId + '=' + c.variableValue);
          if (c.selfSwitchValid) parts.push('self:' + c.selfSwitchCh);
          return parts.join(',');
        })();

        // 扫描当前页指令
        for (let ci = 0; ci < page.list.length; ci++) {
          const cmd = page.list[ci];
          if (!cmd) continue;

          // 直接传送指令
          if (cmd.code === 201 && cmd.parameters[0] === 0) {
            mapTransfers.push({
              fx: ev.x, fy: ev.y,
              tid: cmd.parameters[1],
              tx: cmd.parameters[2],
              ty: cmd.parameters[3],
              eventId: parseInt(eid),
              page: pi,
              source: 'map',
              condition: condStr || undefined,
            });
            totalDirect++;
          }

          // 调用公共事件 → 递归解析其内的传送指令
          if (cmd.code === 117) {
            const nested = resolveCEChain(cmd.parameters[0]);
            for (const nt of nested) {
              // 去重：同一个事件位置，同一条 CE 可能解析出多个相同目标
              const dup = mapTransfers.some(t =>
                t.fx === ev.x && t.fy === ev.y &&
                t.tid === nt.tid && t.tx === nt.tx && t.ty === nt.ty
              );
              if (!dup) {
                mapTransfers.push({
                  fx: ev.x, fy: ev.y,
                  tid: nt.tid, tx: nt.tx, ty: nt.ty,
                  eventId: parseInt(eid),
                  page: pi,
                  source: 'commonEvent_' + cmd.parameters[0],
                  condition: condStr || undefined,
                });
                totalCE++;
              }
            }
          }
        }
      }
    }

    if (mapTransfers.length > 0) {
      allTransfers[mapId] = mapTransfers;
      mapsWithTransfers++;
    }
  }

  // 输出 JS 文件
  const content = '// 自动生成 — 由 scripts/extract-transfers.js 创建\n' +
    'var TRANSFERS_ALL = ' + JSON.stringify(allTransfers, null, 2) + ';\n';

  fs.writeFileSync(OUT_FILE, content, 'utf8');

  const stats = {
    totalMaps: mapIds.length,
    mapsWithTransfers,
    totalDirect,
    totalCE,
    total: totalDirect + totalCE,
    fileSize: (fs.statSync(OUT_FILE).size / 1024).toFixed(0) + 'KB',
  };

  console.log('✔ 完成');
  console.log('  地图总数:', stats.totalMaps);
  console.log('  含传送点:', stats.mapsWithTransfers + '/' + stats.totalMaps);
  console.log('  直接传送:', stats.totalDirect);
  console.log('  公共事件:', stats.totalCE);
  console.log('  合计:', stats.total);
  console.log('  输出:', path.relative(process.cwd(), OUT_FILE), '(' + stats.fileSize + ')');
}

main();
