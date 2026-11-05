import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CASTLE_X } from "./state";

const ROOT = "/kaykit/medieval/Assets/gltf/buildings/";
const loader = new GLTFLoader();
type ModelName = "wall" | "gate" | "corner" | "tower" | "towerBase" | "keep" | "barracks" | "home" | "smith";
type Models = Map<ModelName, T.Group>;
const neutral: Record<string, string> = {
  wall: "neutral/wall_straight.gltf",
  gate: "neutral/wall_straight_gate.gltf",
  corner: "neutral/wall_corner_A_outside.gltf",
};
const teamModels = (team: "red" | "blue"): Record<string, string> => ({
  tower: team + "/building_tower_A_" + team + ".gltf",
  towerBase: team + "/building_tower_base_" + team + ".gltf",
  keep: team + "/building_castle_" + team + ".gltf",
  barracks: team + "/building_barracks_" + team + ".gltf",
  home: team + "/building_home_A_" + team + ".gltf",
  smith: team + "/building_blacksmith_" + team + ".gltf",
});
async function templates(team: "red" | "blue"): Promise<Models> {
  const result: Models = new Map();
  await Promise.all(Object.entries({ ...neutral, ...teamModels(team) }).map(async ([key, path]) => {
    const gltf = await loader.loadAsync(ROOT + path);
    result.set(key as ModelName, gltf.scene);
  }));
  return result;
}
function addModule(parent: T.Group, models: Models, name: ModelName,
                   x: number, z: number, height: number, turn = 0) {
  const source = models.get(name);
  if (!source) throw Error("Missing fortress module: " + name);
  // Clone shares BufferGeometry and textures, so repeating walls does not
  // duplicate GPU mesh buffers. Each module keeps its own transform.
  const object = source.clone(true);
  object.rotation.y = turn;
  object.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(object);
  const size = box.getSize(new T.Vector3());
  const scale = height / Math.max(0.01, size.y);
  object.scale.setScalar(scale);
  object.updateMatrixWorld(true);
  const adjusted = new T.Box3().setFromObject(object);
  const center = adjusted.getCenter(new T.Vector3());
  object.position.x += x - center.x;
  object.position.z += z - center.z;
  object.position.y -= adjusted.min.y;
  object.traverse((node) => {
    if (node instanceof T.Mesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  parent.add(object);
  return object;
}
function banner(parent: T.Group, x: number, y: number, z: number, color: number) {
  const pole = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, 3.2, 6),
                          new T.MeshStandardMaterial({ color: 0xc8b98c }));
  pole.position.set(x, y + 1.6, z);
  const cloth = new T.Mesh(new T.PlaneGeometry(1.65, 1.15),
                           new T.MeshStandardMaterial({ color, side: T.DoubleSide, roughness: 0.9 }));
  cloth.position.set(x + 0.83, y + 2.5, z);
  parent.add(pole, cloth);
}
export interface FortressBoundary {
  team: 0 | 1;
  minX: number; maxX: number; minZ: number; maxZ: number;
  passageMinZ: number; passageMaxZ: number;
}
// Boundaries describe the solid flanks. The central ±3.5-wide lane is
// intentionally open, and existing authoritative server movement is untouched.
export const fortressBoundaries: FortressBoundary[] = [];

async function buildFortress(scene: T.Scene, team: 0 | 1) {
  const color = team === 0 ? "red" : "blue";
  const models = await templates(color);
  const group = new T.Group();
  group.name = team === 0 ? "RED modular KayKit fortress" : "BLUE modular KayKit fortress";
  const cx = CASTLE_X[team];
  const face = team === 0 ? 1 : -1;
  const front = cx + face * 5.5;
  const rear = cx - face * 5;
  const flagColor = team === 0 ? 0xdf3445 : 0x2875de;
  // Each side of the central gate uses several independent wall modules.
  // No giant stretched castle: wall, gate, towers and buildings are separate glTF instances.
  for (const side of [-1, 1]) {
    for (const offset of [5, 9, 13, 17]) {
      addModule(group, models, "wall", front, side * offset, 4.4, Math.PI / 2);
    }
    for (const offset of [8, 18]) {
      addModule(group, models, "towerBase", front - face * 0.7, side * offset, 3.4);
      addModule(group, models, "tower", front - face * 0.7, side * offset, 8);
      banner(group, front - face * 0.7, 8.2, side * offset, flagColor);
    }
    addModule(group, models, "corner", front - face * 2.0, side * 21, 4.4, Math.PI / 2);
    for (const offset of [8, 12, 16]) {
      addModule(group, models, "wall", front - face * 4.5, side * offset, 4.4);
    }
  }
  // Gate module is a real asset, while a 7-unit open approach remains in front
  // for troops. Collision boundaries apply only to solid flanks.
  addModule(group, models, "gate", front, 0, 6.5, Math.PI / 2);
  addModule(group, models, "keep", rear, 0, 12);
  addModule(group, models, "barracks", rear - face * 2, -10, 5.5);
  addModule(group, models, "home", rear - face * 2, 10, 5.5);
  addModule(group, models, "smith", rear - face * 5, 15, 5.5);
  banner(group, rear, 12.2, 0, flagColor);
  group.userData.team = team;
  group.userData.castleHpSource = "server";
  scene.add(group);
  fortressBoundaries.push(
    { team, minX: front - 2.5, maxX: front + 2.5, minZ: -22, maxZ: -3.5, passageMinZ: -3.5, passageMaxZ: 3.5 },
    { team, minX: front - 2.5, maxX: front + 2.5, minZ: 3.5, maxZ: 22, passageMinZ: -3.5, passageMaxZ: 3.5 },
  );
  const old = scene.getObjectByName(team === 0
    ? "RED castle · development architecture"
    : "BLUE castle · development architecture");
  if (old) old.visible = false;
  return group;
}
export async function loadKaykitWorld(scene: T.Scene) {
  fortressBoundaries.length = 0;
  await Promise.all(([0, 1] as const).map(async team => {
    try { await buildFortress(scene, team); }
    catch (error) { console.error("KayKit fortress fallback for team " + team, error); }
  }));
  // Forest stays outside the traversable battlefield.
  const trees = ["Tree_2_A_Color1.gltf", "Tree_3_A_Color1.gltf", "Tree_2_B_Color1.gltf"];
  const forestLoader = new GLTFLoader();
  const loaded = await Promise.all(trees.map(async name => {
    try { return (await forestLoader.loadAsync("/kaykit/forest/Assets/gltf/" + name)).scene; }
    catch { return null; }
  }));
  for (let i = 0; i < 24; i++) {
    const source = loaded[i % loaded.length];
    if (!source) continue;
    const object = source.clone(true);
    const bounds = new T.Box3().setFromObject(object);
    const scale = (3.5 + i % 4) / Math.max(0.01, bounds.getSize(new T.Vector3()).y);
    object.scale.setScalar(scale);
    object.position.set(((i * 37) % 145) - 72, 0, (i % 2 ? 1 : -1) * (22 + (i * 11) % 35));
    scene.add(object);
  }
}
