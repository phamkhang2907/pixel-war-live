import { seeded } from "./spatial.js";
export const WORLD = {
  width: 4800,
  height: 3200,
  castles: [180, 4620],
  ground: 1600,
  laneMin: 100,
  laneMax: 3100,
  rows: 15,
  rowGap: 80,
};
// Rendering and authoritative capacity use the same explicit budgets.
export const ARMY = Object.freeze({
  maxUnits: 2000,
  defaultUnits: 1000,
  // 15% smaller normals; Heavy grows slightly and the existing Giant keeps its height.
  normalHeight: 1.53,
  normalSpeed: 110,
  deploymentBatch: 64,
});
export const formation = (
  team,
  slot,
  type = "sword",
  bands = 1,
  selectedBand = slot % bands,
) => {
  // Deterministic continuous samples, never a row/column layout.
  const a = seeded(slot + 1, team * 9137 + 37),
    b = seeded(slot + 1, team * 5723 + 71);
  const radius = TYPES[type]?.radius ?? 9;
  const y =
    WORLD.laneMin + radius + b * (WORLD.laneMax - WORLD.laneMin - 2 * radius);
  return {
    x:
      WORLD.castles[team] +
      (team === 0 ? 1 : -1) * (370 + selectedBand * 260 + (a - 0.5) * 220),
    spawnBand: selectedBand,
    y,
    lane: y,
  };
};
export const renderScale = (type) =>
  (ARMY.normalHeight / 1.8) * TYPES[type].scale;
export const TYPES = {
  sword: {
    name: "Small Soldier",
    hp: 100,
    damage: 15,
    range: 38,
    speed: ARMY.normalSpeed,
    cooldown: 0.85,
    radius: 13,
    scale: 1,
    air: false,
    antiAir: false,
  },
  archer: {
    name: "Archer",
    hp: 65,
    damage: 20,
    range: 280,
    speed: ARMY.normalSpeed * 0.9,
    cooldown: 1.3,
    radius: 13,
    scale: 1,
    air: false,
    antiAir: true,
    projectile: "arrow",
  },
  cavalry: {
    name: "Heavy Soldier",
    hp: 180,
    damage: 35,
    range: 48,
    speed: ARMY.normalSpeed * 0.65,
    cooldown: 1.2,
    radius: 21,
    scale: 1.6,
    air: false,
    antiAir: false,
  },
  mage: {
    name: "Mage",
    hp: 100,
    damage: 50,
    range: 230,
    speed: ARMY.normalSpeed * 0.9,
    cooldown: 2,
    radius: 13,
    scale: 1,
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
    name: "Giant",
    hp: 2500,
    damage: 120,
    range: 100,
    speed: ARMY.normalSpeed * 0.4,
    cooldown: 2.2,
    radius: 70,
    scale: 4,
    air: false,
    antiAir: false,
  },
  frostDragon: {
    name: "Frost Dragon",
    hp: 2200,
    damage: 100,
    range: 290,
    speed: 100,
    cooldown: 2.6,
    radius: 65,
    scale: 4,
    air: true,
    antiAir: true,
    element: "ice",
    monster: true,
    flightHeight: 280,
    splash: 170,
  },
  fireDragon: {
    name: "Fire Dragon",
    hp: 2200,
    damage: 100,
    range: 290,
    speed: 100,
    cooldown: 2.6,
    radius: 65,
    scale: 4,
    air: true,
    antiAir: true,
    element: "fire",
    monster: true,
    flightHeight: 280,
    splash: 170,
  },
  mushroomKing: {
    name: "Mushroom King",
    hp: 1400,
    damage: 45,
    range: 520,
    speed: 0,
    cooldown: 1.8,
    radius: 40,
    scale: 2.6,
    air: false,
    antiAir: true,
    monster: true,
    defender: true,
    projectile: "kingMagic",
    splash: 45,
  },
};
export const LIKE_REWARDS = [
  { at: 100, label: "3 Swordsman" },
  { at: 300, label: "2 Archer" },
  { at: 500, label: "Castle +100 HP" },
  { at: 1000, label: "1 Heavy Soldier" },
  { at: 3000, label: "Arrow rain" },
  { at: 5000, label: "+20% attack speed / 15s" },
];

export const MONSTERS = Object.freeze({
  maxDragons: 12,
  defendersPerCastle: 2,
  gateOffset: 330,
  gateSide: 150,
  slowSeconds: 3,
  slowFactor: 0.55,
});
