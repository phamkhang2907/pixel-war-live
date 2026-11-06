import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { io } from "socket.io-client";
import assert from "node:assert/strict";
import { DEFAULT_GIFT_MAPPINGS } from "../src/gifts.js";
const data = await mkdtemp("/tmp/pw-full3d-"),
  port = 3172,
  base = `http://127.0.0.1:${port}`,
  token = "isolated-full3d";
let browser, socket, latest;
// Upgrade an existing owner's saved registry, rather than testing only fresh data.
await writeFile(
  data + "/gift-mappings.json",
  JSON.stringify([
    ...DEFAULT_GIFT_MAPPINGS.filter((r) => r.key !== "dragon-flame"),
    {
      key: "owner-custom",
      giftId: "",
      giftName: "Owner Custom",
      type: "archer",
      count: 7,
      enabled: false,
    },
  ]),
);
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
async function wait(fn, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await sleep(50);
  }
  throw Error("Server wait timed out");
}
async function api(action, p = {}, allowed = [200]) {
  const start = performance.now();
  const r = await fetch(base + "/api/control", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({ action, ...p }),
  });
  const result = await r.json();
  assert.ok(
    allowed.includes(r.status),
    `${action}: ${r.status} ${JSON.stringify(result)}`,
  );
  return { ...result, status: r.status, ms: performance.now() - start };
}
const config = () =>
  fetch(base + "/api/config", {
    headers: { Authorization: "Bearer " + token },
  }).then((r) => r.json());
try {
  await wait(() =>
    fetch(base + "/health")
      .then((r) => r.ok)
      .catch(() => false),
  );
  const migrated = (await config()).giftMappings;
  assert.equal(migrated.find((r) => r.key === "owner-custom").count, 7);
  assert.deepEqual(
    migrated
      .filter((r) => r.key === "dragon-flame")
      .map((r) => [r.giftId, r.enabled, r.pendingVerification]),
    [["7610", false, true]],
  );
  socket = io(base);
  socket.on("state", (s) => (latest = s));
  await api("cameraScenario", { scenario: "balanced", count: 50 });
  await api("pause");
  assert.equal((await fetch(base + "/")).url, base + "/3d/");
  assert.equal((await fetch(base + "/legacy/")).status, 410);
  for (const p of ["/app.js", "/arena.js", "/assets/army-atlas.png"])
    assert.equal((await fetch(base + p)).status, 404);
  assert.equal((await fetch(base + "/api/config")).status, 401);
  browser = await chromium.launch({
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
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [],
    failures = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(base + "/3d/?live=1&overlay=1&debug=1");
  await page.waitForFunction(
    () => window.__PW3D?.inspect().assets.rendered >= 50,
  );
  await mkdir("artifacts", { recursive: true });
  assert.equal(await page.locator("#roundResults").isVisible(), false);
  assert.equal(await page.locator("#rankingPanel").isVisible(), false);
  for (const scope of ["round", "weekly", "monthly"]) {
    await page.locator(`[data-board="${scope}"]`).click();
    await page.locator("#rankingPanel").waitFor({ state: "visible" });
    await page.locator("#closeRanking").click();
    assert.equal(await page.locator("#rankingPanel").isVisible(), false);
  }
  await page.locator("[data-board=round]").click();
  await page
    .locator("#rankingBackdrop")
    .click({ position: { x: 30, y: 1100 } });
  assert.equal(await page.locator("#rankingPanel").isVisible(), false);
  assert.equal(
    (await page.evaluate(() => window.__PW3D.inspect())).audio.context,
    "locked",
  );
  await page.locator("#soundToggle").click();
  await page.waitForFunction(
    () =>
      window.__PW3D.inspect().audio.context === "running" &&
      window.__PW3D.inspect().audio.buffers === 16,
  );
  await page.evaluate(() => document.body.classList.remove("overlay"));
  await page.request.post(base + "/owner/login", { form: { password: token } });
  await page.goto(base + "/3d/?live=1&admin=1&debug=1");
  await page.locator("#adminWorkspace").waitFor({ state: "visible" });
  await page.locator("#soundToggle").click();
  await page.waitForFunction(
    () => window.__PW3D.inspect().audio.buffers === 16,
  );
  await api("resumeBattle");
  const rows = page.locator(".gift-mapping");
  assert.equal(await rows.count(), 11);
  await rows.nth(4).locator("[data-field=giftId]").fill("900001");
  await rows.nth(4).locator("[data-field=enabled]").check();
  await rows.nth(5).locator("[data-field=giftId]").fill("900002");
  await rows.nth(5).locator("[data-field=enabled]").check();
  await page.locator("#saveGiftMappings").click();
  await wait(async () => (await config()).giftMappings[4].giftId === "900001");
  await page.selectOption("#audioTeam", "1");
  await page.evaluate(() => document.body.classList.add("overlay"));
  for (const [team, giftName, count, giftId] of [
    [0, "Rose", 1, ""],
    [1, "Finger Heart", 2, ""],
    [0, "Doughnut", 1, ""],
    [1, "Perfume", 2, ""],
    [0, "Demo Heavy", 2, "900001"],
    [1, "Demo Giant", 1, "900002"],
  ])
    await api("demoGift", {
      team,
      name: "Mapped " + giftName,
      giftName,
      count,
      giftId,
      coins: 0,
    });
  await wait(
    () =>
      latest?.summonQueue.pending === 0 &&
      latest.units.some((u) => u.type === "boss"),
  );
  assert.equal(latest.units.filter((u) => u.type === "guardian").length, 0);
  assert.ok(latest.units.some((u) => u.type === "boss"));
  assert.ok(latest.units.some((u) => u.type === "cavalry"));
  await api("pause");
  await page.evaluate(() =>
    document.querySelector("[data-camera=front]").click(),
  );
  await sleep(2300);
  const combat = await page.evaluate(() => window.__PW3D.inspect());
  await page.screenshot({ path: "artifacts/full3d-combat-1080x1920.png" });
  assert.ok(combat.audio.played > 1);
  await api("roundConfig", {
    config: { duration: 5, prepare: 0, final: 1, results: 7, countdown: 0 },
  });
  await api("newRound");
  for (let i = 0; i < 10; i++)
    await api("demoGift", {
      team: i % 2,
      name: "Contributor " + (i + 1),
      giftName: "Rose",
      coins: 1,
      eventId: "round-gift-" + i,
      avatar: "/assets/ui/kit/IMG_4974.PNG",
    });
  await api("likes", { team: 0, name: "Red Fury", count: 500 });
  await wait(() => latest?.roundState.phase === "results");
  const result = structuredClone(latest.roundState.result),
    resultArrived = Date.now();
  assert.equal(result.winner, 0);
  assert.equal(result.top10.length, 10);
  await page.locator("#roundResults").waitFor({ state: "visible" });
  const uiDelay = Date.now() - resultArrived;
  assert.match(
    await page.locator("#resultWinner").innerText(),
    /RED KINGDOM WINS/,
  );
  assert.deepEqual(
    await page.locator("#resultRows .contributor-name").allTextContents(),
    result.top10.map((p) => p.name),
  );
  assert.deepEqual(
    await page.locator("#resultRows li>strong").allTextContents(),
    result.top10.map((p) => p.points.toLocaleString() + " XP"),
  );
  assert.equal(await page.locator("#rankingPanel").isVisible(), false);
  const resultBefore = await page.evaluate(() => window.__PW3D.inspect());
  await page.screenshot({ path: "artifacts/full3d-results-1080x1920.png" });
  await api(
    "demoGift",
    { team: 0, name: "Too Late", giftName: "Rose", eventId: "late-gift" },
    [200],
  );
  await api("demoGift", {
    team: 0,
    name: "Contributor 1",
    giftName: "Rose",
    eventId: "round-gift-0",
  });
  await context.setOffline(true);
  await sleep(300);
  await context.setOffline(false);
  await sleep(600);
  assert.equal(
    await page.locator("#roundResults").getAttribute("data-presentations"),
    "1",
  );
  const resultDuring = await page.evaluate(() => window.__PW3D.inspect());
  assert.ok(
    resultDuring.totalFrames > resultBefore.totalFrames,
    "background RAF continues during results",
  );
  assert.ok(
    resultDuring.assets.instances.some(
      (p, i) => p.time !== resultBefore.assets.instances[i]?.time,
    ),
    "idle skeletons continue during results",
  );
  await wait(() => latest?.roundState.id !== result.id);
  await page.locator("#roundResults").waitFor({ state: "hidden" });
  const durationMs = Date.now() - resultArrived;
  assert.ok(
    durationMs >= 6000 && durationMs < 9500,
    `Results wall duration ${durationMs}ms`,
  );
  assert.equal(await page.locator("#rankingPanel").isVisible(), false);
  assert.ok(latest.hud.boards.round.every((p) => p.name === "Too Late"));
  assert.ok(latest.hud.boards.weekly.length > 0);
  assert.ok(latest.hud.boards.monthly.length > 0);
  assert.equal(
    (
      await api("demoGift", {
        team: 0,
        name: "Too Late",
        giftName: "Rose",
        eventId: "late-gift",
      })
    ).duplicate,
    true,
  );
  const history = await fetch(base + "/api/history", {
    headers: { Authorization: "Bearer " + token },
  }).then((r) => r.json());
  assert.equal(history.rounds.filter((r) => r.id === result.id).length, 1);
  await api("roundConfig", {
    config: { duration: 300, prepare: 0, final: 30, results: 7, countdown: 0 },
  });
  await api("newRound");
  await sleep(1050);
  const spam = [];
  for (let i = 0; i < 24; i++)
    spam.push(
      await api(
        "demoGift",
        {
          team: i % 2,
          name: "Spam " + i,
          giftName: "Finger Heart",
          count: 50,
          eventId: "spam-" + i,
        },
        [200, 409, 429],
      ),
    );
  await wait(() => latest?.units.length >= 100);
  const health = await fetch(base + "/health").then((r) => r.json());
  assert.ok(latest.units.length <= 1004);
  assert.ok(latest.summonQueue.pending > 0);
  assert.ok(spam.every((r) => r.status === 200));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () => window.__PW3D.inspect().assets.rendered === 1004,
    {},
    { timeout: 120000 },
  );
  await sleep(1500);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  const stress = await page.evaluate(() => window.__PW3D.inspect());
  const steady = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = (now) => {
          frames++;
          if (now - start >= 3000)
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
  await page.screenshot({ path: "artifacts/full3d-mobile.png" });
  assert.ok(stress.audio.activeVoices <= 12);
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  const report = {
    browser: await browser.version(),
    device:
      "Linux Chromium / SwiftShader; portrait touch emulation, NOT physical iPad",
    viewport: { width: 1080, height: 1920 },
    results: {
      id: result.id,
      winner: result.winner,
      top10: result.top10,
      uiDelayMs: uiDelay,
      observedDurationMs: durationMs,
      framesDuringResults: resultDuring.totalFrames - resultBefore.totalFrames,
      presentations: 1,
    },
    combat: {
      fps: combat.fps,
      units: combat.units,
      drawCalls: combat.drawCalls,
      drawingBuffer: combat.drawingBuffer,
      independentSkeletons: combat.assets.independentSkeletons,
      bakedLod: combat.assets.bakedLod,
    },
    stress: {
      requests: spam.length,
      accepted: spam.filter((r) => r.status === 200).length,
      rejected: spam.filter((r) => r.status !== 200).length,
      maxApiLatencyMs: Math.max(...spam.map((r) => r.ms)),
      server: health.performance,
      queue: latest.summonQueue,
      units: latest.units.length,
      rendered: stress.assets.rendered,
      fps: steady.fps,
      sampling: steady,
      audio: stress.audio,
      drawingBuffer: stress.drawingBuffer,
      independentSkeletons: stress.assets.independentSkeletons,
      bakedLod: stress.assets.bakedLod,
    },
    errors,
    failures,
  };
  await writeFile(
    "artifacts/full3d-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  console.log(
    "3D gameplay, results/reconnect, mappings, spam bounds, audio gesture, retired legacy, dark terrain screenshots PASS",
  );
} finally {
  socket?.disconnect();
  await browser?.close();
  server.kill("SIGTERM");
  await sleep(1800);
  await rm(data, { recursive: true, force: true });
}
