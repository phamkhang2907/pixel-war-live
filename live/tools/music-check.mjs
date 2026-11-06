import { chromium, webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
const data = await mkdtemp("/tmp/pw-music-"),
  base = "http://127.0.0.1:3192",
  token = "isolated-music",
  wav = await readFile("public/assets/audio/music.wav"),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server, browser;
const boot = async () => {
  server = spawn(process.execPath, ["src/server.js"], {
    env: { ...process.env, PORT: "3192", DATA_DIR: data, ADMIN_TOKEN: token },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(base + "/health")
        .then((r) => r.ok)
        .catch(() => false)
    )
      return;
    await sleep(100);
  }
  throw Error("Music test server failed");
};
const stop = async () => {
  const done = new Promise((r) => server.once("exit", r));
  server.kill("SIGTERM");
  await Promise.race([done, sleep(3000)]);
};
try {
  await boot();
  let r = await fetch(base + "/api/admin/music", {
    method: "POST",
    headers: { "Content-Type": "audio/wav" },
    body: wav,
  });
  assert.equal(r.status, 401);
  r = await fetch(base + "/api/admin/music", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "audio/mpeg" },
    body: "<html>not audio</html>",
  });
  assert.equal(r.status, 400);
  r = await fetch(base + "/api/admin/music", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "audio/wav" },
    body: Buffer.alloc(12 * 1024 * 1024 + 1),
  });
  assert.equal(r.status, 413);
  const useWebKit = process.env.MUSIC_ENGINE === "webkit";
  browser = useWebKit
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
    viewport: { width: 820, height: 1180 },
    hasTouch: true,
    isMobile: true,
  });
  page.setDefaultTimeout(120000);
  // Test-only context capture; the shipped diagnostic hook remains read-only.
  await page.addInitScript(() => {
    const Native = window.AudioContext || window.webkitAudioContext;
    window.AudioContext = new Proxy(Native, {
      construct(target, args) {
        const context = new target(...args);
        window.__testAudioContext = context;
        return context;
      },
    });
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Authenticate before loading WebGL once. Unloading an in-flight GLTF scene
  // produces aborted blob/BIN access errors in WebKit.
  await page.request.post(base + "/owner/login", { form: { password: token } });
  await page.goto(base + "/3d/?live=1&admin=1&debug=1");
  await page.locator("#musicFile").waitFor({ state: "visible" });
  assert.equal(
    (await page.evaluate(() => window.__PW_AUDIO.inspect())).enabled,
    false,
  );
  await page.locator("#musicFile").setInputFiles({
    name: "Nhạc nền thử.wav",
    mimeType: "audio/wav",
    buffer: wav,
  });
  await page.locator("#musicUpload button").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#musicUploadStatus")
      .textContent.includes("Đã lưu nhạc"),
  );
  const manifest = await fetch(base + "/api/music").then((r) => r.json());
  assert.equal(manifest.track.name, "Nhạc nền thử.wav");
  assert.equal(manifest.track.bytes, wav.length);
  r = await fetch(base + manifest.track.url, {
    headers: { Range: "bytes=0-31" },
  });
  assert.equal(r.status, 206);
  assert.equal(
    Buffer.from(await r.arrayBuffer()).toString("ascii", 0, 4),
    "RIFF",
  );
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(
    (await page.evaluate(() => window.__PW_AUDIO.inspect())).enabled,
    false,
  );
  await page.locator("#musicPreview").tap();
  await page.waitForFunction(() => {
    const a = window.__PW_AUDIO.inspect();
    return (
      a.context === "running" &&
      a.buffers === 16 &&
      a.musicTrack?.paused === false &&
      a.musicTrack.currentTime > 0.15
    );
  });
  await page.locator("#soundToggle").tap();
  await page.waitForFunction(
    () =>
      window.__PW_AUDIO.inspect().muted &&
      window.__PW_AUDIO.inspect().musicTrack.paused,
  );
  await page.locator("#soundToggle").tap();
  await page.waitForFunction(
    () =>
      !window.__PW_AUDIO.inspect().muted &&
      !window.__PW_AUDIO.inspect().musicTrack.paused,
  );
  await page.locator("#musicVolume").evaluate((el) => {
    el.value = ".2";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.equal(
    (await page.evaluate(() => window.__PW_AUDIO.inspect())).musicVolume,
    0.2,
  );
  await page.evaluate(() => window.__testAudioContext.suspend());
  await page.waitForFunction(
    () => window.__PW_AUDIO.inspect().context === "suspended",
  );
  await page.locator("#musicPreview").tap();
  await page.waitForFunction(
    () =>
      window.__PW_AUDIO.inspect().context === "running" &&
      !window.__PW_AUDIO.inspect().musicTrack.paused,
  );
  const played = await page.evaluate(() => window.__PW_AUDIO.inspect());
  await mkdir("artifacts", { recursive: true });
  await page.locator("#musicUpload").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/music-upload-admin.png" });
  await stop();
  await boot();
  // Owner sessions are intentionally in-memory: a restart requires sign-in.
  await page.request.post(base + "/owner/login", { form: { password: token } });
  const persisted = await fetch(base + "/api/music").then((r) => r.json());
  assert.equal(persisted.track.id, manifest.track.id);
  r = await fetch(base + "/api/admin/music", { method: "DELETE" });
  assert.equal(r.status, 401);
  await page.locator("#musicDefault").click();
  await page.waitForFunction(
    () => window.__PW_AUDIO.inspect().musicTrack === null,
  );
  assert.equal(
    (await fetch(base + "/api/music").then((r) => r.json())).track,
    null,
  );
  assert.deepEqual(errors, []);
  const report = {
    engine: useWebKit
      ? "Linux WebKit touch emulation"
      : "Linux Chromium touch emulation",
    physicalIPad: false,
    unauthorizedRejected: true,
    invalidRejected: true,
    oversizeRejected: true,
    uploaded: manifest.track,
    rangeRequests: true,
    gesturePlayback: played,
    persistenceAfterRestart: true,
    suspendedContextResumedByTap: true,
    defaultRestored: true,
    errors,
  };
  await writeFile(
    "artifacts/music-report" + (useWebKit ? "-webkit" : "") + ".json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  if (server) await stop();
  await rm(data, { recursive: true, force: true });
}
