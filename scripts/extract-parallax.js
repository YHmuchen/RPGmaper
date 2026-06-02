const CDP = require('chrome-remote-interface');
const fs = require('fs');
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  let client = await CDP({port: 9222, host: '127.0.0.1'});
  const {Runtime} = client;
  await Runtime.enable();

  // 先获取所有地图 ID
  var r0 = await Runtime.evaluate({
    expression: `JSON.stringify((function(){var a=[];for(var i=1;i<$dataMapInfos.length;i++)if($dataMapInfos[i])a.push(i);return a})())`,
    returnByValue: false
  });
  var allIds = JSON.parse(r0.result.value);

  // 逐张加载并检查 parallax
  var parallaxMaps = {};
  for(var i=0;i<allIds.length;i++) {
    var id = allIds[i];
    await Runtime.evaluate({expression: 'DataManager.loadMapData('+id+')', returnByValue: false});
    await sleep(50);

    var r = await Runtime.evaluate({
      expression: `JSON.stringify((function(){var m=$dataMap;if(!m) return null;return{parallaxName:m.parallaxName,parallaxShow:m.parallaxShow,scrollX:m.parallaxScrollX,scrollY:m.parallaxScrollY,loopX:m.parallaxLoopX,loopY:m.parallaxLoopY,tiles:function(){var c=0;for(var j=0;j<m.data.length;j++)if(m.data[j]>0)c++;return c}()};})())`,
      returnByValue: false
    });
    var d = JSON.parse(r.result.value);
    if(d && d.parallaxName && d.parallaxName.length>0) {
      parallaxMaps[id] = d;
    }
  }

  console.log('视差地图数:', Object.keys(parallaxMaps).length);
  var names = {};
  for(var id in parallaxMaps) {
    var d = parallaxMaps[id];
    names[d.parallaxName] = true;
    console.log(' Map' + id + ': parallax=' + d.parallaxName + ' show=' + d.parallaxShow + ' tiles=' + d.tiles);
  }

  // 导出视差图片
  var list = Object.keys(names);
  console.log('\n视差图片数:', list.length);

  for(var i=0;i<list.length;i++) {
    var name = list[i];
    process.stdout.write('[' + (i+1) + '/' + list.length + '] ' + name + ' ');

    var r2 = await Runtime.evaluate({
      expression: `
        (async function(){
          try {
            var bmp = ImageManager.loadParallax('${name.replace(/'/g, "\'")}');
            if(!bmp.isReady()) await new Promise(function(r){bmp.addLoadListener(function(){r();});});
            var c = document.createElement('canvas');
            c.width = bmp.width; c.height = bmp.height;
            var ctx = c.getContext('2d');
            if(bmp._image) ctx.drawImage(bmp._image, 0, 0);
            else if(bmp._canvas) ctx.drawImage(bmp._canvas, 0, 0);
            else return 'no_source';
            return c.toDataURL('image/png').split(',')[1];
          } catch(e) { return 'err:'+e.message; }
        })()
      `,
      awaitPromise: true,
      returnByValue: false
    });

    var v = r2.result.value;
    if(v && !v.startsWith('err:') && v !== 'no_source') {
      var safeName = name.replace(/[\/:*?"<>|]/g, '_');
      fs.writeFileSync('C:/Users/Muchen/maps/parallax_' + safeName + '.png', v, 'base64');
      process.stdout.write('OK\n');
    } else {
      process.stdout.write(v + '\n');
    }
  }

  client.close();
}
main().catch(e => { console.error(e); process.exit(1); });
