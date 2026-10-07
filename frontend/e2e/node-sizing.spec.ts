import { test, expect } from "@playwright/test";
import { DEFAULT_NODE_MAX_EDGE } from "../src/constants/canvas.constants";
import { openBoard, uploadImage, imageBox, addPanel, collapsePanels, panelBoxes } from "./helpers";

// An uploaded image and a generated one are the same kind of object, so they
// default to the same footprint. Before this was unified an upload fitted a
// 480 box while a Create Image node defaulted to 200, and setPreview never
// resized, so a generated image rendered at 42% the size of an imported one
// permanently.

test.describe("default node size", () => {
  test("a 16:9 upload and a 16:9 generated node land at the same size", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 1600, 900);
    const img = await imageBox(page);

    await addPanel(page);
    await collapsePanels(page);
    const [panel] = await panelBoxes(page);

    expect(Math.round(img.w)).toBe(DEFAULT_NODE_MAX_EDGE);
    expect(Math.round(img.h)).toBe(Math.round((DEFAULT_NODE_MAX_EDGE * 9) / 16));
    expect(Math.round(panel.w)).toBe(Math.round(img.w));
    expect(Math.round(panel.h)).toBe(Math.round(img.h));
  });

  // Capping only the width let a tall image through at any height: a 1000x3000
  // upload became 480x1440, taller than the viewport.
  test("a tall image is fitted on its long edge, not just its width", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 1000, 3000);
    const img = await imageBox(page);
    expect(Math.round(img.h)).toBe(DEFAULT_NODE_MAX_EDGE);
    expect(Math.round(img.w)).toBe(Math.round((DEFAULT_NODE_MAX_EDGE * 1000) / 3000));
  });

  // The leading 1 in Math.min: scaling a small image up would only blur it.
  test("an image smaller than the box keeps its natural size", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 200, 140);
    const img = await imageBox(page);
    expect(Math.round(img.w)).toBe(200);
    expect(Math.round(img.h)).toBe(140);
  });
});
