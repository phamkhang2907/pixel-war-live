import * as T from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
// HDR luminance threshold isolates emissive VFX; ordinary terrain stays below it.
export class CinematicBloom {
  private composer: EffectComposer | null = null;
  enabled = false;
  constructor(
    private renderer: T.WebGLRenderer,
    private scene: T.Scene,
    private camera: T.Camera,
  ) {}
  setEnabled(enabled: boolean) {
    enabled = enabled && this.renderer.extensions.has("EXT_color_buffer_float");
    if (!enabled && this.enabled && this.composer) {
      // Retain pass/quad programs while releasing large HDR attachments.
      // Reusing passes avoids repeated fullscreen-geometry teardown on WebKit.
      this.composer.setSize(4, 4);
      this.composer.setPixelRatio(1);
    }
    if (enabled && !this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.composer.addPass(
        new UnrealBloomPass(new T.Vector2(512, 912), 0.28, 0.3, 1.1),
      );
      this.composer.addPass(new OutputPass());
    }
    this.enabled = enabled;
  }
  resize(width: number, height: number) {
    if (this.composer && this.enabled) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(width, height);
    }
  }
  render() {
    if (this.enabled && this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.enabled = false;
    if (this.composer) {
      for (const pass of this.composer.passes) pass.dispose();
      this.composer.dispose();
      this.composer = null;
    }
  }
  diagnostics() {
    return {
      enabled: this.enabled,
      implementation: "EffectComposer + UnrealBloomPass + OutputPass",
      threshold: 1.1,
      strength: 0.28,
      ao: "pooled soft contact shading; no screen-space AO cost",
    };
  }
}
