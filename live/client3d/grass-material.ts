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
  grass: T.MeshStandardMaterial;
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
  const grass = new T.MeshStandardMaterial({
    name: "Fine grass · ambientCG Grass001 CC0",
    roughness: 1,
    metalness: 0,
    normalScale: new T.Vector2(0.35, -0.35),
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
  const maps: { name: string; texture: T.Texture }[] = [],
    errors: string[] = [];
  let status = "loading",
    disposed = false;
  const loader = new T.TextureLoader();
  const ready = Promise.all(
    [
      ["diff", "map"],
      ["nor_gl", "normalMap"],
      ["rough", "roughnessMap"],
    ].map(async ([name, slot]) => {
      try {
        const texture = await loader.loadAsync(
          "/assets/3d/terrain/grass001/" +
            ({ diff: "color", nor_gl: "normal", rough: "rough" }[
              name
            ] as string) +
            "-1k.jpg",
        );
        if (disposed) {
          texture.dispose();
          return;
        }
        texture.wrapS = texture.wrapT = T.RepeatWrapping;
        texture.repeat.set(320 / 1.4, 320 / 1.4); // API: photographed surface is 1.4 m wide.
        texture.colorSpace =
          name === "diff" ? T.SRGBColorSpace : T.NoColorSpace;
        texture.anisotropy = name === "diff" ? 2 : 1;
        (grass as unknown as Record<string, unknown>)[slot] = texture;
        maps.push({ name, texture });
        grass.needsUpdate = true;
      } catch (e) {
        errors.push(String(e));
      }
    }),
  ).then(() => {
    status = errors.length ? "failed" : "ready";
  });
  return {
    grass,
    dirt,
    ready,
    inspect: () => ({
      status,
      style: "photographic-pbr-grass",
      errors,
      maps: maps.map((m) => ({
        name: m.name,
        width: m.texture.image.width,
        height: m.texture.image.height,
        repeat: m.texture.repeat.toArray(),
        colorSpace: m.texture.colorSpace,
      })),
      palette: TERRAIN_PALETTE,
    }),
    dispose: () => {
      disposed = true;
      for (const m of maps) m.texture.dispose();
    },
  };
}
