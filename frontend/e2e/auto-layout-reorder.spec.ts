import { test, expect, type Page } from "@playwright/test";
import { addPanel, collapsePanels, makePng, openBoard, panelBoxes } from "./helpers";

// #228: in a Frame with auto layout, a drag on a child reorders it (a line
// shows the slot), and things dragged, drawn or dropped in join the row.

/* eslint-disable @typescript-eslint/no-explicit-any */

type Box = { x: number; y: number; w: number; h: number };

const frameBtn = (page: Page) => page.locator(".floating-dock button[aria-pressed]").nth(3);
const shapesBtn = (page: Page) => page.locator(".floating-dock button[aria-pressed]").nth(4);
const textBtn = (page: Page) => page.locator(".floating-dock button[aria-pressed]").nth(5);
const menuItem = (page: Page, label: string) =>
  page.locator(".floating-dock-submenu button").filter({
    has: page.locator("span", { hasText: new RegExp(`^${label}$`) }),
  });
const layoutOn = (page: Page) => page.getByRole("button", { name: "Auto layout", exact: true });
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

const frameBoxes = (page: Page): Promise<Box[]> =>
  page.evaluate(() => {
    const stages = (window as any).Konva.stages as any[];
    const fs = stages.find((st) => st.find(".frame").length);
    const c = fs.container().getBoundingClientRect();
    return fs.find(".frame").map((f: any) => {
      const r = f.getClientRect({ skipStroke: true });
      return { x: c.left + r.x, y: c.top + r.y, w: r.width, h: r.height };
    }).sort((a: Box, b: Box) => a.x - b.x);
  });
const frameBox = async (page: Page) => (await frameBoxes(page))[0];

const shapeBoxes = (page: Page): Promise<Record<string, Box>> =>
  page.evaluate(() => {
    const stage = (window as any).Konva.stages[0];
    const c = stage.container().getBoundingClientRect();
    return Object.fromEntries(stage.find(".selectable").map((n: any) => {
      const r = n.getClientRect({ skipStroke: true });
      return [n.id(), { x: c.left + r.x, y: c.top + r.y, w: r.width, h: r.height }];
    }));
  });

const leftToRight = (boxes: Record<string, Box>, inside?: Box) =>
  Object.entries(boxes)
    .filter(([, b]) => !inside || (b.x >= inside.x - 1 && b.x + b.w <= inside.x + inside.w + 1 && b.y >= inside.y - 1 && b.y + b.h <= inside.y + inside.h + 1))
    .sort((a, b) => a[1].x - b[1].x).map(([id]) => id);

async function selectFrame(page: Page) {
  const f = await frameBox(page);
  await page.mouse.click(f.x + 6, f.y + f.h - 6);
  await page.waitForTimeout(150);
}

/** `top`: 16, or 8 + 24 when an item in the row has a name (#235). */
function expectRow(frame: Box, boxes: Box[], top = 16) {
  const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1.5);
  near(boxes[0].x, frame.x + 16);
  boxes.forEach((b, i) => {
    near(b.y, frame.y + top);
    if (i) near(b.x, boxes[i - 1].x + boxes[i - 1].w + 16);
  });
  const last = boxes[boxes.length - 1];
  near(frame.x + frame.w, last.x + last.w + 16);
}

/** A Frame with auto layout holding three rectangles, the Frame selected. */
async function setUp(page: Page) {
  await openBoard(page);
  await frameBtn(page).click();
  await drag(page, 300, 200, 900, 600);
  await drawRect(page, 650, 250, 750, 320);
  await drawRect(page, 350, 400, 470, 500);
  await drawRect(page, 500, 300, 560, 340);
  await selectFrame(page);
  await layoutOn(page).click();
  await page.waitForTimeout(300);
  return leftToRight(await shapeBoxes(page));
}

const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

test.describe("auto layout: reorder and join (#228)", () => {
  test("a child dragged past the next one's middle lands after it, Frame selected or not", async ({ page }) => {
    const order = await setUp(page);
    const frameBefore = await frameBox(page);
    const boxes = await shapeBoxes(page);
    const first = centre(boxes[order[0]]);
    const second = boxes[order[1]];

    // The Frame is selected, and the drag still moves the child.
    await drag(page, first.x, first.y, second.x + second.w * 0.75, first.y, async () => {
      await expect(line(page)).toBeVisible();
      const l = (await line(page).boundingBox())!;
      // In the gap after the second child.
      expect(l.x).toBeGreaterThan(second.x + second.w - 1);
      expect(l.width).toBe(2);
    });
    await expect(line(page)).toHaveCount(0);
    await page.waitForTimeout(200);

    const after = await shapeBoxes(page);
    expect(leftToRight(after)).toEqual([order[1], order[0], order[2]]);
    const frame = await frameBox(page);
    expect(Math.abs(frame.x - frameBefore.x)).toBeLessThanOrEqual(1);
    expectRow(frame, [after[order[1]], after[order[0]], after[order[2]]]);

    // One undo step puts the old order back.
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(300);
    expect(leftToRight(await shapeBoxes(page))).toEqual(order);
  });

  test("the last child dragged to the front, and one dropped in its own slot", async ({ page }) => {
    const order = await setUp(page);
    let boxes = await shapeBoxes(page);
    const frame = await frameBox(page);
    const last = centre(boxes[order[2]]);
    await drag(page, last.x, last.y, frame.x + 10, last.y);
    boxes = await shapeBoxes(page);
    expect(leftToRight(boxes)).toEqual([order[2], order[0], order[1]]);

    const mid = centre(boxes[order[0]]);
    await drag(page, mid.x, mid.y, mid.x + 8, mid.y + 8);
    expect(leftToRight(await shapeBoxes(page))).toEqual([order[2], order[0], order[1]]);
  });

  test("dragged out it leaves, without clicking it first", async ({ page }) => {
    const order = await setUp(page);
    const boxes = await shapeBoxes(page);
    const mid = centre(boxes[order[1]]);
    await drag(page, mid.x, mid.y, 1150, 650);
    const after = await shapeBoxes(page);
    expect(after[order[1]].x).toBeGreaterThan(1000);
    expectRow(await frameBox(page), [after[order[0]], after[order[2]]]);
  });

  test("a shape dragged in from outside joins at the slot, and the Frame grows", async ({ page }) => {
    const order = await setUp(page);
    await drawRect(page, 1000, 500, 1060, 560);
    const all = await shapeBoxes(page);
    const outsider = Object.keys(all).find((id) => !order.includes(id))!;
    const frameBefore = await frameBox(page);
    const first = all[order[0]];

    const from = centre(all[outsider]);
    await drag(page, from.x, from.y, first.x + 5, first.y + 20, async () => {
      await expect(line(page)).toBeVisible();
    });
    const after = await shapeBoxes(page);
    const frame = await frameBox(page);
    expect(leftToRight(after)).toEqual([outsider, ...order]);
    expect(frame.w).toBeGreaterThan(frameBefore.w + 50);
    expectRow(frame, [outsider, ...order].map((id) => after[id]));
  });

  test("a child moves from one auto layout Frame to another", async ({ page }) => {
    const order = await setUp(page);
    // A second Frame with one rectangle, laid out too.
    await frameBtn(page).click();
    await drag(page, 950, 200, 1250, 450);
    await drawRect(page, 1000, 250, 1080, 300);
    await page.mouse.click(956, 444);
    await page.waitForTimeout(150);
    await layoutOn(page).click();
    await page.waitForTimeout(300);

    const boxes = await shapeBoxes(page);
    const [, second] = await frameBoxes(page);
    const moving = centre(boxes[order[0]]);
    await drag(page, moving.x, moving.y, second.x + second.w - 20, second.y + 30);
    const [one, two] = await frameBoxes(page);
    const after = await shapeBoxes(page);
    expect(leftToRight(after, two)).toHaveLength(2);
    expect(leftToRight(after, two)[1]).toBe(order[0]);
    expectRow(one, [after[order[1]], after[order[2]]]);
  });

  test("drawn or typed inside, it joins at the end", async ({ page }) => {
    const order = await setUp(page);
    const frame = await frameBox(page);
    // The row hugs its rectangles, so draw inside the padding-free part of a
    // taller Frame: below the shorter children.
    const short = (await shapeBoxes(page))[order[1]];
    await drawRect(page, short.x + 5, short.y + short.h + 4, short.x + 25, frame.y + frame.h - 4);
    await page.waitForTimeout(300);
    let after = await shapeBoxes(page);
    const drawn = Object.keys(after).find((id) => !order.includes(id))!;
    expect(leftToRight(after)).toEqual([...order, drawn]);

    const f2 = await frameBox(page);
    const s2 = (await shapeBoxes(page))[order[1]];
    await textBtn(page).click();
    await page.mouse.click(s2.x + 4, f2.y + f2.h - 8);
    await page.keyboard.type("hi");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    after = await shapeBoxes(page);
    const ids = leftToRight(after);
    expect(ids).toHaveLength(5);
    expect(ids.slice(0, 4)).toEqual([...order, drawn]);
  });

  test("an image dropped from the computer onto it joins at the end", async ({ page }) => {
    const order = await setUp(page);
    const f = await frameBox(page);
    const base64 = makePng(200, 150).toString("base64");
    await page.evaluate(async ({ at, base64 }) => {
      const dt = new DataTransfer();
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      dt.items.add(new File([bytes], "dropped.png", { type: "image/png" }));
      const init = { clientX: at.x, clientY: at.y, dataTransfer: dt, bubbles: true, cancelable: true };
      const target = document.elementFromPoint(at.x, at.y) ?? document.body;
      target.dispatchEvent(new DragEvent("dragenter", init));
      target.dispatchEvent(new DragEvent("dragover", init));
      target.dispatchEvent(new DragEvent("drop", init));
    }, { at: { x: f.x + 30, y: f.y + 30 }, base64 });
    await page.waitForTimeout(800);
    const after = await shapeBoxes(page);
    const ids = leftToRight(after);
    expect(ids).toHaveLength(4);
    expect(ids.slice(0, 3)).toEqual(order);
    // The dropped image has a name, so the row starts below its band (#235).
    expectRow(await frameBox(page), ids.map((id) => after[id]), 8 + 24);
  });

  test("a Create panel in the row is dragged to the front like a shape", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);
    const p = (await panelBoxes(page))[0];
    await frameBtn(page).click();
    await drag(page, p.x - 200, p.y - 60, p.x + p.w + 40, p.y + p.h + 60);
    await drawRect(page, p.x - 160, p.y + 20, p.x - 60, p.y + 80);
    await selectFrame(page);
    await layoutOn(page).click();
    await page.waitForTimeout(300);

    const rect = Object.values(await shapeBoxes(page))[0];
    const panel = (await panelBoxes(page))[0];
    expect(panel.x).toBeGreaterThan(rect.x);
    // The panel, dragged by its body to before the rectangle.
    await drag(page, panel.x + panel.w / 2, panel.y + panel.h / 2, rect.x + 4, panel.y + panel.h / 2, async () => {
      await expect(line(page)).toBeVisible();
    });
    await page.waitForTimeout(300);
    const rect2 = Object.values(await shapeBoxes(page))[0];
    const panel2 = (await panelBoxes(page))[0];
    expect(panel2.x).toBeLessThan(rect2.x);
    expectRow(await frameBox(page), [{ x: panel2.x, y: panel2.y, w: panel2.w, h: panel2.h }, rect2]);
  });

  test("the Frame still moves by its padding", async ({ page }) => {
    const order = await setUp(page);
    const f = await frameBox(page);
    const before = await shapeBoxes(page);
    await drag(page, f.x + 6, f.y + f.h - 6, f.x + 106, f.y + f.h + 44);
    const after = await shapeBoxes(page);
    expect(Math.round((await frameBox(page)).x - f.x)).toBe(100);
    for (const id of order) expect(Math.round(after[id].x - before[id].x)).toBe(100);
  });

  test("a Frame without auto layout: a drag inside it, selected, still moves the Frame", async ({ page }) => {
    await openBoard(page);
    await frameBtn(page).click();
    await drag(page, 300, 200, 900, 600);
    await drawRect(page, 400, 300, 500, 380);
    await selectFrame(page);
    const f = await frameBox(page);
    await drag(page, 450, 340, 550, 390);
    expect(Math.round((await frameBox(page)).x - f.x)).toBe(100);
  });
});
