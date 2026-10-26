import type { NodeSettings } from "@/app/canvas/components/NodePanel/nodeKinds";
import type { SelectionSlice } from "../selectionSlice";

// What a panel node generates. The dock already offers all three
// (tool.store.ts declares generate-instruction and generate-video, and both
// sit in GENERATE_IDS), but only "image" is wired up so far.
//
// One discriminated record rather than one store per kind: placement, drag,
// resize, selection, ports, connections, labels and the 3-state lifecycle are
// identical across kinds, and duplicating them is how the same bug gets fixed
// three times.
// "compose" is the odd one out: the user writes its content rather than
// generating it (#181).
export type NodeKind = "image" | "video" | "instruction" | "compose";

// Every kind this build can show. A Record rather than a list so adding a
// NodeKind without adding it here is a type error. A saved node of any other
// kind -- from a newer branch, or a rolled-back release -- is set aside on
// load instead of crashing the board (#186).
const KNOWN_KINDS: Record<NodeKind, true> = {
  image: true,
  video: true,
  instruction: true,
  compose: true,
};

export function isKnownKind(kind: unknown): kind is NodeKind {
  return typeof kind === "string" && Object.prototype.hasOwnProperty.call(KNOWN_KINDS, kind);
}

// A node's generated result. Typed rather than a bare URL string because a
// video needs a <video> and an instruction node produces text, not a URL --
// and because what a node contributes to a downstream generation depends on
// which of those it is.
export interface PanelOutput {
  type: "image" | "video" | "text";
  value: string;
}

/**
 * What the user has typed and chosen in a node's panel. Held here rather than
 * in the component so a copy of the node can carry it.
 */
export interface PanelDraft {
  model: string;
  instruction: string;
  // Unset until a setting is first changed; the kind's defaults apply.
  settings?: NodeSettings;
}

export interface PanelInstance {
  id: string;
  kind: NodeKind;
  canvasX: number;
  canvasY: number;
  // Placeholder size in CANVAS units (synced from SinglePanel). Note canvasY
  // is the vertical CENTRE of the placeholder, not its top edge — unlike
  // KonvaNodeRecord, where canvasY is the top.
  w: number;
  h: number;
  // Set once a generation lands. Used as a reference by downstream nodes.
  output?: PanelOutput;
  // Id of an in-flight asynchronous generation. Persisted on the node so a
  // page reload resumes polling instead of losing the job.
  job?: string;
  // Display name shown above the node when selected, and the name this node is
  // referred to by when it feeds a downstream generation. Derived from the
  // instruction on first generate; renameable.
  label?: string;
  // True while `label` is one the app derived from the instruction. Such a
  // label follows the instruction: the next generate with a different prompt
  // re-derives it (#130). A rename by the user clears this and the name is
  // never changed for them again. Unset on nodes saved before the flag
  // existed, which therefore count as user-named -- the safe reading.
  labelAuto?: boolean;
  // Unset until the user first edits the panel; the kind's defaults apply.
  draft?: PanelDraft;
}

/** Where a variant copy goes and what it shows. Everything else is the source's. */
export interface VariantPlacement {
  canvasX: number;
  canvasY: number;
  output: PanelOutput;
  label: string;
}

/**
 * A node is one of three: unselected, selected (transformer border), or
 * selected with its panel open. Which ones are selected is the shared
 * selection slice; at most one is open, and it is always the only one
 * selected. Neither lives on the panel itself: a selection change rewrote
 * every panel object, and undo snapshots carried the selection back with them.
 */
export interface NodePanelState extends SelectionSlice {
  panels:      PanelInstance[];
  /** The one node whose panel is open, or null. */
  openId:      string | null;
  /**
   * Saved nodes of a kind this build does not know (#186). Never rendered and
   * never touched; only written back on save, so a build that knows the kind
   * shows them again. Their `kind` is not really a NodeKind.
   */
  parked:      PanelInstance[];
  /** `open` false lands the node selected but with no panel: a written kind has none. */
  addPanel:        (cx: number, cy: number, kind?: NodeKind, open?: boolean) => void;
  removePanel:     (id: string) => void;
  raisePanel:      (id: string) => void; // move to the top of the paint order
  openPanel:       (id: string) => void; // selected alone, panel open
  closePanel:      (id: string) => void; // panel closed, still selected
  selectAll:       () => void;           // every node, panels closed (Ctrl+A)
  removeSelected:  () => void;           // remove every selected node (Delete)
  /**
   * Paste copies of `sources`, offset by `offset` canvas units, as the new
   * selection. Returns old id → new id so wires can be re-pointed at the copies.
   * Labels are taken as given: the caller makes them unique board-wide.
   */
  pastePanels:     (sources: PanelInstance[], offset: number) => Record<string, string>;
  setCanvasPos:    (id: string, x: number, y: number) => void;
  /**
   * Move several panels in one write. A Frame drag moves every panel in the
   * frame on each pointermove; one set per panel notified every subscriber,
   * and saved the board, once per panel per move (#155).
   */
  setCanvasPositions: (positions: Record<string, { x: number; y: number }>) => void;
  /**
   * Replace every panel wholesale. Used by the shared undo timeline. A panel
   * that still exists keeps its current instruction and model: typing is not
   * an undo step, so undoing a move must not revert the instruction being
   * written. Its settings do come back from the snapshot -- a settings change
   * is a step, and may have resized the node (#129).
   *
   * `restoresDraft` names nodes whose whole draft is restored instead: for a
   * written kind (Compose) the text is the content, and closing its editor
   * is an undo step (#181).
   */
  replaceAll:      (panels: PanelInstance[], restoresDraft?: (p: PanelInstance) => boolean) => void;
  clearAll:        () => void;
  /**
   * Replace the board's panels with ones read from a file (#199): deselected,
   * closed, and with the id counter moved past them so the next new node
   * cannot take one of their ids.
   */
  loadPanels:      (panels: PanelInstance[]) => void;
  setSize:         (id: string, w: number, h: number) => void;
  setOutput:       (id: string, output: PanelOutput) => void;
  /** Record or clear an in-flight job. */
  setJob:          (id: string, job: string | undefined) => void;
  /** `auto` marks the label as derived by the app; a plain rename clears it. */
  setLabel:        (id: string, label: string, auto?: boolean) => void;
  setDraft:        (id: string, draft: PanelDraft) => void;
  /**
   * Add copies of a node, one per placement, each with the source's kind,
   * size and draft. For image variants: the source is the first variant and
   * these are the rest.
   */
  addVariants:     (sourceId: string, placements: VariantPlacement[]) => void;
}

/** The part of the store a selection change rewrites. */
export type PanelsState = Pick<NodePanelState, "panels" | "selectedIds" | "openId">;

/** Makes the id for each new panel: the store passes `nextPanelId`. */
export type NewId = () => string;
