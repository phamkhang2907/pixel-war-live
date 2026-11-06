import * as T from "three";
import { createModelLoader } from "./model-loader";
import { CASTLE_X } from "./state";
const ROOT = "/kaykit/medieval/Assets/gltf/";
export const fortressCatalog = (color: "red" | "blue") => ({
  wall: "buildings/neutral/wall_straight.gltf",
  gate: "buildings/neutral/wall_straight_gate.gltf",
  corner: "buildings/neutral/wall_corner_A_outside.gltf",
  tower: `buildings/${color}/building_tower_A_${color}.gltf`,
  keep: `buildings/${color}/building_castle_${color}.gltf`,
  barracks: `buildings/${color}/building_barracks_${color}.gltf`,
  home: `buildings/${color}/building_home_A_${color}.gltf`,
  smith: `buildings/${color}/building_blacksmith_${color}.gltf`,
  archery: `buildings/${color}/building_archeryrange_${color}.gltf`,
  flag: `decoration/props/flag_${color}.gltf`,
});
type Kind = keyof ReturnType<typeof fortressCatalog>;
export async function buildFortresses(scene: T.Scene): Promise<T.Group[]> {
  const loader = createModelLoader(),
    cache = new Map<string, Promise<T.Group>>();
  const get = (path: string) => {
    if (!cache.has(path))
      cache.set(
        path,
        loader.loadAsync(ROOT + path).then((g) => g.scene),
      );
    return cache.get(path)!;
  };
  return Promise.all(
    ([0, 1] as const).map(async (team) => {
      const color = team === 0 ? "red" : "blue",
        paths = fortressCatalog(color),
        templates = new Map<Kind, T.Group>(),
        failures: string[] = [];
      await Promise.all(
        Object.entries(paths).map(async ([kind, path]) => {
          try {
            templates.set(kind as Kind, await get(path));
          } catch (error) {
            failures.push(ROOT + path + " — " + String(error));
          }
        }),
      );
      if (failures.length)
        throw Error(
          "Missing/incompatible fortress models:\n" + failures.join("\n"),
        );
      const fort = new T.Group();
      fort.name = `${color} extended KayKit fortress`;
      fort.userData = { team, modules: [], textures: [], bounds: null };
      const x = CASTLE_X[team],
        behind = team === 0 ? -1 : 1;
      const add = (
        kind: Kind,
        dx: number,
        z: number,
        height: number,
        turn = 0,
        y = 0,
        distant = false,
      ) => {
        const object = templates.get(kind)!.clone(true);
        object.rotation.y = turn;
        object.updateMatrixWorld(true);
        const box = new T.Box3().setFromObject(object),
          size = box.getSize(new T.Vector3());
        if (!Number.isFinite(size.y) || size.y <= 0)
          throw Error("Empty fortress model: " + ROOT + paths[kind]);
        object.scale.setScalar(height / size.y);
        object.updateMatrixWorld(true);
        const scaled = new T.Box3().setFromObject(object),
          center = scaled.getCenter(new T.Vector3());
        object.position.set(x + dx - center.x, y - scaled.min.y, z - center.z);
        object.name = `${color} ${kind} ${fort.children.length}`;
        let meshes = 0,
          textures = 0;
        object.traverse((node) => {
          if (node instanceof T.Mesh) {
            meshes++;
            node.castShadow = !distant;
            node.receiveShadow = true;
            if (distant)
              node.material = (
                Array.isArray(node.material) ? node.material : [node.material]
              ).map((original) => {
                const m = original.clone();
                if (m instanceof T.MeshStandardMaterial) {
                  m.emissive.setHex(0x8497a8);
                  m.emissiveIntensity = 0.12;
                  m.roughness = 0.95;
                }
                return m;
              });
            if (Array.isArray(node.material) && node.material.length === 1)
              node.material = node.material[0];
            for (const material of Array.isArray(node.material)
              ? node.material
              : [node.material])
              if (material instanceof T.MeshStandardMaterial && material.map)
                textures++;
          }
        });
        if (!meshes || !textures)
          throw Error("Untextured/empty fortress model: " + ROOT + paths[kind]);
        fort.userData.modules.push({
          kind,
          path: ROOT + paths[kind],
          meshes,
          textures,
          position: [x + dx, y, z],
          scale: object.scale.toArray(),
        });
        fort.add(object);
        return object;
      };
      // Front faces the opposing army. Central gate has no tower on top of it.
      for (const side of [-1, 1]) {
        for (const z of [5.4, 9.5, 13.6, 17.7])
          add("wall", 0, side * z, 2.5, Math.PI / 2);
        for (const z of [3.5, 20]) {
          add("tower", behind * 0.7, side * z, 7.6);
          add("flag", behind * 0.7, side * z, 2.1, 0, 7.6);
        }
        for (const dx of [3, 7]) add("wall", behind * dx, side * 20, 2.5);
        add("corner", behind * 9, side * 20, 2.5, team === 0 ? Math.PI : 0);
      }
      add("gate", 0, 0, 4.6, team === 0 ? Math.PI / 2 : -Math.PI / 2);
      add("keep", behind * 7, 0, 10.5, 0, 0, true);
      add("flag", behind * 7, 0, 2.5, 0, 10.5);
      add("barracks", behind * 6, -10, 5.2, 0, 0, true);
      add("home", behind * 6, 10, 4.8, 0, 0, true);
      add("smith", behind * 10, 15, 4.6, 0, 0, true);
      add("archery", behind * 10, -16, 5.0, 0, 0, true);
      fort.updateMatrixWorld(true);
      const bounds = new T.Box3().setFromObject(fort);
      fort.userData.bounds = {
        min: bounds.min.toArray(),
        max: bounds.max.toArray(),
      };
      scene.add(fort);
      return fort;
    }),
  );
}
