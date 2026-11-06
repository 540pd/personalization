import { create } from "zustand";

/**
 * The nodes generating right now, by id (#456), so the wires into one can
 * show it. A node's own `busy` lives in its useGeneration hook; this is the
 * board-wide copy that the wire layer reads.
 */
interface GeneratingState {
  ids: ReadonlySet<string>;
  setGenerating: (id: string, on: boolean) => void;
}

export const useGenerating = create<GeneratingState>((set) => ({
  ids: new Set(),
  setGenerating: (id, on) =>
    set((s) => {
      if (s.ids.has(id) === on) return s;
      const ids = new Set(s.ids);
      if (on) ids.add(id);
      else ids.delete(id);
      return { ids };
    }),
}));
