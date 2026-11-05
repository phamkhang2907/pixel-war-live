export const ANIMATIONS = [
  "idle",
  "run",
  "attack",
  "hurt",
  "death",
  "fly",
  "stomp",
  "rage",
];
export const SPRITE = { width: 64, height: 64, frames: 8, rows: 8 };
export const LIVE_VIEW = {
  width: 1080,
  height: 1920,
  viewport: { x: 48, y: 360, width: 924, height: 1040 },
  minZoom: 0.58,
  maxZoom: 1.18,
};
export const WORLD = {
  width: 4800,
  height: 2400,
  castles: [180, 4620],
  ground: 1100,
  laneMin: 760,
  laneMax: 1480,
  rows: 15,
  rowGap: 48,
};
export const projectY = (y) => WORLD.ground + (y - WORLD.ground) * 0.78;
export const formation = (team, slot, type = "sword") => {
  const row = slot % WORLD.rows,
    column = Math.floor(slot / WORLD.rows) % 20;
  const x = WORLD.castles[team] + (team === 0 ? 1 : -1) * (260 + column * 48);
  return {
    x,
    y: WORLD.laneMin + row * WORLD.rowGap,
    lane: WORLD.laneMin + row * WORLD.rowGap,
  };
};
export const TYPES = {
  sword: {
    name: "Swordsman",
    hp: 100,
    damage: 15,
    range: 38,
    speed: 65,
    cooldown: 0.85,
    radius: 14,
    scale: 1,
    air: false,
    antiAir: false,
  },
  archer: {
    name: "Archer",
    hp: 65,
    damage: 20,
    range: 280,
    speed: 53,
    cooldown: 1.3,
    radius: 13,
    scale: 1,
    air: false,
    antiAir: true,
    projectile: "arrow",
  },
  cavalry: {
    name: "Cavalry",
    hp: 180,
    damage: 35,
    range: 48,
    speed: 110,
    cooldown: 1.2,
    radius: 21,
    scale: 1.3,
    air: false,
    antiAir: false,
  },
  mage: {
    name: "Flying Mage",
    hp: 100,
    damage: 50,
    range: 230,
    speed: 60,
    cooldown: 2,
    radius: 16,
    scale: 1.1,
    air: true,
    antiAir: true,
    projectile: "fireball",
    splash: 85,
  },
  guardian: {
    name: "Giant Guardian",
    hp: 900,
    damage: 35,
    range: 65,
    speed: 36,
    cooldown: 1.6,
    radius: 52,
    scale: 2.5,
    air: false,
    antiAir: false,
  },
  boss: {
    name: "War Titan",
    hp: 2500,
    damage: 120,
    range: 100,
    speed: 38,
    cooldown: 2.2,
    radius: 70,
    scale: 3.4,
    air: false,
    antiAir: false,
  },
};
export const DEFAULT_RULES = [
  { min: 1, type: "sword", count: 1 },
  { min: 10, type: "archer", count: 1 },
  { min: 50, type: "cavalry", count: 1 },
  { min: 100, type: "mage", count: 1 },
  { min: 200, type: "guardian", count: 1 },
  { min: 1000, type: "boss", count: 1 },
];
export const LIKE_REWARDS = [
  { at: 100, label: "3 Swordsman" },
  { at: 300, label: "2 Archer" },
  { at: 500, label: "Castle +100 HP" },
  { at: 1000, label: "1 Guardian" },
  { at: 3000, label: "Arrow rain" },
  { at: 5000, label: "+20% attack speed / 15s" },
];
