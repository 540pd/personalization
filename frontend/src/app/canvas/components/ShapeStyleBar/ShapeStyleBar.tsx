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
import { Bold, Italic } from "lucide-react";
import type Konva from "konva";
import { useKonvaNodes, type KonvaNodeRecord } from "@/store/konvaNodes.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useViewport } from "@/store/viewport.store";
import { useToolStore } from "@/store/tool.store";
import { useFrames } from "@/store/frame.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { boardStage } from "@/lib/canvas/boardStage";
import { barPlacement, nameTextWidth } from "@/lib/canvas/styleBarPlacement";
import { canvasHistory } from "@/lib/canvas/history";
import { gestureEvent } from "@/lib/canvas/gesture";
import { useDismiss } from "@/lib/dom/useDismiss";
import { boundsOf } from "@/lib/canvas/bounds";
import { Z_INDEX } from "@/constants/canvas.constants";
import { pickColor } from "../../board/palette";
import {
  FILL_MODES, STROKE_WIDTHS, type FillMode, type ShapeStyle, type StrokeMode,
} from "../../board/shapeStyle";
import { applyShapeStyle } from "../../board/recolor";
import { applyTextFormat, TEXT_ALIGNS, TEXT_SIZES, type TextAlign, type TextFormat } from "../../board/text";
import { syncNodeGeometry } from "../../board/geometry";
import { applyAutoLayout, canAutoLayout, removeAutoLayout } from "../../board/autoLayout";
import { canFrame, createFrameFromSelection, removeSelectedFrame, selectedBoxes } from "../../board/frameSelection";
import SwatchGrid from "../SwatchGrid";
import { barModel } from "./barModel";
import { BarButton, BarMenu, OptionCard } from "./BarControls";
import {
  AlignIcon, ColorDot, CreateFrameIcon, FillIcon, LayoutIcon, RemoveFrameIcon, StrokeIcon, WidthIcon,
} from "./icons";
import "./ShapeStyleBar.scss";

type Card = "color" | "fill" | "stroke" | "size" | "align";

const ALIGN_LABEL: Record<TextAlign, string> = {
  left: "Align left",
  center: "Align center",
  right: "Align right",
};

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

// --- selection --------------------------------------------------------------

/** The selected Konva nodes, looked up on the board stage. */
function selectedNodes(ids: string[]): Konva.Node[] {
  const stage = boardStage.current;
  if (!stage) return [];
  return ids.map((id) => stage.findOne(`#${id}`)).filter((n): n is Konva.Node => !!n);
}

/**
 * One undo step for a pick across the whole selection: a shape's Fill or
 * Stroke (applyShapeStyle), or a text's Size, Bold, Italic or Align
 * (applyTextFormat, #165).
 */
function applyToSelection<P>(ids: string[], apply: (nodes: Konva.Node[], patch: P) => boolean, patch: P) {
  const nodes = selectedNodes(ids);
  if (!apply(nodes, patch)) return;
  nodes.forEach((n) => syncNodeGeometry(n as Konva.Shape));
  // A thicker stroke or a new text size is a new box: let the selection
  // border follow.
  boardStage.current?.find<Konva.Transformer>("Transformer").forEach((t) => t.forceUpdate());
  nodes[0]?.getLayer()?.batchDraw();
  canvasHistory.commit();
}

const restyle = (ids: string[], patch: Partial<ShapeStyle>) => applyToSelection(ids, applyShapeStyle, patch);
const reformat = (ids: string[], patch: Partial<TextFormat>) => applyToSelection(ids, applyTextFormat, patch);

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
    const stopGesture = gestureEvent.on(({ active }) => setBusy(active));
    return () => {
      stopGesture();
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
  const m = barModel({ records, selected: ids.length, frames: frameRecs, panelsSelected });
  const { styleable } = m;
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
  useDismiss(!!card, [barRef], () => setCard(null), { escape: "claim" });

  if (!shown || busy || frameDragging) return null;

  // Disabled on an empty Frame, with nothing to lay out; subscribed to
  // `nodes` and `panels`, so one moved in enables it.
  const { layoutFrame } = m;
  const layoutable = !!layoutFrame && canAutoLayout(layoutFrame);
  const layoutLabel = layoutFrame?.layout ? "Remove auto layout" : "Auto layout";

  // The selection's box on screen, Frames included.
  const activePanels = panels.filter((p) => p.isActive).map((p) => {
    const b = boundsOf(p);
    return { canvasX: b.x, canvasY: b.y, canvasW: b.w, canvasH: b.h, label: p.label };
  });
  const { centre, top, below } = barPlacement({
    items: [...records, ...activePanels], frames: frameRecs,
    vp: { x, y, scale }, barW, measure: nameTextWidth,
  });

  const toggle = (c: Card) => () => setCard((open) => (open === c ? null : c));
  // Every pick closes whichever card is open.
  const pick = (fn: () => void) => () => { setCard(null); fn(); };

  return (
    <div
      ref={barRef}
      data-testid="shape-style-bar"
      data-placement={below ? "below" : "above"}
      className={["shape-style-bar", below ? "shape-style-bar-below" : ""].join(" ")}
      style={{ left: centre, top, zIndex: Z_INDEX.styleBar }}
      // The board must not take a press on the bar as a click on empty board.
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {styleable && <>
      <BarMenu
        label="Shape color" tooltip="Color" open={card === "color"} onToggle={toggle("color")}
        cardClassName="shape-style-color-card" cardLabel="Shape colors" icon={<ColorDot hex={m.dotHex} />}
      >
        <SwatchGrid classPrefix="shape-style" current={m.color} onPick={(hex) => { pickColor(hex); setCard(null); }} />
      </BarMenu>

      {layoutFrame && <>
        <div className="shape-style-divider" />
        <BarButton
          label={layoutLabel} disabled={!layoutable}
          tooltip={layoutable ? layoutLabel : "Add something to the frame first"}
          onClick={pick(() => {
            if (layoutFrame.layout) removeAutoLayout(layoutFrame.id);
            else applyAutoLayout(layoutFrame.id);
          })}
        >
          <LayoutIcon on={!!layoutFrame.layout} />
        </BarButton>
        <div className="shape-style-divider" />
        <BarButton label="Remove frame" kbd="⇧F" onClick={pick(removeSelectedFrame)}>
          <RemoveFrameIcon />
        </BarButton>
      </>}

      {!m.colorOnly && <div className="shape-style-divider" />}

      {m.textOnly && <>
        <div className="shape-style-divider" />
        <BarMenu
          label="Text size" tooltip="Size" open={card === "size"} onToggle={toggle("size")}
          className="shape-style-size" cardLabel="Size options"
          icon={m.size === undefined ? "–" : Math.round(m.size)}
        >
          <OptionCard
            options={TEXT_SIZES} isCurrent={(p) => p.size === m.size} className="shape-style-size"
            name={(p) => `Size ${p.label}`} title={(p) => `${p.label} ${p.size}`}
            onPick={(p) => { reformat(ids, { size: p.size }); setCard(null); }}
          >
            {(p) => p.label}
          </OptionCard>
        </BarMenu>
        <BarButton label="Bold" pressed={m.bold} onClick={pick(() => reformat(ids, { bold: !m.bold }))}>
          <Bold size={18} aria-hidden />
        </BarButton>
        <BarButton label="Italic" pressed={m.italic} onClick={pick(() => reformat(ids, { italic: !m.italic }))}>
          <Italic size={18} aria-hidden />
        </BarButton>
        <BarMenu
          label="Text align" tooltip="Align" open={card === "align"} onToggle={toggle("align")}
          cardLabel="Align options" icon={<AlignIcon align={m.align} />}
        >
          <OptionCard
            options={TEXT_ALIGNS} isCurrent={(a) => a === m.align} name={(a) => ALIGN_LABEL[a]}
            onPick={(a) => { reformat(ids, { align: a }); setCard(null); }}
          >
            {(a) => <AlignIcon align={a} />}
          </OptionCard>
        </BarMenu>
      </>}

      {m.hasFill && (
        <BarMenu
          label="Shape fill" tooltip="Fill" open={card === "fill"} onToggle={toggle("fill")}
          cardLabel="Fill options" icon={<FillIcon mode={m.fill} />}
        >
          <OptionCard
            options={FILL_MODES} isCurrent={(f) => f === m.fill} name={(f) => FILL_LABEL[f]}
            onPick={(f) => { restyle(ids, { fill: f }); setCard(null); }}
          >
            {(f) => <FillIcon mode={f} />}
          </OptionCard>
        </BarMenu>
      )}

      {!m.colorOnly && (
        <BarMenu
          label="Shape stroke" tooltip="Stroke" open={card === "stroke"} onToggle={toggle("stroke")}
          cardLabel="Stroke options"
          icon={<StrokeIcon mode={m.stroke} width={m.width === undefined ? 2 : Math.min(m.width, 3)} />}
        >
          <OptionCard
            options={m.strokeModes} isCurrent={(s) => s === m.stroke} name={(s) => STROKE_LABEL[s]}
            onPick={(s) => { restyle(ids, { stroke: s }); setCard(null); }}
          >
            {(s) => <StrokeIcon mode={s} />}
          </OptionCard>
          <div className="shape-style-divider" />
          <OptionCard
            options={STROKE_WIDTHS} isCurrent={(w) => w === m.width}
            name={(w) => `Stroke width ${w}`} title={(w) => `Width ${w}`}
            onPick={(w) => { restyle(ids, { width: w }); setCard(null); }}
          >
            {(w) => <WidthIcon width={w} />}
          </OptionCard>
        </BarMenu>
      )}
      </>}

      {framable && <>
        {styleable && <div className="shape-style-divider" />}
        <BarButton label="Create frame" kbd="F" onClick={pick(createFrameFromSelection)}>
          <CreateFrameIcon />
        </BarButton>
      </>}
    </div>
  );
}
