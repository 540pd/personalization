"use client";

import { PALETTE } from "../board/palette";

/**
 * The palette's swatches, one button each, for the dock's Color card and the
 * style bar's (#159). Only the buttons: the card around them, with its role
 * and label, belongs to the menu that opens it. Each surface keeps its own
 * classes, `<prefix>-swatch` and `<prefix>-swatch-current`.
 */
export default function SwatchGrid({
  classPrefix,
  current,
  onPick,
}: {
  classPrefix: "floating-dock" | "shape-style";
  /** The selection's colour; undefined or null marks none as current. */
  current: string | null | undefined;
  onPick: (hex: string) => void;
}) {
  return PALETTE.map((s) => (
    <button
      key={s.hex}
      type="button"
      title={s.name}
      aria-label={s.name}
      aria-pressed={s.hex === current}
      onClick={() => onPick(s.hex)}
      className={[`${classPrefix}-swatch`, s.hex === current ? `${classPrefix}-swatch-current` : ""].join(" ")}
      style={{ backgroundColor: s.hex }}
    />
  ));
}
