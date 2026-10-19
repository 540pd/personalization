import { test, expect, type Page } from "@playwright/test";
import { openBoard, uploadImage, imageBox, addPanel, collapsePanels, panelBoxes, activePanelCount } from "./helpers";

// #105: after an upload the canvas is the front layer, and the board used to
// let every event through over empty space -- so a click on empty board, and
// the wheel, reached the page instead. These pin the fix and what the
// pass-through still has to do.

const frameBtn = (page: Page) => page.locator(".floating-dock button[aria-pressed]").nth(3);
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

// #142: over a Frame's bare area Board lets the pointer through to the frames
// stage, which had no wheel handler, so the wheel did nothing there.
test.describe("the wheel over a Frame's bare area", () => {
  // Inside the Frame drawn by drawFrame, clear of the sidebar and the dock.
  const INSIDE = { x: 700, y: 400 };

  async function drawFrame(page: Page) {
    await frameBtn(page).click();
    await page.mouse.move(520, 250); await page.mouse.down();
    await page.mouse.move(900, 560, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(300);
  }

  async function wheelAt(page: Page, at: { x: number; y: number }, dy: number, steps = 5) {
    await page.mouse.move(at.x, at.y);
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, dy);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(200);
  }

  /** The canvas point under a screen point, so "toward the cursor" can be checked. */
  const canvasAt = (page: Page, at: { x: number; y: number }) =>
    page.evaluate(([px, py]) => {
      const s = (window as any).Konva.stages[0];
      const c = s.container().getBoundingClientRect();
      return { x: (px - c.left - s.x()) / s.scaleX(), y: (py - c.top - s.y()) / s.scaleY() };
    }, [at.x, at.y]);

  test("zooms out and in, DOM in front", async ({ page }) => {
    await openBoard(page);
    await drawFrame(page);
    await page.mouse.click(1100, 700);
    await wheelAt(page, INSIDE, 120);
    expect(await scale(page)).toBeLessThan(0.9);
    const out = await scale(page);
    await wheelAt(page, INSIDE, -120);
    expect(await scale(page)).toBeGreaterThan(out);
  });

  test("zooms with the canvas in front, after an image is dragged", async ({ page }) => {
    await openBoard(page);
    await drawFrame(page);
    await uploadImage(page, 160, 120);
    // Deselect first: a selected Frame takes over a drag started inside it (#119).
    await page.mouse.click(1100, 700);
    // Below the Frame, so the cursor is over bare Frame and not the image.
    await dragImage(page, 0, 280);
    const img = await imageBox(page);
    expect(INSIDE.y < img.y || INSIDE.x < img.x || INSIDE.x > img.x + img.w).toBe(true);
    await page.mouse.click(1100, 700);
    await wheelAt(page, INSIDE, 120);
    expect(await scale(page)).toBeLessThan(0.9);
  });

  test("zooms with the Frame selected", async ({ page }) => {
    await openBoard(page);
    await drawFrame(page);
    await page.mouse.click(INSIDE.x, INSIDE.y);
    await wheelAt(page, INSIDE, 120);
    expect(await scale(page)).toBeLessThan(0.9);
  });

  test("zooms toward the cursor: the point under it stays put", async ({ page }) => {
    await openBoard(page);
    await drawFrame(page);
    await page.mouse.click(1100, 700);
    const before = await canvasAt(page, INSIDE);
    await wheelAt(page, INSIDE, 120);
    const after = await canvasAt(page, INSIDE);
    expect(await scale(page)).toBeLessThan(0.9);
    expect(Math.abs(after.x - before.x)).toBeLessThan(1);
    expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  });

  test("the frames stage follows the zoom", async ({ page }) => {
    await openBoard(page);
    await drawFrame(page);
    await page.mouse.click(1100, 700);
    await wheelAt(page, INSIDE, 120);
    const frameScale = await page.evaluate(() =>
      (window as any).Konva.stages.find((s: any) => s.find(".frame").length).scaleX()
    );
    expect(frameScale).toBeLessThan(0.9);
    expect(Math.abs(frameScale - (await scale(page)))).toBeLessThan(0.001);
  });

  test("an open Create form over the Frame still scrolls itself, not the board", async ({ page }) => {
    await openBoard(page);
    await drawFrame(page);
    await addPanel(page);
    const form = await page.locator(".node-panel-create").first().boundingBox();
    expect(form).not.toBeNull();
    await wheelAt(page, { x: form!.x + form!.width / 2, y: form!.y + form!.height / 2 }, 120);
    expect(await scale(page)).toBe(1);
  });

  test("the sidebar and the dock do not zoom the board", async ({ page }) => {
    await openBoard(page);
    await drawFrame(page);
    const side = await page.locator(".sidebar").boundingBox();
    await wheelAt(page, { x: side!.x + side!.width / 2, y: side!.y + side!.height / 2 }, 120);
    const dock = await page.locator(".floating-dock").boundingBox();
    await wheelAt(page, { x: dock!.x + dock!.width / 2, y: dock!.y + dock!.height / 2 }, 120);
    expect(await scale(page)).toBe(1);
  });

  test("a click on the bare Frame still selects it", async ({ page }) => {
    await openBoard(page);
    await drawFrame(page);
    await page.mouse.click(1100, 700);
    await wheelAt(page, INSIDE, 120);
    await page.mouse.click(INSIDE.x, INSIDE.y);
    await page.waitForTimeout(300);
    const frameHandles = await page.evaluate(() =>
      (window as any).Konva.stages.find((s: any) => s.find(".frame").length)?.findOne("Transformer")?.nodes().length ?? 0
    );
    expect(frameHandles).toBe(1);
  });
});
