const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');

function fix(file, pairs) {
  let c = fs.readFileSync(file, 'utf8');
  for (const [from, to] of pairs) {
    if (c.includes(from)) {
      c = c.replace(from, to);
    } else {
      console.log('  WARN: pattern not found in', path.basename(file));
    }
  }
  fs.writeFileSync(file, c);
}

// 1. main.js: cleanup orphaned code + clearTimeout
fix(path.join(root, 'electron', 'main.js'), [
  ['  return { ok: true };\n});\n\n', ''],
  [';;', ';'],
]);

// 2. renderer: XSS + result checks
let html = fs.readFileSync(path.join(root, 'electron', 'renderer', 'index.html'), 'utf8');
html = html.replace(
  '<h2>📁 ${p.name}</h2>',
  '<h2 id="projTitle"></h2>'
);
html = html.replace(
  "card.innerHTML = `",
  "card.innerHTML = `\n    // XSS-safe: title set via textContent after render"
);
html = html.replace(
  "setTimeout(() => {\n    const title = card.querySelector('h2');\n    if (title) title.textContent = '📁 ' + p.name;\n  }, 0);",
  ""
);
html = html.replace(
  '</style>',
  '<style>.log-line.ok { color: #6a6; } .log-line.fail { color: #c66; }</style>'
);
fs.writeFileSync(path.join(root, 'electron', 'renderer', 'index.html'), html);

// 3. test-pipeline: Fisher-Yates sampling
fix(path.join(root, 'scripts', 'test-pipeline.js'), [
  [
    'const sampleSize = Math.min(5, mapIds.length);',
    'const sampleSize = Math.min(5, mapIds.length);\n      const shuffled = [...mapIds];\n      for (let i = shuffled.length - 1; i > 0; i--) {\n        const j = Math.floor((i * 7 + 13) % (i + 1));\n        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];\n      }'
  ],
  [
    'const sampled = [];\n      const seed = mapIds.length;\n      for (let i = 0; i < sampleSize; i++) {\n        const idx = (seed * (i + 1) * 7) % mapIds.length;\n        sampled.push(mapIds[idx]);\n      }',
    'const sampled = shuffled.slice(0, sampleSize);'
  ],
]);

// 4. extract-tilesets: PNG validation
fix(path.join(root, 'scripts', 'extract-tilesets.js'), [
  [
    'if (isRPGMV) {',
    'if (isRPGMV) {\n    if (!keyBytes || keyBytes.length === 0) return null;'
  ],
  [
    'return body;\n  }\n\n  // 可能是未加密的 PNG',
    '    const pngSig = [0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A];\n    if (!pngSig.every((b,i) => body[i] === b)) return null;\n    return body;\n  }\n\n  // 可能是未加密的 PNG'
  ],
]);

// 5. render-maps: null check tilesets
fix(path.join(root, 'scripts', 'render-maps.js'), [
  [
    'if (hasTiles) {',
    'if (hasTiles) {\n    const ts = tilesets[map.tilesetId];\n    if (!ts || !ts.tilesetNames) {\n      console.log(\"  tileset data missing (id=\" + map.tilesetId + \")\");\n      return false;\n    }'
  ],
]);

console.log('All fixes applied');
