"""Helper: zoomed crop with a labelled coordinate grid, to read pixel positions off the drawing.
usage: python3 zoomgrid.py src.png x0 y0 x1 y1 scale step out.png"""
import sys
from PIL import Image, ImageDraw
src,x0,y0,x1,y1,s,step,out=sys.argv[1],*map(int,sys.argv[2:8]),sys.argv[8]
im=Image.open(src).convert('RGBA')
bg=Image.new('RGBA',im.size,(255,0,255,255)); bg.alpha_composite(im); im=bg.convert('RGB')
c=im.crop((x0,y0,x1,y1)).resize(((x1-x0)*s,(y1-y0)*s),Image.NEAREST)
d=ImageDraw.Draw(c)
for x in range((x0//step+1)*step,x1,step):
    X=(x-x0)*s; d.line([(X,0),(X,c.height)],fill=(0,160,255),width=1); d.text((X+2,2),str(x),fill=(0,90,255))
for y in range((y0//step+1)*step,y1,step):
    Y=(y-y0)*s; d.line([(0,Y),(c.width,Y)],fill=(255,80,0),width=1); d.text((2,Y+2),str(y),fill=(220,40,0))
c.save(out)
