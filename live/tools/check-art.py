from PIL import Image
from pathlib import Path
import json
root=Path(__file__).parent.parent/'public'/'assets'
meta=json.loads((root/'sprites.json').read_text())
for team in meta['teams']:
 for unit in meta['types']:
  im=Image.open(root/f'{team}-{unit}.png');assert im.size==(512,512)
  for row,state in enumerate(meta['rows']):
   assert len({im.crop((f*64,row*64,(f+1)*64,(row+1)*64)).tobytes() for f in range(8)})>1,(team,unit,state)
print('PASS: 12 raster sheets, 64x64 frames, 96 animated rows (8 distinct-row checks per unit).')

atlas_meta=json.loads((root/'army-atlas.json').read_text());atlas=Image.open(root/'army-atlas.png')
assert atlas.size==(2048,1536) and len(atlas_meta['frames'])==768
for team in meta['teams']:
 for unit in meta['types']:
  source=Image.open(root/f'{team}-{unit}.png')
  for frame in range(64):
   f=atlas_meta['frames'][f'{team}-{unit}-{frame}']['frame']
   assert atlas.crop((f['x'],f['y'],f['x']+64,f['y']+64)).tobytes()==source.crop((frame%8*64,frame//8*64,frame%8*64+64,frame//8*64+64)).tobytes()
print('PASS: all 768 atlas frames exactly match their original animated sprite sheets.')
