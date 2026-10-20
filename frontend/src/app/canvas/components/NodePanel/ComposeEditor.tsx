"use client";

import { useRef } from "react";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { NODE_CORNER_RADIUS, Z_INDEX } from "@/constants/canvas.constants";
import { canvasHistory } from "@/lib/canvas/history";
import { labelFromText, relabel, takenLabels } from "@/lib/canvas/labels";
import type { GenerateDraft } from "./GenerateForm";
import type { NodeKindSpec, NodeSettings } from "./nodeKinds";

interface ComposeEditorProps {
  instance: PanelInstance;
  spec: NodeKindSpec;
  draft: GenerateDraft;
  settings: NodeSettings;
  /** Top-left on screen, and the size in canvas units. */
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
  onClose: () => void;
}

// ── Authored kinds: in-place editing (#181) ──
// Laid over the box in canvas units and scaled the same way, so the text
// does not move when it opens. Plain text: a paste keeps markdown as typed.
// Board shortcuts all ignore keys aimed at a textarea. Mounted only while
// editing, so one node at a time; closing it is what saves the name.
export default function ComposeEditor({
  instance, spec, draft, settings, left, top, width, height, scale, onClose,
}: ComposeEditorProps) {
  // The text when the editor opened: closing it after a change is an undo step.
  const textAtOpen = useRef(draft.instruction);

  // Every keystroke goes to the store, as the panel's instruction does, so a
  // reload mid-edit keeps what was written.
  const handleTextChange = (text: string) =>
    useNodePanel.getState().setDraft(instance.id, { model: draft.model, instruction: text, settings });

  // Closing the editor names the box from its first line. An auto name
  // follows the text, as one follows the prompt after a generate (#130); a
  // name the user chose is kept. A changed text is one undo step with its
  // name -- unlike a prompt, it is the node's whole content, and without the
  // step an undone delete brought the box back empty.
  const finishEditing = () => {
    onClose();
    const store = useNodePanel.getState();
    const current = store.panels.find((p) => p.id === instance.id);
    const text = current?.draft?.instruction ?? "";
    if (!current || text === textAtOpen.current) return;
    if (text.trim() && (!current.label || current.labelAuto)) {
      const name = relabel(current.label, labelFromText(text), takenLabels());
      if (name !== current.label || !current.labelAuto) store.setLabel(instance.id, name, true);
    }
    canvasHistory.commit();
  };

  // Opened with the caret after the last character, ready to carry on writing.
  const focusEditor = (el: HTMLTextAreaElement | null) => {
    if (!el || document.activeElement === el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  };

  return (
    <textarea
      ref={focusEditor}
      aria-label={`${spec.title} text`}
      className="node-panel-compose-editor"
      value={draft.instruction}
      onChange={(e) => handleTextChange(e.target.value)}
      onBlur={finishEditing}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      spellCheck
      style={{
        position: "fixed",
        left,
        top,
        width,
        height,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        zIndex: Z_INDEX.nodes + 1,
        borderRadius: NODE_CORNER_RADIUS,
      }}
    />
  );
}
