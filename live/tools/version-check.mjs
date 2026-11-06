import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const original = await readFile("dist/public/version.json"),
  info = JSON.parse(original),
  data = await mkdtemp("/tmp/pw-version-"),
  base = "http://127.0.0.1:3184";
const server = spawn(process.execPath, ["src/server.js"], {
  env: {
    ...process.env,
    PORT: "3184",
    DATA_DIR: data,
    ADMIN_TOKEN: "isolated-version",
  },
  stdio: "ignore",
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;
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
  for (const path of [
    "/",
    "/admin",
    "/3d/",
    "/3d/index.html",
    "/3d/gallery.html",
    "/version.json",
  ]) {
    const r = await fetch(base + path, { redirect: "manual" });
    assert.equal(r.headers.get("cache-control"), "no-store", path);
  }
  const html = await fetch(base + "/3d/").then((r) => r.text()),
    asset = html.match(/src="(\/3d\/assets\/[^\"]+\.js)"/)[1];
  assert.match(
    (await fetch(base + asset)).headers.get("cache-control"),
    /immutable/,
  );
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
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/3d/?live=1&debug=1");
  await page.waitForFunction(
    () => document.querySelector("#buildStatus").dataset.state === "current",
  );
  assert.match(
    await page.locator("#buildVersion").innerText(),
    new RegExp(info.shortRevision),
  );
  assert.equal(await page.locator("#refreshBuild").isVisible(), false);
  await page.waitForFunction(
    () =>
      window.__PW3D?.inspect().environment?.instances === 426 &&
      window.__PW3D.inspect().assets.rendered >= 24,
  );
  assert.equal(
    (await page.evaluate(() => window.__PW3D.inspect())).build.revision,
    info.revision,
  );
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/build-version-current.png" });
  // The same running server serves a replaced deployment manifest without a process restart.
  const updated = {
    ...info,
    revision: "f".repeat(40),
    shortRevision: "fffffff",
    builtAt: new Date(Date.now() + 1000).toISOString(),
  };
  await writeFile("dist/public/version.json", JSON.stringify(updated));
  assert.equal(
    (await fetch(base + "/version.json").then((r) => r.json())).revision,
    updated.revision,
  );
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await page.waitForFunction(
    () => document.querySelector("#buildStatus").dataset.state === "outdated",
  );
  assert.equal(await page.locator("#refreshBuild").isVisible(), true);
  // Keep the loaded client intact until a real user requests reload.
  assert.equal(
    (await page.evaluate(() => window.__PW3D.inspect())).build.revision,
    info.revision,
  );
  await page.locator("#buildStatus").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/build-version-update.png" });
  await writeFile("dist/public/version.json", original);
  await page.locator("#refreshBuild").click();
  await page.waitForURL(/build=\d+/);
  await page.waitForFunction(
    () => document.querySelector("#buildStatus").dataset.state === "current",
  );
  assert.deepEqual(errors, []);
  const report = {
    build: info,
    htmlAndManifestCache: "no-store",
    hashedAssetsCache: "immutable",
    manifestReplacementSeenWithoutServerRestart: true,
    bfcacheRestoreDetectsUpdate: true,
    userInitiatedCacheBustingReload: true,
    liveScene: {
      environment: "fantasy-visual-upgrade",
      decorations: 426,
      realCharacters: true,
    },
    pageErrors: errors,
  };
  await writeFile(
    "artifacts/build-version-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile("dist/public/version.json", original);
  await browser?.close();
  server.kill("SIGTERM");
  await sleep(1800);
  await rm(data, { recursive: true, force: true });
}
