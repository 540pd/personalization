"use client";

// Luma reference: IMG-02/03 — Create Image panel.
// Each Node → Image click creates an independent placeholder + panel instance.
// Instances are stored in the nodePanelStore array and rendered here.

import { useState, useRef, useEffect } from "react";
import { X, ChevronDown, Check, Loader2 } from "lucide-react";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useViewport } from "@/store/viewport.store";
import { generateImageV2 } from "@/lib/api";
import type { AspectRatioV2 } from "@/types/canvas.types";
import { useConnectionStore } from "@/store/connection.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";

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

const ASPECT_MAP: Record<string, [number, number]> = {
  "16:9": [16, 9], "1:1": [1, 1], "9:16": [9, 16], "4:3": [4, 3], "3:4": [3, 4],
};
const MAX_DIM = 200;

function placeholderSize(ratio: string): { w: number; h: number } {
  const [aw, ah] = ASPECT_MAP[ratio] ?? [16, 9];
  if (aw >= ah) return { w: MAX_DIM, h: Math.round(MAX_DIM * ah / aw) };
  return { w: Math.round(MAX_DIM * aw / ah), h: MAX_DIM };
}

const PANEL_W    = 320;
const GAP        = 12;
const TR_PADDING = 4;   // matches Konva Transformer padding
const ANCHOR_SZ  = 8;   // matches Konva anchorSize
const PORT_D     = 10;  // port circle diameter in px

// Corner anchor positions + resize cursor. idx: 0=TL, 1=TR, 2=BL, 3=BR.
const ANCHORS = [
  { left: 0,      top: 0,      cursor: "nw-resize" },
  { left: "100%", top: 0,      cursor: "ne-resize" },
  { left: 0,      top: "100%", cursor: "sw-resize" },
  { left: "100%", top: "100%", cursor: "se-resize" },
] as const;

// ── Per-instance component ────────────────────────────────────────────────────

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
}

function SinglePanel({
  instance, stageX, stageY, scale,
  onActivate, onOpenPanel, onClosePanel, onRemove, onSetCanvasPos,
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
  const [aspectRatio,  setAspectRatio]  = useState("16:9");
  const [quality,      setQuality]      = useState("2K");
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError,     setGenError]     = useState<string | null>(null);
  const [dragging,     setDragging]     = useState(false);

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

  // Sync rendered size to nodePanelStore so ConnectionOverlay can compute port positions.
  useEffect(() => {
    useNodePanel.getState().setSize(instance.id, sizeW, sizeH);
  }, [instance.id, sizeW, sizeH]);

  const pw = sizeW;
  const ph = sizeH;

  const screenLeft    = stageX + canvasX * scale;
  const screenCenterY = stageY + canvasY * scale;
  const placeholderLeft = screenLeft;
  const placeholderTop  = screenCenterY - ph / 2;
  const panelLeft       = screenLeft + pw + GAP;

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
      if (!isDragging.current) { isDragging.current = true; setDragging(true); }
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

  const MIN_SIZE = 60;

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
    const mdx    = e.clientX - startPx;
    const isLeft = idx === 0 || idx === 2;
    const isTop  = idx === 0 || idx === 1;
    // Width is the driver; height follows to preserve aspect ratio.
    const newW   = Math.max(MIN_SIZE, isLeft ? startW - mdx : startW + mdx);
    const newH   = Math.round(newW * (startH / startW));
    setSizeW(newW);
    setSizeH(newH);
    // Keep the opposite corner fixed.
    const newCx  = isLeft ? startCx + (startW - newW) / scale : startCx;
    const newCy  = isTop
      ? startCy + (startH - newH) / (2 * scale)   // bottom edge fixed
      : startCy + (newH - startH) / (2 * scale);  // top edge fixed
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
      const referenceImages = connections
        .filter((c) => c.toNodeId === instance.id)
        .map((c) => {
          if (c.fromNodeType === "konva") return konvaNodes[c.fromNodeId]?.imageUrl;
          return panels.find((p) => p.id === c.fromNodeId)?.preview;
        })
        .filter((url): url is string => typeof url === "string");

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
        useNodePanel.getState().setPreview(instance.id, result.imageUrl);
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
      {isActive && (
        <div
          style={{
            position: "fixed",
            left: placeholderLeft - TR_PADDING,
            top:  placeholderTop  - TR_PADDING,
            width:  pw + TR_PADDING * 2,
            height: ph + TR_PADDING * 2,
            border: "1.5px solid #000",
            borderRadius: 6,
            zIndex: 51,
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
                width:  ANCHOR_SZ,
                height: ANCHOR_SZ,
                background: "#fff",
                border: "1px solid #000",
                borderRadius: 2,
                transform: "translate(-50%, -50%)",
                cursor: pos.cursor,
                pointerEvents: "auto",
              }}
            />
          ))}
        </div>
      )}

      {/* ── Ports — always visible ── */}
      {/* Input port — left edge, 30% from top */}
      <div
        title="Input"
        style={{
          position: "fixed",
          left: placeholderLeft,
          top:  placeholderTop + ph * 0.3,
          width:  PORT_D,
          height: PORT_D,
          background: "#fff",
          border: "1.5px solid #000",
          borderRadius: "50%",
          transform: "translate(-50%, -50%)",
          cursor: "crosshair",
          pointerEvents: "auto",
          zIndex: 51,
        }}
      />

      {/* Output port — right edge, 30% from top */}
      <div
        title="Output"
        onPointerDown={(e) => {
          e.stopPropagation();
          useConnectionStore.getState().startDrag(instance.id, "panel", e.clientX, e.clientY);
        }}
        style={{
          position: "fixed",
          left: placeholderLeft + pw,
          top:  placeholderTop + ph * 0.3,
          width:  PORT_D,
          height: PORT_D,
          background: "#fff",
          border: "1.5px solid #000",
          borderRadius: "50%",
          transform: "translate(-50%, -50%)",
          cursor: "crosshair",
          pointerEvents: "auto",
          zIndex: 51,
        }}
      />

      {/* ── Placeholder ── */}
      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="rounded-2xl flex flex-col items-center justify-center overflow-hidden relative"
        style={{
          position: "fixed",
          left: placeholderLeft,
          top: placeholderTop,
          width: pw,
          height: ph,
          zIndex: 50,
          background: "#f5f5f5",
          cursor: isPanelOpen ? "pointer" : dragging ? "grabbing" : "move",
          pointerEvents: "auto",
        }}
        title={isPanelOpen ? "Drag to move · Click to collapse" : "Drag to move · Click to open panel"}
      >
        {instance.preview ? (
          <img src={instance.preview} alt="Generated preview" className="w-full h-full object-cover rounded-2xl" />
        ) : (
          <div className="flex flex-col items-center gap-2 select-none">
            <svg
              width="28" height="28" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="1.4"
              strokeLinecap="round" strokeLinejoin="round"
              className="text-neutral-300"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <span className="text-[11px] text-neutral-400 text-center px-3 leading-tight">
              Image will<br />appear here
            </span>
          </div>
        )}
        {dragging && (
          <div className="absolute inset-0 rounded-2xl bg-black/[0.04] ring-2 ring-neutral-400 ring-offset-1" />
        )}
      </button>

      {/* ── Create Image panel ── */}
      {isPanelOpen && (
        <div
          className="w-80 bg-white rounded-2xl shadow-xl flex flex-col"
          style={{
            position: "fixed",
            left: panelLeft,
            top: screenCenterY,
            transform: "translateY(-50%)",
            zIndex: 50,
            border: "1px solid rgba(0,0,0,0.08)",
            maxHeight: "calc(100vh - 2rem)",
            pointerEvents: "auto",
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-5 pt-5 pb-1 shrink-0">
            <div>
              <h2 className="text-base font-semibold text-neutral-900">Create Image</h2>
              <div className="relative mt-0.5" ref={modelPickerRef}>
                {/* Trigger */}
                <button
                  onClick={() => setIsModelOpen((v) => !v)}
                  className="flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  <span>{MODELS.find((m) => m.id === model)?.label ?? model}</span>
                  <ChevronDown
                    size={12}
                    className={`transition-transform duration-150 ${isModelOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {/* Dropdown */}
                {isModelOpen && (
                  <div className="absolute top-full left-0 mt-1.5 w-48 bg-white rounded-xl border border-black/[0.08] shadow-lg z-10 overflow-hidden">
                    {MODELS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => { setModel(m.id); setIsModelOpen(false); }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                          model === m.id
                            ? "bg-neutral-50 text-neutral-900 font-medium"
                            : "text-neutral-600 hover:bg-black/5"
                        }`}
                      >
                        <span>{m.label}</span>
                        {model === m.id && <Check size={13} className="text-neutral-700 shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={onClosePanel}
              className="w-7 h-7 flex items-center justify-center rounded-full text-neutral-400 hover:bg-black/5 hover:text-neutral-700 transition-colors mt-0.5"
            >
              <X size={15} />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto flex flex-col gap-4 px-5 pb-5 pt-3">

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                Instruction
              </p>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Describe the image..."
                rows={3}
                className="w-full resize-none rounded-xl bg-neutral-100 px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-black/10"
              />
            </div>

            <div>
              <button
                onClick={() => setAdvancedOpen((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-neutral-700"
              >
                Advanced
                <ChevronDown
                  size={13}
                  className={`transition-transform duration-150 ${advancedOpen ? "rotate-180" : ""}`}
                />
              </button>

              {advancedOpen && (
                <div className="mt-3 flex flex-col gap-2.5">
                  <div className="flex gap-2">
                    <div className="flex-1 rounded-xl bg-neutral-100 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                        Thinking
                      </p>
                      <select
                        value={thinking}
                        onChange={(e) => setThinking(e.target.value)}
                        className="w-full bg-transparent text-sm text-neutral-700 outline-none cursor-pointer"
                      >
                        {THINKING_OPTS.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="rounded-xl bg-neutral-100 px-3 py-2.5 flex flex-col">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                        Grounding
                      </p>
                      <button
                        onClick={() => setGrounding((v) => !v)}
                        className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${
                          grounding ? "bg-neutral-900" : "bg-neutral-300"
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            grounding ? "translate-x-[18px]" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl bg-neutral-100 px-3 py-2.5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                        Temperature
                      </p>
                      <span className="text-xs text-neutral-500 tabular-nums">
                        {temperature.toFixed(1)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-neutral-400">0</span>
                      <input
                        type="range" min={0} max={2} step={0.1}
                        value={temperature}
                        onChange={(e) => setTemperature(Number(e.target.value))}
                        className="flex-1 accent-neutral-900"
                      />
                      <span className="text-[10px] text-neutral-400">2</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-lg bg-neutral-100 px-2.5 py-1.5">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="1" y="2.5" width="10" height="7" rx="1" />
                </svg>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="bg-transparent text-xs text-neutral-700 outline-none cursor-pointer"
                >
                  {ASPECT_RATIOS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg bg-neutral-100 px-2.5 py-1.5">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 3h2.5v6H1M5.5 3H8a1 1 0 011 1v1a1 1 0 01-1 1H5.5M5.5 6H8.5a1 1 0 011 1v1a1 1 0 01-1 1H5.5" />
                </svg>
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value)}
                  className="bg-transparent text-xs text-neutral-700 outline-none cursor-pointer"
                >
                  {QUALITIES.map((q) => <option key={q}>{q}</option>)}
                </select>
              </div>
            </div>

            {genError && (
              <p className="text-xs text-red-500 text-center -mt-1 leading-snug">
                {genError}
              </p>
            )}

            <button
              onClick={handleCreate}
              disabled={!instruction.trim() || isGenerating}
              className={`w-full rounded-xl py-3 text-sm font-medium text-white select-none flex items-center justify-center gap-2 transition-opacity ${
                !instruction.trim() || isGenerating
                  ? "bg-neutral-900 cursor-not-allowed opacity-40"
                  : "bg-neutral-900 cursor-pointer hover:opacity-90 active:opacity-80"
              }`}
            >
              {isGenerating && <Loader2 size={14} className="animate-spin shrink-0" />}
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
      {panels.map((p) => (
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
        />
      ))}
    </>
  );
}
