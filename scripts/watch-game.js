const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

const VISITED_FILE = path.resolve(__dirname, '..', 'docs', 'visited_data.js');
let prevMapId = null, prevX = null, prevY = null;

// 已探索地图 & 已使用的传送点
var visited = new Set();
var usedTransfers = []; // [{fromMap, fx, fy, toMap, tx, ty}, ...]

// 加载已有传送记录
try {
  if (fs.existsSync(VISITED_FILE)) {
    var existing = fs.readFileSync(VISITED_FILE, 'utf8');
    var m = existing.match(/var USED_TRANSFERS = (\[[\s\S]*?\]);/);
    if (m) usedTransfers = JSON.parse(m[1]);
  }
} catch(e) {}

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
      expression: '$gameMap ? JSON.stringify({mapId:$gameMap.mapId(),x:$gamePlayer.x,y:$gamePlayer.y}) : "null"',
      returnByValue: false
    });
    var state = JSON.parse(r.result.value);
    if (state && state.mapId > 0) {
      prevMapId = state.mapId;
      prevX = state.x;
      prevY = state.y;
      recordVisit(state.mapId);
      console.log('  当前: Map' + state.mapId + ' [' + state.x + ',' + state.y + ']');
    }
  } catch(e) { console.log('init err:', e.message); }

  // 轮询检测地图/位置变化
  setInterval(async function() {
    try {
      var r = await Runtime.evaluate({
        expression: [
          '$gameMap && SceneManager._scene instanceof Scene_Map',
          '? JSON.stringify({mapId:$gameMap.mapId(),x:$gamePlayer.x,y:$gamePlayer.y})',
          ': "null"'
        ].join(' '),
        returnByValue: false
      });
      var state = JSON.parse(r.result.value);
      if (!state || state.mapId < 1) return;

      var mapId = state.mapId, x = state.x, y = state.y;

      // 地图切换 → 记录传送
      if (mapId !== prevMapId && prevMapId > 0) {
        recordVisit(mapId);
        // 在 TRANSFERS 数据中查找匹配的传送点
        var match = findTransfer(prevMapId, mapId, x, y);
        if (match) {
          usedTransfers.push({
            fromMap: prevMapId, fx: match.fx, fy: match.fy,
            toMap: mapId, tx: x, ty: y,
            ts: Date.now()
          });
          console.log('  Map' + prevMapId + '[' + match.fx + ',' + match.fy + '] → Map' + mapId + '[' + x + ',' + y + '] ✓');
        } else {
          console.log('  → Map' + mapId + ' (无法匹配传送点)');
        }
        prevMapId = mapId;
        prevX = x;
        prevY = y;
        saveData();
      }
    } catch(e) {}
  }, 1500);
}

// 在 TRANSFERS 中查找: 从 fromMap 出发，到达 toMap 的 (x,y) 是哪个传送格子
function findTransfer(fromMap, toMap, toX, toY) {
  // TRANSFERS 数据格式: { mapId: [{fx,fy,tid,tx,ty}, ...] }
  var tdata = TRANSFERS[fromMap];
  if (!tdata) return null;
  // 找目标地图ID匹配 + 目标坐标匹配（允许 1 格误差）
  for (var i = 0; i < tdata.length; i++) {
    var t = tdata[i];
    if (t.tid === toMap && Math.abs(t.tx - toX) <= 1 && Math.abs(t.ty - toY) <= 1) {
      return t;
    }
  }
  // 放松匹配：只匹配目标地图
  for (var i = 0; i < tdata.length; i++) {
    if (tdata[i].tid === toMap) return tdata[i];
  }
  return null;
}

function recordVisit(id) {
  if (!id || visited.has(id)) return;
  visited.add(id);
}

function saveData() {
  var arr = Array.from(visited).sort(function(a,b){return a-b});
  var content = 'var VISITED_MAPS = ' + JSON.stringify(arr) + ';\n';
  content += 'var USED_TRANSFERS = ' + JSON.stringify(usedTransfers) + ';\n';
  fs.writeFileSync(VISITED_FILE, content);
}

// 内嵌 TRANSFERS 数据（保持与查看器一致）
var TRANSFERS={2:[{fx:0,fy:0,tid:7,tx:2,ty:8},{fx:0,fy:1,tid:273,tx:0,ty:32},{fx:0,fy:1,tid:137,tx:34,ty:45},{fx:0,fy:1,tid:75,tx:9,ty:0},{fx:0,fy:1,tid:68,tx:33,ty:18},{fx:0,fy:1,tid:68,tx:24,ty:10}],3:[{fx:22,fy:7,tid:120,tx:59,ty:39},{fx:23,fy:7,tid:120,tx:59,ty:39},{fx:24,fy:7,tid:120,tx:59,ty:39},{fx:25,fy:7,tid:120,tx:59,ty:39},{fx:26,fy:7,tid:120,tx:59,ty:39}],5:[{fx:17,fy:13,tid:264,tx:17,ty:8}],7:[{fx:2,fy:11,tid:5,tx:17,ty:14}],10:[{fx:7,fy:12,tid:26,tx:36,ty:27}],16:[{fx:1,fy:32,tid:274,tx:9,ty:11}],25:[{fx:0,fy:0,tid:281,tx:18,ty:16},{fx:0,fy:0,tid:281,tx:20,ty:16},{fx:0,fy:0,tid:281,tx:25,ty:16}],26:[{fx:37,fy:15,tid:251,tx:5,ty:11},{fx:36,fy:26,tid:10,tx:8,ty:12},{fx:30,fy:33,tid:26,tx:2,ty:24}],27:[{fx:0,fy:0,tid:281,tx:23,ty:16},{fx:0,fy:0,tid:281,tx:27,ty:16}],28:[{fx:9,fy:12,tid:109,tx:31,ty:99},{fx:9,fy:12,tid:109,tx:31,ty:90}],29:[{fx:0,fy:0,tid:137,tx:8,ty:20},{fx:0,fy:0,tid:281,tx:10,ty:7},{fx:0,fy:0,tid:144,tx:12,ty:5}],30:[{fx:1,fy:0,tid:29,tx:7,ty:0}],31:[{fx:0,fy:0,tid:137,tx:34,ty:34},{fx:0,fy:0,tid:137,tx:34,ty:34}],33:[{fx:0,fy:0,tid:109,tx:31,ty:99},{fx:0,fy:0,tid:28,tx:9,ty:0}],34:[{fx:0,fy:0,tid:157,tx:40,ty:20}],35:[{fx:0,fy:0,tid:152,tx:24,ty:22},{fx:0,fy:0,tid:91,tx:36,ty:13}],38:[{fx:0,fy:0,tid:91,tx:20,ty:10},{fx:0,fy:0,tid:91,tx:31,ty:11},{fx:0,fy:0,tid:91,tx:7,ty:10},{fx:0,fy:0,tid:91,tx:35,ty:10}],39:[{fx:0,fy:0,tid:137,tx:62,ty:33}],40:[{fx:0,fy:0,tid:120,tx:62,ty:34},{fx:0,fy:0,tid:120,tx:33,ty:9}],43:[{fx:13,fy:11,tid:157,tx:40,ty:51},{fx:14,fy:12,tid:281,tx:14,ty:6},{fx:13,fy:10,tid:157,tx:40,ty:51},{fx:12,fy:24,tid:281,tx:14,ty:4},{fx:13,fy:24,tid:281,tx:14,ty:4},{fx:14,fy:24,tid:281,tx:14,ty:4}],44:[{fx:0,fy:0,tid:3,tx:31,ty:97}],53:[{fx:45,fy:25,tid:118,tx:8,ty:6},{fx:31,fy:5,tid:281,tx:23,ty:4},{fx:19,fy:9,tid:281,tx:21,ty:4},{fx:45,fy:26,tid:118,tx:8,ty:6}],54:[{fx:6,fy:2,tid:281,tx:26,ty:10}],55:[{fx:8,fy:6,tid:157,tx:40,ty:27},{fx:8,fy:6,tid:157,tx:40,ty:18}],66:[{fx:31,fy:41,tid:2,tx:0,ty:2},{fx:21,fy:39,tid:107,tx:19,ty:19},{fx:20,fy:39,tid:107,tx:19,ty:19},{fx:22,fy:39,tid:107,tx:19,ty:19}],68:[{fx:40,fy:42,tid:68,tx:31,ty:93},{fx:55,fy:62,tid:145,tx:7,ty:15},{fx:22,fy:4,tid:137,tx:34,ty:46},{fx:23,fy:4,tid:137,tx:34,ty:46},{fx:24,fy:4,tid:137,tx:34,ty:46},{fx:25,fy:4,tid:137,tx:34,ty:46},{fx:26,fy:4,tid:137,tx:34,ty:46},{fx:33,fy:16,tid:139,tx:7,ty:0},{fx:45,fy:16,tid:139,tx:7,ty:0},{fx:15,fy:41,tid:68,tx:15,ty:50},{fx:60,fy:47,tid:109,tx:54,ty:53}],76:[{fx:0,fy:0,tid:137,tx:7,ty:18},{fx:0,fy:0,tid:137,tx:7,ty:33}],83:[{fx:10,fy:9,tid:281,tx:5,ty:12},{fx:13,fy:18,tid:91,tx:20,ty:9}],91:[{fx:38,fy:10,tid:38,tx:9,ty:7},{fx:36,fy:15,tid:35,tx:8,ty:6},{fx:20,fy:7,tid:83,tx:11,ty:18},{fx:38,fy:11,tid:38,tx:9,ty:7}],93:[{fx:0,fy:0,tid:152,tx:26,ty:16}],107:[{fx:19,fy:23,tid:107,tx:30,ty:30},{fx:19,fy:18,tid:66,tx:21,ty:37}],109:[{fx:40,fy:42,tid:109,tx:31,ty:93},{fx:55,fy:62,tid:145,tx:7,ty:15},{fx:25,fy:44,tid:149,tx:8,ty:0},{fx:22,fy:4,tid:137,tx:34,ty:46},{fx:23,fy:4,tid:137,tx:34,ty:46},{fx:24,fy:4,tid:137,tx:34,ty:46},{fx:25,fy:4,tid:137,tx:34,ty:46},{fx:26,fy:4,tid:137,tx:34,ty:46},{fx:37,fy:73,tid:109,tx:53,ty:53},{fx:33,fy:16,tid:139,tx:7,ty:0},{fx:45,fy:16,tid:139,tx:7,ty:0},{fx:34,fy:64,tid:281,tx:14,ty:11},{fx:60,fy:47,tid:109,tx:54,ty:53},{fx:15,fy:41,tid:109,tx:22,ty:50}],116:[{fx:5,fy:16,tid:117,tx:16,ty:13},{fx:5,fy:17,tid:117,tx:16,ty:14},{fx:9,fy:27,tid:157,tx:56,ty:42},{fx:8,fy:4,tid:157,tx:40,ty:51}],117:[{fx:18,fy:13,tid:116,tx:7,ty:16},{fx:18,fy:14,tid:116,tx:7,ty:17},{fx:13,fy:23,tid:157,tx:48,ty:42}],125:[{fx:10,fy:10,tid:66,tx:20,ty:26},{fx:8,fy:24,tid:51,tx:8,ty:6}],137:[{fx:34,fy:48,tid:109,tx:26,ty:17},{fx:9,fy:19,tid:76,tx:8,ty:0},{fx:9,fy:20,tid:76,tx:8,ty:0},{fx:4,fy:19,tid:31,tx:7,ty:0},{fx:29,fy:32,tid:31,tx:7,ty:0},{fx:39,fy:32,tid:31,tx:7,ty:0},{fx:34,fy:31,tid:281,tx:14,ty:11}],139:[{fx:0,fy:0,tid:109,tx:33,ty:18}],144:[{fx:10,fy:6,tid:262,tx:9,ty:12},{fx:10,fy:6,tid:274,tx:8,ty:10},{fx:10,fy:6,tid:138,tx:7,ty:6},{fx:4,fy:5,tid:280,tx:8,ty:6},{fx:9,fy:5,tid:138,tx:8,ty:6}],145:[{fx:7,fy:17,tid:68,tx:55,ty:63},{fx:7,fy:3,tid:109,tx:55,ty:63}],148:[{fx:0,fy:0,tid:281,tx:18,ty:4},{fx:0,fy:0,tid:53,tx:31,ty:10}],152:[{fx:13,fy:14,tid:91,tx:8,ty:7},{fx:26,fy:16,tid:152,tx:9,ty:10},{fx:37,fy:8,tid:93,tx:7,ty:0},{fx:22,fy:37,tid:154,tx:8,ty:5},{fx:24,fy:12,tid:152,tx:21,ty:22},{fx:30,fy:27,tid:152,tx:22,ty:36}],154:[{fx:0,fy:0,tid:152,tx:22,ty:36}],157:[{fx:37,fy:16,tid:157,tx:26,ty:1},{fx:28,fy:40,tid:138,tx:6,ty:4},{fx:48,fy:41,tid:117,tx:13,ty:22},{fx:56,fy:41,tid:116,tx:9,ty:25},{fx:73,fy:2,tid:55,tx:8,ty:6},{fx:43,fy:53,tid:2,tx:8,ty:6},{fx:43,fy:53,tid:144,tx:1,ty:32}],251:[{fx:5,fy:14,tid:26,tx:37,ty:16},{fx:5,fy:14,tid:260,tx:37,ty:16},{fx:19,fy:8,tid:281,tx:14,ty:11},{fx:22,fy:3,tid:264,tx:10,ty:13},{fx:22,fy:3,tid:268,tx:8,ty:12},{fx:23,fy:3,tid:264,tx:10,ty:13},{fx:23,fy:3,tid:268,tx:8,ty:12}],252:[{fx:9,fy:5,tid:251,tx:6,ty:9},{fx:13,fy:2,tid:270,tx:8,ty:8},{fx:3,fy:5,tid:271,tx:6,ty:4},{fx:14,fy:4,tid:281,tx:14,ty:11}],260:[{fx:37,fy:15,tid:251,tx:5,ty:11},{fx:9,fy:32,tid:260,tx:14,ty:32},{fx:26,fy:38,tid:281,tx:5,ty:7}],262:[{fx:8,fy:12,tid:274,tx:8,ty:10},{fx:8,fy:12,tid:273,tx:12,ty:6},{fx:8,fy:12,tid:144,tx:10,ty:8}],264:[{fx:10,fy:16,tid:251,tx:22,ty:6},{fx:10,fy:5,tid:252,tx:9,ty:15}],268:[{fx:8,fy:12,tid:281,tx:14,ty:6}],270:[{fx:8,fy:6,tid:252,tx:9,ty:13},{fx:8,fy:6,tid:26,tx:36,ty:27}],271:[{fx:8,fy:4,tid:252,tx:5,ty:5}],273:[{fx:10,fy:6,tid:262,tx:9,ty:12},{fx:4,fy:5,tid:280,tx:8,ty:12},{fx:6,fy:12,tid:2,tx:7,ty:12},{fx:14,fy:6,tid:281,tx:14,ty:11}],274:[{fx:9,fy:10,tid:262,tx:9,ty:12},{fx:9,fy:13,tid:138,tx:7,ty:6}],281:[{fx:14,fy:26,tid:30,tx:7,ty:0},{fx:14,fy:26,tid:33,tx:7,ty:0},{fx:14,fy:26,tid:152,tx:22,ty:36},{fx:14,fy:26,tid:40,tx:8,ty:6},{fx:14,fy:26,tid:66,tx:37,ty:39},{fx:14,fy:26,tid:55,tx:8,ty:6},{fx:19,fy:9,tid:273,tx:12,ty:6},{fx:5,fy:11,tid:93,tx:7,ty:6},{fx:5,fy:6,tid:252,tx:9,ty:7},{fx:10,fy:6,tid:33,tx:8,ty:0},{fx:5,fy:16,tid:138,tx:7,ty:5},{fx:5,fy:21,tid:144,tx:1,ty:32},{fx:10,fy:11,tid:44,tx:8,ty:6},{fx:10,fy:16,tid:55,tx:8,ty:6},{fx:10,fy:21,tid:144,tx:1,ty:32},{fx:27,fy:21,tid:138,tx:7,ty:6},{fx:20,fy:9,tid:144,tx:4,ty:6},{fx:20,fy:15,tid:25,tx:7,ty:0},{fx:18,fy:3,tid:148,tx:8,ty:6},{fx:18,fy:15,tid:25,tx:7,ty:0},{fx:18,fy:21,tid:109,tx:31,ty:87},{fx:21,fy:3,tid:148,tx:8,ty:6},{fx:22,fy:9,tid:144,tx:4,ty:6},{fx:24,fy:9,tid:144,tx:4,ty:6},{fx:23,fy:3,tid:148,tx:8,ty:6},{fx:23,fy:15,tid:27,tx:8,ty:6},{fx:24,fy:3,tid:148,tx:8,ty:6},{fx:27,fy:3,tid:148,tx:8,ty:6},{fx:26,fy:9,tid:144,tx:12,ty:5},{fx:29,fy:21,tid:33,tx:8,ty:6},{fx:25,fy:15,tid:25,tx:8,ty:6},{fx:27,fy:15,tid:27,tx:8,ty:6},{fx:24,fy:21,tid:138,tx:7,ty:6},{fx:14,fy:2,tid:43,tx:13,ty:22},{fx:14,fy:3,tid:281,tx:14,ty:4}]};

process.on('SIGINT', function() {
  console.log('\n已停止监听');
  process.exit();
});

main().catch(function(e) {
  console.error('错误:', e.message);
  process.exit(1);
});
