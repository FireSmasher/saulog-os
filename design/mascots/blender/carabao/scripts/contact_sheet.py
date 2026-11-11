"""Step 6: one contact sheet of the key-pose stills on the off-white app background.
Run: python3 scripts/contact_sheet.py  -> renders/contact_sheet.png"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import *
R = os.path.join(ROOT, 'renders'); BG = (255, 253, 239); T = 512
tiles = [('original drawing', Image.open(SRC).convert('RGB').resize((T, T), Image.LANCZOS))]
for name, label in [('rest', 'rest (rig, frame 0)'), ('happy', 'happy'), ('tired', 'tired'), ('yawn', 'tired, yawn'),
                    ('fire', 'on fire'), ('wave', 'wave'), ('talk', 'talk (mid word)')]:
    im = Image.open(os.path.join(R, 'stills', name + '.png')).convert('RGBA')
    bg = Image.new('RGBA', im.size, BG + (255,)); bg.alpha_composite(im)
    tiles.append((label, bg.convert('RGB').resize((T, T), Image.LANCZOS)))
cols = 4; rows = (len(tiles) + cols - 1) // cols; L = 30
sheet = Image.new('RGB', (cols * T, rows * (T + L)), BG); dr = ImageDraw.Draw(sheet)
try:
    from PIL import ImageFont
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 20)
except Exception:
    font = None
for k, (label, t) in enumerate(tiles):
    x, y = (k % cols) * T, (k // cols) * (T + L)
    sheet.paste(t, (x, y + L)); dr.text((x + 10, y + 5), label, fill=(32, 21, 24), font=font)
sheet.save(os.path.join(R, 'contact_sheet.png'))
sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS).save(os.path.join(ROOT, 'work', 'contact_sheet_small.png'))
print('ok', sheet.size)
