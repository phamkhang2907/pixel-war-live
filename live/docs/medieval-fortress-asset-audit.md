# KayKit Medieval fortress asset audit

Scope: asset inventory and dependency validation only. No battlefield rendering, collision, gameplay, 2D code, or character assets changed.

## Archive comparison

The previously supplied local `KayKit_FULL_Medieval_Part01.zip` and `KayKit_FULL_Medieval_Part02.zip` were compared against the supplied original `KayKit_Medieval_Hexagon_Pack_1.0_FREE(3).zip` by exact ZIP entry path.

| Measure | Result |
| --- | ---: |
| Original non-directory entries | 1,473 |
| Combined Part01 + Part02 entries | 1,473 |
| Missing entries vs original | **0** |
| Extra entries | **0** |
| glTF building models in Part02 | 93 |
| Missing glTF-referenced BIN/image dependencies across all 93 building models | **0** |

Part01 holds FBX/other exports; Part02 includes all glTF building assets, their BIN buffers and adjacent PNG textures. The existing repository already tracks both ZIP files under `live/assets/3d/`. The GitHub file API confirms the archives exist, but cannot independently verify their binary contents; the included read-only script validates them in CI or a checkout.

## Fortress models present in the supplied archives

All 25 specifically audited glTF models are present, with 25 referenced BIN files and 3 shared PNG textures. No broken references were found.

**Neutral walls, corners, gates (7):**
`wall_straight`, `wall_straight_gate`, `wall_corner_A_gate`, `wall_corner_A_inside`, `wall_corner_A_outside`, `wall_corner_B_inside`, `wall_corner_B_outside`.

**RED and BLUE (9 per team):**
`building_castle`, `building_tower_A`, `building_tower_B`, `building_tower_base`, `building_tower_catapult`, `building_barracks`, `building_blacksmith`, `building_home_A`, `building_home_B`.

Battlements and roofs are parts of these building/wall meshes, not separately named `.gltf` files in this pack.

## Repository state and missing assets

The current build script `live/tools/extract-kaykit.py` extracts the Medieval ZIPs to `live/dist/public/kaykit/medieval` during build. Extracted files are generated deployment artifacts, **not individually committed source assets**. The existing `kaykit-world.ts` loads individual castle models; it does not assemble the extended fortifications yet.

**Genuinely missing fortress assets in the supplied archives: none.** No additional asset downloads or binary commits are justified. This PR adds only a read-only audit tool.

To validate the two ZIPs in a checkout:

```bash
python3 live/tools/audit-medieval-castles.py
```

Codex can independently handle Three.js fortress assembly and browser screenshots after this asset audit.
