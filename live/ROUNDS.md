# Automatic rounds, merit and persistent rankings

## State machine / server clock

Default: **prepare 30s → combat 240s → final 30s → results 15s → countdown 5s → next prepare**. The first three phases total 300 seconds. Socket.IO `state.roundState` includes phase, authoritative remaining time, per-phase remaining time, round UUID/number, result, boards, session and season. Client renders these values; no client timer determines a winner. Server uses monotonic elapsed time, so delayed timer callbacks do not stretch the configured round. Demo speed scales all round phases; LIVE forces 1×.

During prepare, comments select teams, gifts/likes can assemble armies, but units/projectiles do not move or deal damage. Like-triggered Fury/rain are queued until combat; their owner ID is preserved. Once a player contributes, that player's team is locked for the round. Team selection survives into the next round, where a new comment can change it before contributing. A viewer who merely chose a team must participate/comment again in a later round to be registered for that round's victory reward.

Final Battle has an illuminated border, pulsing vignette and highlighted phase banner (respects reduced-motion). It does not silently modify troop stats. A destroyed castle ends combat immediately. On timeout compare castle HP, then **actual total unit + castle damage**, then draw. Overkill is excluded; shields reduce credited damage. Castles can heal, so accumulated damage and remaining HP are distinct measures.

Results display winner/draw, each team's damage, summoned count, remaining castle HP and **Top 10 by merit**. Inputs that summon/grant rewards close during results/countdown. Results are frozen before awards/history are persisted, preventing duplicate wins. Auto countdown starts another round without a TikTok connection. The countdown is separate from the configured match duration.

Admin settings (Stream setup): total, prepare, final, results and countdown seconds; season ID. Main combat = total - prepare - final and must be positive. Saved settings apply to the next round. **Start new round** or **Reset Battle** archives an in-progress round as interrupted, preserves earned merit, gives no win/draw bonus and begins a new round. Pause is retained until Resume. **New LIVE session** creates a fresh session board while preserving old sessions and seasons. It does not delete data.

**Demo full cycle · 12s** sets 2s prepare, 7s main, 3s final, 3s results, 1s countdown, saves that config, and starts a round. The preset forces speed 1× so each phase can be observed. Restore timings manually to 300/30/30/15/5 when finished testing.

## Merit rules / ownership

| Event | Merit |
|---|---:|
| Successfully spawned unit | +5 per actual unit, not per attempted summon |
| Enemy unit last hit | +10 |
| Each full 100 actual castle damage by the player in this round | +20 |
| Participated in damaging an enemy War Titan that dies | +50, once per boss per user |
| Registered for the winning side in this round | +30 |

Boss killer also receives the participation bonus. Several units owned by the same viewer do not multiply one boss assist. Fractional castle progress accumulates within the round: 60 + 60 + 85 actual damage = 205, worth 40 merit; a new round starts a new 100-damage counter. Unit damage counts toward the team damage tiebreak but does not independently award merit. Draws grant no +30. Spawned units beyond the 300-unit cap grant no summon merit.

All unit, projectile and AoE paths retain `userId`, name and team. A projectile can earn damage/kill credit after its owner unit dies. Like-reward units/skills belong to the user whose event crossed the milestone. Non-viewer initial Founders are system units, included in team totals but not awarded player merit. Demo IDs are namespaced by side and provided user ID/name; real connector IDs come directly from TikTok.

An internal event ID and per-round award ledger deduplicate spawn/damage/kill/result awards. Boss contributor maps deduplicate assistants. TikTok message receipts are persisted with league data so reconnect/restart cannot re-award an already processed identified gift/like. Exact deduplication cannot be guaranteed for upstream messages with no stable ID. Arbitrary manual Demo clicks are new actions and intentionally create new units/merit.

## Three boards / achievements / history

- **Round**: current round only; becomes the frozen Top 10 result.
- **LIVE session**: accumulates rounds and survives process restarts. Admin explicitly starts a new session.
- **Season**: accumulates across sessions and restarts; default ID is the month when storage was first created. Admin chooses a new season ID when desired; there is no automatic calendar rollover and old seasons are preserved.

Sort: merit, wins, castle damage, stable user ID. Identical display names remain separate players. Stored stats include points, summons, kills, unit/castle damage, boss assists, wins/losses/draws, completed rounds and achievements (First Blood, Titan Slayer, Army Commander, Siege Master, Ten Victories). Joining alone has zero merit until a qualifying action or a victory.

Each archived round stores its unique ID, number, timestamps, session/season IDs, outcome/reason, HP, damage, summons and all participant stats. UI shows the last 10 rounds. Authenticated `GET /api/history?offset=0` pages through complete history, 20 rounds per page with Top 10 summaries. The file retains all participants/history, not just the displayed leaders.

## Durability / recovery

`live/data/league.json` (or `$DATA_DIR/league.json`) stores scopes, history, receipt IDs, current round ledger and saved timing config. Backend uses write-to-temp → fsync file → atomic rename → fsync directory. Updates flush at the end of each accepted Admin command and each simulation tick that changes stats; SIGTERM/SIGINT flush before shutdown. Points, receipts and the completed outcome are written in the same atomic snapshot.

A restart archives a persisted unfinished round as `server_restart`, with the latest checkpoint HP/elapsed time and **no** fabricated winner. A completed round already in history is not archived twice. A new round begins; session and season scores are retained. Battles themselves do not resume mid-animation. JSON corruption is reported at startup, never silently overwritten with empty standings.

An abrupt OS/power kill before a tick's flush can lose the last unflushed events (normally <= one 50ms tick). Atomic snapshots protect the previously committed data, not an event that has not yet reached disk. Storage is single-process; do not run multiple servers against one DATA_DIR. Large seasons require a database migration because the JSON snapshot/history are rewritten together. Back up DATA_DIR. In Codespaces the workspace data survives server/container restarts, but deleting the Codespace deletes its local disk; use a persistent mounted volume/backup for production. Store data outside the served `dist/public` directory.

## Tests

`npm test` includes deterministic tests for all phase boundaries, HP/damage/draw tiebreaks, early destruction, pause, reset/abort, duplicate awards, exact 100-damage increments, boss assistants, projectile ownership, season/session isolation, corruption refusal and receipt replay across reload. A separate test actually starts, SIGTERMs and restarts the Node server using one temporary DATA_DIR and verifies merit/draw/history survival.

`npm run test:browser --prefix live` runs the existing combat tests plus a shortened complete round, visible Final Battle, Top 10 draw results, result pause, countdown/new UUID, a second Socket.IO client's synchronized board/timer, history and scope selection. No test-only endpoint forces a winner or modifies HP.

When the process is stalled for a long time, a single advance simulates at most 20 seconds of physics catch-up; the authoritative round clock still advances by elapsed time. This bounds recovery work and is not a deterministic replay of a stalled server.
