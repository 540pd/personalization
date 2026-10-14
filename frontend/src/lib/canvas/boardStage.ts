// A handle on the main board stage, for code outside Board that has to move
// or read its nodes.
//
// FrameLayer needs this: a frame moves everything resting on it, and uploaded
// images are Konva nodes on Board's stage. Their positions live on those nodes
// (konvaNodes mirrors them), so moving a frame has to reach them directly.
//
// Mirrors lib/canvas/frameStage: a module ref rather than context, because
// Board and FrameLayer are siblings mounted by the page.

import type Konva from "konva";

export const boardStage: { current: Konva.Stage | null } = { current: null };
