const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
const OUT = path.resolve(__dirname, '..', 'maps') + '/';
const MAX_SAFE = 3500;

async function main() {
  let client;
  try {
    client = await CDP({port: 9222, host: '127.0.0.1'});
  } catch(e) {
    console.error('Cannot connect. Start game with --remote-debugging-port=9222');
    process.exit(1);
  }
  const {Runtime} = client;
  await Runtime.enable();

  fs.mkdirSync(OUT, {recursive: true});

  // 补丁（标题画面也需要）
  await Runtime.evaluate({
    expression: `try{Game_Event.prototype.setupParticles=function(){}}catch(e){}`,
    returnByValue: false
  });

  // 获取所有地图 ID
  var r0 = await Runtime.evaluate({
    expression: `JSON.stringify((function(){var a=[];for(var i=1;i<$dataMapInfos.length;i++)if($dataMapInfos[i])a.push(i);return a})())`,
    returnByValue: false
  });
  var allMapIds = JSON.parse(r0.result.value);
  console.log('Found ' + allMapIds.length + ' maps');

  // 逐张加载并检查 tile 数量（排除视差图）
  var mapIds = [], parallaxIds = [];
  for (var mi = 0; mi < allMapIds.length; mi++) {
    var id = allMapIds[mi];
    process.stdout.write('Scan ' + id + '...');
    await Runtime.evaluate({ expression: `DataManager.loadMapData(${id})`, returnByValue: false });
    await sleep(300);
    var r1 = await Runtime.evaluate({
      expression: `JSON.stringify((function(){var m=$dataMap;if(!m)return null;var c=0;for(var j=0;j<m.data.length;j++)if(m.data[j]>0)c++;return c;})())`,
      returnByValue: false
    });
    var tileCount = JSON.parse(r1.result.value);
    if (tileCount === null || tileCount === 0) {
      parallaxIds.push(id);
      process.stdout.write('skip (0 tiles)\n');
    } else {
      mapIds.push(id);
      process.stdout.write(tileCount + ' tiles\n');
    }
  }
  console.log('\nExport: ' + mapIds.length + ' maps, parallax skipped: ' + parallaxIds.length + '\n');

  // 全局 PIXI 应用
  await Runtime.evaluate({
    expression: `(function(){if(!window._app)window._app=new PIXI.Application({width:32,height:32,preserveDrawingBuffer:true,backgroundColor:0});})()`,
    returnByValue: false
  });

  var success = 0, fail = 0;
  for (var i = 0; i < mapIds.length; i++) {
    var id = mapIds[i];
    process.stdout.write('[' + (i + 1) + '/' + mapIds.length + '] Map' + id + ' ');

    try {
      var r = await Runtime.evaluate({
        expression: `
          (async function(){
            try {
              DataManager.loadMapData(${id});
              var map = $dataMap;
              if(!map) return 'err:no_map';
              var ts = $dataTilesets[map.tilesetId];
              if(!ts) return 'err:no_ts';
              var tw = map.width * 48, th = map.height * 48;
              var names = ts.tilesetNames;
              if(!names || names.length === 0) return 'err:no_names';

              var bitmaps = [], tasks = [];
              var blank = new Bitmap(1, 1);
              for(var j = 0; j < names.length; j++) {
                var n = names[j];
                if(n && n.length > 0) {
                  var b = ImageManager.loadTileset(n);
                  if(b) { bitmaps.push(b); if(!b.isReady()) tasks.push(new Promise(function(r){b.addLoadListener(function(){r();});})); }
                  else { bitmaps.push(blank); }
                } else { bitmaps.push(blank); }
              }
              if(tasks.length) await Promise.all(tasks);

              var app = window._app;

              function renderStrip(stripIdx, totalH) {
                var stripH = Math.min(${MAX_SAFE}, totalH - stripIdx * ${MAX_SAFE});
                app.renderer.resize(tw, stripH);
                app.view.width = tw; app.view.height = stripH;

                while(app.stage.children.length > 0) app.stage.removeChildAt(0);
                var tm = new Tilemap();
                tm.tileWidth = 48; tm.tileHeight = 48; tm._margin = 0;
                tm.setData(map.width, map.height, map.data);
                tm.setBitmaps(bitmaps);
                tm.refresh();
                if(stripIdx > 0) tm.origin.y = stripIdx * ${MAX_SAFE};
                app.stage.addChild(tm);
                app.renderer.render(app.stage);
                var b64 = app.view.toDataURL('image/png').split(',')[1];
                app.stage.removeChild(tm);
                return b64 || 'err:empty';
              }

              var strips = Math.ceil(th / ${MAX_SAFE});
              if (strips <= 1) return renderStrip(0, th);

              var results = [];
              for(var s = 0; s < strips; s++) results.push(renderStrip(s, th));
              return JSON.stringify({strips: results, stripH: ${MAX_SAFE}, fullH: th});
            } catch(e) { return 'err:' + e.message; }
          })()
        `,
        awaitPromise: true,
        returnByValue: false
      });

      var v = r.result.value;
      if (v && !v.startsWith('err:')) {
        var pad = String(id).padStart(4, '0');

        if (v.startsWith('{"strips":')) {
          var data = JSON.parse(v);
          var sharp = require('sharp');
          var tmpFiles = [], meta = null;
          for (var s = 0; s < data.strips.length; s++) {
            var buf = Buffer.from(data.strips[s], 'base64');
            var tmp = OUT + 'tmp_' + pad + '_' + s + '.png';
            fs.writeFileSync(tmp, buf);
            tmpFiles.push(tmp);
            if (!meta) meta = await sharp(tmp).metadata();
          }
          var bg = await sharp({create: {width: meta.width, height: data.fullH, channels: 4, background: {r:0,g:0,b:0,alpha:0}}}).png().toBuffer();
          var layers = tmpFiles.map(function(f, s) { return {input: f, top: s * data.stripH, left: 0}; });
          var result = await sharp(bg).composite(layers).png().toBuffer();
          fs.writeFileSync(OUT + 'Map' + pad + '.png', result);
          tmpFiles.forEach(function(f) { try{fs.unlinkSync(f);}catch(e){} });
          process.stdout.write((result.length / 1024).toFixed(0) + 'KB ✓\n');
        } else {
          fs.writeFileSync(OUT + 'Map' + pad + '.png', v, 'base64');
          process.stdout.write((fs.statSync(OUT + 'Map' + pad + '.png').size / 1024).toFixed(0) + 'KB ✓\n');
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
    await sleep(50);
  }

  console.log('\nDone! ' + success + ' OK, ' + fail + ' failed');
  if (parallaxIds.length > 0) console.log('Skipped parallax maps: ' + parallaxIds.join(', '));
  client.close();
}

main().catch(function(e) { console.error(e); process.exit(1); });