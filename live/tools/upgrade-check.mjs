import { isolatedFixture } from "./isolated-fixture.mjs";
import { chromium, webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { once } from "node:events";
import { io } from "socket.io-client";
import assert from "node:assert/strict";
const data = await mkdtemp("/tmp/pw-upgrade-"),
  base = "http://127.0.0.1:3198",
  token = "test-upgrade-owner",
  kit = process.env.UPGRADE_ENGINE === "webkit",
  sleep = (ms) => new Promise((r) => setTimeout(r, ms));
isolatedFixture(data);
const server = spawn(process.execPath, ["src/server.js"], {
  env: { ...process.env, PORT: "3198", ADMIN_TOKEN: token, DATA_DIR: data },
  stdio: "ignore",
});
let browser, production, publicSocket, latest, publicState;
const wait = async (fn, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await sleep(50);
  }
  throw Error("Server condition timeout");
};
const command = async (action, p = {}) => {
  const r = await fetch(base + "/api/control", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...p }),
  });
  const d = await r.json();
  assert.equal(r.status, 200, JSON.stringify(d));
  return d;
};
try {
  await wait(() =>
    fetch(base + "/health")
      .then((r) => r.ok)
      .catch(() => false),
  );
  production = io(base);
  production.on("state", (s) => (latest = s));
  publicSocket = io(base + "/demo");
  publicSocket.on("state", (s) => (publicState = s));
  await command("roundConfig", {
    config: { duration: 300, prepare: 0, final: 30, results: 7, countdown: 0 },
  });
  await command("newRound");
  await command("pauseBattle");
  await wait(() => latest?.paused);
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
  const context = await browser.newContext({
      viewport: { width: 1080, height: 1920 },
      hasTouch: true,
      isMobile: true,
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
    if (r.status() >= 400 && !r.url().includes("/api/control"))
      errors.push(r.status() + " " + r.url());
  });
  await page.goto(base + "/3d/?debug=1");
  await page.waitForFunction(
    () =>
      window.__PW3D?.inspect().assets.ready &&
      window.__PW3D.inspect().terrain.status === "ready" &&
      window.__PW3D.inspect().fortresses.length === 2,
  );
  assert.equal(await page.locator("#token").count(), 0);
  assert.equal(await page.locator("#ownerBattleControls").isVisible(), false);
  assert.equal(
    (
      await context.request.post(base + "/api/control", {
        data: { action: "stopBattle" },
      })
    ).status(),
    401,
  );
  const beforeProd = latest.units.length;
  await page.locator("#sendDemoGift").tap();
  await page.locator("#publicUsername").fill("Swarm Viewer");
  await page.locator("#publicGift").selectOption("Finger Heart");
  await page.locator("#publicQuantity").fill("20");
  const sent = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/demo/gift") && r.request().method() === "POST",
  );
  await page.locator("#publicGiftForm button").tap();
  const response = await sent,
    body = await response.json(),
    payload = response.request().postDataJSON();
  assert.equal(body.queued, 100);
  await page.waitForFunction(
    () => window.__PW3D.inspect().assets.rendered >= 100,
  );
  assert.equal(latest.units.length, beforeProd);
  assert.equal(latest.hud.boards.round.length, 0);
  assert.ok(
    publicState.hud.boards.round.some((p) => p.name === "Swarm Viewer"),
  );
  const replay = await context.request.post(base + "/api/demo/gift", {
    data: payload,
  });
  assert.equal((await replay.json()).duplicate, true);
  for (const [team, n] of [
    [0, 50],
    [0, 50],
    [1, 50],
  ]) {
    const r = await context.request.post(base + "/api/demo/gift", {
      data: {
        team,
        quantity: n,
        username: team ? "Blue Viewer" : "Swarm Viewer",
        giftName: "Finger Heart",
        eventId: crypto.randomUUID(),
      },
    });
    assert.equal(r.status(), 200);
  }
  await wait(() => publicState.units.length >= 800);
  assert.ok(publicState.units.some((u) => u.spawnBand === 2));
  assert.ok(
    publicState.units
      .filter((u) => u.summonSequence !== null)
      .every(
        (u, i, a) => i === 0 || u.summonSequence > a[i - 1].summonSequence,
      ),
  );
  for (const [team, giftName, quantity] of [
    [0, "Demo Giant", 1],
    [1, "Demo Giant", 1],
    [0, "Demo Heavy", 3],
  ]) {
    const r = await context.request.post(base + "/api/demo/gift", {
      data: {
        team,
        giftName,
        quantity,
        username: "Demo Champion",
        eventId: crypto.randomUUID(),
      },
    });
    assert.equal(r.status(), 200);
  }
  await page.locator("[data-close=demoGiftPanel]").tap();
  await page.waitForFunction(
    () => window.__PW3D.inspect().assets.rendered >= 800,
  );
  await page.waitForFunction(() =>
    window.__PW3D
      .inspect()
      .assets.instances.some((i) => i.clip === "Running_A"),
  );
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: `artifacts/upgrade-${kit ? "webkit" : "chromium"}-public-controls.png`,
  });
  console.log("Demo gifts and real animated models loaded");
  const cameraBefore = await page.evaluate(() => window.__PW3D.inspect());
  const box = await page.locator("#world canvas").boundingBox(),
    x = box.x + box.width * 0.52,
    y = box.y + box.height * 0.65;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 75, y + 25, { steps: 5 });
  await page.mouse.up();
  await page.waitForFunction(
    (old) => Math.abs(window.__PW3D.inspect().yaw - old) > 5,
    cameraBefore.yaw,
  );
  const orbit = await page.evaluate(() => window.__PW3D.inspect());
  await page.mouse.move(x, y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(x + 60, y + 10, { steps: 5 });
  await page.mouse.up({ button: "right" });
  await page.waitForFunction(
    (old) => Math.abs(window.__PW3D.inspect().x - old) > 1,
    orbit.x,
  );
  const preZoom = await page.evaluate(() => window.__PW3D.inspect().distance);
  if (kit) await page.locator("#zoomIn").click();
  else await page.mouse.wheel(0, -500);
  await page.waitForFunction(
    (d) => window.__PW3D.inspect().distance < d * 0.95,
    preZoom,
  );
  if (!kit) {
    const cdp = await context.newCDPSession(page),
      touch = (type, points) =>
        cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    const pre = await page.evaluate(() => window.__PW3D.inspect());
    await touch("touchStart", [{ x, y, id: 1 }]);
    await touch("touchMove", [{ x: x - 60, y: y + 10, id: 1 }]);
    await touch("touchEnd", []);
    await page.waitForFunction(
      (a) => Math.abs(window.__PW3D.inspect().yaw - a) > 5,
      pre.yaw,
    );
    await page.locator("#resetCamera").evaluate((b) => b.click());
    await page.waitForFunction(() => {
      const d = window.__PW3D.inspect();
      return (
        Math.abs(d.distance - 310) < 1 &&
        Math.abs(d.yaw) < 0.2 &&
        Math.abs(d.x) < 0.2
      );
    });
    const freshBox = await page.locator("#world canvas").boundingBox();
    const touchX = freshBox.x + freshBox.width * 0.5,
      touchY = freshBox.y + freshBox.height * 0.65;
    const p = await page.evaluate(() => window.__PW3D.inspect());
    await touch("touchStart", [
      { x: touchX - 30, y: touchY, id: 1 },
      { x: touchX + 30, y: touchY, id: 2 },
    ]);
    await touch("touchMove", [
      { x: touchX + 10, y: touchY + 20, id: 1 },
      { x: touchX + 100, y: touchY + 20, id: 2 },
    ]);
    await touch("touchEnd", []);
    await page
      .waitForFunction(
        (a) =>
          Math.hypot(
            window.__PW3D.inspect().x - a.x,
            window.__PW3D.inspect().z - a.z,
          ) > 0.5 && window.__PW3D.inspect().distance < a.distance * 0.95,
        p,
        { timeout: 15000 },
      )
      .catch(async (error) => {
        console.log(
          "Two-touch diagnostic",
          JSON.stringify({
            before: { x: p.x, z: p.z, distance: p.distance, yaw: p.yaw },
            after: await page.evaluate(() => {
              const d = window.__PW3D.inspect();
              return {
                x: d.x,
                z: d.z,
                distance: d.distance,
                mode: d.mode,
                yaw: d.yaw,
              };
            }),
            scroll: await page.evaluate(() => ({ x: scrollX, y: scrollY })),
          }),
        );
        throw error;
      });
  }
  await page.locator("#resetCamera").tap();
  await page.waitForFunction(
    () =>
      window.__PW3D.inspect().mode === "overview" &&
      Math.abs(window.__PW3D.inspect().yaw) < 0.2,
  );
  await page.locator("#followBattle").tap();
  await page.waitForFunction(() => window.__PW3D.inspect().mode === "front");
  console.log("Mouse / touch camera controls passed");
  const grass = await page.evaluate(() => window.__PW3D.inspect().terrain);
  assert.equal(grass.maps.length, 3);
  assert.ok(grass.maps.every((m) => m.width === 1024 && m.height === 1024));
  assert.ok(grass.maps.every((m) => Math.abs(m.repeat[0] - 320 / 1.4) < 0.001));
  // Replenish through the real public gift API before the portrait capture.
  for (const team of [0, 1])
    for (let i = 0; i < 2; i++) {
      const r = await context.request.post(base + "/api/demo/gift", {
        data: {
          team,
          giftName: "Finger Heart",
          quantity: 50,
          username: "Demo army",
          eventId: crypto.randomUUID(),
        },
      });
      assert.equal(r.status(), 200);
    }
  await page.waitForFunction(
    () => window.__PW3D.inspect().assets.rendered >= 800,
  );
  const beforeResize = await page.evaluate(
    () => window.__PW3D.inspect().totalFrames,
  );
  await page.evaluate(() => document.body.classList.add("overlay"));
  await page.waitForFunction(
    (f) => window.__PW3D.inspect().totalFrames > f + 1,
    beforeResize,
  );
  await page.screenshot({
    path: `artifacts/upgrade-${kit ? "webkit" : "chromium"}-battle-1080x1920.png`,
  });
  await page.mouse.move(x, y);
  for (let i = 0; i < 10; i++)
    await page.locator("#zoomIn").evaluate((b) => b.click());
  await page.waitForFunction(() => window.__PW3D.inspect().distance < 65);
  await page.screenshot({
    path: `artifacts/upgrade-${kit ? "webkit" : "chromium"}-grass-detail.png`,
  });
  // Native password form: no owner credential is handed to application JavaScript.
  console.log("Detailed grass captured");
  const ownerContext = await browser.newContext({
      viewport: { width: 820, height: 1180 },
      hasTouch: true,
      isMobile: true,
    }),
    ownerPage = await ownerContext.newPage();
  ownerPage.setDefaultTimeout(120000);
  ownerPage.on("pageerror", (e) => errors.push(e.message));
  await ownerPage.goto(base + "/owner/login");
  await ownerPage.locator("#ownerPassword").fill(token);
  await ownerPage.locator("form button").click();
  await ownerPage.waitForURL(/admin=1/);
  await ownerPage.locator("#adminWorkspace").waitFor({ state: "visible" });
  const cookie = (await ownerContext.cookies()).find(
    (c) => c.name === "pw_owner",
  );
  assert.ok(cookie.httpOnly);
  assert.equal(cookie.sameSite, "Strict");
  assert.ok(
    !(await ownerPage.evaluate(() => document.cookie)).includes("pw_owner"),
  );
  const badOrigin = await ownerContext.request.post(base + "/api/control", {
    headers: { Origin: "https://evil.invalid" },
    data: { action: "stopBattle" },
  });
  assert.equal(badOrigin.status(), 403);
  await command("resetBattle");
  await wait(() => latest.roundState.phase === "ready");
  await command("startBattle", { commandId: "idempotent-start-test" });
  await wait(() => latest.roundState.phase === "combat");
  const roundId = latest.roundState.id;
  await command("startBattle", { commandId: "idempotent-start-test" });
  assert.equal(latest.roundState.id, roundId);
  await command("pauseBattle");
  await command("pauseBattle");
  await wait(() => latest.paused);
  await command("troop", { team: 0, type: "sword", count: 100 });
  const frozen = latest.time;
  await sleep(450);
  assert.equal(latest.time, frozen);
  assert.equal(latest.units.length, 4);
  assert.equal(latest.summonQueue.pending, 100);
  await command("resumeBattle");
  await wait(() => latest.units.length === 104);
  await command("stopBattle");
  await wait(() => latest.roundState.phase === "stopped");
  const stopped = latest.roundState.id;
  await sleep(1500);
  assert.equal(latest.roundState.id, stopped);
  assert.equal(latest.roundState.phase, "stopped");
  await command("resetBattle");
  await wait(() => latest.roundState.phase === "ready");
  await sleep(500);
  assert.equal(latest.roundState.phase, "ready");
  await command("startBattle");
  await wait(() => latest.roundState.phase === "combat");
  console.log("Owner security and lifecycle passed");
  const liveProbeStart = Date.now();
  const liveResponse = await ownerContext.request.post(base + "/api/control", {
    data: { action: "connect", username: "pixelwar_offline_probe_20261106" },
    timeout: 20000,
  });
  assert.equal(liveResponse.status(), 400);
  await wait(() => latest.liveConnection.state === "error");
  assert.equal(latest.liveConnection.realBroadcastVerified, false);
  await ownerPage.locator("#connectLive").tap();
  await ownerPage.screenshot({
    path: `artifacts/upgrade-${kit ? "webkit" : "chromium"}-owner-live-error.png`,
  });
  const denied = await context.request.post(base + "/api/admin/music", {
    headers: { "Content-Type": "audio/wav" },
    data: Buffer.alloc(50),
  });
  assert.equal(denied.status(), 401);
  let rateLimited = false;
  for (let i = 0; i < 15; i++) {
    const r = await context.request.post(base + "/api/demo/gift", {
      data: { ...payload, eventId: crypto.randomUUID(), quantity: 1 },
    });
    if (r.status() === 429) rateLimited = true;
  }
  assert.ok(rateLimited);
  assert.deepEqual(errors, []);
  const report = {
    engine: kit
      ? "Linux WebKit touch emulation"
      : "Linux Chromium SwiftShader + CDP touch",
    physicalIPad: false,
    publicDemo: {
      tokenRequired: false,
      isolated: true,
      contributorName: true,
      duplicateProtected: true,
      threeSpawnBands: true,
      rateLimited,
    },
    camera: {
      mouseOrbit: true,
      rightDragPan: true,
      wheel: !kit,
      oneFinger: !kit,
      twoFingerPanAndPinch: !kit,
      reset: true,
      follow: true,
    },
    terrain: grass,
    owner: {
      httpOnly: true,
      sameSite: "Strict",
      csrfRejected: true,
      publicMutationsDenied: true,
    },
    lifecycle: {
      start: true,
      pause: true,
      resume: true,
      stopNoAutoRestart: true,
      resetReady: true,
      idempotentStart: true,
    },
    live: {
      attemptedUsername: "pixelwar_offline_probe_20261106",
      elapsedMs: Date.now() - liveProbeStart,
      connection: latest.liveConnection,
      realBroadcastTested: false,
    },
    errors,
  };
  await writeFile(
    `artifacts/upgrade-report${kit ? "-webkit" : ""}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  await ownerContext.close();
} finally {
  production?.disconnect();
  publicSocket?.disconnect();
  await browser?.close();
  const done = once(server, "exit");
  server.kill("SIGTERM");
  await done;
  await rm(data, { recursive: true, force: true });
}
