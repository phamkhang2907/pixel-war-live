import { terrainMaterials, worldDirtUV } from "./grass-material";
import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CASTLE_X } from "./state";

// Original procedural development scenery. Replaceable independently of gameplay.
const material = (
  color: number,
  extra: T.MeshStandardMaterialParameters = {},
) => new T.MeshStandardMaterial({ color, roughness: 0.85, ...extra });

function mesh(
  parent: T.Object3D,
  geometry: T.BufferGeometry,
  mat: T.Material,
  x = 0,
  y = 0,
  z = 0,
) {
  const item = new T.Mesh(geometry, mat);
  item.position.set(x, y, z);
  item.castShadow = true;
  item.receiveShadow = true;
  parent.add(item);
  return item;
}

function flag(
  parent: T.Object3D,
  color: T.Material,
  x: number,
  y: number,
  z: number,
) {
  const pole = material(0xdbc595, { metalness: 0.35 });
  mesh(parent, new T.CylinderGeometry(0.055, 0.055, 4, 6), pole, x, y, z);
  const cloth = new T.BufferGeometry();
  cloth.setAttribute(
    "position",
    new T.Float32BufferAttribute(
      [
        0, 1.8, 0, 1.7, 1.65, 0.2, 1.3, 0.8, 0.1, 0, 1.8, 0, 1.3, 0.8, 0.1, 0,
        0.65, 0,
      ],
      3,
    ),
  );
  cloth.computeVertexNormals();
  mesh(parent, cloth, color, x, y, z);
}

function castle(team: number) {
  const group = new T.Group();
  group.name =
    team === 0
      ? "RED castle · development architecture"
      : "BLUE castle · development architecture";
  group.position.x = CASTLE_X[team];
  group.scale.set(0.48, 0.65, 0.48);
  group.rotation.y = team === 0 ? Math.PI / 2 : -Math.PI / 2;
  const stone = material(team === 0 ? 0xe1cfa8 : 0xc9d7d9);
  const lightStone = material(0xf1e6cb);
  const darkStone = material(0x68797a);
  const roof = material(team === 0 ? 0xb43145 : 0x316ab2, { metalness: 0.12 });
  const cloth = material(team === 0 ? 0xff5660 : 0x4aabff, {
    side: T.DoubleSide,
  });
  const gold = material(0xe6bc62, { metalness: 0.5, roughness: 0.4 });
  mesh(group, new T.CylinderGeometry(10, 10.5, 0.7, 12), darkStone, 0, 0.2, 0);
  mesh(group, new T.BoxGeometry(13, 1, 12), stone, 0, 0.65, 0);
  for (const x of [-5.8, 5.8]) {
    mesh(group, new T.BoxGeometry(1.1, 4.4, 11), stone, x, 2.8, 0);
    for (let z = -4; z <= 4; z += 2)
      mesh(group, new T.BoxGeometry(1.2, 0.7, 0.9), lightStone, x, 5.3, z);
  }
  mesh(group, new T.BoxGeometry(11, 4, 1), stone, 0, 2.7, -5);
  // Gate sits in front of a keep; arch is actual geometry with a contrasting door.
  mesh(group, new T.BoxGeometry(7, 6, 4), stone, 0, 3.5, 3.5);
  const arch = new T.Shape();
  arch.moveTo(-1.4, 0);
  arch.lineTo(1.4, 0);
  arch.lineTo(1.4, 2.3);
  arch.absarc(0, 2.3, 1.4, 0, Math.PI, false);
  arch.lineTo(-1.4, 0);
  mesh(group, new T.ShapeGeometry(arch), material(0x394746), 0, 1.05, 5.52);
  for (const x of [-0.9, -0.45, 0, 0.45, 0.9])
    mesh(group, new T.BoxGeometry(0.075, 2.8, 0.08), gold, x, 2.5, 5.56);
  for (const x of [-5.6, 5.6])
    for (const z of [-5, 5]) {
      const sides = team === 0 ? 8 : 6;
      mesh(group, new T.CylinderGeometry(1.8, 2, 7, sides), stone, x, 4.1, z);
      mesh(
        group,
        new T.CylinderGeometry(2, 2, 0.4, sides),
        lightStone,
        x,
        7.5,
        z,
      );
      mesh(group, new T.ConeGeometry(2.5, 3.7, sides), roof, x, 9.5, z);
      mesh(group, new T.SphereGeometry(0.19, 6, 4), gold, x, 11.5, z);
    }
  mesh(group, new T.BoxGeometry(5.5, 8, 5.2), lightStone, 0, 4.7, -1.5);
  mesh(group, new T.ConeGeometry(4.5, 4.5, 4), roof, 0, 10.9, -1.5).rotation.y =
    Math.PI / 4;
  for (const x of [-1.5, 1.5])
    mesh(group, new T.BoxGeometry(0.6, 1.4, 0.08), gold, x, 6, 1.13);
  flag(group, cloth, 0, 14.4, -1.5);
  flag(group, cloth, -3, 7.5, 4);
  flag(group, cloth, 3, 7.5, 4);
  return group;
}

export function buildWorld(
  scene: T.Scene,
  options: {
    anisotropy?: number;
    onTerrainError?: (message: string) => void;
  } = {},
) {
  const surfaces = terrainMaterials(options.anisotropy, options.onTerrainError);
  scene.background = new T.Color(0xc9e5e5);
  scene.fog = new T.Fog(0xc9e5e5, 180, 540);
  scene.add(new T.HemisphereLight(0xe2efff, 0x345c36, 1.05));
  const sun = new T.DirectionalLight(0xfff7eb, 1.55);
  sun.position.set(-35, 75, 35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -70,
    right: 70,
    top: 42,
    bottom: -42,
    near: 1,
    far: 180,
  });
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.3;
  scene.add(sun);

  let seed = 83021;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const terrain = new T.PlaneGeometry(240, 210, 80, 70).toNonIndexed();
  terrain.rotateX(-Math.PI / 2);
  const positions = terrain.getAttribute("position");
  const colors = [];
  const green = new T.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      z = positions.getZ(i);
    const hills = Math.min(1, Math.max(0, (Math.abs(z) - 35) / 45));
    const height =
      hills *
      (2 + Math.sin(x * 0.07 + z * 0.04) * 2 + Math.cos(z * 0.12) * 1.2);
    positions.setY(i, height - 0.18);
    const variation =
      (Math.sin(x * 0.09 + z * 0.13) + Math.cos(z * 0.19 - x * 0.05) + 2) / 4;
    // Cool modulation balances the warm photo albedo; the PBR result stays dark green.
    green.set(0x7eb8bd).lerp(new T.Color(0x9bdae0), variation);
    colors.push(green.r, green.g, green.b);
  }
  terrain.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  terrain.computeVertexNormals();
  const ground = mesh(scene, terrain, surfaces.grass);
  ground.name = "Textured grass terrain";
  ground.castShadow = false;

  // Existing narrow dirt path; preserve the surrounding formation space.
  const road = new T.PlaneGeometry(102, 3.2, 34, 6);
  road.rotateX(-Math.PI / 2);
  const roadPos = road.getAttribute("position");
  for (let i = 0; i < roadPos.count; i++) {
    const z = roadPos.getZ(i);
    if (Math.abs(z) > 1.5)
      roadPos.setZ(i, z + Math.sin(roadPos.getX(i) * 0.6) * 1.1);
  }
  worldDirtUV(road);
  mesh(scene, road, surfaces.dirt, 0, -0.08, 0);
  // Low, irregular worn patches immediately inside the two gates share one batch.
  for (const team of [0, 1]) {
    const x = CASTLE_X[team] + (team === 0 ? 2 : -2);
    const patch = new T.CircleGeometry(3.3, 12);
    patch.rotateX(-Math.PI / 2);
    patch.scale(1.25, 1, 0.8);
    worldDirtUV(patch, x, 0);
    mesh(scene, patch, surfaces.dirt, x, -0.07, 0);
  }
  const castles: T.Group[] = [];
  // Modular licensed fortresses are loaded separately.
  const rings: T.Mesh[] = [];
  for (let team = 0; team < 2; team++) {
    const color = team === 0 ? 0xf47770 : 0x6aaff4;
    const ring = mesh(
      scene,
      new T.RingGeometry(2.4, 2.6, 48),
      material(color, {
        emissive: color,
        emissiveIntensity: 0.2,
        side: T.DoubleSide,
      }),
      CASTLE_X[team] + (team === 0 ? 8 : -8),
      0.01,
      0,
    );
    ring.rotation.x = -Math.PI / 2;
    rings.push(ring);
    // Siege zone is a real ground decal, deliberately different from spawn ring.
    const siege = mesh(
      scene,
      new T.RingGeometry(5.2, 5.35, 64),
      material(color, { transparent: true, opacity: 0.4, side: T.DoubleSide }),
      CASTLE_X[team],
      0.01,
      0,
    );
    siege.rotation.x = -Math.PI / 2;
  }

  const foliage = [material(0x41805a), material(0x629451), material(0x8aab62)];
  const trunk = material(0x827257),
    rock = material(0xa0aaa0, { flatShading: true });
  const crown = new T.IcosahedronGeometry(1, 0),
    trunkGeo = new T.CylinderGeometry(0.18, 0.3, 2.2, 5);
  for (let i = 0; i < 65; i++) {
    const x = (random() - 0.5) * 155;
    const z = (i % 2 === 0 ? -1 : 1) * (48 + random() * 40);
    const tree = new T.Group();
    tree.position.set(x, 0, z);
    tree.scale.setScalar(0.7 + random() * 1.0);
    mesh(tree, trunkGeo, trunk, 0, 1, 0);
    mesh(tree, crown, foliage[i % 3], 0, 3.1, 0).scale.set(1.7, 2.2, 1.6);
    mesh(tree, crown, foliage[(i + 1) % 3], 0.6, 4.3, 0).scale.set(
      1.3,
      1.6,
      1.3,
    );
    scene.add(tree);
  }
  const pebble = new T.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 85; i++) {
    const x = (random() - 0.5) * 126;
    const z = (i % 2 === 0 ? -1 : 1) * (33 + random() * 12);
    const stone = mesh(scene, pebble, rock, x, 0.15, z);
    stone.scale.set(0.3 + random(), 0.25 + random() * 0.5, 0.4 + random());
    stone.rotation.set(random(), random() * 6, random());
  }
  // Sparse grass clumps remain outside the traversable corridor.
  const grass = material(0x477a45, { side: T.DoubleSide });
  const blade = new T.ConeGeometry(0.2, 0.65, 3);
  for (let i = 0; i < 100; i++)
    mesh(
      scene,
      blade,
      grass,
      (random() - 0.5) * 113,
      0.2,
      (i % 2 === 0 ? -1 : 1) * (29 + random() * 8),
    );

  // Bake static scenery by material, avoiding a draw call for every leaf/stone.
  // Transparent zone rings stay separate; units remain their own dynamic batches.
  scene.updateMatrixWorld(true);
  const batches = new Map<T.Material, T.Mesh[]>();
  scene.traverse((object) => {
    if (
      object instanceof T.Mesh &&
      !Array.isArray(object.material) &&
      !object.material.transparent
    ) {
      const list = batches.get(object.material) ?? [];
      list.push(object);
      batches.set(object.material, list);
    }
  });
  for (const [mat, originals] of batches) {
    if (originals.length < 2) continue;
    const geometries = originals.map((original) => {
      const geometry = original.geometry.index
        ? original.geometry.toNonIndexed()
        : original.geometry.clone();
      geometry.applyMatrix4(original.matrixWorld);
      return geometry;
    });
    const combined = mergeGeometries(geometries);
    for (const geometry of geometries) geometry.dispose();
    if (!combined) throw Error("Static environment batching failed");
    const batch = mesh(scene, combined, mat);
    batch.name = "Static scenery batch";
    // Geometries can be shared across originals: dispose them once after baking.
    for (const original of originals) original.removeFromParent();
    for (const geometry of new Set(
      originals.map((original) => original.geometry),
    ))
      geometry.dispose();
  }

  return { sun, castles, rings, terrain: surfaces };
}
