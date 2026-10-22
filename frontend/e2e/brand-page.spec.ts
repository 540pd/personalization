import { test, expect, type Page } from "@playwright/test";
import { openBoard } from "./helpers";

// #219: Brand is a page over the board, opened from the user menu like
// Settings, with a pinned Save bar and a discard confirm on the way out.

async function openBrand(page: Page) {
  await page.locator(".sidebar-identity").click();
  await page.getByRole("menuitem", { name: "Brand" }).click();
  await expect(page.getByRole("heading", { name: "Brand", level: 1 })).toBeVisible();
}

const industry = (page: Page) => page.getByLabel("Industry");
const saveBrand = (page: Page) => page.getByRole("button", { name: "Save brand" });
const bar = (page: Page) => page.getByRole("region", { name: "Save brand" });

test.describe("Brand page", () => {
  test("opens over the board from the user menu, and Playspace goes back", async ({ page }) => {
    await openBoard(page);
    await openBrand(page);
    await expect(page.locator(".sidebar-product")).toHaveText(/Studio\s*\/\s*Brand/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    for (const title of ["Colour palette", "Visual identity", "Product staging", "Lighting", "Environment / scene", "Campaign context"]) {
      await expect(page.getByRole("heading", { name: title, level: 3 })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Analyze" })).toBeDisabled();
    await expect(saveBrand(page)).toBeDisabled();
    expect(await page.evaluate(() => (window as any).Konva.stages.length)).toBeGreaterThan(0);

    // Esc does not leave a page.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Brand", level: 1 })).toBeVisible();

    await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
    await expect(page.getByRole("heading", { name: "Brand", level: 1 })).toHaveCount(0);
  });

  test("editing shows Unsaved changes; Save keeps you on the page", async ({ page }) => {
    await openBoard(page);
    await openBrand(page);
    await industry(page).fill("Consumer electronics");
    await expect(bar(page)).toContainText("Unsaved changes");
    await expect(saveBrand(page)).toBeEnabled();
    await saveBrand(page).click();
    await expect(page.getByRole("status")).toContainText("Brand saved");
    await expect(bar(page)).not.toContainText("Unsaved changes");
    await expect(saveBrand(page)).toBeDisabled();
    await expect(page.getByRole("heading", { name: "Brand", level: 1 })).toBeVisible();

    // Saved: leaving does not ask, and coming back shows it.
    await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await openBrand(page);
    await expect(industry(page)).toHaveValue("Consumer electronics");
  });

  test("Cancel puts the fields back", async ({ page }) => {
    await openBoard(page);
    await openBrand(page);
    await industry(page).fill("Retail");
    await page.getByRole("checkbox").first().check();
    await bar(page).getByRole("button", { name: "Cancel" }).click();
    await expect(industry(page)).toHaveValue("");
    await expect(page.getByRole("checkbox").first()).not.toBeChecked();
    await expect(saveBrand(page)).toBeDisabled();
  });

  test("the Save bar stays pinned while the page scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await openBoard(page);
    await openBrand(page);
    const before = await bar(page).boundingBox();
    expect(Math.round(before!.y + before!.height)).toBe(640);
    await page.getByText("Brand Profile").scrollIntoViewIfNeeded();
    const after = await bar(page).boundingBox();
    expect(Math.round(after!.y + after!.height)).toBe(640);
    await expect(page.getByText("Coming soon.")).toBeVisible();
  });

  for (const [how, leave] of [
    ["Playspace", (p: Page) => p.locator(".sidebar-item", { hasText: "Playspace" }).click()],
    ["Skills", (p: Page) => p.locator(".sidebar-item", { hasText: "Skills" }).click()],
    ["Settings in the menu", async (p: Page) => {
      await p.locator(".sidebar-identity").click();
      await p.getByRole("menuitem", { name: /Settings/ }).click();
    }],
    ["⌘,", (p: Page) => p.keyboard.press("Meta+Comma")],
  ] as const) {
    test(`leaving with edits by ${how} asks first`, async ({ page }) => {
      await openBoard(page);
      await openBrand(page);
      await industry(page).fill("Retail");
      await page.locator(".library-page").focus();
      await leave(page);

      const confirm = page.getByRole("alertdialog");
      await expect(confirm).toContainText("Discard changes?");
      await expect(confirm).toContainText("Your changes to the brand won't be saved.");
      await expect(page.getByRole("button", { name: "Keep editing" })).toBeFocused();
      await page.getByRole("button", { name: "Keep editing" }).click();
      await expect(confirm).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Brand", level: 1 })).toBeVisible();
      await expect(industry(page)).toHaveValue("Retail");

      await leave(page);
      await page.getByRole("button", { name: "Discard" }).click();
      await expect(page.getByRole("heading", { name: "Brand", level: 1 })).toHaveCount(0);
      // Discarded: back on Brand, the edit is gone.
      await openBrand(page);
      await expect(industry(page)).toHaveValue("");
    });
  }

  test("Escape on the confirm keeps editing", async ({ page }) => {
    await openBoard(page);
    await openBrand(page);
    await industry(page).fill("Retail");
    await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(industry(page)).toHaveValue("Retail");
  });

  test("closing the tab with edits gets the browser's prompt", async ({ page }) => {
    await openBoard(page);
    await openBrand(page);
    await industry(page).fill("Retail");
    const prompt = new Promise<string>((resolve) =>
      page.once("dialog", async (d) => {
        resolve(d.type());
        await d.accept();
      }),
    );
    await page.close({ runBeforeUnload: true });
    expect(await prompt).toBe("beforeunload");
  });

  test("wide window: two cards per row, never three", async ({ page }) => {
    await page.setViewportSize({ width: 1800, height: 900 });
    await openBoard(page);
    await openBrand(page);
    const cards = page.locator(".brand-card");
    const [a, b, c] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox(), await cards.nth(2).boundingBox()];
    expect(Math.round(b!.y)).toBe(Math.round(a!.y));
    expect(c!.y).toBeGreaterThan(a!.y + a!.height - 1);
  });

  test("narrow window: one card per row", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await openBoard(page);
    await openBrand(page);
    const cards = page.locator(".brand-card");
    const a = await cards.nth(0).boundingBox();
    const b = await cards.nth(1).boundingBox();
    expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1);
  });
});
