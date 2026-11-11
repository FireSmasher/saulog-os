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
BASE = ['tail', 'footL', 'footR', 'body', 'face', 'wingL', 'wingR', 'mane', 'crest', 'cheekL', 'cheekR', 'markL', 'markR']
SETS = {
 'rest': ['eyeL', 'eyeR', 'browL', 'browR'], 'round': ['eyeL_round', 'eyeR_round', 'browL', 'browR'],
 'half': ['eyeL_half', 'eyeR_half', 'browL', 'browR'], 'closed': ['eyeL_closed', 'eyeR_closed'],
 'happy': ['blush', 'mouth_open', 'eyeL_happy', 'eyeR_happy'], 'tired': ['eyeL_tired', 'eyeR_tired'],
 'yawn': ['mouth_yawn', 'eyeL_closed', 'eyeR_closed'], 'fire': ['blush', 'mouth_grin', 'eyeL_squint', 'eyeR_squint', 'browL', 'browR'],
 'smile': ['mouth_smile', 'eyeL_round', 'eyeR_round'], 'o': ['mouth_o', 'eyeL_round', 'eyeR_round'],
}
tiles = []
for k, extra in SETS.items():
    order = BASE + [e for e in extra if e == 'blush'] + [e for e in extra if 'mouth' in e] + ['beak'] + [e for e in extra if 'eye' in e] + [e for e in extra if 'brow' in e]
    c = comp(order)[350:545, 345:665]
    t = Image.fromarray(np.clip(c, 0, 255).astype(np.uint8)).resize((256, 156), Image.LANCZOS)
    ImageDraw.Draw(t).text((4, 2), k, fill=(200, 0, 0)); tiles.append(t)
sheet = Image.new('RGB', (256 * 5, 156 * 2), 'white')
for i, t in enumerate(tiles): sheet.paste(t, ((i % 5) * 256, (i // 5) * 156))
sheet.save(os.path.join(ROOT, 'work', 'face_states.png'))
print('ok')
