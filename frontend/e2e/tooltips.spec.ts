import { test, expect, type Page } from "@playwright/test";
import { openBoard } from "./helpers";

// One tooltip for the rail, the dock and the style bar (#301): shown on
// hover and on keyboard focus, hidden by Escape, and never the only name a
// button has.

const dockTip = (page: Page, label: string) =>
  page.locator(".floating-dock-tooltip", { hasText: label });

test.describe("tooltips", () => {
  test("every dock button has a name of its own, not just its tooltip", async ({ page }) => {
    await openBoard(page);
    for (const name of ["Select", "Create", "Links", "Frame", "Shapes", "Text", "Color", "Upload files"]) {
      await expect(page.locator(".floating-dock").getByRole("button", { name, exact: true })).toHaveCount(1);
    }
  });

  test("a dock tooltip shows on keyboard focus, and Escape hides it", async ({ page }) => {
    await openBoard(page);
    await expect(dockTip(page, "Frame")).toBeHidden();
    await page.getByRole("button", { name: "Frame", exact: true }).focus();
    // focus() does not set :focus-visible; a key press does.
    await page.keyboard.press("Shift");
    await expect(dockTip(page, "Frame")).toBeVisible();
    await expect(dockTip(page, "Frame")).toContainText("F");
    await page.keyboard.press("Escape");
    await expect(dockTip(page, "Frame")).toBeHidden();
  });

  test("a dock tooltip still shows on hover, and gives way to its open menu", async ({ page }) => {
    await openBoard(page);
    const shapes = page.getByRole("button", { name: "Shapes", exact: true });
    await shapes.hover();
    await expect(dockTip(page, "Shapes")).toBeVisible();
    await shapes.click();
    await expect(dockTip(page, "Shapes")).toHaveCount(0);
  });

  test("a style bar tooltip shows on keyboard focus", async ({ page }) => {
    await openBoard(page);
    await page.getByRole("button", { name: "Shapes", exact: true }).click();
    await page.locator(".floating-dock-submenu button", { hasText: "Rectangle" }).click();
    await page.mouse.move(500, 300);
    await page.mouse.down();
    await page.mouse.move(600, 380, { steps: 6 });
    await page.mouse.up();
    const color = page.getByRole("button", { name: "Shape color" });
    await expect(color).toBeVisible();
    await color.focus();
    await page.keyboard.press("Shift");
    await expect(page.locator(".shape-style-tooltip", { hasText: "Color" })).toBeVisible();
  });
});
