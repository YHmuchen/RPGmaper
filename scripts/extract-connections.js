const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
const OUT = path.resolve(__dirname, '..', 'maps') + '/';

async function main() {
  let client;
  try {
    client = await CDP({port: 9222, host: '127.0.0.1'});
  } catch(e) {
    console.error('无法连接到游戏。请确保：\n1. 游戏已启动\n2. 启动参数包含 --remote-debugging-port=9222\n');
    process.exit(1);
  }
  const {Runtime} = client;
  await Runtime.enable();

  // 获取所有地图 ID
  var r0 = await Runtime.evaluate({
    expression: `JSON.stringify((function(){var a=[];for(var i=1;i<$dataMapInfos.length;i++)if($dataMapInfos[i])a.push(i);return a})())`,
    returnByValue: false
  });
  var mapIds = JSON.parse(r0.result.value);
  console.log('扫描 ' + mapIds.length + ' 张地图的传送事件...\n');

  var connections = [];
  var parallaxMaps = [];

  for (var i = 0; i < mapIds.length; i++) {
    var id = mapIds[i];
    process.stdout.write('[' + (i+1) + '/' + mapIds.length + '] Map' + id);

    await Runtime.evaluate({expression: 'DataManager.loadMapData(' + id + ')', returnByValue: false});
    await sleep(100);

    var r = await Runtime.evaluate({
      expression: `
        JSON.stringify((function(){
          var map = $dataMap;
          if(!map) return null;
          var out = {w:map.width, h:map.height, events:[]};
          var hasParallax = !!(map.parallaxName && map.parallaxName.length > 0);
          out.parallax = hasParallax;
          out.parallaxName = map.parallaxName || '';
          out.parallaxShow = !!map.parallaxShow;
          // 扫描事件中的传送命令
          if(map.events) {
            for(var ei=0; ei<map.events.length; ei++) {
              var ev = map.events[ei];
              if(!ev) continue;
              for(var pi=0; pi<ev.pages.length; pi++) {
                var page = ev.pages[pi];
                if(!page || !page.list) continue;
                for(var li=0; li<page.list.length; li++) {
                  var cmd = page.list[li];
                  if(cmd && cmd.code === 201) {  // Transfer player (MZ)
                    var p = cmd.parameters;
                    // params: [designationType(0=direct), mapId, x, y, dir, fade]
                    if (p && p.length >= 4) {
                      var toMap = p[0] === 0 ? p[1] : 'var_' + p[1];
                      var toX = p[0] === 0 ? p[2] : 'var_' + p[2];
                      var toY = p[0] === 0 ? p[3] : 'var_' + p[3];
                      out.events.push({
                        eventId: ev.id,
                        fromX: ev.x, fromY: ev.y,
                        toMapId: toMap,
                        toX: toX,
                        toY: toY,
                        direction: p[4] || 0,
                        fadeType: p[5] || 0
                      });
                    }
                    break;
                  }
                }
              }
            }
          }
          return out;
        })())
      `,
      returnByValue: false
    });

    var data = JSON.parse(r.result.value);
    if (!data) {
      process.stdout.write(' 无数据\n');
      continue;
    }

    if (data.events.length > 0) {
      connections.push({mapId: id, transfers: data.events});
      process.stdout.write(' ' + data.events.length + '个传送\n');
    } else if (data.parallax) {
      parallaxMaps.push(id);
      process.stdout.write(' 视差\n');
    } else {
      process.stdout.write('\n');
    }
  }

  // 计算地图间偏移量（BFS + 冲突报告）
  console.log('\n=== 传送连接（' + connections.length + ' 张地图有传送）===\n');

  var offsets = {}, adj = {};
  connections.forEach(function(c) { adj[c.mapId] = c.transfers; });

  var hubs = {};
  connections.forEach(function(c) {
    c.transfers.forEach(function(t) {
      var tid = Number(t.toMapId);
      if (tid) hubs[c.mapId] = (hubs[c.mapId] || 0) + 1;
    });
  });
  var startId = Number(Object.keys(hubs).sort(function(a,b){return hubs[b]-hubs[a]})[0]);
  offsets[startId] = {x: 0, y: 0};
  var queue = [startId];

  while (queue.length > 0) {
    var curId = queue.shift(), cur = offsets[curId];
    if (!adj[curId]) continue;
    adj[curId].forEach(function(tr) {
      var tid = Number(tr.toMapId);
      if (!tid || offsets[tid]) return;
      offsets[tid] = {x: cur.x + tr.fromX - tr.toX, y: cur.y + tr.fromY - tr.toY};
      queue.push(tid);
      console.log('  Map' + curId + ' → Map' + tid + '  (' + offsets[tid].x + ',' + offsets[tid].y + ')');
    });
  }

  // 冲突检测（只检测不修正）
  var conflicts = {};
  for (var c = 0; c < connections.length; c++) {
    for (var t = 0; t < connections[c].transfers.length; t++) {
      var tr = connections[c].transfers[t], tid = Number(tr.toMapId);
      if (!tid || !offsets[connections[c].mapId] || !offsets[tid]) continue;
      var cx = offsets[connections[c].mapId].x + tr.fromX - tr.toX;
      var cy = offsets[connections[c].mapId].y + tr.fromY - tr.toY;
      if (Math.abs(cx - offsets[tid].x) + Math.abs(cy - offsets[tid].y) > 1) {
        if (!conflicts[tid]) conflicts[tid] = [];
        conflicts[tid].push({expected: cx+','+cy, actual: offsets[tid].x+','+offsets[tid].y});
      }
    }
  }

  // 统计
  var linked = Object.keys(offsets).length;
  var unlinked = mapIds.filter(function(id){return offsets[id] === undefined && !parallaxMaps.includes(id)});

  console.log('\n=== 统计 ===');
  console.log('有偏移的地图: ' + linked);
  console.log('视差地图(跳过): ' + parallaxMaps.length);
  console.log('未连接的地图: ' + unlinked.length);

  if (Object.keys(conflicts).length > 0) {
    console.log('\n=== 偏移冲突（同一地图被多条路径指向不同位置）===');
    for (var id in conflicts) {
      console.log('  Map' + id);
      conflicts[id].forEach(function(cf) {
        console.log('    BFS位置: (' + cf.actual + ') 另一路径推断: (' + cf.expected + ')');
      });
    }
  }

  // 保存连接数据
  var out = {
    offsets: offsets,
    connections: connections,
    conflicts: conflicts,
    parallaxMaps: parallaxMaps,
    unlinkedMaps: unlinked
  };
  fs.mkdirSync(OUT, {recursive: true});
  fs.writeFileSync(OUT + 'connections.json', JSON.stringify(out, null, 2));
  console.log('\n已保存 maps/connections.json');

  client.close();
}

main().catch(e => { console.error(e); process.exit(1); });
