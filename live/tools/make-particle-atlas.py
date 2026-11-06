"""Optional authoring tool: pip install Pillow. Normal game builds use the committed atlas."""
from pathlib import Path
from zipfile import ZipFile
from io import BytesIO
from PIL import Image
import hashlib,json
root=Path(__file__).resolve().parents[1];source=root/'assets/3d/effects/kenney_particle-pack.zip';dest=root/'assets/3d/effects/derived';dest.mkdir(exist_ok=True)
names=['smoke_01','smoke_04','fire_01','flame_01','magic_01','spark_01','slash_01','trace_01','star_01','circle_01','twirl_01','dirt_01','light_01','scratch_01','muzzle_01','window_01']
atlas=Image.new('RGBA',(1024,1024))
with ZipFile(source) as z:
 for k,name in enumerate(names):
  im=Image.open(BytesIO(z.read('PNG (Transparent)/'+name+'.png'))).convert('RGBA');im.thumbnail((252,252),Image.Resampling.LANCZOS)
  atlas.paste(im,((k%4)*256+2+(252-im.width)//2,(k//4)*256+2+(252-im.height)//2))
atlas.save(dest/'kenney-atlas-1k.png',optimize=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(dest/'kenney-atlas-source.json').write_text(json.dumps({'sourceArchive':source.name,'sourceSha256':sha(source),'atlasSha256':sha(dest/'kenney-atlas-1k.png'),'license':'CC0-1.0','recipe':'16 RGBA tiles, 252px within padded 256px cells, 1024px atlas; original PNGs unchanged'},indent=2)+'\n')
