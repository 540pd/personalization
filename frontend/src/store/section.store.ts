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
  /** Goes to `section`, unless the page on screen holds it back (see setLeaveGuard). */
  setSection: (section: SectionId) => void;
}

/**
 * Asked before the page on screen is left (#219: Brand with unsaved edits).
 * Return true to hold the move back; call `proceed` later to make it.
 */
export type LeaveGuard = (proceed: () => void) => boolean;

let leaveGuard: LeaveGuard | null = null;

/**
 * The page on screen sets this while leaving it would lose something, and
 * clears it (null) once it would not. Every way out -- the rail, the user
 * menu, ⌘, -- goes through setSection, so one guard covers them all.
 */
export function setLeaveGuard(guard: LeaveGuard | null) {
  leaveGuard = guard;
}

export const useSection = create<SectionState>((set, get) => ({
  section: DEFAULT_SECTION,
  setSection: (section) => {
    if (section === get().section) return;
    const go = () => set({ section });
    if (leaveGuard?.(go)) return;
    go();
  },
}));

/**
 * True while the board is the page on screen. The board's shortcuts and its
 * file drop check this, so Delete or Ctrl+Z on the Skills page cannot change
 * a board nobody can see.
 */
export function boardIsShown(): boolean {
  return useSection.getState().section === "playspace";
}
