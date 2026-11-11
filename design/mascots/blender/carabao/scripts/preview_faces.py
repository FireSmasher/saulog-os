"""Quick look at the painted face states on the body (numpy composite, no Blender).
Writes work/face_states.png. Run: python3 scripts/preview_faces.py"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import *
meta = json.load(open(os.path.join(ROOT, 'parts', 'parts.json')))
bg = np.array(Image.open(os.path.join(ROOT, 'work', 'bg_plate.png'))).astype(np.float32)
def comp(names):
    c = bg.copy()
    for p in names:
        m = meta['parts'][p]
        im = np.array(Image.open(os.path.join(ROOT, 'parts', m['file']))).astype(np.float32)
        al = im[..., 3:4] / 255
        c[m['y0']:m['y0']+m['h'], m['x0']:m['x0']+m['w']] = im[..., :3] * al + c[m['y0']:m['y0']+m['h'], m['x0']:m['x0']+m['w']] * (1 - al)
    return c
BASE = ['hornL', 'hornR', 'earL', 'earR', 'body', 'armL_front', 'armR_front', 'snout', 'hat']
SETS = {
 'rest': ['eyeL', 'eyeR', 'mouth'], 'half': ['eyeL_half', 'eyeR_half', 'mouth'],
 'closed': ['eyeL_closed', 'eyeR_closed', 'mouth_flat'], 'happy': ['blush', 'eyeL_happy', 'eyeR_happy', 'mouth_open'],
 'tired': ['eyeL_tired', 'eyeR_tired', 'mouth'], 'yawn': ['eyeL_closed', 'eyeR_closed', 'mouth_yawn'],
 'fire': ['blush', 'eyeL_happy', 'eyeR_happy', 'mouth_grin'], 'smile': ['eyeL', 'eyeR', 'mouth_smile'],
 'o': ['eyeL', 'eyeR', 'mouth_o'],
}
tiles = []
for k, extra in SETS.items():
    order = BASE[:-2] + [e for e in extra if e == 'blush'] + [e for e in extra if 'mouth' in e] + (['snout'] if 'mouth' in extra else ['snout_closed']) + [e for e in extra if 'eye' in e] + ['hat']
    c = comp(order)[395:560, 360:680]
    t = Image.fromarray(np.clip(c, 0, 255).astype(np.uint8)).resize((480, 248), Image.LANCZOS)
    ImageDraw.Draw(t).text((6, 4), k, fill=(200, 0, 0)); tiles.append(t)
sheet = Image.new('RGB', (480 * 3, 248 * 3), 'white')
for i, t in enumerate(tiles): sheet.paste(t, ((i % 3) * 480, (i // 3) * 248))
sheet.save(os.path.join(ROOT, 'work', 'face_states.png'))
print('ok')
