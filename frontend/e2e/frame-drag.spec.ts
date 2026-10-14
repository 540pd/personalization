import { test, expect, type Page } from "@playwright/test";
import { openBoard, uploadImage, imageBox, addPanel, panelBoxes, collapsePanels, setZoom } from "./helpers";

// Issue #119. A selected frame owns a drag that starts inside it: pressing on
// a node within it and dragging moves the frame and everything in it. A plain
// click still selects the node. The frame's name is a handle too.

type Box = { x: number; y: number; w: number; h: number };

const frameBtn = (page: Page) => page.locator(".floating-dock button[aria-pressed]").nth(3);

/**
 * Draw a frame around a box without crossing the node's name label, which
 * sits just above its top-left corner and cancels a draw that passes over it
 * (#118). Down the left side, then along the bottom.
 */
async function drawAround(page: Page, b: Box, pad = 90) {
  await frameBtn(page).click();
  const x1 = b.x - pad, y1 = b.y - pad, x2 = b.x + b.w + pad, y2 = b.y + b.h + pad;
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x1, y2, { steps: 6 });
  await page.mouse.move(x2, y2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

/** The frame's box, and how many frames and board nodes are selected. */
const state = (page: Page) =>
  page.evaluate(() => {
    type N = { getClientRect(): { x: number; y: number; width: number; height: number } };
    type S = { find(q: string): N[]; findOne(q: string): { nodes(): unknown[] } | undefined };
    const stages = (window as unknown as { Konva: { stages: S[] } }).Konva.stages;
    const fs = stages.find((st) => st.find(".frame").length);
    const bs = stages.find((st) => st !== fs);
    const r = fs?.find(".frame")[0]?.getClientRect();
    return {
      frame: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
      framesSelected: fs?.findOne("Transformer")?.nodes().length ?? 0,
      nodesSelected: bs?.findOne("Transformer")?.nodes().length ?? 0,
    };
  });

const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** An uploaded image with a frame drawn around it -- drawn, so selected. */
async function imageInFrame(page: Page) {
  await openBoard(page);
  await uploadImage(page, 200, 150);
  await collapsePanels(page);
  const img = await imageBox(page);
  await drawAround(page, img);
  return img;
}

test.describe("dragging a selected frame from inside it", () => {
  test("dragging an image inside a selected frame moves the whole frame", async ({ page }) => {
    const img = await imageInFrame(page);
    const before = await state(page);
    expect(before.framesSelected).toBe(1);

    await drag(page, centre(img), 80, 50);

    const after = await state(page);
    const moved = await imageBox(page);
    expect(Math.round(moved.x - img.x)).toBe(80);
    expect(Math.round(moved.y - img.y)).toBe(50);
    expect(Math.round(after.frame!.x - before.frame!.x)).toBe(80);
    expect(Math.round(after.frame!.y - before.frame!.y)).toBe(50);
    // The frame stays the selection; the image did not take it.
    expect(after.framesSelected).toBe(1);
    expect(after.nodesSelected).toBe(0);
  });

  test("dragging a Create node inside a selected frame moves the whole frame", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);
    const [node] = await panelBoxes(page);
    await drawAround(page, node);
    const before = await state(page);

    await drag(page, centre(node), 70, 40);

    const [after] = await panelBoxes(page);
    expect(Math.round(after.x - node.x)).toBe(70);
    expect(Math.round(after.y - node.y)).toBe(40);
    const s = await state(page);
    expect(Math.round(s.frame!.x - before.frame!.x)).toBe(70);
    expect(Math.round(s.frame!.y - before.frame!.y)).toBe(40);
  });

  test("a plain click on an image inside a selected frame selects the image", async ({ page }) => {
    const img = await imageInFrame(page);
    const before = await state(page);

    await page.mouse.click(centre(img).x, centre(img).y);
    await page.waitForTimeout(400);

    const after = await state(page);
    expect(after.nodesSelected).toBe(1);
    expect(after.framesSelected).toBe(0);
    // And nothing moved.
    expect(Math.round(after.frame!.x)).toBe(Math.round(before.frame!.x));
  });

  test("with the frame not selected, dragging an image moves only the image", async ({ page }) => {
    const img = await imageInFrame(page);
    await page.mouse.click(1050, 620);
    await page.waitForTimeout(300);
    const before = await state(page);
    expect(before.framesSelected).toBe(0);

    await drag(page, centre(img), 40, 30);

    const moved = await imageBox(page);
    expect(Math.round(moved.x - img.x)).toBe(40);
    const after = await state(page);
    expect(Math.round(after.frame!.x)).toBe(Math.round(before.frame!.x));
    expect(Math.round(after.frame!.y)).toBe(Math.round(before.frame!.y));
  });

  test("one undo puts the frame and its contents back together", async ({ page }) => {
    const img = await imageInFrame(page);
    const before = await state(page);
    await drag(page, centre(img), 80, 50);

    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(500);

    const back = await imageBox(page);
    expect(Math.round(back.x)).toBe(Math.round(img.x));
    expect(Math.round(back.y)).toBe(Math.round(img.y));
    const s = await state(page);
    expect(Math.round(s.frame!.x)).toBe(Math.round(before.frame!.x));
    expect(Math.round(s.frame!.y)).toBe(Math.round(before.frame!.y));
  });

  for (const level of [0.5, 1.5]) {
    test(`the frame and image move together at ${level * 100}% zoom`, async ({ page }) => {
      await openBoard(page);
      await setZoom(page, level);
      await uploadImage(page, 200, 150);
      await collapsePanels(page);
      const img = await imageBox(page);
      await drawAround(page, img, 60);
      const before = await state(page);

      await drag(page, centre(img), 60, 40);

      const moved = await imageBox(page);
      const after = await state(page);
      // Screen px, so the same offset at any zoom.
      expect(Math.round(moved.x - img.x)).toBe(60);
      expect(Math.round(after.frame!.x - before.frame!.x)).toBe(60);
    });
  }
});

test.describe("dragging a frame by its name", () => {
  const frameName = (page: Page) => page.locator('div[title="Frame"]');

  test("dragging the name moves the frame and its contents, and selects it", async ({ page }) => {
    const img = await imageInFrame(page);
    await page.mouse.click(1050, 620);
    await page.waitForTimeout(300);
    const before = await state(page);
    const label = (await frameName(page).boundingBox())!;

    await drag(page, { x: label.x + label.width / 2, y: label.y + label.height / 2 }, 90, 40);

    const after = await state(page);
    const moved = await imageBox(page);
    expect(Math.round(after.frame!.x - before.frame!.x)).toBe(90);
    expect(Math.round(moved.x - img.x)).toBe(90);
    expect(after.framesSelected).toBe(1);
    // The name went with it.
    const labelAfter = (await frameName(page).boundingBox())!;
    expect(Math.round(labelAfter.x - label.x)).toBe(90);
  });

  test("clicking the name selects the frame without moving it", async ({ page }) => {
    await imageInFrame(page);
    await page.mouse.click(1050, 620);
    await page.waitForTimeout(300);
    const before = await state(page);

    await frameName(page).click();
    await page.waitForTimeout(300);

    const after = await state(page);
    expect(after.framesSelected).toBe(1);
    expect(Math.round(after.frame!.x)).toBe(Math.round(before.frame!.x));
  });

  test("double-clicking the name still renames the frame", async ({ page }) => {
    await imageInFrame(page);

    await frameName(page).dblclick();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("Hero shots");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);

    await expect(page.locator('div[title="Hero shots"]')).toHaveCount(1);
  });
});
