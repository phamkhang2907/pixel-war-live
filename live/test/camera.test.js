import { test } from "node:test";
import assert from "node:assert/strict";
import { CameraDirector } from "../src/camera-director.js";
import { WORLD, LIVE_VIEW, formation, projectY } from "../src/characters.js";
import { Battle } from "../src/game.js";
let next = 1;
const unit = (team, x, y = WORLD.ground, type = "sword", state = "attack") => ({
  id: next++,
  team,
  x,
  y,
  type,
  state,
  hp: 100,
});
const frame = (units, cameraEvents = []) => ({
  round: 1,
  units,
  castles: [10000, 10000],
  cameraEvents,
});
const clash = (x, n = 8) =>
  Array.from({ length: n * 2 }, (_, i) =>
    unit(i % 2, x + (i % 2 ? 35 : -35), WORLD.laneMin + (i % 12) * 48),
  );
const settle = (director, state, seconds = 6, start = 0) => {
  let result;
  for (let t = start; t <= start + seconds; t += 0.05)
    result = director.update(state, t);
  return result;
};
test("portrait canvas is truly 1080x1920; middle world camera is taller than wide", () => {
  assert.deepEqual([LIVE_VIEW.width, LIVE_VIEW.height], [1080, 1920]);
  assert.ok(LIVE_VIEW.viewport.height > LIVE_VIEW.viewport.width);
  assert.ok(WORLD.width > LIVE_VIEW.width * 4);
});
test("formation gives 15 rows, unique slots and opposite X origins; no Y collapse on march", () => {
  const b = new Battle();
  b.spawn(0, "sword", 150);
  b.spawn(1, "sword", 150);
  const red = b.units.filter((u) => u.team === 0),
    blue = b.units.filter((u) => u.team === 1);
  assert.ok(Math.max(...red.map((u) => u.x)) < WORLD.width / 2);
  assert.ok(Math.min(...blue.map((u) => u.x)) > WORLD.width / 2);
  assert.equal(new Set(red.map((u) => u.y)).size, 15);
  assert.equal(new Set(red.map((u) => u.x + "," + u.y)).size, 150);
  const lanes = new Set(red.map((u) => u.lane));
  for (let i = 0; i < 20; i++) b.tick(0.05);
  assert.ok(new Set(red.map((u) => Math.round(u.y / 40))).size >= 12);
  assert.equal(lanes.size, 15);
});
test("two-sided active clash beats huge idle one-team army", () => {
  const d = new CameraDirector(),
    s = frame([
      ...clash(1800),
      ...Array.from({ length: 250 }, () =>
        unit(0, 4200, WORLD.ground, "sword", "run"),
      ),
    ]);
  const p = settle(d, s);
  assert.ok(Math.abs(p.x - 1800) < 500);
  assert.equal(p.mode, "combat_focus");
});
test("recent DPS selects the more consequential mixed clash", () => {
  const d = new CameraDirector(),
    s = frame(
      [...clash(1100), ...clash(3300)],
      [{ id: 1, kind: "damage", x: 3300, y: 1100, amount: 3000 }],
    );
  const p = settle(d, s, 2);
  assert.ok(p.x > 2600);
});
test("red pressure tracks right castle, blue counterattack tracks left", () => {
  for (const [center, team, check] of [
    [4350, 0, (x) => x > 3500],
    [450, 1, (x) => x < 1300],
  ]) {
    const d = new CameraDirector();
    const u = clash(center);
    u.push(...Array.from({ length: 30 }, () => unit(team, center)));
    const p = settle(d, frame(u));
    assert.equal(p.mode, "castle_siege");
    assert.ok(check(p.x));
  }
});
test("boss arrival near clash emphasizes smoothly; distant boss cannot steal a battle", () => {
  const d = new CameraDirector();
  const s = frame(
    [...clash(2400), unit(0, 2400, 1100, "boss")],
    [{ id: 1, kind: "spawn", type: "boss", team: 0, x: 2400, y: 1100 }],
  );
  const p = settle(d, s, 1);
  assert.equal(p.mode, "boss_focus");
  assert.ok(p.zoom > 0.8);
  const far = new CameraDirector();
  const q = settle(
    far,
    frame(
      [...clash(1800), unit(0, 4300, 1100, "boss")],
      [{ id: 1, kind: "spawn", type: "boss", team: 0, x: 4300, y: 1100 }],
    ),
    2,
  );
  assert.notEqual(q.mode, "boss_focus");
  assert.ok(q.x < 2500);
});
test("Guardian and Flying Mage receive bounded emphasis as well", () => {
  for (const type of ["guardian", "mage"]) {
    const d = new CameraDirector(),
      s = frame(
        [...clash(2400), unit(0, 2400, 1100, type)],
        [{ id: 1, kind: "spawn", type, team: 0, x: 2400, y: 1100 }],
      );
    assert.equal(settle(d, s, 1).mode, "boss_focus");
  }
});
test("hysteresis and hold prevent rapid alternating cuts", () => {
  const d = new CameraDirector();
  let p;
  for (let i = 0; i < 240; i++)
    p = d.update(frame(clash(i % 10 < 5 ? 1000 : 3600)), i * 0.05);
  assert.ok(p.switches <= 4, `unexpected switches ${p.switches}`);
});
test("pose and zoom stay in full two-dimensional map bounds; no large frame zoom jump", () => {
  const d = new CameraDirector();
  let last = 0.78;
  for (let i = 0; i < 180; i++) {
    d.request = i < 90 ? "red" : "blue";
    const p = d.update(frame(clash(2400)), i / 60);
    const hw = LIVE_VIEW.viewport.width / 2 / p.zoom,
      hh = LIVE_VIEW.viewport.height / 2 / p.zoom;
    assert.ok(p.x - hw >= -1e-6 && p.x + hw <= WORLD.width + 1e-6);
    assert.ok(p.y - hh >= -1e-6 && p.y + hh <= WORLD.height + 1e-6);
    assert.ok(Math.abs(p.zoom - last) <= 0.28 / 60 + 0.00001);
    last = p.zoom;
  }
});
test("overview is tactical zoom-out with whole-map minimap, projection preserves row ordering", () => {
  const d = new CameraDirector();
  d.request = "overview";
  const p = settle(d, frame(clash(2400)), 12);
  assert.equal(p.mode, "overview");
  assert.ok(p.zoom < 0.6);
  assert.ok(projectY(800) < projectY(1200));
});
test("pre-contact overview follows an advancing army, not empty midfield", () => {
  const d = new CameraDirector(),
    s = frame([
      ...Array.from({ length: 20 }, () => unit(0, 700, 1100, "sword", "run")),
      ...Array.from({ length: 20 }, () => unit(1, 4100, 1100, "sword", "run")),
    ]);
  const p = settle(d, s);
  assert.equal(p.mode, "overview");
  assert.ok(p.x < 1500);
});
