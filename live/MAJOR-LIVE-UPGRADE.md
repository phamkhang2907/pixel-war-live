# Free camera, public Demo, owner controls and fast spawn bands

This extends the existing renderer and authoritative Node/Socket.IO game on a migration branch from `e39aa7a`. It retains the KayKit characters, Grok fantasy HUD, fortresses, combat, audio, gift receipt/streak protection and persistent production player records. The new grass request supersedes the earlier flat low-poly ground treatment. No new reference photograph was present in the incoming message; exact comparison to that photograph remains outstanding.

## Terrain and actual assets

The runtime grass is **ambientCG Grass001**, CC0-1.0, commercially usable and redistributable: [asset](https://ambientcg.com/a/Grass001), [license](https://docs.ambientcg.com/license/). Three actual maps are stored in `public/assets/3d/terrain/grass001/`: `color-1k.jpg`, `normal-1k.jpg`, `rough-1k.jpg`. `sources.json` records API-listed official map URLs, original hashes/dimensions, conversion and final hashes. The ZIP download endpoint was unavailable; the official API-listed flat 2048px surface maps were accessible and converted to 1024×1024 JPEGs. These are real albedo/normal/roughness maps, not a rendered sphere thumbnail. No external runtime downloads are needed.

The PBR grass uses MeshStandardMaterial, matte roughness, sRGB albedo, linear normal/roughness, trilinear mipmaps and repeat wrapping. The API gives a 1.4 m surface width: 320 m terrain repeats 320/1.4 times on both axes. DirectX normal Y is corrected by negative normalScale.y. Broad, gentle vertex-color variation supplements fine photographed texture detail. Existing paths, rocks, trees and low-poly fortresses remain. No individual grass blades or full-field grass geometry are added. Fine blades become readable when zoomed in; an elevated army overview necessarily minifies them.

The actual models remain Knight, Ranger, Mage and Barbarian. Templates use their measured bounding boxes, normalized to 1.8 m before instance scaling. Normal/Heavy/Giant body-height targets are 1.53/2.448/6.12 m (1/1.6/4); normal/Heavy/Giant speeds are 110/71.5/44 server units per second. The previous Giant world height is preserved. There is still **no separately approved bear-headed Giant model**: Giant is explicitly the enlarged Barbarian substitute. Guardian/dragon slots remain unavailable. No new rig or missing animation is claimed: the existing 24 KayKit clips and five original MIT weapon motions are reused, with near skeletal pooling and far vertex-animation textures.

## Camera

A custom controller integrated with the existing smooth camera director implements OrbitControls-equivalent interaction:

- Desktop left drag / touch one-finger drag: orbit yaw and elevation.
- Desktop right drag / touch two-finger drag: pan the ground target in camera-relative X/Z.
- Mouse wheel / pinch: zoom; two-finger translation and zoom can occur together.
- Reset Camera restores the portrait overview; Follow Battle restores the moving frontline view; Free Camera preserves the current viewpoint and releases automatic tracking.

Only the canvas handles gestures, leaving HUD buttons/dialogs usable. Pointer capture, pointercancel and context-menu handling cover Safari-style pointer input. Elevation is limited to 20–78 degrees, distance to 35–320 m, ground target X to ±65 m and Z to ±40 m. Camera height stays at least 16 m, above the playable terrain and fortress roofs. Default/reset framing keeps RED world-left and BLUE world-right; freely orbiting behind the battle can naturally reverse screen directions. Viewport resize redraws immediately to avoid a cleared-canvas flash.

## Spawn bands and throughput

Each team starts with a 60 m deep, 4.4 m wide jittered band, safely outside fortress walls and the cleared scenery boundary. Position sampling is deterministic and continuous along Z; the world Y coordinate remains height, never a vertical stack. A footprint-weighted army population expands deployment into a second and third parallel band around 180/360 normal-unit equivalents. The least populated available band is preferred; existing troops are not teleported. X jitter and independent Z samples avoid straight columns and rows. Large units consume more footprint budget. Spatial neighbor checks reject body overlap.

All accepted summons keep global server FIFO sequence numbers and owner attribution. Later requests cannot overtake the head request. Default deployment increases **8 → 64 units per 50 ms outer tick**: a nominal ceiling of **160 → 1,280 units/s**, with a soft 6 ms CPU budget checked between chunks of at most 16. Catch-up simulation steps do not each deploy another batch. Paused/ready/stopped states do not drain the queue. Full capacity or occupied spawn space retains the undeployed remainder. Reset/results preserve accepted pending quantities; contribution XP is awarded on actual deployment.

The owner can set 8–256 units/tick and a 1–12 ms soft budget in Spawn throughput. These settings persist in `DATA_DIR/army-config.json` and apply to production and public Demo. Owner mass-spawn buttons enqueue through the same FIFO instead of synchronously cloning an army. Explicit camera-scenario RPCs remain deterministic acceptance-test fixtures. Active capacity remains 1,000 normally, 2,000 as an owner-controlled experimental test.

`tools/deployment-benchmark.mjs` compares batch limits using the **same new placement algorithm** to isolate the batch change. On the Linux AMD EPYC workspace / Node 24, 1,000 queued normal troops took 125 ticks with batch 8 and 16 ticks with batch 64: **6.25 → 0.80 seconds at 20 Hz**, or 160 → 1,250 deployed troops/s for this finite batch. Batch 128 took eight ticks / 0.4 s. Tick-cadence time is derived; CPU time is measured separately in the JSON. This is deployment throughput, not rendered FPS or a physical iPad benchmark.

## Public Demo and authenticated owner

- `/3d/` and `/3d/?demo=1`: public Demo; no admin token or owner login required. **Send Demo Gift** opens team/name/gift/quantity controls. Actual simulation, summoning effects, notifications and contribution calculation run in a separate authoritative Demo arena on Socket.IO `/demo`.
- `/3d/?live=1`: readonly production view. **Watch LIVE / Public Demo** switches arenas explicitly. Public Demo never emits into production or writes the production league.
- `/owner/login`: native password form, no application JavaScript. `OWNER_PASSWORD` is the preferred server setting; if absent, the existing ADMIN_TOKEN/terminal-generated secret serves as the owner password for migration. No secret is embedded in frontend bundles, URLs or localStorage.
- `/admin`: owner production interface. After sign-in, server-created opaque cookies are HttpOnly, SameSite=Strict, host-only, Secure under HTTPS and expire after eight hours. Session identifiers are stored hashed in memory; restart requires sign-in again. Login attempts are rate limited; password comparison is timing safe; login rotates sessions. The old bearer API remains protected for server-side automation only. Browser writes use the cookie, with same-origin checks. Public requests to control/config/music endpoints remain unauthorized.

Public gifts: Rose → 1 Small Soldier; Finger Heart → 5; Doughnut → 3 Archers; Perfume → 2 Mages. **Demo Heavy / Demo Giant** are additional explicitly simulated choices, not official TikTok gift names, IDs or prices. Names, teams, quantity (1–50) and event IDs are validated server-side; clients cannot supply arbitrary unit types, coin values or production actions. Duplicate retries produce no extra summons/XP. Limits are 12 requests per anonymous client per 10 seconds, plus 120 per IP, and queue backpressure before acceptance. Rejected attempts return an explicit error; accepted quantities are retained. Pending counts remain visible.

The shared public Demo arena has an in-memory league, bounded recent history and no disk persistence; it runs only with subscribers. Its weekly/monthly figures are simulated demo figures, not production rankings. Production persistent player data, season/week/month boards and real gift receipts are retained. Owner-only legacy offline simulation tools remain clearly marked as Demo; they are never public administrative access.

## Round/session state machine

The existing RoundManager remains the sole authority. There is one outer server ticker, shared by the separate simulations, not UI-created timers.

- **Start** starts after STOPPED, or activates a prepared READY round. It does not reset an already running round. A repeated command ID does not create duplicate rounds.
- **Pause / Resume** set the paused flag explicitly and idempotently. Position, damage, projectiles, round time and queued deployment freeze; networking and UI rendering continue.
- **Stop** archives an aborted round, stops simulation/automatic restart, clears transient attacks and disconnects TikTok with a generation guard. Alive units become idle. STOPPED persists through server restart.
- **Reset** clears deployed round state and prepares READY, preserving calendar rankings and accepted pending gifts. It waits for explicit Start.
- Normal completed rounds still show the existing seven-second automatic results screen and then restart. Stop bypasses this automatic restart path.

## Actual TikTok status and limits

The existing server-only `tiktok-live-connector` 2.5.0 is reused. Owner Connect / Disconnect / Reconnect report **connecting / connected / disconnected / error** independently of Socket.IO connectivity. Sender profiles and avatars, team selection comments, authoritative reward mapping, final-streak processing and deduplication stay in the existing pipeline. Owner diagnostics include username, received-event counts, last event timestamp and safe failure hints; raw signing-service errors/secrets are not sent to JavaScript.

The browser check made an actual connector call for the intentionally nonexistent/non-broadcast probe username `pixelwar_offline_probe_20261106`. It timed out and the app correctly reported ERROR rather than Connected. **No real broadcast or actual gift reception has been verified.** A currently broadcasting username is still required; some TikTok regions/connector paths also require server-side `EULER_API_KEY`, signing access, or recovery after platform rate limits. No key is supplied by the project. Connection success cannot be fabricated by Demo events.

## Verification and files

Important changes:

| Area | Files |
| --- | --- |
| Spawn, lifecycle, integration | `src/characters.js`, `game.js`, `rounds.js`, `server.js`, `tiktok-connection.js` |
| Public isolation / owner sessions | `src/public-demo.js`, `src/owner-session.js` |
| Camera / textured ground | `client3d/camera.ts`, `renderer.ts`, `grass-material.ts`, `world.ts`, `public/assets/3d/terrain/grass001/` |
| Public/owner UI | `client3d/visitor-controls.ts`, `main.ts`, `admin.ts`, `index.html`, `style.css`, `state.ts` |
| Tests / reporting | `test/upgrade.test.js`, `tools/upgrade-check.mjs`, `tools/deployment-benchmark.mjs`, updated regression tools and CI |

Run from the repository root:

```sh
npm run setup
npm run build
npm test
cd live
npx playwright install --with-deps chromium webkit
node tools/deployment-benchmark.mjs
node tools/upgrade-check.mjs
LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe WEBKIT_DISABLE_DMABUF_RENDERER=1 UPGRADE_ENGINE=webkit node tools/upgrade-check.mjs
```

`artifacts/upgrade-*` contains real browser captures of public controls, a dense portrait battle, detailed grass and the owner LIVE error state, plus JSON assertions. Tests cover simulated gift types/names/score/FIFO/band expansion, isolation, rate limiting, native owner login, HttpOnly/SameSite, rejected public writes/cross-origin writes, lifecycle, mouse orbit/pan/zoom and Chromium CDP one/two-finger gestures. Linux WebKit's mobile automation does not expose mouse-wheel input or native multi-touch injection; that run checks pointer orbit/right-pan, zoom buttons, reset/follow, UI, grass and security. Neither engine is a physical iPad. Legacy round/model/fortress/HUD/audio/context-loss regressions are also retained.

Actual Linux browser captures: [1,000 soldiers at 1080×1920](docs/live-upgrade/battle-1080x1920.png), [fine grass detail](docs/live-upgrade/grass-detail.png), [public controls](docs/live-upgrade/public-controls.png), [honest connector error](docs/live-upgrade/owner-live-error.png). Assertions: [Chromium](docs/live-upgrade/chromium-report.json), [WebKit](docs/live-upgrade/webkit-report.json), [deployment throughput](docs/live-upgrade/deployment-throughput.json). These captures are from running servers with actual simulation/model rendering, not mockups.

## Codespaces and physical iPad

After updating the correct branch, restart the Node server while retaining DATA_DIR and owner credentials. GitHub merging does not restart a private Codespace. A terminal can be closed with its trash icon on iPad; Ctrl+C is not required. Open **Ports → 3000 → Open in Browser → `/3d/`**, not the editor `.github.dev` URL. Choose Demo to try gifts without credentials; use Owner sign in for production controls. Server environment variables are not automatically loaded from `.env` unless Node is launched with the documented env-file option.

On an actual iPad, check one-finger orbit, two-finger pan/pinch together, HUD taps without camera movement, reset/follow, detailed grass at close zoom, 100→500→1,000 troops and pending counts. Verify the owner controls cannot be invoked from a logged-out tab, and Stop stays stopped past the old round deadline. Upload/play music after a tap. Record device/iPadOS, resolution, actual count and FPS; physical Safari responsiveness and hardware FPS remain unverified. The new grass reference photo and a real broadcasting TikTok username are still needed for the remaining reference/live checks.
