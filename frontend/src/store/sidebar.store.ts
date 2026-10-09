import { create } from "zustand";

/**
 * Left navigation rail: open/closed, and how much of the window it covers.
 *
 * The width lives here rather than only in CSS because the canvas stays
 * full-bleed underneath it, so six separate places that work out "where is
 * the middle of the screen" need to subtract it. See app/canvas/canvasArea.
 */

export const SIDEBAR_WIDTH = 260;

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

export const useSidebar = create<SidebarState>((set) => ({
  collapsed: false,
  toggle: () => set((s) => ({ collapsed: !s.collapsed })),
  setCollapsed: (collapsed) => set({ collapsed }),
}));

/** How many px of the left edge the sidebar is covering right now. */
export function sidebarInset(collapsed: boolean): number {
  return collapsed ? 0 : SIDEBAR_WIDTH;
}
