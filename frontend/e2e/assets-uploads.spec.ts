import { test, expect, type Page } from "@playwright/test";
import { logoNotMandatory, makePng, openBoard, setZoom } from "./helpers";

// Adding images to the Assets page the quick way (#415): drop, paste and
// several at once, each shown while it uploads, with Retry when one fails
// and warnings for a low-resolution or duplicate image.

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

type Upload = { name: string; buffer: Buffer; mimeType?: string };

/** Drops files on `selector`, as a drag from the desktop would. */
async function drop(page: Page, selector: string, files: Upload[]) {
  const data = files.map((f) => ({ name: f.name, type: f.mimeType ?? "image/png", bytes: [...f.buffer] }));
  await page.evaluate(
    ({ selector, data }) => {
      const dt = new DataTransfer();
      for (const f of data) dt.items.add(new File([new Uint8Array(f.bytes)], f.name, { type: f.type }));
      const target = document.querySelector(selector)!;
      for (const type of ["dragenter", "dragover", "drop"]) {
        target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      }
    },
    { selector, data },
  );
}

async function paste(page: Page, file: Upload) {
  await page.evaluate(
    ({ name, bytes }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], name, { type: "image/png" }));
      window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    { name: file.name, bytes: [...file.buffer] },
  );
}

async function choose(page: Page, button: string, files: Upload[]) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: button }).click();
  await (await chooser).setFiles(files.map((f) => ({ name: f.name, mimeType: f.mimeType ?? "image/png", buffer: f.buffer })));
}

const masterImg = (page: Page) => page.locator(".assets-master-frame img");
const viewTiles = (page: Page) => page.locator(".assets-grid .assets-tile");
const save = (page: Page) => page.getByRole("button", { name: "Save assets" });

test.describe("Assets uploads", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
    await resetAssets(page);
    await logoNotMandatory(page);
  });

  test("files dropped on the empty state become the master and a view, with a drop highlight", async ({ page }) => {
    await openAssets(page);
    await expect(page.getByText("or drop or paste images here")).toBeVisible();
    // The highlight while a drag is over it.
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(["x"], "x.png", { type: "image/png" }));
      document.querySelector(".assets-empty")!.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    await expect(page.locator(".assets-empty.is-dropping")).toBeVisible();

    await drop(page, ".assets-empty", [{ name: "side.png", buffer: BIG(100) }, { name: "back.png", buffer: BIG(140) }]);
    await expect(masterImg(page)).toHaveAttribute("alt", "Master image: side.png");
    await expect(page.getByRole("button", { name: "back.png" })).toHaveAttribute("aria-pressed", "true");
    // Nothing reached the board underneath.
    expect(await page.evaluate(() => (window as any).Konva.stages[0].find(".selectable").length)).toBe(0);
  });

  test("several files chosen at once, and an image dropped on the views", async ({ page }) => {
    await openAssets(page);
    await choose(page, "Upload product image", [
      { name: "a.png", buffer: BIG(90) },
      { name: "b.png", buffer: BIG(110) },
      { name: "c.png", buffer: BIG(130) },
    ]);
    await expect(viewTiles(page)).toHaveCount(2);
    await drop(page, ".assets-views", [{ name: "d.png", buffer: BIG(150) }]);
    await expect(viewTiles(page)).toHaveCount(3);
    await expect(page.getByRole("button", { name: "d.png" })).toBeVisible();
  });

  test("a pasted image is added", async ({ page }) => {
    await openAssets(page);
    await paste(page, { name: "pasted.png", buffer: BIG(170) });
    await expect(masterImg(page)).toHaveAttribute("alt", "Master image: pasted.png");
  });

  test("an image shows while it uploads, its details editable, and keeps them when it lands", async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route("**/api/proxy/assets?*", async (route) => {
      await held;
      await route.fallback();
    });
    await openAssets(page);
    await choose(page, "Upload product image", [{ name: "slow.png", buffer: BIG(80) }]);
    await expect(page.locator(".assets-master .assets-overlay")).toContainText("Uploading…");
    await expect(save(page)).toBeDisabled();
    await page.getByLabel("Product Name").fill("Shoe");
    await page.locator(".assets-master").getByLabel("Description").fill("Typed while uploading");
    release();
    await expect(page.locator(".assets-master .assets-overlay")).toHaveCount(0);
    await expect(save(page)).toBeEnabled();
    await save(page).click();
    await expect(save(page)).toBeDisabled();
    const saved = await (await page.request.get("/api/proxy/brand-assets")).json();
    expect(saved.assets[0]).toMatchObject({ name: "slow.png", description: "Typed while uploading" });
  });

  test("a failed upload says so and Retry sends it again", async ({ page }) => {
    let failNext = true;
    await page.route("**/api/proxy/assets?*", (route) => {
      if (failNext) {
        failNext = false;
        return route.fulfill({ status: 413, json: { error: "too_large" } });
      }
      return route.fallback();
    });
    await openAssets(page);
    await choose(page, "Upload product image", [{ name: "first.png", buffer: BIG(60) }]);
    const overlay = page.locator(".assets-master .assets-overlay");
    await expect(overlay).toContainText("Couldn't save it");
    await expect(overlay).toContainText("Too large to upload (25 MB at most).");
    await overlay.getByRole("button", { name: "Retry" }).click();
    await expect(overlay).toHaveCount(0);
    await expect(masterImg(page)).toHaveAttribute("src", /\/api\/proxy\/assets\//);
  });

  test("a wrong type is refused before upload", async ({ page }) => {
    await openAssets(page);
    await drop(page, ".assets-empty", [{ name: "anim.gif", buffer: Buffer.from("GIF89a"), mimeType: "image/gif" }]);
    await expect(page.getByRole("alert").filter({ hasText: "anim.gif: product images must be PNG or JPG." })).toBeVisible();
    await expect(page.getByText("No product image added yet.")).toBeVisible();
  });

  test("a small image is flagged as low resolution, on its tile and in its details", async ({ page }) => {
    await openAssets(page);
    await choose(page, "Upload product image", [
      { name: "big.png", buffer: BIG(100) },
      { name: "small.png", buffer: makePng(640, 480) },
    ]);
    const tile = page.locator(".assets-tile-wrap").filter({ has: page.getByRole("button", { name: "small.png" }) });
    await expect(tile.getByLabel("Low resolution")).toBeVisible();
    await expect(page.getByRole("group", { name: "View details" }).getByRole("status")).toContainText(
      "This image is 640 px wide. Generated images may look soft; 1500 px or more works best.",
    );
    // The big one has no warning, and nothing is blocked.
    await expect(page.locator(".assets-master .assets-warning")).toHaveCount(0);
  });

  test("the same image twice is added once", async ({ page }) => {
    await openAssets(page);
    const same = BIG(200);
    await choose(page, "Upload product image", [{ name: "one.png", buffer: same }]);
    await expect(masterImg(page)).toHaveAttribute("src", /\/api\/proxy\/assets\//);
    await paste(page, { name: "copy.png", buffer: same });
    await expect(page.getByRole("alert").filter({ hasText: "copy.png: this image is already here." })).toBeVisible();
    await expect(viewTiles(page)).toHaveCount(0);
  });

  test("works the same at 50%, 100% and 150% zoom", async ({ page }) => {
    for (const z of [0.5, 1.5, 1]) {
      await setZoom(page, z);
      await page.locator(".sidebar-item", { hasText: "Assets" }).click();
      await expect(page.getByText("or drop or paste images here")).toBeVisible();
      await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
    }
  });
});
