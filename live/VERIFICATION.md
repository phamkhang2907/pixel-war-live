# Vertical LIVE battle — verified 2026-11-05


Current design: real **1080×1920** Phaser canvas, world **4800×2400**, 15 ranks with projected depth, a 924×1040 middle world camera, fixed HUD and TikTok/webcam safe regions. No landscape canvas rotation.

| New actual verification | Result |
|---|---|
| `npm run build` | PASS, includes CameraDirector syntax and 768-frame atlas validation |
| `npm test` | **50 PASS**: 39 existing gameplay/round/persistence tests + 11 director/formation tests |
| `npm run assets:check --prefix live` | PASS: all 96 animation rows remain animated; all 768 atlas crops exactly match source sheets |
| `npm run test:vertical --prefix live` | Chromium PASS: true canvas dimensions, balanced 300-unit battle, both siege directions, Boss, overview, touch minimap, fixed HUD, phone/iPad layout, pool reuse and no page/asset errors |
| WebKit vertical browser check | PASS same camera/layout scenarios, Linux headless; not physical Safari |
| Existing full browser regression | PASS combat, real siege victory, gifts/likes, round cycle, rankings, two-client sync and 9:16 overlay |
| Existing round timing form / Top10 mobile test | PASS after re-layout; all 10 result rows still fit at 390px |
| Chromium presentation sample | ~57–59 FPS, 2s sample beginning with 300 active units (about 287 survive sample); p95 17–33ms |
| Linux WebKit presentation sample | ~19 FPS Canvas; software WebGL ~9.5 FPS. Functionality passes, performance remains a limitation |
| Director selection | Mixed clash beats 250 idle one-team units; DPS, both pressure directions, Guardian/Mage/Titan emphasis, hysteresis, full map bounds and zoom-rate checks PASS |

The software-WebGL Chromium baseline was ~6.6 FPS; identifying that path and using Canvas produced ~57 FPS. Ground shadows were converted from per-frame ellipse geometry to pooled textures, all character bodies share one atlas, and crowded FX/text budgets are bounded. Mobile min-content overflow was found and fixed with a single-column control layout at narrow widths. Final tests also verify viewport-fixed castle HUD across camera movements.

**Not claimed:** 1000-unit support, 60 FPS on Safari iPad/OBS hardware, or long-duration thermal stability. Hard server cap remains 300. Linux WebKit software performance is not adequate evidence of stable 300-unit iPad rendering. See CAMERA.md for reproduction, renderer overrides, safe-region dimensions, what tactical overview covers, and limits.

The prior automatic-round checks below remain regression coverage:

Branch `feature/pixel-war-live`, existing repository `/workspace/pixel-war-release`.

| Actual verification | Result |
|---|---|
| `npm run build` | PASS, backend syntax + Phaser/Socket.IO client, Safari 15+ target, 12 sprite sheets |
| Prior round test subset | 39 cases retained: 26 combat/energy/connector, 12 round/merit/storage, 1 actual restart |
| Default phase cycle | 300s = prepare30 + combat240 + final30; results15 + countdown5 + next prepare |
| Timeout | HP tiebreak → actual unit+castle damage → draw, all three outcomes tested |
| Early destruction | Immediate results; further damage rejected; only one history record / win reward |
| Merit | Actual summon +5, kill +10, full castle-damage hundreds +20, unique boss helper +50, winning participant +30 |
| Ownership | Shooter death does not lose projectile credit; Like units/skills retain triggering user; duplicate display names remain separate IDs |
| Deduplication | Repeated spawn/death/result awards do not reapply; persistent TikTok receipts reject replay after restart |
| Manual controls | Pause stops phase/result timers; reset aborts without awarding a winner; settings apply next round; session/season isolation |
| Disk reload | In-progress recovery archives interruption, retains earned scores; completed history not duplicated; corrupt JSON rejected |
| Actual Node restart | Start → finish a real timed round → SIGTERM → restart same DATA_DIR: merit, draw count, LIVE/season boards, session ID and single history result retained |
| Chromium E2E | PASS: existing combat + short timed cycle, visible final phase, draw Top10, pause, countdown, automatic new UUID |
| WebKit E2E, Linux headless | PASS same flow, including two Socket.IO clients with identical boards/result timer |
| Admin timing UI + mobile result | PASS: edit timing form → save → start → final → draw; all 10 rows fit without scrolling at 390px |
| Legacy gameplay | Existing full-siege actual server timer, 300-unit cap, gift/like/Fury, mapping, anti-air, camera, pause and API token regression checks remain passing |
| Layout | 1440×1200, 820×1180, 390×844; no horizontal overflow, overlay canvas 9:16, no pageerror |

Tests use temporary DATA_DIRs and isolated ports; no LIVE account or forced-winner test endpoint. Browser proof images in `live/artifacts/`: `chromium-final-battle.png`, `chromium-round-results.png`, WebKit equivalents, `round-ui-final.png`, `round-ui-results.png` (gitignored).

Storage: atomic JSON snapshot with fsync/rename/directory fsync. Changes flush after commands and changed simulation ticks; clean shutdown flushes. Abrupt power/OS kill before flush can lose the current uncommitted tick; already committed season state is preserved. Single writer only. See ROUNDS.md for volume/backup, checkpoint and restart behavior.

The 300 mixed-unit CPU benchmark is about 1.6–1.9s for 600 ticks on this executor; it excludes persistence I/O and is not an iPad FPS claim. Existing art metadata remains 12 × 512×512 PNG, 64×64 frames, 96 animated rows.

Not verified: physical iPad Safari, real TikTok LIVE/signing service, thousands of viewers, multi-process storage, remote GitHub CI/deployment. This update did not create a repository or push to an unconfigured remote. Local preview runs at port 3000.
