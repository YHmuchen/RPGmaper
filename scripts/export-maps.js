const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
const OUT = path.resolve(__dirname, '..', 'maps') + '/';
const MAX_H = 3800;

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

  // 补丁
  await Runtime.evaluate({
    expression: `try{Game_Event.prototype.setupParticles=function(){}}catch(e){}`,
    returnByValue: false
  });

  // 获取地图 ID
  var r0 = await Runtime.evaluate({
    expression: `JSON.stringify((function(){var a=[];for(var i=1;i<$dataMapInfos.length;i++)if($dataMapInfos[i])a.push(i);return a})())`,
    returnByValue: false
  });
  var mapIds = JSON.parse(r0.result.value);
  console.log('Total: ' + mapIds.length + ' maps\n');

  // 预加载 tileset 列表
  var r1 = await Runtime.evaluate({
    expression: `JSON.stringify((function(){var o={};for(var i=1;i<$dataTilesets.length;i++){var t=$dataTilesets[i];if(t)o[i]=t.tilesetNames;}return o;})())`,
    returnByValue: false
  });
  var allTilesets = JSON.parse(r1.result.value);

  // 创建全局 PIXI 应用
  await Runtime.evaluate({
    expression: `if(!window._xp){window._xp=new PIXI.Application({width:32,height:32,preserveDrawingBuffer:true,backgroundColor:0});window._xp.destroy=function(){}}`,
    returnByValue: false
  });

  var sharp = require('sharp');
  var success = 0, fail = 0;
  var baseDir = '';

  // 先找游戏根目录
  var r2 = await Runtime.evaluate({
    expression: `typeof require!=='undefined'&&typeof process!=='undefined'?JSON.stringify({cwd:process.cwd(),hasFS:typeof require('fs').readFileSync==='function'}):'nw_not_ready'`,
    returnByValue: false
  });
  console.log('NW.js:', r2.result.value);

  for (var i = 0; i < mapIds.length; i++) {
    var id = mapIds[i];
    process.stdout.write('[' + (i + 1) + '/' + mapIds.length + '] Map' + id + ' ');

    try {
      var r = await Runtime.evaluate({
        expression: `
          (async function(){
            try {
              // 不碰 $dataMap，直接读文件
              var pad = String(${id}).padStart(3,'0');
              var fs = require('fs');
              var p = process.cwd().replace(/\\\\/g,'/') + '/data/Map' + pad + '.json';
              if(!fs.existsSync(p)) return 'err:no_file_' + p;
              var map = JSON.parse(fs.readFileSync(p,'utf8'));
              if(!map||!map.data) return 'err:bad_data';

              var ts = $dataTilesets[map.tilesetId];
              if(!ts) return 'err:no_ts';
              var tw = map.width*48, th = map.height*48;
              var names = ts.tilesetNames;
              if(!names||names.length===0) return 'err:no_names';

              var bm = [], tasks = [], blank = new Bitmap(1,1);
              for(var j=0;j<names.length;j++) {
                var n = names[j];
                if(n&&n.length>0) {
                  var b = ImageManager.loadTileset(n);
                  if(b){bm.push(b);if(!b.isReady())tasks.push(new Promise(function(r){b.addLoadListener(function(){r();});}));}
                  else bm.push(blank);
                } else bm.push(blank);
              }
              if(tasks.length) await Promise.all(tasks);

              var app = window._xp;
              function doStrip(idx) {
                var sh = Math.min(${MAX_H}, th-idx*${MAX_H});
                app.renderer.resize(tw,sh); app.view.width=tw; app.view.height=sh;
                while(app.stage.children.length) app.stage.removeChildAt(0);
                var tm = new Tilemap();
                tm.tileWidth=48; tm.tileHeight=48; tm._margin=0;
                tm.setData(map.width,map.height,map.data);
                tm.setBitmaps(bm); tm.refresh();
                if(idx>0) tm.origin.y = idx*${MAX_H};
                app.stage.addChild(tm); app.renderer.render(app.stage);
                var b64 = app.view.toDataURL('image/png').split(',')[1];
                app.stage.removeChild(tm);
                return b64||'err:empty';
              }
              var strips = Math.ceil(th/${MAX_H});
              return strips<=1 ? doStrip(0) : JSON.stringify({s:Array.from({length:strips},function(_,s){return doStrip(s);}), sh:${MAX_H}, fh:th});
            } catch(e) { return 'err:'+e.message; }
          })()
        `,
        awaitPromise: true,
        returnByValue: false
      });

      var v = r.result.value;
      if (v && !v.startsWith('err:')) {
        var pad = String(id).padStart(4, '0');
        if (v.startsWith('{"s":')) {
          var d = JSON.parse(v);
          var meta, tmpFiles = [];
          for(var s=0;s<d.s.length;s++) {
            var buf = Buffer.from(d.s[s],'base64');
            var tmp = OUT+'t'+pad+'_'+s+'.png';
            fs.writeFileSync(tmp,buf); tmpFiles.push(tmp);
            if(!meta) meta = await sharp(tmp).metadata();
          }
          var bg = await sharp({create:{width:meta.width,height:d.fh,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();
          var out = await sharp(bg).composite(tmpFiles.map(function(f,si){return{input:f,top:si*d.sh,left:0};})).png().toBuffer();
          fs.writeFileSync(OUT+'Map'+pad+'.png',out);
          tmpFiles.forEach(function(f){try{fs.unlinkSync(f);}catch(e){}});
          process.stdout.write((out.length/1024).toFixed(0)+'KB ✓\n');
        } else {
          fs.writeFileSync(OUT+'Map'+pad+'.png',v,'base64');
          process.stdout.write((fs.statSync(OUT+'Map'+pad+'.png').size/1024).toFixed(0)+'KB ✓\n');
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
    await sleep(30);
  }

  console.log('\nDone! ' + success + ' OK, ' + fail + ' failed');
  client.close();
}
main().catch(function(e){console.error(e);process.exit(1);});