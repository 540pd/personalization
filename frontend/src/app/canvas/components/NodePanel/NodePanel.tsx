"use client";

// Luma reference: IMG-02/03 — Create Image panel.
// Each Node → Image click creates an independent placeholder + panel instance.
// Instances are stored in the nodePanelStore array and rendered here.

import { useState, useRef, useEffect } from "react";
import { X, ChevronDown, Check, Loader2 } from "lucide-react";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useViewport } from "@/store/viewport.store";
import { generateImageV2 } from "@/api/canvas.api";
import type { AspectRatioV2, ReferenceImage } from "@/types/canvas.types";
import { useConnectionStore } from "@/store/connection.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import {
  ASPECT_MAP,
  COLORS,
  DEFAULT_ASPECT_RATIO,
  INPUT_PORT_STYLE,
  MIN_NODE_SIZE,
  NODE_CORNER_RADIUS,
  OUTPUT_PORT_HIT_STYLE,
  OUTPUT_PORT_STYLE,
  PORT_FRACTION,
  PORT_HIT_PAD,
  PORT_WIDTH,
  SELECTION,
  Z_INDEX,
  placeholderSize,
} from "@/constants/canvas.constants";
import NodeLabel, { LABEL_GAP, LABEL_MIN_NODE_W } from "../NodeLabel";
import "./NodePanel.scss";

// ── Image generation models ───────────────────────────────────────────────────
// To add a new model: append an entry with the Vertex AI model ID as `id` and
// the display name as `label`. The `id` value is sent verbatim to the backend
// POST /api/generate/image as the `modelId` field.
// Example:
//   { id: "gemini-3.2-flash-image", label: "Nano Banana 3" },
const MODELS = [
  { id: "gemini-3.1-flash-image",      label: "Nano Banana 2" },
  { id: "gemini-3.1-flash-lite-image", label: "Nano Banana 2 Lite" },
  { id: "gemini-3-pro-image",          label: "Nano Banana Pro" },
];

const ASPECT_RATIOS = ["16:9", "1:1", "9:16", "4:3", "3:4"];
const QUALITIES     = ["1K", "2K", "4K"];
const THINKING_OPTS = ["None", "Minimal", "Full"];

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

  const [model,        setModel]        = useState(MODELS[0].id);
  const [isModelOpen,  setIsModelOpen]  = useState(false);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const [instruction,  setInstruction]  = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [thinking,     setThinking]     = useState("Minimal");
  const [temperature,  setTemperature]  = useState(0.5);
  const [grounding,    setGrounding]    = useState(false);
  const [aspectRatio,  setAspectRatio]  = useState(DEFAULT_ASPECT_RATIO);
  const [quality,      setQuality]      = useState("2K");
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError,     setGenError]     = useState<string | null>(null);
  const [dragging,     setDragging]     = useState(false);
  const [hovered,      setHovered]      = useState(false);

  const isDragging = useRef(false);
  const dragStart  = useRef({ px: 0, py: 0, cx: 0, cy: 0 });
  const anchorDrag = useRef<{
    idx: number; startPx: number; startPy: number;
    startW: number; startH: number; startCx: number; startCy: number;
  } | null>(null);

  const [sizeW, setSizeW] = useState(() => placeholderSize(aspectRatio).w);
  const [sizeH, setSizeH] = useState(() => placeholderSize(aspectRatio).h);

  // Reset to default dimensions when aspect ratio changes from the dropdown.
  const prevAR = useRef(aspectRatio);
  useEffect(() => {
    if (prevAR.current === aspectRatio) return;
    prevAR.current = aspectRatio;
    const { w, h } = placeholderSize(aspectRatio);
    setSizeW(w);
    setSizeH(h);
  }, [aspectRatio]);

  // Close model picker on outside click.
  useEffect(() => {
    if (!isModelOpen) return;
    const handler = (e: MouseEvent) => {
      if (!modelPickerRef.current?.contains(e.target as Node)) setIsModelOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isModelOpen]);

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

  const handleCreate = async () => {
    if (!instruction.trim() || isGenerating) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      // Collect reference images from all nodes connected to this node's input port.
      const { connections } = useConnectionStore.getState();
      const { nodes: konvaNodes } = useKonvaNodes.getState();
      const { panels } = useNodePanel.getState();
      // Carry each upstream node's name alongside its image. Without it the
      // model receives an anonymous sequence and an instruction cannot say
      // which reference it means.
      const referenceImages = connections
        .filter((c) => c.toNodeId === instance.id)
        .map((c): ReferenceImage | null => {
          if (c.fromNodeType === "konva") {
            const n = konvaNodes[c.fromNodeId];
            return n?.imageUrl ? { url: n.imageUrl, name: n.label } : null;
          }
          const p = panels.find((pp) => pp.id === c.fromNodeId);
          return p?.preview ? { url: p.preview, name: p.label } : null;
        })
        .filter((r): r is ReferenceImage => r !== null);

      const result = await generateImageV2({
        modelId: model,
        instruction: instruction.trim(),
        aspectRatio: aspectRatio as AspectRatioV2,
        quality: quality === "4K" ? "hd" : "standard",
        thinking: thinking !== "None",
        temperature,
        grounding,
        referenceImages: referenceImages.length ? referenceImages : undefined,
      });
      if (result.imageUrl) {
        const store = useNodePanel.getState();
        store.setPreview(instance.id, result.imageUrl);
        // Only seed the default — never overwrite a name the user chose.
        if (!instance.label) store.setLabel(instance.id, labelFromInstruction(instruction));
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Generation failed. Please try again.");
    } finally {
      setIsGenerating(false);
    }
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
  {instance.preview ? (
    <img
      src={instance.preview}
      alt="Generated preview"
      className="node-panel-preview"
    />
  ) : (
    <div className="node-panel-placeholder-content">
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="node-panel-image-icon"      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>

      <span className="node-panel-placeholder-text">
        Image will
        <br />
        appear here
      </span>
    </div>
  )}

  {dragging && <div className="node-panel-drag-overlay" />}
</button>

      {/* ── Create Image panel ── */}
      {isPanelOpen && (
        <div
  className="node-panel-create"
  style={{
    position: "fixed",
    left: panelLeft,
    top: screenCenterY,
    transform: "translateY(-50%)",
    zIndex: Z_INDEX.nodes,
    border: `1px solid ${COLORS.panelBorder}`,
    maxHeight: "calc(100vh - 2rem)",
    pointerEvents: "auto",
  }}
>
  {/* Header */}
  <div className="node-panel-header">
    <div>
      <h2 className="node-panel-title">Create Image</h2>

      <div className="node-panel-model-wrapper" ref={modelPickerRef}>
        <button
          onClick={() => setIsModelOpen((v) => !v)}
          className="node-panel-model-trigger"
        >
          <span>
            {MODELS.find((m) => m.id === model)?.label ?? model}
          </span>

          <ChevronDown
            size={12}
            className={`node-panel-chevron ${
              isModelOpen ? "node-panel-chevron-open" : ""
            }`}
          />
        </button>

        {isModelOpen && (
          <div className="node-panel-model-dropdown">
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setModel(m.id);
                  setIsModelOpen(false);
                }}
                className={`node-panel-model-option ${
                  model === m.id
                    ? "node-panel-model-option-active"
                    : "node-panel-model-option-inactive"
                }`}
              >
                <span>{m.label}</span>

                {model === m.id && (
                  <Check
                    size={13}
                    className="node-panel-model-check"
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>

    <button
      onClick={onClosePanel}
      className="node-panel-close-button"
    >
      <X size={15} />
    </button>
  </div>

  {/* Scrollable body */}
  <div className="node-panel-body">

    <div>
      <p className="node-panel-section-label">
        Instruction
      </p>

      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        onBlur={() => {
          // Seed the name as soon as there is an instruction rather than
          // waiting for a result — a node needs identifying while you are
          // still configuring it. Never overwrite a name the user chose.
          if (instance.label || !instruction.trim()) return;
          const taken = useNodePanel.getState().panels
            .map((p) => p.label)
            .filter((l): l is string => !!l);
          useNodePanel.getState().setLabel(
            instance.id,
            uniqueLabel(labelFromInstruction(instruction), taken)
          );
        }}
        placeholder="Describe the image..."
        rows={3}
        className="node-panel-instruction"
      />
    </div>

    <div>
      <button
        onClick={() => setAdvancedOpen((v) => !v)}
        className="node-panel-advanced-trigger"
      >
        Advanced

        <ChevronDown
          size={13}
          className={`node-panel-chevron ${
            advancedOpen ? "node-panel-chevron-open" : ""
          }`}
        />
      </button>

      {advancedOpen && (
        <div className="node-panel-advanced-content">
          <div className="node-panel-advanced-row">

            <div className="node-panel-setting">
              <p className="node-panel-setting-label">
                Thinking
              </p>

              <select
                value={thinking}
                onChange={(e) => setThinking(e.target.value)}
                className="node-panel-select"
              >
                {THINKING_OPTS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="node-panel-setting node-panel-grounding">
              <p className="node-panel-setting-label">
                Grounding
              </p>

              <button
                onClick={() => setGrounding((v) => !v)}
                className={`node-panel-toggle ${
                  grounding
                    ? "node-panel-toggle-on"
                    : "node-panel-toggle-off"
                }`}
              >
                <span
                  className={`node-panel-toggle-thumb ${
                    grounding
                      ? "node-panel-toggle-thumb-on"
                      : "node-panel-toggle-thumb-off"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="node-panel-temperature">
            <div className="node-panel-temperature-header">
              <p className="node-panel-setting-label">
                Temperature
              </p>

              <span className="node-panel-temperature-value">
                {temperature.toFixed(1)}
              </span>
            </div>

            <div className="node-panel-temperature-slider">
              <span className="node-panel-range-label">0</span>

              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) =>
                  setTemperature(Number(e.target.value))
                }
                className="node-panel-range"
              />

              <span className="node-panel-range-label">2</span>
            </div>
          </div>
        </div>
      )}
    </div>

    <div className="node-panel-options">
      <div className="node-panel-option">
        {/* existing aspect-ratio SVG */}
        <select
          value={aspectRatio}
          onChange={(e) => setAspectRatio(e.target.value)}
          className="node-panel-option-select"
        >
          {ASPECT_RATIOS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="node-panel-option">
        {/* existing quality SVG */}
        <select
          value={quality}
          onChange={(e) => setQuality(e.target.value)}
          className="node-panel-option-select"
        >
          {QUALITIES.map((q) => (
            <option key={q}>{q}</option>
          ))}
        </select>
      </div>
    </div>

    {genError && (
      <p className="node-panel-error">
        {genError}
      </p>
    )}

    <button
      onClick={handleCreate}
      disabled={!instruction.trim() || isGenerating}
      className={`node-panel-create-button ${
        !instruction.trim() || isGenerating
          ? "node-panel-create-button-disabled"
          : "node-panel-create-button-enabled"
      }`}
    >
      {isGenerating && (
        <Loader2
          size={14}
          className="node-panel-loader"
        />
      )}

      {isGenerating ? "Creating…" : "Create"}
    </button>
  </div>
</div>
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
