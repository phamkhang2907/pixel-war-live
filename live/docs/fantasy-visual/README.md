# Real browser captures

All PNGs are actual 1080×1920 browser screenshots. No generated mockups are used.

- [Before overview](before-overview.png) → [After overview](after-overview.png): both modular fortresses and the forest/terrain layers.
- [Before frontline](before-front.png) → [After frontline](after-front.png): three-quarter camera and raised meadow.
- [Before RED fortress](before-red.png) → [After RED fortress](after-red.png).
- [HIGH lighting/shadows/bloom](after-high.png).
- [500 real troops plus four gate defenders, LOW](after-500-troops.png).
- [Actual combat and native VFX](after-combat.png).
- [Real dragons and HIGH bloom](after-dragon-bloom.png), [Linux WebKit equivalent](webkit-dragon-bloom.png).
- [Chromium measurements](chromium-report.json), [Linux WebKit measurements](webkit-report.json).

Read [the implementation and verification report](../../FANTASY-VISUAL-UPGRADE.md) for asset licenses, source audit, exact quality budgets, test limitations and measured software-renderer rates. These are Linux virtual-machine tests, not physical iPad or Windows performance claims. Baseline is the unmodified `bbbc8e0` source. After captures identify the modified working tree in `sourceBuild`; future CI artifacts identify their own checked-out commit.

The final local WebKit captures use `LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 LP_NUM_THREADS=2`. The compositor flag is a Linux test-host workaround; the captured WebGL scene, PCF shadows and HIGH bloom still run. Browser runtime features are not stubbed, and console errors are asserted.
