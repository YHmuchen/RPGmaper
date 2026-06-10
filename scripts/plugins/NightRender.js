/**
 * NightRender 插件
 * 标记插件：在管线上注册「夜间地图」步骤。
 * 实际行为已由 render-maps.js 的 --time 3 和 --bake 取代。
 */
module.exports = {
  name: 'NightRender',
  description: '夜间地图（已合并到 render-maps.js）',
  tags: ['night', 'global'],
  process: function() {},
};
