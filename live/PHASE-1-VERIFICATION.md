# Phase 1 verification — 2026-11-05

Source baseline: `58678ef`, branch `migration/threejs-phase-1`.

| Check | Observed result |
| --- | --- |
| Baseline tests before renderer changes | 50 existing tests passed, including actual server restart/persistence |
| Final `npm test` | 50/50 passed |
| `npm run build` | Legacy esbuild bundle, strict TypeScript check and Vite production build passed |
| `npm run test:browser --prefix live` | Existing game UI, demo gifts/likes, movement/combat/death, siege victory, 300 cap, mapping, round phases, Top 10, multi-client sync, persistent history and responsive overlay passed |
| `npm run test:3d` | WebGL2 startup, Socket.IO snapshots, RED/BLUE side order, portrait aspect, camera presets, drag/zoom, admin authorization, 300 markers, context loss/restore, responsive/capture and touch checks passed |
| Source preservation | `git diff --exit-code -- live/src live/public/app.js live/public/arena.js live/public/style.css live/public/assets` passed |
| Browser runtime | No page JavaScript exceptions or failed page HTTP responses in the 3D acceptance run |
| Visual inspection | Viewed generated desktop, castle close-up, formations and 1080×1920 capture screenshots; adjusted exposure, castle scale and overview framing |

Test environment: managed Linux x86-64, Node 24.22.1, Chromium
**155.0.8059.79**, headless with ANGLE/SwiftShader software WebGL2. WebGL reports
`WebGL 2.0 (OpenGL ES 3.0 Chromium)`. This is not a GPU desktop benchmark and is
not Safari or a physical Apple device.

Tested browser viewports: 1440×1200, 820×1180, 390×844 and capture 1080×1920.
The regular desktop preview's drawing buffer was 548×974 at DPR 1. Touch
emulation used an 820×1180 viewport with deviceScaleFactor 2 and correctly
capped its drawing buffer at 548×974 in Mobile/low mode. Touch drag and two-finger
pinch were dispatched through Chromium's input protocol.

The default paused snapshot contained 24 real server units, rendered as temporary
unrigged markers. Initial overview reported 40 draw calls / 27,968 triangles.
The paused 300-marker Mobile/low overview reported 36 draw calls / 23,696
triangles. These figures describe those views, not all camera positions.
Startup FPS diagnostics include compilation and software-renderer stalls; no
steady-state 300–500-unit performance benchmark was performed. Desktop 60 FPS
and iPad 30 FPS targets remain **unverified**. No 500+ unit support was enabled.

The Vite build emits a non-fatal chunk-size advisory for the shared Three.js
chunk (~510 kB minified / ~130 kB gzip). No runtime engine CDN is used.

Reproducible outputs are ignored build/test artifacts in `live/artifacts/`:

- `three-acceptance.json`: browser/configuration and checks.
- `three-desktop.png`: initial overview.
- `three-blue-castle.png`: castle camera.
- `three-formations.png`: 300-unit server scenario.
- `three-820.png`, `three-390.png`: responsive layouts.
- `three-1080x1920.png`: portrait stream source.
- `three-touch-820.png`: touch/mobile path.

Browser tests use isolated temporary storage and test-only admin tokens; they
do not connect to TikTok or use real player data. Live TikTok connectivity,
physical iPad/iPhone Safari, GLB assets, rigged animation, 3D projectiles/VFX and
automatic cinematic camera are not verified or delivered in this phase.
The Douyin reference was unavailable, so visual similarity was not assessed.

See [MIGRATION-3D.md](MIGRATION-3D.md) for the full audit, missing asset checklist,
Codespaces instructions and exact physical iPad test procedure.
