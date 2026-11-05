#!/usr/bin/env python3
"""Verify the already-committed Medieval archives without extracting or modifying them."""
from __future__ import annotations

import json
import posixpath
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
PARTS = [
    ROOT / "assets/3d/KayKit_FULL_Medieval_Part01.zip",
    ROOT / "assets/3d/KayKit_FULL_Medieval_Part02.zip",
]
PREFIX = "KayKit_Medieval_Hexagon_Pack_1.0_FREE/Assets/gltf/buildings/"
NEUTRAL = [
    "wall_straight", "wall_straight_gate",
    "wall_corner_A_gate", "wall_corner_A_inside", "wall_corner_A_outside",
    "wall_corner_B_inside", "wall_corner_B_outside",
]
COLORED = [
    "building_castle", "building_tower_A", "building_tower_B",
    "building_tower_base", "building_tower_catapult",
    "building_barracks", "building_blacksmith", "building_home_A",
    "building_home_B",
]
REQUIRED = [PREFIX + "neutral/" + name + ".gltf" for name in NEUTRAL]
REQUIRED += [
    PREFIX + team + "/" + name + "_" + team + ".gltf"
    for team in ("red", "blue") for name in COLORED
]

def main() -> None:
    sources: dict[str, ZipFile] = {}
    archives = [ZipFile(p) for p in PARTS]
    try:
        for archive in archives:
            for path in archive.namelist():
                if path.endswith("/"):
                    continue
                if path in sources:
                    raise RuntimeError("Duplicate ZIP entry across parts: " + path)
                sources[path] = archive
        missing = [path for path in REQUIRED if path not in sources]
        invalid: list[str] = []
        textures: set[str] = set()
        binaries: set[str] = set()
        for model in REQUIRED:
            if model not in sources:
                continue
            gltf = json.loads(sources[model].read(model))
            refs = [b["uri"] for b in gltf.get("buffers", []) if "uri" in b]
            refs += [i["uri"] for i in gltf.get("images", []) if "uri" in i]
            for uri in refs:
                if uri.startswith("data:"):
                    continue
                dependency = posixpath.normpath(posixpath.join(posixpath.dirname(model), uri))
                if dependency not in sources:
                    invalid.append(model + " -> " + dependency)
                if dependency.endswith(".bin"):
                    binaries.add(dependency)
                if dependency.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                    textures.add(dependency)
        print("Medieval archive entries:", len(sources))
        print("Required fortress glTF models:", len(REQUIRED))
        print("Required BIN dependencies:", len(binaries))
        print("Required image textures:", len(textures))
        print("Missing required models:", len(missing))
        print("Broken model dependencies:", len(invalid))
        if missing:
            print("Missing models:", *missing, sep="\n  ")
        if invalid:
            print("Broken references:", *invalid, sep="\n  ")
        if missing or invalid:
            raise SystemExit(1)
        print("PASS: All requested fortress models and their referenced dependencies are present.")
    finally:
        for archive in archives:
            archive.close()

if __name__ == "__main__":
    main()
