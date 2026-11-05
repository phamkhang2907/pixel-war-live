import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("../", import.meta.url)));
const dir = await mkdtemp(join(tmpdir(), "pixel-ui-"));
const base = "http://127.0.0.1:3104",
  token = "ui-test",
  headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + token,
  };
const server = spawn(process.execPath, ["src/server.js"], {
  env: { ...process.env, PORT: "3104", ADMIN_TOKEN: token, DATA_DIR: dir },
  stdio: "ignore",
});
let browser;
const wait = async (fn) => {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw Error("UI test timeout");
};
const cmd = async (action, data = {}) => {
  const r = await fetch(base + "/api/control", {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...data }),
  });
  assert.equal(r.status, 200, await r.text());
};
try {
  await wait(() =>
    fetch(base + "/health")
      .then((r) => r.ok)
      .catch(() => false),
  );
  await cmd("auto");
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.locator("#help").click();
  await page.locator("#token").fill(token);
  await page.locator("#unlock").click();
  await page.getByText("Controls unlocked for this tab.").waitFor();
  for (const [key, value] of Object.entries({
    duration: 4,
    prepare: 1,
    final: 1,
    results: 3,
    countdown: 1,
  }))
    await page.locator("#time-" + key).fill(String(value));
  await page.locator("#saveTimings").click();
  await wait(() =>
    fetch(base + "/api/config", { headers })
      .then((r) => r.json())
      .then((c) => c.roundConfig.duration === 4),
  );
  await page.locator("#newRound").click();
  await page.locator(".dialog-close").click();
  for (let i = 0; i < 12; i++)
    await cmd("troop", {
      team: i % 2,
      type: "sword",
      count: 1,
      name: "Commander " + i,
      userId: "ui-" + i,
    });
  await page.locator("#arenaWrap.final-battle").waitFor();
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/round-ui-final.png" });
  await page
    .locator("#winner .result-title")
    .getByText("DRAW", { exact: true })
    .waitFor();
  await cmd("pause");
  await page.locator("#arenaWrap").scrollIntoViewIfNeeded();
  await wait(() =>
    page
      .locator(".result-table>div")
      .count()
      .then((n) => n === 10),
  );
  const geometry = await page.locator("#winner").evaluate((card) => {
    const rows = card.querySelectorAll(".result-table>div");
    return {
      count: rows.length,
      card: card.getBoundingClientRect().bottom,
      last: rows[rows.length - 1]?.getBoundingClientRect().bottom,
    };
  });
  assert.equal(geometry.count, 10);
  assert.ok(
    geometry.last <= geometry.card,
    "Top 10 must fit without scrolling",
  );
  assert.deepEqual(errors, []);
  await page.screenshot({ path: "artifacts/round-ui-results.png" });
  console.log(
    "Admin timing form -> start round -> Final Battle -> draw with all 10 result rows visible on 390px viewport PASS",
  );
} finally {
  await browser?.close();
  const closed = once(server, "exit");
  server.kill("SIGTERM");
  await closed;
  await rm(dir, { recursive: true, force: true });
}
