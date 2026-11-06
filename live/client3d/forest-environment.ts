import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { terrainHeight, MEADOW_CLEARANCE } from "./grass-material";

export const forestCatalog = [
  { kind: "grass", file: "Grass_1_B_Color1.gltf", count: 100 },
  { kind: "grass", file: "Grass_2_B_Color1.gltf", count: 80 },
  { kind: "shrub", file: "Bush_1_A_Color1.gltf", count: 40 },
  { kind: "shrub", file: "Bush_2_A_Color1.gltf", count: 20 },
  { kind: "stone", file: "Rock_1_A_Color1.gltf", count: 54 },
  { kind: "cliff", file: "Rock_3_A_Color1.gltf", count: 56 },
  { kind: "outcrop", file: "Rock_2_H_Color1.gltf", count: 32 },
  { kind: "tree", file: "Tree_2_A_Color1.gltf", count: 28 },
  { kind: "tree", file: "Tree_4_A_Color1.gltf", count: 16 },
] as const;
const ROOT = "/kaykit/forest/Assets/gltf/";
export async function buildForest(scene: T.Scene) {
  const loader = new GLTFLoader();
  const models = await Promise.all(
    forestCatalog.map((a) => loader.loadAsync(ROOT + a.file)),
  );
  const root = new T.Group();
  root.name = "Instanced KayKit fantasy environment";
  let seed = 641093;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const placements: {
    kind: string;
    file: string;
    x: number;
    z: number;
    radius: number;
    ground: number;
    bottom: number;
    height: number;
  }[] = [];
  const contacts: { x: number; z: number; radius: number }[] = [];
  const batches: {
    file: string;
    kind: string;
    instances: number;
    textured: boolean;
  }[] = [];
  let shared: T.MeshLambertMaterial | undefined;
  const resources = new Set<T.Texture>();
  for (const [index, asset] of forestCatalog.entries()) {
    const source = models[index].scene;
    source.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(source),
      size = box.getSize(new T.Vector3()),
      center = box.getCenter(new T.Vector3());
    if (!Number.isFinite(size.y) || size.y <= 0)
      throw Error("Invalid forest model: " + asset.file);
    const radiusFactor = (Math.hypot(size.x, size.z) / size.y) * 0.5;
    const matrices: T.Matrix4[] = [],
      tints: T.Color[] = [];
    for (let i = 0; i < asset.count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      let x = (random() - 0.5) * 116,
        z = side * (MEADOW_CLEARANCE + random() * 19),
        height = 0.45 + random() * 0.35;
      if (asset.kind === "shrub") {
        height = 0.4 + random() * 0.65;
        z = side * (MEADOW_CLEARANCE + 4 + random() * 18);
      }
      if (asset.kind === "stone") {
        height = 0.23 + random() * 0.48;
        z = side * (MEADOW_CLEARANCE + 1 + random() * 15);
      }
      if (asset.kind === "cliff") {
        const far = i >= 34;
        x = far
          ? (i - 34 - 10.5) * 14
          : (Math.floor(i / 2) - 8) * 10 + (random() - 0.5) * 7;
        z = far ? -74 - random() * 8 : side * (27 + random() * 9);
        height = far ? 12 + random() * 7 : 4.5 + random() * 3.3;
      }
      if (asset.kind === "outcrop") {
        x = ((i % 16) - 7.5) * 13 + (i >= 16 ? 4 : 0);
        z = -43 - Math.floor(i / 16) * 13 - random() * 4;
        height = 6 + random() * 4;
      }
      if (asset.kind === "tree") {
        x = (random() - 0.5) * 180;
        z = -34 - random() * 24;
        height = 3.5 + random() * 2.8;
      }
      const radius = radiusFactor * height;
      // Conservative footprint clearance, including the entire fortress envelope.
      if (Math.abs(x) < 61 + radius && Math.abs(z) - radius < MEADOW_CLEARANCE)
        z = Math.sign(z) * (MEADOW_CLEARANCE + radius + random() * 6);
      if (
        Math.abs(x) > 39 - radius &&
        Math.abs(x) < 61 + radius &&
        Math.abs(z) - radius < 23
      )
        z = Math.sign(z) * (23 + radius + random() * 2);
      const ground = terrainHeight(x, z),
        embed =
          asset.kind === "cliff" || asset.kind === "outcrop"
            ? height * 0.16
            : Math.min(0.12, height * 0.08);
      matrices.push(
        new T.Matrix4().compose(
          new T.Vector3(x, ground - embed, z),
          new T.Quaternion().setFromAxisAngle(
            new T.Vector3(0, 1, 0),
            random() * Math.PI * 2,
          ),
          new T.Vector3(height, height, height),
        ),
      );
      const rock =
        asset.kind === "stone" ||
        asset.kind === "cliff" ||
        asset.kind === "outcrop";
      const tint = new T.Color(
        rock ? 0xd6dfcd : asset.kind === "tree" ? 0xc9d6bd : 0xc8d4af,
      );
      if (asset.kind === "cliff" && i >= 34)
        tint.lerp(new T.Color(0xe1e6de), 0.5);
      tint.multiplyScalar(0.9 + random() * 0.16);
      tints.push(tint);
      placements.push({
        kind: asset.kind,
        file: asset.file,
        x,
        z,
        radius,
        ground,
        bottom: ground - embed,
        height,
      });
      if (asset.kind !== "grass" && height < 8)
        contacts.push({ x, z, radius: radius * 0.72 });
    }
    source.traverse((o) => {
      if (!(o instanceof T.Mesh)) return;
      const original = (
        Array.isArray(o.material) ? o.material[0] : o.material
      ) as T.MeshStandardMaterial;
      if (!original.map) throw Error("Forest texture missing: " + asset.file);
      for (const mat of Array.isArray(o.material) ? o.material : [o.material])
        if ((mat as T.MeshStandardMaterial).map)
          resources.add((mat as T.MeshStandardMaterial).map!);
      if (!shared) {
        shared = new T.MeshLambertMaterial({
          map: original.map,
          color: 0xffffff,
        });
        shared.name = "Shared KayKit Forest palette";
        // Retain KayKit UV/palette detail, with softer foliage saturation for the moss biome.
        shared.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <color_fragment>",
            "#include <color_fragment>\nfloat forestLuma = dot(diffuseColor.rgb, vec3(0.2126,0.7152,0.0722));\ndiffuseColor.rgb = mix(vec3(forestLuma), diffuseColor.rgb, 0.72);",
          );
        };
        shared.customProgramCacheKey = () => "forest-soft-palette-v1";
      }
      const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
      geometry
        .translate(-center.x, -box.min.y, -center.z)
        .scale(1 / size.y, 1 / size.y, 1 / size.y);
      const batch = new T.InstancedMesh(geometry, shared!, asset.count);
      batch.name = `KayKit ${asset.kind} · ${asset.file}`;
      batch.receiveShadow = true;
      // Only nearby structures/actors need full shadow maps. Cheap contacts remain on Low.
      batch.castShadow = false;
      for (let i = 0; i < asset.count; i++) {
        batch.setMatrixAt(i, matrices[i]);
        batch.setColorAt(i, tints[i]);
      }
      batch.computeBoundingSphere();
      root.add(batch);
      batches.push({
        file: asset.file,
        kind: asset.kind,
        instances: asset.count,
        textured: !!shared!.map,
      });
    });
    source.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.geometry.dispose();
        for (const mat of Array.isArray(o.material) ? o.material : [o.material])
          mat.dispose();
      }
    });
  }
  // All meshes share the same original forest palette; unused duplicate loaders need no GPU copies.
  for (const map of resources) if (map !== shared?.map) map.dispose();
  root.userData = {
    style: "stylized-low-poly",
    status: "ready",
    batches,
    placements,
    instances: placements.length,
    clearance: MEADOW_CLEARANCE,
  };
  scene.add(root);
  return { root, contacts };
}
