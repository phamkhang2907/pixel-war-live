# PIXEL WAR 3D

See [FULL-3D-MIGRATION.md](FULL-3D-MIGRATION.md) for current gameplay, admin controls, gifting, audio, testing and limitations. This replaces the retired 2D setup instructions.

See [TEXTURED-GRASS.md](TEXTURED-GRASS.md) for the licensed PBR terrain maps, before/after screenshots and measured rendering costs.

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
