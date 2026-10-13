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
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useConnectionStore } from "@/store/connection.store";
import { viewportCentre } from "@/lib/canvas/coords";
import { canvasArea } from "../../canvasArea";
import { canvasHistory } from "@/lib/canvas/history";
import { useLayerOrder } from "@/store/layerOrder.store";
import { useUpload } from "@/store/upload.store";
import { NODE_KINDS } from "@/app/canvas/components/NodePanel/kinds";
import type { NodeKind } from "@/store/nodePanel.store";

// Which node kind each Create submenu item makes.
const DOCK_ITEM_KIND: Partial<Record<string, NodeKind>> = {
  "generate-image": "image",
  "generate-instruction": "instruction",
  "generate-video": "video",
};

import "./FloatingDock.scss";

// --- icons (inline SVG, currentColor) ---

const IconPointer = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M3 2v10l2.8-2.8 1.7 3.6 1.6-.8-1.7-3.6L11 8z" />
  </svg>
);

// lucide square-mouse-pointer
const IconGenerate = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z" />
    <path d="M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" />
  </svg>
);

const IconLinks = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="8" height="8" x="3" y="3" rx="2" />
    <path d="M7 11v4a2 2 0 0 0 2 2h4" />
    <rect width="8" height="8" x="13" y="13" rx="2" />
  </svg>
);

// Link style preview icons
const IconLinkStraight = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <line x1="3" y1="13" x2="13" y2="3" />
    <circle cx="3" cy="13" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="13" cy="3" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

const IconLinkElbow = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 13h5V3h5" />
    <circle cx="3" cy="13" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="13" cy="3" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

const IconLinkCurve = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <path d="M3 13C3 3 13 13 13 3" />
    <circle cx="3" cy="13" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="13" cy="3" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

const IconFrame = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
  </svg>
);

const IconShapes = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 12c1.5-3 3.5-7 6-8.5s4 1.5 2 3.5S6.5 9 5 12" />
  </svg>
);

const IconText = () => (
  <span
    style={{
      fontSize: 12,
      fontWeight: 700,
      fontFamily: "serif",
      lineHeight: 1,
      letterSpacing: -0.5,
    }}
  >
    Aa
  </span>
);

const IconStickyNote = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinejoin="round"
  >
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
    <div className="floating-dock-tooltip">
      <span className="floating-dock-tooltip-label">{label}</span>

      {shortcut && (
        <span className="floating-dock-tooltip-shortcut">{shortcut}</span>
      )}
    </div>
  );
}

// --- data ---

const GENERATE_IDS: Tool[] = [
  "generate-instruction",
  "generate-image",
  "generate-video",
];

const GENERATE_ITEMS = [
  {
    id: "generate-video" as Tool,
    label: "Video",
    icon: <Video size={16} />,
  },
  {
    id: "generate-image" as Tool,
    label: "Image",
    icon: <Image size={16} />,
  },
  {
    id: "generate-instruction" as Tool,
    label: "Instruction",
    icon: <SquareText size={16} />,
  },
];

const LINK_IDS: Tool[] = ["link-straight", "link-elbow", "link-curve"];

const LINK_ITEMS = [
  {
    id: "link-straight" as Tool,
    label: "Straight",
    icon: <IconLinkStraight />,
  },
  {
    id: "link-elbow" as Tool,
    label: "Elbow",
    icon: <IconLinkElbow />,
  },
  {
    id: "link-curve" as Tool,
    label: "Curve",
    icon: <IconLinkCurve />,
  },
];

interface ToolDef {
  id: Tool;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
}

const TOOLS_RIGHT: ToolDef[] = [
  {
    id: "frame",
    label: "Frame",
    shortcut: "F",
    icon: <IconFrame />,
  },
  {
    id: "shapes",
    label: "Shapes",
    shortcut: "S",
    icon: <IconShapes />,
  },
  {
    id: "text",
    label: "Text",
    shortcut: "T",
    icon: <IconText />,
  },
  {
    id: "sticky-note",
    label: "Sticky Note",
    icon: <IconStickyNote />,
  },
  {
    id: "color-picker",
    label: "Color",
    icon: <IconColorPicker />,
  },
  {
    id: "media-upload",
    label: "Upload",
    shortcut: "⌘U",
    icon: <Upload size={16} />,
  },
];

// ---

export default function FloatingDock() {
  const { activeTool, setTool } = useToolStore();
  const { addPanel, closeAllPanels } = useNodePanel();
  const viewport = useViewport();

  const [isGenerateMenuOpen, setIsGenerateMenuOpen] = useState(false);

  const [isLinksMenuOpen, setIsLinksMenuOpen] = useState(false);

  const generateBtnRef = useRef<HTMLButtonElement>(null);
  const generateMenuRef = useRef<HTMLDivElement>(null);

  const linksBtnRef = useRef<HTMLButtonElement>(null);
  const linksMenuRef = useRef<HTMLDivElement>(null);

  const isGenerateActive = GENERATE_IDS.includes(activeTool);
  const isLinksActive = LINK_IDS.includes(activeTool);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isUploading = useUpload((s) => s.isUploading);

  // Lit from the moment the dialog opens. Cleared by the last file landing
  // (upload.ts), by a cancelled dialog, or by a pick of nothing.
  const openFilePicker = () => {
    useUpload.getState().setUploading(true);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);

    if (!files.length) {
      useUpload.getState().setUploading(false);
      return;
    }

    window.dispatchEvent(
      new CustomEvent("canvas:upload", {
        detail: { files },
      }),
    );

    e.target.value = "";
  };

  useEffect(() => {
    hotkeys("v", () => {
      setTool("pointer");
    });

    hotkeys("escape", () => {
      setTool("pointer");
      setIsGenerateMenuOpen(false);
      setIsLinksMenuOpen(false);
      closeAllPanels();
    });

    hotkeys("command+u,ctrl+u", (e) => {
      e.preventDefault();
      openFilePicker();
    });

    return () => {
      hotkeys.unbind("v");
      hotkeys.unbind("escape");
      hotkeys.unbind("command+u,ctrl+u");
    };
  }, [setTool]);

  // Dismissing the file dialog fires no change event, so without this the
  // button stays lit forever. Attached directly: React has no synthetic
  // onCancel for a file input.
  useEffect(() => {
    const input = fileInputRef.current;
    if (!input) return;
    const onCancel = () => useUpload.getState().setUploading(false);
    input.addEventListener("cancel", onCancel);
    return () => input.removeEventListener("cancel", onCancel);
  }, []);

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
      "floating-dock-button",
      active ? "floating-dock-button-active" : "floating-dock-button-inactive",
    ].join(" ");

  const submenuClass = "floating-dock-submenu";

  const submenuItemClass = (active: boolean) =>
    [
      "floating-dock-submenu-item",
      active
        ? "floating-dock-submenu-item-active"
        : "floating-dock-submenu-item-inactive",
    ].join(" ");

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        className="floating-dock-file-input"
        onChange={handleFileChange}
      />

      <div className="floating-dock-wrapper">
        <div className="floating-dock">
          {/* Pointer */}
          <div className="floating-dock-tool-wrapper">
            <button
              title=""
              onClick={() => {
                setTool("pointer");
              }}
              aria-pressed={activeTool === "pointer"}
              className={btnClass(activeTool === "pointer")}
            >
              <IconPointer />
            </button>

            <Tooltip label="Select" shortcut="V" />
          </div>

          {/* Divider */}
          <div className="floating-dock-divider" />

          {/* Create button + submenu */}
          <div className="floating-dock-tool-wrapper">
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

            {!isGenerateMenuOpen && <Tooltip label="Create" />}

            {isGenerateMenuOpen && (
              <div
                ref={generateMenuRef}
                className={submenuClass}
                style={{ width: "max-content" }}
              >
                {GENERATE_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setTool(item.id);
                      setIsGenerateMenuOpen(false);

                      // Creating a node makes it the selection, so clear the
                      // others. Without this an uploaded image stayed selected
                      // alongside the new node, and because each selection
                      // system has its own Delete handler, one keypress
                      // destroyed both.
                      useKonvaSelection.getState().deselect();
                      useConnectionStore.getState().deselectConnection();

                      // Dock item -> node kind. A kind with no registered
                      // spec (video) still no-ops rather than creating a node
                      // the panel cannot render.
                      const kind = DOCK_ITEM_KIND[item.id];
                      const spec = kind ? NODE_KINDS[kind] : undefined;
                      if (kind && spec) {
                        const { x: sx, y: sy, scale: sc } = viewport;

                        const existing = useNodePanel.getState().panels.length;

                        const offset = existing * 24;

                        // canvasX is the node's LEFT edge but canvasY is its
                        // vertical centre, so only x needs the half-width
                        // shift. Centring it matches uploaded images and keeps
                        // the Create Image panel on the node's preferred right
                        // side instead of forcing it to flip.
                        const centre = viewportCentre(
                          { x: sx, y: sy, scale: sc },
                          canvasArea()
                        );
                        // canvasX is the node's LEFT edge but canvasY is its
                        // vertical centre, so only x needs the half-width
                        // shift. The width comes from the kind's own spec --
                        // an instruction node is not sized like an image one.
                        const cx = centre.x - spec.sizeFor(spec.defaultSettings).w / 2 + offset;
                        const cy = centre.y + offset;

                        addPanel(cx, cy, kind);
                        // A new node must not land behind an uploaded image.
                        useLayerOrder.getState().raiseDom();
                        // Creating a node is an edit, so it belongs on the
                        // timeline. It was not undoable before the merge.
                        canvasHistory.commit();

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
          <div className="floating-dock-tool-wrapper">
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
              <div
                ref={linksMenuRef}
                className={submenuClass}
                style={{ width: "max-content" }}
              >
                {LINK_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setTool(item.id);
                      setIsLinksMenuOpen(false);
                      closeAllPanels();
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

          {/* Right-side tools */}
          {TOOLS_RIGHT.map((tool) => {
            const isUpload = tool.id === "media-upload";

            return (
              <div key={tool.id} className="floating-dock-tool-wrapper">
                <button
                  title=""
                  tabIndex={isUpload ? 0 : -1}
                  onClick={isUpload ? openFilePicker : undefined}
                  aria-pressed={isUpload ? isUploading : undefined}
                  className={
                    isUpload
                      ? btnClass(isUploading)
                      : "floating-dock-button-disabled"
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
