"use client";

// Luma reference: UTIL-01 — tldraw-style panel.
// Zoom bar always visible; minimap canvas always shown when panel is open.
// < arrow collapses entire panel sideways; > tab re-expands.
// Clicking the zoom % opens a shortcut menu above the panel.

import { useState, useEffect, useRef, useCallback } from "react";
import { useViewport } from "@/store/viewport.store";
import { stagePositionFor } from "@/lib/canvas/coords";
import "./Minimap.scss";

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

  useEffect(() => {
    const update = () => {
      setViewW(window.innerWidth);
      setViewH(window.innerHeight);
    };

    update();

    window.addEventListener("resize", update);

    return () => window.removeEventListener("resize", update);
  }, []);

  const zoom = useCallback((direction: 1 | -1) => {
    const { x: sx, y: sy, scale: s } = useViewport.getState();

    const newScale = Math.min(
      4,
      Math.max(
        0.1,
        Math.round((s + direction * ZOOM_STEP) * 100) / 100,
      ),
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
      if (!containerRef.current?.contains(e.target as Node)) {
        setIsZoomMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);

    return () => document.removeEventListener("mousedown", handler);
  }, [isZoomMenuOpen]);

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

      const canvasX =
        (e.clientX - rect.left) / SCALE_X - WORLD_W / 2;

      const canvasY =
        (e.clientY - rect.top) / SCALE_Y - WORLD_H / 2;

      const { scale: s } = useViewport.getState();

      const pos = stagePositionFor({ x: canvasX, y: canvasY }, s, {
        width: window.innerWidth,
        height: window.innerHeight,
      });
      setPosition(pos.x, pos.y);
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
      action: () => {
        zoom(1);
        setIsZoomMenuOpen(false);
      },
    },
    {
      label: "Zoom out",
      shortcut: "Ctrl + –",
      disabled: false,
      action: () => {
        zoom(-1);
        setIsZoomMenuOpen(false);
      },
    },
    {
      label: "Zoom to 100%",
      shortcut: "⇧ + 0",
      disabled: at100,
      action: () => {
        if (!at100) {
          reset();
        }

        setIsZoomMenuOpen(false);
      },
    },
    {
      label: "Zoom to fit",
      shortcut: "⇧ + 1",
      disabled: false,
      action: () => {
        reset();
        setIsZoomMenuOpen(false);
      },
    },
    {
      label: "Zoom to selection",
      shortcut: "⇧ + 2",
      disabled: false,
      action: () => {
        setIsZoomMenuOpen(false);
      },
    },
  ];

  return (
    <div
      ref={containerRef}
      className="minimap-container"
      style={{
        width: isMapOpen ? MAP_W : "auto",
      }}
    >
      {/* Zoom shortcut menu */}
      {isZoomMenuOpen && (
        <div
          className="minimap-zoom-menu"
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
                "minimap-zoom-menu-item",
                item.disabled
                  ? "minimap-zoom-menu-item-disabled"
                  : "minimap-zoom-menu-item-enabled",
              ].join(" ")}
            >
              <span
                style={{
                  color: item.disabled ? "#9ca3af" : "#374151",
                }}
              >
                {item.label}
              </span>

              <span
                style={{
                  color: "#9ca3af",
                  fontSize: 11,
                }}
              >
                {item.shortcut}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Main panel */}
      <div
        className="minimap-panel"
        style={{
          background: "#ebebeb",
        }}
      >
        {/* Zoom controls */}
        <div className="minimap-zoom-bar">
          <button
            onClick={() => zoom(-1)}
            title="Zoom out (Ctrl + –)"
            className="minimap-zoom-button"
            style={{ color: "#6b7280" }}
          >
            –
          </button>

          <button
            onClick={() => setIsZoomMenuOpen((v) => !v)}
            title="Zoom options"
            className={[
              "minimap-zoom-percentage",
              isMapOpen
                ? "minimap-zoom-percentage-expanded"
                : "minimap-zoom-percentage-collapsed",
            ].join(" ")}
            style={{ color: "#374151" }}
          >
            {Math.round(scale * 100)}%
          </button>

          <button
            onClick={() => zoom(1)}
            title="Zoom in (Ctrl + =)"
            className="minimap-zoom-button"
            style={{ color: "#6b7280" }}
          >
            +
          </button>

          <div
            className="minimap-divider"
            style={{
              background: "rgba(0,0,0,0.12)",
            }}
          />

          <button
            onClick={() => setIsMapOpen((v) => !v)}
            title={isMapOpen ? "Hide minimap" : "Show minimap"}
            className="minimap-toggle-button"
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
              {isMapOpen ? (
                <path d="M7.5 2.5l-3 3.5 3 3.5" />
              ) : (
                <path d="M4.5 2.5l3 3.5-3 3.5" />
              )}
            </svg>
          </button>
        </div>

        {/* Minimap canvas */}
        {isMapOpen && (
          <div
            ref={mapRef}
            onClick={handleMapClick}
            className="minimap-canvas"
            style={{
              width: MAP_W,
              height: MAP_H,
              background: "#d4d4d8",
            }}
          >
            <div
              onMouseDown={handleIndicatorMouseDown}
              onClick={(e) => e.stopPropagation()}
              className="minimap-viewport-indicator"
              style={{
                left: indLeft,
                top: indTop,
                width: Math.max(4, indW),
                height: Math.max(4, indH),
                background: "rgba(59,130,246,0.3)",
                border: "1.5px solid rgb(59,130,246)",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}