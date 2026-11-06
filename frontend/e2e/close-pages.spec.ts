import { test, expect, type Page } from "@playwright/test";
import { openBoard, reloadBoard, setZoom, zoom } from "./helpers";

// Closing Settings and Brand (#405): opened from the user menu, they have no
// rail item to leave by, so each has a close button and takes Esc, and goes
// back to the page it was opened from.

async function openFromMenu(page: Page, name: "Settings" | "Brand") {
  await page.locator(".sidebar-identity").click();
  await page.getByRole("menuitem", { name: new RegExp(name) }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

const heading = (page: Page, name: string) => page.getByRole("heading", { name, level: 1 });

test.describe("Closing Settings and Brand", () => {
  for (const name of ["Settings", "Brand"] as const) {
    test(`${name} has a close button that goes back to the board`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await openBoard(page);
      await openFromMenu(page, name);

      const close = page.getByRole("button", { name: `Close ${name}` });
      await expect(close).toBeVisible();
      // Level with the title, at the right of the header.
      const [btn, title] = [await close.boundingBox(), await heading(page, name).boundingBox()];
      expect(btn!.y).toBeLessThan(title!.y + title!.height);
      expect(btn!.x).toBeGreaterThan(title!.x + title!.width);
      await close.hover();
      await expect(page.locator(".library-close-tip")).toHaveText("Close (Esc)");
      await expect(page.locator(".library-close-tip")).toHaveCSS("opacity", "1");

      await close.click();
      await expect(heading(page, name)).toHaveCount(0);
      await expect(page.locator(".sidebar-item.is-active, .sidebar-item[aria-current]").first()).toContainText("Playspace");
      expect(errors).toEqual([]);
    });
  }

  test("the title row and close button stay in view while the page scrolls", async ({ page }) => {
    await openBoard(page);
    await openFromMenu(page, "Settings");
    const header = page.locator(".library-header");
    await expect(header).not.toHaveClass(/is-scrolled/);
    await page.locator(".library-page").evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(header).toHaveClass(/is-scrolled/);
    // Pinned flush with the top: nothing scrolls past above it.
    expect((await header.boundingBox())!.y).toBe(0);
    const close = page.getByRole("button", { name: "Close Settings" });
    await expect(close).toBeInViewport();
    await expect(heading(page, "Settings")).toBeInViewport();
    await close.click();
    await expect(heading(page, "Settings")).toHaveCount(0);
  });

  test("closing goes back to the page it was opened from", async ({ page }) => {
    await openBoard(page);
    await page.locator(".sidebar-item", { hasText: "Skills" }).click();
    await expect(heading(page, "Skills")).toBeVisible();
    await openFromMenu(page, "Settings");
    await page.getByRole("button", { name: "Close Settings" }).click();
    await expect(heading(page, "Skills")).toBeVisible();

    // From another closable page, or after a reload: the board.
    await openFromMenu(page, "Brand");
    await openFromMenu(page, "Settings");
    await page.getByRole("button", { name: "Close Settings" }).click();
    await expect(heading(page, "Settings")).toHaveCount(0);
    await expect(heading(page, "Brand")).toHaveCount(0);
    await expect(heading(page, "Skills")).toHaveCount(0);

    await reloadBoard(page);
    await openFromMenu(page, "Settings");
    await page.keyboard.press("Escape");
    await expect(heading(page, "Settings")).toHaveCount(0);
  });

  test("Esc closes, but not from a field or with a menu open", async ({ page }) => {
    await openBoard(page);
    await openFromMenu(page, "Brand");
    await page.getByLabel("Industry").focus();
    await page.keyboard.press("Escape");
    await expect(heading(page, "Brand")).toBeVisible();

    // An open menu takes Esc first; the next one closes the page.
    await page.locator(".library-page").focus();
    await page.locator(".sidebar-identity").click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(heading(page, "Brand")).toBeVisible();
    await page.locator(".library-page").focus();
    await page.keyboard.press("Escape");
    await expect(heading(page, "Brand")).toHaveCount(0);
  });

  test("the close button is reached by Tab and shows the focus ring", async ({ page }) => {
    await openBoard(page);
    await openFromMenu(page, "Settings");
    const close = page.getByRole("button", { name: "Close Settings" });
    for (let i = 0; i < 6 && !(await close.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press("Tab");
    }
    await expect(close).toBeFocused();
    await expect(close).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(heading(page, "Settings")).toHaveCount(0);
  });

  test("after closing, the board's keys work and its zoom is unchanged", async ({ page }) => {
    await openBoard(page);
    for (const z of [0.5, 1.5, 1]) {
      await setZoom(page, z);
      const before = await zoom(page);
      await openFromMenu(page, "Settings");
      await page.getByRole("button", { name: "Close Settings" }).click();
      expect(await zoom(page)).toBeCloseTo(before, 2);
    }
    await page.keyboard.press("r");
    await expect(page.getByRole("button", { name: "Select", exact: true })).toHaveAttribute("aria-pressed", "false");
  });
});
