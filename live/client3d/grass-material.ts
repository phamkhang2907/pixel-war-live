import * as T from "three";
import { WORLD } from "../src/characters.js";
export const MEADOW_CLEARANCE =
  Math.max(WORLD.ground - WORLD.laneMin, WORLD.laneMax - WORLD.ground) / 50 + 4;

export const TERRAIN_PALETTE = {
  main: 0x718c4a,
  dark: 0x4e713c,
  light: 0x93a85a,
  dirt: 0xa49b65,
};
// Keep navigation and castle foundations level; relief starts outside all lanes.
export function terrainHeight(x: number, z: number) {
  const edge = T.MathUtils.smoothstep(
    Math.abs(z),
    MEADOW_CLEARANCE + 2,
    MEADOW_CLEARANCE + 36,
  );
  return (
    -0.035 +
    edge *
      (1.1 + Math.sin(x * 0.08 + z * 0.05) * 0.65 + Math.cos(z * 0.14) * 0.45)
  );
}
export interface TerrainSurface {
  grass: T.MeshLambertMaterial;
  dirt: T.MeshLambertMaterial;
  ready: Promise<void>;
  inspect: () => {
    status: string;
    style: string;
    errors: string[];
    maps: unknown[];
    palette: typeof TERRAIN_PALETTE;
  };
  dispose: () => void;
}
export function terrainMaterials(): TerrainSurface {
  const grass = new T.MeshLambertMaterial({
    name: "Stylized moss meadow",
    color: 0xffffff,
    vertexColors: true,
  });
  const dirt = new T.MeshLambertMaterial({
    name: "Feathered stylized dirt",
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  return {
    grass,
    dirt,
    ready: Promise.resolve(),
    inspect: () => ({
      status: "ready",
      style: "stylized-low-poly",
      errors: [],
      maps: [],
      palette: TERRAIN_PALETTE,
    }),
    dispose: () => {},
  };
}
