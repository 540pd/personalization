import { GoogleGenAI } from "@google/genai";

/**
 * A Vertex AI client. Only called once a capability has checked
 * VERTEX_PROJECT_ID is set; without it each one returns its mock instead.
 *
 * Image and text default to "global"; video passes its own region, since Veo
 * is not served from there (see veo.ts).
 */
export function makeGenAI(location = process.env.VERTEX_LOCATION ?? "global"): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT_ID!,
    location,
  });
}
