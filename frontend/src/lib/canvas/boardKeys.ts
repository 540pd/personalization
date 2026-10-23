import { boardIsShown } from "@/store/section.store";
import { isPageKey } from "@/lib/dom/keys";

/**
 * A key the board's shortcuts may act on: the board is the page on screen
 * (#206), and the key was not typed into a field or pressed in a dialog.
 */
export function boardKeyAllowed(e: KeyboardEvent): boolean {
  return boardIsShown() && isPageKey(e);
}
