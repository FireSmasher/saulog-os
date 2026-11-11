"""Step 4: render from carabao_rig.blend (headless).
  Blender -b carabao_rig.blend -P scripts/render_rig.py -- rest            1024 px, 1 sample, pixel-exact test of frame 0
  Blender -b carabao_rig.blend -P scripts/render_rig.py -- stills          768 px key poses -> renders/stills/
  Blender -b carabao_rig.blend -P scripts/render_rig.py -- seg idle        768 px loop frames -> renders/idle/
  Blender -b carabao_rig.blend -P scripts/render_rig.py -- frames 5 9 12   single frames -> renders/test/
Frames are transparent PNG (straight alpha)."""
import bpy, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['stills']
sc = bpy.context.scene
tl = json.load(open(os.path.join(ROOT, 'work', 'timeline.json')))
def render(frame, path):
    t = time.time()
    sc.frame_set(frame)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('RENDERED %s frame %d in %.2f s' % (os.path.basename(path), frame, time.time() - t), flush=True)
mode = args[0]
if mode != 'rest':   # phase 2: headroom so the fire never clips above the hat (bottom edge unchanged)
    sc.camera.data.ortho_scale = 11.5; sc.camera.location.y = (11.5 - 10.24) / 2
if mode == 'rest':
    sc.render.resolution_x = sc.render.resolution_y = 1024
    sc.cycles.samples = 1
    sc.cycles.pixel_filter_type = 'GAUSSIAN'; sc.cycles.filter_width = 0.01
    render(0, os.path.join(ROOT, 'renders', 'rest_1024.png'))
elif mode == 'stills':
    for name, f in tl['stills'].items():
        render(f, os.path.join(ROOT, 'renders', 'stills', name + '.png'))
elif mode == 'seg':
    a, b = tl['segments'][args[1]]
    for k, f in enumerate(range(a, b + 1)):
        render(f, os.path.join(ROOT, 'renders', args[1], 'frame_%04d.png' % (k + 1)))
elif mode == 'frames':
    for f in args[1:]:
        render(int(f), os.path.join(ROOT, 'renders', 'test', 'f%04d.png' % int(f)))
