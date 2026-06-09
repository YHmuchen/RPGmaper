/**
 * TileTime.js — <TE上書き> 时段 tile 替换
 *
 * 根据 Variable 31（時間帯）替换事件 tile 为对应的时段版本：
 *   - INSIDE_WINDOW  : tileId += 1（B tileset 右移一列 → 夜间窗）
 *   - INSIDE_WINDOWLIGHT : tileId = 0（夜间隐藏辉光）
 *
 * 时段: 0=朝, 1=昼, 2=夕, 3=夜
 * 环境变量: TIME_VAR_31（默认 1=昼）
 *   export TIME_VAR_31=3 && node scripts/render-maps.js <游戏目录> 地图ID
 */
module.exports = {
  name: 'TileTime',
  description: '根据时段替换地图 tile（窗户昼夜变化）',
  hook: 'mapStart',
  tags: ['TIME_VAR', 'tile', 'project:2'],

  process: function(ctx) {
    var map = ctx.map;
    if (!map || !map.events) return;

    // 读时段: 0=朝 1=昼 2=夕 3=夜
    var timeVar = global['TIME_VARIABLE_31'];
    if (timeVar === undefined || timeVar === null) timeVar = 1;

    // 白天不做窗口替换
    if (timeVar < 3) return;

    for (var eid in map.events) {
      var ev = map.events[eid];
      if (!ev || !ev.note) continue;
      if (ev.note.indexOf('<TE上書き>') === -1) continue;

      var isLight = ev.note.indexOf('INSIDE_WINDOWLIGHT') !== -1;
      var isWindow = !isLight && ev.note.indexOf('INSIDE_WINDOW') !== -1;
      if (!isWindow && !isLight) continue;

      // 修改 page 0 的 tile（渲染器默认用 page 0）
      var page = ev.pages && ev.pages[0];
      if (!page || !page.image) continue;
      var img = page.image;

      if (isLight) {
        // 夜间隐藏辉光
        if (img.tileId > 0) {
          img._originalTileId = img.tileId;
          img.tileId = 0;
        }
      } else if (isWindow && img.tileId > 0) {
        // B tileset 中右移一列（+1）得到夜间版本
        img._originalTileId = img.tileId;
        img.tileId += 1;
      }
    }
  }
};
