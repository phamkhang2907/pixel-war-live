import { isolatedFixture } from "./isolated-fixture.mjs";
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { io } from "socket.io-client";
import assert from "node:assert/strict";
const data = await mkdtemp("/tmp/pw-field-"),
  port = 3136,
  base = `http://127.0.0.1:${port}`,
  token = "battlefield-test";
isolatedFixture(data);
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
let browser, socket, state;
const results = [],
  errors = [];
async function cmd(action, params = {}) {
  const r = await fetch(base + "/api/control", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({ action, ...params }),
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
  socket.on("state", (s) => (state = s));
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1920 },
  });
  page.setDefaultTimeout(90000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(base + "/3d/?live=1&debug=1&overlay=1");
  await page.waitForFunction(
    () => window.__PW3D?.inspect().fortresses.length === 2,
  );
  await page.locator("#quality").evaluate((select) => {
    select.value = "low";
    select.dispatchEvent(new Event("change"));
  });
  await mkdir("artifacts", { recursive: true });
  for (const count of [50, 100, 300]) {
    await cmd("cameraScenario", { scenario: "balanced", count });
    await cmd("pause");
    await page.waitForFunction(
      (n) => window.__PW3D.inspect().assets.rendered === n,
      count,
    );
    await page.waitForFunction(() => window.__PW3D.inspect().distance < 95);
    await sleep(500);
    const d = await page.evaluate(() => window.__PW3D.inspect());
    const span = [0, 1].map((team) => {
      const a = state.units.filter((u) => u.team === team).map((u) => u.y);
      return Math.max(...a) - Math.min(...a);
    });
    assert.ok(span.every((n) => n > 900));
    assert.ok(d.fortresses.every((f) => f.modules >= 29));
    await page.screenshot({
      path: `artifacts/battlefield-${count}-1080x1920.png`,
    });
    results.push({ count, span, diagnostics: d });
  }
  await cmd("newRound");
  await page.goto(base + "/3d/?live=1&debug=1");
  await page.locator("#quality").selectOption("low");
  await page.waitForFunction(
    () => window.__PW3D?.inspect().fortresses.length === 2,
  );
  await page.locator('[data-camera="overview"]').click();
  await page.waitForFunction(() => window.__PW3D.inspect().distance > 255);
  await page.evaluate(() => document.body.classList.add("overlay"));
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await sleep(500);
  await page.screenshot({
    path: "artifacts/battlefield-overview.png",
    fullPage: true,
  });
  for (const side of ["red", "blue"]) {
    await page.locator(`[data-camera="${side}"]`).evaluate((b) => b.click());
    await sleep(1600);
    await page.screenshot({
      path: `artifacts/fortress-${side}.png`,
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/battlefield-report.json",
    JSON.stringify(
      {
        browser: await browser.version(),
        device: "Linux SwiftShader software renderer",
        results,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      counts: results.map((r) => r.count),
      spans: results.map((r) => r.span),
      errors,
    }),
  );
} finally {
  socket?.disconnect();
  await browser?.close();
  server.kill("SIGTERM");
  await sleep(1600);
  await rm(data, { recursive: true, force: true });
}
