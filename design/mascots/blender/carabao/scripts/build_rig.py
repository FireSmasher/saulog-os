"""Step 3: build the Blender cut-out rig from parts/ and bake all mood animations.

Run headless (rerunnable, rebuilds from scratch):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P scripts/build_rig.py
Saves carabao_rig.blend next to this folder's parts/ (image paths stored relative).

Space: 1 drawing px = 0.01 m. World X = (px - 512) * 0.01, world Y = (512 - py) * 0.01, Z = layer.
Ortho camera at Z=10 looking down, ortho scale 10.24, so a 1024 render lines up pixel for pixel
with carabao_7.png. Textures are Non-Color and the view transform is Raw, so layers blend in
sRGB numbers exactly like the drawing's own anti-aliasing (no linear-light halos).

Bones all point at the camera (+Z). A pose is a 2D transform T around the bone's pivot,
relative to its parent: matrix_basis = B^-1 @ T @ B (B = bone rest matrix).
Timeline (30 fps, every segment loops every 90 frames):
  0 rest | 1-90 idle | 101-190 happy | 201-290 tired | 301-390 fire | 401-490 wave | 501-590 talk"""
import bpy, json, math, os, sys
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
P = os.path.join(ROOT, 'parts')
meta = json.load(open(os.path.join(P, 'parts.json')))
PIV = meta['pivots']
S = 0.01
def wx(px): return (px - 512) * S
def wy(py): return (512 - py) * S

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'Carabao'
coll = scene.collection

# ---------------------------------------------------------------- render settings
scene.render.engine = 'CYCLES'
cy = scene.cycles
cy.device = 'CPU'
cy.samples = 24
cy.use_adaptive_sampling = False
cy.use_denoising = False
cy.max_bounces = 1
for k in ('diffuse_bounces', 'glossy_bounces', 'transmission_bounces', 'volume_bounces'):
    setattr(cy, k, 0)
cy.transparent_max_bounces = 64
cy.pixel_filter_type = 'BLACKMAN_HARRIS'
cy.filter_width = 1.5
cy.seed = 0
scene.render.film_transparent = True
scene.render.dither_intensity = 0.0
scene.render.resolution_x = scene.render.resolution_y = 768
scene.render.resolution_percentage = 100
scene.render.fps = 30
scene.render.threads_mode = 'FIXED'
scene.render.threads = 4
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'
try:
    scene.view_settings.view_transform = 'Raw'
except TypeError:
    scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0.0
scene.view_settings.gamma = 1.0
scene.world = bpy.data.worlds.new('World')
scene.world.color = (0, 0, 0)
scene.frame_start, scene.frame_end = 0, 590

cam_data = bpy.data.cameras.new('Cam')
cam_data.type = 'ORTHO'
cam_data.ortho_scale = 10.24
cam_data.clip_start, cam_data.clip_end = 0.1, 30
cam = bpy.data.objects.new('Cam', cam_data)
cam.location = (0, 0, 10)
coll.objects.link(cam)
scene.camera = cam

# ---------------------------------------------------------------- armature
BONES = [  # name, parent, pivot key or px
    ('shadow', None, 'root'), ('root', None, 'root'),
    ('legL', 'root', 'legL'), ('legR', 'root', 'legR'),
    ('body', 'root', 'body'), ('head', 'body', 'neck'), ('hat', 'head', 'hat'),
    ('earL', 'head', 'earL'), ('earR', 'head', 'earR'),
    ('eyeL', 'head', 'eyeL'), ('eyeR', 'head', 'eyeR'),
    ('snout', 'head', 'snout'), ('mouth', 'head', 'mouth'),
    ('armL_up', 'body', 'armL'), ('armL_lo', 'armL_up', 'armL_elbow'),
    ('armR_up', 'body', 'armR'), ('armR_lo', 'armR_up', 'armR_elbow'),
]
ad = bpy.data.armatures.new('CarabaoRig')
arm = bpy.data.objects.new('CarabaoRig', ad)
coll.objects.link(arm)
arm.show_in_front = True
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for name, parent, pk in BONES:
    px, py = PIV[pk]
    eb = ad.edit_bones.new(name)
    eb.head = (wx(px), wy(py), 0.0)
    eb.tail = (wx(px), wy(py), 0.5)
    eb.roll = 0.0
    if parent:
        eb.parent = ad.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
for b in ad.bones:   # bone X must be world X so 2D scale stays axis aligned
    m = b.matrix_local
    assert abs(m[0][0] - 1) < 1e-5 and abs(m[2][1] - 1) < 1e-5, (b.name, m)
for pb in arm.pose.bones:
    pb.rotation_mode = 'XYZ'

# ---------------------------------------------------------------- sprites
def smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def make_material(name, img_path):
    img = bpy.data.images.load(img_path, check_existing=True)
    img.alpha_mode = 'STRAIGHT'
    img.colorspace_settings.name = 'Non-Color'
    mat = bpy.data.materials.new(name)
    if mat.node_tree is None:   # Blender 5 materials come with a node tree; older ones need use_nodes
        mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
    tex.interpolation = 'Linear'; tex.extension = 'CLIP'
    oi = nt.nodes.new('ShaderNodeObjectInfo')
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = 1.0
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    L = nt.links
    L.new(tex.outputs['Color'], em.inputs['Color'])
    L.new(tex.outputs['Alpha'], mul.inputs[0])
    L.new(oi.outputs['Alpha'], mul.inputs[1])
    L.new(mul.outputs[0], mix.inputs['Fac'])
    L.new(tr.outputs[0], mix.inputs[1])
    L.new(em.outputs[0], mix.inputs[2])
    L.new(mix.outputs[0], out.inputs['Surface'])
    return mat

OBJ = {}
def sprite(part, z=None, cell=None, weights=None, anchor=None, name=None):
    """Plane for one part. cell: grid size in px (deforming parts). weights(px,py)->{bone:w}.
    anchor: local px of the object origin (fx sprites, not deformed by the rig)."""
    m = meta['parts'][part]
    name = name or part
    w, h = m['w'], m['h']
    if anchor is None:
        x0, y0 = m['x0'], m['y0']
    nx = max(1, round(w / cell)) if cell else 1
    ny = max(1, round(h / cell)) if cell else 1
    verts, uvs, pxy = [], [], []
    for j in range(ny + 1):
        for i in range(nx + 1):
            lx, ly = w * i / nx, h * j / ny
            if anchor is None:
                X, Y = wx(x0 + lx), wy(y0 + ly)
                pxy.append((x0 + lx, y0 + ly))
            else:
                X, Y = (lx - anchor[0]) * S, (anchor[1] - ly) * S
            verts.append((X, Y, 0.0)); uvs.append((i / nx, 1 - j / ny))
    faces = [(j * (nx + 1) + i, (j + 1) * (nx + 1) + i, (j + 1) * (nx + 1) + i + 1, j * (nx + 1) + i + 1)
             for j in range(ny) for i in range(nx)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    uvl = me.uv_layers.new(name='UV')
    for loop in me.loops:
        uvl.data[loop.index].uv = uvs[loop.vertex_index]
    me.materials.append(make_material(name, os.path.join(P, m['file'])))
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    ob.location.z = m.get('z', 0.5) if z is None else z
    if weights is not None:
        ob.parent = arm
        groups = {}
        for vi, (px, py) in enumerate(pxy):
            for bone, wt in weights(px, py).items():
                if wt > 1e-4:
                    groups.setdefault(bone, []).append((vi, wt))
        for bone, lst in groups.items():
            vg = ob.vertex_groups.new(name=bone)
            for vi, wt in lst:
                vg.add([vi], wt, 'REPLACE')
        mod = ob.modifiers.new('Armature', 'ARMATURE')
        mod.object = arm
    OBJ[name] = ob
    return ob

def rigid(bone):
    return lambda px, py: {bone: 1.0}

def body_w(px, py):
    head = 1 - smooth(520, 600, py)
    legs = smooth(780, 834, py)          # phase 2: wider blend, less shear in the stomp
    lw = legs * (1 - smooth(505, 535, px)); rw = legs * smooth(505, 535, px)
    body = max(0.0, 1 - head - legs)
    return {'head': head, 'body': body, 'legL': lw, 'legR': rw}

def arm_w(side):
    sx, sy = PIV['arm' + side]; ex, ey = PIV['arm' + side + '_elbow']; hx, hy = PIV['arm' + side + '_hand']
    ax, ay = hx - sx, hy - sy; L2 = ax * ax + ay * ay
    se = ((ex - sx) * ax + (ey - sy) * ay) / L2
    def f(px, py):
        t = ((px - sx) * ax + (py - sy) * ay) / L2
        lo = smooth(se - 0.16, se + 0.16, t)
        return {'arm' + side + '_up': 1 - lo, 'arm' + side + '_lo': lo}
    return f

sprite('shadow', weights=rigid('shadow'))
for s in 'LR':
    sprite('horn' + s, weights=rigid('head'))
    sprite('ear' + s, weights=rigid('ear' + s))
    sprite('arm' + s + '_free', cell=7, weights=arm_w(s))
    sprite('arm' + s + '_front', cell=7, weights=arm_w(s))
    for v in ('', '_half', '_tired', '_closed', '_happy'):
        sprite('eye' + s + v, weights=rigid('eye' + s))
sprite('body', cell=9, weights=body_w)
sprite('hat', cell=12, weights=lambda px, py: {'hat': 1.0})
for v in ('', '_flat', '_smile', '_o', '_yawn', '_open', '_grin'):
    sprite('mouth' + v, weights=rigid('mouth'))
sprite('snout', weights=rigid('snout'))
sprite('snout_closed', weights=rigid('snout'))
sprite('blush', weights=rigid('head'))
sw = sprite('sweat', z=0.56, anchor=meta['parts']['sweat']['anchor'])
sw.parent = arm
vg = sw.vertex_groups.new(name='head'); vg.add(list(range(len(sw.data.vertices))), 1.0, 'REPLACE')
sw.modifiers.new('Armature', 'ARMATURE').object = arm

# fx (world space)
FX = {}
def fx(part, name, z):
    ob = sprite(part, z=z, anchor=meta['parts'][part]['anchor'], name=name)
    FX[name] = ob
    return ob

FLAMES = []
NF = 18
for k in range(NF):
    th = -150 + 300 * k / (NF - 1)               # degrees from straight up, around the body
    r = math.radians(th)
    bx, by = 520 + 245 * math.sin(r), 600 - 290 * math.cos(r)
    size = 0.62 + 0.38 * abs(math.sin(r)) if abs(th) < 120 else 0.85
    FLAMES.append((fx('flame%d' % (k % 3), 'fire_flame%02d' % k, 0.04 + 0.0001 * k), bx, by, th * 0.42, size, k))
fx('glow', 'fire_glow', 0.02)
fx('pool', 'fire_pool', 0.006)
RINGS = [fx('ring', 'fire_ring%d' % i, 0.007 + 0.0001 * i) for i in range(2)]
STREAKS = [fx('streak', 'fire_streak%d' % i, 0.035 + 0.0001 * i) for i in range(6)]
SPARKS = [fx('spark', 'fire_spark%d' % i, 0.71 + 0.001 * i) for i in range(4)]
SPARKLES = [fx('sparkle', 'happy_sparkle%d' % i, 0.72 + 0.001 * i) for i in range(4)]

GROUPS = {
    'eyeL': ['eyeL', 'eyeL_half', 'eyeL_tired', 'eyeL_closed', 'eyeL_happy'],
    'eyeR': ['eyeR', 'eyeR_half', 'eyeR_tired', 'eyeR_closed', 'eyeR_happy'],
    'mouth': ['mouth', 'mouth_flat', 'mouth_smile', 'mouth_o', 'mouth_yawn', 'mouth_open', 'mouth_grin'],
    'snout': ['snout', 'snout_closed'], 'armL': ['armL_front', 'armL_free'], 'armR': ['armR_front', 'armR_free'],
    'blush': ['blush'], 'shadow': ['shadow'], 'sweat': ['sweat'],
}

# ---------------------------------------------------------------- moods: functions of phase p in [0,1)
TAU = math.tau
def sn(p, k=1, ph=0.0): return math.sin(TAU * k * p + ph)
def pulse(i, a, b):     # 0..1..0 between frame a and b (smooth)
    if i <= a or i >= b: return 0.0
    return math.sin(math.pi * (i - a) / (b - a))
def keys(p, pts):        # piecewise smooth through (p, value) points, pts sorted, wraps at 1
    pts = pts + [(pts[0][0] + 1, pts[0][1])]
    for (p0, v0), (p1, v1) in zip(pts, pts[1:]):
        if p0 <= p < p1:
            t = (p - p0) / (p1 - p0); t = t * t * (3 - 2 * t)
            return v0 + (v1 - v0) * t
    return pts[0][1]

def blank():
    return {'bones': {}, 'face': {'eyes': 'open', 'mouth': 'rest', 'blush': False},
            'fx': {}, 'sweat': None, 'shadow': True}

def B(st, bone, rot=0.0, sx=1.0, sy=1.0, ux=0.0, uy=0.0):
    st['bones'][bone] = (rot, sx, sy, ux, uy)

def blink_eyes(st, i, at):
    seq = {0: 'half', 1: 'closed', 2: 'closed', 3: 'half'}
    if 0 <= i - at <= 3:
        st['face']['eyes'] = seq[i - at]

def idle(i):
    p = i / 90.0; st = blank(); b = sn(p)
    B(st, 'body', sx=1 - 0.008 * b, sy=1 + 0.014 * b)
    B(st, 'head', rot=1.2 * sn(p, 1, 0.6))
    B(st, 'hat', rot=-0.9 * sn(p, 1, 0.9))
    flick = pulse(i, 24, 32)
    B(st, 'earL', rot=-3 * sn(p, 1, 0.3))
    B(st, 'earR', rot=3 * sn(p, 1, 0.8) - 9 * flick)
    lx = keys(p, [(0.0, 0), (0.1, 0), (0.18, 7), (0.38, 7), (0.47, -7), (0.62, -7), (0.72, 0)])
    ly = keys(p, [(0.0, 0), (0.1, 0), (0.18, 1.5), (0.38, 1.5), (0.47, 0), (0.72, 0)])
    for e in ('eyeL', 'eyeR'):
        B(st, e, ux=lx, uy=ly)
    blink_eyes(st, i, 50)
    q = (i - 66) / 10.0
    if 0 < q < 1:
        k = math.sin(3 * math.pi * q) * (1 - q)
        B(st, 'snout', sx=1 + 0.14 * k, sy=1 - 0.07 * k)
    B(st, 'armL_up', rot=0.8 * sn(p, 1, 0.3))
    B(st, 'armL_lo', rot=2.5 * sn(p, 1, 0.3))
    B(st, 'armR_up', rot=-0.8 * sn(p, 1, 1.0))
    return st

def happy(i):
    p = i / 90.0; st = blank()
    q = (2 * p) % 1.0
    if q < 0.22:
        c = math.sin(math.pi * q / 0.22); hgt = 0.0
        B(st, 'root', sx=1 + 0.08 * c, sy=1 - 0.10 * c)
    else:
        t = (q - 0.22) / 0.78; hgt = 70 * math.sin(math.pi * t); c = 0.0
        B(st, 'root', sx=1 - 0.02 * math.sin(math.pi * t), sy=1 + 0.04 * math.sin(math.pi * t), uy=hgt)
    s = 1 - 0.35 * hgt / 70
    B(st, 'shadow', sx=s, sy=s)
    B(st, 'head', rot=3 * sn(p, 2, 0.4))
    B(st, 'hat', rot=2.5 * sn(p, 2, 1.4), uy=-4 * c)
    B(st, 'earL', rot=-10 + 5 * sn(p, 4))
    B(st, 'earR', rot=10 - 5 * sn(p, 4))
    w = sn(p, 4)
    B(st, 'armL_up', rot=-(125 + 14 * w)); B(st, 'armL_lo', rot=-12 * sn(p, 4, -0.7))
    B(st, 'armR_up', rot=125 - 14 * w);     B(st, 'armR_lo', rot=12 * sn(p, 4, 2.4))
    st['face'] = {'eyes': 'happy', 'mouth': 'open', 'blush': True}
    spots = [(268, 262), (778, 282), (212, 520), (832, 548)]
    for k, (x, y) in enumerate(spots):
        ph = ((2 * p + k * 0.25) % 1.0)
        sc = math.sin(math.pi * min(1.0, ph / 0.6)) if ph < 0.6 else 0.0
        if sc > 0.02:
            st['fx']['happy_sparkle%d' % k] = (x, y - (hgt * 0.3), 90 * ph, 0.55 + 0.6 * sc, 0.55 + 0.6 * sc, 1.0)
    return st

def tired(i):
    p = i / 90.0; st = blank(); b = sn(p)
    B(st, 'body', sx=1 - 0.012 * b, sy=0.975 + 0.02 * b)
    yawn = pulse(i, 30, 64)
    B(st, 'head', rot=-(3 + 2 * sn(p, 1, 0.5)) + 3 * yawn)
    B(st, 'hat', rot=-3.5 + 0.8 * sn(p, 1, 1.2))
    B(st, 'earL', rot=12 + 2 * sn(p, 1, 0.2))
    B(st, 'earR', rot=-12 - 2 * sn(p, 1, 0.9))
    B(st, 'armL_up', rot=1.5 + 1.0 * b); B(st, 'armL_lo', rot=2.0 * b)
    B(st, 'armR_up', rot=-1.0 - 0.8 * b)
    for e in ('eyeL', 'eyeR'):
        B(st, e, uy=-1.5)
    st['face']['eyes'] = 'tired'
    if 31 <= i <= 63:
        st['face']['eyes'] = 'half' if i in (31, 63) else 'closed'
        st['face']['mouth'] = 'yawn'
        k = 0.55 + 0.45 * yawn
        B(st, 'mouth', sx=k, sy=k, uy=-3 * (1 - yawn))
    d = (p * 1.0) % 1.0
    st['sweat'] = (0.0, -42 * d, 1.0 if d < 0.8 else max(0.0, 1 - (d - 0.8) / 0.2))
    return st

def fire(i):
    p = i / 90.0; st = blank()
    B(st, 'root', ux=2.0 * sn(p, 11), uy=1.5 * sn(p, 13, 1.0))
    st['shadow'] = False
    stp = sn(p, 3)
    B(st, 'legL', uy=4 * max(0.0, stp)); B(st, 'legR', uy=4 * max(0.0, -stp))
    b = sn(p, 3, 0.5)
    B(st, 'body', sx=1 - 0.01 * b, sy=1.02 + 0.015 * b)
    B(st, 'head', rot=2.0 * sn(p, 3, 1.0))
    B(st, 'hat', rot=-2.0 * sn(p, 3, 1.6))
    B(st, 'earL', rot=-12 + 3 * sn(p, 6)); B(st, 'earR', rot=12 - 3 * sn(p, 6))
    f = sn(p, 3)
    B(st, 'armL_up', rot=-(92 + 14 * f)); B(st, 'armL_lo', rot=-(55 + 18 * f))
    B(st, 'armR_up', rot=92 + 14 * f);    B(st, 'armR_lo', rot=55 + 18 * f)
    st['face'] = {'eyes': 'happy', 'mouth': 'grin', 'blush': True}
    for ob, bx, by, rot, size, k in FLAMES:
        fl = 0.86 + 0.18 * sn(p, 3 + k % 3, k * 1.7)
        st['fx'][ob.name] = (bx, by, rot + 4 * sn(p, 2, k), size * (1 - 0.06 * sn(p, 4, k)), size * fl, 1.0)
    st['fx']['fire_glow'] = (520, 590, 0, 1.75, 1.75, 0.80 + 0.12 * sn(p, 3))
    st['fx']['fire_pool'] = (520, 872, 0, 1.0 + 0.03 * sn(p, 3), 1.0 + 0.05 * sn(p, 3), 1.0)
    for k, ob in enumerate(RINGS):
        r = (3 * p + k * 0.5) % 1.0
        st['fx'][ob.name] = (520, 872, 0, 0.75 + 0.75 * r, 0.75 + 0.75 * r, (1 - r) ** 1.5)
    xs = [262, 778, 300, 742, 222, 818]
    for k, ob in enumerate(STREAKS):
        r = (2 * p + k / 6.0) % 1.0
        st['fx'][ob.name] = (xs[k], 900 - 620 * r, 0, 1.0, 0.8 + 0.4 * r, math.sin(math.pi * r) * 0.85)
    sp = [(238, 330, -12), (800, 350, 14), (196, 610, -20), (846, 640, 22)]
    for k, ob in enumerate(SPARKS):
        r = (3 * p + k * 0.27) % 1.0
        if r < 0.22:
            a = math.sin(math.pi * r / 0.22)
            st['fx'][ob.name] = (sp[k][0], sp[k][1], sp[k][2], 0.7, 0.7, a)
    return st

def wave(i):
    p = i / 90.0; st = blank(); b = sn(p)
    B(st, 'body', rot=-1.5, sx=1 - 0.008 * b, sy=1 + 0.012 * b)
    B(st, 'head', rot=-3 + 1.2 * sn(p, 5, 0.6))
    B(st, 'hat', rot=1.5 * sn(p, 5, 1.6))
    B(st, 'earL', rot=-4 + 3 * sn(p, 5, 0.4)); B(st, 'earR', rot=4 - 3 * sn(p, 5, 0.9))
    w = sn(p, 5)
    B(st, 'armR_up', rot=108 + 16 * w); B(st, 'armR_lo', rot=18 * sn(p, 5, -0.9))
    B(st, 'armL_up', rot=0.8 * b); B(st, 'armL_lo', rot=2 * b)
    st['face']['mouth'] = 'smile'
    for e in ('eyeL', 'eyeR'):
        B(st, e, ux=3.0)
    blink_eyes(st, i, 62)
    return st

TALK = ['o', 'smile', 'o', 'flat', 'rest', 'o', 'smile', 'flat', 'o', 'rest', 'smile', 'o', 'flat', 'o', 'rest',
        'smile', 'o', 'flat', 'o', 'rest', 'o', 'smile', 'rest']
def talk(i):
    p = i / 90.0; st = blank()
    B(st, 'body', sx=1 - 0.006 * sn(p, 2), sy=1 + 0.01 * sn(p, 2))
    B(st, 'head', rot=1.8 * sn(p, 4, 0.3))
    B(st, 'hat', rot=-1.0 * sn(p, 4, 1.1))
    B(st, 'earL', rot=-2 * sn(p, 2)); B(st, 'earR', rot=2 * sn(p, 2, 0.7))
    g = sn(p, 2)
    B(st, 'armR_up', rot=82 + 10 * g); B(st, 'armR_lo', rot=48 + 14 * sn(p, 2, -0.8))
    B(st, 'armL_up', rot=0.8 * sn(p, 1)); B(st, 'armL_lo', rot=2 * sn(p, 1))
    shape = TALK[min(len(TALK) - 1, i * len(TALK) // 90)] if i < 84 else 'rest'
    st['face']['mouth'] = shape
    if shape == 'o':
        k = 1.0 + 0.25 * abs(sn(p, 6))
        B(st, 'mouth', sx=k, sy=k)
    blink_eyes(st, i, 40)
    return st

SEGMENTS = [('idle', 1, idle), ('happy', 101, happy), ('tired', 201, tired), ('fire', 301, fire),
            ('wave', 401, wave), ('talk', 501, talk)]

# ---------------------------------------------------------------- apply + key
REST = {b.name: b.matrix_local.copy() for b in ad.bones}
FACE_EYES = {'open': '', 'half': '_half', 'tired': '_tired', 'closed': '_closed', 'happy': '_happy'}
FACE_MOUTH = {'rest': 'mouth', 'flat': 'mouth_flat', 'smile': 'mouth_smile', 'o': 'mouth_o', 'yawn': 'mouth_yawn',
              'open': 'mouth_open', 'grin': 'mouth_grin'}
ALL_SWITCH = [n for g in GROUPS.values() for n in g]

def apply(st, frame):
    fade = {}
    for s in 'LR':   # phase 2: front arm dissolves into the fat free arm over 3..10 deg; the shoulder slides in
        up = abs(st['bones'].get('arm' + s + '_up', (0,))[0]); lo = abs(st['bones'].get('arm' + s + '_lo', (0,))[0])
        m = max(up, 0.57 * lo); fade[s] = (m, 1 - smooth(3, 10, m))
        if 'arm' + s + '_up' in st['bones']:
            r_, sx_, sy_, ux_, uy_ = st['bones']['arm' + s + '_up']; k = smooth(6, 30, up)
            st['bones']['arm' + s + '_up'] = (r_, sx_, sy_, ux_ + (14 if s == 'L' else -14) * k, uy_ - 6 * k)
    for pb in arm.pose.bones:
        rot, sx, sy, ux, uy = st['bones'].get(pb.name, (0.0, 1.0, 1.0, 0.0, 0.0))
        pvt = REST[pb.name].to_translation()
        T = (Matrix.Translation(pvt + Vector((ux * S, uy * S, 0))) @ Matrix.Rotation(math.radians(rot), 4, 'Z')
             @ Matrix.Diagonal((sx, sy, 1.0, 1.0)) @ Matrix.Translation(-pvt))
        pb.matrix_basis = REST[pb.name].inverted() @ T @ REST[pb.name]
        for prop in ('location', 'rotation_euler', 'scale'):
            pb.keyframe_insert(prop, frame=frame)
    face = st['face']
    show = {'eyeL' + FACE_EYES[face['eyes']], 'eyeR' + FACE_EYES[face['eyes']], FACE_MOUTH[face['mouth']],
            'snout' if face['mouth'] == 'rest' else 'snout_closed'}
    if face['blush']: show.add('blush')
    if st['shadow']: show.add('shadow')
    for s in 'LR':
        m, a_ = fade[s]
        if m > 2: show.add('arm' + s + '_free')
        if a_ > 0.001: show.add('arm' + s + '_front')
        fo = OBJ['arm' + s + '_front']; fo.color[3] = a_; fo.keyframe_insert('color', index=3, frame=frame)
    if st['sweat'] is not None:
        show.add('sweat')
        dx, dy, a = st['sweat']
        sw.location.x = wx(650 + dx) ; sw.location.y = wy(418 - dy)
        sw.color[3] = a
        sw.keyframe_insert('location', frame=frame); sw.keyframe_insert('color', index=3, frame=frame)
    for n in ALL_SWITCH:
        ob = OBJ[n]; hide = n not in show
        ob.hide_render = hide; ob.hide_viewport = hide
        ob.keyframe_insert('hide_render', frame=frame); ob.keyframe_insert('hide_viewport', frame=frame)
    for n, ob in FX.items():
        v = st['fx'].get(n)
        ob.hide_render = ob.hide_viewport = v is None
        if v is not None:
            x, y, rot, sx, sy, a = v
            ob.location.x, ob.location.y = wx(x), wy(y)
            ob.rotation_euler.z = math.radians(rot)
            ob.scale = (sx, sy, 1.0)
            ob.color[3] = a
            ob.keyframe_insert('location', frame=frame); ob.keyframe_insert('rotation_euler', frame=frame)
            ob.keyframe_insert('scale', frame=frame); ob.keyframe_insert('color', index=3, frame=frame)
        ob.keyframe_insert('hide_render', frame=frame); ob.keyframe_insert('hide_viewport', frame=frame)

import time
t0 = time.time()
apply(blank(), 0)
for name, start, fn in SEGMENTS:
    for i in range(90):
        apply(fn(i), start + i)
print('keyed in %.1f s' % (time.time() - t0))
STILLS = {'rest': 0, 'happy': 101 + 27, 'tired': 201 + 12, 'yawn': 201 + 47, 'fire': 301 + 7,
          'wave': 401 + 4, 'talk': 501 + 52}
json.dump({'segments': {n: [s, s + 89] for n, s, _ in SEGMENTS}, 'stills': STILLS},
          open(os.path.join(ROOT, 'work', 'timeline.json'), 'w'), indent=1)
scene.frame_set(0)
out = os.path.join(ROOT, 'carabao_rig.blend')
bpy.ops.wm.save_as_mainfile(filepath=out, relative_remap=True, compress=True)
print('saved', out)
