// Delete, copy and paste for Konva nodes.
//
// Kept together because they share the clipboard and the same notion of
// "what is selected" -- the transformer's node list, which is the source of
// truth for both.

import Konva from "konva";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { takenLabels, uniqueLabel } from "@/lib/canvas/labels";

/**
 * One entry per copied node, so a multi-selection round-trips intact.
 *
 * imageUrl and label ride alongside the Konva attrs because both live in
 * konvaNodes, not on the shape -- without imageUrl a pasted image cannot be
 * used as a generation reference, and without label it pastes nameless.
 */
export interface ClipboardEntry {
  className: string;
  attrs: Record<string, unknown>;
  imageUrl?: string;
  label?: string;
}

/** Offset so a paste does not land exactly on its original. */
const PASTE_OFFSET = 20;

export function copyNodes(selected: Konva.Shape[]): ClipboardEntry[] {
  const registered = useKonvaNodes.getState().nodes;
  return selected.map((n) => ({
    className: n.getClassName(),
    attrs: { ...n.getAttrs() },
    imageUrl: registered[n.id()]?.imageUrl,
    label: registered[n.id()]?.label,
  }));
}

/** Re-creates copied nodes on `layer`, offset, and returns them. */
export function pasteNodes(
  layer: Konva.Layer,
  clipboard: ClipboardEntry[]
): Konva.Shape[] {
  // Seeded once from the board, then grown as this batch is placed: pasting a
  // multi-selection of two "cat"s must yield "cat (2)" and "cat (3)", and the
  // store alone would not yet know about the first of them.
  const taken = takenLabels();

  return clipboard.map((entry) => {
    // A fresh id, never undefined: syncNodeGeometry skips id-less nodes, so
    // an id-less paste would never reach konvaNodes and would end up with no
    // port and no way to connect it to anything.
    const id = crypto.randomUUID();
    const attrs = {
      ...entry.attrs,
      x: ((entry.attrs.x as number) ?? 0) + PASTE_OFFSET,
      y: ((entry.attrs.y as number) ?? 0) + PASTE_OFFSET,
      id,
      name: "selectable",
    };

    const node: Konva.Shape =
      entry.className === "Image"
        ? new Konva.Image(attrs as Konva.ImageConfig)
        : new Konva.Rect(attrs as Konva.RectConfig);

    layer.add(node);

    const label = entry.label ? uniqueLabel(entry.label, taken) : undefined;
    if (label) taken.push(label);

    // label as well as imageUrl: a labelled node with no image still needs a
    // konvaNodes record, or KonvaNodeLabels has nothing to render.
    if (entry.imageUrl || label) {
      useKonvaNodes.getState().upsert({
        id,
        canvasX: node.x(),
        canvasY: node.y(),
        canvasW: node.width() * node.scaleX(),
        canvasH: node.height() * node.scaleY(),
        imageUrl: entry.imageUrl,
        label,
      });
    }

    return node;
  });
}

/**
 * Removes nodes from the layer and from the geometry store.
 *
 * remove(), not destroy(): undo re-adds these same node objects, and destroy()
 * drops a shape from Konva's hit registry, leaving the restored node
 * impossible to click or drag.
 */
export function deleteNodes(selected: Konva.Shape[]): void {
  selected.forEach((n) => {
    const id = n.id();
    if (id) useKonvaNodes.getState().remove(id);
    n.remove();
  });
}

/** Makes `nodes` the selection, in both the transformer and the store. */
export function selectNodes(transformer: Konva.Transformer, nodes: Konva.Shape[]): void {
  transformer.nodes(nodes);
  if (!nodes.length) return;
  const sel = useKonvaSelection.getState();
  sel.select(nodes[0].id());
  nodes.slice(1).forEach((n) => sel.addToSelection(n.id()));
}

export interface EditKeysDeps {
  layer: Konva.Layer;
  transformer: Konva.Transformer;
  applyDraggability: () => void;
  syncAllNodeGeometry: () => void;
  updateSelectionChrome: () => void;
  /** Pass the event to share one undo step with other Delete handlers. */
  saveSnapshot: (coalesceKey?: object) => void;
}

/** Keydown handler for Delete, Ctrl+C and Ctrl+V. */
export function createEditKeysHandler(deps: EditKeysDeps) {
  let clipboard: ClipboardEntry[] = [];

  return (e: KeyboardEvent) => {
    // Never steal keys from a field the user is typing in.
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const mod = e.ctrlKey || e.metaKey;
    const selected = deps.transformer.nodes() as Konva.Shape[];

    if (e.code === "Delete" || e.code === "Backspace") {
      if (!selected.length) return;
      e.preventDefault();
      deps.transformer.nodes([]);
      deps.updateSelectionChrome();
      deleteNodes(selected);
      deps.syncAllNodeGeometry();
      useKonvaSelection.getState().deselect();
      deps.saveSnapshot(e);
      return;
    }

    if (mod && e.code === "KeyC") {
      if (!selected.length) return;
      clipboard = copyNodes(selected);
      return;
    }

    if (mod && e.code === "KeyV") {
      if (!clipboard.length) return;
      e.preventDefault();
      const pasted = pasteNodes(deps.layer, clipboard);
      deps.applyDraggability();
      deps.syncAllNodeGeometry();
      selectNodes(deps.transformer, pasted);
      deps.updateSelectionChrome();
      deps.layer.batchDraw();
      deps.saveSnapshot();
    }
  };
}
