import { test, expect, type Page } from "@playwright/test";
import { openBoard, reloadBoard, showEveryMenuItem } from "./helpers";

// The Brand page saved to the account (#454): kept across reloads and tabs,
// by revision, and what generation reads.

async function openBrand(page: Page) {
  await page.locator(".sidebar-identity").click();
  await page.getByRole("menuitem", { name: "Brand" }).click();
  await expect(page.getByRole("heading", { name: "Brand", level: 1 })).toBeVisible();
}

const save = (page: Page) => page.getByRole("button", { name: "Save brand" });
// On the page: Next.js has an alert of its own, its route announcer.
const alert = (page: Page) => page.locator(".library-page").getByRole("alert");

async function saveBrand(page: Page) {
  await save(page).click();
  await expect(save(page)).toBeDisabled();
}

test.describe("Brand saved to the account", () => {
  test.beforeEach(async ({ page }) => {
    await showEveryMenuItem(page);
    await openBoard(page);
  });

  test("is kept after a reload", async ({ page }) => {
    await openBrand(page);
    await expect(page.getByLabel("Campaign Name")).toHaveValue("");
    await page.getByLabel("Industry").fill("Sportswear");
    await page.getByLabel("Campaign Name").fill("Urban Running 2026");
    await page.getByRole("button", { name: "Bold" }).click();
    await saveBrand(page);

    await reloadBoard(page);
    await openBrand(page);
    await expect(page.getByLabel("Industry")).toHaveValue("Sportswear");
    await expect(page.getByLabel("Campaign Name")).toHaveValue("Urban Running 2026");
    await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  });

  test("Cancel goes back to what is saved", async ({ page }) => {
    await openBrand(page);
    await page.getByLabel("Campaign Name").fill("Saved name");
    await saveBrand(page);
    await page.getByLabel("Campaign Name").fill("Unsaved name");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByLabel("Campaign Name")).toHaveValue("Saved name");
  });

  test("while loading fails, nothing is editable; Retry loads it", async ({ page }) => {
    await page.route(/\/api\/proxy\/brand$/, (route) =>
      route.request().method() === "GET" ? route.fulfill({ status: 500, body: "{}" }) : route.continue(),
    );
    await page.reload({ waitUntil: "networkidle" });
    await openBrand(page);
    await expect(alert(page)).toContainText("Couldn't load the brand.");
    await expect(page.getByLabel("Campaign Name")).toHaveCount(0);
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByLabel("Campaign Name")).toBeVisible();
  });

  test("a failed save says so and keeps the edits", async ({ page }) => {
    await openBrand(page);
    await page.route(/\/api\/proxy\/brand$/, (route) =>
      route.request().method() === "PUT" ? route.fulfill({ status: 500, body: "{}" }) : route.continue(),
    );
    await page.getByLabel("Campaign Name").fill("Kept");
    await save(page).click();
    await expect(alert(page)).toHaveText("Couldn't save the brand. Try again.");
    await expect(page.getByLabel("Campaign Name")).toHaveValue("Kept");
    await expect(save(page)).toBeEnabled();
  });

  test("saved in another tab since: says so, overwrites nothing, loads the latest", async ({ page, context }) => {
    await openBrand(page);
    const other = await context.newPage();
    await openBoard(other);
    await openBrand(other);
    await other.getByLabel("Campaign Name").fill("From the other tab");
    await saveBrand(other);

    await page.getByLabel("Campaign Name").fill("From this tab");
    await save(page).click();
    await expect(alert(page)).toContainText("The brand was saved somewhere else since you opened it.");
    await page.getByRole("button", { name: "Load the latest" }).click();
    await expect(page.getByLabel("Campaign Name")).toHaveValue("From the other tab");
    await other.close();
  });

  test("after a reload, Assets and generation use the saved brief", async ({ page }) => {
    await openBrand(page);
    await page.getByLabel("Campaign Name").fill("Urban Running 2026");
    await page.getByRole("switch", { name: "Logo mandatory" }).click();
    await saveBrand(page);
    await reloadBoard(page);

    await page.locator(".sidebar-item", { hasText: "Assets" }).click();
    await expect(page.locator("#assets-logo")).toContainText("Optional: the Campaign Brief does not require it.");

    await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.locator(".floating-dock-submenu button").filter({ hasText: /^Prompt$/ }).first().click();
    await page.locator("textarea.node-panel-instruction").first().fill("Three taglines");
    await page.locator("button.node-panel-create-button").first().click();
    await expect(page.locator(".node-panel-text-output")).toContainText("(with brand: brief");
  });
});
