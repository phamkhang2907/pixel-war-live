"""Lossless UI KIT extraction and non-destructive SVG viewports into original PNGs."""
from zipfile import ZipFile
from pathlib import Path
import hashlib,json,struct,shutil
root=Path(__file__).resolve().parents[1];dest=root/'public/assets/ui/kit';dest.mkdir(parents=True,exist_ok=True)
purposes={'4974':'War Titan helmet, title and score centerpiece','4976':'Compact dark ornamental statistics frame','4977':'RED HP fill','4978':'Horizontal connector/notification frame','4979':'Gold, silver and bronze merit badges','4980':'BLUE HP fill','4981':'Chest and coins reward illustrations','4982':'Circular avatar ring','4983':'Rare summon notification frame','4984':'BLUE eagle scoreboard and frame pieces','4985':'Large expandable ranking border','4986':'RED lion scoreboard and frame pieces','4987':'Crowned Top 10 leaderboard','4988':'RED versus BLUE statistics panel','4989':'Nine-row alternate ranking artwork; use the crowned ten-slot panel for Top 10'}
manifest=[]
with ZipFile(root/'assets/ui/UI KIT.zip') as z:
 for n in z.namelist():
  if not n.lower().endswith('.png') or n.startswith('__MACOSX'):continue
  data=z.read(n);name=Path(n).name;width,height=struct.unpack_from('>II',data,16);(dest/name).write_bytes(data)
  manifest.append({'file':name,'purpose':purposes[name[4:8]],'width':width,'height':height,'mode':'RGBA' if data[25]==6 else 'PNG','sha256':hashlib.sha256(data).hexdigest()})
views={
 'titan':('4974',(78,5,1501,1634)), 'stats':('4976',(225,229,1273,660)), 'red-fill':('4977',(104,416,1585,153)),
 'connector':('4978',(46,182,1705,644)), 'badges':('4979',(109,217,1562,551)), 'blue-fill':('4980',(67,428,1659,133)),
 'rewards':('4981',(112,385,1189,551)), 'avatar':('4982',(49,27,1309,1338)), 'rare-notice':('4983',(37,122,1718,683)),
 'red-crest':('4986',(350,185,450,535)), 'blue-crest':('4984',(345,100,470,405)),
 'red-name':('4986',(200,730,760,140)), 'blue-name':('4984',(190,490,780,140)),
 'red-hp':('4986',(180,990,820,190)), 'blue-hp':('4984',(185,630,790,145)),
 'panel':('4985',(68,46,1017,1648)), 'top10':('4987',(99,6,952,1717)), 'versus':('4988',(148,86,1105,1200)), 'period-rank':('4989',(204,0,743,1724)),
}
if (dest/'views').exists():shutil.rmtree(dest/'views')
(dest/'manifest.json').write_text(json.dumps({'source':'live/assets/ui/UI KIT.zip','assets':manifest,'views':{n:{'source':f'IMG_{v[0]}.PNG','viewport':v[1]} for n,v in views.items()}},indent=2))
print(f'Extracted {len(manifest)} original RGBA PNGs unchanged; created {len(views)} non-destructive viewport definitions')
