import { create } from "zustand";

const MIN_SCALE = 0.1;
const MAX_SCALE = 4;
const ZOOM_SENSITIVITY = 0.001;

interface ViewportState {
  x: number;
  y: number;
  scale: number;
  setPosition: (x: number, y: number) => void;
  setScale: (scale: number) => void;
  // Zoom toward a point (e.g. mouse cursor position) — keeps the point
  // under the cursor stationary while scaling.
  zoomToPoint: (delta: number, pointX: number, pointY: number) => void;
  reset: () => void;
}

export const useViewport = create<ViewportState>((set, get) => ({
  x: 0,
  y: 0,
  scale: 1,

  setPosition: (x, y) => set({ x, y }),

  setScale: (scale) =>
    set({ scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)) }),

  zoomToPoint: (delta, pointX, pointY) => {
    const { x, y, scale } = get();
    const newScale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, scale - delta * ZOOM_SENSITIVITY * scale)
    );
    const scaleRatio = newScale / scale;
    set({
      scale: newScale,
      x: pointX - scaleRatio * (pointX - x),
      y: pointY - scaleRatio * (pointY - y),
    });
  },

  reset: () => set({ x: 0, y: 0, scale: 1 }),
}));

export { MIN_SCALE, MAX_SCALE };
