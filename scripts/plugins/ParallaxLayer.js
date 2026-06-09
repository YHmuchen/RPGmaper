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
  tags: ['PLM', 'PLM_Blend', 'project:3'],

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
      var fileName = m[1];
      // 防止路径穿越：只允许字母数字、下划线、连字符、点
      if (!/^[\w.\-]+$/.test(fileName)) continue;
      layers.push({
        file: fileName,
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

        // ── 按时段透明度将 PLM 图层合入最终渲染图 ──
        // 时段因子：昼=0（不显示）、夕方=0.35、夜=1.0
        var _tv = global['TIME_VARIABLE_31'];
        var timeFactor = (_tv === 3) ? 1.0 : 0;
        if (timeFactor > 0) try {
          var compositeOps = [];
          for (var ci = 0; ci < layers.length; ci++) {
            var cl = layers[ci];
            var clPath = path.join(plmDir, cl.file + '.png');
            if (!fs.existsSync(clPath)) continue;
            var blendMode = cl.blend === 1 ? 'add' : (cl.blend === 3 ? 'multiply' : 'over');
            compositeOps.push({
              input: clPath,
              blend: blendMode,
              opacity: ((cl.opacity || 255) / 255) * timeFactor,
            });
          }
          if (compositeOps.length > 0 && ctx.outputPath) {
            try {
              var imgBuf = await sharp(ctx.outputPath).composite(compositeOps).png().toBuffer();
              fs.writeFileSync(ctx.outputPath, imgBuf);
                          } catch(ce2) { console.error('[PLM DEBUG] composite ERROR:', ce2.message); }
          }
        } catch(ce) {
          console.error("[ParallaxLayer] PLM composite failed:", ce.message);
        }

        // ── 叠加 MapTone 色调（基于 MAPTYPE 和时段） ──
        var mapNote = ctx.map && ctx.map.note || "";
        var mapType = (mapNote.match(/<MAPTYPE:\s*(\w+)\s*>/) || [])[1] || "";
        if (mapType) {
          var toneMap = {
            INSIDE:         { 0: [0,0,0,0], 1: [0,0,0,0], 2: [0,0,0,0], 3: [-68,-68,0,68] },
            OUTSIDE:        { 0: [0,0,0,0], 1: [0,0,0,0], 2: [17,-34,-34,0], 3: [-68,-68,0,34] },
            OUTSIDE_TOWN:   { 0: [0,0,0,0], 1: [0,0,0,0], 2: [17,-34,-34,0], 3: [-68,-68,0,34] },
            INSIDE_WINDOW:  { 0: [0,0,0,0], 1: [0,0,0,0], 2: [17,-34,-34,0], 3: [-68,-68,0,34] },
          };
          var tone = (toneMap[mapType] || {})[_tv];
          if (tone && tone.some(function(v){return v!==0;})) {
            try {
              var rOff = tone[0], gOff = tone[1], bOff = tone[2], grayAmt = (tone[3]||0) / 255;
              var raw = await sharp(ctx.outputPath).raw().toBuffer();
              var meta2 = await sharp(ctx.outputPath).metadata();
              var w2 = meta2.width, h2 = meta2.height;
              for (var ti = 0; ti < raw.length; ti += 4) {
                var cr = raw[ti] + rOff, cg = raw[ti+1] + gOff, cb = raw[ti+2] + bOff;
                cr = cr < 0 ? 0 : (cr > 255 ? 255 : cr);
                cg = cg < 0 ? 0 : (cg > 255 ? 255 : cg);
                cb = cb < 0 ? 0 : (cb > 255 ? 255 : cb);
                if (grayAmt > 0) {
                  var gv = (cr + cg + cb) / 3;
                  cr += (gv - cr) * grayAmt;
                  cg += (gv - cg) * grayAmt;
                  cb += (gv - cb) * grayAmt;
                }
                raw[ti] = Math.round(cr);
                raw[ti+1] = Math.round(cg);
                raw[ti+2] = Math.round(cb);
              }
              await sharp(raw, { raw: { width: w2, height: h2, channels: 4 } }).png().toFile(ctx.outputPath);
            } catch(te) { console.error("[ParallaxLayer] MapTone apply failed:", te.message); }
        }
        }
      }
    } catch(e) {
      // 保存失败则跳过
    }
  }
};
