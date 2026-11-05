# Dark green PBR battlefield grass

This is a terrain-only change on top of `d44c867` (the completed 3D migration). The original game is retained at that commit on the default branch history. No simulation, gifts, networking, leaderboards, HUD, audio, camera behavior, character models/animations, fortresses or lighting settings were changed.

## Sources and license

The four original 1024×1024 JPEGs were downloaded from **Poly Haven's official download CDN**. All are **CC0-1.0**; commercial use and redistribution are permitted. Texture pixels are unmodified.

- [Leafy Grass](https://polyhaven.com/a/leafy_grass): `leafy_grass_diff_1k.jpg`, `leafy_grass_nor_gl_1k.jpg`, `leafy_grass_rough_1k.jpg`.
- [Grass Path 3](https://polyhaven.com/a/grass_path_3): `grass_path_3_diff_1k.jpg` for the existing worn path and small patches at both gates.
- [Poly Haven license](https://polyhaven.com/license), [CC0 deed](https://creativecommons.org/publicdomain/zero/1.0/).

Files are present in `assets/3d/terrain/leafy_grass/`. The adjacent `sources.json` records exact download URLs, SHA-256 hashes, original dimensions and byte counts. `LICENSE.txt` records the official licensing evidence. The Poly Haven website/API returned Cloudflare error 1010 in this environment, so the official published CDN paths were used successfully; licensing was checked against the official site's public [license text](https://raw.githubusercontent.com/Poly-Haven/polyhaven.com/master/public/locales/en/license.json). No user upload or external runtime connection is required.

## Material and world changes

`client3d/grass-material.ts` owns texture loading, diagnostics and cleanup. The grass uses `MeshStandardMaterial`, sRGB albedo, OpenGL normal data and linear roughness data, with `metalness=0`, `roughness=1`, `normalScale=(0.25,0.25)`. The shader multiplies the photographed albedo by a calibrated green tint and slow vertex-color variation; this keeps fine texture detail while balancing the source's warmer leaves. Small light/dark variations follow the existing smooth terrain pattern. No grass blades are generated across the battlefield.

All three grass maps repeat together **40×35** over the existing **240×210 m** terrain: one tile every **6 m** on both axes. `RepeatWrapping`, trilinear mipmaps and linear magnification avoid stretching and soften minification. Albedo anisotropy is capped at **2 on touch devices / 4 on desktop**, respecting GPU limits; normal and roughness use 1 to reduce texture sampling costs. The lower anisotropy trades some far-distance detail for mobile cost.

`client3d/world.ts` retains the same terrain geometry, hills, scenery and existing batched tufts. The old solid-color roadside strips/center marker were removed. The existing dirt path now has a texture, with consistent **3 m** world-space UV scale shared by two small worn gate patches. They merge into the same existing dirt-material geometry batch. No extra per-frame terrain work, displacement/tessellation, shadow passes or individual blade meshes were added. Lighting, tone mapping, exposure and fog are unchanged, preserving the appearance of soldiers and castles.

`client3d/renderer.ts` only supplies the anisotropy cap, reports terrain loading status/errors and disposes the textures. `tools/build.mjs` copies the terrain directory into `dist/public/assets/3d/terrain/`; the game loads those local URLs.

## Verification

`npm run build` passes TypeScript, Vite and all 357 existing glTF/dependency validations. `npm test` passes all 60 existing gameplay, gift, round, persistence, HUD and formation tests.

`npm run test:terrain` builds and runs the real Node server and Three.js game with Playwright. It verifies the original download/build-copy hashes, HTTP delivery, all four decoded 1K maps, color spaces, repeat scale, loaded KayKit soldiers, two fortress groups, portrait/mobile overflow and absence of browser errors. It captures full 1080×1920 screenshots, a closer camera view and a 390×844 touch viewport. It records actual frame samples without altering the clock. Runtime loading failures appear in the status message and `window.__PW3D.inspect().terrain.errors`.

To reproduce the baseline comparison, create a separate checkout at `d44c867`, install and build it, then run:

```sh
TERRAIN_BASELINE_DIR=/absolute/path/to/baseline/live node tools/terrain-check.mjs
```

Both versions receive the same paused, balanced 50-unit scenario and camera. Pausing simulation keeps placements comparable; browser rendering, camera easing and idle animation continue. These are real browser screenshots, not generated mockups.

### Actual comparison, 2026-11-05

Linux headless Chromium **155.0.8059.79**, **SwiftShader software GPU**, touch emulation, Low quality, 50 mixed units (12 independently animated skeletons, 38 baked real-model LOD instances). The screenshots are 1080×1920 CSS pixels with a 552×983 adaptive WebGL buffer. Frame samples use a 390×844 CSS viewport and a 199×354 adaptive WebGL buffer, same camera and resolution for both versions. Three consecutive samples of at least two seconds are recorded in the [raw report](docs/grass/grass-report.json).

| Metric | Before (`d44c867`) | PBR grass |
| --- | ---: | ---: |
| Draw calls | 203 | 201 |
| Triangles | 366,666 | 366,684 |
| Sampled animation frames/sec, software GPU | 2.35 | 2.01 |
| Browser errors / failed HTTP responses | 0 | 0 |

This single software run is **14.4% lower frame throughput** after adding the maps; it is not a hardware/iPad benchmark or evidence of 30/60 FPS. The baseline is already far below playable frame rates on this software renderer. Physical mobile frame stability is **not verified**. Shader cost increases because of the albedo, normal and roughness sampling, even though draw calls decrease by removing the old solid verge/center decorations. Gate patches add only 24 triangles; after removing the strips/marker the net change is **+18 triangles / −2 draw calls**.

The four textures add **3,819,379 bytes (3.64 MiB)** of cold download/decode data and approximately **21.33 MiB** of uncompressed RGBA GPU storage including mipmaps. The GPU value is a calculated estimate, not a measured allocation. No textures are allocated per soldier or per frame, and maps are disposed with the renderer.

In the same unobstructed foreground rectangle `(100,1350)`–`(980,1500)` of the portrait captures, mean displayed RGB changes from **(39.48,89.51,42.14)** to **(38.33,74.52,39.82)**. Weighted 8-bit display luma changes **75.45 → 64.32**, approximately **14.8% darker** (a screenshot comparison, not a physical luminance measurement). Green remains dominant. RGB standard deviations rise from **(1.84,3.17,1.54)** to **(4.22,6.25,4.63)**, consistent with the newly visible small surface variation. This local measurement does not imply every terrain pixel darkens by the same amount.

I inspected the full and closer browser captures: the grass has fine surface texture instead of a flat plane, the dirt has visible grain, team silhouettes remain distinct, and no obvious tile seams or stretched blades are visible at those camera scales. Existing soldiers, castles and UI are retained.

- [Before, 1080×1920](docs/grass/grass-before-1080x1920.png)
- [Updated battlefield, 1080×1920](docs/grass/grass-textured-1080x1920.png)
- [Closer surface/model view](docs/grass/grass-textured-detail.png)
- [390×844 mobile viewport](docs/grass/grass-textured-390.png)


### WebKit and preservation checks

The optional command `TERRAIN_ENGINE=webkit node tools/terrain-check.mjs` uses Playwright WebKit instead of Chromium (install with `npx playwright install --with-deps webkit`). It writes separate `grass-webkit-*` artifacts. Linux WebKit **27.2**, touch emulation, successfully loaded the four maps, 50 real units and both fortress groups, rendered the portrait/closer/mobile views and finished with **no console, page or HTTP errors**. See the [WebKit screenshot](docs/grass/grass-webkit-textured-1080x1920.png) and [raw report](docs/grass/grass-webkit-report.json). This is not physical Safari.

One initial local WebKit attempt logged a driver `TextureGL.cpp setImageHelper` upload error and context loss; the game restored the context. A baseline control and two subsequent runs of the new terrain completed without those errors. The [initial failure log](docs/grass/webkit-initial-error.txt) is retained; its cause is not established, and this intermittent software-driver result is an additional reason to check a physical iPad. It is not represented as a clean first attempt or proof that every Safari device works.

The existing WebKit audio preservation check also passes with all 16 buffers, touch unlock and mute/volume controls. Its CI assertion initially read mute state before the existing asynchronous `AudioContext.resume()` returned. `tools/audio-check.mjs` now waits for the intended mute/unmute state after each tap; no sound implementation or sound asset changed.

## Run in Codespaces and check on iPad

From the repository root:

```sh
npm run setup
npm start
```

Open forwarded port 3000, then `/3d/`. A fresh build copies the maps automatically. The previous renderer's adaptive resolution, quality switch and portrait layout remain active. If updating an already-running Codespace, pull the default branch, stop/restart its existing server process and rebuild; a GitHub merge alone cannot restart that Codespace.

On physical iPad Safari, reload the rebuilt game, choose Low quality, inspect grass at frontline and castle gates, pinch to inspect the fine surface, then return to normal zoom and test with 50/100/300 units. Check that soldiers stay distinct and compare FPS/frame time after warmup at the same unit count and zoom. Rotate and return to portrait, and verify there are no missing-texture messages. Physical iPad performance has not been measured here; it remains a device acceptance check.
