// 修改 RPG Maker MV/MZ 游戏的 package.json，添加 CDP 远程调试端口
// 用法: node patch-cdp.js <游戏目录>

var fs = require('fs');
var path = require('path');
var gameDir = process.argv[2];

if (!gameDir) { console.error('用法: node patch-cdp.js <游戏目录>'); process.exit(1); }

var pkgPath = path.resolve(gameDir, 'package.json');
if (!fs.existsSync(pkgPath)) { console.log('package.json 不存在:', pkgPath); process.exit(0); }

var pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

// 添加 chromiun-args (NW.js 专属)
if (!pkg['chromium-args']) {
  pkg['chromium-args'] = '';
}

var args = pkg['chromium-args'];
if (args.indexOf('remote-debugging-port') < 0) {
  if (args.length > 0) args += ' ';
  args += '--remote-debugging-port=9222';
  pkg['chromium-args'] = args;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log('package.json 已更新: +chromium-args="' + args + '"');
} else {
  console.log('CDP 端口已配置，无需修改');
}
