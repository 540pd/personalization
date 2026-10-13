import { test, expect, type Page } from "@playwright/test";
import { openBoard, makePng, imageBox } from "./helpers";

// The dock has to describe what the next canvas click will do. Two ways it
// used to lie: an armed tool survived a click on empty canvas, and Upload
// could never render active at all -- its class was a hardcoded false.

// Scoped to the dock and indexed the way helpers.addPanel already does:
// pointer, Generate, Links, then the right-side tools. Tooltips are
// display:none until hover, so their text is not a usable handle.
const pointerBtn = (page: Page) => page.locator(".floating-dock button").nth(0);
const linksBtn   = (page: Page) => page.locator(".floating-dock button").nth(2);
// Upload is the only right-side tool carrying aria-pressed; the disabled ones
// pass undefined, so the attribute is absent on them.
const uploadBtn  = (page: Page) =>
  page.locator(".floating-dock button[aria-pressed]").last();

// Not helpers.clickEmpty: that clicks (1400, 120), which is outside the
// 1280x720 the chromium project actually runs at -- devices["Desktop Chrome"]
// overrides the config's 1500x840 -- so it lands on nothing. Tracked
// separately; this spec needs a click that really reaches the stage.
const clickEmptyCanvas = async (page: Page) => {
  await page.mouse.click(900, 150);
  await page.waitForTimeout(250);
};

test.describe("toolbar tool state", () => {
  test("clicking empty canvas returns to the pointer tool", async ({ page }) => {
    await openBoard(page);
    const pointer = pointerBtn(page);
    await expect(pointer).toHaveAttribute("aria-pressed", "true");

    await linksBtn(page).click();
    await page.locator(".floating-dock-submenu button:has-text('Straight')").first().click();
    await page.waitForTimeout(300);
    await expect(pointer).toHaveAttribute("aria-pressed", "false");

    // A click on empty canvas drops the armed tool, the same way clicking a
    // node and Ctrl+A already did. This used to return early instead.
    await clickEmptyCanvas(page);
    await page.waitForTimeout(300);
    await expect(pointer).toHaveAttribute("aria-pressed", "true");
  });

  test("the Upload button is lit while a pick is in flight", async ({ page }) => {
    await openBoard(page);
    const upload = uploadBtn(page);
    await expect(upload).toHaveAttribute("aria-pressed", "false");

    // Clicking Upload opens a real file chooser; Playwright intercepts it,
    // which is the only way to observe the window between dialog and node.
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      upload.click(),
    ]);
    await expect(upload).toHaveAttribute("aria-pressed", "true");

    await chooser.setFiles({
      name: "harbour.png",
      mimeType: "image/png",
      buffer: makePng(800, 600),
    });

    // Lit until the node actually lands, not until the dialog closes: images
    // decode asynchronously, so the handler returning is not the end.
    await page.waitForFunction(
      () => (window as unknown as { Konva: { stages: { find(s: string): unknown[] }[] } })
        .Konva.stages[0].find("Image").length > 0,
      null,
      { timeout: 15_000 }
    );
    await expect(upload).toHaveAttribute("aria-pressed", "false");

    const box = await imageBox(page);
    expect(box.w).toBeGreaterThan(0);
  });

  test("a dismissed file dialog does not leave Upload lit", async ({ page }) => {
    await openBoard(page);
    const upload = uploadBtn(page);

    await Promise.all([page.waitForEvent("filechooser"), upload.click()]);
    await expect(upload).toHaveAttribute("aria-pressed", "true");

    // Playwright has no dismiss for a file chooser, so fire the event the
    // browser fires on cancel. With no listener the button stays lit forever,
    // which is the regression this guards.
    await page.evaluate(() => {
      document
        .querySelector<HTMLInputElement>('input[type="file"]')
        ?.dispatchEvent(new Event("cancel"));
    });
    await expect(upload).toHaveAttribute("aria-pressed", "false");
  });

  test("uploading does not arm a tool — the canvas stays in pointer", async ({ page }) => {
    await openBoard(page);
    const pointer = pointerBtn(page);

    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      uploadBtn(page).click(),
    ]);

    // media-upload must never become the active tool: draggability.ts and
    // hoverOutline.ts both read "not pointer" as "canvas is not interactive",
    // so arming it would freeze the board for the length of the upload.
    await expect(pointer).toHaveAttribute("aria-pressed", "true");

    await chooser.setFiles({
      name: "harbour.png",
      mimeType: "image/png",
      buffer: makePng(400, 300),
    });
    await page.waitForTimeout(800);
    await expect(pointer).toHaveAttribute("aria-pressed", "true");
  });
});
