import { test } from "node:test";
import assert from "node:assert/strict";
import { Battle } from "../src/game.js";
import { WORLD } from "../src/characters.js";
for (const count of [200, 500, 1000])
  test(`${count} troops keep an organic broad front through engagement`, () => {
    const b = new Battle();
    for (const team of [0, 1]) {
      b.spawn(team, "sword", count / 2);
      b.units
        .filter((u) => u.team === team)
        .forEach((u, i) => {
          u.x =
            2400 +
            (team === 0 ? -120 : 120) +
            (team === 0 ? -1 : 1) * Math.floor(i / WORLD.rows) * 84;
        });
    }
    for (let i = 0; i < 160; i++) b.tick(0.05);
    for (const team of [0, 1]) {
      const units = b.units.filter((u) => u.team === team && u.hp > 0);
      const span =
        Math.max(...units.map((u) => u.y)) - Math.min(...units.map((u) => u.y));
      assert.ok(span > 650, `frontage collapsed: ${span}`);
      assert.ok(new Set(units.map((u) => u.lane)).size > units.length * 0.9);
    }
    assert.equal(b.castle(0, WORLD.laneMin).y, WORLD.ground - 900);
    assert.equal(b.castle(1, WORLD.laneMax).y, WORLD.ground + 900);
  });
