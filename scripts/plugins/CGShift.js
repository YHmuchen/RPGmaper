/**
 * CGShift 插件
 * 解析事件 note 中的 <CGシフト:A,X,Y> 标签，对精灵做像素偏移。
 * 来自 VisuStella 或类似插件的事件备注。
 */
module.exports = {
  name: 'CGShift',
  description: '<CGシフト:A,X,Y> 像素偏移',
  hook: 'eventSprite',
  tags: ['CGシフト', 'project:2'],

  process: function(ev, ctx) {
    if (!ev.note) return;
    var m = ev.note.match(/<CGシフト:A,\s*([-\d]+),\s*([-\d]+)\s*>/);
    if (m) {
      ctx.shiftX = (ctx.shiftX || 0) + (parseInt(m[1], 10) || 0);
      ctx.shiftY = (ctx.shiftY || 0) + (parseInt(m[2], 10) || 0);
    }
  }
};
