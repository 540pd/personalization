import { create } from "zustand";

export type Tool =
  | "pointer"
  | "generate-instruction"
  | "generate-image"
  | "generate-video"
  | "link-straight"
  | "link-elbow"
  | "link-curve"
  | "frame"
  | "shapes"
  | "text"
  | "sticky-note"
  | "color-picker"
  | "media-upload";

/**
 * Tools that draw a region by dragging, rather than panning the board.
 *
 * "not pointer" used to be a safe shorthand for "this tool pans", because
 * every non-pointer tool did. Frame broke that, and shapes, text and sticky
 * note will break it the same way, so the distinction is named once here
 * instead of re-derived at each call site.
 */
const DRAW_TOOLS: Tool[] = ["frame"];

/** Does a drag with this tool draw something on the board? */
export function drawingTool(tool: Tool): boolean {
  return DRAW_TOOLS.includes(tool);
}

/** Does a drag with this tool pan the board? */
export function panningTool(tool: Tool): boolean {
  return tool !== "pointer" && !DRAW_TOOLS.includes(tool);
}

/** The cursor this tool should show while it is armed and idle. */
export function cursorFor(tool: Tool): string {
  return DRAW_TOOLS.includes(tool) ? "crosshair" : "default";
}

interface ToolState {
  activeTool: Tool;
  setTool: (tool: Tool) => void;
}

export const useToolStore = create<ToolState>((set) => ({
  activeTool: "pointer",
  setTool: (tool) => set({ activeTool: tool }),
}));
