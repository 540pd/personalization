"use client";

// Luma reference: UTIL-01 — tldraw-style panel.
// Zoom bar always visible; the map is shown when the panel is open.
// ‹ collapses the panel sideways; › re-expands it.
// Clicking the zoom % opens a shortcut menu above the panel.

import { useState, useEffect, useRef, useCallback } from "react";
import { useViewport } from "@/store/viewport.store";
import MinimapView, { MAP_W } from "./MinimapView";
import ZoomBar from "./ZoomBar";
import ZoomMenu, { type ZoomMenuItem } from "./ZoomMenu";
import "./Minimap.scss";

const ZOOM_STEP = 0.1;

export default function Minimap() {
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isZoomMenuOpen, setIsZoomMenuOpen] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  const { scale, reset } = useViewport();

  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const zoom = useCallback((direction: 1 | -1) => {
    const { x: sx, y: sy, scale: s } = useViewport.getState();
    const newScale = Math.min(
      4,
      Math.max(0.1, Math.round((s + direction * ZOOM_STEP) * 100) / 100)
    );
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const ratio = newScale / s;
    useViewport.setState({
      scale: newScale,
      x: cx - ratio * (cx - sx),
      y: cy - ratio * (cy - sy),
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        zoom(1);
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        zoom(-1);
      }
      if (e.shiftKey && e.key === "0") {
        e.preventDefault();
        reset();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [zoom, reset]);

  useEffect(() => {
    if (!isZoomMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setIsZoomMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isZoomMenuOpen]);

  const at100 = Math.round(scale * 100) === 100;

  const close = (fn: () => void) => () => {
    fn();
    setIsZoomMenuOpen(false);
  };

  const zoomMenuItems: ZoomMenuItem[] = [
    { label: "Zoom in", shortcut: "Ctrl + =", disabled: false, action: close(() => zoom(1)) },
    { label: "Zoom out", shortcut: "Ctrl + –", disabled: false, action: close(() => zoom(-1)) },
    { label: "Zoom to 100%", shortcut: "⇧ + 0", disabled: at100, action: close(() => { if (!at100) reset(); }) },
    { label: "Zoom to fit", shortcut: "⇧ + 1", disabled: false, action: close(reset) },
    { label: "Zoom to selection", shortcut: "⇧ + 2", disabled: false, action: close(() => {}) },
  ];

  return (
    <div
      ref={containerRef}
      className="minimap-container"
      style={{ width: isMapOpen ? MAP_W : "auto" }}
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

        {isMapOpen && <MinimapView size={size} />}
      </div>
    </div>
  );
}
