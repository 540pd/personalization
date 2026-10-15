import { create } from "zustand";

/**
 * What the Shapes menu can draw. The tool for each is "shape-<kind>", so the
 * union of tools grows with this list instead of being kept in step by hand.
 */
export const SHAPE_KINDS = ["rect", "ellipse", "triangle", "diamond", "line", "arrow", "blockArrow"] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];
export type ShapeTool = `shape-${ShapeKind}`;

export type Tool =
  | "pointer"
  | "generate-instruction"
  | "generate-image"
  | "generate-video"
  | "link-straight"
  | "link-elbow"
  | "link-curve"
  | "frame"
  | ShapeTool
  | "text"
  | "sticky-note"
  | "color-picker"
  | "media-upload";

export function shapeTool(kind: ShapeKind): ShapeTool {
  return `shape-${kind}`;
}

/** The shape this tool draws, or null if it is not a shape tool. */
export function shapeKindOf(tool: Tool): ShapeKind | null {
  const kind = tool.startsWith("shape-") ? tool.slice("shape-".length) : null;
  return (SHAPE_KINDS as readonly string[]).includes(kind ?? "") ? (kind as ShapeKind) : null;
}

/**
 * Tools that draw a region by dragging, rather than panning the board.
 *
 * "not pointer" used to be a safe shorthand for "this tool pans", because
 * every non-pointer tool did. Frame broke that, and shapes, text and sticky
 * note will break it the same way, so the distinction is named once here
 * instead of re-derived at each call site.
 */
export function drawingTool(tool: Tool): boolean {
  return tool === "frame" || shapeKindOf(tool) !== null;
}

/** Does a drag with this tool pan the board? */
export function panningTool(tool: Tool): boolean {
  return tool !== "pointer" && !drawingTool(tool);
}

/** The cursor this tool should show while it is armed and idle. */
export function cursorFor(tool: Tool): string {
  return drawingTool(tool) ? "crosshair" : "default";
}

interface ToolState {
  activeTool: Tool;
  /**
   * The shape most recently armed. The dock's Shapes button shows it and `S`
   * re-arms it, so drawing several of the same shape is one key each time.
   */
  lastShape: ShapeKind;
  setTool: (tool: Tool) => void;
}

export const useToolStore = create<ToolState>((set) => ({
  activeTool: "pointer",
  lastShape: "rect",
  setTool: (tool) => {
    const kind = shapeKindOf(tool);
    set(kind ? { activeTool: tool, lastShape: kind } : { activeTool: tool });
  },
}));
