import { test, expect, type Page, type Route } from "@playwright/test";
import { openBoard, uploadImage, imageBox, setZoom, addPanel, panelBoxes, makePng } from "./helpers";

// "Always show node names" (#215). On is today's behaviour; off shows a name
// only on a hovered or selected node, frames included.

const NAMES_OFF = { version: 1, settings: { linkStyle: "link-curve", showNodeNames: false } };

/** The name above a node: the fixed div holding exactly `text`. */
const name = (page: Page, text: string) =>
  page.locator("div").filter({ hasText: new RegExp(`^${text}$`) }).and(page.locator("div:not(:has(*))")).first();

async function boardWith(page: Page, settings: object | null) {
  await openBoard(page);
  await page.evaluate((s) => {
    if (s) localStorage.setItem("gcos-settings", JSON.stringify(s));
    else localStorage.removeItem("gcos-settings");
  }, settings);
  await openBoard(page);
}

/** A click on bare board, clear of the image and frame these tests place. */
async function deselect(page: Page) {
  await page.mouse.click(300, 700);
  await page.waitForTimeout(250);
}

const frameBtn = (page: Page) => page.getByRole("button", { name: "Frame", exact: true });

async function drawFrame(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await frameBtn(page).click();
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
  await page.mouse.move(x2, y2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

test.describe("Always show node names", () => {
  test("on by default: a name shows without selecting", async ({ page }) => {
    await boardWith(page, null);
    await uploadImage(page, 400, 300, "harbour.png");
    await deselect(page);
    await expect(name(page, "harbour")).toBeVisible();
  });

  test("the switch in Settings turns names off at once and is kept", async ({ page }) => {
    await boardWith(page, null);
    await uploadImage(page, 400, 300, "harbour.png");
    await deselect(page);

    await page.locator(".sidebar-identity").click();
    await page.getByRole("menuitem", { name: /Settings/ }).click();
    const toggle = page.getByRole("switch", { name: "Always show node names" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.press("Space");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
    await page.mouse.move(1400, 800);
    await expect(name(page, "harbour")).toBeHidden();

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("gcos-settings")!).settings);
    expect(stored.showNodeNames).toBe(false);
  });

  test("off: a name shows on hover and on selection only", async ({ page }) => {
    await boardWith(page, NAMES_OFF);
    await uploadImage(page, 400, 300, "harbour.png");
    await deselect(page);
    const box = await imageBox(page);
    await page.mouse.move(box.x + box.w + 200, box.y + box.h + 100);
    await expect(name(page, "harbour")).toBeHidden();

    await page.mouse.move(box.x + 40, box.y + 40);
    await expect(name(page, "harbour")).toBeVisible();
    // Up onto the name itself: it stays.
    await page.mouse.move(box.x + 10, box.y - 12, { steps: 5 });
    await expect(name(page, "harbour")).toBeVisible();
    await page.mouse.move(box.x + box.w + 200, box.y + box.h + 100);
    await expect(name(page, "harbour")).toBeHidden();

    await page.mouse.click(box.x + 40, box.y + 40);
    await page.mouse.move(box.x + box.w + 200, box.y + box.h + 100);
    await expect(name(page, "harbour")).toBeVisible();
    await deselect(page);
    await page.mouse.move(box.x + box.w + 200, box.y + box.h + 100);
    await expect(name(page, "harbour")).toBeHidden();
  });

  test("off: renaming keeps the field open after the pointer leaves", async ({ page }) => {
    await boardWith(page, NAMES_OFF);
    await uploadImage(page, 400, 300, "harbour.png");
    const box = await imageBox(page);
    await page.mouse.click(box.x + 40, box.y + 40);
    await name(page, "harbour").dblclick();
    await page.mouse.move(box.x + box.w + 300, box.y + box.h + 150);
    const field = page.locator("input[size='1']");
    await expect(field).toBeVisible();
    await field.fill("pier");
    await field.press("Enter");
    await expect(name(page, "pier")).toBeVisible();
  });

  test("off: a Create Image node's name shows on hover and selection", async ({ page }) => {
    const img = `data:image/png;base64,${makePng(8, 8).toString("base64")}`;
    await page.route("**/api/proxy/**", async (route: Route) => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ jobId: "j", status: "done", imageUrl: img, modelUsed: "m" }),
      });
    });
    await boardWith(page, NAMES_OFF);
    await addPanel(page);
    await page.locator("textarea").first().fill("bright orange sunset");
    await page.locator("button:has-text('Create')").first().click();
    await page.waitForTimeout(1500);
    // Still selected after Create: the name shows.
    await expect(name(page, "bright orange sunset")).toBeVisible();

    await page.keyboard.press("Escape");
    await deselect(page);
    await page.mouse.move(1300, 780);
    await expect(name(page, "bright orange sunset")).toBeHidden();
    const [p] = await panelBoxes(page);
    await page.mouse.move(p.x + p.w / 2, p.y + p.h / 2);
    await expect(name(page, "bright orange sunset")).toBeVisible();
  });

  test("off: frame names follow the same rule", async ({ page }) => {
    await boardWith(page, NAMES_OFF);
    await drawFrame(page, 500, 250, 900, 600);
    await deselect(page);
    await page.mouse.move(1300, 780);
    await expect(name(page, "Frame")).toBeHidden();
    await page.mouse.move(700, 450);
    await expect(name(page, "Frame")).toBeVisible();
    await page.mouse.move(1300, 780);
    await expect(name(page, "Frame")).toBeHidden();
  });

  test("off: names hide and show the same at 50% and 150%", async ({ page }) => {
    await boardWith(page, NAMES_OFF);
    await uploadImage(page, 400, 300, "harbour.png");
    await deselect(page);
    for (const z of [0.5, 1.5]) {
      await setZoom(page, z);
      const box = await imageBox(page);
      await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
      await expect(name(page, "harbour")).toBeVisible();
      await page.mouse.move(box.x + box.w + 120, box.y + box.h + 60);
      await expect(name(page, "harbour")).toBeHidden();
    }
  });
});
