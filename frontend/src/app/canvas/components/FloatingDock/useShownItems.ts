"use client";

// The Create and Shapes menu items the user has chosen to show (#404).

import { useEffect, useMemo } from "react";
import { shapeTool, useToolStore } from "@/store/tool.store";
import { useSettings } from "@/store/settings.store";
import { toolShown } from "../../settings/settings";
import { GENERATE_ITEMS, SHAPE_ITEMS } from "./items";

export function useShownItems() {
  const settings = useSettings((s) => s.settings);

  const createItems = useMemo(() => GENERATE_ITEMS.filter((item) => toolShown(settings, item.id)), [settings]);
  const shapeItems = useMemo(
    () => SHAPE_ITEMS.filter((item) => toolShown(settings, shapeTool(item.kind))),
    [settings],
  );

  // Hiding the armed tool disarms it: a shape no longer on offer must not stay
  // lit, nor draw on the next drag.
  useEffect(() => {
    const { activeTool, setTool } = useToolStore.getState();
    if (!toolShown(settings, activeTool)) setTool("pointer");
  }, [settings]);

  return { createItems, shapeItems };
}
