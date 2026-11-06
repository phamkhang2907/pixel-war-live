import { chromium, webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
const before = process.env.VISUAL_BEFORE === "1",
  kit = process.env.VISUAL_ENGINE === "webkit",
  base = "http://127.0.0.1:3216",
  token = "isolated-visual-check",
  data = await mkdtemp("/tmp/pw-visual-");
const server = spawn(process.execPath, ["src/server.js"], {
  env: { ...process.env, PORT: "3216", DATA_DIR: data, ADMIN_TOKEN: token },
  stdio: "ignore",
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cmd = async (action, p = {}) => {
  const r = await fetch(base + "/api/control", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({ action, ...p }),
  });
  assert.equal(r.status, 200, await r.text());
};
let browser;
try {
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(base + "/health")
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    await sleep(100);
  }
  await cmd("cameraScenario", { scenario: "balanced", count: 100 });
  await cmd("pauseBattle");
  browser = kit
    ? await webkit.launch()
    : await chromium.launch({
        executablePath:
          process.env.CHROMIUM_PATH ||
          (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
        args: [
          "--no-sandbox",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
        ],
      });
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
  });
  page.setDefaultTimeout(120000);
  const errors = [];
  let phase = "loading";
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") {
      errors.push(phase + ": " + m.text());
      console.log("Browser error during", phase, m.text().slice(0, 350));
    }
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(r.status() + " " + r.url());
  });
  await page.goto(base + "/3d/?live=1&debug=1&overlay=1");
  await page.waitForFunction(
    () =>
      window.__PW3D?.inspect().assets.rendered === 104 &&
      window.__PW3D.inspect().terrain.status === "ready" &&
      window.__PW3D.inspect().environment?.status === "ready",
  );
  await mkdir("artifacts", { recursive: true });
  const prefix = `visual-${before ? "before" : "after"}-${kit ? "webkit" : "chromium"}`;
  for (const mode of ["front", "overview", "red"]) {
    await page.locator(`[data-camera=${mode}]`).evaluate((b) => b.click());
    await page.waitForFunction((mode) => {
      const d = window.__PW3D.inspect();
      return (
        d.mode === mode &&
        Math.abs(d.x - d.targetX) < 1 &&
        Math.abs(d.distance - d.targetDistance) < 1
      );
    }, mode);
    await page.screenshot({
      path: `artifacts/${prefix}-${mode}-1080x1920.png`,
    });
  }
  const presets = [];
  if (!before) {
    await page.waitForFunction(
      () =>
        window.__PW3D.inspect().nature?.status === "ready" &&
        window.__PW3D.inspect().particles.status === "ready",
    );
    for (const quality of ["low", "medium", "high"]) {
      phase = "preset " + quality;
      await page.locator("#quality").selectOption(quality, { force: true });
      await page.locator("[data-camera=front]").evaluate((b) => b.click());
      await page.waitForFunction(
        (q) => window.__PW3D.inspect().quality === q,
        quality,
      );
      const start = await page.evaluate(() => ({
        frames: window.__PW3D.inspect().totalFrames,
        time: performance.now(),
      }));
      await sleep(5000);
      const d = await page.evaluate(() => ({
        ...window.__PW3D.inspect(),
        time: performance.now(),
      }));
      assert.equal(d.lighting.shadows, quality !== "low");
      assert.equal(
        d.particles.cap,
        { low: 240, medium: 600, high: 1000 }[quality],
      );
      assert.equal(d.contextLost, false);
      assert.equal(d.nature.license, "CC0-1.0");
      assert.ok(d.nature.models.includes("CommonTree_3"));
      console.log(
        "Preset sampled",
        quality,
        "calls",
        d.drawCalls,
        "triangles",
        d.triangles,
        "bloom",
        d.postprocessing.enabled,
      );
      presets.push({
        quality,
        units: d.units,
        frames: d.totalFrames - start.frames,
        elapsedMs: d.time - start.time,
        fps: ((d.totalFrames - start.frames) * 1000) / (d.time - start.time),
        drawCalls: d.drawCalls,
        triangles: d.triangles,
        buffer: d.drawingBuffer,
        bloom: d.postprocessing.enabled,
        shadows: d.lighting.shadows,
        physicalIPad: false,
      });
      await page.screenshot({
        path: `artifacts/${prefix}-${quality}-1080x1920.png`,
      });
    }
    await page.locator("#quality").selectOption("low", { force: true });
    for (const count of [300, 500]) {
      phase = "army " + count;
      await cmd("cameraScenario", { scenario: "balanced", count });
      await cmd("pauseBattle");
      await page.waitForFunction(
        (n) => window.__PW3D.inspect().assets.rendered === n + 4,
        count,
      );
      const start = await page.evaluate(() => ({
        frames: window.__PW3D.inspect().totalFrames,
        time: performance.now(),
      }));
      await sleep(5000);
      const d = await page.evaluate(() => ({
        ...window.__PW3D.inspect(),
        time: performance.now(),
      }));
      assert.equal(d.units, count + 4);
      assert.equal(d.contextLost, false);
      presets.push({
        quality: "low",
        units: d.units,
        frames: d.totalFrames - start.frames,
        elapsedMs: d.time - start.time,
        fps: ((d.totalFrames - start.frames) * 1000) / (d.time - start.time),
        drawCalls: d.drawCalls,
        triangles: d.triangles,
        buffer: d.drawingBuffer,
        bloom: d.postprocessing.enabled,
        shadows: d.lighting.shadows,
        physicalIPad: false,
      });
      await page.screenshot({
        path: `artifacts/${prefix}-${count}-troops-1080x1920.png`,
      });
      console.log("Army density verified", count);
    }
    await cmd("cameraScenario", { scenario: "balanced", count: 100 });
    await page.locator("#quality").selectOption("medium", { force: true });
    phase = "combat";
    await cmd("resumeBattle");
    await page.waitForFunction(() => {
      const d = window.__PW3D.inspect();
      return (
        d.combatEffects.attacks > 0 &&
        d.particles.active > 0 &&
        (d.particles.emitted.smoke_04 ?? 0) > 0
      );
    });
    await page.screenshot({ path: `artifacts/${prefix}-combat-1080x1920.png` });
    phase = "dragon breath";
    await cmd("monsterScenario", { kind: "breath" });
    await page.waitForFunction(() => {
      const d = window.__PW3D.inspect();
      return (
        d.monsters.rendered === 6 &&
        d.monsters.particles > 0 &&
        (d.particles.emitted.flame_01 ?? 0) > 0
      );
    });
    await page.screenshot({
      path: `artifacts/${prefix}-dragons-1080x1920.png`,
    });
    phase = "re-enable HIGH bloom";
    await page.locator("#quality").selectOption("high", { force: true });
    await page.waitForFunction(
      () =>
        window.__PW3D.inspect().quality === "high" &&
        window.__PW3D.inspect().monsters.particles > 0,
    );
    await page.screenshot({
      path: `artifacts/${prefix}-dragon-bloom-1080x1920.png`,
    });
    console.log("Native magic and actual dragons captured");
  }
  const sourceBuild = await fetch(base + "/version.json").then((r) => r.json());
  const graphics = await page.evaluate(() => {
    const gl = document.querySelector("#world canvas").getContext("webgl2");
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      userAgent: navigator.userAgent,
      version: gl.getParameter(gl.VERSION),
      renderer: gl.getParameter(
        ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
      ),
    };
  });
  const report = await page.evaluate(() => window.__PW3D.inspect());
  assert.deepEqual(errors, []);
  await writeFile(
    `artifacts/${prefix}-report.json`,
    JSON.stringify(
      {
        engine: kit ? "Linux WebKit" : "Linux Chromium",
        physicalIPad: false,
        presets,
        softwareEnvironment: Object.fromEntries(
          [
            "LIBGL_ALWAYS_SOFTWARE",
            "GALLIUM_DRIVER",
            "WEBKIT_DISABLE_DMABUF_RENDERER",
            "WEBKIT_DISABLE_COMPOSITING_MODE",
            "LP_NUM_THREADS",
          ].map((name) => [name, process.env[name] ?? null]),
        ),
        sourceBuild,
        graphics,
        viewport: [1080, 1920],
        errors,
        ...report,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      before,
      errors,
      units: report.units,
      drawCalls: report.drawCalls,
      triangles: report.triangles,
    }),
  );
} finally {
  await browser?.close();
  const exited = new Promise((r) => server.once("exit", r));
  server.kill("SIGTERM");
  await Promise.race([exited, sleep(3000)]);
  await rm(data, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
