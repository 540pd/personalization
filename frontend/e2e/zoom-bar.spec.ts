import { test, expect, type Page } from "@playwright/test";
import { openBoard, setZoom } from "./helpers";

// #204: the zoom bar shows beside the expanded rail too, follows the rail as
// it toggles, and never overlaps the rail or the dock.

const SIDEBAR_WIDTH = 200;
const RAIL_WIDTH = 64;
const EDGE = 24;

type Rect = { x: number; y: number; width: number; height: number };
const rect = async (page: Page, sel: string): Promise<Rect> => (await page.locator(sel).first().boundingBox())!;
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function withRail(page: Page, collapsed: boolean) {
  await openBoard(page);
  await page.evaluate((c) => localStorage.setItem("gcos-sidebar-collapsed", String(c)), collapsed);
  await openBoard(page);
}

test.describe("zoom bar beside the rail (#204)", () => {
  test("expanded: 24px from the rail's edge and from the bottom", async ({ page }) => {
    await withRail(page, false);
    const bar = await rect(page, ".minimap-container");
    const vh = page.viewportSize()!.height;
    expect(Math.round(bar.x)).toBe(SIDEBAR_WIDTH + EDGE);
    expect(Math.round(vh - (bar.y + bar.height))).toBe(EDGE);
  });

  test("minimized: as before", async ({ page }) => {
    await withRail(page, true);
    const bar = await rect(page, ".minimap-container");
    expect(Math.round(bar.x)).toBe(RAIL_WIDTH + EDGE);
  });

  test("follows the rail on every toggle, never under it mid-way", async ({ page }) => {
    await withRail(page, false);
    for (let i = 0; i < 4; i++) {
      await page.locator(".sidebar-collapse-button").click();
      // Sample through the 150 ms transition: the bar's left edge stays at
      // least the gap clear of the rail's right edge the whole way.
      const gaps: number[] = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const out: number[] = [];
            const t0 = performance.now();
            const tick = () => {
              const rail = document.querySelector(".sidebar")!.getBoundingClientRect();
              const bar = document.querySelector(".minimap-container")!.getBoundingClientRect();
              out.push(bar.left - rail.right);
              if (performance.now() - t0 < 260) requestAnimationFrame(tick);
              else resolve(out);
            };
            tick();
          }),
      );
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(EDGE - 2);
      const collapsed = i % 2 === 0;
      const bar = await rect(page, ".minimap-container");
      expect(Math.round(bar.x)).toBe((collapsed ? RAIL_WIDTH : SIDEBAR_WIDTH) + EDGE);
    }
  });

  test("the zoom menu and the map open in both rail states", async ({ page }) => {
    for (const collapsed of [false, true]) {
      await withRail(page, collapsed);
      await page.locator(".minimap-zoom-percentage").click();
      await expect(page.locator(".minimap-zoom-menu")).toBeVisible();
      const menu = await rect(page, ".minimap-zoom-menu");
      const bar = await rect(page, ".minimap-container");
      expect(Math.round(menu.x)).toBe(Math.round(bar.x));
      expect(menu.y + menu.height).toBeLessThanOrEqual(bar.y + 1);
      await page.locator(".minimap-zoom-percentage").click();

      await page.locator(".minimap-toggle-button").click();
      await expect(page.locator(".minimap-canvas")).toBeVisible();
      await page.locator(".minimap-toggle-button").click();
    }
  });

  for (const width of [900, 1100, 1280, 1600]) {
    test(`at ${width}px wide it clears the dock and the rail, map open or not`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const collapsed of [false, true]) {
        await withRail(page, collapsed);
        for (const mapOpen of [false, true]) {
          if (mapOpen) await page.locator(".minimap-toggle-button").click();
          await page.waitForTimeout(250);
          const bar = await rect(page, ".minimap-container");
          expect(overlaps(bar, await rect(page, ".floating-dock")), `rail ${collapsed ? "min" : "max"}, map ${mapOpen}`).toBe(false);
          expect(overlaps(bar, await rect(page, ".sidebar"))).toBe(false);
        }
      }
    });
  }

  test("at 50% and 150% zoom the bar still clears the dock", async ({ page }) => {
    await page.setViewportSize({ width: 1240, height: 800 });
    await withRail(page, false);
    await page.locator(".minimap-toggle-button").click();
    for (const z of [0.5, 1.5, 1]) {
      await setZoom(page, z);
      const bar = await rect(page, ".minimap-container");
      expect(overlaps(bar, await rect(page, ".floating-dock")), `zoom ${z}`).toBe(false);
      expect(Math.round(bar.x)).toBe(SIDEBAR_WIDTH + EDGE);
    }
  });

  test("sits at the bottom when there is room beside the dock", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 800 });
    await withRail(page, false);
    const bar = await rect(page, ".minimap-container");
    expect(Math.round(800 - (bar.y + bar.height))).toBe(EDGE);
  });

  test("reduced motion: no transition", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await withRail(page, false);
    const duration = await page.locator(".minimap-container").evaluate((e) => getComputedStyle(e).transitionDuration);
    expect(duration.split(",").every((d) => parseFloat(d) === 0)).toBe(true);
    await page.locator(".sidebar-collapse-button").click();
    const bar = await rect(page, ".minimap-container");
    expect(Math.round(bar.x)).toBe(RAIL_WIDTH + EDGE);
  });

  test("keyboard and wheel zoom with the rail expanded", async ({ page }) => {
    await withRail(page, false);
    const percent = page.locator(".minimap-zoom-percentage");
    await expect(percent).toHaveText("100%");
    await page.keyboard.press("Control+Equal");
    await expect(percent).not.toHaveText("100%");
    await page.keyboard.press("Shift+Digit0");
    await expect(percent).toHaveText("100%");
    await page.mouse.move(700, 400);
    await page.mouse.wheel(0, 240);
    await expect(percent).not.toHaveText("100%");
  });
});
