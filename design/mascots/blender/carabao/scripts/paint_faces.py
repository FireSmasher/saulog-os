"""Step 2: paint the extra face states and effect sprites in the drawing's own style.

Line style copied from carabao_7.png: ink (32,21,24), face strokes 8.5 px with round caps,
anti-aliased by 4x supersampling. Shapes follow the owner's mood references
(moods/carabao_happy.png, carabao_tired.png, carabao_fire.png): happy = upward arc eyes,
open mouth with white teeth and pink tongue, faint blush; tired = droopy lids + worried brows;
fire = arc eyes + wide toothy grin; plus blink, smile, o, yawn, grin, flat mouths.
Grey under the lids is the body's own grey (taken from parts/body.png).
Outputs parts/face/*.png, parts/fx/*.png and adds them to parts/parts.json.
Run: python3 scripts/paint_faces.py   (after cut_parts.py)"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import *

P = os.path.join(ROOT, 'parts')
os.makedirs(os.path.join(P, 'face'), exist_ok=True); os.makedirs(os.path.join(P, 'fx'), exist_ok=True)
meta = json.load(open(os.path.join(P, 'parts.json')))
INK = np.array([32, 21, 24.]); FW = 8.5
MOUTH_DARK = np.array([62, 24, 30.]); TONGUE = np.array([225, 130, 129.]); TEETH = np.array([252, 252, 250.])

def place(name):
    m = meta['parts'][name]
    im = np.array(Image.open(os.path.join(P, m['file']))).astype(np.float32)
    rgb = np.zeros((H, W, 3), np.float32); al = np.zeros((H, W), np.float32)
    rgb[m['y0']:m['y0']+m['h'], m['x0']:m['x0']+m['w']] = im[..., :3]
    al[m['y0']:m['y0']+m['h'], m['x0']:m['x0']+m['w']] = im[..., 3] / 255
    return rgb, al

body_rgb, _ = place('body')          # grey under the face (features already painted out)

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

EYES = {'L': (435.5, 451.0), 'R': (604.5, 451.0)}
ER = 17.5
for side, (cx, cy) in EYES.items():
    pv = [cx, cy]
    # half-closed lid (blink in-between + tired): body grey over the top of the dot, ink lid line
    for name, frac, droop in (('half', 0.50, 0.0), ('tired', 0.58, 4.0)):
        rgb, al = place('eye' + side)
        c = Canvas(); c.rgb, c.a = rgb.copy(), al.copy()
        lid_y = cy - ER + 2 * ER * frac
        s = 1 if side == 'L' else -1
        # outer end of the lid droops (tired look)
        lid = [(cx - 22, lid_y + droop * s), (cx, lid_y - 1.5), (cx + 22, lid_y - droop * s)]
        cover = cov_poly([(cx - 24, cy - ER - 6), (cx + 24, cy - ER - 6)] + list(reversed(lid)), smooth=False)
        disc = cov_ellipse(cx, cy, ER + 3, ER + 3)
        c.over(cover * disc, body_rgb)
        c.over(cov_stroke(lid, FW), INK)
        if name == 'tired':   # worried brow, inner end higher, like the tired reference
            brow = [(cx + 16 * s, cy - 34), (cx - 2 * s, cy - 31), (cx - 20 * s, cy - 24)]
            c.over(cov_stroke(brow, 7.5), INK)
        c.save(f'face/eye{side}_{name}.png', 0.52, pv, 'eye' + side)
    # closed (blink): gentle down arc
    c = Canvas(); c.over(cov_stroke(arc_pts(cx, cy + 1, 38, 6), FW), INK)
    c.save(f'face/eye{side}_closed.png', 0.52, pv, 'eye' + side)
    # happy: up arc like the happy / fire references
    c = Canvas(); c.over(cov_stroke(arc_pts(cx, cy + 6, 40, -14), 9.5), INK)
    c.save(f'face/eye{side}_happy.png', 0.52, pv, 'eye' + side)

def dilate_cov(cov, r):
    img = Image.fromarray(np.clip(cov * 255, 0, 255).astype(np.uint8))
    img = img.filter(ImageFilter.MaxFilter(2 * r + 1))
    return np.array(img).astype(np.float32) / 255

MX, MY = 520.0, 507.0
def mouth(name, fn):
    c = Canvas(); fn(c); c.save(f'face/mouth_{name}.png', 0.50, [MX, MY], 'mouth')

mouth('flat', lambda c: c.over(cov_stroke([(503, 509), (537, 509)], FW), INK))
mouth('smile', lambda c: c.over(cov_stroke(arc_pts(MX, 504, 42, 10), FW), INK))
def m_o(c):
    c.over(cov_ellipse(MX, 513, 10.5, 12), INK)
    c.over(cov_ellipse(MX, 513, 6.0, 7.5), MOUTH_DARK)
mouth('o', m_o)
def m_yawn(c):
    c.over(cov_ellipse(MX, 519, 17, 22), INK)
    c.over(cov_ellipse(MX, 519, 12.5, 17.5), MOUTH_DARK)
    c.over(cov_ellipse(MX, 529, 9, 6.5) * cov_ellipse(MX, 519, 12.5, 17.5), TONGUE)
mouth('yawn', m_yawn)
def d_shape(top_y, w, depth, top_sag):
    top = arc_pts(MX, top_y, w, top_sag, 20)
    bot = arc_pts(MX, top_y, w, depth, 30)
    return top, bot
def m_open(c):   # happy: open D mouth, teeth band on top, pink tongue (happy reference)
    top, bot = d_shape(503, 54, 32, 2)
    shape = cov_poly(top + list(reversed(bot)), smooth=False)
    c.over(dilate_cov(shape, 4), INK)
    c.over(shape, MOUTH_DARK)
    c.over(shape * cov_poly([(480, 495), (560, 495), (560, 511), (480, 511)], smooth=False), TEETH)
    c.over(shape * cov_ellipse(MX, 531, 17, 10), TONGUE)
    for x in (MX - 27, MX + 27):
        c.over(cov_ellipse(x, 502, 5.2, 5.2), INK)
def m_grin(c):   # fire: wide toothy grin with corner ticks and two small fangs (fire reference)
    top, bot = d_shape(501, 76, 27, 6)
    shape = cov_poly(top + list(reversed(bot)), smooth=False)
    c.over(dilate_cov(shape, 4), INK)
    c.over(shape, TEETH)
    for x in (MX - 17, MX + 17):
        c.over(cov_stroke([(x, 506), (x, 515)], 2.6) * shape, np.array([150, 150, 150.]))
    for s in (-1, 1):
        c.over(cov_stroke([(MX + s * 38, 501), (MX + s * 43, 495)], 7.5), INK)
mouth('open', m_open)
mouth('grin', m_grin)

# snout with the mouth notch filled, used with every mouth except the drawn one
m = meta['parts']['snout']
sn = np.array(Image.open(os.path.join(P, m['file']))).astype(np.float32)
a0 = sn[..., 3] / 255
# the mouth apex cuts a small notch (x 507..531, bottom 496 instead of 500); fill it with a straight bottom edge
yy_ = np.arange(sn.shape[0])[:, None] + m['y0'] + 0.5
xx_ = np.arange(sn.shape[1])[None, :] + m['x0'] + 0.5
target = 500.0 + (xx_ - 506) / 26.0 * 1.0
cov_fill = np.clip(target - yy_ + 0.5, 0, 1) * ((xx_ >= 505) & (xx_ <= 533)) * (yy_ > 488)
a1 = np.maximum(a0, cov_fill)
core = pushpull(sn[..., :3], a0 > 0.9)
fill = np.where((a0 > 0.9)[..., None], sn[..., :3], core)
rgb1 = np.where((a1 > a0 + 0.02)[..., None], fill, sn[..., :3])
save_rgba(os.path.join(P, 'face', 'snout_closed.png'), rgb1, a1)
meta['parts']['snout_closed'] = dict(m, file='face/snout_closed.png', group='snout')
print('painted snout_closed')

# blush (happy / fire references): soft, faint pink
c = Canvas()
for x in (398, 642):
    e = cov_ellipse(x, 488, 27, 15)
    e = np.array(Image.fromarray((e * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32) / 255
    c.over(e * 0.42, TONGUE)
c.save('face/blush.png', 0.49, [520, 488], 'blush')

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
