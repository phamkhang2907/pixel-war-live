# Dragon gifts and Mushroom King castle defenders

This feature extends the existing 3D renderer, authoritative combat, FIFO summons, public Demo arena and owner session. It does not replace the armies, castles, terrain, HUD artwork, audio, rankings or LIVE connector.

## Exact asset allowlist

`tools/extract-monsters.py` reads the **already committed** source archives. It never downloads, uploads, recreates or repacks either ZIP. Runtime files are byte-for-byte copies of the three selected glTF entries, plus their original CC0 license and a generated provenance manifest. Every buffer/image is embedded in these particular glTF files; no format conversion, external BIN files or separately copied textures are required.

| Archive | Original SHA-256 |
| --- | --- |
| `live/assets/3d/Ultimate_Monsters_Flying.zip` | `aff8d4a76b671e0ff1f2a2655be6f32211e607a463f663074e89b93a7d157d4e` |
| `live/assets/3d/Ultimate_Monsters_Big.zip` | `0915b5f58f611793adabbaf116c131512a633eba8f78829888cb9e733cec28ac` |

| Runtime file under `live/public/assets/3d/monsters/` | Triangles | Bones | Source height | Normalized height |
| --- | --- | --- | --- | --- |
| `Dragon/Dragon.gltf` | 4,562 | 13 | 1.51045 m | 4.5 m |
| `Dragon_Evolved/Dragon_Evolved.gltf` | 7,440 | 46 | 2.83431 m | 5 m |
| `MushroomKing/MushroomKing.gltf` | 6,044 | 43 | 3.41542 m | 3.98 m |

Only these three monsters are present in the generated runtime directory. Existing KayKit assets remain. The bundled Quaternius license is **CC0-1.0 / Public Domain**, permitting commercial use and redistribution; `LICENSE.txt` and `manifest.json` are shipped alongside the models. The base Dragon is the original compact head-and-wings creature, while Dragon_Evolved has the larger developed body; neither is a placeholder or missing-body substitute.

## Models and animation

`MonsterAssets` uses GLTFLoader and SkeletonUtils.clone. Geometry/textures are shared; each active creature has its own skeleton, mixer and material variants. Normalization is based on the actual loaded bounding box, with the lowest model point placed at ground level. The flying root is 5.6 m above the battlefield.

- Frost uses Dragon and a blue material tint. Fire uses Dragon_Evolved and a red/orange tint. Original embedded texture maps remain applied.
- Body element and faction are separate. A team-colored 3D ring identifies allegiance: a blue Frost Dragon can fight for RED; a red Fire Dragon can fight for BLUE.
- Both dragons use original `Flying_Idle`, `Fast_Flying`, `Headbutt`, `HitReact`, `Death` clips. The pack has no dedicated fire/ice-breath animation: the actual Headbutt clip supplies the attack motion, combined with new breath VFX and server damage.
- MushroomKing uses original `Idle`, `Weapon` (staff motion), `HitReact`, `Death`; `Walk` is available in the inspector but defenders do not march.
- Death plays once over about 2.3 seconds before corpse removal. Animation updates are bounded to 15 Hz for distant mobile creatures, 30 Hz nearby. Normal armies retain their existing GPU animation/LOD pipeline.

A single-material mesh must retain a single material object: wrapping it in a material array without geometry groups prevents Three.js from drawing it. The importer preserves the original material shape; real rendered triangle checks and screenshots catch invisible meshes.

## Gifts and verified identity

The owner supplied these exact mappings during this task:

| Gift identity | Summon | Initial verification |
| --- | --- | --- |
| `13604` — owner label “Rồng lửa” | 1 Fire Dragon | Awaiting connector evidence |
| `6646` — owner label “Triệu hồi rồng băng” | 1 Frost Dragon | Awaiting connector evidence |
| Exact Lion / Sư tử metadata | 1 Frost Dragon | Lion ID learned from connector; **6646 is not assumed to be Lion** |

The IDs are user-provided configuration, not independently verified official IDs in this development session. No price is hardcoded. The existing `tiktok-live-connector` 2.5 already fetches available room gifts when `enableExtendedGiftInfo` is enabled. After a successful connection, that catalog is now ingested as metadata without awarding gifts, scores or troops. The configured ID slots auto-enable only when the native catalog or an actual gift event confirms that exact ID; the actual returned display name is recorded. Other dragon-themed gift IDs do not activate them. Lion's unambiguous exact name can bind its actual ID separately.

LIVE metadata persists through the existing asynchronous league storage. Demo metadata cannot verify an ID or overwrite LIVE evidence. Manual dragon mappings require an exact ID/name from the LIVE catalog, count 1 and no coin threshold. Keeping a verified ID and disabling its row is an explicit opt-out; `pendingVerification` is used only for slots intentionally waiting for connector evidence. Owner **Refresh observed gift metadata** reloads the server's current bindings.

No real broadcast was available in this session. `verifiedRealLiveIds` in the browser reports is empty. Mock connector catalog/event tests prove the code path and must not be mistaken for real TikTok verification. Unknown/unconfigured gifts do not award troops; configure/confirm premium mappings before accepting production gifts. The code preserves the existing final-streak receipt/group de-duplication and sender profile/team/contribution path.

## Public Demo

Open `/3d/`, then **Send Demo Gift**. The existing team/name panel now includes:

- 🦁 Lion → Summon Blue Dragon (`Demo Lion`).
- 🐉 Dragon → Summon Red Dragon (`Demo Dragon`).

Each button sends one simulated gift through the existing validated public endpoint, TikTokIngest, authoritative queue, monster combat and VFX path. Its synthetic event ID is never treated as a real platform gift ID. The selected team is preserved. Demo rankings and creatures stay in the separate `/demo` arena; no token is required. Owner controls, production LIVE connections, gift mappings and configuration remain protected.

## Combat and castle defense

Exactly two Mushroom Kings are created for each castle when RoundManager starts a round. They stand outside the gate at world X ±37.8 m, Z ±3 m, one on each side. They do not consume summon FIFO sequence numbers or give anyone summon XP. Their two-per-team count appears in the existing Gate Kings HUD row.

Defenders remain at their home positions, face nearby enemies, play the staff clip, launch visible pink/purple (RED) or cyan (BLUE) projectiles and deal authoritative damage on projectile arrival. They cannot target allies or the opposing castle and cannot be selected as gift summons. They can die and are recreated at the next round. Stop/Ready/Pause freeze combat through the existing state machine.

Dragons fly toward eligible enemies/the opposing castle. After a visible wind-up, each breath deals area damage using simulation rules. Frost adds a three-second movement slow (55% speed), refreshed by later valid hits; Fire has the same base damage/area and no slow. Ground-only melee cannot target flying dragons. Dragon ownership remains the sender's selected team and damage/kills use the existing contribution accounting.

Balance settings live in `src/characters.js`: dragon HP 2,200, damage 100, cooldown 2.6 s, area radius 170 server units; King HP 1,400, magic damage 45, cooldown 1.8 s, range 520. These are game balance settings, not gift prices.

## Budgets and validation

At most twelve dragons (including their brief death lifecycle) occupy active slots; accepted excess summons remain in FIFO rather than being dropped or reordered. Four automatic defenders have reserved capacity alongside the existing 1,000 / experimental 2,000 summons. Mixers are pooled; breath VFX use one capped 220-instance particle mesh and King projectiles use a capped 64-instance mesh. Cosmetic particles do not determine damage. No new individual physics bodies or grass/environment changes are introduced.

The local unit suites pass 79 tests. Browser checks use actual Chromium/SwiftShader and Linux WebKit/llvmpipe, including all three textured meshes, independent skeletons, per-model animated vertex motion, Demo buttons, duplicate retries, team independence, movement, breath/slow, gate projectiles/damage, production isolation and rejected public administrative writes. The gate capture freezes a real in-flight projectile through the owner Pause control for inspection. Screenshots are running-app captures, not mockups:

- [All three original models](docs/monsters/gallery.png)
- [Public Demo flight](docs/monsters/demo-flight-1080x1920.png)
- [Fire/ice attacks](docs/monsters/breath-1080x1920.png)
- [Two RED gate defenders and magic](docs/monsters/gate-1080x1920.png)
- [Chromium report](docs/monsters/chromium-report.json) / [WebKit report](docs/monsters/webkit-report.json)

The reports include an eight-second software-GPU sample with 214 total units (208 soldiers/targets, 2 dragons, 4 defenders), FPS, frame window, draw calls, triangles, buffer dimensions and JS heap where available. Recorded samples: Chromium 1.61 FPS, WebKit 4.99 FPS, each at 120 draw calls and about 318k triangles. These are **not physical iPad benchmarks**; no controlled physical before/after FPS comparison was possible, so “no major iPad regression” remains unverified.

Important files: `tools/extract-monsters.py`; `client3d/monster-assets.ts`, `monster-units.ts`, `monsters.html`, `monsters.ts`; `src/monster-combat.js`, `characters.js`, `game.js`, `rounds.js`, `gifts.js`, `tiktok.js`, `tiktok-connection.js`, `server.js`, `public-demo.js`; existing renderer/type/HUD/admin adapters; `test/monsters.test.js`, `tools/monster-check.mjs` and regression/CI updates. Legacy isolated gift/scoring unit fixtures explicitly disable automatic defenders; the new tests exercise the production default of four defenders.

```sh
# Repository root
npm run setup
npm run build
npm test
cd live
node tools/monster-check.mjs
LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe WEBKIT_DISABLE_DMABUF_RENDERER=1 MONSTER_ENGINE=webkit node tools/monster-check.mjs
```

After updating a Codespace, restart its Node process and open Ports → 3000 → `/3d/`. `/3d/monsters.html` is the model inspector; `/owner/login` protects LIVE/admin controls. Merging GitHub code does not restart a private Codespace. On a physical iPad, inspect both dragon wings/animations, send both Demo gifts for each faction, inspect both gates, verify touch responsiveness/audio and record device/iPadOS/FPS with normal troops and multiple dragons. A real LIVE connection is still needed to independently confirm the supplied IDs and gift reception.
