import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import { CASTLE_X } from "./state";

export type CameraMode = "overview" | "front" | "red" | "blue" | "manual";
export class BattlefieldCamera {
  readonly camera = new PerspectiveCamera(42, 9 / 16, 0.1, 750);
  mode: CameraMode = "overview";
  private focus = new Vector3(0, 0, 0);
  private desiredFocus = new Vector3(0, 0, 0);
  private distance = 260;
  private desiredDistance = 260;
  private position = new Vector3();
  constructor() {
    this.update(1);
  }
  select(mode: CameraMode) {
    this.mode = mode;
    this.desiredFocus.set(
      mode === "red" ? CASTLE_X[0] + 5 : mode === "blue" ? CASTLE_X[1] - 5 : 0,
      0,
      0,
    );
    this.desiredDistance = mode === "overview" ? 260 : 76;
  }
  pan(delta: number) {
    this.mode = "manual";
    this.desiredFocus.x = MathUtils.clamp(this.desiredFocus.x + delta, -48, 48);
  }
  zoom(factor: number) {
    this.desiredDistance = MathUtils.clamp(
      this.desiredDistance * factor,
      35,
      280,
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
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.focus);
    this.camera.updateMatrixWorld();
  }
  diagnostics() {
    return {
      mode: this.mode,
      x: this.focus.x,
      distance: this.distance,
      elevation: 52,
    };
  }
}
