import { create } from "zustand";
import { DEFAULT_SECTION, type SectionId } from "@/app/canvas/components/Sidebar/items";

/**
 * Which rail destination is on screen (#206).
 *
 * A store rather than the Sidebar's own state because more than the rail
 * needs it: the Skills page covers the board, and the board's window-level
 * keyboard and drop handlers must stand down while it does. The board itself
 * stays mounted underneath -- its Konva nodes live on the stage, not in a
 * store, so unmounting it would lose them.
 *
 * In memory only: a reload lands on the board.
 */
interface SectionState {
  section: SectionId;
  setSection: (section: SectionId) => void;
}

export const useSection = create<SectionState>((set) => ({
  section: DEFAULT_SECTION,
  setSection: (section) => set({ section }),
}));

/**
 * True while the board is the page on screen. The board's shortcuts and its
 * file drop check this, so Delete or Ctrl+Z on the Skills page cannot change
 * a board nobody can see.
 */
export function boardIsShown(): boolean {
  return useSection.getState().section === "playspace";
}
