// Add a factory switch here when a second model is supported.
import type { ImageCapability } from "./types.js";
import { ImagenCapability } from "./imagen.js";

export function getCapability(): ImageCapability {
  return new ImagenCapability();
}
