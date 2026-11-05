"""Validate deployed files, not just the upload ZIP names."""
import json
import struct
import hashlib
import subprocess
from pathlib import Path
from urllib.parse import unquote
root = Path(__file__).resolve().parents[1]
base = root / 'dist/public/kaykit'
count = 0
for path in base.rglob('*.gltf'):
    document = json.loads(path.read_text())
    for reference in document.get('buffers', []) + document.get('images', []):
        uri = reference.get('uri', '')
        if uri and not uri.startswith('data:'):
            dependency = path.parent / unquote(uri)
            if not dependency.is_file():
                raise RuntimeError(f'Missing glTF dependency: {path} -> {uri}')
    count += 1
character_reports = []
for name in ['Knight', 'Ranger', 'Mage', 'Barbarian', 'Rogue', 'Rogue_Hooded']:
    path = base / f'adventurers/Characters/gltf/{name}.glb'
    data = path.read_bytes()
    magic, version, length = struct.unpack_from('<III', data)
    assert magic == 0x46546c67 and version == 2 and length == len(data), path
    size = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20+size])
    assert document.get('skins') and document.get('images'), f'Unskinned/untextured {path}'
    assert len(document['meshes']) >= 6, f'Incomplete meshes {path}'
    character_reports.append({'name': name, 'meshes': len(document['meshes']), 'sha256': hashlib.sha256(data).hexdigest()})
try:
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    branch = subprocess.check_output(['git', 'branch', '--show-current'], cwd=root, text=True).strip()
except (OSError, subprocess.CalledProcessError):
    commit, branch = 'unknown', 'unknown'
version = {'sourceCommit': commit, 'sourceBranch': branch, 'characters': character_reports}
(base / 'asset-version.json').write_text(json.dumps(version, indent=2))
print(f'Validated {count} glTF files and dependencies; six textured, skinned character GLBs present')
