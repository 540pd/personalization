import { test, expect, type Page } from "@playwright/test";
import { openBoard, setZoom, reloadBoard } from "./helpers";

// #232: dragging a corner of a Frame with auto layout rearranges its items
// live to the shape being dragged -- a row, a column or a compact rectangle
// -- and on release the Frame snaps to fit them.

/* eslint-disable @typescript-eslint/no-explicit-any */

type Box = { x: number; y: number; w: number; h: number };

const frameBtn = (page: Page) => page.locator(".floating-dock button[aria-pressed]").nth(3);
const shapesBtn = (page: Page) => page.locator(".floating-dock button[aria-pressed]").nth(4);
const menuItem = (page: Page, label: string) =>
  page.locator(".floating-dock-submenu button").filter({
    has: page.locator("span", { hasText: new RegExp(`^${label}$`) }),
  });
const layoutOn = (page: Page) => page.getByRole("button", { name: "Auto layout", exact: true });

async function drag(page: Page, x1: number, y1: number, x2: number, y2: number, during?: () => Promise<void>) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
  await page.mouse.move(x2, y2, { steps: 4 });
  await during?.();
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function drawRect(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await shapesBtn(page).click();
  await menuItem(page, "Rectangle").click();
  await drag(page, x1, y1, x2, y2);
}

const frameBox = (page: Page): Promise<Box> =>
  page.evaluate(() => {
    const stages = (window as any).Konva.stages as any[];
    const fs = stages.find((st) => st.find(".frame").length);
    const r = fs.find(".frame")[0].getClientRect({ skipStroke: true });
    const c = fs.container().getBoundingClientRect();
    return { x: c.left + r.x, y: c.top + r.y, w: r.width, h: r.height };
  });

const shapeBoxes = (page: Page): Promise<Record<string, Box>> =>
  page.evaluate(() => {
    const stage = (window as any).Konva.stages[0];
    const c = stage.container().getBoundingClientRect();
    return Object.fromEntries(stage.find(".selectable").map((n: any) => {
      const r = n.getClientRect({ skipStroke: true });
      return [n.id(), { x: c.left + r.x, y: c.top + r.y, w: r.width, h: r.height }];
    }));
  });

/** The boxes grouped into columns by left edge, left to right, each top to bottom. */
function columnsOf(boxes: Record<string, Box>): string[][] {
  const cols = new Map<number, [string, Box][]>();
  for (const [id, b] of Object.entries(boxes)) {
    const key = [...cols.keys()].find((k) => Math.abs(k - b.x) < 2) ?? b.x;
    cols.set(key, [...(cols.get(key) ?? []), [id, b]]);
  }
  return [...cols.entries()].sort((a, b) => a[0] - b[0])
    .map(([, col]) => col.sort((a, b) => a[1].y - b[1].y).map(([id]) => id));
}

/** Reading order now: top to bottom, then left to right. */
const reading = (boxes: Record<string, Box>) =>
  Object.entries(boxes).sort((a, b) => (Math.abs(a[1].y - b[1].y) < 1 ? a[1].x - b[1].x : a[1].y - b[1].y)).map(([id]) => id);

async function selectFrame(page: Page) {
  const f = await frameBox(page);
  await page.mouse.click(f.x + 6, f.y + f.h - 6);
  await page.waitForTimeout(150);
}

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1.5);

/** `n` 80×60 rectangles in a Frame with auto layout, laid out as a row, the Frame selected. */
async function setUp(page: Page, n = 6) {
  await openBoard(page);
  await frameBtn(page).click();
  await drag(page, 240, 100, 1060, 620);
  for (let i = 0; i < n; i++) {
    const x = 270 + (i % 4) * 190;
    const y = 140 + Math.floor(i / 4) * 200;
    await drawRect(page, x, y, x + 80, y + 60);
  }
  await selectFrame(page);
  await layoutOn(page).click();
  await page.waitForTimeout(300);
  return reading(await shapeBoxes(page));
}

/** Drag the bottom-right corner so the Frame's box is `w` × `h` on screen. */
async function resizeTo(page: Page, w: number, h: number, during?: () => Promise<void>) {
  const f = await frameBox(page);
  await drag(page, f.x + f.w, f.y + f.h, f.x + w, f.y + h, during);
}

/** The Frame hugs its items, 16 in. */
async function expectSnapped(page: Page) {
  const f = await frameBox(page);
  const boxes = Object.values(await shapeBoxes(page));
  near(f.x + f.w, Math.max(...boxes.map((b) => b.x + b.w)) + 16);
  near(f.y + f.h, Math.max(...boxes.map((b) => b.y + b.h)) + 16);
}

test.describe("auto layout: resize to rearrange (#232)", () => {
  test("corners shown; dragged tall and narrow, a column, live; let go, it fits", async ({ page }) => {
    const order = await setUp(page);
    await expect(page.getByRole("button", { name: "Arrange" })).toHaveCount(0);
    const corners = await page.evaluate(() => {
      const stages = (window as any).Konva.stages as any[];
      return stages.find((st) => st.find(".frame").length).find("Transformer")[0].enabledAnchors().length;
    });
    expect(corners).toBe(4);

    await resizeTo(page, 130, 560, async () => {
      // Before letting go: already one column.
      expect(columnsOf(await shapeBoxes(page))).toEqual([order]);
    });
    expect(columnsOf(await shapeBoxes(page))).toEqual([order]);
    await expectSnapped(page);
  });

  test("dragged squarer: a compact rectangle in reading order; wide again: a row", async ({ page }) => {
    const order = await setUp(page);
    // Three columns of 80 and two rows of 60 are 304 × 168.
    await resizeTo(page, 300, 170);
    expect(columnsOf(await shapeBoxes(page))).toEqual([
      [order[0], order[3]], [order[1], order[4]], [order[2], order[5]],
    ]);
    await expectSnapped(page);

    await resizeTo(page, 900, 90);
    expect(columnsOf(await shapeBoxes(page))).toEqual(order.map((id) => [id]));
  });

  test("one undo step puts the old arrangement and size back", async ({ page }) => {
    const order = await setUp(page);
    const before = await frameBox(page);
    await resizeTo(page, 130, 560);
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(300);
    expect(columnsOf(await shapeBoxes(page))).toEqual(order.map((id) => [id]));
    near((await frameBox(page)).w, before.w);
  });

  test("from the top-left corner, the items are packed from the new corner", async ({ page }) => {
    const order = await setUp(page);
    const f = await frameBox(page);
    // Pull the top-left corner up and left, keeping the box wide: still a row.
    await drag(page, f.x, f.y, f.x - 40, f.y - 30);
    const g = await frameBox(page);
    near(g.x, f.x - 40);
    const boxes = await shapeBoxes(page);
    near(boxes[order[0]].x, g.x + 16);
    near(boxes[order[0]].y, g.y + 16);
  });

  test("one item: it snaps back to fit", async ({ page }) => {
    await setUp(page, 1);
    const before = await frameBox(page);
    await resizeTo(page, 400, 300);
    const after = await frameBox(page);
    near(after.w, before.w);
    near(after.h, before.h);
  });

  test("after a resize, a drop still works; the next resize repacks", async ({ page }) => {
    const order = await setUp(page, 3);
    let boxes = await shapeBoxes(page);
    // order[2] onto the bottom of order[0]: a stack.
    const from = boxes[order[2]];
    const to = boxes[order[0]];
    await drag(page, from.x + from.w / 2, from.y + from.h / 2, to.x + to.w / 2, to.y + to.h - 4);
    boxes = await shapeBoxes(page);
    expect(columnsOf(boxes)).toEqual([[order[0], order[2]], [order[1]]]);

    await selectFrame(page);
    await resizeTo(page, 900, 90);
    expect(columnsOf(await shapeBoxes(page))).toHaveLength(3);
  });

  test("survives a reload", async ({ page }) => {
    const order = await setUp(page);
    await resizeTo(page, 300, 170);
    await page.waitForTimeout(1200); // past the save delay
    await reloadBoard(page, { shapes: order.length });
    expect(columnsOf(await shapeBoxes(page))).toEqual([
      [order[0], order[3]], [order[1], order[4]], [order[2], order[5]],
    ]);
  });

  test("at 50% zoom it packs the same, with the gaps scaled", async ({ page }) => {
    const order = await setUp(page, 4);
    await setZoom(page, 0.5);
    await selectFrame(page);
    const scale = await page.evaluate(() => (window as any).Konva.stages[0].scaleX());
    await resizeTo(page, 80 * scale, 600 * scale);
    const boxes = await shapeBoxes(page);
    expect(columnsOf(boxes)).toEqual([order]);
    near(boxes[order[1]].y, boxes[order[0]].y + boxes[order[0]].h + 16 * scale);
  });
});
