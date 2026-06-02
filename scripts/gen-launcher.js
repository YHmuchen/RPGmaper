const fs = require('fs');
const path = require('path');

var mtoolBat = process.argv[2];
if (!mtoolBat || !fs.existsSync(mtoolBat)) {
  console.error('请将 mtool 的"与工具一同启动.bat"拖到 setup-launcher.bat 上');
  process.exit(1);
}

var content = fs.readFileSync(mtoolBat, 'utf8');
var gameDir = path.dirname(mtoolBat);
var lines = content.split('\n').map(function(l){return l.trim();});

var injectLine = lines.filter(function(l){return l.indexOf('inject.exe') >= 0;})[0] || '';
var nwLine = lines.filter(function(l){return l.indexOf('nw.exe') >= 0;})[0] || '';

var injectExe = extractPath(injectLine, 'inject.exe');
var mzHookDll = extractPath(injectLine, 'mzHook.dll');
var nwExe = extractPath(nwLine, 'nw.exe');
var nwArg = extractAfter(nwLine, 'nw.exe');

var PROJECT = path.resolve(__dirname, '..');

if (!injectExe || !mzHookDll) {
  console.error('无法从 mtool bat 中提取路径');
  process.exit(1);
}

var out = [];
out.push('@echo off');
out.push('chcp 65001 >nul');
out.push('title RPGmaper - 游戏 + mtool + CDP');
out.push('');
out.push('echo [1/4] 配置 CDP 远程调试端口...');
out.push('cd /d "' + gameDir + '"');
out.push('if exist "package.json" (');
out.push('  copy "package.json" "package.json.nocdp" /Y >nul');
out.push('  node "' + PROJECT + '\\scripts\\patch-cdp.js" "' + gameDir + '"');
out.push(')');
out.push('');
out.push('echo [2/4] 启动游戏...');
out.push('start "" "' + injectExe + '" "' + gameDir + '\\Game.exe" "' + mzHookDll + '"');
out.push('');
if (nwExe) {
  out.push('echo [3/4] 启动 mtool 界面...');
  out.push('start "" "' + nwExe + '" "' + nwArg + '"');
  out.push('');
}
out.push('echo [4/4] 启动地图监听...');
out.push('cd /d "' + PROJECT + '"');
out.push('node scripts\\watch-game.js');
out.push('');
out.push('echo.');
out.push('echo 游戏关闭后，执行 restore-cdp.bat 恢复 package.json');
out.push('pause');

fs.writeFileSync(path.resolve(PROJECT, 'launch.bat'), out.join('\r\n'));
console.log('已生成: launch.bat');

var restore = [];
restore.push('@echo off');
restore.push('chcp 65001 >nul');
restore.push('cd /d "' + gameDir + '"');
restore.push('if exist "package.json.nocdp" (');
restore.push('  move /Y "package.json.nocdp" "package.json" >nul');
restore.push('  echo package.json 已恢复');
restore.push(') else (');
restore.push('  echo 无需恢复');
restore.push(')');
restore.push('pause');

fs.writeFileSync(path.resolve(PROJECT, 'restore-cdp.bat'), restore.join('\r\n'));
console.log('已生成: restore-cdp.bat');

function extractPath(line, file) {
  var idx = line.indexOf(file);
  if (idx < 0) return null;
  var start = idx;
  while (start > 0 && line[start-1] !== '"' && line[start-1] !== ' ') start--;
  var end = idx + file.length;
  while (end < line.length && line[end] !== '"' && line[end] !== ' ') end++;
  return line.substring(start, end).replace(/"/g, '').trim();
}

function extractAfter(line, file) {
  var idx = line.indexOf(file);
  if (idx < 0) return '';
  var rest = line.substring(idx + file.length).trim();
  return rest.replace(/"/g, '').trim();
}
