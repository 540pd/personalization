import { test, expect } from "@playwright/test";
import { openBoard, addPanel, uploadImage, imageBox, setZoom } from "./helpers";

const SIDEBAR_WIDTH = 260;

/** Where a newly created node's centre sits, in screen px. */
async function newNodeCentre(page: import("@playwright/test").Page) {
  const box = await page.locator("button.node-panel-placeholder").first().boundingBox();
  return box!.x + box!.width / 2;
}

test.describe("sidebar", () => {
  test("renders the three zones from the reference", async ({ page }) => {
    await openBoard(page);
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".sidebar-product")).toContainText("Studio");
    await expect(page.locator(".sidebar-product")).toContainText("PlaySpace");
    // The brand label was dropped; the nav starts straight at the items.
    await expect(page.locator(".sidebar-brand-label")).toHaveCount(0);
    await expect(page.locator(".sidebar-item")).toHaveCount(3);
    await expect(page.locator(".sidebar-support")).toBeVisible();
  });

  test("marks exactly one destination active, and moves it on click", async ({ page }) => {
    await openBoard(page);
    await expect(page.locator(".sidebar-item-active")).toHaveCount(1);
    await expect(page.locator(".sidebar-item-active")).toContainText("Playspace");

    await page.locator(".sidebar-item", { hasText: "Production" }).click();
    await expect(page.locator(".sidebar-item-active")).toHaveCount(1);
    await expect(page.locator(".sidebar-item-active")).toContainText("Production");
  });

  test("collapses and reopens", async ({ page }) => {
    await openBoard(page);
    await page.locator(".sidebar-collapse-button").click();
    await expect(page.locator(".sidebar")).toHaveCount(0);
    await expect(page.locator(".sidebar-reopen")).toBeVisible();

    await page.locator(".sidebar-reopen").click();
    await expect(page.locator(".sidebar")).toBeVisible();
  });

  // The real risk. Six places worked out a centre from window.innerWidth and
  // would quietly place things behind the rail.
  test.describe("the canvas knows the rail is there", () => {
    test("a new node is centred on the canvas, not the window", async ({ page }) => {
      await openBoard(page);
      await addPanel(page);

      const withRail = await newNodeCentre(page);
      const windowCentre = await page.evaluate(() => window.innerWidth / 2);

      // Centred on the visible span, so half a rail to the right of the
      // window's middle — and clear of the rail either way.
      expect(withRail).toBeGreaterThan(SIDEBAR_WIDTH);
      expect(withRail - windowCentre).toBeGreaterThan(SIDEBAR_WIDTH / 2 - 40);
      expect(withRail - windowCentre).toBeLessThan(SIDEBAR_WIDTH / 2 + 40);
    });

    test("collapsing the rail moves the centre back", async ({ page }) => {
      await openBoard(page);
      await page.locator(".sidebar-collapse-button").click();
      await addPanel(page);

      const centre = await newNodeCentre(page);
      const windowCentre = await page.evaluate(() => window.innerWidth / 2);
      expect(Math.abs(centre - windowCentre)).toBeLessThan(40);
    });

    test("an uploaded image lands clear of the rail", async ({ page }) => {
      await openBoard(page);
      await uploadImage(page, 1600, 900);
      const box = await imageBox(page);
      expect(box.x).toBeGreaterThan(SIDEBAR_WIDTH);
    });

    test("the dock is centred on the canvas", async ({ page }) => {
      await openBoard(page);
      const dock = await page.locator(".floating-dock-wrapper").boundingBox();
      const centre = dock!.x + dock!.width / 2;
      const expected = await page.evaluate(
        (w) => w + (window.innerWidth - w) / 2,
        SIDEBAR_WIDTH
      );
      expect(Math.abs(centre - expected)).toBeLessThan(2);
    });

    test("the minimap is hidden while the rail is open, and returns with it", async ({ page }) => {
      // Both want the bottom-left corner. Hiding beats shifting it sideways
      // on every toggle.
      await openBoard(page);
      await expect(page.locator(".minimap-container")).toHaveCount(0);

      await page.locator(".sidebar-collapse-button").click();
      await expect(page.locator(".minimap-container")).toBeVisible();
      const map = await page.locator(".minimap-container").boundingBox();
      expect(map!.x).toBeLessThan(SIDEBAR_WIDTH);
    });

    test("zoom shortcuts still work while the panel is hidden", async ({ page }) => {
      // The reason hiding is acceptable at all. If the component unmounted,
      // its keydown listener would go with it and this would fail.
      await openBoard(page);
      await expect(page.locator(".minimap-container")).toHaveCount(0);

      await setZoom(page, 0.5);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scale = () => page.evaluate(() => (window as any).Konva.stages[0].scaleX() as number);
      expect(await scale()).toBeLessThan(0.9);

      await page.keyboard.press("Shift+Digit0");
      await page.waitForTimeout(200);
      expect(await scale()).toBeCloseTo(1, 2);
    });
  });

  test("the user menu is absent while nobody is signed in", async ({ page }) => {
    // Anonymous mode is the only signed-out state once IAP is in front, so
    // the footer says so rather than offering a sign-in that does nothing.
    await openBoard(page);
    await expect(page.locator(".sidebar-identity-anonymous")).toBeVisible();
    await expect(page.locator(".sidebar-user-menu")).toHaveCount(0);
  });
});
