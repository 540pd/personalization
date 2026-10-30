import { test, expect, type Page } from "@playwright/test";
import { logoNotMandatory, makePng, openBoard } from "./helpers";

// Brand guidelines on Assets (#450): Markdown files in section 2 · Brand,
// each with a name, type and note, saved with the page.

const NO_COLOURS = { primary: "", secondary: "", accent: "" };
const RULES = "# Brand rules\n\n- Logo on light backgrounds only\n- Primary blue #1A2B3C\n";
const md = (name: string, text = RULES) => ({ name, mimeType: "text/markdown", buffer: Buffer.from(text, "utf-8") });

/** A saved page with a master and a product name, so Save assets is allowed. */
async function savedPage(page: Page) {
  const up = await page.request.post("/api/proxy/assets?kind=productImage&name=front.png", {
    headers: { "Content-Type": "image/png" },
    data: makePng(32, 32),
  });
  const { id } = await up.json();
  const current = await (await page.request.get("/api/proxy/brand-assets")).json();
  await page.request.put("/api/proxy/brand-assets", {
    data: { revision: current.revision, productName: "Trail shoe", sku: "", masterId: id, colours: NO_COLOURS, assetIds: [id] },
  });
}

async function openAssets(page: Page) {
  await page.locator(".sidebar-item", { hasText: "Assets" }).click();
  await expect(page.getByRole("heading", { name: "Assets", level: 1 })).toBeVisible();
}

const group = (page: Page) => page.getByRole("group", { name: /Brand guidelines/ });
const rows = (page: Page) => group(page).locator(".assets-doc");

async function upload(page: Page, files: ReturnType<typeof md>[]) {
  const chooser = page.waitForEvent("filechooser");
  await group(page).getByRole("button", { name: "+ Upload guidelines" }).click();
  await (await chooser).setFiles(files);
}

const savedGuidelines = async (page: Page) => {
  const view = await (await page.request.get("/api/proxy/brand-assets")).json();
  return (view.assets as { kind: string; details: Record<string, string> }[]).filter((a) => a.kind === "guidelines");
};

test.describe("Brand guidelines", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
    await page.request.delete("/api/proxy/brand-assets/pending");
    await savedPage(page);
    await logoNotMandatory(page);
    await openAssets(page);
  });

  test("uploads Markdown files as rows, named from the file; Save keeps them", async ({ page }) => {
    await expect(group(page)).toContainText("Your brand's rules as Markdown files: logo use, colours, typography, tone. Generation will follow them.");
    await expect(group(page)).toContainText("Markdown (.md) · up to 100 KB · export a PDF to Markdown first");
    // Different text: the same file twice is refused as already here.
    await upload(page, [md("Brand book.md"), md("logo-rules.md", "# Logo\n\nClear space: the height of the B.\n")]);
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).nth(0).getByLabel("Name")).toHaveValue("Brand book");
    await expect(rows(page).nth(0).getByLabel("Type")).toHaveValue("Brand Guidelines");
    await expect(rows(page).nth(1)).toContainText("logo-rules.md");
    await expect(group(page).getByText("Uploading…")).toHaveCount(0);

    await rows(page).nth(1).getByLabel("Name").fill("Logo rules");
    await rows(page).nth(1).getByLabel("Type").selectOption("Logo Guidelines");
    await rows(page).nth(1).getByLabel(/Note/).fill("2026 edition");
    await page.getByRole("button", { name: "Save assets" }).click();
    await expect(page.getByText("Unsaved changes")).toHaveCount(0);

    const saved = await savedGuidelines(page);
    expect(saved.map((g) => g.details)).toEqual([
      { title: "Brand book", docType: "Brand Guidelines" },
      { title: "Logo rules", docType: "Logo Guidelines", note: "2026 edition" },
    ]);
  });

  test("refuses what is not Markdown text, and keeps the rest of the pick", async ({ page }) => {
    await upload(page, [
      { name: "book.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7") },
      md("huge.md", "a".repeat(100 * 1024 + 1)),
      { name: "old.md", mimeType: "text/markdown", buffer: Buffer.from([0x43, 0x61, 0x66, 0xe9]) },
      md("empty.md", ""),
      md("good.md"),
    ]);
    const alert = group(page).getByRole("alert");
    await expect(alert).toContainText("book.pdf: only Markdown (.md) files.");
    await expect(alert).toContainText("huge.md: too large, up to 100 KB.");
    await expect(alert).toContainText("old.md: this file isn't plain text.");
    await expect(alert).toContainText("empty.md: this file is empty.");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).getByLabel("Name")).toHaveValue("good");
  });

  test("Cancel takes back an unsaved upload; Remove and Save take off a saved one", async ({ page }) => {
    await upload(page, [md("draft.md")]);
    await expect(rows(page)).toHaveCount(1);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(rows(page)).toHaveCount(0);

    await upload(page, [md("kept.md")]);
    await page.getByRole("button", { name: "Save assets" }).click();
    await expect(page.getByText("Unsaved changes")).toHaveCount(0);
    expect(await savedGuidelines(page)).toHaveLength(1);
    await rows(page).getByRole("button", { name: "Remove" }).click();
    await page.getByRole("button", { name: "Save assets" }).click();
    await expect(page.getByText("Unsaved changes")).toHaveCount(0);
    expect(await savedGuidelines(page)).toHaveLength(0);
  });

  test("Preview shows the stored text, in a box that scrolls", async ({ page }) => {
    const long = RULES + Array.from({ length: 80 }, (_, i) => `- Rule ${i + 1}`).join("\n");
    await upload(page, [md("long.md", long)]);
    const toggle = rows(page).getByRole("button", { name: "Preview" });
    await toggle.click();
    const box = rows(page).getByLabel("Preview");
    await expect(box).toContainText("- Logo on light backgrounds only");
    await expect(box).toContainText("- Rule 80");
    expect(await box.evaluate((el) => el.scrollHeight > el.clientHeight && el.clientHeight <= 320)).toBe(true);
    await rows(page).getByRole("button", { name: "Hide preview" }).click();
    await expect(box).toHaveCount(0);
  });

  test("a failed upload says so and Retry sends it again", async ({ page }) => {
    let fail = true;
    await page.route(/\/api\/proxy\/assets\?kind=guidelines/, async (route) => {
      if (fail) {
        fail = false;
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Couldn't upload it." }) });
      } else await route.continue();
    });
    await upload(page, [md("brand.md")]);
    await expect(rows(page).getByRole("alert")).toHaveText("Couldn't upload it.");
    await rows(page).getByRole("button", { name: "Retry" }).click();
    await expect(rows(page).getByRole("button", { name: "Preview" })).toBeVisible();
  });

  test("dropped Markdown files join; a dropped image is refused here", async ({ page }) => {
    await group(page).evaluate((el) => {
      const dt = new DataTransfer();
      dt.items.add(new File(["# Rules"], "dropped.md", { type: "" }));
      dt.items.add(new File([new Uint8Array([0x89, 0x50])], "photo.png", { type: "image/png" }));
      for (const type of ["dragenter", "dragover", "drop"]) el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).getByLabel("Name")).toHaveValue("dropped");
    await expect(group(page).getByRole("alert")).toContainText("photo.png: only Markdown (.md) files.");
  });
});
