"""Shared helpers for the eagle cut-out build (numpy + PIL only)."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))          # .../blender/eagle
SRC = os.path.normpath(os.path.join(ROOT, '..', '..', 'eagle_3.png'))       # design/mascots/eagle_3.png
W = H = 1024

def load_rgb(p=SRC):
    return np.array(Image.open(p).convert('RGB')).astype(np.float32)

def lum(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114

def flood(mask, seed):
    """Connected region of True pixels in mask containing seed (4-connected, PIL floodfill)."""
    img = Image.fromarray((mask * 255).astype(np.uint8)).copy()  # PIL 13 fromarray is zero-copy; writes would be lost
    x, y = int(seed[0]), int(seed[1])
    if not mask[y, x]:
        raise ValueError(f'seed {seed} not in mask')
    ImageDraw.floodfill(img, (x, y), 128)
    return np.array(img) == 128

def dilate(m, r):
    if r <= 0: return m.copy()
    img = Image.fromarray((m * 255).astype(np.uint8))
    for _ in range(r):
        img = img.filter(ImageFilter.MaxFilter(3))
    return np.array(img) > 127

def erode(m, r):
    return ~dilate(~m, r)

def geodesic(seed, passable, steps):
    """Chessboard geodesic distance from seed pixels through passable pixels, up to steps."""
    d = np.full(seed.shape, 999, np.int32)
    d[seed] = 0
    cur = seed.copy()
    for s in range(1, steps + 1):
        nxt = dilate(cur, 1) & passable & (d == 999)
        d[nxt] = s
        cur = cur | nxt
    return d

def pushpull(rgb, known):
    """Smooth fill of unknown pixels from known ones (push-pull pyramid). rgb float HxWx3, known bool."""
    levels = []
    c = rgb * known[..., None]; w = known.astype(np.float32)
    while min(c.shape[:2]) > 1:
        levels.append((c, w))
        h2, w2 = c.shape[0] // 2, c.shape[1] // 2
        c = c[:h2*2, :w2*2].reshape(h2, 2, w2, 2, 3).sum((1, 3))
        w = w[:h2*2, :w2*2].reshape(h2, 2, w2, 2).sum((1, 3))
        # normalise so weights stay in [0,1]
        cw = np.minimum(w, 1.0)
        c = np.where(w[..., None] > 0, c / np.maximum(w, 1e-6)[..., None] * cw[..., None], 0)
        w = cw
    est = c / np.maximum(w, 1e-6)[..., None]
    for (c, w) in reversed(levels):
        up = np.repeat(np.repeat(est, 2, 0), 2, 1)[:c.shape[0], :c.shape[1]]
        if up.shape[:2] != c.shape[:2]:   # odd sizes: extend the last row/column
            up = np.pad(up, ((0, c.shape[0] - up.shape[0]), (0, c.shape[1] - up.shape[1]), (0, 0)), mode='edge')
        # blur the upsampled estimate a little to avoid blockiness
        up = np.array(Image.fromarray(np.clip(up, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1))).astype(np.float32) if up.shape[0] > 8 else up
        mine = c / np.maximum(w, 1e-6)[..., None]
        ww = np.minimum(w, 1.0)[..., None]
        est = mine * ww + up * (1 - ww)
    out = rgb.copy()
    out[~known] = est[~known]
    return out

def catmull(points, n=12):
    pts = [points[0]] + list(points) + [points[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = map(np.array, pts[i-1:i+3])
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t*t, t*t*t
            out.append(0.5*((2*p1) + (-p0+p2)*t + (2*p0-5*p1+4*p2-p3)*t2 + (-p0+3*p1-3*p2+p3)*t3))
    out.append(np.array(points[-1], float))
    return [tuple(p) for p in out]

SS = 4
def cov_poly(points, smooth=True):
    """Anti-aliased coverage (0..1) of a filled polygon, 1024 grid."""
    pts = catmull(points) if smooth else points
    img = Image.new('L', (W*SS, H*SS), 0)
    ImageDraw.Draw(img).polygon([(x*SS, y*SS) for x, y in pts], fill=255)
    return np.array(img.resize((W, H), Image.BOX)).astype(np.float32) / 255

def cov_stroke(points, width, smooth=True, cap=True):
    """Anti-aliased coverage of a round-capped stroke along a polyline."""
    pts = catmull(points) if smooth else points
    img = Image.new('L', (W*SS, H*SS), 0)
    d = ImageDraw.Draw(img)
    P = [(x*SS, y*SS) for x, y in pts]
    r = width*SS/2
    d.line(P, fill=255, width=int(round(width*SS)), joint='curve')
    ends = P if True else []
    for (x, y) in (P if cap else P[1:-1]):
        d.ellipse([x-r, y-r, x+r, y+r], fill=255)
    return np.array(img.resize((W, H), Image.BOX)).astype(np.float32) / 255

def cov_ellipse(cx, cy, rx, ry, angle=0.0):
    t = np.linspace(0, 2*np.pi, 200, endpoint=False)
    ca, sa = np.cos(np.radians(angle)), np.sin(np.radians(angle))
    pts = [(cx + rx*np.cos(a)*ca - ry*np.sin(a)*sa, cy + rx*np.cos(a)*sa + ry*np.sin(a)*ca) for a in t]
    return cov_poly(pts, smooth=False)

def save_rgba(path, rgb, a):
    out = np.dstack([np.clip(rgb, 0, 255), np.clip(a, 0, 1) * 255]).astype(np.uint8)
    Image.fromarray(out, 'RGBA').save(path)
