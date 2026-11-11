"""Step 1: cut the owner's eagle drawing (eagle_3.png) into cut-out parts (method from the carabao rig).

Every visible pixel of a part is the ORIGINAL drawing pixel. Hidden areas (face under eyes, brows, beak,
cheeks and head marks; body edge under the wings; wing tops under the mane; tail top under the right wing;
foot tops under the body) are painted here in code with colours continued from the drawing (push-pull
fill) and the drawing's own outline (ink (59,24,18), 12 px, anti-aliased by 4x supersampling).
Crest, mane, face and body share one smooth weight field in the rig, so they never open a seam.

Outputs: parts/<name>.png (RGBA, cropped) + parts/parts.json, work/bg_plate.png, work/owner.png,
work/group_field.npy (face/mane colour with every feature removed, used by paint_faces.py).
Run from the eagle folder: python3 scripts/cut_parts.py
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import *

OUT = os.path.join(ROOT, 'parts'); WORK = os.path.join(ROOT, 'work')
os.makedirs(OUT, exist_ok=True); os.makedirs(WORK, exist_ok=True)

a = load_rgb(); L = lum(a); Rc, Bc = a[..., 0], a[..., 2]
INK = np.array([59, 24, 18.])
BG = np.array([254, 253, 240.]); SH = np.array([248, 232, 204.])
OUTLINE_W = 12.0
yy, xx = np.mgrid[0:H, 0:W]

# ---------------------------------------------------------------- silhouette + regions
dbg = np.sqrt(((a - BG) ** 2).sum(2)); dsh = np.sqrt(((a - SH) ** 2).sum(2))
out = flood((dbg < 30) | (dsh < 22), (0, 0))
sil = ~out
ink = L < 60
cache = os.path.join(WORK, 'lab.npy')
if os.path.exists(cache):
    lab = np.load(cache)
else:
    lab = np.zeros((H, W), np.int32); rem = sil & ~ink; k = 0
    while rem.any():
        ys, xs = np.nonzero(rem); r = flood(rem, (xs[0], ys[0])); k += 1; lab[r] = k; rem &= ~r
    np.save(cache, lab)
area = np.bincount(lab.ravel())

def comp(seed):
    l = lab[seed[1], seed[0]]
    assert l > 0 and area[l] > 150, (seed, l, area[l] if l else 0)
    return lab == l

def box(x0, y0, x1, y1):
    m = np.zeros((H, W), bool); m[y0:y1, x0:x1] = True; return m

def disc(cx, cy, r):
    return (xx - cx) ** 2 + (yy - cy) ** 2 < r * r

region = {'wingL': comp((299, 636)), 'wingR': comp((691, 636)), 'tail': comp((723, 822)),
          'footL': comp((420, 867)), 'footR': comp((610, 871))}
big = comp((505, 600))           # crest + mane + face + body: one connected light region

# ---------------------------------------------------------------- face features (hard, original pixels + halo)
def split_brow(f, thick=9):
    has = f.any(0); top = np.where(has, np.argmax(f, 0), 9999)
    brow = f & (yy <= top[None, :] + thick)
    return brow, f & ~brow
eyeL_all = box(398, 365, 462, 432) & (L < 95)
eyeR_all = box(550, 365, 616, 432) & (L < 95)
browL, eyeL = split_brow(eyeL_all)
browR, eyeR = split_brow(eyeR_all)
feat = {'browL': browL, 'eyeL': eyeL, 'browR': browR, 'eyeR': eyeR,
        'beak': box(452, 376, 558, 490) & (Bc - Rc > -8),
        'markL': flood(disc(370.7, 302.2, 47) & (L < 190), (371, 302)),
        'markR': flood(disc(653.8, 302.6, 47) & (L < 190), (654, 303))}
FEAT_ALL = np.zeros((H, W), bool)
for m in feat.values(): FEAT_ALL |= m

# soft cheeks: unblended against the face colour later
CHEEK = {'cheekL': (397.7, 434.9), 'cheekR': (615.3, 435.7)}
cheek_zone = {c: (((xx - x) / 44) ** 2 + ((yy - y) / 33) ** 2 < 1) & big & ~dilate(FEAT_ALL, 2) for c, (x, y) in CHEEK.items()}
CHEEK_ALL = cheek_zone['cheekL'] | cheek_zone['cheekR']

# ---------------------------------------------------------------- crest / mane / face / body split (by colour, cleaned)
G = big & ~FEAT_ALL
cream = G & (Bc <= 215) & ~CHEEK_ALL
mane_core = np.zeros((H, W), bool)
rem = cream.copy()
while rem.any():
    ys, xs = np.nonzero(rem); r = flood(rem, (xs[0], ys[0])); rem &= ~r
    if r.sum() > 300 and np.nonzero(r)[0].min() < 515:
        mane_core |= r
white_core = flood(G & (Bc > 222) & ~mane_core, (505, 600)) | flood(G & (Bc > 222) & ~mane_core, (505, 350))
d_m = geodesic(mane_core, G, 40); d_w = geodesic(white_core, G, 40)
mane_all = G & (d_m < d_w)
group = {'crest': mane_all & (yy < 262), 'mane': mane_all & (yy >= 262),
         'face': G & ~mane_all & (yy < 505), 'body': G & ~mane_all & (yy >= 505)}
region.update(group)

# ---------------------------------------------------------------- owner of ink + fringe pixels (front-most within reach)
ORDER = ['crest', 'mane', 'wingL', 'wingR', 'face', 'body', 'footL', 'footR', 'tail']   # front -> back
claimed = np.zeros((H, W), bool)
for p in ORDER: claimed |= region[p]
rest = sil & ~claimed & ~FEAT_ALL
allowed = {p: np.ones((H, W), bool) for p in ORDER}
dist = {p: geodesic(region[p], rest | region[p], 22) for p in ORDER}
Rr = 14
owner = np.full((H, W), '', object)
for p in ORDER: owner[region[p]] = p
best = np.full((H, W), '', object)
for p in reversed(ORDER):
    ok = rest & (dist[p] <= Rr) & allowed[p]
    best[ok] = p
nearest = np.full((H, W), 999); near_p = np.full((H, W), 'body', object)
for p in ORDER:
    ok = rest & (dist[p] < nearest)
    nearest[ok] = dist[p][ok]; near_p[ok] = p
fill = rest & (best == '')
best[fill] = near_p[fill]
owner[rest] = best[rest]
for f, m in feat.items(): owner[m] = f

# ---------------------------------------------------------------- outer anti-aliased edge: unblend against the backdrop
known_bg = out & ~dilate(sil, 3)
plate = pushpull(a, known_bg)
d = plate - INK
al = np.clip(((plate - a) * d).sum(2) / np.maximum((d * d).sum(2), 1), 0, 1)
ring_out = dilate(sil, 1) & out
band = (sil & dilate(out, 2)) | ring_out
alpha = sil.astype(np.float32)
alpha[band] = al[band]
alpha[ring_out & (al < 0.03)] = 0
rgb = a.copy()
sel = band & (alpha > 0.01)
F = (a - (1 - alpha[..., None]) * plate) / np.maximum(alpha[..., None], 1e-3)
rgb[sel] = np.clip(F[sel], 0, 255)
for dy in (-1, 0, 1):
    for dx in (-1, 0, 1):
        sh = np.roll(np.roll(owner, dy, 0), dx, 1)
        take = ring_out & (owner == '') & (sh != '')
        owner[take] = sh[take]

# ---------------------------------------------------------------- per-part RGBA on the 1024 canvas
def part_layer(p):
    m = owner == p
    return np.where(m[..., None], rgb, 0).astype(np.float32), np.where(m, alpha, 0).astype(np.float32)
layers = {p: part_layer(p) for p in ORDER}
NEAR_INK = dilate(L < 60, 3)
GROUP = ['crest', 'mane', 'face', 'body']
gmask = np.isin(owner, GROUP)
# face/mane colour with every feature and the cheeks removed (continued under them)
gknown = gmask & (L > 95) & ~band & ~NEAR_INK & ~dilate(FEAT_ALL, 2) & ~dilate(CHEEK_ALL, 3)
gfield = pushpull(a, gknown)
np.save(os.path.join(WORK, 'group_field.npy'), gfield.astype(np.float32))

def grow_owner(names, steps):
    """Nearest owner among `names` for every pixel (grows labels outwards)."""
    o = np.where(np.isin(owner, names), owner, '')
    for _ in range(steps):
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            sh = np.roll(np.roll(o, dy, 0), dx, 1)
            take = (o == '') & (sh != '')
            o[take] = sh[take]
    return o
gown = grow_owner(GROUP, 60)

def paint_fill(p, cov, colour_field, where):
    rgbp, ap = layers[p]
    c = np.where(where, cov, 0)
    new = c > ap
    rgbp[new] = colour_field[new]
    ap[:] = np.maximum(ap, c)

def paint_stroke(p, pts, width, where, colour=INK):
    rgbp, ap = layers[p]
    s = cov_stroke(pts, width) * where
    rgbp[:] = rgbp * (1 - s[..., None]) + np.asarray(colour) * s[..., None]
    rgbp[:] = np.where((ap < 1e-3)[..., None] & (s > 0)[..., None], np.asarray(colour), rgbp)
    ap[:] = np.maximum(ap, s)

opaque = (alpha > 0.98) & ~band
def hidden(*parts):
    return np.isin(owner, parts) & opaque

# 1) group (crest/mane/face/body) under eyes, brows, beak and head marks: continued face/mane colour
under = dilate(FEAT_ALL, 3)
for p in GROUP:
    rp, ap = layers[p]
    m = under & (gown == p)
    rp[m] = gfield[m]; ap[m] = 1

# 2) cheeks: pink unblended against the continued face colour; the group layer gets that colour under them
cheek_layers = {}
for c, z in cheek_zone.items():
    P = a[z][np.argmin(Bc[z])]                   # most saturated cheek pixel
    dq = gfield - P
    ac = np.clip(((gfield - a) * dq).sum(2) / np.maximum((dq * dq).sum(2), 1), 0, 1) * z
    ac[ac < 0.03] = 0
    col = np.clip((a - (1 - ac[..., None]) * gfield) / np.maximum(ac[..., None], 1e-3), 0, 255)
    cheek_layers[c] = (np.where((ac > 0)[..., None], col, P).astype(np.float32), ac.astype(np.float32))
    for p in GROUP:
        rp, ap = layers[p]
        m = (ac > 0) & (owner == p)
        rp[m] = gfield[m]
layers.update(cheek_layers)

# 3) body under each wing: body colour up to the wing's inner line + outline along it
bknown = (owner == 'body') & (L > 95) & ~band & ~NEAR_INK
bfield = pushpull(a, bknown)
EDGE_L = [(344, 503), (339, 518), (337, 530), (336, 542), (331.5, 555), (326.5, 570), (321.5, 585), (318.5, 600),
          (315.5, 615), (314.5, 630), (313.5, 645), (313, 660), (313.5, 675), (315, 690), (316.5, 705), (319.5, 720),
          (323.5, 735), (328.5, 750), (332, 760), (336, 770), (337.5, 780), (340.5, 790), (348, 800), (358.5, 810)]
EDGE_R = [(668, 500), (661, 512), (655, 525), (645.5, 540), (640.5, 555), (637, 570), (635.5, 585), (635, 600),
          (636, 615), (638, 630), (640.5, 645), (644.5, 660), (649.5, 675), (656.5, 690), (664, 705), (673.5, 720),
          (685, 735), (696, 750), (704, 765), (708, 780), (704.5, 790), (699.5, 800), (693.5, 810)]
hid_wings = hidden('wingL', 'wingR', 'mane', 'crest')
paint_fill('body', cov_poly(EDGE_L + [(470, 812), (470, 503)]), bfield, hid_wings)
paint_fill('body', cov_poly(EDGE_R + [(560, 812), (560, 500)]), bfield, hid_wings)
paint_stroke('body', EDGE_L, OUTLINE_W, hid_wings | (L < 60))
paint_stroke('body', EDGE_R, OUTLINE_W, hid_wings | (L < 60))

# 4) wing tops under the mane: wing colour cap + outline (shows when a wing swings out)
def field_of(p, lmin=70):
    return pushpull(a, (owner == p) & (L > lmin) & ~band & ~NEAR_INK)
for p, cap, line in (('wingL', [(296, 535), (304, 514), (320, 503), (336, 510), (344, 535)],
                      [(294, 540), (301, 518), (319, 505), (335, 511), (343, 528)]),
                     ('wingR', [(645, 535), (660, 508), (690, 497), (718, 506), (738, 530)],
                      [(642, 540), (658, 512), (689, 500), (717, 508), (737, 528)])):
    hid = hidden('mane', 'crest')
    paint_fill(p, cov_poly(cap), field_of(p), hid)
    paint_stroke(p, line, OUTLINE_W, hid)

# 5) tail top under the right wing and the body
tf = field_of('tail', 40)
TAIL_POLY = [(688, 790), (694, 748), (722, 738), (748, 752), (760, 790)]
hid_t = hidden('wingR', 'body', 'face', 'mane')
paint_fill('tail', cov_poly(TAIL_POLY), tf, hid_t)
paint_stroke('tail', [(746, 795), (748, 760), (735, 744), (712, 742), (696, 752)], OUTLINE_W, hid_t)

# 6) feet tops under the body line (feet sit behind the body)
for p, (x0, x1) in (('footL', (376, 466)), ('footR', (563, 657))):
    paint_fill(p, cov_poly([(x0, 862), (x0 + 6, 832), (x1 - 6, 832), (x1, 862)], smooth=False), field_of(p, 100),
               hidden('body'))

# 7) features: original pixels plus a 2 px halo of the surrounding face (never a neighbour feature)
for f, m in feat.items():
    halo1 = dilate(m, 1); halo2 = dilate(m, 2) & ~halo1
    others = FEAT_ALL & ~m
    fa = np.where(halo1, 1.0, 0) + np.where(halo2, 0.5, 0)
    fa[others & ~m] = 0                          # never carry a neighbour feature's own pixels
    layers[f] = (a.copy(), fa.astype(np.float32))

# ---------------------------------------------------------------- ground shadow (unblended from the drawing) + clean plate
dshw = SH - BG
sal = np.clip(((a - BG) * dshw).sum(2) / (dshw * dshw).sum(), 0, 1)
SHADOW = dict(cx=524.0, cy=884.0, rx=234.0, ry=42.0)
shc = cov_ellipse(SHADOW['cx'], SHADOW['cy'], SHADOW['rx'], SHADOW['ry'])
zone = (yy > 800) & (cov_ellipse(SHADOW['cx'], SHADOW['cy'], SHADOW['rx'] + 22, SHADOW['ry'] + 16) > 0)
sal_plate = np.clip(((plate - BG) * dshw).sum(2) / (dshw * dshw).sum(), 0, 1)   # shadow inside the backdrop plate
sa = np.where(zone & out & ~dilate(sil, 2), sal, 0)
sa = np.where(zone & out & dilate(sil, 2), sal_plate, sa)          # AA ring: the part edges were unblended on this
sa = np.where(zone & sil, np.maximum(shc, sal_plate), sa).astype(np.float32)
sa[sa < 0.02] = 0
layers['shadow'] = (np.broadcast_to(SH, (H, W, 3)).copy(), sa)
bg_known = out & (sa < 0.01) & ~dilate(sil, 3) & ~((yy > 800) & dilate(sa > 0.02, 4))
bg_plate = pushpull(a, bg_known)
Image.fromarray(np.clip(bg_plate, 0, 255).astype(np.uint8)).save(os.path.join(WORK, 'bg_plate.png'))

# ---------------------------------------------------------------- save cropped parts + metadata
PIVOTS = {   # pixel coordinates in the 1024 drawing
    'root': (512, 884), 'body': (512, 850), 'neck': (510, 505), 'crest': (510, 285),
    'markL': (370.7, 302.2), 'markR': (653.8, 302.6), 'eyeL': (433, 404), 'eyeR': (580.5, 405),
    'browL': (432, 387), 'browR': (579, 386), 'beak': (505, 430), 'mouth': (505, 485),
    'cheekL': (397.7, 434.9), 'cheekR': (615.3, 435.7),
    'wingL': (322, 535), 'wingL_elbow': (292, 660), 'wingL_tip': (325, 790),
    'wingR': (690, 530), 'wingR_elbow': (708, 660), 'wingR_tip': (745, 778),
    'footL': (420, 858), 'footR': (610, 860), 'tail': (712, 790),
}
LAYER_Z = {'shadow': 0.00, 'tail': 0.05, 'footL': 0.08, 'footR': 0.08, 'body': 0.30, 'face': 0.31,
           'wingL': 0.34, 'wingR': 0.34, 'mane': 0.36, 'crest': 0.37, 'cheekL': 0.38, 'cheekR': 0.38,
           'markL': 0.40, 'markR': 0.40, 'beak': 0.51, 'eyeL': 0.52, 'eyeR': 0.52, 'browL': 0.53, 'browR': 0.53}
meta = {'canvas': [W, H], 'pivots': PIVOTS, 'shadow': SHADOW, 'parts': {}}
owner_dbg = np.zeros((H, W, 3), np.uint8)
pal = {'crest': (255, 220, 0), 'mane': (240, 160, 60), 'face': (200, 200, 255), 'body': (150, 150, 150),
       'wingL': (60, 140, 255), 'wingR': (40, 200, 120), 'tail': (120, 60, 0), 'footL': (0, 200, 200),
       'footR': (0, 120, 200), 'eyeL': (255, 0, 0), 'eyeR': (255, 0, 0), 'browL': (160, 0, 0), 'browR': (160, 0, 0),
       'beak': (160, 0, 200), 'markL': (255, 0, 160), 'markR': (255, 0, 160)}
for p, c in pal.items():
    owner_dbg[owner == p] = c
Image.fromarray(owner_dbg).save(os.path.join(WORK, 'owner.png'))
for p, (rp, ap) in layers.items():
    ys, xs = np.nonzero(ap > 0.002)
    x0, y0 = max(xs.min() - 4, 0), max(ys.min() - 4, 0)
    x1, y1 = min(xs.max() + 5, W), min(ys.max() + 5, H)
    known = ap > 0.003                    # every pixel with alpha keeps its exact colour
    rp2 = pushpull(rp, known) if known.any() else rp
    save_rgba(os.path.join(OUT, p + '.png'), rp2[y0:y1, x0:x1], ap[y0:y1, x0:x1])
    meta['parts'][p] = {'file': p + '.png', 'x0': int(x0), 'y0': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0),
                        'z': LAYER_Z.get(p, 0.5)}
json.dump(meta, open(os.path.join(OUT, 'parts.json'), 'w'), indent=1)
print('parts:', ', '.join(f"{p} {v['w']}x{v['h']}@{v['x0']},{v['y0']}" for p, v in meta['parts'].items()))
