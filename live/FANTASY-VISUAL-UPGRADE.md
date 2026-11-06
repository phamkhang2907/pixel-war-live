# Three.js fantasy visual upgrade

The existing web game inside `live/` keeps its Node/Socket.IO simulation, FIFO gift queue, scoring/persistence, rounds, owner authentication, public Demo, KayKit characters, modular fortresses, Quaternius monsters and Grok UI KIT. No Unity project or video overlay is used. The attached Lord of the Wilds image supplies art direction only.

## Uploaded asset audit and reproducible extraction

The latest default branch contained all five owner-uploaded archives. Each Nature ZIP opens independently, has ZIP end-record disk numbers zero, and contains 17 distinct glTF models. They are independent archives, not multipart volumes; concatenation/repacking is neither needed nor performed.

| Original file under `assets/3d/` | SHA-256 |
| --- | --- |
| `nature/Stylized_Nature_3D_Part_01.zip` | `c69b7b8dd4c03c5e223f736d43725172f31334dc292285264c28f35ee974fe21` |
| `nature/Stylized_Nature_3D_Part_02.zip` | `3bfb1c7efcc38a9a97226558610d906524af6aed064deff064ed7731ca1ec527` |
| `nature/Stylized_Nature_3D_Part_03.zip` | `543b12a14130977097c9db09594a2a6611d67f1ec13fb6da386b6cf0f7b5f0a4` |
| `nature/Stylized_Nature_3D_Part_04.zip` | `40ffc41fc6a5b3c555f854b6b49f2affb994e72025f9c9d733606bb1943cc09b` |
| `effects/kenney_particle-pack.zip` | `b631d4b07f7002549fdcf155f01141ad482f79f3440e4e301eed49ce5f1d8958` |

`tools/extract-visual-assets.py` produces:

- `public/assets/3d/nature/stylized/`: **68 glTF + 68 BIN + 15 original PNG + License_Standard.txt**, plus a manifest. Original glTF/BIN/image bytes and relative `glTF/` paths are preserved. Twelve repeated entries across archives are byte-identical and safely deduplicated. Different-content name collisions and unsafe paths fail instead of overwriting files. Every external buffer/image path and buffer length is validated.
- `public/assets/3d/effects/kenney/`: **193 original PNGs + License.txt**, retaining original subdirectories, plus a validated 1K atlas and manifest. The ZIP's Unity package stays in its original ZIP and is not extracted into runtime.
- `assets/3d/effects/derived/kenney-atlas-1k.png`: a committed, padded 4×4 atlas of sixteen transparent Kenney sprites. Its provenance JSON ties it to the original ZIP and records its checksum. Original PNGs are unchanged. `tools/make-particle-atlas.py` is an optional Pillow authoring tool; **normal build/extraction needs only Python's standard library**, as verified with `python3 -S` and a cold temporary output directory.

Generated runtime copies are gitignored to avoid uploading duplicate packs; `npm run build`/`npm start` recreates them from the original committed ZIPs. The atlas is committed separately. Do not edit generated copies: the collision guard deliberately rejects different-content replacements.

Both bundled licenses explicitly grant **CC0-1.0**, including commercial use: Quaternius `License_Standard.txt`, and Kenney Particle Pack 1.1 `License.txt`. No new pack download was necessary. Existing KayKit/monster/UI source files and licenses remain untouched.

## Final visual systems

- Warm directional sun (`#FFE5B0`, intensity 2.45), cool hemisphere fill, ACES tone mapping, sRGB output, tuned PCF soft shadows and subtle distant fog. Shadow coverage follows the camera focus; nearby structures and imported trees cast shadows, while bounded nearby rigs and soft contact shading handle armies. AO is the inexpensive contact-shading technique, not a claimed screen-space AO pass.
- A shared `terrainHeight(x,z)` creates rolling raised meadow/platforms, rocky edge transitions, lower valleys and distant hills. Castle foundations stay level. Ground, dirt paths, nearby skeletal actors, GPU animated actors, monsters, projectiles, contacts and summon effects use the same height field. Server X/Z movement, collision, spawning and damage rules do not change.
- Palette-driven green ground retains subtle legal ambientCG fine detail/normal/roughness maps already in the project, with source hue reduced so the stylized vertex palette controls the biome. Paths follow the surface and feather at their edges.
- Real imported Nature models: CommonTree_3, CommonTree_5, Pine_5, TwistedTree_1, Bush_Common, Bush_Common_Flowers, Flower_3_Group, Grass_Common_Short, Mushroom_Common and Rock_Medium_1. **404 Nature placements**, with quality-dependent density, spatial instancing, full/sparse distance LOD, culling, shared geometry/materials and GPU texture dimensions capped at 1K. Source 1K/2K images remain intact on disk. Existing KayKit Forest contributes **592 placements**, including 210 chunky trees, plus rocks/cliffs and undergrowth. Dense scenery stays outside combat lanes/fortress envelopes.
- Real KayKit geometry, skin/face textures, rigs, weapons and animation clips remain. Silver armor/body colors are preserved; capes/hats and ownership accents identify factions. Nearby rigs use Standard materials and bounded mixers; distant units keep real vertex-animation-texture geometry, now with Standard lighting. No sprite/box soldiers are introduced.
- Kenney sprite particles use two shared WebGL Points layers (smoke and additive), a single 1K atlas, reusable records and a frame emission budget. Actual server projectile snapshots drive pooled 3D arrows, trails, fireballs and defender magic. Server hit/death/stomp/meteor/ice events drive slashes, sparks, dust, smoke, explosions and energy rings. Mage casts add purple smoke/lightning; footsteps use sparse bounded dust. Castle HP changes produce impacts. Cosmetic particles never decide damage or award points.
- Existing native gift cards, avatars/icons/quantities, cohort nameplates and FIFO counts are preserved. Ground circles/motes gain HDR color and layered Kenney sprites. Actual imported dragons retain flight/attack/death clips and get flame/ice breath, smoke/mist, embers/crystals and impacts. Four stationary Mushroom Kings use their real staff clips/projectiles. Old-round effects clear; transient particles age against wall time instead of lingering through background tabs or slow frames.
- HIGH integrates `EffectComposer`, `UnrealBloomPass` and `OutputPass`, with luminance threshold 1.1 and restrained strength 0.28. Ordinary terrain remains below the glow threshold. LOW/MEDIUM render directly. Switching bloom off shrinks its HDR targets to 4×4 while retaining pass programs, avoiding repeated fullscreen-geometry teardown; re-enabling restores full target dimensions. No individual soldier lights or heavy SSAO are added.
- Battle framing uses an elevated 52° view with a smooth 16° three-quarter yaw, broader portrait coverage and frontline tracking. Full overview, castle views, free orbit/pan/pinch/wheel/reset remain. Camera target height follows the terrain. The HUD artwork/layout and leaderboard behavior remain.

## Explicit quality budgets

| Preset | Max DPR | Shadow map | Bloom | Near rigs | Kenney particles | Summon motes | Dragon motes | 3D arrows |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |
| LOW | 1 | Contact shading | Off | 4 | 240 | 80 | 80 | 80 |
| MEDIUM | 1.25 | 1024 PCF | Off | 8 | 600 | 160 | 160 | 160 |
| HIGH | 1.5 | 2048 PCF | On, when float render targets are supported | 12 | 1000 | 240 | 220 | 240 |

MSAA is chosen when the context is created: off for coarse-pointer/mobile contexts, on for desktop. Quality changes do not destroy/recreate the context. Sprite, summon and dragon budgets are separate; the table does not imply a single global 240-particle limit. Existing adaptive drawing-buffer scaling remains. Switching down trims particles; distant troops use cheap contacts, and vegetation density is reduced without changing server units. Debug view shows the actual quality, full-frame draw calls/triangles (including shadow/post passes), buffer, FPS, JS heap and active particles/arrows.

## Gift mapping and unchanged simulation

Owner-requested **Dragon Flame ID 7610 → one Fire Dragon** is added as a pending native metadata binding. It auto-enables only after actual LIVE catalog/event evidence; no coin price is guessed. Existing 13604 Fire and 6646 Frost bindings remain. Server bootstrap also adds the missing 7610 row when an older saved registry exists, preserving owner-defined rows; the browser regression starts with an old registry and a custom disabled mapping to verify this migration. Lion's real ID is learned from connector metadata, never assumed to be 6646. Demo Lion/Dragon remain explicitly simulated and use the same authoritative spawn/combat path in the isolated Demo arena. Element color and sender-selected RED/BLUE allegiance remain independent. Unit stats, FIFO ordering, contribution accounting and gift-streak receipts are unchanged.

No real broadcast was available: tests using connector metadata fixtures prove behavior, not official gift identity or successful real LIVE connectivity.

## Verification and device limits

The build and **87 server/asset tests** pass, including all original gameplay suites, native gift metadata/streak/accounting tests, the new 7610 binding test, every Nature glTF dependency/ZIP hash, atlas provenance, cold extraction without Pillow and a deliberate conflicting-file overwrite rejection. Browser tests run real Chromium/SwiftShader and Linux WebKit/llvmpipe at **1080×1920 CSS pixels**, exercising quality changes, shadows/bloom, imported meshes, 300/500 real units, real combat/dragon effects, HUD and camera. Standard model, native summon, 3D/context-recovery and gameplay regressions remain in CI. The model test verifies a normal skeletal runner in isolation before adding mixed classes and asserting the near-rig limit plus real VAT coverage; it no longer incorrectly assumes every small-army soldier must be a skeletal clone.

Linux WebKit/llvmpipe repeatedly reported ANGLE 0x502/context loss; changing the compositor/worker settings alone did not eliminate it in CI. Model loading now uses the standard `TextureLoader`/HTML image path on WebKit through a shared `GLTFLoader` plugin, including embedded GLB images; geometry, materials, UVs, rigs and clips remain intact. Coarse-pointer devices start without a persistent MSAA backbuffer, reducing mobile framebuffer cost while allowing MEDIUM/HIGH DPR, PCF shadows and bloom. Desktop contexts retain MSAA. CI also sets `WEBKIT_DISABLE_COMPOSITING_MODE=1` on its Linux software host. The complete local touch-WebKit visual, monster and public Demo/owner flows then passed; WebGL, shadows and HDR bloom remained active and errors remained failures. This does not establish physical Safari behavior or solve every driver issue. Physical iPad Safari, Windows hardware and real LIVE remain unverified.

The renderer separately removes avoidable allocation churn: asynchronous forest completion no longer resets adaptive DPR, unchanged ResizeObserver calls no longer resize the canvas, drawing-buffer size/DPR update atomically, and bloom target resizes are cached. The old model/defender tests also assumed every small-army unit was a near skeletal clone and that an already-fired projectile must still exist after an HTTP Pause; they now verify bounded near/VAT coverage and sample a visible staff projectile atomically before Pause. No gameplay damage is fabricated for these assertions.

No stable 30/60 FPS or thousand-unit claim is made. Software-renderer measurements are short development samples, including actual buffer resolution and renderer strings; they must not be used as physical-device benchmarks. The old baseline draw counter omitted some passes, so its draw-call count is not an apples-to-apples full-frame performance comparison.

Short software-GPU samples (approximately five seconds, 1080×1920 CSS viewport; scenes with 100/300/500 troops include four automatic defenders):

| Actual test environment | Quality | Server units | FPS | Mean ms/frame | Full-frame calls | Triangles | Buffer pixels |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Chromium / SwiftShader | LOW | 104 | 1.40 | 716 | 149 | 439,094 | 552×983 |
| Chromium / SwiftShader | MEDIUM | 104 | 0.60 | 1668 | 305 | 910,885 | 552×983 |
| Chromium / SwiftShader | HIGH | 104 | 0.60 | 1670 | 402 | 1,190,868 | 552×983 |
| Chromium / SwiftShader | LOW | 304 | 1.00 | 1002 | 144 | 601,560 | 552×983 |
| Chromium / SwiftShader | LOW | 504 | 0.80 | 1251 | 147 | 760,492 | 552×983 |
| Linux WebKit / llvmpipe (touch) | LOW | 104 | 6.90 | 145 | 149 | 439,094 | 552×983 |
| Linux WebKit / llvmpipe (touch) | MEDIUM | 104 | 4.09 | 244 | 305 | 910,885 | 552×983 |
| Linux WebKit / llvmpipe (touch) | HIGH | 104 | 2.53 | 395 | 402 | 1,190,868 | 552×983 |
| Linux WebKit / llvmpipe (touch) | LOW | 304 | 5.97 | 167 | 144 | 601,560 | 552×983 |
| Linux WebKit / llvmpipe (touch) | LOW | 504 | 6.34 | 158 | 147 | 760,492 | 552×983 |

These rates are low: this VM uses CPU software rasterization, not a physical gaming GPU. HIGH is materially more expensive than LOW. Both browser engines completed the scenes, but these samples do **not** establish mobile playability or a stable hardware FPS target. Linux WebKit's privacy-masked renderer string says “Apple GPU”; the launch environment explicitly uses llvmpipe, so it is not an Apple-device test. Reports record the pre-commit working-tree revision with `dirty: true`; the screenshots were captured from that modified build rather than the unmodified base revision.

Before/after images and final diagnostic reports are in [docs/fantasy-visual/](docs/fantasy-visual/). Optional ponds were not added. A dedicated Giant model is still absent: the existing enlarged real KayKit Barbarian is retained and labeled as such. The monsters have no dedicated breath clip; the original Headbutt attack motion is retained alongside native breath VFX. Free KayKit weapon attacks retain the project's original MIT bone-keyframe clips; they are not misrepresented as newly supplied KayKit attack clips.

## Run and inspect in Codespaces/iPad

```sh
# Repository root
npm run setup
npm run build
npm test
npm start
```

Open Ports → 3000 → `/3d/`. Use **FANTASY 3D** plus the build revision to confirm the new frontend, then Follow Battle/Overview and the LOW/MEDIUM/HIGH selector. On iPad, start with LOW; drag one finger to orbit, two to pan, pinch to zoom. Send Demo gifts, inspect RED/BLUE nameplates, both dragon colors and four gate defenders. Observe terrain grounding, forest clearance and shadows, then compare MEDIUM/HIGH only if responsive. Use `?debug=1` and record device/iPadOS, CSS/buffer dimensions, quality, units, frame time and memory. Merging GitHub code does not update/restart a private Codespace: pull the branch and restart Node; on iPad use the terminal trash icon rather than Ctrl+C.

Main files: `world.ts`, `grass-material.ts`, `forest-environment.ts`, new `stylized-nature.ts`, `quality.ts`, `postprocessing.ts`, `kenney-particles.ts`, `model-loader.ts`; revised `combat-effects.ts`, renderer/actor/terrain adapters and quality UI; `src/gifts.js` and the reserved-row bootstrap in `src/server.js`; extraction/atlas tooling; visual/asset/7610 tests, regression expectations and CI. Backend simulation, TikTok connector/auth, storage and gameplay modules are otherwise preserved.
