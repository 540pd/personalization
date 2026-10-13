import { create } from "zustand";

// Whether a file pick is still in flight, from opening the dialog to the last
// node landing on the canvas.
//
// Deliberately NOT a Tool. "media-upload" exists in the Tool union but is
// never set, because activeTool answers "what will my next canvas click do"
// and an upload has no answer -- the image lands centred, there is no second
// click. Worse, draggability.ts and hoverOutline.ts both read "not pointer"
// as "canvas is not interactive", so setting it would freeze the board for
// the duration of the upload.

interface UploadState {
  isUploading: boolean;
  setUploading: (uploading: boolean) => void;
}

export const useUpload = create<UploadState>((set) => ({
  isUploading: false,
  setUploading: (uploading) => set({ isUploading: uploading }),
}));
