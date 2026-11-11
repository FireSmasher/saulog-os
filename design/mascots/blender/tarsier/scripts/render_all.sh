#!/bin/zsh
# Steps 4 to 7 in one go: rest test, stills, all six 90-frame loops (4 threads), MP4s, contact sheet.
# Usage: scripts/render_all.sh   (from anywhere; times go to work/render_times.txt)
cd "${0:A:h}/.." || exit 1
B=/Applications/Blender.app/Contents/MacOS/Blender
T0=$SECONDS
: > work/render_times.txt
for seg in idle happy tired fire wave talk; do
  t=$SECONDS
  rm -rf renders/$seg; mkdir -p renders/$seg
  $B -b tarsier_rig.blend -P scripts/render_rig.py -- seg $seg > work/render_$seg.log 2>&1
  scripts/encode_loop.sh $seg
  echo "$seg $(( SECONDS - t )) s, $(ls renders/$seg | wc -l | tr -d ' ') frames" | tee -a work/render_times.txt
done
echo "total $(( SECONDS - T0 )) s" | tee -a work/render_times.txt
