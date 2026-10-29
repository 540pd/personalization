import { test, expect, type Page } from "@playwright/test";
import { makePng, openBoard, setZoom } from "./helpers";

// Creatives to adapt from and style examples on the Assets page (#416): tiles
// with inline details, named after their file to start with, saved with the
// page.

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
const nextPng = () => makePng(16, 16, [shade++ % 256, 140, 60]);

/** Picks files in the dialog `button` opens, and waits for them to be stored. */
async function choose(page: Page, button: string, names: string[]) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: button }).click();
  await (await chooser).setFiles(names.map((name) => ({ name, mimeType: "image/png", buffer: nextPng() })));
  await expect(page.locator(".assets-overlay")).toHaveCount(0);
}

const adaptFrom = (page: Page) => page.getByRole("group", { name: "Adapt from (optional)" });
const examples = (page: Page) => page.getByRole("group", { name: "Style examples (optional)" });
const save = (page: Page) => page.getByRole("button", { name: "Save assets" });
const savedPage = async (page: Page) => (await page.request.get("/api/proxy/brand-assets")).json();

test.describe("Assets creatives", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
    await resetAssets(page);
  });

  test("both groups start empty, Adapt from last in section 1 and Style examples in section 2", async ({ page }) => {
    await openAssets(page);
    await expect(adaptFrom(page)).toContainText(
      "An existing hero or campaign creative to start from: Content Studio keeps its layout and adapts it.",
    );
    await expect(adaptFrom(page).getByRole("button", { name: "Add existing creative" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "2 · Brand Assets", level: 2 })).toBeVisible();
    await expect(examples(page)).toContainText(
      "Approved work that shows how the brand usually looks: Content Studio matches the style, not the layout.",
    );
    await expect(examples(page).getByRole("button", { name: "Add example" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Creative details" })).toHaveCount(0);
    // Section order: Adapt from inside section 1, the examples inside section 2.
    const sections = page.locator(".assets-section");
    await expect(sections.nth(0).getByRole("group", { name: "Adapt from (optional)" })).toBeVisible();
    await expect(sections.nth(1).getByRole("group", { name: "Style examples (optional)" })).toBeVisible();
  });

  test("a creative to adapt from: named after its file, details saved and kept after a reload", async ({ page }) => {
    await openAssets(page);
    await choose(page, "Upload product image", ["shoe.png"]);
    await page.getByLabel("Product Name").fill("Trail running shoe");
    await choose(page, "Add existing creative", ["spring-kv.png"]);

    const details = page.getByRole("group", { name: "Creative details" });
    await expect(details.getByLabel("Name")).toHaveValue("spring-kv");
    await expect(details.getByLabel("Description")).toHaveAttribute("placeholder", "Runner crossing a bridge at dawn, headline top left");
    await details.getByLabel("Name").fill("Spring key visual");
    await details.getByLabel("Creative type").selectOption("Campaign key visual");
    await details.getByLabel("Aspect ratio").selectOption("16:9");
    await details.getByLabel("Description").fill("Runner on a bridge, headline top left");
    await expect(adaptFrom(page).getByRole("button", { name: "Spring key visual" })).toBeVisible();
    // Not a product image: the master stays as it was.
    await expect(page.getByRole("img", { name: "Master image: shoe.png" })).toBeVisible();

    await save(page).click();
    await expect(save(page)).toBeDisabled();
    const saved = await savedPage(page);
    expect(saved.assets.find((a: { kind: string }) => a.kind === "adaptFrom")).toMatchObject({
      name: "spring-kv.png",
      description: "Runner on a bridge, headline top left",
      details: { name: "Spring key visual", creativeType: "Campaign key visual", aspectRatio: "16:9" },
    });

    await page.reload();
    await page.waitForFunction(() => !!(window as any).Konva?.stages?.length);
    await page.locator(".sidebar-item", { hasText: "Assets" }).click();
    await expect(page.getByRole("group", { name: "Creative details" }).getByLabel("Aspect ratio")).toHaveValue("16:9");
  });

  test("several style examples; selecting one opens its details; Remove", async ({ page }) => {
    await openAssets(page);
    await choose(page, "Add example", ["social.png", "story.png"]);
    await expect(examples(page).locator(".assets-tile")).toHaveCount(2);
    const details = page.getByRole("group", { name: "Example details" });
    await expect(details.getByLabel("Name")).toHaveValue("social");

    await examples(page).getByRole("button", { name: "story" }).click();
    await expect(examples(page).getByRole("button", { name: "story" })).toHaveAttribute("aria-pressed", "true");
    await expect(details.getByLabel("Name")).toHaveValue("story");
    await details.getByLabel("Example type").selectOption("Typography reference");
    await expect(details.getByLabel("Description")).toHaveAttribute("placeholder", "Bright flat colour, product centred, short headline");

    await details.getByRole("button", { name: "Remove" }).click();
    await expect(examples(page).locator(".assets-tile")).toHaveCount(1);
    await expect(details.getByLabel("Name")).toHaveValue("social");
    // No product image yet, so none became the master.
    await expect(page.getByText("No product image added yet.")).toBeVisible();
  });

  test("Cancel restores both groups", async ({ page }) => {
    await openAssets(page);
    await choose(page, "Upload product image", ["shoe.png"]);
    await page.getByLabel("Product Name").fill("Shoe");
    await choose(page, "Add example", ["kept.png"]);
    await save(page).click();
    await expect(save(page)).toBeDisabled();

    await page.getByRole("group", { name: "Example details" }).getByLabel("Name").fill("Renamed");
    await choose(page, "Add existing creative", ["unsaved.png"]);
    await page.getByRole("region", { name: "Save assets" }).getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("group", { name: "Example details" }).getByLabel("Name")).toHaveValue("kept");
    await expect(adaptFrom(page).locator(".assets-tile")).toHaveCount(0);
  });

  test("an image dropped on a group joins that group; a paste joins the group with focus", async ({ page }) => {
    await openAssets(page);
    const bytes = [...nextPng()];
    await page.evaluate((bytes) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], "dropped.png", { type: "image/png" }));
      const target = document.querySelector('[data-asset-kind="styleExample"]')!;
      for (const type of ["dragenter", "dragover", "drop"]) {
        target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      }
    }, bytes);
    await expect(examples(page).getByRole("button", { name: "dropped" })).toBeVisible();

    await adaptFrom(page).getByRole("button", { name: "Add existing creative" }).focus();
    const pasted = [...nextPng()];
    await page.evaluate((bytes) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], "pasted.png", { type: "image/png" }));
      window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, pasted);
    await expect(adaptFrom(page).getByRole("button", { name: "pasted" })).toBeVisible();
    await expect(page.getByText("No product image added yet.")).toBeVisible();
  });

  test("a wrong type is refused in the group it was meant for", async ({ page }) => {
    await openAssets(page);
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Add example" }).click();
    await (await chooser).setFiles({ name: "anim.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
    await expect(examples(page).getByRole("alert")).toHaveText("anim.gif: style examples must be PNG or JPG.");
  });

  test("works the same at 50%, 100% and 150% zoom", async ({ page }) => {
    for (const z of [0.5, 1.5, 1]) {
      await setZoom(page, z);
      await page.locator(".sidebar-item", { hasText: "Assets" }).click();
      await expect(examples(page)).toBeVisible();
      await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
    }
  });
});
