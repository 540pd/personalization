"use client";

// Luma reference: UTIL-01 — tldraw-style panel.
// Zoom bar always visible; the map is shown when the panel is open.
// ‹ collapses the panel sideways; › re-expands it.
// Clicking the zoom % opens a shortcut menu above the panel.

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useDismiss } from "@/lib/dom/useDismiss";
import { useViewport } from "@/store/viewport.store";
import { useCanvasArea, canvasArea } from "../../canvasArea";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { boardKeyAllowed } from "@/lib/canvas/boardKeys";
import { unionBounds } from "./world";
import { zoomStep, fitTo } from "./zoom";
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


  const zoom = useCallback(
    (direction: 1 | -1) => {
      useViewport.setState(zoomStep(useViewport.getState(), direction, canvasArea()));
    },
    []
  );

  /** Fit a set of boxes, or do nothing if there are none. */
  const fit = useCallback(
    (boxes: ReturnType<typeof currentBounds>) => {
      const box = unionBounds(boxes);
      if (!box) return;
      useViewport.setState(fitTo(box, canvasArea()));
    },
    []
  );

  const zoomToFit = useCallback(() => fit(currentBounds()), [fit]);
  const zoomToSelection = useCallback(() => fit(currentSelectionBounds()), [fit]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Same guard Board uses. Without it, Ctrl+– while writing a prompt
      // zoomed the canvas instead of reaching the field.
      if (!boardKeyAllowed(e)) return;

      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.code === "Equal" || e.code === "NumpadAdd")) {
        e.preventDefault();
        zoom(1);
        return;
      }
      if (mod && (e.code === "Minus" || e.code === "NumpadSubtract")) {
        e.preventDefault();
        zoom(-1);
        return;
      }
      if (mod) return;

      // e.code, not e.key: with Shift held, e.key is the SHIFTED character,
      // so Shift+0 arrives as ")" and `e.key === "0"` was never true. The
      // advertised "Zoom to 100%" shortcut could not fire at all.
      if (!e.shiftKey) return;
      if (e.code === "Digit0") {
        e.preventDefault();
        reset();
      }
      if (e.code === "Digit1") {
        e.preventDefault();
        zoomToFit();
      }
      if (e.code === "Digit2") {
        e.preventDefault();
        zoomToSelection();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [zoom, reset, zoomToFit, zoomToSelection]);

  useDismiss(isZoomMenuOpen, [containerRef], () => setIsZoomMenuOpen(false));

  const at100 = Math.round(scale * 100) === 100;
  const hasSelection = selectedNodeIds.length > 0 || panels.some((p) => p.isActive);

  const close = (fn: () => void) => () => {
    fn();
    setIsZoomMenuOpen(false);
  };

  const zoomMenuItems: ZoomMenuItem[] = [
    { label: "Zoom in", shortcut: "Ctrl + =", disabled: false, action: close(() => zoom(1)) },
    { label: "Zoom out", shortcut: "Ctrl + –", disabled: false, action: close(() => zoom(-1)) },
    { label: "Zoom to 100%", shortcut: "⇧ + 0", disabled: at100, action: close(reset) },
    { label: "Zoom to fit", shortcut: "⇧ + 1", disabled: false, action: close(zoomToFit) },
    {
      label: "Zoom to selection",
      shortcut: "⇧ + 2",
      // Was always enabled and always did nothing. Disabled with no selection
      // is the honest state; with one, it now works.
      disabled: !hasSelection,
      action: close(zoomToSelection),
    },
  ];

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
