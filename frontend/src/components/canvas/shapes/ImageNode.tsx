// Konva-based canvas node for AI-generated images.
// Luma reference: IMG-02, OBJ-01
//
// Returns a Konva.Group that can be added directly to a Layer.
// TODO: implement all states per OBJ-01 spec: idle, generating, done, error.

import Konva from "konva";

export interface ImageNodeConfig {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  prompt: string;
  status: "idle" | "generating" | "done" | "error";
  imageUrl?: string;
  onSelect?: (id: string) => void;
}

export function createImageNode(config: ImageNodeConfig): Konva.Group {
  const { id, x, y, width, height, status, onSelect } = config;

  const group = new Konva.Group({ id, x, y, draggable: true });

  const rect = new Konva.Rect({
    width,
    height,
    fill: "#1a1a1a",
    stroke: "#333",
    strokeWidth: 1,
    cornerRadius: 8,
  });

  const label = new Konva.Text({
    width,
    height,
    text: status === "generating" ? "Generating…" : "Image Node",
    fill: "#666",
    fontSize: 12,
    align: "center",
    verticalAlign: "middle",
  });

  group.add(rect, label);

  group.on("click tap", () => onSelect?.(id));

  return group;
}
