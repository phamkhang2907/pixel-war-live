import * as T from "three";
const root = "/assets/3d/terrain/leafy_grass/";
export const GRASS_TILE_METERS = 6;
export const DIRT_TILE_METERS = 3;
export interface TerrainSurface {
  grass: T.MeshStandardMaterial;
  dirt: T.MeshStandardMaterial;
  ready: Promise<void>;
  inspect: () => {
    status: string;
    errors: string[];
    maps: {
      file: string;
      size: number[];
      repeat: number[];
      colorSpace: string;
      anisotropy: number;
    }[];
  };
  dispose: () => void;
}
export function terrainMaterials(
  anisotropy = 4,
  onError: (message: string) => void = () => {},
): TerrainSurface {
  const loader = new T.TextureLoader(),
    textures: T.Texture[] = [],
    errors: string[] = [],
    pending: Promise<void>[] = [];
  const load = (file: string, srgb: boolean, repeat: T.Vector2) => {
    let done: () => void, fail: (e: Error) => void;
    pending.push(
      new Promise<void>((resolve, reject) => {
        done = resolve;
        fail = reject;
      }),
    );
    const texture = loader.load(
      root + file,
      () => done(),
      () => {
        const message = "Terrain texture failed: " + file;
        errors.push(message);
        onError(message);
        fail(new Error(message));
      },
    );
    texture.name = file;
    texture.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.repeat.copy(repeat);
    texture.minFilter = T.LinearMipmapLinearFilter;
    texture.magFilter = T.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = srgb ? Math.max(1, Math.min(4, anisotropy)) : 1;
    textures.push(texture);
    return texture;
  };
  // Uniform world scale: one grass tile covers 6x6 m on the 240x210 m plane.
  const repeat = new T.Vector2(
    240 / GRASS_TILE_METERS,
    210 / GRASS_TILE_METERS,
  );
  const grass = new T.MeshStandardMaterial({
    name: "Poly Haven dark green grass PBR",
    color: new T.Color().setRGB(0.6, 0.93, 0.76),
    map: load("leafy_grass_diff_1k.jpg", true, repeat),
    normalMap: load("leafy_grass_nor_gl_1k.jpg", false, repeat),
    roughnessMap: load("leafy_grass_rough_1k.jpg", false, repeat),
    normalScale: new T.Vector2(0.25, 0.25),
    roughness: 1,
    metalness: 0,
    vertexColors: true,
  });
  // Dirt meshes use world-space UVs below so the road and gate patches align.
  const dirt = new T.MeshStandardMaterial({
    name: "Poly Haven worn ground",
    map: load("grass_path_3_diff_1k.jpg", true, new T.Vector2(1, 1)),
    color: 0xc6c3b3,
    roughness: 1,
    metalness: 0,
  });
  let status = "loading";
  const ready = Promise.allSettled(pending).then(() => {
    status = errors.length ? "failed" : "ready";
  });
  return {
    grass,
    dirt,
    ready,
    inspect: () => ({
      status,
      errors: [...errors],
      maps: textures.map((t) => ({
        file: t.name,
        size: t.image ? [t.image.width, t.image.height] : [],
        repeat: t.repeat.toArray(),
        colorSpace: t.colorSpace,
        anisotropy: t.anisotropy,
      })),
    }),
    dispose: () => {
      for (const texture of textures) texture.dispose();
    },
  };
}
export function worldDirtUV(
  geometry: T.BufferGeometry,
  offsetX = 0,
  offsetZ = 0,
) {
  const positions = geometry.getAttribute("position"),
    uv = geometry.getAttribute("uv");
  for (let i = 0; i < positions.count; i++)
    uv.setXY(
      i,
      (positions.getX(i) + offsetX) / DIRT_TILE_METERS,
      -(positions.getZ(i) + offsetZ) / DIRT_TILE_METERS,
    );
  uv.needsUpdate = true;
}
