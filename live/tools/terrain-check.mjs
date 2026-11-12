import { isolatedFixture } from "./isolated-fixture.mjs";
import { chromium, webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const kit = process.env.TERRAIN_ENGINE === "webkit";
const browser = kit
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
const report = {
  browser: await browser.version(),
  engine: kit
    ? "Linux WebKit, touch emulation"
    : "Linux Chromium, SwiftShader software GPU",
  physicalIPadTest: false,
  reference:
    "No new screenshot attachment was available; implemented the supplied palette and written direction.",
  runs: [],
};
const prefix = kit ? "environment-webkit" : "environment",
  sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await mkdir("artifacts", { recursive: true });
async function run(label, directory, port) {
  const data = await mkdtemp("/tmp/pw-environment-"),
    base = `http://127.0.0.1:${port}`,
    token = "isolated-environment";
  isolatedFixture(data);
  const server = spawn(process.execPath, ["src/server.js"], {
    cwd: directory,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: data,
      ADMIN_TOKEN: token,
    },
    stdio: "ignore",
  });
  let page;
  const control = async (action, p = {}) => {
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
    await control("cameraScenario", { scenario: "balanced", count: 50 });
    await control("pause");
    page = await browser.newPage({
      viewport: { width: 1080, height: 1920 },
      deviceScaleFactor: 1,
      hasTouch: true,
      isMobile: true,
    });
    page.setDefaultTimeout(90000);
    const errors = [],
      requests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("requestfailed", (r) =>
      errors.push(`${r.failure()?.errorText} ${r.url()}`),
    );
    page.on("response", (r) => {
      if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
      if (r.url().includes("/forest/") || r.url().includes("/terrain/"))
        requests.push({ url: r.url(), status: r.status() });
    });
    await page.goto(base + "/3d/?live=1&overlay=1&debug=1");
    await page
      .waitForFunction(
        () =>
          window.__PW3D?.inspect().assets.rendered === 54 &&
          window.__PW3D.inspect().fortresses.length === 2,
      )
      .catch(async (e) => {
        console.log(
          "LOAD DIAGNOSTICS",
          await page.evaluate(() => window.__PW3D?.inspect()),
          errors,
        );
        throw e;
      });
    console.log(label, "world and models ready");
    await page.locator("#quality").evaluate((s) => {
      s.value = "low";
      s.dispatchEvent(new Event("change"));
    });
    const settle = async () =>
      page.waitForFunction(() => {
        const d = window.__PW3D.inspect();
        return (
          Math.abs(d.distance - d.targetDistance) < 0.15 &&
          Math.abs(d.x - d.targetX) < 0.05 &&
          Math.abs(d.yaw - d.targetYaw) < 0.05 &&
          (d.adaptiveScale === 0.5 || d.fps >= 22)
        );
      });
    const mode = async (m) => {
      await page.locator(`[data-camera="${m}"]`).evaluate((b) => b.click());
      await settle();
    };
    await mode("front");
    const initial = await page.evaluate(() => window.__PW3D.inspect());
    if (label === "stylized") {
      assert.equal(initial.terrain.style, "stylized-fantasy-pbr-grain");
      assert.equal(initial.terrain.maps.length, 3);
      assert.deepEqual(initial.terrain.errors, []);
      assert.equal(initial.environment.status, "ready");
      assert.equal(initial.environment.instances, 592);
      assert.equal(initial.environment.batches.length, 9);
      for (const b of initial.environment.batches)
        assert.ok(b.textured && b.instances > 0);
      for (const p of initial.environment.placements) {
        assert.ok(p.bottom <= p.ground + 0.001, "floating prop " + p.file);
        if (Math.abs(p.x) < 61 + p.radius)
          assert.ok(
            Math.abs(p.z) - p.radius >= 14.19,
            "blocked combat lane " + p.file,
          );
        if (Math.abs(p.x) > 39 - p.radius && Math.abs(p.x) < 61 + p.radius)
          assert.ok(
            Math.abs(p.z) - p.radius >= 22.99,
            "blocked fortress " + p.file,
          );
      }
      assert.equal(initial.contacts.units, 54);
      assert.ok(initial.contacts.static > 100);
      assert.equal(initial.contacts.shadowPasses, 0);
      assert.ok(
        requests.some((r) => r.url.includes("/terrain/")),
        "grass PBR maps not loaded",
      );
    }
    await page.screenshot({
      path: `artifacts/${prefix}-${label}-front-1080x1920.png`,
    });
    console.log(label, "portrait captured");
    if (label === "stylized") {
      for (const m of ["overview", "red", "blue"]) {
        await mode(m);
        const d = await page.evaluate(() => window.__PW3D.inspect());
        const selected =
          m === "overview" ? d.fortresses : [d.fortresses[m === "red" ? 0 : 1]];
        for (const f of selected)
          assert.ok(
            f.visible &&
              f.projectedBounds.every(
                (p) => Math.abs(p[0]) < 0.99 && Math.abs(p[1]) < 0.99,
              ),
            m + " fortress clipped",
          );
        await page.screenshot({
          path: `artifacts/${prefix}-${m}-1080x1920.png`,
        });
        if (m === "overview") {
          await page
            .locator("#battleHud")
            .evaluate((el) => (el.style.visibility = "hidden"));
          await page.screenshot({
            path: `artifacts/${prefix}-overview-world-1080x1920.png`,
          });
          await page
            .locator("#battleHud")
            .evaluate((el) => (el.style.visibility = ""));
        }
        console.log(m, "fortress captured");
      }
      await mode("front");
      // Diagnostic capture only: production HUD is unchanged and remains in other images.
      await page
        .locator("#battleHud")
        .evaluate((el) => (el.style.visibility = "hidden"));
      for (let i = 0; i < 2; i++)
        await page.evaluate(() => document.querySelector("#zoomIn").click());
      await settle();
      await page.screenshot({
        path: `artifacts/${prefix}-detail-1080x1920.png`,
      });
      await page
        .locator("#battleHud")
        .evaluate((el) => (el.style.visibility = ""));
      await mode("front");
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await settle();
    await sleep(1000);
    const performance = [];
    for (const count of process.env.TERRAIN_QUICK ? [50] : [50, 100, 300]) {
      if (count !== 50) {
        await control("cameraScenario", { scenario: "balanced", count });
        await control("pause");
        await page.waitForFunction(
          (n) => window.__PW3D.inspect().assets.rendered === n + 4,
          count,
        );
        await mode("front");
        await sleep(500);
      }
      const samples = [];
      for (let i = 0; i < 3; i++)
        samples.push(
          await page.evaluate(
            () =>
              new Promise((resolve) => {
                let frames = 0;
                const start = performance.now();
                const tick = (now) => {
                  frames++;
                  if (now - start >= 2000)
                    resolve({
                      frames,
                      elapsedMs: now - start,
                      fps: (frames * 1000) / (now - start),
                    });
                  else requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
              }),
          ),
        );
      const d = await page.evaluate(() => window.__PW3D.inspect());
      assert.equal(d.contextLost, false);
      performance.push({
        units: count,
        drawCalls: d.drawCalls,
        triangles: d.triangles,
        buffer: d.drawingBuffer,
        css: [390, 844],
        camera: { x: d.x, distance: d.distance, yaw: d.yaw },
        samples,
        fps:
          (samples.reduce((n, s) => n + s.frames, 0) * 1000) /
          samples.reduce((n, s) => n + s.elapsedMs, 0),
      });
      await page.screenshot({
        path: `artifacts/${prefix}-${label}-${count}-mobile.png`,
      });
      console.log(label, count, "rendered, FPS", performance.at(-1).fps);
    }
    await control("pause");
    const frames = await page.evaluate(
      () => window.__PW3D.inspect().totalFrames,
    );
    // Software GPUs can take over two seconds per frame at 300 units.
    await page.waitForFunction(
      (previous) => window.__PW3D.inspect().totalFrames > previous,
      frames,
    );
    const active = await page.evaluate(() => window.__PW3D.inspect());
    assert.ok(active.totalFrames > frames);
    assert.equal(active.roundState.phase, "combat");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    report.runs.push({
      label,
      terrain: initial.terrain,
      environment: initial.environment ?? null,
      contacts: initial.contacts ?? null,
      portraitBuffer: initial.drawingBuffer,
      performance,
      activeRendering: true,
      errors,
      requests,
    });
  } finally {
    await page?.close();
    server.kill("SIGTERM");
    await sleep(1800);
    await rm(data, { recursive: true, force: true });
  }
}
try {
  if (process.env.TERRAIN_BASELINE_DIR)
    await run("before", process.env.TERRAIN_BASELINE_DIR, 3180);
  await run("stylized", process.cwd(), 3181);
  await writeFile(
    `artifacts/${prefix}-report.json`,
    JSON.stringify(report, null, 2),
  );
  console.log("Environment visual/clearance/performance checks PASS");
} finally {
  await browser.close();
}
