# Vertical LIVE battle design

The output is **1080 × 1920**, always portrait 9:16. No canvas rotation, CSS simulation of landscape, or horizontal orientation lock. OBS Browser Source should use width 1080, height 1920. Open `/?overlay=1&guides=0` for broadcast. Normal dashboard and overlay use the same canvas/renderer. Screens with a different aspect ratio letterbox the output instead of stretching it.

## World / formation / perspective

- Physical world: **4800 × 2400**, over four times the stage width; castles x=180 (Red), x=4620 (Blue).
- Red advances +X, Blue advances -X. Canonical initial deployment has 15 rows spaced 48px, Y=760…1432, multiple 48px columns. Spawn slots are unique for up to 300 units on one side before reuse. Ground collision radii increase for Guardian/Titan and ground/air remain separate collision layers.
- Units keep a lane while marching toward the enemy castle rather than collapsing into one central row. Close to the castle, outer lanes converge toward the courtyard/wall. Target acquisition and AoE still use authoritative physical coordinates.
- Rendering uses `projectY(y) = 1100 + (y - 1100) × 0.78`, ground-contact depth sorting, elliptical texture shadows and 0.85 base sprite scale. This is a lightly inclined 2.5D presentation of 2D pixel sprites, not 3D/isometric 8-direction art.
- Guardian is 2.5× normal; Titan 3.4×. Flying Mage is offset above the formation and has a ground shadow; projectile visual lift follows the launch/target altitude. All original animation states and combat logic remain active.

## Portrait screen composition

The Phaser world camera occupies **x=48, y=360, width=924, height=1040** inside the 1080×1920 stage. This viewport itself is taller than wide. It zooms and pans the world; the HUD never uses its transform.

- Top: both castle HP bars and team scores, round timer/phase, brand and join prompts.
- Reserved streamer webcam: approximately x=49, y=144, 292×173. Put an OBS webcam source above the browser source at this location. The game does not access the device camera or ask for webcam permissions.
- Middle: camera view, including deep ranks and combat effects; interactive camera buttons appear on the dashboard and are hidden in the clean overlay.
- Below the battle: director status, Gift/Like/Fury ticker, team energy/combos, merit leaders. The whole-map minimap at the lower edge of the battle shows both armies and the current camera rectangle.
- Rightmost 108px is outside the world camera for TikTok hearts/gifts. Bottom 13.5% is kept free for TikTok comments/tray. These are reserved layout regions, not an integration with TikTok's varying native UI dimensions. Test the composition in the actual LIVE layout used by the streamer.
- `guides=0` hides the webcam/safe-area guide labels without moving the reserved regions. The webcam source and TikTok's native UI are external overlays.

## Director

`src/camera-director.js` is pure JavaScript shared by browser tests and the Phaser scene. It evaluates **12 overlapping X regions** every 250ms and uses actual damage/spawn telemetry from the server. It does not decide from the number of Red or Blue units alone.

Priority inputs: both sides present, attacking/hurt/stomping units, recent actual damage with exponential decay, nearby castle attackers plus combat/damage evidence, and castle HP. Counts are capped in scoring so a large idle one-team army cannot outweigh a real two-sided clash. An approaching one-team army is not labeled a siege until combat evidence exists.

Modes:

- **overview**: wider tactical view. Before contact, establishes the advancing ranks rather than empty midfield. When fronts fit, centers between them. The minimap always covers the full world; overview does not shrink all 4800px into unreadable soldiers in the narrow portrait viewport.
- **combat_focus**: centers on the important mixed fight and fits its rank spread.
- **boss_focus**: brief emphasis for a newly spawned Guardian, Mage or Titan near the current fight; a distant spawn never steals an active fight. Crowd size and fit bounds limit zoom so important ranks are retained.
- **castle_siege**: includes the threatened castle and attackers; damaged castles receive stronger priority.

Anti-jitter: 3s minimum scene hold, a 35% + 20-score challenger margin, two consecutive evaluations, and at least 1.5s between urgent siege overrides. Hero emphasis lasts 2.8s with a 9s cooldown. Center interpolation is time-based (0.65s smoothing); zoom is limited to 0.28 per second and clamped to 0.58…1.18. Both axes clamp the complete zoomed viewport inside the map. Round changes retain the current pose and glide toward the new scene. Manual drag, wheel, minimap tap, Red/Blue castle and Overview controls remain available. Select Auto director to resume automatic framing.

The director chooses a primary scene, not every simultaneous encounter. Off-screen combat still resolves and earns points; global Gift/Like/merit notices remain visible. No camera can display every event on a wide map at a readable zoom simultaneously.

## Demo scenarios

Four buttons on the dashboard start actual playable rounds without TikTok:

1. Balanced armies: **150 vs 150**, assembled near the center.
2. Red pushes castle: 120 Red vs 36 Blue near Blue's castle.
3. Blue counterattack: 36 Red vs 120 Blue near Red's castle.
4. Boss arrival: 75 vs 75 plus a Red Titan in the main clash.

They use the normal spawn/AI/damage/merit systems, do not force HP or a winner, skip preparation for that demo round, set 1× speed and disable auto gifts. A scenario round lasts at least 120s so a previously saved 1s timing cannot cut off the demonstration. Saved round configuration is unchanged; the next automatic round uses it. Existing direct summons, Gift/Like simulation, 100/200/300 bulk, rounds/results, season standings and Admin controls are retained.

## Rendering / performance

- All **768 character frames** share an original **2048×1536 atlas**, suitable for minimum 2048px texture-size devices. The 12 individual animated PNG sheets remain for metadata/art inspection and troop icons.
- WebGL batches the shared texture. Bodies, projectiles, shadows, particles and damage text are reused from bounded pools; off-screen animation stops and visible objects are culled independently of simulation.
- Body pool: 440 including death grace; projectile pool 650 (server cap 600); shadow pool 440; FX pool 180 with a smaller active budget in crowds. Crowded scenes limit damage floaters to 12 and particle FX to 64; all units continue to animate/fight, not just sample representatives.
- Static terrain/parallax is created once. Ground shadows use one reusable image instead of hundreds of freshly tessellated ellipses. HP bars share one Graphics layer. Minimap updates ~6Hz; server combat/state remains 20Hz.
- Default renderer prefers Canvas for identified software WebGL and Linux WebKit's masked "Apple GPU" path, while retaining batched WebGL on real GPUs. `renderer=canvas` or `renderer=webgl` can override it for diagnosis/OBS testing without changing the 1080×1920 output.

**Measured limits:** a 2s active 300-unit sample on this executor reached about **57–59 FPS in Chromium Canvas** (p95 frame 17–33ms). Software WebGL was ~7 FPS. Linux WebKit improved from ~9.5 FPS in WebGL to ~19 FPS in Canvas after fallback/pooling work. These are short software-rendered samples, not physical iPad/OBS GPU benchmarks, long-duration thermal tests or universal 300-unit FPS guarantees.

The hard cap is **300**, deliberately unchanged. **1000 is not enabled or claimed stable**. It requires profiling simulation, persistent score I/O, network snapshots, GPU fill and target devices before raising server and pool limits. Physical Safari iPad and OBS have not been exercised in this environment.

## Reproduce

```bash
npm run build
npm test
npm run assets:check --prefix live
npm run test:vertical --prefix live
# With WebKit installed:
BROWSER=webkit TEST_PORT=3107 npm run test:vertical --prefix live
```

Install browsers if necessary with `cd live && npx playwright install --with-deps chromium webkit`. Existing full gameplay regression remains `npm run test:browser --prefix live`. Tests use isolated servers/temp data; screenshots in `live/artifacts/` include balanced combat, both siege directions, Boss focus, phone/iPad and fixed HUD. Unit tests cover mixed-clash priority, DPS, directional pressure, hero emphasis, anti-jitter, bounds, zoom rates, quiet-front overview and deep formation. `assets:check` verifies every atlas crop matches the original sprite-sheet frame.
