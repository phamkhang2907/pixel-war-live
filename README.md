# PIXEL WAR 3D — RED VS BLUE

Current public Demo, native owner login, free camera, PBR grass and fast spawning: [live/MAJOR-LIVE-UPGRADE.md](live/MAJOR-LIVE-UPGRADE.md). This supersedes the previous camera, terrain and browser-token instructions.

A portrait Three.js + TypeScript fantasy battle game driven by an authoritative Node.js / Socket.IO simulation and TikTok LIVE events.

Current army behavior, animation strategy, FIFO guarantees and admin music uploads: [SWARM-SYSTEM.md](live/SWARM-SYSTEM.md).

- Game and admin: `/3d/` (the root `/` redirects here).
- Admin shortcut: `/admin` → `/3d/?admin=1`; existing server token required.
- Capture: `/3d/?overlay=1` (1080 × 1920 layout).
- Real KayKit model inspector: `/3d/gallery.html`.
- The former Phaser battlefield/dashboard is retired. `/legacy/` returns **410 Gone**.

```sh
npm run setup
npm start
```

In GitHub Codespaces open **Ports → 3000 → Open in Browser**. Use the forwarded HTTPS URL on iPad, not the iPad's localhost. Tap **Enable sound** to unlock audio. Admin actions require the token printed by the server; it is never stored in a URL or shipped to viewers.

[Current migration, round-results behavior, gift mappings, sound licensing, screenshots and verification](live/FULL-3D-MIGRATION.md)

[Original UI KIT inventory](live/HUD.md) · [KayKit fortress inventory](live/EXTENDED-FORTRESSES.md) · [Licenses](live/THIRD_PARTY.md)

The code safety branch is `backup/before-full-3d-migration-20261105`. Player history, session/season data and stable TikTok IDs are retained. Set `DATA_DIR` to a persistent volume in hosted environments; use one server process per data directory.

## Preview still shows an old version

Merging a PR updates GitHub; it does not pull/build inside an existing Codespace. The GitHub workflow verifies code and screenshots, but does not deploy to Codespaces.

In a new Codespaces Terminal at the repository root:

```sh
git fetch origin &&
git switch feature/pixel-war-live &&
git pull --ff-only origin feature/pixel-war-live &&
npm run setup &&
npm run build
```

These commands preserve player data and do not stop the running server. They apply frontend changes when the existing server already serves `live/dist/public` with the compatible 3D API. Uncommitted/conflicting changes or a diverged branch stop the Git steps rather than overwrite work. Backend changes require a separate server restart with the existing environment and persistent DATA_DIR retained.

Open **Ports → 3000 → Open in Browser → `/3d/`**. The editor URL ending `.github.dev` opens VS Code; game URLs use `-3000.app.github.dev`. A temporary query such as `?build=latest` requests a fresh entry page.

The preview heading shows **LIVE UPGRADE · `<revision>`**. `/version.json` reports the revision, build time and environment for the files actually served. The embedded client metadata is checked against this file on initial load, tab return and Safari back/forward restoration. When it changes, **Tải lại bản game** requests a cache-busted page after the user taps it; the game never reloads itself during a round. These controls stay outside the livestream HUD/capture.

New server processes mark HTML and the manifest `no-store`; hashed JS/CSS remain immutable-cacheable. Vite development mode is labeled separately and does not compare itself to a deployed static manifest. `npm run test:version --prefix live` verifies cache headers, the real running scene, changed-manifest detection without restarting Node, and user-initiated reload.
