import { create } from "zustand";

/**
 * Left navigation rail: expanded or minimized, and how much of the window it
 * covers.
 *
 * The width lives here rather than only in CSS because the canvas stays
 * full-bleed underneath it, so six separate places that work out "where is
 * the middle of the screen" need to subtract it. See app/canvas/canvasArea.
 */

/**
 * 200, not an arbitrary round number: the floor is ~191, set by the two
 * widest rows -- the header lockup ("Studio / PlaySpace" is 118px of text
 * plus its brandmark, gap and collapse button) and the identity row
 * ("Abhimanyu Mahato" is 126px plus its avatar). The nav items need only
 * ~138, so they were never the constraint. Below ~190 one of those two has
 * to lose words, and a clipped product name is not worth the pixels.
 */
export const SIDEBAR_WIDTH = 200;

/**
 * The minimized rail: icons only. 64 fits a 16px icon in a 36px hit target
 * with the rail's own padding either side, and is the narrowest width at
 * which the active item's fill still reads as a pill rather than a dot.
 */
export const SIDEBAR_RAIL_WIDTH = 64;

const STORAGE_KEY = "gcos-sidebar-collapsed";

/**
 * The saved mode, or expanded when there is none.
 *
 * Read and written by hand rather than through zustand's persist: this is one
 * boolean, and the only behaviour that matters is that neither direction can
 * throw. Storage can be full (images fill it, see nodePanel.store), disabled,
 * or hold something another build wrote -- none of that may stop the rail
 * from rendering or toggling.
 */
function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  } catch (err) {
    console.warn("Could not save the sidebar mode; it will not survive a reload.", err);
  }
}

interface SidebarState {
  /** Minimized to the icon rail. Never hidden: there is no third mode. */
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

export const useSidebar = create<SidebarState>((set, get) => ({
  // The sidebar is loaded with ssr: false, so this runs in the browser and
  // the first paint is already in the saved mode -- no flash of the other.
  collapsed: typeof window === "undefined" ? false : loadCollapsed(),
  toggle: () => get().setCollapsed(!get().collapsed),
  setCollapsed: (collapsed) => {
    set({ collapsed });
    saveCollapsed(collapsed);
  },
}));

/** How many px of the left edge the sidebar is covering right now. */
export function sidebarInset(collapsed: boolean): number {
  return collapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH;
}
