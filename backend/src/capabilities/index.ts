// Add a factory switch here when a second model is supported.
import type { ImageCapability, TextCapability } from "./types.js";
import { ImagenCapability } from "./imagen.js";
import { GeminiTextCapability } from "./geminiText.js";

export function getCapability(): ImageCapability {
  return new ImagenCapability();
}

export function getTextCapability(): TextCapability {
  return new GeminiTextCapability();
}
