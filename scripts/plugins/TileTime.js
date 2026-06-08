/**
 * TileTime 插件
 * 根据时段（Variable 31）替换地图 tile，实现窗户等贴图昼夜变化。
 *
 * 支持的标签：无（由 TIME_VARIABLE_31 全局变量控制时段）
 *
 * 用法：
 *   渲染时通过环境变量设定时段：
 *     TIME_VAR_31=0 node scripts/render-maps.js   (朝)
 *     TIME_VAR_31=1 node scripts/render-maps.js   (昼)
 *     TIME_VAR_31=2 node scripts/render-maps.js   (夕)
 *     TIME_VAR_31=3 node scripts/render-maps.js   (夜)
 *
 * 配置：
 *   在 gameDir 下放一个 tiletime.json 文件定义替换规则：
 *   {
 *     "tilesets": {
 *       "<tileset名>": [
 *         { "day": <tileId>, "night": <tileId>, "evening": <tileId> }
 *       ]
 *     }
 *   }
 */

const fs = require('fs');
const path = require('path');

// 内置替换表（需按游戏配置）
// 格式: { 'tileset名': [ { day: tileId, night: tileId, evening: tileId } ] }
var BUILTIN_MAP = {};

function loadTileMap(gameDir) {
  var fp = path.join(gameDir, 'tiletime.json');
  if (fs.existsSync(fp)) {
    try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch(e) {}
  }
  return null;
}

module.exports = {
  name: 'TileTime',
  description: '根据时段替换地图 tile（窗户昼夜变化）',
  hook: 'mapStart',
  tags: ['TIME_VAR', 'tile', 'project:エニシアと契約紋'],

  process: function(ctx) {
    var gameDir = ctx.gameDir || global['PLUGIN_GAME_DIR'];
    if (!gameDir) return;

    var timeVar = global['TIME_VARIABLE_31'];
    if (timeVar === undefined || timeVar === null) return; // 未设时段，不处理

    // 加载 tile 替换规则
    var tileMap = loadTileMap(gameDir) || {};

    // 内置规则 > 外部配置
    var tsMaps = tileMap.tilesets || BUILTIN_MAP;

    // 需要 map 数据
    if (!ctx.map || !ctx.map.data) return;
    var map = ctx.map;
    var w = map.width, h = map.height;
    var data = map.data;

    // 获取地图使用的 tileset 名
    // 从渲染上下文读取 tilesetNames（由 render-maps.js 传入）
    var tsNames = ctx.tsNames || [];

    var timeKey = ['dawn', 'day', 'evening', 'night'][timeVar] || 'day';
    var totalReplaced = 0;

    // 遍历地图的 z0-z3 层
    for (var z = 0; z < 4; z++) {
      var base = z * h * w;
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var idx = base + y * w + x;
          var tid = data[idx];
          if (tid <= 0) continue;

          // 在替换表中查找
          for (var tsi = 0; tsi < tsNames.length; tsi++) {
            var tsName = tsNames[tsi];
            var rules = tsMaps[tsName];
            if (!rules) continue;

            for (var ri = 0; ri < rules.length; ri++) {
              var rule = rules[ri];
              if (rule.day === tid) {
                var replacement = rule[timeKey];
                if (replacement && replacement !== tid) {
                  data[idx] = replacement;
                  totalReplaced++;
                }
                break;
              }
            }
          }
        }
      }
    }

    if (totalReplaced > 0) {
      process.stdout.write('    TileTime: ' + totalReplaced + ' tiles replaced (time=' + timeKey + ')\n');
    }
  }
};
