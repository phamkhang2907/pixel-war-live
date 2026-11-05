# Stylized moss-green battlefield

This visual environment update supersedes PR #10’s photographic PBR grass. The code base/rollback point is `4920d28`; development uses a separate `feat/stylized-battlefield` branch. Server simulation, troop classes/models/animation, spawning, gifts, rounds, leaderboard storage, audio, HUD/admin, navigation/collision, castle HP/targets and camera behavior are unchanged.

**Reference limitation:** no new reference screenshot attachment was available in this turn. The existing Douyin screenshot is not treated as the new image. This implementation follows the supplied low-poly direction and palette; exact visual agreement with the missing image has not been verified.

## Terrain, lighting and depth

- Main moss `#718C4A`, dark `#4E713C`, light `#93A85A`, dirt `#A49B65`, with layered smooth, irregular vertex-color variation. No photographic albedo, normal or roughness maps are loaded. No repeat seams or dense individual blade field.
- The render-only ground expands to 320×320 m with 106×106 cells (about the same 3 m vertex spacing), covering the Overview frame without exposing the edge. All traversable lanes/foundations remain level at −0.035 m, close beneath soldier feet; rolling relief begins outside |Z|=16 m. No authoritative coordinates or obstacles change.
- A winding path and gate wear use vertex alpha to soften irregular borders. Ground-following mesh heights avoid floating decals; road and gate patches share one merged draw. Existing spawn/siege rings remain at their original locations.
- Nearby angular rock formations, scattered stones/shrubs/tufts, a treeline and two distant rock layers establish depth. Scenery footprint radii clear the central |Z|<14.2 m corridor and a conservative castle envelope. Props are uniformly scaled and grounded/partially buried using the same height function as the ground. There are no new collision bodies.
- Neutral soft sunlight, gentle hemisphere fill and light distance fog replace the warmer old illumination. ACES exposure and camera are unchanged. Foliage retains its original palette/UVs with 28% shader desaturation and mild instance tints to fit the moss biome; fortress textures/materials are unchanged.
- Nearby soldiers and scenery receive soft contact shading through a shared, original 64×64 radial disk: two instanced batches, no extra shadow-render passes. Low quality keeps expensive real-time shadows disabled. Balanced retains the existing single 1024px directional shadow map for troops/fortresses. No full-screen SSAO/bloom/postprocessing pass was added.

## Existing assets reused

All of the following are already in the CC0 **KayKit Forest Nature Pack** ZIP and extracted by the existing build with their BIN files and `forest_texture.png`; no new pack/model/texture download was needed:

| Role | File under `/kaykit/forest/Assets/gltf/` | Instances |
| --- | --- | ---: |
| Pointed short clumps | `Grass_1_B_Color1.gltf` | 100 |
| Pointed tall clumps | `Grass_2_B_Color1.gltf` | 80 |
| Low shrubs | `Bush_1_A_Color1.gltf` | 40 |
| Larger shrubs | `Bush_2_A_Color1.gltf` | 20 |
| Small stones | `Rock_1_A_Color1.gltf` | 54 |
| Near cliffs / far silhouettes | `Rock_3_A_Color1.gltf` | 56 |
| Rocky intermediate ridge | `Rock_2_H_Color1.gltf` | 32 |
| Broad trees | `Tree_2_A_Color1.gltf` | 28 |
| Pointed trees | `Tree_4_A_Color1.gltf` | 16 |

**426 decorations, nine InstancedMesh batches, one shared original forest palette texture.** Instance matrices/colors are prepared once; scenery has no per-frame placement/animation cost. Forest assets’ original license notices remain in the extracted pack. Original terrain/contact-shading code is under the project MIT license.

Both existing **KayKit Medieval Hexagon** fortresses remain: 29 modules each, long wall sections, central gate, watchtowers, corner walls, flags, castle, barracks, home, smith and archery range. The exact existing colored filenames/catalog remain in `client3d/fortresses.ts`. No castle is stretched, relocated or replaced by primitives. Each team retains original red/blue roofs and banners. The older procedural unused castle/trees and separate mountain cones were removed from the world renderer.

## Files and checks

- `client3d/grass-material.ts`: procedural material palette and common height function; replaces photo loading.
- `client3d/world.ts`: colored rolling terrain, feathered path/gates, neutral sunlight/fog; removes obsolete procedural decorations. Terrain and forest palette use diffuse Lambert materials to avoid unnecessary PBR shader cost.
- `client3d/forest-environment.ts`: licensed model catalog, normalization, instancing, safe placements and diagnostics.
- `client3d/ground-contacts.ts`: bounded, shared contact-shadow rendering (up to 300 units plus static scenery).
- `client3d/kaykit-world.ts`, `renderer.ts`: parallel forest/fortress loading, contact updates, resource cleanup and debug inspection.
- `tools/build.mjs`: stops shipping the superseded PBR JPEGs; source archive/license retained.
- `tools/terrain-check.mjs`: replaces the superseded PBR-map assertions with actual environment, grounding, corridor clearance, portrait castle framing, active rendering and 50/100/300 unit checks. CI uploads the new environment captures.

Run from `live/` after installing dependencies:

```sh
npm run build
npm test
node tools/terrain-check.mjs
# Optional WebKit engine (install browser/dependencies first):
TERRAIN_ENGINE=webkit node tools/terrain-check.mjs
# Matched older build, same scenarios/camera/quality:
TERRAIN_BASELINE_DIR=/absolute/path/to/baseline/live node tools/terrain-check.mjs
```

### Actual browser verification (2026-11-05)

Full build passed TypeScript, Vite and all 357 existing glTF/dependency validations. All 60 existing tests pass. The actual Node/Three.js application was tested in Linux Chromium **155.0.8059.79** with SwiftShader, touch emulation, Low quality and devicePixelRatio=1. Matched paused 50/100/300-unit formations keep the camera/placements comparable; combat is then resumed and rendering progress verified. All asset requests succeeded; no page/console errors or context loss were recorded. All 426 placement footprint/grounding checks and both fortress framing checks pass.

Portrait screenshots use 1080×1920 CSS pixels, adaptive WebGL buffer 552×983. Performance samples use 390×844 CSS pixels and the same 199×354 adaptive buffer in both builds, frontal camera distance 76. Three consecutive samples of at least two seconds are recorded per count. No clock/frame-time override is used.

| Units | Before FPS | New FPS | Change | Before/new draw calls | Before/new triangles |
| ---: | ---: | ---: | ---: | --- | --- |
| 50 | 2.444 | 2.230 | -8.8% | 201 / 185 | 366,684 / 428,424 |
| 100 | 1.076 | 1.085 | +0.9% | 199 / 183 | 707,880 / 769,720 |
| 300 | 0.444 | 0.474 | +6.8% | 208 / 185 | 2,079,248 / 2,140,760 |

This software-GPU sample shows a modest 50-unit decrease and similar/slightly improved throughput at 100/300, rather than a major drop across counts. It is a small, noisy benchmark, **not** evidence of 30/60 FPS or stable physical iPad performance. Both builds are far below playable FPS at 300 units in SwiftShader. The extra modeled scenery increases triangle count by about 62k; instancing reduces draw calls. Lambert diffuse shading avoids paying for unnecessary PBR calculations on terrain/forest meshes. Soldier/fortress materials are unchanged.

The previous four photographic maps (3.64 MiB cold transfer, approximately 21.33 MiB GPU RGBA+mipmap storage) are no longer shipped/loaded. Scenery shares one existing 1024px forest atlas plus one original 64px contact disk; no per-soldier texture or postprocessing buffer is allocated. Texture-memory figures are estimates, not measured allocations.

- [Normal portrait battlefield](docs/environment/environment-stylized-front-1080x1920.png)
- [Both fortresses, normal Overview HUD](docs/environment/environment-overview-1080x1920.png)
- [World Overview diagnostic](docs/environment/environment-overview-world-1080x1920.png)
- [RED fortress](docs/environment/environment-red-1080x1920.png) / [BLUE fortress](docs/environment/environment-blue-1080x1920.png)
- [Closer ground/units diagnostic](docs/environment/environment-detail-1080x1920.png)
- Mobile: [50](docs/environment/environment-stylized-50-mobile.png), [100](docs/environment/environment-stylized-100-mobile.png), [300 units](docs/environment/environment-stylized-300-mobile.png)
- [Older PBR baseline](docs/environment/environment-before-front-1080x1920.png) / [raw report](docs/environment/environment-report.json)

World-only and closer diagnostic captures temporarily hide the HUD in the test page so scenery can be inspected. Production HUD code/layout is unchanged. I inspected the actual screenshots for patchy moss ground, feathered path, pointed clumps, angled grounded rocks, layered scenery, visible red/blue fortresses and readable soldiers. There is no foreground plane edge in the Overview capture. Exact comparison against the new reference remains pending because that image was unavailable.

Additional Linux WebKit **27.2** touch-emulation verification at 50 units passed: the terrain, nine forest batches, both fortresses, contact shading and mobile layout rendered; no page/console/HTTP errors were recorded on the repeat run. [WebKit capture](docs/environment/environment-webkit-stylized-front-1080x1920.png), [raw report](docs/environment/environment-webkit-report.json).

The first local WebKit attempt logged `TextureGL.cpp setImageHelper` / context loss, then recovered and rendered the screenshots. The same intermittent driver error was already recorded with the older environment in PR #10. The [first-attempt log](docs/environment/webkit-first-error.txt) is retained. Its underlying driver cause is unresolved; a successful repeat does not prove that physical Safari is unaffected. Physical iPad acceptance remains pending.

## Codespaces and physical iPad check

From the repository root run `npm run setup`, then `npm start`; open forwarded port 3000 and `/3d/`. On an existing running Codespace, update the default branch, run `npm run build` and reload the game. This GitHub change does not remotely restart a separate Codespace.

On iPad Safari choose Low quality, inspect frontline/overview/RED/BLUE modes, and test 50, 100 and 300 units. Check moss patch readability, pointed tufts and rock contacts, both castle gates/walls, and that troops remain distinct. Trigger repeated demo gifts and a round transition. Record model/device, resolution, quality, unit count and warm frame rate. Physical iPad testing is unavailable here; headless WebKit is not a hardware performance claim.
