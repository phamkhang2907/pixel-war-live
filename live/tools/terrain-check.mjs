import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
// Verify original downloads and their built, self-hosted copies before rendering.
const assetRoot = "assets/3d/terrain/leafy_grass/";
const manifest = JSON.parse(await readFile(assetRoot + "sources.json", "utf8"));
assert.equal(manifest.license, "CC0-1.0");
for (const asset of manifest.assets) {
  for (const path of [
    assetRoot + asset.file,
    "dist/public/" + assetRoot + asset.file,
  ]) {
    const bytes = await readFile(path);
    assert.equal(bytes.length, asset.bytes);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      asset.sha256,
    );
  }
}
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = {
  browser: await browser.version(),
  platform: "Linux headless Chromium / SwiftShader; no physical iPad test",
  runs: [],
};
async function run(label, directory, port) {
  const data = await mkdtemp("/tmp/pw-terrain-"),
    base = `http://127.0.0.1:${port}`,
    token = "isolated-terrain";
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
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.log(label, "PAGE ERROR", e.message);
    });
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("requestfailed", (r) =>
      errors.push(`${r.failure()?.errorText} ${r.url()}`),
    );
    page.on("response", (r) => {
      if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
      if (r.url().includes("/terrain/"))
        requests.push({ url: r.url(), status: r.status() });
    });
    await page.goto(base + "/3d/?overlay=1&debug=1");
    console.log(label, "loaded", await page.title());
    await page
      .waitForFunction(
        () =>
          window.__PW3D?.inspect().assets.rendered >= 50 &&
          window.__PW3D.inspect().fortresses.length === 2,
      )
      .catch(async (e) => {
        console.log(
          "FAILED DIAGNOSTICS",
          await page.evaluate(() => ({
            state: window.__PW3D?.inspect(),
            body: document.body.innerText.slice(0, 500),
          })),
        );
        throw e;
      });
    console.log(label, "models ready");
    await page.locator("#quality").evaluate((s) => {
      s.value = "low";
      s.dispatchEvent(new Event("change"));
    });
    await page.evaluate(() =>
      document.querySelector("[data-camera=front]").click(),
    );
    await page.waitForFunction(() => {
      const d = window.__PW3D.inspect();
      return (
        d.distance < 100 &&
        Math.abs(d.distance - d.targetDistance) < 0.2 &&
        (d.adaptiveScale === 0.5 || d.fps >= 22)
      );
    });
    if (label === "textured") {
      await page.waitForFunction(
        () => window.__PW3D.inspect().terrain?.status === "ready",
      );
      const terrain = await page.evaluate(
        () => window.__PW3D.inspect().terrain,
      );
      assert.deepEqual(terrain.errors, []);
      assert.equal(terrain.maps.length, 4);
      for (const map of terrain.maps) {
        assert.deepEqual(map.size, [1024, 1024]);
        assert.ok(map.anisotropy <= 4);
      }
      assert.equal(
        terrain.maps.find((t) => t.file.includes("_diff")).colorSpace,
        "srgb",
      );
      assert.equal(
        terrain.maps.find((t) => t.file.includes("_nor")).colorSpace,
        "",
      );
      assert.equal(
        terrain.maps.find((t) => t.file.includes("_rough")).colorSpace,
        "",
      );
      assert.deepEqual(terrain.maps[0].repeat, [40, 35]);
    }
    await sleep(1000);
    const d = await page.evaluate(() => window.__PW3D.inspect());
    await mkdir("artifacts", { recursive: true });
    await page.screenshot({ path: `artifacts/grass-${label}-1080x1920.png` });
    // Current camera controls provide the detail view; production camera code is unchanged.
    for (let i = 0; i < 4; i++)
      await page.evaluate(() => document.querySelector("#zoomIn").click());
    await page.waitForFunction(() => {
      const d = window.__PW3D.inspect();
      return Math.abs(d.distance - d.targetDistance) < 0.2;
    });
    await page.screenshot({ path: `artifacts/grass-${label}-detail.png` });
    await page.evaluate(() =>
      document.querySelector("[data-camera=front]").click(),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => {
      const d = window.__PW3D.inspect();
      return (
        Math.abs(d.distance - d.targetDistance) < 0.2 &&
        (d.adaptiveScale === 0.5 || d.fps >= 22)
      );
    });
    await sleep(800);
    const samples = [];
    for (let round = 0; round < 3; round++)
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
    const mobile = await page.evaluate(() => window.__PW3D.inspect());
    await page.screenshot({ path: `artifacts/grass-${label}-390.png` });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    report.runs.push({
      label,
      units: d.units,
      independentSkeletons: d.assets.independentSkeletons,
      bakedLod: d.assets.bakedLod,
      drawCalls: d.drawCalls,
      triangles: d.triangles,
      terrain: d.terrain ?? null,
      portraitBuffer: d.drawingBuffer,
      mobile: {
        css: [390, 844],
        buffer: mobile.drawingBuffer,
        samples,
        fps:
          (samples.reduce((n, s) => n + s.frames, 0) * 1000) /
          samples.reduce((n, s) => n + s.elapsedMs, 0),
      },
      camera: {
        x: d.x,
        distance: d.distance,
        yaw: d.yaw,
        elevation: d.elevation,
      },
      errors,
      requests,
    });
    console.log(
      label,
      "terrain rendering, portrait, maps and mobile samples PASS",
    );
  } finally {
    await page?.close();
    server.kill("SIGTERM");
    await sleep(1800);
    await rm(data, { recursive: true, force: true });
  }
}
try {
  if (process.env.TERRAIN_BASELINE_DIR)
    await run("before", process.env.TERRAIN_BASELINE_DIR, 3176);
  await run("textured", process.cwd(), 3177);
  await writeFile(
    "artifacts/grass-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
