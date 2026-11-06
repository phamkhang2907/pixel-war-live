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
        best = d;
        target = v;
      }
    },
    128,
    u.id,
  );
  if (t.defender) {
    u.x = u.homeX;
    u.y = u.homeY;
  } else if (!target) {
    target = game.castle(1 - u.team, u.lane ?? u.y);
    best = Math.hypot(target.x - u.x, target.y - u.y);
  }
  if (target) {
    u.faceX = target.x;
    u.faceY = target.y;
  }
  // Damage is committed once after a short visible wind-up, independent of particles.
  if (u.monsterCast) {
    u.monsterCast.remaining -= dt;
    if (u.monsterCast.remaining <= 0) {
      const cast = u.monsterCast;
      u.monsterCast = null;
      if (t.defender) {
        if (cast.target.hp > 0)
          game.addProjectile(u, cast.target, t.damage, "kingMagic", t.splash);
      } else {
        const p = cast.target,
          x = p.x,
          y = p.y;
        game.hitArea(u.team, x, y, t.damage, t.splash, 0, true, {
          ...u,
          element: t.element,
        });
        if (p.castle && Math.hypot(p.x - u.x, p.y - u.y) <= t.range + 70)
          game.damageCastle(1 - u.team, t.damage, u);
        game.effect("dragonBreath", x, y, {
          team: u.team,
          element: t.element,
          sourceId: u.id,
          sx: u.x,
          sy: u.y,
          radius: t.splash,
        });
      }
    }
  }
  if (
    target &&
    best <= t.range + (target.castle ? 48 : TYPES[target.type].radius)
  ) {
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
      u.monsterCast = { remaining: t.defender ? 0.3 : 0.4, target };
    }
  } else if (!t.defender && target) {
    u.state = u.hurt > 0 ? "hurt" : "fly";
    const speed = t.speed * (u.slowUntil > game.time ? MONSTERS.slowFactor : 1);
    if (best > 0) {
      u.x += ((target.x - u.x) / best) * speed * dt;
      u.y += ((target.y - u.y) / best) * speed * dt;
    }
  } else u.state = u.hurt > 0 ? "hurt" : "idle";
  return true;
}
