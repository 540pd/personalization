import { test, expect } from "@playwright/test";
import { openBoard, addPanel, collapsePanels, panelBoxes, dragFrom } from "./helpers";

// The Create Image form is docked on the right of the board (#557): one fixed
// place for every node. It used to sit beside its node, flipping to the left
// near the window's edge; a node at the far right once pushed it 272px off
// screen, with the Create button unreachable.

const MARGIN = 16;

async function panelRect(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const p = document.querySelector(".node-panel-create");
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, vw: window.innerWidth, vh: window.innerHeight };
  });
}

test.describe("Create Image panel placement", () => {
  test("is docked at the right of the window, inside its margins", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);

    const [node] = await panelBoxes(page);
    const panel = await panelRect(page);
    expect(panel).not.toBeNull();
    expect(panel!.width).toBe(320);
    expect(panel!.right).toBe(panel!.vw - MARGIN);
    expect(panel!.y).toBe(MARGIN);
    expect(panel!.bottom).toBeLessThanOrEqual(panel!.vh - MARGIN);
    // A new node, centred on the canvas, is clear of it.
    expect(node.x + node.w).toBeLessThan(panel!.x);
  });

  test("stays in the same place wherever its node is", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    const docked = await panelRect(page);
    await collapsePanels(page);

    // Far left, then far right: the old placement flipped sides for these.
    for (const targetX of [400, 1340]) {
      const [node] = await panelBoxes(page);
      await dragFrom(page, node.x + node.w / 2, node.y + node.h / 2, targetX - (node.x + node.w / 2));
      // The drag left it active, so one click opens the panel.
      const [moved] = await panelBoxes(page);
      await page.mouse.click(moved.x + 10, moved.y + 10);
      await page.waitForTimeout(700);
      expect(await panelRect(page)).toEqual(docked);
      await collapsePanels(page);
    }
  });

  test("does not move or scale when the board is panned or zoomed", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    const docked = await panelRect(page);

    // Zoom out over the empty board, well clear of the node and the form.
    await page.mouse.move(420, 200);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, 300);
    await page.keyboard.up("Control");
    await page.waitForTimeout(300);
    expect(await panelRect(page)).toEqual(docked);

    // Pan with the wheel.
    await page.mouse.wheel(120, 90);
    await page.waitForTimeout(300);
    expect(await panelRect(page)).toEqual(docked);
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
