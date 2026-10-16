"use client";

// The bar above a selected shape: its Color, Fill and Stroke (#161).
//
// Shown only while the selection is all shapes -- rectangle, ellipse,
// triangle, diamond, block arrow, and lines and arrows (#162) -- and nothing
// else. A line has no inside, so with one selected there is no Fill, and no
// "No stroke" either: without its stroke a line is not there. Above the selection
// rather than inside it, as the reference has it: inside, it would cover a
// small shape and its corner handles. Flipped below when there is no room
// above on screen.
//
// DOM rather than Konva, like the line handles: a constant on-screen size at
// every zoom, and it follows the viewport store without the canvas redrawing.

import { useEffect, useRef, useState } from "react";
import type Konva from "konva";
import { useKonvaNodes, type KonvaNodeRecord } from "@/store/konvaNodes.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useViewport } from "@/store/viewport.store";
import { useToolStore } from "@/store/tool.store";
import { useFrames } from "@/store/frame.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { boardStage } from "@/lib/canvas/boardStage";
import { toScreen } from "@/lib/canvas/coords";
import { canvasHistory } from "@/lib/canvas/history";
import { GESTURE_EVENT, type GestureDetail } from "@/lib/canvas/gesture";
import { SHAPE_STYLE, Z_INDEX } from "@/constants/canvas.constants";
import { COLOR_EVENT, PALETTE, type ColorDetail } from "../../board/palette";
import {
  FILL_MODES, STROKE_MODES, STROKE_WIDTHS,
  type FillMode, type ShapeStyle, type StrokeMode,
} from "../../board/shapeStyle";
import { applyShapeStyle } from "../../board/recolor";
import { isLineKind } from "../../board/shapes";
import { syncNodeGeometry } from "../../board/geometry";
import "./ShapeStyleBar.scss";

const BAR_HEIGHT = 44; // screen px, matches .shape-style-bar
const GAP = 14; // screen px between the selection box and the bar, clear of the corner handles
const MIN_TOP = 8; // screen px the bar keeps from the top of the window

type Card = "color" | "fill" | "stroke";

const FILL_LABEL: Record<FillMode, string> = {
  none: "No fill",
  pattern: "Pattern fill",
  solid: "Solid fill",
};

const STROKE_LABEL: Record<StrokeMode, string> = {
  none: "No stroke",
  solid: "Solid stroke",
  dashed: "Dashed stroke",
  dotted: "Dotted stroke",
};

// --- icons ------------------------------------------------------------------

// The shape's colour, ringed so white still shows on the white bar. With
// shapes of different colours selected, a wheel: no one colour is current.
const ColorDot = ({ hex }: { hex: string | undefined }) => (
  <span
    className="shape-style-dot"
    style={{
      background: hex ?? "conic-gradient(#f8695f, #fcd12a, #45cf6e, #3b9ef5, #c08cf5, #f8695f)",
    }}
  />
);

// Squares for Fill: a square reads as "the inside" where Luma's crossed-out
// circle does not.
const FillIcon = ({ mode }: { mode: FillMode | undefined }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
    <defs>
      <pattern id="shape-style-dots" width="4" height="4" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="0.8" fill="currentColor" />
        <circle cx="3" cy="3" r="0.8" fill="currentColor" />
      </pattern>
    </defs>
    <rect
      x="2.5" y="2.5" width="13" height="13" rx="2.5"
      fill={mode === "solid" ? "currentColor" : mode === "pattern" ? "url(#shape-style-dots)" : "none"}
      stroke="currentColor" strokeWidth="1.5"
    />
    {mode === "none" && <line x1="4" y1="14" x2="14" y2="4" stroke="currentColor" strokeWidth="1.5" />}
    {mode === undefined && <text x="9" y="12.5" fontSize="9" textAnchor="middle" fill="currentColor">?</text>}
  </svg>
);

const DASH: Record<StrokeMode, string | undefined> = {
  none: undefined,
  solid: undefined,
  dashed: "5 3",
  dotted: "0.1 3.5",
};

// A line drawn in the stroke style; crossed out for None.
const StrokeIcon = ({ mode, width = 2 }: { mode: StrokeMode | undefined; width?: number }) => (
  <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden>
    <line
      x1="3" y1="9" x2="19" y2="9"
      stroke="currentColor"
      strokeWidth={mode === "none" ? 1.5 : width}
      strokeDasharray={mode ? DASH[mode] : "1 3"}
      strokeLinecap={mode === "dotted" ? "round" : "butt"}
      opacity={mode === "none" ? 0.5 : 1}
    />
    {mode === "none" && <line x1="6" y1="15" x2="16" y2="3" stroke="currentColor" strokeWidth="1.5" />}
  </svg>
);

// Each thickness as a bar, scaled to read at icon size.
const WidthIcon = ({ width }: { width: number }) => (
  <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden>
    <line x1="4" y1="9" x2="18" y2="9" stroke="currentColor" strokeWidth={Math.min(width, 6)} strokeLinecap="round" />
  </svg>
);

// --- selection --------------------------------------------------------------

/** The value every record shares, or undefined when they differ. */
function common<K extends keyof ShapeStyle>(styles: ShapeStyle[], key: K): ShapeStyle[K] | undefined {
  const first = styles[0][key];
  return styles.every((s) => s[key] === first) ? first : undefined;
}

/** The selected Konva nodes, looked up on the board stage. */
function selectedNodes(ids: string[]): Konva.Node[] {
  const stage = boardStage.current;
  if (!stage) return [];
  return ids.map((id) => stage.findOne(`#${id}`)).filter((n): n is Konva.Node => !!n);
}

/** One undo step for a Fill or Stroke pick across the whole selection. */
function restyle(ids: string[], patch: Partial<ShapeStyle>) {
  const nodes = selectedNodes(ids);
  if (!applyShapeStyle(nodes, patch)) return;
  nodes.forEach((n) => syncNodeGeometry(n as Konva.Shape));
  // A thicker stroke widens the shape's box: let the selection border follow.
  boardStage.current?.find<Konva.Transformer>("Transformer").forEach((t) => t.forceUpdate());
  nodes[0]?.getLayer()?.batchDraw();
  canvasHistory.commit();
}

/**
 * Exactly the dock's Color pick (#159): Board recolours the selection, in one
 * undo step, and the colour is also the one the next shape is drawn in.
 */
function pickColor(hex: string) {
  useToolStore.getState().setColor(hex);
  window.dispatchEvent(new CustomEvent<ColorDetail>(COLOR_EVENT, { detail: { hex } }));
}

/**
 * True while a selected node is being dragged or resized, or a line's end or
 * bend is. The bar hides then: it would trail the shape and sit over
 * whatever it is dropped next to.
 */
function useGesture(active: boolean): boolean {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const stage = boardStage.current;
    if (!active || !stage) return;
    const transformers = stage.find<Konva.Transformer>("Transformer");
    // A drag of the stage itself is a pan: the bar simply follows it.
    stage.on("dragstart.styleBar", (e) => { if (e.target !== stage) setBusy(true); });
    stage.on("dragend.styleBar", () => setBusy(false));
    transformers.forEach((t) => {
      t.on("transformstart.styleBar", () => setBusy(true));
      t.on("transformend.styleBar", () => setBusy(false));
    });
    const onGesture = (e: Event) => setBusy((e as CustomEvent<GestureDetail>).detail.active);
    window.addEventListener(GESTURE_EVENT, onGesture);
    return () => {
      window.removeEventListener(GESTURE_EVENT, onGesture);
      stage.off(".styleBar");
      transformers.forEach((t) => t.off(".styleBar"));
      setBusy(false);
    };
  }, [active]);
  return busy;
}

// --- bar --------------------------------------------------------------------

export default function ShapeStyleBar() {
  const ids = useKonvaSelection((s) => s.nodeIds);
  const nodes = useKonvaNodes((s) => s.nodes);
  const pointer = useToolStore((s) => s.activeTool === "pointer");
  const framesSelected = useFrames((s) => s.selectedIds.length > 0);
  const panelsSelected = useNodePanel((s) => s.panels.some((p) => p.isActive));
  const { x, y, scale } = useViewport();
  const [card, setCard] = useState<Card | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const records = ids.map((id) => nodes[id]).filter((r): r is KonvaNodeRecord => !!r);
  const shown =
    pointer && !framesSelected && !panelsSelected &&
    records.length > 0 && records.length === ids.length &&
    records.every((r) => r.style);
  const busy = useGesture(shown);

  // A new selection starts with every card closed.
  const key = ids.join();
  useEffect(() => setCard(null), [key]);

  // Closing a card: Esc, or a click anywhere outside the bar. Esc is caught
  // before Board's, which would otherwise drop the selection along with it.
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setCard(null);
    };
    const onDown = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setCard(null);
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown);
    };
  }, [card]);

  if (!shown || busy) return null;

  const styles = records.map((r) => r.style!);
  const lines = records.filter((r) => r.shape && isLineKind(r.shape)).length;
  // Fill only when nothing selected is a line; "No stroke" likewise.
  const hasFill = lines === 0;
  const strokeModes = hasFill ? STROKE_MODES : STROKE_MODES.filter((m) => m !== "none");
  const color = common(styles, "color");
  const fill = common(styles, "fill");
  const stroke = common(styles, "stroke");
  const width = common(styles, "width");
  // undefined: the shapes differ. null: the default grey, which on a line is
  // its stroke.
  const dotHex =
    color === undefined ? undefined
    : color ?? (lines === records.length ? SHAPE_STYLE.stroke : SHAPE_STYLE.fill);

  // The selection's box on screen.
  const vp = { x, y, scale };
  const left = Math.min(...records.map((r) => r.canvasX));
  const top = Math.min(...records.map((r) => r.canvasY));
  const right = Math.max(...records.map((r) => r.canvasX + r.canvasW));
  const bottom = Math.max(...records.map((r) => r.canvasY + r.canvasH));
  const a = toScreen({ x: left, y: top }, vp);
  const b = toScreen({ x: right, y: bottom }, vp);
  const above = a.y - GAP - BAR_HEIGHT;
  const below = above < MIN_TOP;

  const toggle = (c: Card) => setCard((open) => (open === c ? null : c));
  const btn = (c: Card) =>
    ["shape-style-button", card === c ? "shape-style-button-open" : ""].join(" ");

  return (
    <div
      ref={barRef}
      data-testid="shape-style-bar"
      data-placement={below ? "below" : "above"}
      className={["shape-style-bar", below ? "shape-style-bar-below" : ""].join(" ")}
      style={{ left: (a.x + b.x) / 2, top: below ? b.y + GAP : above, zIndex: Z_INDEX.styleBar }}
      // The board must not take a press on the bar as a click on empty board.
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="shape-style-wrapper">
        <button
          type="button" aria-label="Shape color" aria-expanded={card === "color"}
          onClick={() => toggle("color")} className={btn("color")}
        >
          <ColorDot hex={dotHex} />
        </button>
        {card !== "color" && <span className="shape-style-tooltip">Color</span>}
        {card === "color" && (
          <div className="shape-style-card shape-style-color-card" role="group" aria-label="Shape colors">
            {PALETTE.map((s) => (
              <button
                key={s.hex} type="button" title={s.name} aria-label={s.name}
                aria-pressed={s.hex === color}
                onClick={() => { pickColor(s.hex); setCard(null); }}
                className={["shape-style-swatch", s.hex === color ? "shape-style-swatch-current" : ""].join(" ")}
                style={{ backgroundColor: s.hex }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="shape-style-divider" />

      {hasFill && <div className="shape-style-wrapper">
        <button
          type="button" aria-label="Shape fill" aria-expanded={card === "fill"}
          onClick={() => toggle("fill")} className={btn("fill")}
        >
          <FillIcon mode={fill} />
        </button>
        {card !== "fill" && <span className="shape-style-tooltip">Fill</span>}
        {card === "fill" && (
          <div className="shape-style-card shape-style-row" role="group" aria-label="Fill options">
            {FILL_MODES.map((m) => (
              <button
                key={m} type="button" title={FILL_LABEL[m]} aria-label={FILL_LABEL[m]}
                aria-pressed={m === fill}
                onClick={() => { restyle(ids, { fill: m }); setCard(null); }}
                className={["shape-style-option", m === fill ? "shape-style-option-current" : ""].join(" ")}
              >
                <FillIcon mode={m} />
              </button>
            ))}
          </div>
        )}
      </div>}

      <div className="shape-style-wrapper">
        <button
          type="button" aria-label="Shape stroke" aria-expanded={card === "stroke"}
          onClick={() => toggle("stroke")} className={btn("stroke")}
        >
          <StrokeIcon mode={stroke} width={width === undefined ? 2 : Math.min(width, 3)} />
        </button>
        {card !== "stroke" && <span className="shape-style-tooltip">Stroke</span>}
        {card === "stroke" && (
          <div className="shape-style-card shape-style-row" role="group" aria-label="Stroke options">
            {strokeModes.map((m) => (
              <button
                key={m} type="button" title={STROKE_LABEL[m]} aria-label={STROKE_LABEL[m]}
                aria-pressed={m === stroke}
                onClick={() => { restyle(ids, { stroke: m }); setCard(null); }}
                className={["shape-style-option", m === stroke ? "shape-style-option-current" : ""].join(" ")}
              >
                <StrokeIcon mode={m} />
              </button>
            ))}
            <div className="shape-style-divider" />
            {STROKE_WIDTHS.map((w) => (
              <button
                key={w} type="button" title={`Width ${w}`} aria-label={`Stroke width ${w}`}
                aria-pressed={w === width}
                onClick={() => { restyle(ids, { width: w }); setCard(null); }}
                className={["shape-style-option", w === width ? "shape-style-option-current" : ""].join(" ")}
              >
                <WidthIcon width={w} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
