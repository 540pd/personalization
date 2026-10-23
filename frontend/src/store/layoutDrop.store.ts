import { create } from "zustand";

// Where a dragged item would land in an auto layout row (#228): a line in the
// gap, drawn by AutoLayoutDropLine. Canvas units; null when nothing is
// being dragged over a row.

export interface DropLine {
  /**
   * Where the line starts: for a row's upright line, its centre x and the
   * row's top; for a column's flat line (#230), the column's left and its
   * centre y.
   */
  x: number;
  y: number;
  /** How long: the row's height, or the column's width. */
  length: number;
  /** Upright in a row, flat in a column. */
  vertical: boolean;
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
    if (cur === line || (cur && line && cur.x === line.x && cur.y === line.y
      && cur.length === line.length && cur.vertical === line.vertical)) return;
    set({ line });
  },
}));
