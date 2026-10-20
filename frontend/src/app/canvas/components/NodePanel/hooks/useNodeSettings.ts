import { useEffect, useRef, useState } from "react";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { canvasHistory } from "@/lib/canvas/history";
import { resizeNodeForSettings } from "../../../board/aspectResize";
import type { GenerateDraft } from "../GenerateForm";
import type { NodeKindSpec, NodeSettings } from "../nodeKinds";

/**
 * A node's settings, and the one way to change them.
 *
 * Settings live in the node rather than in the form: they decide the node's
 * footprint via spec.sizeFor, which is a parent concern. Seeded from the
 * node, so a copy -- an image variant, a paste -- opens with its source's
 * settings. Spread over the defaults so a setting added later still has a value.
 */
export function useNodeSettings(instance: PanelInstance, spec: NodeKindSpec, draft: GenerateDraft) {
  const [settings, setSettingsState] = useState<NodeSettings>(
    () => ({ ...spec.defaultSettings, ...instance.draft?.settings }) as NodeSettings
  );

  // A settings change is an undo step, and one that changes the node's
  // footprint (aspect ratio) resizes it in the same step (#129). Resizing here,
  // rather than in an effect after render, is what lets the two share one
  // commit. Size is written straight to the store so the snapshot holds it.
  // Compared by value, so an unrelated setting (temperature) does not discard
  // a manual resize.
  //
  // A slider fires on every pixel of a drag; its changes share a coalesce key
  // per field, so one drag is one step. Choices (ratio, quality) do not, so
  // two ratio changes in a row are two steps.
  const settingsKeys = useRef(new Map<string, object>());
  const setSettings = (next: NodeSettings) => {
    const prev = settings;
    setSettingsState(next);
    useNodePanel.getState().setDraft(instance.id, { model: draft.model, instruction: draft.instruction, settings: next });

    const from = spec.sizeFor(prev);
    const to = spec.sizeFor(next);
    if (from.w !== to.w || from.h !== to.h) resizeNodeForSettings(instance.id, to.w, to.h);

    const n = next as unknown as Record<string, unknown>;
    const p = prev as unknown as Record<string, unknown>;
    const changed = Object.keys(n).find((k) => n[k] !== p[k]);
    let key: object | undefined;
    if (changed && typeof n[changed] === "number") {
      key = settingsKeys.current.get(changed) ?? {};
      settingsKeys.current.set(changed, key);
    }
    canvasHistory.commit(key);
  };

  // Undo and redo put the node's draft back, settings included, but the form
  // reads this local copy. Follow the store, compared by value so the round
  // trip through setSettings does not loop. No draft at all is a real state
  // to go back to -- a node nobody has edited yet -- and means the defaults.
  const storedSettings = instance.draft?.settings;
  useEffect(() => {
    setSettingsState((cur) => {
      const merged = { ...spec.defaultSettings, ...storedSettings } as NodeSettings;
      return JSON.stringify(merged) === JSON.stringify(cur) ? cur : merged;
    });
  }, [storedSettings, spec]);

  return { settings, setSettings };
}
