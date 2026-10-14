import { test, expect, type Page } from "@playwright/test";
import {
  openBoard, uploadImage, imageBox, addPanel, collapsePanels, panelBoxes,
  tagPanels, panelByBorn, dragFrom, topmostPanelAt, setZoom,
} from "./helpers";

// #106: selecting a node brings it to the front of whatever it overlaps, so
// its whole content and its handles show. Before, only a drag raised a node.

type Box = { x: number; y: number; w: number; h: number };

/** Paint order of the uploaded images, by their names, back to front. */
const imageOrder = (page: Page) =>
  page.evaluate(() => {
    type N = { id(): string; zIndex(): number };
    const st = (window as unknown as { Konva: { stages: { find(q: string): N[] }[] } }).Konva.stages[0];
    return st.find("Image").sort((a, b) => a.zIndex() - b.zIndex()).map((n) => n.id());
  });

/** Which of the canvas and the Create-node layer paints in front. */
const frontLayer = (page: Page) =>
  page.evaluate(() => {
    let host = document.querySelector("canvas")?.parentElement as HTMLElement | null;
    while (host && getComputedStyle(host).zIndex === "auto") host = host.parentElement;
    const panel = document.querySelector("button.node-panel-placeholder") as HTMLElement;
    return Number(getComputedStyle(host!).zIndex) > Number(getComputedStyle(panel).zIndex) ? "canvas" : "dom";
  });

const handles = (page: Page) =>
  page.evaluate(() => (window as any).Konva.stages[0].findOne("Transformer")?.nodes().length ?? 0);

/** Two uploaded images, the second dragged so it overlaps the first's right half. */
async function twoOverlappingImages(page: Page, zoomTo?: number) {
  await openBoard(page);
  // Before any image is dragged, so the wheel reaches the board.
  if (zoomTo) await setZoom(page, zoomTo);
  await uploadImage(page, 200, 150, "back.png");
  const back = await imageBox(page, 0);
  // Park the first one to the left so the second lands clear of it.
  await dragFrom(page, back.x + back.w / 2, back.y + back.h / 2, -220, 0);
  await uploadImage(page, 200, 150, "front.png");
  const a = await imageBox(page, 0);
  const b = await imageBox(page, 1);
  // Second image over the right half of the first.
  await dragFrom(page, b.x + b.w / 2, b.y + b.h / 2, a.x + a.w / 2 - b.x, a.y - b.y);
  await page.mouse.click(1100, 650);
  await page.waitForTimeout(300);
  return { a: await imageBox(page, 0) };
}

test.describe("selecting brings a node to the front", () => {
  test("an uploaded image behind another comes forward when clicked", async ({ page }) => {
    const { a } = await twoOverlappingImages(page);
    const [backId, frontId] = await imageOrder(page);

    // Its exposed left edge.
    await page.mouse.click(a.x + 20, a.y + a.h / 2);
    await page.waitForTimeout(300);
    expect(await handles(page)).toBe(1);
    expect(await imageOrder(page)).toEqual([frontId, backId]);
  });

  test("a Create node behind an uploaded image comes forward when clicked", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);
    const [p] = await panelBoxes(page);
    await uploadImage(page, 1600, 900);
    const img = await imageBox(page);
    // Cover the node's right half; its left edge stays clickable.
    await dragFrom(page, img.x + img.w / 2, img.y + img.h / 2, p.x + p.w * 0.6 + img.w / 2 - (img.x + img.w / 2) - img.w / 2 + p.w / 2, p.y + p.h / 2 - (img.y + img.h / 2));
    await page.mouse.click(1240, 690);
    await page.waitForTimeout(300);
    expect(await frontLayer(page)).toBe("canvas");

    await page.mouse.click(p.x + 15, p.y + p.h / 2);
    await page.waitForTimeout(300);
    expect(await frontLayer(page)).toBe("dom");
  });

  test("and an image partly under a Create node comes forward over it", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 300, 200);
    await addPanel(page);
    await collapsePanels(page);
    // The node was created last, so it is in front of the image.
    expect(await frontLayer(page)).toBe("dom");
    const img = await imageBox(page);
    const [p] = await panelBoxes(page);
    // Click a part of the image the node does not cover.
    const spot = img.x < p.x ? { x: img.x + 10, y: img.y + 10 } : { x: img.x + img.w - 10, y: img.y + img.h - 10 };
    await page.mouse.click(spot.x, spot.y);
    await page.waitForTimeout(300);
    expect(await handles(page)).toBe(1);
    expect(await frontLayer(page)).toBe("canvas");
  });

  test("a Create node behind another comes forward, and the other goes back when it is clicked", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);
    await addPanel(page);
    await collapsePanels(page);
    await tagPanels(page);
    const first = await panelByBorn(page, "0");
    const second = await panelByBorn(page, "1");
    // Second over the first's right half.
    await dragFrom(page, second.x + second.w / 2, second.y + second.h / 2, first.x + first.w * 0.5 - second.x, first.y - second.y);
    await page.mouse.click(1240, 690);
    await page.waitForTimeout(300);
    const f = await panelByBorn(page, "0");
    const overlap = { x: f.x + f.w * 0.75, y: f.y + f.h / 2 };
    expect(await topmostPanelAt(page, overlap.x, overlap.y)).toBe("1");

    await page.mouse.click(f.x + 15, f.y + f.h / 2);
    await page.waitForTimeout(300);
    expect(await topmostPanelAt(page, overlap.x, overlap.y)).toBe("0");

    const s = await panelByBorn(page, "1");
    await page.mouse.click(s.x + s.w - 15, s.y + s.h / 2);
    await page.waitForTimeout(300);
    expect(await topmostPanelAt(page, overlap.x, overlap.y)).toBe("1");
  });

  for (const z of [0.5, 1.5]) {
    test(`at ${z * 100}% zoom a clicked image still comes forward`, async ({ page }) => {
      const { a } = await twoOverlappingImages(page, z);
      const [backId, frontId] = await imageOrder(page);
      await page.mouse.click(a.x + 8, a.y + a.h / 2);
      await page.waitForTimeout(300);
      expect(await handles(page)).toBe(1);
      expect(await imageOrder(page)).toEqual([frontId, backId]);
    });
  }

  test("Ctrl+A selects everything without reordering anything", async ({ page }) => {
    await twoOverlappingImages(page);
    const before = await imageOrder(page);
    await page.keyboard.press("Control+a");
    await page.waitForTimeout(300);
    expect(await imageOrder(page)).toEqual(before);
  });

  test("Shift+click adds a node and brings it forward; Shift+click to drop it leaves the order", async ({ page }) => {
    const { a } = await twoOverlappingImages(page);
    const [backId, frontId] = await imageOrder(page);
    // Select the front one first, then Shift+click the back one in.
    const b = await imageBox(page, 1);
    await page.mouse.click(b.x + b.w - 20, b.y + b.h / 2);
    await page.waitForTimeout(200);
    await page.keyboard.down("Shift");
    await page.mouse.click(a.x + 20, a.y + a.h / 2);
    await page.waitForTimeout(200);
    expect(await handles(page)).toBe(2);
    expect(await imageOrder(page)).toEqual([frontId, backId]);
    // Shift+click it again: dropped from the selection, order unchanged.
    await page.mouse.click(a.x + 20, a.y + a.h / 2);
    await page.keyboard.up("Shift");
    await page.waitForTimeout(200);
    expect(await handles(page)).toBe(1);
    expect(await imageOrder(page)).toEqual([frontId, backId]);
  });

  test("a selected node still drags, and its name and handles follow", async ({ page }) => {
    const { a } = await twoOverlappingImages(page);
    await page.mouse.click(a.x + 20, a.y + a.h / 2);
    await page.waitForTimeout(200);
    await dragFrom(page, a.x + 20, a.y + a.h / 2, 0, 160);
    // By position, not index: imageBox indexes by paint order, which is
    // exactly what selecting just changed.
    const boxes: Box[] = [await imageBox(page, 0), await imageBox(page, 1)];
    const moved = boxes.find((bx) => Math.abs(bx.x - a.x) < 2)!;
    expect(Math.round(moved.y - a.y)).toBe(160);
    expect(await handles(page)).toBe(1);
    await expect(page.locator('div[title="back"]')).toHaveCount(1);
  });
});
