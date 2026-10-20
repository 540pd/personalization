// What the style bar shows for a selection: which controls, and the value
// each one reads. Pure, so every mix of kinds can be checked without a stage.

import type { KonvaNodeRecord } from "@/store/konvaNodes.store";
import type { FrameRecord } from "@/store/frame.store";
import { COLORS, SHAPE_STYLE, TEXT_STYLE } from "@/constants/canvas.constants";
import { STROKE_MODES, type FillMode, type StrokeMode } from "../../board/shapeStyle";
import { isLineKind } from "../../board/shapes";
import type { TextAlign } from "../../board/text";

/** The value every item shares, or undefined when they differ (or there are none). */
export function shared<T, K extends keyof T>(items: readonly T[], key: K): T[K] | undefined {
  if (!items.length) return undefined;
  const first = items[0][key];
  return items.every((s) => s[key] === first) ? first : undefined;
}

export interface BarSelection {
  /** The selected Konva nodes' records, those that have one. */
  records: KonvaNodeRecord[];
  /** How many Konva nodes are selected, records or not. */
  selected: number;
  frames: FrameRecord[];
  /** A generated node (a panel) is in the selection. */
  panelsSelected: boolean;
}

export interface BarModel {
  /** Color, Fill, Stroke and the rest apply. */
  styleable: boolean;
  /** Only text: Color and the text controls. */
  textOnly: boolean;
  /** Text with anything else, or a Frame: Color only. */
  colorOnly: boolean;
  hasFill: boolean;
  strokeModes: readonly StrokeMode[];
  /** The shared colour; null the default, undefined when they differ. */
  color: string | null | undefined;
  /** What the Color button's dot shows; undefined draws the wheel. */
  dotHex: string | undefined;
  fill: FillMode | undefined;
  stroke: StrokeMode | undefined;
  width: number | undefined;
  size: number | undefined;
  bold: boolean;
  italic: boolean;
  align: TextAlign | undefined;
  /** One Frame alone: the one Auto layout and Remove frame act on. */
  layoutFrame: FrameRecord | null;
}

export function barModel({ records, selected, frames, panelsSelected }: BarSelection): BarModel {
  // Color, Fill, Stroke and the rest: only for shapes, text and Frames.
  const styleable =
    !panelsSelected &&
    records.length + frames.length > 0 && records.length === selected &&
    records.every((r) => r.style || r.textStyle);

  const styles = records.flatMap((r) => (r.style ? [r.style] : []));
  const texts = records.filter((r) => r.textStyle);
  const lines = records.filter((r) => r.shape && isLineKind(r.shape)).length;
  // Only text: Color and the text controls. Text with anything else, or a
  // Frame: Color only.
  const textOnly = texts.length > 0 && texts.length === records.length && !frames.length;
  const colorOnly = frames.length > 0 || texts.length > 0;
  const textStyles = texts.map((r) => r.textStyle!);
  // Fill only when nothing selected is a line; "No stroke" likewise.
  const hasFill = !colorOnly && lines === 0;
  const strokeModes = hasFill ? STROKE_MODES : STROKE_MODES.filter((m) => m !== "none");
  // A Frame's colour is its outline; unset is the default outline.
  const colors = [
    ...styles.map((s) => s.color),
    ...textStyles.map((t) => t.color),
    ...frames.map((f) => f.stroke ?? null),
  ];
  const color = colors.every((c) => c === colors[0]) ? colors[0] : undefined;
  // undefined: they differ. null: the default, which on a line is its
  // stroke, on a Frame its outline and on text its letters.
  const only = (n: number) => n > 0 && n === records.length + frames.length;
  const dotHex =
    color === undefined ? undefined
    : color ?? (
      only(frames.length) ? COLORS.frameStroke
      : only(texts.length) ? TEXT_STYLE.fill
      : only(lines) ? SHAPE_STYLE.stroke
      : SHAPE_STYLE.fill
    );

  return {
    styleable,
    textOnly,
    colorOnly,
    hasFill,
    strokeModes,
    color,
    dotHex,
    fill: colorOnly ? undefined : shared(styles, "fill"),
    stroke: colorOnly ? undefined : shared(styles, "stroke"),
    width: colorOnly ? undefined : shared(styles, "width"),
    size: shared(textStyles, "size"),
    bold: textStyles.every((t) => t.bold),
    italic: textStyles.every((t) => t.italic),
    align: shared(textStyles, "align"),
    // One Frame alone: Auto layout and Remove frame.
    layoutFrame: !records.length && frames.length === 1 ? frames[0] : null,
  };
}
