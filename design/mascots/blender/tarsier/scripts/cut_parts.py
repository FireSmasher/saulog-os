"""Step 1: cut the owner's tarsier drawing (tarsier_3.png) into cut-out parts (method from ../carabao).

Every visible pixel of a part is the ORIGINAL drawing pixel. Hidden areas (body behind the arms,
ears and tail base behind the body, grey under the face features, cheek under the eyes) are painted
here in code with colours sampled from the drawing and the same outline (ink ~(63,29,29), 12.5 px).

Outputs: parts/<name>.png (RGBA, cropped) + parts/parts.json (offsets, pivots, layers, colours),
work/bg_plate.png (background without character or shadow), work/owner.png (debug).
Run: python3 scripts/cut_parts.py
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

OUT = os.path.join(ROOT, 'parts'); WORK = os.path.join(ROOT, 'work')
os.makedirs(OUT, exist_ok=True); os.makedirs(WORK, exist_ok=True)

a = load_rgb(); L = lum(a)
INK = np.array([63, 29, 29.])
BG = np.array([254, 251, 236.]); SH = np.array([253, 233, 200.])
OUTLINE_W = 12.5
yy, xx = np.mgrid[0:H, 0:W]

# ---------------------------------------------------------------- silhouette + regions
dbg = np.sqrt(((a - BG) ** 2).sum(2)); dsh = np.sqrt(((a - SH) ** 2).sum(2))
out = flood((dbg < 30) | (dsh < 22), (0, 0))
sil = ~out
ink = L < 80
cache = os.path.join(WORK, 'lab.npy')
if os.path.exists(cache):
    lab = np.load(cache)
else:
    lab = np.zeros((H, W), np.int32); rem = sil & ~ink; k = 0
    while rem.any():
        ys, xs = np.nonzero(rem); r = flood(rem, (xs[0], ys[0])); k += 1; lab[r] = k; rem &= ~r
    np.save(cache, lab)
area = np.bincount(lab.ravel())

def comp(seed, minarea=150):
    l = lab[seed[1], seed[0]]
    assert l > 0 and area[l] > minarea, (seed, l, area[l] if l else 0)
    return lab == l

region = {'flame': comp((515, 200)), 'earL': comp((220, 420)), 'earR': comp((800, 420)), 'tail': comp((724, 809))}
big = comp((515, 650))

# arms: open side (shoulder) then the inner arm stroke centre line (measured from ink runs)
CUT_L = [(352, 592), (352.5, 605), (352.5, 618), (351.5, 630)]
INNER_L = [(349, 640), (346.5, 650), (345.5, 660), (344, 670), (343.5, 680), (343, 690), (343.5, 700), (344.5, 710), (346.5, 720)]
EDGE_L = [(350, 584)] + CUT_L + INNER_L + [(348, 730), (351.5, 740), (356, 750), (361, 760), (368, 770)]
CUT_R = [(673, 592), (673, 605), (673, 618), (673.5, 630)]
INNER_R = [(676.5, 640), (678.5, 650), (680, 660), (681, 670), (681.5, 680), (682, 690), (681.5, 700), (680.5, 710), (678.5, 720)]
EDGE_R = [(675, 584)] + CUT_R + INNER_R + [(677, 730), (673.5, 740), (669, 750), (663.5, 760), (657, 770)]
zoneL = cov_poly([(240, 586), (352, 586)] + CUT_L + INNER_L + [(345, 733), (342, 745), (340, 755), (240, 772)], smooth=False) > 0.5
zoneR = cov_poly([(790, 586), (673, 586)] + CUT_R + INNER_R + [(680, 733), (683, 745), (684, 755), (790, 772)], smooth=False) > 0.5
region['armL'] = big & zoneL
region['armR'] = big & zoneR
region['body'] = big & ~zoneL & ~zoneR

# ---------------------------------------------------------------- face features
def box(x0, y0, x1, y1):
    m = np.zeros((H, W), bool); m[y0:y1, x0:x1] = True; return m
shine = {'L': comp((424, 407), 100), 'R': comp((652, 407), 100)}
feat = {}
eye_geo = {}
for s, seed in (('L', (397, 455)), ('R', (628, 455))):
    disc = flood(L < 110, seed) | dilate(shine[s], 2)
    disc = ~flood(~disc, (0, 0))   # fill holes (the shine)
    ys, xs = np.nonzero(disc)
    cx, cy = float(xs.mean()), float(ys.mean()); rr = float(np.sqrt(disc.sum() / np.pi))
    eye_geo['eye' + s] = [cx, cy, rr]
    ys, xs = np.nonzero(shine[s])
    eye_geo['shine' + s] = [float(xs.mean()), float(ys.mean()), float(np.sqrt(shine[s].sum() / np.pi))]
    feat['eye' + s] = disc
feat['mouth'] = box(474, 478, 552, 510) & (L < 120)
FEAT_ALL = feat['eyeL'] | feat['eyeR'] | feat['mouth']
print('eyes', {k: [round(v, 1) for v in vv] for k, vv in eye_geo.items()})

# ---------------------------------------------------------------- owner of ink + fringe pixels
ORDER = ['flame', 'armL', 'armR', 'body', 'tail', 'earL', 'earR']   # front -> back
claimed = np.zeros((H, W), bool)
for p in ORDER: claimed |= region[p]
rest = sil & ~claimed & ~FEAT_ALL
allowed = {p: np.ones((H, W), bool) for p in ORDER}
allowed['armL'] = dilate(zoneL, 8) & (yy >= 584)
allowed['armR'] = dilate(zoneR, 8) & (yy >= 584)
dist = {p: geodesic(region[p], rest | region[p], 22) for p in ORDER}
R = 14
owner = np.full((H, W), '', object)
for p in ORDER: owner[region[p]] = p
best = np.full((H, W), '', object)
for p in reversed(ORDER):
    ok = rest & (dist[p] <= R) & allowed[p]
    best[ok] = p
nearest = np.full((H, W), 999); near_p = np.full((H, W), 'body', object)
for p in ORDER:
    ok = rest & allowed[p] & (dist[p] < nearest)
    nearest[ok] = dist[p][ok]; near_p[ok] = p
fill = rest & (best == '')
best[fill] = near_p[fill]
owner[rest] = best[rest]
for f, m in feat.items(): owner[m] = f

# ---------------------------------------------------------------- outer anti-aliased edge: unblend against the backdrop
known_bg = out & ~dilate(sil, 3)
plate = pushpull(a, known_bg)                      # backdrop incl. the ground shadow
flame_field = pushpull(a, erode(region['flame'], 2))
EDGEC = np.broadcast_to(INK, (H, W, 3)).copy()
near_flame = dilate(region['flame'], 6)
EDGEC[near_flame] = flame_field[near_flame]
d = plate - EDGEC
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
# cheeks: soft pink over the grey; measure the pink direction, keep the grey field clean of it
CHEEK = {'L': (360.0, 497.0), 'R': (662.0, 497.0)}
cheek_zone = np.zeros((H, W), bool)
for cx, cy in CHEEK.values():
    cheek_zone |= ((xx - cx) / 52) ** 2 + ((yy - cy) / 34) ** 2 < 1
grey_known = (owner == 'body') & (L > 95) & ~dilate(FEAT_ALL, 2) & sil & ~band & ~NEAR_INK & ~cheek_zone
grey = pushpull(a, grey_known)
dv = a - grey
GREY0 = np.median(a[grey_known & (yy < 560) & (yy > 300)], 0)
cz = cheek_zone & (owner == 'body') & ~NEAR_INK & ~dilate(FEAT_ALL, 1)
mag = np.sqrt((dv ** 2).sum(2)); mag[~cz] = 0
top = np.argsort(mag.ravel())[-200:]
CHEEK_C = np.median(a.reshape(-1, 3)[top], 0) + 0.25 * np.median(dv.reshape(-1, 3)[top], 0)  # a little past the peak
dc = CHEEK_C - grey
ca = np.clip((dv * dc).sum(2) / np.maximum((dc * dc).sum(2), 1), 0, 1) * cz
ca[ca < 0.02] = 0
known_ca = cz & ~dilate(FEAT_ALL, 2)
ca_f = pushpull(np.dstack([ca * 255] * 3), ~(dilate(FEAT_ALL, 2) & cheek_zone))[..., 0] / 255
ca_full = np.where(dilate(FEAT_ALL, 2) & cheek_zone, ca_f, ca)
ca_full = np.clip(ca_full * cheek_zone, 0, 1).astype(np.float32)
for s, (cx, cy) in CHEEK.items():
    side = (xx < 512) if s == 'L' else (xx >= 512)
    exact = (a - (1 - ca_full[..., None]) * grey) / np.maximum(ca_full[..., None], 1e-3)
    crgb = np.where(((ca_full > 0.04) & cz)[..., None], np.clip(exact, 0, 255), CHEEK_C)
    layers['cheek' + s] = (crgb.astype(np.float32), (ca_full * side).astype(np.float32))
print('cheek colour', CHEEK_C.round(1), 'grey', GREY0)

def paint_fill(p, cov, colour_field, where):
    rgbp, ap = layers[p]
    c = np.where(where, cov, 0)
    new = c > ap
    rgbp[new] = colour_field[new]
    ap[:] = np.maximum(ap, c)

def paint_stroke(p, pts, width, where, colour=INK, smooth=True):
    rgbp, ap = layers[p]
    s = cov_stroke(pts, width, smooth=smooth) * where
    rgbp[:] = rgbp * (1 - s[..., None]) + np.asarray(colour) * s[..., None]
    rgbp[:] = np.where((ap < 1e-3)[..., None] & (s > 0)[..., None], np.asarray(colour), rgbp)
    ap[:] = np.maximum(ap, s)

def field_of(p, lmin=95):
    return pushpull(a, (owner == p) & (L > lmin) & ~band & ~NEAR_INK)
FIELD = {'body': grey, 'earL': field_of('earL'), 'earR': field_of('earR'), 'tail': field_of('tail')}
# front part's soft outline edge moves off the back part (no dark ghost when parts separate)
PAIRS = [('armL', 'body'), ('armR', 'body'), ('body', 'earL'), ('body', 'earR'), ('body', 'tail')]
for P, Q in PAIRS:
    fq = FIELD[Q]
    near = dilate((owner == P) & (L < 50), 2) & (owner == Q) & ~band
    mv = near & ((lum(fq) - L) > 6)
    dq = fq - INK
    am = np.clip(((fq - a) * dq).sum(2) / np.maximum((dq * dq).sum(2), 1), 0, 1)
    rp, ap = layers[P]; rq, aq = layers[Q]
    rp[mv] = INK; ap[mv] = am[mv]
    rq[mv] = fq[mv]
    print(f'edge move {P} over {Q}: {mv.sum()} px')

opaque = (alpha > 0.98) & ~band
def hidden(*parts):
    return np.isin(owner, parts) & opaque
hidden_body = (owner != 'body') & (owner != '') & opaque
# 1) body under the face features and the cheeks: plain grey
rb, ab = layers['body']
fm = dilate(FEAT_ALL, 4) | ((ca_full > 0) & (owner == 'body'))
rb[fm] = grey[fm]; ab[fm] = 1
# 2) body under each arm: grey fill inside the new body edge + outline along it
paint_fill('body', cov_poly(EDGE_L + [(430, 780), (430, 575)]), grey, hidden_body)
paint_fill('body', cov_poly(EDGE_R + [(600, 780), (600, 575)]), grey, hidden_body)
paint_stroke('body', EDGE_L, OUTLINE_W, hidden_body | (L < 60))
paint_stroke('body', EDGE_R, OUTLINE_W, hidden_body | (L < 60))

# 3) ears: fit a circle to each ear's outer outline, continue fill + outline under the head
def fit_circle(m):
    ys, xs = np.nonzero(m)
    A = np.c_[2 * xs, 2 * ys, np.ones(len(xs))]; b = xs ** 2 + ys ** 2
    (cx, cy, c), *_ = np.linalg.lstsq(A, b, rcond=None)
    return cx, cy, np.sqrt(c + cx ** 2 + cy ** 2)
EAR = {}
for s, xlim in (('L', xx < 285), ('R', xx > 742)):
    p = 'ear' + s
    edge = sil & dilate(out, 1) & xlim & (yy > 300) & (yy < 520) & (owner == p)
    cx, cy, rr = fit_circle(edge)
    EAR[s] = (float(cx), float(cy), float(rr))
    rc = rr - OUTLINE_W / 2
    hid = hidden('body')
    paint_fill(p, cov_ellipse(cx, cy, rc, rc), FIELD[p], hid)
    t = np.linspace(0, 2 * np.pi, 180)
    ring = [(cx + rc * np.cos(u), cy + rc * np.sin(u)) for u in t]
    paint_stroke(p, ring, OUTLINE_W, hid, smooth=False)
print('ears', {k: [round(v, 1) for v in vv] for k, vv in EAR.items()})

# 4) tail base: continue the tail (outline + fill) under the body along its own direction
def tail_section(x):
    col = L[:, x]; ys = np.nonzero((col < 80) & (yy[:, x] > 760) & (yy[:, x] < 860) & np.isin(owner[:, x], ['tail']))[0]
    if len(ys) < 4: return None
    runs = np.split(ys, np.nonzero(np.diff(ys) > 1)[0] + 1)
    if len(runs) < 2: return None
    return (runs[0].mean() + runs[-1].mean()) / 2, runs[-1].mean() - runs[0].mean()
secs = {x: tail_section(x) for x in range(690, 745, 5)}
secs = {x: v for x, v in secs.items() if v}
xs_ = np.array(list(secs)); cs = np.array([v[0] for v in secs.values()]); th = float(np.median([v[1] for v in secs.values()]))
slope, icpt = np.polyfit(xs_, cs, 1)
x_in = xs_.min()
cl = [(x, slope * x + icpt) for x in (x_in + 8, x_in - 20, x_in - 50, x_in - 80)]
hid_t = hidden('body', 'armR')
paint_stroke('tail', cl, th + OUTLINE_W, hid_t, smooth=False)
paint_stroke('tail', cl, max(th - OUTLINE_W, 4), hid_t, colour=FIELD['tail'][int(cs.mean()), int(xs_.mean())], smooth=False)
print('tail thickness %.1f slope %.3f' % (th, slope))

# 5) arms: FRONT = drawn arm + a pad of original body pixels over the open side (seamless at rest)
#          FREE  = drawn arm + an outline closing the open side (big poses)
for p, cut, sgn in (('armL', CUT_L, -1), ('armR', CUT_R, 1)):
    rp, ap = layers[p]
    pad = dilate(region[p], 10) & (owner == 'body') & (yy < 636) & (yy > 582)
    rf, af = rp.copy(), ap.copy()
    rf[pad] = a[pad]; af[pad] = 1
    layers[p + '_front'] = (rf, af)
    layers[p + '_free'] = (rp.copy(), ap.copy())
    paint_stroke(p + '_free', [(cut[0][0] + 4 * sgn, cut[0][1] - 8)] + cut + [INNER_L[0] if p == 'armL' else INNER_R[0]],
                 OUTLINE_W, np.ones((H, W), bool))
del layers['armL'], layers['armR']

# 6) face features: original pixels plus a 3 px halo of the surrounding grey (invisible on the face)
for f, m in feat.items():
    halo1 = dilate(m, 2); halo2 = dilate(m, 3) & ~halo1
    others = FEAT_ALL & ~m
    fa = np.where(halo1, 1.0, 0) + np.where(halo2, 0.5, 0)
    fa[dilate(others, 2) & ~m] = 0
    fr = a.copy()
    if f.startswith('eye'):     # shine becomes its own part: paint the eye dark under it
        s = f[-1]
        sh_area = dilate(shine[s], 3)
        dark = pushpull(a, m & ~sh_area & (L < 70))
        fr[sh_area] = dark[sh_area]
        sa = np.where(dilate(shine[s], 1), 1.0, 0) + np.where(dilate(shine[s], 2) & ~dilate(shine[s], 1), 0.5, 0)
        layers['shine' + s] = (a.copy(), sa.astype(np.float32))
    layers[f] = (fr, fa.astype(np.float32))
EYE_DARK = np.median(a[feat['eyeL'] & (L < 60)], 0)

# ---------------------------------------------------------------- ground shadow + clean background plate
shadow_m = dilate(out & (dsh < 30) & (dbg > 6), 3)
bg_known = out & ~shadow_m & ~dilate(sil, 3)
bg_plate = pushpull(a, bg_known)
dsb = SH - bg_plate
sha = np.clip(((plate - bg_plate) * dsb).sum(2) / np.maximum((dsb * dsb).sum(2), 1), 0, 1)
sha[sha < 0.03] = 0
vis = out & (dsh < 22) & (yy > 780)
ys, xs = np.nonzero(vis)
sh_ell = cov_ellipse((xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2, (xs.max() - xs.min()) / 2 + 8, (ys.max() - ys.min()) / 2 + 8)
sha = sha * (sh_ell > 0.5)
shrgb = np.where((sha > 0.04)[..., None], np.clip((plate - (1 - sha[..., None]) * bg_plate) / np.maximum(sha[..., None], 1e-3), 0, 255), SH)
layers['shadow'] = (shrgb.astype(np.float32), sha.astype(np.float32))
ys, xs = np.nonzero(sha > 0.5)
SHADOW = dict(cx=float((xs.min() + xs.max()) / 2), cy=float((ys.min() + ys.max()) / 2),
              rx=float((xs.max() - xs.min()) / 2), ry=float((ys.max() - ys.min()) / 2))
Image.fromarray(np.clip(bg_plate, 0, 255).astype(np.uint8)).save(os.path.join(WORK, 'bg_plate.png'))

# ---------------------------------------------------------------- save cropped parts + metadata
ex, ey = eye_geo['eyeL'][:2], eye_geo['eyeR'][:2]
PIVOTS = {   # pixel coordinates in the 1024 drawing
    'root': (515, 880), 'shadow': (SHADOW['cx'], SHADOW['cy']), 'body': (515, 840), 'neck': (515, 575),
    'flame': (515, 252), 'earL': (300, 430), 'earR': (727, 430),
    'armL': (344, 605), 'armR': (682, 605), 'legL': (425, 800), 'legR': (602, 800),
    'tail1': (655, 792), 'tail2': (735, 815),
    'eyeL': tuple(eye_geo['eyeL'][:2]), 'eyeR': tuple(eye_geo['eyeR'][:2]),
    'shineL': tuple(eye_geo['shineL'][:2]), 'shineR': tuple(eye_geo['shineR'][:2]),
    'nose': (513, 472), 'mouth': (513, 493),
}
LAYER_Z = {'shadow': 0.05, 'tail': 0.10, 'earL': 0.20, 'earR': 0.20, 'armL_free': 0.25, 'armR_free': 0.25,
           'body': 0.30, 'cheekL': 0.34, 'cheekR': 0.34, 'armL_front': 0.40, 'armR_front': 0.40,
           'mouth': 0.50, 'eyeL': 0.52, 'eyeR': 0.52, 'shineL': 0.53, 'shineR': 0.53, 'flame': 0.60}
meta = {'canvas': [W, H], 'pivots': PIVOTS, 'shadow': SHADOW, 'eyes': eye_geo, 'ears': EAR,
        'colours': {'ink': INK.tolist(), 'grey': GREY0.tolist(), 'eye_dark': EYE_DARK.tolist(), 'cheek': CHEEK_C.tolist(),
                    'bg': BG.tolist()},
        'parts': {}}
owner_dbg = np.zeros((H, W, 3), np.uint8)
pal = {'flame': (255, 140, 0), 'armL': (60, 140, 255), 'armR': (40, 200, 120), 'body': (150, 150, 150),
       'earL': (255, 120, 60), 'earR': (255, 60, 160), 'tail': (120, 255, 255), 'eyeL': (255, 0, 0), 'eyeR': (255, 0, 0),
       'mouth': (0, 0, 0)}
for p, c in pal.items():
    owner_dbg[owner == p] = c
Image.fromarray(owner_dbg).save(os.path.join(WORK, 'owner.png'))
for p, (rp, ap) in layers.items():
    ys, xs = np.nonzero(ap > 0.002)
    x0, y0 = max(xs.min() - 4, 0), max(ys.min() - 4, 0)
    x1, y1 = min(xs.max() + 5, W), min(ys.max() + 5, H)
    known = ap > 0.5
    rp2 = pushpull(rp, known) if known.sum() > 20 else rp
    save_rgba(os.path.join(OUT, p + '.png'), rp2[y0:y1, x0:x1], ap[y0:y1, x0:x1])
    meta['parts'][p] = {'file': p + '.png', 'x0': int(x0), 'y0': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0),
                        'z': LAYER_Z.get(p, 0.5)}
json.dump(meta, open(os.path.join(OUT, 'parts.json'), 'w'), indent=1)
print('parts:', ', '.join(f"{p} {v['w']}x{v['h']}@{v['x0']},{v['y0']}" for p, v in meta['parts'].items()))
