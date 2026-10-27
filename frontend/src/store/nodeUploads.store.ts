import { create } from "zustand";

// Uploads still on their way to the user's stored assets (#323), by node id.
//
// Apart from konvaNodes on purpose: this is not part of the node. It is
// never saved with the board, copied with it, or undone -- a reload or an
// undo cannot bring back a request in flight.

export type NodeUpload =
  | { state: "uploading" }
  | { state: "failed"; message: string };

interface NodeUploadsState {
  uploads: Record<string, NodeUpload>;
  set: (id: string, upload: NodeUpload) => void;
  clear: (id: string) => void;
}

export const useNodeUploads = create<NodeUploadsState>((set) => ({
  uploads: {},
  set: (id, upload) => set((s) => ({ uploads: { ...s.uploads, [id]: upload } })),
  clear: (id) =>
    set((s) => {
      if (!(id in s.uploads)) return s;
      const next = { ...s.uploads };
      delete next[id];
      return { uploads: next };
    }),
}));
