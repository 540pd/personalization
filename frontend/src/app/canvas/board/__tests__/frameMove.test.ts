import { describe, it, expect, beforeEach } from "vitest";
import { useFrames, type FrameRecord } from "@/store/frame.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { canvasHistory } from "@/lib/canvas/history";
import { byArea } from "@/lib/canvas/bounds";
import { beginFrameMove } from "../frameDrag";

const frame = (over: Partial<FrameRecord> = {}): FrameRecord =>
  ({ id: "f", canvasX: 0, canvasY: 0, canvasW: 200, canvasH: 200, label: "Frame", ...over }) as FrameRecord;

describe("byArea", () => {
  it("puts the smallest first", () => {
    const big = frame({ id: "big", canvasW: 300, canvasH: 300 });
    const small = frame({ id: "small", canvasW: 50, canvasH: 400 });
    expect([big, small].sort(byArea).map((f) => f.id)).toEqual(["small", "big"]);
  });
});

describe("beginFrameMove", () => {
  beforeEach(() => {
    useFrames.setState({ frames: {}, drag: {} });
    useKonvaNodes.setState({ nodes: {} });
    useFrames.getState().upsert(frame());
  });

  const node = (id: string, x: number) =>
    useKonvaNodes.getState().upsert({ id, canvasX: x, canvasY: 10, canvasW: 20, canvasH: 20 });

  it("carries what was inside at the start, and only that", () => {
    node("in", 10);
    const moving = beginFrameMove(frame());
    // Inside the frame's new area, but not a member: it stays put.
    node("late", 150);
    moving.move(30, 5);
    expect(useKonvaNodes.getState().nodes.in).toMatchObject({ canvasX: 40, canvasY: 15 });
    expect(useKonvaNodes.getState().nodes.late.canvasX).toBe(150);
  });

  it("offsets from the start on every move, not from the last one", () => {
    node("in", 10);
    const moving = beginFrameMove(frame());
    moving.move(30, 0);
    moving.move(40, 0);
    expect(useKonvaNodes.getState().nodes.in.canvasX).toBe(50);
  });

  it("shows the live offset for the name, then lands the frame as one step", () => {
    const moving = beginFrameMove(frame());
    moving.move(30, 5);
    expect(useFrames.getState().drag.f).toEqual({ dx: 30, dy: 5 });

    let commits = 0;
    const stop = canvasHistory.subscribe(() => { commits += 1; });
    moving.end();
    stop();

    expect(useFrames.getState().drag).toEqual({});
    expect(useFrames.getState().frames.f).toMatchObject({ canvasX: 30, canvasY: 5 });
    expect(commits).toBe(1);
  });
});
