// Undo / redo for the nodes on Board's layer.
//
// Registered against the one shared timeline (lib/canvas/history) rather
// than kept here, so a Ctrl+Z is chronological across node kinds instead
// of draining this stack before the panel one.
//
// Snapshots hold live node references on purpose: re-creating a
// Konva.Image on undo would reload its bitmap. That makes them valid only
// while this layer lives, which is why Board's cleanup clears the
// timeline.

import type Konva from "konva";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useFrames } from "@/store/frame.store";
import { canvasHistory } from "@/lib/canvas/history";
import type { HoverOutline } from "./hoverOutline";
import type { BoardLayerDeps } from "./boardContext";
import { deleteFrameBitmap, saveFrameBitmap, saveFrameImagePositions } from "./frameImageStorage";

// imageUrl and label live in konvaNodes, not on the shape, and Delete drops
// that record -- so they ride along, or an undone delete would bring back an
// image with no name and nothing to send as a generation reference.
export type Snapshot = Array<{
  node: Konva.Shape;
  attrs: Record<string, unknown>;
  imageUrl?: string;
  label?: string;
}>;

type HistoryDeps = Omit<BoardLayerDeps, "saveSnapshot"> & { hover: HoverOutline };

/**
 * Takes the container as a Layer or a Group so a test can pass a bare
 * Konva.Group: a Stage cannot be constructed under jsdom.
 */
export function captureLayer(layer: Konva.Container): Snapshot {
  const records = useKonvaNodes.getState().nodes;
  return (layer.find(".selectable") as Konva.Shape[]).map((n) => ({
    node: n,
    attrs: { ...n.getAttrs() },
    imageUrl: records[n.id()]?.imageUrl,
    label: records[n.id()]?.label,
  }));
}

export function restoreSnapshot(snap: Snapshot, deps: HistoryDeps): void {
  const { root, layerFor, transformer } = deps;
  transformer.nodes([]);
  // The store as well, or anything drawn from it -- a line's end
  // handles -- would outlive the selection the transformer just dropped.
  useKonvaSelection.getState().clearSelection();
  const snapSet = new Set(snap.map((s) => s.node));
  // Remove nodes absent from this snapshot, and their konvaNodes record
  // with them: labels and ports render from the record, so leaving it
  // behind shows the name and port of a node that is no longer there.
  (root.find(".selectable") as Konva.Shape[]).forEach((n) => {
    if (snapSet.has(n)) return;
    if (n.id() && useKonvaNodes.getState().nodes[n.id()]?.imageUrl) {
      void deleteFrameBitmap(n.id()).catch((err) =>
        console.warn("[frames] Could not delete saved image.", err));
    }
    if (n.id()) useKonvaNodes.getState().remove(n.id());
    n.remove();
  });
  // Restore attrs; re-add nodes that were previously removed.
  snap.forEach(({ node, attrs }) => {
    if (!node.getParent()) layerFor(node).add(node);
    node.setAttrs(attrs);
  });
  // Restore stacking. find() returns ascending z, layer by layer, so the
  // snapshot array already encodes the order — raising each in turn replays
  // it within its own layer.
  // Without this, a drag that reordered nodes could not be undone.
  snap.forEach(({ node }) => node.moveToTop());
  deps.syncAllNodeGeometry();
  // Only fill what is missing: a rename is not an undo step, so
  // overwriting a live label would quietly revert it.
  const records = useKonvaNodes.getState().nodes;
  snap.forEach(({ node, imageUrl, label }) => {
    const rec = records[node.id()];
    if (!rec) return;
    const needsBitmap = !!imageUrl && !rec.imageUrl;
    useKonvaNodes.getState().upsert({
      ...rec,
      imageUrl: rec.imageUrl ?? imageUrl,
      label: rec.label ?? label,
    });
    if (needsBitmap) {
      void saveFrameBitmap(node.id(), imageUrl).catch((err) =>
        console.warn("[frames] Could not restore saved image.", err));
    }
  });
  deps.applyDraggability();
  deps.hover.hide(); // the hovered node may no longer exist in this snapshot
  deps.updateSelectionChrome();
  deps.layer.batchDraw();
  deps.shapes.batchDraw();
  // Undo/redo also changes which images belong in the persisted manifest.
  // The keyboard path does not call board.saveSnapshot(), so an undone delete
  // would otherwise restore the bitmap but leave no geometry for reload.
  saveFrameImagePositions(useFrames.getState().frames);
}

/** Joins the shared timeline. Returns what leaves it. */
export function registerKonvaHistory(deps: HistoryDeps): () => void {
  return canvasHistory.register("konva", {
    capture: () => captureLayer(deps.root),
    restore: (snap) => restoreSnapshot(snap as Snapshot, deps),
  });
}
