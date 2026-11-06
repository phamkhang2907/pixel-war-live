Newest monster update: [Dragon gifts and Mushroom King defenders](MONSTERS.md). This documents the exact three-model extraction, owner-supplied gift IDs and remaining LIVE/iPad verification.

# PIXEL WAR 3D

Current public Demo, native owner login, free camera, PBR grass and fast spawning: [MAJOR-LIVE-UPGRADE.md](MAJOR-LIVE-UPGRADE.md). This supersedes the previous camera, terrain and browser-token instructions.

See [SWARM-SYSTEM.md](SWARM-SYSTEM.md) for current organic armies, FIFO summons, GPU character animation, capacity limits and admin background-music uploads. Its behavior supersedes the older formation/capacity notes below.

See [FULL-3D-MIGRATION.md](FULL-3D-MIGRATION.md) for current gameplay, admin controls, gifting, audio, testing and limitations. This replaces the retired 2D setup instructions.

See [STYLIZED-ENVIRONMENT.md](STYLIZED-ENVIRONMENT.md) for the current moss-green low-poly terrain, instanced KayKit scenery, screenshots and measured rendering costs. This supersedes the earlier photorealistic grass treatment.

From the repository root:

```sh
npm run setup
npm start
```

Open forwarded port 3000 in Codespaces, then `/3d/`. `/admin` opens the 3D admin token form. `/3d/?overlay=1` is the portrait capture surface; `/3d/gallery.html` inspects real models. `/legacy/` returns 410.

`ADMIN_TOKEN`, `PORT`, `DATA_DIR` and optional `EULER_API_KEY` are server environment variables. No TikTok signing key is needed for Demo Mode. Keep DATA_DIR persistent. See `.env.example`; Node does not automatically load it unless you use the documented `--env-file` option or set environment variables through your host.

Build and tests:

```sh
npm run build
npm test
cd live
node tools/gameplay-check.mjs
node tools/three-check.mjs
node tools/model-check.mjs
node tools/hud-check.mjs
node tools/fortress-check.mjs
node tools/audio-check.mjs
node tools/terrain-check.mjs
```

Install browser test engines with `npx playwright install --with-deps chromium webkit` from `live/` when required. Browser results are headless Linux measurements; physical iPad Safari still needs a device test.

Native gift portals and notifications: [NATIVE-SUMMONS.md](NATIVE-SUMMONS.md).
