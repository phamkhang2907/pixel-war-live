import * as T from "three";
import { createModelLoader } from "./model-loader";
import { terrainHeight, MEADOW_CLEARANCE } from "./grass-material";
export const NATURE_CATALOG = [
  ["CommonTree_3", "tree", 36, 7],
  ["CommonTree_5", "tree", 36, 7.5],
  ["Pine_5", "tree", 36, 8],
  ["TwistedTree_1", "tree", 8, 9],
  ["Bush_Common", "bush", 52, 1.4],
  ["Bush_Common_Flowers", "bush", 24, 1.2],
  ["Flower_3_Group", "flower", 24, 0.55],
  ["Grass_Common_Short", "grass", 120, 0.65],
  ["Mushroom_Common", "mushroom", 32, 0.55],
  ["Rock_Medium_1", "rock", 36, 2.6],
] as const;
export async function buildStylizedNature(scene: T.Scene) {
  const root = new T.Group();
  root.name = "Imported Stylized Nature";
  root.userData = {
    status: "loading",
    license: "CC0-1.0",
    source: "Quaternius Stylized Nature MegaKit",
    placements: [],
    batches: [],
  };
  scene.add(root);
  const loader = createModelLoader(),
    textures = new Map<string, T.Texture>(),
    materials = new Map<string, T.MeshStandardMaterial>();
  let seed = 901831;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const contacts: { x: number; z: number; radius: number }[] = [],
    placements: any[] = [],
    batches: any[] = [];
  for (const [name, kind, count, baseHeight] of NATURE_CATALOG) {
    const gltf = await loader.loadAsync(
      `/assets/3d/nature/stylized/glTF/${name}.gltf`,
    );
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(model),
      size = box.getSize(new T.Vector3()),
      center = box.getCenter(new T.Vector3());
    if (size.y <= 0) throw Error("Invalid Nature model " + name);
    const cells = new Map<
      string,
      {
        x: number;
        z: number;
        levels: number[];
        matrices: T.Matrix4[];
        tints: T.Color[];
      }
    >();
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? -1 : 1,
        level = i % 3;
      let x = (random() - 0.5) * 150,
        z = side * (MEADOW_CLEARANCE + 5 + random() * 18);
      const h = baseHeight * (0.75 + random() * 0.6),
        radius = (Math.hypot(size.x, size.z) / size.y) * h * 0.5;
      if (kind === "tree")
        z = side * (MEADOW_CLEARANCE + radius + 6 + random() * 14);
      if (
        Math.abs(x) > 36 - radius &&
        Math.abs(x) < 63 + radius &&
        Math.abs(z) < 28 + radius
      )
        z = side * (29 + radius + random() * 8);
      if (
        Math.abs(x) < 64 + radius &&
        Math.abs(z) - radius < MEADOW_CLEARANCE + 1
      )
        z = side * (MEADOW_CLEARANCE + radius + 2 + random() * 4);
      const y = terrainHeight(x, z) - (kind === "rock" ? 0.2 : 0.03),
        scale = h / size.y;
      const matrix = new T.Matrix4().compose(
        new T.Vector3(x, y, z),
        new T.Quaternion().setFromAxisAngle(
          new T.Vector3(0, 1, 0),
          random() * Math.PI * 2,
        ),
        new T.Vector3(scale, scale, scale),
      );
      const cellX = Math.floor(x / 56) * 56 + 28,
        cellZ = Math.floor(z / 64) * 64 + 32,
        key = `${cellX}:${cellZ}`;
      const cell = cells.get(key) ?? {
        x: cellX,
        z: cellZ,
        levels: [],
        matrices: [],
        tints: [],
      };
      cells.set(key, cell);
      cell.matrices.push(matrix);
      cell.levels.push(level);
      cell.tints.push(
        new T.Color().setRGB(
          0.85 + random() * 0.15,
          0.89 + random() * 0.11,
          0.78 + random() * 0.18,
        ),
      );
      placements.push({
        file: name + ".gltf",
        kind,
        x,
        z,
        ground: y,
        height: h,
        radius,
        minimumQuality: level,
      });
      if (level === 0 && (kind === "tree" || kind === "rock"))
        contacts.push({ x, z, radius: radius * 0.6 });
    }
    const geometries = new Map<number, T.BufferGeometry>();
    for (const cell of cells.values()) {
      const order = cell.matrices
        .map((_, i) => i)
        .sort((a, b) => cell.levels[a] - cell.levels[b]);
      cell.matrices = order.map((i) => cell.matrices[i]);
      cell.tints = order.map((i) => cell.tints[i]);
      cell.levels = order.map((i) => cell.levels[i]);
      const lod = new T.LOD();
      lod.position.set(cell.x, 0, cell.z);

      lod.name = name + " spatial LOD";
      const full = new T.Group(),
        sparse = new T.Group();
      model.traverse((o) => {
        if (!(o instanceof T.Mesh)) return;
        const original = Array.isArray(o.material) ? o.material : [o.material];
        const shared = original.map((m) => {
          const mat = m as T.MeshStandardMaterial;
          for (const slot of ["map", "normalMap", "roughnessMap"] as const) {
            const t = mat[slot];
            if (!t) continue;
            const association = gltf.parser.associations.get(t) as
              { textures?: number } | undefined;
            const textureIndex = association?.textures;
            const imageIndex =
              textureIndex === undefined
                ? undefined
                : gltf.parser.json.textures[textureIndex]?.source;
            const uri =
              imageIndex === undefined
                ? t.source.uuid
                : gltf.parser.json.images[imageIndex]?.uri;
            const key = uri + ":" + slot;
            const old = textures.get(key);
            if (old) {
              mat[slot] = old;
              if (t !== old) t.dispose();
            } else {
              if (t.image?.width > 1024 || t.image?.height > 1024) {
                const c = document.createElement("canvas");
                const ratio = Math.min(
                  1,
                  1024 / Math.max(t.image.width, t.image.height),
                );
                c.width = Math.round(t.image.width * ratio);
                c.height = Math.round(t.image.height * ratio);
                c.getContext("2d")!.drawImage(t.image, 0, 0, c.width, c.height);
                t.image = c;
                t.needsUpdate = true;
              }
              t.anisotropy = 2;
              textures.set(key, t);
            }
          }
          const key = mat.name + ":" + (mat.map?.uuid ?? "") + ":" + mat.side;
          const old = materials.get(key);
          if (old) return old;
          mat.roughness = 0.9;
          mat.metalness = 0;
          if (/Leaves/.test(mat.name)) {
            mat.emissive.setHex(0x327d28);
            mat.emissiveIntensity = 0.32;
            mat.onBeforeCompile = (shader) => {
              shader.fragmentShader = shader.fragmentShader.replace(
                "#include <color_fragment>",
                "#include <color_fragment>\nfloat leafTone=clamp(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))*3.,0.,1.);diffuseColor.rgb=mix(vec3(.02,.13,.04),vec3(.23,.55,.08),leafTone);",
              );
            };
            mat.customProgramCacheKey = () => "verdant-leaf-palette-v1";
          }
          mat.normalScale.set(0.3, 0.3);
          mat.alphaTest = mat.alphaTest ? Math.max(0.38, mat.alphaTest) : 0;
          materials.set(key, mat);
          return mat;
        });
        let g = geometries.get(o.id);
        if (!g) {
          const geometry = (o.geometry as T.BufferGeometry)
            .clone()
            .applyMatrix4(o.matrixWorld)
            .translate(-center.x, -box.min.y, -center.z);
          geometries.set(o.id, geometry);
          g = geometry;
        }
        for (const [group, stride] of [
          [full, 1],
          [sparse, 2],
        ] as const) {
          const list = cell.matrices.filter((_, i) => i % stride === 0);
          const mesh = new T.InstancedMesh(
            g,
            shared.length === 1 ? shared[0] : shared,
            list.length,
          );
          mesh.name =
            "Nature " + name + " " + (stride === 1 ? "near" : "sparse");
          list.forEach((matrix, i) => {
            const m = matrix.clone();
            m.elements[12] -= cell.x;
            m.elements[14] -= cell.z;
            mesh.setMatrixAt(i, m);
            mesh.setColorAt(i, cell.tints[i * stride]);
          });
          mesh.castShadow =
            (kind === "tree" || kind === "rock") && Math.abs(cell.z) < 67;
          mesh.receiveShadow = true;
          mesh.userData.qualityCounts = [0, 1, 2].map(
            (level) =>
              cell.levels.filter((v, i) => i % stride === 0 && v <= level)
                .length,
          );
          mesh.computeBoundingSphere();
          group.add(mesh);
        }
        batches.push({
          model: name,
          kind,
          instances: cell.matrices.length,
          textured: shared.every((m) => !!m.map),
          lod: "full / sparse / culled",
          qualityCounts: [0, 1, 2].map(
            (level) => cell.levels.filter((v) => v <= level).length,
          ),
        });
      });
      lod.addLevel(full, 0);
      lod.addLevel(sparse, 190);
      lod.addLevel(new T.Group(), 780);
      root.add(lod);
    }
    model.traverse((o) => {
      if (o instanceof T.Mesh) o.geometry.dispose();
    });
  }
  root.userData = {
    status: "ready",
    license: "CC0-1.0",
    source: "Quaternius Stylized Nature MegaKit",
    placements,
    batches,
    instances: placements.length,
    models: NATURE_CATALOG.map((a) => a[0]),
    textureCount: new Set(textures.values()).size,
    maxTexture: 1024,
    lod: "spatial chunks: full <190m, sparse <780m, culled beyond",
  };
  return { root, contacts };
}
export function natureQuality(root: T.Object3D, level: number) {
  root.traverse((o) => {
    if (o instanceof T.InstancedMesh && o.userData.qualityCounts)
      o.count = o.userData.qualityCounts[level];
  });
  root.userData.quality = level;
}
