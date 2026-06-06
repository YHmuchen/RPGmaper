/**
 * TemplateEvent 插件
 * 模拟 TemplateEvent.js 的行为：将 <TE:名称> 标签替换为
 * Map001 中同名模板事件的精灵图。
 *
 * 目前支持：<TE:LampLittle> → !fsm_Flame09（蜡烛火焰）
 * 可根据需要扩展。
 */
const fs = require('fs');
const path = require('path');

// 模板缓存
var _templateCache = null;

function loadTemplates(gameDir) {
  if (_templateCache) return _templateCache;
  try {
    var p = path.join(gameDir, 'data', 'Map001.json');
    var raw = fs.readFileSync(p, 'utf8').replace(/^﻿/, '');
    var map = JSON.parse(raw);
    var result = {};
    if (map && map.events) {
      for (var eid in map.events) {
        var ev = map.events[eid];
        if (ev && ev.name && ev.pages && ev.pages[0]) {
          result[ev.name] = ev;
        }
      }
    }
    _templateCache = result;
    return result;
  } catch (e) {
    // 如果读不到 Map001 就不做替换
    return {};
  }
}

module.exports = {
  name: 'TemplateEvent',
  description: '模拟 <TE:名称> 模板事件替换',
  hook: 'beforeSprite',
  tags: ['TE'],

  process: function(ev, ctx) {
    if (!ev.note) return;
    // 匹配 <TE:模板名>
    var m = ev.note.match(/<TE:(\w+)>/);
    if (!m) return;
    var templateName = m[1];
    // 获取游戏目录（由 render-maps.js 在加载时设置的全局变量）
    var gameDir = global['PLUGIN_GAME_DIR'];
    if (!gameDir) return;

    var templates = loadTemplates(gameDir);
    var tmpl = templates[templateName];
    if (!tmpl || !tmpl.pages || !tmpl.pages[0]) return;

    // 如果原事件已有真实精灵（非占位符），不替换视觉（只替换行为）
    var origImg = ev.pages && ev.pages[0] && ev.pages[0].image;
    if (origImg) {
      var origName = origImg.characterName || '';
      var PLACEHOLDER_SPRITES = ['SH_event_mark'];
      var isPlaceholder = PLACEHOLDER_SPRITES.includes(origName);
      var hasRealSprite = origName.length > 0 && !isPlaceholder;
      if (hasRealSprite) return; // 保留原精灵，模板只改行为
    }

    // 用模板的 page 0 图像替换当前事件的图像
    var tmplImg = tmpl.pages[0].image;
    if (!tmplImg) return;
    // 只替换有实际精灵图的模板（空字符或 tileId=0 且无 charName 的不算）
    var hasSprite = tmplImg.characterName && tmplImg.characterName.length > 0;
    var hasTile = tmplImg.tileId && tmplImg.tileId > 0;
    if (!hasSprite && !hasTile) return;

    // 将替换信息存入 ctx，渲染器会重新提取帧
    ctx._templateImage = {
      characterName: tmplImg.characterName || '',
      characterIndex: tmplImg.characterIndex || 0,
      direction: tmplImg.direction || 2,
      pattern: tmplImg.pattern || 1,
    };
  }
};
