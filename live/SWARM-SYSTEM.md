# Organic armies and admin music

This supersedes the old 300-unit ceiling and 15-row formation behavior. The previous engine, KayKit assets, HUD, fortresses, TikTok ingestion, authoritative damage and calendar leaderboards remain in use. No new reference images were attached to this request, so the implementation follows the written specification rather than claiming a screenshot comparison.

## Army behavior

`src/characters.js` configures normalized world heights: normal/archer/mage 1.53 m, Heavy 2.448 m (1.6×), Giant 6.12 m (4×). Normal body height decreases 15%; the Heavy is slightly larger than before and the Giant retains its previous world height, so large units are not shrunk along with normal troops. Templates are normalized before instance scaling. Normal movement is 110 server units/s, Heavy 71.5 (0.65×), Giant 44 (0.4×). The Giant still uses the existing KayKit **Barbarian substitute**. No separate bear-headed Giant, dragon or approved castle Guardian is present.

Seeded continuous samples scatter troops over a 60 m deep navigation area. Placement rejects overlapping same-altitude bodies; the spawn zone is outside fortress walls, and the existing forest decorations have been moved beyond the widened navigation clearance. No row or column restoration is applied. Spatial grids bound target and separation queries; individually phased wandering, target distribution and soft separation preserve a broad front. Siege movement converges inside the existing fortress frontage.

Default authoritative capacity is **1,000 total / approximately 500 per team**. Demo stress controls offer 200, 500, 1,000 and experimental 2,000 total. This is a capacity, not a promise of hardware FPS or free LIVE units. Demo density fixtures are ownerless, explicitly labeled combat units: they do damage but fabricate neither gifts nor contribution points. Connecting LIVE removes Demo-origin units/queued fixtures while retaining real accepted summons. No decorative fake army is used.

## FIFO and accounting

Every accepted gift reserves consecutive server sequence numbers. Only the head request deploys, in batches of at most eight per 50 ms simulation tick. A full or occupied spawn zone holds its remainder; later unit types cannot jump ahead. Like rewards and admin spawn requests use the same queue. Pending accepted gifts persist through results, subsequent rounds and graceful server restarts. XP is awarded for actual deployment, not queued quantity. Completed gifts during results wait for the next round; the frozen result is unchanged. Already-observed streaks may complete across a round boundary, while unknown stale events remain rejected and completed receipts remain deduplicated.

Queue state and receipt storage use the existing asynchronous checkpoint worker. Graceful shutdown flushes storage. Abrupt machine failure can lose the interval since the last checkpoint (approximately one second); this is not a transactional zero-loss payment ledger. Keep `DATA_DIR` persistent.

## Actual animated models

Near units use pooled independently cloned KayKit skeletons and AnimationMixer: four rigs on low/mobile, eight on balanced when the army exceeds 40. Distant units use simplified **real character meshes with their original textures/team colors**, instanced vertex-animation textures. This is not a sprite, capsule or static idle bake. About 706–822 triangles per base character and approximately 5.53 MiB of shared position/normal animation data cover both teams. Near detail selection may favor a Giant, but never changes deployment order. No separate skeleton evaluation runs for every distant soldier. Atlas preparation yields short CPU batches independently of GPU frame rate so software/mobile rendering cannot hold up each baking step.

The free KayKit clips actually present include Idle_A, Running_A, Walking_A, Jump_Idle, Hit_A and Death_A. The pack has no dedicated weapon combat clips. `client3d/unit-animation.ts` supplies original MIT bone-keyframe sword, bow, staff, Heavy and Giant attacks, sampled into the same GPU pipeline. Server attack sequence numbers restart attack actions; loop phases vary by unit. These are authored fallback motions, not missing KayKit attack clips falsely relabeled as finished artwork. The model gallery retains all original clip inspection controls.

## Upload background music

Open `/admin`, authenticate, then **Nhạc nền → chọn tệp → Tải nhạc nền lên → Nghe thử / bật nhạc**. Music and SFX have separate volume controls and a shared mute control. Music stays silent until a user gesture enables it. Every viewer/browser must enable its own audio. MP3, WAV, M4A and OGG are accepted up to **12 MiB**; Safari codec support varies, so MP3/WAV/AAC M4A are preferred. Invalid/unsupported playback is reported.

The authenticated upload checks container signatures and sizes, atomically saves a UUID file and manifest under `DATA_DIR/music`, broadcasts a track change and supports HTTP range streaming. One reusable HTMLAudioElement feeds the existing Web Audio music bus; an entire uploaded song is not decoded into a per-soldier audio buffer. Two versions are retained for in-flight requests. **Dùng nhạc mặc định** restores the existing original MIT loop. Uploaded files retain their owner's licensing; uploading does not make them MIT licensed. No external song was bundled.

## Measured rendering and simulation

Actual Linux Chromium 155.0.8059.79 / SwiftShader software rendering; 1080×1920 CSS viewport, DPR 1, low quality, adaptive 552×983 drawing buffer. Each sample ran the authoritative march for at least eight seconds. These very low software-rendered FPS values **do not meet the hardware goals** and cannot be presented as iPad performance. The 2,000-unit level remains experimental.

| Actual units | FPS | Mean frame ms | Draw calls | Triangles | JS heap MiB |
| --- | --- | --- | --- | --- | --- |
| 200 | 1.79 | 559 | 73 | 270,042 | 28.3 |
| 500 | 1.07 | 934 | 73 | 510,360 | 29.6 |
| 1000 | 0.62 | 1619 | 79 | 911,763 | 39.7 |
| 2000 | 0.30 | 3332 | 91 | 1,714,676 | 48.9 |

Linux WebKit 27.2 touch emulation rendered 200 actual units at 5.97 FPS / 73 draw calls in its software test. No physical iPad was available. All army samples and the active combat check completed without page errors, missing HTTP assets or shader console errors. Unit-center visibility estimates are projected centers, not exact occlusion measurements. Normal/Heavy/Giant heights were 1.53/2.448/6.12 m in these runs. Original KayKit double-sided materials remain double sided in the GPU batches.

The separate CPU test holds exactly 200/500/1,000/2,000 ownerless test units alive with benchmark-only high HP. On AMD EPYC 9V74 / Node v24.22.1, simulation tick p95 was 0.77 ms, 2.88 ms, 9.41 ms, 29.60 ms respectively; 2,000-unit JSON serialization p95 was 2.03 ms. This excludes networking/compression/persistence/GPU costs. The real HTTP gift-spam check also exercises live contribution accounting and a bounded deployment queue.

[1,000-unit portrait capture](docs/swarm/swarm-1000-1080x1920.png) · [2,000-unit experimental capture](docs/swarm/swarm-2000-1080x1920.png) · [Active combat capture](docs/swarm/swarm-combat-1080x1920.png) · [Full Chromium report](docs/swarm/swarm-report.json) · [WebKit report](docs/swarm/swarm-report-webkit.json) · [CPU report](docs/swarm/swarm-simulation.json)

[Admin music upload screenshot](docs/swarm/music-upload-admin.png) · [Chromium upload/playback report](docs/swarm/music-report.json) · [WebKit upload/playback report](docs/swarm/music-report-webkit.json)

The first pull-request WebKit runner hit ANGLE `TextureGL.cpp` error 0x502/context loss during cold loading (the renderer recovered, but the strict console-error assertion failed). A retry reproduced it while the push run and local runs were clean. The new swarm/music job pins Ubuntu 24.04 instead of the rolling Ubuntu 26 image and explicitly selects software Mesa/llvmpipe with DMA-BUF disabled; reports retain driver/environment details and any console errors before the same strict assertions run. Production browser settings are unchanged. Physical Safari reliability remains unverified.

## Reproduce verification

From the repository root:

```sh
npm run setup
npm run build
npm test
cd live
npx playwright install --with-deps chromium webkit
node tools/swarm-check.mjs
node tools/swarm-simulation.mjs
node tools/music-check.mjs
LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe WEBKIT_DISABLE_DMABUF_RENDERER=1 MUSIC_ENGINE=webkit node tools/music-check.mjs
node tools/gameplay-check.mjs
node tools/three-check.mjs
node tools/model-check.mjs
node tools/terrain-check.mjs
```

Browser scripts run isolated servers/storage. Swarm measurements include actual unit count, CSS viewport, drawing buffer, adaptive scale, frame deltas/FPS, triangles, draw calls, browser heap, render-resource counts, server memory/tick and selected real animation clips. Screenshots and JSON go to `artifacts/`. Chromium software WebGL is not a physical iPad or hardware GPU benchmark. Counts can decrease during the live sample because combat remains authoritative; the report records the actual rendered count instead of claiming missing soldiers still exist.

## iPad acceptance

1. Update and restart the actual Codespace server, keeping its existing `ADMIN_TOKEN` and `DATA_DIR`. Open **Ports → 3000 → Open in Browser**; the editor `.github.dev` URL is not the game. Check the build SHA outside capture mode before testing. New clients also warn when the connected server lacks the swarm protocol: rebuilding the frontend alone does not restart Node. On iPad, the terminal trash icon closes the old terminal without requiring Ctrl+C; keep the same environment/storage when starting the server in a new terminal.
2. Open `/admin`, start with 200, then 500, then 1,000 total. Choose low quality and frontline camera. Verify smaller normal troops, taller Heavy units and the clearly labeled Barbarian Giant substitute. Check that troops occupy battlefield depth rather than rigid rows, run and attack, and that the camera retains both sides.
3. Use gift simulation with an identifiable username. Check pending count/sequence while spawning different types, actual deployment contributions and continued combat. Demo mass-army buttons must not generate Top 10 gift contributions.
4. Upload a short licensed MP3/WAV; tap the preview button, adjust Music, mute/unmute, background/restore Safari, reload, and confirm the selected track survives server restart. Check restore-default behavior.
5. Record iPad model, iPadOS/Safari version, quality, canvas size, active count and FPS/frame time from debug mode. Only try 2,000 total if the previous level remains usable. Physical iPad performance is still unverified.
