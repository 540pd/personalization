import { test, expect, type Page } from "@playwright/test";
import {
  openBoard, uploadImage, imageBox, addPanel, collapsePanels,
  panelBoxes, dragFrom, clickEmpty, tagPanels, reloadBoard,
} from "./helpers";

// One undo timeline. Before this there were two bound to the same keystroke,
// with precedence decided by an event-phase race, so Ctrl+Z was not
// chronological and Create Image nodes could not undo a delete or a create.

const undo = async (page: Page) => {
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(450);
};
const redo = async (page: Page) => {
  await page.keyboard.press("ControlOrMeta+y");
  await page.waitForTimeout(450);
};

/** Place a node clear of the others so later clicks are unambiguous. */
async function addPanelAt(page: Page, dx: number) {
  await addPanel(page);
  await collapsePanels(page);
  const boxes = await panelBoxes(page);
  const last = boxes[boxes.length - 1];
  await dragFrom(page, last.x + last.w / 2, last.y + last.h / 2, dx);
}

/**
 * Holds back the Create nodes' and the wires' code on the next load, so they
 * register with the undo timeline after Board has taken its baseline: the
 * order a real browser often loads them in (#469). Left alone, the dev
 * server's timing decides, and the bug hides.
 */
async function loadNodesAfterBoard(page: Page) {
  await page.route(/components_(NodePanel_NodePanel|Connections_ConnectionOverlay)_tsx\.js/, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.fallback();
  });
}

test.describe("undo", () => {
  // The headline fix: with two stacks, both panel entries were consumed
  // before the image move was reached, whatever order the edits happened in.
  test("is chronological across node kinds", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 800, 600);
    const img0 = await imageBox(page);
    await addPanelAt(page, 360);
    await clickEmpty(page);

    const panel0 = (await panelBoxes(page))[0];

    // Edit 1: move the image.
    await dragFrom(page, img0.x + img0.w / 2, img0.y + img0.h / 2, -180);
    const imgMoved = await imageBox(page);
    expect(Math.round(imgMoved.x)).not.toBe(Math.round(img0.x));

    // Edit 2: move the panel.
    await dragFrom(page, panel0.x + panel0.w / 2, panel0.y + panel0.h / 2, 0, 150);
    const panelMoved = (await panelBoxes(page))[0];
    expect(Math.round(panelMoved.y)).not.toBe(Math.round(panel0.y));

    // First undo reverts the most recent edit — the panel — and leaves the
    // image where edit 1 put it.
    await undo(page);
    expect(Math.round((await panelBoxes(page))[0].y)).toBe(Math.round(panel0.y));
    expect(Math.round((await imageBox(page)).x)).toBe(Math.round(imgMoved.x));

    // Second undo reverts the image.
    await undo(page);
    expect(Math.round((await imageBox(page)).x)).toBe(Math.round(img0.x));
  });

  test("redo replays in the same order", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 800, 600);
    const img0 = await imageBox(page);
    await addPanelAt(page, 360);
    await clickEmpty(page);
    const panel0 = (await panelBoxes(page))[0];

    await dragFrom(page, img0.x + img0.w / 2, img0.y + img0.h / 2, -180);
    const imgMoved = await imageBox(page);
    await dragFrom(page, panel0.x + panel0.w / 2, panel0.y + panel0.h / 2, 0, 150);
    const panelMoved = (await panelBoxes(page))[0];

    await undo(page);
    await undo(page);
    await redo(page);
    expect(Math.round((await imageBox(page)).x)).toBe(Math.round(imgMoved.x));
    await redo(page);
    expect(Math.round((await panelBoxes(page))[0].y)).toBe(Math.round(panelMoved.y));
  });

  // Create Image nodes could not undo any of these before: undoPos restored
  // positions by id and only touched panels that still existed.
  test("undoes deleting a Create Image node", async ({ page }) => {
    await openBoard(page);
    await addPanelAt(page, -300);
    await addPanelAt(page, 300);
    await clickEmpty(page);
    await tagPanels(page);
    expect(await panelBoxes(page)).toHaveLength(2);

    const [first] = (await panelBoxes(page)).sort((a, b) => a.x - b.x);
    await page.mouse.click(first.x + 12, first.y + 12);
    await page.waitForTimeout(300);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(400);
    expect(await panelBoxes(page)).toHaveLength(1);

    await undo(page);
    expect(await panelBoxes(page)).toHaveLength(2);
  });

  // #469: the baseline was taken before the panels and wires registered, so
  // the first delete after a reload could not be undone.
  test("undoes deleting a Create Image node as the first change after a reload", async ({ page }) => {
    await openBoard(page);
    await addPanelAt(page, -300);
    await addPanelAt(page, 300);
    await loadNodesAfterBoard(page);
    await reloadBoard(page, { panels: 2 });

    const [first] = (await panelBoxes(page)).sort((a, b) => a.x - b.x);
    await page.mouse.click(first.x + 12, first.y + 12);
    await page.waitForTimeout(300);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(400);
    expect(await panelBoxes(page)).toHaveLength(1);

    await undo(page);
    expect(await panelBoxes(page)).toHaveLength(2);
    await redo(page);
    expect(await panelBoxes(page)).toHaveLength(1);
  });

  test("undoes deleting a wire as the first change after a reload", async ({ page }) => {
    await openBoard(page);
    await addPanelAt(page, -300);
    await addPanelAt(page, 300);
    const [a, b] = (await panelBoxes(page)).sort((p, q) => p.x - q.x);
    await page.mouse.move(a.x + a.w, a.y + a.h * 0.3);
    await page.mouse.down();
    await page.mouse.move(b.x + b.w / 2, b.y + b.h * 0.7, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const wires = page.locator('svg g > path[stroke-width="12"]');
    await expect(wires).toHaveCount(1);

    await loadNodesAfterBoard(page);
    await reloadBoard(page, { panels: 2 });
    await expect(wires).toHaveCount(1);
    const mid = await wires.first().evaluate((p: SVGPathElement) => {
      const pt = p.getPointAtLength(p.getTotalLength() / 2);
      return { x: pt.x, y: pt.y };
    });
    await page.mouse.click(mid.x, mid.y);
    await page.waitForTimeout(200);
    await page.keyboard.press("Delete");
    await expect(wires).toHaveCount(0);

    await undo(page);
    await expect(wires).toHaveCount(1);
  });

  test("undoes creating a Create Image node", async ({ page }) => {
    await openBoard(page);
    await addPanelAt(page, -300);
    await clickEmpty(page);
    expect(await panelBoxes(page)).toHaveLength(1);

    await addPanel(page);
    await collapsePanels(page);
    await clickEmpty(page);
    expect(await panelBoxes(page)).toHaveLength(2);

    await undo(page);
    expect(await panelBoxes(page)).toHaveLength(1);
  });

  test("undoing a delete keeps the image's bitmap, it is not re-fetched", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 800, 600);
    const box = await imageBox(page);

    await page.mouse.click(box.x + 40, box.y + 40);
    await page.waitForTimeout(300);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => (window as unknown as { Konva: { stages: { find(sel: string): unknown[] }[] } }).Konva.stages[0].find("Image").length)).toBe(0);

    await undo(page);
    // Snapshots hold live node references precisely so this does not reload.
    const restored = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const n = (window as any).Konva.stages[0].find("Image")[0];
      return n ? { w: n.width() * n.scaleX(), complete: !!n.image() } : null;
    });
    expect(restored).not.toBeNull();
    expect(restored!.complete).toBe(true);
    expect(Math.round(restored!.w)).toBe(Math.round(box.w));
  });

  test("is inert past both ends, and while typing", async ({ page }) => {
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    await openBoard(page);
    await addPanel(page);

    // Typing in the instruction box must not trigger a canvas undo.
    await page.locator("textarea").first().fill("abc");
    await page.locator("textarea").first().press("ControlOrMeta+z");
    await page.waitForTimeout(300);
    expect(await panelBoxes(page)).toHaveLength(1);

    await collapsePanels(page);
    await clickEmpty(page);
    for (let i = 0; i < 6; i++) await undo(page);
    for (let i = 0; i < 8; i++) await redo(page);
    expect(errs).toHaveLength(0);
  });
});
