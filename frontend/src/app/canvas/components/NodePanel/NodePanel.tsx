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
import { selectOnly } from "@/lib/canvas/selection";
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
import { isCovered, labelProbe, portProbe, type Blocker, type TopLayer } from "@/lib/canvas/occlusion";
import { canvasHistory } from "@/lib/canvas/history";
import { useLayerOrder } from "@/store/layerOrder.store";
import { inputPoint, outputPoint } from "@/lib/canvas/ports";
import { toScreen } from "@/lib/canvas/coords";
import { boundsOf } from "@/lib/canvas/bounds";
import { layoutVariants } from "../../board/variants";
import { dragFrameFrom, selectedFrameAround } from "../../board/frameDrag";
import { useFrames } from "@/store/frame.store";
// Prompts usually open with boilerplate ("a highly detailed photorealistic
// image of a …"), so first-N-words collides often — hence uniqueLabel on
// every auto-generated name here.
import { takenLabels, uniqueLabel } from "@/lib/canvas/labels";
import { useCanvasArea } from "../../canvasArea";
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
// The name is tested here too, off the same blocker list: it is no longer
// selection chrome, so a covered name has to hide for the reason a covered
// port does -- drawn over the node that covers it, it reads as that node's.
function chromeCovered(
  p: PanelInstance,
  above: PanelInstance[],
  konvaNodes: KonvaNodeRecord[],
  topLayer: TopLayer,
  scale: number
): { input: boolean; output: boolean; label: boolean } {
  const self: Blocker = { id: p.id, box: p, layer: "dom" };
  const blockers: Blocker[] = [
    ...above.map((q): Blocker => ({ id: q.id, box: q, layer: "dom" })),
    // Uploaded images only block when the canvas is the front layer.
    ...konvaNodes.map((n): Blocker => ({ id: n.id, box: n, layer: "canvas", z: n.z })),
  ];
  return {
    input:  isCovered(portProbe(p, "input", scale), self, blockers, topLayer),
    output: isCovered(portProbe(p, "output", scale), self, blockers, topLayer),
    label:  isCovered(labelProbe(p, scale), self, blockers, topLayer),
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
  hideLabel:      boolean;
}

function SinglePanel({
  instance, stageX, stageY, scale,
  onActivate, onOpenPanel, onClosePanel, onRemove, onSetCanvasPos,
  hideInputPort, hideOutputPort, hideLabel,
}: SinglePanelProps) {
  const { canvasX, canvasY, isActive, isPanelOpen } = instance;

  // The kind's spec is the only thing that differs between node types.
  const spec = kindSpec(instance.kind);
  // Settings live here rather than in the form: they decide the node's
  // footprint via spec.sizeFor, which is a parent concern. Seeded from the
  // node, so a copy -- an image variant, a paste -- opens with its source's
  // settings. Spread over the defaults so a setting added later still has a value.
  const [settings, setSettingsState] = useState<NodeSettings>(
    () => ({ ...spec.defaultSettings, ...instance.draft?.settings }) as NodeSettings
  );
  // The draft lives in the store, not in GenerateForm: the form unmounts
  // whenever the panel collapses, a half-written prompt must survive that,
  // and a copy of the node carries it. In-flight state stays local.
  const draft: GenerateDraft = instance.draft ?? {
    model: spec.defaultModel ?? spec.models[0]?.id ?? "",
    instruction: "",
  };
  const setDraft = (next: GenerateDraft) =>
    useNodePanel.getState().setDraft(instance.id, { model: next.model, instruction: next.instruction, settings });
  const setSettings = (next: NodeSettings) => {
    setSettingsState(next);
    useNodePanel.getState().setDraft(instance.id, { model: draft.model, instruction: draft.instruction, settings: next });
  };
  const [busy, setBusy] = useState(false);
  // A batch takes as long as its slowest variant, so say how many are coming
  // rather than showing the same spinner as for one.
  const variantTotal = spec.variantCount?.(settings) ?? 1;
  const variantBusyLabel = variantTotal > 1 ? `Creating ${variantTotal} images…` : undefined;
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

  // Reset to the kind's default footprint when a setting that drives size
  // changes. Written directly to the store so the size is captured in the next
  // history snapshot — local state is not part of the snapshot and caused
  // undo to restore port positions without restoring the visual node size (AC #4).
  // Compared by value so an unrelated setting (temperature) does not discard
  // a manual resize.
  const prevSize = useRef(spec.sizeFor(spec.defaultSettings));
  useEffect(() => {
    const next = spec.sizeFor(settings);
    if (next.w === prevSize.current.w && next.h === prevSize.current.h) return;
    prevSize.current = next;
    useNodePanel.getState().setSize(instance.id, next.w, next.h);
  }, [instance.id, settings, spec]);

  // The panel is placed relative to the node, so it has to know how much room
  // is left on screen. The visible canvas, not the window: the left-flip
  // fallback would otherwise push a panel underneath the sidebar.
  const area = useCanvasArea();
  const viewLeft = area.left ?? 0;
  const viewW = viewLeft + area.width;

  // pw/ph are canvas units; sw/sh are their on-screen size at the current zoom.
  // Node geometry uses sw/sh; chrome (ports, anchors, panel) keeps a fixed pixel size.
  // Size comes from the store so undo can restore it atomically with position.
  const pw = instance.w;
  const ph = instance.h;
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
  // The left bound is the sidebar's inner edge, not 0 -- flipping a panel to
  // x=16 would tuck it under the rail.
  const minLeft = viewLeft + VIEWPORT_MARGIN;
  const panelLeft =
    rightLeft + PANEL_W <= viewW - VIEWPORT_MARGIN
      ? rightLeft
      : leftLeft >= minLeft
        ? leftLeft
        : Math.max(minLeft, viewW - PANEL_W - VIEWPORT_MARGIN);

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
      // A selected frame owns a drag that starts inside it (#119). Handed over
      // here, past the threshold, so a plain click still selects this node.
      // An active node is the selection itself and drags on its own.
      if (!isDragging.current && !isActive) {
        const frame = selectedFrameAround(boundsOf(instance));
        if (frame) {
          // The frame follows the pointer from here on; this node's own
          // move and up handlers stand down.
          pointerDownHere.current = false;
          dragFrameFrom(frame, { x: dragStart.current.px, y: dragStart.current.py });
          return;
        }
      }
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
          selectOnly("panel");
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
      // Shift/Ctrl/Cmd+click: add to or drop from the selection, the same
      // modifiers uploaded images and wires accept.
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        useNodePanel.getState().togglePanel(instance.id);
      } else {
        // Normal click: clear other selection types.
        selectOnly("panel");
        // Step through states: inactive → active → panel-open → active
        if (!isActive)              onActivate();
        else if (!isPanelOpen)      onOpenPanel();
        else                        onClosePanel();
      }
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
    useNodePanel.getState().setSize(instance.id, newW, newH);
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

  // Aborts any in-flight generate call when the node is deleted.
  const generateAbort = useRef<AbortController | null>(null);
  useEffect(() => () => { generateAbort.current?.abort(); }, []);

  // The node owns reference collection and the store writes; the form owns
  // the fields and the generating/error state. Throwing here surfaces in the
  // form's error line.
  const handleGenerate = async () => {
    if (!draft.instruction.trim() || busy) return;
    // Saved before the request, so variant copies are made from what was sent.
    setDraft(draft);
    generateAbort.current?.abort();
    const controller = new AbortController();
    generateAbort.current = controller;
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

      // More than one result cannot live in this node -- it holds a single
      // output and feeds a single reference -- so a batch goes to the board
      // as image nodes in a Frame of their own, and this node stays as it was.
      const count = spec.variantCount?.(settings) ?? 1;
      if (count > 1 && spec.generateVariants) {
        const batch = await spec.generateVariants(
          {
            modelId: draft.model,
            instruction: draft.instruction.trim(),
            settings,
            references,
            signal: controller.signal,
          },
          count
        );
        if (controller.signal.aborted) return;

        const store = useNodePanel.getState();
        // Named before anything lands, so the copies and their frame can take
        // their names from it.
        const name = instance.label
          ?? uniqueLabel(labelFromInstruction(draft.instruction), takenLabels());
        if (!instance.label) store.setLabel(instance.id, name);

        // This node is variant 1 and stays put; the frame grows around it and
        // the copies fill the rest of the grid. Every copy is a full Create
        // node with this one's inputs, so any of them can be regenerated alone.
        const source = boundsOf(instance);
        const { frame, cells } = layoutVariants(batch.urls.length, source);
        store.setOutput(instance.id, { type: "image", value: batch.urls[0] });

        const taken = takenLabels();
        const placements = batch.urls.slice(1).map((url, i) => {
          const label = uniqueLabel(name, taken);
          taken.push(label);
          return {
            canvasX: cells[i + 1].x,
            // Panels are centre-anchored vertically; cells are top-left.
            canvasY: cells[i + 1].y + source.h / 2,
            output: { type: "image" as const, value: url },
            label,
          };
        });
        store.addVariants(instance.id, placements);
        const frameId = crypto.randomUUID();
        useFrames.getState().upsert({
          id: frameId,
          canvasX: frame.x, canvasY: frame.y, canvasW: frame.w, canvasH: frame.h,
          label: uniqueLabel(`${name} variants`, taken),
        });
        // One step for the frame, the copies and this node's new image.
        canvasHistory.commit();

        const failed = count - batch.urls.length;
        if (failed) {
          // Not an error -- the ones that worked are on the board -- but the
          // user asked for N and should know they did not get N. The panel
          // stays open for it: selecting the frame would close the form and
          // take the message with it.
          setGenError(`${failed} of ${count} variants failed to generate.`);
        } else {
          // Hand the selection to the new frame, so its outline and handles
          // show what was created and what belongs to it. A frame's resting
          // look is quiet enough to miss on a white board (#115).
          selectOnly("frame");
          useFrames.getState().select(frameId);
        }
        return;
      }

      const output = await spec.generate({
        modelId: draft.model,
        instruction: draft.instruction.trim(),
        settings,
        references,
        // Persisted the moment the backend hands it back, so a reload during
        // a multi-minute video generation resumes rather than loses it.
        onJobStarted: (jobId) => useNodePanel.getState().setJob(instance.id, jobId),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const store = useNodePanel.getState();
      store.setOutput(instance.id, output);
      // Only seed the default — never overwrite a name the user chose.
      if (!instance.label) {
        store.setLabel(
          instance.id,
          uniqueLabel(labelFromInstruction(draft.instruction), takenLabels())
        );
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      // Drop the job: it settled as failed, or we stopped waiting on it.
      // Leaving it would make the node resume a dead job on every reload.
      useNodePanel.getState().setJob(instance.id, undefined);
      setGenError(err instanceof Error ? err.message : "Generation failed. Please try again.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      if (generateAbort.current === controller) generateAbort.current = null;
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

    const controller = new AbortController();
    let cancelled = false;
    setBusy(true);
    spec
      .resume(jobId, controller.signal)
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
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [instance.job, instance.output, instance.id, spec]);

  // Seed the name as soon as there is an instruction rather than waiting for
  // a result — a node needs identifying while you are still configuring it.
  const handleInstructionBlur = () => {
    const instruction = draft.instruction;
   useNodePanel.getState().setDraft(instance.id, {
    model: draft.model,
    instruction,
    settings,
  });
    if (instance.label || !instruction.trim()) return;
    useNodePanel.getState().setLabel(
      instance.id,
      uniqueLabel(labelFromInstruction(instruction), takenLabels())
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

      {/* ── Name — always on, same rules as uploaded images. Hidden when
           covered, except while selected: selecting a buried node and
           getting no name back would defeat the point. ── */}
      {instance.label && sw >= LABEL_MIN_NODE_W && (!hideLabel || isActive) && (
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
  // Shift/Ctrl+click is a selection gesture here, but the browser reads a
  // shift-click as "extend the text selection" and paints everything between
  // the two clicks, image included, in its highlight blue.
  onMouseDown={(e) => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault(); }}
  // The generated image inside is an <img>, which the browser drags natively.
  // A native drag swallows the pointer gesture -- a selected Frame's drag
  // stalled after a few px -- and Chrome hands the image over as a file, so
  // the board's drop handler added it again as a new image (#131). Moving a
  // node is this element's own pointer handling; the browser's is never wanted.
  onDragStart={(e) => e.preventDefault()}
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
          busyLabel={variantBusyLabel}
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
  const { panels, removePanel, removeActive, activatePanel, openPanel, closePanel, closeAllPanels, setCanvasPos } = useNodePanel();
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
      // Capture phase runs before a modal can stop the event, so it has to
      // opt out itself: Backspace on a popup's button must not delete here.
      if (e.target instanceof Element && e.target.closest('[aria-modal="true"]')) return;
      const store = useNodePanel.getState();
      const mod   = e.ctrlKey || e.metaKey;

      // No undo/redo here. There is one timeline and Board owns the only
      // listener; this used to run in capture phase and
      // stopImmediatePropagation its way to priority, which is what made
      // Ctrl+Z non-chronological across node kinds.

      // Delete / Backspace — remove every selected placeholder. Active, not
      // selectedId: after Ctrl+A many panels are selected and selectedId is null.
      if ((e.code === "Delete" || e.code === "Backspace") && store.panels.some((p) => p.isActive)) {
        e.preventDefault();
        removeActive();
        // Keyed on the event: wires and images deleted by the same keypress
        // land in this one undo step.
        canvasHistory.commit(e);
        return;
      }
      // Escape — collapse all panels, keep placeholders.
      if (e.code === "Escape") closeAllPanels();
    };
    // Capture phase ensures this runs before Board.tsx's bubble-phase listener.
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [removeActive, closeAllPanels]);

  return (
    <>
      {panels.map((p, i) => {
        const covered = chromeCovered(p, panels.slice(i + 1), konvaNodes, topLayer, scale);
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
          hideLabel={covered.label}
        />
        );
      })}
    </>
  );
}
