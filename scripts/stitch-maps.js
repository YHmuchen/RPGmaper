const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const PROJECT = path.resolve(__dirname, '..');
const MAPS_SRC = process.argv[2];
const TILE = 48;

async function main() {
  var DATA = JSON.parse(fs.readFileSync(PROJECT + '/maps/connections.json', 'utf8'));
  var TILES = JSON.parse(fs.readFileSync(PROJECT + '/maps/mapdata_with_names.json', 'utf8'));
  var offsets = DATA.offsets;
  var ids = Object.keys(offsets).map(Number);

  // 算全局边界
  var bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  var failed = 0;

  ids.forEach(function(id) {
    var t = TILES[id];
    if (!t) return;
    var off = DATA.offsets[id];
    var x1 = off.x, y1 = off.y;
    var x2 = off.x + t.w, y2 = off.y + t.h;
    if (x1 < bounds.minX) bounds.minX = x1;
    if (y1 < bounds.minY) bounds.minY = y1;
    if (x2 > bounds.maxX) bounds.maxX = x2;
    if (y2 > bounds.maxY) bounds.maxY = y2;
  });

  var globalW = (bounds.maxX - bounds.minX) * TILE;
  var globalH = (bounds.maxY - bounds.minY) * TILE;

  console.log('全局范围: ' + bounds.minX + ',' + bounds.minY + ' ~ ' + bounds.maxX + ',' + bounds.maxY);
  console.log('全局尺寸: ' + globalW + 'x' + globalH + 'px (' + ((globalW*globalH)/1000000).toFixed(0) + 'M px)');
  console.log('拼接 ' + ids.length + ' 张地图\n');

  // 准备叠加图层
  var composites = [];
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var t = TILES[id];
    var off = DATA.offsets[id];
    if (!t || !off) continue;

    var px = (off.x - bounds.minX) * TILE;
    var py = (off.y - bounds.minY) * TILE;
    var f = MAPS_SRC + '/Map' + String(id).padStart(4, '0') + '.png';

    if (!fs.existsSync(f)) {
      process.stdout.write('Map' + id + ' 文件不存在\n');
      failed++;
      continue;
    }

    var stat = fs.statSync(f);
    if (stat.size < 100) {
      process.stdout.write('Map' + id + ' 文件过小 (' + stat.size + 'B), 跳过\n');
      failed++;
      continue;
    }

    composites.push({
      input: f,
      top: py,
      left: px
    });

    process.stdout.write('Map' + id + ' @ ' + px + ',' + py + ' (' + t.w + 'x' + t.h + ')\n');
  }

  if (composites.length === 0) {
    console.log('没有可拼接的地图');
    return;
  }

  console.log('\n开始合成...');
  var bg = await sharp({
    create: {
      width: globalW,
      height: globalH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  }).png().toBuffer();

  var result = await sharp(bg)
    .composite(composites)
    .png()
    .toBuffer();

  var outPath = MAPS_SRC + '/seamless.png';
  fs.writeFileSync(outPath, result);
  var mb = (result.length / 1024 / 1024).toFixed(1);
  console.log('\n完成! ' + (ids.length - failed) + ' 张拼接, 输出: ' + outPath + ' (' + mb + 'MB)');
}

main().catch(e => { console.error(e); process.exit(1); });
