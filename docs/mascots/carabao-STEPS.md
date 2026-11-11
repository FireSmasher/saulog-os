# Carabao cut-out rig (Blender), steps (11 Nov 2026)

Rig folder: design/mascots/blender/carabao/ (scripts/, parts/, renders/, carabao_rig.blend). This file lives in docs/
because the kern_guard hook blocks .md files in the rig folder. Every script also documents its step in its header.

Goal: the owner's picked drawing design/mascots/carabao_7.png, moving, as a Blender cut-out puppet.
Tools: Blender 5.2.3 headless, python3 numpy + PIL, ffmpeg. No AI image model used; hidden areas and new
faces painted by script in the drawing's own colours and line width. No downloads, installs or commits.

## Rerun everything, from design/mascots/blender/carabao
python3 scripts/cut_parts.py        # 1 cut parts, paint hidden areas (rewrites parts.json)
python3 scripts/paint_faces.py      # 2 extra eyes, mouths, blush, effects (MUST follow cut_parts.py)
python3 scripts/check_parts.py      # 1b numpy check of parts at rest
python3 scripts/preview_faces.py    # 2b work/face_states.png
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --factory-startup -P scripts/build_rig.py              # 3 rig + baked moods -> carabao_rig.blend
$B -b carabao_rig.blend -P scripts/render_rig.py -- rest     # 4a 1024 px rest test
python3 scripts/compare_rest.py                              # 5 fidelity numbers and images
$B -b carabao_rig.blend -P scripts/render_rig.py -- stills   # 4b key poses 768 px
for s in idle happy tired fire wave talk; do $B -b carabao_rig.blend -P scripts/render_rig.py -- seg $s; zsh scripts/encode_loop.sh $s; done
python3 scripts/contact_loops.py                             # 6 renders/contact_sheet.png, one frame per loop
open -a "Google Chrome" renders/index.html                   # 7 all six loops side by side

## 1 Cut (cut_parts.py)
Measured: bg (255,253,239), ink (32,21,24), outline ~12 px, body grey 120-134, hat (207,167,114), face strokes 8.5 px,
mirror symmetric at x 519.5. Silhouette by flood fill; pieces: hat, horns, ears, body (head+body+legs+arms), dumbbell.
Arms cut off along the inner arm strokes. Outline ink given to the front part by geodesic reach.
Hidden areas painted only under front parts: body + new outline under arms, head dome under hat, ear and horn roots,
plain grey under eyes, snout, mouth. Arms in two versions: front (as drawn, small moves) and free (closed outline,
behind body, big moves). Numpy check: MAE 0.049, PSNR 53.15 dB, 0.108% px off >8.

## 2 Faces and effects (paint_faces.py)
From his mood refs (eyes and mouths only): eyes open/half/tired/closed/happy; mouths drawn/flat/smile/o/yawn/open/grin;
snout_closed (fills the notch the drawn mouth cuts); blush, sweat, sparkle, flames x3, glow, pool, ring, streak, spark.
Fixed on the way: blush saved grey (fixed), pushpull crash on odd sizes (fixed).

## 3 Rig (build_rig.py)
1 px = 0.01 m, ortho scale 10.24 = pixel match at 1024. Cycles emission+transparent; textures Non-Color, view Raw,
so layers blend in sRGB numbers like the drawing. Bones: root, shadow, legL/R, body, head (neck), hat, earL/R, eyeL/R,
snout, mouth, armL/R up+lo (shoulder, elbow). Body 9 px grid mesh (head weight fades y 520-600, legs below 780),
arms 7 px grids with elbow blend; hat, ears, horns, face rigid. Face versions swap by keyed visibility.
Timeline 30 fps, each block loops in 90 frames: 0 rest, 1-90 idle, 101-190 happy, 201-290 tired, 301-390 fire,
401-490 wave, 501-590 talk. Motion ideas from rig/carabao-rig.html.

## 4-7 Render and checks (phase 1)
Rest 1024 vs drawing: MAE 0.050, PSNR 52.26 dB, 97.17% px identical, 0.110% px off >8, 0.009% >24,
13 px >40 at ear/hat corners (max 163). Stills 768 px 24 samples. Idle loop 768x768, 30 fps, 90 frames, 3.0 s;
seam 90->1 change 0.41 vs normal 0.32 (max 0.46 at blink). ~1.5 s per frame at 4 threads (Mac load 32+).
Changes after looking: wave arm 132 deg hid behind the head -> 108 +/- 16. Talk arm looked like a tail -> open-hand
gesture (82/48 deg). Fire streaks crossed the face -> behind body, out to the sides. Talk still -> frame 553.

## Phase 2 (11 Nov 2026, after the owner said "better")
1. Arms, cut_parts.py step 6b: the FREE arm is repainted fatter and rounded. Its inner side moves 24 px into the body
   (hidden at rest, the free arm sits behind the body), tapering back to the drawn line at the hand (L y 688-742,
   R y 700-748). The drawn inner outline is painted over with the arm's own grey (pushpull of the visible arm grey),
   a rounded shoulder cap closes the top, and a new outline at the drawing's weight (12.3 px) is stroked. The plates
   of the dumbbell stay on top (masked, 3 px margin). Trap: cut_parts.py rewrites parts.json and drops the face
   states, so rerun paint_faces.py or the build fails with KeyError eyeL_half.
2. Swap jump, build_rig.py apply(): the front arm no longer swaps at 8 deg. It dissolves (object alpha) into the free
   arm over 3 to 10 deg of max(up, 0.57 x lower) rotation; the free arm shows from 2 deg. Shorter arm: the shoulder
   slides 14 px into the body and 6 px down as the upper arm turns 6 to 30 deg, so less arm shows.
3. Legs: stomp 9 px -> 4 px, leg weight blend widened from y 788-818 to 780-834 (less shear).
4. Flames: render_rig.py uses ortho 11.5 with the camera raised 0.63 for every mode except `rest` (bottom edge
   unchanged, 126 px more room on top). The `rest` fidelity test keeps 10.24 at (0, 0).
5. Renders: six loops (idle, happy, tired with the yawn inside, fire, wave, talk), 90 frames each, transparent PNG
   in renders/<loop>/ plus renders/<loop>_loop.mp4 on off-white; renders/contact_sheet.png (phase 1 sheet kept as
   contact_sheet_phase1.png); renders/index.html plays all six.
Rest fidelity after the repaint: MAE 0.050, PSNR 52.26 dB, 97.17% identical, 0.110% >8, 0.009% >24
(unchanged, the front arm still carries the rest pose).
