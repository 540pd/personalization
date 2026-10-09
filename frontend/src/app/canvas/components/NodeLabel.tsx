"use client";

// Editable name shown above a selected canvas node. Shared by uploaded images
// (KonvaNodeLabels) and Create Image panels (NodePanel) so the two cannot drift
// apart — the same rename affordance, sizing and zoom rules for both.
//
// This is selection chrome, so unlike ports it is NOT hidden when another node
// covers it: selecting a buried node and getting no name back would defeat the
// point.

import { useEffect, useRef, useState } from "react";
import { LABEL_FONT_SIZE, LABEL_LINE_HEIGHT, Z_INDEX } from "@/constants/canvas.constants";

// A line box is taller than the glyphs it holds; the surplus sits half above
// and half below. Without allowing for it the rendered gap is this much wider
// than LABEL_GAP asks for, so the knob would not mean what it looks like.
const HALF_LEADING = (LABEL_LINE_HEIGHT - LABEL_FONT_SIZE) / 2;
// Floor for the rename field so an emptied one stays clickable.
const MIN_INPUT_W = 40;
// Must match between the input and its sizing mirror, or the two drift apart.
const FIELD_PAD = "0 3px";
const FIELD_BORDER = "1px solid #000000";

interface NodeLabelProps {
  value: string;
  /** Screen x of the node's left edge — the label is left-aligned to it. */
  left: number;
  /** Screen y the bottom of the label's TEXT should sit on. */
  bottom: number;
  /** The node's on-screen width; the label never exceeds it. */
  maxWidth: number;
  onCommit: (next: string) => void;
}

export default function NodeLabel({ value, left, bottom, maxWidth, onCommit }: NodeLabelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-sync when the value changes underneath us (undo, paste, a second rename).
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    // An empty rename reverts rather than leaving the node unnamed. Every
    // reference needs a name — it is how the model is told them apart.
    if (next) onCommit(next);
    else setDraft(value);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const base: React.CSSProperties = {
    position: "fixed",
    left,
    // translateY(-100%) puts the box's bottom edge on `top`; pushing it down
    // by the half-leading lands the glyph bottoms on `bottom` instead.
    top: bottom + HALF_LEADING,
    transform: "translateY(-100%)",
    maxWidth,
    fontSize: LABEL_FONT_SIZE,
    lineHeight: `${LABEL_LINE_HEIGHT}px`,
    fontFamily: "inherit",
    color: "#404040",
    pointerEvents: "auto",
    // Above the ports so a rename is always reachable, and below the nav rail
    // so a node dragged under it takes its name with it. Was a bare 52 with a
    // comment claiming ports were 51; they are 50, and the scale it was meant
    // to sit on already had a `labels` tier that nothing used.
    zIndex: Z_INDEX.labels,
  };

  if (!editing) {
    return (
      <div
        title={value}
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
        {value}
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
    fontSize: LABEL_FONT_SIZE,
    lineHeight: `${LABEL_LINE_HEIGHT}px`,
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
