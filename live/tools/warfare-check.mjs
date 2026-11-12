import { chromium, webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { io } from "socket.io-client";
import assert from "node:assert/strict";
const kit = process.env.WARFARE_ENGINE === "webkit",
  port = 3220,
  base = `http://127.0.0.1:${port}`,
  token = "isolated-warfare",
  data = await mkdtemp("/tmp/pw-heart-war-");
const server = spawn(process.execPath, ["src/server.js"], {
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: data,
    ADMIN_TOKEN: token,
  },
  stdio: "ignore",
});
let browser, socket, demo, latest, ds, page;
const errors = [];
const transitions = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(fn, ms = 90000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await sleep(50);
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
  const b = await r.json();
  assert.equal(r.status, 200, JSON.stringify(b));
  return b;
};
try {
  await wait(() =>
    fetch(base + "/health")
      .then((r) => r.ok)
      .catch(() => false),
  );
  socket = io(base);
  socket.on("state", (s) => {
    if (
      !latest ||
      s.roundState.id !== latest.roundState.id ||
      s.roundState.phase !== latest.roundState.phase
    )
      transitions.push({
        id: s.roundState.id,
        phase: s.roundState.phase,
        at: s.serverNow,
      });
    latest = s;
  });
  demo = io(base + "/demo");
  demo.on("state", (s) => (ds = s));
  await wait(() => latest && ds);
  await command("pauseBattle");
  assert.equal(latest.units.filter((u) => u.origin === "baseline").length, 300);
  assert.deepEqual(latest.castles, [500000, 500000]);
  assert.equal(latest.roundState.duration, 600);
  assert.equal(latest.units.filter((u) => u.flyby).length, 0);
  const manifest = JSON.parse(
    await readFile("assets/audio/uploaded-manifest.json", "utf8"),
  );
  const files = Array.isArray(manifest) ? manifest : manifest.sounds;
  for (const f of files) {
    const name = f.file ?? f.filename;
    const res = await fetch(base + "/assets/audio/" + name);
    assert.equal(res.status, 200, name);
    const b = Buffer.from(await res.arrayBuffer());
    assert.equal(createHash("sha256").update(b).digest("hex"), f.sha256);
  }
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
          "--autoplay-policy=user-gesture-required",
        ],
      });
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  page = await context.newPage();
  page.setDefaultTimeout(120000);

  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(r.status() + " " + r.url());
  });
  await page.goto(base + "/3d/?live=1&debug=1");
  await page.waitForFunction(
    () =>
      window.__PW3D?.inspect().assets.ready &&
      window.__PW3D.inspect().monsters.rendered === 4 &&
      window.__PW3D.inspect().particles.status === "ready",
  );
  assert.equal(
    (await page.evaluate(() => window.__PW_AUDIO.inspect())).context,
    "locked",
  );
  await page.locator("#soundToggle").tap();
  await page.waitForFunction(
    () =>
      window.__PW_AUDIO.inspect().buffers === 32 &&
      window.__PW_AUDIO.inspect().context === "running",
  );
  const beforeHorn =
    (await page.evaluate(() => window.__PW_AUDIO.inspect())).playedSounds[
      "war-horn"
    ] ?? 0;
  await command("newRound");
  await page.waitForFunction(
    (n) => window.__PW_AUDIO.inspect().playedSounds["war-horn"] === n,
    beforeHorn + 1,
  );
  await page.waitForFunction(
    () => window.__PW_AUDIO.inspect().outputRms > 0.0001,
  );
  const horn = await page.evaluate(() => window.__PW_AUDIO.inspect());
  await command("pauseBattle");
  await command("resumeBattle");
  await sleep(350);
  assert.equal(
    (await page.evaluate(() => window.__PW_AUDIO.inspect())).playedSounds[
      "war-horn"
    ],
    beforeHorn + 1,
  );
  console.log(
    "300 starting troops, real MP3 URLs/hashes, unlock, horn + nonzero Web Audio output verified",
  );
  await mkdir("artifacts", { recursive: true });
  const shot = async (path) => {
    await page.evaluate(() => document.body.classList.add("overlay"));
    await page.screenshot({ path });
    await page.evaluate(() => document.body.classList.remove("overlay"));
  };
  const prefix = "warfare-" + (kit ? "webkit" : "chromium");
  await shot(`artifacts/${prefix}-combat-1080x1920.png`);
  const sampleStart = await page.evaluate(() => ({
    frames: window.__PW3D.inspect().totalFrames,
    now: performance.now(),
  }));
  await sleep(5000);
  const metrics = await page.evaluate(() => ({
    ...window.__PW3D.inspect(),
    now: performance.now(),
  }));
  await command("likes", { team: 0, name: "Owner Demo Hearts", count: 300 });
  await page.waitForFunction(
    () =>
      Number(document.querySelector("#heartRed").textContent.split(" / ")[0]) >=
      300,
  );
  await page.waitForFunction(
    () => window.__PW3D.inspect().warfareEffects.warnings > 0,
  );
  await shot(`artifacts/${prefix}-raid-1080x1920.png`);
  await page.waitForFunction(
    () => window.__PW3D.inspect().warfareEffects.bombs > 0,
  );
  console.log(
    "HEART WAR warning rings, falling bombs, native impacts and server phase progress verified",
  );
  // Exact native dragon model path is exercised by the existing owner-only demo scenario.
  await command("monsterScenario", { kind: "breath" });
  await page.waitForFunction(
    () =>
      window.__PW_AUDIO.inspect().playedSounds["fire-roar"] >= 1 &&
      window.__PW_AUDIO.inspect().playedSounds["frost-roar"] >= 1,
  );
  await page.waitForFunction(() =>
    window.__PW3D
      .inspect()
      .monsters.instances.some((i) => /Fast_Flying/.test(i.clip)),
  );
  await page.waitForFunction(
    () =>
      window.__PW3D.inspect().warfareEffects.fire > 0 ||
      window.__PW3D.inspect().warfareEffects.frost > 0,
  );
  await shot(`artifacts/${prefix}-dragons-1080x1920.png`);
  const dragonAudio = await page.evaluate(() => window.__PW_AUDIO.inspect());
  await wait(() => latest.units.every((u) => !u.flyby));
  await page.waitForFunction(
    () => window.__PW3D.inspect().monsters.rendered === 4,
  );
  assert.ok(dragonAudio.activeVoices <= 12);
  assert.ok(
    dragonAudio.durations["fire-roar"] > 8 &&
      dragonAudio.durations["frost-roar"] > 3,
  );
  console.log(
    "Both supplied dragon MP3s triggered during actual animated flyby; dragons exited",
  );
  await page.locator("#masterVolume").fill("0.4");
  await page.locator("#sfxVolume").fill("0.3");
  assert.equal(
    (await page.evaluate(() => window.__PW_AUDIO.inspect())).masterVolume,
    0.4,
  );
  await page.locator("#soundToggle").tap();
  await page.waitForFunction(() => window.__PW_AUDIO.inspect().muted);
  assert.equal(
    (await page.evaluate(() => window.__PW_AUDIO.inspect()))
      .effectiveMasterGain,
    0,
  );
  await page.locator("#soundToggle").tap();
  // Default acceptance is a complete 600s round. A short explicit local diagnostic is optional.
  const roundSeconds = Number(process.env.WARFARE_ROUND_SECONDS || 600);
  if (roundSeconds !== 600)
    await command("roundConfig", {
      config: {
        duration: roundSeconds,
        prepare: 0,
        final: 1,
        results: 7,
        countdown: 0,
      },
    });
  const previousId = latest.roundState.id;
  await command("newRound");
  await wait(() => latest.roundState.id !== previousId);
  const roundId = latest.roundState.id;
  await command("speed", { value: 8 });
  const framesBefore = (await page.evaluate(() => window.__PW3D.inspect()))
    .totalFrames;
  await wait(() => latest.roundState.phase === "results", 100000);
  await page.waitForFunction(
    () => !document.querySelector("#roundResults").hidden,
  );
  const ended = Date.now();
  assert.equal(latest.roundState.result.aborted, false);
  assert.equal(latest.roundState.elapsed, roundSeconds);
  assert.equal(await page.locator("#rankingPanel").isVisible(), false);
  await shot(`artifacts/${prefix}-results-1080x1920.png`);
  await wait(() => latest.roundState.id !== roundId, 15000);
  const resultMs =
    transitions.find((t) => t.id !== roundId && t.at > ended - 1000)?.at -
    transitions.findLast((t) => t.id === roundId && t.phase === "results").at;
  assert.ok(
    resultMs >= 6000 && resultMs <= 8000,
    `Result transition took ${resultMs}ms`,
  );
  await page.waitForFunction(
    () => document.querySelector("#roundResults").hidden,
  );
  assert.ok(
    (await page.evaluate(() => window.__PW3D.inspect())).totalFrames >
      framesBefore,
  );
  assert.equal(await page.locator("#rankingPanel").isVisible(), false);
  await page.locator("[data-board=weekly]").tap();
  assert.equal(await page.locator("#rankingPanel").isVisible(), true);
  await page.locator("#closeRanking").tap();
  assert.equal(await page.locator("#rankingPanel").isVisible(), false);
  console.log(
    `Complete ${roundSeconds}s round, automatic results, 7s wall countdown, next round and manual panels verified`,
  );
  // Visitor actions go to a separate arena, with a stable cookie identity and no token.
  console.log("Loading public Demo");
  await page.goto(base + "/3d/?demo=1&debug=1");
  await page.waitForFunction(() => window.__PW3D?.inspect().assets.ready);
  console.log("Public Demo models ready");
  await page.locator("#sendDemoGift").tap();
  await page.locator("#publicUsername").fill("Demo Supporter");
  const joinResponse = page.waitForResponse((r) =>
    r.url().endsWith("/api/demo/action"),
  );
  await page.locator('[data-demo-action=join][data-team="0"]').tap();
  const joined = await joinResponse;
  assert.equal(joined.status(), 200, await joined.text());
  console.log("Public join accepted");
  await page.waitForFunction(() =>
    document
      .querySelector("#publicGiftStatus")
      .textContent.includes("Joined RED"),
  );
  const action = async (a) => {
    const r = await context.request.post(base + "/api/demo/action", {
      data: {
        action: a,
        team: 0,
        username: "Demo Supporter",
        eventId: randomUUID(),
      },
    });
    assert.equal(r.status(), 200);
    return r.json();
  };
  const like = await action("likes10");
  assert.equal(like.quantity, 1);
  assert.equal(like.remainder, 0);
  const gift = {
    team: 0,
    username: "Demo Supporter",
    giftName: "Rose",
    quantity: 1,
    eventId: randomUUID(),
  };
  const sent = await context.request.post(base + "/api/demo/gift", {
    data: gift,
  });
  assert.equal((await sent.json()).queued, 5);
  assert.equal(
    (
      await (
        await context.request.post(base + "/api/demo/gift", { data: gift })
      ).json()
    ).duplicate,
    true,
  );
  await wait(() =>
    ds.units.some(
      (u) => u.name === "Demo Supporter" && u.origin === "demoGift",
    ),
  );
  assert.ok(ds.hud.boards.round.some((p) => p.name === "Demo Supporter"));
  const boards = await fetch(base + "/api/leaderboards").then((r) => r.json());
  assert.ok(!boards.live.some((p) => /^(public:|demo:)/.test(p.id)));
  await page.locator("[data-close=demoGiftPanel]").tap();
  await page.waitForFunction(
    () => window.__PW3D.inspect().summons.receivedNotifications > 0,
  );
  await shot(`artifacts/${prefix}-demo-1080x1920.png`);
  assert.deepEqual(errors, []);
  const report = {
    engine: kit ? "Linux WebKit touch emulation" : "Linux Chromium SwiftShader",
    physicalIPad: false,
    realTikTokBroadcast: false,
    startingUnits: 304,
    defaultDuration: 600,
    testedRoundSeconds: roundSeconds,
    resultMs,
    mp3HashesVerified: files.length,
    audioHorn: horn,
    audioDragons: dragonAudio,
    performance: {
      units: metrics.units,
      fps:
        ((metrics.totalFrames - sampleStart.frames) * 1000) /
        (metrics.now - sampleStart.now),
      drawCalls: metrics.drawCalls,
      triangles: metrics.triangles,
      heap: metrics.jsHeapBytes,
      buffer: metrics.drawingBuffer,
    },
    errors,
  };
  await writeFile(
    `artifacts/${prefix}-report.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      engine: report.engine,
      performance: report.performance,
      resultMs,
      errors,
    }),
  );
} catch (error) {
  console.log("Browser failure", String(error), errors);
  if (page) {
    console.log(
      await page
        .evaluate(() => ({
          url: location.href,
          error: document.querySelector("#error")?.textContent,
          status: document.querySelector("#publicGiftStatus")?.textContent,
          diagnostics: window.__PW3D?.inspect(),
        }))
        .catch(() => ({ unavailable: true })),
    );
    await page
      .screenshot({ path: "artifacts/warfare-failure.png", timeout: 10000 })
      .catch(() => {});
  }
  throw error;
} finally {
  socket?.disconnect();
  demo?.disconnect();
  await browser?.close();
  const exited = new Promise((r) => server.once("exit", r));
  server.kill("SIGTERM");
  await exited;
  await rm(data, { recursive: true, force: true });
}
