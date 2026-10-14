// A handle on the frames stage, for code outside FrameLayer that has to
// hit-test it.
//
// Board needs this: its own container is full-bleed, so it would swallow every
// click meant for a frame underneath. It turns itself pointer-transparent only
// where there is no Konva shape AND there IS a frame below -- which it cannot
// know without asking the frames stage.
//
// A module ref rather than context: Board and FrameLayer are siblings mounted
// by the page, and threading a ref through would mean lifting stage ownership
// out of both.

import type Konva from "konva";

export const frameStage: { current: Konva.Stage | null } = { current: null };
