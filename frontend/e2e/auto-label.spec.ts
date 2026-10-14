import { test, expect, type Page, type Route } from "@playwright/test";
import { openBoard, addPanel, collapsePanels, makePng, panelBoxes } from "./helpers";

// #130: an auto-derived node name follows the prompt it was generated from;
// a name the user chose never changes on its own. Generation is stubbed.

const IMG = (n: number) => `data:image/png;base64,${makePng(8 + n, 8 + n).toString("base64")}`;

async function stubGenerate(page: Page) {
  let n = 0;
  await page.route("**/api/proxy/**", async (route: Route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.continue();
    const body = (req.postDataJSON() ?? {}) as { variants?: number };
    const v = typeof body.variants === "number" ? body.variants : 1;
    n += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        v === 1
          ? { jobId: "j", status: "done", imageUrl: IMG(n), modelUsed: "m" }
          : { jobId: "j", status: "done", imageUrls: Array.from({ length: v }, (_, i) => IMG(n + i)), modelUsed: "m" }
      ),
    });
  });
}

const label = (page: Page, name: string) => page.locator(`div[title="${name}"]`);

async function create(page: Page, instruction: string, images = 1) {
  await page.locator("textarea").first().fill(instruction);
  await page.locator('select[aria-label="Images"]').selectOption(String(images));
  await page.locator("button:has-text('Create')").first().click();
  await page.waitForTimeout(1500);
}

/** One click selects a node, the second opens its form. */
async function openForm(page: Page, i = 0) {
  const b = (await panelBoxes(page))[i];
  for (let k = 0; k < 2; k++) {
    await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
    await page.waitForTimeout(300);
  }
}

async function rename(page: Page, from: string, to: string) {
  await label(page, from).first().dblclick();
  await page.waitForTimeout(300);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(to);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
}

test.describe("auto-named node label", () => {
  test.beforeEach(async ({ page }) => {
    await stubGenerate(page);
    await openBoard(page);
    await addPanel(page);
  });

  test("follows a new prompt on regenerate", async ({ page }) => {
    await create(page, "bright orange sunset");
    await expect(label(page, "bright orange sunset")).toHaveCount(1);

    await collapsePanels(page);
    await openForm(page);
    await create(page, "cloudy mood with rainfall");
    await expect(label(page, "cloudy mood with rainfall")).toHaveCount(1);
    await expect(label(page, "bright orange sunset")).toHaveCount(0);
  });

  test("keeps a name the user chose", async ({ page }) => {
    await create(page, "bright orange sunset");
    await collapsePanels(page);
    await rename(page, "bright orange sunset", "hero shot");

    await openForm(page);
    await create(page, "cloudy mood with rainfall");
    await expect(label(page, "hero shot")).toHaveCount(1);
  });

  test("opening the rename and leaving it unchanged does not freeze the name", async ({ page }) => {
    await create(page, "bright orange sunset");
    await collapsePanels(page);
    await label(page, "bright orange sunset").first().dblclick();
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);

    await openForm(page);
    await create(page, "cloudy mood with rainfall");
    await expect(label(page, "cloudy mood with rainfall")).toHaveCount(1);
  });

  test("the same prompt again keeps the name, suffix and all", async ({ page }) => {
    await create(page, "bright orange sunset", 3);
    await collapsePanels(page);
    await expect(label(page, "bright orange sunset (3)")).toHaveCount(1);

    // Variant (3) is the last panel; regenerate it with the same prompt.
    const count = (await panelBoxes(page)).length;
    await openForm(page, count - 1);
    await create(page, "bright orange sunset");
    await expect(label(page, "bright orange sunset (3)")).toHaveCount(1);
    await expect(label(page, "bright orange sunset (4)")).toHaveCount(0);
  });

  test("a re-prompted variant is renamed, and a clash is suffixed", async ({ page }) => {
    await create(page, "bright orange sunset", 3);
    await collapsePanels(page);
    const count = (await panelBoxes(page)).length;

    // Re-prompt (3) with the source's prompt's twin: "cloudy" is free.
    await openForm(page, count - 1);
    await create(page, "cloudy mood with rainfall");
    await expect(label(page, "cloudy mood with rainfall")).toHaveCount(1);
    await collapsePanels(page);

    // Re-prompt (2) with the same new prompt: the name is taken, so (2).
    await openForm(page, count - 2);
    await create(page, "cloudy mood with rainfall");
    await expect(label(page, "cloudy mood with rainfall (2)")).toHaveCount(1);
  });

  test("undo takes the new name back with the new image, and redo returns both", async ({ page }) => {
    const src = () =>
      page.evaluate(() => {
        const img = document.querySelector("img.node-panel-preview") as HTMLImageElement | null;
        return img?.src ?? null;
      });
    await create(page, "bright orange sunset");
    await collapsePanels(page);
    const first = await src();

    await openForm(page);
    await create(page, "cloudy mood with rainfall");
    await collapsePanels(page);
    const second = await src();
    expect(second).not.toBe(first);

    await page.keyboard.press("Control+z");
    await page.waitForTimeout(400);
    await expect(label(page, "bright orange sunset")).toHaveCount(1);
    expect(await src()).toBe(first);

    await page.keyboard.press("Control+y");
    await page.waitForTimeout(400);
    await expect(label(page, "cloudy mood with rainfall")).toHaveCount(1);
    expect(await src()).toBe(second);
  });
});
