# Apoy tarsier: Blender cut-out rig, how it was made

Folder: design/mascots/blender/tarsier/ (kern_guard blocked .md there, so this file lives in the scratchpad).
Source: design/mascots/tarsier_3.png. Motion and moods: design/mascots/rig/tarsier-rig.html (locked by the owner). Method copied from ../carabao.
All scripts use paths relative to the tarsier folder. Blender 5.2 headless, Cycles CPU, 4 threads.

1. `python3 scripts/cut_parts.py` cuts flame, body (head, body, feet), tail, each ear, each arm (front pose and a free copy that swings behind the body), cheeks, eyes, shines, mouth and the ground shadow; paints the hidden areas (under arms, ear roots, tail base). Writes parts/ and parts/parts.json.
2. `python3 scripts/check_parts.py` stacks the parts in numpy and compares with the drawing (MAE 0.066, PSNR 52.25 dB).
3. `python3 scripts/paint_faces.py` paints extra faces in the drawing's ink: nose (new), happy arc eyes, tired brows, mouths (flat, o, yawn, smile, open, grin) and fire, ring, aura, bolt, zzz effects.
4. `Blender -b --factory-startup -P scripts/build_rig.py` builds tarsier_rig.blend: bones at neck, ear roots, shoulders, hips, tail base (two tail bones), flame, eyes, shines, nose, mouth; eyelids are a shader (blink, tired droop, yawn). Keys six seamless 90-frame loops (idle 1-90, happy 101-190, tired 201-290, fire 301-390, wave 401-490, talk 501-590), every rate whole cycles per 3 s.
5. `Blender -b tarsier_rig.blend -P scripts/render_rig.py -- rest` then `python3 scripts/compare_rest.py`.
6. `scripts/render_all.sh`: loops as transparent PNG (renders/<mood>/) and MP4 on off-white (renders/<mood>_loop.mp4); times in work/render_times.txt.
7. `render_rig.py -- stills` then `python3 scripts/contact_sheet.py`: renders/contact_sheet.png. renders/index.html plays all six.

Trap: with stacked transparent layers Cycles' Russian roulette ended rays early (random too-bright or too-dark edge pixels, PSNR 42 instead of 52). build_rig.py sets min_transparent_bounces = 64.
