// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import Konva from "konva";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { listenForDrops } from "../dragDrop";
import { listenForColorPicks } from "../recolor";
import { colorEvent } from "../palette";
import { createShape } from "../shapes";

// jsdom has no DragEvent constructor; an Event with the fields read is enough.
function drag(type: string, x: number, files: File[] = []) {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, { clientX: x, clientY: 10, dataTransfer: { types: ["Files"], files, dropEffect: "none" } });
  return e;
}

describe("listenForDrops", () => {
  const area = () => ({ left: 0, top: 0, width: 100, height: 100 });

  it("shows the affordance and hands over the files, until disposed", () => {
    const setActive = vi.fn();
    const onDrop = vi.fn();
    const stop = listenForDrops({ area, setActive, onDrop });
    const png = new File(["x"], "a.png", { type: "image/png" });

    window.dispatchEvent(drag("dragenter", 50));
    expect(setActive).toHaveBeenLastCalledWith(true);
    const drop = drag("drop", 50, [png]);
    window.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(onDrop).toHaveBeenCalledWith([png], { x: 50, y: 10 });

    stop();
    window.dispatchEvent(drag("drop", 50, [png]));
    expect(onDrop).toHaveBeenCalledTimes(1);
  });

  it("clears the affordance when the window loses the drag", () => {
    const setActive = vi.fn();
    const stop = listenForDrops({ area, setActive, onDrop: vi.fn() });
    window.dispatchEvent(drag("dragenter", 50));
    window.dispatchEvent(new Event("blur"));
    expect(setActive).toHaveBeenLastCalledWith(false);
    stop();
  });
});

describe("listenForColorPicks", () => {
  beforeEach(() => useKonvaNodes.setState({ nodes: {} }));

  const setup = () => {
    const layer = Object.assign(new Konva.Group(), { batchDraw: vi.fn() }) as unknown as Konva.Layer;
    const transformer = new Konva.Transformer();
    const shape = createShape("rect", { x: 0, y: 0, width: 10, height: 10 });
    shape.id("s");
    layer.add(shape);
    transformer.nodes([shape]);
    const saveSnapshot = vi.fn();
    const stop = listenForColorPicks({ layer, transformer, saveSnapshot });
    return { shape, saveSnapshot, stop };
  };

  it("recolours the selection and commits keyed on the event", () => {
    const { saveSnapshot, stop } = setup();
    colorEvent.emit({ hex: "#3b9ef5" });
    expect(saveSnapshot).toHaveBeenCalledTimes(1);
    expect(saveSnapshot.mock.calls[0][0]).toBeInstanceOf(Event);
    expect(useKonvaNodes.getState().nodes.s.style?.color).toBe("#3b9ef5");
    stop();
  });

  it("commits nothing when nothing changes colour", () => {
    const { saveSnapshot, stop } = setup();
    colorEvent.emit({ hex: "#3b9ef5" });
    colorEvent.emit({ hex: "#3b9ef5" });
    expect(saveSnapshot).toHaveBeenCalledTimes(1);
    stop();
    colorEvent.emit({ hex: "#ffffff" });
    expect(saveSnapshot).toHaveBeenCalledTimes(1);
  });
});
