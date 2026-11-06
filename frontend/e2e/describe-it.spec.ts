import { test, expect, type Page } from "@playwright/test";
import { makePng, openBoard } from "./helpers";

// "Describe it" on Assets (#448): the text model writes an image's
// description into the draft. The dev backend has no VERTEX_PROJECT_ID, so it
// answers its mock line, "[mock] A description of <file>.", end to end.

const NO_COLOURS = { primary: "", secondary: "", accent: "" };

async function addAsset(page: Page, kind: string, name: string, details: Record<string, string> = {}): Promise<string> {
  const up = await page.request.post(`/api/proxy/assets?kind=${kind}&name=${name}`, {
    headers: { "Content-Type": "image/png" },
    data: makePng(32, 32, [90, 140, 200]),
  });
  const { id } = await up.json();
  if (Object.keys(details).length) await page.request.patch(`/api/proxy/assets/${id}`, { data: { details } });
  return id;
}

async function savePage(page: Page, record: { productName?: string; masterId?: string; assetIds: string[] }) {
  const current = await (await page.request.get("/api/proxy/brand-assets")).json();
  const res = await page.request.put("/api/proxy/brand-assets", {
    data: { revision: current.revision, productName: "", sku: "", masterId: "", colours: NO_COLOURS, ...record },
  });
  expect(res.ok()).toBe(true);
}

async function openAssets(page: Page) {
  await page.locator(".sidebar-item", { hasText: "Assets" }).click();
  await expect(page.getByRole("heading", { name: "Assets", level: 1 })).toBeVisible();
}

const master = (page: Page) => page.locator("#assets-master");

test.describe("Describe it", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
    await page.request.delete("/api/proxy/brand-assets/pending");
  });

  test("writes the master's description into the draft; Cancel takes it back", async ({ page }) => {
    const front = await addAsset(page, "productImage", "front.png");
    await savePage(page, { productName: "Trail shoe", masterId: front, assetIds: [front] });
    await openAssets(page);

    const field = master(page).getByLabel("Description");
    await expect(field).toHaveValue("");
    await master(page).getByRole("button", { name: "Describe it" }).click();
    await expect(field).toHaveValue("[mock] A description of front.png.");
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    // Editable at once, like a typed one.
    await field.fill("White trail shoe, side view");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(field).toHaveValue("");
  });

  test("says it is working, then fills in", async ({ page }) => {
    const front = await addAsset(page, "productImage", "front.png");
    await savePage(page, { productName: "Trail shoe", masterId: front, assetIds: [front] });
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(/\/describe$/, async (route) => {
      await held;
      await route.continue();
    });
    await openAssets(page);
    await master(page).getByRole("button", { name: "Describe it" }).click();
    const working = master(page).getByRole("button", { name: "Describing…" });
    await expect(working).toBeDisabled();
    await expect(working).toHaveAttribute("aria-busy", "true");
    // The field stays editable meanwhile.
    await expect(master(page).getByLabel("Description")).toBeEditable();
    release();
    await expect(master(page).getByLabel("Description")).toHaveValue("[mock] A description of front.png.");
  });

  test("a failure says so and leaves the text as it was", async ({ page }) => {
    const front = await addAsset(page, "productImage", "front.png");
    await savePage(page, { productName: "Trail shoe", masterId: front, assetIds: [front] });
    await page.route(/\/describe$/, (route) => route.fulfill({ status: 500, body: "{}" }));
    await openAssets(page);
    await master(page).getByLabel("Description").fill("Kept as typed");
    await master(page).getByRole("button", { name: "Describe it" }).click();
    await expect(master(page).getByRole("alert")).toHaveText("Couldn't describe it. Try again.");
    await expect(master(page).getByLabel("Description")).toHaveValue("Kept as typed");
  });

  test("works on logos and references too", async ({ page }) => {
    const front = await addAsset(page, "productImage", "front.png");
    const logo = await addAsset(page, "logo", "brand-logo.png", { logoType: "Primary logo" });
    const street = await addAsset(page, "reference", "street.png", { referenceType: "Scene / environment", use: "inspiration", scope: "picked" });
    await savePage(page, { productName: "Trail shoe", masterId: front, assetIds: [front, logo, street] });
    await openAssets(page);

    // One Describe it per open image's details, in page order: the master,
    // the logo, the reference.
    const buttons = page.getByRole("button", { name: "Describe it" });
    const fields = page.getByLabel("Description");
    await expect(buttons).toHaveCount(3);
    await buttons.nth(1).click();
    await expect(fields.nth(1)).toHaveValue("[mock] A description of brand-logo.png.");
    await buttons.nth(2).click();
    await expect(fields.nth(2)).toHaveValue("[mock] A description of street.png.");
    await expect(fields.nth(0)).toHaveValue("");
  });

  test("disabled while the image uploads", async ({ page }) => {
    await savePage(page, { assetIds: [] });
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(/\/api\/proxy\/assets\?/, async (route) => {
      if (route.request().method() === "POST") await held;
      await route.continue();
    });
    await openAssets(page);
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Upload product image" }).click();
    await (await chooser).setFiles({ name: "front.png", mimeType: "image/png", buffer: makePng(32, 32) });
    await expect(master(page).getByRole("button", { name: "Describe it" })).toBeDisabled();
    release();
    await expect(master(page).getByRole("button", { name: "Describe it" })).toBeEnabled();
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.getByRole("button", { name: "Cancel" }).click();
  });
});
