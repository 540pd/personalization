import { test, expect, type Page } from "@playwright/test";
import { makePng, openBoard, setZoom } from "./helpers";

// Section 2 of the Assets page (#417): the logo on light and dark with its
// transparency check, brand colours with suggestions from the logo, and the
// Campaign Brief's Logo switch (#409) deciding whether Save asks for one.

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

/** A logo drawn in the page: an orange dot and a navy bar, on nothing or (`solid`) on white. */
async function logoPng(page: Page, solid: boolean, seed = 0): Promise<Buffer> {
  const bytes = await page.evaluate(
    async ({ solid, seed }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 300;
      canvas.height = 100;
      const g = canvas.getContext("2d")!;
      if (solid) {
        g.fillStyle = "#ffffff";
        g.fillRect(0, 0, 300, 100);
      }
      g.fillStyle = "#E4572E";
      g.fillRect(10, 10, 80, 80);
      g.fillStyle = "#17324D";
      g.fillRect(110, 30, 180 - seed, 40);
      const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/png"));
      return [...new Uint8Array(await blob.arrayBuffer())];
    },
    { solid, seed },
  );
  return Buffer.from(bytes);
}

async function choose(page: Page, button: string, name: string, buffer: Buffer, mimeType = "image/png") {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: button }).click();
  await (await chooser).setFiles({ name, mimeType, buffer });
  await expect(page.locator(".assets-overlay")).toHaveCount(0);
}

/** A product image and name, so Save asks for nothing else. */
async function addProduct(page: Page) {
  await choose(page, "Upload product image", "shoe.png", makePng(16, 16, [40, 80, 120]));
  await page.getByLabel("Product Name").fill("Trail running shoe");
}

const logoGroup = (page: Page) => page.getByRole("group", { name: "Logo", exact: true });
const colours = (page: Page) => page.getByRole("group", { name: "Brand colours" });
const save = (page: Page) => page.getByRole("button", { name: "Save assets" });
const savedPage = async (page: Page) => (await page.request.get("/api/proxy/brand-assets")).json();

test.describe("Assets brand section", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
    await resetAssets(page);
  });

  test("no logo yet: the brief's rule, the empty state, guidelines to upload; PNG only", async ({ page }) => {
    await openAssets(page);
    await expect(page.getByRole("heading", { name: "2 · Brand Assets", level: 2 })).toBeVisible();
    await expect(logoGroup(page)).toContainText("PNG with a transparent background. Required: Logo is mandatory in the Campaign Brief.");
    await expect(logoGroup(page)).toContainText("No logo added.");
    await expect(logoGroup(page)).toContainText("Add your primary logo if branding is required for this campaign.");
    // Guidelines are uploaded here now (#450), no longer coming soon.
    await expect(page.getByRole("button", { name: "+ Upload guidelines" })).toBeEnabled();
    await expect(page.getByText("Coming soon")).toHaveCount(0);
    await expect(colours(page).getByText("Suggested from your logo:")).toHaveCount(0);

    await choose(page, "Upload logo", "logo.jpg", Buffer.from([0xff, 0xd8, 0xff]), "image/jpeg");
    await expect(logoGroup(page).getByRole("alert")).toHaveText(
      "The logo must be a PNG. Export it with a transparent background and try again.",
    );
    await expect(logoGroup(page)).toContainText("No logo added.");
  });

  test("a transparent logo on light and dark, primary by default; its colours suggested; saved and kept", async ({ page }) => {
    await openAssets(page);
    await addProduct(page);
    await choose(page, "Upload logo", "stride.png", await logoPng(page, false));

    const logo = page.getByRole("group", { name: "Primary logo: stride.png" });
    await expect(logo.getByText("On light", { exact: true })).toBeVisible();
    await expect(logo.getByText("On dark", { exact: true })).toBeVisible();
    await expect(logo.locator("img")).toHaveCount(2);
    await expect(logo.getByLabel("Logo type")).toHaveValue("Primary logo");
    await expect(logo.getByLabel("Use it")).toHaveValue("By default");
    await expect(logo.getByLabel("Description")).toHaveAttribute("placeholder", "Black wordmark, for light backgrounds");
    await expect(logo.getByText("Solid background.")).toHaveCount(0);
    await logo.getByLabel("Description").fill("Orange mark, navy bar");

    // Suggestions fill the next empty colour.
    await expect(colours(page)).toContainText("Suggested from your logo:");
    await colours(page).getByRole("button", { name: "Use #17324D" }).click();
    await colours(page).getByRole("button", { name: "Use #E4572E" }).click();
    await expect(colours(page).getByRole("textbox", { name: /^Primary/ })).toHaveValue("#17324D");
    await expect(colours(page).getByRole("textbox", { name: /^Secondary/ })).toHaveValue("#E4572E");
    await expect(colours(page).getByRole("button", { name: "Use #E4572E" })).toBeDisabled();

    await save(page).click();
    await expect(save(page)).toBeDisabled();
    const saved = await savedPage(page);
    expect(saved.record.colours).toEqual({ primary: "#17324D", secondary: "#E4572E", accent: "" });
    expect(saved.assets.find((a: { kind: string }) => a.kind === "logo")).toMatchObject({
      name: "stride.png",
      description: "Orange mark, navy bar",
      details: { logoType: "Primary logo", usage: "By default" },
    });

    await page.reload();
    await page.waitForFunction(() => !!(window as any).Konva?.stages?.length);
    await page.locator(".sidebar-item", { hasText: "Assets" }).click();
    await expect(page.getByRole("group", { name: "Primary logo: stride.png" }).getByLabel("Description")).toHaveValue("Orange mark, navy bar");
    await expect(colours(page).getByRole("textbox", { name: /^Primary/ })).toHaveValue("#17324D");
  });

  test("a solid logo is warned about, never blocked; an alternate logo; Replace keeps the details", async ({ page }) => {
    await openAssets(page);
    await addProduct(page);
    await choose(page, "Upload logo", "boxed.png", await logoPng(page, true));
    const boxed = page.getByRole("group", { name: "Primary logo: boxed.png" });
    await expect(boxed.getByRole("status")).toHaveText(
      "Solid background. This logo isn't transparent, so it may show as a box on coloured creatives.",
    );
    await boxed.getByLabel("Description").fill("Navy wordmark");

    await choose(page, "+ Alternate logo", "symbol.png", await logoPng(page, false, 40));
    await expect(page.getByRole("group", { name: "Secondary logo: symbol.png" })).toBeVisible();

    // Replace: a transparent file in its place, its description kept, the warning gone.
    const chooser = page.waitForEvent("filechooser");
    await boxed.getByRole("button", { name: "Replace" }).click();
    await (await chooser).setFiles({ name: "clear.png", mimeType: "image/png", buffer: await logoPng(page, false, 20) });
    const clear = page.getByRole("group", { name: "Primary logo: clear.png" });
    await expect(clear.getByLabel("Description")).toHaveValue("Navy wordmark");
    await expect(clear.getByText("Solid background.")).toHaveCount(0);

    await save(page).click();
    await expect(save(page)).toBeDisabled();
    const logos = (await savedPage(page)).assets.filter((a: { kind: string }) => a.kind === "logo");
    expect(logos.map((l: { name: string }) => l.name)).toEqual(["clear.png", "symbol.png"]);
  });

  test("the brief decides: Save asks for a logo when it is mandatory, not when it isn't", async ({ page }) => {
    await openAssets(page);
    await addProduct(page);
    await save(page).click();
    await expect(page.getByRole("alert").filter({ hasText: "Add a Primary Logo because Logo is marked as mandatory in the Campaign Brief." })).toBeVisible();
    await expect(page.locator(".assets-logo-empty.is-missing")).toBeVisible();
    await expect(save(page)).toBeEnabled();
    expect((await savedPage(page)).record.productName).toBe("");

    // Not mandatory in the brief: optional here, and Save goes ahead.
    await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
    await page.getByRole("button", { name: "Discard" }).click();
    await page.locator(".sidebar-identity").click();
    await page.getByRole("menuitem", { name: "Brand" }).click();
    await page.getByRole("switch", { name: "Logo" }).click();
    await page.getByRole("button", { name: "Save brand" }).click();
    await openAssets(page);
    await expect(logoGroup(page)).toContainText("Optional: the Campaign Brief does not require it.");
    await addProduct(page);
    await save(page).click();
    await expect(save(page)).toBeDisabled();
    expect((await savedPage(page)).record.productName).toBe("Trail running shoe");
  });

  test("colours: typed and tidied, picked, and a wrong one flagged and kept from saving", async ({ page }) => {
    await openAssets(page);
    await addProduct(page);
    // The brief needs a logo by default.
    await choose(page, "Upload logo", "stride.png", await logoPng(page, false));

    const primary = colours(page).getByRole("textbox", { name: /^Primary/ });
    await primary.fill("1a2b3c");
    await expect(colours(page).getByText("Use a hex value like #1A2B3C.")).toHaveCount(0);
    await primary.blur();
    await expect(primary).toHaveValue("#1A2B3C");

    await colours(page).getByLabel("Pick Accent colour").fill("#00aa55");
    await expect(colours(page).getByRole("textbox", { name: /^Accent/ })).toHaveValue("#00AA55");

    const secondary = colours(page).getByRole("textbox", { name: /^Secondary/ });
    await secondary.fill("navy");
    await secondary.blur();
    await expect(colours(page).getByText("Use a hex value like #1A2B3C.")).toBeVisible();
    await save(page).click();
    await expect(page.getByRole("alert").filter({ hasText: "Use hex values like #1A2B3C for the brand colours." })).toBeVisible();
    expect((await savedPage(page)).record.colours.primary).toBe("");

    await secondary.fill("");
    await save(page).click();
    await expect(save(page)).toBeDisabled();
    expect((await savedPage(page)).record.colours).toEqual({ primary: "#1A2B3C", secondary: "", accent: "#00AA55" });
  });

  test("works the same at 50%, 100% and 150% zoom", async ({ page }) => {
    for (const z of [0.5, 1.5, 1]) {
      await setZoom(page, z);
      await openAssets(page);
      await expect(logoGroup(page)).toBeVisible();
      await expect(colours(page)).toBeVisible();
      await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
    }
  });
});
