# PIXEL WAR 3D: continuous army warfare and original audio

This change extends `live/`. It retains the existing Three.js/Vite renderer,
KayKit models and GPU animation LOD, Quaternius monster rigs, Kenney effects,
fortresses, lighting, terrain, camera, fantasy HUD, Socket.IO and owner sessions.
Original uploaded archives are unchanged. No video summon overlays are used.

## Rules and configuration

`src/warfare.js` centralizes validated settings. Owner → Army / HEART WAR / Flyby
settings applies changes to the next round. Round duration remains under Round
settings. Defaults are:

- 600 simulated seconds, no preparation delay, final 30 seconds, then seven wall
  seconds of results. Castle HP is 500,000 for each side.
- 150 free troops per side: 90 Small, 30 Heavy, 20 Archers and 10 Mages.
  Both armies have the same composition. These units have no viewer names, IDs,
  summon notifications or contribution awards. Four existing gate Mushroom Kings
  remain, two per castle. No default dragons.
- Initial troops start in seeded, broad organic depth bands close to the middle
  and immediately advance. Existing separation/spatial hashing/FIFO are retained.
- Every 15 simulated seconds, if either baseline army is below 70, add the same
  composition of 20 reinforcements to **both** sides, up to a baseline cap of 240.
  Capacity/space must permit both additions. Viewer units are never removed or
  transferred to balance the battle. The numerical advantage viewers earned is
  preserved. Settings can disable this system.
- Winner: remaining castle HP, then actual valid battle damage score, then total
  enemy kills, then draw. Destroying a castle ends the round early. Results use
  that round's frozen contributor list and appear once, including after reconnect.
  RAF and lightweight animations continue. No synchronous result wait or new
  model download is needed at round end.

One-time migrations back up earlier league/gift configuration, update the old
300-second/30-second preparation defaults and Rose count of one, and preserve
custom settings, player records and history. A migration marker prevents the
same defaults being reapplied on every restart.

## Real comments, likes and gifts

The installed connector is `tiktok-live-connector` **2.5.0**, whose installed
runtime decodes **v3** protobuf messages. Adapter tests encode a v3 packet and
pass it through the installed SDK decoder before ingestion. Older v2 aliases
remain supported.

- v3 user: `user.id`, `nickname`, `displayId`; v2: `user.userId`, `uniqueId`.
- v3 like: `count` is the packet delta; `total` is the room cumulative total.
  v2 aliases are `likeCount` and `totalLikeCount`. Stable message ID:
  `common.msgId`. Zero/missing IDs or unidentified viewers are not credited.
- v3 gift metadata is `gift` (`name`, `type`, `diamondCount`, `image.urlList`);
  v2 `giftDetails` still works.

Recognized exact comments are accent/case/whitespace normalized: đỏ/do/red/team
red/phe đỏ and xanh/blue/team blue/phe xanh. Existing 1/2 commands still work.
Other sentences do not silently choose a team. Membership and the configurable
60-second switch cooldown are server-side; a comment alone never spawns troops.
Replayed comment IDs cannot undo a later team selection.

Every ten accepted attributable likes enqueue one Small Soldier. Remainders
carry across packets within the round, reset at the next round, and are stored
per stable viewer ID. **Likes received before team selection are discarded** and
are not credited retroactively. The room total never creates attributed units.
A repeated message ID cannot create another reward, including after reconnect.
Busy LIVE rooms may omit/aggregate like events; missing per-viewer data cannot
be reconstructed. Diagnostics report rejected/unattributed packets rather than
inventing senders or deriving viewer likes from a room total.

Rose is five Small Soldiers per completed gift. Existing other editable mappings
remain. Completed streak/group IDs are deduplicated; accepted requests retain
FIFO sequence numbers, metadata and exact quantities while bounded deployment
and capacity limits apply backpressure. Late gifts wait for the next round and
do not modify the frozen result. Unjoined senders receive a team-selection
error; no random team is selected.

Each viewer unit carries sender ID/name/avatar, allegiance, source, spawn time,
quantity/request quantity and round ID. Shared nameplates/notifications have
bounded pools; default armies never create these overlays.

## HEART WAR, bombing and temporary dragons

A phase lasts 60 simulated seconds. Each team can trigger one raid when its own
valid likes first reach 300. Five warning zones precede staggered impacts by
about two seconds. Damage is server-authoritative, enemy-only, and does not hit
castles. Warning deadlines are in snapshots, so reconnects do not lose them.
The phase leader receives 10% attack haste for ten seconds; ties receive none.

Every dragon is now a **single nine-second flyby**, not a permanent army unit.
Two simultaneous live flybys are allowed by default. Further accepted summons
remain FIFO queued rather than disappearing. Real Dragon/Dragon_Evolved meshes,
SkeletonUtils clones and Fast_Flying animation remain in use. Element color is
independent from the sender's team. A pass deals configurable high enemy area
damage; fire leaves attributed burn damage over time, frost slows both movement
and attacks. Exit removes the unit without counting a false kill. Native portals,
flames/embers/smoke, ice particles, ground marks and breath are budgeted.

Dragon Flame **7610** is a pending configured ID: it activates only on native
LIVE metadata. Lion's ID is never guessed; the exact Lion catalog/event identity
binds its frost mapping. Previously owner-supplied 13604/6646 remain separate,
metadata-verified mappings; 6646 is not relabeled Lion. Demo metadata cannot
verify production mappings. No real broadcast was available to verify these
bindings against TikTok during local development.

## Three supplied MP3s

All originals are in `assets/audio/`, unchanged. The build checks SHA-256 and
copies them to `/assets/audio/` for the browser:

| File | Actual gameplay cue | Duration |
| --- | --- | --- |
| war-horn-01.mp3 | Once on a newly started round after sound is enabled; no stale horn replay mid-round | ~3.34 s |
| phatphrogstudio-dragon-voice-roar-477831.mp3 | Fire dragon appearance | ~8.99 s |
| dragon-studio-epic-dragon-roar-364481.mp3 | Frost dragon arrival | ~3.45 s |

Animation and authoritative movement never wait for audio completion. Muting,
pausing, reconnecting or duplicate gift snapshots do not add another arrival
cue. Old voices are stopped between rounds. Enabling sound late does not replay
old summons. Browser autoplay restrictions can prevent the horn on the initial
page load until the visitor enables sound; this does not hold up gameplay.

`assets/audio/uploaded-manifest.json` records upload names, hashes, individual
source/license evidence and exact source-byte matches. The horn is Sfxmint
CC0-1.0. The two roars use the Pixabay Content License, **not CC0**. See
`assets/audio/LICENSE-SOURCES.md` for artist/source/terms. Original synthesized
WAVs keep their existing MIT license. Added battle cries are synthesized vowel
calls, not recordings of real armies or licensed human performances.

The shared Web Audio manager preloads and decodes 32 reusable sounds, has twelve
pooled voice channels, master/music/SFX volume, mute, a compressor, limited
panning/distance attenuation and music ducking for major attacks. Safari resumes
AudioContext directly from the Enable Sound tap. It does not allocate an audio
object for every soldier attack. New original synthesized cues cover team cries,
crowd ambience, bomb warning/explosion, wings, breath, frost wind and shatter.

## Demo and security

Public `/3d/?demo=1` uses an isolated in-memory arena and rankings. Join buttons,
10/300-like tests, Rose, both dragon gifts and a bombing raid require no admin
token. A stable HTTP-only Demo cookie supplies identity; the user chooses the
Demo display name. Inputs, duplicate IDs, request origin and rates are checked.
Demo contributions never enter production weekly/monthly/session rankings.

Production LIVE connection, warfare/gift configuration and battle controls remain
protected by the existing owner HTTP-only session or server-side bearer auth.
No secret or visible manual admin-token field was added to the public game.
The protected dashboard lists team memberships and per-viewer like remainders.

## Verification and running

From the repository root:

```sh
npm run setup
npm run build
npm test
npm start
```

Forward port 3000 in Codespaces → Ports → Open in Browser. Public Demo is `/3d/`;
production viewing is `/3d/?live=1`; sign in through Owner for privileged controls.
A `github.dev` editor URL is not the forwarded game URL. On iPad, restart the
terminal process with the terminal trash/stop control, create a new terminal,
and run `npm start`; no Ctrl+C keyboard is required. A GitHub merge alone does
not restart an already running Codespace or deploy a separate hosted server.

Automated checks:

```sh
npm test
node tools/warfare-check.mjs
WARFARE_ENGINE=webkit node tools/warfare-check.mjs
node tools/audio-check.mjs
```

The warfare browser test loads real models and exact MP3 URLs/hashes, unlocks
sound, checks decoded durations and nonzero Web Audio output, exercises actual
bombs/flybys and cleanup, runs a full default 600-second simulated round at 8x
server Demo speed, checks seven **wall** seconds of results, then public Demo
likes/Rose/duplicate protection and production isolation. It captures 1080×1920
stream-composition screenshots and machine-readable reports in `artifacts/`.
Regression geometry/control tests explicitly disable baseline armies in saved
owner settings so their isolated unit counts remain meaningful. The separate
warfare test verifies unchanged production defaults with 300 free soldiers.

Local automated browser engines are Linux Chromium/SwiftShader and Linux WebKit
with touch emulation. Software-rendering FPS is **not** a Windows GPU or physical
iPad Safari benchmark. Real speaker output/autoplay and real LIVE connectivity
still need device/broadcast tests. Inspect the generated reports for measured
unit count, resolution, frame rate, draw calls, memory and any browser errors.

On a physical iPad, enable sound with a tap, adjust/mute/unmute all mixers, send
both Demo dragon gifts on the same selected team, verify their separate roars
and nine-second exit, test one-/two-finger camera gestures, and check that the
next-round horn is heard once. Check the HEART WAR 300-like warning/raid and
that the results panel automatically opens, counts down and closes. No physical
iPad performance or successful real TikTok connection is claimed here.
