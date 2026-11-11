"""Step 1: cut the owner's carabao drawing (carabao_7.png) into cut-out parts.

Every visible pixel of a part is the ORIGINAL drawing pixel. Hidden areas (behind the
arms, under the hat, behind the ears, under the face features) are hand-painted here in
code with the same flat grey/horn colours (sampled from the drawing) and the same outline
(ink (32,21,24), 12.3 px wide, anti-aliased by 4x supersampling).

Outputs: parts/<name>.png (RGBA, cropped) + parts/parts.json (offsets, pivots, layers),
work/bg_plate.png (background with character and shadow removed), work/owner.png (debug).
Run: python3 scripts/cut_parts.py
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import *

OUT = os.path.join(ROOT, 'parts'); WORK = os.path.join(ROOT, 'work')
os.makedirs(OUT, exist_ok=True); os.makedirs(WORK, exist_ok=True)

a = load_rgb(); L = lum(a)
INK = np.array([32, 21, 24.])
BG = np.array([255, 253, 239.]); SH = np.array([240, 229, 213.])
OUTLINE_W = 12.3

# ---------------------------------------------------------------- silhouette
dbg = np.sqrt(((a - BG) ** 2).sum(2)); dsh = np.sqrt(((a - SH) ** 2).sum(2))
out = flood((dbg < 30) | (dsh < 22), (0, 0))
sil = ~out

# ---------------------------------------------------------------- regions
ink = L < 50
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

def mirror(pts):
    return [(1039 - x, y) for x, y in pts]

region = {
    'hat': comp((520, 300)), 'hornL': comp((260, 300)), 'hornR': comp((779, 300)),
    'earL': comp((290, 425)), 'earR': comp((749, 425)),
}
big = comp((520, 650))
plates = comp((360, 712)) | comp((255, 750)) | comp((279, 745))

# cut lines (open side of each arm, then the inner arm stroke centre line)
CUT_L = [(336, 546), (334, 575), (331, 605), (328, 636)]
INNER_L = [(325, 650), (322.5, 662), (321.5, 674), (323, 686), (324.5, 698), (326.5, 710)]
EDGE_L = [(334, 538)] + CUT_L + INNER_L + [(328, 730), (331, 750), (334, 763), (338, 772)]
CUT_R = [(705, 546), (708, 575), (712, 605), (716.5, 634)]
INNER_R = [(721, 650), (723, 662), (725, 680), (725.5, 698), (724, 710), (720.5, 728), (717, 738)]
EDGE_R = [(707, 538)] + CUT_R + INNER_R + [(714, 746), (711.5, 752), (708.5, 758)]

zoneL = cov_poly([(150, 546)] + CUT_L + INNER_L + [(330, 762), (150, 790)], smooth=False) > 0.5
zoneR = cov_poly([(890, 546)] + CUT_R + INNER_R + [(717, 760), (890, 760)], smooth=False) > 0.5
region['armL'] = (big & zoneL) | plates
region['armR'] = big & zoneR
region['body'] = big & ~zoneL & ~zoneR
for l in np.unique(lab[sil]):  # other real regions (hoof toes etc.) belong to the body
    if l and area[l] > 150 and not any(region[p][lab == l].any() for p in region):
        region['body'] |= lab == l

# ---------------------------------------------------------------- face features
def box(x0, y0, x1, y1):
    m = np.zeros((H, W), bool); m[y0:y1, x0:x1] = True; return m
feat = {
    'eyeL': box(405, 420, 467, 482) & (L < 95),
    'eyeR': box(573, 420, 636, 482) & (L < 95),
    'mouth': box(484, 492, 558, 524) & (L < 60),
}
feat['snout'] = box(482, 458, 560, 502) & (L < 108) & ~feat['mouth']
feat['mouth'] &= ~(box(482, 458, 560, 492))  # nostrils stay with the snout
FEAT_ALL = np.zeros((H, W), bool)
for m in feat.values(): FEAT_ALL |= m

# ---------------------------------------------------------------- owner of ink + fringe pixels
ORDER = ['hat', 'armL', 'armR', 'body', 'earL', 'earR', 'hornL', 'hornR']   # front -> back
claimed = np.zeros((H, W), bool)
for p in ORDER: claimed |= region[p]
rest = sil & ~claimed & ~FEAT_ALL
yy, xx = np.mgrid[0:H, 0:W]
allowed = {p: np.ones((H, W), bool) for p in ORDER}
allowed['armL'] = yy >= 546
allowed['armR'] = yy >= 544
dist = {p: geodesic(region[p], rest | region[p], 22) for p in ORDER}
R = 14
owner = np.full((H, W), '', object)
for p in ORDER: owner[region[p]] = p
best = np.full((H, W), '', object)
for p in reversed(ORDER):        # front-most within reach wins
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
d = plate - INK
al = ((plate - a) * d).sum(2) / np.maximum((d * d).sum(2), 1)
al = np.clip(al, 0, 1)
ring_out = dilate(sil, 1) & out
band = (sil & dilate(out, 2)) | ring_out
alpha = sil.astype(np.float32)
alpha[band] = al[band]
alpha[ring_out & (al < 0.03)] = 0
rgb = a.copy()
sel = band & (alpha > 0.01)
F = (a - (1 - alpha[..., None]) * plate) / np.maximum(alpha[..., None], 1e-3)
rgb[sel] = np.clip(F[sel], 0, 255)
# outside ring pixels take the owner of a neighbouring silhouette pixel
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
grey_known = (owner == 'body') & (L > 95) & ~dilate(FEAT_ALL, 2) & sil & ~band & ~NEAR_INK
grey = pushpull(a, grey_known)                    # body grey field, continued under everything

def paint_fill(p, cov, colour_field, where):
    """Fill coverage cov (0..1) with colour_field, only on pixels in `where` (hidden at rest)."""
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

# Move the soft anti-aliased edge of every FRONT part's outline off the BACK part it overlaps:
# the back part gets clean fill colour there, the front part gets the ink with partial alpha.
# At rest the composite is the same; when parts move apart, no dark ghost line stays behind.
def field_of(p, lmin=95):
    return pushpull(a, (owner == p) & (L > lmin) & ~band & ~NEAR_INK)
FIELD = {'body': grey, 'earL': field_of('earL'), 'earR': field_of('earR'),
         'hornL': field_of('hornL', 120), 'hornR': field_of('hornR', 120)}
PAIRS = [('hat', 'body'), ('hat', 'earL'), ('hat', 'earR'), ('hat', 'hornL'), ('hat', 'hornR'),
         ('armL', 'body'), ('armR', 'body'), ('body', 'earL'), ('body', 'earR'),
         ('earL', 'hornL'), ('earR', 'hornR')]
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
# 1) body under the face features
rb, ab = layers['body']
fm = dilate(FEAT_ALL, 3)
rb[fm] = grey[fm]; ab[fm] = 1
# 2) body under each arm: grey fill inside the new body edge + outline along it
polyL = EDGE_L + [(420, 780), (420, 530)]
polyR = EDGE_R + [(620, 770), (620, 530)]
paint_fill('body', cov_poly(polyL), grey, hidden_body)
paint_fill('body', cov_poly(polyR), grey, hidden_body)
paint_stroke('body', EDGE_L, OUTLINE_W, hidden_body | (L < 60))
paint_stroke('body', EDGE_R, OUTLINE_W, hidden_body | (L < 60))
# 3) head top under the hat (dome), joins the head outline at y = 410
cx, hw = 519.75, 171.75
ry = 70.0; cyd = 420.0
rx = hw / np.sqrt(1 - ((410 - cyd) / ry) ** 2)
t = np.linspace(np.pi, 2 * np.pi, 60)
arc = [(cx + rx * np.cos(u), cyd + ry * np.sin(u)) for u in t]
arc = [p for p in arc if p[1] <= 412]
dome = cov_poly(arc + [(arc[-1][0], 430), (arc[0][0], 430)], smooth=False)
under_hat = hidden('hat')
paint_fill('body', dome, grey, under_hat)
paint_stroke('body', arc, OUTLINE_W, under_hat, colour=INK)

# 4) ears: continue the ear grey under the head and the brim, plus the ear's top outline under the brim
def ear_ext(p, poly, top):
    field = FIELD[p]
    hid = hidden('hat', 'body')
    paint_fill(p, cov_poly(poly, smooth=False), field, hid)
    paint_stroke(p, top, OUTLINE_W, hid)
EAR_L_POLY = [(298, 384), (362, 377), (392, 392), (392, 458), (345, 464)]
EAR_L_TOP = [(292, 391), (325, 386), (360, 383)]
ear_ext('earL', EAR_L_POLY, EAR_L_TOP)
ear_ext('earR', mirror(EAR_L_POLY), mirror(EAR_L_TOP))

# 5) horns: continue each horn under the hat (and under ear/head) towards the head
def horn_ext(p, poly, top, bottom):
    field = FIELD[p]
    hid = hidden('hat', 'body', 'earL', 'earR')
    paint_fill(p, cov_poly(poly, smooth=False), field, hid)
    paint_stroke(p, top, OUTLINE_W, hid)
    paint_stroke(p, bottom, OUTLINE_W, hid)
HORN_L_POLY = [(318, 306), (405, 318), (410, 405), (300, 394), (294, 372)]
HORN_L_TOP = [(330, 314), (362, 322), (405, 330)]
HORN_L_BOT = [(296, 383), (340, 392), (400, 398)]
horn_ext('hornL', HORN_L_POLY, HORN_L_TOP, HORN_L_BOT)
horn_ext('hornR', mirror(HORN_L_POLY), mirror(HORN_L_TOP), mirror(HORN_L_BOT))

# 6) arms: FRONT = drawn arm + a 10 px pad of original body pixels over the open side (seamless at rest)
#          FREE  = drawn arm + an outline closing the open side (used behind the body for big poses)
for p, cut in (('armL', CUT_L), ('armR', CUT_R)):
    rp, ap = layers[p]
    pad = dilate(region[p] & ~plates, 10) & region['body'] & (yy < 640)
    rf, af = rp.copy(), ap.copy()
    rf[pad] = a[pad]; af[pad] = 1
    layers[p + '_front'] = (rf, af)
    layers[p + '_free'] = (rp.copy(), ap.copy())
del layers['armL'], layers['armR']

# 6b) FREE arms (phase 2): fatter and rounded. The inner side moves D px into the body (hidden at rest, the
# free arm sits behind the body), tapering back to the drawn line at the hand; the drawn inner outline is
# painted over with the arm's own grey and a new outline at the drawing's weight closes the shape.
def sstep(a0, a1, x):
    t = min(max((x - a0) / (a1 - a0), 0.0), 1.0); return t * t * (3 - 2 * t)
plates_d = dilate(plates, 3)
for p, edge, sgn, t0, t1 in (('armL', EDGE_L, 1, 688, 742), ('armR', EDGE_R, -1, 700, 748)):
    D = 24.0
    rp, ap = layers[p + '_free']
    known = (owner == p) & (L > 95) & ~NEAR_INK & ~band & ~plates
    field = pushpull(a, known)
    pts = catmull(edge, 6)
    off = [D * (1 - sstep(t0, t1, y)) for x, y in pts]
    inner = [(x + sgn * o, y) for (x, y), o in zip(pts, off)]
    (xa, ya), (xb, yb) = pts[0], inner[0]
    cxm, r = (xa + xb) / 2, abs(xb - xa) / 2
    cap = [(cxm - sgn * r * np.cos(u), ya - 0.8 * r * np.sin(u)) for u in np.linspace(0, np.pi, 16)]
    poly = pts + inner[::-1] + cap[::-1][1:-1]
    cov = cov_poly(poly)
    deep = [q for q, o in zip(pts, off) if o > 3]
    old_line = (cov_stroke(deep, OUTLINE_W + 8) > 0.02) & ((ap > 0.02) | (cov > 0.5)) & ~plates_d
    rp[old_line] = field[old_line]; ap[old_line] = 1.0
    paint_fill(p + '_free', cov, field, ~plates_d)
    paint_stroke(p + '_free', cap + inner, OUTLINE_W, ~plates_d)

# 7) face features: original pixels plus a 2 px halo of the surrounding grey (invisible on the face)
for f, m in feat.items():
    halo1 = dilate(m, 1); halo2 = dilate(m, 2) & ~halo1
    others = FEAT_ALL & ~m
    fa = np.where(halo1, 1.0, 0) + np.where(halo2, 0.5, 0)
    fa[dilate(others, 1) & ~m] = 0               # never carry a neighbour feature in the halo
    fr = a.copy()
    layers[f] = (fr, fa.astype(np.float32))

# ---------------------------------------------------------------- ground shadow + clean background plate
SHADOW = dict(cx=520.0, cy=872.0, rx=222.0, ry=39.0)
shc = cov_ellipse(SHADOW['cx'], SHADOW['cy'], SHADOW['rx'], SHADOW['ry'])
layers['shadow'] = (np.broadcast_to(SH, (H, W, 3)).copy(), shc)
bg_known = out & (shc < 0.01) & ~dilate(sil, 3)
bg_plate = pushpull(a, bg_known)
Image.fromarray(np.clip(bg_plate, 0, 255).astype(np.uint8)).save(os.path.join(WORK, 'bg_plate.png'))
Image.fromarray(np.clip(plate, 0, 255).astype(np.uint8)).save(os.path.join(WORK, 'plate_with_shadow.png'))

# ---------------------------------------------------------------- save cropped parts + metadata
PIVOTS = {   # pixel coordinates in the 1024 drawing
    'root': (520, 872), 'body': (520, 840), 'neck': (520, 560), 'head_top': (520, 300),
    'hat': (520, 385), 'hat_tip': (520, 235),
    'earL': (350, 418), 'earL_tip': (250, 425), 'earR': (689, 418), 'earR_tip': (789, 425),
    'armL': (336, 580), 'armL_elbow': (296, 660), 'armL_hand': (300, 745),
    'armR': (703, 580), 'armR_elbow': (745, 660), 'armR_hand': (742, 735),
    'legL': (418, 805), 'legL_foot': (418, 872), 'legR': (622, 805), 'legR_foot': (622, 872),
    'eyeL': (435.5, 451), 'eyeR': (604.5, 451), 'snout': (520, 481), 'mouth': (520, 507),
}
LAYER_Z = {'shadow': 0.00, 'hornL': 0.10, 'hornR': 0.10, 'earL': 0.20, 'earR': 0.20,
           'armL_free': 0.25, 'armR_free': 0.25, 'body': 0.30, 'armL_front': 0.40, 'armR_front': 0.40,
           'mouth': 0.50, 'snout': 0.51, 'eyeL': 0.52, 'eyeR': 0.52, 'hat': 0.60}
meta = {'canvas': [W, H], 'pivots': PIVOTS, 'shadow': SHADOW, 'parts': {}}
owner_dbg = np.zeros((H, W, 3), np.uint8)
pal = {'hat': (240, 200, 60), 'armL': (60, 140, 255), 'armR': (40, 200, 120), 'body': (150, 150, 150),
       'earL': (255, 120, 60), 'earR': (255, 60, 160), 'hornL': (200, 200, 255), 'hornR': (120, 255, 255),
       'eyeL': (255, 0, 0), 'eyeR': (255, 0, 0), 'snout': (160, 0, 200), 'mouth': (0, 0, 0)}
for p, c in pal.items():
    owner_dbg[owner == p] = c
Image.fromarray(owner_dbg).save(os.path.join(WORK, 'owner.png'))
for p, (rp, ap) in layers.items():
    ys, xs = np.nonzero(ap > 0.002)
    x0, y0 = max(xs.min() - 4, 0), max(ys.min() - 4, 0)
    x1, y1 = min(xs.max() + 5, W), min(ys.max() + 5, H)
    # bleed colours into transparent pixels so texture filtering never pulls in black
    known = ap > 0.5
    rp2 = pushpull(rp, known) if known.any() else rp
    save_rgba(os.path.join(OUT, p + '.png'), rp2[y0:y1, x0:x1], ap[y0:y1, x0:x1])
    meta['parts'][p] = {'file': p + '.png', 'x0': int(x0), 'y0': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0),
                        'z': LAYER_Z.get(p, 0.5)}
json.dump(meta, open(os.path.join(OUT, 'parts.json'), 'w'), indent=1)
print('parts:', ', '.join(f"{p} {v['w']}x{v['h']}@{v['x0']},{v['y0']}" for p, v in meta['parts'].items()))
