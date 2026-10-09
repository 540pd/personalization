import { test, expect } from "@playwright/test";
import { openBoard, addPanel, collapsePanels, panelBoxes, dragFrom } from "./helpers";

// The Create Image panel is pinned to the node's right edge. A node near the
// right of the viewport used to push it off screen entirely -- measured at
// 272px out, with the Create button unreachable. It now prefers the right,
// falls back to the left, and clamps only if neither side fits.

async function panelRect(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const p = document.querySelector(".node-panel-create");
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return { x: r.x, right: r.right, vw: window.innerWidth };
  });
}

test.describe("Create Image panel placement", () => {
  test("stays on screen when its node is at the right edge", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);

    const [node] = await panelBoxes(page);
    await dragFrom(page, node.x + node.w / 2, node.y + node.h / 2, 1340 - (node.x + node.w / 2));

    // The drag left it active, so one click opens the panel.
    const [moved] = await panelBoxes(page);
    await page.mouse.click(moved.x + 10, moved.y + 10);
    await page.waitForTimeout(700);

    const panel = await panelRect(page);
    expect(panel).not.toBeNull();
    expect(panel!.x).toBeGreaterThanOrEqual(0);
    expect(panel!.right).toBeLessThanOrEqual(panel!.vw);
  });

  test("opens on the node's right at the default position", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);

    const [node] = await panelBoxes(page);
    const panel = await panelRect(page);
    expect(panel).not.toBeNull();
    // Preferred side, and fully visible.
    expect(panel!.x).toBeGreaterThan(node.x);
    expect(panel!.right).toBeLessThanOrEqual(panel!.vw);
  });

  // canvasX is a left edge while canvasY is a centre; the creation code once
  // treated both as centres, which pushed a wide node off to the right.
  test("a new node is horizontally centred in the viewport", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);

    const [node] = await panelBoxes(page);
    // The CANVAS's centre, not the window's: the sidebar covers the left
    // edge, and centring on the window would put a new node partly behind
    // it. This spec asserted the window until the rail existed.
    const centre = await page.evaluate(() => {
      const rail = document.querySelector(".sidebar")?.getBoundingClientRect().width ?? 0;
      return rail + (window.innerWidth - rail) / 2;
    });
    expect(Math.abs(node.x + node.w / 2 - centre)).toBeLessThan(40);
  });
});
