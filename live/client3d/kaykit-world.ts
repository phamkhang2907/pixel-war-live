import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CASTLE_X } from "./state";
const loader = new GLTFLoader();
const cache = new Map<string, Promise<T.Group>>();
async function model(url: string) {
  let value = cache.get(url);
  if (!value) {
    value = loader.loadAsync(url).then((g) => g.scene);
    cache.set(url, value);
  }
  return (await value).clone(true);
}
function normalize(object: T.Group, height: number, x: number, z: number) {
  object.updateMatrixWorld(true);
  const b = new T.Box3().setFromObject(object),
    s = b.getSize(new T.Vector3()),
    c = b.getCenter(new T.Vector3());
  const scale = height / s.y;
  object.scale.setScalar(scale);
  object.position.set(x - c.x * scale, -b.min.y * scale, z - c.z * scale);
  object.traverse((o) => {
    if (o instanceof T.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return object;
}
export async function loadKaykitWorld(scene: T.Scene) {
  const fortresses: T.Group[] = [];
  for (const team of [0, 1]) {
    const color = team === 0 ? "red" : "blue",
      fort = new T.Group();
    fort.name = `${color} modular fortress`;
    scene.add(fort);
    fortresses.push(fort);
    const x = CASTLE_X[team];
    const add = async (
      path: string,
      height: number,
      px: number,
      z: number,
      turn = 0,
    ) => {
      const object = normalize(
        await model("/kaykit/medieval/Assets/gltf/buildings/" + path + ".gltf"),
        height,
        0,
        0,
      );
      const pivot = new T.Group();
      pivot.position.set(px, 0, z);
      pivot.rotation.y = turn;
      pivot.add(object);
      fort.add(pivot);
    };
    const jobs: Promise<void>[] = [];
    jobs.push(
      add(`${color}/building_castle_${color}`, 7, x + (team === 0 ? -4 : 4), 0),
    );
    for (let i = -4; i <= 4; i++) {
      jobs.push(
        add(
          `neutral/${i === 0 ? "wall_straight_gate" : "wall_straight"}`,
          3.6,
          x,
          i * 3.6,
          Math.PI / 2,
        ),
      );
      if (i % 2 === 0)
        jobs.push(add(`${color}/building_tower_A_${color}`, 6.5, x, i * 3.6));
    }
    await Promise.all(jobs);
  }
  // CC0 KayKit rock meshes form overlapping, uniformly scaled mountain ridges.
  for (const layer of [0, 1])
    for (let i = 0; i < 11; i++) {
      const object = normalize(
        await model("/kaykit/forest/Assets/gltf/Rock_2_A_Color1.gltf"),
        5 + ((i * 7) % 4) + layer * 3,
        (i - 5) * 23,
        -39 - layer * 24,
      );
      object.traverse((o) => {
        if (o instanceof T.Mesh) {
          o.material = new T.MeshStandardMaterial({
            color: layer ? 0xb0c4ce : 0x92aeb8,
            roughness: 1,
          });
          o.castShadow = false;
        }
      });
      scene.add(object);
    }
  // Original MIT low-poly peaks layer behind the CC0 rock foothills.
  for (const layer of [0, 1])
    for (let i = -7; i <= 7; i++) {
      const height = 10 + (((i + 7) * 7) % 9) + layer * 5;
      const peak = new T.Mesh(
        new T.ConeGeometry(13 + (i % 3), height, 5),
        new T.MeshStandardMaterial({
          color: layer ? 0xb5c7cf : 0x9db6bf,
          roughness: 1,
          flatShading: true,
        }),
      );
      peak.position.set(i * 18 + layer * 9, height / 2 - 1, -48 - layer * 24);
      peak.rotation.y = i * 0.7;
      scene.add(peak);
    }
  for (let i = 0; i < 40; i++) {
    const object = normalize(
      await model("/kaykit/forest/Assets/gltf/Tree_2_A_Color1.gltf"),
      3 + (i % 4),
      ((i * 37) % 170) - 85,
      -24 - (i % 4) * 4,
    );
    object.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.material = new T.MeshStandardMaterial({
          color: 0x7c9e91,
          roughness: 1,
        });
        o.castShadow = false;
      }
    });
    scene.add(object);
  }
  return fortresses;
}
