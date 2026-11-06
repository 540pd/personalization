import { test, expect, type Page } from "@playwright/test";
import { openBoard, addPanel, collapsePanels, panelBoxes, reloadBoard, setZoom, uploadImage } from "./helpers";

// Drawn shapes on a canvas of their own (#430): always behind the Create
// nodes, images and text, whatever was touched last; their selection handles
// on a canvas over the nodes, so a covered corner still resizes.

const shapesBtn = (page: Page) => page.getByRole("button", { name: "Shapes", exact: true });
const menuItem = (page: Page, label: string) =>
  page.locator(".floating-dock-submenu button").filter({
    has: page.locator("span", { hasText: new RegExp(`^${label}$`) }),
  });

async function drag(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
  await page.mouse.move(x2, y2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function draw(page: Page, kind: string, x1: number, y1: number, x2: number, y2: number) {
  await shapesBtn(page).click();
  await menuItem(page, kind).click();
  await drag(page, x1, y1, x2, y2);
}

/** Each board node's class and which of the stage's layers holds it: 0 shapes, 1 main. */
const layers = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).Konva.stages[0];
    const all = s.getLayers();
    return s.find(".selectable").map((n: any) => ({ cls: n.getClassName(), layer: all.indexOf(n.getLayer()) }));
  });

/** The z-index of each of the stage's canvases, and a Create node's. */
const zs = (page: Page) =>
  page.evaluate(() => {
    const z = (el: Element | null) => Number(getComputedStyle(el!).zIndex);
    return {
      shapes: z(document.querySelector('canvas[data-board-layer="shapes"]')),
      main: z(document.querySelector('canvas[data-board-layer="main"]')),
      chrome: z(document.querySelector('canvas[data-board-layer="chrome"]')),
      node: z(document.querySelector("button.node-panel-placeholder")),
    };
  });

/** What the browser hands a click at (x, y): the node, or which canvas. */
const target = (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    if (el?.closest("button.node-panel-placeholder")) return "node";
    return (el as HTMLElement | null)?.dataset?.boardLayer ?? el?.tagName ?? null;
  }, [x, y]);

const selectedCount = (page: Page) =>
  page.evaluate(() => (window as any).Konva.stages[0].findOne("Transformer").nodes().length);

const shapeSize = (page: Page) =>
  page.evaluate(() => {
    const n = (window as any).Konva.stages[0].find(".selectable").find((x: any) => x.getClassName() === "BoardShape");
    return { w: n.width() * n.scaleX(), h: n.height() * n.scaleY() };
  });

/**
 * A Create node, and a rectangle drawn from left of it to a third of the way
 * in: partly covered. Returns the node's box.
 */
async function shapeUnderNode(page: Page) {
  await addPanel(page);
  await collapsePanels(page);
  const [p] = await panelBoxes(page);
  await draw(page, "Rectangle", p.x - 140, p.y + 20, p.x + p.w / 3, p.y + p.h - 20);
  return p;
}

test.describe("shapes behind the Create nodes", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
  });

  test("a shape drawn across a Create node goes behind it, on its own canvas", async ({ page }) => {
    const p = await shapeUnderNode(page);
    expect(await layers(page)).toEqual([{ cls: "BoardShape", layer: 0 }]);
    const z = await zs(page);
    expect(z.shapes).toBeLessThan(z.node);
    expect(z.main).toBeLessThan(z.node);
    expect(await target(page, p.x + 20, p.y + p.h / 2)).toBe("node");
  });

  test("a click where a node covers the shape goes to the node", async ({ page }) => {
    const p = await shapeUnderNode(page);
    await page.mouse.click(5, 300);
    await page.mouse.click(p.x + 20, p.y + p.h / 2);
    expect(await selectedCount(page)).toBe(0);
  });

  test("selected, its handles show over the node and a covered corner resizes it", async ({ page }) => {
    const p = await shapeUnderNode(page);
    await page.mouse.click(5, 300);
    await page.mouse.click(p.x - 100, p.y + p.h / 2);
    expect(await selectedCount(page)).toBe(1);
    expect((await zs(page)).chrome).toBeGreaterThan((await zs(page)).node);

    const before = await shapeSize(page);
    // The bottom-right corner is under the node.
    const corner = { x: p.x + p.w / 3, y: p.y + p.h - 20 };
    await page.mouse.move(corner.x, corner.y);
    expect(await target(page, corner.x, corner.y)).toBe("chrome");
    await drag(page, corner.x, corner.y, corner.x + 40, corner.y + 10);
    const after = await shapeSize(page);
    expect(after.w).toBeGreaterThan(before.w + 30);
  });

  test("an image brings images forward over the node, never the shape", async ({ page }) => {
    await shapeUnderNode(page);
    await uploadImage(page, 300, 200);
    const z = await zs(page);
    expect(z.main).toBeGreaterThan(z.node);
    expect(z.shapes).toBeLessThan(z.node);
    expect(await layers(page)).toEqual([
      { cls: "BoardShape", layer: 0 },
      { cls: "Image", layer: 1 },
    ]);
  });

  test("lines and arrows go behind too", async ({ page }) => {
    await addPanel(page);
    await collapsePanels(page);
    const [p] = await panelBoxes(page);
    await draw(page, "Line", p.x - 100, p.y + 30, p.x + 60, p.y + 30);
    await draw(page, "Arrow", p.x - 100, p.y + 60, p.x + 60, p.y + 60);
    expect((await layers(page)).map((n: { layer: number }) => n.layer)).toEqual([0, 0]);
    expect(await target(page, p.x + 30, p.y + 30)).toBe("node");
  });

  test("select all, delete and undo; copy and paste; reload: each node keeps its layer", async ({ page }) => {
    const p = await shapeUnderNode(page);
    await uploadImage(page, 300, 200);

    await page.keyboard.press("Control+a");
    expect(await selectedCount(page)).toBe(2);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(250);
    expect(await layers(page)).toEqual([]);
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(250);
    expect(await layers(page)).toEqual([
      { cls: "BoardShape", layer: 0 },
      { cls: "Image", layer: 1 },
    ]);

    await page.mouse.click(5, 300);
    await page.mouse.click(p.x - 100, p.y + p.h / 2);
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await page.waitForTimeout(250);
    expect((await layers(page)).filter((n: { cls: string }) => n.cls === "BoardShape").map((n: { layer: number }) => n.layer)).toEqual([0, 0]);
    // A pasted shape alone doesn't bring the canvas forward.
    const z = await zs(page);
    expect(z.shapes).toBeLessThan(z.node);

    await reloadBoard(page, { shapes: 3, panels: 1 });
    expect((await layers(page)).map((n: { layer: number }) => n.layer).sort()).toEqual([0, 0, 1]);
  });
});

test.describe("shapes behind the Create nodes, zoomed", () => {
  for (const z of [0.5, 1.5]) {
    test(`at ${z * 100}%`, async ({ page }) => {
      await openBoard(page);
      await setZoom(page, z);
      const p = await shapeUnderNode(page);
      expect(await target(page, p.x + 10, p.y + p.h / 2)).toBe("node");
      await page.mouse.click(5, 300);
      await page.mouse.click(p.x - 40, p.y + p.h / 2);
      expect(await selectedCount(page)).toBe(1);
    });
  }
});
