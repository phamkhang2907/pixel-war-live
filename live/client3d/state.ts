import { WORLD } from "../src/characters.js";

// Render-only adapter: never mutates server coordinates or decides damage.
// Existing pixel-space X/Y becomes world-space X/Z. Y is reserved for height.
export const WORLD_SCALE = 1 / 50;
export const worldX = (x: number) => (x - WORLD.width / 2) * WORLD_SCALE;
export const worldZ = (y: number) => (y - WORLD.ground) * WORLD_SCALE;
export const CASTLE_X = WORLD.castles.map(worldX);
export type Team = 0 | 1;
export type SoldierKind =
  "sword" | "archer" | "cavalry" | "mage" | "guardian" | "boss";
export type MonsterKind = "frostDragon" | "fireDragon" | "mushroomKing";
export type UnitKind = SoldierKind | MonsterKind;
export interface SoldierState extends UnitState {
  type: SoldierKind;
}
export const isSoldier = (u: UnitState): u is SoldierState =>
  !["frostDragon", "fireDragon", "mushroomKing"].includes(u.type);
export interface UnitState {
  id: number;
  team: Team;
  type: UnitKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: string;
  faceX?: number;
  faceY?: number;
  slowUntil?: number;
  attackId?: number;
  summonSequence?: number | null;
  origin?: string;
}
export interface BattleState {
  round: number;
  time: number;
  mode: string;
  arena?: string;
  liveConnection?: {
    state: string;
    username: string;
    message: string;
    hint: string;
  };
  paused: boolean;
  castles: [number, number];
  units: UnitState[];
  armyCapacity?: number;
  summonQueue?: { pending: number; headSequence: number | null };
  serverNow?: number;
  roundState: {
    id: string;
    state?: string;
    phase: string;
    remaining: number;
    phaseRemaining: number;
    result?: {
      id: string;
      number: number;
      winner: Team | null;
      aborted: boolean;
      scores: number[];
      castles: number[];
      damage: number[];
      top10: {
        id: string;
        name: string;
        team: number;
        points: number;
        avatar?: string;
      }[];
    } | null;
  };
}
