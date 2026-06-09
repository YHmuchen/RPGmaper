/**
 * night-toggle.js — 查看器时段切换插件
 *
 * 在工具栏添加「时段」下拉框，切换白天/夜间显示。
 * 依赖：viewer.html 的 _showNight、_nightImg、drawMap()
 */
(function() {
  registerViewerPlugin({
    name: 'NightToggle',
    hook: 'timeChange',
    ui: [
      {
        type: 'select',
        target: 'toolbar',
        label: '时段',
        options: [
          { value: 'day', label: '昼' },
          { value: 'evening', label: '夕方' },
          { value: 'night', label: '夜' },
        ],
        defaultValue: localStorage.getItem('rpgmaper_time') || 'day',
        onChange: function(val) {
          _timePeriod = val;
          _showNight = (val === 'night');
          localStorage.setItem('rpgmaper_time', _timePeriod);
          drawMap();
          drawGrid();
          fireViewerHook('timeChange', { period: val });
          if (typeof applyMapTone === 'function') applyMapTone();
        },
      },
    ],
    process: function(ctx) {},
  });
})();