"use client";

// Luma reference: TOOL-01 — Floating creation dock, fixed at bottom-centre.
// Pointer wired. Create, Links and Shapes open submenus; opening one closes the others.
// Keyboard: V → pointer, F → frame, R/A/L/O → rectangle/arrow/line/ellipse,
// S → last-used shape, T → text,
// Esc → pointer + close all submenus.
// Hover tooltip: pill with label + optional shortcut badge, floats above the button.

import { Fragment, useState, useEffect, useRef } from "react";
import hotkeys from "hotkeys-js";
import { Video, Image, Sparkles, PencilLine, Upload, Shapes } from "lucide-react";
import {
  useToolStore,
  shapeKindOf,
  shapeTool,
  type ShapeKind,
  type Tool,
} from "@/store/tool.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useViewport } from "@/store/viewport.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useConnectionStore } from "@/store/connection.store";
import { viewportCentre } from "@/lib/canvas/coords";
import { canvasArea } from "../../canvasArea";
import type { UploadDetail } from "../../board/upload";
import { canvasHistory } from "@/lib/canvas/history";
import { useLayerOrder } from "@/store/layerOrder.store";
import { useUpload } from "@/store/upload.store";
import { boardKeyAllowed } from "@/lib/canvas/boardKeys";
import { NODE_KINDS } from "@/app/canvas/components/NodePanel/kinds";
import type { NodeKind } from "@/store/nodePanel.store";

// Which node kind each Create submenu item makes.
const DOCK_ITEM_KIND: Partial<Record<string, NodeKind>> = {
  "generate-image": "image",
  "generate-instruction": "instruction",
  "generate-video": "video",
  "generate-compose": "compose",
};

import { PALETTE, DEFAULT_SWATCH, COLOR_EVENT, type ColorDetail } from "../../board/palette";
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

// Wider than tall, so it cannot be mistaken for Frame's square beside it.
const IconRectangle = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinejoin="round"
  >
    <rect x="2" y="4" width="12" height="8" />
  </svg>
);

const IconArrow = () => (
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
    <path d="M3 13 13 3M7 3h6v6" />
  </svg>
);

const IconLine = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M3 13 13 3" />
  </svg>
);

const IconEllipse = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <ellipse cx="8" cy="8" rx="6" ry="4.5" />
  </svg>
);

const IconTriangle = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinejoin="round"
  >
    <path d="M8 2.5 14 13H2z" />
  </svg>
);

const IconBlockArrow = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinejoin="round"
  >
    <path d="M2 6h7V3l5 5-5 5v-3H2z" />
  </svg>
);

const IconDiamond = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinejoin="round"
  >
    <path d="M8 2 14 8 8 14 2 8z" />
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

// The current colour, ringed so that white still shows on the white dock.
const ColorDot = ({ hex }: { hex: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
    <circle cx="8" cy="8" r="6" fill={hex} stroke="rgba(0,0,0,0.15)" strokeWidth="1" />
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
  "generate-compose",
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
    label: "Prompt",
    icon: <Sparkles size={16} />,
  },
  {
    id: "generate-compose" as Tool,
    label: "Compose",
    icon: <PencilLine size={16} />,
  },
];

// Model-backed items (Video, Image, Prompt) and written ones (Compose) are
// different kinds of thing, so the Create menu draws a divider where the
// group changes. Read from the kind's spec, so a new written kind lands on
// the right side of it without touching this file (#181).
function isWritten(id: Tool): boolean {
  const kind = DOCK_ITEM_KIND[id];
  return !!(kind && NODE_KINDS[kind]?.authored);
}

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

// The Shapes menu, in the reference's order. Doodle is deliberately absent.
const SHAPE_ITEMS: { kind: ShapeKind; label: string; shortcut?: string; icon: React.ReactNode }[] = [
  { kind: "rect", label: "Rectangle", shortcut: "R", icon: <IconRectangle /> },
  { kind: "arrow", label: "Arrow", shortcut: "A", icon: <IconArrow /> },
  { kind: "line", label: "Line", shortcut: "L", icon: <IconLine /> },
  { kind: "ellipse", label: "Ellipse", shortcut: "O", icon: <IconEllipse /> },
  { kind: "triangle", label: "Triangle", icon: <IconTriangle /> },
  { kind: "blockArrow", label: "Block Arrow", icon: <IconBlockArrow /> },
  { kind: "diamond", label: "Diamond", icon: <IconDiamond /> },
];

interface ToolDef {
  // "shapes" and "color" are menu buttons, not tools: "shapes" arms its
  // items, and "color" sets a colour without touching the armed tool.
  id: Tool | "shapes" | "color";
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
    // Fixed, whatever was drawn last: the button opens the menu, it is not
    // itself a shape. The last one used is marked inside the menu instead.
    icon: <Shapes size={16} strokeWidth={1.5} />,
  },
  {
    id: "text",
    label: "Text",
    shortcut: "T",
    icon: <IconText />,
  },
  {
    id: "color",
    label: "Color",
    // Drawn per render from the current colour, so not fixed here.
    icon: null,
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
  const { activeTool, setTool, lastShape } = useToolStore();
  // Actions only, by selector: the whole store changes on every node move,
  // and re-rendering the dock for each one was the largest single cost of a
  // Frame drag (#155). The viewport is read when a node is placed, for the
  // same reason -- it changes on every pan and zoom frame.
  const addPanel = useNodePanel((s) => s.addPanel);
  const closeAllPanels = useNodePanel((s) => s.closeAllPanels);

  const [isGenerateMenuOpen, setIsGenerateMenuOpen] = useState(false);

  const [isLinksMenuOpen, setIsLinksMenuOpen] = useState(false);

  const [isShapesMenuOpen, setIsShapesMenuOpen] = useState(false);

  const [isColorMenuOpen, setIsColorMenuOpen] = useState(false);
  const color = useToolStore((s) => s.color);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const colorMenuRef = useRef<HTMLDivElement>(null);

  const generateBtnRef = useRef<HTMLButtonElement>(null);
  const generateMenuRef = useRef<HTMLDivElement>(null);

  const linksBtnRef = useRef<HTMLButtonElement>(null);
  const linksMenuRef = useRef<HTMLDivElement>(null);

  const shapesBtnRef = useRef<HTMLButtonElement>(null);
  const shapesMenuRef = useRef<HTMLDivElement>(null);

  const isGenerateActive = GENERATE_IDS.includes(activeTool);
  const isLinksActive = LINK_IDS.includes(activeTool);
  const isShapesActive = shapeKindOf(activeTool) !== null;

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

    // No `at`: a picked file has no cursor position, so it goes to the centre.
    window.dispatchEvent(
      new CustomEvent<UploadDetail>("canvas:upload", {
        detail: { files },
      }),
    );

    e.target.value = "";
  };

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
      setIsGenerateMenuOpen(false);
      setIsLinksMenuOpen(false);
      setIsShapesMenuOpen(false);
      setIsColorMenuOpen(false);
      closeAllPanels();
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
        if (bare(e)) setTool(shapeTool(kind));
      });
    });
    hotkeys("s", (e) => {
      if (bare(e)) setTool(shapeTool(useToolStore.getState().lastShape));
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

  // Close Shapes menu on outside click.
  useEffect(() => {
    if (!isShapesMenuOpen) return;

    const handler = (e: MouseEvent) => {
      if (
        !shapesBtnRef.current?.contains(e.target as Node) &&
        !shapesMenuRef.current?.contains(e.target as Node)
      ) {
        setIsShapesMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);

    return () => document.removeEventListener("mousedown", handler);
  }, [isShapesMenuOpen]);

  // Close Color card on outside click.
  useEffect(() => {
    if (!isColorMenuOpen) return;

    const handler = (e: MouseEvent) => {
      if (
        !colorBtnRef.current?.contains(e.target as Node) &&
        !colorMenuRef.current?.contains(e.target as Node)
      ) {
        setIsColorMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);

    return () => document.removeEventListener("mousedown", handler);
  }, [isColorMenuOpen]);

  // Sets the colour for what is drawn next, and recolours whatever is
  // selected now: Board takes shapes and text, FrameLayer the frames (#159).
  const pickColor = (hex: string) => {
    useToolStore.getState().setColor(hex);
    window.dispatchEvent(new CustomEvent<ColorDetail>(COLOR_EVENT, { detail: { hex } }));
    setIsColorMenuOpen(false);
  };

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
                setIsShapesMenuOpen(false);
                setIsColorMenuOpen(false);
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
                {GENERATE_ITEMS.map((item, i) => (
                  <Fragment key={item.id}>
                    {i > 0 && isWritten(item.id) !== isWritten(GENERATE_ITEMS[i - 1].id) && (
                      <div role="separator" className="floating-dock-submenu-divider" />
                    )}
                    <button
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
                          const { x: sx, y: sy, scale: sc } = useViewport.getState();

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

                          // A written kind (Compose) has no panel to open.
                          addPanel(cx, cy, kind, !spec.authored);
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
                  </Fragment>
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
                setIsShapesMenuOpen(false);
                setIsColorMenuOpen(false);
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
            if (tool.id === "shapes") {
              return (
                <div key={tool.id} className="floating-dock-tool-wrapper">
                  <button
                    ref={shapesBtnRef}
                    title=""
                    onClick={() => {
                      setIsShapesMenuOpen((v) => !v);
                      setIsGenerateMenuOpen(false);
                      setIsLinksMenuOpen(false);
                      setIsColorMenuOpen(false);
                    }}
                    aria-pressed={isShapesActive || isShapesMenuOpen}
                    className={btnClass(isShapesActive || isShapesMenuOpen)}
                  >
                    {tool.icon}
                  </button>

                  {!isShapesMenuOpen && (
                    <Tooltip label={tool.label} shortcut={tool.shortcut} />
                  )}

                  {isShapesMenuOpen && (
                    <div
                      ref={shapesMenuRef}
                      className={submenuClass}
                      style={{ width: "max-content" }}
                    >
                      {SHAPE_ITEMS.map((item) => (
                        <button
                          key={item.kind}
                          onClick={() => {
                            // Armed like Frame: lit until the draw finishes.
                            setTool(shapeTool(item.kind));
                            setIsShapesMenuOpen(false);
                          }}
                          // The last shape used, which is also the armed one
                          // while a shape tool is armed: what S brings back.
                          className={submenuItemClass(item.kind === lastShape)}
                        >
                          {item.icon}
                          <span>{item.label}</span>
                          {item.shortcut && (
                            <span className="floating-dock-submenu-shortcut">
                              {item.shortcut}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            if (tool.id === "color") {
              return (
                <div key={tool.id} className="floating-dock-tool-wrapper">
                  <button
                    ref={colorBtnRef}
                    title=""
                    aria-label="Color"
                    aria-expanded={isColorMenuOpen}
                    onClick={() => {
                      setIsColorMenuOpen((v) => !v);
                      setIsGenerateMenuOpen(false);
                      setIsLinksMenuOpen(false);
                      setIsShapesMenuOpen(false);
                    }}
                    // Lit only while the card is open: a colour is a setting,
                    // not a tool, so there is nothing to stay armed.
                    className={btnClass(isColorMenuOpen)}
                  >
                    <ColorDot hex={color ?? DEFAULT_SWATCH.hex} />
                  </button>

                  {!isColorMenuOpen && <Tooltip label={tool.label} />}

                  {isColorMenuOpen && (
                    <div
                      ref={colorMenuRef}
                      className={`${submenuClass} floating-dock-color-card`}
                      role="group"
                      aria-label="Colors"
                    >
                      {PALETTE.map((s) => (
                        <button
                          key={s.hex}
                          type="button"
                          title={s.name}
                          aria-label={s.name}
                          aria-pressed={s.hex === color}
                          onClick={() => pickColor(s.hex)}
                          className={[
                            "floating-dock-swatch",
                            s.hex === color ? "floating-dock-swatch-current" : "",
                          ].join(" ")}
                          style={{ backgroundColor: s.hex }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            const isUpload = tool.id === "media-upload";
            // Frame is armed, not immediate: it stays lit until the drag that
            // draws it finishes. Upload opens a dialog. The rest do nothing
            // yet and stay visibly disabled rather than lying.
            // Text is armed the same way: lit until the click that places it.
            const isFrame = tool.id === "frame" || tool.id === "text";
            const isLive = isUpload || isFrame;

            return (
              <div key={tool.id} className="floating-dock-tool-wrapper">
                <button
                  title=""
                  tabIndex={isLive ? 0 : -1}
                  onClick={
                    isUpload ? openFilePicker
                    : isFrame ? () => setTool(tool.id as Tool)
                    : undefined
                  }
                  // Both are "pressed" states, but of different kinds: upload
                  // is busy until its files land, frame is armed until drawn.
                  aria-pressed={
                    isUpload ? isUploading
                    : isFrame ? activeTool === tool.id
                    : undefined
                  }
                  className={
                    isUpload ? btnClass(isUploading)
                    : isFrame ? btnClass(activeTool === tool.id)
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
