import { test, expect } from "@playwright/test";
import { openBoard, uploadImage, addPanel, setZoom, imageBox, collapseSidebar } from "./helpers";

// UTIL-01. These assert the two things that were measurably broken: the map
// drew no objects at all, and the viewport indicator outgrew the map as soon
// as you zoomed out.

async function openMinimap(page: import("@playwright/test").Page) {
  await collapseSidebar(page);
  await page.locator(".minimap-toggle-button").click();
  await expect(page.locator("svg.minimap-canvas")).toBeVisible();
}

/** Indicator box relative to the map box, in px. Positive = sticking out. */
async function indicatorSpill(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const el = document.querySelector(".minimap-viewport-indicator") as SVGElement | null;
    const map = document.querySelector("svg.minimap-canvas") as SVGElement | null;
    if (!el || !map) return null;
    const r = el.getBoundingClientRect();
    const m = map.getBoundingClientRect();
    return {
      left: Math.round(m.left - r.left),
      top: Math.round(m.top - r.top),
      right: Math.round(r.right - m.right),
      bottom: Math.round(r.bottom - m.bottom),
    };
  });
}

test.describe("minimap", () => {
  test("draws one shape per canvas object", async ({ page }) => {
    await openBoard(page);
    await openMinimap(page);
    await expect(page.locator(".minimap-object")).toHaveCount(0);

    await uploadImage(page, 1600, 900);
    await expect(page.locator(".minimap-object")).toHaveCount(1);

    await addPanel(page);
    await expect(page.locator(".minimap-object")).toHaveCount(2);
  });

  test("drops a shape when its node is deleted", async ({ page }) => {
    await openBoard(page);
    await openMinimap(page);
    await uploadImage(page, 1600, 900);
    await expect(page.locator(".minimap-object")).toHaveCount(1);

    const box = await imageBox(page);
    await page.mouse.click(box.x + 40, box.y + 40);
    await page.waitForTimeout(300);
    await page.keyboard.press("Delete");
    await expect(page.locator(".minimap-object")).toHaveCount(0);
  });

  // The regression. Measured against the old fixed 4000x3000 world on a
  // 200x130 map: 269x131 at 25% zoom and 579x282 at 10%, clipped by
  // overflow-hidden so the map simply turned solid blue.
  for (const z of [1, 0.5, 0.25, 0.1]) {
    test(`viewport indicator stays inside the map at ${z * 100}% zoom`, async ({ page }) => {
      await openBoard(page);
      await openMinimap(page);
      await setZoom(page, z);

      const spill = await indicatorSpill(page);
      expect(spill).not.toBeNull();
      // 1px of tolerance for subpixel rounding on the SVG transform.
      expect(spill!.left).toBeLessThanOrEqual(1);
      expect(spill!.top).toBeLessThanOrEqual(1);
      expect(spill!.right).toBeLessThanOrEqual(1);
      expect(spill!.bottom).toBeLessThanOrEqual(1);
    });
  }

  test("keeps a far-away node on the map rather than off its edge", async ({ page }) => {
    // The old world was a fixed box centred on the origin, so a node dragged
    // past its edge stopped existing as far as the minimap was concerned.
    await openBoard(page);
    await openMinimap(page);
    await uploadImage(page, 1600, 900);

    const nodeX = () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      page.evaluate(() => (window as any).Konva.stages[0].find("Image")[0].x() as number);

    // Zoom out first: at 1:1 the node cannot be dragged past the window edge,
    // so it stalls around x=1310 -- inside the old world, proving nothing. At
    // 25% the same 400px gesture covers 1600 canvas units.
    await setZoom(page, 0.25);

    for (let i = 0; i < 10 && (await nodeX()) < 2500; i++) {
      const box = await imageBox(page);
      // Grab the centre, not a fixed inset: at 25% the node is only ~65px
      // wide on screen, so +40,+40 lands outside it and the drag never starts.
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 300, cy + 200, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(150);
    }

    // Assert the setup actually happened. Without this the test passes while
    // proving nothing: a first attempt moved the node only 800 units, well
    // inside the old +/-2000 world, so it stayed green against the very bug
    // it was written to catch.
    expect(await nodeX()).toBeGreaterThan(2500);

    const inside = await page.evaluate(() => {
      const rect = document.querySelector(".minimap-object") as SVGElement | null;
      const map = document.querySelector("svg.minimap-canvas") as SVGElement | null;
      if (!rect || !map) return null;
      const r = rect.getBoundingClientRect();
      const m = map.getBoundingClientRect();
      return r.left >= m.left - 1 && r.right <= m.right + 1 && r.top >= m.top - 1 && r.bottom <= m.bottom + 1;
    });
    expect(inside).toBe(true);
  });

  test("clicking the map recentres the viewport", async ({ page }) => {
    await openBoard(page);
    await openMinimap(page);

    const before = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (window as any).Konva.stages[0];
      return { x: s.x(), y: s.y() };
    });

    const map = await page.locator("svg.minimap-canvas").boundingBox();
    await page.mouse.click(map!.x + map!.width * 0.8, map!.y + map!.height * 0.8);

    const after = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (window as any).Konva.stages[0];
      return { x: s.x(), y: s.y() };
    });
    expect(after).not.toEqual(before);
  });
});

// The zoom menu advertised five shortcuts. Two were not implemented, one
// could not fire, and "Zoom to fit" was a second copy of "Zoom to 100%".
test.describe("zoom shortcuts", () => {
  const scale = (page: import("@playwright/test").Page) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    page.evaluate(() => (window as any).Konva.stages[0].scaleX() as number);

  test("Shift+0 returns to 100%", async ({ page }) => {
    // Could never fire: with Shift held e.key is ")", and the handler tested
    // e.key === "0".
    await openBoard(page);
    await setZoom(page, 0.5);
    expect(await scale(page)).toBeLessThan(0.9);

    await page.keyboard.press("Shift+Digit0");
    await page.waitForTimeout(200);
    expect(await scale(page)).toBeCloseTo(1, 2);
  });

  test("Shift+1 fits the board, and is not just a reset", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 1600, 900);

    // Push the node well away from the origin so a reset and a fit cannot
    // coincide by luck.
    await setZoom(page, 0.25);
    for (let i = 0; i < 4; i++) {
      const box = await imageBox(page);
      await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.w / 2 + 300, box.y + box.h / 2 + 200, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(150);
    }

    await page.keyboard.press("Shift+Digit1");
    await page.waitForTimeout(250);

    // The node is on screen afterwards — the thing "fit" is supposed to mean.
    const onScreen = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (window as any).Konva.stages[0];
      const n = s.find("Image")[0];
      const left = s.x() + n.x() * s.scaleX();
      const top = s.y() + n.y() * s.scaleY();
      const w = n.width() * n.scaleX() * s.scaleX();
      const h = n.height() * n.scaleY() * s.scaleY();
      return left >= 0 && top >= 0 && left + w <= window.innerWidth && top + h <= window.innerHeight;
    });
    expect(onScreen).toBe(true);
    expect(await scale(page)).not.toBeCloseTo(1, 3);
  });

  test("Shift+2 fits the selection", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 1600, 900);
    await setZoom(page, 0.2);

    const box = await imageBox(page);
    await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
    await page.waitForTimeout(200);

    await page.keyboard.press("Shift+Digit2");
    await page.waitForTimeout(250);
    // Zoomed in on one small node, so well past where we started.
    expect(await scale(page)).toBeGreaterThan(0.5);
  });

  test("Shift+2 does nothing with no selection", async ({ page }) => {
    await openBoard(page);
    await setZoom(page, 0.5);
    const before = await scale(page);
    await page.keyboard.press("Shift+Digit2");
    await page.waitForTimeout(200);
    expect(await scale(page)).toBeCloseTo(before, 5);
  });

  test("zoom to selection is disabled until something is selected", async ({ page }) => {
    await openBoard(page);
    await collapseSidebar(page);
    await page.locator(".minimap-zoom-percentage").click();
    const item = page.locator(".minimap-zoom-menu-item", { hasText: "Zoom to selection" });
    await expect(item).toBeDisabled();
  });

  test("shortcuts stay inert while typing", async ({ page }) => {
    // Ctrl+– in a prompt field used to zoom the canvas instead of reaching
    // the text. Board guards its keys this way; the minimap did not.
    await openBoard(page);
    await addPanel(page);
    const before = await scale(page);

    const field = page.locator("textarea").first();
    await field.fill("a prompt");
    await field.press("ControlOrMeta+Minus");
    await page.waitForTimeout(200);
    expect(await scale(page)).toBeCloseTo(before, 5);
    await expect(field).toHaveValue("a prompt");

    // Shift+1 is "!", so the field gaining a character is the guard working:
    // the keystroke reached the text instead of being eaten as a shortcut.
    await field.press("Shift+Digit1");
    await page.waitForTimeout(200);
    expect(await scale(page)).toBeCloseTo(before, 5);
    await expect(field).toHaveValue("a prompt!");
  });
});
