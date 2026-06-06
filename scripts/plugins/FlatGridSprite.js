/**
 * FlatGridSprite 插件
 * 将指定精灵图按平面网格（12列×8行）提取帧，而非标准 4×2 角色布局。
 * 适用于 SH_event_mark 等非标准排列的贴图（标记、图标、蜡烛等）。
 *
 * 在事件 note 中添加 <FlatGrid> 标签启用。
 * 用法示例：事件 note 中写入 <FlatGrid>
 * 渲染器会改用平面网格提取，characterIndex 直接选取 12×8 网格中对应格子。
 */
module.exports = {
  name: 'FlatGridSprite',
  description: '<FlatGrid> 平面网格提取（12列×8行）',
  hook: 'beforeSprite',
  tags: ['FlatGrid'],

  process: function(ev, ctx) {
    // 自动启用条件（满足其一即可）：
    //   1. note 中包含 <FlatGrid>
    //   2. 精灵名为 SH_event_mark 且 characterIndex 为 5（蜡烛/灯具）
    //   3. note 中包含 <TE:LampLittle>（已知灯具插件标签）
    if (ev.note && ev.note.includes('<FlatGrid>')) { ctx._flatGrid = true; return; }
    var name = ev.pages && ev.pages[0] && ev.pages[0].image && ev.pages[0].image.characterName || '';
    var idx = ev.pages && ev.pages[0] && ev.pages[0].image && ev.pages[0].image.characterIndex;
    if (name === 'SH_event_mark' && idx === 5) { ctx._flatGrid = true; return; }
    if (ev.note && ev.note.includes('<TE:LampLittle>')) { ctx._flatGrid = true; }
  }
};
