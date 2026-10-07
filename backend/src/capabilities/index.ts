// Add a factory switch here when a second model is supported.
import type { ImageCapability, TextCapability, VideoCapability } from "./types.js";
import { ImagenCapability } from "./imagen.js";
import { GeminiTextCapability } from "./geminiText.js";
import { VeoCapability } from "./veo.js";

export function getCapability(): ImageCapability {
  return new ImagenCapability();
}

export function getTextCapability(): TextCapability {
  return new GeminiTextCapability();
}

export function getVideoCapability(): VideoCapability {
  return new VeoCapability();
}
