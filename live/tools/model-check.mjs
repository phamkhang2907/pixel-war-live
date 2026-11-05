import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const data = await mkdtemp("/tmp/pw-model-test-");
const port = process.env.TEST_PORT || 3127,
  base = `http://127.0.0.1:${port}`,
  token = "isolated-model-check";
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
let browser;
async function control(action, params = {}) {
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
    if (i === 99) throw Error("Server did not start");
    await sleep(100);
  }
  await control("auto");
  await control("roundConfig", {
    config: { duration: 300, prepare: 0, final: 30, results: 15, countdown: 5 },
  });
  await control("reset");
  browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
  });
  const errors = [],
    warnings = [],
    failures = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
    if (m.type() === "warning") warnings.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(base + "/3d/gallery.html");
  await page.waitForFunction(() => window.__PW_GALLERY?.inspect().count === 12);
  const before = await page.evaluate(() => window.__PW_GALLERY.inspect());
  assert.equal(before.models.filter((m) => m.status === "ready").length, 6);
  assert.deepEqual(before.errors, []);
  for (const model of before.models) {
    assert.ok(model.textures > 0);
    assert.equal(model.bones, 23);
    for (const part of [
      "Head",
      "Body",
      "ArmLeft",
      "ArmRight",
      "LegLeft",
      "LegRight",
    ])
      assert.ok(
        model.meshes.some((n) => n.includes(part)),
        `${model.model} missing ${part}`,
      );
  }
  for (let i = 0; i < 12; i += 2) {
    const red = before.entries[i],
      blue = before.entries[i + 1];
    assert.notEqual(red.bones[0], blue.bones[0], "Independent skeleton clone");
    assert.notDeepEqual(
      red.materials,
      blue.materials,
      "Independent RED/BLUE materials",
    );
    assert.ok(red.height > 1.4 && red.height < 2.5);
    assert.ok(red.minY > -0.2);
  }
  await page.waitForFunction((previous) => {
    const current = window.__PW_GALLERY.inspect().entries;
    return (
      current.length === previous.length &&
      current.every(
        (entry, i) =>
          JSON.stringify(entry.sample) !== JSON.stringify(previous[i].sample),
      )
    );
  }, before.entries);
  const after = await page.evaluate(() => window.__PW_GALLERY.inspect());
  for (let i = 0; i < 12; i++)
    assert.notDeepEqual(
      before.entries[i].sample,
      after.entries[i].sample,
      `Skinned vertices actually animate: ${before.entries[i].name}`,
    );
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/kaykit-gallery.png",
    fullPage: true,
  });
  for (const name of ["Knight", "Ranger", "Mage"]) {
    await page.locator("#model").selectOption(name);
    await page.waitForTimeout(150);
    await page.screenshot({
      path: `artifacts/kaykit-${name.toLowerCase()}.png`,
      fullPage: true,
    });
  }
  for (const clip of ["Idle_A", "Running_A", "Use_Item", "Throw", "Death_A"]) {
    await page.locator("#clip").selectOption(clip);
    await page.waitForTimeout(100);
    assert.equal(
      await page.evaluate(() => window.__PW_GALLERY.inspect().entries[0].clip),
      clip,
    );
  }
  await control("pause");
  for (const team of [0, 1])
    for (const type of [
      "sword",
      "archer",
      "mage",
      "cavalry",
      "guardian",
      "boss",
    ])
      await control("troop", { team, type, count: 1 });
  await page.goto(base + "/3d/?debug=1");
  await page.waitForFunction(
    () => window.__PW3D?.inspect().assets.rendered >= 12,
  );
  await page.locator('[data-camera="front"]').click();
  await control("speed", { value: 8 });
  await control("pause");
  await page.waitForFunction(
    () =>
      window.__PW3D
        .inspect()
        .assets.instances.some(
          (i) =>
            i.model.startsWith("Knight") &&
            i.scale === 1 &&
            Math.abs(i.position[0]) < 7,
        ),
    null,
    { timeout: 30000 },
  );
  await control("pause");
  await page.waitForFunction(() => window.__PW3D.inspect().distance < 120);
  await page.waitForTimeout(200);
  await page.locator("#zoomIn").click();
  await page.locator("#zoomIn").click();
  await page.locator("#zoomIn").click();
  await page.locator("#zoomIn").click();
  await page.locator("#zoomIn").click();
  await page.waitForFunction(() => window.__PW3D.inspect().distance < 40);
  const battlefield = await page.evaluate(() => window.__PW3D.inspect());
  assert.equal(battlefield.assets.proceduralSoldiers, 0);
  assert.ok(battlefield.assets.rendered > 0);
  assert.equal(
    battlefield.assets.models.filter((m) => m.status === "ready").length,
    6,
  );
  for (const v of battlefield.assets.instances)
    assert.ok(
      v.normalizedScale > 0 && v.normalizedScale < 1,
      "Normalization not overwritten",
    );
  await page.screenshot({
    path: "artifacts/kaykit-battlefield.png",
    fullPage: true,
  });
  const version = await fetch(base + "/kaykit/asset-version.json").then((r) =>
    r.json(),
  );
  assert.equal(version.characters.length, 6);
  assert.equal((await fetch(base + "/legacy/")).status, 200);
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  assert.deepEqual(
    warnings.filter((w) =>
      /PropertyBinding|GLTF|KayKit.*fallback|Could not/.test(w),
    ),
    [],
  );
  const report = {
    browser: await browser.version(),
    environment: "Linux headless Chromium / SwiftShader, no physical iPad test",
    models: before.models,
    clips: before.clips,
    independentSkeletons: true,
    skinnedVerticesChanged: true,
    battlefield,
    version,
    errors,
    warnings,
    failures,
  };
  await writeFile(
    "artifacts/kaykit-verification.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        models: before.models.map((m) => ({
          model: m.model,
          status: m.status,
          meshes: m.meshes.length,
        })),
        animatedCharacters: 12,
        clips: before.clips.length,
        battlefieldCharacters: battlefield.assets.rendered,
        errors,
        warnings,
        failures,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await sleep(1600);
  await rm(data, { recursive: true, force: true });
}
