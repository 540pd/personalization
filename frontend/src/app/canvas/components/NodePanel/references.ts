import type { PanelInstance } from "@/store/nodePanel.store";
import type { Connection } from "@/store/connection.store";
import type { KonvaNodeRecord } from "@/store/konvaNodes.store";
import type { Reference } from "@/types/canvas.types";
import { panelOutput } from "./kinds";

/**
 * The references a node's generation sends: one per wire into its input
 * port, in wire order, skipping any source with nothing to give yet.
 */
export function collectReferences(
  nodeId: string,
  connections: Connection[],
  konvaNodes: Record<string, KonvaNodeRecord>,
  panels: PanelInstance[],
): Reference[] {
  // Carry each upstream node's name alongside its image. Without it the
  // model receives an anonymous sequence and an instruction cannot say
  // which reference it means.
  return connections
    .filter((c) => c.toNodeId === nodeId)
    .map((c): Reference | null => {
      if (c.fromNodeType === "konva") {
        const n = konvaNodes[c.fromNodeId];
        return n?.imageUrl ? { kind: "image", url: n.imageUrl, name: n.label } : null;
      }
      const p = panels.find((pp) => pp.id === c.fromNodeId);
      // A Compose box's written text counts as its output (#181).
      const out = p && panelOutput(p);
      if (!p || !out) return null;
      // A text node's content IS its reference; an image node points at a
      // data URL. Video is terminal and renders no output port, so it
      // cannot be wired as a source -- the fallthrough keeps that true
      // even if a stale connection outlives a change of kind.
      if (out.type === "text") return { kind: "text", text: out.value, name: p.label };
      if (out.type === "image") return { kind: "image", url: out.value, name: p.label };
      return null;
    })
    .filter((r): r is Reference => r !== null);
}
