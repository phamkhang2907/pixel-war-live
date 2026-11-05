"""Original PIXEL WAR art: 64px frames / 8 frames / 8 rows. Python + Pillow only.
Draw pixel silhouettes, layered armour, heraldry, horse, wings, staff, shield and axe.
No external artwork. Runtime uses raster sprite sheets, never geometry for units.
"""
from PIL import Image,ImageDraw
import math,os,random,json
out=os.path.join(os.path.dirname(__file__),'../public/assets');os.makedirs(out,exist_ok=True)
rows=['idle','run','attack','hurt','death','fly','stomp','rage']
for team,main,light in [('red','#bd3859','#f47e7b'),('blue','#356eb8','#8ac8fa')]:
 for kind in ['sword','archer','cavalry','mage','guardian','boss']:
  sheet=Image.new('RGBA',(512,512))
  for row,state in enumerate(rows):
   for frame in range(8):
    im=Image.new('RGBA',(64,64));d=ImageDraw.Draw(im)
    bob=round(math.sin(frame*math.pi/4)*(2 if state in ['run','fly'] else 1))
    lift=-4 if kind=='mage' else 0
    cy=23+bob+lift; cx=30
    skin='#dfae84'; ink='#182039'; steel='#9cbbc9'; shine='#e9efdd'; gold='#e4b76f'
    def poly(points,c):d.polygon([(x,y+bob+lift) for x,y in points],fill=c)
    def line(points,c,w=1):d.line([(x,y+bob+lift) for x,y in points],fill=c,width=w)
    if kind=='cavalry':
     # Horse: distinct muzzle, ears, mane, saddle, flowing tail and four gait legs.
     stride=round(math.sin(frame*math.pi/4)*5) if state=='run' else 0
     poly([(10,40),(37,37),(45,30),(49,25),(54,27),(55,37),(49,40),(45,51),(16,52),(9,47)],'#633d37')
     poly([(12,42),(37,40),(44,34),(48,34),(47,46),(39,49),(17,49)],'#ac7954')
     poly([(47,26),(47,21),(50,26),(54,26),(54,23),(56,31)],ink)
     line([(10,44),(4,43),(2,50)],'#302a32',3)
     for x,s in [(15,stride),(23,-stride),(38,-stride),(44,stride)]:
      line([(x,48),(x+s,57),(x+s+3,59)],ink,3);line([(x,49),(x+s,55)],'#aa7755',1)
     poly([(22,39),(38,38),(37,48),(24,49)],main);line([(24,40),(35,40)],gold,2)
     d.point((52,31+bob),fill=shine)
    else:
     stride=round(math.sin(frame*math.pi/4)*4) if state=='run' else 0
     if kind=='mage':
      poly([(19,35),(38,35),(43,52),(33,48),(28,54),(23,48),(15,52)],main)
      # Wings/cape animated in flight, with individual feather silhouettes.
      wing=round(math.sin(frame*math.pi/4)*5)
      for side in [-1,1]:
       poly([(29,30),(29+side*15,20+wing),(29+side*24,17+wing),(29+side*18,30),(29+side*21,32),(29+side*12,40)],'#a6c8d5')
       line([(29+side*6,30),(29+side*19,23+wing)],shine,2)
     else:
      for x,s in [(24,stride),(34,-stride)]:
       poly([(x-4,39),(x+4,39),(x+3+s,52),(x+5+s,56),(x-5+s,56),(x-5+s,52)],ink)
       poly([(x-3,42),(x+2,42),(x+1+s,50),(x-3+s,50)],steel)
       line([(x-3+s,53),(x+3+s,53)],gold,2)
    # Cape, torso with outlined plate, belt, layered pauldrons.
    poly([(20,23),(37,23),(43,46),(29,43),(17,48)],main)
    poly([(21,23),(37,23),(41,36),(37,43),(20,43),(17,34)],ink)
    poly([(22,24),(36,24),(38,34),(33,39),(23,38),(20,32)],steel)
    poly([(23,25),(29,24),(29,36),(24,35)],shine)
    poly([(30,25),(36,26),(36,34),(30,37)],'#647b96')
    poly([(16,24),(23,22),(25,29),(16,31),(13,28)],main)
    line([(16,24),(22,24),(23,27)],light,2)
    poly([(36,22),(42,25),(43,30),(36,29)],main)
    line([(21,39),(37,39)],'#624b44',3);poly([(28,37),(32,37),(32,41),(28,41)],gold)
    # Face and helm: eyes, nose, cheek guards, plume.
    poly([(22,9),(34,8),(39,14),(38,23),(31,27),(22,23),(19,16)],ink)
    poly([(23,12),(35,12),(37,17),(35,23),(28,23),(23,20)],skin)
    poly([(21,11),(25,7),(34,7),(38,12),(37,15),(22,14)],steel)
    line([(25,9),(33,9),(35,11)],shine,2)
    poly([(21,14),(25,14),(25,22),(22,23)],'#647b96')
    line([(29,17),(32,17)],ink,2);d.point((35,18+bob+lift),fill=ink)
    poly([(26,7),(27,3),(32,1),(38,3),(34,5),(31,9)],main)
    line([(29,4),(34,3)],light,2)
    phase=math.sin(frame*math.pi/7) if state in ['attack','stomp'] else 0
    if kind=='archer':
     poly([(17,20),(14,21),(11,42),(15,42)],'#775b44')
     for a in [12,15,18]:line([(a,20),(a+2,15)],gold)
     bx=46;draw=round(phase*7)
     d.arc((bx-7,17+bob,bx+10,45+bob),-80,80,fill=gold,width=2)
     line([(49,18),(44-draw,31),(49,44)],shine)
     line([(33,29),(43-draw,31)],skin,4);line([(40-draw,31),(59,31)],'#d6c7a0');poly([(58,29),(62,31),(58,33)],steel)
    elif kind=='mage':
     poly([(19,14),(27,1),(31,3),(35,13),(41,15)],main);line([(22,12),(35,12)],gold,2)
     line([(41,32),(48,27-int(phase*6))],skin,4);line([(49,19),(49,52)],'#8e6851',3)
     poly([(49,11-int(phase*3)),(54,17),(49,22),(44,17)],'#e9a04e');poly([(49,13),(51,17),(49,19),(47,17)],'#fff0ae')
     for k in range(3):
      x=42+((frame*3+k*7)%17);y=8+(k*9+frame*2)%26;d.point((x,y),fill='#f9ce78')
    elif kind=='guardian':
     # Giant kite shield, metal bevel and central kingdom sigil.
     sx=36+int(phase*3)
     poly([(sx,26),(sx+15,22),(sx+21,28),(sx+19,43),(sx+10,51),(sx,43)],ink)
     poly([(sx+2,28),(sx+15,25),(sx+18,29),(sx+16,42),(sx+10,47),(sx+3,41)],steel)
     poly([(sx+5,29),(sx+13,28),(sx+15,31),(sx+13,40),(sx+10,44),(sx+6,40)],main)
     line([(sx+10,29),(sx+10,40)],gold,2);line([(sx+7,34),(sx+13,34)],gold,2)
     for x,y in [(sx+4,30),(sx+15,30),(sx+5,40),(sx+14,40)]:d.point((x,y+bob),fill=shine)
     line([(12,26),(12,48)],'#69534e',3);poly([(6,21),(18,21),(20,28),(6,29)],steel)
    else:
     # Weapon swing changes silhouette across all attack frames.
     angle=-1.3+phase*2.6
     hx,hy=39,31
     ex=hx+int(math.cos(angle)*22);ey=hy+int(math.sin(angle)*22)
     line([(36,29),(42,32)],skin,4);line([(hx,hy),(ex,ey)],'#a67b50',3)
     if kind=='boss':
      poly([(ex-7,ey-8),(ex+8,ey-6),(ex+10,ey+4),(ex+4,ey+1),(ex-5,ey+5)],steel)
      poly([(20,9),(13,4),(17,15),(23,16)],gold);poly([(34,9),(40,3),(40,14),(36,17)],gold)
      for x in [16,22,37,42]:poly([(x,25),(x-3,18),(x+4,24)],steel)
      line([(26,29),(33,29)],main,3);line([(29,26),(29,35)],light,2)
     else:
      vx,vy=ex-hx,ey-hy;poly([(hx,hy),(ex,ey-3),(ex+3,ey),(hx+2,hy+2)],shine);line([(hx-3,hy+1),(hx+4,hy+4)],gold,2)
      poly([(12,29),(21,27),(22,39),(16,45),(10,39)],ink);poly([(13,30),(19,29),(20,38),(16,42),(12,38)],main);line([(15,31),(16,39)],gold,2)
    if state=='stomp':
     if frame>3:im=im.transform((64,64),Image.Transform.AFFINE,(1,0,0,0,1,-4),resample=Image.Resampling.NEAREST)
    if state=='rage':
     glow=Image.new('RGBA',(64,64));gd=ImageDraw.Draw(glow)
     for j in range(6):
      x=10+j*8;gd.line((x,58,x+int(math.sin(frame+j)*3),40-frame%4*3),fill=(255,130,55,150),width=1)
     im=Image.alpha_composite(im,glow)
    if state=='hurt':im=im.rotate([0,6,-5,3,0,-2,0,0][frame],resample=Image.Resampling.NEAREST)
    if state=='death':
     im=im.rotate(-min(88,frame*17),resample=Image.Resampling.NEAREST);im.putalpha(im.getchannel('A').point(lambda a:int(a*max(0,1-frame/9))))
    sheet.alpha_composite(im,(frame*64,row*64))
  sheet.save(out+'/'+team+'-'+kind+'.png')
# Projectiles and particles are raster pixel textures as well.
for name,color in [('fireball','#ff9a4d'),('ice','#93e9ff'),('spark','#ffe4a1'),('dust','#baaa87')]:
 im=Image.new('RGBA',(24,16));d=ImageDraw.Draw(im)
 d.polygon([(0,8),(6,6),(3,2),(13,5),(16,1),(22,5),(23,10),(18,15),(10,12),(2,14),(7,9)],fill=color)
 d.polygon([(11,7),(17,4),(21,7),(19,11),(13,11)],fill='#fff4d1');im.save(out+'/'+name+'.png')
im=Image.new('RGBA',(24,8));d=ImageDraw.Draw(im);d.line((2,4,20,4),fill='#d9bd88',width=2);d.polygon([(23,4),(18,1),(18,7)],fill='#d9e8e5');d.line((1,1,5,4,1,7),fill='#ca5f67',width=2);im.save(out+'/arrow.png')
# Keep existing original castle artwork; paint original parallax layers.
random.seed(7)
for name,w,h in [('sky',540,960),('mountains',900,500),('forest',900,400)]:
 im=Image.new('RGBA',(w,h));d=ImageDraw.Draw(im)
 if name=='sky':
  for y in range(0,h,4):
   t=y/h;d.rectangle((0,y,w,y+3),fill=(int(25+28*t),int(34+30*t),int(63+20*t)))
  d.ellipse((340,70,415,145),fill='#d7d5b2');d.ellipse((328,65,395,130),fill='#26344e')
  for i in range(80):x=random.randrange(w);y=random.randrange(420);d.rectangle((x,y,x+1,y+1),fill='#b2b0b6')
 else:
  for i in range(22):
   x=i*45;peak=random.randrange(35,200)
   if name=='mountains':
    d.polygon([(x-100,h),(x+45,peak),(x+180,h)],fill=random.choice(['#354561','#40516a','#485873']));d.polygon([(x+20,peak+45),(x+45,peak),(x+70,peak+50),(x+48,peak+35)],fill='#8d9a9e')
   else:
    for j in range(3):d.polygon([(x-35+j*5,h-10-j*25),(x,peak+j*15),(x+35-j*5,h-10-j*25)],fill=random.choice(['#263c45','#2e4749','#355050']))
 im.save(out+'/'+name+'.png')
manifest={'frameWidth':64,'frameHeight':64,'columns':8,'rows':rows,'teams':['red','blue'],'types':['sword','archer','cavalry','mage','guardian','boss'],'license':'Original artwork, MIT; see live/LICENSE'}
open(out+'/sprites.json','w').write(json.dumps(manifest,indent=2))
print('Generated 12 original 512x512 sheets, projectile textures and parallax layers')
