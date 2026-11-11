#!/bin/zsh
cd "$(dirname "$0")"
STYLE="Minimal kawaii character in the style of Korean and Japanese messenger sticker characters: very simple round body, small simple mouth, almost no detail, soft solid flat colours, thick dark outline, calm deadpan charm, standing front view, full body, centered on a plain off-white background with lots of empty space, readable as a tiny app icon."
typeset -A P
P[tarsier]="A tiny Philippine tarsier. Its two enormous round dark eyes take up most of its face, each eye as big as half the head, with a small white shine dot. Two very large thin round ears stick out to the sides like satellite dishes, pale pink inside. Small round soft grey-brown body, very long thin fingers with round fingertip pads, long thin bare tail. A tiny orange flame floats above its head."
P[eagle]="A chubby Philippine eagle, the monkey-eating eagle. A big shaggy spiky crest of long cream and brown feathers sticking up and back like a lion's mane, a very large deep curved pale blue-grey hooked beak, small fierce eyes with a serious little frown, cream white belly, dark brown wings held on its hips."
run(){ [[ -f "$1_$2.png" ]] && return; ~/.local/bin/mflux-generate-z-image-turbo --prompt "${P[$1]} $STYLE" --steps 8 --width 1024 --height 1024 --seed $2 -q 8 --output "$1_$2.png" >> run.log 2>&1 || echo "FAIL $1 $2" >> run.log; echo "done $1 $2 $(date +%H:%M)" >> run.log; }
for s in 3 11 23 58; do run tarsier $s; done
for s in 3 11 23; do run eagle $s; done
echo ALLDONE >> run.log
