import * as T from "three";
import { WORLD } from "../src/characters.js";
export const MEADOW_CLEARANCE =
  Math.max(WORLD.ground - WORLD.laneMin, WORLD.laneMax - WORLD.ground) / 50 + 4;

export const TERRAIN_PALETTE = {
  main: 0x73a44c,
  dark: 0x386440,
  light: 0xa2c45a,
  dirt: 0xa49b65,
};
// One render-height field shared by ground, characters, shadows and projectiles.
// Only elevation changes: server lanes, movement, blockers and attack ranges remain X/Z.
export function terrainHeight(x: number, z: number) {
  const foundation =
    T.MathUtils.smoothstep(Math.abs(x), 31, 38) *
    (1 - T.MathUtils.smoothstep(Math.abs(x), 61, 68)) *
    (1 - T.MathUtils.smoothstep(Math.abs(z), 23, 29));
  const meadow =
    0.48 +
    Math.sin(x * 0.105) * 0.32 * Math.cos(z * 0.075) +
    Math.sin(z * 0.16 + x * 0.03) * 0.23 +
    Math.cos(x * 0.15 - z * 0.12) * 0.12;
  const terrace = T.MathUtils.smoothstep(Math.abs(z), 34, 43);
  const hills =
    T.MathUtils.smoothstep(Math.abs(z), 52, 78) *
    (3.5 + Math.sin(x * 0.065 + z * 0.045) * 1.8 + Math.cos(z * 0.11) * 1.2);
  return -0.035 + (3.0 + meadow) * (1 - foundation) * (1 - terrace) + hills;
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
    normalScale: new T.Vector2(0.16, -0.16),
    color: 0xffffff,
    vertexColors: true,
  });
  // Retain legal fine surface detail, while vertex colors determine the stylized biome.
  grass.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
#ifdef USE_MAP
 vec4 texel = texture2D(map,vMapUv);
 float grain = dot(texel.rgb,vec3(.2126,.7152,.0722));
 diffuseColor *= vec4(vec3(.82 + grain*.30),texel.a);
#endif
`,
    );
  };
  grass.customProgramCacheKey = () => "fantasy-grass-grain-v1";
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
      style: "stylized-fantasy-pbr-grain",
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
