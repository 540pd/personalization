import { COLORS } from "@/constants/canvas.constants";

// How a Create node is outlined in each of its three states (#559). The form
// is docked on the right of the board (#557), away from its node, so the node
// whose form is open is drawn in the accent: that is the only thing on the
// board saying which node the form belongs to. The outline, the ports and the
// name all read this one rule; none of them decides a colour for itself.

export type NodeState = "unselected" | "selected" | "open";

export interface NodeOutline {
  colour: string;
  /** Dashed around an empty node whose form is open, as in the Figma. */
  line: "solid" | "dashed";
  /**
   * Screen px of surface colour between the outline and the node, so the
   * accent still shows around an image of a similar colour.
   */
  gap: number;
  /** Drawn as linked to the open form: the ports and the name follow. */
  linked: boolean;
}

/** Selected is the transformer border; open is selected with its form showing. */
export const nodeState = (isActive: boolean, isPanelOpen: boolean): NodeState =>
  isPanelOpen ? "open" : isActive ? "selected" : "unselected";

const PLAIN: NodeOutline = { colour: COLORS.ink, line: "solid", gap: 0, linked: false };

/**
 * `filled`: the node shows an output. Provisional (#559): the one Figma screen
 * shows an empty node with its form open, dashed; solid for a filled one is a
 * reading of that, to be confirmed.
 */
export function nodeOutline(state: NodeState, filled: boolean): NodeOutline {
  if (state !== "open") return PLAIN;
  return { colour: COLORS.selected, line: filled ? "solid" : "dashed", gap: 2, linked: true };
}
