// The Text tool: placing a text, and editing one in place.
//
// Placing follows the frame and shape draws -- Board feeds it the same
// window pointer events -- so a click and a drag are told apart the same
// way. A click places an auto-width text; a drag places a fixed-width one as
// wide as the drag.
//
// Konva cannot take typing, so editing lays an HTML <textarea> exactly over
// the text (the approach of Konva's Editable Text sample) and hides the
// canvas copy until the edit is over. The textarea is sized from the zoom
// and re-placed whenever the viewport moves, so it stays on the text at
// every zoom.

import Konva from "konva";
import type { BoardLayerDeps } from "./boardContext";
import { useToolStore } from "@/store/tool.store";
import { useViewport } from "@/store/viewport.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useLayerOrder } from "@/store/layerOrder.store";
import { selectOnly } from "@/lib/canvas/selection";
import { announceGesture } from "@/lib/canvas/gesture";
import { toScreen } from "@/lib/canvas/coords";
import { boxFromCorners } from "./frame";
import { deleteNodes } from "./clipboard";
import { createText, fitAutoWidth, isAutoWidth } from "./text";
import { joinLayout } from "./autoLayoutDrop";
import { COLORS, SHAPE_CLICK_SLOP, Z_INDEX } from "@/constants/canvas.constants";

export function createTextTool(deps: BoardLayerDeps) {
  let start: Konva.Vector2d | null = null;
  // The dashed box shown while a fixed-width text is being dragged out.
  let preview: Konva.Rect | null = null;
  // The open editor's teardown, so a second edit or an unmount can end it.
  let closeEditor: (() => void) | null = null;

  // --- placing --------------------------------------------------------------

  const onDown = (stage: Konva.Stage): boolean => {
    if (useToolStore.getState().activeTool !== "text") return false;
    const pt = stage.getRelativePointerPosition();
    if (!pt) return false;
    start = pt;
    preview = new Konva.Rect({
      ...pt, width: 0, height: 0,
      stroke: COLORS.selected,
      strokeWidth: 1,
      strokeScaleEnabled: false,
      dash: [4, 4],
      listening: false,
      visible: false,
    });
    deps.layer.add(preview);
    return true;
  };

  const onMove = (stage: Konva.Stage) => {
    if (!start || !preview) return;
    const pt = stage.getRelativePointerPosition();
    if (!pt) return;
    const box = boxFromCorners(start, pt);
    preview.setAttrs(box);
    // Only once it is a drag: a click should not flash a box.
    preview.visible(box.width * stage.scaleX() >= SHAPE_CLICK_SLOP);
    deps.layer.batchDraw();
  };

  const onUp = (stage: Konva.Stage) => {
    if (!start) return;
    const pt = stage.getRelativePointerPosition() ?? start;
    const from = start;
    start = null;
    preview?.destroy();
    preview = null;
    deps.layer.batchDraw();

    const box = boxFromCorners(from, pt);
    const dragged = box.width * stage.scaleX() >= SHAPE_CLICK_SLOP;
    const color = useToolStore.getState().color;
    const node = dragged
      ? createText({ x: box.x, y: box.y }, box.width, color)
      : createText(from, undefined, color);
    // A click is the middle of the first line, not its top edge: that is
    // where the caret is expected to appear.
    if (!dragged) node.y(from.y - (node.fontSize() * node.lineHeight()) / 2);

    // The tool is spent once the editor is up. Left armed, the click that
    // ends the edit would start another text.
    useToolStore.getState().setTool("pointer");
    edit(node, true);
  };

  const cancel = () => {
    preview?.destroy();
    preview = null;
    start = null;
    deps.layer.batchDraw();
  };

  // --- editing --------------------------------------------------------------

  /** Make `node` the only selection, with handles. */
  const selectText = (node: Konva.Text) => {
    selectOnly("node");
    deps.transformer.nodes([node]);
    useKonvaSelection.getState().select(node.id());
    deps.updateSelectionChrome();
  };

  /**
   * Opens the editor on `node`. A new text is not on the board yet: it joins
   * the layer only if something is typed, so an abandoned text never existed
   * and leaves no undo step.
   */
  function edit(node: Konva.Text, isNew: boolean) {
    closeEditor?.();
    const before = node.text();

    const ta = document.createElement("textarea");
    ta.setAttribute("data-testid", "text-editor");
    ta.setAttribute("aria-label", "Text");
    ta.spellcheck = false;
    ta.value = before;
    document.body.appendChild(ta);

    // The canvas copy and its handles step aside: the textarea shows the
    // text while it is being edited, and two copies would not line up
    // through every keystroke. So does the style bar (#164), which would
    // otherwise stay over the text being typed.
    announceGesture(true);
    if (!isNew) {
      deps.transformer.nodes([]);
      deps.updateSelectionChrome();
      node.visible(false);
      deps.layer.batchDraw();
    }

    const place = () => {
      const vp = useViewport.getState();
      const s = vp.scale;
      const at = toScreen({ x: node.x(), y: node.y() }, vp);
      const lineBox = node.fontSize() * node.lineHeight();
      const auto = isAutoWidth(node);
      Object.assign(ta.style, {
        position: "fixed",
        left: `${at.x}px`,
        top: `${at.y}px`,
        // An auto-width editor gets one character of room ahead of the
        // caret, so typing never pushes text out of view before it grows.
        width: `${(node.width() + (auto ? node.fontSize() : 0)) * s}px`,
        height: `${Math.max(node.height(), lineBox) * s}px`,
        margin: "0",
        padding: "0",
        border: "none",
        outline: `1.5px solid ${COLORS.selected}`,
        outlineOffset: "2px",
        background: "transparent",
        resize: "none",
        overflow: "hidden",
        fontSize: `${node.fontSize() * s}px`,
        lineHeight: String(node.lineHeight()),
        fontFamily: node.fontFamily(),
        // The format too (#165), or the text would jump when editing ends.
        fontWeight: node.fontStyle().includes("bold") ? "bold" : "normal",
        fontStyle: node.fontStyle().includes("italic") ? "italic" : "normal",
        textAlign: node.align(),
        color: String(node.fill()),
        whiteSpace: auto ? "pre" : "pre-wrap",
        overflowWrap: auto ? "normal" : "break-word",
        zIndex: String(Z_INDEX.panelForm),
      });
    };

    const onInput = () => {
      node.text(ta.value);
      fitAutoWidth(node);
      place();
    };

    const onKey = (e: KeyboardEvent) => {
      // Keys typed here are text, not board commands. Every board handler
      // already ignores a textarea target; this keeps any added later from
      // having to remember.
      e.stopPropagation();
      if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        finish();
      }
    };

    // A click elsewhere: the text is selected here, and that click then
    // reaches the stage and selects or clears as any click would.
    const onBlur = () => finish();

    const unsubscribe = useViewport.subscribe(place);

    let done = false;
    function finish() {
      if (done) return;
      done = true;
      closeEditor = null;
      unsubscribe();
      ta.removeEventListener("input", onInput);
      ta.removeEventListener("keydown", onKey);
      ta.removeEventListener("blur", onBlur);
      const value = ta.value;
      ta.remove();
      announceGesture(false);

      if (!value.trim()) {
        if (isNew) {
          node.destroy();
        } else {
          deleteNodes([node]);
          useKonvaSelection.getState().deselect();
          deps.syncAllNodeGeometry();
          deps.saveSnapshot();
        }
        deps.layer.batchDraw();
        return;
      }

      node.text(value);
      fitAutoWidth(node);
      node.visible(true);
      if (isNew) {
        node.setAttrs({ id: crypto.randomUUID(), name: "selectable" });
        deps.layer.add(node);
        deps.applyDraggability();
        node.moveToTop();
        useLayerOrder.getState().raiseCanvas();
      }
      deps.syncAllNodeGeometry();
      // New text placed by a click inside a Frame with auto layout joins the
      // row (#228). The click, not the box: the first line is centred on it,
      // so the box can reach past a short Frame's edge. The click was the
      // left edge, halfway down the first line.
      if (isNew) {
        joinLayout(node.id(), { x: node.x(), y: node.y() + (node.fontSize() * node.lineHeight()) / 2 });
      }
      selectText(node);
      deps.layer.batchDraw();
      if (isNew || value !== before) deps.saveSnapshot();
    }

    closeEditor = finish;
    ta.addEventListener("input", onInput);
    ta.addEventListener("keydown", onKey);
    ta.addEventListener("blur", onBlur);
    place();
    // After this pointer gesture's own focus handling has run, or the
    // browser can hand focus straight back to the page.
    requestAnimationFrame(() => {
      if (done) return;
      ta.focus();
      if (!isNew) ta.select();
    });
  }

  /** Ends any open edit, keeping what was typed. For unmount. */
  const close = () => closeEditor?.();

  return { onDown, onMove, onUp, cancel, edit: (n: Konva.Text) => edit(n, false), close };
}
