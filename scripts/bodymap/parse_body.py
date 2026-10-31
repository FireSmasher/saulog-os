import re, json, sys
D=sys.argv[1]
def parse(fn):
    s=open(f"{D}/{fn}").read()
    out=[]
    for blk in re.split(r'\n  \{\n', s)[1:]:
        m=re.search(r'slug:\s*"([a-z-]+)"', blk)
        if not m: continue
        slug=m.group(1)
        for side in ('left','right','common'):
            sm=re.search(side+r':\s*\[(.*?)\]', blk, re.S)
            if sm:
                for d in re.findall(r'"([^"]+)"', sm.group(1)):
                    out.append((slug,side,d))
    return out
res={'front':parse('bodyFront.ts'),'back':parse('bodyBack.ts')}
json.dump(res,open(f"{D}/body.json","w"))
for k,v in res.items():
    print(k,len(v),sorted(set(x[0] for x in v)))
    nums=[float(n) for x in v for n in re.findall(r'(?<![a-zA-Z])M\s*(-?[\d.]+)[ ,](-?[\d.]+)',x[2])[0:1] for n in n] if False else None
