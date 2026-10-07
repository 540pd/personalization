"use client";

// Luma reference: IMG-02/03. The panel beside a node, driven entirely by its
// kind's spec — this component knows nothing about images, video or text.
//
// Deliberately free of store imports: everything arrives as props, so it can
// be unit-tested without a Konva stage or a live store.

import { useState, useRef, useEffect } from "react";
import { X, ChevronDown, Check, Loader2 } from "lucide-react";
import { COLORS, Z_INDEX } from "@/constants/canvas.constants";
import type { NodeKindSpec, NodeSettings } from "./nodeKinds";

/** What the user has typed and chosen. Outlives a panel close, so the parent owns it. */
export interface GenerateDraft {
  model: string;
  instruction: string;
}

export interface GenerateFormProps {
  spec: NodeKindSpec;
  /**
   * All of this is parent-owned, because this component unmounts whenever the
   * panel collapses. Keeping the draft or the in-flight flag here would throw
   * away a half-written prompt every time the user clicks the placeholder.
   */
  draft: GenerateDraft;
  onDraftChange: (next: GenerateDraft) => void;
  /** Settings also decide the node's footprint via spec.sizeFor. */
  settings: NodeSettings;
  onSettingsChange: (next: NodeSettings) => void;
  busy: boolean;
  error: string | null;
  /** Screen position of the panel's left edge and vertical centre. */
  left: number;
  top: number;
  onClose: () => void;
  /** Seeds the node's name while the user is still configuring it. */
  onInstructionBlur: () => void;
  onSubmit: () => void;
}

export default function GenerateForm({
  spec, draft, onDraftChange, settings, onSettingsChange, busy, error,
  left, top, onClose, onInstructionBlur, onSubmit,
}: GenerateFormProps) {
  // Only chrome state lives here; resetting it on reopen is harmless.
  const [isModelOpen, setIsModelOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  const { model, instruction } = draft;

  // Close the model picker on outside click.
  useEffect(() => {
    if (!isModelOpen) return;
    const handler = (e: MouseEvent) => {
      if (!modelPickerRef.current?.contains(e.target as Node)) setIsModelOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isModelOpen]);

  const canSubmit = !!instruction.trim() && !busy;

  const { Advanced, Options } = spec;

  return (
    <div
      className="node-panel-create"
      style={{
        position: "fixed",
        left,
        top,
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
          <h2 className="node-panel-title">{spec.title}</h2>

          <div className="node-panel-model-wrapper" ref={modelPickerRef}>
            <button onClick={() => setIsModelOpen((v) => !v)} className="node-panel-model-trigger">
              <span>{spec.models.find((m) => m.id === model)?.label ?? model}</span>
              <ChevronDown
                size={12}
                className={`node-panel-chevron ${isModelOpen ? "node-panel-chevron-open" : ""}`}
              />
            </button>

            {isModelOpen && (
              <div className="node-panel-model-dropdown">
                {spec.models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onDraftChange({ ...draft, model: m.id });
                      setIsModelOpen(false);
                    }}
                    className={`node-panel-model-option ${
                      model === m.id
                        ? "node-panel-model-option-active"
                        : "node-panel-model-option-inactive"
                    }`}
                  >
                    <span>{m.label}</span>
                    {model === m.id && <Check size={13} className="node-panel-model-check" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <button onClick={onClose} className="node-panel-close-button" aria-label="Close">
          <X size={15} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="node-panel-body">
        <div>
          <p className="node-panel-section-label">Instruction</p>
          <textarea
            value={instruction}
            onChange={(e) => onDraftChange({ ...draft, instruction: e.target.value })}
            onBlur={onInstructionBlur}
            placeholder={spec.prompt}
            rows={3}
            className="node-panel-instruction"
          />
        </div>

        {Advanced && (
          <div>
            <button
              onClick={() => setAdvancedOpen((v) => !v)}
              className="node-panel-advanced-trigger"
            >
              Advanced
              <ChevronDown
                size={13}
                className={`node-panel-chevron ${advancedOpen ? "node-panel-chevron-open" : ""}`}
              />
            </button>

            {advancedOpen && <Advanced value={settings} onChange={onSettingsChange} />}
          </div>
        )}

        {Options && <Options value={settings} onChange={onSettingsChange} />}

        {error && <p className="node-panel-error">{error}</p>}

        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className={`node-panel-create-button ${
            canSubmit ? "node-panel-create-button-enabled" : "node-panel-create-button-disabled"
          }`}
        >
          {busy && <Loader2 size={14} aria-hidden className="node-panel-loader" />}
          {busy ? "Creating…" : "Create"}
        </button>
      </div>
    </div>
  );
}
