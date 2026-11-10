import { test, expect, type Page } from "@playwright/test";
import { imageBox, makePng, openBoard, reloadBoard, setZoom } from "./helpers";

// The master image from Assets onto the board (#446): placed by its stored
// URL at the centre of the visible board, named after the product.

const NO_COLOURS = { primary: "", secondary: "", accent: "" };

/** A saved Assets page with one master image; returns the master's id. */
async function saveMaster(page: Page, productName: string): Promise<string> {
  const up = await page.request.post("/api/proxy/assets?kind=productImage&name=front-view.png", {
    headers: { "Content-Type": "image/png" },
    data: makePng(800, 600, [200, 120, 60]),
  });
  const { id } = await up.json();
  const current = await (await page.request.get("/api/proxy/brand-assets")).json();
  const res = await page.request.put("/api/proxy/brand-assets", {
    data: { revision: current.revision, productName, sku: "", masterId: id, colours: NO_COLOURS, assetIds: [id] },
  });
  expect(res.ok()).toBe(true);
  return id;
}

async function openAssets(page: Page) {
  await page.locator(".sidebar-item", { hasText: "Assets" }).click();
  await expect(page.getByRole("heading", { name: "Assets", level: 1 })).toBeVisible();
}

const placeButton = (page: Page) => page.getByRole("button", { name: "Place on the board" });
const images = (page: Page) => page.evaluate(() => (window as any).Konva.stages[0].find("Image").length as number);

test.describe("Master image onto the board", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
    // Uploads an earlier test left unsaved are not this test's.
    await page.request.delete("/api/proxy/brand-assets/pending");
  });

  test("places the saved master at the centre, named after the product, by its stored URL", async ({ page }) => {
    const id = await saveMaster(page, "Trail running shoe");
    const before = await images(page);
    await openAssets(page);
    await placeButton(page).click();

    await expect(page.locator(".sidebar-item-active")).toHaveText(/Playspace/);
    await expect.poll(() => images(page)).toBe(before + 1);
    await expect(page.getByText("Trail running shoe", { exact: true })).toBeVisible();
    const src = await page.evaluate(() => {
      const all = (window as any).Konva.stages[0].find("Image");
      return all[all.length - 1].image().src as string;
    });
    expect(src).toContain(id);

    // Centred in the board beside the rail, at its natural size (800 is under the cap).
    const box = await imageBox(page, before);
    const rail = (await page.locator(".sidebar").boundingBox())!;
    const view = page.viewportSize()!;
    expect(Math.abs(box.x + box.w / 2 - (rail.x + rail.width + (view.width - rail.x - rail.width) / 2))).toBeLessThan(4);
    expect(Math.abs(box.y + box.h / 2 - view.height / 2)).toBeLessThan(4);
  });

  test("twice gives two, the second (2); undo takes the last back; a reload keeps it", async ({ page }) => {
    await saveMaster(page, "Trail running shoe");
    const before = await images(page);
    for (let i = 0; i < 2; i++) {
      await openAssets(page);
      await placeButton(page).click();
      await expect.poll(() => images(page)).toBe(before + i + 1);
    }
    await expect(page.getByText("Trail running shoe (2)", { exact: true })).toBeVisible();

    await page.mouse.click(1300, 120);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => images(page)).toBe(before + 1);

    await reloadBoard(page, { shapes: before + 1 });
    expect(await images(page)).toBe(before + 1);
    await expect(page.getByText("Trail running shoe", { exact: true })).toBeVisible();
  });

  test("no product name: named after the file", async ({ page }) => {
    await saveMaster(page, "");
    await openAssets(page);
    await placeButton(page).click();
    await expect(page.getByText("front-view", { exact: true })).toBeVisible();
  });

  test("unsaved changes: disabled, with the reason, until saved", async ({ page }) => {
    await saveMaster(page, "Trail running shoe");
    await openAssets(page);
    await expect(placeButton(page)).toBeEnabled();
    await page.getByLabel(/Product Name/).fill("Trail running shoe v2");
    await expect(placeButton(page)).toBeDisabled();
    await expect(placeButton(page)).toHaveAccessibleDescription("Save your changes first to place it on the board.");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(placeButton(page)).toBeEnabled();
  });

  test("lands in the centre at 50% and 150% too", async ({ page }) => {
    await saveMaster(page, "Trail running shoe");
    for (const z of [0.5, 1.5]) {
      await setZoom(page, z);
      const before = await images(page);
      await openAssets(page);
      await placeButton(page).click();
      await expect.poll(() => images(page)).toBe(before + 1);
      const box = await imageBox(page, before);
      const rail = (await page.locator(".sidebar").boundingBox())!;
      const view = page.viewportSize()!;
      expect(Math.abs(box.x + box.w / 2 - (rail.x + rail.width + (view.width - rail.x - rail.width) / 2))).toBeLessThan(4);
      expect(Math.abs(box.y + box.h / 2 - view.height / 2)).toBeLessThan(4);
    }
  });
});
