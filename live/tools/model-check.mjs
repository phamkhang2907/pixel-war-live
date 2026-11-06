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

  await control("roundConfig", {
    config: { duration: 300, prepare: 0, final: 30, results: 15, countdown: 5 },
  });
  await control("newRound");
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
  for (const clip of [
    "Idle_A",
    "Running_A",
    "Walking_A",
    "PW_Sword_Swing",
    "PW_Bow_Shot",
    "PW_Staff_Cast",
    "PW_Heavy_Swing",
    "PW_Giant_Slam",
    "Hit_A",
    "Death_A",
  ]) {
    await page.locator("#clip").selectOption(clip);
    await page.waitForTimeout(100);
    assert.equal(
      await page.evaluate(() => window.__PW_GALLERY.inspect().entries[0].clip),
      clip,
    );
  }
  await control("pause");
  for (const team of [0, 1])
    await control("troop", { team, type: "sword", count: 1 });
  await control("pause");
  await sleep(300);
  await control("pause");
  await page.goto(base + "/3d/?live=1&debug=1");
  await page
    .waitForFunction(
      () => window.__PW3D?.inspect().assets.rendered === 6,
      null,
      { timeout: 180000 },
    )
    .catch(async (error) => {
      console.log(
        "Model-load diagnostics",
        JSON.stringify(await page.evaluate(() => window.__PW3D?.inspect())),
        errors,
        failures,
      );
      throw error;
    });
  await page.locator('[data-camera="front"]').click();
  const deployed = (await page.evaluate(() => window.__PW3D.inspect())).assets
    .instances;
  await control("speed", { value: 1 });
  await control("pause");
  await page.waitForFunction(
    (previous) =>
      window.__PW3D.inspect().assets.instances.some((i) => {
        const p = previous.find((v) => v.id === i.id);
        return (
          p &&
          i.model.startsWith("Knight") &&
          Math.abs(i.scale - 0.85) < 0.001 &&
          i.clip === "Running_A" &&
          Math.hypot(
            i.position[0] - p.position[0],
            i.position[2] - p.position[2],
          ) > 0.2
        );
      }),
    deployed,
    { timeout: 30000 },
  );
  await control("pause");
  // Inspect normal soldiers' skeletal running in isolation, then verify mixed
  // classes through the bounded near-rig/VAT pipeline. A distant soldier need
  // not appear in the near-rig diagnostics simply because the army is small.
  for (const team of [0, 1])
    for (const type of ["archer", "mage", "cavalry", "boss"])
      await control("troop", { team, type, count: 1 });
  await page.waitForFunction(() => {
    const d = window.__PW3D.inspect();
    return (
      Math.abs(d.distance - d.targetDistance) < 0.2 && d.assets.rendered === 14
    );
  });
  const battlefield = await page.evaluate(() => window.__PW3D.inspect());
  assert.equal(battlefield.assets.proceduralSoldiers, 0);
  assert.ok(battlefield.assets.rendered > 0);
  assert.ok(battlefield.assets.independentSkeletons <= 8);
  assert.ok(battlefield.assets.bakedLod >= 2);
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
  assert.equal((await fetch(base + "/legacy/")).status, 410);
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
