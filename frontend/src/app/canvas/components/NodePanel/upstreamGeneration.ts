import { create } from "zustand";
import { useConnectionStore } from "@/store/connection.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import type { Reference } from "@/types/canvas.types";
import { relabel, takenLabels } from "@/lib/canvas/labels";
import { canvasHistory } from "@/lib/canvas/history";
import { kindSpec, panelOutput } from "./kinds";

type Progress = { status: "generating" | "error"; error?: string };

interface GenerationProgressState {
  byId: Record<string, Progress>;
  setProgress: (id: string, progress: Progress | null) => void;
}

/** Transient UI state: a failed node stays marked until the next attempt. */
export const useGenerationProgress = create<GenerationProgressState>((set) => ({
  byId: {},
  setProgress: (id, progress) => set((state) => {
    const byId = { ...state.byId };
    if (progress) byId[id] = progress;
    else delete byId[id];
    return { byId };
  }),
}));

const inFlight = new Map<string, Promise<void>>();

function panel(id: string): PanelInstance {
  const found = useNodePanel.getState().panels.find((p) => p.id === id);
  if (!found) throw new Error(`Connected node ${id} is missing.`);
  return found;
}

function instructionLabel(instruction: string): string {
  const words = instruction.trim().split(/\s+/).slice(0, 6).join(" ");
  return words.length > 40 ? `${words.slice(0, 40).trimEnd()}…` : words;
}

/** Read after predecessors finish, never from a snapshot taken before the first await. */
export function referencesFor(id: string): Reference[] {
  return useConnectionStore.getState().connections
    .filter((c) => c.toNodeId === id)
    .map((c): Reference => {
      if (c.fromNodeType === "konva") {
        const source = useKonvaNodes.getState().nodes[c.fromNodeId];
        if (!source?.imageUrl) throw new Error(`Connected image ${c.fromNodeId} is missing.`);
        return { kind: "image", url: source.imageUrl, name: source.label };
      }
      const source = panel(c.fromNodeId);
      const output = panelOutput(source);
      if (output?.type === "text") return { kind: "text", text: output.value, name: source.label };
      if (output?.type === "image") return { kind: "image", url: output.value, name: source.label };
      throw new Error(`Connected node ${source.label || source.id} has no usable output.`);
    });
}

/** Generate only missing ancestors, in dependency order. Existing results are reused. */
export async function generateUpstream(id: string, signal: AbortSignal): Promise<Reference[]> {
  async function ensure(sourceId: string, path: Set<string>): Promise<void> {
    if (path.has(sourceId)) throw new Error("Connections contain a cycle.");
    const source = panel(sourceId);
    if (panelOutput(source)) return;

    const running = inFlight.get(sourceId);
    if (running) return running;

    const nextPath = new Set(path).add(sourceId);
    const task = (async () => {
      const progress = useGenerationProgress.getState().setProgress;
      let generatingHere = false;
      try {
        progress(sourceId, null);
        for (const connection of useConnectionStore.getState().connections.filter(
          (c) => c.toNodeId === sourceId && c.fromNodeType === "panel"
        )) await ensure(connection.fromNodeId, nextPath);

        if (signal.aborted) return;
        // A concurrent request may have completed the node while we waited.
        if (panelOutput(panel(sourceId))) return;
        const current = panel(sourceId);
        const spec = kindSpec(current.kind);
        const draft = current.draft;
        if (!draft?.instruction.trim() || spec.authored) {
          generatingHere = true;
          throw new Error(`Add an instruction to ${current.label || current.id} before creating downstream nodes.`);
        }
        generatingHere = true;
        progress(sourceId, { status: "generating" });
        // A dependency needs one usable result even if its image panel is set
        // to make variants when the user explicitly creates on that panel.
        const output = current.job && spec.resume
          ? await spec.resume(current.job, signal)
          : await spec.generate({
              modelId: draft.model || spec.defaultModel || spec.models[0]?.id || "",
              instruction: draft.instruction.trim(),
              settings: { ...spec.defaultSettings, ...draft.settings },
              references: referencesFor(sourceId),
              onJobStarted: (jobId) => useNodePanel.getState().setJob(sourceId, jobId),
              signal,
            });
        if (signal.aborted) return;
        const latest = panel(sourceId);
        useNodePanel.getState().setOutput(sourceId, output);
        if (!latest.label || latest.labelAuto) {
          const name = relabel(latest.label, instructionLabel(draft.instruction), takenLabels());
          useNodePanel.getState().setLabel(sourceId, name, true);
        }
        canvasHistory.commit();
      } catch (err) {
        if (!signal.aborted && generatingHere) {
          useNodePanel.getState().setJob(sourceId, undefined);
          progress(sourceId, { status: "error", error: err instanceof Error ? err.message : "Generation failed." });
        }
        throw err;
      } finally {
        if (useGenerationProgress.getState().byId[sourceId]?.status === "generating") progress(sourceId, null);
      }
    })();
    inFlight.set(sourceId, task);
    try { await task; } finally { if (inFlight.get(sourceId) === task) inFlight.delete(sourceId); }
  }

  for (const connection of useConnectionStore.getState().connections.filter(
    (c) => c.toNodeId === id && c.fromNodeType === "panel"
  )) await ensure(connection.fromNodeId, new Set([id]));
  if (signal.aborted) return [];
  return referencesFor(id);
}