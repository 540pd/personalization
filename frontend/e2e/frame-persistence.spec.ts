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

async function imageCanvasBox(page: Page): Promise<Box> {
  return page.evaluate(() => {
    type Image = { x(): number; y(): number; width(): number; height(): number };
    const image = (window as unknown as { Konva: { stages: { find(q: string): Image[] }[] } }).Konva.stages[0].find('Image')[0];
    return { x: image.x(), y: image.y(), w: image.width(), h: image.height() };
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

// Reload, then wait for the board to load and restore its Frame. The checks
// after a reload read window.Konva and throw until then, and a throw fails
// expect.poll at once rather than being retried.
async function reloadBoard(page: Page) {
  await page.reload();
  await page.waitForFunction(() => {
    const konva = (window as unknown as { Konva?: { stages: { find(q: string): unknown[] }[] } }).Konva;
    return !!konva && konva.stages.some((s) => s.find('.frame').length > 0);
  });
}

async function bitmapCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('gcos-frame-media', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = db.transaction('bitmaps', 'readonly').objectStore('bitmaps').count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  });
}

async function checkReload(page: Page, before: Box) {
  await reloadBoard(page);
  await expect.poll(() => frameCanvasBox(page)).toBeTruthy();
  const after = await frameCanvasBox(page);
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
}

test.describe('Frame reload persistence (#180)', () => {
  test('restored images are the undo baseline and survive the next Frame save (#193)', async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 200, 150);
    await collapsePanels(page);
    await drawAround(page, await imageBox(page));
    await reloadBoard(page);
    await expect.poll(() => page.evaluate(() =>
      (window as unknown as { Konva: { stages: { find(q: string): unknown[] }[] } }).Konva.stages[0].find('Image').length)).toBe(1);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => page.evaluate(() =>
      (window as unknown as { Konva: { stages: { find(q: string): unknown[] }[] } }).Konva.stages[0].find('Image').length)).toBe(1);
    await moveFrame(page, await frameBox(page));
    await reloadBoard(page);
    await expect.poll(() => page.evaluate(() =>
      (window as unknown as { Konva: { stages: { find(q: string): unknown[] }[] } }).Konva.stages[0].find('Image').length)).toBe(1);
  });

  test('deleting an image removes its saved bitmap; undo brings it back (#193)', async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 100, 80);
    await expect.poll(() => bitmapCount(page)).toBe(1);
    const box = await imageBox(page);
    await drawAround(page, box);
    await page.keyboard.press('Escape');
    await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
    await page.keyboard.press('Delete');
    await expect.poll(() => bitmapCount(page)).toBe(0);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => bitmapCount(page)).toBe(1);
    await expect.poll(() => page.evaluate(() =>
      (window as unknown as { Konva: { stages: { find(q: string): unknown[] }[] } }).Konva.stages[0].find('Image').length)).toBe(1);
    await reloadBoard(page);
    await expect.poll(() => page.evaluate(() =>
      (window as unknown as { Konva: { stages: { find(q: string): unknown[] }[] } }).Konva.stages[0].find('Image').length)).toBe(1);
  });

  test('a stalled bitmap write does not delay uploading several images (#193)', async ({ page }) => {
    await openBoard(page);
    await page.evaluate(() => {
      // Simulate IndexedDB opening but never finishing; upload placement and
      // the dock's busy state must not depend on it.
      indexedDB.open = (() => ({} as IDBOpenDBRequest)) as typeof indexedDB.open;
    });
    await page.locator('input[type="file"]').setInputFiles([
      { name: 'one.png', mimeType: 'image/png', buffer: makePng(90, 60) },
      { name: 'two.png', mimeType: 'image/png', buffer: makePng(80, 50) },
    ]);
    await page.waitForFunction(() =>
      (window as unknown as { Konva: { stages: { find(q: string): unknown[] }[] } }).Konva.stages[0].find('Image').length === 2);
    await expect(page.getByRole('button', { name: 'Upload files' })).toHaveAttribute('aria-pressed', 'false');
  });
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

  for (const zoom of [0.5, 1, 1.5]) {
  test(`uploaded image moves with Frame and restores at ${zoom * 100}% zoom`, async ({ page }) => {
    await openBoard(page);
    await setZoom(page, zoom);
    await uploadImage(page, 200, 150);
    await collapsePanels(page);
    const img = await imageBox(page);
    await drawAround(page, img);
    await moveFrame(page, await frameBox(page));
    const moved = await frameCanvasBox(page);
    const imageBefore = await imageCanvasBox(page);
    await reloadBoard(page);
    await expect.poll(async () => page.evaluate(() =>
      (window as unknown as { Konva: { stages: { find(q: string): unknown[] }[] } }).Konva.stages[0].find('Image').length)).toBe(1);
    const after = await frameCanvasBox(page);
    const imageAfter = await imageCanvasBox(page);
    expect(after.x).toBeCloseTo(moved.x, 0);
    expect(imageAfter.x - after.x).toBeCloseTo(imageBefore.x - moved.x, 0);
    expect(imageAfter.y - after.y).toBeCloseTo(imageBefore.y - moved.y, 0);
  });
  }

  test('Create node moves and restores with its Frame', async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);
    const [node] = await panelBoxes(page);
    await drawAround(page, node);
    await moveFrame(page, await frameBox(page));
    const before = await frameBox(page);
    const [panelBefore] = await panelBoxes(page);
    await reloadBoard(page);
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
    await reloadBoard(page);
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
