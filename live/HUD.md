> Historical HUD assembly report. Current routes, results, unit names and tests are documented in [FULL-3D-MIGRATION.md](FULL-3D-MIGRATION.md). The 2D fallback below is retired.

# Grok battle HUD

The `/3d/` dashboard uses the supplied `assets/ui/UI KIT.zip`, not replacement CSS frames. The existing battlefield, character renderer, camera, fortresses, combat rules and `/legacy/` client are unchanged by the HUD implementation.

## Assets

`python3 tools/extract-ui-kit.py` is part of the normal build. It extracts all 15 PNGs, skips macOS metadata, and records dimensions, purpose and SHA-256 in `public/assets/ui/kit/manifest.json`. The publicly served originals are byte identical to the ZIP, including their alpha channels. No Pillow installation or format conversion is needed. Inline SVG viewports select regions of those same original URLs; they do not re-encode or duplicate the files.

| PNG | Inspected content / use |
| --- | --- |
| IMG_4974.PNG | Titan helmet, title and central score plate |
| IMG_4976.PNG | Compact ornamental statistics and scoreboard frame |
| IMG_4977.PNG | Red health fill |
| IMG_4978.PNG | Gold connector frame, timer, player strip and ranking tabs |
| IMG_4979.PNG | Gold, silver and bronze badges; extracted for future awards |
| IMG_4980.PNG | Blue health fill |
| IMG_4981.PNG | Coins and reward chest used in summon notice |
| IMG_4982.PNG | Player avatar ring |
| IMG_4983.PNG | Purple-flame gift/summon notification frame |
| IMG_4984.PNG | Blue eagle, nameplate and health surround |
| IMG_4985.PNG | Tall empty border; extracted for additional panels |
| IMG_4986.PNG | Red lion, nameplate and health surround |
| IMG_4987.PNG | Crowned Top 10 panel with native numbers and portrait rings |
| IMG_4988.PNG | Alternate versus board; extracted for future layouts |
| IMG_4989.PNG | Nine-row alternate ranking artwork; extracted for future shorter lists. All Top 10 periods use IMG_4987.PNG |

The red and blue card interiors have different dimensions. Their crests, nameplates and HP sections are selected separately and assembled on one symmetric grid. The 1080 × 1920 layout scales as one structure, with its collapsed header ending at 670px (34.9% of the portrait). Expanded rankings temporarily cover the center and can be closed. The supplied Douyin screenshot informed the central crest, flanking faction panels and compact troop table; no inaccessible video was analyzed, and platform chat/controls are not reproduced.

## Live data

- Total and faction scores use existing `teamScore` values, explicitly labeled **gift coins**. Contribution XP is separate.
- HP, round/countdown, army totals and all six troop counts use the battlefield's Socket.IO snapshot. Counts include living units only.
- Each faction shows three actual contributors. HTTPS avatars from native TikTok user metadata persist in the existing league file. Missing/failed portraits show initials; empty slots invite viewers to join. No fake viewers are injected into LIVE mode.
- Round Top 10 uses current contributions. Weekly rankings start Monday 00:00 UTC; monthly rankings start on the first at 00:00 UTC. Completed rounds are allocated by their end date; the unfinished round is included provisionally. Aborted and duplicate rounds are excluded. Results depend on retained match history, not season totals.
- Recent gift/summon and Fury events populate the lower notification frame. Demo mode is explicitly labeled **DEMO · SIMULATED VIEWER EVENTS**.
- Admin actions retain token authorization. Visible leaderboard buttons are read-only.

## Codespaces / iPad

Check out the HUD branch, then run from the repository root:

```sh
npm run setup
npm start
```

Open forwarded port **3000** using Codespaces **Ports → Open in Browser**. Routes: `/3d/` for game/camera/demo controls; `/3d/?overlay=1` for portrait capture; `/3d/gallery.html` for models; `/legacy/` for the original 2D game. On iPad open the forwarded HTTPS URL in Safari, not the iPad's localhost. No keyboard shortcut is needed. These commands do not create a public deployment URL.

Unlock Demo controls using the existing server admin token. Simulate gifts for both teams and check scores, HP, troop counts and the summon banner. Tap Top 10, Weekly and Monthly, then × to close. Rotate the iPad, check the HUD stays inside the portrait stage, and try camera buttons/touch controls with rankings closed. Open `/legacy/` to check the fallback.

## Verification

```sh
npm run build
npm test
cd live
node tools/hud-check.mjs
node tools/browser-check.mjs
```

The HUD check runs an isolated server/data directory, generates demo events through the authenticated API, and checks actual Socket.IO scores, all 12 troop counts, avatars, expandable boards, gifts, 35% header height, mobile bounds and absence of page errors/HTTP failures. It writes `artifacts/grok-hud-1080x1920.png`, round/weekly/monthly/gift captures, 390px and 820px captures, and `artifacts/hud-report.json`.

Captures use Linux Chromium / SwiftShader, not physical iPad Safari. Real TikTok connectivity and device FPS still require LIVE/device testing. The original PNGs total about 20 MB, so initial download cost remains significant; shared URLs are cached without embedded duplicates.

Origin: user-supplied Grok UI ZIP, with no separate license text inside. These images are not KayKit/CC0 assets. See THIRD_PARTY.md.

## Captured result

Verified on 2026-11-05 in Linux headless Chromium 155 / SwiftShader. Production build, 56 tests, HUD browser checks and original 2D browser checks pass. The HUD browser run reports no JavaScript exceptions or HTTP failures. These are actual browser captures with labeled demo events, not design mockups.

[1080 × 1920 assembled HUD](docs/hud/grok-hud-1080x1920.png) · [Expanded round Top 10](docs/hud/grok-hud-round.png) · [Monthly ranking](docs/hud/grok-hud-monthly.png) · [390px mobile view](docs/hud/grok-hud-390.png) · [Machine-readable browser report](docs/hud/hud-report.json)

The alternate ranking PNG contains nine slots. The final implementation uses the supplied crowned ten-slot image for round, weekly and monthly rankings to keep all ten rows aligned without seams or duplicate rank numbers. Initial captures also exposed the old native meter appearing above the illustrated HP bar; it is now hidden, leaving the actual kit HP artwork and server-driven fill visible.
