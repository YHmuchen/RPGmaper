const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
const OUT = path.resolve(__dirname, '..', 'maps') + '/';
const MAX_SAFE = 3800; // 安全渲染尺寸（避免 WebGL 限制）

async function main() {
  let client;
  try {
    client = await CDP({port: 9222, host: '127.0.0.1'});
  } catch(e) {
    console.error('Cannot connect to game. Make sure:\n1. Game is running\n2. Started with --remote-debugging-port=9222\n');
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
  console.log('Total: ' + mapIds.length + ' maps\n');

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
                    if(!b.isReady()) tasks.push(new Promise(function(r){b.addLoadListener(function(){r();});}));
                  } else { bitmaps.push(blank); }
                } else { bitmaps.push(blank); }
              }
              if(tasks.length) await Promise.all(tasks);

              // 超大图：分片渲染
              var strips = Math.ceil(th / ${MAX_SAFE});
              if (strips <= 1) {
                // 普通渲染
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
                return b64 || 'err:empty';
              }

              // 分片渲染（垂直切割）
              var results = [];
              for(var s=0; s<strips; s++) {
                var sh = Math.min(${MAX_SAFE}, th - s * ${MAX_SAFE});
                var a2 = new PIXI.Application({width:tw,height:sh,preserveDrawingBuffer:true,backgroundColor:0});
                var tm = new Tilemap();
                tm.tileWidth=48;tm.tileHeight=48;tm._margin=0;
                tm.setData(map.width,map.height,map.data);
                tm.setBitmaps(bitmaps);
                tm.refresh();
                tm.origin.y = s * ${MAX_SAFE};
                a2.stage.addChild(tm);
                a2.renderer.render(a2.stage);
                results.push(a2.view.toDataURL('image/png').split(',')[1]);
                a2.destroy(true,{children:true});
              }
              return JSON.stringify({strips: results, stripH: ${MAX_SAFE}, fullH: th});
            } catch(e) { return 'err:'+e.message+'|'+(e.stack||'').substring(0,100); }
          })()
        `,
        awaitPromise: true,
        returnByValue: false
      });

      var v = r.result.value;
      if (v && !v.startsWith('err:')) {
        var pad = String(id).padStart(4, '0');

        // 判断是否分片结果
        if (v.startsWith('{"strips":')) {
          var data = JSON.parse(v);
          // 用 sharp 拼接
          var sharp = require('sharp');
          var layers = [];
          for(var s=0; s<data.strips.length; s++) {
            var buf = Buffer.from(data.strips[s], 'base64');
            var tmp = OUT + 'tmp_' + pad + '_' + s + '.png';
            fs.writeFileSync(tmp, buf);
            layers.push({input: tmp, top: s * data.stripH, left: 0});
          }
          var bg = await sharp({create: {width:layers[0].width||1, height:data.fullH, channels:4, background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();
          var result = await sharp(bg).composite(layers).png().toBuffer();
          fs.writeFileSync(OUT + 'Map' + pad + '.png', result);
          // 清理临时文件
          for(var s=0; s<data.strips.length; s++) {
            try{fs.unlinkSync(OUT + 'tmp_' + pad + '_' + s + '.png');}catch(e){}
          }
          var sz = fs.statSync(OUT + 'Map' + pad + '.png').size;
          process.stdout.write((sz/1024).toFixed(0) + 'KB ✓ (stitched ' + data.strips.length + ' strips)\n');
        } else {
          fs.writeFileSync(OUT + 'Map' + pad + '.png', v, 'base64');
          var sz = fs.statSync(OUT + 'Map' + pad + '.png').size;
          process.stdout.write((sz/1024).toFixed(0) + 'KB ✓\n');
        }
        success++;
      } else {
        process.stdout.write('✗ ' + v + '\n');
        fail++;
      }
    } catch(e) {
      process.stdout.write('Error: ' + e.message + '\n');
      fail++;
    }
    await sleep(100);
  }

  console.log('\nDone! Success ' + success + ', failed ' + fail);
  client.close();
}

main().catch(e => { console.error(e); process.exit(1); });