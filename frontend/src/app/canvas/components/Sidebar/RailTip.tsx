"use client";

import type { ReactNode } from "react";
import Tooltip from "@/components/Tooltip";
import { useSidebar } from "@/store/sidebar.store";

/**
 * A tooltip that shows only while the rail is minimized.
 *
 * Expanded, every label is already on screen, so a tooltip would only repeat
 * it. Minimized, the tooltip is the label.
 *
 * The anchor is rendered in both modes, with empty content when expanded.
 * Wrapping only when minimized would change the tree on every toggle and
 * remount the toggle button under the keyboard user who just pressed it.
 */
export default function RailTip({ content, children }: { content: string; children: ReactNode }) {
  const minimized = useSidebar((s) => s.collapsed);
  return (
    <Tooltip content={minimized ? content : ""} className="sidebar-tip">
      {children}
    </Tooltip>
  );
}
