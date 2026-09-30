"use client";

// Luma reference: TOOL-01 — Floating creation dock, fixed at bottom-centre.
// All 10 tools rendered; only Pointer is wired in this issue.
// Keyboard: V → pointer, Esc → pointer.

import { useEffect } from "react";
import hotkeys from "hotkeys-js";
import { useToolStore, type Tool } from "@/lib/toolStore";

// --- icons (inline SVG, 16×16, currentColor) ---

const IconPointer = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M3 2v10l2.8-2.8 1.7 3.6 1.6-.8-1.7-3.6L11 8z" />
  </svg>
);

const IconImage = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="1.5" y="3" width="13" height="10" rx="1.5" />
    <circle cx="5.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    <path d="M1.5 10.5l3.5-3 2.5 2.5 2-2 4 4.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconVideo = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M5 3.5v9l8-4.5z" />
  </svg>
);

const IconAudio = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="2" y1="8" x2="4" y2="8" />
    <line x1="4" y1="5" x2="4" y2="11" />
    <line x1="6" y1="3" x2="6" y2="13" />
    <line x1="8" y1="6" x2="8" y2="10" />
    <line x1="10" y1="4" x2="10" y2="12" />
    <line x1="12" y1="5" x2="12" y2="11" />
    <line x1="12" y1="8" x2="14" y2="8" />
  </svg>
);

const IconFrame = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
  </svg>
);

const IconShapes = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12c1.5-3 3.5-7 6-8.5s4 1.5 2 3.5S6.5 9 5 12" />
  </svg>
);

const IconText = () => (
  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "serif", lineHeight: 1, letterSpacing: -0.5 }}>
    Aa
  </span>
);

const IconStickyNote = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
    <path d="M3 2h10a1 1 0 011 1v7.5l-4 3.5H3a1 1 0 01-1-1V3a1 1 0 011-1z" />
    <path d="M10 13V10h4" strokeLinecap="round" />
  </svg>
);

const IconColorPicker = () => (
  <svg width="16" height="16" viewBox="0 0 16 16">
    <circle cx="8" cy="8" r="5" fill="#ef4444" />
  </svg>
);

const IconMediaUpload = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="8" cy="8" r="6" />
    <line x1="8" y1="5" x2="8" y2="11" />
    <line x1="5" y1="8" x2="11" y2="8" />
  </svg>
);

// --- tool definitions ---

interface ToolDef {
  id: Tool;
  label: string;
  wired: boolean;
  icon: React.ReactNode;
}

const TOOLS: ToolDef[] = [
  { id: "pointer",       label: "Select (V)",    wired: true,  icon: <IconPointer /> },
  { id: "generate-image", label: "Generate Image", wired: false, icon: <IconImage /> },
  { id: "generate-video", label: "Generate Video", wired: false, icon: <IconVideo /> },
  { id: "generate-audio", label: "Generate Audio", wired: false, icon: <IconAudio /> },
  { id: "frame",         label: "Frame",          wired: false, icon: <IconFrame /> },
  { id: "shapes",        label: "Shapes",         wired: false, icon: <IconShapes /> },
  { id: "text",          label: "Text",           wired: false, icon: <IconText /> },
  { id: "sticky-note",   label: "Sticky Note",    wired: false, icon: <IconStickyNote /> },
  { id: "color-picker",  label: "Color",          wired: false, icon: <IconColorPicker /> },
  { id: "media-upload",  label: "Upload (⌘U)",    wired: false, icon: <IconMediaUpload /> },
];

// ---

export default function FloatingDock() {
  const { activeTool, setTool } = useToolStore();

  useEffect(() => {
    hotkeys("v", () => setTool("pointer"));
    hotkeys("escape", () => setTool("pointer"));
    return () => {
      hotkeys.unbind("v");
      hotkeys.unbind("escape");
    };
  }, [setTool]);

  return (
    // Outer wrapper is pointer-events-none so canvas clicks below the dock still land on Konva.
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div className="flex items-center gap-1 rounded-xl bg-white/95 border border-black/10 shadow-xl px-3.5 py-2.5 pointer-events-auto backdrop-blur-sm">
        {TOOLS.map((tool, index) => {
          const isActive = activeTool === tool.id;
          return (
            <div key={tool.id} className="flex items-center">
              {/* Divider after pointer tool */}
              {index === 1 && (
                <div className="w-px h-6 bg-black/10 mx-2" />
              )}
              <button
                title={tool.label}
                onClick={tool.wired ? () => setTool(tool.id) : undefined}
                tabIndex={tool.wired ? 0 : -1}
                aria-pressed={isActive}
                className={[
                  "w-11 h-11 flex items-center justify-center rounded-full text-sm transition-all duration-150 select-none",
                  isActive
                    ? "bg-neutral-900 text-white shadow-sm"
                    : tool.wired
                    ? "text-neutral-600 hover:bg-black/5 hover:text-neutral-900 cursor-pointer"
                    : "text-neutral-400 cursor-not-allowed opacity-50",
                ].join(" ")}
              >
                {tool.icon}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
