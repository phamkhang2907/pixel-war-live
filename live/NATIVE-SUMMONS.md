# Native Three.js gift summons

Gift presentations run inside the existing Three.js renderer and HTML/CSS HUD. There are no Grok videos, MP4 summon overlays, chroma-key shaders, VideoTextures or pre-rendered summon assets/dependencies. Existing `audio/mp4` handling is M4A background music and is preserved.

## What arrives and what deploys

The existing TikTokIngest and public isolated Demo pipeline retain final-streak de-duplication, selected faction, server-authoritative FIFO spawning and contribution accounting. Gift notifications contain the sender profile, actual gift icon when provided by connector metadata, and **gift quantity**. Deployment records are emitted only for actual spawned units, carrying request sequence, cohort, IDs, centroid, sender, type and **deployed troop quantity**. For example, three Finger Hearts display ×3 in the notification and Small Soldier ×15 above the real group. No client-side troops or fake contributions are added.

Normal gift troops use small randomized cohorts of at most 16 units within the existing team spawn bands. Large creatures use smaller cohorts. Placement checks existing blockers and neighbors. If a compact area is saturated, bounded attempts fall back to the broad spawn band, preserving FIFO progress and accepted counts. Ordinary bulk Demo deployment retains broad bands. Partial batches combine their actual counts; recent record IDs suppress replayed visual effects after reconnect. Late or overflowing cosmetic presentations never change simulation or reward totals.

## Round changes and slow loading

Round IDs scope the native presentation. On a new round, active gift cards, queued notifications, nameplates and pending/active portals are returned to their existing pools immediately. This does not change the authoritative summon queue: previously accepted units still waiting for a slot carry over and get a new presentation only when actually deployed in the new round. Deployment records from a different round are ignored by the renderer.

A waiting summon wave expires five seconds after its server creation time, using a local monotonic deadline for the remaining lifetime. Loading models slowly or returning from a hidden tab cannot restart an expired portal. The regular notification queue still combines/drains normally within the current round; accepted gifts, units and contribution accounting are not removed by cosmetic expiration.

Browser regression coverage first reproduced the old-round card leak, then verifies twelve distinct queued notifications are cleared at a round boundary, a fresh gift can reuse the card pool, and delaying an actual MushroomKing model response does not replay an old wave after loading. Repeated server snapshots still count the gift once, and the actual summoned soldier plus four defenders remain present. [Fresh-round capture](docs/native-summons/fresh-round-1080x1920.png) and the browser reports below record the checks.

## Presentation and budgets

- Right-side fantasy notification: existing Grok frame PNG, circular avatar (initials fallback), username, gift image/icon and ×N. Slide/flash, short glow, fade. Two DOM cards reused; pending queue capped at 24, repeated viewer/team/gift entries combine. Extreme overflow combines into an explicitly labeled Gift storm summary.
- Army summon: red/gold or cyan/blue ground rings and rising motes, 1.7-second life. Floating avatar/name/type/count label follows the living deployed cohort and rises/fades. At most four labels are visible, outside the top HUD safe area.
- Dragon summon: elemental vertical portal, expanding pulse, particles and 0.65-second model reveal. Actual imported rigs play flying clips and travel through the authoritative simulation. Frost remains blue and Fire red regardless of faction; the ground ring identifies the sender-selected team. At most two dragon portals are active.
- Shared RingGeometry and low-poly particle geometry use two InstancedMesh draw calls, capped at 16 rings, 240 summon particles and eight active waves. There is no per-soldier emitter, additional light or postprocessing bloom. Cosmetic priority applies only to the limited portals, never deployment order.
- Dragon breath comes from the animated Head bone; existing capped elemental particles accompany authoritative area damage/ice slow. Each castle retains exactly two stationary Mushroom Kings; real staff animation and pooled magic projectiles accompany actual enemy damage.

Available original animation clips, CC0 source licenses, immutable ZIP hashes and exact monster paths are in [MONSTERS.md](MONSTERS.md). The models have no dedicated breath clip; Headbutt supplies attack motion. Owner-supplied LIVE IDs **13604** (Fire) and **6646** (Frost) await actual connector catalog/event confirmation before auto-enabling. Demo Lion is simulated, and ID 6646 is not assumed to be Lion.

## Verification

83 server unit tests pass. Running-app Chromium/SwiftShader and Linux WebKit/llvmpipe checks verify avatar/icon delivery, ×3 gifts versus 15 actual troops, correct nameplate, run state, rapid notification combination, portal limits, public Demo Lion/Dragon buttons and absence of video elements/requests/errors. Separate monster browser checks verify all three textured meshes and skinned vertex animation, flight, elemental attacks/slow, four defenders, visible staff projectiles and enemy HP reduction, while production writes remain protected.

Actual 1080 × 1920 captures and browser diagnostic reports:

- [Army summon](docs/native-summons/army-1080x1920.png)
- [Frost portal, RED allegiance](docs/native-summons/frost-portal-1080x1920.png)
- [Fire portal, BLUE allegiance](docs/native-summons/fire-portal-1080x1920.png)
- [Chromium diagnostics](docs/native-summons/chromium-report.json)
- [WebKit diagnostics](docs/native-summons/webkit-report.json)

These Linux software-renderer runs are not physical iPad Safari or a real TikTok broadcast. Existing measured monster stress samples and limitations are in MONSTERS.md. No physical before/after FPS claim is made. CI repeats both native-effect browsers and retains screenshots/reports as artifacts.

```sh
# Repository root
npm run setup
npm run build
npm test
cd live
node tools/native-summons-check.mjs
LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe WEBKIT_DISABLE_DMABUF_RENDERER=1 NATIVE_ENGINE=webkit node tools/native-summons-check.mjs
```

After pulling the default branch `feature/pixel-war-live`, restart the Codespace Node server and open Ports → 3000 → `/3d/`. On iPad, use the terminal trash icon to stop an old process, then run `npm start` from the repository root. A GitHub merge does not restart an already running private Codespace. The build marker says **NATIVE FX**, and an outdated backend without summon protocol version 1 displays a restart notice.

For a physical iPad check: send Finger Heart ×3, check ×3 and Small Soldier ×15, send Demo Lion for RED and Demo Dragon for BLUE, inspect the elemental portals/faction rings, watch wing movement and breathing, inspect both gates, then send rapid normal gifts and confirm the battlefield and touch camera stay responsive. Owner LIVE connection still requires real broadcast access to confirm the supplied IDs; public Demo has no admin token.

Files: `client3d/native-summons.ts`, `native-summons.css`; `src/summon-groups.js`; existing game/TikTok/profile snapshot and renderer adapters; `test/native-summons.test.js`; `tools/native-summons-check.mjs`; updated HUD regression checks, version marker and CI.
