/**
 * MapTone 插件
 * 模拟 CE#16 マップ色調 的全局色调系统。
 * 在查看器中添加「时段」下拉框（昼/夕方/夜），
 * 根据地图 MAPTYPE 和时段自动应用 RM 色调公式。
 *
 * 注意：本插件在 project-manager 中开关，实际逻辑在 viewer 端执行。
 * 仅在 エニシアと契約紋 项目中生效。
 */
module.exports = {
  name: 'MapTone',
  description: 'CE#16 全局色调模拟（昼/夕方/夜，查看器专用）',
  hook: 'mapStart',
  tags: ['MAPTYPE', '色调', 'CE16', 'project:2'],

  process: function(/* unused */) {
    // 查看器端执行，渲染管线无操作
  }
};
