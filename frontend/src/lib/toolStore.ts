import { create } from "zustand";

export type Tool =
  | "pointer"
  | "generate-image"
  | "generate-video"
  | "generate-audio"
  | "frame"
  | "shapes"
  | "text"
  | "sticky-note"
  | "color-picker"
  | "media-upload";

interface ToolState {
  activeTool: Tool;
  setTool: (tool: Tool) => void;
}

export const useToolStore = create<ToolState>((set) => ({
  activeTool: "pointer",
  setTool: (tool) => set({ activeTool: tool }),
}));
