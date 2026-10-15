// Delete for Konva nodes, and copy and paste for everything on the canvas.
//
// Delete stays Konva-only: panels and wires each run their own Delete handler
// on the same keypress. Copy and paste cannot be split that way, because a
// pasted wire has to point at the pasted copies of its nodes, so one handler
// owns the clipboard for uploaded images, generated nodes and wires alike.

import Konva from "konva";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useConnectionStore, type Connection } from "@/store/connection.store";
import { useLayerOrder } from "@/store/layerOrder.store";
import { takenLabels, uniqueLabel } from "@/lib/canvas/labels";
import { BoardShape, type BoardShapeConfig } from "./shapes";

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

/** Everything one Ctrl+C captured. */
export interface Clipboard {
  konva: ClipboardEntry[];
  panels: PanelInstance[];
  /** Only wires with both ends among the copied nodes. */
  connections: Connection[];
}

const EMPTY_CLIPBOARD: Clipboard = { konva: [], panels: [], connections: [] };

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

/**
 * Captures the selected uploaded images, the active panels, and every wire
 * that runs between two of them. A wire to an unselected node is left out:
 * its copy would have nothing to attach to.
 */
export function copySelection(selected: Konva.Shape[]): Clipboard {
  const panels = useNodePanel.getState().panels.filter((p) => p.isActive);
  const ids = new Set([...selected.map((n) => n.id()), ...panels.map((p) => p.id)]);
  const connections = useConnectionStore
    .getState()
    .connections.filter((c) => ids.has(c.fromNodeId) && ids.has(c.toNodeId));
  return { konva: copyNodes(selected), panels, connections };
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
        : entry.className === "BoardShape"
          ? new BoardShape(attrs as BoardShapeConfig)
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
  let clipboard: Clipboard = EMPTY_CLIPBOARD;

  return (e: KeyboardEvent) => {
    // Never steal keys from a field the user is typing in.
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.target instanceof HTMLElement && e.target.isContentEditable) return;
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
      const next = copySelection(selected);
      // An empty selection keeps the previous clipboard, as in any editor.
      if (!next.konva.length && !next.panels.length) return;
      clipboard = next;
      return;
    }

    if (mod && e.code === "KeyV") {
      if (!clipboard.konva.length && !clipboard.panels.length) return;
      e.preventDefault();
      const pasted = pasteNodes(deps.layer, clipboard.konva);
      // The copies become the selection, so everything else lets go first.
      deps.transformer.nodes([]);
      useKonvaSelection.getState().deselect();
      if (pasted.length) {
        deps.applyDraggability();
        deps.syncAllNodeGeometry();
        selectNodes(deps.transformer, pasted);
      }
      const idMap: Record<string, string> = {};
      clipboard.konva.forEach((entry, i) => {
        const oldId = entry.attrs.id;
        if (typeof oldId === "string" && oldId) idMap[oldId] = pasted[i].id();
      });
      if (clipboard.panels.length) {
        // After pasteNodes, so the images' new names are already taken and a
        // mixed paste cannot hand the same suffix to an image and a panel.
        const taken = takenLabels();
        const sources = clipboard.panels.map((p) => {
          if (!p.label) return p;
          const label = uniqueLabel(p.label, taken);
          taken.push(label);
          return { ...p, label };
        });
        Object.assign(idMap, useNodePanel.getState().pastePanels(sources, PASTE_OFFSET));
      } else {
        useNodePanel.getState().closeAllPanels();
      }
      useConnectionStore.getState().pasteConnections(clipboard.connections, idMap);
      // A paste is a create, and a newly created node comes to the front.
      // A mixed paste leaves the order alone: one layer has to stay underneath.
      if (!pasted.length) useLayerOrder.getState().raiseDom();
      else if (!clipboard.panels.length) useLayerOrder.getState().raiseCanvas();
      deps.updateSelectionChrome();
      deps.layer.batchDraw();
      // One entry for nodes and wires alike, so one Ctrl+Z takes the paste back.
      deps.saveSnapshot();
    }
  };
}
