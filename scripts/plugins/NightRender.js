/**
 * NightRender 插件
 * 注册夜间地图渲染脚本。
 * 自动检测有蜡烛/窗户/辉光的地图，只渲染这些图的夜间版。
 *
 * 注册的脚本：
 *   night — node scripts/render-night-maps.js <游戏目录>
 */
module.exports = {
  name: 'NightRender',
  description: '自动检测并渲染夜间版地图',
  hook: 'mapEnd',
  tags: ['night', 'pipeline', 'global'],
  scripts: [
    { name: 'night', file: 'scripts/render-night-maps.js', label: '夜间地图' },
  ],
  pipeline: { after: 'maps' },

  process: function(ctx) {
    // mapEnd 钩子：渲染完成后可在此记录日志
    // 目前无操作（实际渲染由 render-night-maps.js 执行）
  }
};
