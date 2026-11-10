import type Konva from "konva";
import { useToolStore } from "@/store/tool.store";

/**
 * Nodes are draggable only in pointer mode. Sole owner of that rule: call it
 * after adding a node and whenever the active tool changes.
 *
 * Reads the tool here rather than capturing it at construction. That is the
 * whole point -- capturing it meant a node created under another tool stayed
 * permanently undraggable, because its draggable flag was fixed at the value
 * the tool had when the layer was built.
 *
 * Accepts a Group as well as a Layer so a test can pass a bare Konva.Group:
 * a Stage cannot be constructed under jsdom, but a Group needs no canvas.
 */
export function applyDraggability(container: Konva.Container): void {
  const draggable = useToolStore.getState().activeTool === "pointer";
  (container.find(".selectable") as Konva.Shape[]).forEach((n) => n.draggable(draggable));
}
