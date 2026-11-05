#!/usr/bin/env python3
"""Extract browser-ready KayKit glTF assets from uploaded ZIPs.

Keep glTF, BIN, textures, GLB animations and license files; skip redundant
FBX/OBJ exports. Files remain under their original relative paths.
"""
from pathlib import Path
from zipfile import ZipFile
import shutil
import json

# Fortress models are already present in the uploaded original Medieval Part02.
FORTRESS_NEUTRAL = {"wall_straight", "wall_straight_gate", "wall_corner_A_gate",
                    "wall_corner_A_inside", "wall_corner_A_outside",
                    "wall_corner_B_inside", "wall_corner_B_outside"}
FORTRESS_TEAM = {"building_castle", "building_tower_A", "building_tower_B",
                 "building_tower_base", "building_barracks", "building_home_A",
                 "building_blacksmith"}


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
                if pack == "medieval":
                    path = rel.as_posix()
                    stem = rel.stem
                    neutral = "/buildings/neutral/" in "/" + path
                    colored = any("/buildings/" + team + "/" in "/" + path and
                                  stem in {model + "_" + team for model in FORTRESS_TEAM}
                                  for team in ("red", "blue"))
                    if not ((neutral and stem in FORTRESS_NEUTRAL) or colored):
                        continue
                out = target / rel
                out.parent.mkdir(parents=True, exist_ok=True)
                with z.open(entry) as src, out.open("wb") as dst:
                    shutil.copyfileobj(src, dst)
                count += 1
    models = [str(p.relative_to(target)).replace("\\\\", "/") for p in target.rglob("*") if p.suffix.lower() in {".gltf", ".glb"}]
    (target / "manifest.json").write_text(json.dumps(models), encoding="utf8")
    print(pack, count, "assets", "sample models:", models[:18])
