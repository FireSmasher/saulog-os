# Builds eagle-rig.html and carabao-rig.html from the locked tarsier rig.html (same engine, own parts and pivots).
import re, math, os, sys
D=os.path.dirname(os.path.abspath(__file__)); T=open(D+'/rig.html').read()
def must(s,a):
    assert a in s, a[:80]; return s
# 1. make the engine read pivots from R
JS=[("translate(0 ${lid*134})","translate(0 ${lid*R.lid})"),
 ("translate(515 478) scale(${1+nt} ${1-nt*.6}) translate(-515 -478)","translate(${R.nose}) scale(${1+nt} ${1-nt*.6}) translate(${R.nose.map(v=>-v)})"),
 ("- (mood==='tired'?8:0)} 300 440)","- (mood==='tired'?8:0)} ${R.earL})"),
 ("+ (mood==='tired'?8:0)} 730 440)","+ (mood==='tired'?8:0)} ${R.earR})"),
 ("translate(515 880) scale(${sx} ${sy}) translate(-515 -880)","translate(${R.ground}) scale(${sx} ${sy}) translate(${R.ground.map(v=>-v)})"),
 ("+ look.x*2} 515 575)","+ look.x*2} ${R.head})"),
 ("translate(515 884) scale(${1+hop/240}) translate(-515 -884)","translate(${R.shadow}) scale(${1+hop/240}) translate(${R.shadow.map(v=>-v)})"),
 ("rotate(${aL} 345 612)","rotate(${aL} ${R.armL})"),("rotate(${aR} 685 612)","rotate(${aR} ${R.armR})"),
 ("*tw} 650 790)","*tw} ${R.tail})"),
 ("translate(515 252) scale(","translate(${R.flame}) scale("),("rotate(${S(t*7)*4}) translate(-515 -252)","rotate(${S(t*7)*4}) translate(${R.flame.map(v=>-v)})"),
 ("translate(${look.x*16} ${look.y*12})","translate(${look.x*R.look[0]} ${look.y*R.look[1]})"),
 ("p.x=515+Math.cos(a)*lerp(235,320,Math.random()); p.y=590+Math.sin(a)*lerp(290,360,Math.random());","p.x=R.cx+Math.cos(a)*lerp(R.rx[0],R.rx[1],Math.random()); p.y=R.cy+Math.sin(a)*lerp(R.ry[0],R.ry[1],Math.random());"),
 ("if(p.y>860)p.y=860; p.vx=(515-p.x)","if(p.y>R.floor)p.y=R.floor; p.vx=(R.cx-p.x)"),
 ("let x=515+Math.cos(a)*230,y=600+Math.sin(a)*290","let x=R.cx+Math.cos(a)*R.rx[0],y=R.cy+Math.sin(a)*R.ry[0]"),
 ("l.x=Math.random()<.5?lerp(230,350,Math.random()):lerp(680,800,Math.random());","l.x=Math.random()<.5?lerp(R.cx-R.rx[1]+20,R.cx-R.rx[0]+40,Math.random()):lerp(R.cx+R.rx[0]-40,R.cx+R.rx[1]-20,Math.random());"),
 ("l.y=lerp(650,900,Math.random())","l.y=lerp(R.floor-200,R.floor+40,Math.random())"),
]
for a,b in JS: must(T,a); T=T.replace(a,b)
T=T.replace("const $=s=>","const R=__R__;\nconst $=s=>",1)
TAR=dict(lid=134,nose=[515,478],earL=[300,440],earR=[730,440],ground=[515,880],head=[515,575],shadow=[515,884],armL=[345,612],armR=[685,612],tail=[650,790],flame=[515,252],look=[16,12],cx=515,cy=590,rx=[235,320],ry=[290,360],floor=860)
import json
open(D+'/rig.html','w').write(T.replace('__R__',json.dumps(TAR)))   # tarsier keeps its exact numbers
char_re=re.compile(r'<g id="char".*?(?=\n  <g id="sparks")',re.S)
clip_re=re.compile(r'<clipPath id="eyeL">.*?</clipPath>\s*<clipPath id="eyeR">.*?</clipPath>',re.S)
shadow_re=re.compile(r'<ellipse id="shadow"[^>]*/>')
ring_re=re.compile(r'<ellipse id="ring"[^>]*/>')

def spiky(cx,cy,rx,ry,a0,a1,n,k):
    pts=[]
    for i in range(n+1):
        th=math.radians(a0+(a1-a0)*i/n); r=1+(k if i%2 else 0)
        pts.append((cx+rx*r*math.cos(th),cy+ry*r*math.sin(th)))
    d=f'M{cx:.0f} {cy:.0f} L{pts[0][0]:.0f} {pts[0][1]:.0f}'
    for i in range(1,len(pts)):
        (x0,y0),(x1,y1)=pts[i-1],pts[i]; mx,my=(x0+x1)/2,(y0+y1)/2
        d+=f' Q{mx+(mx-cx)*.06:.0f} {my+(my-cy)*.06:.0f} {x1:.0f} {y1:.0f}'
    return d+' Z'

def lid_eye(cx,cy,r,face,ink,shine_r):
    return (f'<g clip-path="url(#eye{"L" if cx<500 else "R"})"><ellipse cx="{cx}" cy="{cy}" rx="{r}" ry="{r*.88:.0f}" fill="{ink}"/>'
            f'<g class="shine"><circle cx="{cx+r*.35:.0f}" cy="{cy-r*.35:.0f}" r="{shine_r}" fill="#fff"/></g>'
            f'<g class="lid"><rect x="{cx-r-10}" y="{cy-r-2-3*r}" width="{2*r+20}" height="{3*r}" fill="{face}"/><path d="M{cx-r-4} {cy-r-2} Q{cx} {cy-r+6} {cx+r+4} {cy-r-2}" fill="none" stroke="{ink}" stroke-width="6"/></g></g>')

def build(name,title,orig,vb,R,clips,shadow,ring,char):
    s=T.replace('__R__',json.dumps(R))
    s=s.replace('<title>Apoy Tarsier Rig</title>',f'<title>Apoy {title} Rig</title>').replace('<h1>Tarsier rig test</h1>',f'<h1>{title} rig test</h1>')
    s=s.replace('aria-label="Animated tarsier"',f'aria-label="Animated {title.lower()}"').replace('../mascots_v3/tarsier_3.png',f'../mascots_v3/{orig}.png').replace('alt="Original tarsier drawing"',f'alt="Original {title.lower()} drawing"')
    s=re.sub(r'viewBox="[^"]*"',f'viewBox="{vb}"',s,count=1)
    s=clip_re.sub(clips,s,1); s=shadow_re.sub(shadow,s,1); s=ring_re.sub(ring,s,1)
    s=char_re.sub(lambda m:char,s,1)
    open(f'{D}/{name}','w').write(s); print('wrote',name)

# ---------- Philippine eagle ----------
INK='#3a1d17'; CREAM='#fffaf0'; TAN='#f4d9a3'; BROWN='#7a4e3d'; BEAK='#b7c9d8'; BEAKD='#8fa3b3'; BINK='#3e4a55'; FOOT='#9aa6b2'
mane=spiky(505,365,235,190,140,400,26,.16)
eagle=f'''<g id="char" filter="url(#glow)" stroke="{INK}" stroke-width="12" stroke-linejoin="round" stroke-linecap="round">
    <g id="tail"><path d="M425 230 L448 140 L488 192 L512 112 L540 186 L588 146 L590 232 Z" fill="{TAN}"/></g>
    <g id="legL"><ellipse cx="398" cy="860" rx="48" ry="22" fill="{FOOT}" stroke="{BINK}"/><path d="M380 850 L376 872 M402 850 L402 874 M422 850 L428 872" stroke="{BINK}" stroke-width="5"/></g>
    <g id="legR"><ellipse cx="598" cy="860" rx="48" ry="22" fill="{FOOT}" stroke="{BINK}"/><path d="M580 850 L576 872 M602 850 L602 874 M622 850 L628 872" stroke="{BINK}" stroke-width="5"/></g>
    <g id="torso"><path d="M505 178 C645 178 735 300 735 525 C735 725 650 852 505 852 C360 852 275 725 275 525 C275 300 365 178 505 178 Z" fill="{CREAM}"/>
      <g fill="{TAN}" stroke="none" opacity=".75"><ellipse cx="390" cy="600" rx="11" ry="15"/><ellipse cx="445" cy="630" rx="13" ry="11"/><ellipse cx="560" cy="640" rx="12" ry="10"/><ellipse cx="610" cy="610" rx="10" ry="13"/><ellipse cx="480" cy="680" rx="9" ry="12"/><ellipse cx="575" cy="700" rx="10" ry="9"/></g></g>
    <g id="armL"><path d="M338 505 C292 545 266 645 286 765 Q296 792 312 782 C352 700 356 585 338 505 Z" fill="{BROWN}"/><path d="M318 560 C304 620 300 680 306 735" fill="none" stroke="#5f3a2d" stroke-width="7"/></g>
    <g id="armR"><path d="M682 505 C735 560 758 660 744 760 L758 818 Q734 830 702 782 C678 700 668 585 682 505 Z" fill="{BROWN}"/><path d="M712 560 C726 620 730 680 724 735" fill="none" stroke="#5f3a2d" stroke-width="7"/></g>
    <g id="head">
      <path d="{mane}" fill="{TAN}"/>
      <g fill="none" stroke="#e2b673" stroke-width="7" opacity=".8"><path d="M470 210 Q478 250 470 290"/><path d="M540 205 Q548 240 560 260"/><path d="M300 380 Q320 430 330 470"/><path d="M712 380 Q694 430 684 470"/></g>
      <g id="earL"><circle cx="366" cy="300" r="31" fill="#6e4a3c"/></g>
      <g id="earR"><circle cx="648" cy="300" r="31" fill="#6e4a3c"/></g>
      <path d="M505 245 C600 245 668 300 670 395 C672 470 640 525 610 560 L400 560 C370 525 338 470 340 395 C342 300 410 245 505 245 Z" fill="{CREAM}" stroke="none"/>
      <ellipse cx="398" cy="434" rx="30" ry="17" fill="#f6b8aa" opacity=".6" stroke="none"/><ellipse cx="616" cy="434" rx="30" ry="17" fill="#f6b8aa" opacity=".6" stroke="none"/>
      <g id="eyes" stroke="none">{lid_eye(430,402,21,CREAM,'#2a1512',5)}{lid_eye(585,402,21,CREAM,'#2a1512',5)}</g>
      <g id="brows" fill="none" stroke="#2a1512" stroke-width="11"><path d="M403 376 L458 392"/><path d="M612 376 L557 392"/></g>
      <g id="mouths" stroke="{BINK}" stroke-width="8">
        <path data-m="w" d="M0 0" fill="none" stroke="none"/><path data-m="flat" d="M0 0" fill="none" stroke="none"/>
        <ellipse data-m="smile" cx="508" cy="470" rx="22" ry="16" fill="#8a3330"/>
        <ellipse data-m="o" cx="508" cy="474" rx="15" ry="18" fill="#8a3330"/>
        <ellipse data-m="yawn" cx="508" cy="480" rx="24" ry="28" fill="#8a3330"/>
        <ellipse data-m="grin" cx="508" cy="472" rx="30" ry="20" fill="#8a3330"/>
      </g>
      <g id="nose"><path d="M470 400 C468 368 548 368 546 400 C545 428 527 446 508 474 C489 446 471 428 470 400 Z" fill="{BEAK}" stroke="{BINK}" stroke-width="11"/>
        <path d="M482 424 Q508 438 534 424 Q522 448 508 468 Q494 448 482 424 Z" fill="{BEAKD}" stroke="none"/></g>
      <g id="flame"></g>
    </g>
  </g>'''
ER=dict(lid=46,nose=[508,420],earL=[366,300],earR=[648,300],ground=[505,870],head=[505,560],shadow=[505,885],armL=[332,512],armR=[688,512],tail=[505,225],flame=[505,150],look=[6,4],cx=505,cy=520,rx=[265,335],ry=[330,385],floor=860)
build('eagle-rig.html','Eagle','eagle_3','140 40 740 900',ER,
 '<clipPath id="eyeL"><ellipse cx="430" cy="402" rx="21" ry="19"/></clipPath><clipPath id="eyeR"><ellipse cx="585" cy="402" rx="21" ry="19"/></clipPath>',
 '<ellipse id="shadow" cx="505" cy="885" rx="180" ry="20" fill="rgba(70,45,25,.16)"/>','<ellipse id="ring" cx="505" cy="885" rx="200" ry="26" fill="none" stroke="#ff8a00" stroke-width="8"/>',eagle)

# ---------- Carabao ----------
INK='#2a1e1e'; GREY='#878282'; HORN='#dcdcd8'; HAT='#f1c98d'; WEAVE='#d9aa66'; DARK='#3c3434'
carabao=f'''<g id="char" filter="url(#glow)" stroke="{INK}" stroke-width="13" stroke-linejoin="round" stroke-linecap="round">
    <g id="legL"><path d="M318 820 L318 856" stroke-width="60"/><path d="M318 820 L318 856" stroke="{GREY}" stroke-width="34"/><ellipse cx="312" cy="866" rx="44" ry="17" fill="{DARK}"/></g>
    <g id="legR"><path d="M530 820 L530 856" stroke-width="60"/><path d="M530 820 L530 856" stroke="{GREY}" stroke-width="34"/><ellipse cx="524" cy="866" rx="44" ry="17" fill="{DARK}"/></g>
    <g id="head">
      <g id="earL"><ellipse cx="200" cy="422" rx="64" ry="27" fill="{GREY}" transform="rotate(-8 200 422)"/><ellipse cx="190" cy="424" rx="36" ry="12" fill="#6d6868" stroke="none" transform="rotate(-8 200 422)"/></g>
      <g id="earR"><ellipse cx="650" cy="420" rx="56" ry="25" fill="{GREY}" transform="rotate(8 650 420)"/><ellipse cx="660" cy="422" rx="32" ry="11" fill="#6d6868" stroke="none" transform="rotate(8 650 420)"/></g>
      <path d="M252 345 C200 340 160 300 170 255 Q178 242 188 258 C196 290 226 308 268 312 Z" fill="{HORN}"/>
      <path d="M688 340 C740 335 776 300 762 255 Q754 242 744 258 C738 288 712 305 676 310 Z" fill="{HORN}"/>
    </g>
    <g id="torso"><path d="M262 380 C245 450 242 515 250 560 C200 612 186 700 214 770 C238 830 288 856 340 856 L598 856 C660 850 718 802 738 722 C754 642 722 582 682 546 C692 490 696 430 690 380 Z" fill="{GREY}"/></g>
    <g id="armL"><path d="M178 760 L262 705" stroke-width="28"/><path d="M178 760 L262 705" stroke="#6d6d6d" stroke-width="12"/>
      <rect x="132" y="732" width="56" height="62" rx="12" fill="#5e5a5a" transform="rotate(-33 160 763)"/>
      <path d="M244 615 L262 700" stroke-width="64"/><path d="M244 615 L262 700" stroke="{GREY}" stroke-width="38"/><circle cx="264" cy="710" r="27" fill="{GREY}"/></g>
    <g id="armR"><path d="M632 615 L648 728" stroke-width="64"/><path d="M632 615 L648 728" stroke="{GREY}" stroke-width="38"/></g>
    <g id="face">
      <ellipse cx="470" cy="392" rx="215" ry="16" fill="rgba(0,0,0,.14)" stroke="none"/>
      <g id="eyes" stroke="none">{lid_eye(336,466,18,GREY,'#1e1616',4)}{lid_eye(504,466,18,GREY,'#1e1616',4)}</g>
      <g id="nose"><ellipse cx="420" cy="496" rx="35" ry="18" fill="{DARK}" stroke="none"/><ellipse cx="405" cy="497" rx="6" ry="4" fill="#1a1414" stroke="none"/><ellipse cx="435" cy="497" rx="6" ry="4" fill="#1a1414" stroke="none"/></g>
      <g id="mouths" stroke-width="7">
        <path data-m="w" d="M400 534 Q420 516 440 534" fill="none"/>
        <path data-m="flat" d="M402 528 L438 528" fill="none"/>
        <path data-m="smile" d="M398 520 Q420 550 442 520 Q420 528 398 520 Z" fill="#8a3330"/>
        <ellipse data-m="o" cx="420" cy="530" rx="12" ry="14" fill="#8a3330"/>
        <ellipse data-m="yawn" cx="420" cy="535" rx="18" ry="24" fill="#8a3330"/>
        <path data-m="grin" d="M392 518 Q420 560 448 518 Z" fill="#8a3330"/>
      </g>
    </g>
    <g id="tail"><path d="M198 378 Q495 400 792 364 Q700 302 510 236 Q300 300 198 378 Z" fill="{HAT}"/>
      <g stroke="{WEAVE}" stroke-width="7" fill="none"><path d="M510 248 L300 362"/><path d="M510 248 L420 376"/><path d="M510 248 L512 380"/><path d="M510 248 L612 374"/><path d="M510 248 L716 364"/><path d="M330 330 Q510 350 690 326"/><path d="M412 290 Q510 302 612 288"/></g>
      <g id="flame"></g></g>
  </g>'''
# the face lives inside "head" in the engine; wrap it so tilts move ears, horns, face and hat together
carabao=carabao.replace('<g id="head">','<g id="headBack">',1).replace('<g id="face">','<g id="head">',1)
CR=dict(lid=40,nose=[420,496],earL=[250,420],earR=[600,420],ground=[470,868],head=[470,560],shadow=[465,885],armL=[244,615],armR=[632,615],tail=[495,375],flame=[495,200],look=[5,4],cx=468,cy=570,rx=[300,370],ry=[330,385],floor=860)
build('carabao-rig.html','Carabao','carabao_7','80 120 820 820',CR,
 '<clipPath id="eyeL"><ellipse cx="336" cy="466" rx="18" ry="16"/></clipPath><clipPath id="eyeR"><ellipse cx="504" cy="466" rx="18" ry="16"/></clipPath>',
 '<ellipse id="shadow" cx="465" cy="885" rx="230" ry="20" fill="rgba(70,45,25,.16)"/>','<ellipse id="ring" cx="465" cy="885" rx="230" ry="26" fill="none" stroke="#ff8a00" stroke-width="8"/>',carabao)
