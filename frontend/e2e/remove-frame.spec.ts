import { test, expect, type Page } from "@playwright/test";
import { addPanel, openBoard, setZoom } from "./helpers";

// #244: one selected Frame's bar gets Remove frame (or Shift+F). The Frame
// goes, its items stay where they are and are selected, in one undo step.

/* eslint-disable @typescript-eslint/no-explicit-any */

type Box = { x: number; y: number; w: number; h: number };

const frameBtn = (page: Page) => page.locator(".floating-dock button[aria-pressed]").nth(3);
const shapesBtn = (page: Page) => page.locator(".floating-dock button[aria-pressed]").nth(4);
const menuItem = (page: Page, label: string) =>
  page.locator(".floating-dock-submenu button").filter({
    has: page.locator("span", { hasText: new RegExp(`^${label}$`) }),
  });
const removeBtn = (page: Page) => page.getByRole("button", { name: "Remove frame" });
const createBtn = (page: Page) => page.getByRole("button", { name: "Create frame" });
const bar = (page: Page) => page.getByTestId("shape-style-bar");

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

/** Screen boxes of every Frame. */
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

/** Every shape's box on screen. */
const shapeBoxes = (page: Page): Promise<Box[]> =>
  page.evaluate(() => {
    const stage = (window as any).Konva.stages[0];
    const c = stage.container().getBoundingClientRect();
    return stage.find(".selectable").map((n: any) => {
      const r = n.getClientRect();
      return { x: c.left + r.x, y: c.top + r.y, w: r.width, h: r.height };
    });
  });

/** How many Konva nodes the transformer holds. */
const selectedCount = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const stage = (window as any).Konva.stages[0];
    return stage.find("Transformer").reduce((n: number, t: any) => n + t.nodes().length, 0);
  });

async function shiftClick(page: Page, x: number, y: number) {
  await page.keyboard.down("Shift");
  await page.mouse.click(x, y);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(150);
}

/** Two rectangles in a new Frame, which is left selected. */
async function framedShapes(page: Page) {
  await drawRect(page, 400, 300, 500, 380);
  await drawRect(page, 560, 320, 640, 420);
  await page.mouse.click(450, 340);
  await shiftClick(page, 600, 370);
  await createBtn(page).click();
  await page.waitForTimeout(200);
}

test.describe("Remove frame (#244)", () => {
  test("one Frame: [Color] | [Auto layout] | [Remove frame]; a click keeps its items, selected", async ({ page }) => {
    await openBoard(page);
    await framedShapes(page);
    await expect(bar(page).getByRole("button")).toHaveCount(3);
    await expect(bar(page).getByRole("button").nth(2)).toHaveAccessibleName("Remove frame");
    await removeBtn(page).hover();
    await expect(bar(page).locator(".shape-style-tooltip", { hasText: "Remove frame" })).toContainText("⇧F");

    const before = await shapeBoxes(page);
    await removeBtn(page).click();
    await expect.poll(async () => (await frameBoxes(page)).length).toBe(0);
    expect(await shapeBoxes(page)).toEqual(before);
    expect(await selectedCount(page)).toBe(2);
    // Two selected again: Create frame is back.
    await expect(createBtn(page)).toBeVisible();
    await expect(removeBtn(page)).toHaveCount(0);
  });

  test("with auto layout on, the items keep their laid-out places", async ({ page }) => {
    await openBoard(page);
    await framedShapes(page);
    await page.getByRole("button", { name: "Auto layout", exact: true }).click();
    await page.waitForTimeout(200);
    const laidOut = await shapeBoxes(page);
    await removeBtn(page).click();
    await expect.poll(async () => (await frameBoxes(page)).length).toBe(0);
    expect(await shapeBoxes(page)).toEqual(laidOut);
    expect(await selectedCount(page)).toBe(2);
  });

  test("an empty Frame just goes, leaving nothing selected", async ({ page }) => {
    await openBoard(page);
    await frameBtn(page).click();
    await drag(page, 300, 300, 500, 450);
    await removeBtn(page).click();
    await expect.poll(async () => (await frameBoxes(page)).length).toBe(0);
    expect(await selectedCount(page)).toBe(0);
    await expect(bar(page)).toHaveCount(0);
  });

  test("Shift+F removes it; Shift+F while typing types an F", async ({ page }) => {
    await openBoard(page);
    await framedShapes(page);
    await page.keyboard.press("Shift+F");
    await expect.poll(async () => (await frameBoxes(page)).length).toBe(0);
    expect(await selectedCount(page)).toBe(2);

    // Frame them again with F, select it, then type in a Prompt panel.
    await page.keyboard.press("f");
    await expect.poll(async () => (await frameBoxes(page)).length).toBe(1);
    await addPanel(page);
    const box = page.locator("textarea.node-panel-instruction");
    await box.click();
    await box.pressSequentially("F");
    await expect(box).toHaveValue("F");
    expect(await frameBoxes(page)).toHaveLength(1);
  });

  test("one undo brings back the name, colour and auto layout; redo removes it again", async ({ page }) => {
    await openBoard(page);
    await framedShapes(page);
    await page.getByRole("button", { name: "Shape color" }).click();
    await page.getByRole("group", { name: "Shape colors" }).getByRole("button").nth(1).click();
    await page.getByRole("button", { name: "Auto layout", exact: true }).click();
    await page.waitForTimeout(200);
    const looks = () =>
      page.evaluate(() => {
        const stages = (window as any).Konva.stages as any[];
        const fs = stages.find((st) => st.find(".frame").length);
        return fs ? fs.find(".frame").map((f: any) => f.stroke()) : [];
      });
    const stroke = await looks();
    const laidOut = await shapeBoxes(page);

    await removeBtn(page).click();
    await expect.poll(async () => (await frameBoxes(page)).length).toBe(0);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => (await frameBoxes(page)).length).toBe(1);
    expect(await looks()).toEqual(stroke);
    await expect(page.locator('div[title="Frame"]')).toHaveCount(1);
    expect(await shapeBoxes(page)).toEqual(laidOut);
    // Auto layout is back: selected again, the Frame offers to remove it.
    await page.mouse.click((await frameBoxes(page))[0].x + 4, (await frameBoxes(page))[0].y + 4);
    await expect(page.getByRole("button", { name: "Remove auto layout" })).toBeVisible();

    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect.poll(async () => (await frameBoxes(page)).length).toBe(0);
  });

  test("two Frames selected: no Remove frame; Delete still takes both", async ({ page }) => {
    await openBoard(page);
    await frameBtn(page).click();
    await drag(page, 200, 300, 350, 450);
    await frameBtn(page).click();
    await drag(page, 450, 300, 600, 450);
    await page.keyboard.press("ControlOrMeta+a");
    await page.waitForTimeout(200);
    await expect(removeBtn(page)).toHaveCount(0);
    await page.keyboard.press("Shift+F");
    expect(await frameBoxes(page)).toHaveLength(2);
    await page.keyboard.press("Delete");
    await expect.poll(async () => (await frameBoxes(page)).length).toBe(0);
  });

  test("remove, then F: a new Frame around the same items", async ({ page }) => {
    await openBoard(page);
    await framedShapes(page);
    const first = (await frameBoxes(page))[0];
    await removeBtn(page).click();
    await page.keyboard.press("f");
    await expect.poll(async () => (await frameBoxes(page)).length).toBe(1);
    expect((await frameBoxes(page))[0]).toEqual(first);
  });

  for (const z of [0.5, 1.5]) {
    test(`at ${z * 100}%: the bar keeps its size, removing leaves the items in place`, async ({ page }) => {
      await openBoard(page);
      await setZoom(page, z);
      await framedShapes(page);
      expect(Math.round((await bar(page).boundingBox())!.height)).toBe(44);
      const before = await shapeBoxes(page);
      await removeBtn(page).click();
      await expect.poll(async () => (await frameBoxes(page)).length).toBe(0);
      expect(await shapeBoxes(page)).toEqual(before);
    });
  }
});
