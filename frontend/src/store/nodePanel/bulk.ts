import { deactivated } from "./selection";
import type { NewId, PanelInstance, PanelsState, VariantPlacement } from "./types";

/**
 * Copies of `sources`, offset by `offset`, as the new selection, plus the map
 * of old id → new id. `state` is null when there is nothing to paste.
 */
export function pastePanels(
  s: PanelsState, sources: PanelInstance[], offset: number, newId: NewId,
): { state: PanelsState | null; idMap: Record<string, string> } {
  const idMap: Record<string, string> = {};
  if (!sources.length) return { state: null, idMap };
  const copies = sources.map((src): PanelInstance => {
    const id = newId();
    idMap[src.id] = id;
    return {
      id,
      kind: src.kind,
      canvasX: src.canvasX + offset,
      canvasY: src.canvasY + offset,
      w: src.w,
      h: src.h,
      output: src.output,
      draft: src.draft,
      label: src.label,
      labelAuto: src.labelAuto,
      // No job: the original's in-flight generation stays the original's.
      // Copying it would make both nodes poll the same job.
      isActive: true,
      isPanelOpen: false,
    };
  });
  return {
    idMap,
    state: {
      selectedId: copies.length === 1 ? copies[0].id : null,
      panels: [...deactivated(s.panels), ...copies],
    },
  };
}

/** Returns `panels` itself when there is no source or nothing to add. */
export function addVariants(
  panels: PanelInstance[], sourceId: string, placements: VariantPlacement[], newId: NewId,
): PanelInstance[] {
  const source = panels.find((p) => p.id === sourceId);
  if (!source || !placements.length) return panels;
  const copies: PanelInstance[] = placements.map((v) => ({
    id: newId(),
    kind: source.kind,
    canvasX: v.canvasX,
    canvasY: v.canvasY,
    w: source.w,
    h: source.h,
    isActive: false,
    isPanelOpen: false,
    output: v.output,
    label: v.label,
    // A copy named from an auto-named source follows its own prompt too.
    labelAuto: source.labelAuto,
    // Settings copied, not shared: editing one variant's settings must not
    // quietly change its siblings.
    draft: source.draft && {
      ...source.draft,
      settings: source.draft.settings && { ...source.draft.settings },
    },
  }));
  return [...panels, ...copies];
}

/** `snapshot` as the board, keeping each surviving panel's typing from `current`. */
export function replaceAll(
  current: PanelInstance[], snapshot: PanelInstance[], restoresDraft?: (p: PanelInstance) => boolean,
): PanelInstance[] {
  const drafts = new Map(current.map((p) => [p.id, p.draft]));
  return snapshot.map((p) => {
    if (!drafts.has(p.id) || restoresDraft?.(p)) return p;
    const draft = drafts.get(p.id);
    // Settings are undo steps (they can resize the node), so they come
    // back with the snapshot along with the size they produced. The
    // instruction and model are typing, not steps, and stay as they are.
    return {
      ...p,
      draft: draft ? { ...draft, settings: p.draft?.settings } : p.draft,
    };
  });
}
