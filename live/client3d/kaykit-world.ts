import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { buildFortresses } from "./fortresses";
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
  const fortresses = await buildFortresses(scene);
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
