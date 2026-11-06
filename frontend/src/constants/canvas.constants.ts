// Shared canvas values used across Board, NodePanel, KonvaNodePorts and ConnectionOverlay.

export const COLORS = {
  ink:          "#000000",
  paper:        "#ffffff",
  selected:     "#2563eb",
  panelBorder:  "rgba(0,0,0,0.08)",
  placeholder:  "#f5f5f5",
  mediaFill:    "#1e1e2e",
  mediaStroke:  "#6b6b8a",
  // A Frame has to be findable without selecting it (#115). The border does
  // the work: ~3:1 against the board, the usual floor for a UI boundary
  // (#d4d4d4 was ~1.5:1 and read as nothing). The fill stays a whisper,
  // lighter than a Create node's placeholder, so what sits inside a Frame
  // reads exactly as it does outside one.
  frameFill:    "#f7f7f8",
  frameStroke:  "#949494",
} as const;

// Smallest frame a drag may produce, in SCREEN px -- a drag under this is a
// misclick, not a frame. Converted by scale at the call site, or a legitimate
// small frame would be impossible to draw zoomed out.
export const FRAME_MIN_EDGE = 20;

// Auto layout (#225): space around and between a Frame's children, in CANVAS
// units, so it scales with them. Fixed, as in Luma: no settings.
export const FRAME_LAYOUT_PADDING = 16;
export const FRAME_LAYOUT_GAP = 16;
// Room above an item that shows a name, inside the layout (#235): the name's
// LABEL_GAP and line height, so at 100% it sits clear of the Frame's edge and
// of the item above. Canvas units, like the layout: exact at 100%.
export const FRAME_LAYOUT_NAME_BAND = 24;
// Above a name at the top of a Frame, in place of FRAME_LAYOUT_PADDING: as
// close to the edge as the name is to its item, so it sits snug above it
// rather than floating between the two (#235).
export const FRAME_LAYOUT_NAME_TOP = 8;

// Paint order. Spaced so the Konva canvas can sit either side of the node
// placeholders without disturbing anything else.
//
// Every Konva shape shares ONE <canvas>, and the placeholders are DOM
// siblings, so a DOM element cannot interleave with canvas pixels: the whole
// canvas is above the placeholders or below them, never partly. Flipping it
// is what lets a dragged uploaded image come to the front of a Create Image
// node -- see layerOrder.store.
//
// Wires, ports and labels stay above both: they are canvas chrome, and an
// image drifting over a port or a node's own name would be a regression, not
// depth.
//
// `rail` is the window's own chrome and sits above all of it. The nav rail was
// given a bare `z-50` in CSS, which tied it with the ports and lost to the
// labels: a node dragged under the rail hid correctly while its name and its
// port dot went on drawing over the top. Everything from `canvasBelow` to
// `labels` is content in the canvas, and content belongs under the rail.
export const Z_INDEX = {
  // Frames are a backdrop: always behind every node, whichever way the
  // canvas/placeholder flip currently sits. That is why they get a tier of
  // their own below canvasBelow rather than riding on the main stage, whose
  // container moves between 10 and 30 as one unit.
  frames:       5,
  // Drawn shapes, on a canvas of their own (#430): always behind the Create
  // nodes, images and text, and over the frames they sit in.
  shapes:       7,
  canvasBelow: 10,
  nodes:       20,
  canvasAbove: 30,
  // The transformer and selection outlines (#430): over the Create nodes, so
  // a shape's handles still show where a node covers it. Under the wires,
  // ports and labels, as the board's content was.
  selectionChrome: 31,
  wires:       40,
  ports:       50,
  labels:      60,
  // The Color / Fill / Stroke bar above a selected shape (#161). Over the
  // labels, since it sits where a label would; under an open Create form.
  styleBar:    62,
  // A node's open Create form. Not canvas content but the editor for one
  // node, so nothing on the board may sit over it: it shared `nodes` with
  // every placeholder, so a node made later -- an image variant, which lands
  // exactly where the form opens -- painted straight across it, and so did
  // the whole canvas whenever an image had been dragged last. Below the rail,
  // which still covers everything, as the layering spec requires.
  panelForm:   65,
  // The @ menu under a panel's Instruction (#239): over the form it belongs
  // to, under a page that covers the board.
  mentionMenu: 66,
  // A rail destination other than the board -- the Skills page (#206). It
  // covers the board and everything on it, the open Create form included,
  // so none of it can be clicked through; the rail still sits over its edge.
  page:        68,
  rail:        70,
  // Above the rail, unlike everything else here. It is not canvas content but
  // a transient answer to "will this drop land?", and it is inset to the
  // visible canvas anyway, so it never actually covers the rail.
  dropOverlay: 80,
} as const;

export const MIN_NODE_SIZE = 60; // canvas units

// --- Drawn shapes ----------------------------------------------------------
// Neutral until shapes get colour. The fill is what makes the inside of a
// shape clickable -- Konva hit-tests only what is painted -- and the stroke
// keeps an edge on a shape sitting on a pale frame. The stroke is in canvas
// units, so it zooms with the board like the shape it outlines.
export const SHAPE_STYLE = {
  fill: "#e5e5e5",
  stroke: "#404040",
  strokeWidth: 2,
} as const;

// --- Text --------------------------------------------------------------------
// One style until text formatting arrives. The family is Tailwind's default
// sans stack, written out because Konva paints with the canvas API and does
// not see CSS -- the editor uses the same string so the two match exactly.
export const TEXT_STYLE = {
  fontSize: 24,
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  fill: "#171717",
  lineHeight: 1.25,
  padding: 0,
} as const;

// Narrowest a fixed-width text may be drawn or resized to: about two
// characters at the default size.
export const TEXT_MIN_WIDTH = 24; // canvas units

// A click with a shape tool, rather than a drag, places one this size.
export const SHAPE_DEFAULT_SIZE = 100; // canvas units

// Smallest a shape may be drawn or resized to. Far below MIN_NODE_SIZE: an
// image needs room to be recognisable, a shape is often a small marker.
export const SHAPE_MIN_SIZE = 8; // canvas units

// A press that moves less than this, in SCREEN px, is a click and places the
// default size. Screen rather than canvas for the same reason as
// FRAME_MIN_EDGE.
export const SHAPE_CLICK_SLOP = 4;

// How far from a line or arrow a click still lands on it, in SCREEN px each
// side. A 2px line is otherwise close to impossible to hit, and in canvas
// units it would get harder still the further out the board is zoomed.
export const LINE_HIT_SLOP = 6;

// A bend dragged back to within this of straight, in SCREEN px, snaps
// straight. Without it a line can only ever be nearly straight again.
export const LINE_STRAIGHT_SNAP = 4;

// Length of a line or arrow placed by a click rather than a drag.
export const LINE_DEFAULT_LENGTH = 100; // canvas units

// The longest edge of a node's default footprint, in canvas units. Shared by
// both node types so an imported image and a generated one land at the same
// size — a generated node used to default to 200, rendering your own output at
// 42% the size of content you brought in. Capping only the width let a tall
// image through at any height: a 1000x3000 upload became 480x1440.
//
// 260 rather than 320: a node is as much a graph element as a picture now
// that boards hold several wired together, and the default is only a
// starting point -- nodes resize and the canvas zooms, so erring small is
// the cheaper mistake.
//
// Floor is around 180. The empty state needs roughly 64px of content height
// for its icon and two lines, and a 16:9 node at edge 180 is only 101px tall.
//
// Also keeps the Create Image panel on the node's preferred right-hand side
// on any window down to ~948px: it needs edge <= viewportWidth - 688. The
// panel is now wider than its node, which 320 had avoided by matching
// PANEL_W exactly.
export const DEFAULT_NODE_MAX_EDGE = 260;

// Aspect ratios offered by the Create Image panel, and the default.
export const ASPECT_MAP: Record<string, [number, number]> = {
  "16:9": [16, 9], "1:1": [1, 1], "9:16": [9, 16], "4:3": [4, 3], "3:4": [3, 4],
};
export const DEFAULT_ASPECT_RATIO = "16:9";

// A Create Image node has no natural size, so its footprint comes from the
// chosen ratio with the long edge pinned to DEFAULT_NODE_MAX_EDGE. Lives here
// rather than in NodePanel so nodePanel.store can seed a new node with the
// same numbers instead of repeating them as literals.
export function placeholderSize(ratio: string): { w: number; h: number } {
  const [aw, ah] = ASPECT_MAP[ratio] ?? ASPECT_MAP[DEFAULT_ASPECT_RATIO];
  if (aw >= ah) {
    return { w: DEFAULT_NODE_MAX_EDGE, h: Math.round(DEFAULT_NODE_MAX_EDGE * ah / aw) };
  }
  return { w: Math.round(DEFAULT_NODE_MAX_EDGE * aw / ah), h: DEFAULT_NODE_MAX_EDGE };
}

// Corner radius for canvas nodes, in canvas units. The single source for both
// node types: Konva reads it as cornerRadius, and the Create Image placeholder
// sets it inline so its children can inherit. It used to be duplicated here
// and as Tailwind rounded-2xl in NodePanel.scss, which only agreed by hand.
// The placeholder is scaled by the viewport transform, so both shrink with
// zoom in step. 10 rather than 16 because the node itself shrank to 320 --
// holding the radius fixed had pushed it from 3.3% to 5% of the node's width.
export const NODE_CORNER_RADIUS = 10;
// Frames round exactly as nodes do, so the board reads as one surface rather
// than two kinds of box. Declared from the node value, not beside it, so the
// two cannot drift apart again -- they were 4 and 10.
export const FRAME_CORNER_RADIUS = NODE_CORNER_RADIUS;

// --- Node name label -------------------------------------------------------
// Font of the name shown above a selected node. The line box is taller than
// the glyphs, and NodeLabel subtracts that difference so LABEL_GAP below means
// the gap you actually see rather than the gap to an invisible box edge.
export const LABEL_FONT_SIZE  = 12;
export const LABEL_LINE_HEIGHT = 16;

// Visible clearance between a node's top edge and the bottom of its name, in
// screen px (chrome keeps a fixed pixel size, so this does not scale with
// zoom). Floor is about 5: the transformer's top-left anchor reaches
// SELECTION.anchorSize / 2 above the node edge and the label is left-aligned
// to that same corner, so a smaller value collides with the handle.
export const LABEL_GAP = 8;

// Below this on-screen node width no useful amount of text fits, so the label
// is dropped entirely. Keyed off rendered width rather than zoom, which covers
// both zooming far out and a node that is simply small.
export const LABEL_MIN_NODE_W = 100;

export const SELECTION = {
  // 0: the selection border sits flush on the node edge rather than floating
  // clear of it.
  padding:            0,
  borderWidth:        1.5,
  anchorSize:         8,
  anchorCornerRadius: 2,
} as const;

// Ports are 12px circles centred on the node edge (#456); the look is in
// Connections.scss. PORT_WIDTH is how far one reaches into its node, half the
// circle, which is where occlusion probes for a cover.
export const PORT_WIDTH    = 6;
export const PORT_FRACTION = 0.3; // vertical position from the node's top edge
export const SNAP_RADIUS   = 16;
