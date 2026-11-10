// Moved out of AssetsPage (#462), unchanged.

import { useSection } from "@/store/section.store";
import { stripExtension, uploadEvent } from "../board/upload";
import { master, type AssetsDraft } from "./assetsDraft";

/**
 * Place on the board (#446): the master into Playspace, by its stored URL.
 * Saved masters only, and with nothing unsaved: Cancel deletes an unsaved
 * upload, which would leave the board pointing at nothing.
 */
export function placeMaster(draft: AssetsDraft, dirty: boolean): { blocked: string | null; onPlace: () => void } {
  const hero = master(draft);
  const blocked = !hero || hero.upload
    ? "Wait until the master image has uploaded."
    : dirty
      ? "Save your changes first to place it on the board."
      : null;
  return {
    blocked,
    onPlace: () => {
      if (!hero || blocked) return;
      // Nothing unsaved, so no leave guard holds this back: the board is on
      // screen before the image lands on it.
      useSection.getState().setSection("playspace");
      uploadEvent.emit({
        files: [],
        stored: [{ url: hero.asset.url, name: draft.productName.trim() || stripExtension(hero.asset.name) }],
      });
    },
  };
}
