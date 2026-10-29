import { test, expect, type Page } from "@playwright/test";
import { logoNotMandatory, makePng, openBoard, setZoom } from "./helpers";

// "Ready for generation" on the Assets page (#419): each item marked done,
// missing or not set, live as the page changes, and a link to its part of
// the page.

async function resetAssets(page: Page) {
  const current = await (await page.request.get("/api/proxy/brand-assets")).json();
  const empty = { productName: "", sku: "", masterId: "", colours: { primary: "", secondary: "", accent: "" }, assetIds: [] };
  await page.request.put("/api/proxy/brand-assets", { data: { revision: current.revision, ...empty } });
  await page.request.delete("/api/proxy/brand-assets/pending");
}

async function openAssets(page: Page) {
  await page.locator(".sidebar-item", { hasText: "Assets" }).click();
  await expect(page.getByText("No product image added yet.")).toBeVisible();
}

async function choose(page: Page, button: string, name: string, buffer: Buffer) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: button }).click();
  await (await chooser).setFiles({ name, mimeType: "image/png", buffer });
  await expect(page.locator(".assets-overlay")).toHaveCount(0);
}

const strip = (page: Page) => page.getByRole("navigation", { name: "Ready for generation" });
const items = (page: Page) => strip(page).getByRole("link");

test.describe("Assets readiness", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
    await resetAssets(page);
  });

  test("all missing, then done one by one, before saving", async ({ page }) => {
    await openAssets(page);
    // The brief needs a logo by default.
    await expect(items(page)).toHaveText([
      "!Master image: missing",
      "!Product name: missing",
      "!Logo (required by the brief): missing",
      "–Colours 0 of 3: not set",
    ]);

    await page.getByLabel("Product Name").fill("Trail running shoe");
    await expect(items(page).nth(1)).toHaveText("✓Product name: done");
    await choose(page, "Upload product image", "shoe.png", makePng(16, 16, [10, 20, 30]));
    await expect(items(page).nth(0)).toHaveText("✓Master image: done");
    await choose(page, "Upload logo", "logo.png", makePng(16, 16, [200, 20, 30]));
    await expect(items(page).nth(2)).toHaveText("✓Logo (required by the brief): done");
    await page.getByRole("textbox", { name: /^Primary/ }).fill("#1A2B3C");
    await page.getByRole("textbox", { name: /^Accent/ }).fill("#FF5A1F");
    await expect(items(page).nth(3)).toHaveText("✓Colours 2 of 3: done");

    // The strip doesn't replace Save's banner: a wrong colour is still Save's to report.
    await page.getByRole("textbox", { name: /^Secondary/ }).fill("navy");
    await expect(items(page).nth(3)).toHaveText("✓Colours 2 of 3: done");
    await page.getByRole("button", { name: "Save assets" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Use hex values like #1A2B3C for the brand colours." })).toBeVisible();
  });

  test("the logo follows the brief: optional when it isn't mandatory", async ({ page }) => {
    await logoNotMandatory(page);
    await openAssets(page);
    await expect(items(page).nth(2)).toHaveText("–Logo (optional): not set");
  });

  test("each item scrolls to its part of the page and focuses it", async ({ page }) => {
    await openAssets(page);
    await items(page).filter({ hasText: "Colours" }).click();
    await expect(page.getByRole("textbox", { name: /^Primary/ })).toBeFocused();
    await expect(page.getByRole("textbox", { name: /^Primary/ })).toBeInViewport();

    await items(page).filter({ hasText: "Logo" }).click();
    await expect(page.getByRole("button", { name: "Upload logo" })).toBeFocused();

    await items(page).filter({ hasText: "Product name" }).click();
    await expect(page.getByLabel("Product Name")).toBeFocused();

    await items(page).filter({ hasText: "Master image" }).click();
    await expect(page.getByRole("button", { name: "Upload product image" })).toBeFocused();
  });

  test("works the same at 50%, 100% and 150% zoom", async ({ page }) => {
    for (const z of [0.5, 1.5, 1]) {
      await setZoom(page, z);
      await page.locator(".sidebar-item", { hasText: "Assets" }).click();
      await expect(items(page)).toHaveCount(4);
      await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
    }
  });
});
