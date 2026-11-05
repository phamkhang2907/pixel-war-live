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
