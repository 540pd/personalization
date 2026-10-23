"use client";

// The bar above a selected shape: its Color, Fill and Stroke (#161).
//
// Frames get it too, with Color: a swatch is their outline (#163). One Frame
// alone also gets Auto layout, or Remove auto layout while it is on (#225),
// and Remove frame (#244).
// Text gets Color, whose colour is its letters (#164), and its Size, Bold,
// Italic and Align (#165). A selection mixing kinds gets Color only: it is
// what they all share.
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

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bold, Italic, TextAlignCenter, TextAlignEnd, TextAlignStart } from "lucide-react";
import type Konva from "konva";
import { useKonvaNodes, type KonvaNodeRecord } from "@/store/konvaNodes.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useViewport } from "@/store/viewport.store";
import { useToolStore } from "@/store/tool.store";
import { useFrames } from "@/store/frame.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { boardStage } from "@/lib/canvas/boardStage";
import { toScreen } from "@/lib/canvas/coords";
import { barMeetsNames, frameNameBox, nameTextWidth, type ScreenBox } from "@/lib/canvas/styleBarPlacement";
import { canvasHistory } from "@/lib/canvas/history";
import { GESTURE_EVENT, type GestureDetail } from "@/lib/canvas/gesture";
import {
  COLORS, LABEL_GAP, LABEL_LINE_HEIGHT, SHAPE_STYLE, TEXT_STYLE, Z_INDEX,
} from "@/constants/canvas.constants";
import { COLOR_EVENT, PALETTE, type ColorDetail } from "../../board/palette";
import {
  FILL_MODES, STROKE_MODES, STROKE_WIDTHS,
  type FillMode, type ShapeStyle, type StrokeMode,
} from "../../board/shapeStyle";
import { applyShapeStyle } from "../../board/recolor";
import { isLineKind } from "../../board/shapes";
import {
  applyTextFormat, TEXT_ALIGNS, TEXT_SIZES, type TextAlign, type TextFormat, type TextStyle,
} from "../../board/text";
import { syncNodeGeometry } from "../../board/geometry";
import { applyAutoLayout, canAutoLayout, removeAutoLayout } from "../../board/autoLayout";
import { canFrame, createFrameFromSelection, removeSelectedFrame, selectedBoxes } from "../../board/frameSelection";
import { boundsOf } from "@/lib/canvas/bounds";
import "./ShapeStyleBar.scss";

const BAR_HEIGHT = 44; // screen px, matches .shape-style-bar
const GAP = 14; // screen px between the selection box and the bar, clear of the corner handles
const MIN_TOP = 8; // screen px the bar keeps from the top of the window
// A Frame's name sits above its top-left corner. Where the bar would sit on
// a selected Frame's name, it goes above that row instead (#223).
const FRAME_NAME_CLEARANCE = LABEL_GAP + LABEL_LINE_HEIGHT;

type Card = "color" | "fill" | "stroke" | "size" | "align";

const ALIGN_LABEL: Record<TextAlign, string> = {
  left: "Align left",
  center: "Align center",
  right: "Align right",
};

const AlignIcon = ({ align }: { align: TextAlign | undefined }) =>
  align === "center" ? <TextAlignCenter size={18} aria-hidden />
  : align === "right" ? <TextAlignEnd size={18} aria-hidden />
  : <TextAlignStart size={18} aria-hidden opacity={align ? 1 : 0.5} />;

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

// Create frame (#243): Luma's corners, a Frame to come around the selection.
const CreateFrameIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
    <path d="M2.5 6V2.5H6M12 2.5h3.5V6M15.5 12v3.5H12M6 15.5H2.5V12" />
  </svg>
);

// Remove frame (#244): the same corners, crossed out.
const RemoveFrameIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
    <path d="M2.5 6V2.5H6M12 2.5h3.5V6M15.5 12v3.5H12M6 15.5H2.5V12" />
    <path d="M6.5 6.5l5 5M11.5 6.5l-5 5" />
  </svg>
);

// Auto layout's icon shows what a click will do, as Luma's does: tidy tiles
// to lay them out, loose tiles to stop (#225).
const LayoutIcon = ({ on }: { on: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <rect x="2" y="4" width="20" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    {on ? <>
      <rect x="5" y="6.5" width="5" height="4" rx="1" fill="currentColor" />
      <rect x="12.5" y="8" width="5" height="4" rx="1" fill="currentColor" />
      <rect x="6.5" y="13" width="5" height="4" rx="1" fill="currentColor" />
      <rect x="14" y="13.5" width="5" height="4" rx="1" fill="currentColor" />
    </> : <>
      <rect x="5" y="7" width="6" height="4" rx="1" fill="currentColor" />
      <rect x="13" y="7" width="6" height="4" rx="1" fill="currentColor" />
      <rect x="5" y="13" width="6" height="4" rx="1" fill="currentColor" />
      <rect x="13" y="13" width="6" height="4" rx="1" fill="currentColor" />
    </>}
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
  if (!styles.length) return undefined;
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

/** One undo step for a text Size, Bold, Italic or Align pick (#165). */
function reformat(ids: string[], patch: Partial<TextFormat>) {
  const nodes = selectedNodes(ids);
  if (!applyTextFormat(nodes, patch)) return;
  nodes.forEach((n) => syncNodeGeometry(n as Konva.Shape));
  // A new size is a new box: let the selection border follow.
  boardStage.current?.find<Konva.Transformer>("Transformer").forEach((t) => t.forceUpdate());
  nodes[0]?.getLayer()?.batchDraw();
  canvasHistory.commit();
}

/** The value every text shares, or undefined when they differ. */
function commonText<K extends keyof TextStyle>(styles: TextStyle[], key: K): TextStyle[K] | undefined {
  const first = styles[0]?.[key];
  return styles.every((s) => s[key] === first) ? first : undefined;
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
  const frameIds = useFrames((s) => s.selectedIds);
  const frames = useFrames((s) => s.frames);
  // A Frame dragged by its body or its name: the live offset is in the store.
  const frameDragging = useFrames((s) => Object.keys(s.drag).length > 0);
  const panels = useNodePanel((s) => s.panels);
  const panelsSelected = panels.some((p) => p.isActive);
  const { x, y, scale } = useViewport();
  const [card, setCard] = useState<Card | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // The bar's width, to tell whether it meets a Frame's name. Measured after
  // each render and before paint, so a new width never shows misplaced.
  const [barW, setBarW] = useState(0);
  useLayoutEffect(() => {
    const w = barRef.current?.offsetWidth ?? 0;
    if (w !== barW) setBarW(w);
  });

  const records = ids.map((id) => nodes[id]).filter((r): r is KonvaNodeRecord => !!r);
  const frameRecs = frameIds.map((id) => frames[id]).filter((f) => !!f);
  // Color, Fill, Stroke and the rest: only for shapes, text and Frames.
  const styleable =
    !panelsSelected &&
    records.length + frameRecs.length > 0 && records.length === ids.length &&
    records.every((r) => r.style || r.textStyle);
  // Create frame (#243): two or more of anything but Frames. Images and
  // generated nodes get a bar for it alone. Recomputed with the stores above.
  const selected = pointer ? selectedBoxes() : [];
  const framable = canFrame(selected, Object.values(frames), frameRecs.length);
  const shown = pointer && (styleable || framable);
  const busy = useGesture(shown);

  // A new selection starts with every card closed.
  const key = `${ids.join()}|${frameIds.join()}`;
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

  if (!shown || busy || frameDragging) return null;

  const styles = records.flatMap((r) => (r.style ? [r.style] : []));
  const texts = records.filter((r) => r.textStyle);
  const lines = records.filter((r) => r.shape && isLineKind(r.shape)).length;
  // Only text: Color and the text controls. Text with anything else, or a
  // Frame: Color only.
  const textOnly = texts.length > 0 && texts.length === records.length && !frameRecs.length;
  const colorOnly = frameRecs.length > 0 || texts.length > 0;
  const textStyles = texts.map((r) => r.textStyle!);
  const size = commonText(textStyles, "size");
  const bold = textStyles.every((t) => t.bold);
  const italic = textStyles.every((t) => t.italic);
  const align = commonText(textStyles, "align");
  // Fill only when nothing selected is a line; "No stroke" likewise.
  const hasFill = !colorOnly && lines === 0;
  const strokeModes = hasFill ? STROKE_MODES : STROKE_MODES.filter((m) => m !== "none");
  // A Frame's colour is its outline; unset is the default outline.
  const colors = [
    ...styles.map((s) => s.color),
    ...texts.map((r) => r.textStyle!.color),
    ...frameRecs.map((f) => f.stroke ?? null),
  ];
  const color = colors.every((c) => c === colors[0]) ? colors[0] : undefined;
  const fill = colorOnly ? undefined : common(styles, "fill");
  const stroke = colorOnly ? undefined : common(styles, "stroke");
  const width = colorOnly ? undefined : common(styles, "width");
  // undefined: they differ. null: the default, which on a line is its
  // stroke, on a Frame its outline and on text its letters.
  const only = (n: number) => n > 0 && n === records.length + frameRecs.length;
  const dotHex =
    color === undefined ? undefined
    : color ?? (
      only(frameRecs.length) ? COLORS.frameStroke
      : only(texts.length) ? TEXT_STYLE.fill
      : only(lines) ? SHAPE_STYLE.stroke
      : SHAPE_STYLE.fill
    );

  // One Frame alone: Auto layout and Remove frame. Disabled on an empty one, with nothing to
  // lay out; subscribed to `nodes` and `panels`, so one moved in enables it.
  const layoutFrame = !records.length && frameRecs.length === 1 ? frameRecs[0] : null;
  const layoutable = !!layoutFrame && canAutoLayout(layoutFrame);
  const layoutLabel = layoutFrame?.layout ? "Remove auto layout" : "Auto layout";

  // The selection's box on screen, Frames included.
  const vp = { x, y, scale };
  const panelBoxes = panels.filter((p) => p.isActive).map((p) => {
    const b = boundsOf(p);
    return { canvasX: b.x, canvasY: b.y, canvasW: b.w, canvasH: b.h };
  });
  const boxes = [...records, ...frameRecs, ...panelBoxes];
  const left = Math.min(...boxes.map((r) => r.canvasX));
  const top = Math.min(...boxes.map((r) => r.canvasY));
  const right = Math.max(...boxes.map((r) => r.canvasX + r.canvasW));
  const bottom = Math.max(...boxes.map((r) => r.canvasY + r.canvasH));
  const a = toScreen({ x: left, y: top }, vp);
  const b = toScreen({ x: right, y: bottom }, vp);
  const centre = (a.x + b.x) / 2;
  const bar: ScreenBox = {
    left: centre - barW / 2, right: centre + barW / 2,
    top: a.y - GAP - BAR_HEIGHT, bottom: a.y - GAP,
  };
  // Names above: a selected Frame's, and an image's or generated node's (#243).
  const itemNames = [
    ...records.flatMap((r) => (r.label ? [{ box: r, label: r.label }] : [])),
    ...panels.filter((p) => p.isActive && p.label).map((p) => {
      const b = boundsOf(p);
      return { box: { canvasX: b.x, canvasY: b.y, canvasW: b.w }, label: p.label! };
    }),
  ];
  const names = [
    ...frameRecs.map((f) => frameNameBox(f, vp, nameTextWidth(f.label))),
    ...itemNames.map((n) => frameNameBox(n.box, vp, nameTextWidth(n.label))),
  ].filter((n): n is ScreenBox => !!n);
  const lift = barMeetsNames(bar, names) ? FRAME_NAME_CLEARANCE : 0;
  const above = bar.top - lift;
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
      style={{ left: centre, top: below ? b.y + GAP : above, zIndex: Z_INDEX.styleBar }}
      // The board must not take a press on the bar as a click on empty board.
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {styleable && <>
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

      {layoutFrame && <>
        <div className="shape-style-divider" />
        <div className="shape-style-wrapper">
          <button
            type="button" aria-label={layoutLabel} disabled={!layoutable}
            onClick={() => {
              setCard(null);
              if (layoutFrame.layout) removeAutoLayout(layoutFrame.id);
              else applyAutoLayout(layoutFrame.id);
            }}
            className="shape-style-button"
          >
            <LayoutIcon on={!!layoutFrame.layout} />
          </button>
          <span className="shape-style-tooltip">
            {layoutable ? layoutLabel : "Add something to the frame first"}
          </span>
        </div>
        <div className="shape-style-divider" />
        <div className="shape-style-wrapper">
          <button
            type="button" aria-label="Remove frame"
            onClick={() => { setCard(null); removeSelectedFrame(); }}
            className="shape-style-button"
          >
            <RemoveFrameIcon />
          </button>
          <span className="shape-style-tooltip">
            Remove frame <kbd className="shape-style-kbd">⇧F</kbd>
          </span>
        </div>
      </>}

      {!colorOnly && <div className="shape-style-divider" />}

      {textOnly && <>
        <div className="shape-style-divider" />
        <div className="shape-style-wrapper">
          <button
            type="button" aria-label="Text size" aria-expanded={card === "size"}
            onClick={() => toggle("size")} className={`${btn("size")} shape-style-size`}
          >
            {size === undefined ? "–" : Math.round(size)}
          </button>
          {card !== "size" && <span className="shape-style-tooltip">Size</span>}
          {card === "size" && (
            <div className="shape-style-card shape-style-row" role="group" aria-label="Size options">
              {TEXT_SIZES.map((p) => (
                <button
                  key={p.label} type="button" title={`${p.label} ${p.size}`} aria-label={`Size ${p.label}`}
                  aria-pressed={p.size === size}
                  onClick={() => { reformat(ids, { size: p.size }); setCard(null); }}
                  className={["shape-style-option shape-style-size", p.size === size ? "shape-style-option-current" : ""].join(" ")}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="shape-style-wrapper">
          <button
            type="button" aria-label="Bold" aria-pressed={bold}
            onClick={() => { setCard(null); reformat(ids, { bold: !bold }); }}
            className={["shape-style-button", bold ? "shape-style-button-on" : ""].join(" ")}
          >
            <Bold size={18} aria-hidden />
          </button>
          <span className="shape-style-tooltip">Bold</span>
        </div>
        <div className="shape-style-wrapper">
          <button
            type="button" aria-label="Italic" aria-pressed={italic}
            onClick={() => { setCard(null); reformat(ids, { italic: !italic }); }}
            className={["shape-style-button", italic ? "shape-style-button-on" : ""].join(" ")}
          >
            <Italic size={18} aria-hidden />
          </button>
          <span className="shape-style-tooltip">Italic</span>
        </div>
        <div className="shape-style-wrapper">
          <button
            type="button" aria-label="Text align" aria-expanded={card === "align"}
            onClick={() => toggle("align")} className={btn("align")}
          >
            <AlignIcon align={align} />
          </button>
          {card !== "align" && <span className="shape-style-tooltip">Align</span>}
          {card === "align" && (
            <div className="shape-style-card shape-style-row" role="group" aria-label="Align options">
              {TEXT_ALIGNS.map((a) => (
                <button
                  key={a} type="button" title={ALIGN_LABEL[a]} aria-label={ALIGN_LABEL[a]}
                  aria-pressed={a === align}
                  onClick={() => { reformat(ids, { align: a }); setCard(null); }}
                  className={["shape-style-option", a === align ? "shape-style-option-current" : ""].join(" ")}
                >
                  <AlignIcon align={a} />
                </button>
              ))}
            </div>
          )}
        </div>
      </>}

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

      {!colorOnly && <div className="shape-style-wrapper">
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
      </div>}
      </>}

      {framable && <>
        {styleable && <div className="shape-style-divider" />}
        <div className="shape-style-wrapper">
          <button
            type="button" aria-label="Create frame"
            onClick={() => { setCard(null); createFrameFromSelection(); }}
            className="shape-style-button"
          >
            <CreateFrameIcon />
          </button>
          <span className="shape-style-tooltip">
            Create frame <kbd className="shape-style-kbd">F</kbd>
          </span>
        </div>
      </>}
    </div>
  );
}
