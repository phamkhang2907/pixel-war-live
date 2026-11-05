"""Original pixel artwork. 32x40 frames, 6 frames x 5 real animation states."""
from PIL import Image,ImageDraw
import math,os
out=os.path.join(os.path.dirname(__file__),'../public/assets');os.makedirs(out,exist_ok=True)
for team,base in [('red','#ee6072'),('blue','#66a9ff')]:
 for kind in ['sword','archer','cavalry','mage','boss']:
  sheet=Image.new('RGBA',(192,200))
  for state in range(5):
   for f in range(6):
    im=Image.new('RGBA',(32,40));d=ImageDraw.Draw(im);bob=[0,-1,-2,-1,0,1][f] if state==1 else ([0,0,-1,-1,0,0][f] if state==0 else 0)
    def r(box,c):d.rectangle((box[0],box[1]+bob,box[2],box[3]+bob),fill=c)
    dark='#17273d';metal='#d4e4ea';skin='#e9ba8a'
    if kind=='cavalry':
     r((5,25,26,32),'#976747');r((23,18,29,29),'#b98559');r((26,18,30,22),'#dac09a')
     for x in [8,22]:r((x+(f%3-1 if state==1 else 0),31,x+2,37),dark)
    else:
     step=[-2,0,2,2,0,-2][f] if state==1 else 0
     r((11+step,29,14+step,36),dark);r((19-step,29,22-step,36),dark);r((9+step,35,14+step,37),'#abb5c4');r((19-step,35,24-step,37),'#abb5c4')
    r((9,17,23,29),dark);r((10,17,22,27),base);r((13,18,18,26),metal);r((9,27,23,29),'#b18c50');r((7,19,10,26),base);r((7,25,10,28),skin)
    r((11,7,23,17),dark);r((12,9,22,16),skin);r((11,6,23,10),metal);r((10,9,13,15),metal);r((17,12,18,13),dark);r((22,12,23,13),dark);r((15,4,19,6),base)
    shift=[0,2,5,7,4,1][f] if state==2 else 0
    if kind in ['sword','boss','cavalry']:
     r((24,15-shift,26,28-shift),metal);r((22,27-shift,29,28-shift),'#f4cd76');r((25,29-shift,26,32-shift),'#856341');r((3,19,8,30),dark);r((4,20,9,28),base);r((6,21,7,26),metal)
    if kind=='archer':
     d.arc((22-shift//2,12,31,31),-80,80,fill='#dfb56e',width=2);d.line((27,13,27-shift//2,30),fill=metal);r((21-shift,21,30,22),'#e8d6aa')
    if kind=='mage':
     d.polygon([(8,11+bob),(17,0+bob),(26,11+bob)],fill=base);r((8,27,24,34),base);r((27,12,28,35),'#b59066');r((25,8-shift//3,30,13-shift//3),'#91f5dc');r((27,7-shift//3,28,14-shift//3),'#ffffff')
    if kind=='boss':
     r((9,3,24,6),'#f5cb71');r((9,0,11,4),'#f5cb71');r((16,0,18,4),'#f5cb71');r((22,0,24,4),'#f5cb71');r((4,17,9,20),metal)
    if state==3:
     im=im.rotate([-12,0,8,0,-5,0][f],resample=Image.Resampling.NEAREST)
    if state==4:
     im=im.rotate(-min(90,f*22),resample=Image.Resampling.NEAREST);im.putalpha(im.getchannel('A').point(lambda a:int(a*(1-f/7))))
    sheet.alpha_composite(im,(f*32,state*40))
  sheet.save(out+'/'+team+'-'+kind+'.png')
# original pixel castles
for team,base in [('red','#b94e63'),('blue','#467db7')]:
 im=Image.new('RGBA',(100,90));d=ImageDraw.Draw(im)
 d.rectangle((12,28,87,76),fill='#27394b');d.rectangle((16,31,83,73),fill='#a6abb3')
 for x in [7,70]:
  d.rectangle((x,20,x+23,76),fill='#737f91');d.rectangle((x+3,21,x+20,70),fill='#bec0bf')
  for a in [0,9,18]:d.rectangle((x+a,13,x+a+5,25),fill='#cbd0cb')
  d.rectangle((x+9,34,x+14,48),fill='#23384a')
 d.rectangle((34,14,65,57),fill='#d0c8b8');d.polygon([(29,16),(49,0),(70,16)],fill=base)
 d.rectangle((40,47,59,76),fill='#223145');d.arc((40,39,59,57),180,360,fill='#223145',width=9)
 for y in [35,45,55,65]:
  for x in range(17,84,13):d.line((x,y,x+8,y),fill='#858d99')
 d.rectangle((47,18,53,35),fill=base);d.rectangle((8,76,92,80),fill='#47576b');im.save(out+'/'+team+'-castle.png')
# Small original projectile textures, separate from animated character sheets.
im=Image.new('RGBA',(18,7));d=ImageDraw.Draw(im);d.line((1,3,15,3),fill='#edca8b',width=2);d.polygon([(17,3),(12,0),(12,6)],fill='#e5eaf1');d.line((1,0,4,3),fill='#e87880',width=2);im.save(out+'/arrow.png')
im=Image.new('RGBA',(12,12));d=ImageDraw.Draw(im);d.polygon([(6,0),(11,6),(6,11),(0,6)],fill='#589ba0');d.polygon([(6,2),(9,6),(6,9),(2,6)],fill='#a0f0dd');d.rectangle((5,4,7,7),fill='#effff9');im.save(out+'/magic.png')
