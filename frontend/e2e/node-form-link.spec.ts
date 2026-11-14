import { test, expect, type Page } from "@playwright/test";
import { openBoard, addPanel, collapsePanels, panelBoxes, setZoom } from "./helpers";

// The form is docked away from its node (#557), so the node whose form is
// open is drawn in the accent (#559): outline, ports and name. A node that
// is only selected keeps the black outline.

const ACCENT = "rgb(161, 0, 255)";
const BLACK = "rgb(0, 0, 0)";

const chrome = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector("[data-panel-selection]") as HTMLElement | null;
    const dot = document.querySelector(".board-port .board-port-dot");
    const b = box && getComputedStyle(box);
    return {
      colour: b?.borderTopColor ?? null,
      line: b?.borderTopStyle ?? null,
      width: b?.borderTopWidth ?? null,
      linked: box?.hasAttribute("data-linked") ?? false,
      port: dot ? getComputedStyle(dot).borderTopColor : null,
    };
  });

test.describe("open node is linked to its form", () => {
  test("an empty node with its form open has a dashed accent outline and accent ports", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await expect(page.locator(".node-panel-create")).toHaveCount(1);
    expect(await chrome(page)).toMatchObject({ colour: ACCENT, line: "dashed", linked: true, port: ACCENT });
  });

  test("a node that is only selected keeps the black outline", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);
    const [node] = await panelBoxes(page);
    await page.mouse.click(node.x + 10, node.y + 10);
    await page.waitForTimeout(300);
    await expect(page.locator(".node-panel-create")).toHaveCount(0);
    const c = await chrome(page);
    expect(c).toMatchObject({ colour: BLACK, line: "solid", linked: false });
    expect(c.port).not.toBe(ACCENT);

    // A further click opens the form, and the outline turns to the accent.
    await page.mouse.click(node.x + 10, node.y + 10);
    await page.waitForTimeout(400);
    await expect(page.locator(".node-panel-create")).toHaveCount(1);
    expect(await chrome(page)).toMatchObject({ colour: ACCENT, linked: true });
  });

  for (const zoom of [0.5, 1.5]) {
    test(`the accent outline keeps its thickness at ${zoom * 100}% zoom`, async ({ page }) => {
      await openBoard(page);
      await addPanel(page);
      // Read back at 100% first: the browser snaps 1.5px to device pixels,
      // so the test compares zoom levels rather than naming a width.
      const { width } = await chrome(page);
      await collapsePanels(page);
      await setZoom(page, zoom);
      const [node] = await panelBoxes(page);
      await page.mouse.click(node.x + 5, node.y + 5);
      await page.waitForTimeout(300);
      await page.mouse.click(node.x + 5, node.y + 5);
      await page.waitForTimeout(400);
      expect(await chrome(page)).toMatchObject({ colour: ACCENT, width });
    });
  }
});
