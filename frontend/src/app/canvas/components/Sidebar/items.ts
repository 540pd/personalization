import { Layers, Image, BrainCircuit, Bot, BarChart3, type LucideIcon } from "lucide-react";

/**
 * The sidebar's destinations, as data.
 *
 * Same move as the node-kind registry: one place a destination is
 * enumerated, so adding one is a line here rather than an edit to the nav,
 * the item and the shell. That abstraction has now held twice -- adding the
 * instruction and video kinds each cost one file plus one registry line.
 *
 * Assets and Skills are not new surfaces invented for the rail. CLAUDE.md
 * already lists them as Luma screen IDs (ASSET-01/02, SKILL-01) and
 * components/panels/ already holds empty-state stubs for both, built for
 * the right-hand tabbed panel that was never mounted. Whoever makes these
 * destinations real should start from those rather than from scratch.
 */

// "settings" is a page but not a rail item: it opens from the user menu (#214).
export type SectionId = "playspace" | "assets" | "skills" | "agents" | "usage" | "settings";

export interface SidebarItemSpec {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  /**
   * False for a destination that exists as a placeholder only. Rendered
   * disabled rather than hidden: the rail is a map of what this product
   * will be, and hiding them would make it look smaller than it is.
   */
  available: boolean;
}

export const SIDEBAR_ITEMS: SidebarItemSpec[] = [
  {
    id: "playspace",
    label: "Playspace",
    icon: Layers,
    available: true,
  },
  {
    id: "assets",
    label: "Assets",
    icon: Image,
    available: false,
  },
  {
    id: "skills",
    label: "Skills",
    icon: BrainCircuit,
    // #206: a page of its own, shown over the board.
    available: true,
  },
  {
    id: "agents",
    label: "Agents",
    icon: Bot,
    // #208: saved Prompt-panel setups, a page like Skills.
    available: true,
  },
  // Last: the working surfaces come first, and this one reports on them
  // rather than being somewhere you go to make something.
  {
    id: "usage",
    label: "Usage",
    icon: BarChart3,
    available: false,
  },
];

export const DEFAULT_SECTION: SectionId = "playspace";
