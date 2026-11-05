import { WORLD } from "../src/characters.js";

// Render-only adapter: never mutates server coordinates or decides damage.
// Existing pixel-space X/Y becomes world-space X/Z. Y is reserved for height.
export const WORLD_SCALE = 1 / 50;
export const worldX = (x: number) => (x - WORLD.width / 2) * WORLD_SCALE;
export const worldZ = (y: number) => (y - WORLD.ground) * WORLD_SCALE;
export const CASTLE_X = WORLD.castles.map(worldX);
export type Team = 0 | 1;
export type UnitKind =
  "sword" | "archer" | "cavalry" | "mage" | "guardian" | "boss";
export interface UnitState {
  id: number;
  team: Team;
  type: UnitKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: string;
}
export interface BattleState {
  round: number;
  time: number;
  mode: string;
  paused: boolean;
  castles: [number, number];
  units: UnitState[];
  roundState: {
    phase: string;
    remaining: number;
    phaseRemaining: number;
    result?: { winner: Team | null; aborted: boolean } | null;
  };
}
