"""Step 1 check: composite the cut parts at rest in numpy (no Blender) and compare with the drawing.
Writes work/rest_numpy.png, work/rest_numpy_diff.png and work/parts_sheet.png (every part on a checker).
Run: python3 scripts/check_parts.py"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

meta = json.load(open(os.path.join(ROOT, 'parts', 'parts.json')))
bg = np.array(Image.open(os.path.join(ROOT, 'work', 'bg_plate.png'))).astype(np.float32)
REST = sorted([p for p in meta['parts'] if not p.endswith('_free') and '/' not in meta['parts'][p]['file']], key=lambda p: meta['parts'][p]['z'])
comp = bg.copy()
for p in REST:
    m = meta['parts'][p]
    im = np.array(Image.open(os.path.join(ROOT, 'parts', m['file']))).astype(np.float32)
    x0, y0, w, h = m['x0'], m['y0'], m['w'], m['h']
    al = im[..., 3:4] / 255
    comp[y0:y0+h, x0:x0+w] = im[..., :3] * al + comp[y0:y0+h, x0:x0+w] * (1 - al)
src = load_rgb()
Image.fromarray(np.clip(comp + .5, 0, 255).astype(np.uint8)).save(os.path.join(ROOT, 'work', 'rest_numpy.png'))
d = np.abs(np.round(comp) - src)
mae = d.mean(); mx = d.max(2)
mse = ((np.round(comp) - src) ** 2).mean(); psnr = 10 * np.log10(255 ** 2 / max(mse, 1e-9))
print(f'MAE {mae:.3f}  PSNR {psnr:.2f} dB  px>8: {(mx > 8).mean()*100:.3f}%  px>24: {(mx > 24).mean()*100:.3f}%  max {mx.max():.0f}')
amp = np.clip(mx * 8, 0, 255).astype(np.uint8)
Image.fromarray(amp).save(os.path.join(ROOT, 'work', 'rest_numpy_diff.png'))
# sheet of parts on a checker
tiles = []
for p, m in meta['parts'].items():
    im = Image.open(os.path.join(ROOT, 'parts', m['file'])).convert('RGBA')
    ck = Image.new('RGBA', im.size, (255, 0, 255, 255))
    for yy in range(0, im.size[1], 16):
        for xx in range(0, im.size[0], 16):
            if (xx // 16 + yy // 16) % 2: ck.paste((0, 200, 255, 255), (xx, yy, xx + 16, yy + 16))
    ck.alpha_composite(im); tiles.append((p, ck.convert('RGB')))
Wd = 1600; x = y = 0; rowh = 0; pos = []
for p, t in tiles:
    if x + t.size[0] > Wd: x = 0; y += rowh + 24; rowh = 0
    pos.append((p, t, x, y)); x += t.size[0] + 10; rowh = max(rowh, t.size[1])
sheet = Image.new('RGB', (Wd, y + rowh + 30), 'white'); dr = ImageDraw.Draw(sheet)
for p, t, x, y in pos:
    sheet.paste(t, (x, y + 14)); dr.text((x, y), p, fill='black')
sheet.save(os.path.join(ROOT, 'work', 'parts_sheet.png'))
