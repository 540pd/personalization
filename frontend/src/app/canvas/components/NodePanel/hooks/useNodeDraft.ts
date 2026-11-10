import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { labelFromInstruction, takenLabels, uniqueLabel } from "@/lib/canvas/labels";
import type { GenerateDraft } from "../GenerateForm";
import type { NodeKindSpec } from "../nodeKinds";
import { useNodeSettings } from "./useNodeSettings";

/**
 * A node's draft (model and instruction) with its settings, and the ways to
 * change them (#468, moved out of NodePanel).
 *
 * The draft lives in the store, not in GenerateForm: the form unmounts
 * whenever the panel collapses, a half-written prompt must survive that,
 * and a copy of the node carries it. In-flight state stays local.
 */
export function useNodeDraft(instance: PanelInstance, spec: NodeKindSpec) {
  const draft: GenerateDraft = instance.draft ?? {
    model: spec.defaultModel ?? spec.models[0]?.id ?? "",
    instruction: "",
  };
  const { settings, setSettings } = useNodeSettings(instance, spec, draft);

  const setDraft = (next: GenerateDraft) =>
    useNodePanel.getState().setDraft(instance.id, { model: next.model, instruction: next.instruction, settings });

  /**
   * The instruction field lost focus: save it, and seed the node's name from
   * it as soon as there is one rather than waiting for a result -- a node
   * needs identifying while you are still configuring it. Never over a name
   * the node already has.
   */
  const commitInstruction = () => {
    setDraft(draft);
    if (instance.label || !draft.instruction.trim()) return;
    useNodePanel.getState().setLabel(instance.id, uniqueLabel(labelFromInstruction(draft.instruction), takenLabels()), true);
  };

  return { draft, settings, setSettings, setDraft, commitInstruction };
}
