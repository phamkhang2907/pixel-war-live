import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import { worldX, type BattleState, CASTLE_X } from "./state";

export type CameraMode = "overview" | "front" | "red" | "blue" | "manual";
export class BattlefieldCamera {
  readonly camera = new PerspectiveCamera(42, 9 / 16, 0.1, 750);
  mode: CameraMode = "front";
  private focus = new Vector3(0, 0, 0);
  private desiredFocus = new Vector3(0, 0, 0);
  private distance = 260;
  private desiredDistance = 260;
  private position = new Vector3();
  private yaw = 0;
  private desiredYaw = 0;
  constructor() {
    this.update(1);
  }
  select(mode: CameraMode) {
    this.mode = mode;
    this.desiredYaw = MathUtils.degToRad(
      mode === "red" ? 38 : mode === "blue" ? -38 : 0,
    );
    this.desiredFocus.set(
      mode === "red"
        ? CASTLE_X[0] - 5.5
        : mode === "blue"
          ? CASTLE_X[1] + 5.5
          : 0,
      0,
      0,
    );
    this.desiredFocus.z = mode === "front" ? -5.5 : 0;
    this.desiredDistance =
      mode === "overview" ? 310 : mode === "red" || mode === "blue" ? 115 : 100;
  }
  pan(delta: number) {
    this.mode = "manual";
    this.desiredFocus.x = MathUtils.clamp(this.desiredFocus.x + delta, -48, 48);
  }
  zoom(factor: number) {
    this.mode = "manual";
    this.desiredDistance = MathUtils.clamp(
      this.desiredDistance * factor,
      35,
      320,
    );
  }
  follow(state: BattleState | null) {
    if (this.mode !== "front" || !state) return;
    let min = Infinity,
      max = -Infinity,
      red = -Infinity,
      blue = Infinity;
    for (const u of state.units) {
      if (u.hp <= 0) continue;
      const x = worldX(u.x);
      min = Math.min(min, x);
      max = Math.max(max, x);
      if (u.team === 0) red = Math.max(red, x);
      else blue = Math.min(blue, x);
    }
    if (!Number.isFinite(min)) return;
    const frontline =
      Number.isFinite(red) && Number.isFinite(blue)
        ? (red + blue) / 2
        : (min + max) / 2;
    this.desiredFocus.x = MathUtils.clamp(
      frontline * 0.6 + ((min + max) / 2) * 0.4,
      -40,
      40,
    );
    this.desiredFocus.z = -5.5;
    this.desiredDistance = MathUtils.clamp(
      (2 * Math.max(this.desiredFocus.x - min, max - this.desiredFocus.x) +
        16) /
        0.42,
      100,
      250,
    );
  }

  update(dt: number) {
    const alpha = 1 - Math.exp(-5 * dt);
    this.focus.lerp(this.desiredFocus, alpha);
    this.distance = MathUtils.lerp(this.distance, this.desiredDistance, alpha);
    // Fixed 52° elevation and no yaw keep RED on screen-left in every mode.
    this.position.set(
      this.focus.x,
      this.distance * Math.sin(MathUtils.degToRad(52)),
      this.distance * Math.cos(MathUtils.degToRad(52)),
    );
    this.yaw = MathUtils.lerp(this.yaw, this.desiredYaw, alpha);
    const horizontal = this.distance * Math.cos(MathUtils.degToRad(52));
    this.position.x += horizontal * Math.sin(this.yaw);
    this.position.z = this.focus.z + horizontal * Math.cos(this.yaw);
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.focus);
    this.camera.updateMatrixWorld();
  }
  diagnostics() {
    return {
      mode: this.mode,
      x: this.focus.x,
      targetX: this.desiredFocus.x,
      targetDistance: this.desiredDistance,
      distance: this.distance,
      elevation: 52,
      yaw: MathUtils.radToDeg(this.yaw),
      targetYaw: MathUtils.radToDeg(this.desiredYaw),
    };
  }
}
