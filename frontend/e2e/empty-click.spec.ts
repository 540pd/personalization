import { test, expect, type Page } from "@playwright/test";
import { openBoard, uploadImage, imageBox, addPanel, collapsePanels, panelBoxes, activePanelCount } from "./helpers";

// #105: after an upload the canvas is the front layer, and the board used to
// let every event through over empty space -- so a click on empty board, and
// the wheel, reached the page instead. These pin the fix and what the
// pass-through still has to do.

const frameBtn = (page: Page) => page.getByRole("button", { name: "Frame", exact: true });
const handles = (page: Page) =>
  page.evaluate(() => (window as any).Konva.stages[0].findOne("Transformer")?.nodes().length ?? 0);
const scale = (page: Page) => page.evaluate(() => (window as any).Konva.stages[0].scaleX() as number);

async function dragImage(page: Page, dx: number, dy: number) {
  const img = await imageBox(page);
  await page.mouse.move(img.x + img.w / 2, img.y + img.h / 2);
  await page.mouse.down();
  await page.mouse.move(img.x + img.w / 2 + dx, img.y + img.h / 2 + dy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function selectImage(page: Page) {
  const img = await imageBox(page);
  await page.mouse.click(img.x + img.w / 2, img.y + img.h / 2);
  await page.waitForTimeout(300);
  expect(await handles(page)).toBe(1);
}

test.describe("a click on empty board", () => {
  test("deselects a just-uploaded image, and its name stays", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 200, 150);
    await selectImage(page);
    await page.mouse.click(1000, 600);
    await page.waitForTimeout(300);
    expect(await handles(page)).toBe(0);
    await expect(page.locator('div[title="photo"]')).toHaveCount(1);
  });

  test("deselects an uploaded image after it has been dragged", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 200, 150);
    await dragImage(page, 120, 40);
    await selectImage(page);
    await page.mouse.click(1000, 600);
    await page.waitForTimeout(300);
    expect(await handles(page)).toBe(0);
  });

  test("still reaches a Create node lying under the raised canvas", async ({ page }) => {
    // The reason the pass-through exists.
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);
    await uploadImage(page, 200, 150);
    // Move the image clear of the node, so the node is bare under the canvas.
    const p = (await panelBoxes(page))[0];
    const img = await imageBox(page);
    await dragImage(page, p.x + p.w + 80 - img.x, 0);
    // Nothing selected first, so the click below has to land to select it.
    await page.mouse.click(1000, 600);
    await page.waitForTimeout(300);
    expect(await activePanelCount(page)).toBe(0);

    await page.mouse.click(p.x + p.w / 2, p.y + p.h / 2);
    await page.waitForTimeout(300);
    expect(await activePanelCount(page)).toBe(1);
    expect(await handles(page)).toBe(0);
  });

  test("still reaches a bare Frame under the raised canvas", async ({ page }) => {
    await openBoard(page);
    await frameBtn(page).click();
    await page.mouse.move(260, 320); await page.mouse.down();
    await page.mouse.move(560, 560, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(300);
    await uploadImage(page, 160, 120);
    await dragImage(page, 200, 0);
    await page.mouse.click(1000, 650);
    await page.waitForTimeout(300);
    await page.mouse.click(400, 450);
    await page.waitForTimeout(300);
    const frameHandles = await page.evaluate(() =>
      (window as any).Konva.stages.find((s: any) => s.find(".frame").length)?.findOne("Transformer")?.nodes().length ?? 0
    );
    expect(frameHandles).toBe(1);
  });
});

test.describe("the wheel over empty board", () => {
  test("zooms after an uploaded image has been dragged", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 160, 120);
    await dragImage(page, 150, 0);
    await page.mouse.click(1000, 600);
    await page.mouse.move(420, 300);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(200);
    expect(await scale(page)).toBeLessThan(0.9);
  });
});
