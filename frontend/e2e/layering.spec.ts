import { test, expect, type Page } from "@playwright/test";
import { openBoard, uploadImage, imageBox, addPanel, collapsePanels, panelBoxes } from "./helpers";

// Konva shapes all share ONE <canvas> and the node placeholders are DOM
// siblings of it, so a DOM element cannot interleave with canvas pixels: the
// whole canvas is in front of the placeholders or behind them.
//
// Before this, the canvas had no z-index at all, so every Create Image node
// sat permanently above every uploaded image and dragging an image onto one
// made it disappear entirely. Whichever kind you last picked up now wins.

/**
 * Which layer paints in front.
 *
 * Compared by z-index rather than elementFromPoint: while the canvas is in
 * front it carries pointer-events: none everywhere a shape is not, so hit
 * order and paint order are deliberately different. elementFromPoint would
 * report the hit target and say nothing about what you can see.
 */
async function frontLayer(page: Page): Promise<"canvas" | "dom"> {
  return page.evaluate(() => {
    let host = document.querySelector("canvas")?.parentElement as HTMLElement | null;
    while (host && getComputedStyle(host).zIndex === "auto") host = host.parentElement;
    const panel = document.querySelector("button.node-panel-placeholder") as HTMLElement | null;
    const cz = Number(getComputedStyle(host!).zIndex);
    // With no panel on the board there is nothing to be in front of; report
    // the canvas rather than throwing on a null element.
    if (!panel) return "canvas";
    return cz > Number(getComputedStyle(panel).zIndex) ? "canvas" : "dom";
  });
}

async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 18 });
  await page.mouse.up();
  await page.waitForTimeout(450);
}

test.describe("layering between uploaded images and node panels", () => {
  test("the one you last dragged is the one in front", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);
    const [panel] = await panelBoxes(page);
    const centre = { x: panel.x + panel.w / 2, y: panel.y + panel.h / 2 };

    await uploadImage(page, 1600, 900);
    const img = await imageBox(page);

    // Drag the image squarely onto the panel.
    await dragTo(page, { x: img.x + img.w / 2, y: img.y + img.h / 2 }, centre);
    expect(await frontLayer(page)).toBe("canvas");

    // Now drag the panel; it should come back to the front.
    // Drag the panel from a corner the image does not cover, so the gesture
    // lands on the placeholder rather than the canvas in front of it.
    const [p2] = await panelBoxes(page);
    await dragTo(page, { x: p2.x + 6, y: p2.y + 6 }, { x: p2.x + 6, y: p2.y + 16 });
    expect(await frontLayer(page)).toBe("dom");

    // And back again. Move the panel clear first: it is in front now, so a
    // press on the overlap would grab the panel, not the image -- which is
    // itself correct behaviour.
    const [p3] = await panelBoxes(page);
    await dragTo(page, { x: p3.x + 6, y: p3.y + 6 }, { x: p3.x + 6, y: p3.y + 300 });
    const img2 = await imageBox(page);
    await dragTo(page, { x: img2.x + img2.w / 2, y: img2.y + img2.h / 2 },
                       { x: img2.x + img2.w / 2 + 20, y: img2.y + img2.h / 2 });
    expect(await frontLayer(page)).toBe("canvas");
  });

  test("a newly created node is not hidden behind an image", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 1600, 900);
    const img = await imageBox(page);
    // Last action was an upload, so the canvas is in front.
    expect(await frontLayer(page)).toBe("canvas");

    await addPanel(page);
    await collapsePanels(page);
    const [panel] = await panelBoxes(page);
    expect(await frontLayer(page)).toBe("dom");
  });

  test("a newly uploaded image is not hidden behind a node", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);
    await uploadImage(page, 1600, 900);
    const img = await imageBox(page);
    expect(await frontLayer(page)).toBe("canvas");
  });

  // Chrome must stay reachable whichever layer is in front, or you could not
  // start a connection from a node the canvas is covering.
  test("ports stay above the canvas even when the canvas is in front", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);
    await uploadImage(page, 1600, 900);   // raises the canvas

    const ports = await page.locator('div[title="Input"], div[title="Output"]').count();
    expect(ports).toBeGreaterThan(0);
    const z = await page.evaluate(() => {
      const port = document.querySelector('div[title="Output"]') as HTMLElement | null;
      // Konva nests its own div inside our container, so walk up until a
      // z-index is actually set.
      let host = document.querySelector("canvas")?.parentElement as HTMLElement | null;
      while (host && getComputedStyle(host).zIndex === "auto") host = host.parentElement;
      return {
        port: Number(getComputedStyle(port!).zIndex),
        canvas: Number(getComputedStyle(host!).zIndex),
      };
    });
    expect(z.port).toBeGreaterThan(z.canvas);
  });
});
