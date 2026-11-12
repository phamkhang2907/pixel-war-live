import { isolatedFixture } from "./isolated-fixture.mjs";
import { chromium, webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { io } from "socket.io-client";
const kit = process.env.NATIVE_ENGINE === "webkit",
  base = "http://127.0.0.1:3208",
  token = "isolated-native-effects",
  data = await mkdtemp("/tmp/pw-nativefx-");
isolatedFixture(data);
const server = spawn(process.execPath, ["src/server.js"], {
    env: { ...process.env, PORT: "3208", DATA_DIR: data, ADMIN_TOKEN: token },
    stdio: "ignore",
  }),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser, socket, latest;
let releaseSlowModel = () => {};
async function wait(f) {
  for (let i = 0; i < 600; i++) {
    if (await f()) return;
    await sleep(100);
  }
  throw Error("Timed out");
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
try {
  await wait(() =>
    fetch(base + "/health")
      .then((r) => r.ok)
      .catch(() => false),
  );
  socket = io(base);
  socket.on("state", (s) => (latest = s));
  await wait(() => latest);
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
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  page.setDefaultTimeout(120000);
  const errors = [],
    videos = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("request", (r) => {
    if (/\.(mp4|webm|mov)([?#]|$)/i.test(r.url())) videos.push(r.url());
  });
  await command("roundConfig", { config: { prepare: 0 } });
  await command("newRound");
  await page.goto(base + "/3d/?live=1&debug=1&overlay=1");
  await page.waitForFunction(
    () =>
      window.__PW3D?.inspect().assets.ready &&
      window.__PW3D.inspect().monsters.rendered === 4,
  );
  await page.locator("[data-camera=red]").evaluate((b) => b.click());
  await page.waitForFunction(() => {
    const d = window.__PW3D.inspect();
    return d.mode === "red" && Math.abs(d.x - d.targetX) < 1;
  });
  await mkdir("artifacts", { recursive: true });
  const prefix = "native-" + (kit ? "webkit" : "chromium");
  await command("demoGift", {
    team: 0,
    name: "Native Viewer",
    giftName: "Finger Heart",
    count: 3,
    eventId: "native-viewer-event",
    avatar: "/assets/ui/kit/IMG_4974.PNG",
    giftIcon: "/assets/ui/kit/IMG_4974.PNG",
  });
  // Capture the transient DOM and world effect in one frame. Separate browser
  // round trips can outlive a 1.7 s wave on a loaded software GPU.
  const armyFrame = await page.waitForFunction(() => {
    const summons = window.__PW3D.inspect().summons;
    const viewer = document.querySelector("#nativeGiftNotices .native-viewer");
    if (
      viewer?.textContent !== "Native Viewer" ||
      !summons.visibleNameplates.some(
        (p) => p.name === "Native Viewer" && p.count === 15,
      )
    )
      return false;
    return {
      summons,
      quantity: document.querySelector(
        "#nativeGiftNotices .native-gift-quantity",
      )?.textContent,
      avatar: document
        .querySelector("#nativeGiftNotices .native-avatar img")
        ?.getAttribute("src"),
      icon: document
        .querySelector("#nativeGiftNotices .native-gift-icon img")
        ?.getAttribute("src"),
    };
  });
  const frame = await armyFrame.jsonValue();
  await armyFrame.dispose();
  assert.equal(frame.quantity, "×3");
  assert.equal(frame.avatar, base + "/assets/ui/kit/IMG_4974.PNG");
  assert.equal(frame.icon, base + "/assets/ui/kit/IMG_4974.PNG");
  const army = frame.summons;
  await page.screenshot({ path: `artifacts/${prefix}-army-1080x1920.png` });
  assert.equal(latest.units.filter((u) => u.type === "sword").length, 15);
  await wait(() =>
    latest.units.some((u) => u.name === "Native Viewer" && u.state === "run"),
  );
  for (let k = 0; k < 4; k++)
    await command("demoGift", {
      team: 0,
      name: "Rapid Viewer",
      giftName: "Rose",
      count: 1,
      eventId: "native-repeat-" + k,
    });
  await page.waitForFunction(
    () => window.__PW3D.inspect().summons.combinedNotifications > 0,
  );
  const combined = await page.evaluate(() => window.__PW3D.inspect().summons);
  assert.ok(
    combined.activeWaves <= 8 &&
      combined.activeToasts <= 2 &&
      combined.particles <= 240,
  );
  // A backlog must never announce the previous round's viewers in a new round.
  await Promise.all(
    Array.from({ length: 12 }, (_, k) =>
      command("demoGift", {
        team: 0,
        name: "Round backlog " + k,
        giftName: "Rose",
        count: 1,
        eventId: "round-backlog-" + k,
      }),
    ),
  );
  await page.waitForFunction(
    () => window.__PW3D.inspect().summons.queuedToasts > 0,
  );
  await wait(
    () =>
      latest.units.filter((u) => u.name.startsWith("Round backlog ")).length ===
        60 && latest.summonQueue.pending === 0,
  );
  const backlog = await page.evaluate(() => window.__PW3D.inspect().summons);
  const oldRound = latest.roundState.id;
  await command("newRound");
  await page.waitForFunction(
    (id) => window.__PW3D.inspect().roundState.id !== id,
    oldRound,
  );
  const roundReset = await page.evaluate(() => window.__PW3D.inspect().summons);
  assert.equal(
    roundReset.activeToasts,
    0,
    "old-round cards must be cleared immediately",
  );
  assert.equal(roundReset.queuedToasts, 0, "old-round backlog must be cleared");
  assert.equal(
    roundReset.activeWaves,
    0,
    "old-round summon waves must be cleared",
  );
  assert.equal(
    await page.locator("#nativeGiftNotices article:not([hidden])").count(),
    0,
  );
  await command("demoGift", {
    team: 0,
    name: "Fresh round viewer",
    giftName: "Rose",
    count: 1,
    eventId: "fresh-round-gift",
  });
  await page.waitForFunction(
    () =>
      document.querySelector(
        "#nativeGiftNotices article:not([hidden]) .native-viewer",
      )?.textContent === "Fresh round viewer",
  );
  await page.screenshot({
    path: `artifacts/${prefix}-fresh-round-1080x1920.png`,
  });
  await page.waitForFunction(
    () => window.__PW3D.inspect().summons.activeWaves === 0,
  );
  await page.locator("[data-camera=blue]").evaluate((b) => b.click());
  await page.waitForFunction(() => {
    const d = window.__PW3D.inspect();
    return d.mode === "blue" && Math.abs(d.x - d.targetX) < 1;
  });
  await wait(
    () =>
      latest.units.some((u) => u.name === "Fresh round viewer") &&
      latest.summonQueue.pending === 0,
  );
  // Delay a real model response: old waves must expire while rendering waits.
  await command("newRound");
  const modelGate = new Promise((resolve) => {
    releaseSlowModel = resolve;
  });
  await page.route(
    "**/MushroomKing.gltf",
    async (route) => {
      await modelGate;
      await route.continue();
    },
    { times: 1 },
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      window.__PW3D?.inspect().connectedState &&
      window.__PW3D.inspect().monsters.reports.MushroomKing?.status ===
        "loading",
  );
  await command("demoGift", {
    team: 0,
    name: "Slow model viewer",
    giftName: "Rose",
    count: 1,
    eventId: "slow-model-gift",
  });
  await page.waitForFunction(
    () => window.__PW3D.inspect().summons.waitingWaves > 0,
  );
  const waiting = await page.evaluate(() => window.__PW3D.inspect().summons);
  await page.waitForFunction(
    () => window.__PW3D.inspect().summons.waitingWaves === 0,
  );
  releaseSlowModel();
  await page.waitForFunction(
    () =>
      window.__PW3D.inspect().assets.ready &&
      window.__PW3D.inspect().monsters.rendered === 4,
  );
  const afterSlowLoad = await page.evaluate(
    () => window.__PW3D.inspect().summons,
  );
  assert.equal(
    afterSlowLoad.activeWaves,
    0,
    "expired portals must not replay after loading",
  );
  assert.equal(
    afterSlowLoad.receivedNotifications,
    waiting.receivedNotifications,
    "repeated snapshots must not repeat the gift",
  );
  await wait(
    () =>
      latest.units.filter((u) => u.name === "Slow model viewer").length === 5,
  );
  assert.equal(
    latest.units.length,
    9,
    "expired cosmetics cannot remove the actual soldier or four defenders",
  );
  // Public Demo buttons remain unauthenticated; production mappings remain private.
  await page.goto(base + "/3d/?demo=1&debug=1&overlay=1");
  await page.waitForFunction(
    () =>
      window.__PW3D?.inspect().assets.ready &&
      window.__PW3D.inspect().monsters.rendered === 4,
  );
  await page.locator("[data-camera=red]").evaluate((b) => b.click());
  await page.waitForFunction(() => {
    const d = window.__PW3D.inspect();
    return d.mode === "red" && Math.abs(d.x - d.targetX) < 1;
  });
  // Open the existing dialog programmatically because the capture mode hides toolbar buttons.
  await page.locator("#sendDemoGift").evaluate((b) => b.click());
  await page.locator("#publicUsername").fill("Frost Summoner");
  await page.locator("#publicTeam").selectOption("0");
  await page.locator('[data-demo-monster="Demo Lion"]').tap();
  await page.locator("[data-close=demoGiftPanel]").tap();
  await page.waitForFunction(
    () =>
      window.__PW3D.inspect().summons.dragonPortals === 1 &&
      window.__PW3D
        .inspect()
        .monsters.instances.some((i) => i.model.includes("frostDragon")),
  );
  const frost = await page.evaluate(() => window.__PW3D.inspect().summons);
  await page.screenshot({
    path: `artifacts/${prefix}-frost-portal-1080x1920.png`,
  });
  await page.waitForFunction(
    () => window.__PW3D.inspect().summons.activeWaves === 0,
  );
  await page.locator("[data-camera=blue]").evaluate((b) => b.click());
  await page.waitForFunction(() => {
    const d = window.__PW3D.inspect();
    return d.mode === "blue" && Math.abs(d.x - d.targetX) < 1;
  });
  await page.locator("#sendDemoGift").evaluate((b) => b.click());
  await page.locator("#publicUsername").fill("Fire Summoner");
  await page.locator("#publicTeam").selectOption("1");
  await page.locator('[data-demo-monster="Demo Dragon"]').tap();
  await page.locator("[data-close=demoGiftPanel]").tap();
  await page.waitForFunction(
    () =>
      window.__PW3D.inspect().summons.dragonPortals === 1 &&
      window.__PW3D
        .inspect()
        .monsters.instances.some((i) => i.model.includes("fireDragon")),
  );
  const fire = await page.evaluate(() => window.__PW3D.inspect().summons);
  await page.screenshot({
    path: `artifacts/${prefix}-fire-portal-1080x1920.png`,
  });
  assert.equal(await page.locator("video").count(), 0);
  assert.deepEqual(videos, []);
  assert.deepEqual(errors, []);
  const report = {
    engine: kit ? "Linux WebKit / llvmpipe" : "Linux Chromium / SwiftShader",
    physicalIPad: false,
    army,
    combined,
    backlog,
    roundReset,
    waiting,
    afterSlowLoad,
    frost,
    fire,
    errors,
    videoRequests: videos,
    avatarCorrect: true,
    giftQuantity: 3,
    troopsDeployed: 15,
    correctNameplate: true,
    running: true,
    onlyNativeEffects: true,
  };
  await writeFile(
    `artifacts/${prefix}-report.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  releaseSlowModel();
  socket?.close();
  await browser?.close();
  const exited = new Promise((r) => server.once("exit", r));
  server.kill("SIGTERM");
  await Promise.race([exited, sleep(3000)]);
  await rm(data, { recursive: true, force: true });
}
