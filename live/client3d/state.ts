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
export interface EffectState {
  id: number;
  type: string;
  x: number;
  y: number;
  time?: number;
  life?: number;
  team?: number;
  sourceId?: number;
  raidId?: number;
  delay?: number;
  radius?: number;
  element?: string;
  sourceKind?: string;
  dead?: boolean;
}
export interface UnitState {
  name?: string;
  userId?: string | null;
  avatar?: string;
  roundId?: string;
  spawnTimestamp?: number;
  quantity?: number;
  requestQuantity?: number;
  flyby?: { age: number; duration: number; roundId: string };
  burning?: { until: number };
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
  bornAt?: number;
  summonRequest?: number;
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
  events?: GiftNotice[];
  summons?: SummonBatch[];
  summonProtocol?: number;
  paused: boolean;
  castles: [number, number];
  castleMaxHp?: number;
  battleScore?: number[];
  teamKills?: number[];
  effects?: EffectState[];
  hazards?: {
    raidId: number;
    team: number;
    x: number;
    y: number;
    at: number;
    radius: number;
  }[];
  heartWar?: {
    index: number;
    likes: number[];
    raided: boolean[];
    remaining: number;
    target: number;
    lastWinner: Team | null;
    bonus: number[];
  };
  units: UnitState[];
  armyCapacity?: number;
  summonQueue?: { pending: number; headSequence: number | null };
  serverNow?: number;
  roundState: {
    id: string;
    elapsed?: number;
    duration?: number;
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

export interface SummonBatch {
  id: number;
  at: number;
  roundId: string;
  requestId: number;
  cohort: number;
  count: number;
  firstId: number;
  lastId: number;
  x: number;
  y: number;
  type: UnitKind;
  team: Team;
  name: string;
  userId: string;
  avatar: string;
  giftIcon: string;
  giftName: string;
  origin: string;
}
export interface GiftNotice {
  id: number;
  at: number;
  kind: string;
  name: string;
  userId?: string;
  team: Team;
  type?: UnitKind;
  count?: number;
  giftName?: string;
  avatar?: string;
  giftIcon?: string;
  giftQuantity?: number;
  queued?: boolean;
}
