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

  fs.mkdirSync(OUT, {recursive: true});

  await Runtime.evaluate({ expression: `try{Game_Event.prototype.setupParticles=function(){};window._p=true}catch(e){}`, returnByValue: false });

  var r0 = await Runtime.evaluate({
    expression: `JSON.stringify((function(){var a=[];for(var i=1;i<$dataMapInfos.length;i++)if($dataMapInfos[i])a.push(i);return a})())`,
    returnByValue: false
  });
  var mapIds = JSON.parse(r0.result.value);
  console.log('共 ' + mapIds.length + ' 张地图');

  var success = 0, fail = 0;
  for(var i=0; i<mapIds.length; i++) {
    var id = mapIds[i];
    process.stdout.write('[' + (i+1) + '/' + mapIds.length + '] Map' + id + ' ');

    try {
      await Runtime.evaluate({ expression: `DataManager.loadMapData(${id})`, returnByValue: false });
      await sleep(400);

      var r = await Runtime.evaluate({
        expression: `
          (async function(){
            try {
              var map = $dataMap;
              if(!map) return 'err:no_map';
              var ts = $dataTilesets[map.tilesetId];
              if(!ts) return 'err:no_ts';
              var tw = map.width*48, th = map.height*48;
              var names = ts.tilesetNames;
              if(!names || names.length==0) return 'err:no_names';
              var bitmaps = [], tasks = [];
              var blank = new Bitmap(1, 1);
              for(var i=0;i<names.length;i++) {
                var n = names[i];
                if(n && n.length>0) {
                  var b = ImageManager.loadTileset(n);
                  if(b) {
                    bitmaps.push(b);
                    if(!b.isReady()) {
                      tasks.push(new Promise(function(r){b.addLoadListener(function(){r();});}));
                    }
                  } else { bitmaps.push(blank); }
                } else { bitmaps.push(blank); }
              }
              if(tasks.length) await Promise.all(tasks);
              var a2 = new PIXI.Application({width:tw,height:th,preserveDrawingBuffer:true,backgroundColor:0});
              var tm = new Tilemap();
              tm.tileWidth=48;tm.tileHeight=48;tm._margin=0;
              tm.setData(map.width,map.height,map.data);
              tm.setBitmaps(bitmaps);
              tm.refresh();
              a2.stage.addChild(tm);
              a2.renderer.render(a2.stage);
              var b64 = a2.view.toDataURL('image/png').split(',')[1];
              a2.destroy(true,{children:true});
              if(!b64 || b64.length<10) return 'err:empty';
              return b64;
            } catch(e) { return 'err:'+e.message+'|'+(e.stack||'').substring(0,100); }
          })()
        `,
        awaitPromise: true,
        returnByValue: false
      });

      var v = r.result.value;
      if (v && !v.startsWith('err:')) {
        var pad = String(id).padStart(4, '0');
        fs.writeFileSync(OUT + 'Map' + pad + '.png', v, 'base64');
        var sz = fs.statSync(OUT + 'Map' + pad + '.png').size;
        process.stdout.write((sz/1024).toFixed(0) + 'KB ✓\n');
        success++;
      } else {
        process.stdout.write('✗ ' + v + '\n');
        fail++;
      }
    } catch(e) {
      process.stdout.write('异常: ' + e.message + '\n');
      fail++;
    }
    await sleep(100);
  }

  console.log('\n完成！成功 ' + success + '，失败 ' + fail);
  client.close();
}

main().catch(e => { console.error(e); process.exit(1); });
