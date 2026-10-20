// The tools that draw on the board: Frame, the shapes and Text.
//
// Frame: drag on the board to draw a backdrop. The draw starts on the
// stage, but once begun it is followed through window pointer events
// (#118). Name labels, ports and wires are DOM above the canvas, so a
// stage-bound draw read crossing one as the pointer leaving and cancelled
// -- and a frame drawn corner to corner round an image runs straight
// through its name. Each window event is fed back to the stage, so the
// existing handlers see an ordinary pointer position wherever it is.
//
// Shapes draw through the same door. Only one tool is armed at a time, so
// at most one of the two has a draw in progress; the other ignores every
// call below.

import { createFrameHandlers } from "./frame";
import { createShapeDrawHandlers } from "./shapeDraw";
import { createTextTool } from "./textTool";
import { isBoardText } from "./text";
import { trackPointer } from "@/lib/dom/pointer";
import type { BoardContext } from "./boardContext";

export interface DrawTools {
  /** Escape, or the window losing the gesture: abandon any draw in progress. */
  cancel(): void;
  /** Ends everything in progress, keeping an open text edit's typing. */
  reset(): void;
  /** Did the release that just happened end a draw? Asking resets it. */
  consumeEndedDraw(): boolean;
  dispose(): void;
}

export function createDrawTools(board: BoardContext): DrawTools {
  const { stage } = board;
  const frame = createFrameHandlers(board);
  const shapeDraw = createShapeDrawHandlers(board);
  // Text places through it too, and opens its editor on the release.
  const textTool = createTextTool(board);

  // Set when a frame draw has just finished on this release. The release
  // that ends a draw also produces a click on the empty stage, which would
  // otherwise clear the frame the draw has just selected. One-shot, and
  // reset on every press, so it can never swallow a click of its own.
  let releaseEndedDraw = false;
  stage.on("pointerdown.drawclick", () => {
    releaseEndedDraw = false;
  });

  let unfollow = () => {};
  const followMove = (e: PointerEvent) => {
    stage.setPointersPositions(e);
    frame.onMove(stage);
    shapeDraw.onMove(stage, e.shiftKey);
    textTool.onMove(stage);
  };
  const followUp = (e: PointerEvent) => {
    stage.setPointersPositions(e);
    frame.onUp(stage);
    shapeDraw.onUp(stage, e.shiftKey);
    textTool.onUp(stage);
    // This runs on pointerup, before the stage sees the same release as a
    // click on empty board. Without this the click undid the selection.
    releaseEndedDraw = true;
  };
  // Losing the window or the gesture abandons the draw rather than leaving
  // a preview stranded. Escape is handled with the frame keys (boardShortcuts).
  const cancel = () => {
    frame.cancel();
    shapeDraw.cancel();
    textTool.cancel();
  };
  stage.on("mousedown.frame touchstart.frame", () => {
    if (!frame.onDown(stage) && !shapeDraw.onDown(stage) && !textTool.onDown(stage)) return;
    unfollow = trackPointer({ onMove: followMove, onUp: followUp, onCancel: cancel });
  });

  // Double-click a text to edit it in place.
  stage.on("dblclick.text dbltap.text", (e) => {
    if (isBoardText(e.target)) textTool.edit(e.target);
  });

  return {
    cancel,
    reset: () => {
      frame.cancel();
      shapeDraw.cancel();
      textTool.close();
      textTool.cancel();
    },
    consumeEndedDraw: () => {
      const ended = releaseEndedDraw;
      releaseEndedDraw = false;
      return ended;
    },
    dispose: () => {
      stage.off(".frame");
      stage.off(".text");
      stage.off(".drawclick");
      textTool.close();
      unfollow();
    },
  };
}
