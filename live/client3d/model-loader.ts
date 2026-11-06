import { TextureLoader } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Avoid WebKit ImageBitmap-to-ANGLE copies for large/shared atlases.
// Keep actual glTF geometry/materials; use the ordinary DOM image
// decoder on WebKit, including images embedded in GLB bufferViews.
const webkit = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
export const MODEL_IMAGE_DECODING = webkit
  ? "HTMLImageElement (WebKit compatibility)"
  : "Three.js default";
export function createModelLoader() {
  const loader = new GLTFLoader();
  if (webkit)
    loader.register((parser) => {
      parser.textureLoader = new TextureLoader(parser.options.manager)
        .setCrossOrigin(parser.options.crossOrigin)
        .setRequestHeader(parser.options.requestHeader);
      return { name: "PW_WebKit_DOM_images" };
    });
  return loader;
}
