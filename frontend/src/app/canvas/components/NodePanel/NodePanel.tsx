"use client";

// Luma reference: IMG-02/03 — Create Image panel.
// Each Node → Image click creates an independent placeholder + panel instance.
// Instances are stored in the nodePanelStore array and rendered here.

import { useState, useRef, useEffect } from "react";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useViewport } from "@/store/viewport.store";
import type { Reference } from "@/types/canvas.types";
import { useConnectionStore } from "@/store/connection.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import {
  COLORS,
  INPUT_PORT_STYLE,
  LABEL_GAP,
  LABEL_MIN_NODE_W,
  MIN_NODE_SIZE,
  NODE_CORNER_RADIUS,
  OUTPUT_PORT_HIT_STYLE,
  OUTPUT_PORT_STYLE,
  PORT_FRACTION,
  PORT_HIT_PAD,
  PORT_WIDTH,
  SELECTION,
  Z_INDEX,
} from "@/constants/canvas.constants";
import NodeLabel from "../NodeLabel";
import GenerateForm, { type GenerateDraft } from "./GenerateForm";
import { kindSpec } from "./kinds";
import type { NodeSettings } from "./nodeKinds";
import "./NodePanel.scss";

const PANEL_W    = 320;
// A generated node needs a name before it can be referenced by a downstream
// one, so derive a readable default from the instruction. Natural words rather
// than a slug: this string is also what a downstream generation refers to it
// by, and "Image 3" would be useless as context.
function labelFromInstruction(instruction: string): string {
  const words = instruction.trim().split(/\s+/).slice(0, 6).join(" ");
  return words.length > 40 ? `${words.slice(0, 40).trimEnd()}…` : words;
}

// Prompts usually open with boilerplate ("a highly detailed photorealistic
// image of a …"), so first-N-words collides often. Two nodes sharing a name is
// merely confusing on screen but genuinely ambiguous as model context.
function uniqueLabel(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

const GAP        = 12;
// Keep the panel this far clear of the window edge when it has to flip or clamp.
const VIEWPORT_MARGIN = 12;
// Corner anchor positions + resize cursor. idx: 0=TL, 1=TR, 2=BL, 3=BR.
const ANCHORS = [
  { left: 0,      top: 0,      cursor: "nw-resize" },
  { left: "100%", top: 0,      cursor: "ne-resize" },
  { left: 0,      top: "100%", cursor: "sw-resize" },
  { left: "100%", top: "100%", cursor: "se-resize" },
] as const;

// ── Per-instance component ────────────────────────────────────────────────────

// A port drawn over a node that covers it reads as belonging to that node, so
// hide it -- the same rule KonvaNodePorts applies to uploaded images. Panels
// all render at one z-index, so array order is paint order: only a panel LATER
// in the array can cover this one. Each port is tested on its own, since a
// neighbour overlapping the left edge should not blank the output port too.
// Ports sit at PORT_FRACTION down the placeholder, whose canvasY is its
// vertical CENTRE. The half-disc bulges inward, so its centre is just inside
// the node's own edge.
function portsCovered(
  p: PanelInstance,
  above: PanelInstance[],
  scale: number
): { input: boolean; output: boolean } {
  const inset = PORT_WIDTH / (2 * scale);
  const py = p.canvasY - p.h / 2 + p.h * PORT_FRACTION;
  const hits = (px: number) =>
    above.some(
      (q) =>
        px >= q.canvasX &&
        px <= q.canvasX + q.w &&
        py >= q.canvasY - q.h / 2 &&
        py <= q.canvasY + q.h / 2
    );
  return { input: hits(p.canvasX + inset), output: hits(p.canvasX + p.w - inset) };
}

interface SinglePanelProps {
  instance:       PanelInstance;
  stageX:         number;
  stageY:         number;
  scale:          number;
  onActivate:     () => void; // inactive → active
  onOpenPanel:    () => void; // active → panel-open
  onClosePanel:   () => void; // panel-open → active (X button)
  onRemove:       () => void;
  onSetCanvasPos: (x: number, y: number) => void;
  hideInputPort:  boolean;
  hideOutputPort: boolean;
}

function SinglePanel({
  instance, stageX, stageY, scale,
  onActivate, onOpenPanel, onClosePanel, onRemove, onSetCanvasPos,
  hideInputPort, hideOutputPort,
}: SinglePanelProps) {
  const { canvasX, canvasY, isActive, isPanelOpen } = instance;

  // The kind's spec is the only thing that differs between node types.
  const spec = kindSpec(instance.kind);
  // Settings live here rather than in the form: they decide the node's
  // footprint via spec.sizeFor, which is a parent concern.
  const [settings, setSettings] = useState<NodeSettings>(spec.defaultSettings);
  // Draft and in-flight state live here, not in GenerateForm: the form
  // unmounts whenever the panel collapses, and a half-written prompt must
  // survive that.
  const [draft, setDraft] = useState<GenerateDraft>({
    model: spec.models[0]?.id ?? "",
    instruction: "",
  });
  const [busy, setBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [dragging,    setDragging]    = useState(false);
  const [hovered,     setHovered]     = useState(false);

  const isDragging = useRef(false);
  const dragStart  = useRef({ px: 0, py: 0, cx: 0, cy: 0 });
  const anchorDrag = useRef<{
    idx: number; startPx: number; startPy: number;
    startW: number; startH: number; startCx: number; startCy: number;
  } | null>(null);

  const [sizeW, setSizeW] = useState(() => spec.sizeFor(spec.defaultSettings).w);
  const [sizeH, setSizeH] = useState(() => spec.sizeFor(spec.defaultSettings).h);

  // Reset to the kind's default footprint when a setting that drives size
  // changes. Compared by value so an unrelated setting (temperature) does not
  // discard a manual resize.
  const prevSize = useRef(spec.sizeFor(spec.defaultSettings));
  useEffect(() => {
    const next = spec.sizeFor(settings);
    if (next.w === prevSize.current.w && next.h === prevSize.current.h) return;
    prevSize.current = next;
    setSizeW(next.w);
    setSizeH(next.h);
  }, [settings, spec]);

  // The panel is placed relative to the node, so it has to know how much room
  // is left on screen. Same pattern as Minimap.
  const [viewW, setViewW] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerWidth
  );
  useEffect(() => {
    const update = () => setViewW(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Sync rendered size to nodePanelStore so ConnectionOverlay can compute port positions.
  useEffect(() => {
    useNodePanel.getState().setSize(instance.id, sizeW, sizeH);
  }, [instance.id, sizeW, sizeH]);

  // pw/ph are canvas units; sw/sh are their on-screen size at the current zoom.
  // Node geometry uses sw/sh; chrome (ports, anchors, panel) keeps a fixed pixel size.
  const pw = sizeW;
  const ph = sizeH;
  const sw = pw * scale;
  const sh = ph * scale;

  const screenLeft    = stageX + canvasX * scale;
  const screenCenterY = stageY + canvasY * scale;
  const placeholderLeft = screenLeft;
  const placeholderTop  = screenCenterY - sh / 2;
  // Prefer the node's right, but fall back to its left when the panel would
  // run off the viewport -- creating a node near the right edge used to push
  // the panel hundreds of px out of view. If neither side fits (very narrow
  // window) keep it on the right and clamp, so it stays reachable.
  const rightLeft = screenLeft + sw + GAP;
  const leftLeft  = screenLeft - GAP - PANEL_W;
  const panelLeft =
    rightLeft + PANEL_W <= viewW - VIEWPORT_MARGIN
      ? rightLeft
      : leftLeft >= VIEWPORT_MARGIN
        ? leftLeft
        : Math.max(VIEWPORT_MARGIN, viewW - PANEL_W - VIEWPORT_MARGIN);

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isDragging.current = false;
    dragStart.current = { px: e.clientX, py: e.clientY, cx: canvasX, cy: canvasY };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.buttons === 0 || isPanelOpen) return;
    const dx = e.clientX - dragStart.current.px;
    const dy = e.clientY - dragStart.current.py;
    if (Math.hypot(dx, dy) > 4) {
      if (!isDragging.current) {
        isDragging.current = true;
        setDragging(true);
        // A press-drag never reaches onPointerUp's selection branch, so
        // without this the dragged node is not selected and the previously
        // selected one never lets go — two nodes selected at once, with the
        // keyboard handlers aimed at the wrong one. Same hole #24 fixed for
        // uploaded images. activatePanel clears every other panel.
        if (!isActive) {
          onActivate();
          useKonvaSelection.getState().deselect();
          useConnectionStore.getState().deselectConnection();
        }
        // Outside the isActive guard: an already-selected node still has to
        // come forward, or dragging it across a newer one buries it.
        useNodePanel.getState().raisePanel(instance.id);
      }
      onSetCanvasPos(dragStart.current.cx + dx / scale, dragStart.current.cy + dy / scale);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!isDragging.current) {
      if (!(e.ctrlKey || e.metaKey)) {
        // Normal click: clear other selection types.
        useKonvaSelection.getState().deselect();
        useConnectionStore.getState().deselectConnection();
      }
      // Step through states: inactive → active → panel-open → active
      if (!isActive)              onActivate();
      else if (!isPanelOpen)      onOpenPanel();
      else                        onClosePanel();
    } else {
      // Completed a real drag — save position so Ctrl+Z can undo it.
      useNodePanel.getState().savePosSnapshot();
    }
    isDragging.current = false;
    setDragging(false);
  };

  const onAnchorPointerDown = (e: React.PointerEvent, idx: number) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    anchorDrag.current = {
      idx, startPx: e.clientX, startPy: e.clientY,
      startW: pw, startH: ph, startCx: canvasX, startCy: canvasY,
    };
  };

  const onAnchorPointerMove = (e: React.PointerEvent, idx: number) => {
    if (e.buttons === 0 || !anchorDrag.current || anchorDrag.current.idx !== idx) return;
    const { startPx, startW, startH, startCx, startCy } = anchorDrag.current;
    const mdx    = (e.clientX - startPx) / scale; // screen px → canvas units
    const isLeft = idx === 0 || idx === 2;
    const isTop  = idx === 0 || idx === 1;
    // Width is the driver; height follows to preserve aspect ratio.
    const newW   = Math.round(Math.max(MIN_NODE_SIZE, isLeft ? startW - mdx : startW + mdx));
    const newH   = Math.round(newW * (startH / startW));
    setSizeW(newW);
    setSizeH(newH);
    // Keep the opposite corner fixed — every term here is already canvas units.
    const newCx  = isLeft ? startCx + (startW - newW) : startCx;
    const newCy  = isTop
      ? startCy + (startH - newH) / 2   // bottom edge fixed
      : startCy + (newH - startH) / 2;  // top edge fixed
    onSetCanvasPos(newCx, newCy);
  };

  const onAnchorPointerUp = () => { anchorDrag.current = null; };

  // The node owns reference collection and the store writes; the form owns
  // the fields and the generating/error state. Throwing here surfaces in the
  // form's error line.
  const handleGenerate = async () => {
    if (!draft.instruction.trim() || busy) return;
    setBusy(true);
    setGenError(null);
    try {
      // Collect reference images from all nodes connected to this node's input port.
      const { connections } = useConnectionStore.getState();
      const { nodes: konvaNodes } = useKonvaNodes.getState();
      const { panels } = useNodePanel.getState();
      // Carry each upstream node's name alongside its image. Without it the
      // model receives an anonymous sequence and an instruction cannot say
      // which reference it means.
      const references = connections
        .filter((c) => c.toNodeId === instance.id)
        .map((c): Reference | null => {
          if (c.fromNodeType === "konva") {
            const n = konvaNodes[c.fromNodeId];
            return n?.imageUrl ? { kind: "image", url: n.imageUrl, name: n.label } : null;
          }
          const p = panels.find((pp) => pp.id === c.fromNodeId);
          if (!p?.output) return null;
          // A text node's content IS its reference; an image node points at a
          // data URL. Video has no reference form yet, so it contributes
          // nothing rather than arriving as an unusable URL.
          if (p.output.type === "text") return { kind: "text", text: p.output.value, name: p.label };
          if (p.output.type === "image") return { kind: "image", url: p.output.value, name: p.label };
          return null;
        })
        .filter((r): r is Reference => r !== null);

      const output = await spec.generate({
        modelId: draft.model,
        instruction: draft.instruction.trim(),
        settings,
        references,
      });
      const store = useNodePanel.getState();
      store.setOutput(instance.id, output);
      // Only seed the default — never overwrite a name the user chose.
      if (!instance.label) store.setLabel(instance.id, labelFromInstruction(draft.instruction));
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Generation failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Seed the name as soon as there is an instruction rather than waiting for
  // a result — a node needs identifying while you are still configuring it.
  const handleInstructionBlur = () => {
    const instruction = draft.instruction;
    if (instance.label || !instruction.trim()) return;
    const taken = useNodePanel.getState().panels
      .map((p) => p.label)
      .filter((l): l is string => !!l);
    useNodePanel.getState().setLabel(
      instance.id,
      uniqueLabel(labelFromInstruction(instruction), taken)
    );
  };

  return (
    <>
      {/* ── Transformer border + corner anchors — only in active/panel-open states ── */}
      {/* Hover outline — replaces the move cursor as the "this is interactive"
           signal, matching uploaded images. Suppressed while active, since the
           selection box below already draws a border. */}
      {hovered && !isActive && (
        <div
          style={{
            position: "fixed",
            left: placeholderLeft,
            top:  placeholderTop,
            width:  sw,
            height: sh,
            border: `${SELECTION.borderWidth}px solid ${COLORS.ink}`,
            borderRadius: 6,
            boxSizing: "border-box",
            pointerEvents: "none",
            zIndex: Z_INDEX.nodes + 1,
          }}
        />
      )}

      {isActive && (
        <div
          style={{
            position: "fixed",
            left: placeholderLeft - SELECTION.padding,
            top:  placeholderTop  - SELECTION.padding,
            width:  sw + SELECTION.padding * 2,
            height: sh + SELECTION.padding * 2,
            border: `${SELECTION.borderWidth}px solid ${COLORS.ink}`,
            borderRadius: 6,
            zIndex: Z_INDEX.ports,
            pointerEvents: "none",
          }}
        >
          {!isPanelOpen && ANCHORS.map((pos, i) => (
            <div
              key={i}
              onPointerDown={(e) => onAnchorPointerDown(e, i)}
              onPointerMove={(e) => onAnchorPointerMove(e, i)}
              onPointerUp={onAnchorPointerUp}
              style={{
                position: "absolute",
                left: pos.left,
                top:  pos.top,
                width:  SELECTION.anchorSize,
                height: SELECTION.anchorSize,
                background: COLORS.paper,
                border: `1px solid ${COLORS.ink}`,
                borderRadius: SELECTION.anchorCornerRadius,
                transform: "translate(-50%, -50%)",
                cursor: pos.cursor,
                pointerEvents: "auto",
              }}
            />
          ))}
        </div>
      )}

      {/* ── Name — shown while selected, same rules as uploaded images ── */}
      {isActive && instance.label && sw >= LABEL_MIN_NODE_W && (
        <NodeLabel
          value={instance.label}
          left={placeholderLeft}
          bottom={placeholderTop - LABEL_GAP}
          maxWidth={sw}
          onCommit={(next) => useNodePanel.getState().setLabel(instance.id, next)}
        />
      )}

      {/* ── Ports — visible unless another panel covers them ── */}
      {/* Input port — left edge, PORT_FRACTION from top */}
      {!hideInputPort && (
        <div
          title="Input"
          style={{
            ...INPUT_PORT_STYLE,
            left: placeholderLeft,
            top:  placeholderTop + sh * PORT_FRACTION,
          }}
        />
      )}

      {/* Output port — right edge, PORT_FRACTION from top */}
      {!hideOutputPort && (
        <div
          title="Output"
          onPointerDown={(e) => {
            e.stopPropagation();
            useConnectionStore.getState().startDrag(instance.id, "panel", e.clientX, e.clientY);
          }}
          style={{
            ...OUTPUT_PORT_HIT_STYLE,
            left: placeholderLeft + sw - PORT_WIDTH - PORT_HIT_PAD,
            top:  placeholderTop + sh * PORT_FRACTION,
          }}
        >
          <div style={OUTPUT_PORT_STYLE} />
        </div>
      )}

      {/* ── Placeholder ── */}
      <button
  onPointerDown={onPointerDown}
  onPointerMove={onPointerMove}
  onPointerUp={onPointerUp}
  onPointerEnter={() => setHovered(true)}
  onPointerLeave={() => setHovered(false)}
  className="node-panel-placeholder"
  style={{
    position: "fixed",
    left: placeholderLeft,
    top: placeholderTop,
    width: pw,
    height: ph,
    // Laid out in canvas units, then scaled — keeps the icon and label
    // proportional to the node instead of clipping at low zoom.
    transform: `scale(${scale})`,
    transformOrigin: "top left",
    zIndex: Z_INDEX.nodes,
    background: COLORS.placeholder,
    borderRadius: NODE_CORNER_RADIUS,
    // "move" only while a drag is actually in progress — at rest it would
    // claim the node is moving when it is not. Matches uploaded images, where
    // the hover outline carries the "you can move this" signal instead.
    // "pointer" while the panel is open: the placeholder acts as a button
    // there, collapsing the panel on click.
    cursor: isPanelOpen ? "pointer" : dragging ? "move" : "default",
    pointerEvents: "auto",
  }}
>
  {instance.output ? <spec.Output value={instance.output.value} /> : <spec.EmptyState />}

  {dragging && <div className="node-panel-drag-overlay" />}
</button>

      {/* ── Generation panel ── */}
      {isPanelOpen && (
        <GenerateForm
          spec={spec}
          draft={draft}
          onDraftChange={setDraft}
          settings={settings}
          onSettingsChange={setSettings}
          busy={busy}
          error={genError}
          left={panelLeft}
          top={screenCenterY}
          onClose={onClosePanel}
          onInstructionBlur={handleInstructionBlur}
          onSubmit={handleGenerate}
        />
      )}
    </>
  );
}

// ── Root component — renders all instances ────────────────────────────────────

export default function NodePanel() {
  const { panels, removePanel, activatePanel, openPanel, closePanel, closeAllPanels, setCanvasPos, selectPanel } = useNodePanel();
  const { x: stageX, y: stageY, scale } = useViewport();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const store = useNodePanel.getState();
      const mod   = e.ctrlKey || e.metaKey;

      // Undo / redo placeholder positions — runs in capture phase, before Board.tsx.
      // Only intercept when a placeholder is selected and has position history to act on.
      if (mod && !e.altKey) {
        const isUndo = e.code === "KeyZ" && !e.shiftKey;
        const isRedo = e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey);
        if (isUndo || isRedo) {
          const canUndo = store.posHistoryIdx > 0;
          const canRedo = store.posHistoryIdx < store.posHistory.length - 1;
          if ((isUndo && canUndo) || (isRedo && canRedo)) {
            e.preventDefault();
            e.stopImmediatePropagation(); // prevent Board.tsx Konva undo from also firing
            if (isUndo) store.undoPos();
            else        store.redoPos();
          }
          return;
        }
      }

      // Delete / Backspace — remove selected placeholder.
      if ((e.code === "Delete" || e.code === "Backspace") && store.selectedId) {
        e.preventDefault();
        removePanel(store.selectedId);
        selectPanel(null);
        return;
      }
      // Escape — collapse all panels, keep placeholders.
      if (e.code === "Escape") closeAllPanels();
    };
    // Capture phase ensures this runs before Board.tsx's bubble-phase listener.
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [removePanel, selectPanel, closeAllPanels]);

  return (
    <>
      {panels.map((p, i) => {
        const covered = portsCovered(p, panels.slice(i + 1), scale);
        return (
        <SinglePanel
          key={p.id}
          instance={p}
          stageX={stageX}
          stageY={stageY}
          scale={scale}
          onActivate={()         => activatePanel(p.id)}
          onOpenPanel={()        => openPanel(p.id)}
          onClosePanel={()       => closePanel(p.id)}
          onRemove={()           => removePanel(p.id)}
          onSetCanvasPos={(x, y) => setCanvasPos(p.id, x, y)}
          hideInputPort={covered.input}
          hideOutputPort={covered.output}
        />
        );
      })}
    </>
  );
}
