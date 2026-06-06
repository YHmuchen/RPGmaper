/**
 * ParallaxLayer 插件
 * 处理事件 note 中的 <PLM:file> 标签，将视差图层保存为单独文件，
 * 在查看器中可通过「特效」开关控制显示。
 *
 * 支持的标签：
 *   <PLM:文件名>        img/parallaxes/文件名.png_ 的视差图
 *   <PLM_Blend:N>      混合模式（1=加算, 2=正常alpha, 3=乗算）
 *   <PLM_Opacity:N>    不透明度（0-255，默认255）
 *
 * 输出文件：
 *   maps/MapXXXX_plm/light.png → 单图层文件（保持原图尺寸，不拉伸）
 *   maps/MapXXXX_plm/info.json → 图层元数据（blend, opacity, 原图尺寸）
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

module.exports = {
  name: 'ParallaxLayer',
  description: '<PLM:file> 视差图层（可开关）',
  hook: 'postRender',
  tags: ['PLM', 'PLM_Blend'],

  process: async function(ctx) {
    var gameDir = ctx.gameDir;
    var map = ctx.map;
    var outDir = ctx.outDir;
    if (!map || !map.events) return;

    // 扫描所有事件的 note，收集 PLM 标签
    var layers = [];
    for (var eid in map.events) {
      var ev = map.events[eid];
      if (!ev || !ev.note) continue;
      var m = ev.note.match(/<PLM:([^>]+)>/);
      if (!m) continue;
      var blendMatch = ev.note.match(/<PLM_Blend:\s*(\d+)\s*>/);
      var opaMatch = ev.note.match(/<PLM_Opacity:\s*(\d+)\s*>/);
      layers.push({
        file: m[1],
        blend: blendMatch ? parseInt(blendMatch[1], 10) : 0,
        opacity: opaMatch ? parseInt(opaMatch[1], 10) : 255,
      });
    }

    if (layers.length === 0) return;

    var mapId = String(ctx.mapId).padStart(4, '0');
    var plmDir = path.join(outDir, 'Map' + mapId + '_plm');

    try {
      if (!fs.existsSync(plmDir)) fs.mkdirSync(plmDir, { recursive: true });

      // 逐层处理：获取原图尺寸，保存 PNG（不拉伸）
      var meta = [];
      for (var i = 0; i < layers.length; i++) {
        var layer = layers[i];
        var fp = path.join(gameDir, 'img', 'parallaxes', layer.file + '.png_');
        if (!fs.existsSync(fp)) continue;

        var raw = fs.readFileSync(fp);
        var h = Array.from(new Uint8Array(raw.slice(0, 16)));
        var ex = [0x52,0x50,0x47,0x4d,0x56,0,0,0,0,0x03,0x01,0,0,0,0,0];
        var isEnc = h.length === 16 && h.every(function(b,i){return b===ex[i]});
        var imgBuf = isEnc ? Buffer.from(raw.slice(16)) : raw;
        if (isEnc) {
          var key = global['PLUGIN_ENC_KEY'] || [];
          for (var j = 0; j < 16 && j < imgBuf.length; j++) imgBuf[j] ^= (key[j] || 0);
        }

        // 获取原图尺寸
        var imgMeta = await sharp(imgBuf).metadata();
        meta.push({ file: layer.file, blend: layer.blend, opacity: layer.opacity, width: imgMeta.width, height: imgMeta.height });

        // 保持原图尺寸，不拉伸，左对齐放置
        await sharp(imgBuf).png().toFile(path.join(plmDir, layer.file + '.png'));
      }

      if (meta.length > 0) {
        fs.writeFileSync(path.join(plmDir, 'info.json'), JSON.stringify(meta, null, 2), 'utf8');
      }
    } catch(e) {
      // 保存失败则跳过
    }
  }
};
