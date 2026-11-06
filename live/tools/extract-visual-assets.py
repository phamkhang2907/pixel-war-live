"""Idempotently extract owner-uploaded independent CC0 archives; never alter ZIPs."""
from pathlib import Path, PurePosixPath
from zipfile import ZipFile
from urllib.parse import unquote
import hashlib, json, struct, argparse
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path);args=parser.parse_args()
OUT=args.output.resolve() if args.output else ROOT/'public/assets/3d'
def sha(b):return hashlib.sha256(b).hexdigest()
def write(p,b):
 p.parent.mkdir(parents=True,exist_ok=True)
 if p.exists():
  if p.read_bytes()!=b:raise RuntimeError('Refusing different-content overwrite: '+str(p))
 else:p.write_bytes(b)
def extract(sources,dest,allowed):
 seen={};archives=[];duplicate=[]
 for p in sources:
  original=p.read_bytes();signature=original.rfind(b'PK\x05\x06');assert signature>=0
  disk,start_disk=struct.unpack_from('<HH',original,signature+4)
  if disk or start_disk:raise RuntimeError('Multipart ZIP requires explicit assembly: '+p.name)
  archives.append({'file':str(p.relative_to(ROOT)),'sha256':sha(original),'archiveType':'independent ZIP'})
  with ZipFile(p) as z:
   for entry in z.infolist():
    if entry.is_dir() or not allowed(entry.filename):continue
    name=PurePosixPath(entry.filename)
    if name.is_absolute() or '..' in name.parts:raise RuntimeError('Unsafe ZIP path')
    content=z.read(entry)
    if str(name) in seen:
     if seen[str(name)]!=sha(content):raise RuntimeError('Conflicting archive entry: '+str(name))
     duplicate.append(str(name));continue
    seen[str(name)]=sha(content);write(dest/str(name),content)
  assert p.read_bytes()==original,'Original ZIP changed'
 return archives,seen,duplicate
nature=OUT/'nature/stylized'
archives,files,duplicates=extract(sorted((ROOT/'assets/3d/nature').glob('*.zip')),nature,lambda n:Path(n).suffix.lower() in ['.gltf','.bin','.png','.txt'])
assert len(archives)==4,'Expected the four uploaded Nature archives'
models=[]
for p in sorted(nature.rglob('*.gltf')):
 j=json.loads(p.read_text());deps=[]
 for entry in j.get('buffers',[])+j.get('images',[]):
  uri=entry.get('uri','')
  if not uri or uri.startswith('data:'):continue
  target=(p.parent/unquote(uri)).resolve()
  if not target.is_relative_to(nature.resolve()) or not target.is_file():raise RuntimeError('Missing/unsafe glTF dependency '+str(target))
  deps.append(str(target.relative_to(nature)))
 models.append({'name':p.stem,'path':str(p.relative_to(nature)),'dependencies':deps,'triangles':sum(j['accessors'][q['indices']]['count']//3 for m in j['meshes'] for q in m['primitives'])})
assert len(models)==68
manifest={'license':'CC0-1.0','creator':'Quaternius','source':'https://quaternius.com','archives':archives,'identicalDuplicates':duplicates,'files':files,'models':models}
(nature/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
fx=OUT/'effects/kenney'
archives,files,duplicates=extract([ROOT/'assets/3d/effects/kenney_particle-pack.zip'],fx,lambda n:n.endswith('.png') or n=='License.txt')
names=['smoke_01','smoke_04','fire_01','flame_01','magic_01','spark_01','slash_01','trace_01','star_01','circle_01','twirl_01','dirt_01','light_01','scratch_01','muzzle_01','window_01']
tiles={name:{'index':k,'source':'PNG (Transparent)/'+name+'.png'} for k,name in enumerate(names)}
derived=ROOT/'assets/3d/effects/derived'
meta=json.loads((derived/'kenney-atlas-source.json').read_text())
atlas=(derived/'kenney-atlas-1k.png').read_bytes()
assert archives[0]['sha256']==meta['sourceSha256'],'Particle ZIP changed: regenerate atlas with documented recipe'
assert sha(atlas)==meta['atlasSha256'],'Atlas integrity mismatch'
assert struct.unpack('>II',atlas[16:24])==(1024,1024)
write(fx/'atlas-1k.png',atlas)
(fx/'manifest.json').write_text(json.dumps({'license':'CC0-1.0','creator':'Kenney','source':'https://kenney.nl/assets/particle-pack','archives':archives,'files':files,'atlas':{'path':'atlas-1k.png','size':1024,'grid':4,'tiles':tiles}},indent=2)+'\n')
print('Visual assets: 4 independent Nature ZIPs; 68 validated glTF models, BIN/texture paths preserved;',len(files),'Kenney PNG/license files; 16-tile 1K atlas. Originals unchanged.')
