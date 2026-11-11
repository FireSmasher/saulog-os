"""Step 2: paint the added nose, the extra face states and the effect sprites in the drawing's own style.

Ink (63,29,29) and round-capped strokes like tarsier_3.png, anti-aliased by 4x supersampling.
Faces follow the owner's mood references (moods/tarsier_happy/tired/fire.png, eyes and mouths only):
happy = up-arc eyes + open mouth with teeth and tongue; tired = worried brows (lids are a shader in the rig) + yawn;
fire = wide grin with fangs. Talk/wave mouths (o, flat, smile) follow the code rig rig/tarsier-rig.html.
The nose is new (the owner asked for nose movement): the code rig's nose shape, moved to sit above the drawn mouth.
FX sprites are white where the rig tints them per frame (tongues, streaks, ring), coloured otherwise.
Outputs parts/face/*.png, parts/fx/*.png and adds them to parts/parts.json.
Run: python3 scripts/paint_faces.py   (after cut_parts.py)"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from PIL import ImageFont

P = os.path.join(ROOT, 'parts')
os.makedirs(os.path.join(P, 'face'), exist_ok=True); os.makedirs(os.path.join(P, 'fx'), exist_ok=True)
meta = json.load(open(os.path.join(P, 'parts.json')))
C = meta['colours']
INK = np.array(C['ink']); FW = 7.0
MOUTH_DARK = np.array([138, 51, 48.]); TONGUE = np.array([228, 128, 126.]); TEETH = np.array([253, 251, 246.])
NOSE = np.array([92, 43, 39.])

class Canvas:
    def __init__(self):
        self.rgb = np.zeros((H, W, 3), np.float32); self.a = np.zeros((H, W), np.float32)
    def over(self, cov, colour):
        col = np.broadcast_to(np.asarray(colour, np.float32), (H, W, 3))
        c = cov[..., None]
        na = self.a + cov * (1 - self.a)
        self.rgb = np.where(na[..., None] > 0, (col * c + self.rgb * self.a[..., None] * (1 - c)) / np.maximum(na, 1e-6)[..., None], 0)
        self.a = na
        return self
    def save(self, rel, z, pivot, group):
        ys, xs = np.nonzero(self.a > 0.002)
        x0, y0, x1, y1 = xs.min() - 3, ys.min() - 3, xs.max() + 4, ys.max() + 4
        rgb = pushpull(self.rgb, self.a > 0.5)
        save_rgba(os.path.join(P, rel), rgb[y0:y1, x0:x1], self.a[y0:y1, x0:x1])
        name = os.path.splitext(os.path.basename(rel))[0]
        meta['parts'][name] = {'file': rel, 'x0': int(x0), 'y0': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0),
                               'z': z, 'pivot': pivot, 'group': group}
        print('painted', name, x1 - x0, 'x', y1 - y0)

def arc_pts(cx, cy, w, sag, n=24):
    """Parabolic arc from (cx-w/2, cy) to (cx+w/2, cy); middle at cy+sag (sag<0 bulges up)."""
    return [(cx + w * (t - .5), cy + sag * (1 - (2 * t - 1) ** 2)) for t in np.linspace(0, 1, n)]

def quad(p0, p1, p2, n=16):
    return [((1-t)**2*p0[0] + 2*(1-t)*t*p1[0] + t*t*p2[0], (1-t)**2*p0[1] + 2*(1-t)*t*p1[1] + t*t*p2[1])
            for t in np.linspace(0, 1, n)]

def dilate_cov(cov, r):
    img = Image.fromarray(np.clip(cov * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * r + 1))
    return np.array(img).astype(np.float32) / 255

# ---------------------------------------------------------------- nose (new): code rig shape, 9 px higher
nose_pts = quad((501, 465), (513, 459), (525, 465)) + quad((525, 465), (517, 477), (513, 478))[1:] + quad((513, 478), (509, 477), (501, 465))[1:]
Canvas().over(cov_poly(nose_pts, smooth=False), NOSE).save('face/nose.png', 0.51, [513, 470], 'nose')

# ---------------------------------------------------------------- eyes
for s in 'LR':
    cx, cy, r = meta['eyes']['eye' + s]
    c = Canvas(); c.over(cov_stroke(arc_pts(cx, cy + 12, 92, -30), 10.0), INK)       # happy: up arc (happy ref)
    c.save(f'face/eye{s}_happy.png', 0.52, [cx, cy], 'eye' + s)
# tired: worried brows, inner ends raised (tired ref)
c = Canvas()
for s, sg in (('L', 1), ('R', -1)):
    cx, cy, r = meta['eyes']['eye' + s]
    c.over(cov_stroke([(cx - 44 * sg, cy - r - 12), (cx - 4 * sg, cy - r - 20), (cx + 34 * sg, cy - r - 32)], 8.0), INK)
c.save('face/brows.png', 0.55, [513, 400], 'brows')

# ---------------------------------------------------------------- mouths (centre of the drawn "w": 513, 493)
MX, MY = 513.0, 493.0
def mouth(name, fn):
    c = Canvas(); fn(c); c.save(f'face/mouth_{name}.png', 0.50, [MX, MY], 'mouth')
mouth('flat', lambda c: c.over(cov_stroke([(497, 495), (513, 492.5), (529, 495)], FW), INK))
def m_o(c):
    c.over(cov_ellipse(MX, 499, 15.5, 17.5), INK); c.over(cov_ellipse(MX, 499, 8.8, 10.8), MOUTH_DARK)
mouth('o', m_o)
def m_yawn(c):
    c.over(cov_ellipse(MX, 506, 22, 28), INK); c.over(cov_ellipse(MX, 506, 15, 21), MOUTH_DARK)
    c.over(cov_ellipse(MX, 518, 10, 7) * cov_ellipse(MX, 506, 15, 21), TONGUE)
mouth('yawn', m_yawn)
def d_mouth(c, w, top_sag, depth, teeth=0, tongue=False, fangs=False):
    top = arc_pts(MX, 487, w, top_sag, 20); bot = arc_pts(MX, 487, w, depth, 30)
    shape = cov_poly(top + list(reversed(bot)), smooth=False)
    c.over(dilate_cov(shape, 3), INK)
    c.over(shape, MOUTH_DARK)
    if teeth:
        band = cov_poly([(MX - w, 470), (MX + w, 470), (MX + w, 487 + top_sag + teeth), (MX - w, 487 + top_sag + teeth)], smooth=False)
        c.over(shape * band, TEETH)
    if fangs:
        for sg in (-1, 1):
            fx_ = MX + sg * 14
            c.over(shape * cov_poly([(fx_ - 5, 490), (fx_ + 5, 490), (fx_, 501)], smooth=False), TEETH)
    if tongue:
        c.over(shape * cov_ellipse(MX, 487 + depth - 4, w * 0.3, 9), TONGUE)
mouth('smile', lambda c: d_mouth(c, 54, 5, 30))                               # code rig smile (talk, wave)
mouth('open', lambda c: d_mouth(c, 62, 3, 36, teeth=8, tongue=True))          # happy ref
mouth('grin', lambda c: d_mouth(c, 66, 4, 27, teeth=6, fangs=True))           # fire ref

# ---------------------------------------------------------------- effect sprites (own canvases)
def lpoly(w, h, pts, ss=4):
    img = Image.new('L', (w * ss, h * ss), 0)
    ImageDraw.Draw(img).polygon([(x * ss, y * ss) for x, y in pts], fill=255)
    return np.array(img.resize((w, h), Image.BOX)).astype(np.float32) / 255
def lstroke(w, h, pts, width, ss=4):
    img = Image.new('L', (w * ss, h * ss), 0); d = ImageDraw.Draw(img)
    P2 = [(x * ss, y * ss) for x, y in pts]; r = width * ss / 2
    d.line(P2, fill=255, width=int(width * ss), joint='curve')
    for x, y in P2: d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    return np.array(img.resize((w, h), Image.BOX)).astype(np.float32) / 255
def blur(m, r):
    return np.array(Image.fromarray(np.clip(m * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255
def fsave(name, rgb, a, anchor, z):
    rgb = np.broadcast_to(np.asarray(rgb, np.float32), a.shape + (3,)) if np.ndim(rgb) == 1 else rgb
    out = np.dstack([np.clip(rgb, 0, 255), np.clip(a, 0, 1) * 255]).astype(np.uint8)
    Image.fromarray(out, 'RGBA').save(os.path.join(P, 'fx', name + '.png'))
    meta['parts'][name] = dict(file='fx/%s.png' % name, w=out.shape[1], h=out.shape[0], anchor=[float(v) for v in anchor], z=z, group='fx')
    print('fx', name, out.shape[1], 'x', out.shape[0])
WHITE = np.array([255, 255, 255.])

# flame tongue (code rig TONGUE path at size 100), soft edge like its blur filter
def cubic(p0, p1, p2, p3, n=20):
    return [tuple((1-t)**3*np.array(p0) + 3*(1-t)**2*t*np.array(p1) + 3*(1-t)*t*t*np.array(p2) + t**3*np.array(p3)) for t in np.linspace(0, 1, n)]
tp = cubic((0, -1), (.55, -.45), (.62, .45), (0, .62)) + cubic((0, .62), (-.62, .45), (-.55, -.45), (0, -1))[1:]
w, h = 150, 190; ax, ay = 75, 112
fsave('tongue', WHITE, blur(lpoly(w, h, [(ax + 100 * x, ay + 100 * y) for x, y in tp]), 2.5), (ax, ay), 0.03)
# streak (vertical line, 4 px, length 100, anchor at the bottom)
fsave('streak', WHITE, lstroke(12, 110, [(6, 104), (6, 6)], 4), (6, 104), 0.02)
# ground ring (mid size of the code rig's growing ellipse)
w, h = 520, 90
fsave('ring', WHITE, lstroke(w, h, [(w / 2 + 245 * np.cos(t), h / 2 + 31 * np.sin(t)) for t in np.linspace(0, 2 * np.pi, 160)], 8), (w / 2, h / 2), 0.015)
# warm back glow (code rig radialGradient, ellipse rx 420 ry 460, quarter resolution)
w, h = 214, 234
yy_, xx_ = np.mgrid[0:h, 0:w]
r = np.sqrt(((xx_ + .5 - w / 2) / 105) ** 2 + ((yy_ + .5 - h / 2) / 115) ** 2)
fsave('warm', np.array([255, 154, 0.]), np.clip(1 - r, 0, 1) * 0.45, (w / 2, h / 2), 0.01)
# aura: the rest silhouette dilated 14 + blurred 20 (code rig #aura) plus its soft orange drop glow
sil = np.zeros((H, W), np.float32)
for p in ('body', 'earL', 'earR', 'tail', 'armL_front', 'armR_front', 'flame'):
    m = meta['parts'][p]; im = np.array(Image.open(os.path.join(P, m['file'])))[..., 3] / 255
    sl = sil[m['y0']:m['y0'] + m['h'], m['x0']:m['x0'] + m['w']]; np.maximum(sl, im, out=sl)
au = np.maximum(blur(dilate_cov(sil, 14), 20), 0.6 * blur(sil, 14))
ys, xs = np.nonzero(au > 0.01); x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
fsave('aura', np.array([255, 160, 0.]), au[y0:y1, x0:x1], (512 - x0, 512 - y0), 0.045)
# lightning sparks: 10 zigzags (6 random steps up), orange glow stroke + pale core
rng = np.random.default_rng(7)
for k in range(10):
    pts = [(0.0, 0.0)]
    for i in range(6):
        pts.append((pts[-1][0] + rng.uniform(-38, 38), pts[-1][1] + rng.uniform(-55, -10)))
    xs_ = [p[0] for p in pts]; ys_ = [p[1] for p in pts]
    ox, oy = -min(xs_) + 12, -min(ys_) + 12
    w, h = int(max(xs_) - min(xs_) + 24), int(max(ys_) - min(ys_) + 24)
    q = [(x + ox, y + oy) for x, y in pts]
    a1 = lstroke(w, h, q, 12) * 0.6; a2 = lstroke(w, h, q, 5)
    a = a2 + a1 * (1 - a2)
    rgb = (np.array([255, 251, 224.]) * a2[..., None] + np.array([255, 176, 0.]) * (a1 * (1 - a2))[..., None]) / np.maximum(a, 1e-6)[..., None]
    fsave('bolt%d' % k, rgb, a, (ox, oy), 0.9)
# zzz (code rig: Avenir Next heavy, #8a8178, sizes 40/54/70 at the given baselines)
img = Image.new('L', (W, H), 0); d = ImageDraw.Draw(img)
for x, y, sz, ch in ((760, 300, 40, 'z'), (800, 250, 54, 'z'), (850, 190, 70, 'Z')):
    font = None
    for idx in range(12):
        try:
            f = ImageFont.truetype('/System/Library/Fonts/Avenir Next.ttc', sz, index=idx)
            if 'Heavy' in f.getname()[1] or (font is None and 'Bold' == f.getname()[1]): font = f
        except Exception:
            break
    d.text((x, y), ch, fill=255, font=font, anchor='ls')
za = np.array(img).astype(np.float32) / 255
ys, xs = np.nonzero(za > 0.01); x0, y0, x1, y1 = xs.min() - 3, ys.min() - 3, xs.max() + 4, ys.max() + 4
fsave('zzz', np.array([138, 129, 120.]), za[y0:y1, x0:x1], (0, 0), 0.9)
meta['parts']['zzz'].update(x0=int(x0), y0=int(y0))

json.dump(meta, open(os.path.join(P, 'parts.json'), 'w'), indent=1)
