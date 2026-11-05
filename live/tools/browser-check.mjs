import { existsSync } from "node:fs";
import { chromium, webkit } from "@playwright/test";
import { io } from "socket.io-client";
import { spawn } from "node:child_process";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const engine = process.env.BROWSER || "chromium",
  port = process.env.TEST_PORT || 3100,
  base = `http://127.0.0.1:${port}`,
  token = "isolated-test-token";
const data = await mkdtemp(join(tmpdir(), "pixel-war-test-"));
const server = spawn(process.execPath, ["src/server.js"], {
  env: { ...process.env, PORT: port, ADMIN_TOKEN: token, DATA_DIR: data },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
server.stdout.on("data", (d) => (logs += d));
server.stderr.on("data", (d) => (logs += d));
let browser, socket;
const wait = async (predicate, timeout = 20000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Condition timed out");
};
const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
};
const control = async (action, params = {}) => {
  const r = await fetch(base + "/api/control", {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...params }),
  });
  assert.equal(r.status, 200, await r.text());
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
      viewport: { width: 1440, height: 1200 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let latest,
    seen = new Set(),
    moved = false,
    initialY;
  socket = io(base);
  socket.on("state", (s) => {
    latest = s;
    for (const u of s.units) {
      seen.add(u.state);
      if (initialY !== undefined && u.y !== initialY) moved = true;
    }
  });
  await page.goto(base);
  await page.waitForSelector("#game canvas");
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    "rgb(16, 19, 25)",
  );
  await page.getByText("Stream setup").click();
  await page.locator("#token").fill(token);
  await page.locator("#unlock").click();
  await page.getByText("Controls unlocked for this tab.").waitFor();
  await page.locator(".dialog-close").click();
  await control("auto");
  await control("reset");
  await page
    .getByRole("button", { name: "Summon Swordsman", exact: true })
    .click();
  await wait(() => latest?.units.length === 1);
  initialY = latest.units[0].y;
  await page.locator('[data-team="1"]').click();
  await page
    .getByRole("button", { name: "Summon Swordsman", exact: true })
    .click();
  await wait(() => latest?.units.length === 2);
  await page.locator("#giftName").fill("iPad Commander");
  await page.locator("#giftCoins").fill("50");
  await page.locator("#sendGift").click();
  await wait(() =>
    latest?.events.some(
      (e) => e.name === "iPad Commander" && e.type === "mage",
    ),
  );
  await page.getByText("iPad Commander", { exact: true }).first().waitFor();
  await page.locator("#speed").selectOption("8");
  await wait(
    () => seen.has("attack") && seen.has("hurt") && seen.has("death"),
    20000,
  );
  assert.ok(moved);
  console.log(
    engine,
    "UI + API + Socket.IO: movement, target acquisition, damage, hurt, death, gift and ranking PASS",
  );
  await control("pause");
  await new Promise((r) => setTimeout(r, 150));
  const stopped = latest.time;
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(latest.time, stopped);
  await control("pause");
  await control("reset");
  await control("troop", { team: 0, type: "boss", count: 50 });
  await wait(() => latest?.winner === 0, 20000);
  assert.equal(latest.castles[1], 0);
  await page.locator("#winner").waitFor({ state: "visible" });
  assert.match(await page.locator("#winner").innerText(), /RED KINGDOM WINS/);
  console.log(
    engine,
    "Full siege through actual server timer: BLUE castle HP=0, RED victory rendered PASS",
  );
  await control("reset");
  await control("burst");
  await control("burst");
  await wait(() => latest?.units.length === 300);
  console.log(engine, "300-unit cap/render PASS");
  await control("reset");
  for (const team of [0, 1])
    for (const type of ["sword", "archer", "cavalry", "mage", "boss"])
      await control("troop", { team, type, count: 3 });
  await control("speed", { value: 1 });
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: `artifacts/${engine}-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.screenshot({
    path: `artifacts/${engine}-ipad.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.goto(base + "/?overlay=1");
  await page.waitForSelector("#game canvas");
  const box = await page.locator("#game canvas").boundingBox();
  assert.ok(Math.abs(box.width / box.height - 9 / 16) < 0.002);
  assert.equal(
    (
      await fetch(base + "/api/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"action":"reset"}',
      })
    ).status,
    401,
  );
  await control("rules", { rules: [{ min: 1, type: "archer", count: 4 }] });
  await control("reset");
  await control("spawn", { team: 0, coins: 1, count: 1, name: "Mapped" });
  await wait(() => latest?.units.length === 4);
  assert.ok(latest.units.every((u) => u.type === "archer"));
  await control("troop", { team: 1, type: "boss", count: 1 });
  await wait(() => latest?.units.some((u) => u.type === "boss"));
  console.log(engine, "Gift mapping and independent troop selection PASS");
  assert.deepEqual(errors, []);
  console.log(engine, "desktop/iPad/mobile/overlay, no JavaScript errors PASS");
} catch (e) {
  console.error(logs);
  throw e;
} finally {
  socket?.disconnect();
  await browser?.close();
  server.kill("SIGTERM");
  await rm(data, { recursive: true, force: true });
}
