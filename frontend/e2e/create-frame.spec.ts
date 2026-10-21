import { test, expect, type Page } from "@playwright/test";
import { addPanel, collapsePanels, imageBox, openBoard, panelBoxes, setZoom, uploadImage, dragFrom } from "./helpers";

// #243: with two or more items selected, the bar's Create frame (or F) puts a
// Frame around them -- 16 padding, room for names at the top -- and selects
// it, with nothing moved.

/* eslint-disable @typescript-eslint/no-explicit-any */

type Box = { x: number; y: number; w: number; h: number };

const shapesBtn = (page: Page) => page.getByRole("button", { name: "Shapes", exact: true });
const menuItem = (page: Page, label: string) =>
  page.locator(".floating-dock-submenu button").filter({
    has: page.locator("span", { hasText: new RegExp(`^${label}$`) }),
  });
const createBtn = (page: Page) => page.getByRole("button", { name: "Create frame" });
const bar = (page: Page) => page.getByTestId("shape-style-bar");

async function drawRect(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await shapesBtn(page).click();
  await menuItem(page, "Rectangle").click();
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
  await page.mouse.move(x2, y2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

/** Screen boxes of every Frame, in canvas order. */
const frameBoxes = (page: Page): Promise<Box[]> =>
  page.evaluate(() => {
    const stages = (window as any).Konva.stages as any[];
    const fs = stages.find((st) => st.find(".frame").length);
    if (!fs) return [];
    const c = fs.container().getBoundingClientRect();
    return fs.find(".frame").map((f: any) => {
      const r = f.getClientRect({ skipStroke: true });
      return { x: c.left + r.x, y: c.top + r.y, w: r.width, h: r.height };
    });
  });

/** Every shape's box on screen (stroke included, as the Frame measures it). */
const shapeBoxes = (page: Page): Promise<Box[]> =>
  page.evaluate(() => {
    const stage = (window as any).Konva.stages[0];
    const c = stage.container().getBoundingClientRect();
    return stage.find(".selectable").filter((n: any) => n.getClassName() !== "Image").map((n: any) => {
      const r = n.getClientRect();
      return { x: c.left + r.x, y: c.top + r.y, w: r.width, h: r.height };
    });
  });

const union = (bs: Box[]): Box => {
  const x = Math.min(...bs.map((b) => b.x));
  const y = Math.min(...bs.map((b) => b.y));
  const r = Math.max(...bs.map((b) => b.x + b.w));
  const btm = Math.max(...bs.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: btm - y };
};

/** Shift+click: adds to the selection. page.mouse.click takes no modifiers. */
async function shiftClick(page: Page, x: number, y: number) {
  await page.keyboard.down("Shift");
  await page.mouse.click(x, y);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(150);
}

/** Two rectangles, both selected. */
async function twoShapes(page: Page) {
  await drawRect(page, 400, 300, 500, 380);
  await drawRect(page, 560, 320, 640, 420);
  await page.mouse.click(450, 340);
  await shiftClick(page, 600, 370);
  await page.waitForTimeout(200);
}

const near = (a: number, b: number, tol = 2) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

test.describe("Create frame from a selection (#243)", () => {
  test("two shapes: [Color…] | [Create frame]; a click frames them with 16 all round, nothing moved", async ({ page }) => {
    await openBoard(page);
    await twoShapes(page);
    await expect(bar(page).getByRole("button", { name: "Shape color" })).toBeVisible();
    await expect(createBtn(page)).toBeVisible();
    await createBtn(page).hover();
    await expect(bar(page).locator(".shape-style-tooltip", { hasText: "Create frame" })).toBeVisible();

    const before = await shapeBoxes(page);
    await createBtn(page).click();
    const frames = await frameBoxes(page);
    expect(frames).toHaveLength(1);
    const u = union(before);
    near(frames[0].x, u.x - 16);
    near(frames[0].y, u.y - 16);
    near(frames[0].w, u.w + 32);
    near(frames[0].h, u.h + 32);
    expect(await shapeBoxes(page)).toEqual(before);

    // Selected, named, with its own bar (Auto layout) and no Create frame.
    await expect(page.getByRole("button", { name: "Auto layout", exact: true })).toBeVisible();
    await expect(createBtn(page)).toHaveCount(0);
    await expect(page.locator('div[title="Frame"]')).toHaveCount(1);
  });

  test("the new Frame carries its items; one undo takes it away, redo brings it back", async ({ page }) => {
    await openBoard(page);
    await twoShapes(page);
    await createBtn(page).click();
    const f = (await frameBoxes(page))[0];
    const before = await shapeBoxes(page);
    // Drag the Frame by its empty top-left corner area.
    await dragFrom(page, f.x + 6, f.y + 6, 40, 30);
    const after = await shapeBoxes(page);
    after.forEach((b, i) => {
      near(b.x, before[i].x + 40);
      near(b.y, before[i].y + 30);
    });

    await page.keyboard.press("ControlOrMeta+z"); // the drag
    await page.keyboard.press("ControlOrMeta+z"); // the Frame
    await expect.poll(async () => (await frameBoxes(page)).length).toBe(0);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect.poll(async () => (await frameBoxes(page)).length).toBe(1);
  });

  test("a shape and a generated node: Create frame alone; F makes it", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);
    await drawRect(page, 300, 560, 380, 620);
    const p = (await panelBoxes(page))[0];
    await shiftClick(page, p.x + p.w / 2, p.y + p.h / 2);
    await page.waitForTimeout(250);
    await expect(createBtn(page)).toBeVisible();
    await expect(bar(page).getByRole("button", { name: "Shape color" })).toHaveCount(0);

    await page.keyboard.press("f");
    const frames = await frameBoxes(page);
    expect(frames).toHaveLength(1);
    // The node is inside it. Not yet named by a generation, it has no name
    // to leave room for: 16 above it.
    expect(frames[0].x).toBeLessThan(p.x);
    near(frames[0].y, p.y - 16, 3);
  });

  test("two images with names: the top leaves 8 + 24 for them", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 200, 120, "beach.png");
    // Uploads land in the same place: move the first aside.
    const first = await imageBox(page, 0);
    await dragFrom(page, first.x + first.w / 2, first.y + first.h / 2, -260, 40);
    await uploadImage(page, 200, 120, "city.png");
    const a = await imageBox(page, 0);
    const b = await imageBox(page, 1);
    await page.mouse.click(a.x + a.w / 2, a.y + a.h / 2);
    await shiftClick(page, b.x + b.w / 2, b.y + b.h / 2);
    await page.waitForTimeout(200);
    await createBtn(page).click();
    const f = (await frameBoxes(page))[0];
    near(f.y, Math.min(a.y, b.y) - 32);
    near(f.x, Math.min(a.x, b.x) - 16);
  });

  test("not offered for one item, a selection with a Frame, or items already in one Frame; F does nothing", async ({ page }) => {
    await openBoard(page);
    await drawRect(page, 400, 300, 500, 380);
    await expect(createBtn(page)).toHaveCount(0);
    await page.keyboard.press("f");
    expect(await frameBoxes(page)).toHaveLength(0);

    await drawRect(page, 560, 320, 640, 420);
    await page.mouse.click(450, 340);
    await shiftClick(page, 600, 370);
    await createBtn(page).click();
    // Both shapes are now inside the Frame: selecting them again offers nothing.
    await page.mouse.click(450, 340);
    await shiftClick(page, 600, 370);
    await page.waitForTimeout(200);
    await expect(createBtn(page)).toHaveCount(0);
    await page.keyboard.press("f");
    expect(await frameBoxes(page)).toHaveLength(1);

    // Cmd+A selects the Frame too.
    await page.keyboard.press("ControlOrMeta+a");
    await page.waitForTimeout(200);
    await expect(createBtn(page)).toHaveCount(0);
  });

  test("F while typing in a Prompt panel types an f", async ({ page }) => {
    await openBoard(page);
    await twoShapes(page);
    await addPanel(page);
    const box = page.locator("textarea.node-panel-instruction");
    await box.click();
    await box.pressSequentially("f");
    await expect(box).toHaveValue("f");
    expect(await frameBoxes(page)).toHaveLength(0);
  });

  for (const z of [0.5, 1.5]) {
    test(`at ${z * 100}%: the padding scales with the board, the bar keeps its size`, async ({ page }) => {
      await openBoard(page);
      await setZoom(page, z);
      await twoShapes(page);
      const barH = (await bar(page).boundingBox())!.height;
      expect(Math.round(barH)).toBe(44);
      const before = await shapeBoxes(page);
      await createBtn(page).click();
      const f = (await frameBoxes(page))[0];
      const scale = await page.evaluate(() => (window as any).Konva.stages[0].scaleX());
      const u = union(before);
      near(f.x, u.x - 16 * scale);
      near(f.y, u.y - 16 * scale);
      near(f.w, u.w + 32 * scale);
    });
  }
});
