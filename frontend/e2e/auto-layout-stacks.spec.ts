import { test, expect, type Page } from "@playwright/test";
import { openBoard, setZoom, reloadBoard } from "./helpers";

// #230: in a Frame with auto layout, dropping an item on another's top or
// bottom stacks it in that item's column; on its left or right puts it
// beside, in a column of its own. The last item leaving turns auto layout off.

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
const line = (page: Page) => page.getByTestId("auto-layout-drop-line");

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

const leftToRight = (boxes: Record<string, Box>) =>
  Object.entries(boxes).sort((a, b) => a[1].x - b[1].x).map(([id]) => id);

async function selectFrame(page: Page) {
  const f = await frameBox(page);
  await page.mouse.click(f.x + 6, f.y + f.h - 6);
  await page.waitForTimeout(150);
}

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1.5);

/** `lower` sits under `upper` in one column: same left, 16 below. */
function expectStacked(upper: Box, lower: Box, scale = 1) {
  near(lower.x, upper.x);
  near(lower.y, upper.y + upper.h + 16 * scale);
}

/** Three rectangles in a Frame with auto layout, one per column. */
async function setUp(page: Page) {
  await openBoard(page);
  await frameBtn(page).click();
  await drag(page, 300, 120, 900, 520);
  await drawRect(page, 650, 170, 750, 240); // 100×70
  await drawRect(page, 350, 320, 470, 420); // 120×100
  await drawRect(page, 500, 220, 560, 260); // 60×40
  await selectFrame(page);
  await layoutOn(page).click();
  await page.waitForTimeout(300);
  return leftToRight(await shapeBoxes(page));
}

const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
/** Just inside one side of `b`. */
const bottomOf = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h - 4 });
const topOf = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + 4 });
const rightOf = (b: Box) => ({ x: b.x + b.w - 4, y: b.y + b.h / 2 });

test.describe("auto layout stacks (#230)", () => {
  test("dropped on an item's bottom, it stacks under it; the Frame grows to hug", async ({ page }) => {
    const [a, b, c] = await setUp(page);
    await expect(page.getByRole("button", { name: /^Direction/ })).toHaveCount(0);
    const before = await frameBox(page);
    let boxes = await shapeBoxes(page);
    const from = centre(boxes[c]);
    const to = bottomOf(boxes[a]);

    await drag(page, from.x, from.y, to.x, to.y, async () => {
      await expect(line(page)).toBeVisible();
      const l = (await line(page).boundingBox())!;
      expect(l.height).toBe(2);
      // As wide as a's column.
      near(l.width, boxes[a].w);
    });
    boxes = await shapeBoxes(page);
    expectStacked(boxes[a], boxes[c]);
    const frame = await frameBox(page);
    // b is now the second column, beside a's.
    near(boxes[b].x, boxes[a].x + boxes[a].w + 16);
    expect(frame.h).toBeGreaterThan(before.h);
    near(frame.y + frame.h, boxes[c].y + boxes[c].h + 16);

    // One undo step: back to a row.
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(300);
    expect(leftToRight(await shapeBoxes(page))).toEqual([a, b, c]);
  });

  test("dropped on the top of an item in a stack, it goes above it there", async ({ page }) => {
    const [a, b, c] = await setUp(page);
    let boxes = await shapeBoxes(page);
    let p = centre(boxes[c]);
    let q = bottomOf(boxes[a]);
    await drag(page, p.x, p.y, q.x, q.y); // a over c
    boxes = await shapeBoxes(page);
    p = centre(boxes[b]);
    q = topOf(boxes[c]);
    await drag(page, p.x, p.y, q.x, q.y); // a over b over c
    boxes = await shapeBoxes(page);
    expectStacked(boxes[a], boxes[b]);
    expectStacked(boxes[b], boxes[c]);
  });

  test("everything under one item: a single vertical stack", async ({ page }) => {
    const [a, b, c] = await setUp(page);
    let boxes = await shapeBoxes(page);
    let p = centre(boxes[b]);
    let q = bottomOf(boxes[a]);
    await drag(page, p.x, p.y, q.x, q.y);
    boxes = await shapeBoxes(page);
    p = centre(boxes[c]);
    q = bottomOf(boxes[b]);
    await drag(page, p.x, p.y, q.x, q.y);
    boxes = await shapeBoxes(page);
    expectStacked(boxes[a], boxes[b]);
    expectStacked(boxes[b], boxes[c]);
    const frame = await frameBox(page);
    near(frame.x + frame.w, frame.x + 16 + Math.max(boxes[a].w, boxes[b].w, boxes[c].w) + 16);
  });

  test("taken out of a stack and put beside another, the stack shrinks", async ({ page }) => {
    const [a, b, c] = await setUp(page);
    let boxes = await shapeBoxes(page);
    let p = centre(boxes[b]);
    let q = bottomOf(boxes[a]);
    await drag(page, p.x, p.y, q.x, q.y); // [a, b] [c]
    boxes = await shapeBoxes(page);
    p = centre(boxes[b]);
    q = rightOf(boxes[c]);
    await drag(page, p.x, p.y, q.x, q.y, async () => {
      const l = (await line(page).boundingBox())!;
      expect(l.width).toBe(2);
    }); // [a] [c] [b]
    boxes = await shapeBoxes(page);
    expect(leftToRight(boxes)).toEqual([a, c, b]);
    near(boxes[a].y, boxes[c].y);
    near(boxes[b].y, boxes[c].y);
  });

  test("every item dragged out: auto layout turns off and the Frame keeps its size", async ({ page }) => {
    const ids = await setUp(page);
    for (let i = 0; i < ids.length; i++) {
      const boxes = await shapeBoxes(page);
      const p = centre(boxes[ids[i]]);
      await drag(page, p.x, p.y, 1050 + i * 40, 560);
    }
    const frame = await frameBox(page);
    await selectFrame(page);
    await expect(layoutOn(page)).toBeVisible();
    await expect(layoutOff(page)).toHaveCount(0);
    const after = await frameBox(page);
    near(after.w, frame.w);
    near(after.h, frame.h);
  });

  test("delete an item in a stack, then undo: back in its place", async ({ page }) => {
    const [a, b, c] = await setUp(page);
    let boxes = await shapeBoxes(page);
    const p = centre(boxes[c]);
    const q = bottomOf(boxes[a]);
    await drag(page, p.x, p.y, q.x, q.y); // [a, c] [b]
    boxes = await shapeBoxes(page);
    const placed = boxes[c];

    await page.mouse.click(placed.x + placed.w / 2, placed.y + placed.h / 2);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(300);
    boxes = await shapeBoxes(page);
    expect(boxes[c]).toBeUndefined();
    near((await frameBox(page)).y + (await frameBox(page)).h, boxes[a].y + Math.max(boxes[a].h, boxes[b].h) + 16);

    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(300);
    boxes = await shapeBoxes(page);
    expectStacked(boxes[a], boxes[c]);
  });

  test("survives a reload", async ({ page }) => {
    const [a, , c] = await setUp(page);
    let boxes = await shapeBoxes(page);
    const p = centre(boxes[c]);
    const q = bottomOf(boxes[a]);
    await drag(page, p.x, p.y, q.x, q.y);
    await page.waitForTimeout(1200); // past the save delay
    await reloadBoard(page, { shapes: Object.keys(boxes).length });
    boxes = await shapeBoxes(page);
    expectStacked(boxes[a], boxes[c]);
    await selectFrame(page);
    await expect(layoutOff(page)).toBeVisible();
  });

  test("at 50% zoom a stack's gap scales with the board", async ({ page }) => {
    const [a, , c] = await setUp(page);
    await setZoom(page, 0.5);
    const scale = await page.evaluate(() => (window as any).Konva.stages[0].scaleX());
    let boxes = await shapeBoxes(page);
    const p = centre(boxes[c]);
    const q = bottomOf(boxes[a]);
    await drag(page, p.x, p.y, q.x, q.y);
    boxes = await shapeBoxes(page);
    expectStacked(boxes[a], boxes[c], scale);
  });
});
