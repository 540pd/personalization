import { Layers, Image, Sparkles, type LucideIcon } from "lucide-react";

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
 *
 * `emptyState` is declared but not yet rendered anywhere -- selecting an
 * item currently only moves the highlight.
 */

export type SectionId = "playspace" | "assets" | "skills";

export interface SidebarItemSpec {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  /** Shown in place of the section when it has nothing to display yet. */
  emptyState: string;
}

export const SIDEBAR_ITEMS: SidebarItemSpec[] = [
  {
    id: "playspace",
    label: "Playspace",
    icon: Layers,
    emptyState: "The canvas.",
  },
  {
    id: "assets",
    label: "Assets",
    icon: Image,
    emptyState: "Your assets will appear here.",
  },
  {
    id: "skills",
    label: "Skills",
    icon: Sparkles,
    emptyState: "Your skills will appear here.",
  },
];

export const DEFAULT_SECTION: SectionId = "playspace";
