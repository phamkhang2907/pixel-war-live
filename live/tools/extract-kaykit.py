#!/usr/bin/env python3
"""Extract browser-ready KayKit glTF assets from uploaded ZIPs.

Keep glTF, BIN, textures, GLB animations and license files; skip redundant
FBX/OBJ exports. Files remain under their original relative paths.
"""
from pathlib import Path
from zipfile import ZipFile
import shutil

root = Path(__file__).resolve().parents[1]
source = root / "assets" / "3d"
dest = root / "dist" / "public" / "kaykit"
packs = {
    "adventurers": ["KayKit_Adventurers_2.0_FREE.zip"],
    "forest": ["KayKit_Forest_Nature_Pack_1.0_FREE.zip"],
    "medieval": ["KayKit_FULL_Medieval_Part01.zip", "KayKit_FULL_Medieval_Part02.zip"],
}
for pack, archives in packs.items():
    target = dest / pack
    target.mkdir(parents=True, exist_ok=True)
    count = 0
    for archive in archives:
        with ZipFile(source / archive) as z:
            for entry in z.infolist():
                if entry.is_dir():
                    continue
                parts = Path(entry.filename).parts
                if len(parts) < 2:
                    continue
                rel = Path(*parts[1:])
                suffix = rel.suffix.lower()
                if suffix not in {".gltf", ".glb", ".bin", ".png", ".jpg", ".jpeg", ".webp", ".txt", ".md"}:
                    continue
                if any(p.lower() in {"fbx", "obj", "fbx(unity)", "samples"} for p in rel.parts):
                    continue
                out = target / rel
                out.parent.mkdir(parents=True, exist_ok=True)
                with z.open(entry) as src, out.open("wb") as dst:
                    shutil.copyfileobj(src, dst)
                count += 1
    print(pack, count, "assets")
