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
  /** The page on screen before this one, for closing a page (#405). */
  previous: SectionId | null;
  /** Goes to `section`, unless the page on screen holds it back (see setLeaveGuard). */
  setSection: (section: SectionId) => void;
  /**
   * Leaves a page opened from the user menu (#405): back to where it was
   * opened from, or the board when that was another such page or nothing.
   * Through setSection, so Brand's unsaved edits are still asked about.
   */
  closePage: () => void;
}

/** Pages opened from the user menu rather than the rail: they close (#405). */
const CLOSABLE: readonly SectionId[] = ["settings", "brand"];

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
  previous: null,
  setSection: (section) => {
    const from = get().section;
    if (section === from) return;
    const go = () => set({ section, previous: from });
    if (leaveGuard?.(go)) return;
    go();
  },
  closePage: () => {
    const { previous } = get();
    get().setSection(previous && !CLOSABLE.includes(previous) ? previous : "playspace");
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
