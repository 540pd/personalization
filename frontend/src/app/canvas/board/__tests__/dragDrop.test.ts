import { describe, it, expect, vi } from "vitest";
import {
  isAcceptedFile,
  isFileDrag,
  isOverCanvas,
  createDragDropHandlers,
} from "../dragDrop";
import type { Rect } from "@/lib/canvas/coords";

// The canvas runs full-bleed under a 260px rail, so the visible area is not
// the window — a drop at x=100 is on the sidebar, not the board.
const AREA: Rect = { left: 260, top: 0, width: 740, height: 600 };

function file(name: string, type: string): File {
  return new File(["x"], name, { type });
}

function dataTransfer(types: string[], files: File[] = []): DataTransfer {
  return { types, files, dropEffect: "none" } as unknown as DataTransfer;
}

function dragEvent(
  clientX: number,
  clientY: number,
  dt: DataTransfer | null
): DragEvent {
  return {
    clientX,
    clientY,
    dataTransfer: dt,
    preventDefault: vi.fn(),
  } as unknown as DragEvent;
}

describe("isAcceptedFile", () => {
  it("takes the media kinds the picker takes", () => {
    expect(isAcceptedFile(file("a.png", "image/png"))).toBe(true);
    expect(isAcceptedFile(file("a.mp4", "video/mp4"))).toBe(true);
    expect(isAcceptedFile(file("a.mp3", "audio/mpeg"))).toBe(true);
  });

  it("rejects anything else", () => {
    // Without this a dropped PDF became a 240x64 rect with no way to tell
    // what it was.
    expect(isAcceptedFile(file("a.pdf", "application/pdf"))).toBe(false);
    expect(isAcceptedFile(file("a.txt", "text/plain"))).toBe(false);
    expect(isAcceptedFile(file("unknown", ""))).toBe(false);
  });
});

describe("isFileDrag", () => {
  it("is true only for a Files payload", () => {
    expect(isFileDrag(dataTransfer(["Files"]))).toBe(true);
    // Dragging a node or selected text must not arm the drop affordance.
    expect(isFileDrag(dataTransfer(["text/plain"]))).toBe(false);
    expect(isFileDrag(null)).toBe(false);
  });
});

describe("isOverCanvas", () => {
  it("excludes the sidebar strip", () => {
    expect(isOverCanvas({ x: 100, y: 300 }, AREA)).toBe(false);
    expect(isOverCanvas({ x: 400, y: 300 }, AREA)).toBe(true);
  });

  it("includes the edges", () => {
    expect(isOverCanvas({ x: 260, y: 0 }, AREA)).toBe(true);
    expect(isOverCanvas({ x: 1000, y: 600 }, AREA)).toBe(true);
  });

  it("excludes past the bottom and right", () => {
    expect(isOverCanvas({ x: 1001, y: 300 }, AREA)).toBe(false);
    expect(isOverCanvas({ x: 400, y: 601 }, AREA)).toBe(false);
  });
});

describe("createDragDropHandlers", () => {
  function harness() {
    const onDrop = vi.fn();
    const setActive = vi.fn();
    const h = createDragDropHandlers({ area: () => AREA, onDrop, setActive });
    return { h, onDrop, setActive };
  }

  it("cancels the browser default so the image does not open in a tab", () => {
    const { h } = harness();
    const over = dragEvent(400, 300, dataTransfer(["Files"]));
    h.dragOver(over);
    // Without preventDefault on dragover the drop never fires at all.
    expect(over.preventDefault).toHaveBeenCalled();

    const drop = dragEvent(400, 300, dataTransfer(["Files"], [file("a.png", "image/png")]));
    h.drop(drop);
    expect(drop.preventDefault).toHaveBeenCalled();
  });

  it("cancels the default even when the drop misses the canvas", () => {
    const { h, onDrop } = harness();
    // On the sidebar: must not navigate, must not place a node either.
    const drop = dragEvent(100, 300, dataTransfer(["Files"], [file("a.png", "image/png")]));
    h.drop(drop);
    expect(drop.preventDefault).toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("ignores a non-file drag entirely", () => {
    const { h, setActive } = harness();
    const over = dragEvent(400, 300, dataTransfer(["text/plain"]));
    h.dragOver(over);
    expect(over.preventDefault).not.toHaveBeenCalled();
    expect(setActive).not.toHaveBeenCalled();
  });

  it("reports the drop point so the node lands under the cursor", () => {
    const { h, onDrop } = harness();
    const png = file("a.png", "image/png");
    h.drop(dragEvent(640, 420, dataTransfer(["Files"], [png])));
    expect(onDrop).toHaveBeenCalledWith([png], { x: 640, y: 420 });
  });

  it("drops unsupported files from the batch, and skips an all-unsupported drop", () => {
    const { h, onDrop } = harness();
    const png = file("a.png", "image/png");
    h.drop(dragEvent(400, 300, dataTransfer(["Files"], [png, file("a.pdf", "application/pdf")])));
    expect(onDrop).toHaveBeenCalledWith([png], { x: 400, y: 300 });

    onDrop.mockClear();
    h.drop(dragEvent(400, 300, dataTransfer(["Files"], [file("a.pdf", "application/pdf")])));
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("holds the affordance on while crossing child elements", () => {
    const { h, setActive } = harness();
    const dt = dataTransfer(["Files"]);

    h.dragEnter(dragEvent(400, 300, dt)); // into the window
    expect(setActive).toHaveBeenLastCalledWith(true);

    // Entering a child fires enter before the parent's leave. A bare boolean
    // would flicker off here.
    h.dragEnter(dragEvent(410, 300, dt));
    h.dragLeave(dragEvent(400, 300, dt));
    expect(setActive).toHaveBeenCalledTimes(1);

    h.dragLeave(dragEvent(400, 300, dt)); // genuinely left
    expect(setActive).toHaveBeenLastCalledWith(false);
  });

  it("only reports a real change in state", () => {
    const { h, setActive } = harness();
    const dt = dataTransfer(["Files"]);
    h.dragOver(dragEvent(400, 300, dt));
    h.dragOver(dragEvent(401, 300, dt));
    h.dragOver(dragEvent(402, 300, dt));
    // Three events, one transition: dragover fires continuously.
    expect(setActive).toHaveBeenCalledTimes(1);
  });

  it("turns the affordance off over the sidebar", () => {
    const { h, setActive } = harness();
    const dt = dataTransfer(["Files"]);
    h.dragOver(dragEvent(400, 300, dt));
    expect(setActive).toHaveBeenLastCalledWith(true);
    h.dragOver(dragEvent(100, 300, dt));
    expect(setActive).toHaveBeenLastCalledWith(false);
  });

  it("marks the drag as a copy only over the canvas", () => {
    const { h } = harness();
    const onCanvas = dataTransfer(["Files"]);
    h.dragOver(dragEvent(400, 300, onCanvas));
    expect(onCanvas.dropEffect).toBe("copy");

    const onRail = dataTransfer(["Files"]);
    h.dragOver(dragEvent(100, 300, onRail));
    expect(onRail.dropEffect).toBe("none");
  });

  it("clears the affordance after a drop", () => {
    const { h, setActive } = harness();
    const dt = dataTransfer(["Files"], [file("a.png", "image/png")]);
    h.dragEnter(dragEvent(400, 300, dt));
    h.drop(dragEvent(400, 300, dt));
    expect(setActive).toHaveBeenLastCalledWith(false);
  });

  it("resets when the drag ends outside the window", () => {
    const { h, setActive } = harness();
    h.dragEnter(dragEvent(400, 300, dataTransfer(["Files"])));
    // dragend/blur: no dragleave ever arrives, so the overlay would stick.
    h.reset();
    expect(setActive).toHaveBeenLastCalledWith(false);
  });
});
