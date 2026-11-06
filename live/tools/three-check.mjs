import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const port = process.env.TEST_PORT || 3113;
const base = `http://127.0.0.1:${port}`;
const token = "isolated-three-acceptance";
const data = await mkdtemp(join(tmpdir(), "pixel-war-three-"));
const server = spawn(process.execPath, ["src/server.js"], {
  env: { ...process.env, PORT: port, DATA_DIR: data, ADMIN_TOKEN: token },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "",
  browser;
server.stdout.on("data", (d) => (logs += d));
server.stderr.on("data", (d) => (logs += d));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function control(action, params = {}) {
  const response = await fetch(base + "/api/control", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...params }),
  });
  assert.equal(response.status, 200, await response.text());
}
try {
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(base + "/health")
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    if (i === 99) throw Error("Server startup failed: " + logs);
    await sleep(100);
  }

  await control("pause");
  browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    headless: true,
    args: [
      "--no-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1200 },
  });
  const errors = [],
    failures = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(base + "/3d/?live=1&debug=1");
  await page.waitForFunction(() => window.__PW3D?.inspect().connectedState);
  await page.waitForFunction(() => window.__PW3D.inspect().drawCalls > 0);
  await page.waitForFunction(() =>
    window.__PW3D.inspect().assets.models.every((m) => m.status === "ready"),
  );
  assert.equal(await page.locator("#error").isVisible(), false);
  await page.locator('[data-camera="overview"]').click();
  await page.waitForFunction(() => window.__PW3D.inspect().distance > 255);
  const initial = await page.evaluate(() => window.__PW3D.inspect());
  assert.equal(initial.elevation, 52);
  assert.ok(
    initial.castleNDC[0][0] < initial.castleNDC[1][0],
    "RED projects left of BLUE",
  );
  assert.ok(
    initial.castleNDC.every((p) => Math.abs(p[0]) < 1 && Math.abs(p[1]) < 1),
    "Both castles fit overview",
  );
  const canvas = page.locator("#world canvas");
  let box = await canvas.boundingBox();
  assert.ok(Math.abs(box.width / box.height - 9 / 16) < 0.002);
  const pixels = await canvas.evaluate((canvas) => {
    const gl = canvas.getContext("webgl2");
    return {
      version: gl.getParameter(gl.VERSION),
      renderer: gl.getParameter(gl.RENDERER),
    };
  });
  assert.match(pixels.version, /WebGL 2/);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/three-desktop.png",
    fullPage: true,
  });

  await page.locator('[data-camera="red"]').click();
  await page.waitForFunction(() => window.__PW3D.inspect().x < -38);
  await page.locator('[data-camera="blue"]').click();
  await page.waitForFunction(() => window.__PW3D.inspect().x > 38);
  await page.screenshot({
    path: "artifacts/three-blue-castle.png",
    fullPage: true,
  });
  await page.locator('[data-camera="front"]').click();
  await page.waitForFunction(() => Math.abs(window.__PW3D.inspect().x) < 0.5);
  const beforeZoom = await page.evaluate(
    () => window.__PW3D.inspect().distance,
  );
  await page.locator("#zoomIn").click();
  await page.waitForFunction(
    (before) => window.__PW3D.inspect().distance < before * 0.9,
    beforeZoom,
  );
  box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.55, {
    steps: 8,
  });
  await page.mouse.up();
  await page.waitForFunction(
    () =>
      window.__PW3D.inspect().mode === "manual" &&
      Math.abs(window.__PW3D.inspect().yaw) > 10,
  );
  assert.equal(await page.locator("#demoActions").isVisible(), false);
  await page.request.post(base + "/owner/login", { form: { password: token } });
  await page.goto(base + "/3d/?live=1&admin=1&debug=1");
  await page.locator("#demoActions").waitFor({ state: "visible" });
  // Software WebGL acceptance uses the supported low preset for the 300-unit scene.
  await page.locator("#quality").selectOption("low");
  await page.locator('[data-scenario="balanced"]').click();
  await page.waitForFunction(() => window.__PW3D.inspect().units >= 290);
  await control("pause");
  await page.waitForFunction(() => {
    const d = window.__PW3D.inspect();
    return (
      d.mode === "front" &&
      Math.abs(d.x - d.targetX) < 0.5 &&
      Math.abs(d.distance - d.targetDistance) < 2 &&
      d.distance >= 75 &&
      d.distance <= 251
    );
  });
  await page.waitForFunction(
    () => window.__PW3D.inspect().assets.rendered === 300,
  );
  const army = await page.evaluate(
    () => window.__PW3D.inspect().assets.rendered,
  );
  await page.screenshot({
    path: "artifacts/three-formations.png",
    fullPage: true,
  });

  await canvas.evaluate((canvas) => {
    window.__lostContextExtension = canvas
      .getContext("webgl2")
      .getExtension("WEBGL_lose_context");
    window.__lostContextExtension.loseContext();
  });
  await page.waitForFunction(() => window.__PW3D.inspect().contextLost);
  await page.evaluate(() => window.__lostContextExtension.restoreContext());
  await page.waitForFunction(() => !window.__PW3D.inspect().contextLost);
  await page.waitForFunction(() => window.__PW3D.inspect().drawCalls > 0);

  // Keep responsiveness/touch checks separate from the heavy software-rendered army.
  // The 300 real models and their context recovery were verified above.
  await control("newRound");
  for (const team of [0, 1])
    for (const type of ["sword", "archer", "mage"])
      await control("troop", { team, type, count: 1 });
  await page.waitForFunction(
    () => window.__PW3D.inspect().assets.rendered === 6,
  );
  for (const viewport of [
    { width: 820, height: 1180 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await sleep(150);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    box = await canvas.boundingBox();
    assert.ok(Math.abs(box.width / box.height - 9 / 16) < 0.002);
    await page.screenshot({
      path: `artifacts/three-${viewport.width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.goto(base + "/3d/?live=1&overlay=1&debug=1");
  await page.waitForFunction(() => window.__PW3D?.inspect().connectedState);
  box = await page.locator("#stage").boundingBox();
  assert.equal(box.width, 1080);
  assert.equal(box.height, 1920);
  assert.equal(await page.locator(".controls").isVisible(), false);
  await page.screenshot({ path: "artifacts/three-1080x1920.png" });

  await page.close();
  // Chromium touch emulation exercises the mobile path; this is not Safari.
  const touchContext = await browser.newContext({
    viewport: { width: 820, height: 1180 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const touch = await touchContext.newPage();
  touch.on("pageerror", (e) => errors.push(e.message));
  await touch.goto(base + "/3d/?live=1&debug=1");
  await touch.waitForFunction(() => window.__PW3D?.inspect().connectedState);
  assert.equal(await touch.locator("#quality").inputValue(), "low");
  const touchBox = await touch.locator("#world canvas").boundingBox();
  const mobile = await touch.evaluate(() => window.__PW3D.inspect());
  assert.ok(
    mobile.drawingBuffer[0] <= Math.ceil(touchBox.width),
    "Mobile DPR is capped at one",
  );
  const cdp = await touchContext.newCDPSession(touch);
  const tx = touchBox.x + touchBox.width / 2,
    ty = touchBox.y + touchBox.height * 0.6;
  const sendTouch = (type, points) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await sendTouch("touchStart", [{ x: tx, y: ty }]);
  await sendTouch("touchMove", [{ x: tx - 60, y: ty }]);
  await sendTouch("touchEnd", []);
  await touch.waitForFunction(
    () =>
      window.__PW3D.inspect().mode === "manual" &&
      Math.abs(window.__PW3D.inspect().yaw) > 10,
  );
  const beforePinch = await touch.evaluate(
    () => window.__PW3D.inspect().distance,
  );
  await sendTouch("touchStart", [
    { x: tx - 30, y: ty, id: 1 },
    { x: tx + 30, y: ty, id: 2 },
  ]);
  await sendTouch("touchMove", [
    { x: tx - 40, y: ty, id: 1 },
    { x: tx + 40, y: ty, id: 2 },
  ]);
  await sendTouch("touchMove", [
    { x: tx - 65, y: ty, id: 1 },
    { x: tx + 65, y: ty, id: 2 },
  ]);
  await sendTouch("touchEnd", []);
  await touch.waitForFunction(
    (before) => window.__PW3D.inspect().distance < before - 10,
    beforePinch,
  );
  await touch.screenshot({
    path: "artifacts/three-touch-820.png",
    fullPage: true,
  });
  await touchContext.close();

  const denied = await fetch(base + "/api/control", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"action":"reset"}',
  });
  assert.equal(denied.status, 401);
  assert.equal((await fetch(base + "/legacy/")).status, 410);
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  const report = {
    browser: await browser.version(),
    environment: "Linux headless Chromium / SwiftShader, not a physical iPad",
    initial,
    army,
    mobile,
    webgl: pixels,
    checks: [
      "WebGL2 rendering",
      "portrait 9:16",
      "RED left / BLUE right",
      "overview bounds",
      "camera presets / zoom / drag",
      "admin authorization",
      "300 real KayKit characters",
      "context loss / recovery",
      "820 and 390 CSS widths",
      "1080x1920 capture",
      "touch drag and pinch",
      "mobile DPR cap",
      "retired legacy route returns 410",
      "no page errors or failed HTTP responses",
    ],
  };
  await writeFile(
    "artifacts/three-acceptance.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  const exited = new Promise((resolve) => server.once("exit", resolve));
  server.kill("SIGTERM");
  await Promise.race([exited, sleep(3000)]);
  await rm(data, { recursive: true, force: true });
}
