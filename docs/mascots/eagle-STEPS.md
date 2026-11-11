# Apoy eagle, Blender cut-out rig: how to rebuild

Folder: design/mascots/blender/eagle/ (run every step from there). Source: ../../eagle_3.png. Same pipeline as the carabao rig (scripts copied, then made eagle-specific).

1. `python3 scripts/cut_parts.py` cuts parts/ (crest, mane, face, body, wings, feet, tail, cheeks, marks, beak, eyes, brows, shadow), fills hidden areas by script, writes parts/parts.json, work/bg_plate.png, work/owner.png (about 30 s).
2. `python3 scripts/check_parts.py` numpy rest check of the parts (expect MAE about 0.06, max 24).
3. `python3 scripts/paint_faces.py` paints eye states (round, half, tired, closed, happy, squint), mouths behind the beak (smile, o, yawn, open, grin), blush and the fire/happy/sweat effects. `python3 scripts/preview_faces.py` shows them in work/face_states.png.
4. `B=/Applications/Blender.app/Contents/MacOS/Blender; $B -b --factory-startup -P scripts/build_rig.py` builds eagle_rig.blend and work/timeline.json. Bones: root, shadow, body, head, crest, eyes, brows, beak, mouth, two-bone wings, feet, tail. Crest, mane, face and body share one weight field so their seams never open. Raised wings are thickened 30% and shortened 10% in apply().
5. `$B -b eagle_rig.blend -P scripts/render_rig.py -- rest` then `python3 scripts/compare_rest.py` gives renders/rest_side_by_side.png, rest_blend50.png, rest_difference.png, rest_fidelity.json.
6. `$B -b eagle_rig.blend -P scripts/render_rig.py -- stills` and `-- seg <mood>` for idle happy tired fire wave talk (frames in renders/<mood>/), then `zsh scripts/encode_loop.sh <mood>` for renders/<mood>_loop.mp4. Non-rest renders use a wider camera (ortho 11.2, centre 470 px) for flame and hop headroom.
7. `python3 scripts/contact_sheet.py` for renders/contact_sheet.png. renders/index.html plays all six loops.

Timeline (30 fps, 90 frames per loop): 0 rest, 1-90 idle, 101-190 happy, 201-290 tired, 301-390 fire, 401-490 wave, 501-590 talk.

Lesson: renders need 32 samples, not 1. The cheeks are half-transparent pink, and at 1 sample Cycles left speckle around them (max error 210, PSNR 44.6 dB). At 32 samples: max 24, PSNR 55.4 dB.

kern_guard blocked STEPS.md in the eagle folder ("not a filing folder"), so this file lives in the scratchpad.
