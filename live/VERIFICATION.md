# Automatic rounds and persistent rankings — verified 2026-11-05

Branch `feature/pixel-war-live`, existing repository `/workspace/pixel-war-release`.

| Actual verification | Result |
|---|---|
| `npm run build` | PASS, backend syntax + Phaser/Socket.IO client, Safari 15+ target, 12 sprite sheets |
| `npm test` | **39 PASS**: 26 existing combat/energy/connector regressions, 12 round/merit/storage tests, 1 real server restart test |
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
