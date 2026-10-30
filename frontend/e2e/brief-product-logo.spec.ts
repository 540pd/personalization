import { test, expect, type Page } from "@playwright/test";
import { makePng, openBoard } from "./helpers";

// The Campaign Brief shows the product and logo saved on Assets (#444), in
// its Product and Logo rows, or that there is none yet.

const NO_COLOURS = { primary: "", secondary: "", accent: "" };

async function savePage(page: Page, record: { productName?: string; sku?: string; masterId?: string; assetIds: string[] }) {
  const current = await (await page.request.get("/api/proxy/brand-assets")).json();
  const res = await page.request.put("/api/proxy/brand-assets", {
    data: { revision: current.revision, productName: "", sku: "", masterId: "", colours: NO_COLOURS, ...record },
  });
  expect(res.ok()).toBe(true);
}

async function addAsset(page: Page, kind: "productImage" | "logo", name: string, details: Record<string, string> = {}): Promise<string> {
  const up = await page.request.post(`/api/proxy/assets?kind=${kind}&name=${name}.png`, {
    headers: { "Content-Type": "image/png" },
    data: makePng(16, 16, [40, 120, 200]),
  });
  const { id } = await up.json();
  await page.request.patch(`/api/proxy/assets/${id}`, { data: { details } });
  return id;
}

async function openBrand(page: Page) {
  await page.locator(".sidebar-identity").click();
  await page.getByRole("menuitem", { name: "Brand" }).click();
  await expect(page.getByRole("heading", { name: "Brand", level: 1 })).toBeVisible();
}

// A Mandatory row's field: what follows its name.
const row = (page: Page, name: "Product" | "Logo") =>
  page.locator(".brief-mandatory", { has: page.getByText(name, { exact: true }) }).locator("xpath=following-sibling::div[1]");

test.describe("Campaign Brief product and logo from Assets", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
    await savePage(page, { assetIds: [] });
    await page.request.delete("/api/proxy/brand-assets/pending");
  });

  test("nothing saved: each says so, in amber, with a way to Assets", async ({ page }) => {
    await openBrand(page);
    await expect(row(page, "Product")).toContainText("No product on the Assets page yet.");
    await expect(row(page, "Logo")).toContainText("No logo on the Assets page yet.");
    // amber-800, however the browser writes it.
    await expect(row(page, "Product").locator(".brief-asset-missing")).toHaveCSS("color", /^(rgb\(146, 64, 14\)|oklch\(0\.473 0\.137 46\.201\))$/);
    await row(page, "Logo").getByRole("button", { name: "Add it on the Assets page" }).click();
    await expect(page.getByRole("heading", { name: "Assets", level: 1 })).toBeVisible();
  });

  test("shows the master with name and SKU, and the primary logo", async ({ page }) => {
    const front = await addAsset(page, "productImage", "front");
    const side = await addAsset(page, "productImage", "side");
    const second = await addAsset(page, "logo", "mono", { logoType: "Secondary logo" });
    const primary = await addAsset(page, "logo", "main", { logoType: "Primary logo" });
    await savePage(page, { productName: "Trail shoe", sku: "TRS-WHT-001", masterId: side, assetIds: [front, side, second, primary] });
    await openBrand(page);

    await expect(row(page, "Product")).toContainText("Trail shoe");
    await expect(row(page, "Product")).toContainText("SKU TRS-WHT-001");
    await expect(row(page, "Product").locator("img")).toHaveAttribute("src", new RegExp(side));
    await expect(row(page, "Logo")).toContainText("Primary logo");
    await expect(row(page, "Logo").locator("img")).toHaveAttribute("src", new RegExp(primary));
    await expect(row(page, "Product").getByRole("button", { name: "Change on the Assets page" })).toBeVisible();
  });

  test("no primary logo: the first logo, with its type; no SKU: none shown", async ({ page }) => {
    const front = await addAsset(page, "productImage", "front");
    const second = await addAsset(page, "logo", "mono", { logoType: "Secondary logo" });
    await savePage(page, { productName: "Trail shoe", masterId: front, assetIds: [front, second] });
    await openBrand(page);
    await expect(row(page, "Logo")).toContainText("Secondary logo");
    await expect(row(page, "Product")).not.toContainText("SKU");
  });

  test("a switch off says not required, whatever Assets holds", async ({ page }) => {
    const front = await addAsset(page, "productImage", "front");
    await savePage(page, { productName: "Trail shoe", masterId: front, assetIds: [front] });
    await openBrand(page);
    await page.getByRole("switch", { name: "Product mandatory" }).click();
    await expect(row(page, "Product")).toHaveText("Not required for this campaign.");
  });

  test("a failed load says so; the references' Retry reloads the rows too", async ({ page }) => {
    const front = await addAsset(page, "productImage", "front");
    await savePage(page, { productName: "Trail shoe", masterId: front, assetIds: [front] });
    await page.route(/\/api\/proxy\/brand-assets$/, (route) => route.fulfill({ status: 500, body: "{}" }));
    await openBrand(page);
    await expect(row(page, "Product")).toHaveText("Couldn't load it from Assets.");
    await expect(row(page, "Logo")).toHaveText("Couldn't load it from Assets.");
    await page.unroute(/\/api\/proxy\/brand-assets$/);
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(row(page, "Product")).toContainText("Trail shoe");
  });

  test("unsaved Brand edits are asked about before going to Assets", async ({ page }) => {
    await openBrand(page);
    await page.getByLabel("Campaign Name").fill("Monsoon 2027");
    await row(page, "Product").getByRole("button", { name: "Add it on the Assets page" }).click();
    await expect(page.getByRole("alertdialog", { name: "Discard changes?" })).toBeVisible();
  });
});
