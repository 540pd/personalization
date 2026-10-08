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
    await expect(page.locator(".sidebar-item")).toHaveCount(5);
    await expect(page.locator(".sidebar-support")).toBeVisible();
  });

  test("marks exactly one destination active", async ({ page }) => {
    await openBoard(page);
    await expect(page.locator(".sidebar-item-active")).toHaveCount(1);
    await expect(page.locator(".sidebar-item-active")).toContainText("Playspace");
  });

  test("only Playspace is clickable; the rest are placeholders", async ({ page }) => {
    await openBoard(page);
    await expect(page.locator(".sidebar-item", { hasText: "Playspace" })).toBeEnabled();

    for (const label of ["Assets", "Skills", "Agents", "Usage"]) {
      await expect(page.locator(".sidebar-item", { hasText: label })).toBeDisabled();
    }
    await expect(page.locator(".sidebar-item-unavailable")).toHaveCount(4);
  });

  test("a placeholder cannot steal the active state", async ({ page }) => {
    // force: true bypasses actionability, so this presses the element even
    // though it is disabled -- otherwise the test passes because Playwright
    // declined to click, not because the app refused.
    await openBoard(page);
    await page.locator(".sidebar-item", { hasText: "Assets" }).click({ force: true });
    await expect(page.locator(".sidebar-item-active")).toContainText("Playspace");
  });

  test("placeholders are out of the tab order", async ({ page }) => {
    await openBoard(page);
    const focusable = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar-item")).filter(
          (b) => !b.disabled
        ).length
    );
    expect(focusable).toBe(1);
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

    test("the dock does not move when the rail toggles", async ({ page }) => {
      // Deliberately pinned to the window, unlike node placement. A tool
      // palette that slides sideways on an unrelated action costs more in
      // muscle memory than being exactly centred over the canvas gains.
      await openBoard(page);
      const dockCentre = async () => {
        const b = await page.locator(".floating-dock-wrapper").boundingBox();
        return b!.x + b!.width / 2;
      };

      const open = await dockCentre();
      await page.locator(".sidebar-collapse-button").click();
      const closed = await dockCentre();

      expect(Math.abs(open - closed)).toBeLessThan(2);
      const windowCentre = await page.evaluate(() => window.innerWidth / 2);
      expect(Math.abs(open - windowCentre)).toBeLessThan(2);
    });

    test("the dock still clears the rail", async ({ page }) => {
      // The cost of pinning it: it is left of the visible centre. Only a
      // problem if it reaches the rail, which this pins.
      await openBoard(page);
      const dock = await page.locator(".floating-dock-wrapper").boundingBox();
      expect(dock!.x).toBeGreaterThan(SIDEBAR_WIDTH);
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

  test.describe("identity", () => {
    // Dev builds carry a stub identity so the footer is clickable. It is
    // gated on NODE_ENV as well as the env var, so it cannot reach a
    // deployed build even if the var is set there by mistake.
    test("shows the signed-in user", async ({ page }) => {
      await openBoard(page);
      await expect(page.locator(".sidebar-identity")).toContainText("Abhimanyu Mahato");
      await expect(page.locator(".sidebar-identity-anonymous")).toHaveCount(0);
    });

    test("opens a menu with the email, Brand and Sign out", async ({ page }) => {
      await openBoard(page);
      await expect(page.locator(".sidebar-user-menu")).toHaveCount(0);

      await page.locator(".sidebar-identity").click();
      const menu = page.locator(".sidebar-user-menu");
      await expect(menu).toBeVisible();
      await expect(menu.locator(".sidebar-user-email")).toContainText("@accenture.com");
      await expect(menu.getByRole("menuitem", { name: "Brand" })).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
    });

    test("closes on Escape and on an outside click", async ({ page }) => {
      await openBoard(page);
      await page.locator(".sidebar-identity").click();
      await page.keyboard.press("Escape");
      await expect(page.locator(".sidebar-user-menu")).toHaveCount(0);

      await page.locator(".sidebar-identity").click();
      await expect(page.locator(".sidebar-user-menu")).toBeVisible();
      await page.mouse.click(900, 300);
      await expect(page.locator(".sidebar-user-menu")).toHaveCount(0);
    });

    test("signing out locally falls back to the signed-out state", async ({ page }) => {
      // The point of wiring sign-out in dev: both states are reachable
      // without editing env vars and restarting.
      await openBoard(page);
      await page.locator(".sidebar-identity").click();
      await page.getByRole("menuitem", { name: "Sign out" }).click();

      await expect(page.locator(".sidebar-identity-anonymous")).toBeVisible();
      await expect(page.locator(".sidebar-user-menu")).toHaveCount(0);
    });
  });
});
