import { describe, it, expect } from "vitest";
import type { Connection } from "@/store/connection.store";
import type { KonvaNodeRecord } from "@/store/konvaNodes.store";
import type { PanelInstance } from "@/store/nodePanel.store";
import { collectReferences } from "../references";

const wire = (from: string, fromNodeType: "panel" | "konva", to = "target"): Connection =>
  ({ id: `${from}-${to}`, fromNodeId: from, fromNodeType, toNodeId: to, toNodeType: "panel" });

const panel = (over: Partial<PanelInstance>): PanelInstance =>
  ({ id: "p", kind: "image", canvasX: 0, canvasY: 0, w: 10, h: 10, isActive: false, isPanelOpen: false, ...over }) as PanelInstance;

const image = (over: Partial<KonvaNodeRecord>): KonvaNodeRecord =>
  ({ id: "k", canvasX: 0, canvasY: 0, canvasW: 10, canvasH: 10, ...over });

describe("collectReferences", () => {
  it("takes only the wires into this node, in wire order, with names", () => {
    const refs = collectReferences(
      "target",
      [wire("img", "konva"), wire("other", "konva", "elsewhere"), wire("txt", "panel")],
      { img: image({ id: "img", imageUrl: "blob:cat", label: "cat" }), other: image({ id: "other", imageUrl: "blob:x" }) },
      [panel({ id: "txt", kind: "instruction", label: "brief", output: { type: "text", value: "be brief" } })],
    );
    expect(refs).toEqual([
      { kind: "image", url: "blob:cat", name: "cat" },
      { kind: "text", text: "be brief", name: "brief" },
    ]);
  });

  it("sends a generated image as an image reference", () => {
    const refs = collectReferences("target", [wire("a", "panel")], {},
      [panel({ id: "a", label: "sunset", output: { type: "image", value: "data:x" } })]);
    expect(refs).toEqual([{ kind: "image", url: "data:x", name: "sunset" }]);
  });

  it("sends a Compose box's written text (#181)", () => {
    const refs = collectReferences("target", [wire("c", "panel")], {},
      [panel({ id: "c", kind: "compose", label: "notes", draft: { model: "", instruction: "# Notes" } })]);
    expect(refs).toEqual([{ kind: "text", text: "# Notes", name: "notes" }]);
  });

  it("skips sources with nothing to give", () => {
    const refs = collectReferences(
      "target",
      [wire("shape", "konva"), wire("gone", "konva"), wire("empty", "panel"), wire("missing", "panel"), wire("blank", "panel")],
      { shape: image({ id: "shape" }) },
      [panel({ id: "empty" }), panel({ id: "blank", kind: "compose", draft: { model: "", instruction: "  " } })],
    );
    expect(refs).toEqual([]);
  });

  it("drops a video output, which has no reference form", () => {
    const refs = collectReferences("target", [wire("v", "panel")], {},
      [panel({ id: "v", kind: "video", output: { type: "video", value: "https://v" } })]);
    expect(refs).toEqual([]);
  });
});
