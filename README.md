# PIXEL WAR 3D — RED VS BLUE

A portrait Three.js + TypeScript fantasy battle game driven by an authoritative Node.js / Socket.IO simulation and TikTok LIVE events.

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
