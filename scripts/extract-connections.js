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

  // 计算地图间偏移量
  console.log('\n=== 传送连接（' + connections.length + ' 张地图有传送）===\n');

  var offsets = {};
  var queue = [];

  // 从第一张有传送的地图开始
  if (connections.length > 0) {
    var startId = connections[0].mapId;
    offsets[startId] = {x: 0, y: 0};
    queue.push(startId);

    // BFS 遍历
    while (queue.length > 0) {
      var currentId = queue.shift();
      var conn = connections.find(function(c){return c.mapId === currentId});
      if (!conn) continue;
      var curOff = offsets[currentId];

      for (var t = 0; t < conn.transfers.length; t++) {
        var tr = conn.transfers[t];
        var targetId = tr.toMapId;
        if (offsets[targetId] !== undefined) continue;  // 已算过

        // 计算偏移：玩家在 curMap 的 (tr.fromX,tr.fromY) 传送到 targetMap 的 (tr.toX,tr.toY)
        // 两张地图的 (tr.fromX - tr.toX, tr.fromY - tr.toY) 对齐
        offsets[targetId] = {
          x: curOff.x + tr.fromX - tr.toX,
          y: curOff.y + tr.fromY - tr.toY
        };
        queue.push(targetId);
        console.log('  Map' + currentId + '[' + tr.fromX + ',' + tr.fromY + '] → Map' + targetId + '[' + tr.toX + ',' + tr.toY + ']  offset=(' + offsets[targetId].x + ',' + offsets[targetId].y + ')');
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

  // 保存连接数据
  var out = {
    offsets: offsets,
    connections: connections,
    parallaxMaps: parallaxMaps,
    unlinkedMaps: unlinked
  };
  fs.mkdirSync(OUT, {recursive: true});
  fs.writeFileSync(OUT + 'connections.json', JSON.stringify(out, null, 2));
  console.log('\n已保存 maps/connections.json');

  client.close();
}

main().catch(e => { console.error(e); process.exit(1); });
