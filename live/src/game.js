export const TYPES = {
  sword: { hp: 110, damage: 12, range: 22, speed: 31, cooldown: 0.85 },
  archer: { hp: 65, damage: 10, range: 115, speed: 25, cooldown: 1.2 },
  cavalry: { hp: 230, damage: 23, range: 30, speed: 55, cooldown: 0.9 },
  mage: { hp: 85, damage: 28, range: 95, speed: 23, cooldown: 1.7 },
  boss: { hp: 1300, damage: 65, range: 42, speed: 17, cooldown: 1.8 },
};
export const DEFAULT_RULES = [
  { min: 1, type: "sword", count: 1 },
  { min: 5, type: "archer", count: 2 },
  { min: 20, type: "cavalry", count: 2 },
  { min: 50, type: "mage", count: 3 },
  { min: 100, type: "boss", count: 1 },
];
export class Battle {
  constructor() {
    this.rules = structuredClone(DEFAULT_RULES);
    this.teams = new Map();
    this.scores = new Map();
    this.events = [];
    this.round = 0;
    this.reset();
  }
  reset() {
    this.units = [];
    this.castles = [10000, 10000];
    this.time = 0;
    this.winner = null;
    this.nextId ??= 1;
    this.effects = [];
    this.effectId ??= 1;
    this.round++;
    this.scores.clear();
    this.events = [];
  }
  choose(id, team) {
    if (team === 0 || team === 1) this.teams.set(String(id), team);
  }
  spawn(team, type, count, name = "Demo", userId = name) {
    if (
      this.winner !== null ||
      !Object.hasOwn(TYPES, type) ||
      ![0, 1].includes(team) ||
      !Number.isFinite(count)
    )
      return 0;
    count = Math.min(Math.max(0, Math.floor(count)), 300 - this.units.length);
    for (let i = 0; i < count; i++)
      this.units.push({
        id: this.nextId++,
        team,
        type,
        name: String(name).slice(0, 24),
        userId,
        x: 85 + Math.random() * 370,
        y: team === 0 ? 225 + Math.random() * 70 : 635 + Math.random() * 70,
        hp: TYPES[type].hp,
        maxHp: TYPES[type].hp,
        cd: Math.random(),
        state: "run",
        hurt: 0,
        dead: 0,
      });
    return count;
  }
  gift({ id, name, coins, count = 1 }) {
    const team = this.teams.get(String(id));
    if (team === undefined) return { error: "Choose a team with 1 or 2 first" };
    const value = Math.min(
      100000,
      Math.max(1, Number(coins) || 1) *
        Math.min(100, Math.max(1, Number(count) || 1)),
    );
    const rule =
      [...this.rules]
        .sort((a, b) => b.min - a.min)
        .find((r) => value >= r.min) || this.rules[0];
    const spawned = this.spawn(team, rule.type, rule.count, name, id);
    const score = this.scores.get(String(id)) || { name, team, coins: 0 };
    score.coins += value;
    score.team = team;
    score.name = name;
    this.scores.set(String(id), score);
    this.events.unshift({
      name: String(name).slice(0, 24),
      team,
      type: rule.type,
      count: spawned,
      value,
      at: Date.now(),
    });
    this.events = this.events.slice(0, 15);
    return { spawned };
  }
  tick(dt) {
    if (this.winner !== null) return;
    this.time += dt;
    const cells = new Map();
    const key = (x, y) => `${Math.floor(x / 120)},${Math.floor(y / 120)}`;
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      const k = key(u.x, u.y);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(u);
    }
    for (const u of this.units) {
      if (u.hp <= 0) {
        u.state = "death";
        u.dead += dt;
        continue;
      }
      const t = TYPES[u.type];
      u.cd -= dt;
      u.hurt = Math.max(0, u.hurt - dt);
      let target = null,
        best = Infinity;
      const cx = Math.floor(u.x / 120),
        cy = Math.floor(u.y / 120);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (const v of cells.get(`${cx + dx},${cy + dy}`) || []) {
            if (v.team === u.team || v.hp <= 0) continue;
            const d = Math.hypot(u.x - v.x, u.y - v.y);
            if (d < best) {
              best = d;
              target = v;
            }
          }
      const castleY = u.team === 0 ? 752 : 170;
      const castleD = Math.hypot(u.x - 270, u.y - castleY);
      if (!target) {
        best = castleD;
        target = { x: 270, y: castleY, castle: true };
      }
      if (best <= t.range + (target.castle ? 50 : 0)) {
        u.state = u.hurt > 0 ? "hurt" : "attack";
        if (u.cd <= 0) {
          u.cd = t.cooldown;
          this.effects.push({
            id: this.effectId++,
            type: u.type,
            team: u.team,
            x: u.x,
            y: u.y,
            tx: target.x,
            ty: target.y,
            time: this.time,
          });
          if (this.effects.length > 80) this.effects.shift();
          if (target.castle) {
            this.castles[1 - u.team] = Math.max(
              0,
              this.castles[1 - u.team] - t.damage,
            );
          } else {
            target.hp -= t.damage;
            target.hurt = 0.2;
            if (u.type === "mage")
              for (const v of this.units)
                if (
                  v !== target &&
                  v.team !== u.team &&
                  v.hp > 0 &&
                  Math.hypot(v.x - target.x, v.y - target.y) < 45
                ) {
                  v.hp -= t.damage * 0.45;
                  v.hurt = 0.2;
                }
          }
        }
      } else {
        u.state = u.hurt > 0 ? "hurt" : "run";
        const dx = target.x - u.x,
          dy = target.y - u.y;
        u.x += (dx / best) * t.speed * dt;
        u.y += (dy / best) * t.speed * dt;
        u.x = Math.max(30, Math.min(510, u.x));
      }
      // Local separation keeps armies legible without a physics body per unit.
      if (u.state === "run") {
        let sx = 0,
          sy = 0,
          n = 0;
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++)
            for (const v of cells.get(`${cx + dx},${cy + dy}`) || []) {
              if (v === u || v.hp <= 0) continue;
              const ax = u.x - v.x,
                ay = u.y - v.y,
                dist = Math.hypot(ax, ay);
              if (dist > 0 && dist < 19) {
                sx += (ax / dist) * (19 - dist);
                sy += (ay / dist) * (19 - dist);
                n++;
              }
            }
        if (n) {
          u.x += (sx / n) * dt * 7;
          u.y += (sy / n) * dt * 7;
        }
        u.x = Math.max(28, Math.min(512, u.x));
      }
    }
    this.units = this.units.filter((u) => u.dead < 0.7);
    if (this.castles.some((h) => h === 0))
      this.winner = this.castles[0] === 0 ? 1 : 0;
  }
  snapshot() {
    return {
      units: this.units,
      effects: this.effects.filter((e) => this.time - e.time < 0.6),
      castles: this.castles,
      time: this.time,
      winner: this.winner,
      round: this.round,
      scores: [...this.scores.values()]
        .sort((a, b) => b.coins - a.coins)
        .slice(0, 5),
      events: this.events,
    };
  }
}
