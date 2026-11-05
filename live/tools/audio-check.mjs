import { webkit, devices } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const data = await mkdtemp("/tmp/pw-audio-"),
  base = "http://127.0.0.1:3173";
let browser;
const server = spawn(process.execPath, ["src/server.js"], {
  env: {
    ...process.env,
    PORT: "3173",
    DATA_DIR: data,
    ADMIN_TOKEN: "isolated-audio",
  },
  stdio: "ignore",
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  browser = await webkit.launch();
  const context = await browser.newContext({
    ...devices["iPad (gen 7)"],
    viewport: { width: 820, height: 1180 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/3d/?debug=1");
  await page.waitForFunction(() => window.__PW_AUDIO);
  assert.equal(
    (await page.evaluate(() => window.__PW_AUDIO.inspect())).context,
    "locked",
  );
  await page.locator("#soundToggle").tap();
  await page.waitForFunction(
    () =>
      window.__PW_AUDIO.inspect().context === "running" &&
      window.__PW_AUDIO.inspect().buffers === 16,
  );
  assert.ok(
    (await page.evaluate(() => window.__PW_AUDIO.inspect())).played > 0,
  );
  await page.locator("#soundToggle").tap();
  // The existing handler awaits AudioContext.resume(), even when already running.
  await page.waitForFunction(() => window.__PW_AUDIO.inspect().muted === true);
  assert.equal(
    (await page.evaluate(() => window.__PW_AUDIO.inspect())).muted,
    true,
  );
  await page.locator("#soundToggle").tap();
  await page.waitForFunction(() => window.__PW_AUDIO.inspect().muted === false);
  assert.equal(
    (await page.evaluate(() => window.__PW_AUDIO.inspect())).muted,
    false,
  );
  await page.locator("#musicVolume").fill("0.25");
  await page.locator("#sfxVolume").fill("0.4");
  const report = {
    engine:
      "Linux WebKit with iPad touch/user-agent emulation; not physical Safari",
    audio: await page.evaluate(() => window.__PW_AUDIO.inspect()),
    errors,
  };
  assert.equal(report.audio.musicVolume, 0.25);
  assert.equal(report.audio.sfxVolume, 0.4);
  assert.deepEqual(errors, []);
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/webkit-audio-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await sleep(1800);
  await rm(data, { recursive: true, force: true });
}
