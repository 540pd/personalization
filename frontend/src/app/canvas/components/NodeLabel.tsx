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
import { trackPointer } from "@/lib/dom/pointer";

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
  /**
   * Make the name a handle: a press that moves past the drag threshold calls
   * this with the screen point it was pressed at. A frame's name uses it to
   * move the frame (#119); node names leave it unset and stay text only.
   */
  onDragFrom?: (press: { x: number; y: number }) => void;
  /** A press released without dragging. Double-click still renames. */
  onSelect?: () => void;
  /**
   * Not shown, and no pointer target (#215: names off, node neither hovered
   * nor selected). Kept mounted rather than removed so a rename in progress
   * survives the pointer leaving: an open field is always shown.
   */
  hidden?: boolean;
}

/** Past this many screen px a press on a name is a drag, not a click. */
const DRAG_THRESHOLD = 4;

export default function NodeLabel({
  value,
  left,
  bottom,
  maxWidth,
  onCommit,
  onDragFrom,
  onSelect,
  hidden = false,
}: NodeLabelProps) {
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
    // Positioned by transform rather than left/top: every label is on screen
    // at once now, and all of them move on every pan and zoom frame. left/top
    // is layout, a transform is compositing.
    left: 0,
    top: 0,
    // translateY(-100%) puts the box's bottom edge on the translated y;
    // pushing that down by the half-leading lands the glyph bottoms on
    // `bottom` instead.
    transform: `translate3d(${left}px, ${bottom + HALF_LEADING}px, 0) translateY(-100%)`,
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

  // Click or drag, decided on the first move past the threshold. Window
  // listeners, so the gesture survives the pointer leaving the name.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const press = { x: e.clientX, y: e.clientY };
    // A cancelled press is neither: it does not select.
    const stop = trackPointer({
      onMove: (ev) => {
        if (Math.hypot(ev.clientX - press.x, ev.clientY - press.y) <= DRAG_THRESHOLD) return;
        stop();
        onDragFrom?.(press);
      },
      onUp: () => onSelect?.(),
    });
  };
  const isHandle = !!(onDragFrom || onSelect);

  if (!editing) {
    return (
      <div
        title={hidden ? undefined : value}
        aria-hidden={hidden || undefined}
        onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
        onPointerDown={isHandle ? onPointerDown : undefined}
        style={{
          ...base,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          // A handle is grabbed, not typed into; renaming is a double-click.
          cursor: isHandle ? "default" : "text",
          userSelect: "none",
          ...(hidden ? { visibility: "hidden", pointerEvents: "none" } : null),
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
