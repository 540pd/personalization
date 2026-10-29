import { test, expect, type Page } from "@playwright/test";
import { logoNotMandatory, makePng, openBoard, setZoom } from "./helpers";

// Creative references on the Assets page (#418): a library of backgrounds,
// scenes and mood boards, each with its type, how it is used and whether
// every campaign uses it; filtered by type; saved with the page.

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

let shade = 0;
const nextPng = () => makePng(16, 16, [60, shade++ % 256, 180]);

async function choose(page: Page, button: string, names: string[]) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: button }).click();
  await (await chooser).setFiles(names.map((name) => ({ name, mimeType: "image/png", buffer: nextPng() })));
  await expect(page.locator(".assets-overlay")).toHaveCount(0);
}

const section = (page: Page) => page.getByRole("region", { name: "3 · Creative references" });
const details = (page: Page) => page.getByRole("group", { name: "Reference details" });
const tile = (page: Page, name: string) => section(page).getByRole("button", { name: new RegExp(`^${name}`) });
const filters = (page: Page) => page.getByRole("group", { name: "Show references" });
const save = (page: Page) => page.getByRole("button", { name: "Save assets" });

test.describe("Assets creative references", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
    await resetAssets(page);
    await logoNotMandatory(page);
  });

  test("an empty library: the section, its note, no filters", async ({ page }) => {
    await openAssets(page);
    await expect(section(page).getByText("Optional", { exact: true })).toBeVisible();
    await expect(section(page)).toContainText(
      "Backgrounds, scenes and mood boards that guide how creatives look. Keep them here once; each campaign picks the ones it needs.",
    );
    await expect(section(page)).toContainText(
      'Inspiration references guide the look; Content Studio won\'t copy them. Use "As is" only for images you own or have licensed.',
    );
    await expect(section(page).getByRole("button", { name: "Add reference" })).toBeVisible();
    await expect(filters(page)).toHaveCount(0);
    await expect(details(page)).toHaveCount(0);
  });

  test("a new reference: scene, inspiration, picked by campaigns; a type change resets its use, a choice is kept", async ({ page }) => {
    await openAssets(page);
    await choose(page, "Add reference", ["street.png"]);
    await expect(details(page).getByLabel("Reference type")).toHaveValue("Scene / environment");
    await expect(details(page).getByRole("radio", { name: /^Inspiration only/ })).toBeChecked();
    await expect(details(page).getByRole("radio", { name: /^When a campaign picks it/ })).toBeChecked();
    await expect(details(page).getByLabel("Description")).toHaveAttribute("placeholder", "Wet city street at dusk, neon reflections");
    await expect(tile(page, "street.png")).toContainText("Scene / environment");

    await details(page).getByLabel("Reference type").selectOption("Background");
    await expect(details(page).getByRole("radio", { name: /^As is/ })).toBeChecked();
    await details(page).getByRole("radio", { name: /^Inspiration only/ }).check();
    await details(page).getByLabel("Description").fill("Wet city street at dusk");
    await expect(details(page).getByRole("radio", { name: /^Inspiration only/ })).toBeChecked();
    await details(page).getByLabel("Reference type").selectOption("Texture / pattern");
    await expect(details(page).getByRole("radio", { name: /^As is/ })).toBeChecked();
    await details(page).getByLabel("Reference type").selectOption("Mood board");
    await expect(details(page).getByRole("radio", { name: /^Inspiration only/ })).toBeChecked();
  });

  test("Always shows a badge; filters by type; saved and kept after a reload", async ({ page }) => {
    await openAssets(page);
    await choose(page, "Upload product image", ["shoe.png"]);
    await page.getByLabel("Product Name").fill("Shoe");
    await choose(page, "Add reference", ["street.png", "studio.png", "board.png"]);

    await tile(page, "studio.png").click();
    await details(page).getByLabel("Reference type").selectOption("Background");
    await details(page).getByRole("radio", { name: /^Always/ }).check();
    await expect(tile(page, "studio.png").getByText("Always", { exact: true })).toBeVisible();
    await details(page).getByRole("radio", { name: /^When a campaign picks it/ }).check();
    await expect(tile(page, "studio.png").getByText("Always", { exact: true })).toHaveCount(0);
    await details(page).getByRole("radio", { name: /^Always/ }).check();

    await tile(page, "board.png").click();
    await details(page).getByLabel("Reference type").selectOption("Mood board");

    // Filters: All, then each type in use, in the type list's order.
    await expect(filters(page).getByRole("button")).toHaveText(["All", "Background", "Scene / environment", "Mood board"]);
    await filters(page).getByRole("button", { name: "Background" }).click();
    await expect(filters(page).getByRole("button", { name: "Background" })).toHaveAttribute("aria-pressed", "true");
    await expect(section(page).locator(".assets-tile")).toHaveCount(1);
    await expect(details(page).getByLabel("Reference type")).toHaveValue("Background");
    await filters(page).getByRole("button", { name: "All" }).click();
    await expect(section(page).locator(".assets-tile")).toHaveCount(3);

    await save(page).click();
    await expect(save(page)).toBeDisabled();
    const saved = await (await page.request.get("/api/proxy/brand-assets")).json();
    const refs = saved.assets.filter((a: { kind: string }) => a.kind === "reference");
    expect(refs.map((r: { name: string; details: object }) => [r.name, r.details])).toEqual([
      ["street.png", { referenceType: "Scene / environment", use: "inspiration", scope: "picked" }],
      ["studio.png", { referenceType: "Background", use: "asIs", scope: "always" }],
      ["board.png", { referenceType: "Mood board", use: "inspiration", scope: "picked" }],
    ]);

    await page.reload();
    await page.waitForFunction(() => !!(window as any).Konva?.stages?.length);
    await page.locator(".sidebar-item", { hasText: "Assets" }).click();
    await expect(tile(page, "studio.png").getByText("Always", { exact: true })).toBeVisible();
  });

  test("a filter whose last reference changes type shows everything again; Remove; Cancel restores", async ({ page }) => {
    await openAssets(page);
    await choose(page, "Upload product image", ["shoe.png"]);
    await page.getByLabel("Product Name").fill("Shoe");
    await choose(page, "Add reference", ["a.png", "b.png"]);
    await save(page).click();
    await expect(save(page)).toBeDisabled();

    await details(page).getByLabel("Reference type").selectOption("Lighting");
    await filters(page).getByRole("button", { name: "Lighting" }).click();
    await details(page).getByLabel("Reference type").selectOption("Other");
    await expect(filters(page).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");

    await details(page).getByRole("button", { name: "Remove reference" }).click();
    await expect(section(page).locator(".assets-tile")).toHaveCount(1);
    await page.getByRole("region", { name: "Save assets" }).getByRole("button", { name: "Cancel" }).click();
    await expect(section(page).locator(".assets-tile")).toHaveCount(2);
    await expect(details(page).getByLabel("Reference type")).toHaveValue("Scene / environment");
  });

  test("works the same at 50%, 100% and 150% zoom", async ({ page }) => {
    for (const z of [0.5, 1.5, 1]) {
      await setZoom(page, z);
      await page.locator(".sidebar-item", { hasText: "Assets" }).click();
      await expect(section(page)).toBeVisible();
      await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
    }
  });
});
