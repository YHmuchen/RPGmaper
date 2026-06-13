/**
 * MapTree 插件 — 层级地图下拉框（查看器全局插件）
 *
 * 将查看器的扁平地图下拉框按 MapInfos.json 的 parentId/order 构建为树状结构，
 * 用缩进显示父子层级关系（类似 mtool 风格）。
 *
 * tags: ['map-tree', 'global'], type: 'viewer'
 */
(function() {
  // ─── Node.js 侧（渲染管线用，用于插件管理系统展示） ──────────
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      name: 'MapTree',
      description: '层级地图下拉框（查看器全局插件）',
      type: 'viewer',
      tags: ['map-tree', 'global'],
      hook: '',
      process: function() {},
    };
    return; // Node 侧不需要执行浏览器代码
  }

  // ─── 浏览器侧（查看器用） ────────────────────────────────────
  function waitAndRegister() {
    if (typeof registerViewerPlugin === 'function') {
      registerViewerPlugin({
        name: 'MapTree',
        description: '层级地图下拉框（按 parentId 分组显示）',
        hook: 'pluginsLoaded',
        process: function() {
          addToggleButton();
          rebuildMapTree();
        },
      });
    } else {
      setTimeout(waitAndRegister, 50);
    }
  }
  waitAndRegister();

  // ─── 工具栏切换按钮 ─────────────────────────────────────────
  function addToggleButton() {
    if (document.getElementById('mapTreeToggle')) return;
    var sel = document.getElementById('mapSelect');
    if (!sel || !sel.parentNode) return;
    var btn = document.createElement('button');
    btn.id = 'mapTreeToggle';
    btn.textContent = localStorage.getItem('mapTree_mode') !== 'false' ? '🌳' : '📋';
    btn.title = '切换地图列表模式（树状/扁平）';
    btn.style.cssText = 'padding:2px 8px;font-size:12px;background:#3a3a3a;border:none;border-radius:4px;color:#aaa;cursor:pointer;margin-right:4px;';
    btn.onclick = function() {
      var cur = localStorage.getItem('mapTree_mode');
      var nxt = cur === 'false' ? 'true' : 'false';
      localStorage.setItem('mapTree_mode', nxt);
      btn.textContent = nxt !== 'false' ? '🌳' : '📋';
      rebuildMapTree();
    };
    sel.parentNode.insertBefore(btn, sel);
  }

  // ─── 树构建 ─────────────────────────────────────────────────
  function buildTree(raw, list) {
    var mapById = {};
    for (var i = 1; i < raw.length; i++) {
      if (raw[i]) {
        mapById[i] = {
          id: i,
          name: raw[i].name || ('Map' + i),
          parentId: raw[i].parentId || 0,
          order: raw[i].order || 0,
          children: [],
        };
      }
    }
    if (list) {
      list.forEach(function(m) {
        if (mapById[m.id]) {
          mapById[m.id].w = m.w;
          mapById[m.id].h = m.h;
        }
      });
    }
    var roots = [];
    for (var id in mapById) {
      var entry = mapById[id];
      var pid = Number(entry.parentId);
      if (pid > 0 && mapById[pid]) {
        mapById[pid].children.push(entry);
      } else {
        roots.push(entry);
      }
    }
    (function sort(arr) {
      arr.sort(function(a, b) { return a.order - b.order; });
      arr.forEach(function(n) { sort(n.children); });
    })(roots);
    return roots;
  }

  // ─── 展平为选项列表 ────────────────────────────────────────
  function flattenTree(roots) {
    var result = [];
    function walk(arr, depth) {
      arr.forEach(function(entry) {
        result.push({ id: entry.id, depth: depth, name: entry.name, w: entry.w, h: entry.h });
        walk(entry.children, depth + 1);
      });
    }
    walk(roots, 0);
    return result;
  }

  // ─── 重建下拉框 ────────────────────────────────────────────
  function rebuildMapTree() {
    var raw = window.MAP_INFOS_RAW;
    var list = MAP_LIST;
    if (!raw || !list || !list.length) return;

    var sel = document.getElementById('mapSelect');
    if (!sel) return;

    var currentVal = sel.value;

    // 检查是否启用树状模式（独立 key，与插件启用/禁用互不干扰）
    if (localStorage.getItem('mapTree_mode') === 'false') {
      // ── 扁平模式 ──
      sel.options.length = 0;
      list.forEach(function(m) {
        sel.options[sel.options.length] = new Option(
          'Map' + m.id + ' (' + m.w + '×' + m.h + ')',
          String(m.id)
        );
      });
    } else {
      // ── 树状模式 ──
      var roots = buildTree(raw, list);
      var flat = flattenTree(roots);
      if (!flat.length) return;

      sel.options.length = 0;
      flat.forEach(function(item) {
        var indent = '';
        for (var i = 0; i < item.depth; i++) indent += '　　';
        var prefix = item.depth > 0 ? '└ ' : '';
        var mapIdStr = 'Map' + item.id;
        var sizeInfo = item.w ? ' ' + item.w + '×' + item.h : '';
        var label = indent + prefix + item.name + ' (' + mapIdStr + sizeInfo + ')';
        sel.options[sel.options.length] = new Option(label, String(item.id));
      });
    }

    if (currentVal) {
      sel.value = currentVal;
    } else if (list.length > 0) {
      sel.value = String(list[0].id);
    }
  }
})();
