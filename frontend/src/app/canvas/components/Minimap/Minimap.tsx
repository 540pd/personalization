"use client";

// Luma reference: UTIL-01 — tldraw-style panel.
// Zoom bar always visible; the map is shown when the panel is open.
// ‹ collapses the panel sideways; › re-expands it.
// Clicking the zoom % opens a shortcut menu above the panel.

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useDismiss } from "@/lib/dom/useDismiss";
import { useViewport } from "@/store/viewport.store";
import { useCanvasArea, canvasArea } from "../../canvasArea";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { boardKeyAllowed } from "@/lib/canvas/boardKeys";
import { modKeyLabel } from "@/lib/dom/keys";
import { listen } from "@/lib/dom/listen";
import { unionBounds } from "./world";
import { zoomStep, fitTo, zoomShortcutFor, shortcutLabel, ZOOM_SHORTCUTS, type ZoomAction } from "./zoom";
import { currentBounds, currentSelectionBounds } from "./boardBounds";
import MinimapView, { MAP_W } from "./MinimapView";
import ZoomBar from "./ZoomBar";
import ZoomMenu, { type ZoomMenuItem } from "./ZoomMenu";
import "./Minimap.scss";

/** Distance from the canvas area's left edge and from the window's bottom. */
const EDGE = 24;
/** Least space kept between the bar and the floating dock. */
const DOCK_GAP = 12;

/**
 * How far above the window's bottom the bar sits: EDGE, or just above the
 * dock when the two would touch side by side (#204).
 *
 * The dock is centred on the window, not on the canvas area, so with the
 * rail expanded and the map open they meet below ~1300px. Lifting the bar
 * keeps it in its corner at every width, where shifting either sideways
 * would move it out of the corner or the dock off centre. Measured rather
 * than assumed, so it holds whatever the dock's width.
 */
function useDockClearance(left: number, isMapOpen: boolean, barRef: React.RefObject<HTMLDivElement | null>) {
  const [bottom, setBottom] = useState(EDGE);
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    let dock: Element | null = null;
    let retry = 0;
    const measure = () => {
      cancelAnimationFrame(retry);
      if (!dock) {
        dock = document.querySelector(".floating-dock");
        if (dock) observer.observe(dock);
      }
      if (!dock) {
        // Not mounted yet: look again next frame, which nothing else would.
        retry = requestAnimationFrame(measure);
        return setBottom(EDGE);
      }
      const d = dock.getBoundingClientRect();
      // From the bar's resting left, not its rect: mid-transition the rect is
      // still on its way there.
      const right = left + bar.offsetWidth;
      setBottom(right + DOCK_GAP > d.left ? Math.round(window.innerHeight - d.top + DOCK_GAP) : EDGE);
    };
    // Either one changing size changes the answer: the bar with its zoom
    // label and map, the dock as it lays out -- and the window moves the dock.
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    measure();
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(retry);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [left, isMapOpen, barRef]);
  return bottom;
}

export default function Minimap() {
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isZoomMenuOpen, setIsZoomMenuOpen] = useState(false);
  // The visible canvas, not the window: the sidebar covers the left edge, so
  // the indicator would otherwise draw a viewport wider than you can see.
  const area = useCanvasArea();

  const containerRef = useRef<HTMLDivElement>(null);

  const { scale, reset } = useViewport();
  // The canvas area starts at the rail's edge in both rail states (#204).
  const left = (area.left ?? 0) + EDGE;
  const bottom = useDockClearance(left, isMapOpen, containerRef);
  // Subscribed, not read imperatively: the menu's disabled states have to
  // update as the selection changes while it is open.
  const selectedNodeIds = useKonvaSelection((s) => s.nodeIds);
  const panels = useNodePanel((s) => s.panels);

  const zoom = (direction: 1 | -1) =>
    useViewport.setState(zoomStep(useViewport.getState(), direction, canvasArea()));

  /** Fit a set of boxes, or do nothing if there are none. */
  const fit = (boxes: ReturnType<typeof currentBounds>) => {
    const box = unionBounds(boxes);
    if (box) useViewport.setState(fitTo(box, canvasArea()));
  };

  const actions: Record<ZoomAction, () => void> = {
    in: () => zoom(1),
    out: () => zoom(-1),
    reset,
    fit: () => fit(currentBounds()),
    selection: () => fit(currentSelectionBounds()),
  };
  // Always-fresh, so the listener below is added once.
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    return listen(window, "keydown", (e) => {
      // Same guard Board uses. Without it, Ctrl+– while writing a prompt
      // zoomed the canvas instead of reaching the field.
      if (!boardKeyAllowed(e)) return;
      const shortcut = zoomShortcutFor(e);
      if (!shortcut) return;
      e.preventDefault();
      actionsRef.current[shortcut.action]();
    });
  }, []);

  useDismiss(isZoomMenuOpen, [containerRef], () => setIsZoomMenuOpen(false));

  const at100 = Math.round(scale * 100) === 100;
  const hasSelection = selectedNodeIds.length > 0 || panels.some((p) => p.isActive);

  const close = (fn: () => void) => () => {
    fn();
    setIsZoomMenuOpen(false);
  };

  const disabled: Partial<Record<ZoomAction, boolean>> = {
    reset: at100,
    // Was always enabled and always did nothing. Disabled with no selection
    // is the honest state; with one, it now works.
    selection: !hasSelection,
  };
  const mod = modKeyLabel();
  const zoomMenuItems: ZoomMenuItem[] = ZOOM_SHORTCUTS.map((s) => ({
    label: s.label,
    shortcut: shortcutLabel(s, mod),
    disabled: !!disabled[s.action],
    action: close(actions[s.action]),
  }));

  return (
    <div
      ref={containerRef}
      className="minimap-container"
      style={{ width: isMapOpen ? MAP_W : "auto", left, bottom }}
    >
      {isZoomMenuOpen && <ZoomMenu items={zoomMenuItems} />}

      <div className="minimap-panel">
        <ZoomBar
          percent={Math.round(scale * 100)}
          isMapOpen={isMapOpen}
          onZoomIn={() => zoom(1)}
          onZoomOut={() => zoom(-1)}
          onTogglePercentMenu={() => setIsZoomMenuOpen((v) => !v)}
          onToggleMap={() => setIsMapOpen((v) => !v)}
        />

        {isMapOpen && <MinimapView area={area} />}
      </div>
    </div>
  );
}
