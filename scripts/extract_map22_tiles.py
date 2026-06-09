#!/usr/bin/env python3
"""Extract all tiles used in map22 to a viewable folder."""

from PIL import Image
import json, os, sys, shutil

sys.stdout.reconfigure(encoding='utf-8')

base = 'E:/hhh/ce/'
game = 'エニシアと契約紋 ～馬蹄通りの小聖女～'
dec_dir = os.path.join(base, game, '_decrypted')
out_dir = 'C:/Users/Muchen/Desktop/map22_tiles_教堂礼拜堂'

if os.path.exists(out_dir):
    shutil.rmtree(out_dir)
os.makedirs(out_dir)
tiles_dir = os.path.join(out_dir, 'tiles')
os.makedirs(tiles_dir)

T = 48

# Load tilesets
imgs = {}
for name in ['fsm_Inside01_A2', 'fsm_Inside01_A4', 'fsm_Inside01_A5', 'fsm_Inside01_D', 'fsm_Inside01_E']:
    path = os.path.join(dec_dir, name + '.png')
    imgs[name] = Image.open(path).convert('RGBA')
    print(f"Loaded {name}: {imgs[name].size}")

TILE_ID_A1 = 2048

def get_tile_src_xy(tile_id):
    """Return (img_name, sx, sy, width, height, unique_key, label)"""
    # D tiles (512-767)
    if 512 <= tile_id < 768:
        sx = ((tile_id // 128) % 2 * 8 + (tile_id % 8)) * T
        sy = ((tile_id % 256) // 8 % 16) * T
        return ('fsm_Inside01_D', sx, sy, T, T, f"D_{tile_id}", f"D #{tile_id}")
    # E tiles (768-1535)
    if 768 <= tile_id < 1536:
        sx = ((tile_id // 128) % 2 * 8 + (tile_id % 8)) * T
        sy = ((tile_id % 256) // 8 % 16) * T
        return ('fsm_Inside01_E', sx, sy, T, T, f"E_{tile_id}", f"E #{tile_id}")
    # A5 tiles (1536-2047)
    if 1536 <= tile_id < 2048:
        a5 = tile_id - 1536
        sx = (a5 % 8) * T
        sy = (a5 // 8) * T
        return ('fsm_Inside01_A5', sx, sy, T, T, f"A5_{tile_id}", f"A5 #{a5}")
    # A2 autotiles (2816-4351)
    if 2816 <= tile_id < 4352:
        kind = (tile_id - TILE_ID_A1) // 48
        tx, ty = kind % 8, kind // 8
        sx, sy = tx * 2 * T, (ty - 2) * 3 * T
        return ('fsm_Inside01_A2', sx, sy, 2*T, 3*T, f"A2_k{kind}", f"A2 kind#{kind}")
    # A4 autotiles (5888-8191)
    if 5888 <= tile_id < 8192:
        kind = (tile_id - TILE_ID_A1) // 48
        tx, ty = kind % 8, kind // 8
        bx = tx * 2
        by = int((ty - 10) * 2.5 + (0.5 if ty % 2 == 1 else 0))
        sx, sy = bx * T, by * T
        return ('fsm_Inside01_A4', sx, sy, T, T, f"A4_k{kind}", f"A4 kind#{kind}")
    return (None, 0, 0, 0, 0, None, "")

layer0_ids = [1541, 1652, 1653, 1654, 1657, 3728, 3744, 3748, 3752, 3756, 3762, 3764, 3766, 3768,
              6080, 6081, 6082, 6084, 6088, 6096, 6097, 6100, 6104, 6108, 6114, 6116, 6118, 6120, 6122,
              6512, 6513, 6514, 6515, 6516, 6518, 6520, 6521, 6524]
layer3_ids = [705, 713, 896, 897, 898, 904, 905, 906, 912, 913, 914, 944, 945, 946,
              952, 953, 954, 978, 979, 980, 987, 995]

all_ids = sorted(set(layer0_ids + layer3_ids))

# Deduplicate
seen = {}
for tid in all_ids:
    result = get_tile_src_xy(tid)
    if result[0] is None or result[4] is None:
        continue
    img_name, sx, sy, w, h, key, label = result
    if img_name not in imgs:
        continue
    if key not in seen:
        seen[key] = {'tid': tid, 'img': img_name, 'sx': sx, 'sy': sy,
                     'w': w, 'h': h, 'label': label,
                     'layer': 0 if tid in layer0_ids else 3,
                     'cat': key.split('_')[0]}

print(f"\nUnique tile kinds: {len(seen)}")

for key, info in sorted(seen.items()):
    img = imgs[info['img']]
    sx, sy, w, h = info['sx'], info['sy'], info['w'], info['h']
    if sx + w > img.width or sy + h > img.height:
        print(f"  SKIP {key}: out of bounds")
        continue
    tile_img = img.crop((sx, sy, sx + w, sy + h))
    fname = f"{key}_L{info['layer']}.png"
    tile_img.save(os.path.join(tiles_dir, fname))
    print(f"  {fname}")

# Build HTML
cat_names = {'A2': 'A2 地板', 'A4': 'A4 墙壁/屋顶',
             'A5': 'A5 普通', 'D': 'D 组', 'E': 'E 组'}

html_parts = []
html_parts.append('''<!DOCTYPE html><html><head><meta charset="utf-8"><title>Map22 Tiles</title>
<style>
body { font-family: sans-serif; margin: 20px; background: #1a1a2e; color: #e0e0e0; }
h1 { color: #ffd700; }
h2 { color: #ccc; margin-top: 30px; border-bottom: 1px solid #444; padding-bottom: 5px; }
.summary { background: #16213e; padding: 15px; border-radius: 8px; margin: 10px 0; }
table { border-collapse: collapse; margin: 10px 0; }
td { border: 1px solid #333; padding: 10px; text-align: center; background: #0f3460; border-radius: 4px; }
img { image-rendering: pixelated; border-radius: 2px; }
.label { font-size: 12px; color: #aaa; margin-top: 4px; }
code { background: #222; padding: 2px 6px; border-radius: 3px; font-size: 12px; color: #ffd700; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; }
.l0 { background: #1a5276; color: #aed6f1; }
.l3 { background: #6c3483; color: #d7bde2; }
.tref { margin: 10px 0; }
.tref img { border: 1px solid #444; }
</style></head><body>
<h1>Map22 — 教堂礼拜堂</h1>
<div class="summary">
<p><b>项目:</b> ''' + game + '''</p>
<p><b>地图名:</b> 教堂礼拜堂 (ID=22, 40x28)</p>
<p><b>Tileset:</b> レスタ教会内装 (ID=28)</p>
<p><b>文件:</b> fsm_Inside01_A2, A4, A5, D, E</p>
<p><b>总计:</b> ''' + str(len(seen)) + ''' 种独立 Tile</p>
</div>
''')

for cat in ['A2', 'A4', 'A5', 'D', 'E']:
    items = [(k, v) for k, v in seen.items() if v['cat'] == cat]
    if not items:
        continue
    html_parts.append(f'<h2>{cat_names.get(cat, cat)}</h2><table><tr>')
    for key, info in items:
        fname = f"{key}_L{info['layer']}.png"
        sw, sh = info['w'], info['h']
        html_parts.append(f'<td><img src="tiles/{fname}" width="{sw}" height="{sh}">')
        html_parts.append(f'<br><code>{key}</code>')
        html_parts.append(f'<br><span class="badge l{info["layer"]}">Layer {info["layer"]}</span>')
        html_parts.append(f'<br><span class="label">{info["label"]}</span></td>')
    html_parts.append('</tr></table>')

html_parts.append('<h2>完整 Tileset 参考图</h2>')
for name in ['fsm_Inside01_A2', 'fsm_Inside01_A4', 'fsm_Inside01_A5', 'fsm_Inside01_D', 'fsm_Inside01_E']:
    w, h = imgs[name].size
    html_parts.append(f'<div class="tref"><b>{name}.png</b> ({w}x{h})<br>')
    html_parts.append(f'<img src="{name}.png" width="{w//2}" height="{h//2}"></div>')

html_parts.append('</body></html>')

with open(os.path.join(out_dir, 'index.html'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(html_parts))

for name in ['fsm_Inside01_A2', 'fsm_Inside01_A4', 'fsm_Inside01_A5', 'fsm_Inside01_D', 'fsm_Inside01_E']:
    shutil.copy2(os.path.join(dec_dir, name + '.png'), os.path.join(out_dir, name + '.png'))

print(f"\n Done! Output: {out_dir}")
print(f"  -> Open index.html in browser")
