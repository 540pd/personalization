import { create } from "zustand";
import { createSelection, type SelectionSlice } from "./selectionSlice";

// Tracks which Konva nodes are selected. Node geometry lives solely in
// konvaNodes.store — keeping a second copy here let the two drift apart.
export const useKonvaSelection = create<SelectionSlice>()((set) => createSelection(set));
