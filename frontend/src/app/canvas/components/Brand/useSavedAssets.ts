"use client";

// The saved Assets page, loaded once for the whole Campaign Brief (#444): its
// product and logo rows and its creative references (#442) read the same load,
// and one Retry reloads it for all of them.

import { useCallback, useEffect, useState } from "react";
import { fetchBrandAssets, type BrandAssetsView } from "@/api/brandAssets.api";
import { useSection } from "@/store/section.store";

export type SavedAssets = { state: "loading" } | { state: "failed" } | { state: "ready"; view: BrandAssetsView };

export function useSavedAssets(): { load: SavedAssets; retry: () => void } {
  const [load, setLoad] = useState<SavedAssets>({ state: "loading" });
  const retry = useCallback(() => {
    setLoad({ state: "loading" });
    fetchBrandAssets().then(
      (view) => setLoad({ state: "ready", view }),
      () => setLoad({ state: "failed" }),
    );
  }, []);
  useEffect(retry, [retry]);
  return { load, retry };
}

/** To the Assets page, through setSection, so unsaved Brand edits are asked about first. */
export const toAssets = () => useSection.getState().setSection("assets");
