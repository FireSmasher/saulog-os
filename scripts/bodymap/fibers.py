import json,re,math,sys
D=sys.argv[1]; b=json.load(open(f"{D}/body.json"))
NUM=r'-?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?'
def flatten(d):
    polys=[];cur=[];x=y=0;sx=sy=0
    for cmd,args in re.findall(r'([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)',d):
        if cmd in 'Aa':
            toks=[];s=args
            while True:
                vals=[]
                for i in range(7):
                    s=s.lstrip(' ,')
                    if not s: break
                    if i in (3,4): vals.append(float(s[0])); s=s[1:]
                    else:
                        m=re.match(NUM,s); vals.append(float(m.group())); s=s[m.end():]
                if len(vals)<7: break
                toks.append(vals)
            for v in toks:
                ex,ey=(v[5]+x,v[6]+y) if cmd=='a' else (v[5],v[6])
                for t in (0.25,0.5,0.75,1): cur.append((x+(ex-x)*t,y+(ey-y)*t))
                x,y=ex,ey
            continue
        n=[float(t) for t in re.findall(NUM,args)]
        rel=cmd.islower(); C=cmd.upper()
        if C=='Z':
            if cur: polys.append(cur); cur=[]
            x,y=sx,sy; continue
        step={'M':2,'L':2,'C':6,'Q':4}[C]
        for i in range(0,len(n),step):
            a=n[i:i+step]
            if rel: a=[a[j]+(x if j%2==0 else y) for j in range(len(a))]
            if C=='M' and i==0:
                if cur: polys.append(cur)
                cur=[(a[0],a[1])]; sx,sy=a[0],a[1]
            elif C in 'ML': cur.append((a[0],a[1]))
            elif C=='C':
                for k in range(1,9):
                    t=k/8;u=1-t
                    cur.append((u**3*x+3*u*u*t*a[0]+3*u*t*t*a[2]+t**3*a[4],u**3*y+3*u*u*t*a[1]+3*u*t*t*a[3]+t**3*a[5]))
            elif C=='Q':
                for k in range(1,7):
                    t=k/6;u=1-t
                    cur.append((u*u*x+2*u*t*a[0]+t*t*a[2],u*u*y+2*u*t*a[1]+t*t*a[3]))
            x,y=a[-2],a[-1]
    if cur: polys.append(cur)
    return polys
def hatch(polys,ang,sp,inset=2.0):
    r=math.radians(ang);c,s=math.cos(r),math.sin(r)
    rot=lambda p:(p[0]*c+p[1]*s,-p[0]*s+p[1]*c)
    back=lambda p:(p[0]*c-p[1]*s,p[0]*s+p[1]*c)
    edges=[]
    for P in polys:
        Q=[rot(p) for p in P]
        for i in range(len(Q)): edges.append((Q[i],Q[(i+1)%len(Q)]))
    ys=[e[0][1] for e in edges]
    if not ys: return ''
    out=[];yv=min(ys)+sp/2
    while yv<max(ys):
        xs=[]
        for (x1,y1),(x2,y2) in edges:
            if (y1<=yv<y2) or (y2<=yv<y1): xs.append(x1+(yv-y1)*(x2-x1)/(y2-y1))
        xs.sort()
        for i in range(0,len(xs)-1,2):
            a,b2=xs[i]+inset,xs[i+1]-inset
            if b2-a>3:
                p1,p2=back((a,yv)),back((b2,yv)); out.append(f"M{p1[0]:.1f} {p1[1]:.1f}L{p2[0]:.1f} {p2[1]:.1f}")
        yv+=sp
    return ''.join(out)
ANG={'front':{'chest':18,'deltoids':70,'biceps':85,'triceps':88,'forearm':75,'abs':90,'obliques':50,'quadriceps':80,'adductors':120,'tibialis':85,'calves':90,'trapezius':150,'neck':65},'back':{'trapezius':160,'upper-back':40,'lower-back':90,'gluteal':145,'hamstring':88,'deltoids':70,'triceps':88,'calves':90,'forearm':75,'adductors':120,'neck':90}}
P={'chest','upper-back','quadriceps','hamstring','deltoids'};H={'triceps','biceps','gluteal'};SKIN={'hair','head','hands','feet','knees','ankles'}
def col(s): return '#007A99' if s in P else '#7FE3F2' if s in H else '#EEF4F5' if s in SKIN else '#D3E3E7'
def fib(s): return ('#FFFFFF','.34') if s in P else ('#FFFFFF','.6') if s in H else ('#8FAAB2','.55')
out=['<svg xmlns="http://www.w3.org/2000/svg" width="1448" height="1448" viewBox="0 0 1448 1448">']
for view in ('front','back'):
    out.append(f'<g id="{view}">')
    for i,(slug,side,d) in enumerate(b[view]):
        out.append(f'<path id="{slug}__{side}__{i}" d="{d}" fill="{col(slug)}"/>')
        if slug not in SKIN:
            a=ANG[view].get(slug,90); a=180-a if side=='right' else a
            h=hatch(flatten(d),a,6.0)
            if h:
                fc,fo=fib(slug); out.append(f'<path id="fib__{slug}__{side}__{i}" d="{h}" fill="none" stroke="{fc}" stroke-opacity="{fo}" stroke-width="1.4" stroke-linecap="round"/>')
        out.append(f'<path id="edge__{slug}__{i}" d="{d}" fill="none" stroke="#FFFFFF" stroke-width="2.6"/>')
    out.append('</g>')
out.append('</svg>')
open(f"{D}/bodymap_fibers.svg","w").write("\n".join(out)); print(len("\n".join(out)))
