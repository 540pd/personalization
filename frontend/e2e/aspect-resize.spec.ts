import { test, expect, type Page } from "@playwright/test";
import { openBoard, addPanel, collapsePanels, panelBoxes } from "./helpers";

// #129: changing a Create node's aspect ratio keeps its top-left fixed, and a
// Frame that held the node grows so it still does.

const frameBtn = (page: Page) => page.locator('.floating-dock button[aria-pressed]').nth(3);

async function drawFrame(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
  await page.mouse.move(x2, y2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

/** The one frame's rect in screen px. */
const frameBox = (page: Page) =>
  page.evaluate(() => {
    type R = { getClientRect(): { x: number; y: number; width: number; height: number } };
    const stages = (window as unknown as { Konva: { stages: { find(s: string): R[] }[] } }).Konva.stages;
    const r = stages.flatMap((s) => s.find(".frame"))[0].getClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  });

const node = async (page: Page) => {
  const b = (await panelBoxes(page))[0];
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) };
};

const inside = (o: { x: number; y: number; w: number; h: number }, i: typeof o) =>
  i.x >= o.x && i.y >= o.y && i.x + i.w <= o.x + o.w && i.y + i.h <= o.y + o.h;

/** One click selects a node, the second opens its form. */
async function openForm(page: Page, b: { x: number; y: number; w: number; h: number }) {
  for (let i = 0; i < 2; i++) {
    await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
    await page.waitForTimeout(300);
  }
}

async function setRatio(page: Page, ratio: string) {
  await openForm(page, await node(page));
  await page.getByLabel("Aspect ratio").selectOption(ratio);
  await page.waitForTimeout(300);
  await collapsePanels(page);
}

/** A 16:9 Create node with a Frame drawn snugly around it. */
async function nodeInFrame(page: Page) {
  await openBoard(page);
  await addPanel(page);
  await collapsePanels(page);
  const n = await node(page);
  await frameBtn(page).click();
  await drawFrame(page, n.x - 30, n.y - 30, n.x + n.w + 30, n.y + n.h + 30);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  return { n, f: await frameBox(page) };
}

test.describe("aspect ratio change", () => {
  test("keeps the top-left fixed and grows down, not up", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);
    const before = await node(page);

    await setRatio(page, "9:16");
    const after = await node(page);
    expect(after.h).toBeGreaterThan(before.h);
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
  });

  test("grows the Frame that held the node, which then carries it", async ({ page }) => {
    const { f } = await nodeInFrame(page);
    await setRatio(page, "9:16");

    const grown = await frameBox(page);
    const n = await node(page);
    expect(inside(grown, n)).toBe(true);
    expect(grown.h).toBeGreaterThan(f.h);
    // Only the side the node overflowed moves.
    expect(grown.x).toBe(f.x);
    expect(grown.y).toBe(f.y);

    // Drag the Frame by its bare top margin: the node goes with it.
    await page.mouse.move(grown.x + 10, grown.y + 10);
    await page.mouse.down();
    await page.mouse.move(grown.x + 90, grown.y + 50, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const moved = await node(page);
    expect(moved.x - n.x).toBe(80);
    expect(moved.y - n.y).toBe(40);
  });

  test("a shrink leaves the Frame as it is", async ({ page }) => {
    // 1:1 first, then a Frame snug around it, then 16:9: same width, shorter.
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);
    await setRatio(page, "1:1");
    const tall = await node(page);
    await frameBtn(page).click();
    await drawFrame(page, tall.x - 30, tall.y - 30, tall.x + tall.w + 30, tall.y + tall.h + 30);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    const f = await frameBox(page);

    await setRatio(page, "16:9");
    const n = await node(page);
    expect(n.h).toBeLessThan(tall.h);
    expect(n.y).toBe(tall.y);
    expect(await frameBox(page)).toEqual(f);
    expect(inside(f, n)).toBe(true);
  });

  test("one undo restores the node's size and place, the Frame, and the setting", async ({ page }) => {
    const { n, f } = await nodeInFrame(page);
    await setRatio(page, "9:16");
    expect((await node(page)).h).toBeGreaterThan(n.h);

    await page.keyboard.press("Control+z");
    await page.waitForTimeout(500);
    expect(await node(page)).toEqual(n);
    expect(await frameBox(page)).toEqual(f);

    // The form follows the undo, rather than still showing 9:16.
    await openForm(page, n);
    await expect(page.getByLabel("Aspect ratio")).toHaveValue("16:9");
    await collapsePanels(page);

    await page.keyboard.press("Control+y");
    await page.waitForTimeout(500);
    expect((await node(page)).h).toBeGreaterThan(n.h);
    expect(inside(await frameBox(page), await node(page))).toBe(true);
  });

  test("a node outside any Frame leaves Frames alone", async ({ page }) => {
    await openBoard(page);
    await frameBtn(page).click();
    await drawFrame(page, 260, 60, 460, 200);
    await page.keyboard.press("Escape");
    const f = await frameBox(page);
    await addPanel(page);
    await collapsePanels(page);
    await setRatio(page, "9:16");
    expect(await frameBox(page)).toEqual(f);
  });
});
