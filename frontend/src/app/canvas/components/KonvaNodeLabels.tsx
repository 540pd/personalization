"use client";

// File name shown above an uploaded image while it is selected. Double-click
// to rename. This is selection chrome, so — like the transformer border and
// handles — it is NOT hidden when another node covers it: selecting a buried
// image and getting no label back would defeat the point.

import { useEffect, useRef, useState } from "react";
import { useKonvaNodes, type KonvaNodeRecord } from "@/store/konvaNodes.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useViewport } from "@/store/viewport.store";

// Clearance above the node. The transformer's top-left anchor sits on the
// corner and extends ~8px outward, so the label has to clear it.
const GAP = 10;
// Below this on-screen node width no useful amount of text fits, so the label
// is dropped entirely. Keyed off rendered width rather than zoom, which covers
// both zooming far out and a node that is simply small.
const MIN_NODE_W = 100;
// Floor for the rename field so an emptied one stays clickable.
const MIN_INPUT_W = 40;
// Must match between the input and its sizing mirror, or the two drift apart.
const FIELD_PAD = "0 3px";
const FIELD_BORDER = "1px solid #000000";

function Label({ node, left, bottom, maxWidth }: {
  node: KonvaNodeRecord;
  left: number;
  bottom: number;
  maxWidth: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.label ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-sync when the label changes underneath us (undo, paste, a second rename).
  useEffect(() => {
    if (!editing) setDraft(node.label ?? "");
  }, [node.label, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    // An empty rename reverts rather than leaving the node unlabelled.
    if (next) useKonvaNodes.getState().upsert({ ...node, label: next });
    else setDraft(node.label ?? "");
    setEditing(false);
  };

  const cancel = () => {
    setDraft(node.label ?? "");
    setEditing(false);
  };

  const base: React.CSSProperties = {
    position: "fixed",
    left,
    top: bottom,
    transform: "translateY(-100%)", // sit the label's bottom edge on `bottom`
    maxWidth,
    fontSize: 12,
    lineHeight: "16px",
    fontFamily: "inherit",
    color: "#404040",
    pointerEvents: "auto",
    zIndex: 52, // above ports (51) so a rename is always reachable
  };

  if (!editing) {
    return (
      <div
        title={node.label}
        onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
        style={{
          ...base,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          cursor: "text",
          userSelect: "none",
        }}
      >
        {node.label}
      </div>
    );
  }

  // Auto-growing field: a hidden mirror holding the same text sizes the grid
  // cell and the input is laid over it, so the browser does the measuring and
  // there is no re-measure on every keystroke. field-sizing: content would do
  // this natively but is Chromium-only.
  const fieldText: React.CSSProperties = {
    gridArea: "1 / 1",
    font: "inherit",
    fontSize: 12,
    lineHeight: "16px",
    padding: FIELD_PAD,
    border: FIELD_BORDER,
    borderRadius: 3,
    boxSizing: "border-box",
  };

  return (
    <span
      style={{
        ...base,
        display: "inline-grid",
        // minmax(0, max-content) rather than a bare auto track: the mirror is
        // white-space: pre, so its min-content is the full text width and an
        // auto track would refuse to shrink, letting the field overflow past
        // maxWidth and out of the node.
        gridTemplateColumns: "minmax(0, max-content)",
        overflow: "hidden",
        minWidth: MIN_INPUT_W,
        maxWidth,
      }}
    >
      <span
        aria-hidden
        style={{ ...fieldText, visibility: "hidden", whiteSpace: "pre", borderColor: "transparent" }}
      >
        {draft || " "}
      </span>
      <input
        ref={inputRef}
        // Without size=1 the input contributes its default 20-character
        // intrinsic width to the grid track, flooring the field at ~150px and
        // defeating the mirror.
        size={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        // Stop canvas-level shortcuts seeing these keys while editing.
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") cancel();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          ...fieldText,
          width: "100%",
          minWidth: 0,
          color: "#404040",
          background: "#ffffff",
          outline: "none",
        }}
      />
    </span>
  );
}

export default function KonvaNodeLabels() {
  const nodes = useKonvaNodes((s) => s.nodes);
  const selectedIds = useKonvaSelection((s) => s.nodeIds);
  const { x: stageX, y: stageY, scale } = useViewport();

  return (
    <>
      {Object.values(nodes).map((n) => {
        if (!n.label || !selectedIds.includes(n.id)) return null;
        const screenW = n.canvasW * scale;
        if (screenW < MIN_NODE_W) return null;
        return (
          <Label
            key={n.id}
            node={n}
            left={stageX + n.canvasX * scale}
            bottom={stageY + n.canvasY * scale - GAP}
            maxWidth={screenW}
          />
        );
      })}
    </>
  );
}
