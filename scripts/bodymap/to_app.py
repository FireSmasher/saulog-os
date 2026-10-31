"""Turn bodymap_fibers.svg into next/src/assets/bodymap.json for the app.

Keeps, per side (front, back), every muscle outline and its fibre lines:
[muscle_slug, outline_path, fibre_path]. Colours are left to the app (main, helper,
rest). Run from the repo root: python3 scripts/bodymap/to_app.py
Source drawing: MIT, react-muscle-highlighter (notice in LICENSE-react-muscle-highlighter).
"""
import json, re

svg = open('scripts/bodymap/bodymap_fibers.svg').read()
out = {}
for side in ('front', 'back'):
    block = re.search(r'<g id="%s">(.*?)</g>' % side, svg, re.S).group(1)
    paths = dict(re.findall(r'<path id="([^"]+)" d="([^"]+)"', block))
    parts = []
    for pid, d in paths.items():
        if pid.startswith(('fib__', 'edge__')):
            continue
        slug = pid.split('__')[0]
        parts.append([slug, d, paths.get('fib__' + pid, '')])
    out[side] = parts
json.dump(out, open('next/src/assets/bodymap.json', 'w'), separators=(',', ':'))
print({k: len(v) for k, v in out.items()})
