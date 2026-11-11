"""Step 6 (phase 2): one frame from each of the six loops -> renders/contact_sheet.png (+ small copy in work/).
Run after the six `seg` renders: python3 scripts/contact_loops.py"""
import os
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PICK = [('idle', 1), ('happy', 28), ('tired (yawn)', 48), ('on fire', 8), ('wave', 5), ('talk', 53)]
T = 384; BG = (255, 253, 239, 255)
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 20)
sheet = Image.new('RGBA', (3 * T, 2 * (T + 30)), BG)
d = ImageDraw.Draw(sheet)
for n, (label, k) in enumerate(PICK):
    seg = label.split()[0] if label != 'on fire' else 'fire'
    im = Image.open(os.path.join(ROOT, 'renders', seg, 'frame_%04d.png' % k)).convert('RGBA').resize((T, T), Image.LANCZOS)
    x, y = (n % 3) * T, (n // 3) * (T + 30)
    sheet.alpha_composite(im, (x, y + 30))
    d.text((x + 12, y + 5), '%s  (frame %d of 90)' % (label, k), fill=(40, 30, 30), font=font)
sheet.convert('RGB').save(os.path.join(ROOT, 'renders', 'contact_sheet.png'))
sheet.convert('RGB').resize((3 * T // 3, 2 * (T + 30) // 3)).save(os.path.join(ROOT, 'work', 'contact_sheet_small.png'))
print('contact sheet written')
