import * as T from "three";
import type {
  SoldierState as UnitState,
  SoldierKind as UnitKind,
} from "./state";
// Original MIT bone-keyframe attack motions. The free pack has movement/hit/death,
// but no dedicated weapon attack clips; do not relabel Use_Item as sword combat.
export function originalAttacks(root: T.Object3D, idle: T.AnimationClip) {
  const mixer = new T.AnimationMixer(root);
  const idleAction = mixer.clipAction(idle);
  idleAction.play();
  mixer.setTime(0);
  root.updateMatrixWorld(true);
  const bones: T.Bone[] = [];
  root.traverse((o) => {
    if (o instanceof T.Bone) bones.push(o);
  });
  const definitions: Record<
    string,
    Record<string, [number, number, number][]>
  > = {
    PW_Sword_Swing: {
      upperarmr: [
        [0, 0, 0],
        [-1.4, 0.2, -0.5],
        [-0.5, -0.5, 0.8],
        [0.3, 0, 0.2],
        [0, 0, 0],
      ],
      chest: [
        [0, 0, 0],
        [0, -0.25, 0],
        [0, 0.35, 0],
        [0, 0.1, 0],
        [0, 0, 0],
      ],
    },
    PW_Bow_Shot: {
      upperarml: [
        [0, 0, 0],
        [-1.1, 0, 0.3],
        [-1.1, 0, 0.3],
        [-0.7, 0, 0.2],
        [0, 0, 0],
      ],
      upperarmr: [
        [0, 0, 0],
        [-0.9, 0.3, -0.6],
        [-1.2, 0.7, -0.5],
        [-0.6, 0, 0],
        [0, 0, 0],
      ],
    },
    PW_Staff_Cast: {
      upperarmr: [
        [0, 0, 0],
        [-1.8, 0, 0],
        [-1.5, 0.3, 0.3],
        [-0.5, 0, 0.1],
        [0, 0, 0],
      ],
      chest: [
        [0, 0, 0],
        [-0.15, 0, 0],
        [0.15, 0, 0],
        [0.05, 0, 0],
        [0, 0, 0],
      ],
    },
    PW_Heavy_Swing: {
      upperarmr: [
        [0, 0, 0],
        [-2, 0, -0.3],
        [-0.4, 0, 0.3],
        [0.2, 0, 0],
        [0, 0, 0],
      ],
      upperarml: [
        [0, 0, 0],
        [-1.5, 0, 0.5],
        [-0.3, 0, -0.1],
        [0.1, 0, 0],
        [0, 0, 0],
      ],
    },
    PW_Giant_Slam: {
      upperarmr: [
        [0, 0, 0],
        [-2.4, 0, -0.2],
        [-0.1, 0, 0.2],
        [0.2, 0, 0],
        [0, 0, 0],
      ],
      upperarml: [
        [0, 0, 0],
        [-2.1, 0, 0.2],
        [-0.2, 0, -0.2],
        [0.2, 0, 0],
        [0, 0, 0],
      ],
      chest: [
        [0, 0, 0],
        [-0.25, 0, 0],
        [0.4, 0, 0],
        [0.15, 0, 0],
        [0, 0, 0],
      ],
    },
  };
  const clips = [];
  for (const [name, poses] of Object.entries(definitions)) {
    const duration = name === "PW_Giant_Slam" ? 1.1 : 0.75,
      times = [0, duration * 0.22, duration * 0.48, duration * 0.76, duration],
      tracks: T.KeyframeTrack[] = [];
    for (const bone of bones) {
      const q = bone.quaternion.clone(),
        values: number[] = [];
      const offsets = poses[bone.name] ?? [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ];
      for (const v of offsets)
        values.push(
          ...q
            .clone()
            .multiply(new T.Quaternion().setFromEuler(new T.Euler(...v)))
            .toArray(),
        );
      tracks.push(
        new T.QuaternionKeyframeTrack(bone.name + ".quaternion", times, values),
      );
      tracks.push(
        new T.VectorKeyframeTrack(
          bone.name + ".position",
          [0, duration],
          [...bone.position.toArray(), ...bone.position.toArray()],
        ),
      );
    }
    clips.push(new T.AnimationClip(name, duration, tracks));
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  return clips;
}
export const attackClip: Record<UnitKind, string> = {
  sword: "PW_Sword_Swing",
  archer: "PW_Bow_Shot",
  mage: "PW_Staff_Cast",
  cavalry: "PW_Heavy_Swing",
  boss: "PW_Giant_Slam",
  guardian: "PW_Heavy_Swing",
};
export function animationFor(u: UnitState, results = false) {
  return results && u.hp > 0
    ? "Idle_A"
    : u.hp <= 0 || /dead|death/.test(u.state)
      ? "Death_A"
      : /hurt/.test(u.state)
        ? "Hit_A"
        : /attack|fight|cast|shoot|stomp/.test(u.state)
          ? attackClip[u.type]
          : /run|walk|move/.test(u.state)
            ? u.type === "cavalry" || u.type === "boss"
              ? "Walking_A"
              : "Running_A"
            : /fly/.test(u.state)
              ? "Jump_Idle"
              : "Idle_A";
}
export const onceClip = (name: string) => /Death|Hit|PW_/.test(name);
