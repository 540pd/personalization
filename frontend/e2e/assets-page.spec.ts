import { test, expect, type Page } from "@playwright/test";
import { makePng, openBoard, setZoom } from "./helpers";

// The Assets page and its Product section (#414), on the real backend
// (#412, #413). The page is the user's own and outlives a test, so each test
// starts from an empty one.

const GIF = Buffer.from("R0lGODlhAQABAAAAACw=", "base64");

/** Empties the saved page (its images go with it) and any unsaved uploads. */
async function resetAssets(page: Page) {
  const current = await (await page.request.get("/api/proxy/brand-assets")).json();
  const empty = { productName: "", sku: "", masterId: "", colours: { primary: "", secondary: "", accent: "" }, assetIds: [] };
  await page.request.put("/api/proxy/brand-assets", { data: { revision: current.revision, ...empty } });
  await page.request.delete("/api/proxy/brand-assets/pending");
}

async function openAssets(page: Page) {
  await page.locator(".sidebar-item", { hasText: "Assets" }).click();
  await expect(page.getByRole("heading", { name: "Assets", level: 1 })).toBeVisible();
  await expect(page.getByText("Loading your assets…")).toHaveCount(0);
}

/** A distinct image per upload, so none is refused as a duplicate (#415). */
let shade = 0;
const nextPng = () => makePng(16, 16, [shade++ % 256, 90, 160]);

/** Picks `name` in the file dialog the next click opens, and waits for it to be stored. */
async function uploadVia(page: Page, button: string, name: string, buffer = nextPng(), mimeType = "image/png") {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: button }).click();
  await (await chooser).setFiles({ name, mimeType, buffer });
  await expect(page.locator(".assets-overlay")).toHaveCount(0);
}

const saveBar = (page: Page) => page.getByRole("region", { name: "Save assets" });
const save = (page: Page) => page.getByRole("button", { name: "Save assets" });
const savedPage = async (page: Page) => (await page.request.get("/api/proxy/brand-assets")).json();
const assetIds = async (page: Page): Promise<string[]> =>
  ((await (await page.request.get("/api/proxy/assets")).json()) as { id: string }[]).map((a) => a.id);

test.describe("Assets page", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
    await resetAssets(page);
  });

  test("opens from the rail, with the empty product state", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openAssets(page);
    await expect(page.locator(".sidebar-item-active")).toContainText("Assets");
    await expect(page.getByText("Add the core product and brand assets Content Studio needs to generate accurate, on-brand creatives.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "1 · Product / Master Creative", level: 2 })).toBeVisible();
    await expect(page.getByText("Required", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Product Name")).toHaveAttribute("placeholder", "Trail running shoe");
    await expect(page.getByText("No product image added yet.")).toBeVisible();
    await expect(page.getByText("Upload at least one product image to start generating creatives.")).toBeVisible();
    await expect(save(page)).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test("the first upload is the master; save keeps the page across a reload", async ({ page }) => {
    await openAssets(page);
    await uploadVia(page, "Upload product image", "shoe-side.png");
    await expect(page.locator(".assets-badge")).toHaveText("Master");
    await expect(page.getByRole("img", { name: "Master image: shoe-side.png" })).toBeVisible();
    await page.getByLabel("Product Name").fill("Trail running shoe");
    await expect(saveBar(page)).toContainText("Unsaved changes");
    await save(page).click();
    await expect(page.locator(".board-toast")).toContainText("Assets saved");
    await expect(save(page)).toBeDisabled();

    await page.reload();
    await page.waitForFunction(() => !!(window as any).Konva?.stages?.length);
    await openAssets(page);
    await expect(page.getByLabel("Product Name")).toHaveValue("Trail running shoe");
    await expect(page.locator(".assets-badge")).toBeVisible();
  });

  test("views get details; Make master swaps; details and master are saved", async ({ page }) => {
    await openAssets(page);
    await uploadVia(page, "Upload product image", "side.png");
    await uploadVia(page, "Add view", "front.png");
    await page.getByLabel("Product Name").fill("Trail running shoe");

    const details = page.getByRole("group", { name: "View details" });
    await expect(page.getByRole("button", { name: "front.png" })).toHaveAttribute("aria-pressed", "true");
    await details.getByLabel("Description").fill("Front view on a light background");
    await details.getByLabel("View").selectOption("Front");
    await details.getByLabel("Type").selectOption("Product angle");
    await expect(page.getByRole("button", { name: "Front view on a light background" })).toBeVisible();

    await details.getByRole("button", { name: "Make master" }).click();
    await expect(page.getByRole("img", { name: "Front view on a light background" })).toBeVisible();
    await expect(page.getByRole("button", { name: "side.png" })).toBeVisible();

    await save(page).click();
    await expect(save(page)).toBeDisabled();
    const saved = await savedPage(page);
    const front = saved.assets.find((a: { name: string }) => a.name === "front.png");
    expect(saved.record.masterId).toBe(front.id);
    expect(front).toMatchObject({ description: "Front view on a light background", details: { view: "Front", imageType: "Product angle" } });
  });

  test("removing the master hands the badge on; removing the last brings the empty state back", async ({ page }) => {
    await openAssets(page);
    await uploadVia(page, "Upload product image", "a.png");
    await uploadVia(page, "Add view", "b.png");
    await page.getByRole("button", { name: "Remove master image" }).click();
    await expect(page.getByRole("img", { name: "Master image: b.png" })).toBeVisible();
    await page.getByRole("button", { name: "Remove master image" }).click();
    await expect(page.getByText("No product image added yet.")).toBeVisible();
  });

  test("Save asks for the master and the product name first, and blocks nothing else", async ({ page }) => {
    await openAssets(page);
    await page.getByLabel("SKU / Product ID").fill("X1");
    await save(page).click();
    await expect(page.getByRole("alert").filter({ hasText: "Add a Master Product Image and Product Name before saving." })).toBeVisible();
    await expect(page.getByText("Add the product name.")).toBeVisible();
    await expect(page.locator(".assets-empty.is-missing")).toBeVisible();
    expect((await savedPage(page)).record.sku).toBe("");

    // Only Save is blocked: the rest of the app stays open (after the leave prompt).
    await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
    await page.getByRole("button", { name: "Discard" }).click();
    await expect(page.getByRole("heading", { name: "Assets", level: 1 })).toHaveCount(0);
  });

  test("Cancel restores the saved page and removes unsaved uploads", async ({ page }) => {
    await openAssets(page);
    await uploadVia(page, "Upload product image", "keep.png");
    await page.getByLabel("Product Name").fill("Shoe");
    await save(page).click();
    await expect(save(page)).toBeDisabled();
    const before = await assetIds(page);

    await uploadVia(page, "Add view", "unsaved.png");
    await page.getByLabel("Product Name").fill("Changed");
    expect((await assetIds(page)).length).toBe(before.length + 1);
    await saveBar(page).getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByLabel("Product Name")).toHaveValue("Shoe");
    await expect(page.getByRole("button", { name: "unsaved.png" })).toHaveCount(0);
    await expect.poll(() => assetIds(page)).toEqual(before);
  });

  test("leaving with unsaved changes asks first; Discard removes the unsaved upload", async ({ page }) => {
    await openAssets(page);
    const before = await assetIds(page);
    await uploadVia(page, "Upload product image", "draft.png");
    await page.locator(".sidebar-item", { hasText: "Skills" }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText("Discard changes?");
    await page.getByRole("button", { name: "Keep editing" }).click();
    await expect(page.getByRole("img", { name: "Master image: draft.png" })).toBeVisible();

    await page.locator(".sidebar-item", { hasText: "Skills" }).click();
    await page.getByRole("button", { name: "Discard" }).click();
    await expect(page.getByRole("heading", { name: "Skills", level: 1 })).toBeVisible();
    await expect.poll(() => assetIds(page)).toEqual(before);
  });

  test("refuses a type other than PNG or JPG", async ({ page }) => {
    await openAssets(page);
    await uploadVia(page, "Upload product image", "anim.gif", GIF, "image/gif");
    await expect(page.getByRole("alert").filter({ hasText: "Product images must be PNG or JPG." })).toBeVisible();
    await expect(page.getByText("No product image added yet.")).toBeVisible();
  });

  test("says when the page can't load, and Retry loads it", async ({ page }) => {
    // Every load fails until Retry: in development the page mounts twice and
    // only the newer load counts, so failing just the first wouldn't show.
    let failing = true;
    await page.route("**/api/proxy/brand-assets", (route) => {
      if (route.request().method() === "GET" && failing) {
        return route.fulfill({ status: 500, json: { message: "Loading assets failed (500)" } });
      }
      return route.fallback();
    });
    await page.locator(".sidebar-item", { hasText: "Assets" }).click();
    await expect(page.locator(".assets-alert")).toContainText("Loading assets failed");
    failing = false;
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("No product image added yet.")).toBeVisible();
  });

  test("the page is the same at 50%, 100% and 150% zoom", async ({ page }) => {
    for (const z of [0.5, 1.5, 1]) {
      await setZoom(page, z);
      await openAssets(page);
      await expect(page.getByRole("heading", { name: "1 · Product / Master Creative", level: 2 })).toBeVisible();
      await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
    }
  });
});
