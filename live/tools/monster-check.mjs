import { chromium, webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { io } from "socket.io-client";
import assert from "node:assert/strict";
const kit = process.env.MONSTER_ENGINE === "webkit",
  port = 3204,
  base = `http://127.0.0.1:${port}`,
  token = "isolated-monster-test",
  data = await mkdtemp("/tmp/pw-monsters-");
const server = spawn(process.execPath, ["src/server.js"], {
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: data,
    ADMIN_TOKEN: token,
  },
  stdio: "ignore",
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(f) {
  for (let i = 0; i < 240; i++) {
    if (await f()) return;
    await sleep(100);
  }
  throw Error("Condition timed out");
}
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
let browser, prod, demo, latest, publicState;
try {
  await wait(() =>
    fetch(base + "/health")
      .then((r) => r.ok)
      .catch(() => false),
  );
  prod = io(base);
  prod.on("state", (s) => (latest = s));
  demo = io(base + "/demo");
  demo.on("state", (s) => (publicState = s));
  await wait(() => latest && publicState);
  await command("pauseBattle");
  assert.equal(latest.units.filter((u) => u.type === "mushroomKing").length, 4);
  for (const team of [0, 1])
    assert.equal(
      latest.units.filter((u) => u.type === "mushroomKing" && u.team === team)
        .length,
      2,
    );
  const manifest = JSON.parse(
    await readFile("public/assets/3d/monsters/manifest.json"),
  );
  assert.deepEqual(manifest.models.map((m) => m.name).sort(), [
    "Dragon",
    "Dragon_Evolved",
    "MushroomKing",
  ]);
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
          "--enable-precise-memory-info",
        ],
      });
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    }),
    page = await context.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  await mkdir("artifacts", { recursive: true });
  const prefix = "monsters-" + (kit ? "webkit" : "chromium");
  await page.goto(base + "/3d/monsters.html");
  await page.waitForFunction(
    () => window.__MONSTERS?.inspect().triangles > 15000,
  );
  const gallery = await page.evaluate(() => window.__MONSTERS.inspect());
  assert.equal(
    Object.values(gallery.reports).filter((r) => r.status === "ready").length,
    3,
  );
  const poses = [];
  for (const model of ["frostDragon", "fireDragon", "mushroomKing"]) {
    await page.locator("#model").selectOption(model);
    for (const clip of ["move", "attack", "death"]) {
      await page.locator("#clip").selectOption(clip);
      const a = await page.evaluate(() => window.__MONSTERS.pose());
      // Wait for actual animation/vertex motion, not a wall-clock delay on software GPUs.
      const motion = await page.waitForFunction((a) => {
        const b = window.__MONSTERS.pose();
        const delta = Math.max(...a.map((v, k) => Math.abs(v - b[k])));
        return delta > 0.01 ? delta : false;
      }, a);
      const delta = await motion.jsonValue();
      await motion.dispose();
      assert.ok(
        delta > 0.01,
        `real skinned ${model} ${clip} movement ${delta}`,
      );
      poses.push({ model, clip, delta });
    }
  }
  await page.locator("#model").selectOption("all");
  await page.locator("#clip").selectOption("move");
  await page.screenshot({ path: `artifacts/${prefix}-gallery.png` });
  // Load the main scene once, after the lightweight gallery has settled.
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.goto(base + "/3d/?demo=1&debug=1");
  await page.waitForFunction(
    () =>
      window.__PW3D?.inspect().monsters.rendered === 4 &&
      window.__PW3D.inspect().assets.ready,
  );
  assert.equal(await page.locator("#token").count(), 0);
  const prodBefore = latest.units.length;
  await page.locator("#sendDemoGift").tap();
  await page.locator("#publicUsername").fill("Monster Viewer");
  for (const [team, gift] of [
    ["0", "Demo Lion"],
    ["1", "Demo Dragon"],
  ]) {
    await page.locator("#publicTeam").selectOption(team);
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/demo/gift") && r.request().method() === "POST",
    );
    await page.locator(`[data-demo-monster="${gift}"]`).tap();
    const res = await response,
      body = await res.json();
    assert.equal(body.queued, 1);
    const replay = await context.request.post(base + "/api/demo/gift", {
      data: res.request().postDataJSON(),
    });
    assert.equal((await replay.json()).duplicate, true);
  }
  await page.locator("[data-close=demoGiftPanel]").tap();
  await page.waitForFunction(
    () => window.__PW3D.inspect().monsters.rendered === 6,
  );
  await wait(() => publicState.units.some((u) => u.type === "fireDragon"));
  assert.equal(latest.units.length, prodBefore);
  assert.ok(
    publicState.units.some((u) => u.type === "frostDragon" && u.team === 0),
  );
  assert.ok(
    publicState.units.some((u) => u.type === "fireDragon" && u.team === 1),
  );
  const before = publicState.units.find((u) => u.type === "frostDragon").x;
  await wait(
    () =>
      publicState.units.find((u) => u.type === "frostDragon").x > before + 20,
  );
  const active = await page.evaluate(() => window.__PW3D.inspect().monsters);
  assert.ok(active.instances.some((i) => /Fast_Flying/.test(i.clip)));
  assert.equal(new Set(active.instances.map((i) => i.rootBoneId)).size, 6);
  await page.screenshot({
    path: `artifacts/${prefix}-demo-flight-1080x1920.png`,
  });
  const denied = await fetch(base + "/api/control", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "monsterScenario", kind: "gate" }),
  });
  assert.equal(denied.status, 401);
  // Owner-only deterministic combat layouts exercise the same server damage system.
  await page.request.post(base + "/owner/login", { form: { password: token } });
  await command("monsterScenario", { kind: "breath" });
  await page.goto(base + "/3d/?live=1&overlay=1&debug=1");
  await page.waitForFunction(
    () =>
      window.__PW3D?.inspect().monsters.rendered === 6 &&
      window.__PW3D.inspect().assets.ready,
  );
  await page.locator("[data-camera=front]").evaluate((b) => b.click());
  await page.waitForFunction(() => {
    const d = window.__PW3D.inspect();
    return d.mode === "front" && Math.abs(d.distance - d.targetDistance) < 2;
  });
  await wait(
    () =>
      latest.effects.some(
        (e) => e.type === "dragonBreath" && e.element === "ice",
      ) && latest.units.some((u) => u.slowUntil > latest.time),
  );
  await page.waitForFunction(
    () => window.__PW3D.inspect().monsters.particles > 0,
  );
  await page.screenshot({ path: `artifacts/${prefix}-breath-1080x1920.png` });
  const breath = await page.evaluate(() => window.__PW3D.inspect().monsters);
  assert.ok(latest.units.some((u) => u.type === "sword" && u.hp < 2000));
  await command("monsterScenario", { kind: "gate" });
  await page.locator("[data-camera=red]").evaluate((b) => b.click());
  await page.waitForFunction(() => {
    const d = window.__PW3D.inspect();
    return d.mode === "red" && Math.abs(d.x - d.targetX) < 1;
  });
  await wait(() => latest.units.some((u) => u.type === "sword" && u.hp < 2000));
  // Sample a visible staff projectile in the same browser frame. A subsequent
  // HTTP pause can arrive after this short-lived projectile has already hit.
  const gateFrame = await page.waitForFunction(() => {
    const m = window.__PW3D.inspect().monsters;
    return m.rendered === 4 && m.projectiles > 0 ? m : false;
  });
  const gate = await gateFrame.jsonValue();
  await gateFrame.dispose();
  assert.ok(gate.projectiles > 0);
  await command("pauseBattle");
  await page.screenshot({ path: `artifacts/${prefix}-gate-1080x1920.png` });
  await wait(() => latest.units.some((u) => u.type === "sword" && u.hp < 2000));
  for (const king of latest.units.filter((u) => u.type === "mushroomKing")) {
    assert.equal(king.x, king.team ? 4290 : 510);
    assert.ok([1450, 1750].includes(king.y));
  }
  await command("monsterScenario", { kind: "breath" });
  await command("burst", { count: 200 });
  await page.locator('[data-camera="front"]').evaluate((b) => b.click());
  await page.waitForFunction(
    () => window.__PW3D.inspect().assets.rendered >= 210,
  );
  const sample = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0,
          start = performance.now();
        const tick = (now) => {
          frames++;
          if (now - start >= 8000)
            resolve({
              frames,
              elapsedMs: now - start,
              fps: (frames * 1000) / (now - start),
            });
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  const perf = await page.evaluate(() => {
    const d = window.__PW3D.inspect();
    return {
      units: d.units,
      monsters: d.monsters.rendered,
      drawCalls: d.drawCalls,
      triangles: d.triangles,
      buffer: d.drawingBuffer,
      jsHeapBytes: d.jsHeapBytes,
      contextLost: d.contextLost,
      particles: d.monsters.particles,
    };
  });
  assert.equal(perf.contextLost, false);
  assert.ok(perf.particles <= 220);
  const performanceResult = {
    ...sample,
    ...perf,
    viewport: [1080, 1920],
    software: true,
    physicalIPad: false,
  };
  const config = await fetch(base + "/api/config", {
    headers: { Authorization: "Bearer " + token },
  }).then((r) => r.json());
  assert.equal(
    config.giftMappings.find((r) => r.key === "dragon-fire").enabled,
    false,
  );
  assert.equal(config.giftCatalog.filter((g) => g.source === "live").length, 0);
  const report = {
    engine: kit ? "Linux WebKit / llvmpipe" : "Linux Chromium / SwiftShader",
    physicalIPad: false,
    gallery,
    poseDisplacements: poses,
    performance: performanceResult,
    publicDemo: {
      twoButtons: true,
      teamIndependent: true,
      flying: true,
      duplicateProtected: true,
      productionIsolated: true,
    },
    breath,
    gate,
    verifiedRealLiveIds: [],
    liveBroadcastTested: false,
    errors,
  };
  assert.deepEqual(errors, []);
  await writeFile(
    `artifacts/${prefix}-report.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      engine: report.engine,
      checks: report.publicDemo,
      poses,
      performance: performanceResult,
      errors,
    }),
  );
} finally {
  prod?.disconnect();
  demo?.disconnect();
  await browser?.close();
  const exited = new Promise((r) => server.once("exit", r));
  server.kill("SIGTERM");
  await Promise.race([exited, sleep(3000)]);
  await rm(data, { recursive: true, force: true });
}
