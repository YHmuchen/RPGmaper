/**
 * RPGmaper API Server
 * 提供地图关系数据和布局的 HTTP 接口，方便调试和外部工具接入。
 *
 * 用法: node scripts/api-server.js [端口号]
 *       默认端口 3456
 *
 * 接口:
 *   GET /api/projects                         → 项目列表
 *   GET /api/graph/:projectName               → 全量关系图
 *   GET /api/graph/:projectName/:mapId        → 一代关系子图
 *   GET /api/layout/:projectName/:mapId       → 一代布局（含 tile 位置、连线）
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2]) || 3456;
const TILE = 48;
const PROJECTS_DIR = path.resolve(__dirname, '..', 'maps', 'projects');

// ─── 工具 ─────────────────────────────────────────────────────
function readJSON(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
  const m = raw.match(/var TRANSFERS_ALL = (\{[\s\S]*?\});\s*$/);
  if (!m) return null;
  return JSON.parse(m[1]);
}

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

// 从 PNG 文件头读取图片尺寸（不加载全图）
function getPngSize(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(24);
    fs.readSync(fd, buf, 0, 24, 0);
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
  } catch (e) {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  return null;
}

function getMapDims(projectName, mapId) {
  const imgPath = path.join(PROJECTS_DIR, projectName, 'maps',
    'Map' + String(mapId).padStart(4, '0') + '.png');
  const size = getPngSize(imgPath);
  if (size) return { tw: Math.round(size.w / TILE), th: Math.round(size.h / TILE) };
  return null;
}

// ─── 构建邻接表 ──────────────────────────────────────────────
function buildGraph(transfers) {
  const adj = {};
  const tiles = {};
  for (const srcIdStr in transfers) {
    const srcId = Number(srcIdStr);
    const list = transfers[srcId];
    if (!list || !list.length) continue;
    if (!adj[srcId]) adj[srcId] = { out: new Set(), in: new Set() };
    tiles[srcId] = [];
    for (const tr of list) {
      if (tr.source && tr.source.indexOf('commonEvent') === 0) continue;
      const tid = tr.tid;
      if (!adj[tid]) adj[tid] = { out: new Set(), in: new Set() };
      adj[srcId].out.add(tid); adj[tid].in.add(srcId);
      tiles[srcId].push({ fx: tr.fx, fy: tr.fy, tid, tx: tr.tx, ty: tr.ty });
    }
  }
  const result = {};
  for (const id in adj)
    result[id] = { out: [...adj[id].out], in: [...adj[id].in], tiles: tiles[id] || [] };
  return result;
}

function oneHopSub(adj, mapId) {
  const center = adj[mapId];
  if (!center) return null;
  const keep = new Set([Number(mapId)]);
  for (const id of center.out) keep.add(id);
  for (const id of center.in) keep.add(id);
  const sub = {};
  for (const id of keep) {
    const a = adj[id]; if (!a) continue;
    sub[id] = {
      out: a.out.filter(n => keep.has(n)),
      in: a.in.filter(n => keep.has(n)),
      tiles: a.tiles.filter(t => keep.has(t.tid)),
    };
  }
  return sub;
}

// ─── 布局计算（镜像 graph viewer 的 layout 逻辑） ──────────
function computeLayout(projectName, mapId) {
  const filePath = path.join(PROJECTS_DIR, projectName, 'transfers_data.js');
  if (!fs.existsSync(filePath)) return null;
  const transfers = readJSON(filePath);
  if (!transfers) return null;
  const adj = buildGraph(transfers);
  const sub = oneHopSub(adj, mapId);
  if (!sub) return null;

  // 读取地图尺寸
  const dims = {};
  for (const id in sub) {
    const d = getMapDims(projectName, id) || { tw: 17, th: 13 };
    dims[id] = d;
  }

  const ci = dims[mapId];
  const ids = Object.keys(sub).map(Number);
  const nbrs = ids.filter(id => id !== Number(mapId));

  // 方向计算
  const dirs = {};
  for (const nid of nbrs) {
    const nb = sub[nid];
    let sx = 0, sy = 0, n = 0;
    for (const tr of (sub[mapId]?.tiles || []).filter(t => t.tid === nid)) {
      sx += tr.fx / ci.tw - 0.5; sy += tr.fy / ci.th - 0.5; n++;
    }
    for (const tr of (nb?.tiles || []).filter(t => t.tid === Number(mapId))) {
      sx += tr.tx / ci.tw - 0.5; sy += tr.ty / ci.th - 0.5; n++;
    }
    if (n === 0) { sx = 1; sy = 0; }
    const len = Math.sqrt(sx*sx + sy*sy) || 1;
    dirs[nid] = { dx: sx/len, dy: sy/len };
  }

  // 位置（tile 坐标）
  const gap = 1.5;
  const pos = {};
  pos[mapId] = { tx: 0, ty: 0, tw: ci.tw, th: ci.th };

  for (const nid of nbrs) {
    const ni = dims[nid];
    const d = dirs[nid];
    let edir;
    if (Math.abs(d.dx) > Math.abs(d.dy)) edir = d.dx > 0 ? 'R' : 'L';
    else edir = d.dy > 0 ? 'B' : 'T';

    let ntx, nty;
    if (edir === 'R') {
      ntx = ci.tw + gap;
      nty = ci.th * 0.5 - ni.th / 2;
    } else if (edir === 'L') {
      ntx = -ni.tw - gap; nty = ci.th * 0.5 - ni.th / 2;
    } else if (edir === 'B') {
      nty = ci.th + gap; ntx = ci.tw * 0.5 - ni.tw / 2;
    } else {
      nty = -ni.th - gap; ntx = ci.tw * 0.5 - ni.tw / 2;
    }
    pos[nid] = { tx: Math.round(ntx), ty: Math.round(nty), tw: ni.tw, th: ni.th };
  }

  // 防重叠
  for (let p = 0; p < 10; p++) {
    let moved = false;
    for (let i = 0; i < nbrs.length; i++) {
      for (let j = i + 1; j < nbrs.length; j++) {
        const a = pos[nbrs[i]], b = pos[nbrs[j]];
        if (!a || !b) continue;
        if (a.tx < b.tx + b.tw && a.tx + a.tw > b.tx && a.ty < b.ty + b.th && a.ty + a.th > b.ty) {
          const acx = a.tx + a.tw/2, acy = a.ty + a.th/2;
          const bcx = b.tx + b.tw/2, bcy = b.ty + b.th/2;
          let dx = bcx - acx, dy = bcy - acy;
          if (dx === 0 && dy === 0) dx = 1;
          const len = Math.sqrt(dx*dx + dy*dy);
          const push = Math.min(a.tw, a.th, b.tw, b.th) * 0.3 + 1;
          a.tx -= (dx/len)*push; a.ty -= (dy/len)*push;
          b.tx += (dx/len)*push; b.ty += (dy/len)*push;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  for (const id of ids) if (pos[id]) { pos[id].tx = Math.round(pos[id].tx); pos[id].ty = Math.round(pos[id].ty); }

  // 连线（传送点→传送点）
  const connections = [];
  for (const nid of nbrs) {
    const sp = pos[mapId], tp = pos[nid];
    if (!sp || !tp) continue;
    for (const tr of (sub[mapId]?.tiles || []).filter(t => t.tid === nid)) {
      // 源传送点（tile 坐标）
      const sTx = sp.tx + tr.fx + 0.5;
      const sTy = sp.ty + tr.fy + 0.5;
      // 目标传送点
      const match = (sub[nid]?.tiles || []).filter(t => t.tid === Number(mapId) && t.tx === tr.fx && t.ty === tr.fy);
      let tTx, tTy, bidirectional = false;
      if (match.length > 0) {
        tTx = tp.tx + match[0].fx + 0.5;
        tTy = tp.ty + match[0].fy + 0.5;
        bidirectional = true;
      } else {
        tTx = tp.tx + tp.tw / 2; tTy = tp.ty + tp.th / 2;
      }
      // 出口/入口方向 + 完整 tile 路径
      const sDir = nearestDir(tr.fx / sp.tw, tr.fy / sp.th);
      const tDir = match.length > 0 ? nearestDir(match[0].fx / tp.tw, match[0].fy / tp.th) : null;
      const pathTiles = buildPath(sp, tp, tr, match.length > 0 ? match[0] : null, sDir, tDir);
      connections.push({
        from: { mapId: Number(mapId), tile: { fx: tr.fx, fy: tr.fy }, cx: sTx, cy: sTy, exitDir: sDir },
        to: { mapId: nid, tile: match.length > 0 ? { fx: match[0].fx, fy: match[0].fy } : null, cx: tTx, cy: tTy, entryDir: tDir },
        bidirectional,
        pathTiles,
      });
    }
  }

  return {
    centerId: Number(mapId),
    maps: pos,
    dims,
    connections,
    pixelScale: null, // 由前端按窗口计算
    tileSize: TILE,
  };
}

function nearestDir(rx, ry) {
  const opts = [
    { d: rx, dir: 'left', ox: -1, oy: 0 },
    { d: 1 - rx, dir: 'right', ox: 1, oy: 0 },
    { d: ry, dir: 'top', ox: 0, oy: -1 },
    { d: 1 - ry, dir: 'bottom', ox: 0, oy: 1 },
  ];
  const best = opts.reduce((a, b) => a.d < b.d ? a : b);
  return best.dir;
}

// 计算连线经过的完整 tile 路径
function buildPath(sp, tp, tr, match, sDir, tDir) {
  const sx = sp.tx + tr.fx + 0.5, sy = sp.ty + tr.fy + 0.5;
  let ex, ey;
  if (sDir === 'left') { ex = sp.tx; ey = sy; }
  else if (sDir === 'right') { ex = sp.tx + sp.tw; ey = sy; }
  else if (sDir === 'top') { ex = sx; ey = sp.ty; }
  else { ex = sx; ey = sp.ty + sp.th; }
  const tTx = match ? tp.tx + match.fx + 0.5 : tp.tx + tp.tw/2;
  const tTy = match ? tp.ty + match.fy + 0.5 : tp.ty + tp.th/2;
  let enx, eny;
  if (!tDir) { enx = tp.tx+tp.tw/2; eny = tp.ty+tp.th/2; }
  else if (tDir === 'left') { enx = tp.tx; eny = tTy; }
  else if (tDir === 'right') { enx = tp.tx+tp.tw; eny = tTy; }
  else if (tDir === 'top') { enx = tTx; eny = tp.ty; }
  else { enx = tTx; eny = tp.ty+tp.th; }
  let mx, my;
  if (sDir === 'left' || sDir === 'right') { mx = enx; my = ey; }
  else { mx = ex; my = eny; }
  const tiles = new Set();
  function seg(x1,y1,x2,y2) {
    if (y1===y2) for(let x=Math.floor(Math.min(x1,x2));x<=Math.ceil(Math.max(x1,x2))-1;x++) tiles.add(x+','+Math.floor(y1));
    else for(let y=Math.floor(Math.min(y1,y2));y<=Math.ceil(Math.max(y1,y2))-1;y++) tiles.add(Math.floor(x1)+','+y);
  }
  seg(sx,sy,ex,ey); seg(ex,ey,mx,my); seg(mx,my,enx,eny); seg(enx,eny,tTx,tTy);
  return [...tiles].map(k=>{const[x,y]=k.split(',').map(Number);return{x,y};}).sort((a,b)=>a.y-b.y||a.x-b.x);
}

// ─── 路由 ─────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const parts = url.pathname.split('/').filter(Boolean);

  try {
    // GET /api/projects
    if (parts[0] === 'api' && parts[1] === 'projects' && !parts[2]) {
      const projects = [];
      if (fs.existsSync(PROJECTS_DIR)) {
        for (const name of fs.readdirSync(PROJECTS_DIR)) {
          const dir = path.join(PROJECTS_DIR, name);
          if (!fs.statSync(dir).isDirectory()) continue;
          const hasTransfers = fs.existsSync(path.join(dir, 'transfers_data.js'));
          projects.push({ name, hasTransfers });
        }
      }
      return json(res, 200, { ok: true, data: projects });
    }

    // GET /api/graph/… and GET /api/layout/…
    const isLayout = parts[0] === 'api' && parts[1] === 'layout';
    const isGraph = parts[0] === 'api' && parts[1] === 'graph';

    if (isLayout || isGraph) {
      if (!parts[2]) return json(res, 400, { ok: false, error: '缺少项目名称' });
      const rawName = decodeURIComponent(parts[2]);
      const projectName = path.basename(rawName);
      if (projectName !== rawName || projectName === '.' || projectName === '..')
        return json(res, 400, { ok: false, error: '非法的项目名称' });
      const filePath = path.join(PROJECTS_DIR, projectName, 'transfers_data.js');
      if (!fs.existsSync(filePath)) {
        return json(res, 404, { ok: false, error: '未找到项目或传送数据' });
      }
      const transfers = readJSON(filePath);
      if (!transfers) return json(res, 500, { ok: false, error: '传送数据格式错误' });
      const adj = buildGraph(transfers);

      // /api/layout/:projectName/:mapId — 返回布局
      if (isLayout && parts[3]) {
        const layout = computeLayout(projectName, Number(parts[3]));
        if (!layout) return json(res, 404, { ok: false, error: `地图 ${parts[3]} 无传送关系` });
        return json(res, 200, { ok: true, data: layout });
      }

      // /api/graph/:projectName/:mapId — 一代子图
      if (isGraph && parts[3]) {
        const sub = oneHopSub(adj, Number(parts[3]));
        if (!sub) return json(res, 404, { ok: false, error: `地图 ${parts[3]} 无传送关系` });
        return json(res, 200, { ok: true, data: { centerId: Number(parts[3]), graph: sub } });
      }

      // /api/graph/:projectName — 全量
      if (isGraph) {
        return json(res, 200, { ok: true, data: { nodeCount: Object.keys(adj).length, graph: adj } });
      }
    }

    // 根路径
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>RPGmaper API</h1>
<p>可用接口:</p>
<ul>
  <li><a href="/api/projects">GET /api/projects</a> — 项目列表</li>
  <li><a href="/api/graph/%E9%AD%94%E6%B3%95%E5%B0%91%E5%A5%B3%E3%83%AA%E3%82%AB">GET /api/graph/:projectName</a> — 全量关系图</li>
  <li>GET /api/graph/:projectName/:mapId — 一代关系子图</li>
  <li>GET /api/layout/:projectName/:mapId — <b>一代布局</b>（含 tile 位置、连线方向）</li>
</ul>
<p>示例: <a href="/api/layout/%E9%AD%94%E6%B3%95%E5%B0%91%E5%A5%B3%E3%83%AA%E3%82%AB/5">/api/layout/魔法少女リカ/5</a></p>`);
      return;
    }

    json(res, 404, { ok: false, error: '未找到接口' });
  } catch (e) {
    console.error('[ERROR]', req.url, e.message);
    json(res, 500, { ok: false, error: '内部错误' });
  }
});

server.listen(PORT, () => {
  console.log(`RPGmaper API 服务已启动: http://localhost:${PORT}`);
  console.log(`  项目目录: ${PROJECTS_DIR}`);
  console.log(`  接口:`);
  console.log(`    GET /api/projects`);
  console.log(`    GET /api/graph/:projectName`);
  console.log(`    GET /api/graph/:projectName/:mapId`);
  console.log(`    GET /api/layout/:projectName/:mapId`);
});
