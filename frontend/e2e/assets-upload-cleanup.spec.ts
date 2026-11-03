import { test, expect, type Page } from "@playwright/test";
import { logoNotMandatory, makePng, openBoard } from "./helpers";

// What Cancel and Discard leave behind of uploads that failed or were still
// on their way (#463): nothing, on the server or on the page.

const BIG = (shade: number) => makePng(1600, 1000, [shade, shade, shade]);

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

async function paste(page: Page, name: string, buffer: Buffer) {
  await page.evaluate(
    ({ name, bytes }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], name, { type: "image/png" }));
      window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    { name, bytes: [...buffer] },
  );
}

/** Holds the page's uploads until `release()`; `failNext()` makes the next one fail. */
async function holdUploads(page: Page) {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let fail = 0;
  await page.route("**/api/proxy/assets?*", async (route) => {
    if (fail > 0) {
      fail--;
      return route.fulfill({ status: 500, json: { error: "broken" } });
    }
    await held;
    await route.fallback();
  });
  return { release, failNext: () => void fail++ };
}

/** The user's stored assets named `name`. */
async function stored(page: Page, name: string): Promise<number> {
  const all = (await (await page.request.get("/api/proxy/assets")).json()) as { name: string }[];
  return all.filter((a) => a.name === name).length;
}

const deleteOfOne = (page: Page) =>
  page.waitForRequest((r) => r.method() === "DELETE" && /\/api\/proxy\/assets\/[^/?]+$/.test(r.url()));

const saveBar = (page: Page) => page.getByRole("region", { name: "Save assets" });

test.describe("Assets upload clean-up (#463)", () => {
  let errors: string[];

  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await openBoard(page);
    await resetAssets(page);
    await logoNotMandatory(page);
  });

  test("Cancel while an upload is on its way: it is deleted when it lands, and never shows", async ({ page }) => {
    const uploads = await holdUploads(page);
    await openAssets(page);
    await paste(page, "late-cancel.png", BIG(90));
    await expect(page.locator(".assets-master .assets-overlay")).toContainText("Uploading…");
    await saveBar(page).getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("No product image added yet.")).toBeVisible();

    const deleted = deleteOfOne(page);
    uploads.release();
    await deleted;
    await expect.poll(() => stored(page, "late-cancel.png")).toBe(0);
    await expect(page.getByText("No product image added yet.")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("Cancel with one upload failed and one on its way: both tiles go, nothing is left stored", async ({ page }) => {
    const uploads = await holdUploads(page);
    uploads.failNext();
    await openAssets(page);
    await paste(page, "failed.png", BIG(100));
    await expect(page.locator(".assets-master .assets-overlay")).toContainText("Couldn't save it");
    await paste(page, "on-its-way.png", BIG(110));
    await expect(page.getByRole("status").filter({ hasText: "Uploading on-its-way.png" })).toBeVisible();
    await saveBar(page).getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("No product image added yet.")).toBeVisible();

    const deleted = deleteOfOne(page);
    uploads.release();
    await deleted;
    await expect.poll(() => stored(page, "on-its-way.png")).toBe(0);
    expect(await stored(page, "failed.png")).toBe(0);
    // The browser logs the 500 this test sends itself; nothing else.
    expect(errors.filter((e) => !e.includes("status of 500"))).toEqual([]);
  });

  test("Discard on leaving while an upload is on its way: it is deleted when it lands", async ({ page }) => {
    const uploads = await holdUploads(page);
    await openAssets(page);
    await paste(page, "late-discard.png", BIG(120));
    await expect(page.locator(".assets-master .assets-overlay")).toContainText("Uploading…");
    await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
    await page.getByRole("button", { name: "Discard" }).click();
    await expect(page.getByRole("heading", { name: "Assets", level: 1 })).toHaveCount(0);

    const deleted = deleteOfOne(page);
    uploads.release();
    await deleted;
    await expect.poll(() => stored(page, "late-discard.png")).toBe(0);

    // Opening the page again shows nothing extra.
    await openAssets(page);
    await expect(page.locator(".assets-tile")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("an upload that lands normally is kept", async ({ page }) => {
    await openAssets(page);
    await paste(page, "kept.png", BIG(130));
    await expect(page.locator(".assets-master-frame img")).toHaveAttribute("src", /\/api\/proxy\/assets\//);
    await page.getByLabel("Product Name").fill("Shoe");
    await saveBar(page).getByRole("button", { name: "Save assets" }).click();
    await expect(saveBar(page).getByRole("button", { name: "Save assets" })).toBeDisabled();
    expect(await stored(page, "kept.png")).toBe(1);
    expect(errors).toEqual([]);
  });
});
