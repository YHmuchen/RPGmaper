const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

const VISITED_FILE = path.resolve(__dirname, '..', 'docs', 'visited_data.js');
let prevMapId = null;

async function main() {
  let client;
  try {
    client = await CDP({port: 9222, host: '127.0.0.1'});
  } catch(e) {
    console.error('无法连接游戏。请确保：\n1. 游戏已启动\n2. 启动参数包含 --remote-debugging-port=9222\n');
    process.exit(1);
  }

  const {Runtime} = client;
  await Runtime.enable();
  console.log('已连接游戏，开始监听地图切换...\n');

  // 初始检测
  try {
    var r = await Runtime.evaluate({
      expression: '$gameMap ? $gameMap.mapId() : -1',
      returnByValue: false
    });
    prevMapId = parseInt(r.result.value);
    if (prevMapId > 0) recordVisit(prevMapId);
    console.log('  当前地图: Map' + prevMapId);
  } catch(e) {}

  // 轮询检测地图变化
  setInterval(async function() {
    try {
      var r = await Runtime.evaluate({
        expression: '$gameMap && SceneManager._scene instanceof Scene_Map ? $gameMap.mapId() : -1',
        returnByValue: false
      });
      var mapId = parseInt(r.result.value);
      if (mapId > 0 && mapId !== prevMapId) {
        prevMapId = mapId;
        recordVisit(mapId);
        console.log('  → Map' + mapId + ' (已探索 ' + visited.size + ' 张)');
      }
    } catch(e) {
      // 游戏可能在加载中
    }
  }, 1500);
}

var visited = new Set();

function recordVisit(id) {
  if (!id || visited.has(id)) return;
  visited.add(id);
  var arr = Array.from(visited).sort(function(a,b){return a-b});
  fs.writeFileSync(VISITED_FILE, 'var VISITED_MAPS = ' + JSON.stringify(arr) + ';\n');
  console.log('  Map' + id + ' 已记录');
}

process.on('SIGINT', function() {
  console.log('\n已停止监听');
  process.exit();
});

main().catch(function(e) {
  console.error('错误:', e.message);
  process.exit(1);
});
