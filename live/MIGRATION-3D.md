# Three.js migration — Phases 0 and 1

This is an additive migration of `phamkhang2907/pixel-war-live`, starting at
`58678ef`. The existing playable game remains at `/`. The new engine preview
is `/3d/`. Both use the **same server, round, unit IDs and persistence**.
The new route is a working WebGL renderer, but it is not the completed 3D game.

## Phase 0: actual repository audit

| Area         | Found at baseline                                                                                                                                                     | Phase 1 treatment                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Frontend     | Phaser 3.90, JavaScript, HTML/CSS; esbuild bundle                                                                                                                     | Preserve `public/app.js`, `arena.js`, CSS and all sprites; add TypeScript/Three.js entry point |
| Backend      | Node ES modules, Express 5, Socket.IO 4, 20 Hz snapshots                                                                                                              | Preserve every `src/` module and API                                                           |
| TikTok       | Connector 2.5, native nested chat/gift/like ingestion, stable user IDs, completed gift streaks, receipt deduplication, timeout/stale-connection guards, Demo fallback | Unchanged; real LIVE account connection not tested here                                        |
| Combat       | Six types, HP/cooldowns, air targeting, arrows/fireballs, splash, shield/stomp/charge/rage, castle damage, spatial hash, formations                                   | Authoritative existing simulation preserved; new view maps its positions into 3D               |
| Performance  | Hard cap 300 including corpses; 600 projectiles; bounded effects                                                                                                      | Preserve caps; no claim of 500+ or target-device FPS                                           |
| Rounds       | 300 seconds, 30 preparation, final 30, results 15, restart 5                                                                                                          | Preserve lifecycle and phase gating                                                            |
| Leaderboards | Viewer-attributed round/LIVE/season scores and match history; atomic JSON writes and restart recovery                                                                 | Preserve `league.js`, `rounds.js`, `DATA_DIR`, schema and receipts                             |
| Admin        | Bearer token, server-side validation; generated token printed by server                                                                                               | Reuse existing authorization for new preview's Demo actions                                    |
| Assets       | Original 2D PNG sprite sheets, atlas and environment art                                                                                                              | Keep all; **no GLB/GLTF, rigs, textures or 3D animation clips found**                          |
| Dependencies | Existing npm lockfile and working legacy build/test scripts                                                                                                           | Add Three.js 0.180, TypeScript 5.9, Vite 6, Three types and their lock entries                 |
| Development  | Codespaces devcontainer forwards port 3000; CI builds/tests                                                                                                           | Keep startup; add new renderer to production build and CI                                      |

Safe rollback points created before source changes:

- Branch: `migration/threejs-phase-1`.
- Baseline tag: `migration/phase-0-baseline-58678ef`.
- Original commit and branch remain intact. To inspect rollback without destroying
  work: `git worktree add ../pixel-war-baseline migration/phase-0-baseline-58678ef`.

No source files were replaced or deleted in this phase. Future replacement of the
default route is deferred until the 3D asset/combat presentation is ready.
No production data was loaded or modified during tests; each server test uses a
temporary `DATA_DIR`. JSON data is absent from Git, so continue to back up the
real `live/data/` or configured persistent volume before deployment.

Existing differences from the master specification (not silently changed):

- Like energy uses one-shot cumulative milestones, not a spendable balance.
- Gifts use per-gift coin thresholds, not an Admin gift-ID mapping.
- Team switching is locked after contribution. Chat joins are idempotent by ID
  but do not have a separate chat-message receipt queue.
- Live disconnect falls back to Demo; automatic LIVE reconnection/backoff is not
  implemented. Missing platform receipt IDs limit duplicate guarantees.
- Spawn overflow is dropped at the 300 cap; there is no spawn queue.
- Server Titan visual scale is 3.4, not the proposed 4.0.
- The simulation uses legacy pixel-space ranges; this renderer does not rebalance
  them. Server projectiles, effects and hit timings still need 3D presentation.

Risks: WebGL2 support on older Safari; missing final models and video reference;
skeletal animation cost in later phases; portrait framing of a wide world;
single-process JSON persistence; connector availability and real gift metadata.
The reference video was **not attached or inspected**. Supply the video or
accessible screenshots before judging visual similarity.

## Phase 1: implemented foundation

- Three.js WebGL2 scene written in strict TypeScript, built by Vite. No runtime CDN.
- Responsive 9:16 render surface; capture mode fills a 1080 × 1920 browser source.
- Wide terrain, a dirt combat corridor, low-poly hills, trees, rocks and grass.
- Two distinct procedural fantasy castle assemblies, flags, visible spawn rings
  and siege boundary decals. These are original **development scenery**.
- PBR materials, hemisphere/sun lighting, desktop shadows and mobile low quality.
- 52-degree elevated perspective. RED is always left of BLUE; yaw is constrained.
- Smooth overview, RED castle, battlefield, BLUE castle camera presets, drag,
  wheel, pinch zoom, plus/minus and arrow keys. Full automatic Camera Director
  remains Phase 5 work; "Battlefield" is a manual center preset.
- Read-only Socket.IO snapshot adapter. Existing server X → 3D X, server Y → 3D Z,
  50 simulation pixels → one world unit. World Y is height; Mage markers float.
- Up to 300 temporary unrigged instanced unit markers with team colors and size
  differences. They show actual server positions, interpolate snapshots and shrink
  on death. They are **not six finished models or character animations**.
- Basic live HP/count/timer/round/result HUD, connection/reconnect status, explicit
  development-asset label and optional read-only diagnostics.
- Token-gated Demo scenarios reuse existing Admin endpoints. Capture mode hides
  all controls. Camera controls only change the local viewer's camera.
- Static scenery batched by material; DPR cap 1.5 (balanced) / 1 (mobile); shadows
  disabled for touch/mobile by default. Adaptive frame-based quality remains Phase 4.
- WebGL context loss notice/recovery, resize handling, offscreen-tab render pause,
  scene resource disposal and Vite hot-reload cleanup.

The old frontend bundle is not imported by the new entry point. Phaser is still
built only for the preserved `/` route. `npm run build` builds both entry points.
`npm run build:legacy --prefix live` rebuilds only the old route and clears the
whole output directory; run the full build to restore `/3d/` afterward.

## Run in GitHub Codespaces

Use a checkout containing this migration branch/commit; the base branch alone
does not contain the new renderer. From repository root:

```bash
npm run setup
npm run build
npm test
npm start
```

`npm start` also builds both clients before starting the existing server. Open
**Ports → 3000 → Open in Browser**, then append `/3d/` to that forwarded HTTPS
origin. The root `/` still opens the existing game and full Admin panel.
Do not use `localhost` on the iPad; it refers to the iPad itself.

- Stream source: `/3d/?overlay=1`, browser source dimensions **1080 × 1920**.
- Diagnostics: `/3d/?debug=1`, readout below the preview.
- Live client edits: keep `npm start` running, then in another terminal run
  `npm run dev:3d --prefix live` and forward port 5173. Open `/3d/` on that port;
  Vite proxies Socket.IO and `/api` to port 3000. Production needs only port 3000.
- Setup does not require a TikTok account or final GLB assets.

## Verification

```bash
npm test                              # 50 existing simulation/lifecycle tests
npm run build                         # legacy bundle, strict TS, Vite output
npm run test:3d --prefix live          # isolated server + Chromium acceptance
npm run test:browser --prefix live     # existing UI/API/Socket.IO regression
```

For an environment without a browser installed, first run from `live/`:
`npx playwright install --with-deps chromium`.
`CHROMIUM_PATH` can point to an installed Chromium executable.

The new browser check covers real WebGL2 startup, snapshot rendering, 9:16 canvas,
castle side ordering, overview bounds, camera movement/zoom/drag, token-gated Demo
scenario, 300 markers, context loss/restore, responsive 820/390 widths and exact
1080×1920 capture. It rejects JS exceptions and failed page HTTP responses.
Screenshots and machine-readable results go to ignored `live/artifacts/`.

See [PHASE-1-VERIFICATION.md](PHASE-1-VERIFICATION.md) for recorded results and
limitations. Headless Chromium on Linux is **not** physical Safari/iPad testing.
No 60 FPS desktop, 30 FPS iPad, or 500-unit benchmark is asserted by Phase 1.

## iPad Safari checklist before Phase 2

1. Use Safari 15.4+ (current Safari preferred); record iPad model, iPadOS version
   and screen orientation. Open the forwarded HTTPS URL at `/3d/?debug=1`.
2. Confirm terrain, both castles and their team colors appear. In Overview, RED
   is left and BLUE right. No black canvas, error panel or horizontal page scroll.
3. Tap RED castle, Battlefield, BLUE castle, Overview. Check smooth movement,
   visible depth and no reversal of sides. Drag horizontally with one finger;
   pinch with two fingers and test +/−. Camera should stay above the ground.
4. Confirm **Mobile / low** is selected automatically. Switch to Balanced and
   back. Note responsiveness and the FPS readout after settling for 10 seconds;
   do not compare it with software-rendered Linux as a device benchmark.
5. Expand Demo controls, enter the token from the Codespaces terminal and unlock.
   Tap **300-unit demo**. Confirm multiple rows of RED/BLUE markers move and
   fight according to the existing server. Markers are temporary geometry;
   sword animation, arrows, fireballs and magic VFX are not yet drawn in 3D.
6. Tap Pause/resume and Reset. Verify the timer, HP and counts agree with the
   existing game opened in another tab. Demo actions affect that same server.
7. Try RED/BLUE siege and Titan size preview. Check camera presets show the
   appropriate area and larger markers do not cause flickering or major stalls.
8. Rotate the iPad, switch tabs and return, then reload. Confirm the render
   surface remains 9:16, reconnect works, and the scene returns without a crash.
9. Open `/3d/?overlay=1`. Confirm controls disappear and the preview keeps its
   9:16 proportions. In a separate tab without a token, Demo controls stay locked.
10. Report any black screen, console error, camera jump, clipping, touch failure
    or sustained slowdown with device/OS, quality, unit count and screenshot.

## Missing assets / next phase

All six final GLB/GLTF models are missing: Swordsman, Archer, Cavalry, Flying Mage,
Guardian and Titan. Also missing: humanoid rigs, separate horse/rider rigs,
animation clips, weapon attachment metadata, team material names, textures/LODs,
asset licensing/provenance, and any final castle/environment models.
Grok PNG/JPG concepts cannot be loaded as 3D characters.

Phase 2 will add GLTFLoader, asset manifests/validation, normalization, team
material variants, clip mapping, missing-asset handling and the asset inspector.
Phase 1 deliberately does not claim those features or replace the missing assets
with finished-looking placeholders. The existing 2D assets remain untouched.
