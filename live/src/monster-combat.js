import { tickFlyby } from "./warfare.js";
import { TYPES, WORLD, MONSTERS } from "./characters.js";
// Horizontal combat coordinates remain X/Y on the authoritative server (renderer X/Z).
export function spawnCastleDefenders(game) {
  if (game.units.some((u) => TYPES[u.type]?.defender)) return;
  for (const team of [0, 1])
    for (const side of [-1, 1]) {
      const t = TYPES.mushroomKing,
        x = WORLD.castles[team] + (team ? -1 : 1) * MONSTERS.gateOffset,
        y = WORLD.ground + side * MONSTERS.gateSide;
      game.units.push({
        id: game.nextId++,
        team,
        type: "mushroomKing",
        name: "Castle Mushroom King",
        userId: null,
        origin: "castleDefender",
        summonSequence: null,
        x,
        y,
        homeX: x,
        homeY: y,
        lane: y,
        hp: t.hp,
        maxHp: t.hp,
        cd: 0.4,
        skill: 0,
        hurt: 0,
        dead: 0,
        windup: 0,
        state: "idle",
        attackId: 0,
        faceX: WORLD.castles[1 - team],
        faceY: y,
      });
    }
  game.spawnGridDirty = true;
}
export function tickMonster(game, u, enemies, dt) {
  const t = TYPES[u.type];
  if (!t.monster) return false;
  if (!t.defender) return tickFlyby(game, u, dt);
  u.x = u.homeX;
  u.y = u.homeY;
  let target = null,
    best = Infinity;
  enemies[1 - u.team].query(
    u.x,
    u.y,
    t.range + 100,
    (v) => {
      if (v.hp <= 0 || v.team === u.team) return;
      const d = Math.hypot(v.x - u.x, v.y - u.y);
      if (d < best) {
        target = v;
        best = d;
      }
    },
    128,
    u.id,
  );
  if (target) {
    u.faceX = target.x;
    u.faceY = target.y;
  }
  if (u.monsterCast) {
    u.monsterCast.remaining -= dt;
    if (u.monsterCast.remaining <= 0) {
      const cast = u.monsterCast;
      u.monsterCast = null;
      if (cast.target.hp > 0 && cast.target.team !== u.team)
        game.addProjectile(u, cast.target, t.damage, "kingMagic", t.splash);
    }
  }
  if (target && best <= t.range + TYPES[target.type].radius) {
    u.state =
      u.hurt > 0
        ? "hurt"
        : u.monsterCast || u.cd > t.cooldown - 0.9
          ? "attack"
          : "idle";
    if (u.cd <= 0 && !u.monsterCast) {
      u.state = "attack";
      u.cd = t.cooldown;
      u.attackId++;
      u.monsterCast = { remaining: 0.3, target };
    }
  } else u.state = u.hurt > 0 ? "hurt" : "idle";
  return true;
}
