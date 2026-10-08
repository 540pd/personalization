import { Layers, Boxes, Brain, type LucideIcon } from "lucide-react";

/**
 * The sidebar's destinations, as data.
 *
 * Same move as the node-kind registry: one place a destination is
 * enumerated, so adding one is a line here rather than an edit to the nav,
 * the item and the shell. That abstraction has now held twice — adding the
 * instruction and video kinds each cost one file plus one registry line.
 */

export type SectionId = "playspace" | "production" | "brand-brain";

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
    id: "production",
    label: "Production",
    icon: Boxes,
    emptyState: "Production runs will appear here.",
  },
  {
    id: "brand-brain",
    label: "Brand Brain",
    icon: Brain,
    emptyState: "Brand knowledge will appear here.",
  },
];

export const DEFAULT_SECTION: SectionId = "playspace";
