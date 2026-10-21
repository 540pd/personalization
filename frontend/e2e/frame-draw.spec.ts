import { test, expect, type Page } from "@playwright/test";
import { openBoard, uploadImage, imageBox, collapsePanels, setZoom, addPanel, activePanelCount } from "./helpers";

// Issue #118. A frame drawn corner to corner around an image passes over the
// image's name label, which is DOM above the canvas. The draw used to listen
// to Board's stage, read the label as the pointer leaving, and cancel --
// creating nothing.

const frameBtn = (page: Page) => page.getByRole("button", { name: "Frame", exact: true });

const frameCount = (page: Page) =>
  page.evaluate(() => {
    const stages = (window as unknown as { Konva: { stages: { find(s: string): unknown[] }[] } }).Konva.stages;
    return stages.reduce((n, s) => n + s.find(".frame").length, 0);
  });

/** The first frame's box on screen. */
const frameBox = (page: Page) =>
  page.evaluate(() => {
    type N = { getClientRect(): { x: number; y: number; width: number; height: number } };
    const stages = (window as unknown as { Konva: { stages: { find(s: string): N[] }[] } }).Konva.stages;
    const r = stages.flatMap((s) => s.find(".frame"))[0]?.getClientRect();
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
  });

/** How many frames have handles. */
const selectedFrames = (page: Page) =>
  page.evaluate(() => {
    type S = { find(q: string): unknown[]; findOne(q: string): { nodes(): unknown[] } | undefined };
    const fs = (window as unknown as { Konva: { stages: S[] } }).Konva.stages.find((st) => st.find(".frame").length);
    return fs?.findOne("Transformer")?.nodes().length ?? 0;
  });

/** The image's name label on screen. */
async function labelBox(page: Page) {
  const box = await page.locator('div[title="photo"]').boundingBox();
  if (!box) throw new Error("image name label not found");
  return box;
}

async function imageOnBoard(page: Page) {
  await openBoard(page);
  await uploadImage(page, 200, 150);
  await collapsePanels(page);
  return imageBox(page);
}

test.describe("drawing a frame across chrome", () => {
  test("a diagonal draw across an image's name still makes the frame", async ({ page }) => {
    const img = await imageOnBoard(page);
    const label = await labelBox(page);
    await frameBtn(page).click();

    // From above-left of the image, straight through the middle of its name,
    // to below-right of it.
    const lx = label.x + label.width / 2, ly = label.y + label.height / 2;
    await page.mouse.move(img.x - 60, label.y - 40);
    await page.mouse.down();
    await page.mouse.move(lx, ly, { steps: 6 });        // on the label
    await page.mouse.move(img.x + img.w + 60, img.y + img.h + 60, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    expect(await frameCount(page)).toBe(1);
    const f = (await frameBox(page))!;
    // Sized from the press to the release, not cut short where the label was.
    expect(Math.round(f.x)).toBe(Math.round(img.x - 60));
    expect(Math.round(f.x + f.w)).toBeGreaterThanOrEqual(Math.round(img.x + img.w + 58));
  });

  test("releasing over a name still completes the draw", async ({ page }) => {
    const img = await imageOnBoard(page);
    const label = await labelBox(page);
    await frameBtn(page).click();

    await page.mouse.move(img.x - 120, label.y - 80);
    await page.mouse.down();
    await page.mouse.move(label.x + label.width / 2, label.y + label.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    expect(await frameCount(page)).toBe(1);
  });

  // Ending a draw swallows the click its own release makes on the board. A
  // release over a name makes no such click, so the next real click on
  // empty board must still clear the selection.
  test("after a draw released over a name, clicking empty board still deselects", async ({ page }) => {
    const img = await imageOnBoard(page);
    const label = await labelBox(page);
    await frameBtn(page).click();
    await page.mouse.move(img.x - 120, label.y - 80);
    await page.mouse.down();
    await page.mouse.move(label.x + label.width / 2, label.y + label.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await selectedFrames(page)).toBe(1);

    await page.mouse.click(1050, 620);
    await page.waitForTimeout(300);
    expect(await selectedFrames(page)).toBe(0);
  });

  test("Escape still cancels a draw in progress", async ({ page }) => {
    const img = await imageOnBoard(page);
    await frameBtn(page).click();

    await page.mouse.move(img.x - 60, img.y - 60);
    await page.mouse.down();
    await page.mouse.move(img.x + 100, img.y + 100, { steps: 6 });
    await page.keyboard.press("Escape");
    await page.mouse.move(img.x + 200, img.y + 200, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    expect(await frameCount(page)).toBe(0);
  });

  test("losing the window mid-draw leaves no draft behind", async ({ page }) => {
    const img = await imageOnBoard(page);
    await frameBtn(page).click();

    await page.mouse.move(img.x - 60, img.y - 60);
    await page.mouse.down();
    await page.mouse.move(img.x + 100, img.y + 100, { steps: 6 });
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.mouse.up();
    await page.waitForTimeout(300);

    expect(await frameCount(page)).toBe(0);
    // And the next draw starts clean.
    await frameBtn(page).click();
    await page.mouse.move(img.x - 60, img.y - 60);
    await page.mouse.down();
    await page.mouse.move(img.x + 260, img.y + 200, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await frameCount(page)).toBe(1);
  });

  test("a node's name still renames after a frame is drawn across it", async ({ page }) => {
    const img = await imageOnBoard(page);
    const label = await labelBox(page);
    await frameBtn(page).click();
    await page.mouse.move(img.x - 60, label.y - 40);
    await page.mouse.down();
    await page.mouse.move(label.x + label.width / 2, label.y + label.height / 2, { steps: 6 });
    await page.mouse.move(img.x + img.w + 60, img.y + img.h + 60, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    await page.locator('div[title="photo"]').dblclick();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("harbour");
    await page.keyboard.press("Enter");
    await expect(page.locator('div[title="harbour"]')).toHaveCount(1);
  });

  // The draw ends with no click on the board any more, so nothing else clears
  // what was selected before it. One selection at a time (#107): the new
  // frame takes it alone.
  test("a frame drawn while a Create node is selected leaves only the frame selected", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await frameBtn(page).click();
    await page.mouse.move(1100, 90);
    await page.mouse.down();
    await page.mouse.move(1420, 200, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    expect(await frameCount(page)).toBe(1);
    expect(await selectedFrames(page)).toBe(1);
    expect(await activePanelCount(page)).toBe(0);
  });

  for (const level of [0.5, 1.5]) {
    test(`a draw across a name works at ${level * 100}% zoom`, async ({ page }) => {
      await openBoard(page);
      await setZoom(page, level);
      await uploadImage(page, 200, 150);
      await collapsePanels(page);
      const img = await imageBox(page);
      const label = await labelBox(page);
      await frameBtn(page).click();

      await page.mouse.move(img.x - 40, label.y - 30);
      await page.mouse.down();
      await page.mouse.move(label.x + label.width / 2, label.y + label.height / 2, { steps: 6 });
      await page.mouse.move(img.x + img.w + 40, img.y + img.h + 40, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(300);

      expect(await frameCount(page)).toBe(1);
    });
  }
});
