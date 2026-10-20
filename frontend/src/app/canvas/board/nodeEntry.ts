// One Konva node as the clipboard and a board file (#198) both store it, so a
// file loads with the same constructors a paste uses.

import type Konva from "konva";
import { useKonvaNodes } from "@/store/konvaNodes.store";

/**
 * One entry per node, so a multi-selection round-trips intact.
 *
 * imageUrl and label ride alongside the Konva attrs because both live in
 * konvaNodes, not on the shape -- without imageUrl a pasted image cannot be
 * used as a generation reference, and without label it pastes nameless.
 */
export interface NodeEntry<A extends Record<string, unknown> = Record<string, unknown>> {
  className: string;
  attrs: A;
  /** Uploaded images only: the picture itself, as a data URL. */
  imageUrl?: string;
  label?: string;
}

/** `n` as an entry: its attrs as given, by default a shallow copy of its own. */
export function nodeEntry<A extends Record<string, unknown> = Record<string, unknown>>(
  n: Konva.Shape,
  attrs: A = { ...n.getAttrs() } as A,
): NodeEntry<A> {
  const rec = useKonvaNodes.getState().nodes[n.id()];
  return {
    className: n.getClassName(),
    attrs,
    ...(rec?.imageUrl ? { imageUrl: rec.imageUrl } : {}),
    ...(rec?.label ? { label: rec.label } : {}),
  };
}
