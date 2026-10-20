// The style bar's icons. Each takes the value it pictures, so the same icon
// draws a button's current state and each option in its card.

import { TextAlignCenter, TextAlignEnd, TextAlignStart } from "lucide-react";
import type { FillMode, StrokeMode } from "../../board/shapeStyle";
import type { TextAlign } from "../../board/text";

export const AlignIcon = ({ align }: { align: TextAlign | undefined }) =>
  align === "center" ? <TextAlignCenter size={18} aria-hidden />
  : align === "right" ? <TextAlignEnd size={18} aria-hidden />
  : <TextAlignStart size={18} aria-hidden opacity={align ? 1 : 0.5} />;

// The shape's colour, ringed so white still shows on the white bar. With
// shapes of different colours selected, a wheel: no one colour is current.
export const ColorDot = ({ hex }: { hex: string | undefined }) => (
  <span
    className="shape-style-dot"
    style={{
      background: hex ?? "conic-gradient(#f8695f, #fcd12a, #45cf6e, #3b9ef5, #c08cf5, #f8695f)",
    }}
  />
);

// Squares for Fill: a square reads as "the inside" where Luma's crossed-out
// circle does not.
export const FillIcon = ({ mode }: { mode: FillMode | undefined }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
    <defs>
      <pattern id="shape-style-dots" width="4" height="4" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="0.8" fill="currentColor" />
        <circle cx="3" cy="3" r="0.8" fill="currentColor" />
      </pattern>
    </defs>
    <rect
      x="2.5" y="2.5" width="13" height="13" rx="2.5"
      fill={mode === "solid" ? "currentColor" : mode === "pattern" ? "url(#shape-style-dots)" : "none"}
      stroke="currentColor" strokeWidth="1.5"
    />
    {mode === "none" && <line x1="4" y1="14" x2="14" y2="4" stroke="currentColor" strokeWidth="1.5" />}
    {mode === undefined && <text x="9" y="12.5" fontSize="9" textAnchor="middle" fill="currentColor">?</text>}
  </svg>
);

const DASH: Record<StrokeMode, string | undefined> = {
  none: undefined,
  solid: undefined,
  dashed: "5 3",
  dotted: "0.1 3.5",
};

// A line drawn in the stroke style; crossed out for None.
export const StrokeIcon = ({ mode, width = 2 }: { mode: StrokeMode | undefined; width?: number }) => (
  <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden>
    <line
      x1="3" y1="9" x2="19" y2="9"
      stroke="currentColor"
      strokeWidth={mode === "none" ? 1.5 : width}
      strokeDasharray={mode ? DASH[mode] : "1 3"}
      strokeLinecap={mode === "dotted" ? "round" : "butt"}
      opacity={mode === "none" ? 0.5 : 1}
    />
    {mode === "none" && <line x1="6" y1="15" x2="16" y2="3" stroke="currentColor" strokeWidth="1.5" />}
  </svg>
);

// Create frame (#243): Luma's corners, a Frame to come around the selection.
export const CreateFrameIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
    <path d="M2.5 6V2.5H6M12 2.5h3.5V6M15.5 12v3.5H12M6 15.5H2.5V12" />
  </svg>
);

// Remove frame (#244): the same corners, crossed out.
export const RemoveFrameIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
    <path d="M2.5 6V2.5H6M12 2.5h3.5V6M15.5 12v3.5H12M6 15.5H2.5V12" />
    <path d="M6.5 6.5l5 5M11.5 6.5l-5 5" />
  </svg>
);

// Auto layout's icon shows what a click will do, as Luma's does: tidy tiles
// to lay them out, loose tiles to stop (#225).
export const LayoutIcon = ({ on }: { on: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <rect x="2" y="4" width="20" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    {on ? <>
      <rect x="5" y="6.5" width="5" height="4" rx="1" fill="currentColor" />
      <rect x="12.5" y="8" width="5" height="4" rx="1" fill="currentColor" />
      <rect x="6.5" y="13" width="5" height="4" rx="1" fill="currentColor" />
      <rect x="14" y="13.5" width="5" height="4" rx="1" fill="currentColor" />
    </> : <>
      <rect x="5" y="7" width="6" height="4" rx="1" fill="currentColor" />
      <rect x="13" y="7" width="6" height="4" rx="1" fill="currentColor" />
      <rect x="5" y="13" width="6" height="4" rx="1" fill="currentColor" />
      <rect x="13" y="13" width="6" height="4" rx="1" fill="currentColor" />
    </>}
  </svg>
);

// Each thickness as a bar, scaled to read at icon size.
export const WidthIcon = ({ width }: { width: number }) => (
  <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden>
    <line x1="4" y1="9" x2="18" y2="9" stroke="currentColor" strokeWidth={Math.min(width, 6)} strokeLinecap="round" />
  </svg>
);
