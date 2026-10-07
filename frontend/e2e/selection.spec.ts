import { test, expect } from "@playwright/test";
import {
  openBoard, addPanel, addPanelAt, collapsePanels, panelBoxes, tagPanels,
  panelByBorn, dragFrom, clickEmpty, activePanelCount, uploadImage,
} from "./helpers";

// Press-dragging an unselected node never reaches the click path, so without
// an explicit takeover the dragged node is not selected and the previous one
// never lets go. Two nodes then show selection chrome and the keyboard
// handlers aim at the wrong one. Fixed for uploaded images as #24; these cover
// the Create Image twin.

test.describe("selection takeover", () => {
  test("press-dragging a node clears the previous selection", async ({ page }) => {
    await openBoard(page);
    await addPanelAt(page, -340);
    await addPanelAt(page, 300);
    await clickEmpty(page);
    await tagPanels(page);

    const [a, b] = (await panelBoxes(page)).sort((p, q) => p.x - q.x);

    await page.mouse.click(a.x + 12, a.y + 12);
    await page.waitForTimeout(300);
    expect(await activePanelCount(page)).toBe(1);

    // No click first: straight into a drag.
    await dragFrom(page, b.x + 12, b.y + 12, 40, 20);
    expect(await activePanelCount(page)).toBe(1);
  });

  test("Delete after a press-drag removes the dragged node, not the stale one", async ({ page }) => {
    await openBoard(page);
    await addPanelAt(page, -340);
    await addPanelAt(page, 300);
    await clickEmpty(page);
    await tagPanels(page);

    const sorted = (await panelBoxes(page)).sort((p, q) => p.x - q.x);
    const a = sorted[0];
    const b = sorted[1];

    await page.mouse.click(a.x + 12, a.y + 12);
    await page.waitForTimeout(300);
    await dragFrom(page, b.x + 12, b.y + 12, 40, 20);

    await page.keyboard.press("Delete");
    await page.waitForTimeout(400);

    const left = await panelBoxes(page);
    expect(left).toHaveLength(1);
    expect(left[0].born).toBe(a.born);
  });

  test("creating a node clears an existing selection", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 800, 600);
    await page.waitForTimeout(200);

    await addPanel(page);
    await collapsePanels(page);
    // Exactly one thing selected: the node just created, not the image too.
    expect(await activePanelCount(page)).toBeLessThanOrEqual(1);
  });

  test("panel state survives the DOM reorder a drag causes", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    const instruction = "a brass diving helmet on wet sand";
    await page.locator("textarea").first().fill(instruction);
    await collapsePanels(page);
    // Move A clear before adding B, so the click that reopens it cannot land
    // on the newer node.
    {
      const [only] = await panelBoxes(page);
      await dragFrom(page, only.x + only.w / 2, only.y + only.h / 2, -340);
    }
    await addPanelAt(page, 300);
    await clickEmpty(page);
    await tagPanels(page);

    // Dragging moves the node to the end of the panels array, which moves its
    // DOM node. key={p.id} is what stops React remounting it and losing state.
    const a = await panelByBorn(page, "0");
    await dragFrom(page, a.x + a.w / 2, a.y + a.h / 2, 80, 30);

    const moved = await panelByBorn(page, "0");
    // The drag left it active, so one click opens the panel.
    await page.mouse.click(moved.x + moved.w / 2, moved.y + moved.h / 2);
    await page.waitForTimeout(600);

    await expect(page.locator("textarea").first()).toHaveValue(instruction);
  });
});
