"use client";

// Luma reference: TOOL-01 — Floating creation dock, fixed at bottom-centre.
// Pointer wired. Create + Links buttons open submenus; opening one closes the other.
// Keyboard: V → pointer, Esc → pointer + close all submenus.
// Hover tooltip: pill with label + optional shortcut badge, floats above the button.

import { useState, useEffect, useRef } from "react";
import hotkeys from "hotkeys-js";
import { Video, Image, SquareText, Upload } from "lucide-react";
import { useToolStore, type Tool } from "@/store/tool.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useViewport } from "@/store/viewport.store";

// --- icons (inline SVG, currentColor) ---

const IconPointer = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M3 2v10l2.8-2.8 1.7 3.6 1.6-.8-1.7-3.6L11 8z" />
  </svg>
);

// lucide square-mouse-pointer
const IconGenerate = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z" />
    <path d="M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" />
  </svg>
);



// lucide workflow
const IconLinks = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="8" height="8" x="3" y="3" rx="2" />
    <path d="M7 11v4a2 2 0 0 0 2 2h4" />
    <rect width="8" height="8" x="13" y="13" rx="2" />
  </svg>
);

// Link style preview icons — bottom-left to top-right, with endpoint dots.
const IconLinkStraight = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="3" y1="13" x2="13" y2="3" />
    <circle cx="3" cy="13" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="13" cy="3" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

const IconLinkElbow = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 13h5V3h5" />
    <circle cx="3" cy="13" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="13" cy="3" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

const IconLinkCurve = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M3 13C3 3 13 13 13 3" />
    <circle cx="3" cy="13" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="13" cy="3" r="1.5" fill="currentColor" stroke="none" />
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


// --- tooltip ---

function Tooltip({ label, shortcut }: { label: string; shortcut?: string }) {
  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex items-center gap-1.5 rounded-full bg-white border border-black/10 shadow-md px-3 py-1 whitespace-nowrap pointer-events-none z-10">
      <span className="text-sm text-neutral-700">{label}</span>
      {shortcut && (
        <span className="rounded bg-neutral-100 text-neutral-500 text-xs font-medium px-1.5 py-0.5">
          {shortcut}
        </span>
      )}
    </div>
  );
}

// --- data ---

const GENERATE_IDS: Tool[] = ["generate-instruction", "generate-image", "generate-video"];
const GENERATE_ITEMS = [
  { id: "generate-video"       as Tool, label: "Video",       icon: <Video size={16} /> },
  { id: "generate-image"       as Tool, label: "Image",       icon: <Image size={16} /> },
  { id: "generate-instruction" as Tool, label: "Instruction", icon: <SquareText size={16} /> },
];

const LINK_IDS: Tool[] = ["link-straight", "link-elbow", "link-curve"];
const LINK_ITEMS = [
  { id: "link-straight" as Tool, label: "Straight", icon: <IconLinkStraight /> },
  { id: "link-elbow"    as Tool, label: "Elbow",    icon: <IconLinkElbow /> },
  { id: "link-curve"    as Tool, label: "Curve",    icon: <IconLinkCurve /> },
];

interface ToolDef {
  id: Tool;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
}

const TOOLS_RIGHT: ToolDef[] = [
  { id: "frame",        label: "Frame",       shortcut: "F",  icon: <IconFrame /> },
  { id: "shapes",       label: "Shapes",      shortcut: "S",  icon: <IconShapes /> },
  { id: "text",         label: "Text",        shortcut: "T",  icon: <IconText /> },
  { id: "sticky-note",  label: "Sticky Note",                 icon: <IconStickyNote /> },
  { id: "color-picker", label: "Color",                       icon: <IconColorPicker /> },
  { id: "media-upload", label: "Upload",      shortcut: "⌘U", icon: <Upload size={16} /> },
];

// ---

export default function FloatingDock() {
  const { activeTool, setTool } = useToolStore();
  const { addPanel, closeAllPanels } = useNodePanel();
  const viewport = useViewport();
  const [isGenerateMenuOpen, setIsGenerateMenuOpen] = useState(false);
  const [isLinksMenuOpen, setIsLinksMenuOpen]       = useState(false);

  const generateBtnRef = useRef<HTMLButtonElement>(null);
  const generateMenuRef = useRef<HTMLDivElement>(null);
  const linksBtnRef    = useRef<HTMLButtonElement>(null);
  const linksMenuRef   = useRef<HTMLDivElement>(null);

  const isGenerateActive = GENERATE_IDS.includes(activeTool);
  const isLinksActive    = LINK_IDS.includes(activeTool);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    window.dispatchEvent(new CustomEvent("canvas:upload", { detail: { files } }));
    e.target.value = "";
  };

  useEffect(() => {
    hotkeys("v", () => { setTool("pointer"); });
    hotkeys("escape", () => {
      setTool("pointer");
      setIsGenerateMenuOpen(false);
      setIsLinksMenuOpen(false);
      closeAllPanels();
    });
    hotkeys("command+u,ctrl+u", (e) => { e.preventDefault(); fileInputRef.current?.click(); });
    return () => {
      hotkeys.unbind("v");
      hotkeys.unbind("escape");
      hotkeys.unbind("command+u,ctrl+u");
    };
  }, [setTool]);

  // Close Generate menu on outside click.
  useEffect(() => {
    if (!isGenerateMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        !generateBtnRef.current?.contains(e.target as Node) &&
        !generateMenuRef.current?.contains(e.target as Node)
      ) {
        setIsGenerateMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isGenerateMenuOpen]);

  // Close Links menu on outside click.
  useEffect(() => {
    if (!isLinksMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        !linksBtnRef.current?.contains(e.target as Node) &&
        !linksMenuRef.current?.contains(e.target as Node)
      ) {
        setIsLinksMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isLinksMenuOpen]);

  const btnClass = (active: boolean) =>
    [
      "w-11 h-11 flex items-center justify-center rounded-full text-sm transition-all duration-150 select-none cursor-pointer",
      active
        ? "bg-neutral-900 text-white shadow-sm"
        : "text-neutral-600 hover:bg-black/5 hover:text-neutral-900",
    ].join(" ");

  const submenuClass =
    "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 rounded-xl bg-white/95 border border-black/10 shadow-xl backdrop-blur-sm overflow-hidden pointer-events-auto";

  const submenuItemClass = (active: boolean) =>
    [
      "w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors whitespace-nowrap",
      active ? "bg-neutral-100 text-neutral-900 font-medium" : "text-neutral-700 hover:bg-black/5",
    ].join(" ");

  return (
    <>
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*,video/*,audio/*"
      multiple
      className="hidden"
      onChange={handleFileChange}
    />
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div className="flex items-center gap-1 rounded-xl bg-white/95 border border-black/10 shadow-xl px-3.5 py-2.5 pointer-events-auto backdrop-blur-sm">

        {/* Pointer */}
        <div className="relative group flex items-center">
          <button
            title=""
            onClick={() => { setTool("pointer"); }}
            aria-pressed={activeTool === "pointer"}
            className={btnClass(activeTool === "pointer")}
          >
            <IconPointer />
          </button>
          <Tooltip label="Select" shortcut="V" />
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-black/10 mx-2" />

        {/* Create button + submenu */}
        <div className="relative group flex items-center">
          <button
            ref={generateBtnRef}
            title=""
            onClick={() => {
              setIsGenerateMenuOpen((v) => !v);
              setIsLinksMenuOpen(false);
            }}
            aria-pressed={isGenerateActive || isGenerateMenuOpen}
            className={btnClass(isGenerateActive || isGenerateMenuOpen)}
          >
            <IconGenerate />
          </button>

          {!isGenerateMenuOpen && <Tooltip label="Node" />}

          {isGenerateMenuOpen && (
            <div ref={generateMenuRef} className={submenuClass} style={{ width: "max-content" }}>
              {GENERATE_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setTool(item.id);
                    setIsGenerateMenuOpen(false);
                    if (item.id === "generate-image") {
                      // New placeholder at viewport centre, offset slightly per existing count.
                      const { x: sx, y: sy, scale: sc } = viewport;
                      const existing = useNodePanel.getState().panels.length;
                      const offset   = existing * 24;
                      const cx = (-sx + window.innerWidth  / 2) / sc + 24 + offset;
                      const cy = (-sy + window.innerHeight / 2) / sc      + offset;
                      addPanel(cx, cy);
                      // Switch to pointer so canvas background click can deactivate the placeholder.
                      setTool("pointer");
                    } else {
                      closeAllPanels();
                    }
                  }}
                  className={submenuItemClass(activeTool === item.id)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Links button + submenu */}
        <div className="relative group flex items-center">
          <button
            ref={linksBtnRef}
            title=""
            onClick={() => {
              setIsLinksMenuOpen((v) => !v);
              setIsGenerateMenuOpen(false);
            }}
            aria-pressed={isLinksActive || isLinksMenuOpen}
            className={btnClass(isLinksActive || isLinksMenuOpen)}
          >
            <IconLinks />
          </button>

          {!isLinksMenuOpen && <Tooltip label="Links" />}

          {isLinksMenuOpen && (
            <div ref={linksMenuRef} className={submenuClass} style={{ width: "max-content" }}>
              {LINK_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { setTool(item.id); setIsLinksMenuOpen(false); closeAllPanels(); }}
                  className={submenuItemClass(activeTool === item.id)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right-side tools */}
        {TOOLS_RIGHT.map((tool) => {
          const isUpload = tool.id === "media-upload";
          return (
            <div key={tool.id} className="relative group flex items-center">
              <button
                title=""
                tabIndex={isUpload ? 0 : -1}
                onClick={isUpload ? () => fileInputRef.current?.click() : undefined}
                className={
                  isUpload
                    ? btnClass(false)
                    : "w-11 h-11 flex items-center justify-center rounded-full text-sm transition-all duration-150 select-none text-neutral-400 cursor-not-allowed opacity-50"
                }
              >
                {tool.icon}
              </button>
              <Tooltip label={tool.label} shortcut={tool.shortcut} />
            </div>
          );
        })}

      </div>
    </div>
    </>
  );
}
