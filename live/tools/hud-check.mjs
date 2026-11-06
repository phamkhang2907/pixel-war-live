import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { io } from "socket.io-client";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
const data = await mkdtemp("/tmp/pw-hud-"),
  port = 3165,
  base = `http://127.0.0.1:${port}`,
  token = "isolated-hud";
let browser, socket, latest;
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
async function cmd(action, p = {}) {
  const r = await fetch(base + "/api/control", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({ action, ...p }),
  });
  assert.equal(r.status, 200, await r.text());
}
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
  await cmd("cameraScenario", { scenario: "balanced", count: 50 });
  await cmd("pause");
  const cfg = await fetch(base + "/api/config", {
    headers: { Authorization: "Bearer " + token },
  }).then((r) => r.json());
  await cmd("giftMappings", {
    mappings: cfg.giftMappings.map((r) =>
      r.key === "heavy-tier"
        ? { ...r, giftName: "Heavy Demo", enabled: true }
        : r.key === "giant-tier"
          ? { ...r, giftName: "Giant Demo", enabled: true }
          : r,
    ),
  });
  const names = [
    ["Astra", "Kael", "Ember"],
    ["Luna", "Orion", "Nova"],
  ];
  for (const team of [0, 1])
    for (let i = 0; i < 6; i++)
      await cmd("demoGift", {
        team,
        name: names[team][i % 3],
        coins: [1, 10, 50, 100, 200, 1000][i],
        count: 2,
        giftName: [
          "Rose",
          "Finger Heart",
          "Doughnut",
          "Perfume",
          "Heavy Demo",
          "Giant Demo",
        ][i],
        avatar: "/assets/ui/kit/IMG_4974.PNG",
      });
  // Pause now holds deployment too. Deploy accepted gifts before freezing the HUD fixture.
  await cmd("resumeBattle");
  for (
    let i = 0;
    i < 100 &&
    !(latest?.units.length >= 90 && latest.summonQueue.pending === 0);
    i++
  )
    await sleep(50);
  assert.ok(latest?.units.length >= 90);
  await cmd("pauseBattle");
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
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1920 },
  });
  page.setDefaultTimeout(60000);
  const errors = [],
    failures = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(base + "/3d/?live=1&overlay=1&debug=1");
  await page.waitForFunction(
    () => window.__PW3D?.inspect().assets.rendered >= 90,
  );
  await page.locator("#quality").evaluate((s) => {
    s.value = "low";
    s.dispatchEvent(new Event("change"));
  });
  await page.waitForFunction(() =>
    document.querySelector("#redPlayers").textContent.includes("Astra"),
  );
  await page.waitForFunction(
    () => [...document.querySelectorAll("#battleHud image")].length > 15,
  );
  await sleep(800);
  await mkdir("artifacts", { recursive: true });
  assert.equal(
    await page.locator("#totalBattleScore").innerText(),
    latest.teamScore.reduce((a, b) => a + b, 0).toLocaleString(),
  );
  for (const [team, c] of ["red", "blue"].entries())
    for (const k of ["sword", "archer", "cavalry", "mage", "guardian", "boss"])
      assert.equal(
        Number(await page.locator(`#troop-${c}-${k}`).innerText()),
        latest.units.filter(
          (u) =>
            u.team === team &&
            u.hp > 0 &&
            (u.type === k || (k === "guardian" && u.type === "mushroomKing")),
        ).length,
      );
  assert.equal(await page.locator("#rankingPanel").isVisible(), false);
  for (const [team, c] of ["red", "blue"].entries()) {
    assert.equal(
      await page.locator("#" + c + "Hp").innerText(),
      Math.ceil(latest.castles[team]).toLocaleString() + " HP",
    );
    assert.equal(
      await page.locator("#" + c + "Score").innerText(),
      latest.teamScore[team].toLocaleString(),
    );
    assert.equal(await page.locator("#" + c + "Bar").isVisible(), false);
  }
  const seconds = Math.ceil(latest.roundState.remaining);
  assert.equal(
    await page.locator("#timer").innerText(),
    String(Math.floor(seconds / 60)).padStart(2, "0") +
      ":" +
      String(seconds % 60).padStart(2, "0"),
  );
  assert.equal(await page.locator(".faction-players .contributor").count(), 6);
  assert.ok(
    (await page.locator(".hud-assembly").boundingBox()).height <=
      1920 * 0.35 + 2,
  );
  await page.screenshot({ path: "artifacts/grok-hud-1080x1920.png" });
  for (const scope of ["round", "weekly", "monthly"]) {
    await page.locator(`[data-board="${scope}"]`).click();
    await page.locator("#rankingPanel").waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#rankingRows li").count(),
      latest.hud.boards[scope].length,
    );
    assert.deepEqual(
      await page.locator("#rankingRows .contributor-name").allTextContents(),
      latest.hud.boards[scope].map((p) => p.name),
    );
    assert.deepEqual(
      await page.locator("#rankingRows li>strong").allTextContents(),
      latest.hud.boards[scope].map((p) => p.points.toLocaleString() + " XP"),
    );

    await page.screenshot({ path: `artifacts/grok-hud-${scope}.png` });
    await page.locator("#closeRanking").click();
  }
  await cmd("demoGift", {
    team: 0,
    name: "New Summoner",
    giftName: "Giant Demo",
    coins: 1000,
    count: 1,
  });
  await page.waitForFunction(() =>
    [...document.querySelectorAll("#nativeGiftNotices .native-viewer")].some(
      (n) => n.textContent === "New Summoner",
    ),
  );
  await page.screenshot({ path: "artifacts/grok-hud-gift.png" });
  for (const size of [
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
  ]) {
    await page.setViewportSize(size);
    await sleep(250);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const b = await page.locator("#stage").boundingBox();
    assert.ok(Math.abs(b.width / b.height - 9 / 16) < 0.002);
    await page.screenshot({ path: `artifacts/grok-hud-${size.width}.png` });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  await writeFile(
    "artifacts/hud-report.json",
    JSON.stringify(
      {
        browser: await browser.version(),
        platform: "Linux headless Chromium / SwiftShader",
        errors,
        failures,
        totalScore: latest.teamScore,
        people: latest.hud.teams,
        boards: latest.hud.boards,
      },
      null,
      2,
    ),
  );
  console.log(
    "HUD real Socket.IO scores, HP/timer, 12 troop counts, avatars, round/weekly/monthly rankings, gift notice and portrait/mobile screenshots PASS",
  );
} finally {
  socket?.disconnect();
  await browser?.close();
  server.kill("SIGTERM");
  await sleep(1600);
  await rm(data, { recursive: true, force: true });
}
