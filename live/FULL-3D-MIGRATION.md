# 3D-only gameplay migration — 2026-11-05

## What caused the round-end problems

The server deliberately closed combat during `results` and the subsequent default five-second `countdown`. The 3D client only put a small winner string in its footer. `BattleHud` implemented manual ranking tabs, with no subscription that opened round Top 10 automatically. The result was a stopped simulation with no useful transition screen. There is no five-second JavaScript sleep in the audited code; the reproducible five-second interval came from that server countdown phase.

Other avoidable hitch sources were present: `League.flush()` serialized and fsynced the entire accumulated league synchronously from simulation/control paths; the round snapshot repeatedly sorted historical boards at 20 Hz; every replacement soldier cloned a skeleton and materials in the same render frame. These were risks in addition to the missing UI, not a fabricated measurement that any one fsync lasted five seconds.

Now the server publishes `roundState.state = ROUND_RESULTS` (wire `phase: results`) immediately on completion. Its immutable result includes round UUID, winner, final gift-coin scores, castle HP, valid damage and **that round's** Top 10 with final winning bonuses. The client presents this automatically, once per UUID, for the server's remaining result duration. Default results last seven wall-clock seconds, including in accelerated Demo Mode. The default extra countdown is zero. A client-side display clock continues through a short connection outage; only an authoritative new-round snapshot starts the next game.

Automatic results and manual leaderboards have separate state. All manual tabs start closed; X and the backdrop close them. Results hide manual panels and lower gift ornaments; the next round closes every panel. Repeated snapshots/reconnections do not re-present the same result. New-round/finalization boundaries invalidate the HUD data cache immediately, fixing a stale Top 10 snapshot found during browser testing.

Living models idle during results; requestAnimationFrame, camera interpolation and particle decay continue. The result images are decoded in advance. Results do not request a character model. New skeleton creation is spread across frames and existing instances are pooled. When armies exceed 40 units, nearby characters keep independent skeletons (12 on Mobile, 24 on Balanced), while distant soldiers use instanced baked poses from the **actual KayKit geometry and original textures**. This is a documented animation LOD, not thousands of independently evaluated skeletons. Adaptive resolution affects the WebGL surface, leaving HUD text crisp.

## Safety and retired legacy code

Code rollback branch: `backup/before-full-3d-migration-20261105`, pushed before removal (pre-migration head `bf5e74c`). The one-time presentation migration also copies an existing league file to `DATA_DIR/league.before-3d-v2.json` before changing its result timing. Active player IDs, profiles, records, history, sessions and seasons are not erased.

Removed:

- `public/index.html`, `app.js`, `arena.js`, `style.css`: Phaser battlefield and old dashboard/demo UI.
- All 31 old root-level sprite/background/particle files under `public/assets/`, including army atlas and sprite metadata. Grok UI and KayKit archives are preserved.
- `src/camera-director.js`, 2D-only camera exports/tests and unused procedural character fallback `client3d/development-units.ts`.
- Sprite-generation/art-check tools and old Phaser browser/vertical/round-UI harnesses. Current browser checks exercise the real 3D game instead.
- Direct Phaser and legacy esbuild dependencies. Vite's own build dependencies remain required.

`/` and `/index.html` open `/3d/`; `/admin` opens `/3d/?admin=1`. `/legacy/` is a **410 Gone** retirement notice. Old `/app.js`, `/arena.js` and sprite URLs are 404. No game navigation links to a 2D page.

The Node HTTP server, Socket.IO, TikTok connector/authentication, token checks, shared damage/formation simulation and league records are retained. Simulation coordinates remain internally compatible with existing data; the render adapter maps their plane to 3D X/Z.

## Actual unit registry and gifts

| Display class | Internal key | Existing asset |
| --- | --- | --- |
| Small Soldier | sword | `Characters/gltf/Knight.glb`, sword/shield |
| Heavy Soldier | cavalry (compatible internal ID) | `Characters/gltf/Barbarian.glb`, axe, on foot; obsolete horse-charge logic removed |
| Archer | archer | `Characters/gltf/Ranger.glb`, bow |
| Mage | mage | `Characters/gltf/Mage.glb`, staff, hovering |
| Giant | boss (compatible internal ID) | Existing Barbarian enlarged 3.4×, shared rig; no newly invented Giant model |
| Castle Guardian | guardian | Reserved, disabled; no approved model supplied |

The six source character GLBs (including extra Rogue variants), original textures and 24 shared clips still load in the model gallery. Battlefield near-unit animation uses available idle, running, hit, attack-proxy and death clips. The supplied pack does not contain bespoke horse/rider, approved castle Guardian or dragon rigs/animations.

| Proposed metadata name | Action |
| --- | --- |
| Rose | +1 Small Soldier |
| Finger Heart | +5 Small Soldiers |
| Doughnut / Donut | +3 Archers |
| Perfume | +2 Mages |
| Heavy tier | Configurable Heavy Soldier slot, disabled until mapped |
| Premium tier | Configurable Giant slot, disabled until mapped |
| Fire/Frost Dragon | Unavailable; rejected as a summon type |

**No official gift IDs or prices are guessed.** Exact configured positive gift IDs take priority; normalized connector names provide the four initial fallbacks. Optional coin thresholds are explicitly chosen by the administrator from actual observed metadata. The protected 3D admin dashboard edits and atomically saves `gift-mappings.json`, displays observed IDs/names/coins with their LIVE/Demo source, and tests the same ingest path in Demo Mode. The old `rules.json` remains untouched on disk but its obsolete gift tiers are not used.

Native v2 fields were checked against the installed connector/protobuf types. Streak progress does not summon; the completed cumulative repeat count is applied once. Real nonzero group IDs identify streaks; protobuf's default **groupId "0" is treated as absent**, preventing distinct gifts from being collapsed into one. Message receipts additionally protect connector reconnections and survive graceful restarts. Events without a stable ID are rejected rather than guessed. Exact deduplication for differently identified retransmissions without a real group ID cannot be inferred from missing platform metadata.

Spawning, damage, ownership and contribution scoring are authoritative. Avatars/names refresh from native user metadata. +5 summon points are awarded only for actually spawned units. Queue admission is bounded to 500 batches / 5,000 pending units, 200 accepted gift events/second globally, and 40 per viewer per ten seconds. Summons drain in bounded simulation batches; active units including corpses remain capped at 300. Accepted pending counts remain queued while the round is open, without a short time expiry. The notification says **queued**, not falsely that every requested soldier already spawned.

Round policy: unfinished queues are cancelled at round end; a closed-round/old-round gift is rejected and is not replayed into the next round. A streak observed crossing the round boundary is also rejected. Duplicate/late events cannot modify the frozen result or earn duplicate contribution points. This policy is explicit, not a promise to carry every platform purchase across rounds. Weekly/monthly standings use retained completed history and current-round contributions, with UTC Monday/month boundaries. Only round data clears.

`CASTLE_GUARDIAN` reserves one per castle but stays disabled until an approved mesh, rig and clips are integrated. Guardians cannot be configured as gifts; the old Like-energy Guardian reward now grants a Heavy Soldier. No Knight is silently presented as an approved castle Guardian. Dragon actions and dragon audio remain incomplete because no working models/animations are present.

## Audio and terrain

Sixteen original PCM WAV files, 22,050 Hz mono, total about 732 KB, are supplied under MIT with a license/provenance manifest in `public/assets/audio/`. Reproduce them with `npm run audio:generate --prefix live` (Python standard library only). They cover sword clashes, arrow shots/impacts, spell cast/magic impact, Giant steps/attacks, castle impacts, death, gift/special summon, victory/defeat, countdown/next round and an optional original music loop. No external recordings or unverified licenses are used.

One Web Audio context reuses decoded buffers through separate music/SFX buses. It remains locked until **Enable sound** is tapped. Mute, independent sliders and an optional followed kingdom control victory/defeat mixing. Voices are capped at 12, grouped per snapshot, throttled by sound type and attenuated by distance. No persistent audio object is allocated per soldier. Background-tab voices stop. Browser tests verify real buffer decoding/playback after a gesture and mute/volume controls; listening quality and physical iPad output still need device review.

The pale field was largely the old **30-unit-wide beige road covering the combat area**, not only a grass color. The road is now a narrower worn path with retained verges. Ground varies between `#345C36`, `#477A45` and `#63915A`, with neutralized sunlight and reduced ambient intensity. Paths, rocks, forests, fog, hills and the licensed fortresses remain.

## Run, update and verify

Use the repository's main development branch `feature/pixel-war-live` after this update is merged. Existing Codespaces do not automatically pull GitHub changes. On iPad open a new terminal; after checking for local edits, use the same Git switch/pull and `npm start` flow. Stop the old server gracefully before restarting; no Ctrl+C is required if using the terminal UI's stop/trash control.

```sh
npm run setup
npm start
# Open forwarded port 3000 in Codespaces.
```

Game `/3d/`; protected admin `/admin`; capture `/3d/?overlay=1`; gallery `/3d/gallery.html`. On iPad use the forwarded HTTPS URL, tap Enable sound, open/close all three rankings, test a short round in Demo and watch the entire results countdown. No public deployment or remote Codespaces restart is implied by a Git push.

```sh
npm run build
npm test
cd live
node tools/gameplay-check.mjs
node tools/model-check.mjs
node tools/three-check.mjs
node tools/hud-check.mjs
node tools/fortress-check.mjs
node tools/audio-check.mjs
```

Install test browsers with `npx playwright install --with-deps chromium webkit` where needed. The managed test machine used local extracted Debian library dependencies for WebKit because system package installation was unavailable; these are test-environment files, not application dependencies.

Runtime persistence serializes and fsyncs on a worker, with coalesced checkpoints roughly once per second. Graceful shutdown stops ticking, drains persistence and saves the latest records. Abrupt power/process loss can lose the last checkpoint window; this JSON store is not a transactional financial ledger. Use one process and a persistent DATA_DIR. For code rollback to the old version, stop the server first; old code requires a positive countdown, so restore the old timing values while retaining current player/history data. Do not blindly replace newer player history with a stale backup.

## Measured verification

Machine: managed Linux container, Chromium 155.0.8059.79 with SwiftShader software WebGL; capture viewport 1080×1920 with touch emulation. The stress view uses 390×844 CSS pixels and adaptive drawing-buffer resolution. This is **not an iPad hardware benchmark**.

The comprehensive browser check asserts authoritative winner, all ten round rows/points, exactly one result presentation, active animation/render frames during results, reconnection, rejected late gifts, automatic next round, closed manual panels, retained weekly/monthly scores, real gift mapping edits, disabled Guardian, bounded gift spam, audio gesture unlocking and retired 2D URLs. Separate checks verify real character parts/textures/animations, 300 rendered units, context loss recovery, portrait/touch controls and both 29-module fortresses. No page errors or failed browser asset requests were observed.

Local measured data and screenshots are in `docs/full3d/`; the browser scripts also generate CI artifacts. The observed software-rendered 300-unit rate remains far below playable FPS. Server response/queue bounds passing does **not** establish smooth iPad rendering. The 30 FPS iPad / 60 FPS desktop hardware targets are not verified or claimed.

[Combat — actual 1080×1920 capture](docs/full3d/full3d-combat-1080x1920.png) · [Automatic round results — actual 1080×1920 capture](docs/full3d/full3d-results-1080x1920.png) · [300-unit mobile stress view](docs/full3d/full3d-mobile.png) · [Full machine-readable report](docs/full3d/full3d-report.json) · [WebKit audio report](docs/full3d/webkit-audio-report.json)

Latest local run: result UI appeared 46 ms after the observed result snapshot; next round appeared after 6.96 s. Spam: 24 requests, 20 admitted and 4 rejected at the queue boundary; maximum API latency 23.9 ms. All 300 unit visuals rendered (12 independent skeletons, 288 baked mesh LOD instances), with measured software WebGL rate 0.66 FPS over 3.03 s, at drawing buffer 199×354. This low raster rate is a material remaining performance limitation of this test environment.
