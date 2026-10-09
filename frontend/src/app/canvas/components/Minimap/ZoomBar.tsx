"use client";

// Luma reference: UTIL-01 — the always-visible row: − 100% + | ‹

interface ZoomBarProps {
  percent: number;
  isMapOpen: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onTogglePercentMenu: () => void;
  onToggleMap: () => void;
}

export default function ZoomBar({
  percent,
  isMapOpen,
  onZoomIn,
  onZoomOut,
  onTogglePercentMenu,
  onToggleMap,
}: ZoomBarProps) {
  return (
    <div className="minimap-zoom-bar">
      <button onClick={onZoomOut} title="Zoom out (Ctrl + –)" className="minimap-zoom-button">
        –
      </button>

      <button
        onClick={onTogglePercentMenu}
        title="Zoom options"
        className={[
          "minimap-zoom-percentage",
          isMapOpen ? "minimap-zoom-percentage-expanded" : "minimap-zoom-percentage-collapsed",
        ].join(" ")}
      >
        {percent}%
      </button>

      <button onClick={onZoomIn} title="Zoom in (Ctrl + =)" className="minimap-zoom-button">
        +
      </button>

      <div className="minimap-divider" />

      <button
        onClick={onToggleMap}
        title={isMapOpen ? "Hide minimap" : "Show minimap"}
        className="minimap-toggle-button"
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
          {isMapOpen ? <path d="M7.5 2.5l-3 3.5 3 3.5" /> : <path d="M4.5 2.5l3 3.5-3 3.5" />}
        </svg>
      </button>
    </div>
  );
}
