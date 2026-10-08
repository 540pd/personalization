"use client";

// Luma reference: IMG-02/03 — Create Image panel.
// Each Node → Image click creates an independent placeholder + panel instance.
// Instances are stored in the nodePanelStore array and rendered here.

import { useState, useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useViewport } from "@/store/viewport.store";
import type { Reference } from "@/types/canvas.types";
import { useConnectionStore } from "@/store/connection.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useKonvaNodes, type KonvaNodeRecord } from "@/store/konvaNodes.store";
import {
  COLORS,
  INPUT_PORT_STYLE,
  LABEL_GAP,
  LABEL_MIN_NODE_W,
  MIN_NODE_SIZE,
  NODE_CORNER_RADIUS,
  OUTPUT_PORT_HIT_STYLE,
  OUTPUT_PORT_STYLE,
  PORT_HIT_PAD,
  PORT_WIDTH,
  SELECTION,
  Z_INDEX,
} from "@/constants/canvas.constants";
import { isCovered, portProbe, type Blocker, type TopLayer } from "@/lib/canvas/occlusion";
import { canvasHistory } from "@/lib/canvas/history";
import { useLayerOrder } from "@/store/layerOrder.store";
import { inputPoint, outputPoint } from "@/lib/canvas/ports";
import { toScreen } from "@/lib/canvas/coords";
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

// Occlusion lives in lib/canvas/occlusion. Panels share one z-index, so array
// order IS paint order: only panels later in the array can cover this one.
// Each port is tested separately — a neighbour overlapping the left edge must
// hide the input port without blanking the output.
function portsCovered(
  p: PanelInstance,
  above: PanelInstance[],
  konvaNodes: KonvaNodeRecord[],
  topLayer: TopLayer,
  scale: number
): { input: boolean; output: boolean } {
  const self: Blocker = { id: p.id, box: p, layer: "dom" };
  const blockers: Blocker[] = [
    ...above.map((q): Blocker => ({ id: q.id, box: q, layer: "dom" })),
    // Uploaded images only block when the canvas is the front layer.
    ...konvaNodes.map((n): Blocker => ({ id: n.id, box: n, layer: "canvas", z: n.z })),
  ];
  return {
    input:  isCovered(portProbe(p, "input", scale), self, blockers, topLayer),
    output: isCovered(portProbe(p, "output", scale), self, blockers, topLayer),
  };
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
    model: spec.defaultModel ?? spec.models[0]?.id ?? "",
    instruction: "",
  });
  const [busy, setBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [dragging,    setDragging]    = useState(false);
  const [hovered,     setHovered]     = useState(false);

  const isDragging = useRef(false);
  /** True only between a pointerdown on THIS node and its pointerup. */
  const pointerDownHere = useRef(false);
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
  const vp = { x: stageX, y: stageY, scale };
  const inPt  = toScreen(inputPoint(instance), vp);
  const outPt = toScreen(outputPoint(instance), vp);
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
    // Records that the gesture began HERE. Without it, onPointerMove fires
    // for any pointer that merely passes over this node with a button held
    // -- dragging an uploaded image across it moved the node too, as if the
    // two were glued.
    pointerDownHere.current = true;
    dragStart.current = { px: e.clientX, py: e.clientY, cx: canvasX, cy: canvasY };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    // A held button is not enough: the press has to have started on this
    // node. Otherwise a drag belonging to something else -- an uploaded
    // image passing over -- is read as a drag of this one, using whatever
    // stale dragStart was left from last time.
    if (!pointerDownHere.current || e.buttons === 0 || isPanelOpen) return;
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
        // raisePanel only reorders within the DOM layer. Bringing that layer
        // forward is what lets a panel come back over an uploaded image after
        // the image was last dragged.
        useLayerOrder.getState().raiseDom();
      }
      onSetCanvasPos(dragStart.current.cx + dx / scale, dragStart.current.cy + dy / scale);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    // Nothing to finish if the gesture never began here.
    if (!pointerDownHere.current) return;
    pointerDownHere.current = false;
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
      canvasHistory.commit();
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

  const onAnchorPointerUp = () => {
    // Commit only if a resize actually happened; a stray pointerup would
    // otherwise push a duplicate entry and cost an extra Ctrl+Z.
    const resized = anchorDrag.current !== null;
    anchorDrag.current = null;
    if (resized) canvasHistory.commit();
  };

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
          // data URL. Video is terminal and renders no output port, so it
          // cannot be wired as a source -- the fallthrough keeps that true
          // even if a stale connection outlives a change of kind.
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
        // Persisted the moment the backend hands it back, so a reload during
        // a multi-minute video generation resumes rather than loses it.
        onJobStarted: (jobId) => useNodePanel.getState().setJob(instance.id, jobId),
      });
      const store = useNodePanel.getState();
      store.setOutput(instance.id, output);
      // Only seed the default — never overwrite a name the user chose.
      if (!instance.label) store.setLabel(instance.id, labelFromInstruction(draft.instruction));
    } catch (err) {
      // Drop the job: it settled as failed, or we stopped waiting on it.
      // Leaving it would make the node resume a dead job on every reload.
      useNodePanel.getState().setJob(instance.id, undefined);
      setGenError(err instanceof Error ? err.message : "Generation failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // A generation still running from before this mount -- a reload, or a
  // remount. Only asynchronous kinds supply resume(); for the others a job id
  // can never outlive the page, so there is nothing to pick up.
  const resumedJob = useRef<string | null>(null);
  useEffect(() => {
    const jobId = instance.job;
    if (!jobId || instance.output || !spec.resume) return;
    if (resumedJob.current === jobId) return;
    resumedJob.current = jobId;

    let cancelled = false;
    setBusy(true);
    spec
      .resume(jobId)
      .then((output) => {
        if (cancelled) return;
        useNodePanel.getState().setOutput(instance.id, output);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        useNodePanel.getState().setJob(instance.id, undefined);
        setGenError(err instanceof Error ? err.message : "Generation failed.");
      })
      .finally(() => {
        // Deleting the node mid-job unmounts this; without the guard the
        // poll would keep writing to a store entry that no longer exists.
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [instance.job, instance.output, instance.id, spec]);

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
      {/* Input port — placed from shared geometry, same as uploaded images */}
      {!hideInputPort && (
        <div
          title="Input"
          style={{
            ...INPUT_PORT_STYLE,
            left: inPt.x,
            top:  inPt.y,
          }}
        />
      )}

      {/* Output port — placed from shared geometry. Absent on a terminal
          kind, so there is nothing to start a connection from. */}
      {spec.isSource !== false && !hideOutputPort && (
        <div
          title="Output"
          onPointerDown={(e) => {
            e.stopPropagation();
            useConnectionStore.getState().startDrag(instance.id, "panel", e.clientX, e.clientY);
          }}
          style={{
            ...OUTPUT_PORT_HIT_STYLE,
            left: outPt.x - PORT_WIDTH - PORT_HIT_PAD,
            top:  outPt.y,
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
  onPointerCancel={() => {
    pointerDownHere.current = false;
    isDragging.current = false;
    setDragging(false);
  }}
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
  {instance.output ? (
    <spec.Output value={instance.output.value} />
  ) : busy ? (
    // Shown on the node itself, not only in the panel: a video generation
    // runs for minutes and the panel is usually closed by then. The rest of
    // the canvas stays interactive throughout.
    <div className="node-panel-placeholder-content">
      <Loader2 size={22} aria-hidden className="node-panel-loader" />
      <span className="node-panel-placeholder-text">Generating…</span>
    </div>
  ) : (
    <spec.EmptyState />
  )}

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
  const topLayer = useLayerOrder((s) => s.topLayer);
  const konvaNodes = Object.values(useKonvaNodes((s) => s.nodes));

  // The panels half of the shared undo timeline. Every store setter rebuilds
  // the objects it touches, so holding the array is a valid snapshot --
  // nothing mutates a PanelInstance in place.
  useEffect(() => {
    return canvasHistory.register("panels", {
      capture: () => useNodePanel.getState().panels,
      restore: (snap) => useNodePanel.getState().replaceAll(snap as PanelInstance[]),
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const store = useNodePanel.getState();
      const mod   = e.ctrlKey || e.metaKey;

      // No undo/redo here. There is one timeline and Board owns the only
      // listener; this used to run in capture phase and
      // stopImmediatePropagation its way to priority, which is what made
      // Ctrl+Z non-chronological across node kinds.

      // Delete / Backspace — remove selected placeholder.
      if ((e.code === "Delete" || e.code === "Backspace") && store.selectedId) {
        e.preventDefault();
        removePanel(store.selectedId);
        selectPanel(null);
        canvasHistory.commit();
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
        const covered = portsCovered(p, panels.slice(i + 1), konvaNodes, topLayer, scale);
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
