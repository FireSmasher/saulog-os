"""Step 3: build the Blender cut-out rig from parts/ and bake all mood animations (method from ../carabao).

Run headless (rerunnable, rebuilds from scratch):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P scripts/build_rig.py
Saves tarsier_rig.blend next to this folder's parts/ (image paths stored relative).

Space: 1 drawing px = 0.01 m. World X = (px - 512) * 0.01, world Y = (512 - py) * 0.01, Z = layer.
Rest test (render_rig.py rest): ortho scale 10.24 centred, 1024 px = pixel match with tarsier_3.png.
Loops: ortho scale 11.52 centred on drawing y 470, so the 1.5x On-fire flame keeps head room.
Textures Non-Color + view Raw, so layers blend in sRGB numbers like the drawing.
Eyelids are shader planes: object colour R = lid amount (0 open .. 1 shut), G = outer droop.
Motion follows rig/tarsier-rig.html (locked by the owner); every rate is rounded to whole cycles per 3 s so
each mood is a seamless 90-frame loop. SVG angles (clockwise) become Blender angles (counter-clockwise) by -1.
Timeline (30 fps): 0 rest | 1-90 idle | 101-190 happy | 201-290 tired | 301-390 fire | 401-490 wave | 501-590 talk"""
import bpy, json, math, os, sys, random
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
P = os.path.join(ROOT, 'parts')
meta = json.load(open(os.path.join(P, 'parts.json')))
PIV = meta['pivots']; COL = meta['colours']
S = 0.01
def wx(px): return (px - 512) * S
def wy(py): return (512 - py) * S

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'Tarsier'
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
cy.min_transparent_bounces = 64   # no Russian roulette through stacked layers (it gave random over/under-bright pixels)
cy.min_light_bounces = 64
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
cam_data.ortho_scale = 11.52
cam_data.clip_start, cam_data.clip_end = 0.1, 30
cam = bpy.data.objects.new('Cam', cam_data)
cam.location = (0, wy(470), 10)
coll.objects.link(cam)
scene.camera = cam

# ---------------------------------------------------------------- armature
BONES = [  # name, parent, pivot key
    ('shadow', None, 'shadow'), ('root', None, 'root'),
    ('legL', 'root', 'legL'), ('legR', 'root', 'legR'),
    ('body', 'root', 'body'), ('head', 'body', 'neck'), ('flame', 'head', 'flame'),
    ('earL', 'head', 'earL'), ('earR', 'head', 'earR'),
    ('eyeL', 'head', 'eyeL'), ('eyeR', 'head', 'eyeR'), ('shineL', 'eyeL', 'shineL'), ('shineR', 'eyeR', 'shineR'),
    ('nose', 'head', 'nose'), ('mouth', 'head', 'mouth'),
    ('armL', 'body', 'armL'), ('armR', 'body', 'armR'),
    ('tail1', 'body', 'tail1'), ('tail2', 'tail1', 'tail2'),
]
ad = bpy.data.armatures.new('TarsierRig')
arm = bpy.data.objects.new('TarsierRig', ad)
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
for b in ad.bones:
    m = b.matrix_local
    assert abs(m[0][0] - 1) < 1e-5 and abs(m[2][1] - 1) < 1e-5, (b.name, m)
for pb in arm.pose.bones:
    pb.rotation_mode = 'XYZ'

# ---------------------------------------------------------------- materials + sprites
def smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def new_mat(name):
    mat = bpy.data.materials.new(name)
    if mat.node_tree is None:
        mat.use_nodes = True
    mat.node_tree.nodes.clear()
    return mat, mat.node_tree.nodes, mat.node_tree.links

def finish(nt, L, colour_sock, alpha_sock):
    em = nt.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = 1.0
    tr = nt.new('ShaderNodeBsdfTransparent'); mix = nt.new('ShaderNodeMixShader'); out = nt.new('ShaderNodeOutputMaterial')
    L.new(colour_sock, em.inputs['Color']); L.new(alpha_sock, mix.inputs['Fac'])
    L.new(tr.outputs[0], mix.inputs[1]); L.new(em.outputs[0], mix.inputs[2]); L.new(mix.outputs[0], out.inputs['Surface'])

def make_material(name, img_path):
    """Texture x object colour (tint), alpha x object alpha."""
    img = bpy.data.images.load(img_path, check_existing=True)
    img.alpha_mode = 'STRAIGHT'
    img.colorspace_settings.name = 'Non-Color'
    mat, nt, L = new_mat(name)
    tex = nt.new('ShaderNodeTexImage'); tex.image = img
    tex.interpolation = 'Linear'; tex.extension = 'CLIP'
    oi = nt.new('ShaderNodeObjectInfo')
    mul = nt.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
    tint = nt.new('ShaderNodeVectorMath'); tint.operation = 'MULTIPLY'
    L.new(tex.outputs['Color'], tint.inputs[0]); L.new(oi.outputs['Color'], tint.inputs[1])
    L.new(tex.outputs['Alpha'], mul.inputs[0]); L.new(oi.outputs['Alpha'], mul.inputs[1])
    finish(nt, L, tint.outputs[0], mul.outputs[0])
    return mat

OBJ = {}
def mesh_obj(name, verts, uvs, faces, mat, z):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    uvl = me.uv_layers.new(name='UV')
    for loop in me.loops:
        uvl.data[loop.index].uv = uvs[loop.vertex_index]
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    ob.location.z = z
    OBJ[name] = ob
    return ob

def rig_to(ob, pxy, weights):
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
    ob.modifiers.new('Armature', 'ARMATURE').object = arm

def sprite(part, z=None, cell=None, weights=None, anchor=None, name=None):
    m = meta['parts'][part]
    name = name or part
    w, h = m['w'], m['h']
    nx = max(1, round(w / cell)) if cell else 1
    ny = max(1, round(h / cell)) if cell else 1
    verts, uvs, pxy = [], [], []
    for j in range(ny + 1):
        for i in range(nx + 1):
            lx, ly = w * i / nx, h * j / ny
            if anchor is None:
                X, Y = wx(m['x0'] + lx), wy(m['y0'] + ly); pxy.append((m['x0'] + lx, m['y0'] + ly))
            else:
                X, Y = (lx - anchor[0]) * S, (anchor[1] - ly) * S
            verts.append((X, Y, 0.0)); uvs.append((i / nx, 1 - j / ny))
    faces = [(j * (nx + 1) + i, (j + 1) * (nx + 1) + i, (j + 1) * (nx + 1) + i + 1, j * (nx + 1) + i + 1)
             for j in range(ny) for i in range(nx)]
    ob = mesh_obj(name, verts, uvs, faces, make_material(name, os.path.join(P, m['file'])), m.get('z', 0.5) if z is None else z)
    if weights is not None:
        rig_to(ob, pxy, weights)
    return ob

def rigid(bone):
    return lambda px, py: {bone: 1.0}

def body_w(px, py):
    head = 1 - smooth(548, 598, py)
    legs = smooth(798, 838, py)
    lw = legs * (1 - smooth(462, 478, px)); rw = legs * smooth(548, 564, px)
    return {'head': head, 'body': max(0.0, 1 - head - lw - rw), 'legL': lw, 'legR': rw}

def tail_w(px, py):
    t2 = smooth(700, 770, px)
    return {'tail1': 1 - t2, 'tail2': t2}

# eyelid: shader plane over the eye disc (continuous blink, droop and yawn)
def lid_plane(side):
    cx, cy0, r = meta['eyes']['eye' + side]
    pad = 6; Sz = 2 * r + 2 * pad; x0, y0 = cx - r - pad, cy0 - r - pad
    mat, nt, L = new_mat('lid' + side)
    uv = nt.new('ShaderNodeTexCoord'); sep = nt.new('ShaderNodeSeparateXYZ'); L.new(uv.outputs['UV'], sep.inputs[0])
    oi = nt.new('ShaderNodeObjectInfo'); sc = nt.new('ShaderNodeSeparateColor'); L.new(oi.outputs['Color'], sc.inputs[0])
    def M(op, a, b=0.0, c=0.0):
        n = nt.new('ShaderNodeMath'); n.operation = op
        for k, v in enumerate((a, b, c)):
            if hasattr(v, 'is_linked') or hasattr(v, 'links'):
                L.new(v, n.inputs[k])
            else:
                n.inputs[k].default_value = v
        return n.outputs[0]
    X = M('MULTIPLY_ADD', sep.outputs[0], Sz, -(r + pad))
    Y = M('MULTIPLY_ADD', sep.outputs[1], -Sz, r + pad)
    rad = M('SQRT', M('ADD', M('MULTIPLY', X, X), M('MULTIPLY', Y, Y)))
    lid = sc.outputs[0]; droop = M('MULTIPLY', sc.outputs[1], 20.0)
    xr = M('DIVIDE', X, r)
    sag = M('MULTIPLY', M('SUBTRACT', 1.0, M('MULTIPLY', xr, xr)), 6.0)
    ye = M('ADD', M('ADD', M('MULTIPLY_ADD', lid, 2 * r + 2, -r), sag), M('MULTIPLY', M('MULTIPLY', droop, xr), -1.0 if side == 'L' else 1.0))
    on = M('GREATER_THAN', lid, 0.005)
    grey = M('MULTIPLY', M('MULTIPLY', M('LESS_THAN', Y, ye), M('LESS_THAN', rad, r + 1.5)), on)
    ink = M('MULTIPLY', M('MULTIPLY', M('LESS_THAN', M('ABSOLUTE', M('SUBTRACT', Y, ye)), 4.5), M('LESS_THAN', rad, r + 1.0)), on)
    alpha = M('MAXIMUM', grey, ink)
    mixc = nt.new('ShaderNodeMix'); mixc.data_type = 'RGBA'
    L.new(ink, mixc.inputs['Factor'])
    mixc.inputs[6].default_value = [v / 255 for v in COL['grey']] + [1]
    mixc.inputs[7].default_value = [v / 255 for v in COL['ink']] + [1]
    finish(nt, L, mixc.outputs[2], alpha)
    verts = [(wx(x0), wy(y0 + Sz), 0), (wx(x0 + Sz), wy(y0 + Sz), 0), (wx(x0 + Sz), wy(y0), 0), (wx(x0), wy(y0), 0)]
    uvs = [(0, 0), (1, 0), (1, 1), (0, 1)]
    ob = mesh_obj('lid' + side, verts, uvs, [(0, 1, 2, 3)], mat, 0.545)
    rig_to(ob, [(0, 0)] * 4, rigid('eye' + side))
    return ob

sprite('shadow', weights=rigid('shadow'))
sprite('tail', cell=8, weights=tail_w)
for s in 'LR':
    sprite('ear' + s, weights=rigid('ear' + s))
    sprite('arm' + s + '_free', weights=rigid('arm' + s))
    sprite('arm' + s + '_front', weights=rigid('arm' + s))
    sprite('cheek' + s, weights=rigid('head'))
    sprite('eye' + s, weights=rigid('eye' + s))
    sprite('shine' + s, weights=rigid('shine' + s))
    sprite('eye' + s + '_happy', weights=rigid('head'))
    lid_plane(s)
sprite('body', cell=9, weights=body_w)
sprite('flame', weights=rigid('flame'))
sprite('nose', weights=rigid('nose'))
sprite('brows', weights=rigid('head'))
for v in ('', '_flat', '_o', '_yawn', '_smile', '_open', '_grin'):
    sprite('mouth' + v, weights=rigid('mouth'))

FX = {}
def fx(part, name, z=None):
    ob = sprite(part, z=z, anchor=meta['parts'][part]['anchor'], name=name)
    FX[name] = ob
    return ob
fx('warm', 'fire_warm'); fx('ring', 'fire_ring')
NT, NS = 90, 14
TONGUES = [fx('tongue', 'fire_tongue%02d' % k, 0.03 + 0.0001 * k) for k in range(NT)]
STREAKS = [fx('streak', 'fire_streak%02d' % k, 0.02 + 0.0001 * k) for k in range(NS)]
fx('aura', 'fire_aura')
BOLTS = [fx('bolt%d' % k, 'fire_bolt%d' % k, 0.9 + 0.001 * k) for k in range(10)]
fx('zzz', 'tired_zzz')
ZZZ = meta['parts']['zzz']

GROUPS = {
    'eyes': ['eyeL', 'eyeR', 'shineL', 'shineR', 'lidL', 'lidR'], 'happy_eyes': ['eyeL_happy', 'eyeR_happy'],
    'mouth': ['mouth', 'mouth_flat', 'mouth_o', 'mouth_yawn', 'mouth_smile', 'mouth_open', 'mouth_grin'],
    'arms': ['armL_front', 'armL_free', 'armR_front', 'armR_free'], 'brows': ['brows'],
}
ALL_SWITCH = [n for g in GROUPS.values() for n in g]

# ---------------------------------------------------------------- moods: frame i in 0..89, t = i / 30
TAU = math.tau
def Wk(k): return TAU * k / 3.0                  # k whole cycles per 3 s loop
def sn(t, k, ph=0.0): return math.sin(Wk(k) * t + ph)
def keys(p, pts):        # piecewise smooth through (p, value) points, wraps at 1
    pts = pts + [(pts[0][0] + 1, pts[0][1])]
    for (p0, v0), (p1, v1) in zip(pts, pts[1:]):
        if p0 <= p < p1:
            u = (p - p0) / (p1 - p0); u = u * u * (3 - 2 * u)
            return v0 + (v1 - v0) * u
    return pts[0][1]
def blink_amt(i, starts):    # code rig: 0.14 s, sin(bp * pi)
    v = 0.0
    for a in starts:
        bp = (i - a) / 4.2
        if 0 <= bp <= 1: v = max(v, math.sin(bp * math.pi))
    return v
def twitch_amt(i, starts):   # code rig: 0.35 s, sin(np * 3 pi) * .18
    for a in starts:
        q = (i - a) / 10.5
        if 0 <= q <= 1: return math.sin(q * 3 * math.pi) * 0.18
    return 0.0
def pulse(i, a, b):
    if i <= a or i >= b: return 0.0
    return math.sin(math.pi * (i - a) / (b - a))

def blank():
    return {'bones': {}, 'eyes': 'open', 'mouth': 'w', 'brows': False, 'lid': 0.0, 'droop': 0.0,
            'arms': ('front', 'front'), 'fx': {}, 'flame_a': 1.0, 'shadow_a': 1.0}

def B(st, bone, rot=0.0, sx=1.0, sy=1.0, ux=0.0, uy=0.0):     # rot in SVG degrees (clockwise), u in px (y down)
    st['bones'][bone] = (-rot, sx, sy, ux, -uy)

def common(st, i, mood, look, ew, tail_amp, tail_k, blinks=(), twitches=(), head_extra=0.0, tilt=0.0):
    t = i / 30.0
    lx, ly = look
    for s in 'LR':
        B(st, 'eye' + s, ux=4 * lx, uy=3 * ly)
        B(st, 'shine' + s, ux=10 * lx, uy=8 * ly)
    B(st, 'head', rot=tilt + head_extra + lx * 2)
    tired = mood == 'tired'
    B(st, 'earL', rot=ew * .5 + sn(t, 1) * ew * .4 - (8 if tired else 0))
    B(st, 'earR', rot=-ew * .5 - sn(t, 1, 1.0) * ew * .4 + (8 if tired else 0))
    nt = twitch_amt(i, twitches)
    B(st, 'nose', sx=1 + nt, sy=1 - nt * .6)
    tw = sn(t, tail_k)
    B(st, 'tail1', rot=tw * tail_amp)
    B(st, 'tail2', rot=sn(t, tail_k, -0.9) * tail_amp * 0.7)
    fs = {'fire': 1.5 + .08 * sn(t, 10), 'tired': .55 + .04 * sn(t, 1)}.get(mood, 1 + .05 * sn(t, 6))
    B(st, 'flame', rot=4 * sn(t, 3), sx=fs * (1 + .04 * sn(t, 8)), sy=fs * (1 + .07 * sn(t, 6, 1.3)))
    st['flame_a'] = 0.6 if tired else 1.0
    st['lid'] = max(st['lid'], blink_amt(i, blinks))

def body_breath(st, t, tired=False):
    br = sn(t, 1)
    return (1 - .012 * br, (.97 + .015 * br) if tired else (1 + .02 * br))

def idle(i):
    t = i / 30.0; p = i / 90.0; st = blank()
    look = (keys(p, [(0.0, 0), (0.12, 0), (0.2, .85), (0.42, .85), (0.5, -.7), (0.7, -.7), (0.8, 0)]),
            keys(p, [(0.0, 0), (0.12, 0), (0.2, .25), (0.42, .25), (0.5, -.35), (0.7, -.35), (0.8, 0)]))
    common(st, i, 'idle', look, 3, 12, 1, blinks=[50], twitches=[14, 64])
    q = (i - 28) / 12.0                                   # ear wiggle
    if 0 < q < 1:
        k = math.sin(3 * math.pi * q) * (1 - q)
        rot, *_ = st['bones']['earR']; B(st, 'earR', rot=-rot - 10 * k)
    sx, sy = body_breath(st, t)
    B(st, 'root', sx=sx, sy=sy)
    a = 4 * sn(t, 1)
    B(st, 'armL', rot=a); B(st, 'armR', rot=-a)
    return st

def happy(i):
    t = i / 30.0; p = i / 90.0; st = blank()
    common(st, i, 'happy', (0.0, -0.2), 8, 12, 1, twitches=[45])
    q = (3 * p) % 1.0                                     # three hops per loop (code rig 1.1 per s)
    if q < .1 or q > .92:
        hop = 0.0; sx, sy = 1.08, .90
    else:
        hop = -math.sin(math.pi * (q - .1) / .82) * 70; sx, sy = .96, 1.05
    B(st, 'root', sx=sx, sy=sy, uy=hop)
    st['shadow'] = (1 + hop / 240, 1 + hop / 160)
    a = 125 + 15 * sn(t, 7)
    B(st, 'armL', rot=a); B(st, 'armR', rot=-a)
    lg = sn(t, 3)
    B(st, 'legL', uy=-max(0, lg) * 16); B(st, 'legR', uy=-max(0, -lg) * 16)
    st['eyes'] = 'happy'; st['mouth'] = 'open'; st['arms'] = ('free', 'free')
    return st

def tired(i):
    t = i / 30.0; st = blank()
    yawn = pulse(i, 34, 76)
    st['lid'] = max(.55 + .12 * sn(t, 1), .9 * yawn)
    st['droop'] = 0.4
    common(st, i, 'tired', (0.0, 0.25), -10, 4, 1, blinks=[14], twitches=[82], tilt=4 * sn(t, 1) + 3 - 5 * yawn)
    sx, sy = body_breath(st, t, tired=True)
    B(st, 'root', sx=sx, sy=sy + .02 * yawn)
    a = -4 + 3 * sn(t, 1)
    B(st, 'armL', rot=a); B(st, 'armR', rot=-a)
    st['brows'] = True
    if yawn > 0.12:
        st['mouth'] = 'yawn'
        k = 0.5 + 0.5 * yawn
        B(st, 'mouth', sx=k, sy=k, uy=-4 * (1 - yawn))
    st['fx']['tired_zzz'] = (ZZZ['x0'], ZZZ['y0'], 0, 1, 1, .5 + .4 * sn(t, 1), None)
    return st

def col(k):   # code rig flame colour by age
    if k < .35: c0, c1, f = (255, 236, 110), (255, 170, 20), k / .35
    else: c0, c1, f = (255, 170, 20), (226, 58, 0), (k - .35) / .65
    return tuple((a + (b - a) * f) / 255 for a, b in zip(c0, c1))
rng = random.Random(11)
TSLOT = [dict(n=rng.choice([4, 5, 6]), ph=rng.random(), seed=rng.randrange(10 ** 6)) for _ in range(NT)]
SSLOT = [dict(n=rng.choice([6, 8, 10]), ph=rng.random(), seed=rng.randrange(10 ** 6)) for _ in range(NS)]
BOLT_AT = [6, 6, 24, 24, 41, 41, 63, 63, 80, 80]
BOLT_POS = [rng.random() * TAU for _ in range(10)]
CX, CYc, RX, RY, FLOOR = 515, 590, (235, 320), (290, 360), 860
def lerp(a, b, k): return a + (b - a) * k

def fire(i):
    t = i / 30.0; st = blank()
    common(st, i, 'fire', (0.0, 0.0), 3, 22, 3, blinks=[40], twitches=[20, 60])
    hop = -abs(sn(t, 4)) * 4; shake = 3.5 * sn(t, 15)
    sx, sy = body_breath(st, t)
    B(st, 'root', sx=sx, sy=sy, ux=shake, uy=hop)
    a = 95 + 30 * sn(t, 4)
    B(st, 'armL', rot=a); B(st, 'armR', rot=-a)
    lg = sn(t, 4)
    B(st, 'legL', uy=-max(0, lg) * 16); B(st, 'legR', uy=-max(0, -lg) * 16)
    st['mouth'] = 'grin'; st['arms'] = ('free', 'free')
    st['fx']['fire_warm'] = (515, 560, 0, 4.0, 4.0, .9, None)
    st['fx']['fire_aura'] = (512 + shake, 512 + hop, 0, 1, 1, .75 + .2 * sn(t, 5), None)
    rp = (5 * i / 90.0) % 1.0
    st['fx']['fire_ring'] = (515, 884, 0, (160 + 170 * rp) / 245, (20 + 22 * rp) / 31, (1 - rp) * .8, (1, 138 / 255, 0))
    for j, sl in enumerate(TSLOT):
        life = 3.0 / sl['n']; v = t / life + sl['ph']; k = v % 1.0; c = int(math.floor(v)) % sl['n']
        r = random.Random(sl['seed'] * 31 + c)
        ang = r.random() * TAU
        x0 = CX + math.cos(ang) * lerp(*RX, r.random()); y0 = min(CYc + math.sin(ang) * lerp(*RY, r.random()), FLOOR)
        vx = (CX - x0) * .35 + lerp(-30, 30, r.random()); vy = -lerp(260, 420, r.random()); sz = lerp(32, 78, r.random())
        wob = r.random() * TAU
        el = k * life
        x = x0 + vx * el + 8 * math.sin(Wk(4) * t + wob); y = y0 + vy * el
        op = (k / .15 if k < .15 else 1 - (k - .15) / .85) * .9
        st['fx']['fire_tongue%02d' % j] = (x, y, 0, sz * (1 - k * .6) / 100, sz * (1.2 + k * 0.9) / 100, op, col(k))
    for j, sl in enumerate(SSLOT):
        life = 3.0 / sl['n']; v = t / life + sl['ph']; k = v % 1.0; c = int(math.floor(v)) % sl['n']
        r = random.Random(sl['seed'] * 17 + c)
        x = lerp(215, 320, r.random()) if r.random() < .5 else lerp(710, 815, r.random())
        y0 = lerp(FLOOR - 200, FLOOR + 40, r.random()); ln = lerp(50, 130, r.random())
        st['fx']['fire_streak%02d' % j] = (x, y0 - k * 600, 0, 1, ln / 98, (1 - k) * .85, (1, 211 / 255, 106 / 255))
    for j in range(10):
        if 0 <= i - BOLT_AT[j] < 3:
            ang = BOLT_POS[j]
            st['fx']['fire_bolt%d' % j] = (CX + math.cos(ang) * RX[0], CYc + math.sin(ang) * RY[0], 0, 1, 1, 1, None)
    return st

def wave(i):
    t = i / 30.0; p = i / 90.0; st = blank()
    common(st, i, 'wave', (.6, -.1), 3, 12, 1, blinks=[62], twitches=[30])
    sx, sy = body_breath(st, t)
    B(st, 'root', sx=sx, sy=sy)
    B(st, 'armR', rot=-(128 + 20 * sn(t, 5)))
    B(st, 'armL', rot=4 * sn(t, 1))
    st['mouth'] = 'smile' if (i % 45) < 27 else 'w'
    st['arms'] = ('front', 'free')
    return st

TALK_SEQ = []
_r = random.Random(5); _f = 0
while _f < 90:
    d = _r.randint(3, 6); TALK_SEQ += [_r.choice(['o', 'w', 'smile', 'o', 'flat'])] * d; _f += d
def talk(i):
    t = i / 30.0; p = i / 90.0; st = blank()
    look = (keys(p, [(0.0, -.2), (0.3, -.2), (0.4, .3), (0.75, .3), (0.85, -.2)]), 0.0)
    common(st, i, 'talk', look, 3, 12, 1, blinks=[25, 31], twitches=[70], head_extra=3 * sn(t, 2))
    sx, sy = body_breath(st, t)
    B(st, 'root', sx=sx, sy=sy)
    B(st, 'armR', rot=-40 + 25 * sn(t, 2))
    B(st, 'armL', rot=4 * sn(t, 1))
    st['mouth'] = TALK_SEQ[i]
    st['arms'] = ('front', 'free')
    return st

SEGMENTS = [('idle', 1, idle), ('happy', 101, happy), ('tired', 201, tired), ('fire', 301, fire),
            ('wave', 401, wave), ('talk', 501, talk)]

# ---------------------------------------------------------------- apply + key
REST = {b.name: b.matrix_local.copy() for b in ad.bones}
MOUTHS = {'w': 'mouth', 'flat': 'mouth_flat', 'o': 'mouth_o', 'yawn': 'mouth_yawn', 'smile': 'mouth_smile',
          'open': 'mouth_open', 'grin': 'mouth_grin'}
SHADOW_OB = OBJ['shadow']; FLAME_OB = OBJ['flame']

def apply(st, frame):
    for pb in arm.pose.bones:
        rot, sx, sy, ux, uy = st['bones'].get(pb.name, (0.0, 1.0, 1.0, 0.0, 0.0))
        pvt = REST[pb.name].to_translation()
        T = (Matrix.Translation(pvt + Vector((ux * S, uy * S, 0))) @ Matrix.Rotation(math.radians(rot), 4, 'Z')
             @ Matrix.Diagonal((sx, sy, 1.0, 1.0)) @ Matrix.Translation(-pvt))
        pb.matrix_basis = REST[pb.name].inverted() @ T @ REST[pb.name]
        for prop in ('location', 'rotation_euler', 'scale'):
            pb.keyframe_insert(prop, frame=frame)
    show = {MOUTHS[st['mouth']]}
    if st['eyes'] == 'happy':
        show |= {'eyeL_happy', 'eyeR_happy'}
    else:
        show |= {'eyeL', 'eyeR', 'shineL', 'shineR', 'lidL', 'lidR'}
    if st['brows']: show.add('brows')
    show.add('armL_' + st['arms'][0]); show.add('armR_' + st['arms'][1])
    for n in ALL_SWITCH:
        ob = OBJ[n]; hide = n not in show
        ob.hide_render = hide; ob.hide_viewport = hide
        ob.keyframe_insert('hide_render', frame=frame); ob.keyframe_insert('hide_viewport', frame=frame)
    for s in 'LR':
        ob = OBJ['lid' + s]
        ob.color = (st['lid'], st['droop'], 0.0, 1.0)
        ob.keyframe_insert('color', frame=frame)
    ssc, sa = st.get('shadow', (1.0, 1.0))
    st['bones']['shadow'] = (0.0, ssc, ssc, 0.0, 0.0)
    pb = arm.pose.bones['shadow']; pvt = REST['shadow'].to_translation()
    T = Matrix.Translation(pvt) @ Matrix.Diagonal((ssc, ssc, 1.0, 1.0)) @ Matrix.Translation(-pvt)
    pb.matrix_basis = REST['shadow'].inverted() @ T @ REST['shadow']
    pb.keyframe_insert('scale', frame=frame); pb.keyframe_insert('location', frame=frame)
    SHADOW_OB.color = (1, 1, 1, sa); SHADOW_OB.keyframe_insert('color', frame=frame)
    FLAME_OB.color = (1, 1, 1, st['flame_a']); FLAME_OB.keyframe_insert('color', frame=frame)
    for n, ob in FX.items():
        v = st['fx'].get(n)
        ob.hide_render = ob.hide_viewport = v is None
        if v is not None:
            x, y, rot, sx, sy, a, tint = v
            ob.location.x, ob.location.y = wx(x), wy(y)
            ob.rotation_euler.z = math.radians(rot)
            ob.scale = (sx, sy, 1.0)
            c = tint or (1, 1, 1)
            ob.color = (c[0], c[1], c[2], max(0.0, min(1.0, a)))
            ob.keyframe_insert('location', frame=frame); ob.keyframe_insert('rotation_euler', frame=frame)
            ob.keyframe_insert('scale', frame=frame); ob.keyframe_insert('color', frame=frame)
        ob.keyframe_insert('hide_render', frame=frame); ob.keyframe_insert('hide_viewport', frame=frame)

import time
t0 = time.time()
apply(blank(), 0)
for name, start, fn in SEGMENTS:
    for i in range(90):
        apply(fn(i), start + i)
# every key is on a whole frame and every frame is keyed: make it constant so nothing eases between frames
for ob in [arm] + list(OBJ.values()):
    ad_ = ob.animation_data
    if ad_ and ad_.action:
        for fc in getattr(ad_.action, 'fcurves', []):
            for kp in fc.keyframe_points:
                kp.interpolation = 'CONSTANT'
print('keyed in %.1f s' % (time.time() - t0))
STILLS = {'rest': 0, 'idle': 1 + 30, 'happy': 101 + 15, 'tired': 201 + 10, 'yawn': 201 + 55, 'fire': 301 + 7,
          'wave': 401 + 8, 'talk': 501 + 40}
json.dump({'segments': {n: [s, s + 89] for n, s, _ in SEGMENTS}, 'stills': STILLS},
          open(os.path.join(ROOT, 'work', 'timeline.json'), 'w'), indent=1)
scene.frame_set(0)
out = os.path.join(ROOT, 'tarsier_rig.blend')
bpy.ops.wm.save_as_mainfile(filepath=out, relative_remap=True, compress=True)
print('saved', out)
