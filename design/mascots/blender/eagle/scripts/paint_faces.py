"""Step 2: paint the extra face states and effect sprites in the eagle drawing's own style.

Line style from eagle_3.png: ink (59,24,18), face strokes 8.5 px with round caps, anti-aliased by 4x
supersampling. Shapes follow the owner's mood references (moods/eagle_happy.png, eagle_tired.png, eagle_fire.png),
eyes, brows and beak only: happy = upward arc eyes + open mouth with pink tongue under the beak; tired =
droopy lids; fire = squeezed > < eyes + wide toothy grin under the beak; plus blink, round eye, smile, o, yawn.
Brows are the drawn ones, moved by their bones (angry at rest, softer or worried by rotation).
Colour under the lids is the face colour continued under the features (work/group_field.npy).
Outputs parts/face/*.png, parts/fx/*.png and adds them to parts/parts.json.
Run: python3 scripts/paint_faces.py   (after cut_parts.py)"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import *

P = os.path.join(ROOT, 'parts')
os.makedirs(os.path.join(P, 'face'), exist_ok=True); os.makedirs(os.path.join(P, 'fx'), exist_ok=True)
meta = json.load(open(os.path.join(P, 'parts.json')))
INK = np.array([59, 24, 18.]); EYE = np.array([54, 23, 18.]); FW = 8.5
MOUTH_DARK = np.array([62, 24, 30.]); TONGUE = np.array([231, 128, 130.]); TEETH = np.array([252, 252, 250.])
SLATE = np.array([71, 83, 93.]); BEAK_LOW = np.array([131, 137, 146.])
face_rgb = np.load(os.path.join(ROOT, 'work', 'group_field.npy'))
class Canvas:
    def __init__(self):
        self.rgb = np.zeros((H, W, 3), np.float32); self.a = np.zeros((H, W), np.float32)
    def over(self, cov, colour):
        col = colour if np.ndim(colour) == 3 else np.broadcast_to(np.asarray(colour, np.float32), (H, W, 3))
        c = cov[..., None]
        na = self.a + cov * (1 - self.a)
        self.rgb = np.where(na[..., None] > 0, (col * c + self.rgb * self.a[..., None] * (1 - c)) / np.maximum(na, 1e-6)[..., None], 0)
        self.a = na
        return self
    def save(self, rel, z, pivot, group):
        ys, xs = np.nonzero(self.a > 0.002)
        x0, y0, x1, y1 = xs.min() - 3, ys.min() - 3, xs.max() + 4, ys.max() + 4
        known = self.a > (0.5 if (self.a > 0.5).sum() > 50 else 0.004)   # faint sprites (blush) keep their own colour
        rgb = pushpull(self.rgb, known)
        save_rgba(os.path.join(P, rel), rgb[y0:y1, x0:x1], self.a[y0:y1, x0:x1])
        name = os.path.splitext(os.path.basename(rel))[0]
        meta['parts'][name] = {'file': rel, 'x0': int(x0), 'y0': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0),
                               'z': z, 'pivot': pivot, 'group': group}
        print('painted', name, x1 - x0, 'x', y1 - y0)

def arc_pts(cx, cy, w, sag, n=24):
    """Parabolic arc from (cx-w/2, cy) to (cx+w/2, cy) whose middle is at cy+sag (sag<0 = bulges up)."""
    return [(cx + w * (t - .5), cy + sag * (1 - (2 * t - 1) ** 2)) for t in np.linspace(0, 1, n)]

EYES = {'L': (433.0, 404.0), 'R': (580.5, 405.0)}
ER = 19.0
for side, (cx, cy) in EYES.items():
    pv = [cx, cy]; s = 1 if side == 'L' else -1
    c = Canvas(); c.over(cov_ellipse(cx, cy, ER, ER + 0.5), EYE)
    c.save(f'face/eye{side}_round.png', 0.52, pv, 'eye' + side)
    for name, frac, droop in (('half', 0.50, 0.0), ('tired', 0.60, 4.5)):
        c = Canvas(); c.over(cov_ellipse(cx, cy, ER, ER + 0.5), EYE)
        lid_y = cy - ER + 2 * ER * frac
        lid = [(cx - 23, lid_y + droop * s), (cx, lid_y - 1.5), (cx + 23, lid_y - droop * s)]
        cover = cov_poly([(cx - 25, cy - ER - 6), (cx + 25, cy - ER - 6)] + list(reversed(lid)), smooth=False)
        c.over(cover * cov_ellipse(cx, cy, ER + 3, ER + 3), face_rgb)
        c.over(cov_stroke(lid, FW), INK)
        c.save(f'face/eye{side}_{name}.png', 0.52, pv, 'eye' + side)
    c = Canvas(); c.over(cov_stroke(arc_pts(cx, cy + 3, 40, 7), FW), INK)
    c.save(f'face/eye{side}_closed.png', 0.52, pv, 'eye' + side)
    c = Canvas(); c.over(cov_stroke(arc_pts(cx, cy + 9, 42, -15), 9.5), INK)
    c.save(f'face/eye{side}_happy.png', 0.52, pv, 'eye' + side)
    c = Canvas(); c.over(cov_stroke([(cx - 13 * s, cy - 12), (cx + 12 * s, cy + 1), (cx - 13 * s, cy + 13)], 9.0, smooth=False), INK)
    c.save(f'face/eye{side}_squint.png', 0.52, pv, 'eye' + side)

def dilate_cov(cov, r):
    img = Image.fromarray(np.clip(cov * 255, 0, 255).astype(np.uint8))
    img = img.filter(ImageFilter.MaxFilter(2 * r + 1))
    return np.array(img).astype(np.float32) / 255

MX, MY = 505.0, 485.0          # under the beak tip; mouths sit behind the beak (z 0.49)
def mouth(name, fn):
    c = Canvas(); fn(c); c.save(f'face/mouth_{name}.png', 0.49, [MX, MY], 'mouth')

mouth('smile', lambda c: c.over(cov_stroke(arc_pts(MX, 474, 66, 17), FW), INK))
def opening(c, cy, rx, ry, tongue=True):
    """Beak opening: slate rim, dark inside, lower beak crescent in beak grey, pink tongue."""
    c.over(cov_ellipse(MX, cy, rx, ry), SLATE)
    inner = cov_ellipse(MX, cy, rx - 4.5, ry - 4.5)
    c.over(inner, MOUTH_DARK)
    if tongue:
        c.over(inner * cov_ellipse(MX, cy + ry * 0.45, rx * 0.62, ry * 0.32), TONGUE)
    low = inner * (1 - cov_ellipse(MX, cy - ry * 0.18, rx - 4.5, ry - 4.5)) * (cov_poly([(MX - 60, cy), (MX + 60, cy), (MX + 60, cy + 80), (MX - 60, cy + 80)], smooth=False))
    c.over(low, BEAK_LOW)
mouth('o', lambda c: opening(c, 494, 13, 12.5, tongue=False))
mouth('yawn', lambda c: opening(c, 506, 23, 28))
def d_shape(top_y, w, depth, top_sag):
    return arc_pts(MX, top_y, w, top_sag, 20), arc_pts(MX, top_y, w, depth, 30)
def m_open(c):   # happy: open D mouth under the beak, one small tooth, pink tongue (happy reference)
    top, bot = d_shape(468, 72, 40, 2)
    shape = cov_poly(top + list(reversed(bot)), smooth=False)
    c.over(dilate_cov(shape, 4), INK)
    c.over(shape, MOUTH_DARK)
    c.over(shape * cov_ellipse(MX + 4, 500, 20, 11), TONGUE)
    c.over(shape * cov_poly([(476, 466), (488, 466), (482, 478)], smooth=False), TEETH)
def m_grin(c):   # fire: wide toothy grin under the beak (fire reference)
    top, bot = d_shape(468, 98, 32, 5)
    shape = cov_poly(top + list(reversed(bot)), smooth=False)
    c.over(dilate_cov(shape, 4), INK)
    c.over(shape, TEETH)
    c.over(cov_stroke(arc_pts(MX, 484, 84, 5, 20), 2.6) * shape, np.array([170, 165, 160.]))
    for x in (MX - 24, MX + 24):
        c.over(cov_stroke([(x, 474), (x, 493)], 2.6) * shape, np.array([170, 165, 160.]))
    for sd in (-1, 1):
        c.over(cov_stroke([(MX + sd * 49, 469), (MX + sd * 55, 461)], 7.5), INK)
mouth('open', m_open)
mouth('grin', m_grin)

# extra blush for happy / fire (soft pink, over the drawn cheeks)
c = Canvas()
for x, y in ((397.7, 434.9), (615.3, 435.7)):
    e = cov_ellipse(x, y, 30, 18)
    e = np.array(Image.fromarray((e * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32) / 255
    c.over(e * 0.45, TONGUE)
c.save('face/blush.png', 0.39, [506, 435], 'blush')

# ---------------------------------------------------------------- effect sprites (own small canvases)
def local_canvas(w, h):
    return np.zeros((h, w, 3), np.float32), np.zeros((h, w), np.float32)

def local_poly(w, h, pts, ss=4):
    img = Image.new('L', (w * ss, h * ss), 0)
    ImageDraw.Draw(img).polygon([(x * ss, y * ss) for x, y in pts], fill=255)
    return np.array(img.resize((w, h), Image.BOX)).astype(np.float32) / 255

def local_stroke(w, h, pts, width, ss=4):
    img = Image.new('L', (w * ss, h * ss), 0); d = ImageDraw.Draw(img)
    P2 = [(x * ss, y * ss) for x, y in pts]; r = width * ss / 2
    d.line(P2, fill=255, width=int(width * ss), joint='curve')
    for x, y in P2: d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    return np.array(img.resize((w, h), Image.BOX)).astype(np.float32) / 255

def lover(rgb, a, cov, col):
    na = a + cov * (1 - a)
    rgb[:] = np.where(na[..., None] > 0, (np.asarray(col) * cov[..., None] + rgb * a[..., None] * (1 - cov[..., None])) / np.maximum(na, 1e-6)[..., None], 0)
    a[:] = na

def lsave(rel, rgb, a, extra):
    rgb = pushpull(rgb, a > 0.5) if (a > 0.5).any() else rgb
    out = np.dstack([np.clip(rgb, 0, 255), np.clip(a, 0, 1) * 255]).astype(np.uint8)
    Image.fromarray(out, 'RGBA').save(os.path.join(P, rel))
    name = os.path.splitext(os.path.basename(rel))[0]
    meta['parts'][name] = dict(file=rel, w=out.shape[1], h=out.shape[0], **extra)
    print('fx', name, out.shape[1], 'x', out.shape[0])

FL_OUT = (232, 72, 8); FL_ORANGE = (255, 116, 18); FL_YEL = (255, 196, 40); FL_CORE = (255, 238, 150)
def flame_poly(w, h, bend, tongues, seed):
    rng = np.random.default_rng(seed)
    cx = w / 2; base = h - 6; top = 8; Hh = base - top; W2 = w * 0.40
    left, right = [], []
    for t in np.linspace(0, 1, 60):
        y = base - Hh * t
        if t < 0.22: hw = W2 * np.sqrt(max(0, 1 - ((0.22 - t) / 0.22) ** 2))
        else: hw = W2 * (1 - (t - 0.22) / 0.78) ** 1.15
        xc = cx + bend * w * 0.18 * np.sin(np.pi * t) * t
        bl = sum(tg[2] * w * np.exp(-((t - tg[1]) / 0.07) ** 2) for tg in tongues if tg[0] < 0)
        br = sum(tg[2] * w * np.exp(-((t - tg[1]) / 0.07) ** 2) for tg in tongues if tg[0] > 0)
        left.append((xc - hw - bl, y - bl * 0.9)); right.append((xc + hw + br, y - br * 0.9))
    return left + list(reversed(right))

def scaled(pts, s, ax, ay):
    return [(ax + (x - ax) * s, ay + (y - ay) * s) for x, y in pts]

FLAMES = [((-1, .55, .16), (1, .68, .13)), ((1, .5, .18), (-1, .72, .11)), ((-1, .62, .12), (1, .45, .15), (-1, .8, .08))]
for i, tg in enumerate(FLAMES):
    w, h = 160, 260
    rgb, a = local_canvas(w, h)
    pts = flame_poly(w, h, (-1) ** i * 0.6, tg, i)
    lover(rgb, a, local_poly(w, h, pts), FL_OUT)
    inner = scaled(pts, 0.86, w / 2, h - 6)
    lover(rgb, a, local_poly(w, h, inner), FL_ORANGE)
    mid = scaled(flame_poly(w, h, (-1) ** i * 0.4, tg[:1], i + 7), 0.62, w / 2, h - 10)
    lover(rgb, a, local_poly(w, h, mid), FL_YEL)
    core = scaled(flame_poly(w, h, 0, (), 0), 0.34, w / 2, h - 14)
    lover(rgb, a, local_poly(w, h, core), FL_CORE)
    lsave(f'fx/flame{i}.png', rgb, a, {'group': 'fx', 'anchor': [w / 2, h - 6]})

# ground fire pool + ring (fire reference: yellow-orange pool under the feet)
w, h = 560, 120
rgb, a = local_canvas(w, h)
yy, xx = np.mgrid[0:h, 0:w]
e = ((xx - w / 2) / 262) ** 2 + ((yy - h / 2) / 46) ** 2
lover(rgb, a, np.clip((1 - e) * 6, 0, 1).astype(np.float32), FL_ORANGE)
e2 = ((xx - w / 2) / 238) ** 2 + ((yy - h / 2) / 36) ** 2
lover(rgb, a, np.clip((1 - e2) * 6, 0, 1).astype(np.float32), (255, 181, 35))
lsave('fx/pool.png', rgb, a, {'group': 'fx', 'anchor': [w / 2, h / 2]})
w, h = 400, 90
rgb, a = local_canvas(w, h)
ring = local_stroke(w, h, [(w / 2 + 185 * np.cos(t), h / 2 + 34 * np.sin(t)) for t in np.linspace(0, 2 * np.pi, 90)], 7)
lover(rgb, a, ring, (255, 200, 60))
lsave('fx/ring.png', rgb, a, {'group': 'fx', 'anchor': [w / 2, h / 2]})
# soft glow behind the body
w = h = 512
rgb, a = local_canvas(w, h)
r = np.sqrt(((xx := np.mgrid[0:h, 0:w][1]) - w / 2) ** 2 / 1.0 + ((np.mgrid[0:h, 0:w][0] - h / 2) / 1.15) ** 2) / (w / 2)
lover(rgb, a, (np.clip(1 - r, 0, 1) ** 1.6 * 0.75).astype(np.float32), (255, 170, 40))
lsave('fx/glow.png', rgb, a, {'group': 'fx', 'anchor': [w / 2, h / 2]})
# energy streak and spark
w, h = 16, 130
rgb, a = local_canvas(w, h)
lover(rgb, a, local_stroke(w, h, [(8, 8), (8, 122)], 6), (255, 228, 120))
lsave('fx/streak.png', rgb, a, {'group': 'fx', 'anchor': [8, 122]})
w, h = 90, 150
rgb, a = local_canvas(w, h)
zig = [(45, 145), (30, 118), (58, 96), (34, 70), (60, 44), (40, 8)]
lover(rgb, a, local_stroke(w, h, zig, 11), (255, 176, 0))
lover(rgb, a, local_stroke(w, h, zig, 4.5), (255, 251, 224))
lsave('fx/spark.png', rgb, a, {'group': 'fx', 'anchor': [45, 145]})
# happy sparkle (4 point star, yellow with ink outline, happy reference) and tired sweat drop
w, h = 64, 64
rgb, a = local_canvas(w, h)
star = []
for k in range(8):
    ang = k * np.pi / 4 - np.pi / 2; rr = 28 if k % 2 == 0 else 8
    star.append((32 + rr * np.cos(ang), 32 + rr * np.sin(ang)))
lover(rgb, a, local_stroke(w, h, star + [star[0]], 6), INK)
lover(rgb, a, local_poly(w, h, star), (249, 217, 126))
lsave('fx/sparkle.png', rgb, a, {'group': 'fx', 'anchor': [32, 32]})
w, h = 44, 60
rgb, a = local_canvas(w, h)
drop = [(22 + 13 * np.cos(t), 38 + 13 * np.sin(t)) for t in np.linspace(-0.25 * np.pi, 1.25 * np.pi, 30)] + [(22, 6)]
lover(rgb, a, local_stroke(w, h, drop + [drop[0]], 4.5), INK)
lover(rgb, a, local_poly(w, h, drop), (170, 214, 240))
lover(rgb, a, local_stroke(w, h, [(16, 34), (15, 41)], 3.5), (240, 250, 255))
lsave('fx/sweat.png', rgb, a, {'group': 'fx', 'anchor': [22, 30]})

json.dump(meta, open(os.path.join(P, 'parts.json'), 'w'), indent=1)
