"use client";

// Keyboard: V → pointer, F → frame, R/A/L/O → rectangle/arrow/line/ellipse,
// S → last-used shape, T → text, ⌘U/Ctrl+U → upload,
// Esc → pointer + close all submenus. A shape hidden in Settings has no key
// (#404).

import { useEffect } from "react";
import hotkeys from "hotkeys-js";
import { useToolStore, shapeTool, type ShapeKind } from "@/store/tool.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useSettings } from "@/store/settings.store";
import { boardKeyAllowed } from "@/lib/canvas/boardKeys";
import { toolShown } from "../../settings/settings";
import { SHAPE_ITEMS } from "./items";

/** Read at the keypress, so a change in Settings needs no rebinding. */
function shapeShown(kind: ShapeKind): boolean {
  return toolShown(useSettings.getState().settings, shapeTool(kind));
}

/**
 * Binds the dock's tool keys while the dock is mounted. `closeMenus` and
 * `openFilePicker` should be stable, or the keys are rebound on each change.
 */
export function useDockHotkeys(closeMenus: () => void, openFilePicker: () => void): void {
  const setTool = useToolStore((s) => s.setTool);
  const clearSelection = useNodePanel((s) => s.clearSelection);

  useEffect(() => {
    // Every binding below is a board tool, so none may fire while another
    // page covers the board (#206), nor from a text field or a dialog. One gate
    // on hotkeys' filter, the board's own, rather than a check in each.
    const defaultFilter = hotkeys.filter;
    hotkeys.filter = (e) => boardKeyAllowed(e);

    hotkeys("v", () => {
      setTool("pointer");
    });

    hotkeys("escape", () => {
      setTool("pointer");
      closeMenus();
      clearSelection();
    });

    hotkeys("f", () => {
      setTool("frame");
    });

    hotkeys("t", (e) => {
      if (!(e.ctrlKey || e.metaKey || e.altKey)) setTool("text");
    });

    // Bare letters only: Ctrl+R is reload and Ctrl+S is save, and neither
    // should arm a shape on the way past.
    const bare = (e: KeyboardEvent) => !(e.ctrlKey || e.metaKey || e.altKey);
    SHAPE_ITEMS.forEach(({ kind, shortcut }) => {
      if (!shortcut) return;
      hotkeys(shortcut.toLowerCase(), (e) => {
        if (bare(e) && shapeShown(kind)) setTool(shapeTool(kind));
      });
    });
    hotkeys("s", (e) => {
      if (!bare(e)) return;
      // The last shape if it is still offered, else the menu's first; none
      // shown and S does nothing, as there is no Shapes button either.
      const last = useToolStore.getState().lastShape;
      const kind = shapeShown(last) ? last : SHAPE_ITEMS.find((item) => shapeShown(item.kind))?.kind;
      if (kind) setTool(shapeTool(kind));
    });

    hotkeys("command+u,ctrl+u", (e) => {
      e.preventDefault();
      openFilePicker();
    });

    return () => {
      hotkeys.filter = defaultFilter;
      hotkeys.unbind("v");
      hotkeys.unbind("escape");
      hotkeys.unbind("f");
      hotkeys.unbind("t");
      SHAPE_ITEMS.forEach(({ shortcut }) => shortcut && hotkeys.unbind(shortcut.toLowerCase()));
      hotkeys.unbind("s");
      hotkeys.unbind("command+u,ctrl+u");
    };
  }, [setTool, clearSelection, closeMenus, openFilePicker]);
}
