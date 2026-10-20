// The dock's icons, inline and in currentColor, so each follows its
// button's state colour.

export const IconPointer = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M3 2v10l2.8-2.8 1.7 3.6 1.6-.8-1.7-3.6L11 8z" />
  </svg>
);

// lucide square-mouse-pointer
export const IconGenerate = () => (
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

export const IconLinks = () => (
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
export const IconLinkStraight = () => (
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

export const IconLinkElbow = () => (
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

export const IconLinkCurve = () => (
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

export const IconFrame = () => (
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
export const IconRectangle = () => (
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

export const IconArrow = () => (
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

export const IconLine = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M3 13 13 3" />
  </svg>
);

export const IconEllipse = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <ellipse cx="8" cy="8" rx="6" ry="4.5" />
  </svg>
);

export const IconTriangle = () => (
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

export const IconBlockArrow = () => (
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

export const IconDiamond = () => (
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

export const IconText = () => (
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
export const ColorDot = ({ hex }: { hex: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
    <circle cx="8" cy="8" r="6" fill={hex} stroke="rgba(0,0,0,0.15)" strokeWidth="1" />
  </svg>
);
