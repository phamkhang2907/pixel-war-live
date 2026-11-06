"""Extract an exact runtime allowlist from the two existing, immutable ZIPs."""
from pathlib import Path
import hashlib, json, zipfile
from urllib.parse import unquote
root = Path(__file__).resolve().parents[1]
out = root / 'public/assets/3d/monsters'
selection = {'Ultimate_Monsters_Flying.zip': ('Flying', ['Dragon', 'Dragon_Evolved']), 'Ultimate_Monsters_Big.zip': ('Big', ['MushroomKing'])}
manifest = {'license': 'CC0-1.0', 'author': 'Quaternius', 'models': [], 'archives': {}}
allowed = set()
for archive, (group, names) in selection.items():
    source = root / 'assets/3d' / archive
    before = hashlib.sha256(source.read_bytes()).hexdigest()
    manifest['archives'][archive] = before
    with zipfile.ZipFile(source) as z:
        license_text = z.read('Ultimate Monsters/License.txt')
        for name in names:
            member = f'Ultimate Monsters/{group}/glTF/{name}.gltf'
            model = json.loads(z.read(member))
            target = out / name
            target.mkdir(parents=True, exist_ok=True)
            (target / (name + '.gltf')).write_bytes(z.read(member))
            allowed.add(target / (name + '.gltf'))
            for item in model.get('buffers', []) + model.get('images', []):
                uri = item.get('uri', '')
                if not uri or uri.startswith('data:'): continue
                relative = Path(unquote(uri))
                if relative.is_absolute() or '..' in relative.parts or ':' in uri: raise ValueError('Unsafe external dependency ' + uri)
                path = target / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(z.read(str(Path(member).parent / relative)))
                allowed.add(path)
            manifest['models'].append({'name': name, 'path': f'/assets/3d/monsters/{name}/{name}.gltf', 'archive': archive, 'member': member, 'sha256': hashlib.sha256(z.read(member)).hexdigest(), 'clips': [a.get('name') for a in model.get('animations', [])], 'skins': len(model.get('skins', [])), 'embeddedTextures': len(model.get('images', [])), 'triangles': sum(model['accessors'][p['indices']]['count'] // 3 for m in model.get('meshes', []) for p in m['primitives'] if 'indices' in p)})
        (out / 'LICENSE.txt').write_bytes(license_text)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == before
# Only this generated monster runtime directory is managed; source archives stay intact.
for path in out.rglob('*'):
    if path.is_file() and path not in allowed and path.name not in ('LICENSE.txt', 'manifest.json'): path.unlink()
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print('Monster runtime allowlist:', ', '.join(m['name'] for m in manifest['models']))
