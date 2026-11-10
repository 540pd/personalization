// What the dock offers: its menus' items and its right-hand tools.

import type { ReactNode } from "react";
import { Video, Image as ImageIcon, Sparkles, PencilLine, Upload, Shapes } from "lucide-react";
import { shapeTool, type ShapeKind, type Tool } from "@/store/tool.store";
import type { NodeKind } from "@/store/nodePanel.store";
import { modShortcut } from "@/lib/dom/keys";
import { NODE_KINDS } from "@/app/canvas/components/NodePanel/kinds";
import {
  IconArrow, IconBlockArrow, IconDiamond, IconEllipse, IconFrame, IconLine,
  IconLinkCurve, IconLinkElbow, IconLinkStraight, IconRectangle, IconText, IconTriangle,
} from "./icons";

export interface DockItem {
  id: Tool;
  label: string;
  icon: ReactNode;
}

// Which node kind each Create submenu item makes.
export const DOCK_ITEM_KIND: Partial<Record<string, NodeKind>> = {
  "generate-image": "image",
  "generate-instruction": "instruction",
  "generate-video": "video",
  "generate-compose": "compose",
};

export const GENERATE_IDS: Tool[] = [
  "generate-instruction",
  "generate-image",
  "generate-video",
  "generate-compose",
];

export const GENERATE_ITEMS: DockItem[] = [
  { id: "generate-video", label: "Video", icon: <Video size={16} /> },
  { id: "generate-image", label: "Image", icon: <ImageIcon size={16} /> },
  { id: "generate-instruction", label: "Prompt", icon: <Sparkles size={16} /> },
  { id: "generate-compose", label: "Compose", icon: <PencilLine size={16} /> },
];

// Model-backed items (Video, Image, Prompt) and written ones (Compose) are
// different kinds of thing, so the Create menu draws a divider where the
// group changes. Read from the kind's spec, so a new written kind lands on
// the right side of it without touching this file (#181).
export function isWritten(id: Tool): boolean {
  const kind = DOCK_ITEM_KIND[id];
  return !!(kind && NODE_KINDS[kind]?.authored);
}

export const LINK_IDS: Tool[] = ["link-straight", "link-elbow", "link-curve"];

export const LINK_ITEMS: DockItem[] = [
  { id: "link-straight", label: "Straight", icon: <IconLinkStraight /> },
  { id: "link-elbow", label: "Elbow", icon: <IconLinkElbow /> },
  { id: "link-curve", label: "Curve", icon: <IconLinkCurve /> },
];

// The Shapes menu, in the reference's order. Doodle is deliberately absent.
export const SHAPE_ITEMS: { kind: ShapeKind; label: string; shortcut?: string; icon: ReactNode }[] = [
  { kind: "rect", label: "Rectangle", shortcut: "R", icon: <IconRectangle /> },
  { kind: "arrow", label: "Arrow", shortcut: "A", icon: <IconArrow /> },
  { kind: "line", label: "Line", shortcut: "L", icon: <IconLine /> },
  { kind: "ellipse", label: "Ellipse", shortcut: "O", icon: <IconEllipse /> },
  { kind: "triangle", label: "Triangle", icon: <IconTriangle /> },
  { kind: "blockArrow", label: "Block Arrow", icon: <IconBlockArrow /> },
  { kind: "diamond", label: "Diamond", icon: <IconDiamond /> },
];

/** The icon a Create or Shapes menu item has, for the Settings row that hides it (#404). */
export function dockIcon(tool: Tool): ReactNode {
  return (
    GENERATE_ITEMS.find((item) => item.id === tool)?.icon ??
    SHAPE_ITEMS.find((item) => shapeTool(item.kind) === tool)?.icon ??
    null
  );
}

export interface ToolDef {
  // "shapes" and "color" are menu buttons, not tools: "shapes" arms its
  // items, and "color" sets a colour without touching the armed tool.
  id: Tool | "shapes" | "color";
  label: string;
  shortcut?: string;
  icon: ReactNode;
}

export const TOOLS_RIGHT: ToolDef[] = [
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
    // ⌘U on a Mac, Ctrl+U elsewhere: the key works on both. The dock renders
    // in the browser only (ssr: false), so reading the platform here is safe.
    shortcut: modShortcut("U"),
    icon: <Upload size={16} />,
  },
];
