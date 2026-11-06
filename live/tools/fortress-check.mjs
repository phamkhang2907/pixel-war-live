import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import assert from "node:assert/strict";
const temp = await mkdtemp("/tmp/pw-forts-"),
  port = 3150,
  base = `http://127.0.0.1:${port}`;
let browser;
const server = spawn(process.execPath, ["src/server.js"], {
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: temp,
    ADMIN_TOKEN: "fortress-test",
  },
  stdio: "ignore",
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function cmd(action) {
  const r = await fetch(base + "/api/control", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer fortress-test",
    },
    body: JSON.stringify({ action }),
  });
  assert.equal(r.status, 200);
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

  await cmd("pause");
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
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(base + "/3d/?live=1&debug=1");
  await page.locator("#quality").selectOption("low");
  await page.waitForFunction(
    () => window.__PW3D?.inspect().fortresses.length === 2,
  );
  await page.waitForFunction(
    () => window.__PW3D.inspect().assets.rendered >= 24,
  );
  const d = await page.evaluate(() => window.__PW3D.inspect());
  for (const f of d.fortresses) {
    assert.equal(f.modules, 29);
    for (const k of [
      "wall",
      "gate",
      "corner",
      "tower",
      "flag",
      "keep",
      "barracks",
      "home",
      "smith",
      "archery",
    ])
      assert.ok(f.catalog.some((m) => m.kind === k));
    for (const m of f.catalog) {
      assert.ok(m.meshes > 0 && m.textures > 0);
      assert.equal(m.scale[0], m.scale[1]);
      assert.equal(m.scale[1], m.scale[2]);
    }
    assert.ok(f.bounds.max[2] - f.bounds.min[2] > 40);
  }
  await mkdir("artifacts", { recursive: true });
  for (const mode of ["overview", "red", "blue"]) {
    await page.locator(`[data-camera="${mode}"]`).evaluate((b) => b.click());
    await page.waitForFunction((m) => {
      const d = window.__PW3D.inspect();
      return (
        d.mode === m &&
        Math.abs(d.distance - d.targetDistance) < 0.1 &&
        Math.abs(d.x - d.targetX) < 0.05 &&
        Math.abs(d.yaw - d.targetYaw) < 0.05
      );
    }, mode);
    await sleep(600);
    const framed = await page.evaluate(
      () => window.__PW3D.inspect().fortresses,
    );
    for (const fort of mode === "overview"
      ? framed
      : [framed[mode === "red" ? 0 : 1]]) {
      assert.ok(
        fort.projectedBounds.every(
          (p) => Math.abs(p[0]) < 0.99 && Math.abs(p[1]) < 0.99,
        ),
        `${mode} clipped fortress bounds`,
      );
    }
    await page.evaluate(() => document.body.classList.add("overlay"));
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    await page.screenshot({
      path: `artifacts/extended-fortress-${mode}-1080x1920.png`,
    });
  }
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/fortress-verification.json",
    JSON.stringify(
      {
        browser: await browser.version(),
        platform: "Linux headless SwiftShader, 1080x1920 DPR 1",
        diagnostics: d,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      fortresses: d.fortresses.map((f) => ({
        name: f.name,
        modules: f.modules,
        bounds: f.bounds,
      })),
      soldiers: d.assets.rendered,
      errors,
    }),
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await sleep(1600);
  await rm(temp, { recursive: true, force: true });
}
