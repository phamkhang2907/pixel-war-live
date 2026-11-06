import { chromium, webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { once } from "node:events";
import { io } from "socket.io-client";
import assert from "node:assert/strict";
const useWebKit = process.env.SWARM_ENGINE === "webkit";
const counts = process.env.SWARM_COUNTS
  ? process.env.SWARM_COUNTS.split(",").map(Number)
  : [200, 500, 1000, 2000];
const data = await mkdtemp("/tmp/pw-swarm-"),
  base = "http://127.0.0.1:3191",
  token = "isolated-swarm";
const server = spawn(process.execPath, ["src/server.js"], {
  env: { ...process.env, PORT: "3191", DATA_DIR: data, ADMIN_TOKEN: token },
  stdio: "ignore",
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser, socket, latest;
const command = async (action, p = {}) => {
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
  socket = io(base);
  socket.on("state", (s) => (latest = s));
  await command("cameraScenario", {
    scenario: "swarm",
    count: 200,
    layout: "march",
  });
  await command("pause");
  browser = useWebKit
    ? await webkit.launch()
    : await chromium.launch({
        executablePath:
          process.env.CHROMIUM_PATH ||
          (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
        args: [
          "--no-sandbox",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
          "--enable-precise-memory-info",
        ],
      });
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1920 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  page.setDefaultTimeout(180000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(r.status() + " " + r.url());
  });
  await page.goto(base + "/3d/?debug=1&overlay=1");
  await mkdir("artifacts", { recursive: true });
  const measurements = [];
  for (const count of counts) {
    if (count !== 200) {
      await command("cameraScenario", {
        scenario: "swarm",
        count,
        layout: "march",
      });
      await command("pause");
    }
    await page.waitForFunction(
      (n) => window.__PW3D?.inspect().assets.rendered === n,
      count,
    );
    await page.locator("[data-camera=front]").evaluate((b) => b.click());
    await page.waitForFunction(() => {
      const d = window.__PW3D.inspect();
      return Math.abs(d.distance - d.targetDistance) < 0.3;
    });
    const initial = await page.evaluate(() => window.__PW3D.inspect());
    assert.ok(
      latest.units.every((u) => u.x >= 300 && u.x <= 4500),
      "Demo marches stay outside fortress walls",
    );
    for (const team of [0, 1]) {
      const troops = latest.units.filter((u) => u.team === team);
      assert.equal(troops.length, count / 2);
      assert.ok(
        new Set(troops.map((u) => u.y)).size > troops.length * 0.85,
        "organic, non-row spawn depths",
      );
    }

    assert.equal(
      latest.hud.boards.round.length,
      0,
      "ownerless density fixtures cannot grant contributions",
    );
    assert.ok(
      initial.assets.gpuAnimation.models.every(
        (m) => m.runPoseDisplacement > 0.05,
      ),
    );
    for (const model of initial.assets.gpuAnimation.models)
      for (const clip of [
        "Walking_A",
        "Hit_A",
        "Death_A",
        ...model.clips.filter((c) => c.startsWith("PW_")),
      ])
        assert.ok(
          model.clipPoseDisplacements[clip] > 0.03,
          `actual skinned vertex motion: ${model.key} ${clip}`,
        );
    await command("pause");
    const samples = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 0,
            last = performance.now(),
            start = last;
          const deltas = [];
          const tick = (now) => {
            frames++;
            deltas.push(now - last);
            last = now;
            if (now - start >= 8000)
              resolve({
                frames,
                elapsedMs: now - start,
                fps: (frames * 1000) / (now - start),
                frameMs: deltas,
              });
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
    await command("pause");
    await page.waitForFunction(
      () =>
        document.querySelector("#phase")?.textContent === "PAUSED" &&
        window.__PW3D.inspect().assets.rendered ===
          window.__PW3D.inspect().units,
    );
    const d = await page.evaluate(() => window.__PW3D.inspect());
    assert.ok(d.assets.gpuAnimation.time > initial.assets.gpuAnimation.time);
    assert.ok(
      Object.keys(d.assets.gpuAnimation.states).some((s) =>
        /Running|Walking/.test(s),
      ),
      "GPU run/walk poses selected",
    );
    assert.equal(
      d.assets.rendered,
      d.units,
      "every current authoritative unit has a real rendered model",
    );
    assert.ok(
      d.units >= count * 0.8,
      "army retains high density during the live sample",
    );
    await page.screenshot({
      path: `artifacts/swarm-${useWebKit ? "webkit-" : ""}${count}-1080x1920.png`,
    });
    const health = await fetch(base + "/health").then((r) => r.json());
    const result = {
      requested: count,
      actual: d.units,
      viewport: [1080, 1920],
      drawingBuffer: d.drawingBuffer,
      adaptiveScale: d.adaptiveScale,
      ...samples,
      drawCalls: d.drawCalls,
      triangles: d.triangles,
      jsHeapBytes: d.jsHeapBytes,
      renderMemory: d.renderMemory,
      visibleCenters: d.estimatedVisibleUnitCenters,
      server: health.performance,
      serverMemory: health.memory,
      fullRigs: d.assets.independentSkeletons,
      gpuAnimated: d.assets.bakedLod,
      heights: d.assets.scaleHeights,
      animation: d.assets.gpuAnimation,
    };
    measurements.push(result);
    console.log("MEASUREMENT", JSON.stringify(result));
  }
  await command("cameraScenario", {
    scenario: "swarm",
    count: useWebKit ? 200 : 1000,
  });
  await page.waitForFunction(
    () => window.__PW3D.inspect().assets.gpuAnimation.states.PW_Sword_Swing > 0,
  );
  const combat = await page.evaluate(() => window.__PW3D.inspect());
  await page.screenshot({
    path:
      "artifacts/swarm-combat" +
      (useWebKit ? "-webkit" : "") +
      "-1080x1920.png",
  });
  await command("pause");
  const glDriver = await page.evaluate(() => {
    const gl = document.querySelector("canvas").getContext("webgl2");
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      vendor: gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
      renderer: gl.getParameter(
        debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
      ),
      version: gl.getParameter(gl.VERSION),
      contextLost: gl.isContextLost(),
    };
  });
  const report = {
    browser: await browser.version(),
    device: useWebKit
      ? "Linux WebKit touch emulation; NOT physical iPad"
      : "Linux Chromium / SwiftShader software WebGL, touch emulation; NOT physical iPad or desktop GPU",
    physicalIPad: false,
    glDriver,
    softwareEnvironment: {
      LIBGL_ALWAYS_SOFTWARE: process.env.LIBGL_ALWAYS_SOFTWARE ?? null,
      GALLIUM_DRIVER: process.env.GALLIUM_DRIVER ?? null,
      WEBKIT_DISABLE_DMABUF_RENDERER:
        process.env.WEBKIT_DISABLE_DMABUF_RENDERER ?? null,
    },
    measurements,
    combat: {
      units: combat.units,
      animations: combat.assets.gpuAnimation.states,
      drawCalls: combat.drawCalls,
      triangles: combat.triangles,
      visibility: combat.estimatedVisibleUnitCenters,
    },
    errors,
  };
  await writeFile(
    "artifacts/swarm-report" + (useWebKit ? "-webkit" : "") + ".json",
    JSON.stringify(report, null, 2),
  );
  console.log("GL driver", JSON.stringify(glDriver));
  assert.deepEqual(errors, []);
  assert.equal(glDriver.contextLost, false);
  console.log("Swarm rendering and real animation checks PASS");
} finally {
  socket?.disconnect();
  await browser?.close();
  const done = once(server, "exit");
  server.kill("SIGTERM");
  await done;
  await rm(data, { recursive: true, force: true });
}
