import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  terrainMaterials,
  terrainHeight,
  TERRAIN_PALETTE,
} from "./grass-material";
import { CASTLE_X } from "./state";

// Purely visual terrain. The authoritative walkable lanes and castle targets do not change.
export function buildWorld(scene: T.Scene) {
  const surfaces = terrainMaterials();
  scene.background = new T.Color(0xc5d4c4);
  scene.fog = new T.Fog(0xc5d4c4, 190, 560);
  scene.add(new T.HemisphereLight(0xf0f4ec, 0x56634a, 1.15));
  const sun = new T.DirectionalLight(0xfffdf5, 1.55);
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
  sun.shadow.normalBias = 0.15;
  scene.add(sun);

  const geometry = new T.PlaneGeometry(320, 320, 106, 106);
  geometry.rotateX(-Math.PI / 2);
  const p = geometry.getAttribute("position"),
    colors: number[] = [];
  const main = new T.Color(0xf0f0f0),
    dark = new T.Color(0xb9c7b0),
    light = new T.Color(0xffffff),
    c = new T.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i);
    p.setY(i, terrainHeight(x, z));
    // Several broad, non-aligned scales avoid stripes and visible repeating tiles.
    const patch =
      Math.sin(x * 0.125 + Math.sin(z * 0.16) * 1.4) * 0.2 +
      Math.cos(z * 0.19 - x * 0.07) * 0.16 +
      Math.sin(x * 0.36 + Math.sin(z * 0.3) * 2) * 0.1 +
      Math.cos(z * 0.4 + Math.sin(x * 0.2)) * 0.08;
    c.copy(main).lerp(
      patch < 0 ? dark : light,
      Math.min(1, Math.abs(patch) * 1.9),
    );
    c.lerp(
      new T.Color(0x87916c),
      T.MathUtils.smoothstep(Math.abs(z), 22, 50) * 0.18,
    );
    colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const ground = new T.Mesh(geometry, surfaces.grass);
  ground.name = "Textured grass terrain";
  ground.receiveShadow = true;
  scene.add(ground);

  const dirtParts: T.BufferGeometry[] = [];
  const paint = (g: T.BufferGeometry, alpha: (i: number) => number) => {
    const pos = g.getAttribute("position"),
      col: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i);
      pos.setY(i, terrainHeight(x, z) + 0.012);
      const c = new T.Color(TERRAIN_PALETTE.dirt).multiplyScalar(
        0.94 + 0.06 * Math.sin(x * 0.7 + z * 0.6),
      );
      col.push(c.r, c.g, c.b, alpha(i));
    }
    g.setAttribute("color", new T.Float32BufferAttribute(col, 4));
    g.computeVertexNormals();
    dirtParts.push(g);
  };
  // Geometry follows the terrain, with a translucent feathered edge rather than painted rails.
  const path = new T.PlaneGeometry(104, 5.4, 64, 8);
  path.rotateX(-Math.PI / 2);
  const pp = path.getAttribute("position"),
    opacity: number[] = [];
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i),
      z = pp.getZ(i),
      width = 1 + 0.1 * Math.sin(x * 0.38);
    opacity.push(
      (1 - T.MathUtils.smoothstep(Math.abs(z), 1.1, 2.7)) *
        (1 - T.MathUtils.smoothstep(Math.abs(x), 48, 52)) *
        0.84,
    );
    pp.setZ(
      i,
      z * width + 0.65 * Math.sin(x * 0.13) + 0.24 * Math.sin(x * 0.43),
    );
  }
  paint(path, (i) => opacity[i]);
  for (const x of CASTLE_X) {
    const patch = new T.CircleGeometry(4.3, 24);
    patch.rotateX(-Math.PI / 2);
    patch.scale(1.45, 1, 1);
    patch.translate(x, 0, 0);
    paint(patch, (i) => (i === 0 ? 0.8 : 0));
  }
  const dirtGeometry = mergeGeometries(dirtParts)!;
  dirtParts.forEach((g) => g.dispose());
  const dirt = new T.Mesh(dirtGeometry, surfaces.dirt);
  dirt.name = "Irregular feathered path and gate wear";
  dirt.receiveShadow = true;
  dirt.renderOrder = 1;
  scene.add(dirt);

  const rings: T.Mesh[] = [];
  for (let team = 0; team < 2; team++) {
    const color = team === 0 ? 0xf47770 : 0x6aaff4;
    for (const siege of [false, true]) {
      const ring = new T.Mesh(
        new T.RingGeometry(siege ? 5.2 : 2.4, siege ? 5.35 : 2.6, 48),
        new T.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: siege ? 0 : 0.2,
          transparent: siege,
          opacity: siege ? 0.4 : 1,
          side: T.DoubleSide,
          depthWrite: !siege,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(
        CASTLE_X[team] + (siege ? 0 : team === 0 ? 8 : -8),
        0.01,
        0,
      );
      scene.add(ring);
      if (!siege) rings.push(ring);
    }
  }
  return { sun, castles: [] as T.Group[], rings, terrain: surfaces };
}
