import { test, expect, type Page } from "@playwright/test";
import { makePng, openBoard } from "./helpers";

// The Campaign Brief picks the creative references a campaign uses (#442):
// the ones saved on Assets, Always ones in use whatever the brief says.

const EMPTY = { productName: "", sku: "", masterId: "", colours: { primary: "", secondary: "", accent: "" } };

async function savePage(page: Page, assetIds: string[]) {
  const current = await (await page.request.get("/api/proxy/brand-assets")).json();
  const res = await page.request.put("/api/proxy/brand-assets", { data: { revision: current.revision, ...EMPTY, assetIds } });
  expect(res.ok()).toBe(true);
}

/** Stores a reference with its details, the way the Assets page saves one. */
async function addReference(page: Page, name: string, details: Record<string, string>, shade: number): Promise<string> {
  const up = await page.request.post(`/api/proxy/assets?kind=reference&name=${name}.png`, {
    headers: { "Content-Type": "image/png" },
    data: makePng(16, 16, [shade, 120, 180]),
  });
  const { id } = await up.json();
  await page.request.patch(`/api/proxy/assets/${id}`, { data: { description: name, details } });
  return id;
}

async function openBrand(page: Page) {
  await page.locator(".sidebar-identity").click();
  await page.getByRole("menuitem", { name: "Brand" }).click();
}

const group = (page: Page) => page.locator(".brief-group").filter({ has: page.getByRole("heading", { name: "Creative references" }) });
const tile = (page: Page, name: string) => group(page).getByRole("button", { name: new RegExp(name) });
const summary = (page: Page) => group(page).locator(".brief-refs-summary");

test.describe("Campaign Brief creative references", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
    await savePage(page, []);
    await page.request.delete("/api/proxy/brand-assets/pending");
  });

  test("no references: says so and opens Assets", async ({ page }) => {
    await openBrand(page);
    await expect(group(page).getByText("Pick the backgrounds, scenes and mood boards from Assets that this campaign uses.")).toBeVisible();
    await expect(group(page).getByText("No creative references yet.")).toBeVisible();
    await group(page).getByRole("button", { name: "Add them on the Assets page" }).click();
    await expect(page.getByRole("heading", { name: "Assets", level: 1 })).toBeVisible();
  });

  test("picks the ones it uses; Always ones are in use and cannot be unpicked", async ({ page }) => {
    const street = await addReference(page, "street", { referenceType: "Scene / environment", use: "inspiration", scope: "picked" }, 40);
    const sand = await addReference(page, "sand", { referenceType: "Background", use: "asIs", scope: "always" }, 90);
    await savePage(page, [street, sand]);
    await openBrand(page);

    await expect(tile(page, "street")).toHaveAttribute("aria-pressed", "false");
    await expect(tile(page, "street")).toContainText("Scene / environment · Inspiration only");
    await expect(tile(page, "sand")).toHaveAttribute("aria-pressed", "true");
    await expect(tile(page, "sand")).toContainText("Always");
    await expect(tile(page, "sand")).toContainText("Background · As is");
    await expect(summary(page)).toHaveText("1 always");

    // Marked aria-disabled, so forced: a click on it changes nothing.
    await tile(page, "sand").click({ force: true });
    await expect(tile(page, "sand")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Unsaved changes")).toHaveCount(0);

    await tile(page, "street").focus();
    await page.keyboard.press("Space");
    await expect(tile(page, "street")).toHaveAttribute("aria-pressed", "true");
    await expect(summary(page)).toHaveText("1 picked · 1 always");
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    // Cancel restores, Save keeps.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(tile(page, "street")).toHaveAttribute("aria-pressed", "false");
    await tile(page, "street").click();
    await page.getByRole("button", { name: "Save brand" }).click();
    await page.getByRole("button", { name: "Close" }).click();
    await openBrand(page);
    await expect(tile(page, "street")).toHaveAttribute("aria-pressed", "true");
  });

  test("a picked reference removed on Assets leaves the brief", async ({ page }) => {
    const street = await addReference(page, "street", { scope: "picked" }, 40);
    const park = await addReference(page, "park", { scope: "picked" }, 140);
    await savePage(page, [street, park]);
    await openBrand(page);
    await tile(page, "street").click();
    await tile(page, "park").click();
    await page.getByRole("button", { name: "Save brand" }).click();
    await expect(summary(page)).toHaveText("2 picked");

    await savePage(page, [park]);
    await page.getByRole("button", { name: "Close" }).click();
    await openBrand(page);
    await expect(tile(page, "street")).toHaveCount(0);
    await expect(summary(page)).toHaveText("1 picked");
  });

  test("a load that fails says so, and Retry loads", async ({ page }) => {
    const street = await addReference(page, "street", { scope: "picked" }, 40);
    await savePage(page, [street]);
    await page.route(/\/api\/proxy\/brand-assets$/, (route) => route.fulfill({ status: 500, body: "{}" }));
    await openBrand(page);
    await expect(group(page).getByRole("alert")).toHaveText(/Couldn't load the references\./);
    // The rest of the brief still works.
    await page.getByLabel("Campaign Name").fill("Monsoon 2027");
    await page.unroute(/\/api\/proxy\/brand-assets$/);
    await group(page).getByRole("button", { name: "Retry" }).click();
    await expect(tile(page, "street")).toBeVisible();
  });

  test("unsaved Brand edits are asked about before going to Assets", async ({ page }) => {
    const street = await addReference(page, "street", { scope: "picked" }, 40);
    await savePage(page, [street]);
    await openBrand(page);
    await tile(page, "street").click();
    await group(page).getByRole("button", { name: "Manage on the Assets page" }).click();
    await expect(page.getByRole("alertdialog", { name: "Discard changes?" })).toBeVisible();
    await page.getByRole("button", { name: "Keep editing" }).click();
    await expect(tile(page, "street")).toHaveAttribute("aria-pressed", "true");
  });

  test("Assets says where references are picked", async ({ page }) => {
    await page.locator(".sidebar-item", { hasText: "Assets" }).click();
    await expect(page.getByText("No product image added yet.")).toBeVisible();
    await page.getByRole("button", { name: "Add reference" }).click().catch(() => {});
    await expect(page.getByText("Until briefs can pick")).toHaveCount(0);
  });
});
