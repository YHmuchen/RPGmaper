const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
const OUT = path.resolve(__dirname, '..', 'maps') + '/';
const TS_DIR = 'C:/Users/Muchen/maps/tilesets/';
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
  await Runtime.evaluate({expression: `try{Game_Event.prototype.setupParticles=function(){}}catch(e){}`,returnByValue: false});

  // 获取地图 ID
  var r0 = await Runtime.evaluate({expression: `JSON.stringify((function(){var a=[];for(var i=1;i<$dataMapInfos.length;i++)if($dataMapInfos[i])a.push(i);return a})())`,returnByValue: false});
  var mapIds = JSON.parse(r0.result.value);
  console.log('Total: ' + mapIds.length + ' maps\n');

  console.log('Tilesets will load from ' + TS_DIR.replace(/\\/g,'/') + '\n');

  // 创建全局 PIXI 应用
  await Runtime.evaluate({expression: `if(!window._xp){window._xp=new PIXI.Application({width:32,height:32,preserveDrawingBuffer:true,backgroundColor:0});window._xp.destroy=function(){}}`,returnByValue: false});

  var sharp = require('sharp');
  var success = 0, fail = 0;

  for (var i = 0; i < mapIds.length; i++) {
    var id = mapIds[i];
    process.stdout.write('['+(i+1)+'/'+mapIds.length+'] Map'+id+' ');

    try {
      // 读取地图文件
      var gDir = 'E:/hhh/ce/操心の魔導具-ver1.3.0_';
      var pad = String(id).padStart(3, '0');
      var mapPath = gDir + '/data/Map' + pad + '.json';
      if (!fs.existsSync(mapPath)) { process.stdout.write('✗ no file\n'); fail++; continue; }
      var map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
      if (!map || !map.data) { process.stdout.write('✗ no data\n'); fail++; continue; }

      var tw = map.width * 48, th = map.height * 48;

      // 渲染到 PIXI（用本地 tileset 图片）
      var r = await Runtime.evaluate({
        expression: `
          (async function(){
            try {
              var ts = $dataTilesets[${map.tilesetId}];
              if(!ts) return 'err:no_ts';
              var names = ts.tilesetNames;
              if(!names||names.length===0) return 'err:no_names';

              var _fs = require('fs');
              var _base = 'C:/Users/Muchen/maps/tilesets/';
              var bm = [], blank = new Bitmap(1,1);

              for(var j=0;j<names.length;j++) {
                var n = names[j];
                if(n&&n.length>0) {
                  var f = _base + n + '.png';
                  try {
                    var data = _fs.readFileSync(f).toString('base64');
                    var bmp = new Bitmap(1,1);
                    var img = new Image();
                    img.src = 'data:image/png;base64,' + data;
                    await new Promise(function(r){img.onload=r;});
                    var c = document.createElement('canvas');
                    c.width = img.width; c.height = img.height;
                    c.getContext('2d').drawImage(img,0,0);
                    bmp._canvas = c;
                    bmp._image = img;
                    bm.push(bmp);
                  } catch(e) { bm.push(blank); }
                } else { bm.push(blank); }
              }

              var app = window._xp;
              var _tw=${tw}, _th=${th};
              function doStrip(idx) {
                var sh = Math.min(${MAX_H}, _th-idx*${MAX_H});
                app.renderer.resize(_tw,sh); app.view.width=_tw; app.view.height=sh;
                while(app.stage.children.length) app.stage.removeChildAt(0);
                var tm = new Tilemap();
                tm.tileWidth=48; tm.tileHeight=48; tm._margin=0;
                tm.setData(${map.width},${map.height}, ${JSON.stringify(map.data)});
                tm.setBitmaps(bm); tm.refresh();
                if(idx>0) tm.origin.y = idx*${MAX_H};
                app.stage.addChild(tm); app.renderer.render(app.stage);
                var _b64 = app.view.toDataURL('image/png').split(',')[1];
                app.stage.removeChild(tm);
                return _b64||'err:empty';
              }
              var strips = Math.ceil(_th/${MAX_H});
              return strips<=1 ? doStrip(0) : JSON.stringify({s:Array.from({length:strips},function(_,s){return doStrip(s);}), sh:${MAX_H}, fh:th});
            } catch(e) { return 'err:'+e.message; }
          })()
        `,
        awaitPromise: true,
        returnByValue: false
      });

      var v = r.result.value;
      if (v && !v.startsWith('err:')) {
        var pad = String(id).padStart(4,'0');
        if (v.startsWith('{"s":')) {
          var d = JSON.parse(v); var meta, tmpFiles = [];
          for(var s=0;s<d.s.length;s++) {
            var buf = Buffer.from(d.s[s],'base64'); var tmp=OUT+'t'+pad+'_'+s+'.png';
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
      } else { process.stdout.write('✗ '+v+'\n'); fail++; }
    } catch(e) { process.stdout.write('Error: '+e.message+'\n'); fail++; }
    await sleep(30);
  }

  console.log('\nDone! '+success+' OK, '+fail+' failed');
  client.close();
}
main().catch(function(e){console.error(e);process.exit(1);});