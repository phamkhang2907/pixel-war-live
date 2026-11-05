import { existsSync } from "node:fs";
import { chromium, webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { io } from "socket.io-client";
import assert from "node:assert/strict";
process.chdir(fileURLToPath(new URL("../", import.meta.url)));
const engine = process.env.BROWSER || "chromium",
  port = process.env.TEST_PORT || "3106",
  base = `http://127.0.0.1:${port}`,
  token = "vertical-test",
  headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + token,
  };
const data = await mkdtemp(join(tmpdir(), "pixel-vertical-"));
const server = spawn(process.execPath, ["src/server.js"], {
  env: { ...process.env, PORT: port, ADMIN_TOKEN: token, DATA_DIR: data },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
server.stdout.on("data", (d) => (logs += d));
server.stderr.on("data", (d) => (logs += d));
let browser, socket, latest;
const wait = async (fn, timeout = 15000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw Error("Vertical check timeout");
};
const cmd = async (action, params = {}) => {
  const res = await fetch(base + "/api/control", {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...params }),
  });
  assert.equal(res.status, 200, await res.text());
};
try {
  await wait(() =>
    fetch(base + "/health")
      .then((r) => r.ok)
      .catch(() => false),
  );
  browser = await (engine === "webkit" ? webkit : chromium).launch(
    engine === "webkit"
      ? { headless: true }
      : {
          executablePath:
            process.env.CHROMIUM_PATH ||
            (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
          headless: true,
          args: ["--no-sandbox"],
        },
  );
  const page = await browser.newPage({
    viewport: { width: 820, height: 1180 },
    hasTouch: true,
  });
  const errors = [],
    failures = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) failures.push(r.url() + ":" + r.status());
  });
  socket = io(base);
  socket.on("state", (s) => (latest = s));
  await page.goto(base + "/legacy/?overlay=1");
  await page.waitForSelector("#game canvas");
  assert.deepEqual(
    await page.locator("#game canvas").evaluate((c) => [c.width, c.height]),
    [1080, 1920],
  );
  await mkdir("artifacts", { recursive: true });
  const pose = () =>
    page.locator("#game").evaluate((e) => ({
      x: Number(e.dataset.cameraX),
      zoom: Number(e.dataset.cameraZoom),
      mode: e.dataset.cameraMode,
      pool: Number(e.dataset.pool),
      reused: Number(e.dataset.reused),
    }));
  await cmd("cameraScenario", { scenario: "balanced" });
  await wait(() => latest?.units.length === 300);
  await wait(async () =>
    ["combat_focus", "boss_focus"].includes((await pose()).mode),
  );
  const perf = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const frames = [],
          start = performance.now();
        let prev = start;
        function f(now) {
          frames.push(now - prev);
          prev = now;
          if (now - start < 2000) requestAnimationFrame(f);
          else {
            const sorted = [...frames].sort((a, b) => a - b);
            resolve({
              fps: Number(((frames.length / (now - start)) * 1000).toFixed(1)),
              p95ms: Math.round(sorted[Math.floor(sorted.length * 0.95)]),
              frames: frames.length,
            });
          }
        }
        requestAnimationFrame(f);
      }),
  );
  console.log(
    engine,
    "300-unit active battle presentation sample",
    perf,
    "surviving",
    latest.units.filter((u) => u.hp > 0).length,
  );
  await page.screenshot({ path: `artifacts/${engine}-vertical-balanced.png` });
  await cmd("cameraScenario", { scenario: "red" });
  await wait(async () => {
    const p = await pose();
    return p.x > 3500 && p.mode === "castle_siege";
  });
  await page.screenshot({ path: `artifacts/${engine}-vertical-red-siege.png` });
  await cmd("cameraScenario", { scenario: "blue" });
  await wait(async () => {
    const p = await pose();
    return p.x < 1300 && p.mode === "castle_siege";
  });
  await page.screenshot({
    path: `artifacts/${engine}-vertical-blue-siege.png`,
  });
  await cmd("cameraScenario", { scenario: "boss" });
  await wait(async () => {
    const p = await pose();
    return p.mode === "boss_focus" && Math.abs(p.x - 2400) < 500;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `artifacts/${engine}-vertical-boss.png` });
  // HUD stays in exactly the same screen position while the world changes pose.
  const hp = await page.locator(".red-ui").boundingBox();
  await page.goto(base + "/legacy/");
  await page.getByText("Stream setup").click();
  await page.locator("#token").fill(token);
  await page.locator("#unlock").click();
  await page.getByText("Controls unlocked for this tab.").waitFor();
  await page.locator(".dialog-close").click();
  await page.locator('[data-camera="overview"]').click();
  await wait(async () => (await pose()).zoom < 0.65);
  await page.locator('[data-camera="blue"]').click();
  await wait(async () => (await pose()).x > 3500);
  await page.locator('[data-camera="red"]').click();
  await wait(async () => (await pose()).x < 1300);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: `artifacts/${engine}-vertical-phone-dashboard.png`,
    fullPage: true,
  });
  await page.goto(base + "/legacy/?overlay=1");
  await page.waitForSelector("#game canvas");
  await wait(async () => (await pose()).pool > 0);
  const fixed = await page.locator(".red-ui").boundingBox();
  await cmd("cameraScenario", { scenario: "red" });
  await page.waitForTimeout(1200);
  const after = await page.locator(".red-ui").boundingBox();
  assert.deepEqual(fixed, after);
  const touchMap = await page.locator("#minimap").boundingBox();
  await page.touchscreen.tap(
    touchMap.x + touchMap.width * 0.1,
    touchMap.y + touchMap.height * 0.5,
  );
  await wait(async () => (await pose()).x < 1300);
  const box = await page.locator("#game canvas").boundingBox();
  assert.ok(Math.abs(box.width / box.height - 9 / 16) < 0.001);
  await page.screenshot({ path: `artifacts/${engine}-vertical-phone.png` });
  const pooled = await pose();
  assert.ok(pooled.pool <= 440);
  assert.ok(pooled.reused > 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  console.log(
    engine,
    "1080x1920, red/blue pressure, balanced/Boss, overview, fixed HUD, touch iPad/phone, no page/asset errors PASS",
  );
} catch (e) {
  console.error(logs);
  throw e;
} finally {
  socket?.disconnect();
  await browser?.close();
  const stopped = once(server, "exit");
  server.kill("SIGTERM");
  await stopped;
  await rm(data, { recursive: true, force: true });
}
