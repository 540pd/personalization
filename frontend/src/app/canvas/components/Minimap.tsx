"use client";

// Luma reference: UTIL-01 — tldraw-style panel.
// Zoom bar always visible; minimap canvas always shown when panel is open.
// < arrow collapses entire panel sideways; > tab re-expands.
// Clicking the zoom % opens a shortcut menu above the panel.

import { useState, useEffect, useRef, useCallback } from "react";
import { useViewport } from "@/store/viewport.store";

const WORLD_W = 4000;
const WORLD_H = 3000;
const MAP_W = 200;
const MAP_H = 130;
const SCALE_X = MAP_W / WORLD_W;
const SCALE_Y = MAP_H / WORLD_H;
const ZOOM_STEP = 0.1;

export default function Minimap() {
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isZoomMenuOpen, setIsZoomMenuOpen] = useState(false);
  const [viewW, setViewW] = useState(0);
  const [viewH, setViewH] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const wasDraggingRef = useRef(false);

  const { x, y, scale, setPosition, reset } = useViewport();

  // Track viewport size for indicator math.
  useEffect(() => {
    const update = () => {
      setViewW(window.innerWidth);
      setViewH(window.innerHeight);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Zoom centered on viewport midpoint.
  const zoom = useCallback((direction: 1 | -1) => {
    const { x: sx, y: sy, scale: s } = useViewport.getState();
    const newScale = Math.min(
      4,
      Math.max(0.1, Math.round((s + direction * ZOOM_STEP) * 100) / 100),
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

  // Global keyboard shortcuts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoom(1); }
      if (mod && e.key === "-") { e.preventDefault(); zoom(-1); }
      if (e.shiftKey && e.key === "0") { e.preventDefault(); reset(); }
      // Shift+1 (zoom to fit) and Shift+2 (zoom to selection) are stubs
      // until canvas object bounds are tracked via the nodes store.
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [zoom, reset]);

  // Close zoom menu on click outside the whole minimap container.
  useEffect(() => {
    if (!isZoomMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setIsZoomMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isZoomMenuOpen]);

  // Viewport indicator bounds in minimap px.
  const indLeft = (-x / scale + WORLD_W / 2) * SCALE_X;
  const indTop = (-y / scale + WORLD_H / 2) * SCALE_Y;
  const indW = (viewW / scale) * SCALE_X;
  const indH = (viewH / scale) * SCALE_Y;

  const handleMapClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (wasDraggingRef.current) {
        wasDraggingRef.current = false;
        return;
      }
      const rect = mapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const canvasX = (e.clientX - rect.left) / SCALE_X - WORLD_W / 2;
      const canvasY = (e.clientY - rect.top) / SCALE_Y - WORLD_H / 2;
      const { scale: s } = useViewport.getState();
      setPosition(
        -canvasX * s + window.innerWidth / 2,
        -canvasY * s + window.innerHeight / 2,
      );
    },
    [setPosition],
  );

  const handleIndicatorMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const { x: startX, y: startY } = useViewport.getState();
      const startMouseX = e.clientX;
      const startMouseY = e.clientY;

      const onMove = (me: MouseEvent) => {
        wasDraggingRef.current = true;
        const { scale: s } = useViewport.getState();
        setPosition(
          startX - ((me.clientX - startMouseX) / SCALE_X) * s,
          startY - ((me.clientY - startMouseY) / SCALE_Y) * s,
        );
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [setPosition],
  );

  const at100 = Math.round(scale * 100) === 100;

  const zoomMenuItems = [
    {
      label: "Zoom in",
      shortcut: "Ctrl + =",
      disabled: false,
      action: () => { zoom(1); setIsZoomMenuOpen(false); },
    },
    {
      label: "Zoom out",
      shortcut: "Ctrl + –",
      disabled: false,
      action: () => { zoom(-1); setIsZoomMenuOpen(false); },
    },
    {
      label: "Zoom to 100%",
      shortcut: "⇧ + 0",
      disabled: at100,
      action: () => { if (!at100) { reset(); } setIsZoomMenuOpen(false); },
    },
    {
      label: "Zoom to fit",
      shortcut: "⇧ + 1",
      disabled: false,
      // Stub: resets to origin until canvas bounds are tracked.
      action: () => { reset(); setIsZoomMenuOpen(false); },
    },
    {
      label: "Zoom to selection",
      shortcut: "⇧ + 2",
      disabled: false,
      // Stub: no-op until selected node bounds are available.
      action: () => { setIsZoomMenuOpen(false); },
    },
  ];

  return (
    <div ref={containerRef} className="fixed bottom-6 left-6 z-50" style={{ width: isMapOpen ? MAP_W : "auto" }}>

      {/* Zoom shortcut menu — floats above the panel */}
      {isZoomMenuOpen && (
        <div
          className="absolute rounded-xl shadow-xl overflow-hidden"
          style={{
            bottom: "calc(100% + 8px)",
            left: 0,
            width: 220,
            background: "#ffffff",
            border: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          {zoomMenuItems.map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              className={[
                "w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors",
                item.disabled ? "cursor-default" : "hover:bg-black/5",
              ].join(" ")}
            >
              <span style={{ color: item.disabled ? "#9ca3af" : "#374151" }}>
                {item.label}
              </span>
              <span style={{ color: "#9ca3af", fontSize: 11 }}>
                {item.shortcut}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Main panel */}
      <div
        className="rounded-xl overflow-hidden shadow-lg"
        style={{ background: "#ebebeb" }}
      >
        {/* Zoom controls bar */}
        <div className="flex items-center h-9 px-1.5 gap-0.5">

          <button
            onClick={() => zoom(-1)}
            title="Zoom out (Ctrl + –)"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-lg font-light leading-none transition-colors hover:bg-black/10"
            style={{ color: "#6b7280" }}
          >
            –
          </button>

          <button
            onClick={() => setIsZoomMenuOpen((v) => !v)}
            title="Zoom options"
            className={`h-7 rounded-lg text-xs font-semibold tabular-nums transition-colors hover:bg-black/10 ${isMapOpen ? "flex-1" : "px-3"}`}
            style={{ color: "#374151" }}
          >
            {Math.round(scale * 100)}%
          </button>

          <button
            onClick={() => zoom(1)}
            title="Zoom in (Ctrl + =)"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-lg font-light leading-none transition-colors hover:bg-black/10"
            style={{ color: "#6b7280" }}
          >
            +
          </button>

          <div style={{ width: 1, height: 16, background: "rgba(0,0,0,0.12)", margin: "0 2px" }} />

          {/* < / > arrow — toggles minimap canvas, zoom bar stays */}
          <button
            onClick={() => setIsMapOpen((v) => !v)}
            title={isMapOpen ? "Hide minimap" : "Show minimap"}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-black/10"
            style={{ color: "#6b7280" }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {isMapOpen
                ? <path d="M7.5 2.5l-3 3.5 3 3.5" /> /* < collapse */
                : <path d="M4.5 2.5l3 3.5-3 3.5" />  /* > expand */
              }
            </svg>
          </button>

        </div>

        {/* Minimap canvas — shown only when expanded */}
        {isMapOpen && <div
          ref={mapRef}
          onClick={handleMapClick}
          className="relative overflow-hidden cursor-crosshair"
          style={{
            width: MAP_W,
            height: MAP_H,
            background: "#d4d4d8",
          }}
        >
          <div
            onMouseDown={handleIndicatorMouseDown}
            onClick={(e) => e.stopPropagation()}
            className="absolute cursor-grab active:cursor-grabbing rounded-sm"
            style={{
              left: indLeft,
              top: indTop,
              width: Math.max(4, indW),
              height: Math.max(4, indH),
              background: "rgba(59,130,246,0.3)",
              border: "1.5px solid rgb(59,130,246)",
            }}
          />
        </div>}

      </div>
    </div>
  );
}
