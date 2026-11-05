import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CASTLE_X } from "./state";

const loader = new GLTFLoader();
async function place(url: string, scene: T.Scene, x: number, z: number, height: number) {
  const gltf = await loader.loadAsync(url);
  const object = gltf.scene;
  const bounds = new T.Box3().setFromObject(object);
  const size = bounds.getSize(new T.Vector3());
  const center = bounds.getCenter(new T.Vector3());
  object.position.set(x - center.x, -bounds.min.y, z - center.z);
  object.scale.setScalar(height / Math.max(0.01, size.y));
  // Apply the normalization before positioning so the model sits on terrain.
  object.position.set(x - center.x * object.scale.x, -bounds.min.y * object.scale.y, z - center.z * object.scale.z);
  object.traverse((o) => { if (o instanceof T.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(object);
  return object;
}
export async function loadKaykitWorld(scene: T.Scene) {
  const castles = [
    "/kaykit/medieval/Assets/gltf/buildings/red/building_castle_red.gltf",
    "/kaykit/medieval/Assets/gltf/buildings/blue/building_castle_blue.gltf",
  ];
  await Promise.all(castles.map(async (url, team) => {
    try {
      const object = await place(url, scene, CASTLE_X[team], 0, 10);
      object.name = "KayKit " + (team === 0 ? "red" : "blue") + " castle";
      const procedural = scene.getObjectByName(team === 0
        ? "RED castle · development architecture"
        : "BLUE castle · development architecture");
      if (procedural) procedural.visible = false;
    } catch (e) { console.warn("KayKit castle fallback", e); }
  }));
  const trees = [
    "Tree_1_A_Color1.gltf", "Tree_2_A_Color1.gltf", "Tree_3_A_Color1.gltf",
  ];
  await Promise.all(Array.from({ length: 24 }, async (_, i) => {
    const side = i % 2 ? 1 : -1;
    const x = ((i * 37) % 145) - 72;
    const z = side * (22 + (i * 11) % 35);
    try {
      await place("/kaykit/forest/Assets/gltf/" + trees[i % trees.length], scene, x, z, 3.5 + i % 4);
    } catch (e) { if (i < 3) console.warn("KayKit tree fallback", e); }
  }));
}
