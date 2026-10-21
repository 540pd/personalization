import type { PanelDraft, PanelInstance, PanelOutput } from "./types";

/** `panels` with `patch` merged into the panel `id`; every other panel is kept as is. */
export function patchPanel(panels: PanelInstance[], id: string, patch: Partial<PanelInstance>): PanelInstance[] {
  return panels.map((p) => (p.id === id ? { ...p, ...patch } : p));
}

// An arriving result ends the job it came from.
export const setOutput = (panels: PanelInstance[], id: string, output: PanelOutput) =>
  patchPanel(panels, id, { output, job: undefined });

export const setJob = (panels: PanelInstance[], id: string, job: string | undefined) =>
  patchPanel(panels, id, { job });

export const setLabel = (panels: PanelInstance[], id: string, label: string, auto: boolean) =>
  patchPanel(panels, id, { label, labelAuto: auto });

export const setDraft = (panels: PanelInstance[], id: string, draft: PanelDraft) =>
  patchPanel(panels, id, { draft });
