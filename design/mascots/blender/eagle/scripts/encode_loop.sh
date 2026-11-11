#!/bin/zsh
# Step 7: transparent PNG loop frames -> MP4 on the off-white app background (255,253,239), 30 fps.
# Usage: scripts/encode_loop.sh idle   (reads renders/idle/frame_%04d.png, writes renders/idle_loop.mp4)
cd "${0:A:h}/.." || exit 1
seg=${1:-idle}
/opt/homebrew/bin/ffmpeg -y -loglevel error -f lavfi -i color=c=0xFFFDEF:s=768x768:r=30 -framerate 30 \
  -i renders/$seg/frame_%04d.png -filter_complex "[0][1]overlay=shortest=1,format=yuv420p" \
  -c:v libx264 -crf 16 -preset slow -movflags +faststart -t 3 renders/${seg}_loop.mp4 && echo renders/${seg}_loop.mp4
