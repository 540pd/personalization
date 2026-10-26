import { test, expect, type Page } from "@playwright/test";
import { openBoard, uploadImage, imageBox, addPanel, panelBoxes, collapsePanels, setZoom, makePng } from "./helpers";

type Box = { x: number; y: number; w: number; h: number };
const frameBtn = (page: Page) => page.locator('.floating-dock button[aria-pressed]').nth(3);

async function frameBox(page: Page): Promise<Box> {
  return page.evaluate(() => {
    const stages = (window as unknown as { Konva: { stages: { find(q: string): { getClientRect(): { x: number; y: number; width: number; height: number } }[] }[] } }).Konva.stages;
    const rect = stages.flatMap((s) => s.find('.frame'))[0]?.getClientRect();
    if (!rect) throw new Error('Frame not found');
    return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
  });
}

async function frameCanvasBox(page: Page): Promise<Box> {
  return page.evaluate(() => {
    type Rect = { x(): number; y(): number; width(): number; height(): number };
    type Stage = { find(q: string): Rect[] };
    const stages = (window as unknown as { Konva: { stages: Stage[] } }).Konva.stages;
    const rect = stages.flatMap((s) => s.find('.frame'))[0];
    if (!rect) throw new Error('Frame not found');
    return { x: rect.x(), y: rect.y(), w: rect.width(), h: rect.height() };
  });
}

async function drawAround(page: Page, b: Box, pad = 80) {
  await frameBtn(page).click();
  await page.mouse.move(b.x - pad, b.y - pad);
  await page.mouse.down();
  await page.mouse.move(b.x + b.w + pad, b.y + b.h + pad, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => frameBox(page)).toBeTruthy();
}

async function moveFrame(page: Page, b: Box) {
  // Bare frame, clear of the contained image or panel and resize corners.
  const x = b.x + 30, y = b.y + 30;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 70, y + 45, { steps: 7 });
  await page.mouse.up();
}

async function checkReload(page: Page, before: Box) {
  await page.reload();
  await expect.poll(() => frameCanvasBox(page)).toBeTruthy();
  const after = await frameCanvasBox(page);
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
}

test.describe('Frame reload persistence (#180)', () => {
  for (const zoom of [0.5, 1, 1.5]) {
    test(`empty Frame at ${zoom * 100}% — move, immediately reload`, async ({ page }) => {
      await openBoard(page);
      await setZoom(page, zoom);
      const box = { x: 500, y: 250, w: 260, h: 180 };
      await drawAround(page, box, 0);
      await moveFrame(page, await frameBox(page));
      const moved = await frameCanvasBox(page);
      await checkReload(page, moved);
    });
  }

  test('uploaded image moves with Frame and restores in the same relative position', async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 200, 150);
    await collapsePanels(page);
    const img = await imageBox(page);
    await drawAround(page, img);
    await moveFrame(page, await frameBox(page));
    const moved = await frameBox(page);
    const imageBefore = await imageBox(page);
    await page.reload();
    await expect.poll(async () => page.evaluate(() =>
      (window as unknown as { Konva: { stages: { find(q: string): unknown[] }[] } }).Konva.stages[0].find('Image').length)).toBe(1);
    const after = await frameBox(page);
    const imageAfter = await imageBox(page);
    expect(after.x).toBeCloseTo(moved.x, 0);
    expect(imageAfter.x - after.x).toBeCloseTo(imageBefore.x - moved.x, 0);
    expect(imageAfter.y - after.y).toBeCloseTo(imageBefore.y - moved.y, 0);
  });

  test('Create node moves and restores with its Frame', async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);
    const [node] = await panelBoxes(page);
    await drawAround(page, node);
    await moveFrame(page, await frameBox(page));
    const before = await frameBox(page);
    const [panelBefore] = await panelBoxes(page);
    await page.reload();
    await expect.poll(async () => (await panelBoxes(page)).length).toBe(1);
    const after = await frameBox(page);
    const [panelAfter] = await panelBoxes(page);
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(panelAfter.x - after.x).toBeCloseTo(panelBefore.x - before.x, 0);
  });

  test('generated image and multiple members restore with their Frame', async ({ page }) => {
    const result = `data:image/png;base64,${makePng(64, 36).toString('base64')}`;
    await page.route('**/api/proxy/**', (route) => route.request().method() === 'POST'
      ? route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jobId: 'j', status: 'done', imageUrl: result, modelUsed: 'm' }) })
      : route.continue());
    await openBoard(page);
    await addPanel(page);
    await page.locator('textarea').first().fill('A landscape');
    await page.locator('button.node-panel-create-button').first().click();
    await expect(page.locator('button.node-panel-placeholder img')).toHaveCount(1);
    await collapsePanels(page);
    await uploadImage(page, 100, 80);
    const panel = (await panelBoxes(page))[0];
    const image = await imageBox(page);
    const union = {
      x: Math.min(panel.x, image.x), y: Math.min(panel.y, image.y),
      w: Math.max(panel.x + panel.w, image.x + image.w) - Math.min(panel.x, image.x),
      h: Math.max(panel.y + panel.h, image.y + image.h) - Math.min(panel.y, image.y),
    };
    await drawAround(page, union);
    await moveFrame(page, await frameBox(page));
    const before = await frameBox(page);
    const [panelBefore] = await panelBoxes(page);
    const imageBefore = await imageBox(page);
    await page.reload();
    await expect.poll(async () => (await panelBoxes(page)).length).toBe(1);
    await expect.poll(async () => page.evaluate(() =>
      (window as unknown as { Konva: { stages: { find(q: string): unknown[] }[] } }).Konva.stages[0].find('Image').length)).toBe(1);
    const after = await frameBox(page);
    const [panelAfter] = await panelBoxes(page);
    const imageAfter = await imageBox(page);
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(panelAfter.x - after.x).toBeCloseTo(panelBefore.x - before.x, 0);
    expect(imageAfter.x - after.x).toBeCloseTo(imageBefore.x - before.x, 0);
    await expect(page.locator('button.node-panel-placeholder img')).toHaveCount(1);
  });
});
