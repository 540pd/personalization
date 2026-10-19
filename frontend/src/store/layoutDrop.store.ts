import { create } from "zustand";

// Where a dragged item would land in an auto layout row (#228): a line in the
// gap, drawn by AutoLayoutDropLine. Canvas units; null when nothing is
// being dragged over a row.

export interface DropLine {
  /** Centre of the line. */
  x: number;
  /** Top of the row, and its height. */
  y: number;
  h: number;
}

interface LayoutDropState {
  line: DropLine | null;
  setLine: (line: DropLine | null) => void;
}

export const useLayoutDrop = create<LayoutDropState>((set, get) => ({
  line: null,
  setLine: (line) => {
    const cur = get().line;
    // Same line, no update: this runs on every pointermove of a drag.
    if (cur === line || (cur && line && cur.x === line.x && cur.y === line.y && cur.h === line.h)) return;
    set({ line });
  },
}));
