# PIXEL WAR 3D — Unity 6 starter project

**Status:** playable prototype source, **not a finished game or verified Unity build**. The existing Three.js repository is untouched.

## Open and play
1. Install Unity Hub and **Unity 6 (6000.0.23f1)** on Windows; include Windows Build Support.
2. Open this folder as a Unity project. Wait for package imports.
3. In Unity menu choose **PIXEL WAR > Create Playable Demo Scene**.
4. Open `Assets/PixelWarDemo.unity` if not already open, then press **Play**.
5. Use demo buttons to spawn RED/BLUE soldiers, Giant, and Mages. Right-drag camera orbit, middle-drag pan, mouse wheel zoom.

## Implemented
- Two castles with 10,000 HP each; RED vs BLUE combat; five unit classes and basic stats.
- Unit targeting, approach, attack, damage, deaths, kill counts, round reset after seven seconds.
- Demo buttons, orbit camera, procedural scene builder.

## Not implemented yet
- Import and configure KayKit and Quaternius assets (original ZIPs remain in the old project; do not assume their contents are available here).
- Real character animation, GPU-instanced armies, VFX, dragons, MushroomKing, TikTok gifts, server WebSocket, WebRTC iPad stream, polished fantasy HUD, OBS integration.
- Current targeting is O(n^2) at large scale and **not suitable for thousands of troops**. Optimize before increasing counts.
- The Unity project has not been opened or compiled in Unity Editor in this environment. Address any Unity version/package API differences in the Editor.

## Next integration
- Export/convert GLB to Unity-compatible FBX or use a vetted glTF importer; map animations and materials.
- Keep the existing Node.js gift server as authoritative; send sanitized summon events to Unity via WebSocket.
- Add authenticated web dashboard and WebRTC/remote-streaming separately for iPad viewing.

## Source safety
Keep this Unity project in a new repo or folder. Do not delete or overwrite the Three.js game.
