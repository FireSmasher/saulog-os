"""Step 5: rest-pose fidelity. Composites renders/rest_1024.png (Blender, frame 0) over the drawing's own
background plate and compares it with eagle_3.png.
Writes renders/rest_side_by_side.png, renders/rest_blend50.png, renders/rest_difference.png and prints numbers.
Run: python3 scripts/compare_rest.py"""
import os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
from common import *
R = os.path.join(ROOT, 'renders')
src = load_rgb()
bg = np.array(Image.open(os.path.join(ROOT, 'work', 'bg_plate.png')).convert('RGB')).astype(np.float32)
im = np.array(Image.open(os.path.join(R, 'rest_1024.png'))).astype(np.float32)
a = im[..., 3:4] / 255
comp = np.round(im[..., :3] * a + bg * (1 - a))
d = np.abs(comp - src); mx = d.max(2)
mse = ((comp - src) ** 2).mean(); psnr = 10 * np.log10(255 ** 2 / max(mse, 1e-9))
char = (np.array(Image.open(os.path.join(ROOT, 'work', 'owner.png')).convert('L')) > 0) if os.path.exists(os.path.join(ROOT, 'work', 'owner.png')) else None
stats = dict(mae=float(d.mean()), psnr=float(psnr), px_over_8=float((mx > 8).mean() * 100), px_over_24=float((mx > 24).mean() * 100),
             max=int(mx.max()), identical=float((mx == 0).mean() * 100))
if char is not None and char.any():
    stats['mae_on_character'] = float(d[char].mean())
txt = ('MAE %.3f  PSNR %.2f dB  identical px %.2f%%  px off by >8: %.3f%%  >24: %.3f%%  max %d'
       % (stats['mae'], stats['psnr'], stats['identical'], stats['px_over_8'], stats['px_over_24'], stats['max']))
print(txt); json.dump(stats, open(os.path.join(R, 'rest_fidelity.json'), 'w'), indent=1)
c8 = Image.fromarray(comp.astype(np.uint8)); s8 = Image.fromarray(src.astype(np.uint8))
sbs = Image.new('RGB', (2048 + 20, 1024 + 40), 'white'); sbs.paste(s8, (0, 40)); sbs.paste(c8, (1044, 40))
dr = ImageDraw.Draw(sbs); dr.text((10, 12), 'original eagle_3.png', fill='black'); dr.text((1054, 12), 'Blender rig, frame 0 (rest)', fill='black')
sbs.save(os.path.join(R, 'rest_side_by_side.png'))
Image.blend(s8, c8, 0.5).save(os.path.join(R, 'rest_blend50.png'))
amp = Image.fromarray(np.clip(255 - mx * 8, 0, 255).astype(np.uint8)).convert('RGB')   # white = identical, darker = off (x8)
dr = ImageDraw.Draw(amp); dr.rectangle([0, 0, 1024, 34], fill='white')
dr.text((8, 4), 'difference x8 (white = identical)', fill='black'); dr.text((8, 18), txt, fill='black')
amp.save(os.path.join(R, 'rest_difference.png'))
