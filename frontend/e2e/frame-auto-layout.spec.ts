import { test, expect, type Page } from "@playwright/test";
import { addPanel, collapsePanels, openBoard, panelBoxes, setZoom, reloadBoard } from "./helpers";

// #225: one click on a Frame's Auto layout lines its contents up in a row,
// 16 padding and 16 gap, top-aligned, the Frame hugging them; Remove auto
// layout leaves everything where it is.

/* eslint-disable @typescript-eslint/no-explicit-any */

type Box = { x: number; y: number; w: number; h: number };

const frameBtn = (page: Page) => page.locator(".floating-dock button[aria-pressed]").nth(3);
const shapesBtn = (page: Page) => page.locator(".floating-dock button[aria-pressed]").nth(4);
const menuItem = (page: Page, label: string) =>
  page.locator(".floating-dock-submenu button").filter({
    has: page.locator("span", { hasText: new RegExp(`^${label}$`) }),
  });
const layoutOn = (page: Page) => page.getByRole("button", { name: "Auto layout", exact: true });
const layoutOff = (page: Page) => page.getByRole("button", { name: "Remove auto layout" });

async function drag(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
  await page.mouse.move(x2, y2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function drawRect(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await shapesBtn(page).click();
  await menuItem(page, "Rectangle").click();
  await drag(page, x1, y1, x2, y2);
}

/** The Frame's box on screen. */
const frameBox = (page: Page): Promise<Box> =>
  page.evaluate(() => {
    const stages = (window as any).Konva.stages as any[];
    const fs = stages.find((st) => st.find(".frame").length);
    const r = fs.find(".frame")[0].getClientRect({ skipStroke: true });
    const c = fs.container().getBoundingClientRect();
    return { x: c.left + r.x, y: c.top + r.y, w: r.width, h: r.height };
  });

/** Every shape's box on screen, by id. */
const shapeBoxes = (page: Page): Promise<Record<string, Box>> =>
  page.evaluate(() => {
    const stage = (window as any).Konva.stages[0];
    const c = stage.container().getBoundingClientRect();
    return Object.fromEntries(stage.find(".selectable").map((n: any) => {
      const r = n.getClientRect({ skipStroke: true });
      return [n.id(), { x: c.left + r.x, y: c.top + r.y, w: r.width, h: r.height }];
    }));
  });

/** The Frame's corner handles: how many are on. */
const anchorCount = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const stages = (window as any).Konva.stages as any[];
    const fs = stages.find((st) => st.find(".frame").length);
    return fs.find("Transformer")[0].enabledAnchors().length;
  });

/** Select the Frame by a press inside it, clear of everything on it. */
async function selectFrame(page: Page) {
  const f = await frameBox(page);
  await page.mouse.click(f.x + 6, f.y + f.h - 6);
  await page.waitForTimeout(150);
}

/** Three rectangles of different sizes in a 600×400 Frame, out of order. */
async function setUp(page: Page) {
  await openBoard(page);
  await frameBtn(page).click();
  await drag(page, 300, 200, 900, 600);
  await drawRect(page, 650, 250, 750, 320); // right, 100×70
  await drawRect(page, 350, 400, 470, 500); // left, 120×100
  await drawRect(page, 500, 300, 560, 340); // middle, 60×40
  await selectFrame(page);
  await expect(layoutOn(page)).toBeVisible();
}

/** The shapes' ids, left to right on screen. */
const leftToRight = (boxes: Record<string, Box>) =>
  Object.entries(boxes).sort((a, b) => a[1].x - b[1].x).map(([id]) => id);

/** Asserts one row: tops at padding, gap between, Frame hugging. */
function expectRow(frame: Box, boxes: Box[], scale = 1) {
  const pad = 16 * scale;
  const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1.5);
  near(boxes[0].x, frame.x + pad);
  boxes.forEach((b, i) => {
    near(b.y, frame.y + pad);
    if (i) near(b.x, boxes[i - 1].x + boxes[i - 1].w + pad);
  });
  const last = boxes[boxes.length - 1];
  near(frame.x + frame.w, last.x + last.w + pad);
  near(frame.y + frame.h, frame.y + pad + Math.max(...boxes.map((b) => b.h)) + pad);
}

test.describe("Frame auto layout (#225)", () => {
  test("lines the contents up left to right and the Frame hugs them; undo puts it back", async ({ page }) => {
    await setUp(page);
    const frameBefore = await frameBox(page);
    const before = await shapeBoxes(page);
    const order = leftToRight(before);
    expect(await anchorCount(page)).toBe(4);

    await layoutOn(page).click();
    await expect(layoutOff(page)).toBeVisible();
    const frame = await frameBox(page);
    const after = await shapeBoxes(page);
    // Same order, now in one row; the Frame's top-left stays put.
    expect(leftToRight(after)).toEqual(order);
    expect(Math.abs(frame.x - frameBefore.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(frame.y - frameBefore.y)).toBeLessThanOrEqual(1);
    expectRow(frame, order.map((id) => after[id]));
    // Its corners stay: dragging one rearranges the items (#232).
    expect(await anchorCount(page)).toBe(4);

    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(300);
    const undone = await shapeBoxes(page);
    for (const id of order) expect(Math.abs(undone[id].x - before[id].x)).toBeLessThanOrEqual(1);
    expect(Math.round((await frameBox(page)).w)).toBe(Math.round(frameBefore.w));
  });

  test("Remove auto layout: nothing moves, the Frame keeps its size, handles come back", async ({ page }) => {
    await setUp(page);
    await layoutOn(page).click();
    const frame = await frameBox(page);
    const laid = await shapeBoxes(page);

    await layoutOff(page).click();
    await expect(layoutOn(page)).toBeVisible();
    await page.waitForTimeout(200);
    expect(await shapeBoxes(page)).toEqual(laid);
    expect(await frameBox(page)).toEqual(frame);
    expect(await anchorCount(page)).toBe(4);
  });

  test("a deleted child's gap closes; undo brings it back into its slot", async ({ page }) => {
    await setUp(page);
    await layoutOn(page).click();
    const order = leftToRight(await shapeBoxes(page));
    const mid = (await shapeBoxes(page))[order[1]];

    await page.mouse.click(mid.x + mid.w / 2, mid.y + mid.h / 2);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(300);
    const after = await shapeBoxes(page);
    expect(Object.keys(after)).toHaveLength(2);
    expectRow(await frameBox(page), [after[order[0]], after[order[2]]]);

    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(300);
    const back = await shapeBoxes(page);
    expect(leftToRight(back)).toEqual(order);
    expectRow(await frameBox(page), order.map((id) => back[id]));
  });

  test("dragged out, a child leaves; dropped inside, it goes back to its slot", async ({ page }) => {
    await setUp(page);
    await layoutOn(page).click();
    const order = leftToRight(await shapeBoxes(page));
    let boxes = await shapeBoxes(page);

    // A drag inside a selected Frame moves the Frame (#119), so a child is
    // clicked first, then dragged. Within the Frame: back to its slot.
    const first = boxes[order[0]];
    await page.mouse.click(first.x + 20, first.y + 20);
    await drag(page, first.x + 20, first.y + 20, first.x + 60, first.y + 40);
    await page.waitForTimeout(200);
    boxes = await shapeBoxes(page);
    expectRow(await frameBox(page), order.map((id) => boxes[id]));

    // Clear of the Frame: it leaves, and the row closes up.
    const last = boxes[order[2]];
    await page.mouse.click(last.x + 10, last.y + 10);
    await drag(page, last.x + 10, last.y + 10, 1150, 600);
    await page.waitForTimeout(200);
    boxes = await shapeBoxes(page);

    expect(boxes[order[2]].x).toBeGreaterThan(1000);
    expectRow(await frameBox(page), [boxes[order[0]], boxes[order[1]]]);
  });

  test("a Create panel is laid out with the shapes", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);
    const panel = (await panelBoxes(page))[0];
    await frameBtn(page).click();
    await drag(page, panel.x - 200, panel.y - 60, panel.x + panel.w + 40, panel.y + panel.h + 60);
    await drawRect(page, panel.x - 160, panel.y + 20, panel.x - 60, panel.y + 80);
    await selectFrame(page);
    await layoutOn(page).click();
    await page.waitForTimeout(300);

    const rect = Object.values(await shapeBoxes(page))[0];
    const p = (await panelBoxes(page))[0];
    expectRow(await frameBox(page), [rect, { x: p.x, y: p.y, w: p.w, h: p.h }]);
  });

  test("an empty Frame's button is disabled; a Frame with a shape selected has none", async ({ page }) => {
    await openBoard(page);
    await frameBtn(page).click();
    await drag(page, 300, 200, 700, 500);
    await expect(layoutOn(page)).toBeDisabled();
    await layoutOn(page).hover();
    await expect(page.locator(".shape-style-tooltip", { hasText: "Add something to the frame first" })).toBeVisible();

    await drawRect(page, 800, 250, 900, 320);
    await page.keyboard.press("ControlOrMeta+a");
    await expect(page.getByRole("button", { name: "Shape color" })).toBeVisible();
    await expect(layoutOn(page)).toHaveCount(0);
  });

  test("survives a reload", async ({ page }) => {
    await setUp(page);
    await layoutOn(page).click();
    const laid = await shapeBoxes(page);
    await page.waitForTimeout(1200); // past the save delay
    await reloadBoard(page, { shapes: Object.keys(laid).length });
    await selectFrame(page);
    await expect(layoutOff(page)).toBeVisible();
    const back = await shapeBoxes(page);
    for (const id of Object.keys(laid)) expect(Math.abs(back[id].x - laid[id].x)).toBeLessThanOrEqual(1);
  });

  test("at 50% zoom the spacing scales with the board", async ({ page }) => {
    await setUp(page);
    await setZoom(page, 0.5);
    await selectFrame(page);
    await layoutOn(page).click();
    const boxes = await shapeBoxes(page);
    const scale = await page.evaluate(() => (window as any).Konva.stages[0].scaleX());
    expectRow(await frameBox(page), leftToRight(boxes).map((id) => boxes[id]), scale);
  });

  test("the icon and name flip; Tab and Enter work it", async ({ page }) => {
    await setUp(page);
    const icon = async () => page.locator(".shape-style-bar button svg rect").count();
    await layoutOn(page).focus();
    await page.keyboard.press("Enter");
    await expect(layoutOff(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(layoutOn(page)).toBeFocused();
    expect(await icon()).toBeGreaterThan(0);
  });
});
