const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
const OUT = path.resolve(__dirname, '..', 'maps', 'tilesets') + '/';

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

  // 先检查 Bitmap 存储格式
  var r0 = await Runtime.evaluate({
    expression: `
      (function(){
        var ts = $dataTilesets[1];
        if(!ts) return 'no_ts';
        var name = ts.tilesetNames[0];
        if(!name) return 'no_name';
        var bmp = ImageManager.loadTileset(name);
        var info = {};
        info.hasCanvas = !!bmp._canvas;
        info.hasImage = !!bmp._image;
        info.hasBaseTexture = !!bmp._baseTexture;
        info.type = typeof bmp._image;
        info.width = bmp.width;
        info.height = bmp.height;
        if(bmp._image) info.imageReady = bmp._image.complete;
        if(bmp._image) info.imageSrc = (bmp._image.src || '').substring(0, 100);
        return JSON.stringify(info);
      })()
    `,
    returnByValue: false
  });
  console.log('Bitmap格式:', r0.result.value);

  // 批量导出 tileset 图片
  var r1 = await Runtime.evaluate({
    expression: `
      (function(){
        var out = {};
        for(var id in $dataTilesets) {
          var ts = $dataTilesets[id];
          if(!ts || !ts.tilesetNames) continue;
          out[id] = {name: ts.name, names: ts.tilesetNames};
        }
        return JSON.stringify(out);
      })()
    `,
    returnByValue: false
  });
  var tilesets = JSON.parse(r1.result.value);

  var allNames = {};
  for(var id in tilesets) {
    tilesets[id].names.forEach(function(n){
      if(n && n.length > 0) allNames[n] = true;
    });
  }
  var nameList = Object.keys(allNames);
  console.log('共 ' + nameList.length + ' 张 tileset 图片');

  for(var i=0; i<nameList.length; i++) {
    var name = nameList[i];
    process.stdout.write('[' + (i+1) + '/' + nameList.length + '] ' + name + ' ');

    var r2 = await Runtime.evaluate({
      expression: `
        (async function(){
          try {
            var bmp = ImageManager.loadTileset('${name.replace(/'/g, "\'")}');
            if(!bmp.isReady()) {
              await new Promise(function(r){bmp.addLoadListener(function(){r();});});
            }
            // 用 Canvas2D 画出 bitmap
            var c = document.createElement('canvas');
            c.width = bmp.width;
            c.height = bmp.height;
            var ctx = c.getContext('2d');
            if(bmp._canvas) {
              ctx.drawImage(bmp._canvas, 0, 0);
            } else if(bmp._image) {
              ctx.drawImage(bmp._image, 0, 0);
            } else {
              return 'no_source';
            }
            return c.toDataURL('image/png').split(',')[1];
          } catch(e) {
            return 'err:' + e.message;
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: false
    });

    var v = r2.result.value;
    if (v && !v.startsWith('err:') && v !== 'no_source') {
      fs.writeFileSync(OUT + name + '.png', v, 'base64');
      var sz = fs.statSync(OUT + name + '.png').size;
      process.stdout.write((sz/1024).toFixed(0) + 'KB ✓\n');
    } else {
      process.stdout.write(v + '\n');
    }
  }

  console.log('\n完成');
  client.close();
}

main().catch(e => { console.error(e); process.exit(1); });
